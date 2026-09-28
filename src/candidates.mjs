import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

function legalByType(view) {
  return new Map((view.legalActions?.actions ?? []).map((action) => [action.type, action]))
}

function unique(values) {
  return [...new Set(values)]
}

function stableCandidate(phase, subphase, intent, actions, details = {}) {
  assert.ok(actions.length > 0, 'candidate must contain at least one action')
  const encoded = JSON.stringify(actions)
  const digest = createHash('sha256').update(encoded).digest('hex').slice(0, 10)
  return {
    id: `p${phase}s${subphase ?? 0}-${intent}-${digest}`,
    intent,
    actions: structuredClone(actions),
    details: structuredClone(details),
  }
}

function finishAction(actions) {
  return actions.has('next_subphase') ? { type: 'next_subphase' } : { type: 'end_turn' }
}

function demandedGoods(state) {
  const counts = new Map()
  for (const house of state.houseDemands ?? []) {
    for (const good of house.goods ?? []) counts.set(good, (counts.get(good) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([good]) => good)
}

function restructuringCandidates(action, phase, subphase) {
  const candidates = [stableCandidate(phase, subphase, 'fallback', [{ type: 'end_turn' }])]
  const slots = action.slots ?? []
  const beach = action.beach ?? []
  if (!slots.length || !beach.length) return candidates
  const roleGroups = [
    { intent: 'balanced', ids: new Set([5, 13, 17, 20, 27]) },
    { intent: 'demand-engine', ids: new Set([13, 14, 15, 16]) },
    { intent: 'supply-engine', ids: new Set([27, 28, 29, 30, 31]) },
    { intent: 'recruiting-engine', ids: new Set([17, 18, 19]) },
  ]
  for (const group of roleGroups) {
    const ordered = beach
      .map((employee, index) => ({ employee, index }))
      .sort((left, right) => (
        Number(!group.ids.has(left.employee)) - Number(!group.ids.has(right.employee)) ||
        left.index - right.index
      ))
      .slice(0, Math.min(slots.length, beach.length))
      .map(({ employee }) => employee)
    candidates.push(stableCandidate(phase, subphase, group.intent, [{
      type: 'place_employees', employees: ordered, slots: slots.slice(0, ordered.length),
    }]))
  }
  const bestIn = (ids) => beach.filter((employee) => ids.includes(employee)).sort((a, b) => b - a)[0]
  const operatingOrder = unique([
    bestIn([13, 14, 15, 16]),
    bestIn([27, 28, 29, 30, 31]),
    bestIn([17, 18, 19]),
    bestIn([20, 21, 22]),
    bestIn([5, 6, 7, 8, 9]),
    ...beach,
  ].filter(Number.isInteger)).slice(0, Math.min(slots.length, beach.length))
  candidates.push(stableCandidate(phase, subphase, 'operate', [{
    type: 'place_employees', employees: operatingOrder,
    slots: slots.slice(0, operatingOrder.length),
  }]))
  return candidates
}

function workingDayCandidates(view, actions) {
  const { phase, subphase } = view.state
  const finish = finishAction(actions)
  const candidates = [stableCandidate(phase, subphase, 'fallback', [finish])]

  if (subphase === 1) {
    const hire = actions.get('hire')
    for (const employee of hire?.candidates ?? []) {
      candidates.push(stableCandidate(phase, subphase, 'hire', [
        { type: 'hire', employee: employee.id }, finish,
      ], { employee: employee.id, name: employee.name }))
    }
    const recruitingPoints = Math.min(
      hire?.recruitingPoints ?? 0,
      hire?.candidates?.length ?? 0,
    )
    if (recruitingPoints > 1) {
      const normalizedName = (employee) => (
        typeof employee.name === 'object' ? employee.name?.title ?? '' : String(employee.name ?? '')
      )
      const rolePriority = [
        ['foundation', ['Management Trainee', 'Trainer', 'Recruiting Girl', 'Kitchen Trainee', 'Marketing Trainee']],
        ['balanced', ['Recruiting Girl', 'Kitchen Trainee', 'Marketing Trainee']],
        ['supply-engine', ['Kitchen Trainee', 'Recruiting Girl', 'Marketing Trainee']],
        ['demand-engine', ['Marketing Trainee', 'Recruiting Girl', 'Kitchen Trainee']],
      ]
      for (const [intent, priorities] of rolePriority) {
        const ordered = [...hire.candidates].sort((left, right) => {
          const leftRank = priorities.indexOf(normalizedName(left))
          const rightRank = priorities.indexOf(normalizedName(right))
          return (leftRank < 0 ? priorities.length : leftRank) -
            (rightRank < 0 ? priorities.length : rightRank) || left.id - right.id
        }).slice(0, recruitingPoints)
        candidates.push(stableCandidate(phase, subphase, intent, [
          ...ordered.map((employee) => ({ type: 'hire', employee: employee.id })),
          finish,
        ], { employees: ordered.map((employee) => employee.id) }))
      }
    }
  } else if (subphase === 2) {
    for (const employee of actions.get('train')?.available ?? []) {
      for (const upgrade of employee.upgrades ?? []) {
        candidates.push(stableCandidate(phase, subphase, 'train', [
          {
            type: 'train', employee: employee.id, toEmployee: upgrade.id,
            origin: employee.origin, steps: upgrade.steps,
          },
          finish,
        ], { employee: employee.id, upgrade: upgrade.id }))
      }
    }
  } else if (subphase === 3) {
    const marketing = actions.get('marketing')
    const goods = unique([
      ...demandedGoods(view.state),
      4, 3, 0, 1, 2,
      ...(marketing?.goods ?? []),
    ]).filter((good) => marketing?.goods?.includes(good)).slice(0, 2)
    for (const marketer of marketing?.options ?? []) {
      for (const campaign of marketer.campaigns ?? []) {
        const durations = campaign.durationInfinite ? [9] : unique([1, campaign.maxDuration])
        for (const placement of campaign.placements ?? []) {
          const impactful = (placement.houseImpacts ?? [])
            .filter((impact) => impact.houses?.length)
            .sort((a, b) => b.houses.length - a.houses.length || a.index - b.index)
          const indexes = unique([
            ...impactful.slice(0, 2).map((impact) => impact.index),
            ...(placement.legalSquares ?? []).slice(0, 1),
          ])
          for (const good of goods) {
            for (const duration of durations) {
              for (const index of indexes) {
                candidates.push(stableCandidate(phase, subphase, 'create-demand', [
                  {
                    type: 'marketing', marketer: marketer.marketer,
                    campaign: campaign.campaign, good, duration,
                    rotated: placement.rotated, index,
                  },
                  finish,
                ], {
                  affectedHouses: impactful.find((impact) => impact.index === index)?.houses?.length ?? 0,
                  affectedHouseIds: [...(impactful.find((impact) => impact.index === index)?.houses ?? [])],
                }))
              }
            }
          }
        }
      }
    }
  } else if (subphase === 4) {
    for (const producer of actions.get('produce')?.producers ?? []) {
      for (const item of producer.goods ?? []) {
        candidates.push(stableCandidate(phase, subphase, 'produce', [
          { type: 'produce', producer: producer.id, item, amount: 1 }, finish,
        ], { item }))
      }
    }
    for (const collector of actions.get('collect_drinks')?.collectors ?? []) {
      for (const start of (collector.starts ?? []).slice(0, 4)) {
        candidates.push(stableCandidate(phase, subphase, 'collect', [
          { type: 'collect_drinks', producer: collector.id, route: [start] }, finish,
        ], { startMode: collector.startMode }))
      }
    }
  } else if (subphase === 5) {
    const build = actions.get('build_house')
    if ((build?.remainingBuilds ?? 0) > 0) {
      for (const house of build.houses ?? []) {
        for (const placement of house.placements ?? []) {
          for (const index of (placement.legalSquares ?? []).slice(0, 3)) {
            candidates.push(stableCandidate(phase, subphase, 'build-house', [
              {
                type: 'build_house', building: 'house', house: house.house,
                rotation: placement.rotation, index,
              }, finish,
            ]))
          }
        }
      }
      for (const garden of build.gardens ?? []) {
        for (const edge of garden.edges ?? []) {
          candidates.push(stableCandidate(phase, subphase, 'build-garden', [
            {
              type: 'build_house', building: 'garden', house: garden.house,
              houseIndex: garden.houseIndex, edge: edge.edge, index: edge.index,
            }, finish,
          ]))
        }
      }
    }
  } else if (subphase === 6) {
    for (const manager of actions.get('open_restaurant')?.managers ?? []) {
      for (const restaurantAction of manager.actions ?? []) {
        for (const placement of restaurantAction.placements ?? []) {
          for (const index of (placement.legalSquares ?? []).slice(0, 3)) {
            const base = {
              type: 'open_restaurant', restaurantAction: restaurantAction.type,
              manager: manager.manager, rotation: placement.rotation, index,
            }
            if (restaurantAction.type === 'move') {
              for (const fromIndex of restaurantAction.restaurants ?? []) {
                candidates.push(stableCandidate(phase, subphase, 'move-restaurant', [
                  { ...base, fromIndex }, finish,
                ]))
              }
            } else {
              candidates.push(stableCandidate(phase, subphase, 'open-restaurant', [base, finish]))
            }
          }
        }
      }
    }
  }
  return candidates
}

function capCandidates(candidates, { totalBudget, perIntentBudget }) {
  const seenActions = new Set()
  const intentCounts = new Map()
  const kept = []
  for (const candidate of candidates) {
    const encoded = JSON.stringify(candidate.actions)
    if (seenActions.has(encoded)) continue
    const count = intentCounts.get(candidate.intent) ?? 0
    if (count >= perIntentBudget || kept.length >= totalBudget) continue
    seenActions.add(encoded)
    intentCounts.set(candidate.intent, count + 1)
    kept.push(candidate)
  }
  return kept
}

/**
 * Deterministically generate a small phase-local candidate set from advertised legal actions.
 * This deliberately avoids cross-phase Cartesian products; multi-turn composition belongs to search.
 */
export function generateCandidates(view, { totalBudget = 32, perIntentBudget = 6 } = {}) {
  assert.ok(Number.isInteger(totalBudget) && totalBudget > 0, 'totalBudget must be positive')
  assert.ok(Number.isInteger(perIntentBudget) && perIntentBudget > 0, 'perIntentBudget must be positive')
  assert.equal(view.legalActions?.yourTurn, true, 'cannot generate candidates outside this seat turn')
  const actions = legalByType(view)
  const { phase, subphase } = view.state
  let candidates = []

  if ([0, 1].includes(phase)) {
    const place = actions.get('place_restaurant')
    const placements = place?.placements ?? [{ rotation: place?.rotation, legalSquares: place?.legalSquares }]
    const me = view.state.players?.[view.state.mySeat]
    if (me?.restaurants?.length) {
      candidates.push(stableCandidate(phase, subphase, 'fallback', [{ type: 'end_turn' }]))
    } else {
      for (const placement of placements) {
        for (const index of placement.legalSquares ?? []) {
          candidates.push(stableCandidate(phase, subphase, 'restaurant-start', [
            { type: 'place_restaurant', rotation: placement.rotation, index },
            { type: 'end_turn' },
          ]))
        }
      }
    }
  } else if (phase === 2) {
    for (const cardValue of actions.get('choose_reserve_card')?.cardValues ?? []) {
      candidates.push(stableCandidate(phase, subphase, 'reserve-card', [
        { type: 'choose_reserve_card', cardValue },
      ]))
    }
  } else if (phase === 3) {
    candidates = restructuringCandidates(actions.get('place_employees') ?? {}, phase, subphase)
  } else if (phase === 4) {
    for (const turnOrderPosition of actions.get('choose_turn_order')?.positions ?? []) {
      candidates.push(stableCandidate(phase, subphase, 'turn-order', [
        { type: 'choose_turn_order', turnOrderPosition },
      ], { turnOrderPosition }))
    }
  } else if (phase === 5) {
    candidates = workingDayCandidates(view, actions)
  } else if (phase === 7) {
    const payday = actions.get('resolve_payday')
    if (payday?.currentlyAffordable) {
      candidates.push(stableCandidate(phase, subphase, 'retain-staff', [{
        type: 'resolve_payday', fireEmployees: [], payWithResources: [],
      }]))
    } else {
      candidates.push(stableCandidate(phase, subphase, 'survive-payday', [{
        type: 'resolve_payday',
        fireEmployees: [...(payday?.fireableEmployees ?? [])],
        payWithResources: [],
      }]))
    }
  } else if (phase === 9) {
    const cleanup = actions.get('resolve_cleanup')
    const fridgeChoices = cleanup?.requiresFridgeChoice ? ['rest', 'kimchi'] : [undefined]
    for (const fridgeChoice of fridgeChoices) {
      let disposable = [...(cleanup?.resources ?? [])]
      let minimumDiscardCount = cleanup?.minimumDiscardCount ?? 0
      if (fridgeChoice) {
        assert.ok(Number.isInteger(cleanup.kimchiResource), 'cleanup requires kimchiResource metadata')
        disposable = disposable.filter((resource) => (
          fridgeChoice === 'kimchi'
            ? resource === cleanup.kimchiResource
            : resource !== cleanup.kimchiResource
        ))
        minimumDiscardCount = fridgeChoice === 'kimchi' ? 0 : Math.max(0, disposable.length - 10)
      }
      const discardResources = disposable.sort((a, b) => a - b).slice(0, minimumDiscardCount)
      const action = { type: 'resolve_cleanup', discardResources }
      if (fridgeChoice) action.fridgeChoice = fridgeChoice
      candidates.push(stableCandidate(phase, subphase, 'preserve-inventory', [action]))
    }
  } else if (phase === 11) {
    const radio = actions.get('place_pizza_radio')
    for (const index of radio?.legalSquares ?? []) {
      candidates.push(stableCandidate(phase, subphase, 'free-demand', [{
        type: 'place_pizza_radio', campaign: radio.campaign, house: radio.house, index,
      }]))
    }
    if (radio?.canSkip || !candidates.length) {
      candidates.push(stableCandidate(phase, subphase, 'fallback', [{
        type: 'place_pizza_radio', campaign: radio?.campaign, house: radio?.house, skip: true,
      }]))
    }
  }

  const bounded = capCandidates(candidates, { totalBudget, perIntentBudget })
  assert.ok(bounded.length > 0, `no safe candidate for phase ${phase}/${subphase}`)
  return bounded
}
