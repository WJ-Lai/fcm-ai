import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TERMINAL_VALUE_FEATURE_NAMES,
  TERMINAL_VALUE_FEATURE_VERSION,
} from './terminal-value-v2.mjs'
import { scoreTerminalLeafFeaturePair } from './terminal-leaf-value.mjs'

function features(cash) {
  return Object.freeze(Object.fromEntries([
    ['version', TERMINAL_VALUE_FEATURE_VERSION],
    ...TERMINAL_VALUE_FEATURE_NAMES.map((name) => [name, name === 'cash' ? cash : 0]),
  ]))
}

function pairwiseModel() {
  const cashIndex = TERMINAL_VALUE_FEATURE_NAMES.indexOf('cash')
  return {
    schemaVersion: 'fcm.pairwise-value-model.v1',
    featureNames: [...TERMINAL_VALUE_FEATURE_NAMES],
    scales: TERMINAL_VALUE_FEATURE_NAMES.map(() => 1),
    standardizedWeights: TERMINAL_VALUE_FEATURE_NAMES.map((_, index) => (
      index === cashIndex ? 1 : 0
    )),
  }
}

function model() {
  return {
    schemaVersion: 'fcm.phase-routed-value-model.v1',
    featureNames: [...TERMINAL_VALUE_FEATURE_NAMES],
    phaseModels: {
      early: pairwiseModel(), middle: pairwiseModel(), late: pairwiseModel(),
    },
    phaseStatus: {
      early: { calibrated: false },
      middle: { calibrated: true },
      late: { calibrated: true },
    },
  }
}

test('terminal leaf pair is seat-oriented and reports its experimental evaluator contract', () => {
  const result = scoreTerminalLeafFeaturePair(model(), {
    turn: 5,
    seatFeatures: features(20),
    opponentFeatures: features(8),
  })
  assert.equal(result.score, 12)
  assert.equal(result.abstained, false)
  assert.equal(result.phase, 'middle')
  assert.equal(result.evaluatorVersion, 'fcm.phase-routed-value-model.v1')

  const reversed = scoreTerminalLeafFeaturePair(model(), {
    turn: 5,
    seatFeatures: features(8),
    opponentFeatures: features(20),
  })
  assert.equal(reversed.score, -12)
})

test('terminal leaf pair preserves a neutral tie when the calibrated phase abstains', () => {
  const result = scoreTerminalLeafFeaturePair(model(), {
    turn: 2,
    seatFeatures: features(100),
    opponentFeatures: features(0),
  })
  assert.equal(result.score, 0)
  assert.equal(result.abstained, true)
  assert.equal(result.phase, 'early')
})

test('terminal leaf pair rejects model/feature contract drift', () => {
  const drift = model()
  drift.featureNames = ['cash']
  assert.throws(() => scoreTerminalLeafFeaturePair(drift, {
    turn: 5,
    seatFeatures: features(2),
    opponentFeatures: features(1),
  }), /feature contract/)
})
