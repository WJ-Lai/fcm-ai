import assert from 'node:assert/strict'
import test from 'node:test'

import {
  spatialConsequenceSignature,
  summarizeRestaurantReachChange,
} from './spatial-consequence.mjs'

function view(mySeat, houses, extraState = {}) {
  return {
    state: {
      mySeat,
      ...extraState,
      decisionSupport: {
        strategicThreats: {
          reachability: { houses },
        },
      },
    },
  }
}

test('build-house signature uses official post-action distances instead of raw coordinate', () => {
  const before = view(0, [{ house: 2, restaurantDistances: [4, 7], reachableSeats: [0, 1] }])
  const after = view(0, [
    { house: 2, restaurantDistances: [4, 7], reachableSeats: [0, 1] },
    { house: 9, restaurantDistances: [6, -99], reachableSeats: [0] },
  ])
  const actions = [
    { type: 'build_house', building: 'house', house: 9, rotation: 1, index: 1234 },
    { type: 'next_subphase' },
  ]

  assert.deepEqual(spatialConsequenceSignature(before, after, actions), {
    kind: 'build-house',
    house: 9,
    restaurantDistances: [6, null],
    reachableSeats: [0],
    actingSeatDistance: 6,
    bestOpponentDistance: null,
  })
})

test('two build placements with equal official consequences have equal signatures', () => {
  const before = view(1, [])
  const after = view(1, [
    { house: 3, restaurantDistances: [5, 4, 8], reachableSeats: [0, 1, 2] },
  ])
  const action = (index, rotation) => [
    { type: 'build_house', building: 'house', house: 3, rotation, index },
    { type: 'next_subphase' },
  ]

  assert.deepEqual(
    spatialConsequenceSignature(before, after, action(100, 0)),
    spatialConsequenceSignature(before, after, action(900, 1)),
  )
})

test('restaurant reach summary separates new reach, losses, improvements, and regressions', () => {
  const before = view(0, [
    { house: 1, restaurantDistances: [-99, 3], reachableSeats: [1] },
    { house: 2, restaurantDistances: [8, 4], reachableSeats: [0, 1] },
    { house: 3, restaurantDistances: [2, 6], reachableSeats: [0, 1] },
    { house: 4, restaurantDistances: [5, -99], reachableSeats: [0] },
  ])
  const after = view(0, [
    { house: 1, restaurantDistances: [7, 3], reachableSeats: [0, 1] },
    { house: 2, restaurantDistances: [5, 4], reachableSeats: [0, 1] },
    { house: 3, restaurantDistances: [6, 6], reachableSeats: [0, 1] },
    { house: 4, restaurantDistances: [-99, -99], reachableSeats: [] },
  ])

  assert.deepEqual(summarizeRestaurantReachChange(before, after), {
    actingSeat: 0,
    changedHouses: [
      { house: 1, before: null, after: 7 },
      { house: 2, before: 8, after: 5 },
      { house: 3, before: 2, after: 6 },
      { house: 4, before: 5, after: null },
    ],
    newlyReachable: 1,
    noLongerReachable: 1,
    totalDistanceImprovement: 3,
    totalDistanceRegression: 4,
  })
})

test('restaurant signature ignores coordinates but distinguishes create from move', () => {
  const before = view(0, [{ house: 1, restaurantDistances: [-99, 4], reachableSeats: [1] }])
  const after = view(0, [{ house: 1, restaurantDistances: [6, 4], reachableSeats: [0, 1] }])
  const action = (restaurantAction, index) => [
    { type: 'open_restaurant', restaurantAction, manager: 2, rotation: 0, index, fromIndex: 50 },
    { type: 'next_subphase' },
  ]

  const create = spatialConsequenceSignature(before, after, action('create', 100))
  const sameEffect = spatialConsequenceSignature(before, after, action('create', 200))
  const move = spatialConsequenceSignature(before, after, action('move', 200))
  assert.deepEqual(create, sameEffect)
  assert.equal(create.kind, 'create-restaurant')
  assert.equal(move.kind, 'move-restaurant')
  assert.notDeepEqual(create, move)
})

test('non-spatial or ambiguous batches are not assigned a spatial label', () => {
  const state = view(0, [])
  assert.equal(spatialConsequenceSignature(state, state, [{ type: 'next_subphase' }]), null)
  assert.equal(spatialConsequenceSignature(state, state, [
    { type: 'build_house', building: 'house', house: 1 },
    { type: 'build_house', building: 'house', house: 2 },
  ]), null)
})
