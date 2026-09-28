import assert from 'node:assert/strict'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from './baselines.mjs'
import { deterministicStrategy } from './strategy.mjs'

export const OPPONENT_POPULATION_VERSION = 'fcm.opponent-population.v1'
export const OPPONENT_BELIEF_VERSION = 'fcm.opponent-belief.v1'

const ARCHETYPES = new Set([
  'deterministic', 'safe-first', 'seeded-random', 'official-built-in',
])
const POLICY_KINDS = new Set(['external', 'environment-adapter'])
const CONFIDENCE = new Set(['low', 'medium', 'high'])
const UPDATERS = new Set(['population-prior-v1', 'public-action-count-v1'])
const MODEL_KEYS = new Set([
  'modelId', 'archetype', 'policyKind', 'policyId', 'priorWeight', 'frozen',
])
const PRIVATE_KEYS = new Set([
  'reservecards', 'chosenrescard', 'premovedata', 'movedata', 'context', 'hiddenstate',
  'enginesnapshot', 'ownpendingchoice',
])
const SENSITIVE_KEY = /(?:token|password|secret|cookie|authorization|credential)/i
const SENSITIVE_TEXT = /(?:bearer\s+[a-z0-9._~-]+|fcm_agent_token|sessionid=)/i

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value)
  for (const key of actual) assert.ok(expected.has(key), `unknown ${label} field ${key}`)
  for (const key of expected) assert.ok(Object.hasOwn(value, key), `${label} is missing ${key}`)
}

