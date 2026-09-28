import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTION_LABEL_STATUS,
  assertBehaviorCloneEligible,
  classifyReplayDecisionGroup,
  classifyEngineReplayFailure,
  markLabelEngineReplayed,
  markLabelEngineIncompatible,
} from './replay-action-label.mjs'


function group(...eventCodes) {
  return { events: eventCodes.map((eventCode) => ({ eventCode })) }
}


test('irreversible production and payday history are outcome-only', () => {
  for (const eventCode of [10, 23]) {
    const label = classifyReplayDecisionGroup(group(eventCode))
    assert.equal(label.status, ACTION_LABEL_STATUS.OUTCOME_ONLY)
    assert.equal(label.behaviorCloneEligible, false)
    assert.equal(label.valueTargetEligible, true)
    assert.match(label.informationLoss[0].reason, /not |but not/)
  }
})


test('apparently invertible history remains quarantined pending official replay', () => {
  const label = classifyReplayDecisionGroup(group(7, 7, 7))
  assert.equal(label.status, ACTION_LABEL_STATUS.CANDIDATE)
  assert.deepEqual(label.eventCodes, [7])
  assert.equal(label.behaviorCloneEligible, false)
  assert.throws(() => assertBehaviorCloneEligible(label), /exact-engine-replayed/)
})


test('behavior-cloning gate accepts only an explicitly verified exact label', () => {
  const label = {
    status: ACTION_LABEL_STATUS.VERIFIED,
    behaviorCloneEligible: true,
  }
  assert.equal(assertBehaviorCloneEligible(label), label)
})

test('candidate promotion requires a non-empty official replay sequence', () => {
  const candidate = classifyReplayDecisionGroup(group(7))
  const verified = markLabelEngineReplayed(candidate, [{ type: 'hire', employee: 17 }])
  assert.equal(verified.status, ACTION_LABEL_STATUS.VERIFIED)
  assert.equal(verified.behaviorCloneEligible, true)
  assertBehaviorCloneEligible(verified)
  assert.throws(() => markLabelEngineReplayed(candidate, []), /requires replayed actions/)
  assert.throws(() => markLabelEngineReplayed(verified, verified.replayedActions), /only candidate/)
})

test('current-engine incompatible history remains excluded from behavior cloning', () => {
  const candidate = classifyReplayDecisionGroup(group(9))
  const rejected = markLabelEngineIncompatible(candidate, 'legacy duration cannot replay')
  assert.equal(rejected.status, ACTION_LABEL_STATUS.ENGINE_INCOMPATIBLE)
  assert.equal(rejected.behaviorCloneEligible, false)
  assert.throws(() => assertBehaviorCloneEligible(rejected), /exact-engine-replayed/)
})

test('engine replay drift has stable fail-closed classes', () => {
  assert.equal(classifyEngineReplayFailure('槽位 12 超出当前结构范围 (0..11)'), 'legacy-structure-capacity')
  assert.equal(classifyEngineReplayFailure('structure beach differs'), 'legacy-structure-state-drift')
  assert.equal(classifyEngineReplayFailure('广告时长必须在 1..3 之间'), 'legacy-marketing-context-or-duration')
  assert.equal(classifyEngineReplayFailure('cleanup history keeps unavailable resource 3'), 'legacy-cleanup-state-drift')
  assert.equal(classifyEngineReplayFailure('restaurant index 2839 is illegal'), 'legacy-restaurant-placement')
  assert.equal(classifyEngineReplayFailure('new unexplained error'), 'unclassified-engine-replay-failure')
})
