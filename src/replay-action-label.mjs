import assert from 'node:assert/strict'


export const ACTION_LABEL_STATUS = Object.freeze({
  CANDIDATE: 'candidate-pending-engine-replay',
  OUTCOME_ONLY: 'outcome-only',
  VERIFIED: 'exact-engine-replayed',
  ENGINE_INCOMPATIBLE: 'engine-replay-incompatible',
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

/** Promote only after every mapped action has passed the pinned official action layer. */
export function markLabelEngineReplayed(label, actions) {
  assert.equal(label?.status, ACTION_LABEL_STATUS.CANDIDATE, 'only candidate labels can be promoted')
  assert.ok(Array.isArray(actions) && actions.length > 0, 'verified label requires replayed actions')
  return {
    ...label,
    status: ACTION_LABEL_STATUS.VERIFIED,
    behaviorCloneEligible: true,
    replayedActions: structuredClone(actions),
  }
}

/** Quarantine legacy/public history that the pinned current engine cannot execute exactly. */
export function markLabelEngineIncompatible(label, reason) {
  assert.equal(label?.status, ACTION_LABEL_STATUS.CANDIDATE, 'only candidate labels can be rejected')
  assert.ok(typeof reason === 'string' && reason.length > 0, 'incompatible label requires a reason')
  return {
    ...label,
    status: ACTION_LABEL_STATUS.ENGINE_INCOMPATIBLE,
    behaviorCloneEligible: false,
    engineReplayFailure: reason,
  }
}

/** Stable, conservative classes for known website-history/current-engine drift. */
export function classifyEngineReplayFailure(reason) {
  if (/槽位 .*超出当前结构范围/.test(reason)) return 'legacy-structure-capacity'
  if (/structure beach differs/.test(reason)) return 'legacy-structure-state-drift'
  if (/广告时长必须|campaign .* is illegal/.test(reason)) {
    return 'legacy-marketing-context-or-duration'
  }
  if (/cleanup history keeps unavailable resource/.test(reason)) return 'legacy-cleanup-state-drift'
  if (/restaurant index .* is illegal/.test(reason)) return 'legacy-restaurant-placement'
  return 'unclassified-engine-replay-failure'
}
