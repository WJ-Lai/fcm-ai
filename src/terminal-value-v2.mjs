import assert from 'node:assert/strict'

export const TERMINAL_VALUE_FEATURE_VERSION = 'fcm.terminal-value-features.v2'

export const TERMINAL_VALUE_FEATURE_NAMES = Object.freeze([
  'turn',
  'turnOrderPosition',
  'turnOrderKnown',
  'bankPerPlayer',
  'cash',
  'cashLead',
  'salaryDue',
  'salaryGap',
  'unitPrice',
  'discount',
  'activeEmployees',
  'beachEmployees',
  'freeSlots',
  'recruitingCapacity',
  'salaryDiscountPoints',
  'trainingCapacity',
  'trainingLevel2Capacity',
  'trainingLevel3Capacity',
  'unlimitedTraining',
  'productionWorkers',
  'productionGoodsCoverage',
  'marketingWorkers',
  'campaignTypeCoverage',
  'restaurantBuilders',
  'beachManagement',
  'beachRecruiting',
  'beachTraining',
  'beachMarketing',
  'beachProduction',
  'beachRestaurantBuilding',
  'beachTrainable',
  'beachSalaryLiable',
  'restaurants',
  'milestonesHeld',
  'openMilestoneOptions',
  'inventoryTotal',
  'inventoryDemandFit',
  'reachableDemandUnits',
  'unreachableDemandUnits',
  'servableDemandUnits',
  'uncontestedServableUnits',
  'reachableHouses',
  'exclusivelyReachableHouses',
  'closestHouses',
  'tiedClosestHouses',
  'distanceDeficitTotal',
  'productionMarketingSynergy',
  'reachableEngineReady',
  'futureDemandSupplyEngineReady',
  'bankrupt',
])

