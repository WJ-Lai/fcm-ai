import assert from 'node:assert/strict'
import test from 'node:test'

import { exactCandidateRank } from './candidate-imitation.mjs'

test('exact candidate rank matches the complete action batch and reports one-based rank', () => {
  const ranked = [
    { id: 'single', actions: [{ type: 'hire', employee: 17 }] },
    { id: 'human', actions: [
      { type: 'hire', employee: 17 },
      { type: 'hire', employee: 27 },
      { type: 'next_subphase' },
    ] },
  ]
  assert.deepEqual(exactCandidateRank(ranked, ranked[1].actions), {
    candidateId: 'human',
    rank: 2,
  })
})

test('exact candidate rank does not accept a prefix or reordered batch', () => {
  const ranked = [{
    id: 'candidate',
    actions: [
      { type: 'hire', employee: 17 },
      { type: 'hire', employee: 27 },
      { type: 'next_subphase' },
    ],
  }]
  assert.equal(exactCandidateRank(ranked, [{ type: 'hire', employee: 17 }]), null)
  assert.equal(exactCandidateRank(ranked, [
    { type: 'hire', employee: 27 },
    { type: 'hire', employee: 17 },
    { type: 'next_subphase' },
  ]), null)
})
