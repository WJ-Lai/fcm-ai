import assert from 'node:assert/strict'

import {
  auditPairwiseValueModel,
  fitPairwiseValueModel,
  scorePairwiseDifference,
} from './pairwise-value-model.mjs'

const PHASES = Object.freeze(['early', 'middle', 'late'])
const DEFAULT_CALIBRATION_GATE = Object.freeze({
  minimumWeightedAccuracy: 0.55,
  maximumWeightedLogLoss: 0.69,
})

function phaseBucket(turn) {
  assert.ok(Number.isInteger(turn) && turn > 0, 'turn must be positive')
  if (turn <= 3) return 'early'
  if (turn <= 6) return 'middle'
  return 'late'
}

function logisticLoss(margin) {
  if (margin >= 0) return Math.log1p(Math.exp(-margin))
  return -margin + Math.log1p(Math.exp(margin))
}

function credit(score, target) {
  const direction = Math.sign(score)
  return direction === 0 ? 0.5 : direction === target ? 1 : 0
}

export function scorePhaseRoutedDifference(model, { turn, difference }) {
  assert.equal(model?.schemaVersion, 'fcm.phase-routed-value-model.v1', 'model schema mismatch')
  const phase = phaseBucket(turn)
  if (model.phaseStatus?.[phase]?.calibrated === false) return 0
  return scorePairwiseDifference(model.phaseModels[phase], difference)
}

function auditRouted(model, rows) {
  const scored = rows.map((row) => ({
    ...row,
    score: scorePhaseRoutedDifference(model, row),
  }))
  const totalWeight = scored.reduce((sum, row) => sum + row.weight, 0)
  const gameIds = [...new Set(scored.map((row) => row.gameId))]
  let gameCorrect = 0
  for (const gameId of gameIds) {
    const selected = scored.filter((row) => row.gameId === gameId)
    const targets = new Set(selected.map((row) => row.target))
    assert.equal(targets.size, 1, `game ${gameId} has inconsistent targets`)
    const gameWeight = selected.reduce((sum, row) => sum + row.weight, 0)
    const meanScore = selected.reduce((sum, row) => sum + row.weight * row.score, 0) / gameWeight
    gameCorrect += credit(meanScore, selected[0].target)
  }
  return {
    schemaVersion: 'fcm.phase-routed-value-audit.v1',
    turns: scored.length,
    games: gameIds.length,
    gameCorrect,
    gameAccuracy: gameCorrect / gameIds.length,
    weightedAccuracy: scored.reduce(
      (sum, row) => sum + row.weight * credit(row.score, row.target),
      0,
    ) / totalWeight,
    weightedLogLoss: scored.reduce(
      (sum, row) => sum + row.weight * logisticLoss(row.target * row.score),
      0,
    ) / totalWeight,
    byPhase: Object.fromEntries(PHASES.map((phase) => {
      const selected = scored.filter((row) => phaseBucket(row.turn) === phase)
      const weight = selected.reduce((sum, row) => sum + row.weight, 0)
      return [phase, {
        turns: selected.length,
        weightedAccuracy: selected.reduce(
          (sum, row) => sum + row.weight * credit(row.score, row.target),
          0,
        ) / weight,
        weightedLogLoss: selected.reduce(
          (sum, row) => sum + row.weight * logisticLoss(row.target * row.score),
          0,
        ) / weight,
      }]
    })),
  }
}

