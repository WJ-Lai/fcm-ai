#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { safeFirstLegal } from '../src/baselines.mjs'
import { auditInformationSetPolicy } from '../src/information-set-audit.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { rheaStrategy } from '../src/rhea-strategy.mjs'
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2] ?? 'scenario-beam-information-set-v2'
const protocol = JSON.parse(await readFile(
  path.join(root, `fixtures/${fixtureName}/protocol.json`), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const reserveProtocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/information-set-audit-v2/protocol.json'), 'utf8'))
const restructuringProtocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/information-set-audit-v3/protocol.json'), 'utf8'))
const outputPath = path.join(root, `fixtures/${fixtureName}/report.json`)
const planner = protocol.planner ?? 'scenario-beam-v1'
const reportSchemaVersion = protocol.reportSchemaVersion
  ?? 'fcm.scenario-beam-information-set-audit.v2'
const isScenarioBeam = planner === 'scenario-beam-v1'
const plannerLabel = isScenarioBeam ? 'ScenarioBeam' : 'RHEA'
const worldPrefix = isScenarioBeam ? 'beam' : 'rhea'

assert.ok(Number.isSafeInteger(protocol.fixtureEpochMs), 'fixtureEpochMs must be an integer')
Date.now = () => protocol.fixtureEpochMs

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function stableDecisionView(view) {
  // DecisionView may contain engine-backed array subclasses; serialize to the
  // same plain JSON shape exposed over MCP before hashing the information set.
  const stable = JSON.parse(JSON.stringify(view))
  stable.state.history = (stable.state.history ?? []).map((event) => {
    if (!Array.isArray(event) || event.length < 3) return event
    const copy = [...event]
    copy[2] = 0
    return copy
  })
  return stable
}

async function advanceUntil(environment, targetPhase) {
  let transitions = 0
  while (environment.snapshot().phase !== targetPhase) {
    assert.ok(transitions < 100, `fixture did not reach phase ${targetPhase}`)
    const snapshot = environment.snapshot()
    const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
    assert.ok(seat >= 0, 'fixture has no pending actor')
    await environment.step(seat, safeFirstLegal(await environment.observe(seat)))
    transitions += 1
  }
}

async function reserveWorlds() {
  const base = OfflineEnvironment.fromSeed({
    seed: reserveProtocol.seed,
    playerNames: reserveProtocol.players,
    gameID: 9819,
    gameName: `${plannerLabel} reserve audit`,
  })
  await advanceUntil(base, 2)
  const left = base.clone()
  const right = base.clone()
  for (const seat of reserveProtocol.opponentSubmissionOrder) {
    await left.step(seat, [{ type: 'choose_reserve_card', cardValue: 1 }])
    await right.step(seat, [{ type: 'choose_reserve_card', cardValue: 3 }])
  }
  assert.notDeepEqual(left._moves, right._moves, 'reserve hidden envelopes must differ')
  return {
    boundary: 'reserve-card-simultaneous-envelope',
    actorSeat: reserveProtocol.actorSeat,
    opponentSeat: reserveProtocol.opponentSubmissionOrder[0],
    worlds: [
      { worldId: `${worldPrefix}-reserve-world-a`, trustedWorld: left },
      { worldId: `${worldPrefix}-reserve-world-b`, trustedWorld: right },
    ],
  }
}

async function restructuringWorlds() {
  const base = OfflineEnvironment.fromSeed({
    seed: restructuringProtocol.seed,
    playerNames: restructuringProtocol.players,
    gameID: 9820,
    gameName: `${plannerLabel} restructuring audit`,
  })
  await advanceUntil(base, 3)
  const active = base.clone()
  const beach = base.clone()
  for (const seat of restructuringProtocol.opponentSubmissionOrder) {
    const actions = safeFirstLegal(await active.observe(seat))
    assert.equal(actions[0]?.type, 'place_employees', 'fixture lacks active assignment')
    await active.step(seat, actions)
    await beach.step(seat, [{ type: 'end_turn' }])
  }
  for (const seat of restructuringProtocol.opponentSubmissionOrder) {
    assert.notDeepEqual(active._moves[seat][3], beach._moves[seat][3],
      `seat ${seat} restructuring envelope must differ`)
  }
  return {
    boundary: 'restructuring-simultaneous-envelope',
    actorSeat: restructuringProtocol.actorSeat,
    opponentSeat: restructuringProtocol.opponentSubmissionOrder[0],
    worlds: [
      { worldId: `${worldPrefix}-restructuring-world-a`, trustedWorld: active },
      { worldId: `${worldPrefix}-restructuring-world-b`, trustedWorld: beach },
    ],
  }
}

async function auditBoundary(fixture) {
  const first = fixture.worlds[0].trustedWorld
  const firstSnapshot = first.snapshot()
  const firstView = await first.observe(fixture.actorSeat)
  assert.equal(firstView.legalActions.isSimulPhase, true, 'root is not simultaneous')
  assert.equal(firstView.legalActions.yourTurn, true, 'actor is not pending')
  for (const world of fixture.worlds.slice(1)) {
    assert.deepEqual(world.trustedWorld.snapshot(), firstSnapshot,
      'public snapshots differ across hidden worlds')
    assert.deepEqual(await world.trustedWorld.observe(fixture.actorSeat), firstView,
      'DecisionViews differ across hidden worlds')
  }
  const publicObservationDigest = digest(stableDecisionView(firstView))
  const belief = buildOpponentBelief(population, {
    observed: {
      publicHistoryDigest: publicObservationDigest,
      turn: firstView.state.turn,
      seat: fixture.opponentSeat,
      publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: {
      confidence: 'medium',
      sampleCount: protocol.sampleSeeds.length,
      outOfDistribution: false,
    },
  })
  const legalCandidateIds = deterministicStrategy(firstView).ranked.map((item) => item.id)
  assert.ok(legalCandidateIds.length >= 2, 'fixture exposes fewer than two planner candidates')
  let rootFallbackReason = null
  let cloneAttempted = false
  const audit = await auditInformationSetPolicy({
    worlds: fixture.worlds.map((world) => ({
      ...world,
      publicObservationDigest,
      legalCandidateIds,
    })),
    belief,
    sampleSeeds: protocol.sampleSeeds,
    maximumTotalVariation: protocol.maximumTotalVariation,
    recommend: async ({ trustedWorld, seed }) => {
      const view = await trustedWorld.observe(fixture.actorSeat)
      const guardedEnvironment = {
        clone() {
          cloneAttempted = true
          throw new Error(`${planner} must not clone a live simultaneous root`)
        },
      }
      const common = {
        env: guardedEnvironment,
        belief,
        population,
        seat: fixture.actorSeat,
        sampleSeeds: protocol.innerSampleSuffixes.map((suffix) => `${seed}-${suffix}`),
        now: () => 0,
      }
      const result = planner === 'rhea-v1'
        ? await rheaStrategy(view, { ...common, evolutionSeed: `${seed}-evolution` })
        : await scenarioBeamStrategy(view, common)
      rootFallbackReason ??= result.metrics.stopReason
      assert.equal(result.metrics.stopReason, rootFallbackReason,
        'fallback reason changed across paired worlds')
      return { candidateId: result.selected.id }
    },
  })
  assert.equal(rootFallbackReason, 'root-simultaneous')
  assert.equal(cloneAttempted, false)
  return {
    boundary: fixture.boundary,
    engineProtocolVersion: firstView.protocolVersion,
    rulesetHash: firstView.rulesetHash,
    publicViewsEqual: true,
    publicSnapshotsEqual: true,
    hiddenEnvelopesDiffer: true,
    rootFallbackReason,
    cloneAttempted,
    audit,
  }
}

const boundaries = []
for (const fixture of [await reserveWorlds(), await restructuringWorlds()]) {
  boundaries.push(await auditBoundary(fixture))
}
const report = {
  schemaVersion: reportSchemaVersion,
  experimentId: protocol.experimentId,
  planner,
  protocolDigest: digest(protocol),
  boundaries,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of [
  '_moves', 'trustedWorld', 'preMoveData', 'reserveChoice', 'chosenrescard', 'movedata',
]) assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  boundaries: boundaries.map((boundary) => ({
    boundary: boundary.boundary,
    candidates: boundary.audit.legalCandidateIds.length,
    samplesPerWorld: boundary.audit.samplesPerWorld,
    mismatchRate: boundary.audit.perSeedMismatchRate,
    maximumTotalVariation: boundary.audit.maximumPairwiseTotalVariation,
    passed: boundary.audit.passed,
  })),
  promotionHoldoutOpened: report.promotionHoldoutOpened,
}, null, 2)}\n`)
