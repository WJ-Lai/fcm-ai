import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildOpponentBelief,
  dispatchOpponentPolicy,
  sampleOpponentModel,
  updateOpponentBelief,
  validateOpponentBelief,
  validateOpponentPopulation,
} from './opponent-population.mjs'

const manifest = JSON.parse(await readFile(
  new URL('../fixtures/opponent-population-v1/manifest.json', import.meta.url),
))
const audit = JSON.parse(await readFile(
  new URL('../fixtures/opponent-population-v1/audit.json', import.meta.url),
))

function evidence(overrides = {}) {
  return {
    observed: {
      publicHistoryDigest: 'sha256:' + 'a'.repeat(64),
      turn: 3,
      seat: 1,
      publicEvents: [{ type: 'hire', employee: 17 }],
    },
    derived: { actionFamilyCounts: { hire: 1 } },
    believed: { confidence: 'low', sampleCount: 1, outOfDistribution: false },
    ...overrides,
  }
}

test('population freezes unique normalized models spanning all required archetypes', () => {
  const population = validateOpponentPopulation(manifest)
  assert.deepEqual(population.models.map((model) => model.archetype), [
    'deterministic', 'safe-first', 'seeded-random', 'official-built-in',
  ])
  assert.equal(population.models.reduce((sum, model) => sum + model.priorWeight, 0), 1)
})

test('belief keeps provenance explicit and records model id, confidence, and sample count', () => {
  const belief = updateOpponentBelief(manifest, evidence(), {
    updaterId: 'public-action-count-v1',
    sourcePublicHistoryDigest: evidence().observed.publicHistoryDigest,
    modelScores: { 'safe-first-v1': 2 },
  })
  assert.equal(belief.populationId, manifest.populationId)
  assert.equal(belief.observed.publicHistoryDigest, evidence().observed.publicHistoryDigest)
  assert.deepEqual(belief.derived.actionFamilyCounts, { hire: 1 })
  assert.equal(belief.believed.models[0].modelId, 'deterministic-balanced-v1')
  for (const model of belief.believed.models) {
    assert.ok(['low', 'medium', 'high'].includes(model.confidence))
    assert.equal(model.sampleCount, 1)
  }
  assert.ok(belief.believed.models.find((model) => model.modelId === 'safe-first-v1').probability > 0.25)
  assert.equal(validateOpponentBelief(belief).schemaVersion, 'fcm.opponent-belief.v1')
})

test('seeded sampling is reproducible and ignores unprovided private engine mutations', () => {
  const first = buildOpponentBelief(manifest, evidence())
  const mutatedOutsideContract = {
    ...evidence(),
    hiddenState: { reserveCards: [3], moveData: { secret: true } },
  }
  assert.throws(() => buildOpponentBelief(manifest, mutatedOutsideContract), /unknown evidence field/)
  assert.equal(sampleOpponentModel(first, 'same-seed').modelId,
    sampleOpponentModel(first, 'same-seed').modelId)
})

test('sampler respects zero-probability models and frozen audit stays within tolerance', () => {
  const belief = buildOpponentBelief(manifest, evidence())
  belief.believed.models = belief.believed.models.map((model, index) => ({
    ...model, probability: index === 0 ? 1 : 0,
  }))
  for (let index = 0; index < 100; index += 1) {
    assert.equal(sampleOpponentModel(belief, `zero-${index}`).modelId,
      'deterministic-balanced-v1')
  }
  assert.equal(audit.promotionHoldoutOpened, false)
  assert.equal(audit.publicUpdateChangedDistribution, true)
  assert.ok(audit.maximumAbsoluteSamplingError < 0.02)
  assert.match(audit.interpretation, /not yet empirically calibrated/)
})

test('only an explicit public-history update changes the belief', () => {
  const before = buildOpponentBelief(manifest, evidence())
  const changedEvidence = evidence({
    observed: {
      ...evidence().observed,
      publicHistoryDigest: 'sha256:' + 'b'.repeat(64),
      publicEvents: [{ type: 'hire', employee: 17 }, { type: 'marketing', good: 4 }],
    },
    derived: { actionFamilyCounts: { hire: 1, marketing: 1 } },
  })
  const after = updateOpponentBelief(manifest, changedEvidence, {
    updaterId: 'public-action-count-v1',
    sourcePublicHistoryDigest: changedEvidence.observed.publicHistoryDigest,
    modelScores: { 'deterministic-balanced-v1': 1 },
  })
  assert.notDeepEqual(before, after)
  assert.throws(() => updateOpponentBelief(manifest, changedEvidence, {
    updaterId: 'public-action-count-v1',
    sourcePublicHistoryDigest: evidence().observed.publicHistoryDigest,
    modelScores: {},
  }), /digest must match/)
})

test('validator fails closed on malformed or credential-bearing population data', () => {
  assert.throws(() => validateOpponentPopulation({
    ...manifest,
    models: manifest.models.map((model) => ({ ...model, priorWeight: 0.1 })),
  }), /sum to 1/)
  assert.throws(() => validateOpponentPopulation({
    ...manifest,
    models: [...manifest.models, { ...manifest.models[0] }],
  }), /duplicate modelId/)
  assert.throws(() => buildOpponentBelief(manifest, evidence({
    observed: { ...evidence().observed, authorizationToken: 'Bearer secret' },
  })), /sensitive|unknown observed field/)
  const belief = buildOpponentBelief(manifest, evidence())
  belief.believed.models[0].probability = 0.9
  assert.throws(() => sampleOpponentModel(belief, 'x'), /probabilities must sum to 1/)
})

test('external policies use the legal view while official AI delegates to the environment', () => {
  const official = manifest.models.find((model) => model.policyKind === 'environment-adapter')
  assert.deepEqual(dispatchOpponentPolicy(official, { legalView: { marker: 'safe' }, seed: 'x' }), {
    kind: 'environment-adapter', adapterId: 'official-built-in-v1', modelId: official.modelId,
  })

  const safe = manifest.models.find((model) => model.modelId === 'safe-first-v1')
  const legalView = {
    state: { phase: 4, subphase: null, mySeat: 1, players: [{}, {}] },
    legalActions: { actions: [{ type: 'choose_turn_order', positions: [1, 0] }] },
  }
  assert.deepEqual(dispatchOpponentPolicy(safe, { legalView, seed: 'x' }), {
    kind: 'actions', modelId: safe.modelId,
    actions: [{ type: 'choose_turn_order', turnOrderPosition: 1 }],
  })
  assert.throws(() => dispatchOpponentPolicy(safe, {
    legalView, seed: 'x', engineSnapshot: { hiddenState: true },
  }), /unknown dispatch field/)
})
