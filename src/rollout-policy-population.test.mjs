import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  continuationTargetProvenance,
  dispatchRolloutPolicy,
  validateRolloutPolicyPopulation,
} from './rollout-policy-population.mjs'

const manifestUrl = new URL(
  '../fixtures/rollout-policy-population-v1/manifest.json', import.meta.url)

async function manifest() {
  return JSON.parse(await readFile(manifestUrl, 'utf8'))
}

function legalView() {
  return {
    state: { phase: 2, subphase: 1, turn: 1, mySeat: 0, players: [{ index: 0 }] },
    legalActions: {
      yourTurn: true,
      isSimulPhase: false,
      actions: [{ type: 'choose_reserve_card', values: [1, 2, 3] }],
    },
  }
}

test('manifest freezes a repeatedly replanning target and three common-random streams', async () => {
  const value = validateRolloutPolicyPopulation(await manifest())
  const target = value.policies.find((policy) => policy.role === 'target-actor')
  assert.equal(target.policyId, 'rhea-replan-v1')
  assert.equal(target.decisionMode, 'replan-every-decision')
  assert.deepEqual(value.targetScenario.commonRandomStreams, ['stream-0', 'stream-1', 'stream-2'])
  assert.ok(!value.targetScenario.opponentModelIds.includes('official-built-in-v1'))
})

test('manifest rejects hidden state, mutable target, missing fallback, and unbounded option drift', async () => {
  const value = await manifest()
  const hidden = structuredClone(value)
  hidden.policies[0].options.hiddenState = { opponent: 1 }
  assert.throws(() => validateRolloutPolicyPopulation(hidden), /fields changed|private/)
  const reactive = structuredClone(value)
  reactive.policies.find((policy) => policy.role === 'target-actor').decisionMode = 'react-every-decision'
  assert.throws(() => validateRolloutPolicyPopulation(reactive), /must replan/)
  const missing = structuredClone(value)
  missing.policies.find((policy) => policy.role === 'target-actor').options.fallbackPolicyId = 'absent-v1'
  assert.throws(() => validateRolloutPolicyPopulation(missing), /fallback policy is missing/)
  const drift = structuredClone(value)
  drift.policies.find((policy) => policy.role === 'target-actor').options.maxDepth = 999
  assert.throws(() => validateRolloutPolicyPopulation(drift), /fields changed/)
})

test('official adapter cannot run on a renamed ordinary seat', async () => {
  const value = validateRolloutPolicyPopulation(await manifest())
  const policy = value.policies.find((entry) => entry.policyId === 'official-built-in-v1')
  await assert.rejects(() => dispatchRolloutPolicy(policy, {
    legalView: legalView(), decisionSeed: 'seed-0', environmentSeatName: 'ordinary-agent',
  }), /requires an actual FcmAI seat/)
  const result = await dispatchRolloutPolicy(policy, {
    legalView: legalView(), decisionSeed: 'seed-0', environmentSeatName: 'FcmAI',
  })
  assert.equal(result.kind, 'environment-adapter')
})

test('search dispatch invokes the injected replanner on every call and preserves its legal action', async () => {
  const value = validateRolloutPolicyPopulation(await manifest())
  const policy = value.policies.find((entry) => entry.policyId === 'rhea-replan-v1')
  const calls = []
  const searchPolicies = {
    'fcm.rhea-strategy.v1': async (request) => {
      calls.push(request.decisionSeed)
      return { selected: { actions: [{ type: 'choose_reserve_card', cardValue: 2 }] } }
    },
  }
  const first = await dispatchRolloutPolicy(policy, {
    legalView: legalView(), decisionSeed: 'turn-1', searchPolicies,
  })
  const second = await dispatchRolloutPolicy(policy, {
    legalView: legalView(), decisionSeed: 'turn-2', searchPolicies,
  })
  assert.deepEqual(calls, ['turn-1', 'turn-2'])
  assert.equal(first.decisionMode, 'replan-every-decision')
  assert.deepEqual(first.actions, second.actions)
})

test('target provenance prevents mixing streams, actors, or opponent calibration', async () => {
  const value = await manifest()
  const provenance = continuationTargetProvenance(value, {
    rootId: 'root-01',
    candidateId: 'candidate-01',
    streamId: 'stream-1',
    sampledOpponentModels: ['safe-first-v1', 'seeded-random-v1'],
  })
  assert.equal(provenance.actorPolicyId, 'rhea-replan-v1')
  assert.equal(provenance.opponentCalibrationVersion, 'fcm.opponent-calibration.v5')
  assert.throws(() => continuationTargetProvenance(value, {
    rootId: 'root-01', candidateId: 'candidate-01', streamId: 'post-hoc-stream',
    sampledOpponentModels: ['safe-first-v1'],
  }), /outside the frozen scenario/)
  assert.throws(() => continuationTargetProvenance(value, {
    rootId: 'root-01', candidateId: 'candidate-01', streamId: 'stream-0',
    sampledOpponentModels: ['official-built-in-v1'],
  }), /outside the frozen compatible subset/)
})
