import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildOpponentBelief } from './opponent-population.mjs'
import { auditInformationSetPolicy } from './information-set-audit.mjs'

const population = JSON.parse(await readFile(
  new URL('../fixtures/opponent-population-v1/manifest.json', import.meta.url),
))
const officialReport = JSON.parse(await readFile(
  new URL('../fixtures/information-set-audit-v2/report.json', import.meta.url),
))
const restructuringReport = JSON.parse(await readFile(
  new URL('../fixtures/information-set-audit-v3/report.json', import.meta.url),
))
const belief = buildOpponentBelief(population, {
  observed: {
    publicHistoryDigest: `sha256:${'a'.repeat(64)}`,
    turn: 4,
    seat: 1,
    publicEvents: [],
  },
  derived: { actionFamilyCounts: {} },
  believed: { confidence: 'medium', sampleCount: 128, outOfDistribution: false },
})
const worlds = [
  {
    worldId: 'hidden-a',
    publicObservationDigest: `sha256:${'b'.repeat(64)}`,
    legalCandidateIds: ['hire', 'market'],
    trustedWorld: { reserveChoice: 1, secretMarker: 'alpha-private' },
  },
  {
    worldId: 'hidden-b',
    publicObservationDigest: `sha256:${'b'.repeat(64)}`,
    legalCandidateIds: ['hire', 'market'],
    trustedWorld: { reserveChoice: 3, secretMarker: 'beta-private' },
  },
]
const sampleSeeds = Array.from({ length: 128 }, (_, index) => `audit-${index}`)

test('public-only sampled policy has identical candidate distributions across hidden worlds', async () => {
  const report = await auditInformationSetPolicy({
    worlds,
    belief,
    sampleSeeds,
    maximumTotalVariation: 0,
    recommend: async ({ sampledOpponentModelId }) => ({
      candidateId: sampledOpponentModelId === 'seeded-random-v1' ? 'market' : 'hire',
    }),
  })
  assert.equal(report.passed, true)
  assert.equal(report.maximumPairwiseTotalVariation, 0)
  assert.equal(report.perSeedMismatchRate, 0)
  assert.equal(report.samplesPerWorld, 128)
  assert.equal(JSON.stringify(report).includes('private'), false)
})

test('audit detects strategy fusion caused by private-world access', async () => {
  const report = await auditInformationSetPolicy({
    worlds,
    belief,
    sampleSeeds,
    maximumTotalVariation: 0,
    recommend: async ({ trustedWorld }) => ({
      candidateId: trustedWorld.reserveChoice === 1 ? 'hire' : 'market',
    }),
  })
  assert.equal(report.passed, false)
  assert.equal(report.maximumPairwiseTotalVariation, 1)
  assert.equal(report.perSeedMismatchRate, 1)
})

test('audit fails closed on unequal information sets and illegal recommendations', async () => {
  await assert.rejects(auditInformationSetPolicy({
    worlds: [worlds[0], { ...worlds[1], legalCandidateIds: ['hire', 'train'] }],
    belief,
    sampleSeeds,
    maximumTotalVariation: 0,
    recommend: async () => ({ candidateId: 'hire' }),
  }), /legal candidates differ/)
  await assert.rejects(auditInformationSetPolicy({
    worlds,
    belief,
    sampleSeeds,
    maximumTotalVariation: 0,
    recommend: async () => ({ candidateId: 'invented' }),
  }), /illegal candidate/)
})

test('official reserve-card hidden worlds preserve the frozen rollout distribution', () => {
  assert.equal(officialReport.schemaVersion, 'fcm.official-information-set-audit.v2')
  assert.equal(officialReport.boundary, 'reserve-card-simultaneous-envelope')
  assert.equal(officialReport.publicViewsEqual, true)
  assert.equal(officialReport.publicSnapshotsEqual, true)
  assert.equal(officialReport.audit.maximumPairwiseTotalVariation, 0)
  assert.equal(officialReport.audit.perSeedMismatchRate, 0)
  assert.equal(officialReport.audit.passed, true)
  assert.equal(officialReport.privatePayloadPersisted, false)
  assert.equal(officialReport.promotionHoldoutOpened, false)
})

test('official restructuring hidden worlds preserve the frozen rollout distribution', () => {
  assert.equal(restructuringReport.schemaVersion, 'fcm.official-information-set-audit.v3')
  assert.equal(restructuringReport.boundary, 'restructuring-simultaneous-envelope')
  assert.equal(restructuringReport.publicViewsEqual, true)
  assert.equal(restructuringReport.publicSnapshotsEqual, true)
  assert.equal(restructuringReport.hiddenEnvelopesDiffer, true)
  assert.equal(restructuringReport.audit.maximumPairwiseTotalVariation, 0)
  assert.equal(restructuringReport.audit.perSeedMismatchRate, 0)
  assert.equal(restructuringReport.audit.passed, true)
  assert.equal(restructuringReport.privatePayloadPersisted, false)
  assert.equal(restructuringReport.promotionHoldoutOpened, false)
})
