import assert from 'node:assert/strict'
import test from 'node:test'

import { continueOwnPublicTurn, scorePublicPositionOutcome } from './official-rollout.mjs'

class ScriptedEnvironment {
  constructor(frames) {
    this.frames = structuredClone(frames)
    this.index = 0
    this.observedSeats = []
    this.steps = []
  }

  snapshot() {
    return structuredClone(this.frames[this.index].snapshot)
  }

  async observe(seat) {
    this.observedSeats.push(seat)
    return structuredClone(this.frames[this.index].view)
  }

  async step(seat, actions) {
    this.steps.push({ seat, actions: structuredClone(actions) })
    this.index += 1
  }
}

function frame({ pending = 'agent', phase = 5, subphase = 2, simul = false }) {
  return {
    snapshot: {
      phase,
      subphase,
      currentPlayers: [pending],
      playerNames: ['agent', 'opponent'],
    },
    view: {
      state: {
        phase,
        subphase,
        mySeat: pending === 'agent' ? 0 : 1,
        players: [{ money: 10, employees: [], beach: [], resources: [] }, {
          money: 10, employees: [], beach: [], resources: [],
        }],
      },
      legalActions: {
        yourTurn: true,
        isSimulPhase: simul,
        actions: [{ type: 'next_subphase' }],
      },
    },
  }
}

test('public continuation advances only consecutive decisions belonging to the acting seat', async () => {
  const env = new ScriptedEnvironment([
    frame({ subphase: 2 }),
    frame({ subphase: 3 }),
    frame({ pending: 'opponent', subphase: 1 }),
  ])
  const result = await continueOwnPublicTurn({
    env,
    seat: 0,
    remainingTransitions: 8,
    deadline: 100,
    now: () => 0,
  })
  assert.equal(result.transitions, 2)
  assert.equal(result.stopReason, 'other-player')
  assert.deepEqual(env.observedSeats, [0, 0])
  assert.deepEqual(env.steps.map((step) => step.seat), [0, 0])
})

test('public continuation stops before observing or submitting a simultaneous decision', async () => {
  const env = new ScriptedEnvironment([frame({ simul: true })])
  const result = await continueOwnPublicTurn({
    env,
    seat: 0,
    remainingTransitions: 8,
    deadline: 100,
    now: () => 0,
  })
  assert.equal(result.transitions, 0)
  assert.equal(result.stopReason, 'unresolved-simultaneous')
  assert.deepEqual(env.steps, [])
})

test('public outcome score uses only the supplied seat-safe DecisionView', () => {
  const view = {
    state: {
      mySeat: 0,
      players: [
        { money: 20, employees: [5], beach: [], resources: [4], bankrupt: false },
        { money: 50, employees: [], beach: [], resources: [], bankrupt: false },
      ],
      decisionSupport: { economyPlayers: [] },
    },
  }
  const result = scorePublicPositionOutcome(view, { seat: 0 })
  assert.ok(Number.isFinite(result))
  const changedOpponentPrivateState = structuredClone(view)
  changedOpponentPrivateState.state.players[1].employees = [999, 998, 997]
  changedOpponentPrivateState.state.players[1].resources = [99, 99]
  assert.equal(scorePublicPositionOutcome(changedOpponentPrivateState, { seat: 0 }), result)
})
