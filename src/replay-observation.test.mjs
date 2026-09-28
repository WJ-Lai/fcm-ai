import assert from 'node:assert/strict'
import test from 'node:test'

import { encodeSimpleModel } from './public-replay.mjs'
import {
  buildDecisionGroups,
  toDecisionObservation,
  validateDecisionObservation,
} from './replay-observation.mjs'


function model({ phase, turn = 1, subphase = 1, players = 3 }) {
  return [
    [[], []],
    Array.from({ length: players }, (_, seat) => ({
      name: `seat-${seat}`, displayName: `seat-${seat}`, money: 0,
    })),
    [], [], [], 100,
    { phase, turn, subphase, turnOrder: [0, 1, 2], newTurnOrder: [], fullTurnOrder: [0, 1, 2] },
    [], [], [], 3, [], false, [], [], [], [], [], [], [-1, -1, -1], {},
  ]
}


function capture(rows) {
  return {
    history: rows.map(([eventCode, seat]) => ({ eventCode, seat, payload: [] })),
    replay: { states: rows.map(([, , phase, turn, subphase]) => (
      encodeSimpleModel(model({ phase, turn, subphase }))
    )) },
  }
}


test('simultaneous choices all use the pre-group public frame', () => {
  const value = capture([
    [25, -1, 3, 2, 1],
    [3, 2, 3, 2, 1],
    [3, 0, 3, 2, 1],
    [3, 1, 3, 2, 1],
  ])
  const groups = buildDecisionGroups(value)
  assert.deepEqual(groups.map(({ seat, sourceIndex, eventIndexes }) => ({
    seat, sourceIndex, eventIndexes,
  })), [
    { seat: 0, sourceIndex: 0, eventIndexes: [2] },
    { seat: 1, sourceIndex: 0, eventIndexes: [3] },
    { seat: 2, sourceIndex: 0, eventIndexes: [1] },
  ])
})


test('multiple working-day events become one MCP command boundary', () => {
  const value = capture([
    [25, -1, 5, 4, 1],
    [7, 0, 5, 4, 1],
    [21, 0, 5, 4, 1],
    [7, 0, 5, 4, 1],
    [8, 0, 5, 4, 2],
  ])
  const groups = buildDecisionGroups(value)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].eventIndexes, [1, 3])
  assert.equal(groups[0].sourceIndex, 0)
  assert.deepEqual(groups[1].eventIndexes, [4])
  assert.equal(groups[1].sourceIndex, 3)
})


function mcpState(overrides = {}) {
  return {
    gameID: 1, version: '1', gameName: 'x', phase: 3, phaseName: 'Restructuring',
    turn: 1, subphase: 1, turnOrder: [0, 1], newTurnOrder: [], fullTurnOrder: [0, 1],
    bank: 100, bankBroken: false, mySeat: 0, myName: 'seat-0',
    players: [
      { index: 0, name: 'seat-0' },
      { index: 1, name: 'seat-1' },
    ],
    availableEmployees: {}, houseDemands: [], activeCampaigns: [],
    availableMilestones: [], availableMarketingCampaigns: [],
    board: {}, history: [], chat: [{ message: 'ignore this' }],
    untrustedTextFields: ['chat'], decisionSupport: {}, startingOptions: {}, catalog: {},
    ...overrides,
  }
}


test('decision observation is MCP-complete but drops chat and hidden engine fields', () => {
  const observation = toDecisionObservation({
    state: mcpState(),
    legalActions: { yourTurn: true, actions: [{ type: 'place_employees' }] },
    metadata: { seat: 0 },
  })
  validateDecisionObservation(observation, { playerCount: 2 })
  assert.equal(Object.hasOwn(observation.state, 'chat'), false)
  assert.deepEqual(observation.state.untrustedTextFields, [])

  const unsafe = structuredClone(observation)
  unsafe.state.players[1].context = { preMoveData: ['secret'] }
  assert.throws(
    () => validateDecisionObservation(unsafe, { playerCount: 2 }),
    /hidden engine field/,
  )
})


test('decision observation fails closed when a current MCP field is missing', () => {
  const state = mcpState()
  delete state.decisionSupport
  const observation = toDecisionObservation({
    state,
    legalActions: { yourTurn: true, actions: [{ type: 'hire' }] },
    metadata: { seat: 0 },
  })
  assert.throws(
    () => validateDecisionObservation(observation, { playerCount: 2 }),
    /decisionSupport is missing/,
  )
})
