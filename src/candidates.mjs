import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { PROPOSAL_PRIOR } from './proposal-prior.mjs'

function legalByType(view) {
  return new Map((view.legalActions?.actions ?? []).map((action) => [action.type, action]))
}

function unique(values) {
  return [...new Set(values)]
}

function spreadSample(values, limit) {
  if (values.length <= limit) return [...values]
  if (limit === 1) return [values[0]]
  return unique(Array.from({ length: limit }, (_, index) => (
    values[Math.round(index * (values.length - 1) / (limit - 1))]
  )))
}

function stableCandidate(phase, subphase, intent, actions, details = {}, diversityKey = intent) {
  assert.ok(actions.length > 0, 'candidate must contain at least one action')
  const encoded = JSON.stringify(actions)
  const digest = createHash('sha256').update(encoded).digest('hex').slice(0, 10)
  return {
    id: `p${phase}s${subphase ?? 0}-${intent}-${digest}`,
    intent,
    actions: structuredClone(actions),
    details: structuredClone(details),
    diversityKey,
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

function boundedCombinations(items, length, { canUse = () => true, limit = 20 } = {}) {
  const buckets = []
  const visit = (selected, start, bucket) => {
    if (bucket.length >= limit) return
    if (selected.length === length) {
      bucket.push([...selected])
      return
    }
    for (let index = start; index < items.length && bucket.length < limit; index += 1) {
      if (!canUse(items[index], selected)) continue
      selected.push(items[index])
      visit(selected, index, bucket)
      selected.pop()
    }
  }
  for (let root = 0; root < items.length; root += 1) {
    if (!canUse(items[root], [])) continue
    const bucket = []
    visit([items[root]], root, bucket)
    if (bucket.length) buckets.push(bucket)
  }
  const result = []
  for (let rank = 0; result.length < limit; rank += 1) {
    let added = false
    for (const bucket of buckets) {
      if (bucket[rank]) {
        result.push(bucket[rank])
        added = true
      }
      if (result.length >= limit) break
    }
    if (!added) break
  }
  return result
}

function legalHirePriorCandidates(hire, state, recruitingPoints, phase, subphase, finish) {
  const legalIds = new Set((hire?.candidates ?? []).map((employee) => employee.id))
  const result = []
  for (const pattern of PROPOSAL_PRIOR.hirePatterns) {
    if (pattern.length > recruitingPoints || pattern.some((employee) => !legalIds.has(employee))) continue
    const counts = new Map()
    let available = true
    for (const employee of pattern) {
      const used = (counts.get(employee) ?? 0) + 1
      counts.set(employee, used)
      if (used > (state.availableEmployees?.[employee] ?? 1)) available = false
    }
    if (!available) continue
    result.push(stableCandidate(
      phase,
      subphase,
      `hire-prior-${pattern.join('-')}`,
      [...pattern.map((employee) => ({ type: 'hire', employee })), finish],
      { employees: [...pattern], proposalPriorVersion: PROPOSAL_PRIOR.version },
      `hire-prior:${pattern.join(',')}`,
    ))
  }
  return result
}

function trainingActionKey(action) {
  return `${action.origin}/${action.employee}>${action.toEmployee}`
}

function legalTrainPriorCandidates(primitives, sourceCounts, trainingPoints, phase, subphase, finish) {
  const byKey = new Map(primitives.map((action) => [trainingActionKey(action), action]))
  const result = []
  for (const pattern of PROPOSAL_PRIOR.trainPatterns) {
    const sequence = pattern.map((key) => byKey.get(key))
    if (sequence.some((action) => action == null)) continue
    if (sequence.reduce((total, action) => total + action.steps, 0) > trainingPoints) continue
    const uses = new Map()
    let available = true
    for (const action of sequence) {
      const sourceKey = `${action.origin}:${action.employee}`
      const used = (uses.get(sourceKey) ?? 0) + 1
      uses.set(sourceKey, used)
      if (used > (sourceCounts.get(sourceKey) ?? 1)) available = false
    }
    if (!available) continue
    result.push(stableCandidate(
      phase,
      subphase,
      `train-prior-${result.length}`,
      [...sequence, finish],
      { upgrades: sequence.map((action) => action.toEmployee), proposalPriorVersion: PROPOSAL_PRIOR.version },
      `train-prior:${pattern.join(',')}`,
    ))
  }
  return result
}

function legalMarginalTrainCandidates(
  primitives, sourceCounts, trainingPoints, phase, subphase, finish,
) {
  if (trainingPoints < 2) return []
  const support = PROPOSAL_PRIOR.trainTransitionSupport
  const rankedPrimitives = [...primitives].sort((left, right) => (
    (support[trainingActionKey(right)] ?? 0) - (support[trainingActionKey(left)] ?? 0) ||
    trainingActionKey(left).localeCompare(trainingActionKey(right))
  ))
  const selected = []
  const perLengthBudget = new Map([[2, 6], [3, 4], [4, 2]])
  for (let length = 2; length <= Math.min(trainingPoints, 4); length += 1) {
    const combinations = boundedCombinations(rankedPrimitives, length, {
      canUse: (action, prefix) => {
        const sourceKey = `${action.origin}:${action.employee}`
        const sourceUses = prefix.filter(
          (item) => item.employee === action.employee && item.origin === action.origin,
        ).length
        return prefix.reduce((total, item) => total + item.steps, 0) + action.steps <= trainingPoints &&
          sourceUses < (sourceCounts.get(sourceKey) ?? 1)
      },
      limit: 512,
    })
    const bestBySourceSignature = new Map()
    for (const sequence of combinations) {
      const pattern = sequence.map(trainingActionKey).sort().join(',')
      const sourceSignature = sequence.map(
        (action) => `${action.origin}/${action.employee}`,
      ).sort().join(',')
      const score = sequence.reduce(
        (total, action) => total + (support[trainingActionKey(action)] ?? 0),
        unique(sequence.map((action) => `${action.origin}/${action.employee}`)).length * 4,
      )
      const existing = bestBySourceSignature.get(sourceSignature)
      if (!existing || score > existing.score || (score === existing.score && pattern < existing.pattern)) {
        bestBySourceSignature.set(sourceSignature, { sequence, score, pattern })
      }
    }
    selected.push(...[...bestBySourceSignature.values()]
      .sort((left, right) => right.score - left.score || left.pattern.localeCompare(right.pattern))
      .slice(0, perLengthBudget.get(length) ?? 0))
  }
  return selected.map(({ sequence, pattern }, index) => stableCandidate(
      phase,
      subphase,
      `train-marginal-${index}`,
      [...sequence, finish],
      { upgrades: sequence.map((action) => action.toEmployee), proposalPriorVersion: PROPOSAL_PRIOR.version },
      `train-marginal:${pattern}`,
    ))
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
    const recruitingPoints = hire?.recruitingPoints ?? 0
    candidates.push(...legalHirePriorCandidates(
      hire, view.state, recruitingPoints, phase, subphase, finish,
    ))
    for (const employee of hire?.candidates ?? []) {
      candidates.push(stableCandidate(phase, subphase, 'hire', [
        { type: 'hire', employee: employee.id }, finish,
      ], { employee: employee.id, name: employee.name }, `hire:${employee.id}`))
    }
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

      const priorityTitles = [
        'Recruiting Girl', 'Trainer', 'Management Trainee', 'Kitchen Trainee',
        'Marketing Trainee', 'Errand Boy', 'Pricing Manager', 'Waitress',
      ]
      const sequencePool = [...hire.candidates].sort((left, right) => {
        const leftRank = priorityTitles.indexOf(normalizedName(left))
        const rightRank = priorityTitles.indexOf(normalizedName(right))
        return (leftRank < 0 ? priorityTitles.length : leftRank) -
          (rightRank < 0 ? priorityTitles.length : rightRank) || left.id - right.id
      })
      const managementTrainee = sequencePool.find((employee) => employee.id === 5)
      if (managementTrainee) {
        for (const partner of sequencePool) {
          const requiredCopies = partner.id === managementTrainee.id ? 2 : 1
          if ((view.state.availableEmployees?.[partner.id] ?? 1) < requiredCopies) continue
          candidates.push(stableCandidate(
            phase,
            subphase,
            `hire-foundation-pair-${partner.id}`,
            [
              { type: 'hire', employee: managementTrainee.id },
              { type: 'hire', employee: partner.id },
              finish,
            ],
            { employees: [managementTrainee.id, partner.id] },
          ))
        }
      }
      for (let length = 2; length <= Math.min(recruitingPoints, 3); length += 1) {
        const sequences = boundedCombinations(sequencePool, length, {
          canUse: (employee, selected) => {
            const used = selected.filter((item) => item.id === employee.id).length
            return used < (view.state.availableEmployees?.[employee.id] ?? 1)
          },
          limit: 16,
        })
        for (const sequence of sequences) {
          candidates.push(stableCandidate(
            phase,
            subphase,
            `hire-sequence-${length}-${sequence[0].id}`,
            [...sequence.map((employee) => ({ type: 'hire', employee: employee.id })), finish],
            { employees: sequence.map((employee) => employee.id) },
          ))
        }
      }
    }
  } else if (subphase === 2) {
    const train = actions.get('train')
    const primitivesByKey = new Map()
    const sourceCounts = new Map()
    for (const employee of train?.available ?? []) {
      const sourceKey = `${employee.origin}:${employee.id}`
      sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1)
      for (const upgrade of employee.upgrades ?? []) {
        const action = {
          type: 'train', employee: employee.id, toEmployee: upgrade.id,
          origin: employee.origin, steps: upgrade.steps,
        }
        primitivesByKey.set(
          `${sourceKey}:${upgrade.id}:${upgrade.steps}`,
          action,
        )
      }
    }
    const trainingPoints = train?.trainingPoints ?? 0
    const primitives = [...primitivesByKey.values()]
    candidates.push(...legalTrainPriorCandidates(
      primitives, sourceCounts, trainingPoints, phase, subphase, finish,
    ))
    candidates.push(...legalMarginalTrainCandidates(
      primitives, sourceCounts, trainingPoints, phase, subphase, finish,
    ))
    for (const action of primitives) {
      candidates.push(stableCandidate(phase, subphase, 'train', [action, finish], {
        employee: action.employee,
        upgrade: action.toEmployee,
      }, `train:${action.origin}:${action.employee}:${action.toEmployee}`))
    }
    if (trainingPoints > 1) {
      for (let length = 2; length <= Math.min(trainingPoints, 3); length += 1) {
        const combinations = boundedCombinations(primitives, length, {
          canUse: (action, selected) => {
            const sourceKey = `${action.origin}:${action.employee}`
            const sourceUses = selected.filter(
              (item) => item.employee === action.employee && item.origin === action.origin,
            ).length
            return selected.reduce((total, item) => total + item.steps, 0) + action.steps <= trainingPoints &&
              sourceUses < (sourceCounts.get(sourceKey) ?? 1)
          },
          limit: 64,
        })
        for (const sequence of combinations) {
          candidates.push(stableCandidate(
            phase,
            subphase,
            `train-sequence-${length}-${sequence[0].toEmployee}`,
            [...sequence, finish],
            { upgrades: sequence.map((action) => action.toEmployee) },
          ))
        }
      }
    }
  } else if (subphase === 3) {
    const marketing = actions.get('marketing')
    const goods = unique([
      ...demandedGoods(view.state),
      4, 3, 0, 1, 2,
      ...(marketing?.goods ?? []),
    ]).filter((good) => marketing?.goods?.includes(good))
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
                }, `create-demand:${marketer.marketer}:${campaign.campaign}:${good}:${duration}`))
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
          for (const index of spreadSample(placement.legalSquares ?? [], 3)) {
            candidates.push(stableCandidate(phase, subphase, 'build-house', [
              {
                type: 'build_house', building: 'house', house: house.house,
                rotation: placement.rotation, index,
              }, finish,
            ], {}, `build-house:${house.house}`))
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
          ], {}, `build-garden:${garden.house}`))
        }
      }
    }
  } else if (subphase === 6) {
    for (const manager of actions.get('open_restaurant')?.managers ?? []) {
      for (const restaurantAction of manager.actions ?? []) {
        for (const placement of restaurantAction.placements ?? []) {
          for (const index of spreadSample(placement.legalSquares ?? [], 3)) {
            const base = {
              type: 'open_restaurant', restaurantAction: restaurantAction.type,
              manager: manager.manager, rotation: placement.rotation, index,
            }
            if (restaurantAction.type === 'move') {
              for (const fromIndex of restaurantAction.restaurants ?? []) {
                candidates.push(stableCandidate(phase, subphase, 'move-restaurant', [
                  { ...base, fromIndex }, finish,
                ], {}, `move-restaurant:${manager.manager}:${fromIndex}`))
              }
            } else {
              candidates.push(stableCandidate(
                phase,
                subphase,
                'open-restaurant',
                [base, finish],
                {},
                `open-restaurant:${manager.manager}`,
              ))
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
  const buckets = new Map()
  for (const candidate of candidates) {
    const encoded = JSON.stringify(candidate.actions)
    if (seenActions.has(encoded)) continue
    const diversityKey = candidate.diversityKey ?? candidate.intent
    const bucket = buckets.get(diversityKey) ?? []
    if (bucket.length >= perIntentBudget) continue
    seenActions.add(encoded)
    bucket.push(candidate)
    buckets.set(diversityKey, bucket)
  }
  const kept = []
  for (let rank = 0; rank < perIntentBudget && kept.length < totalBudget; rank += 1) {
    for (const bucket of buckets.values()) {
      if (bucket[rank]) kept.push(bucket[rank])
      if (kept.length >= totalBudget) break
    }
  }
  return kept
}

/**
 * Deterministically generate a small phase-local candidate set from advertised legal actions.
 * This deliberately avoids cross-phase Cartesian products; multi-turn composition belongs to search.
 */
function enumerateCandidates(view) {
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

  return candidates
}

function validateBudgets(totalBudget, perIntentBudget) {
  assert.ok(Number.isInteger(totalBudget) && totalBudget > 0, 'totalBudget must be positive')
  assert.ok(Number.isInteger(perIntentBudget) && perIntentBudget > 0, 'perIntentBudget must be positive')
}

export function generateCandidates(view, { totalBudget = 32, perIntentBudget = 6 } = {}) {
  validateBudgets(totalBudget, perIntentBudget)
  const bounded = capCandidates(enumerateCandidates(view), { totalBudget, perIntentBudget })
  const { phase, subphase } = view.state
  assert.ok(bounded.length > 0, `no safe candidate for phase ${phase}/${subphase}`)
  return bounded
}

/** Audit-only view of candidates before and after diversity/budget pruning. */
export function auditCandidateGeneration(view, { totalBudget = 32, perIntentBudget = 6 } = {}) {
  validateBudgets(totalBudget, perIntentBudget)
  const enumeratedCandidates = enumerateCandidates(view)
  const boundedCandidates = capCandidates(enumeratedCandidates, { totalBudget, perIntentBudget })
  const { phase, subphase } = view.state
  assert.ok(boundedCandidates.length > 0, `no safe candidate for phase ${phase}/${subphase}`)
  return { enumeratedCandidates, boundedCandidates }
}
