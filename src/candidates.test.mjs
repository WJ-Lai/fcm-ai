import assert from 'node:assert/strict'
import test from 'node:test'

import { generateCandidates } from './candidates.mjs'

function view(phase, subphase, actions, state = {}) {
  return {
    state: { phase, subphase, mySeat: 0, players: [{ resources: [] }], ...state },
    legalActions: { yourTurn: true, actions },
  }
}

test('candidate generation is deterministic, unique and strictly budgeted', () => {
  const input = view(0, 1, [{
    type: 'place_restaurant', placements: [
      { rotation: 0, legalSquares: [10, 11, 12] },
      { rotation: 1, legalSquares: [20, 21, 22] },
    ],
  }, { type: 'end_turn' }])
  const first = generateCandidates(input, { totalBudget: 4, perIntentBudget: 3 })
  const second = generateCandidates(input, { totalBudget: 4, perIntentBudget: 3 })
  assert.deepEqual(first, second)
  assert.equal(first.length, 3)
  assert.equal(new Set(first.map((item) => item.id)).size, first.length)
  assert.equal(first[0].intent, 'restaurant-start')
  assert.ok(first.every((item) => item.actions[0].type === 'place_restaurant'))
})

test('restructuring produces bounded strategic orderings and an explicit fallback', () => {
  const candidates = generateCandidates(view(3, 1, [{
    type: 'place_employees', beach: [5, 13, 27, 17], slots: [0, 1],
  }, { type: 'end_turn' }]))
  assert.deepEqual(candidates[0].actions, [{ type: 'end_turn' }])
  assert.deepEqual(candidates.find((item) => item.intent === 'demand-engine').actions[0].employees, [13, 5])
  assert.deepEqual(candidates.find((item) => item.intent === 'supply-engine').actions[0].employees, [27, 5])
})

test('working-day candidates never form a cross-phase Cartesian plan', () => {
  const candidates = generateCandidates(view(5, 2, [
    { type: 'train', available: [
      { id: 5, origin: 0, upgrades: [{ id: 6, steps: 1 }, { id: 7, steps: 2 }] },
      { id: -1, origin: 1, upgrades: [{ id: 17, steps: 1 }] },
    ] },
    { type: 'next_subphase' },
    { type: 'end_turn' },
  ]))
  assert.equal(candidates.length, 4)
  assert.ok(candidates.every((item) => item.actions.length <= 2))
  assert.deepEqual(candidates.find((item) => item.details.upgrade === 17).actions[0], {
    type: 'train', employee: -1, toEmployee: 17, origin: 1, steps: 1,
  })
})

test('recruiting proposes bounded multi-hire sequences instead of only single actions', () => {
  const candidates = generateCandidates(view(5, 1, [
    { type: 'hire', recruitingPoints: 2, candidates: [
      { id: 17, name: 'Recruiting Girl' },
      { id: 27, name: 'Kitchen Trainee' },
    ] },
    { type: 'next_subphase' },
  ], {
    availableEmployees: { 17: 4, 27: 4 },
  }))
  const batches = candidates.map((item) => item.actions.map((action) => action.type === 'hire'
    ? action.employee
    : action.type))
  assert.ok(batches.some((batch) => JSON.stringify(batch) === JSON.stringify([17, 17, 'next_subphase'])))
  assert.ok(batches.some((batch) => JSON.stringify(batch) === JSON.stringify([17, 27, 'next_subphase'])))
  assert.ok(candidates.length <= 32)
})

