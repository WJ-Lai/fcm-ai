const SPATIAL_ACTIONS = new Set(['build_house', 'open_restaurant'])

function finiteDistance(value) {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function reachabilityByHouse(view) {
  const houses = view?.state?.decisionSupport?.strategicThreats?.reachability?.houses ?? []
  return new Map(houses.map((entry) => [entry.house, entry]))
}

function distanceAt(entry, seat) {
  return finiteDistance(entry?.restaurantDistances?.[seat])
}

function normalizeDistances(entry) {
  return (entry?.restaurantDistances ?? []).map(finiteDistance)
}

function bestOpponentDistance(entry, actingSeat) {
  const distances = normalizeDistances(entry).filter(
    (distance, seat) => seat !== actingSeat && distance != null,
  )
  return distances.length ? Math.min(...distances) : null
}

/**
 * Summarize only the acting seat's official public per-house distance changes.
 * New/lost reach is kept separate from finite distance gains so unreachable
 * sentinel values never become accidental giant numeric rewards.
 */
export function summarizeRestaurantReachChange(beforeView, afterView) {
  const actingSeat = beforeView?.state?.mySeat
  if (!Number.isInteger(actingSeat) || afterView?.state?.mySeat !== actingSeat) {
    throw new Error('before and after views must belong to the same acting seat')
  }
  const before = reachabilityByHouse(beforeView)
  const after = reachabilityByHouse(afterView)
  const houseIds = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => left - right)
  const changedHouses = []
  let newlyReachable = 0
  let noLongerReachable = 0
  let totalDistanceImprovement = 0
  let totalDistanceRegression = 0

  for (const house of houseIds) {
    const previous = distanceAt(before.get(house), actingSeat)
    const next = distanceAt(after.get(house), actingSeat)
    if (previous === next) continue
    changedHouses.push({ house, before: previous, after: next })
    if (previous == null && next != null) newlyReachable += 1
    else if (previous != null && next == null) noLongerReachable += 1
    else if (next < previous) totalDistanceImprovement += previous - next
    else totalDistanceRegression += next - previous
  }

  return {
    actingSeat,
    changedHouses,
    newlyReachable,
    noLongerReachable,
    totalDistanceImprovement,
    totalDistanceRegression,
  }
}

/**
 * Canonical tactical consequence of one spatial action, derived solely from
 * official public DecisionViews before and after the authoritative transition.
 * Coordinates are intentionally absent; future board-blocking value is outside
 * this short-horizon label and must be assessed by rollout/search.
 */
export function spatialConsequenceSignature(beforeView, afterView, actions) {
  const spatial = actions.filter((action) => SPATIAL_ACTIONS.has(action.type))
  if (spatial.length !== 1) return null
  const action = spatial[0]
  const actingSeat = beforeView?.state?.mySeat
  if (!Number.isInteger(actingSeat) || afterView?.state?.mySeat !== actingSeat) {
    throw new Error('before and after views must belong to the same acting seat')
  }

  if (action.type === 'open_restaurant') {
    return {
      kind: action.restaurantAction === 'move' ? 'move-restaurant' : 'create-restaurant',
      ...summarizeRestaurantReachChange(beforeView, afterView),
    }
  }

  const house = reachabilityByHouse(afterView).get(action.house)
  return {
    kind: action.building === 'garden' ? 'build-garden' : 'build-house',
    house: action.house,
    restaurantDistances: normalizeDistances(house),
    reachableSeats: [...(house?.reachableSeats ?? [])].sort((left, right) => left - right),
    actingSeatDistance: distanceAt(house, actingSeat),
    bestOpponentDistance: bestOpponentDistance(house, actingSeat),
  }
}
