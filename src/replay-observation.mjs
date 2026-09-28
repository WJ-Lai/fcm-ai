import assert from 'node:assert/strict'

import { decodeSimpleModel } from './public-replay.mjs'


export const OBSERVATION_SCHEMA = 'fcm.public-replay-observation-audit.v1'

// These history events represent choices a human made. Automatic resolution, milestones,
// income, dinner and phase markers are intentionally not treated as policy decisions.
export const BASE_DECISION_EVENT_CODES = new Set([
  1,  // place starting restaurant
  2,  // choose reserve card
  3,  // choose company structure
  5,  // choose turn order
  7,  // hire
  8,  // train
  9,  // start marketing campaign
  10, // produce food/drinks
  12, // build garden
  13, // build house
  14, // open restaurant
  15, // move restaurant
  23, // fire employee during payday
  24, // choose fridge resources during cleanup
])

export const SIMULTANEOUS_PHASES = new Set([2, 3, 7, 9])

const REQUIRED_MCP_STATE_KEYS = new Set([
  'gameID', 'version', 'gameName', 'phase', 'phaseName', 'turn', 'subphase',
  'turnOrder', 'newTurnOrder', 'fullTurnOrder', 'bank', 'bankBroken', 'mySeat',
  'myName', 'players', 'availableEmployees', 'houseDemands', 'activeCampaigns',
  'availableMilestones', 'availableMarketingCampaigns', 'board', 'history',
  'untrustedTextFields', 'decisionSupport', 'startingOptions', 'catalog',
])

const HIDDEN_KEYS = new Set([
  'reserveCards', 'context', 'preMoveData', 'moveData', 'moveDataRaw',
  'chosenResCard', 'savedEODpreset', 'subphaseResetData', 'wholeTurnResetData',
])

const WORKING_DAY_SUBPHASE_BY_EVENT = new Map([
  [7, 1],
  [8, 2],
  [9, 3],
  [10, 4],
  [12, 5],
  [13, 5],
  [14, 6],
  [15, 6],
])


function groupKey({ phase, turn, subphase, seat }) {
  if (SIMULTANEOUS_PHASES.has(phase)) return `simultaneous:${phase}:${turn}`
  return `sequential:${phase}:${turn}:${subphase}:${seat}`
}


/**
 * Locate MCP command boundaries rather than treating every history row as a separate decision.
 * A working-day MCP command may contain several hires/trains/etc. Simultaneous phases must all
 * use the state before the first player's choice, never a replay frame that reveals earlier picks.
 */
export function buildDecisionGroups(capture) {
  assert.equal(capture.history.length, capture.replay.states.length, 'history/state count differs')
  const groups = new Map()
  for (const [eventIndex, event] of capture.history.entries()) {
    if (!BASE_DECISION_EVENT_CODES.has(event.eventCode) || event.seat < 0) continue
    const model = decodeSimpleModel(capture.replay.states[eventIndex])
    const gameflow = model[6]
    const descriptor = {
      phase: gameflow.phase,
      turn: gameflow.turn,
      // Replay history does not persist synthetic next-subphase markers, so its reconstructed
      // gameflow often remains at subphase 1. The event family is the authoritative public marker.
      subphase: gameflow.phase === 5
        ? (WORKING_DAY_SUBPHASE_BY_EVENT.get(event.eventCode) ?? gameflow.subphase ?? null)
        : (gameflow.subphase ?? null),
      seat: event.seat,
    }
    const key = groupKey(descriptor)
    const existing = groups.get(key)
    if (existing) {
      existing.eventIndexes.push(eventIndex)
      existing.events.push(event)
      existing.seats.add(event.seat)
    } else {
      groups.set(key, {
        key,
        ...descriptor,
        simultaneous: SIMULTANEOUS_PHASES.has(descriptor.phase),
        eventIndexes: [eventIndex],
        events: [event],
        seats: new Set([event.seat]),
      })
    }
  }

  const result = []
  for (const group of groups.values()) {
    const sourceIndex = Math.min(...group.eventIndexes) - 1
    if (sourceIndex < 0) continue
    if (group.simultaneous) {
      // One public baseline feeds one seat-scoped decision per participant. This is the key
      // anti-leak property: later replay events cannot become another player's observation.
      for (const seat of [...group.seats].sort((left, right) => left - right)) {
        result.push({
          ...group,
          seats: undefined,
          seat,
          sourceIndex,
          eventIndexes: group.eventIndexes.filter(
            (index) => capture.history[index].seat === seat,
          ),
          events: group.events.filter((event) => event.seat === seat),
        })
      }
    } else {
      result.push({ ...group, seats: undefined, sourceIndex })
    }
  }
  return result.sort((left, right) => (
    left.sourceIndex - right.sourceIndex || left.seat - right.seat
  ))
}


function walkKeys(value, visit, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkKeys(item, visit, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    visit(key, item, `${path}.${key}`)
    walkKeys(item, visit, `${path}.${key}`)
  }
}


