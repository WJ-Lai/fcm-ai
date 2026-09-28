import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditActionRegretStability,
  validateActionRegretStability,
} from './action-regret-stability.mjs'

function fixture() {
  return {
    schemaVersion: 'fcm.action-regret-stability.v1',
    rulesetHash: 'a'.repeat(64),
    continuationPolicy: 'fcm.deterministic-vs-official-builtin-population.v1',
    sampleCount: 3,
    promotionHoldoutOpened: false,
    roots: [
      {
        rootId: 'root-stable', sourceSplit: 'development',
        snapshotDigest: `sha256:${'b'.repeat(64)}`,
        candidates: [
          { candidateId: 'produce', terminalMargins: [10, 30, 20], terminalCommands: [5, 6, 7] },
          { candidateId: 'skip', terminalMargins: [0, 10, 5], terminalCommands: [5, 6, 7] },
        ],
      },
      {
        rootId: 'root-flip', sourceSplit: 'calibration',
        snapshotDigest: `sha256:${'c'.repeat(64)}`,
        candidates: [
          { candidateId: 'produce', terminalMargins: [10, -5, 20], terminalCommands: [5, 6, 7] },
          { candidateId: 'skip', terminalMargins: [0, 5, 0], terminalCommands: [5, 6, 7] },
        ],
      },
    ],
  }
}

test('stability audit identifies roots whose preferred candidate flips across continuations', () => {
  const input = fixture()
  assert.deepEqual(validateActionRegretStability(input), { roots: 2, candidates: 4, samples: 3 })
  const audit = auditActionRegretStability(input)
  assert.equal(audit.stableRoots, 1)
  assert.equal(audit.flippedRoots, 1)
  assert.deepEqual(audit.details[0].oraclePatterns, ['produce'])
  assert.deepEqual(audit.details[1].oraclePatterns, ['produce', 'skip'])
  assert.equal(audit.details[1].sampleAgreement, 2 / 3)
})

test('stability data fails closed on hidden state, uneven samples, and an opened holdout', () => {
  const hidden = fixture()
  hidden.roots[0].snapshot = { private: true }
  assert.throws(() => validateActionRegretStability(hidden), /forbidden key snapshot/)

  const uneven = fixture()
  uneven.roots[0].candidates[0].terminalMargins.pop()
  assert.throws(() => validateActionRegretStability(uneven), /sample count/)

  const opened = fixture()
  opened.promotionHoldoutOpened = true
  assert.throws(() => validateActionRegretStability(opened), /must remain sealed/)
})