test('per-intent pruning cannot discard later advertised hire roles', () => {
  const hireables = [0, 5, 10, 13, 17, 20, 23, 27].map((id) => ({ id, name: `employee-${id}` }))
  const candidates = generateCandidates(view(5, 1, [
    { type: 'hire', recruitingPoints: 1, candidates: hireables },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 1 })
  assert.deepEqual(
    candidates.filter((item) => item.actions[0].type === 'hire')
      .map((item) => item.actions[0].employee).sort((a, b) => a - b),
    hireables.map((item) => item.id),
  )
})

test('multi-hire search does not starve management-trainee engine pairs behind early roles', () => {
  const candidates = generateCandidates(view(5, 1, [
    { type: 'hire', recruitingPoints: 2, candidates: [
      { id: 17, name: 'Recruiting Girl' },
      { id: 20, name: 'Trainer' },
      { id: 5, name: 'Management Trainee' },
      { id: 13, name: 'Marketing Trainee' },
      { id: 27, name: 'Kitchen Trainee' },
      { id: 0, name: 'Errand Boy' },
      { id: 10, name: 'Waitress' },
      { id: 23, name: 'Pricing Manager' },
    ] },
    { type: 'next_subphase' },
  ], { availableEmployees: { 0: 4, 5: 4, 10: 4, 13: 4, 17: 4, 20: 4, 23: 4, 27: 4 } }))
  assert.ok(candidates.some((candidate) => {
    const hired = candidate.actions.filter((action) => action.type === 'hire')
      .map((action) => action.employee).sort((left, right) => left - right)
    return JSON.stringify(hired) === JSON.stringify([5, 13])
  }))
})

test('training proposes bounded multi-action sequences when multiple training points exist', () => {
  const candidates = generateCandidates(view(5, 2, [
    { type: 'train', trainingPoints: 2, available: [
      { id: 5, origin: 0, upgrades: [{ id: 6, steps: 1 }] },
      { id: 13, origin: 0, upgrades: [{ id: 14, steps: 1 }] },
    ] },
    { type: 'next_subphase' },
  ]))
  assert.ok(candidates.some((item) => (
    item.actions.filter((action) => action.type === 'train').length === 2 &&
    item.actions.at(-1).type === 'next_subphase'
  )))
  assert.ok(candidates.length <= 32)
})

test('training may use separate copies of the same employee id in one batch', () => {
  const duplicate = { id: 5, origin: 0, upgrades: [
    { id: 1, steps: 1 }, { id: 11, steps: 1 },
  ] }
  const candidates = generateCandidates(view(5, 2, [
    { type: 'train', trainingPoints: 2, available: [duplicate, duplicate] },
    { type: 'next_subphase' },
  ]))
  assert.ok(candidates.some((item) => {
    const trained = item.actions.filter((action) => action.type === 'train')
    return trained.length === 2 &&
      trained.every((action) => action.employee === 5 && action.origin === 0) &&
      new Set(trained.map((action) => action.toEmployee)).size === 2
  }))
})

test('per-intent pruning preserves training options from every employee source', () => {
  const candidates = generateCandidates(view(5, 2, [
    { type: 'train', trainingPoints: 1, available: [
      { id: 5, origin: 0, upgrades: [{ id: 6, steps: 1 }] },
      { id: 13, origin: 0, upgrades: [{ id: 14, steps: 1 }] },
      { id: 27, origin: 0, upgrades: [{ id: 28, steps: 1 }] },
    ] },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 1 })
  assert.deepEqual(
    candidates.filter((item) => item.actions[0].type === 'train')
      .map((item) => item.actions[0].employee).sort((a, b) => a - b),
    [5, 13, 27],
  )
})

test('training diversity keeps distinct upgrades from one flexible source', () => {
  const upgrades = [1, 2, 3, 6, 7, 8, 11, 12].map((id) => ({ id, steps: 1 }))
  const candidates = generateCandidates(view(5, 2, [
    { type: 'train', trainingPoints: 1, available: [{ id: 5, origin: 0, upgrades }] },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 1 })
  assert.deepEqual(
    candidates.filter((candidate) => candidate.actions[0].type === 'train')
      .map((candidate) => candidate.actions[0].toEmployee).sort((left, right) => left - right),
    upgrades.map((upgrade) => upgrade.id),
  )
})

test('marketing prioritizes demanded goods and impactful legal squares under budget', () => {
  const candidates = generateCandidates(view(5, 3, [
    { type: 'marketing', goods: [0, 1, 2, 3, 4], options: [{ marketer: 13, campaigns: [{
      campaign: 14, durationInfinite: false, maxDuration: 2,
      placements: [{ rotated: false, legalSquares: [40, 41], houseImpacts: [
        { index: 40, houses: [1, 2] }, { index: 41, houses: [] },
      ] }],
    }] }] },
    { type: 'next_subphase' },
  ], { houseDemands: [{ goods: [4, 4] }, { goods: [4, 3] }] }), {
    totalBudget: 5, perIntentBudget: 4,
  })
  assert.equal(candidates.length, 5)
  const marketing = candidates.filter((item) => item.intent === 'create-demand')
  assert.ok(marketing.every((item) => [40, 41].includes(item.actions[0].index)))
  assert.equal(marketing[0].actions[0].good, 4)
})

test('marketing diversity budget preserves at least one candidate for every advertised good', () => {
  const candidates = generateCandidates(view(5, 3, [
    { type: 'marketing', goods: [0, 1, 2, 3, 4], options: [{ marketer: 13, campaigns: [{
      campaign: 14, durationInfinite: false, maxDuration: 2,
      placements: [{ rotated: false, legalSquares: [40, 41], houseImpacts: [
        { index: 40, houses: [1] }, { index: 41, houses: [2] },
      ] }],
    }] }] },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 2 })
  assert.deepEqual(
    [...new Set(candidates.flatMap((item) => item.actions
      .filter((action) => action.type === 'marketing')
      .map((action) => action.good)))].sort(),
    [0, 1, 2, 3, 4],
  )
})

test('spatial diversity does not let the first house consume the build budget', () => {
  const candidates = generateCandidates(view(5, 5, [
    { type: 'build_house', remainingBuilds: 1, houses: [1, 2, 3].map((house) => ({
      house,
      placements: [{ rotation: 0, legalSquares: [house * 10, house * 10 + 1] }],
    })), gardens: [] },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 1 })
  assert.deepEqual(
    [...new Set(candidates.flatMap((item) => item.actions
      .filter((action) => action.type === 'build_house')
      .map((action) => action.house)))].sort(),
    [1, 2, 3],
  )
})

test('tight build budget round-robins across houses before taking second coordinates', () => {
  const candidates = generateCandidates(view(5, 5, [
    { type: 'build_house', remainingBuilds: 1, houses: [1, 2, 3].map((house) => ({
      house,
      placements: [{ rotation: 0, legalSquares: [house * 10, house * 10 + 1] }],
    })), gardens: [] },
    { type: 'next_subphase' },
  ]), { totalBudget: 4, perIntentBudget: 6 })
  assert.deepEqual(
    candidates.flatMap((item) => item.actions
      .filter((action) => action.type === 'build_house')
      .map((action) => action.house)),
    [1, 2, 3],
  )
})

test('restaurant coordinate sampling spans the advertised range instead of taking a prefix', () => {
  const candidates = generateCandidates(view(5, 6, [
    { type: 'open_restaurant', managers: [{ manager: 2, actions: [{
      type: 'create', placements: [{ rotation: 0, legalSquares: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    }] }] },
    { type: 'next_subphase' },
  ]), { totalBudget: 4, perIntentBudget: 6 })
  assert.deepEqual(
    candidates.flatMap((item) => item.actions
      .filter((action) => action.type === 'open_restaurant')
      .map((action) => action.index)),
    [0, 5, 9],
  )
})

test('restaurant diversity preserves each manager and action family', () => {
  const managers = [1, 2].map((manager) => ({ manager, actions: [
    { type: 'create', placements: [{ rotation: 0, legalSquares: [manager * 10] }] },
    { type: 'move', restaurants: [manager * 100], placements: [{ rotation: 1, legalSquares: [manager * 10 + 1] }] },
  ] }))
  const candidates = generateCandidates(view(5, 6, [
    { type: 'open_restaurant', managers },
    { type: 'next_subphase' },
  ]), { totalBudget: 32, perIntentBudget: 1 })
  assert.deepEqual(
    [...new Set(candidates.flatMap((item) => item.actions
      .filter((action) => action.type === 'open_restaurant')
      .map((action) => `${action.manager}:${action.restaurantAction}`)))].sort(),
    ['1:create', '1:move', '2:create', '2:move'],
  )
})

test('production, drink collection and cleanup candidates use only advertised values', () => {
  const production = generateCandidates(view(5, 4, [
    { type: 'produce', producers: [{ id: 12, goods: [4, 3] }] },
    { type: 'collect_drinks', collectors: [{ id: 20, startMode: 'square', starts: [55, 66] }] },
    { type: 'next_subphase' },
  ]))
  assert.ok(production.some((item) => item.actions[0].type === 'produce'))
  assert.deepEqual(production.find((item) => item.intent === 'collect').actions[0].route, [55])

  const cleanup = generateCandidates(view(9, 1, [{
    type: 'resolve_cleanup', resources: [4, 1, 3, 99], minimumDiscardCount: 2,
    requiresFridgeChoice: true, kimchiResource: 99,
  }]))
  assert.deepEqual(cleanup.map((item) => item.actions[0]), [
    { type: 'resolve_cleanup', discardResources: [], fridgeChoice: 'rest' },
    { type: 'resolve_cleanup', discardResources: [], fridgeChoice: 'kimchi' },
  ])
})

test('candidate generation fails closed when it is not the seat turn', () => {
  const input = view(4, 1, [{ type: 'choose_turn_order', positions: [0] }])
  input.legalActions.yourTurn = false
  assert.throws(() => generateCandidates(input), /outside this seat turn/)
})
