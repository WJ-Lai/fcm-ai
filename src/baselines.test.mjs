import assert from 'node:assert/strict'
import test from 'node:test'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from './baselines.mjs'

function view({ phase, subphase = 1, actions, player = {} }) {
  return {
    state: {
      phase,
      subphase,
      mySeat: 0,
      players: [{ employees: [], beach: [], restaurants: [], ...player }],
    },
    legalActions: { actions },
  }
}

test('restructuring prioritizes workers that can create demand and supply over idle managers', () => {
  const result = safeFirstLegal(view({
    phase: 3,
    actions: [{
      type: 'place_employees',
      beach: [5, 17, 13, 27, 5],
      slots: [0, 1, 2],
    }],
  }))

  assert.deepEqual(result, [{
    type: 'place_employees',
    employees: [27, 13, 17],
    slots: [0, 1, 2],
  }])
})

test('baseline emits an explicit end turn when restructuring has no placement', () => {
  assert.deepEqual(safeFirstLegal(view({
    phase: 3,
    actions: [{ type: 'place_employees', beach: [], slots: [] }],
  })), [{ type: 'end_turn' }])
})

test('baseline never invents a restaurant square', () => {
  assert.deepEqual(safeFirstLegal(view({
    phase: 0,
    actions: [{ type: 'place_restaurant', legalSquares: [42, 99], rotation: 3 }],
  })), [
    { type: 'place_restaurant', index: 42, rotation: 3 },
    { type: 'end_turn' },
  ])
})

test('seeded random baseline is reproducible and samples only advertised setup values', () => {
  const position = view({
    phase: 0,
    actions: [{ type: 'place_restaurant', legalSquares: [42, 99, 123], rotation: 3 }],
  })
  const first = randomLegal(position, seededPolicyRandom('same-seed'))
  const second = randomLegal(position, seededPolicyRandom('same-seed'))

  assert.deepEqual(first, second)
  assert.ok([42, 99, 123].includes(first[0].index))
  assert.equal(first[0].rotation, 3)
})

test('random training copies origin and step cost from the legal candidate', () => {
  const result = randomLegal(view({
    phase: 5,
    subphase: 2,
    actions: [
      {
        type: 'train',
        available: [{ id: 5, origin: 1, upgrades: [{ id: 6, steps: 2 }] }],
      },
      { type: 'next_subphase' },
    ],
  }), () => 0)

  assert.deepEqual(result, [
    { type: 'train', employee: 5, toEmployee: 6, origin: 1, steps: 2 },
    { type: 'next_subphase' },
  ])
})

test('random marketing chooses a placement that reaches a house', () => {
  const result = randomLegal(view({
    phase: 5,
    subphase: 3,
    actions: [{
      type: 'marketing', goods: [3, 4], options: [{
        marketer: 13,
        campaigns: [{
          campaign: 2, maxDuration: 2, durationInfinite: false,
          placements: [
            { rotated: false, legalSquares: [10], houseImpacts: [{ index: 10, houses: [] }] },
            { rotated: true, legalSquares: [20], houseImpacts: [{ index: 20, houses: [7] }] },
          ],
        }],
      }],
    }, { type: 'next_subphase' }],
  }), () => 0)

  assert.deepEqual(result, [
    {
      type: 'marketing', marketer: 13, campaign: 2, good: 4,
      duration: 2, rotated: true, index: 20,
    },
    { type: 'next_subphase' },
  ])
})
