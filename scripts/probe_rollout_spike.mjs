#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { safeFirstLegal } from '../src/baselines.mjs'
import { selectWithOfficialRollouts } from '../src/rollout-planner.mjs'
import {
  continueOwnPublicTurn,
  officialRolloutStrategy,
  scorePublicPositionOutcome,
} from '../src/official-rollout.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback))
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be positive`)
  return value
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const targetCases = positiveInteger('--cases', '12')
const maxCommands = positiveInteger('--max-commands', '500')
const maxSeeds = positiveInteger('--max-seeds', '8')

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const cases = []
let invalidSelections = 0
for (let seed = 0; seed < maxSeeds && cases.length < targetCases; seed += 1) {
  const names = ['rollout-spike-0', 'rollout-spike-1']
  const env = OfflineEnvironment.fromSeed({
    seed: `rollout-spike:${seed}`,
    playerNames: names,
    gameID: seed + 1,
  })
  let commands = 0
  let seedCases = 0
  while (env.snapshot().phase !== 10 && commands < maxCommands && cases.length < targetCases) {
    const snapshot = env.snapshot()
    const seat = names.indexOf(snapshot.currentPlayers[0])
    if (seat < 0) throw new Error(`unknown pending player ${snapshot.currentPlayers[0]}`)
    const view = await env.observe(seat)
    const staticResult = deterministicStrategy(view)
    // Opening placement and turn-order choices are useful smoke tests but too
    // shallow for a strategy gate. Count only working-day tactical choices.
    const eligible = view.state.phase === 5 &&
      !view.legalActions.isSimulPhase && staticResult.ranked.length > 1 &&
      seedCases < Math.max(3, Math.ceil(targetCases / 2))
    if (eligible) {
      const boundedStarted = performance.now()
      const bounded = await officialRolloutStrategy(view, {
        env,
        seat,
        rolloutBudget: { maxCandidates: 6, maxTransitions: 24, deadlineMs: 3000 },
      })
      const boundedMs = performance.now() - boundedStarted
      const oracleStarted = performance.now()
      const oracle = await selectWithOfficialRollouts({
        env,
        seat,
        view,
        rankedCandidates: staticResult.ranked,
        scoreOutcome: (after) => scorePublicPositionOutcome(after, { seat }),
        continueRollout: continueOwnPublicTurn,
        budget: {
          maxCandidates: staticResult.ranked.length,
          maxTransitions: Math.max(24, staticResult.ranked.length * 8),
          deadlineMs: 30000,
        },
      })
      const oracleMs = performance.now() - oracleStarted
      const staticRank = new Map(staticResult.ranked.map((candidate, index) => [candidate.id, index]))
      const oracleRanking = [...oracle.evaluated].sort((left, right) => (
        right.outcomeScore - left.outcomeScore ||
        staticRank.get(left.candidate.id) - staticRank.get(right.candidate.id)
      ))
      let selectedLegal = true
      try {
        await env.clone().step(seat, bounded.selected.actions)
      } catch {
        selectedLegal = false
        invalidSelections += 1
      }
      cases.push({
        seed,
        command: commands,
        seat,
        phase: view.state.phase,
        subphase: view.state.subphase,
        candidateCount: staticResult.ranked.length,
        staticCandidate: staticResult.selected.id,
        boundedCandidate: bounded.selected.id,
        oracleCandidate: oracle.selected.id,
        oracleTop3: oracleRanking.slice(0, 3).map((item) => item.candidate.id),
        top1: bounded.selected.id === oracle.selected.id,
        top3: oracleRanking.slice(0, 3).some((item) => item.candidate.id === bounded.selected.id),
        selectedLegal,
        boundedMs,
        oracleMs,
        boundedMetrics: bounded.metrics,
        oracleMetrics: oracle.metrics,
      })
      seedCases += 1
    }
    await env.step(seat, safeFirstLegal(view))
    commands += 1
  }
}

const top1 = cases.filter((item) => item.top1).length
const top3 = cases.filter((item) => item.top3).length
const boundedLatencies = cases.map((item) => item.boundedMs)
const distinctSeeds = new Set(cases.map((item) => item.seed)).size
const tacticalSubphases = new Set(cases.map((item) => item.subphase)).size
const gates = {
  enoughCases: cases.length >= targetCases,
  distinctSeeds: distinctSeeds >= 2,
  tacticalSubphases: tacticalSubphases >= 3,
  zeroIllegal: invalidSelections === 0,
  top1: cases.length > 0 && top1 / cases.length >= 0.8,
  top3: cases.length > 0 && top3 / cases.length >= 0.95,
  p95Latency: percentile(boundedLatencies, 0.95) <= 3000,
}
const output = {
  schemaVersion: 'fcm.rollout-spike.v1',
  requestedCases: targetCases,
  collectedCases: cases.length,
  summary: {
    invalidSelections,
    distinctSeeds,
    tacticalSubphases,
    top1,
    top1Rate: cases.length ? top1 / cases.length : 0,
    top3,
    top3Rate: cases.length ? top3 / cases.length : 0,
    boundedP50Ms: percentile(boundedLatencies, 0.5),
    boundedP95Ms: percentile(boundedLatencies, 0.95),
    gates,
    promoted: Object.values(gates).every(Boolean),
  },
  cases,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!output.summary.promoted) process.exitCode = 2
