import assert from 'node:assert/strict'
import test from 'node:test'

import { deterministicStrategy, evaluatePosition, rankCandidates } from './strategy.mjs'

function view(phase, subphase, actions, player = {}) {
  return {
    state: {
      phase, subphase, mySeat: 0,
      players: [{ money: 20, resources: [], employees: [], beach: [], ...player }],
      houseDemands: [],
      decisionSupport: {
        economyPlayers: [{
          seat: 0, salary: { due: 0 },
          capacities: { recruiting: { total: 1 }, training: { total: 0 }, production: [], marketing: [] },
        }],
        strategicThreats: { milestones: [] },
      },
    },
    legalActions: { yourTurn: true, actions },
  }
}

test('position evaluation is auditable, profile-sensitive and bankruptcy-safe', () => {
  const input = view(5, 1, [], { money: 40, employees: [13, 27], resources: [4] })
  const balanced = evaluatePosition(input)
  const cash = evaluatePosition(input, { profile: 'cash' })
  assert.equal(balanced.score, Object.values(balanced.breakdown).reduce((a, b) => a + b, 0))
  assert.ok(cash.breakdown.cash > balanced.breakdown.cash)
  input.state.players[0].bankrupt = true
  assert.ok(evaluatePosition(input).score < -9000)
})

test('strategy never offers the legal skip before placing the required restaurant', () => {
  const result = deterministicStrategy(view(0, 1, [{
    type: 'place_restaurant', placements: [{ rotation: 0, legalSquares: [11, 12] }],
  }, { type: 'end_turn' }]))
  assert.equal(result.selected.actions[0].type, 'place_restaurant')
  assert.ok(result.ranked.every((candidate) => candidate.actions[0].type === 'place_restaurant'))
})

test('strategy prefers production that satisfies observed demand', () => {
  const input = view(5, 4, [
    { type: 'produce', producers: [{ id: 12, goods: [3, 4] }] },
    { type: 'next_subphase' },
  ])
  input.state.houseDemands = [{ goods: [4, 4] }]
  const result = deterministicStrategy(input)
  assert.equal(result.selected.actions[0].item, 4)
  assert.ok(result.selected.scoreBreakdown.action.market > 10)
})

test('strategy refuses to donate marketing demand to unreachable houses', () => {
  const input = view(5, 3, [
    { type: 'marketing', goods: [4], options: [{ marketer: 13, campaigns: [{
      campaign: 11, durationInfinite: false, maxDuration: 1,
      placements: [{ rotated: false, legalSquares: [40, 41], houseImpacts: [
        { index: 40, houses: [1] }, { index: 41, houses: [2] },
      ] }],
    }] }] },
    { type: 'next_subphase' },
  ], { employees: [13], resources: [4] })
  input.state.decisionSupport.strategicThreats.reachability = { houses: [
    { house: 1, reachableSeats: [1] },
    { house: 2, reachableSeats: [0] },
  ] }
  const result = deterministicStrategy(input)
  assert.equal(result.selected.actions[0].index, 41)
  const unreachable = result.ranked.find((candidate) => candidate.actions[0].index === 40)
  assert.ok(result.selected.scoreBreakdown.action.risk > unreachable.scoreBreakdown.action.risk)
})

test('memory can bias a near-tie but cannot introduce an unoffered candidate', () => {
  const input = view(4, 1, [{ type: 'choose_turn_order', positions: [0, 1] }])
  const candidates = [
    { id: 'a', intent: 'turn-order', actions: [{ type: 'choose_turn_order', turnOrderPosition: 1 }], details: {} },
    { id: 'b', intent: 'cash', actions: [{ type: 'choose_turn_order', turnOrderPosition: 1 }], details: {} },
  ]
  const ranked = rankCandidates(input, candidates, {
    memory: { strategicPlan: { intent: 'cash', confidence: 'high' } },
  })
  assert.equal(ranked[0].id, 'b')
  assert.deepEqual(new Set(ranked.map((item) => item.id)), new Set(['a', 'b']))
})
