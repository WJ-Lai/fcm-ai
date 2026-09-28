import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildOpponentBelief } from './opponent-population.mjs'
import { selectWithScenarioBeam } from './scenario-beam.mjs'

const population = JSON.parse(await readFile(
  new URL('../fixtures/opponent-population-v1/manifest.json', import.meta.url),
))
const officialSmoke = JSON.parse(await readFile(
  new URL('../fixtures/scenario-beam-v1/report.json', import.meta.url),
))

function belief(patch = {}) {
  return buildOpponentBelief(population, {
    observed: {
      publicHistoryDigest: `sha256:${'c'.repeat(64)}`,
      turn: 2,
      seat: 1,
      publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: {
      confidence: 'medium',
      sampleCount: 4,
      outOfDistribution: false,
      ...patch,
    },
  })
}

function officialBelief() {
  const result = belief({ confidence: 'high' })
  result.believed.models = result.believed.models.map((model) => ({
    ...model,
    probability: model.modelId === 'official-built-in-v1' ? 1 : 0,
    confidence: model.modelId === 'official-built-in-v1' ? 'high' : 'low',
  }))
  return result
}

function candidate(id, intent, score, action = id) {
  return {
    id, intent, score, actions: [{ type: action }], details: {}, scoreBreakdown: {},
  }
}

const nodes = {
  root: { current: 0, edges: { static: 'opp-static', beam: 'opp-beam' }, value: 0 },
  'opp-static': { current: 1, edges: { opponent: 'own-static' }, value: -2 },
  'opp-beam': { current: 1, edges: { opponent: 'own-beam' }, value: 3 },
  'own-static': { current: 0, edges: { settle: 'leaf-static' }, value: -2 },
  'own-beam': { current: 0, edges: { invest: 'leaf-beam' }, value: 3 },
  'leaf-static': { current: null, edges: {}, value: 1, terminal: true },
  'leaf-beam': { current: null, edges: {}, value: 20, terminal: true },
}

class TreeEnvironment {
  constructor({ node = 'root', calls = [], hidden = null, simultaneousNodes = new Set() } = {}) {
    this.node = node
    this.calls = calls
    this.hidden = hidden
    this.simultaneousNodes = simultaneousNodes
  }

  clone() {
    this.calls.push(['clone', this.node])
    return new TreeEnvironment({
      node: this.node,
      calls: this.calls,
      hidden: this.hidden,
      simultaneousNodes: this.simultaneousNodes,
    })
  }

  snapshot() {
    const current = nodes[this.node].current
    return {
      phase: nodes[this.node].terminal ? 10 : 5,
      currentPlayers: current == null ? [] : [`p${current}`],
      playerNames: ['p0', 'p1'],
    }
  }

  async observe(seat) {
    this.calls.push(['observe', seat, this.node])
    return {
      state: {
        mySeat: seat,
        phase: nodes[this.node].terminal ? 10 : 5,
        subphase: 1,
        node: this.node,
        value: nodes[this.node].value,
      },
      legalActions: {
        yourTurn: nodes[this.node].current === seat,
        isSimulPhase: this.simultaneousNodes.has(this.node),
        actions: [],
      },
    }
  }

  async step(seat, actions) {
    const type = actions[0]?.type
    this.calls.push(['step', seat, this.node, type])
    const next = nodes[this.node].edges[type]
    if (!next) throw new Error(`illegal tree action ${type} at ${this.node}`)
    this.node = next
  }

  async stepBuiltinAI(seat, seed) {
    this.calls.push(['stepBuiltinAI', seat, this.node, seed])
    await this.step(seat, [{ type: 'opponent' }])
  }
}

class SimultaneousTreeEnvironment {
  constructor({ node = 'root', pending = ['p0'], calls = [], actorChoice = null } = {}) {
    this.node = node
    this.pending = [...pending]
    this.calls = calls
    this.actorChoice = actorChoice
  }

  clone() {
    this.calls.push(['clone', this.node, [...this.pending]])
    return new SimultaneousTreeEnvironment({
      node: this.node,
      pending: this.pending,
      calls: this.calls,
      actorChoice: this.actorChoice,
    })
  }

  snapshot() {
    return {
      phase: this.node.startsWith('simul-') ? 3 : (this.node.startsWith('leaf-') ? 10 : 5),
      currentPlayers: [...this.pending],
      playerNames: ['p0', 'p1'],
    }
  }

  async observe(seat) {
    const simultaneous = this.node.startsWith('simul-')
    const value = this.node.endsWith('beam') ? 20 : 1
    return {
      state: {
        mySeat: seat,
        phase: simultaneous ? 3 : (this.node.startsWith('leaf-') ? 10 : 5),
        subphase: 1,
        node: this.node,
        value,
      },
      legalActions: {
        yourTurn: this.pending.includes(`p${seat}`),
        isSimulPhase: simultaneous,
        actions: [],
      },
    }
  }

  async step(seat, actions) {
    const type = actions[0]?.type
    this.calls.push(['step', seat, this.node, type])
    if (this.node === 'root') {
      assert.ok(['static', 'beam'].includes(type))
      this.node = `simul-${type}`
      this.pending = ['p0', 'p1']
      return
    }
    if (this.node.startsWith('simul-')) {
      assert.ok(this.pending.includes(`p${seat}`), 'seat already submitted')
      if (seat === 0) {
        assert.equal(type, 'structure')
        this.actorChoice = type
      } else {
        assert.equal(type, 'opponent')
      }
      this.pending = this.pending.filter((name) => name !== `p${seat}`)
      if (!this.pending.length) {
        this.node = this.node.replace('simul-', 'after-')
        this.pending = ['p0']
      }
      return
    }
    if (this.node.startsWith('after-')) {
      assert.equal(seat, 0)
      assert.equal(type, 'finish')
      this.node = this.node.replace('after-', 'leaf-')
      this.pending = []
      return
    }
    throw new Error(`illegal simultaneous-tree action ${type} at ${this.node}`)
  }
}

const rootCandidates = [
  candidate('static-root', 'cash', 10, 'static'),
  candidate('beam-root', 'growth', 9, 'beam'),
]

function rankOwn(view) {
  if (view.state.node === 'own-static') return [candidate('settle', 'cash', 1)]
  if (view.state.node === 'own-beam') return [candidate('invest', 'growth', 1)]
  throw new Error(`unexpected own node ${view.state.node}`)
}

test('scenario beam overturns a static root through a later own decision', async () => {
  const dispatched = []
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment(),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['beam-01', 'beam-02', 'beam-03', 'beam-04'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: ({ modelId, seed }) => {
      dispatched.push([modelId, seed])
      return [{ type: 'opponent' }]
    },
    scoreOutcome: (after) => after.state.value,
    budget: {
      maxRootCandidates: 2, branchFactor: 2, beamWidth: 2,
      maxOwnDepth: 2, maxTransitions: 64, deadlineMs: 1000,
    },
  })
  assert.equal(result.selected.id, 'beam-root')
  assert.equal(result.metrics.fallbackUsed, false)
  assert.equal(result.metrics.completedRootScenarios, 8)
  assert.equal(dispatched.length, 8)
  assert.deepEqual(new Set(dispatched.map(([, seed]) => seed)),
    new Set(['beam-01', 'beam-02', 'beam-03', 'beam-04']))
})

