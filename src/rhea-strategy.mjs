import assert from 'node:assert/strict'

import { validateOpponentBelief, dispatchOpponentPolicy, sampleOpponentModel,
  validateOpponentPopulation } from './opponent-population.mjs'
import { scorePublicPositionOutcome } from './official-rollout.mjs'
import { prefilterDiverseCandidates } from './rollout-planner.mjs'
import { selectWithRhea, RHEA_VERSION } from './rhea.mjs'
import { reserveDeadlineHeadroom } from './horizon-agreement.mjs'
import { deterministicStrategy } from './strategy.mjs'

export const RHEA_STRATEGY_VERSION = 'fcm.rhea-strategy.v1'

function pendingSeat(snapshot) {
  const name = snapshot.currentPlayers?.[0]
  return name == null ? -1 : (snapshot.playerNames?.indexOf(name) ?? -1)
}

async function applyOpponent({ env, actor, view, model, seed, depth }) {
  const recommendation = dispatchOpponentPolicy(model, { legalView: view, seed: `${seed}:${depth}` })
  if (recommendation?.kind === 'environment-adapter') {
    await env.stepBuiltinAI(actor, `${seed}:${depth}`)
  } else {
    const actions = Array.isArray(recommendation) ? recommendation : recommendation?.actions
    assert.ok(Array.isArray(actions) && actions.length > 0, 'opponent policy returned no actions')
    await env.step(actor, actions)
  }
}

async function evaluateOfficialGenome({
  sourceEnv,
  seat,
  genome,
  sampleSeed,
  sampledModelsBySeat,
  roots,
  horizonLength,
  branchFactor,
  maxTransitions,
  rankOwnCandidates,
  scoreOutcome,
}) {
  const env = sourceEnv.clone()
  const root = roots[genome[0]]
  assert.ok(root, `genome references missing root ${genome[0]}`)
  await env.step(seat, root.actions)
  let depth = 1
  let transitions = 1
  const trace = [root.id]

  while (true) {
    assert.ok(transitions <= maxTransitions, 'genome transition budget exceeded')
    const snapshot = env.snapshot()
    if (snapshot.phase === 10 || !snapshot.currentPlayers?.length) break
    const actor = pendingSeat(snapshot)
    assert.ok(actor >= 0, 'genome reached unknown pending actor')
    const actorView = await env.observe(actor)

    if (actorView.legalActions?.isSimulPhase) {
      const actorName = snapshot.playerNames?.[seat]
      if (!snapshot.currentPlayers.includes(actorName)) break
      const ownView = actor === seat ? actorView : await env.observe(seat)
      if (depth >= horizonLength) break
      const ranked = prefilterDiverseCandidates(rankOwnCandidates(ownView), { limit: branchFactor })
      assert.ok(ranked.length > 0, 'genome has no simultaneous actor candidates')
      const candidate = ranked[genome[depth] % ranked.length]
      await env.step(seat, candidate.actions)
      transitions += 1
      depth += 1
      trace.push(candidate.id)
      const initialPhase = ownView.state.phase
      while (env.snapshot().phase === initialPhase && env.snapshot().currentPlayers?.length) {
        assert.ok(transitions < maxTransitions, 'genome transition budget exceeded')
        const opponent = pendingSeat(env.snapshot())
        assert.ok(opponent >= 0 && opponent !== seat,
          'simultaneous genome left actor pending')
        await applyOpponent({
          env,
          actor: opponent,
          view: await env.observe(opponent),
          model: sampledModelsBySeat.get(opponent),
          seed: sampleSeed,
          depth,
        })
        transitions += 1
      }
      continue
    }

    if (actor === seat) {
      if (depth >= horizonLength) break
      const ranked = prefilterDiverseCandidates(rankOwnCandidates(actorView), { limit: branchFactor })
      assert.ok(ranked.length > 0, 'genome has no actor candidates')
      const candidate = ranked[genome[depth] % ranked.length]
      await env.step(seat, candidate.actions)
      transitions += 1
      depth += 1
      trace.push(candidate.id)
    } else {
      await applyOpponent({
        env, actor, view: actorView, model: sampledModelsBySeat.get(actor), seed: sampleSeed, depth,
      })
      transitions += 1
    }
  }

  const score = scoreOutcome(await env.observe(seat))
  assert.ok(Number.isFinite(score), 'official genome leaf score must be finite')
  return { score, trace, transitions, depth }
}

