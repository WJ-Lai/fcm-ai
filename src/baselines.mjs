function byType(view) {
  return new Map(view.legalActions.actions.map((action) => [action.type, action]))
}

function employeeName(candidate) {
  return typeof candidate.name === 'object' ? candidate.name?.title ?? '' : String(candidate.name ?? '')
}

function pick(items, random) {
  if (!items?.length) return undefined
  return items[Math.floor(random() * items.length)]
}

export function seededPolicyRandom(seed) {
  let state = 2166136261
  for (const character of String(seed)) {
    state ^= character.charCodeAt(0)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** A deterministic completion baseline. It is intentionally weak, but never emits raw invented actions. */
export function safeFirstLegal(view) {
  const actions = byType(view)
  const state = view.state
  const me = state.players[state.mySeat]

  if ([0, 1].includes(state.phase)) {
    if (me.restaurants?.length) return [{ type: 'end_turn' }]
    const place = actions.get('place_restaurant')
    return [
      { type: 'place_restaurant', index: place.legalSquares[0], rotation: place.rotation },
      { type: 'end_turn' },
    ]
  }
  if (state.phase === 2) return [{ type: 'choose_reserve_card', cardValue: 1 }]
  if (state.phase === 3) {
    const place = actions.get('place_employees')
    const count = Math.min(place.beach.length, place.slots.length)
    if (!count) return [{ type: 'end_turn' }]
    const rolePriority = (employee) => {
      if ([27, 28, 29, 30, 31].includes(employee)) return 0
      if ([13, 14, 15, 16].includes(employee)) return 1
      if ([17, 18, 19].includes(employee)) return 2
      return 3
    }
    const selected = place.beach
      .map((employee, order) => ({ employee, order }))
      .sort((left, right) => (
        rolePriority(left.employee) - rolePriority(right.employee) || left.order - right.order
      ))
      .slice(0, count)
      .map(({ employee }) => employee)
    return [{
      type: 'place_employees',
      employees: selected,
      slots: place.slots.slice(0, count),
    }]
  }
  if (state.phase === 4) {
    return [{
      type: 'choose_turn_order',
      turnOrderPosition: actions.get('choose_turn_order').positions[0],
    }]
  }
  if (state.phase === 5) {
    if (state.subphase === 1) {
      const hire = actions.get('hire')
      const owned = new Set([...(me.employees ?? []), ...(me.beach ?? [])])
      const roles = [
        ['Recruiting Girl', new Set([17, 18, 19])],
        ['Kitchen Trainee', new Set([27, 28, 29, 30, 31])],
        ['Marketing Trainee', new Set([13, 14, 15, 16])],
      ]
      const candidate = roles.flatMap(([name, ids]) => (
        [...owned].some((id) => ids.has(id))
          ? []
          : (hire?.candidates ?? []).filter((item) => employeeName(item) === name)
      ))[0] ?? hire?.candidates?.[0]
      if (candidate && hire.recruitingPoints > 0) {
        return [{ type: 'hire', employee: candidate.id }, { type: 'next_subphase' }]
      }
    }
    if (state.subphase === 3) {
      const marketing = actions.get('marketing')
      for (const marketer of marketing?.options ?? []) {
        for (const campaign of marketer.campaigns ?? []) {
          for (const placement of campaign.placements ?? []) {
            const impact = placement.houseImpacts?.find((item) => item.houses?.length)
            if (!impact && !placement.legalSquares?.length) continue
            return [
              {
                type: 'marketing', marketer: marketer.marketer,
                campaign: campaign.campaign, good: 4,
                duration: campaign.durationInfinite ? 9 : 1,
                rotated: placement.rotated,
                index: impact?.index ?? placement.legalSquares[0],
              },
              { type: 'next_subphase' },
            ]
          }
        }
      }
    }
    if (state.subphase === 4) {
      const producer = actions.get('produce')?.producers?.[0]
      if (producer) {
        return [
          {
            type: 'produce', producer: producer.id,
            item: producer.goods.includes(4) ? 4 : producer.goods[0], amount: 1,
          },
          { type: 'next_subphase' },
        ]
      }
    }
    if (actions.has('next_subphase')) return [{ type: 'next_subphase' }]
    return [{ type: 'end_turn' }]
  }
  if (state.phase === 7) {
    const payday = actions.get('resolve_payday')
    return [{
      type: 'resolve_payday',
      fireEmployees: payday.currentlyAffordable ? [] : payday.fireableEmployees,
      payWithResources: [],
    }]
  }
  if (state.phase === 9) {
    const cleanup = actions.get('resolve_cleanup')
    const action = {
      type: 'resolve_cleanup',
      discardResources: cleanup.resources.slice(0, cleanup.minimumDiscardCount),
    }
    if (cleanup.requiresFridgeChoice) action.fridgeChoice = 'rest'
    return [action]
  }
  if (state.phase === 11) {
    const radio = actions.get('place_pizza_radio')
    return radio.legalSquares?.length
      ? [{ type: 'place_pizza_radio', campaign: radio.campaign, house: radio.house, index: radio.legalSquares[0] }]
      : [{ type: 'place_pizza_radio', campaign: radio.campaign, house: radio.house, skip: true }]
  }
  throw new Error(`safe-first-legal has no decision for phase ${state.phase}/${state.subphase}`)
}

/** A seeded weak baseline that samples only fully specified legal-action fields. */
export function randomLegal(view, random = Math.random) {
  const actions = byType(view)
  const state = view.state
  const me = state.players[state.mySeat]

  if ([0, 1].includes(state.phase)) {
    if (me.restaurants?.length) return [{ type: 'end_turn' }]
    const place = actions.get('place_restaurant')
    return [
      { type: 'place_restaurant', index: pick(place.legalSquares, random), rotation: place.rotation },
      { type: 'end_turn' },
    ]
  }
  if (state.phase === 2) {
    const values = actions.get('choose_reserve_card').cardValues
    return [{ type: 'choose_reserve_card', cardValue: values.includes(1) ? 1 : pick(values, random) }]
  }
  if (state.phase === 3) {
    const place = actions.get('place_employees')
    const rolePriority = (employee) => {
      if ([27, 28, 29, 30, 31].includes(employee)) return 0
      if ([13, 14, 15, 16].includes(employee)) return 1
      if ([17, 18, 19].includes(employee)) return 2
      return 3
    }
    const shuffled = place.beach
      .map((employee) => ({ employee, key: random() }))
      .sort((left, right) => rolePriority(left.employee) - rolePriority(right.employee) || left.key - right.key)
      .map(({ employee }) => employee)
    const count = Math.min(shuffled.length, place.slots.length)
    return count === 0
      ? [{ type: 'end_turn' }]
      : [{
          type: 'place_employees',
          employees: shuffled.slice(0, count),
          slots: place.slots.slice(0, count),
        }]
  }
  if (state.phase === 4) {
    return [{
      type: 'choose_turn_order',
      turnOrderPosition: pick(actions.get('choose_turn_order').positions, random),
    }]
  }
  if (state.phase === 5) {
    if (state.subphase === 1) {
      const hire = actions.get('hire')
      const owned = new Set([...(me.employees ?? []), ...(me.beach ?? [])])
      const roles = [
        ['Recruiting Girl', new Set([17, 18, 19])],
        ['Kitchen Trainee', new Set([27, 28, 29, 30, 31])],
        ['Marketing Trainee', new Set([13, 14, 15, 16])],
      ]
      const priorityPool = roles.flatMap(([name, ids]) => (
        [...owned].some((id) => ids.has(id))
          ? []
          : (hire?.candidates ?? []).filter((item) => employeeName(item) === name)
      ))
      const candidate = pick(priorityPool.length ? priorityPool : hire?.candidates, random)
      if (candidate && hire.recruitingPoints > 0) {
        return [{ type: 'hire', employee: candidate.id }, { type: 'next_subphase' }]
      }
    }
    if (state.subphase === 2) {
      const trainee = pick(actions.get('train')?.available, random)
      const upgrade = pick(trainee?.upgrades, random)
      if (trainee && upgrade && random() < 0.7) {
        return [
          {
            type: 'train', employee: trainee.id, toEmployee: upgrade.id,
            origin: trainee.origin, steps: upgrade.steps,
          },
          { type: 'next_subphase' },
        ]
      }
    }
    if (state.subphase === 3) {
      const marketing = actions.get('marketing')
      const impactful = (marketing?.options ?? []).flatMap((marketer) => (
        marketer.campaigns.flatMap((campaign) => (
          campaign.placements.flatMap((placement) => (
            (placement.houseImpacts ?? [])
              .filter((impact) => impact.houses?.length)
              .map((impact) => ({ marketer, campaign, placement, index: impact.index }))
          ))
        ))
      ))
      const choice = pick(impactful, random)
      if (choice) {
        const { marketer, campaign, placement, index } = choice
        return [
          {
            type: 'marketing', marketer: marketer.marketer, campaign: campaign.campaign,
            good: marketing.goods.includes(4)
              ? 4
              : pick(marketing.goods, random),
            duration: campaign.durationInfinite ? 9 : campaign.maxDuration,
            rotated: placement.rotated, index,
          },
          { type: 'next_subphase' },
        ]
      }
    }
    if (state.subphase === 4) {
      const producer = pick(actions.get('produce')?.producers, random)
      if (producer) {
        return [
          {
            type: 'produce', producer: producer.id,
            item: producer.goods.includes(4) ? 4 : pick(producer.goods, random), amount: 1,
          },
          { type: 'next_subphase' },
        ]
      }
    }
    return actions.has('next_subphase') ? [{ type: 'next_subphase' }] : [{ type: 'end_turn' }]
  }
  return safeFirstLegal(view)
}
