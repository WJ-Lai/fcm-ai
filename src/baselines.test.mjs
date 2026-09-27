import assert from 'node:assert/strict'
import test from 'node:test'

import { safeFirstLegal } from './baselines.mjs'

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
