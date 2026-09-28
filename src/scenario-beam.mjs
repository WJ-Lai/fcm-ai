import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { sampleOpponentModel, validateOpponentBelief } from './opponent-population.mjs'
import { prefilterDiverseCandidates } from './rollout-planner.mjs'

export const SCENARIO_BEAM_VERSION = 'fcm.scenario-beam.v1'

const DEFAULT_BUDGET = Object.freeze({
  maxRootCandidates: 4,
  branchFactor: 3,
  beamWidth: 4,
  maxOwnDepth: 2,
  maxTransitions: 96,
  deadlineMs: 1000,
})

function normalizeBudget(raw = {}) {
  const budget = { ...DEFAULT_BUDGET, ...raw }
  for (const key of [
    'maxRootCandidates', 'branchFactor', 'beamWidth', 'maxOwnDepth', 'maxTransitions',
  ]) {
    assert.ok(Number.isSafeInteger(budget[key]) && budget[key] > 0,
      `${key} must be a positive integer`)
  }
  assert.ok(Number.isFinite(budget.deadlineMs) && budget.deadlineMs > 0,
    'deadlineMs must be positive')
  return budget
}

function validateCandidate(candidate, label) {
  assert.ok(candidate && typeof candidate === 'object', `${label} must be an object`)
  assert.match(candidate.id, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} has invalid id`)
  assert.ok(Array.isArray(candidate.actions) && candidate.actions.length > 0,
    `${label} has no actions`)
  return candidate
}

function fallbackResult({ rankedCandidates, limits, started, now, reason, failures = [] }) {
  return {
    schemaVersion: SCENARIO_BEAM_VERSION,
    selected: rankedCandidates[0],
    evaluated: [],
    failures,
    metrics: {
      offeredCandidates: rankedCandidates.length,
      rootCandidates: 0,
      beliefSamples: 0,
      completedRootScenarios: 0,
      officialTransitions: 0,
      leafEvaluations: 0,
      maxOwnDepthReached: 0,
      elapsedMs: Math.max(0, now() - started),
      stopReason: reason,
      fallbackUsed: true,
      budget: limits,
    },
  }
}

function pendingSeat(snapshot) {
  const name = snapshot.currentPlayers?.[0]
  if (name == null) return -1
  return snapshot.playerNames?.indexOf(name) ?? -1
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export async function selectWithScenarioBeam({
  env,
  seat,
  view,
  belief,
  sampleSeeds,
  rankedCandidates,
  rankOwnCandidates,
  opponentPolicy,
  scoreOutcome,
  budget = {},
  now = () => performance.now(),
}) {
  assert.ok(env?.clone, 'cloneable official environment is required')
  assert.ok(Number.isInteger(seat) && seat >= 0, 'seat must be non-negative')
  assert.ok(Array.isArray(rankedCandidates) && rankedCandidates.length > 0,
    'at least one ranked candidate is required')
  rankedCandidates.forEach((candidate, index) => validateCandidate(candidate, `root[${index}]`))
  assert.equal(typeof rankOwnCandidates, 'function', 'rankOwnCandidates is required')
  assert.equal(typeof opponentPolicy, 'function', 'opponentPolicy is required')
  assert.equal(typeof scoreOutcome, 'function', 'scoreOutcome is required')
  validateOpponentBelief(belief)
  assert.ok(Array.isArray(sampleSeeds) && sampleSeeds.length >= 2,
    'at least two belief sample seeds are required')
  assert.equal(new Set(sampleSeeds).size, sampleSeeds.length, 'belief sample seeds must be unique')
  sampleSeeds.forEach((seed) => assert.match(seed, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/,
    'belief sample seed must be a stable id'))

  const limits = normalizeBudget(budget)
  const started = now()
  const deadline = started + limits.deadlineMs
  if (view.legalActions?.isSimulPhase) {
    return fallbackResult({ rankedCandidates, limits, started, now, reason: 'root-simultaneous' })
  }
  if (belief.believed.outOfDistribution || belief.believed.confidence === 'low') {
    return fallbackResult({ rankedCandidates, limits, started, now, reason: 'weak-belief' })
  }

  const roots = prefilterDiverseCandidates(rankedCandidates, {
    limit: limits.maxRootCandidates,
  })
  const evaluations = new Map(roots.map((root) => [root.id, []]))
  const failures = []
  let officialTransitions = 0
  let leafEvaluations = 0
  let completedRootScenarios = 0
  let maxOwnDepthReached = 0
  let stopReason = 'complete'

  function checkBudget() {
    if (now() >= deadline) {
      stopReason = 'deadline'
      return false
    }
    if (officialTransitions >= limits.maxTransitions) {
      stopReason = 'transition-budget'
      return false
    }
    return true
  }

  async function leafScore(nodeEnv) {
    const actorView = await nodeEnv.observe(seat)
    const score = scoreOutcome(actorView)
    assert.ok(Number.isFinite(score), 'leaf score must be finite')
    leafEvaluations += 1
    return score
  }

  async function applyOpponent(nodeEnv, actor, actorView, sampledModel, sampleSeed, depth) {
    const recommendation = await opponentPolicy({
      modelId: sampledModel.modelId,
      view: actorView,
      seat: actor,
      seed: sampleSeed,
      depth,
    })
    if (recommendation?.kind === 'environment-adapter') {
      assert.equal(typeof nodeEnv.stepBuiltinAI, 'function',
        'environment adapter requires stepBuiltinAI')
      await nodeEnv.stepBuiltinAI(actor, `${sampleSeed}:${depth}`)
    } else {
      const actions = Array.isArray(recommendation)
        ? recommendation
        : recommendation?.actions
      assert.ok(Array.isArray(actions) && actions.length > 0,
        'opponent policy returned no actions')
      await nodeEnv.step(actor, actions)
    }
    officialTransitions += 1
  }

  async function advanceToOwnDecision(node, sampledModel, sampleSeed) {
    while (node.depth < limits.maxOwnDepth) {
      if (!checkBudget()) return { kind: 'budget' }
      const snapshot = node.env.snapshot()
      if (snapshot.phase === 10 || !(snapshot.currentPlayers?.length)) {
        return { kind: 'leaf', score: await leafScore(node.env), node }
      }
      const actor = pendingSeat(snapshot)
      assert.ok(actor >= 0, 'scenario has an unknown pending player')
      const actorView = await node.env.observe(actor)
      if (actorView.legalActions?.isSimulPhase) {
        const actorName = snapshot.playerNames?.[seat]
        if (snapshot.currentPlayers.includes(actorName)) {
          const ownView = actor === seat ? actorView : await node.env.observe(seat)
          assert.equal(ownView.legalActions?.yourTurn, true,
            'internally reached simultaneous actor is not pending')
          return { kind: 'simultaneous', view: ownView, node }
        }
        // A partially submitted simultaneous phase cannot be reconstructed
        // from public state. This is unreachable for trajectories derived
        // from a non-simultaneous root, but fail closed if an adapter creates it.
        return { kind: 'leaf', score: await leafScore(node.env), node, simultaneous: true }
      }
      if (actor === seat) return { kind: 'own', view: actorView, node }
      await applyOpponent(node.env, actor, actorView, sampledModel, sampleSeed, node.depth)
    }
    return { kind: 'leaf', score: await leafScore(node.env), node }
  }

  async function expandOwnBoundary(boundary, sampledModel, sampleSeed) {
    const ranked = rankOwnCandidates(boundary.view)
    assert.ok(Array.isArray(ranked) && ranked.length > 0,
      'own candidate policy returned no candidates')
    // At a simultaneous information set, taking a per-scenario max over
    // multiple actor branches would let the actor retrospectively choose its
    // hidden commitment after seeing the sampled opponent envelope. Freeze one
    // public-policy action there; branching resumes only after public outcomes
    // diverge. Sequential own decisions may use the full branch factor.
    const branches = boundary.kind === 'simultaneous'
      ? [ranked[0]]
      : prefilterDiverseCandidates(ranked, { limit: limits.branchFactor })
    const expanded = []
    for (const candidate of branches) {
      validateCandidate(candidate, 'future candidate')
      if (!checkBudget()) break
      const child = boundary.node.env.clone()
      await child.step(seat, candidate.actions)
      officialTransitions += 1

      if (boundary.kind === 'simultaneous') {
        const initialPhase = boundary.view.state.phase
        while (child.snapshot().phase === initialPhase && child.snapshot().currentPlayers?.length) {
          if (!checkBudget()) break
          const snapshot = child.snapshot()
          const opponentSeat = pendingSeat(snapshot)
          assert.ok(opponentSeat >= 0 && opponentSeat !== seat,
            'actor remained pending after simultaneous submission')
          const opponentView = await child.observe(opponentSeat)
          assert.equal(opponentView.legalActions?.isSimulPhase, true,
            'simultaneous resolver exposed a non-simultaneous opponent')
          await applyOpponent(
            child,
            opponentSeat,
            opponentView,
            sampledModel,
            sampleSeed,
            boundary.node.depth,
          )
        }
      }

      if (stopReason !== 'complete') break
      const depth = boundary.node.depth + 1
      maxOwnDepthReached = Math.max(maxOwnDepthReached, depth)
      const provisional = await leafScore(child)
      expanded.push({
        env: child,
        depth,
        trace: [...boundary.node.trace, candidate.id],
        provisional,
      })
    }
    return expanded
  }

  for (const root of roots) {
    for (const sampleSeed of sampleSeeds) {
      if (!checkBudget()) break
      const sampledModel = sampleOpponentModel(belief, sampleSeed)
      try {
        const rootEnv = env.clone()
        await rootEnv.step(seat, root.actions)
        officialTransitions += 1
        let frontier = [{ env: rootEnv, depth: 1, trace: [root.id] }]
        let leaves = []

        while (frontier.length) {
          const expanded = []
          for (const node of frontier) {
            const boundary = await advanceToOwnDecision(node, sampledModel, sampleSeed)
            if (boundary.kind === 'budget') break
            if (boundary.kind === 'leaf') {
              leaves.push({ node: boundary.node, score: boundary.score })
              continue
            }
            expanded.push(...await expandOwnBoundary(boundary, sampledModel, sampleSeed))
          }
          if (stopReason !== 'complete') break
          if (!expanded.length) break
          expanded.sort((left, right) => right.provisional - left.provisional
            || left.trace.join(':').localeCompare(right.trace.join(':')))
          frontier = expanded.slice(0, limits.beamWidth).map(({ provisional, ...node }) => node)
        }

        if (stopReason !== 'complete') break
        if (!leaves.length) {
          leaves = await Promise.all(frontier.map(async (node) => ({
            node,
            score: await leafScore(node.env),
          })))
        }
        assert.ok(leaves.length > 0, 'scenario produced no leaf')
        const best = leaves.reduce((winner, leaf) => (
          !winner || leaf.score > winner.score ? leaf : winner
        ), null)
        evaluations.get(root.id).push({
          sampleSeed,
          modelId: sampledModel.modelId,
          score: best.score,
          trace: best.node.trace,
        })
        completedRootScenarios += 1
      } catch (error) {
        failures.push({
          rootId: root.id,
          sampleSeed,
          code: error.code ?? 'ERROR',
          message: error.message,
        })
      }
    }
    if (stopReason !== 'complete') break
  }

  const allComplete = stopReason === 'complete' && roots.every((root) => (
    evaluations.get(root.id).length === sampleSeeds.length
  ))
  const evaluated = allComplete ? roots.map((root) => {
    const scenarios = evaluations.get(root.id)
    return { candidate: root, meanScore: average(scenarios.map((item) => item.score)), scenarios }
  }) : []
  const best = evaluated.reduce((winner, item) => (
    !winner || item.meanScore > winner.meanScore ? item : winner
  ), null)
  const fallbackUsed = !best

  return {
    schemaVersion: SCENARIO_BEAM_VERSION,
    selected: fallbackUsed ? rankedCandidates[0] : best.candidate,
    evaluated,
    failures,
    metrics: {
      offeredCandidates: rankedCandidates.length,
      rootCandidates: roots.length,
      beliefSamples: sampleSeeds.length,
      completedRootScenarios,
      officialTransitions,
      leafEvaluations,
      maxOwnDepthReached,
      elapsedMs: Math.max(0, now() - started),
      stopReason: allComplete ? 'complete' : (stopReason === 'complete' ? 'scenario-failure' : stopReason),
      fallbackUsed,
      budget: limits,
    },
  }
}