test('simultaneous and weak-belief roots fail closed without cloning', async () => {
  for (const weakBelief of [belief(), belief({ confidence: 'low' }), belief({
    confidence: 'low', outOfDistribution: true,
  })]) {
    const calls = []
    const simultaneous = weakBelief.believed.confidence === 'medium'
    const result = await selectWithScenarioBeam({
      env: new TreeEnvironment({ calls, hidden: { privateChoice: 'never-read' } }),
      seat: 0,
      view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: simultaneous } },
      belief: weakBelief,
      sampleSeeds: ['weak-01', 'weak-02'],
      rankedCandidates: rootCandidates,
      rankOwnCandidates: rankOwn,
      opponentPolicy: () => { throw new Error('must not dispatch') },
      scoreOutcome: () => 0,
    })
    assert.equal(result.selected.id, 'static-root')
    assert.equal(result.metrics.fallbackUsed, true)
    assert.equal(calls.some(([name]) => name === 'clone'), false)
  }
})

test('deadline exhaustion returns the static legal candidate', async () => {
  let clock = 0
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment(),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['deadline-01', 'deadline-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: () => [{ type: 'opponent' }],
    scoreOutcome: (after) => after.state.value,
    budget: { deadlineMs: 1 },
    now: () => ++clock,
  })
  assert.equal(result.selected.id, 'static-root')
  assert.equal(result.metrics.stopReason, 'deadline')
  assert.equal(result.metrics.fallbackUsed, true)
})

test('a partially submitted future simultaneous boundary fails closed', async () => {
  let dispatches = 0
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment({
      simultaneousNodes: new Set(['opp-static', 'opp-beam']),
      hidden: { opponentEnvelope: 'must-remain-unread' },
    }),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['simul-01', 'simul-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: () => { dispatches += 1; return [{ type: 'opponent' }] },
    scoreOutcome: (after) => after.state.value,
    budget: { maxRootCandidates: 2, maxTransitions: 32, deadlineMs: 1000 },
  })
  assert.equal(result.selected.id, 'beam-root')
  assert.equal(dispatches, 0)
  assert.equal(result.metrics.fallbackUsed, false)
})

