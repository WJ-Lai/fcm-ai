#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

import { generateCandidates } from '../src/candidates.mjs'
import { evaluateSpatialCandidates } from '../src/spatial-candidate-evaluator.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function consequenceKey(label) {
  return JSON.stringify(label.consequence)
}

function effectStats(labels) {
  const groups = new Map()
  for (const label of labels) {
    const key = consequenceKey(label)
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return {
    candidates: labels.length,
    distinctConsequences: groups.size,
    equivalentGroups: [...groups.values()].filter((count) => count > 1).length,
    meanEvaluationMs: labels.length
      ? labels.reduce((total, label) => total + label.evaluationMs, 0) / labels.length
      : 0,
    maxEvaluationMs: labels.length
      ? Math.max(...labels.map((label) => label.evaluationMs))
      : 0,
  }
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const fixturePath = path.resolve(argument(
  '--fixture',
  'fixtures/base-v1/phase-05-subphase-03-seat-00.json',
))

await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { FCMAdapter } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/fcm-adapter.mjs')).href
)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

globalThis.__fcmLocalTransport = async (url) => new Response(
  JSON.stringify(url.includes('/FCM/data/') ? { latest: true } : { latestUpdate: '0' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const snapshot = structuredClone(fixture.snapshot)
const seat = snapshot.mySeat
const adapter = new FCMAdapter({
  username: snapshot.playerNames[seat],
  latestUpdate: snapshot.latestUpdate,
})
await adapter.loadSnapshot(snapshot, {
  actorName: snapshot.playerNames[seat],
  actorSeat: seat,
})
const store = adapter.store
const reference = adapter.modules.reference
store.gameflow.phase = 5
store.gameflow.subphase = 5
store.gameflow.turnOrder = [seat]
store.gameflow.fullTurnOrder = [seat]
store.context.justBuilt = []
store.context.justOpened = []
store.players[seat].employees.push(
  reference.NEW_BUSINESS_DEVELOPER,
  reference.REGIONAL_MANAGER,
)
snapshot.phase = 5
snapshot.currentPlayers = [snapshot.playerNames[seat]]
snapshot.gameData = adapter.exportBlob(false)

const environment = new OfflineEnvironment({ snapshot })
const original = environment.snapshot()
const started = performance.now()
const buildView = await environment.observe(seat)
const buildCandidates = generateCandidates(buildView, { totalBudget: 20, perIntentBudget: 5 })
const buildLabels = await evaluateSpatialCandidates({
  environment, seat, beforeView: buildView, candidates: buildCandidates,
})
assert.deepEqual(environment.snapshot(), original, 'candidate clones mutated the source environment')

const chosenBuild = buildCandidates.find(
  (candidate) => candidate.actions[0]?.type === 'build_house',
)
assert.ok(chosenBuild, 'synthetic position has no build candidate')
await environment.step(seat, chosenBuild.actions)
const restaurantView = await environment.observe(seat)
assert.equal(restaurantView.state.subphase, 6, 'build batch did not reach restaurant subphase')
const restaurantCandidates = generateCandidates(
  restaurantView,
  { totalBudget: 40, perIntentBudget: 10 },
)
const restaurantLabels = await evaluateSpatialCandidates({
  environment, seat, beforeView: restaurantView, candidates: restaurantCandidates,
})

const build = effectStats(buildLabels)
const restaurant = effectStats(restaurantLabels)
const passed = build.candidates > 0
  && restaurant.candidates > 0
  && restaurant.distinctConsequences > 1
  && restaurant.equivalentGroups > 0
const output = {
  schemaVersion: 'fcm.spatial-consequence-probe.v1',
  passed,
  fixture: path.basename(fixturePath),
  build,
  restaurant,
  totalMs: performance.now() - started,
  guarantees: {
    authoritativeTransitions: true,
    isolatedCandidateClones: true,
    publicDecisionViewOnly: true,
    rawCoordinatesExcludedFromSignatures: true,
    longHorizonBoardBlockingValueIncluded: false,
  },
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!passed) process.exitCode = 2
