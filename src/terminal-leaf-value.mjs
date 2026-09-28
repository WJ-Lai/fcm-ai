import assert from 'node:assert/strict'

import { scorePhaseRoutedDifference } from './phase-value-model.mjs'
import {
  TERMINAL_VALUE_FEATURE_NAMES,
  extractTerminalValueFeatures,
  terminalValueFeatureVector,
} from './terminal-value-v2.mjs'

function phaseBucket(turn) {
  assert.ok(Number.isInteger(turn) && turn > 0, 'turn must be positive')
  if (turn <= 3) return 'early'
  if (turn <= 6) return 'middle'
  return 'late'
}

export function scoreTerminalLeafFeaturePair(model, {
  turn,
  seatFeatures,
  opponentFeatures,
}) {
  assert.equal(model?.schemaVersion, 'fcm.phase-routed-value-model.v1', 'model schema mismatch')
  assert.deepEqual(
    model.featureNames,
    [...TERMINAL_VALUE_FEATURE_NAMES],
    'terminal value feature contract drift',
  )
  const seatVector = terminalValueFeatureVector(seatFeatures)
  const opponentVector = terminalValueFeatureVector(opponentFeatures)
  const difference = seatVector.map((value, index) => value - opponentVector[index])
  const phase = phaseBucket(turn)
  const score = scorePhaseRoutedDifference(model, { turn, difference })
  return Object.freeze({
    score,
    phase,
    abstained: model.phaseStatus?.[phase]?.calibrated === false,
    evaluatorVersion: model.schemaVersion,
    featureVersion: seatFeatures.version,
  })
}

/** Evaluate a two-player leaf from the acting seat's public/seat-visible DecisionView only. */
export function explainTerminalLeafValue(model, view, { seat = view?.state?.mySeat } = {}) {
  assert.ok(view?.state, 'seat-visible DecisionView is required')
  assert.equal(seat, view.state.mySeat, 'leaf evaluation must use the acting seat viewpoint')
  const seats = (view.state.players ?? []).map((player) => player.index)
  assert.equal(seats.length, 2, 'terminal value v2 currently supports two-player leaves only')
  assert.ok(seats.includes(seat), `acting seat ${seat} is absent`)
  const opponentSeat = seats.find((candidate) => candidate !== seat)
  const result = scoreTerminalLeafFeaturePair(model, {
    turn: view.state.turn,
    seatFeatures: extractTerminalValueFeatures(view, { seat }),
    opponentFeatures: extractTerminalValueFeatures(view, { seat: opponentSeat }),
  })
  return Object.freeze({ ...result, seat, opponentSeat })
}
