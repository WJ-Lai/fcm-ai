import assert from 'node:assert/strict'
import test from 'node:test'

import { auditValueCutoffs } from './value-cutoff-audit.mjs'

function phaseModel(calibrated = true) {
  return {
    schemaVersion: 'fcm.pairwise-value-model.v1',
    featureNames: ['signal'],
    scales: [1],
    standardizedWeights: [1],
  }
}

function model() {
  return {
    schemaVersion: 'fcm.phase-routed-value-model.v1',
    featureNames: ['signal'],
    phaseModels: {
      early: phaseModel(), middle: phaseModel(), late: phaseModel(),
    },
    phaseStatus: {
      early: { calibrated: false },
      middle: { calibrated: true },
      late: { calibrated: true },
    },
  }
}

const rows = [
  { gameId: 'a', turn: 1, difference: [3], target: 1, weight: 1 / 3 },
  { gameId: 'a', turn: 4, difference: [-2], target: 1, weight: 1 / 3 },
  { gameId: 'a', turn: 8, difference: [4], target: 1, weight: 1 / 3 },
  { gameId: 'b', turn: 1, difference: [-3], target: -1, weight: 1 / 3 },
  { gameId: 'b', turn: 4, difference: [-2], target: -1, weight: 1 / 3 },
  { gameId: 'b', turn: 8, difference: [-4], target: -1, weight: 1 / 3 },
]

test('cutoff audit is equal-game weighted and exposes phase abstention by realized horizon', () => {
  const audit = auditValueCutoffs(model(), rows)
  assert.equal(audit.schemaVersion, 'fcm.value-cutoff-audit.v1')
  assert.equal(audit.games, 2)
  assert.equal(audit.byPhase.early.abstentionRate, 1)
  assert.equal(audit.byRemainingTurns.far.abstentionRate, 1)
  assert.equal(audit.byRemainingTurns.medium.weightedAccuracy, 0.5)
  assert.equal(audit.byRemainingTurns.boundary.weightedAccuracy, 1)
  assert.ok(Number.isFinite(audit.byRemainingTurns.boundary.weightedLogLoss))
})

test('cutoff audit classifies non-abstaining sign reversals against the terminal outcome', () => {
  const audit = auditValueCutoffs(model(), rows)
  assert.deepEqual(audit.reversals, {
    total: 1,
    towardOutcome: 1,
    awayFromOutcome: 0,
    other: 0,
  })
})
