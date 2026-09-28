import assert from 'node:assert/strict'
import test from 'node:test'

import { buildActionPreferenceRows, validateActionRegretDataset } from './action-regret-dataset.mjs'

function dataset() {
  return {
    schemaVersion: 'fcm.action-regret-dataset.v1',
    protocolVersion: 'fcm.action-regret.v1',
    split: 'development',
    rulesetHash: 'a'.repeat(64),
    featureVersion: 'features.v1',
    featureNames: ['engine', 'cash'],
    promotionHoldoutOpened: false,
    roots: [
      {
        rootId: 'root-a', seed: 'seed-a', seat: 0, turn: 4, phase: 5, subphase: 1,
        snapshotDigest: `sha256:${'b'.repeat(64)}`,
        strategicProjectionDigest: `sha256:${'c'.repeat(64)}`,
        candidates: [
          { candidateId: 'a', staticRank: 0, postActionPairFeatures: [2, 1], terminalMargin: 30 },
          { candidateId: 'b', staticRank: 1, postActionPairFeatures: [1, 3], terminalMargin: 10 },
          { candidateId: 'c', staticRank: 2, postActionPairFeatures: [0, 0], terminalMargin: 10 },
        ],
      },
      {
        rootId: 'root-b', seed: 'seed-b', seat: 1, turn: 5, phase: 5, subphase: 3,
        snapshotDigest: `sha256:${'d'.repeat(64)}`,
        strategicProjectionDigest: `sha256:${'e'.repeat(64)}`,
        candidates: [
          { candidateId: 'x', staticRank: 0, postActionPairFeatures: [-1, 0], terminalMargin: -5 },
          { candidateId: 'y', staticRank: 1, postActionPairFeatures: [3, 2], terminalMargin: 20 },
        ],
      },
    ],
  }
}

test('action-regret rows compare candidates only within roots with equal root weight', () => {
  const input = dataset()
  assert.equal(validateActionRegretDataset(input).roots, 2)
  const rows = buildActionPreferenceRows(input)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => row.rootId), ['root-a', 'root-a', 'root-b'])
  assert.deepEqual(rows[0].difference, [1, -2])
  assert.equal(rows[0].target, 1)
  assert.equal(rows[1].weight, 0.5)
  assert.equal(rows[2].weight, 1)
  assert.equal(rows.filter((row) => row.rootId === 'root-a')
    .reduce((sum, row) => sum + row.weight, 0), 1)
})

test('action-regret dataset rejects raw engine state, duplicate roots, and malformed vectors', () => {
  const raw = dataset()
  raw.roots[0].snapshot = { hidden: true }
  assert.throws(() => validateActionRegretDataset(raw), /forbidden key snapshot/)

  const duplicateRoot = dataset()
  duplicateRoot.roots[1].rootId = 'root-a'
  assert.throws(() => validateActionRegretDataset(duplicateRoot), /duplicate root/)

  const malformed = dataset()
  malformed.roots[0].candidates[0].postActionPairFeatures = [1]
  assert.throws(() => validateActionRegretDataset(malformed), /feature dimension/)
})

test('action-regret promotion split remains sealed', () => {
  const input = dataset()
  input.split = 'promotion-holdout'
  assert.throws(() => validateActionRegretDataset(input), /promotion holdout is sealed/)
})