function finite(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`)
  return value
}

function countDemandFit(resources, demandedGoods) {
  const remaining = new Map()
  for (const good of demandedGoods) remaining.set(good, (remaining.get(good) ?? 0) + 1)
  let fit = 0
  for (const good of resources) {
    const count = remaining.get(good) ?? 0
    if (count <= 0) continue
    remaining.set(good, count - 1)
    fit += 1
  }
  return fit
}

/**
 * Extract a bounded, seat-visible value feature set. Every rule-sensitive input was already
 * calculated by the official DecisionView adapter; this module only performs semantic counting.
 */
export function extractTerminalValueFeatures(view, { seat = view?.state?.mySeat } = {}) {
  assert.ok(view?.state, 'seat-visible DecisionView state is required')
  assert.ok(Number.isInteger(seat) && seat >= 0, 'seat must be non-negative')
  const state = view.state
  const players = state.players
  assert.ok(Array.isArray(players) && players.length >= 2, 'players are required')
  const player = players.find((entry) => entry.index === seat) ?? players[seat]
  assert.ok(player, `seat ${seat} is absent from players`)
  const economyPlayers = state.decisionSupport?.economyPlayers
  assert.ok(Array.isArray(economyPlayers), 'official economyPlayers decision support is required')
  const economy = economyPlayers.find((entry) => entry.seat === seat)
  assert.ok(economy, `official economyPlayers entry for seat ${seat} is required`)
  const threats = state.decisionSupport?.strategicThreats
  assert.ok(threats, 'official strategicThreats decision support is required')
  assert.ok(Array.isArray(threats.market?.houses), 'official strategicThreats market is required')
  assert.ok(Array.isArray(threats.reachability?.houses),
    'official strategicThreats reachability is required')

  const capacities = economy.capacities ?? {}
  const production = capacities.production ?? []
  const marketing = capacities.marketing ?? []
  assert.ok(Array.isArray(production) && Array.isArray(marketing),
    'official production and marketing capacities are required')
  const productionGoods = new Set(production.flatMap((worker) => worker.goods ?? []))
  const campaignTypes = new Set(marketing.flatMap((worker) => worker.campaignTypes ?? []))
  const reachable = new Map(threats.reachability.houses.map((house) => [
    house.house,
    (house.reachableSeats ?? []).includes(seat),
  ]))
  const pipeline = economy.pipeline
  assert.ok(pipeline?.active && pipeline?.beach && pipeline?.owned,
    'official employee capability pipeline is required')

  let reachableHouses = 0
  let exclusivelyReachableHouses = 0
  let closestHouses = 0
  let tiedClosestHouses = 0
  let distanceDeficitTotal = 0
  for (const house of threats.reachability.houses) {
    const distances = house.restaurantDistances ?? []
    const mine = distances[seat]
    if (!Number.isFinite(mine) || mine === -99) continue
    reachableHouses += 1
    if ((house.reachableSeats ?? []).length === 1) exclusivelyReachableHouses += 1
    const finiteDistances = distances.filter((distance) => Number.isFinite(distance) && distance !== -99)
    if (!finiteDistances.length) continue
    const best = Math.min(...finiteDistances)
    if (mine === best) {
      closestHouses += 1
      if (finiteDistances.filter((distance) => distance === best).length > 1) tiedClosestHouses += 1
    } else {
      distanceDeficitTotal += mine - best
    }
  }

  let reachableDemandUnits = 0
  let unreachableDemandUnits = 0
  let servableDemandUnits = 0
  let uncontestedServableUnits = 0
  const reachableGoods = []
  for (const house of threats.market.houses) {
    const advertised = house.advertisedGoods ?? []
    if (reachable.get(house.house) === true) {
      reachableDemandUnits += advertised.length
      reachableGoods.push(...advertised)
    } else {
      unreachableDemandUnits += advertised.length
    }
    if ((house.eligibleSupplierSeats ?? []).includes(seat)) {
      const units = (house.activeGoods ?? []).length
      servableDemandUnits += units
      if (house.eligibleSupplierSeats.length === 1) uncontestedServableUnits += units
    }
  }

  const money = finite(player.money ?? 0, 'player money')
  const opponentMoney = players
    .filter((entry) => entry.index !== seat)
    .map((entry) => finite(entry.money ?? 0, 'opponent money'))
  const salaryDue = finite(economy.salary?.due ?? 0, 'salary due')
  const productionWorkers = production.length
  const marketingWorkers = marketing.length
  const fullTurnOrder = state.fullTurnOrder ?? []
  const turnOrderPosition = fullTurnOrder.findIndex((entry) => (
    entry === seat || entry === player.name
  ))
  const beachFamily = (name) => finite(pipeline.beach[name] ?? 0, `beach ${name}`)
  const ownedFamily = (name) => finite(pipeline.owned[name] ?? 0, `owned ${name}`)
  const features = {
    version: TERMINAL_VALUE_FEATURE_VERSION,
    turn: finite(state.turn, 'turn'),
    turnOrderPosition: turnOrderPosition >= 0 ? turnOrderPosition : players.length,
    turnOrderKnown: turnOrderPosition >= 0 ? 1 : 0,
    bankPerPlayer: finite((state.bank ?? 0) / players.length, 'bank per player'),
    cash: money,
    cashLead: money - Math.max(...opponentMoney),
    salaryDue,
    salaryGap: Math.max(0, salaryDue - money),
    unitPrice: finite(economy.price?.unit ?? 0, 'unit price'),
    discount: finite(economy.price?.discount ?? 0, 'discount'),
    activeEmployees: finite(economy.company?.activeEmployees ?? 0, 'active employees'),
    beachEmployees: finite(economy.company?.beachEmployees ?? 0, 'beach employees'),
    freeSlots: finite(economy.freeSlots ?? 0, 'free slots'),
    recruitingCapacity: finite(capacities.recruiting?.total ?? 0, 'recruiting capacity'),
    salaryDiscountPoints: finite(
      capacities.recruiting?.salaryDiscountPoints ?? 0,
      'salary discount points',
    ),
    trainingCapacity: finite(capacities.training?.total ?? 0, 'training capacity'),
    trainingLevel2Capacity: finite(capacities.training?.level2 ?? 0, 'level2 training capacity'),
    trainingLevel3Capacity: finite(capacities.training?.level3 ?? 0, 'level3 training capacity'),
    unlimitedTraining: capacities.training?.unlimited ? 1 : 0,
    productionWorkers,
    productionGoodsCoverage: productionGoods.size,
    marketingWorkers,
    campaignTypeCoverage: campaignTypes.size,
    restaurantBuilders: (capacities.restaurantBuilders ?? []).length,
    beachManagement: beachFamily('management'),
    beachRecruiting: beachFamily('recruiting'),
    beachTraining: beachFamily('training'),
    beachMarketing: beachFamily('marketing'),
    beachProduction: beachFamily('production'),
    beachRestaurantBuilding: beachFamily('restaurantBuilding'),
    beachTrainable: beachFamily('trainable'),
    beachSalaryLiable: beachFamily('salaryLiable'),
    restaurants: (player.restaurants ?? []).length,
    milestonesHeld: (player.milestones ?? []).length,
    openMilestoneOptions: (threats.milestones ?? []).filter(
      (milestone) => milestone.claimWindowOpen && milestone.seatsStillEligible?.includes(seat),
    ).length,
    inventoryTotal: (player.resources ?? []).length,
    inventoryDemandFit: countDemandFit(player.resources ?? [], reachableGoods),
    reachableDemandUnits,
    unreachableDemandUnits,
    servableDemandUnits,
    uncontestedServableUnits,
    reachableHouses,
    exclusivelyReachableHouses,
    closestHouses,
    tiedClosestHouses,
    distanceDeficitTotal,
    productionMarketingSynergy: Math.min(productionWorkers, marketingWorkers),
    reachableEngineReady: productionWorkers > 0 && marketingWorkers > 0 &&
      reachableDemandUnits > 0 ? 1 : 0,
    futureDemandSupplyEngineReady: ownedFamily('production') > 0 &&
      ownedFamily('marketing') > 0 && reachableHouses > 0 ? 1 : 0,
    bankrupt: player.bankrupt ? 1 : 0,
  }

  for (const name of TERMINAL_VALUE_FEATURE_NAMES) finite(features[name], name)
  return Object.freeze(features)
}

export function terminalValueFeatureVector(features) {
  assert.equal(features?.version, TERMINAL_VALUE_FEATURE_VERSION, 'feature version mismatch')
  return TERMINAL_VALUE_FEATURE_NAMES.map((name) => finite(features[name], name))
}
