import assert from 'node:assert/strict'

import { generateCandidates } from './candidates.mjs'
import {
  STRATEGIC_MEMORY_VERSION,
  compileCandidatePlanFeatures,
} from './game-memory-v2.mjs'

const PROFILES = Object.freeze({
  balanced: { cash: 1, staff: 4, inventory: 2, capacity: 3, milestone: 6 },
  growth: { cash: 0.7, staff: 5, inventory: 1.5, capacity: 4, milestone: 8 },
  cash: { cash: 1.4, staff: 2, inventory: 3, capacity: 2, milestone: 4 },
})

function economyFor(view, seat) {
  return view.state.decisionSupport?.economyPlayers?.find((player) => player.seat === seat) ?? null
}

function numericCapacity(capacities) {
  if (!capacities) return 0
  let total = 0
  const visit = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) total += Math.max(0, value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(capacities)
  return total
}

export function evaluatePosition(view, { seat = view.state.mySeat, profile = 'balanced' } = {}) {
  const weights = PROFILES[profile]
  assert.ok(weights, `unknown strategy profile ${profile}`)
  const player = view.state.players[seat]
  assert.ok(player, `seat ${seat} is absent from state`)
  const economy = economyFor(view, seat)
  const openMilestones = view.state.decisionSupport?.strategicThreats?.milestones?.filter(
    (milestone) => milestone.claimWindowOpen && milestone.seatsStillEligible?.includes(seat),
  ).length ?? 0
  const breakdown = {
    cash: (player.money ?? 0) * weights.cash,
    staff: ((player.employees?.length ?? 0) + 0.35 * (player.beach?.length ?? 0)) * weights.staff,
    inventory: (player.resources?.length ?? 0) * weights.inventory,
    capacity: numericCapacity(economy?.capacities) * weights.capacity,
    salaryRisk: -(economy?.salary?.due ?? 0) * (profile === 'cash' ? 1 : 0.6),
    milestoneOptions: Math.min(openMilestones, 4) * weights.milestone,
    bankruptcy: player.bankrupt ? -10000 : 0,
  }
  return { score: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown }
}

function employeeTitle(candidate) {
  const value = candidate.details?.name
  return typeof value === 'object' ? value?.title ?? '' : String(value ?? '')
}

function demandedCount(state, item) {
  return (state.houseDemands ?? []).reduce(
    (total, house) => total + (house.goods ?? []).filter((good) => good === item).length,
    0,
  )
}