export function fitPhaseRoutedValueModel(developmentRows, calibrationRows, {
  featureNames,
  lambdas = [0.01, 0.1, 1, 10],
  iterations = 1200,
  learningRate = 0.2,
  calibrationGate = DEFAULT_CALIBRATION_GATE,
} = {}) {
  assert.ok(Array.isArray(lambdas) && lambdas.length > 0, 'candidate lambdas are required')
  assert.ok(
    Number.isFinite(calibrationGate?.minimumWeightedAccuracy) &&
      calibrationGate.minimumWeightedAccuracy >= 0 &&
      calibrationGate.minimumWeightedAccuracy <= 1,
    'minimum calibration accuracy must be within [0, 1]',
  )
  assert.ok(
    Number.isFinite(calibrationGate?.maximumWeightedLogLoss) &&
      calibrationGate.maximumWeightedLogLoss > 0,
    'maximum calibration log loss must be positive',
  )
  const developmentGames = new Set(developmentRows.map((row) => row.gameId))
  const calibrationGames = new Set(calibrationRows.map((row) => row.gameId))
  for (const gameId of developmentGames) {
    assert.ok(!calibrationGames.has(gameId), `development/calibration split leakage: ${gameId}`)
  }

  const selection = {}
  const selectedLambdas = {}
  const calibrationPhaseModels = {}
  const frozenPhaseModels = {}
  const phaseStatus = {}
  for (const phase of PHASES) {
    const development = developmentRows.filter((row) => phaseBucket(row.turn) === phase)
    const calibration = calibrationRows.filter((row) => phaseBucket(row.turn) === phase)
    assert.ok(development.length && calibration.length, `${phase} rows are required in both splits`)
    const candidates = lambdas.map((lambda) => {
      const model = fitPairwiseValueModel(development, {
        featureNames, lambda, iterations, learningRate,
      })
      return { lambda, model, audit: auditPairwiseValueModel(model, calibration) }
    }).sort((left, right) => (
      left.audit.weightedLogLoss - right.audit.weightedLogLoss ||
      right.audit.gameAccuracy - left.audit.gameAccuracy ||
      right.audit.weightedAccuracy - left.audit.weightedAccuracy ||
      right.lambda - left.lambda
    ))
    const selected = candidates[0]
    const calibrated = (
      selected.audit.weightedAccuracy >= calibrationGate.minimumWeightedAccuracy &&
      selected.audit.weightedLogLoss < calibrationGate.maximumWeightedLogLoss
    )
    selectedLambdas[phase] = selected.lambda
    phaseStatus[phase] = {
      calibrated,
      calibrationWeightedAccuracy: selected.audit.weightedAccuracy,
      calibrationWeightedLogLoss: selected.audit.weightedLogLoss,
      minimumWeightedAccuracy: calibrationGate.minimumWeightedAccuracy,
      maximumWeightedLogLoss: calibrationGate.maximumWeightedLogLoss,
      reason: calibrated
        ? 'independent calibration gate passed'
        : 'independent calibration gate failed; scorer must abstain',
    }
    calibrationPhaseModels[phase] = selected.model
    frozenPhaseModels[phase] = fitPairwiseValueModel([...development, ...calibration], {
      featureNames,
      lambda: selected.lambda,
      iterations,
      learningRate,
    })
    selection[phase] = {
      selectedLambda: selected.lambda,
      developmentGames: selected.model.trainingGames,
      calibrationGames: new Set(calibration.map((row) => row.gameId)).size,
      candidates: candidates.map((candidate) => ({
        lambda: candidate.lambda,
        gameAccuracy: candidate.audit.gameAccuracy,
        weightedAccuracy: candidate.audit.weightedAccuracy,
        weightedLogLoss: candidate.audit.weightedLogLoss,
      })),
    }
  }

  const calibrationModel = {
    schemaVersion: 'fcm.phase-routed-value-model.v1',
    featureNames: [...featureNames],
    selectedLambdas,
    phaseModels: calibrationPhaseModels,
    phaseStatus: Object.fromEntries(PHASES.map((phase) => [phase, { calibrated: true }])),
  }
  const frozenModel = {
    schemaVersion: 'fcm.phase-routed-value-model.v1',
    featureNames: [...featureNames],
    selectedLambdas,
    phaseModels: frozenPhaseModels,
    phaseStatus,
  }
  return {
    schemaVersion: 'fcm.phase-value-selection.v1',
    selectedLambdas,
    selection,
    phaseStatus,
    calibrationAudit: auditRouted(calibrationModel, calibrationRows),
    gatedCalibrationAudit: auditRouted({ ...calibrationModel, phaseStatus }, calibrationRows),
    frozenModel,
    promotionStatus: 'not-evaluated',
  }
}
