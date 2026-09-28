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
import { officialRolloutStrategy } from '../src/official-rollout.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocolPath = path.join(root, 'fixtures/information-set-audit-v3/protocol.json')
const populationPath = path.join(root, 'fixtures/opponent-population-v1/manifest.json')
const outputPath = path.join(root, 'fixtures/information-set-audit-v3/report.json')
const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
const population = JSON.parse(await readFile(populationPath, 'utf8'))

// The official UI records wall-clock seconds in display history and sorts
// simultaneous events by them. Freeze the fixture clock so crossing a real
// second cannot reorder an otherwise identical reconstructed information set.
assert.ok(Number.isSafeInteger(protocol.fixtureEpochMs), 'fixtureEpochMs must be an integer')
Date.now = () => protocol.fixtureEpochMs

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function stableDecisionView(view) {
  const stable = JSON.parse(JSON.stringify(view))
  stable.state.history = (stable.state.history ?? []).map((event) => {
    if (!Array.isArray(event) || event.length < 3) return event
    const copy = [...event]
    copy[2] = 0
    return copy
  })
  return stable
}

async function advanceToRestructuring(environment) {
  let transitions = 0
  while (environment.snapshot().phase !== 3) {
    assert.ok(transitions < 100, 'fixture did not reach restructuring')
    const snapshot = environment.snapshot()
    const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
    assert.ok(seat >= 0, 'setup has no pending actor')
    const view = await environment.observe(seat)
    await environment.step(seat, safeFirstLegal(view))
    transitions += 1
  }
}

const base = OfflineEnvironment.fromSeed({
  seed: protocol.seed,
  playerNames: protocol.players,
  gameID: 9803,
  gameName: 'Official restructuring information-set audit',
})
await advanceToRestructuring(base)

const activeWorld = base.clone()
const beachWorld = base.clone()
for (const seat of protocol.opponentSubmissionOrder) {
  const activeActions = safeFirstLegal(await activeWorld.observe(seat))
  assert.equal(activeActions[0]?.type, 'place_employees', 'fixture lacks an active assignment')
  await activeWorld.step(seat, activeActions)
  await beachWorld.step(seat, [{ type: 'end_turn' }])
}

for (const seat of protocol.opponentSubmissionOrder) {
  assert.notDeepEqual(
    activeWorld._moves[seat][3],
    beachWorld._moves[seat][3],
    `seat ${seat} private restructuring payload must differ`,
  )
}
const activeSnapshot = activeWorld.snapshot()
const beachSnapshot = beachWorld.snapshot()
const activeView = await activeWorld.observe(protocol.actorSeat)
const beachView = await beachWorld.observe(protocol.actorSeat)
assert.deepEqual(activeSnapshot, beachSnapshot, 'public snapshots differ across hidden worlds')
assert.deepEqual(activeView, beachView, 'DecisionViews differ across hidden worlds')
assert.equal(activeView.state.phase, 3, 'fixture is not restructuring')
assert.equal(activeView.legalActions.isSimulPhase, true, 'fixture is not simultaneous')
assert.equal(activeView.legalActions.yourTurn, true, 'actor is not pending')

const publicObservationDigest = digest(stableDecisionView(activeView))
const belief = buildOpponentBelief(population, {
  observed: {
    publicHistoryDigest: publicObservationDigest,
    turn: activeView.state.turn,
    seat: protocol.opponentSubmissionOrder[0],
    publicEvents: [],
  },
  derived: { actionFamilyCounts: {} },
  believed: {
    confidence: 'medium',
    sampleCount: protocol.sampleSeeds.length,
    outOfDistribution: false,
  },
})

const preview = await officialRolloutStrategy(activeView, {
  env: activeWorld,
  seat: protocol.actorSeat,
  rolloutBudget: protocol.rolloutBudget,
})
const legalCandidateIds = preview.evaluated.map((item) => item.candidate.id)
assert.ok(legalCandidateIds.length >= 2, 'fixture exposes fewer than two rollout candidates')

const audit = await auditInformationSetPolicy({
  worlds: [
    {
      worldId: 'restructuring-world-a',
      publicObservationDigest,
      legalCandidateIds,
      trustedWorld: activeWorld,
    },
    {
      worldId: 'restructuring-world-b',
      publicObservationDigest,
      legalCandidateIds,
      trustedWorld: beachWorld,
    },
  ],
  belief,
  sampleSeeds: protocol.sampleSeeds,
  maximumTotalVariation: protocol.maximumTotalVariation,
  recommend: async ({ trustedWorld }) => {
    const view = await trustedWorld.observe(protocol.actorSeat)
    const result = await officialRolloutStrategy(view, {
      env: trustedWorld,
      seat: protocol.actorSeat,
      rolloutBudget: protocol.rolloutBudget,
    })
    return { candidateId: result.selected.id }
  },
})

const report = {
  schemaVersion: 'fcm.official-information-set-audit.v3',
  experimentId: protocol.experimentId,
  boundary: 'restructuring-simultaneous-envelope',
  protocolDigest: digest(protocol),
  engineProtocolVersion: activeView.protocolVersion,
  rulesetHash: activeView.rulesetHash,
  publicViewsEqual: true,
  publicSnapshotsEqual: true,
  hiddenEnvelopesDiffer: true,
  audit,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of [
  '_moves', 'trustedWorld', 'preMoveData', 'place_employees', 'beach', 'employees',
]) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  rulesetHash: report.rulesetHash,
  candidates: legalCandidateIds.length,
  samplesPerWorld: audit.samplesPerWorld,
  maximumPairwiseTotalVariation: audit.maximumPairwiseTotalVariation,
  perSeedMismatchRate: audit.perSeedMismatchRate,
  passed: audit.passed,
}, null, 2)}\n`)
