import assert from 'node:assert/strict'

function entry(legalActions, type) {
  const value = legalActions.actions.find((action) => action.type === type)
  assert.ok(value, `history requires legal action ${type}`)
  return value
}

function multisetDifference(all, kept) {
  const remaining = [...all]
  for (const item of kept) {
    const index = remaining.indexOf(item)
    assert.notEqual(index, -1, `cleanup history keeps unavailable resource ${item}`)
    remaining.splice(index, 1)
  }
  return remaining
}

function mapTraining(payload, legalActions) {
  assert.equal(payload.length % 2, 0, 'training history must contain from/to pairs')
  const available = entry(legalActions, 'train').available
  const actions = []
  for (let index = 0; index < payload.length; index += 2) {
    const encodedFrom = payload[index]
    const toEmployee = payload[index + 1]
    const origin = encodedFrom === -1 ? 1 : encodedFrom >= 50 ? 2 : 0
    const employee = encodedFrom >= 50 ? encodedFrom - 50 : encodedFrom
    const candidate = available.find((item) => item.id === employee && item.origin === origin)
    assert.ok(candidate, `training source ${encodedFrom} is absent from legal actions`)
    const upgrade = candidate.upgrades.find((item) => item.id === toEmployee)
    assert.ok(upgrade, `training ${encodedFrom}->${toEmployee} is absent from legal actions`)
    actions.push({ type: 'train', employee, toEmployee, origin, steps: upgrade.steps })
  }
  return actions
}

function mapMarketing(payload, legalActions, importIndex, reference) {
  const legal = entry(legalActions, 'marketing')
  const campaign = payload[0]
  const index = importIndex(payload[1])
  const good = payload[2]
  assert.equal(typeof good, 'number', 'base replay marketing good must be a single id')
  let cursor = 3
  let marketer = reference.BRAND_DIRECTOR
  if (campaign >= 4 && campaign <= 16) marketer = payload[cursor++]
  const marketerOption = legal.options.find((option) => option.marketer === marketer)
  assert.ok(marketerOption, `marketing employee ${marketer} is absent from legal actions`)
  const campaignOption = marketerOption.campaigns.find((option) => option.campaign === campaign)
  assert.ok(campaignOption, `campaign ${campaign} is absent from legal actions`)
  const isRotatable = campaignOption.placements.some((placement) => placement.rotated === true)
  const rotated = isRotatable ? payload[cursor++] === 1 : false
  const duration = cursor < payload.length ? payload[cursor] : 9
  const placement = campaignOption.placements.find((option) => option.rotated === rotated)
  let actionIndex = index
  const campaignData = reference.MARKETING_CAMPAIGNS?.[campaign]
  if (campaignData && campaignData.type === reference.AIRPLANE) {
    actionIndex = placement?.legalSquares.find((candidate) => {
      if (rotated) {
        if (candidate % 5 === 0) return candidate - 1 === index
        if ((candidate + 1) % 5 === 0) return candidate + 1 === index
      } else if (candidate % (reference.ssW * 5) < reference.ssW) {
        return candidate - reference.ssW === index
      } else {
        return candidate + reference.ssW === index
      }
      return false
    })
  }
  assert.ok(
    placement?.legalSquares.includes(actionIndex),
    `campaign ${campaign} index ${index} rotated=${rotated} is illegal; legal=${JSON.stringify(placement?.legalSquares)}`,
  )
  return [{ type: 'marketing', marketer, campaign, good, duration, rotated, index: actionIndex }]
}

function mapBuilding(eventCode, payload, legalActions, importIndex) {
  const legal = entry(legalActions, 'build_house')
  const index = importIndex(payload[0])
  const house = payload[1]
  if (eventCode === 13) {
    const rotation = payload.length > 2 ? Number(payload[2]) : 1
    const option = legal.houses.find((item) => item.house === house)
    assert.ok(
      option?.placements.some((item) => item.rotation === rotation && item.legalSquares.includes(index)),
      `house ${house} rotation ${rotation} index ${index} is illegal`,
    )
    return [{ type: 'build_house', building: 'house', house, rotation, index }]
  }
  const option = legal.gardens.find((item) => item.house === house)
  const edge = option?.edges.find((item) => item.index === index)
  assert.ok(edge, `garden for house ${house} index ${index} is illegal`)
  return [{
    type: 'build_house', building: 'garden', house,
    houseIndex: option.houseIndex, edge: edge.edge, index,
  }]
}

function mapRestaurant(eventCode, payload, legalActions, importIndex, reference) {
  const legal = entry(legalActions, 'open_restaurant')
  const index = importIndex(payload[0])
  const rotation = payload.length > 2 ? payload[2] : 3
  const restaurantAction = eventCode === 15 ? 'move' : 'create'
  const manager = eventCode === 15
    ? reference.REGIONAL_MANAGER
    : payload[1] === 1 ? reference.LOCAL_MANAGER : reference.REGIONAL_MANAGER
  const fromIndex = eventCode === 15 ? importIndex(payload[1]) : undefined
  const managerOption = legal.managers.find((item) => item.manager === manager)
  const actionOption = managerOption?.actions.find((item) => item.type === restaurantAction)
  assert.ok(actionOption, `${restaurantAction} is unavailable for manager ${manager}`)
  if (restaurantAction === 'move') {
    assert.ok(actionOption.restaurants.includes(fromIndex), `restaurant ${fromIndex} cannot move`)
  }
  const placement = actionOption.placements.find((item) => item.rotation === rotation)
  assert.ok(placement?.legalSquares.includes(index), `restaurant index ${index} is illegal`)
  return [{ type: 'open_restaurant', restaurantAction, manager, fromIndex, rotation, index }]
}

/** Convert one public-history decision group into official Agent actions, without executing it. */
export function mapReplayDecisionGroup(group, { legalActions, state, importIndex, reference }) {
  assert.equal(group.events.length > 0, true, 'decision group is empty')
  const actions = []
  for (const event of group.events) {
    const payload = event.payload
    switch (event.eventCode) {
      case 1:
        actions.push({ type: 'place_restaurant', index: importIndex(payload[0]), rotation: payload[1] ?? 3 })
        break
      case 2:
        actions.push({ type: 'choose_reserve_card', cardValue: payload[0] })
        break
      case 3:
        actions.push(payload[0].length === 0
          ? { type: 'end_turn' }
          : { type: 'place_employees', slots: payload[0].map((_item, i) => i), employees: [...payload[0]] })
        break
      case 5:
        actions.push({ type: 'choose_turn_order', turnOrderPosition: payload[0] })
        break
      case 7:
        actions.push(...payload.map((employee) => ({ type: 'hire', employee })))
        break
      case 8:
        actions.push(...mapTraining(payload, legalActions))
        break
      case 9:
        actions.push(...mapMarketing(payload, legalActions, importIndex, reference))
        break
      case 12:
      case 13:
        actions.push(...mapBuilding(event.eventCode, payload, legalActions, importIndex))
        break
      case 14:
      case 15:
        actions.push(...mapRestaurant(event.eventCode, payload, legalActions, importIndex, reference))
        break
      case 24:
        actions.push({
          type: 'resolve_cleanup',
          discardResources: multisetDifference(state.players[group.seat].resources, payload),
        })
        break
      default:
        throw new Error(`history event ${event.eventCode} is not exactly invertible`)
    }
  }
  if (group.phase === 5) actions.push({ type: 'next_subphase' })
  return actions
}
