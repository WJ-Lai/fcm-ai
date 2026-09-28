#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildActionPreferenceRows, validateActionRegretDataset } from '../src/action-regret-dataset.mjs'
import { auditActionRegretRanking } from '../src/action-regret-ranking.mjs'
import {
  auditPairwiseValueModel,
  fitPairwiseValueModel,
  scorePairwiseDifference,
} from '../src/pairwise-value-model.mjs'
import { scorePhaseRoutedDifference } from '../src/phase-value-model.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const developmentPath = path.resolve(argument('--development', 'fixtures/action-regret-v1/development.json'))
const calibrationPath = path.resolve(argument('--calibration', 'fixtures/action-regret-v1/calibration.json'))
const stateModelPath = path.resolve(argument(
  '--state-model',
  'fixtures/value-calibration-v2/phase-selection.json',
))
const outputPath = path.resolve(argument('--output', 'fixtures/action-regret-v1/iteration-1.json'))
const developmentText = await readFile(developmentPath, 'utf8')
const calibrationText = await readFile(calibrationPath, 'utf8')
const stateModelText = await readFile(stateModelPath, 'utf8')
const development = JSON.parse(developmentText)
const calibration = JSON.parse(calibrationText)
const stateSelection = JSON.parse(stateModelText)

validateActionRegretDataset(development)
validateActionRegretDataset(calibration)
assert.equal(development.split, 'development')
assert.equal(calibration.split, 'calibration')
assert.equal(development.rulesetHash, calibration.rulesetHash, 'dataset ruleset drift')
assert.equal(development.rulesetHash, stateSelection.rulesetHash, 'state model ruleset drift')
assert.deepEqual(development.featureNames, calibration.featureNames, 'dataset feature drift')
assert.deepEqual(development.featureNames, stateSelection.frozenModel.featureNames,
  'state/action model feature drift')
assert.equal(development.promotionHoldoutOpened, false)
assert.equal(calibration.promotionHoldoutOpened, false)

const developmentRows = buildActionPreferenceRows(development)
const calibrationRows = buildActionPreferenceRows(calibration)
const lambdas = [0.01, 0.1, 1, 10, 100]
const candidates = lambdas.map((lambda) => {
  const model = fitPairwiseValueModel(developmentRows, {
    featureNames: development.featureNames,
    lambda,
    iterations: 1200,
    learningRate: 0.2,
  })
  return {
    lambda,
    model,
    developmentPairwise: auditPairwiseValueModel(model, developmentRows),
    calibrationPairwise: auditPairwiseValueModel(model, calibrationRows),
    calibrationRanking: auditActionRegretRanking(
      calibration,
      (candidate) => scorePairwiseDifference(model, candidate.postActionPairFeatures),
    ),
  }
}).sort((left, right) => (
  right.calibrationRanking.top1Accuracy - left.calibrationRanking.top1Accuracy ||
  left.calibrationRanking.meanTerminalRegret - right.calibrationRanking.meanTerminalRegret ||
  left.calibrationPairwise.weightedLogLoss - right.calibrationPairwise.weightedLogLoss ||
  right.lambda - left.lambda
))
const selected = candidates[0]
const staticBaseline = auditActionRegretRanking(calibration, (candidate) => -candidate.staticRank)
const stateValueBaseline = auditActionRegretRanking(calibration, (candidate, root) => (
  scorePhaseRoutedDifference(stateSelection.frozenModel, {
    turn: root.turn,
    difference: candidate.postActionPairFeatures,
  })
))
const report = {
  schemaVersion: 'fcm.action-regret-experiment.v1',
  experimentId: 1,
  hypothesis: 'post-action semantic pair features improve disjoint root Top-1 accuracy',
  primaryMetric: 'calibrationRootTop1Accuracy',
  rulesetHash: development.rulesetHash,
  featureVersion: development.featureVersion,
  continuationPolicy: development.continuationPolicy,
  development: {
    path: path.relative(repositoryRoot, developmentPath),
    digest: digest(developmentText),
    roots: development.roots.length,
    comparisons: developmentRows.length,
  },
  calibration: {
    path: path.relative(repositoryRoot, calibrationPath),
    digest: digest(calibrationText),
    roots: calibration.roots.length,
    comparisons: calibrationRows.length,
  },
  baselines: {
    static: staticBaseline,
    stateValueV2: stateValueBaseline,
  },
  candidates: candidates.map((candidate) => ({
    lambda: candidate.lambda,
    developmentPairwise: candidate.developmentPairwise,
    calibrationPairwise: candidate.calibrationPairwise,
    calibrationRanking: candidate.calibrationRanking,
  })),
  selectedLambda: selected.lambda,
  selectedModel: selected.model,
  selectedCalibrationRanking: selected.calibrationRanking,
  promotionHoldoutOpened: false,
  promotionStatus: 'not-evaluated',
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  output: path.relative(repositoryRoot, outputPath),
  development: report.development,
  calibration: report.calibration,
  baselines: {
    static: staticBaseline,
    stateValueV2: stateValueBaseline,
  },
  candidateMetrics: report.candidates.map((candidate) => ({
    lambda: candidate.lambda,
    top1Accuracy: candidate.calibrationRanking.top1Accuracy,
    meanTerminalRegret: candidate.calibrationRanking.meanTerminalRegret,
    pairwiseAccuracy: candidate.calibrationPairwise.weightedAccuracy,
    pairwiseLogLoss: candidate.calibrationPairwise.weightedLogLoss,
  })),
  selectedLambda: report.selectedLambda,
  selectedCalibrationRanking: report.selectedCalibrationRanking,
  promotionHoldoutOpened: false,
}, null, 2)}\n`)
