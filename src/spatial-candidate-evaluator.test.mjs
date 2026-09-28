import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateSpatialCandidates } from './spatial-candidate-evaluator.mjs'

const before = {
  state: {
    mySeat: 0,
    decisionSupport: { strategicThreats: { reachability: { houses: [] } } },
  },
}

test('evaluates spatial candidates on isolated clones and preserves candidate identity', async () => {
  const stepped = []
  const environment = {
    clone() {
      let chosen = null
      return {
        async step(seat, actions) {
          stepped.push({ seat, actions })
          chosen = actions[0]
        },
        async observe(seat) {
          assert.equal(seat, 0)
          return {
            state: {
              mySeat: 0,
              decisionSupport: { strategicThreats: { reachability: { houses: [{
                house: chosen.house,
                restaurantDistances: [chosen.index, -99],
                reachableSeats: [0],
              }] } } },
            },
          }
        },
      }
    },
  }
  const candidates = [
    { id: 'fallback', actions: [{ type: 'next_subphase' }] },
    { id: 'near', actions: [{ type: 'build_house', building: 'house', house: 3, index: 4 }] },
    { id: 'far', actions: [{ type: 'build_house', building: 'house', house: 3, index: 9 }] },
  ]

  const labels = await evaluateSpatialCandidates({ environment, seat: 0, beforeView: before, candidates })
  assert.deepEqual(labels.map(({ candidateId, consequence }) => ({ candidateId, consequence })), [
    {
      candidateId: 'near',
      consequence: {
        kind: 'build-house', house: 3,
        restaurantDistances: [4, null], reachableSeats: [0],
        actingSeatDistance: 4, bestOpponentDistance: null,
      },
    },
    {
      candidateId: 'far',
      consequence: {
        kind: 'build-house', house: 3,
        restaurantDistances: [9, null], reachableSeats: [0],
        actingSeatDistance: 9, bestOpponentDistance: null,
      },
    },
  ])
  assert.equal(stepped.length, 2)
})

test('rejects a mismatched seat before touching the environment', async () => {
  await assert.rejects(
    evaluateSpatialCandidates({ environment: {}, seat: 1, beforeView: before, candidates: [] }),
    /seat does not match/,
  )
})
