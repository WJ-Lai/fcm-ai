import assert from 'node:assert/strict'
import test from 'node:test'

import { mapReplayDecisionGroup } from './replay-action-mapper.mjs'

const importIndex = (index) => index + 1000
const reference = { BRAND_DIRECTOR: 16, LOCAL_MANAGER: 2, REGIONAL_MANAGER: 3 }

function map(eventCode, payload, { legal = [], state = null, phase = 5 } = {}) {
  return mapReplayDecisionGroup({ phase, seat: 0, events: [{ eventCode, payload }] }, {
    legalActions: { actions: legal },
    state: state ?? { players: [{ resources: [] }] },
    importIndex,
    reference,
  })
}

test('maps setup history and preserves legacy restaurant rotation', () => {
  assert.deepEqual(map(1, [23], { phase: 0 }), [
    { type: 'place_restaurant', index: 1023, rotation: 3 },
  ])
  assert.deepEqual(map(2, [2], { phase: 2 }), [
    { type: 'choose_reserve_card', cardValue: 2 },
  ])
})

test('maps an empty restructuring choice to the human end-turn action', () => {
  assert.deepEqual(map(3, [[], [5, 17]], { phase: 3 }), [{ type: 'end_turn' }])
})

test('maps every training origin using legal upgrade step counts', () => {
  const legal = [{ type: 'train', available: [
    { id: -1, origin: 1, upgrades: [{ id: 17, steps: 1 }] },
    { id: 5, origin: 0, upgrades: [{ id: 6, steps: 1 }] },
    { id: 7, origin: 2, upgrades: [{ id: 22, steps: 2 }] },
  ] }]
  assert.deepEqual(map(8, [-1, 17, 5, 6, 57, 22], { legal }), [
    { type: 'train', employee: -1, toEmployee: 17, origin: 1, steps: 1 },
    { type: 'train', employee: 5, toEmployee: 6, origin: 0, steps: 1 },
    { type: 'train', employee: 7, toEmployee: 22, origin: 2, steps: 2 },
    { type: 'next_subphase' },
  ])
})

test('maps marketing by matching the current legal placement', () => {
  const legal = [{ type: 'marketing', options: [{ marketer: 13, campaigns: [{
    campaign: 14,
    placements: [{ rotated: false, legalSquares: [] }, { rotated: true, legalSquares: [1197] }],
  }] }] }]
  assert.deepEqual(map(9, [14, 197, 4, 13, 1, 2], { legal }), [
    { type: 'marketing', marketer: 13, campaign: 14, good: 4, duration: 2, rotated: true, index: 1197 },
    { type: 'next_subphase' },
  ])
})

test('maps gardens, houses and restaurant moves through legal options', () => {
  const buildings = [{ type: 'build_house',
    houses: [{ house: 1, placements: [{ rotation: 0, legalSquares: [1048] }] }],
    gardens: [{ house: 5, houseIndex: 77, edges: [{ edge: 2, index: 1168 }] }],
  }]
  assert.equal(map(12, [168, 5], { legal: buildings })[0].edge, 2)
  assert.equal(map(13, [48, 1, 0], { legal: buildings })[0].rotation, 0)
  const restaurants = [{ type: 'open_restaurant', managers: [{ manager: 3, actions: [{
    type: 'move', restaurants: [1263], placements: [{ rotation: 0, legalSquares: [1278] }],
  }] }] }]
  assert.deepEqual(map(15, [278, 263, 0], { legal: restaurants })[0], {
    type: 'open_restaurant', restaurantAction: 'move', manager: 3,
    fromIndex: 1263, rotation: 0, index: 1278,
  })
})

test('cleanup computes an exact multiset discard and rejects impossible kept stock', () => {
  assert.deepEqual(map(24, [3, 4], {
    phase: 9,
    state: { players: [{ resources: [3, 3, 4, 5] }] },
  }), [{ type: 'resolve_cleanup', discardResources: [3, 5] }])
  assert.throws(() => map(24, [9], {
    phase: 9, state: { players: [{ resources: [3] }] },
  }), /unavailable resource/)
})

test('fails closed for non-invertible production and forged upgrades', () => {
  assert.throws(() => map(10, [[17], [0, 0, 0, 0, 1]]), /not exactly invertible/)
  assert.throws(() => map(8, [5, 99], {
    legal: [{ type: 'train', available: [{ id: 5, origin: 0, upgrades: [] }] }],
  }), /absent from legal actions/)
})
