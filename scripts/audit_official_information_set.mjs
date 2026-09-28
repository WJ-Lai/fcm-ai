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
const protocolPath = path.join(root, 'fixtures/information-set-audit-v2/protocol.json')
const populationPath = path.join(root, 'fixtures/opponent-population-v1/manifest.json')
const outputPath = path.join(root, 'fixtures/information-set-audit-v2/report.json')
const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
const population = JSON.parse(await readFile(populationPath, 'utf8'))

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

const base = OfflineEnvironment.fromSeed({
  seed: protocol.seed,
  playerNames: protocol.players,
  gameID: 9802,
  gameName: 'Official information-set audit',
})
while (base.snapshot().phase !== 2) {
  const snapshot = base.snapshot()
  const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
  assert.ok(seat >= 0, 'setup has no pending actor')
  await base.step(seat, safeFirstLegal(await base.observe(seat)))
}

const left = base.clone()
const right = base.clone()
for (const seat of protocol.opponentSubmissionOrder) {
  await left.step(seat, [{ type: 'choose_reserve_card', cardValue: 1 }])
  await right.step(seat, [{ type: 'choose_reserve_card', cardValue: 3 }])
}
assert.notDeepEqual(left._moves, right._moves, 'trusted hidden envelopes must differ')
const leftSnapshot = left.snapshot()
const rightSnapshot = right.snapshot()
const leftView = await left.observe(protocol.actorSeat)
const rightView = await right.observe(protocol.actorSeat)
assert.deepEqual(leftSnapshot, rightSnapshot, 'public snapshots differ across hidden worlds')
assert.deepEqual(leftView, rightView, 'DecisionViews differ across hidden worlds')
assert.equal(leftView.legalActions.isSimulPhase, true, 'fixture is not simultaneous')
assert.equal(leftView.legalActions.yourTurn, true, 'actor is not pending')

// Engine history stores wall-clock seconds for display. They are public but not
// decision state, so normalize them before producing a reproducible information-set id.
const publicObservationDigest = digest(stableDecisionView(leftView))
const belief = buildOpponentBelief(population, {
  observed: {
    publicHistoryDigest: publicObservationDigest,
    turn: leftView.state.turn,
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

const preview = await officialRolloutStrategy(leftView, {
  env: left,
  seat: protocol.actorSeat,
  rolloutBudget: protocol.rolloutBudget,
})
const legalCandidateIds = preview.evaluated.map((item) => item.candidate.id)
assert.ok(legalCandidateIds.length >= 2, 'fixture exposes fewer than two rollout candidates')
const audit = await auditInformationSetPolicy({
  worlds: [
    {
      worldId: 'official-world-a',
      publicObservationDigest,
      legalCandidateIds,
      trustedWorld: left,
    },
    {
      worldId: 'official-world-b',
      publicObservationDigest,
      legalCandidateIds,
      trustedWorld: right,
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
  schemaVersion: 'fcm.official-information-set-audit.v2',
  experimentId: 15,
  boundary: 'reserve-card-simultaneous-envelope',
  protocolDigest: digest(protocol),
  engineProtocolVersion: leftView.protocolVersion,
  rulesetHash: leftView.rulesetHash,
  publicViewsEqual: true,
  publicSnapshotsEqual: true,
  hiddenEnvelopesDiffer: true,
  audit,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'reserveChoice', 'preMoveData']) {
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
