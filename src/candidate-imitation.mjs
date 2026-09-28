/** Return the one-based rank of an exact complete action batch, or null. */
export function exactCandidateRank(rankedCandidates, humanActions) {
  const encoded = JSON.stringify(humanActions)
  const index = rankedCandidates.findIndex(
    (candidate) => JSON.stringify(candidate.actions) === encoded,
  )
  return index < 0 ? null : { candidateId: rankedCandidates[index].id, rank: index + 1 }
}

const PHASE_CONTROL_ACTIONS = new Set(['next_subphase', 'end_turn'])

/** Summarize the strategic primitives in one complete decision batch. */
export function decisionBatchShape(actions) {
  const strategic = actions.filter((action) => !PHASE_CONTROL_ACTIONS.has(action.type))
  return {
    actionCount: strategic.length,
    actionTypes: [...new Set(strategic.map((action) => action.type))].sort(),
  }
}

/** Canonical pattern for learning proposal priors without retaining player identity. */
export function decisionPatternKey(actions) {
  const strategic = actions.filter((action) => !PHASE_CONTROL_ACTIONS.has(action.type))
  if (strategic.length && strategic.every((action) => action.type === 'hire')) {
    return `hire:${strategic.map((action) => action.employee).sort((a, b) => a - b).join(',')}`
  }
  if (strategic.length && strategic.every((action) => action.type === 'train')) {
    return `train:${[...strategic].sort((left, right) => (
      left.origin - right.origin || left.employee - right.employee || left.toEmployee - right.toEmployee
    )).map((action) => `${action.origin}/${action.employee}>${action.toEmployee}`).join(',')}`
  }
  return strategic.map((action) => action.type).sort().join('+') || 'phase-control-only'
}

/** Match candidates by a caller-defined semantic projection instead of raw coordinates. */
export function projectedCandidateRank(rankedCandidates, humanActions, project) {
  const target = project(humanActions)
  if (target == null) return null
  const encoded = JSON.stringify(target)
  const index = rankedCandidates.findIndex((candidate) => {
    const projected = project(candidate.actions)
    return projected != null && JSON.stringify(projected) === encoded
  })
  return index < 0 ? null : { candidateId: rankedCandidates[index].id, rank: index + 1 }
}

/**
 * Strict marketing equivalence: same worker/campaign/good/duration and the same
 * publicly affected houses. Coordinates alone are deliberately ignored.
 */
export function marketingEffectSignature(actions, legalActions) {
  const marketingActions = actions.filter((action) => action.type === 'marketing')
  if (!marketingActions.length) return null
  const legal = legalActions.actions.find((item) => item.type === 'marketing')
  const usedMarketers = new Set()
  const signatures = []
  for (const action of marketingActions) {
    if (usedMarketers.has(action.marketer)) return null
    usedMarketers.add(action.marketer)
    const marketer = legal?.options?.find((item) => item.marketer === action.marketer)
    const campaign = marketer?.campaigns?.find((item) => item.campaign === action.campaign)
    const placement = campaign?.placements?.find((item) => item.rotated === action.rotated)
    const impact = placement?.houseImpacts?.find((item) => item.index === action.index)
    if (!impact) return null
    signatures.push({
      marketer: action.marketer,
      campaign: action.campaign,
      good: action.good,
      duration: action.duration,
      houses: [...impact.houses].sort((left, right) => left - right),
    })
  }
  signatures.sort((left, right) => (
    left.marketer - right.marketer || left.campaign - right.campaign ||
    left.good - right.good || left.duration - right.duration ||
    JSON.stringify(left.houses).localeCompare(JSON.stringify(right.houses))
  ))
  return signatures.length === 1 ? signatures[0] : signatures
}

/** Return every tied first-place seat from terminal public player state. */
export function winnerSeatsFromPlayers(players) {
  if (!players.length) return []
  const bestMoney = Math.max(...players.map((player) => player.money ?? 0))
  return players.flatMap((player, seat) => (
    (player.money ?? 0) === bestMoney ? [seat] : []
  ))
}
