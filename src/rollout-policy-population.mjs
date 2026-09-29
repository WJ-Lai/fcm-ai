import assert from 'node:assert/strict'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from './baselines.mjs'
import { deterministicStrategy } from './strategy.mjs'

export const ROLLOUT_POLICY_POPULATION_VERSION = 'fcm.rollout-policy-population.v1'

const POLICY_KINDS = new Set(['external', 'environment-adapter', 'search'])
const POLICY_ROLES = new Set(['target-actor', 'diagnostic-actor', 'opponent'])
const MODES = new Set([
  'replan-every-decision', 'react-every-decision', 'environment-every-decision',
])
const IMPLEMENTATIONS = new Set([
  'deterministic-strategy-v1', 'safe-first-legal-v1', 'seeded-random-legal-v1',
  'official-built-in-v1', 'fcm.rhea-strategy.v1',
])
const PRIVATE_KEYS = new Set([
  'snapshot', 'gamedata', 'movedata', 'hiddenstate', 'trustedworld', 'premovedata',
  'terminalmoney', 'terminalrank', 'terminalmargin',
])

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(new Set(Object.keys(value)), expected, `${label} fields changed`)
}

function stableId(value, label) {
  assert.match(value ?? '', /^[a-z0-9]+(?:[-_:.+][a-z0-9]+)*$/, `${label} must be a stable id`)
}

function rejectPrivate(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectPrivate(item, `${path}[${index}]`))
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!PRIVATE_KEYS.has(key.replaceAll(/[_-]/g, '').toLowerCase()),
      `${path}.${key}: private/outcome field is forbidden`)
    rejectPrivate(nested, `${path}.${key}`)
  }
}

function validateOptions(policy) {
  const options = policy.options
  if (policy.implementation === 'deterministic-strategy-v1') {
    exactKeys(options, new Set(['profile']), `${policy.policyId} options`)
    assert.ok(['balanced', 'growth', 'cash'].includes(options.profile), 'invalid profile')
  } else if (policy.implementation === 'safe-first-legal-v1') {
    exactKeys(options, new Set(), `${policy.policyId} options`)
  } else if (policy.implementation === 'seeded-random-legal-v1') {
    exactKeys(options, new Set(['seedNamespace']), `${policy.policyId} options`)
    stableId(options.seedNamespace, 'seed namespace')
  } else if (policy.implementation === 'official-built-in-v1') {
    exactKeys(options, new Set(['requiresSeatName']), `${policy.policyId} options`)
    assert.equal(options.requiresSeatName, 'FcmAI')
  } else if (policy.implementation === 'fcm.rhea-strategy.v1') {
    exactKeys(options, new Set([
      'profile', 'beliefSampleCount', 'maxRootCandidates', 'branchFactor', 'populationSize',
      'eliteCount', 'generations', 'horizonLength', 'geneCardinality', 'maxEvaluations',
      'maxTransitionsPerScenario', 'deadlineMs', 'fallbackPolicyId',
    ]), `${policy.policyId} options`)
    for (const key of [
      'beliefSampleCount', 'maxRootCandidates', 'branchFactor', 'populationSize', 'eliteCount',
      'generations', 'horizonLength', 'geneCardinality', 'maxEvaluations',
      'maxTransitionsPerScenario', 'deadlineMs',
    ]) assert.ok(Number.isSafeInteger(options[key]) && options[key] > 0,
      `${policy.policyId}.${key} must be positive`)
    assert.ok(options.eliteCount < options.populationSize, 'RHEA elite count must be smaller')
    assert.ok(options.maxEvaluations >= options.beliefSampleCount,
      'RHEA evaluation budget is smaller than one paired sample set')
    stableId(options.fallbackPolicyId, 'fallback policy id')
  }
}

