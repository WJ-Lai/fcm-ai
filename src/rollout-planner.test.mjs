import assert from 'node:assert/strict'
import test from 'node:test'

import {
  prefilterDiverseCandidates,
  selectWithOfficialRollouts,
} from './rollout-planner.mjs'

function candidate(id, intent, score, outcomeScore, actions = [{ type: id }]) {
  return { id, intent, score, outcomeScore, actions, details: {}, scoreBreakdown: {} }
}

class FakeEnvironment {
  constructor({ outcomes, hidden = null, calls = [] }) {
    this.outcomes = outcomes
    this.hidden = hidden
    this.calls = calls
    this.selected = null
  }

  clone() {
    this.calls.push(['clone'])
    return new FakeEnvironment({ outcomes: this.outcomes, hidden: this.hidden, calls: this.calls })
  }

  async step(seat, actions) {
    this.selected = actions[0].type
    this.calls.push(['step', seat, this.selected])
  }

  async observe(seat) {
    this.calls.push(['observe', seat, this.selected])
    return { state: { mySeat: seat, outcomeScore: this.outcomes[this.selected] ?? 0 } }
  }
}

test('prefilter keeps strategic diversity before filling remaining score slots', () => {
  const ranked = [
    candidate('a1', 'hire', 100, 0),
    candidate('a2', 'hire', 99, 0),
    candidate('b1', 'train', 98, 0),
    candidate('c1', 'market', 97, 0),
    candidate('d1', 'produce', 96, 0),
  ]
  assert.deepEqual(
    prefilterDiverseCandidates(ranked, { limit: 4 }).map((item) => item.id),
    ['a1', 'b1', 'c1', 'd1'],
  )
})

test('official rollout can overturn the static ranking using post-action consequences', async () => {
  const ranked = [
    candidate('static-favorite', 'hire', 100, -5),
    candidate('real-winner', 'market', 80, 25),
  ]
  const env = new FakeEnvironment({ outcomes: {
    'static-favorite': -5,
    'real-winner': 25,
  } })
  const result = await selectWithOfficialRollouts({
    env,
    seat: 0,
    view: { legalActions: { isSimulPhase: false } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
  })
  assert.equal(result.selected.id, 'real-winner')
  assert.equal(result.metrics.officialTransitions, 2)
  assert.equal(result.metrics.fallbackUsed, false)
})

test('deadline exhaustion fails closed to the best static legal candidate', async () => {
  const ranked = [candidate('fallback', 'safe', 10, 0), candidate('other', 'risk', 9, 100)]
  let time = 0
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: {} }),
    seat: 0,
    view: { legalActions: { isSimulPhase: false } },
    rankedCandidates: ranked,
    scoreOutcome: () => 0,
    budget: { maxCandidates: 6, maxTransitions: 24, deadlineMs: 3 },
    now: () => ++time * 2,
  })
  assert.equal(result.selected.id, 'fallback')
  assert.equal(result.metrics.fallbackUsed, true)
  assert.equal(result.metrics.stopReason, 'deadline')
})

test('simultaneous decisions never invoke continuation over unknown opponent moves', async () => {
  let continuationCalls = 0
  const ranked = [candidate('choice', 'simul', 1, 5)]
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: { choice: 5 }, hidden: { opponentChoice: 999 } }),
    seat: 0,
    view: { legalActions: { isSimulPhase: true } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
    continueRollout: async () => { continuationCalls += 1; return { transitions: 10 } },
  })
  assert.equal(result.selected.id, 'choice')
  assert.equal(continuationCalls, 0)
  assert.equal(result.metrics.officialTransitions, 1)
})

test('transition budget stops expansion and preserves a legal evaluated choice', async () => {
  const ranked = [
    candidate('first', 'a', 3, 2),
    candidate('second', 'b', 2, 8),
    candidate('third', 'c', 1, 100),
  ]
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: { first: 2, second: 8, third: 100 } }),
    seat: 0,
    view: { legalActions: { isSimulPhase: false } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
    budget: { maxCandidates: 6, maxTransitions: 2, deadlineMs: 3000 },
  })
  assert.equal(result.selected.id, 'second')
  assert.equal(result.metrics.officialTransitions, 2)
  assert.equal(result.metrics.stopReason, 'transition-budget')
})

test('continuation cannot consume more official transitions than it was granted', async () => {
  const ranked = [candidate('bounded', 'a', 3, 9)]
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: { bounded: 9 } }),
    seat: 0,
    view: { legalActions: { isSimulPhase: false } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
    budget: { maxCandidates: 1, maxTransitions: 2, deadlineMs: 3000 },
    continueRollout: async ({ remainingTransitions }) => ({
      transitions: remainingTransitions + 1,
    }),
  })
  assert.equal(result.selected.id, 'bounded')
  assert.equal(result.metrics.fallbackUsed, true)
  assert.match(result.failures[0].message, /exceeded its transition budget/)
  assert.equal(result.metrics.officialTransitions, 1)
})

test('deadline crossed inside continuation fails closed to static ranking', async () => {
  const ranked = [
    candidate('static-fallback', 'a', 10, -10),
    candidate('late-result', 'b', 9, 100),
  ]
  let time = 0
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: { 'static-fallback': -10, 'late-result': 100 } }),
    seat: 0,
    view: { legalActions: { isSimulPhase: false } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
    budget: { maxCandidates: 2, maxTransitions: 10, deadlineMs: 5 },
    now: () => time,
    continueRollout: async () => {
      time = 6
      return { transitions: 1 }
    },
  })
  assert.equal(result.selected.id, 'static-fallback')
  assert.equal(result.metrics.stopReason, 'deadline')
  assert.equal(result.metrics.fallbackUsed, true)
})

test('mutating hidden opponent state cannot change a simultaneous recommendation', async () => {
  const ranked = [
    candidate('public-best', 'simul-a', 10, 12),
    candidate('public-second', 'simul-b', 9, 7),
  ]
  const choose = async (hidden) => selectWithOfficialRollouts({
    env: new FakeEnvironment({
      outcomes: { 'public-best': 12, 'public-second': 7 },
      hidden,
    }),
    seat: 0,
    view: { legalActions: { isSimulPhase: true } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
    continueRollout: async () => {
      throw new Error('must not inspect unresolved opponent choices')
    },
  })
  const left = await choose({ opponentChoice: 'hire' })
  const right = await choose({ opponentChoice: 'market' })
  assert.equal(left.selected.id, right.selected.id)
  assert.deepEqual(left.evaluated, right.evaluated)
})

test('equal official outcomes preserve static ranking instead of candidate id order', async () => {
  const ranked = [
    candidate('z-static-first', 'a', 10, 5),
    candidate('a-id-first', 'b', 9, 5),
  ]
  const result = await selectWithOfficialRollouts({
    env: new FakeEnvironment({ outcomes: { 'z-static-first': 5, 'a-id-first': 5 } }),
    seat: 0,
    view: { legalActions: { isSimulPhase: true } },
    rankedCandidates: ranked,
    scoreOutcome: (after) => after.state.outcomeScore,
  })
  assert.equal(result.selected.id, 'z-static-first')
})