function jsonCopy(value) {
  return JSON.parse(JSON.stringify(value))
}


/** Drop public chat because it is irrelevant to rules decisions and is an injection surface. */
export function toDecisionObservation({ state, legalActions, metadata }) {
  // MCP state contains Vue reactive arrays. JSON is the actual transport boundary and safely
  // removes proxies without retaining a live reference to the rules engine.
  const visibleState = jsonCopy(state)
  delete visibleState.chat
  visibleState.untrustedTextFields = (visibleState.untrustedTextFields ?? [])
    .filter((field) => field !== 'chat')
  return {
    schemaVersion: OBSERVATION_SCHEMA,
    metadata: jsonCopy(metadata),
    state: visibleState,
    legalActions: jsonCopy(legalActions),
    omittedPublicFields: ['chat'],
  }
}


export function validateDecisionObservation(observation, { playerCount }) {
  assert.equal(observation?.schemaVersion, OBSERVATION_SCHEMA, 'unsupported observation schema')
  assert.ok(observation.metadata && typeof observation.metadata === 'object', 'metadata is missing')
  assert.ok(observation.state && typeof observation.state === 'object', 'state is missing')
  assert.ok(observation.legalActions && typeof observation.legalActions === 'object', 'legal actions are missing')
  for (const key of REQUIRED_MCP_STATE_KEYS) {
    assert.ok(Object.hasOwn(observation.state, key), `MCP state field ${key} is missing`)
  }
  assert.equal(Object.hasOwn(observation.state, 'chat'), false, 'chat must not enter decision data')
  assert.equal(observation.state.mySeat, observation.metadata.seat, 'actor seat differs')
  assert.equal(observation.state.myName, `seat-${observation.metadata.seat}`, 'actor name is not anonymous')
  assert.equal(observation.state.players.length, playerCount, 'player count differs')
  assert.equal(observation.legalActions.yourTurn, true, 'observation is not at an actor decision')
  assert.ok(Array.isArray(observation.legalActions.actions), 'legal action list is missing')
  assert.ok(observation.legalActions.actions.length > 0, 'legal action list is empty')
  for (const [seat, player] of observation.state.players.entries()) {
    assert.equal(player.index, seat, `player ${seat} index differs`)
    assert.equal(player.name, `seat-${seat}`, `player ${seat} name is not anonymous`)
  }
  walkKeys(observation, (key, _value, path) => {
    assert.equal(HIDDEN_KEYS.has(key), false, `${path}: hidden engine field entered observation`)
  })
  return observation
}


/**
 * Check that the MCP projection did not silently lose public engine state while loading a replay.
 * Player structure is not compared because startPlayerTurn adds actor-local empty slots, but all
 * stable public economy, board, phase and supply values must match the source replay frame.
 */
export function assertReplayParity(observation, sourceModel) {
  const state = observation.state
  const gameflow = sourceModel[6]
  assert.equal(state.phase, gameflow.phase, 'phase differs from replay')
  assert.equal(state.subphase, gameflow.subphase, 'subphase differs from replay')
  assert.equal(state.turn, gameflow.turn, 'turn differs from replay')
  assert.equal(state.bank, sourceModel[5], 'bank differs from replay')
  assert.equal(state.bankBroken, sourceModel[12], 'bankBroken differs from replay')
  assert.deepEqual(state.turnOrder, gameflow.turnOrder, 'turn order differs from replay')
  assert.deepEqual(state.newTurnOrder, gameflow.newTurnOrder, 'new turn order differs from replay')
  assert.deepEqual(state.fullTurnOrder, gameflow.fullTurnOrder, 'full turn order differs from replay')
  assert.deepEqual(state.board.tiles, sourceModel[0][0], 'map tiles differ from replay')
  assert.deepEqual(state.board.gardens, sourceModel[8], 'gardens differ from replay')
  assert.deepEqual(state.board.houses, sourceModel[9], 'houses differ from replay')
  assert.deepEqual(state.board.needs, sourceModel[11], 'house needs differ from replay')
  assert.deepEqual(state.board.campaigns, sourceModel[7], 'campaigns differ from replay')
  assert.deepEqual(state.board.freeways, sourceModel[14], 'freeways differ from replay')
  assert.deepEqual(state.board.parks, sourceModel[15], 'parks differ from replay')
  assert.deepEqual(state.board.newRoads, sourceModel[16], 'new roads differ from replay')
  for (const [seat, player] of state.players.entries()) {
    const source = sourceModel[1][seat]
    assert.equal(player.money, source.money, `seat ${seat} money differs from replay`)
    assert.equal(player.bankrupt, Boolean(source.bankrupt), `seat ${seat} bankruptcy differs`)
    assert.deepEqual(player.resources, source.resources ?? [], `seat ${seat} resources differ`)
    assert.deepEqual(player.restaurants, source.restaurants ?? [], `seat ${seat} restaurants differ`)
    assert.deepEqual(player.milestones, source.milestones ?? [], `seat ${seat} milestones differ`)
  }
}
