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
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/scenario-beam-horizon-v3/protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const development = JSON.parse(await readFile(
  path.join(root, 'fixtures/scenario-beam-development-v2/report.json'), 'utf8'))
const outputPath = path.join(root, 'fixtures/scenario-beam-horizon-v3/report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

const env = OfflineEnvironment.fromSeed({
  seed: protocol.seed,
  playerNames: protocol.players,
  gameID: 9833,
  gameName: 'ScenarioBeam horizon diagnostic',
})
let target = null
for (let commands = 0; commands < 100; commands += 1) {
  const snapshot = env.snapshot()
  assert.notEqual(snapshot.phase, 10, 'game ended before target decision')
  const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
  assert.ok(seat >= 0, 'unknown pending player')
  if (seat === protocol.opponentSeat) {
    await env.stepBuiltinAI(seat, `horizon-setup:${commands}`)
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
assert.ok(target, 'target working-day decision not found')

const belief = buildOpponentBelief(population, {
  observed: {
    publicHistoryDigest: digest(target),
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

const rows = []
for (const maxOwnDepth of protocol.depths) {
  const result = await scenarioBeamStrategy(target, {
    env,
    seat: protocol.actorSeat,
    belief,
    population,
    sampleSeeds: protocol.sampleSeeds,
    beamBudget: { ...protocol.budget, maxOwnDepth },
  })
  rows.push({
    maxOwnDepth,
    selectedCandidateId: result.selected.id,
    staticCandidateId: result.staticSelected.id,
    changedStatic: result.selected.id !== result.staticSelected.id,
    stopReason: result.metrics.stopReason,
    fallbackUsed: result.metrics.fallbackUsed,
    elapsedMs: result.metrics.elapsedMs,
    officialTransitions: result.metrics.officialTransitions,
    leafEvaluations: result.metrics.leafEvaluations,
    evaluated: result.evaluated.map((item) => ({
      candidateId: item.candidate.id,
      meanScore: item.meanScore,
      scenarioCount: item.scenarios.length,
      traces: item.scenarios.map((scenario) => scenario.trace),
    })),
  })
}

const staticSummary = development.summary.static
const skipSummary = development.summary['beam-3000ms']
const terminalReference = {
  staticCandidateId: development.games.find((game) => game.arm === 'beam-3000ms')
    .beam.metrics[0].staticCandidateId,
  skipCandidateId: development.games.find((game) => game.arm === 'beam-3000ms')
    .beam.metrics[0].selectedCandidateId,
  staticFirstPlaces: staticSummary.firstPlaces,
  skipFirstPlaces: skipSummary.firstPlaces,
  gamesPerArm: staticSummary.games,
}
const report = {
  schemaVersion: 'fcm.scenario-beam-horizon-diagnostic.v3',
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  target: { turn: target.state.turn, phase: target.state.phase, subphase: target.state.subphase },
  terminalReference,
  rows,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  terminalReference,
  rows: rows.map((row) => ({
    depth: row.maxOwnDepth,
    selected: row.selectedCandidateId,
    scores: Object.fromEntries(row.evaluated.map((item) => [item.candidateId, item.meanScore])),
    transitions: row.officialTransitions,
    elapsedMs: row.elapsedMs,
  })),
}, null, 2)}\n`)
