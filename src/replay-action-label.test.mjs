import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTION_LABEL_STATUS,
  assertBehaviorCloneEligible,
  classifyReplayDecisionGroup,
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