export function validateRolloutPolicyPopulation(manifest) {
  exactKeys(manifest, new Set([
    'schemaVersion', 'populationId', 'ruleset', 'candidateGenerator', 'opponentPopulationId',
    'opponentCalibrationVersion', 'policies', 'targetScenario', 'promotionHoldoutOpened',
  ]), 'rollout population')
  assert.equal(manifest.schemaVersion, ROLLOUT_POLICY_POPULATION_VERSION)
  stableId(manifest.populationId, 'population id')
  assert.equal(manifest.ruleset, 'base-game')
  stableId(manifest.candidateGenerator, 'candidate generator')
  stableId(manifest.opponentPopulationId, 'opponent population id')
  stableId(manifest.opponentCalibrationVersion, 'opponent calibration version')
  assert.equal(manifest.promotionHoldoutOpened, false)
  assert.ok(Array.isArray(manifest.policies) && manifest.policies.length >= 5,
    'rollout population requires target, diagnostic, and opponent policies')
  const ids = new Set()
  for (const policy of manifest.policies) {
    exactKeys(policy, new Set([
      'policyId', 'role', 'kind', 'implementation', 'decisionMode', 'stochastic', 'frozen',
      'options',
    ]), 'policy')
    stableId(policy.policyId, 'policy id')
    assert.ok(!ids.has(policy.policyId), `duplicate policy ${policy.policyId}`)
    ids.add(policy.policyId)
    assert.ok(POLICY_ROLES.has(policy.role), `invalid role ${policy.role}`)
    assert.ok(POLICY_KINDS.has(policy.kind), `invalid kind ${policy.kind}`)
    assert.ok(IMPLEMENTATIONS.has(policy.implementation),
      `unknown implementation ${policy.implementation}`)
    assert.ok(MODES.has(policy.decisionMode), `invalid decision mode ${policy.decisionMode}`)
    assert.equal(typeof policy.stochastic, 'boolean')
    assert.equal(policy.frozen, true, `${policy.policyId} is not frozen`)
    if (policy.role === 'target-actor') {
      assert.equal(policy.decisionMode, 'replan-every-decision',
        'target actor must replan at every decision')
    }
    if (policy.kind === 'environment-adapter') {
      assert.equal(policy.implementation, 'official-built-in-v1')
    }
    if (policy.kind === 'search') assert.equal(policy.role, 'target-actor')
    if (policy.implementation === 'official-built-in-v1') {
      assert.equal(policy.kind, 'environment-adapter')
    } else if (policy.implementation === 'fcm.rhea-strategy.v1') {
      assert.equal(policy.kind, 'search')
    } else {
      assert.equal(policy.kind, 'external')
    }
    validateOptions(policy)
  }
  assert.equal(manifest.policies.filter((policy) => policy.role === 'target-actor').length, 1,
    'exactly one target actor is required')
  const scenario = manifest.targetScenario
  exactKeys(scenario, new Set([
    'scenarioId', 'actorPolicyId', 'opponentSelector', 'opponentModelIds', 'commonRandomStreams',
    'candidateComparison', 'terminalTarget',
  ]), 'target scenario')
  for (const [key, value] of Object.entries(scenario)) {
    if (!['commonRandomStreams', 'opponentModelIds'].includes(key)) {
      stableId(value, `target scenario ${key}`)
    }
  }
  assert.ok(ids.has(scenario.actorPolicyId), 'target scenario actor is missing')
  assert.equal(manifest.policies.find(
    (policy) => policy.policyId === scenario.actorPolicyId)?.role, 'target-actor')
  assert.deepEqual(scenario.commonRandomStreams, ['stream-0', 'stream-1', 'stream-2'],
    'v1 requires exactly three frozen common-random streams')
  assert.equal(new Set(scenario.commonRandomStreams).size, scenario.commonRandomStreams.length)
  assert.deepEqual(scenario.opponentModelIds, [
    'deterministic-balanced-v1', 'safe-first-v1', 'seeded-random-v1',
  ], 'reconstructed roots must exclude the incompatible official environment adapter')
  const target = manifest.policies.find((policy) => policy.role === 'target-actor')
  assert.ok(ids.has(target.options.fallbackPolicyId), 'target fallback policy is missing')
  assert.equal(manifest.policies.find(
    (policy) => policy.policyId === target.options.fallbackPolicyId)?.decisionMode,
  'replan-every-decision', 'target fallback must also replan every decision')
  rejectPrivate(manifest)
  return structuredClone(manifest)
}

export function continuationTargetProvenance(manifest, {
  rootId, candidateId, streamId, sampledOpponentModels,
}) {
  const validated = validateRolloutPolicyPopulation(manifest)
  stableId(rootId, 'root id')
  stableId(candidateId, 'candidate id')
  assert.ok(validated.targetScenario.commonRandomStreams.includes(streamId),
    'stream is outside the frozen scenario')
  assert.ok(Array.isArray(sampledOpponentModels) && sampledOpponentModels.length > 0,
    'sampled opponent models are required')
  sampledOpponentModels.forEach((model) => stableId(model, 'sampled opponent model'))
  assert.ok(sampledOpponentModels.every(
    (model) => validated.targetScenario.opponentModelIds.includes(model),
  ), 'sampled opponent model is outside the frozen compatible subset')
  return {
    rolloutPopulationId: validated.populationId,
    targetScenarioId: validated.targetScenario.scenarioId,
    actorPolicyId: validated.targetScenario.actorPolicyId,
    opponentPopulationId: validated.opponentPopulationId,
    opponentCalibrationVersion: validated.opponentCalibrationVersion,
    rootId,
    candidateId,
    streamId,
    sampledOpponentModels: [...sampledOpponentModels],
  }
}

export async function dispatchRolloutPolicy(policy, {
  legalView, decisionSeed, searchPolicies = {}, environmentSeatName = null, searchContext = {},
}) {
  stableId(decisionSeed, 'decision seed')
  if (policy.kind === 'environment-adapter') {
    assert.equal(environmentSeatName, policy.options.requiresSeatName,
      'official built-in policy requires an actual FcmAI seat')
    return { kind: 'environment-adapter', adapterId: policy.implementation, policyId: policy.policyId }
  }
  if (policy.kind === 'search') {
    const search = searchPolicies[policy.implementation]
    assert.equal(typeof search, 'function', `missing search implementation ${policy.implementation}`)
    const result = await search({ legalView, decisionSeed, options: policy.options, ...searchContext })
    assert.ok(Array.isArray(result?.selected?.actions) && result.selected.actions.length > 0,
      'search policy returned no selected actions')
    return { kind: 'actions', policyId: policy.policyId, actions: result.selected.actions,
      decisionMode: policy.decisionMode }
  }
  let actions
  if (policy.implementation === 'deterministic-strategy-v1') {
    actions = deterministicStrategy(legalView, { profile: policy.options.profile }).selected.actions
  } else if (policy.implementation === 'safe-first-legal-v1') {
    actions = safeFirstLegal(legalView)
  } else if (policy.implementation === 'seeded-random-legal-v1') {
    actions = randomLegal(legalView, seededPolicyRandom(
      `${policy.options.seedNamespace}:${decisionSeed}`,
    ))
  } else {
    throw new Error(`unsupported external rollout policy ${policy.implementation}`)
  }
  return { kind: 'actions', policyId: policy.policyId, actions, decisionMode: policy.decisionMode }
}
