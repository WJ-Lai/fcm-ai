import assert from 'node:assert/strict'
import test from 'node:test'

import { auditActionRegretRanking } from './action-regret-ranking.mjs'

const dataset = {
  roots: [
    {
      rootId: 'a',
      candidates: [
        { candidateId: 'a0', staticRank: 0, postActionPairFeatures: [2], terminalMargin: 30 },
        { candidateId: 'a1', staticRank: 1, postActionPairFeatures: [1], terminalMargin: 10 },
      ],
    },
    {
      rootId: 'b',
      candidates: [
        { candidateId: 'b0', staticRank: 0, postActionPairFeatures: [-1], terminalMargin: -5 },
        { candidateId: 'b1', staticRank: 1, postActionPairFeatures: [3], terminalMargin: 20 },
        { candidateId: 'b2', staticRank: 2, postActionPairFeatures: [2], terminalMargin: 20 },
      ],
    },
  ],
}

test('ranking audit scores terminal-optimal ties correctly and reports mean regret', () => {
  const audit = auditActionRegretRanking(dataset, (candidate) => candidate.postActionPairFeatures[0])
  assert.equal(audit.roots, 2)
  assert.equal(audit.top1Correct, 2)
  assert.equal(audit.top1Accuracy, 1)
  assert.equal(audit.meanTerminalRegret, 0)
  assert.deepEqual(audit.details[1].oracleCandidateIds, ['b1', 'b2'])
  assert.equal(audit.details[1].selectedCandidateId, 'b1')
})

test('ranking audit preserves static order on equal scores and measures lost terminal margin', () => {
  const audit = auditActionRegretRanking(dataset, () => 0)
  assert.equal(audit.top1Correct, 1)
  assert.equal(audit.top1Accuracy, 0.5)
  assert.equal(audit.meanTerminalRegret, 12.5)
  assert.equal(audit.details[1].selectedCandidateId, 'b0')
  assert.equal(audit.details[1].terminalRegret, 25)
})

test('ranking audit rejects non-finite candidate scores', () => {
  assert.throws(() => auditActionRegretRanking(dataset, () => Number.NaN), /finite/)
})
