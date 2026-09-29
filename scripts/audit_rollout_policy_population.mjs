#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { rheaStrategy } from '../src/rhea-strategy.mjs'
import {
  continuationOpponentBelief,
  dispatchRolloutPolicy,
  validateRolloutPolicyPopulation,
} from '../src/rollout-policy-population.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const outputPath = path.resolve(process.argv[2]
  ?? 'fixtures/rollout-policy-population-v1/smoke-report.json')
const rootProtocol = JSON.parse(await readFile(
  path.join(repositoryRoot, 'fixtures/counterfactual-root-suite-v2/protocol.json'), 'utf8'))
const rootReport = JSON.parse(await readFile(
  path.join(repositoryRoot, 'fixtures/counterfactual-root-suite-v2/report.json'), 'utf8'))
const manifest = validateRolloutPolicyPopulation(JSON.parse(await readFile(
  path.join(repositoryRoot, 'fixtures/rollout-policy-population-v1/manifest.json'), 'utf8')))
const opponentPopulation = JSON.parse(await readFile(
  path.join(repositoryRoot, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function policy(id) {
  const result = manifest.policies.find((entry) => entry.policyId === id)
  assert.ok(result, `missing policy ${id}`)
  return result
}

function pendingSeat(environment) {
  const snapshot = environment.snapshot()
  return snapshot.playerNames.indexOf(snapshot.currentPlayers?.[0])
}

function continuationMixtureBelief(view, opponentSeat) {
  const prior = buildOpponentBelief(opponentPopulation, {
    observed: {
      publicHistoryDigest: digest(view.state.history ?? []),
      turn: view.state.turn,
      seat: opponentSeat,
      publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: { confidence: 'medium', sampleCount: 1, outOfDistribution: false },
  })
  return continuationOpponentBelief(manifest, prior)
}

async function targetRecommendation({ environment, view, seat, decisionSeed, belief, beliefBySeat }) {
  const target = policy(manifest.targetScenario.actorPolicyId)
  return dispatchRolloutPolicy(target, {
    legalView: view,
    decisionSeed,
    searchContext: { environment, seat, belief, beliefBySeat },
    searchPolicies: {
      'fcm.rhea-strategy.v1': async ({ legalView, decisionSeed: seed, options, environment: env,
        seat: actor, belief: actorBelief, beliefBySeat: actorBeliefsBySeat }) => rheaStrategy(legalView, {
        env,
        belief: actorBelief,
        beliefBySeat: actorBeliefsBySeat,
        population: opponentPopulation,
        sampleSeeds: Array.from(
          { length: options.scenarioSampleCount }, (_, index) => `${seed}:scenario-${index}`),
        evolutionSeed: `${seed}:evolution`,
        seat: actor,
        profile: options.profile,
        maxRootCandidates: options.maxRootCandidates,
        branchFactor: options.branchFactor,
        maxTransitionsPerScenario: options.maxTransitionsPerScenario,
        rheaBudget: {
          populationSize: options.populationSize,
          eliteCount: options.eliteCount,
          generations: options.generations,
          horizonLength: options.horizonLength,
          geneCardinality: options.geneCardinality,
          maxEvaluations: options.maxEvaluations,
          deadlineMs: options.deadlineMs,
        },
      }),
    },
  })
}

async function auditRoot(target) {
  const gameIndex = rootProtocol.collectionGames.findIndex(
    (game) => game.seed === target.seed && game.playerCount === target.playerCount)
  assert.ok(gameIndex >= 0, `missing source game for ${target.slotId}`)
  const names = Array.from(
    { length: target.playerCount }, (_, seat) => `root-suite-collect-${gameIndex}-seat-${seat}`)
  const environment = OfflineEnvironment.fromSeed({
    seed: target.seed,
    playerNames: names,
    gameID: 96000 + gameIndex,
    gameName: 'Counterfactual Root Suite v1',
  })
  let decisionIndex = 0
  while (decisionIndex <= target.decisionIndex) {
    const seat = pendingSeat(environment)
    assert.ok(seat >= 0, `unknown pending seat before ${target.slotId}`)
    const view = await environment.observe(seat)
    const strategy = deterministicStrategy(view)
    if (decisionIndex === target.decisionIndex) {
      assert.equal(seat, target.seat, `seat drift at ${target.slotId}`)
      const candidates = prefilterDiverseCandidates(strategy.ranked, {
        limit: rootReport.candidateLimit,
      })
      const publicProjectionDigest = strategicProjectionDigest({ view })
      const candidateSetDigest = digest(candidates.map((candidate) => ({
        id: candidate.id, intent: candidate.intent, actions: candidate.actions,
      })))
      assert.equal(publicProjectionDigest, target.publicProjectionDigest,
        `public projection drift at ${target.slotId}`)
      assert.equal(candidateSetDigest, target.candidateSetDigest,
        `candidate set drift at ${target.slotId}`)
      assert.deepEqual(candidates.map((candidate) => candidate.id), target.candidateIds,
        `candidate ids drift at ${target.slotId}`)

      const diagnosticResults = []
      for (const policyId of ['deterministic-replan-v1', 'safe-first-reactive-v1']) {
        const recommendation = await dispatchRolloutPolicy(policy(policyId), {
          legalView: view,
          decisionSeed: `${target.slotId}:${policyId}`,
        })
        const branch = environment.clone()
        await branch.step(seat, recommendation.actions)
        diagnosticResults.push({ policyId, actionTypes: recommendation.actions.map(
          (action) => action.type), legal: true })
      }

      const opponentSeats = Array.from({ length: target.playerCount }, (_, index) => index)
        .filter((index) => index !== seat)
      const beliefs = Object.fromEntries(opponentSeats.map((opponentSeat) => [
        opponentSeat, continuationMixtureBelief(view, opponentSeat),
      ]))
      const belief = target.playerCount === 2 ? beliefs[opponentSeats[0]] : null
      const beliefBySeat = target.playerCount > 2 ? beliefs : null
      const branch = environment.clone()
      const first = await targetRecommendation({
        environment: branch,
        view,
        seat,
        decisionSeed: `${target.slotId}:decision-0`,
        belief,
        beliefBySeat,
      })
      await branch.step(seat, first.actions)
      assert.equal(pendingSeat(branch), seat,
        `${target.slotId} does not expose an immediate second actor decision for smoke`)
      const secondView = await branch.observe(seat)
      const second = await targetRecommendation({
        environment: branch,
        view: secondView,
        seat,
        decisionSeed: `${target.slotId}:decision-1`,
        belief,
        beliefBySeat,
      })
      await branch.step(seat, second.actions)
      return {
        slotId: target.slotId,
        playerCount: target.playerCount,
        phaseBucket: target.phaseBucket,
        actionFamily: target.actionFamily,
        diagnosticResults,
        targetPolicyId: manifest.targetScenario.actorPolicyId,
        targetDecisionCalls: 2,
        targetActionTypes: [first.actions, second.actions].map(
          (actions) => actions.map((action) => action.type)),
        targetFallbacks: [first, second].map((result) => ({
          fallbackUsed: result.searchMetrics.fallbackUsed,
          stopReason: result.searchMetrics.stopReason,
        })),
        continuationOpponentModels: [...new Set(Object.values(beliefs).flatMap(
          (item) => item.believed.models.map((model) => model.modelId),
        ))],
        officialAdapterSampled: Object.values(beliefs).some((item) =>
          item.believed.models.some((model) => model.modelId === 'official-built-in-v1')),
      }
    }
    await environment.step(seat, strategy.selected.actions)
    decisionIndex += 1
  }
  throw new Error(`failed to reconstruct ${target.slotId}`)
}

const targets = ['root-07', 'root-21'].map((slotId) => {
  const root = rootReport.roots.find((entry) => entry.slotId === slotId)
  assert.ok(root, `missing smoke root ${slotId}`)
  return root
})
const roots = []
for (const target of targets) roots.push(await auditRoot(target))
const report = {
  schemaVersion: 'fcm.rollout-policy-population-smoke.v1',
  populationId: manifest.populationId,
  continuationDistributionId: manifest.continuationDistributionId,
  rootSuiteVersion: rootReport.suiteVersion,
  roots,
  twoPlayerRoots: roots.filter((root) => root.playerCount === 2).length,
  threePlayerRoots: roots.filter((root) => root.playerCount === 3).length,
  targetDecisionCalls: roots.reduce((total, root) => total + root.targetDecisionCalls, 0),
  diagnosticPolicyCalls: roots.reduce(
    (total, root) => total + root.diagnosticResults.length, 0),
  invalidActions: 0,
  officialAdapterExcludedOnOrdinarySeats: roots.every((root) => !root.officialAdapterSampled),
  terminalTargetsCollected: false,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: false,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ output: path.relative(repositoryRoot, outputPath), ...report }, null, 2)}\n`)
