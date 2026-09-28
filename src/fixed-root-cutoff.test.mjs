import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeFixedRootCutoffs } from './fixed-root-cutoff.mjs'

test('fixed-root cutoff summary separates helpful and harmful root-choice reversals', () => {
  const result = summarizeFixedRootCutoffs({
    staticOrder: ['a', 'b'],
    cutoffs: [0, 2, 6],
    candidates: [
      { candidateId: 'a', terminalMargin: 0, leafScores: { 0: 2, 2: 1, 6: 4 } },
      { candidateId: 'b', terminalMargin: 10, leafScores: { 0: 1, 2: 3, 6: 2 } },
    ],
  })
  assert.equal(result.oracleCandidate, 'b')
  assert.deepEqual(result.cutoffs.map((entry) => entry.selectedCandidate), ['a', 'b', 'a'])
  assert.deepEqual(result.reversals, {
    total: 2,
    towardOracle: 1,
    awayFromOracle: 1,
    lateral: 0,
  })
})

test('all-abstaining leaf scores preserve the frozen static fallback order', () => {
  const result = summarizeFixedRootCutoffs({
    staticOrder: ['static-first', 'other'],
    cutoffs: [0, 4],
    candidates: [
      { candidateId: 'static-first', terminalMargin: 0, leafScores: { 0: 0, 4: 0 } },
      { candidateId: 'other', terminalMargin: 20, leafScores: { 0: 0, 4: 0 } },
    ],
  })
  assert.deepEqual(result.cutoffs.map((entry) => entry.selectedCandidate), [
    'static-first', 'static-first',
  ])
  assert.equal(result.cutoffs[0].allAbstained, true)
  assert.equal(result.reversals.total, 0)
})

test('fixed-root summary rejects incomplete cutoff matrices', () => {
  assert.throws(() => summarizeFixedRootCutoffs({
    staticOrder: ['a'],
    cutoffs: [0, 2],
    candidates: [{ candidateId: 'a', terminalMargin: 1, leafScores: { 0: 1 } }],
  }), /cutoff 2/)
})
