import assert from 'node:assert/strict'
import test from 'node:test'

import { auditActionFeatureCollisions } from './action-regret-collisions.mjs'

test('collision audit measures contradictory labels for an identical action delta', () => {
  const rows = [
    { rootId: 'a', difference: [3, 0], target: 1, weight: 0.5 },
    { rootId: 'b', difference: [3, 0], target: -1, weight: 1 },
    { rootId: 'c', difference: [0, 1], target: 1, weight: 0.5 },
  ]
  assert.deepEqual(auditActionFeatureCollisions(rows), {
    rows: 3,
    totalWeight: 2,
    uniqueDeltas: 2,
    conflictingDeltas: 1,
    conflictingRows: 2,
    irreducibleWeight: 0.5,
    contextFreeAccuracyCeiling: 0.75,
    conflicts: [{
      difference: [3, 0],
      positiveWeight: 0.5,
      negativeWeight: 1,
      rootIds: ['a', 'b'],
    }],
  })
})

test('collision audit rejects malformed preference rows', () => {
  assert.throws(
    () => auditActionFeatureCollisions([
      { rootId: 'a', difference: [1, Number.NaN], target: 1, weight: 1 },
    ]),
    /finite/,
  )
  assert.throws(
    () => auditActionFeatureCollisions([
      { rootId: 'a', difference: [1], target: 0, weight: 1 },
    ]),
    /target/,
  )
})