export function normalizeRheaOpponentBeliefs({ view, seat, belief = null, beliefBySeat = null }) {
  const playerCount = view?.state?.players?.length
  assert.ok(Number.isInteger(playerCount) && playerCount >= 2,
    'RHEA requires at least two visible players')
  assert.ok(Number.isInteger(seat) && seat >= 0 && seat < playerCount, 'invalid actor seat')
  const opponentSeats = Array.from({ length: playerCount }, (_, index) => index)
    .filter((index) => index !== seat)
  if (beliefBySeat == null) {
    assert.equal(opponentSeats.length, 1,
      'multiplayer RHEA requires beliefBySeat')
    return new Map([[opponentSeats[0], validateOpponentBelief(belief)]])
  }
  assert.ok(beliefBySeat && typeof beliefBySeat === 'object' && !Array.isArray(beliefBySeat),
    'beliefBySeat must be an object')
  assert.equal(belief, null,
    'RHEA must not combine one aggregate belief with per-seat beliefs')
  const suppliedSeats = Object.keys(beliefBySeat).map(Number).sort((left, right) => left - right)
  assert.deepEqual(suppliedSeats, opponentSeats, 'beliefBySeat must cover exactly every opponent')
  return new Map(opponentSeats.map((opponentSeat) => [
    opponentSeat, validateOpponentBelief(beliefBySeat[opponentSeat]),
  ]))
}

export function sampleRheaOpponentModels({ beliefsBySeat, population, sampleSeed }) {
  const validatedPopulation = validateOpponentPopulation(population)
  const models = new Map(validatedPopulation.models.map((model) => [model.modelId, model]))
  assert.ok(beliefsBySeat instanceof Map && beliefsBySeat.size > 0,
    'opponent beliefs map is required')
  return new Map([...beliefsBySeat].map(([opponentSeat, opponentBelief]) => {
    assert.equal(opponentBelief.populationId, validatedPopulation.populationId,
      `seat ${opponentSeat} belief population differs from rollout population`)
    const sampled = sampleOpponentModel(opponentBelief, `${sampleSeed}:seat-${opponentSeat}`)
    const model = models.get(sampled.modelId)
    assert.ok(model, `belief references missing model ${sampled.modelId}`)
    return [opponentSeat, model]
  }))
}

function fallback(staticResult, reason, budget) {
  return {
    schemaVersion: RHEA_VERSION,
    strategyVersion: RHEA_STRATEGY_VERSION,
    selected: staticResult.selected,
    staticSelected: staticResult.selected,
    bestGenome: null,
    bestMeanScore: null,
    scenarios: [],
    failures: [],
    metrics: {
      fallbackUsed: true,
      stopReason: reason,
      completedGenerations: 0,
      uniqueGenomesEvaluated: 0,
      scenarioEvaluations: 0,
      elapsedMs: 0,
      budget,
    },
  }
}

export async function rheaStrategy(view, {
  env,
  belief,
  beliefBySeat = null,
  population,
  sampleSeeds,
  evolutionSeed,
  seat = view.state.mySeat,
  memory = null,
  profile = 'balanced',
  rheaBudget = {},
  deadlineMs = null,
  headroomRatio = 0.2,
  maxRootCandidates = 2,
  branchFactor = 3,
  maxTransitionsPerScenario = 80,
  now,
} = {}) {
  assert.ok(env?.clone, 'cloneable official environment is required')
  const validatedPopulation = validateOpponentPopulation(population)
  const beliefsBySeat = normalizeRheaOpponentBeliefs({ view, seat, belief, beliefBySeat })
  const staticResult = deterministicStrategy(view, { memory, profile })
  if (view.legalActions?.isSimulPhase) return fallback(staticResult, 'root-simultaneous', rheaBudget)
  if ([...beliefsBySeat.values()].some(
    (item) => item.believed.outOfDistribution || item.believed.confidence === 'low',
  )) {
    return fallback(staticResult, 'weak-belief', rheaBudget)
  }
  const roots = prefilterDiverseCandidates(staticResult.ranked, { limit: maxRootCandidates })
  const horizonLength = rheaBudget.horizonLength ?? 3
  const effectiveBudget = deadlineMs == null ? rheaBudget : {
    ...rheaBudget,
    deadlineMs: reserveDeadlineHeadroom(deadlineMs, headroomRatio),
  }
  const result = await selectWithRhea({
    rankedCandidates: roots,
    sampleSeeds,
    evolutionSeed,
    evaluateGenome: async ({ genome, sampleSeed }) => {
      const sampledModelsBySeat = sampleRheaOpponentModels({
        beliefsBySeat, population: validatedPopulation, sampleSeed,
      })
      return evaluateOfficialGenome({
        sourceEnv: env,
        seat,
        genome,
        sampleSeed,
        sampledModelsBySeat,
        roots,
        horizonLength,
        branchFactor,
        maxTransitions: maxTransitionsPerScenario,
        rankOwnCandidates: (futureView) => deterministicStrategy(futureView, {
          memory, profile,
        }).ranked,
        scoreOutcome: (leafView) => scorePublicPositionOutcome(leafView, { seat, profile }),
      })
    },
    budget: effectiveBudget,
    ...(now == null ? {} : { now }),
  })
  return {
    ...result,
    strategyVersion: RHEA_STRATEGY_VERSION,
    staticSelected: staticResult.selected,
    evaluatedRootCandidateIds: [...new Set(result.evaluated
      .map((item) => roots[item.genome[0]]?.id).filter(Boolean))],
    externalDeadlineMs: deadlineMs,
    headroomRatio: deadlineMs == null ? null : headroomRatio,
  }
}
