#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { safeFirstLegal } from '../src/baselines.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { rheaStrategy } from '../src/rhea-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocol = JSON.parse(await readFile(path.join(root, 'fixtures/rhea-budget-v3/protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(root, 'fixtures/rhea-budget-v3/report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

const env = OfflineEnvironment.fromSeed({
  seed: protocol.seed, playerNames: protocol.players, gameID: 9882, gameName: 'RHEA budget',
})
let target = null
for (let commands = 0; commands < 100; commands += 1) {
  const snapshot = env.snapshot()
  const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
  assert.ok(seat >= 0, 'unknown setup actor')
  if (seat === protocol.opponentSeat) await env.stepBuiltinAI(seat, `budget-setup:${commands}`)
  else {
    const view = await env.observe(protocol.actorSeat)
    if (view.state.phase === 5 && !view.legalActions.isSimulPhase
      && deterministicStrategy(view).ranked.length > 1) {
      target = view
      break
    }
    await env.step(protocol.actorSeat, safeFirstLegal(view))
  }
}
assert.ok(target, 'budget target not found')
const belief = buildOpponentBelief(population, {
  observed: { publicHistoryDigest: digest(target), turn: target.state.turn,
    seat: protocol.opponentSeat, publicEvents: [] },
  derived: { actionFamilyCounts: {} },
  believed: { confidence: 'high', sampleCount: 2, outOfDistribution: false },
})
belief.believed.models = belief.believed.models.map((model) => ({
  ...model,
  probability: model.modelId === 'official-built-in-v1' ? 1 : 0,
  confidence: model.modelId === 'official-built-in-v1' ? 'high' : 'low',
}))

const rows = []
for (const externalDeadlineMs of protocol.externalDeadlinesMs) {
  for (let replicate = 0; replicate < protocol.replicates; replicate += 1) {
    const result = await rheaStrategy(target, {
      env, belief, population, sampleSeeds: protocol.sampleSeeds,
      evolutionSeed: protocol.evolutionSeed,
      rheaBudget: protocol.budget,
      deadlineMs: externalDeadlineMs,
      headroomRatio: protocol.headroomRatio,
    })
    rows.push({
      externalDeadlineMs,
      replicate,
      internalDeadlineMs: result.metrics.budget.deadlineMs,
      elapsedMs: result.metrics.elapsedMs,
      fallbackUsed: result.metrics.fallbackUsed,
      stopReason: result.metrics.stopReason,
      completedGenerations: result.metrics.completedGenerations,
      scenarioEvaluations: result.metrics.scenarioEvaluations,
      uniqueGenomesEvaluated: result.metrics.uniqueGenomesEvaluated,
      staticCandidateId: result.staticSelected.id,
      selectedCandidateId: result.selected.id,
      evaluatedRootCandidateIds: result.evaluatedRootCandidateIds,
      bestGenome: result.bestGenome,
      bestMeanScore: result.bestMeanScore,
    })
  }
}
function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}
const summary = Object.fromEntries(protocol.externalDeadlinesMs.map((deadline) => {
  const samples = rows.filter((row) => row.externalDeadlineMs === deadline)
  const p95Ms = percentile95(samples.map((row) => row.elapsedMs))
  return [String(deadline), {
    replicates: samples.length,
    p95Ms,
    maximumMs: Math.max(...samples.map((row) => row.elapsedMs)),
    completed: samples.filter((row) => !row.fallbackUsed).length,
    withinBudget: p95Ms <= deadline,
  }]
}))
const report = {
  schemaVersion: 'fcm.rhea-budget-baseline.v3',
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  rows,
  summary,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
  strengthPromoted: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, summary, rows }, null, 2)}\n`)