function assertStableId(value, label) {
  assert.match(value, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} must be a stable id`)
}

function assertSafe(value, path = '$') {
  if (typeof value === 'string') {
    assert.ok(value.length <= 500, `${path}: text is too long`)
    assert.ok(!SENSITIVE_TEXT.test(value), `${path}: sensitive text is forbidden`)
    return
  }
  if (Array.isArray(value)) {
    assert.ok(value.length <= 4096, `${path}: list is too long`)
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!SENSITIVE_KEY.test(key), `${path}.${key}: sensitive key is forbidden`)
      assert.ok(!PRIVATE_KEYS.has(key.replaceAll(/[_-]/g, '').toLowerCase()),
        `${path}.${key}: private key is forbidden`)
      assertSafe(item, `${path}.${key}`)
    }
  }
}

export function validateOpponentPopulation(raw) {
  exactKeys(raw, new Set(['schemaVersion', 'populationId', 'ruleset', 'models']), 'population')
  assert.equal(raw.schemaVersion, OPPONENT_POPULATION_VERSION, 'unsupported population version')
  assertStableId(raw.populationId, 'populationId')
  assertStableId(raw.ruleset, 'ruleset')
  assert.ok(Array.isArray(raw.models) && raw.models.length >= 4, 'population needs at least four models')
  const ids = new Set()
  const archetypes = new Set()
  let weight = 0
  for (const model of raw.models) {
    exactKeys(model, MODEL_KEYS, 'model')
    assertStableId(model.modelId, 'modelId')
    assert.equal(ids.has(model.modelId), false, `duplicate modelId ${model.modelId}`)
    ids.add(model.modelId)
    assert.ok(ARCHETYPES.has(model.archetype), `unknown archetype ${model.archetype}`)
    archetypes.add(model.archetype)
    assert.ok(POLICY_KINDS.has(model.policyKind), `unknown policy kind ${model.policyKind}`)
    assertStableId(model.policyId, 'policyId')
    assert.ok(Number.isFinite(model.priorWeight) && model.priorWeight >= 0,
      'priorWeight must be non-negative and finite')
    assert.equal(model.frozen, true, 'population policies must be frozen')
    if (model.archetype === 'official-built-in') {
      assert.equal(model.policyKind, 'environment-adapter', 'official AI must use environment adapter')
    } else {
      assert.equal(model.policyKind, 'external', 'external archetypes must use external policies')
    }
    weight += model.priorWeight
  }
  for (const archetype of ARCHETYPES) assert.ok(archetypes.has(archetype), `missing archetype ${archetype}`)
  assert.ok(Math.abs(weight - 1) <= 1e-12, 'prior weights must sum to 1')
  assertSafe(raw)
  return structuredClone(raw)
}

function confidenceFor(probability, outOfDistribution) {
  if (outOfDistribution || probability < 0.4) return 'low'
  if (probability < 0.7) return 'medium'
  return 'high'
}

function constructOpponentBelief(rawPopulation, evidence, update) {
  const population = validateOpponentPopulation(rawPopulation)
  exactKeys(evidence, new Set(['observed', 'derived', 'believed']), 'evidence')
  exactKeys(evidence.observed,
    new Set(['publicHistoryDigest', 'turn', 'seat', 'publicEvents']), 'observed')
  exactKeys(evidence.derived, new Set(['actionFamilyCounts']), 'derived')
  exactKeys(evidence.believed,
    new Set(['confidence', 'sampleCount', 'outOfDistribution']), 'believed')
  assert.match(evidence.observed.publicHistoryDigest, /^sha256:[a-f0-9]{64}$/,
    'invalid public history digest')
  assert.ok(Number.isInteger(evidence.observed.turn) && evidence.observed.turn >= 0, 'invalid public turn')
  assert.ok(Number.isInteger(evidence.observed.seat) && evidence.observed.seat >= 0, 'invalid opponent seat')
  assert.ok(Array.isArray(evidence.observed.publicEvents), 'publicEvents must be an array')
  assert.ok(evidence.observed.publicEvents.length <= 512, 'publicEvents exceeds bounded history')
  assert.ok(CONFIDENCE.has(evidence.believed.confidence), 'invalid belief confidence')
  assert.ok(Number.isInteger(evidence.believed.sampleCount) && evidence.believed.sampleCount >= 1,
    'belief sampleCount must be positive')
  assert.equal(typeof evidence.believed.outOfDistribution, 'boolean', 'invalid OOD marker')
  exactKeys(update,
    new Set(['updaterId', 'sourcePublicHistoryDigest', 'modelScores']), 'belief update')
  assertStableId(update.updaterId, 'belief updaterId')
  assert.ok(UPDATERS.has(update.updaterId), `unknown belief updater ${update.updaterId}`)
  assert.equal(update.sourcePublicHistoryDigest, evidence.observed.publicHistoryDigest,
    'belief update digest must match observed public history')
  const normalizedUpdate = update
  assert.ok(normalizedUpdate.modelScores && typeof normalizedUpdate.modelScores === 'object'
    && !Array.isArray(normalizedUpdate.modelScores),
    'modelScores must be an object')
  const ids = new Set(population.models.map((model) => model.modelId))
  for (const [modelId, score] of Object.entries(normalizedUpdate.modelScores)) {
    assert.ok(ids.has(modelId), `unknown scored model ${modelId}`)
    assert.ok(Number.isFinite(score) && Math.abs(score) <= 50, `invalid score for ${modelId}`)
  }
  assertSafe(evidence)
  const unnormalized = population.models.map((model) => ({
    model,
    weight: model.priorWeight * Math.exp(normalizedUpdate.modelScores[model.modelId] ?? 0),
  }))
  const total = unnormalized.reduce((sum, item) => sum + item.weight, 0)
  assert.ok(Number.isFinite(total) && total > 0, 'belief weights have no finite mass')
  const models = unnormalized.map(({ model, weight }) => {
    const probability = weight / total
    return {
      modelId: model.modelId,
      probability,
      confidence: confidenceFor(probability, evidence.believed.outOfDistribution),
      sampleCount: evidence.believed.sampleCount,
    }
  })
  const belief = {
    schemaVersion: OPPONENT_BELIEF_VERSION,
    populationId: population.populationId,
    observed: structuredClone(evidence.observed),
    derived: structuredClone(evidence.derived),
    believed: {
      confidence: evidence.believed.confidence,
      sampleCount: evidence.believed.sampleCount,
      outOfDistribution: evidence.believed.outOfDistribution,
      updaterId: update.updaterId,
      sourcePublicHistoryDigest: update.sourcePublicHistoryDigest,
      models,
    },
  }
  return validateOpponentBelief(belief)
}

export function buildOpponentBelief(rawPopulation, evidence) {
  return constructOpponentBelief(rawPopulation, evidence, {
    updaterId: 'population-prior-v1',
    sourcePublicHistoryDigest: evidence?.observed?.publicHistoryDigest,
    modelScores: {},
  })
}

export function updateOpponentBelief(rawPopulation, evidence, update) {
  return constructOpponentBelief(rawPopulation, evidence, update)
}

export function validateOpponentBelief(belief) {
  exactKeys(belief,
    new Set(['schemaVersion', 'populationId', 'observed', 'derived', 'believed']), 'belief')
  assert.equal(belief.schemaVersion, OPPONENT_BELIEF_VERSION, 'unsupported belief version')
  assertStableId(belief.populationId, 'belief populationId')
  exactKeys(belief.observed,
    new Set(['publicHistoryDigest', 'turn', 'seat', 'publicEvents']), 'belief observed')
  assert.match(belief.observed.publicHistoryDigest, /^sha256:[a-f0-9]{64}$/,
    'invalid belief public history digest')
  exactKeys(belief.derived, new Set(['actionFamilyCounts']), 'belief derived')
  exactKeys(belief.believed, new Set([
    'confidence', 'sampleCount', 'outOfDistribution', 'updaterId',
    'sourcePublicHistoryDigest', 'models',
  ]), 'belief believed')
  assert.ok(CONFIDENCE.has(belief.believed.confidence), 'invalid aggregate confidence')
  assert.ok(Number.isInteger(belief.believed.sampleCount) && belief.believed.sampleCount >= 1,
    'invalid aggregate sampleCount')
  assert.equal(belief.believed.sourcePublicHistoryDigest, belief.observed.publicHistoryDigest,
    'belief source digest must match observed public history')
  assertStableId(belief.believed.updaterId, 'belief updaterId')
  assert.ok(Array.isArray(belief.believed.models) && belief.believed.models.length > 0,
    'belief contains no models')
  const ids = new Set()
  let total = 0
  for (const model of belief.believed.models) {
    exactKeys(model, new Set(['modelId', 'probability', 'confidence', 'sampleCount']), 'belief model')
    assertStableId(model.modelId, 'belief modelId')
    assert.equal(ids.has(model.modelId), false, `duplicate belief modelId ${model.modelId}`)
    ids.add(model.modelId)
    assert.ok(Number.isFinite(model.probability) && model.probability >= 0 && model.probability <= 1,
      'belief probability must be in [0, 1]')
    assert.ok(CONFIDENCE.has(model.confidence), 'invalid model confidence')
    assert.equal(model.sampleCount, belief.believed.sampleCount,
      'model sampleCount must equal aggregate sampleCount')
    total += model.probability
  }
  assert.ok(Math.abs(total - 1) <= 1e-12, 'belief probabilities must sum to 1')
  assertSafe(belief)
  return belief
}

export function sampleOpponentModel(belief, seed) {
  validateOpponentBelief(belief)
  const models = belief.believed?.models
  assert.ok(Array.isArray(models) && models.length > 0, 'belief contains no models')
  const random = seededPolicyRandom(`${belief.populationId}:${seed}`)
  const target = random()
  let cumulative = 0
  for (const model of models) {
    cumulative += model.probability
    if (target < cumulative) return structuredClone(model)
  }
  return structuredClone(models.at(-1))
}

export function dispatchOpponentPolicy(model, request) {
  exactKeys(request, new Set(['legalView', 'seed']), 'dispatch')
  assertSafe(request)
  assert.ok(model && typeof model === 'object', 'model is required')
  if (model.policyKind === 'environment-adapter') {
    assert.equal(model.policyId, 'official-built-in-v1', 'unknown environment adapter')
    return { kind: 'environment-adapter', adapterId: model.policyId, modelId: model.modelId }
  }
  assert.equal(model.policyKind, 'external', 'unsupported policy kind')
  let actions
  if (model.policyId === 'deterministic-strategy-v1') {
    actions = deterministicStrategy(request.legalView).selected.actions
  } else if (model.policyId === 'safe-first-legal-v1') {
    actions = safeFirstLegal(request.legalView)
  } else if (model.policyId === 'seeded-random-legal-v1') {
    actions = randomLegal(request.legalView, seededPolicyRandom(`${model.modelId}:${request.seed}`))
  } else {
    throw new Error(`unknown external policy ${model.policyId}`)
  }
  return { kind: 'actions', modelId: model.modelId, actions }
}
