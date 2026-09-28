#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Silence legacy official-AI diagnostics so stdout remains machine-readable.
console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { safeFirstLegal } from '../src/baselines.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/scenario-beam-v1/protocol.json'), 'utf8',
))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8',
))
const outputPath = path.join(root, 'fixtures/scenario-beam-v1/report.json')
Date.now = () => protocol.fixtureEpochMs

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

const env = OfflineEnvironment.fromSeed({
  seed: protocol.seed,
  playerNames: protocol.players,
  gameID: 9810,
  gameName: 'Scenario beam official smoke',
})
let target = null
for (let commands = 0; commands < 100; commands += 1) {
  const snapshot = env.snapshot()
  assert.notEqual(snapshot.phase, 10, 'game ended before the smoke decision')
  const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
  assert.ok(seat >= 0, 'unknown pending player')
  if (seat === protocol.opponentSeat) {
    await env.stepBuiltinAI(seat, `setup:${commands}`)
    continue
  }
  const view = await env.observe(protocol.actorSeat)
  const ranked = deterministicStrategy(view).ranked
  if (view.state.phase === 5 && !view.legalActions.isSimulPhase && ranked.length > 1) {
    target = view
    break
  }
  await env.step(protocol.actorSeat, safeFirstLegal(view))
}
assert.ok(target, 'no working-day smoke decision found')

const publicHistoryDigest = digest(target)
const belief = buildOpponentBelief(population, {
  observed: {
    publicHistoryDigest,
    turn: target.state.turn,
    seat: protocol.opponentSeat,
    publicEvents: [],
  },
  derived: { actionFamilyCounts: {} },
  believed: {
    confidence: 'high',
    sampleCount: protocol.sampleSeeds.length,
    outOfDistribution: false,
  },
})
belief.believed.models = belief.believed.models.map((model) => ({
  ...model,
  probability: model.modelId === 'official-built-in-v1' ? 1 : 0,
  confidence: model.modelId === 'official-built-in-v1' ? 'high' : 'low',
}))

const planned = await scenarioBeamStrategy(target, {
  env,
  belief,
  population,
  sampleSeeds: protocol.sampleSeeds,
  beamBudget: protocol.budget,
})
assert.equal(planned.metrics.fallbackUsed, false, 'official smoke unexpectedly fell back')
assert.equal(planned.failures.length, 0, 'official smoke had failed scenarios')
assert.equal(planned.metrics.maxOwnDepthReached, protocol.budget.maxOwnDepth,
  'official smoke did not reach the declared actor depth')

const report = {
  schemaVersion: 'fcm.scenario-beam-smoke.v1',
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  rulesetHash: target.rulesetHash,
  engineProtocolVersion: target.protocolVersion,
  target: {
    phase: target.state.phase,
    subphase: target.state.subphase,
    turn: target.state.turn,
  },
  staticCandidateId: planned.staticSelected.id,
  selectedCandidateId: planned.selected.id,
  changedStatic: planned.selected.id !== planned.staticSelected.id,
  evaluated: planned.evaluated.map((item) => ({
    candidateId: item.candidate.id,
    meanScore: item.meanScore,
    scenarioCount: item.scenarios.length,
    traceDepths: item.scenarios.map((scenario) => scenario.trace.length),
  })),
  metrics: {
    offeredCandidates: planned.metrics.offeredCandidates,
    rootCandidates: planned.metrics.rootCandidates,
    beliefSamples: planned.metrics.beliefSamples,
    completedRootScenarios: planned.metrics.completedRootScenarios,
    officialTransitions: planned.metrics.officialTransitions,
    leafEvaluations: planned.metrics.leafEvaluations,
    maxOwnDepthReached: planned.metrics.maxOwnDepthReached,
    stopReason: planned.metrics.stopReason,
    fallbackUsed: planned.metrics.fallbackUsed,
  },
  failures: planned.failures.length,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: false,
  strengthPromoted: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, ...report.metrics }, null, 2)}\n`)
