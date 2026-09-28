import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decisionBatchShape,
  decisionPatternKey,
  exactCandidateRank,
  marketingEffectSignature,
  projectedCandidateRank,
  winnerSeatsFromPlayers,
} from './candidate-imitation.mjs'

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

test('decision batch shape excludes phase-control actions and preserves mixed action families', () => {
  assert.deepEqual(decisionBatchShape([
    { type: 'hire', employee: 17 },
    { type: 'hire', employee: 27 },
    { type: 'next_subphase' },
  ]), { actionCount: 2, actionTypes: ['hire'] })
  assert.deepEqual(decisionBatchShape([
    { type: 'build_house' },
    { type: 'open_restaurant' },
    { type: 'end_turn' },
  ]), { actionCount: 2, actionTypes: ['build_house', 'open_restaurant'] })
})

test('marketing effect signature treats coordinates with identical affected houses as equivalent', () => {
  const legalActions = { actions: [{
    type: 'marketing', goods: [4], options: [{ marketer: 13, campaigns: [{
      campaign: 14,
      placements: [{ rotated: false, houseImpacts: [
        { index: 40, houses: [2, 1] },
        { index: 41, houses: [1, 2] },
        { index: 42, houses: [3] },
      ] }],
    }] }],
  }] }
  const action = (index) => [{
    type: 'marketing', marketer: 13, campaign: 14, good: 4,
    duration: 2, rotated: false, index,
  }, { type: 'next_subphase' }]
  assert.deepEqual(
    marketingEffectSignature(action(40), legalActions),
    marketingEffectSignature(action(41), legalActions),
  )
  assert.notDeepEqual(
    marketingEffectSignature(action(40), legalActions),
    marketingEffectSignature(action(42), legalActions),
  )
  assert.deepEqual(projectedCandidateRank([
    { id: 'equivalent', actions: action(41) },
    { id: 'different', actions: action(42) },
  ], action(40), (actions) => marketingEffectSignature(actions, legalActions)), {
    candidateId: 'equivalent', rank: 1,
  })
})

test('winner seats are derived from terminal public money and preserve ties', () => {
  assert.deepEqual(winnerSeatsFromPlayers([
    { money: 20 }, { money: 50 }, { money: 50 },
  ]), [1, 2])
  assert.deepEqual(winnerSeatsFromPlayers([
    { money: -10 }, { money: 0 },
  ]), [1])
  assert.deepEqual(winnerSeatsFromPlayers([]), [])
})

test('decision pattern key canonicalizes order-insensitive hire and train batches', () => {
  assert.equal(decisionPatternKey([
    { type: 'hire', employee: 27 },
    { type: 'hire', employee: 17 },
    { type: 'next_subphase' },
  ]), 'hire:17,27')
  assert.equal(decisionPatternKey([
    { type: 'train', employee: 13, origin: 0, toEmployee: 14 },
    { type: 'train', employee: 5, origin: 0, toEmployee: 6 },
    { type: 'next_subphase' },
  ]), 'train:0/5>6,0/13>14')
})