function actionHeuristic(view, candidate, profile) {
  const actions = candidate.actions
  const first = actions[0]
  const me = view.state.players[view.state.mySeat]
  const economy = economyFor(view, view.state.mySeat)
  const hasSubstantiveChoice = candidate.intent !== 'fallback'
  const parts = { progress: hasSubstantiveChoice ? 2 : -12, intent: 0, market: 0, risk: 0 }

  if (first.type === 'place_restaurant') parts.progress += 30
  else if (first.type === 'choose_reserve_card') {
    parts.intent += first.cardValue === 1 ? 5 : first.cardValue === 2 ? 3 : 1
  } else if (first.type === 'place_employees') {
    const active = new Set(first.employees)
    if ([13, 14, 15, 16].some((id) => active.has(id))) parts.intent += 8
    if ([27, 28, 29, 30, 31].some((id) => active.has(id))) parts.intent += 8
    if ([17, 18, 19].some((id) => active.has(id))) parts.intent += 6
    if ([20, 21, 22].some((id) => active.has(id))) parts.intent += 10
    if ([5, 6, 7, 8, 9].some((id) => active.has(id))) parts.intent += 7
    const engines = [
      [13, 14, 15, 16], [17, 18, 19], [20, 21, 22], [27, 28, 29, 30, 31],
    ].filter((ids) => ids.some((id) => active.has(id))).length
    parts.intent += engines * 4
    if (candidate.intent === 'operate') parts.intent += 12
    parts.progress += first.employees.length * 2
  } else if (first.type === 'choose_turn_order') {
    parts.intent += Math.max(0, 6 - first.turnOrderPosition * 2)
  } else if (first.type === 'hire') {
    const titles = candidate.details?.employees
      ? []
      : [employeeTitle(candidate)]
    const title = titles[0] ?? ''
    const owned = [...(me.employees ?? []), ...(me.beach ?? [])]
    const hiredIds = actions.filter((action) => action.type === 'hire').map((action) => action.employee)
    const repeated = hiredIds.filter((id) => owned.includes(id)).length
    const ownsAny = (ids) => ids.some((id) => owned.includes(id))
    if (title === 'Trainer' || first.employee === 20) parts.intent += 18
    else if (title === 'Management Trainee' || first.employee === 5) parts.intent += 16
    else if (title === 'Recruiting Girl' || first.employee === 17) parts.intent += 14
    else if (title === 'Kitchen Trainee' || first.employee === 27) parts.intent += 12
    else if (title === 'Marketing Trainee' || first.employee === 13) parts.intent += 10
    else parts.intent += 5
    if (!ownsAny([13, 14, 15, 16]) && first.employee === 13) parts.intent += 18
    if (!ownsAny([27, 28, 29, 30, 31]) && first.employee === 27) parts.intent += 18
    if (!ownsAny([20, 21, 22]) && first.employee === 20) parts.intent += 12
    parts.progress += actions.filter((action) => action.type === 'hire').length * 7
    if (candidate.intent === 'foundation') parts.intent += 22
    else if (candidate.intent === 'balanced') parts.intent += 15
    parts.risk -= repeated * 25
    parts.risk -= Math.max(0, owned.length - 8) * 6
  } else if (first.type === 'train') {
    parts.progress += 12 + (first.steps ?? 1) * 3
    if ([14, 15, 16, 28, 29, 30, 31, 18, 19].includes(first.toEmployee)) parts.intent += 5
  } else if (first.type === 'marketing') {
    const stock = (me.resources ?? []).filter((good) => good === first.good).length
    const production = economy?.capacities?.production ?? []
    const canProduce = JSON.stringify(production).includes(String(first.good))
    parts.market += (candidate.details?.affectedHouses ?? 0) * 8
    const reachability = new Map(
      (view.state.decisionSupport?.strategicThreats?.reachability?.houses ?? [])
        .map((house) => [house.house, house]),
    )
    const affected = candidate.details?.affectedHouseIds ?? []
    if (affected.length && reachability.size) {
      const reachable = affected.filter(
        (house) => reachability.get(house)?.reachableSeats?.includes(view.state.mySeat),
      ).length
      parts.market += reachable * 12
      parts.risk -= (affected.length - reachable) * 15
      for (const house of affected) {
        const distances = reachability.get(house)?.restaurantDistances ?? []
        const mine = distances[view.state.mySeat]
        const reachableDistances = distances.filter((distance) => distance !== -99)
        if (mine === -99 || mine == null || !reachableDistances.length) continue
        const best = Math.min(...reachableDistances)
        if (mine === best) parts.market += 10
        else parts.risk -= Math.min(30, (mine - best) * 10)
      }
    }
    parts.market += stock * 3 + (canProduce ? 5 : 0)
    if (!stock && !canProduce) parts.risk -= profile === 'growth' ? 2 : 6
    if ([3, 4].includes(first.good)) parts.intent += 4
  } else if (first.type === 'produce') {
    parts.market += 8 + demandedCount(view.state, first.item) * 7
    if ([3, 4].includes(first.item)) parts.intent += 3
  } else if (first.type === 'collect_drinks') {
    parts.market += 6
  } else if (first.type === 'build_house') {
    parts.progress += first.building === 'garden' ? 15 : 11
  } else if (first.type === 'open_restaurant') {
    parts.progress += first.restaurantAction === 'create' ? 14 : 8
  } else if (first.type === 'resolve_payday') {
    parts.risk -= first.fireEmployees.length * 8
    parts.risk -= first.payWithResources.length * (profile === 'cash' ? 1 : 3)
    if (!first.fireEmployees.length) parts.intent += 8
  } else if (first.type === 'resolve_cleanup') {
    parts.risk -= first.discardResources.length * 3
  } else if (first.type === 'place_pizza_radio') {
    parts.market += first.skip ? -5 : 12
  }
  return parts
}

export function rankCandidates(view, candidates, { profile = 'balanced', memory = null } = {}) {
  assert.ok(PROFILES[profile], `unknown strategy profile ${profile}`)
  const position = evaluatePosition(view, { profile })
  return candidates.map((candidate) => {
    const action = actionHeuristic(view, candidate, profile)
    const isStrategicV2 = memory?.schemaVersion === STRATEGIC_MEMORY_VERSION
    const strategicPlan = isStrategicV2
      ? compileCandidatePlanFeatures(memory, candidate)
      : null
    const planContinuity = !isStrategicV2 && memory?.strategicPlan?.intent === candidate.intent
      ? ({ low: 1, medium: 3, high: 6 }[memory.strategicPlan.confidence] ?? 0)
      : 0
    const strategicPlanScore = (strategicPlan?.priority ?? 0) * 2
    const score = position.score + Object.values(action).reduce((sum, value) => sum + value, 0) +
      planContinuity + strategicPlanScore
    return {
      ...candidate,
      score,
      scoreBreakdown: {
        position: position.breakdown,
        action,
        planContinuity,
        strategicPlan: strategicPlan ? { ...strategicPlan, score: strategicPlanScore } : null,
      },
    }
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
}

/** First deterministic strategy policy: generate, score, and return one validated candidate. */
export function deterministicStrategy(view, options = {}) {
  const candidates = generateCandidates(view, {
    ...(options.candidateBudget ?? {}),
    memory: options.memory ?? null,
  })
  const ranked = rankCandidates(view, candidates, options)
  return { selected: ranked[0], ranked }
}