test('internally reached fresh simultaneous phases sample without strategy fusion', async () => {
  const calls = []
  const result = await selectWithScenarioBeam({
    env: new SimultaneousTreeEnvironment({ calls }),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['fresh-simul-01', 'fresh-simul-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: (futureView) => {
      if (futureView.legalActions.isSimulPhase) {
        return [
          candidate('public-structure', 'structure', 2, 'structure'),
          candidate('forbidden-retrospective-structure', 'alternate', 1, 'alternate-structure'),
        ]
      }
      return [candidate('finish-turn', 'finish', 1, 'finish')]
    },
    opponentPolicy: () => [{ type: 'opponent' }],
    scoreOutcome: (after) => after.state.value,
    budget: {
      maxRootCandidates: 2, branchFactor: 2, beamWidth: 2,
      maxOwnDepth: 3, maxTransitions: 48, deadlineMs: 1000,
    },
  })
  assert.equal(result.selected.id, 'beam-root')
  assert.equal(result.metrics.completedRootScenarios, 4)
  const simultaneousSteps = calls.filter((entry) => (
    entry[0] === 'step' && String(entry[2]).startsWith('simul-')
  ))
  for (let index = 0; index < simultaneousSteps.length; index += 2) {
    assert.equal(simultaneousSteps[index][1], 0, 'actor commitment must be chosen from public view first')
    assert.equal(simultaneousSteps[index][3], 'structure',
      'all belief samples must share the same public-policy commitment')
    assert.equal(simultaneousSteps[index + 1][1], 1, 'opponent sample resolves only afterward')
  }
})

test('versioned environment-adapter opponents use the official AI transition', async () => {
  const calls = []
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment({ calls }),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: officialBelief(),
    sampleSeeds: ['builtin-01', 'builtin-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: ({ modelId }) => ({
      kind: 'environment-adapter', adapterId: 'official-built-in-v1', modelId,
    }),
    scoreOutcome: (after) => after.state.value,
    budget: { maxRootCandidates: 2, maxTransitions: 32, deadlineMs: 1000 },
  })
  assert.equal(result.selected.id, 'beam-root')
  assert.ok(calls.some(([name]) => name === 'stepBuiltinAI'))
})

test('transition exhaustion returns the static legal candidate', async () => {
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment(),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['budget-01', 'budget-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: () => [{ type: 'opponent' }],
    scoreOutcome: (after) => after.state.value,
    budget: { maxTransitions: 1, deadlineMs: 1000 },
  })
  assert.equal(result.selected.id, 'static-root')
  assert.equal(result.metrics.stopReason, 'transition-budget')
  assert.equal(result.metrics.fallbackUsed, true)
})

test('equal scenario values preserve static root order', async () => {
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment(),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['tie-01', 'tie-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: () => [candidate('stop', 'safe', 1, 'settle')],
    opponentPolicy: () => [{ type: 'opponent' }],
    scoreOutcome: () => 5,
    budget: { maxOwnDepth: 1, maxTransitions: 32, deadlineMs: 1000 },
  })
  assert.equal(result.selected.id, 'static-root')
})

test('opponent-policy failure cannot produce an invented selection', async () => {
  const result = await selectWithScenarioBeam({
    env: new TreeEnvironment(),
    seat: 0,
    view: { state: { mySeat: 0 }, legalActions: { isSimulPhase: false } },
    belief: belief(),
    sampleSeeds: ['failure-01', 'failure-02'],
    rankedCandidates: rootCandidates,
    rankOwnCandidates: rankOwn,
    opponentPolicy: () => { throw new Error('policy unavailable') },
    scoreOutcome: () => 0,
  })
  assert.equal(result.selected.id, 'static-root')
  assert.equal(result.metrics.fallbackUsed, true)
  assert.ok(result.failures.length >= 1)
  assert.ok(rootCandidates.some((candidateItem) => candidateItem.id === result.selected.id))
})

test('frozen official-engine smoke reaches a multi-round actor horizon', () => {
  assert.equal(officialSmoke.schemaVersion, 'fcm.scenario-beam-smoke.v1')
  assert.equal(officialSmoke.metrics.rootCandidates, 2)
  assert.equal(officialSmoke.metrics.beliefSamples, 2)
  assert.equal(officialSmoke.metrics.completedRootScenarios, 4)
  assert.equal(officialSmoke.metrics.maxOwnDepthReached, 4)
  assert.equal(officialSmoke.metrics.stopReason, 'complete')
  assert.equal(officialSmoke.metrics.fallbackUsed, false)
  assert.equal(officialSmoke.failures, 0)
  assert.equal(officialSmoke.privatePayloadPersisted, false)
  assert.equal(officialSmoke.promotionHoldoutOpened, false)
  assert.equal(officialSmoke.strengthPromoted, false)
})
