#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

const discover = process.argv.includes('--discover')
const root = path.resolve(new URL('..', import.meta.url).pathname)
const serverRoot = path.resolve(argument('--server', path.join(root, '../obg-server-fcm-agent-rebased')))
const manifestPath = path.resolve(argument('--manifest', path.join(root, 'fixtures/rollout-v1/manifest.json')))
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
assert.equal(manifest.schemaVersion, 'fcm.fixed-rollout-suite.v1')
assert.ok(manifest.cases.length >= 12 && manifest.cases.length <= 20, 'suite must have 12-20 cases')
assert.equal(new Set(manifest.cases.map((item) => item.id)).size, manifest.cases.length, 'duplicate case id')

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

async function sourceEnvironment(item) {
  if (item.source.type === 'engine-fixture') {
    const record = JSON.parse(await readFile(path.join(root, item.source.path), 'utf8'))
    return {
      env: new OfflineEnvironment({ snapshot: record.snapshot }),
      seat: record.expected.actorSeat,
      seedKey: 'engine-fixture-v1',
    }
  }
  assert.equal(item.source.type, 'seeded-replay')
  const names = ['rollout-spike-0', 'rollout-spike-1']
  const env = OfflineEnvironment.fromSeed({
    seed: `rollout-spike:${item.source.seed}`,
    playerNames: names,
    gameID: item.source.seed + 1,
  })
  for (let command = 0; command < item.source.command; command += 1) {
    const snapshot = env.snapshot()
    const seat = names.indexOf(snapshot.currentPlayers[0])
    assert.ok(seat >= 0, 'seeded replay has unknown pending player')
    await env.step(seat, safeFirstLegal(await env.observe(seat)))
  }
  const snapshot = env.snapshot()
  const seat = names.indexOf(snapshot.currentPlayers[0])
  assert.ok(seat >= 0, 'seeded target has unknown pending player')
  return {
    env,
    seat,
    seedKey: `rollout-spike:${item.source.seed}`,
  }
}

const cases = []
let invalidSelections = 0
for (const item of manifest.cases) {
  const { env, seat, seedKey } = await sourceEnvironment(item)
  const view = await env.observe(seat)
  const sourceDigest = strategicProjectionDigest({ view })
  assert.equal(view.state.phase, 5, `${item.id} is not a working-day case`)
  assert.equal(view.legalActions.isSimulPhase, false, `${item.id} is simultaneous`)
  const staticResult = deterministicStrategy(view)
  assert.ok(staticResult.ranked.length > 1, `${item.id} lacks a tactical choice`)
  const boundedStarted = performance.now()
  const bounded = await officialRolloutStrategy(view, {
    env,
    seat,
    rolloutBudget: { maxCandidates: 6, maxTransitions: 24, deadlineMs: 3000 },
  })
  const boundedMs = performance.now() - boundedStarted
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
  const staticRank = new Map(staticResult.ranked.map((candidate, index) => [candidate.id, index]))
  const oracleRanking = [...oracle.evaluated].sort((left, right) => (
    right.outcomeScore - left.outcomeScore ||
    staticRank.get(left.candidate.id) - staticRank.get(right.candidate.id)
  ))
  const oracleTop3 = oracleRanking.slice(0, 3).map((entry) => entry.candidate.id)
  let selectedLegal = true
  try {
    await env.clone().step(seat, bounded.selected.actions)
  } catch {
    selectedLegal = false
    invalidSelections += 1
  }
  const discovered = {
    sourceDigest,
    seedKey,
    seat,
    phase: view.state.phase,
    subphase: view.state.subphase,
    candidateCount: staticResult.ranked.length,
    oracleCandidate: oracle.selected.id,
    oracleTop3,
  }
  if (!discover) assert.deepEqual(item.expected, discovered, `${item.id} frozen oracle drift`)
  cases.push({
    id: item.id,
    discovered,
    boundedCandidate: bounded.selected.id,
    top1: bounded.selected.id === oracle.selected.id,
    top3: oracleTop3.includes(bounded.selected.id),
    selectedLegal,
    boundedMs,
    boundedMetrics: bounded.metrics,
  })
}

const seedKeys = new Set(cases.map((item) => item.discovered.seedKey))
const generatedSeeds = new Set(cases.map((item) => item.discovered.seedKey)
  .filter((key) => key.startsWith('rollout-spike:')))
const subphases = new Set(cases.map((item) => item.discovered.subphase))
const top1 = cases.filter((item) => item.top1).length
const top3 = cases.filter((item) => item.top3).length
const p95 = percentile(cases.map((item) => item.boundedMs), 0.95)
const gates = {
  caseCount: cases.length >= 12 && cases.length <= 20,
  distinctSources: seedKeys.size >= 3,
  generatedSeeds: generatedSeeds.size >= 2,
  workingSubphases: subphases.size >= 3,
  zeroIllegal: invalidSelections === 0,
  top1: top1 / cases.length >= 0.8,
  top3: top3 / cases.length >= 0.95,
  p95Latency: p95 <= 3000,
  frozenOracle: !discover,
}
const output = {
  schemaVersion: 'fcm.fixed-rollout-audit.v1',
  evaluatorVersion: manifest.evaluatorVersion,
  mode: discover ? 'discover' : 'audit',
  summary: {
    cases: cases.length,
    distinctSources: seedKeys.size,
    generatedSeeds: generatedSeeds.size,
    workingSubphases: [...subphases].sort((a, b) => a - b),
    invalidSelections,
    top1,
    top1Rate: top1 / cases.length,
    top3,
    top3Rate: top3 / cases.length,
    boundedP95Ms: p95,
    gates,
    promoted: Object.values(gates).every(Boolean),
  },
  cases,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!discover && !output.summary.promoted) process.exitCode = 2
