import assert from 'node:assert/strict'


export const ACTION_LABEL_STATUS = Object.freeze({
  CANDIDATE: 'candidate-pending-engine-replay',
  OUTCOME_ONLY: 'outcome-only',
  VERIFIED: 'exact-engine-replayed',
})

const NON_INVERTIBLE_EVENTS = new Map([
  [10, 'production history stores producer ids and resource totals, but not drink-collection routes'],
  [23, 'payday history stores fired employees and only the number of food payments, not resource identities'],
])


/**
 * Classify whether a public history group can ever be an exact behavior-cloning label.
 * Candidate does not mean trusted: it still has to replay successfully through the official
 * action layer. Outcome-only records remain useful for state/value learning.
 */
export function classifyReplayDecisionGroup(group) {
  const eventCodes = [...new Set(group.events.map((event) => event.eventCode))]
  const informationLoss = eventCodes
    .filter((eventCode) => NON_INVERTIBLE_EVENTS.has(eventCode))
    .map((eventCode) => ({ eventCode, reason: NON_INVERTIBLE_EVENTS.get(eventCode) }))
  if (informationLoss.length > 0) {
    return {
      status: ACTION_LABEL_STATUS.OUTCOME_ONLY,
      behaviorCloneEligible: false,
      valueTargetEligible: true,
      eventCodes,
      informationLoss,
    }
  }
  return {
    status: ACTION_LABEL_STATUS.CANDIDATE,
    behaviorCloneEligible: false,
    valueTargetEligible: true,
    eventCodes,
    informationLoss: [],
  }
}


/** Fail closed until a candidate has been executed by the pinned official action layer. */
export function assertBehaviorCloneEligible(label) {
  assert.equal(
    label?.status,
    ACTION_LABEL_STATUS.VERIFIED,
    `behavior cloning requires ${ACTION_LABEL_STATUS.VERIFIED}; got ${label?.status ?? 'missing'}`,
  )
  assert.equal(label.behaviorCloneEligible, true, 'verified label must opt in to behavior cloning')
  return label
}
