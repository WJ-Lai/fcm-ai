import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditPairwiseValueModel,
  crossValidatePairwiseValueModel,
  fitPairwiseValueModel,
  scorePairwiseDifference,
} from './pairwise-value-model.mjs'

function row(gameId, value, target, weight = 1, turn = 2) {
  return {
    gameId, split: 'development', turn, phase: 5,
    difference: [value, 0], target, terminalMargin: target * 10, weight,
  }
}

test('pairwise model deterministically learns a useful direction and ignores zero variance', () => {
  const rows = [
    row('a', 2, 1), row('b', 1, 1), row('c', -1, -1), row('d', -2, -1),
  ]
  const options = { featureNames: ['signal', 'constant'], lambda: 0.1, iterations: 600 }
  const first = fitPairwiseValueModel(rows, options)
  const second = fitPairwiseValueModel(rows, options)
  assert.deepEqual(first, second)
  assert.ok(first.standardizedWeights[0] > 0)
  assert.equal(first.standardizedWeights[1], 0)
  assert.ok(scorePairwiseDifference(first, [2, 100]) > 0)
  assert.ok(scorePairwiseDifference(first, [-2, -100]) < 0)
})

test('per-game weights prevent duplicated turns from overpowering another game', () => {
  const rows = [
    ...Array.from({ length: 20 }, () => row('long', 1, 1, 1 / 20)),
    row('short', 1, -1, 1),
  ]
  const model = fitPairwiseValueModel(rows, {
    featureNames: ['signal', 'constant'], lambda: 0.1, iterations: 600,
  })
  assert.ok(Math.abs(model.standardizedWeights[0]) < 1e-12)
})

test('audit separates correlated turn accuracy from game-macro and phase diagnostics', () => {
  const model = fitPairwiseValueModel([
    row('train-a', 2, 1), row('train-b', -2, -1),
  ], { featureNames: ['signal', 'constant'], lambda: 0.1, iterations: 600 })
  const report = auditPairwiseValueModel(model, [
    row('game-a', 2, 1, 0.5, 2),
    row('game-a', -1, 1, 0.5, 5),
    row('game-b', -2, -1, 1, 8),
  ])
  assert.equal(report.schemaVersion, 'fcm.pairwise-value-audit.v1')
  assert.equal(report.turns, 3)
  assert.equal(report.games, 2)
  assert.equal(report.correctTurns, 2)
  assert.equal(report.gameCorrect, 2)
  assert.equal(report.byPhase.early.turns, 1)
  assert.equal(report.byPhase.middle.turns, 1)
  assert.equal(report.byPhase.late.turns, 1)
})

test('model fails closed on malformed targets, dimensions, and non-positive weights', () => {
  const valid = [row('a', 1, 1)]
  assert.throws(() => fitPairwiseValueModel([{ ...valid[0], target: 0 }], {
    featureNames: ['x', 'y'],
  }), /target/)
  assert.throws(() => fitPairwiseValueModel([{ ...valid[0], weight: 0 }], {
    featureNames: ['x', 'y'],
  }), /weight/)
  const model = fitPairwiseValueModel(valid, { featureNames: ['x', 'y'], iterations: 10 })
  assert.throws(() => scorePairwiseDifference(model, [1]), /dimension/)
})

test('leave-one-game-out cross-validation never scores a game with its fitted model', () => {
  const rows = [
    row('a', 3, 1), row('b', 2, 1), row('c', -2, -1), row('d', -3, -1),
  ]
  const report = crossValidatePairwiseValueModel(rows, {
    featureNames: ['signal', 'constant'], lambda: 0.1, iterations: 400,
  })
  assert.equal(report.schemaVersion, 'fcm.pairwise-value-cross-validation.v1')
  assert.equal(report.games, 4)
  assert.deepEqual(report.folds.map((fold) => fold.holdoutGame).sort(), ['a', 'b', 'c', 'd'])
  assert.ok(report.folds.every((fold) => fold.trainingGames === 3))
  assert.equal(report.gameAccuracy, 1)
  assert.equal(report.weightedAccuracy, 1)
  assert.equal(report.byPhase.early.turns, 4)
  assert.equal(report.byPhase.early.weightedAccuracy, 1)
  assert.equal(report.byPhase.middle, null)
})

test('large regularization remains finite and shrinks rather than destabilizes weights', () => {
  const rows = [row('a', 2, 1), row('b', -2, -1)]
  const loose = fitPairwiseValueModel(rows, {
    featureNames: ['signal', 'constant'], lambda: 0.1, iterations: 600,
  })
  const tight = fitPairwiseValueModel(rows, {
    featureNames: ['signal', 'constant'], lambda: 100, iterations: 600,
  })
  assert.ok(tight.standardizedWeights.every(Number.isFinite))
  assert.ok(Math.abs(tight.standardizedWeights[0]) < Math.abs(loose.standardizedWeights[0]))
  assert.ok(Number.isFinite(tight.objective))
})
