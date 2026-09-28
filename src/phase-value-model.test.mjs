import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fitPhaseRoutedValueModel,
  scorePhaseRoutedDifference,
} from './phase-value-model.mjs'

function rows(prefix, scale = 1) {
  return [
    { gameId: `${prefix}-a`, split: prefix, turn: 2, phase: 5, difference: [2 * scale], target: 1, terminalMargin: 10, weight: 1 },
    { gameId: `${prefix}-b`, split: prefix, turn: 2, phase: 5, difference: [-2 * scale], target: -1, terminalMargin: -10, weight: 1 },
    { gameId: `${prefix}-a`, split: prefix, turn: 5, phase: 5, difference: [1 * scale], target: 1, terminalMargin: 10, weight: 1 },
    { gameId: `${prefix}-b`, split: prefix, turn: 5, phase: 5, difference: [-1 * scale], target: -1, terminalMargin: -10, weight: 1 },
    { gameId: `${prefix}-a`, split: prefix, turn: 8, phase: 5, difference: [3 * scale], target: 1, terminalMargin: 10, weight: 1 },
    { gameId: `${prefix}-b`, split: prefix, turn: 8, phase: 5, difference: [-3 * scale], target: -1, terminalMargin: -10, weight: 1 },
  ]
}

test('phase-routed model selects on disjoint calibration and refits all three phases', () => {
  const result = fitPhaseRoutedValueModel(rows('development'), rows('calibration', 1.2), {
    featureNames: ['signal'], lambdas: [0.01, 0.1, 1], iterations: 400,
  })
  assert.equal(result.schemaVersion, 'fcm.phase-value-selection.v1')
  assert.deepEqual(Object.keys(result.selectedLambdas), ['early', 'middle', 'late'])
  assert.equal(result.calibrationAudit.gameAccuracy, 1)
  assert.equal(result.frozenModel.schemaVersion, 'fcm.phase-routed-value-model.v1')
  for (const phase of ['early', 'middle', 'late']) {
    assert.equal(result.phaseStatus[phase].calibrated, true)
    assert.equal(result.selection[phase].developmentGames, 2)
    assert.equal(result.frozenModel.phaseModels[phase].trainingGames, 4)
  }
  assert.ok(scorePhaseRoutedDifference(result.frozenModel, { turn: 2, difference: [2] }) > 0)
  assert.ok(scorePhaseRoutedDifference(result.frozenModel, { turn: 5, difference: [-2] }) < 0)
  assert.ok(scorePhaseRoutedDifference(result.frozenModel, { turn: 8, difference: [2] }) > 0)
})

test('an uncalibrated phase abstains instead of exporting a misleading score', () => {
  const result = fitPhaseRoutedValueModel(rows('development'), rows('calibration'), {
    featureNames: ['signal'], lambdas: [0.1], iterations: 200,
  })
  const guarded = structuredClone(result.frozenModel)
  guarded.phaseStatus.early = {
    calibrated: false,
    reason: 'calibration accuracy below gate',
  }
  assert.equal(scorePhaseRoutedDifference(guarded, { turn: 2, difference: [100] }), 0)
  assert.notEqual(scorePhaseRoutedDifference(guarded, { turn: 5, difference: [100] }), 0)
})

test('phase-routed selection is deterministic and rejects split leakage', () => {
  const options = { featureNames: ['signal'], lambdas: [0.1, 1], iterations: 200 }
  assert.deepEqual(
    fitPhaseRoutedValueModel(rows('development'), rows('calibration'), options),
    fitPhaseRoutedValueModel(rows('development'), rows('calibration'), options),
  )
  const leaking = rows('calibration')
  leaking[0].gameId = 'development-a'
  assert.throws(
    () => fitPhaseRoutedValueModel(rows('development'), leaking, options),
    /split leakage/,
  )
})
