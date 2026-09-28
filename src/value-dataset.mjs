import assert from 'node:assert/strict'

import {
  TERMINAL_VALUE_FEATURE_NAMES,
  TERMINAL_VALUE_FEATURE_VERSION,
  terminalValueFeatureVector,
} from './terminal-value-v2.mjs'

const FORBIDDEN_KEYS = new Set([
  'token', 'password', 'credential', 'gameData', 'moveData', 'snapshot', 'legalActions',
  'reserveCard', 'reserveCards',
])

function rejectForbiddenKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenKeys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_KEYS.has(key), `forbidden key ${key}`)
    rejectForbiddenKeys(nested)
  }
}

function validateFeatures(features) {
  assert.equal(features?.version, TERMINAL_VALUE_FEATURE_VERSION, 'feature version drift')
  const names = Object.keys(features).filter((key) => key !== 'version').sort()
  assert.deepEqual(names, [...TERMINAL_VALUE_FEATURE_NAMES].sort(), 'feature names drift')
  terminalValueFeatureVector(features)
}

export function validateValueDataset(dataset, { allowPromotionHoldout = false } = {}) {
  assert.equal(dataset?.schemaVersion, 'fcm.value-feature-dataset.v2', 'dataset schema mismatch')
  assert.equal(dataset.protocolVersion, 'fcm.value-dataset.v2', 'dataset protocol mismatch')
  assert.match(dataset.rulesetHash ?? '', /^[a-f0-9]{64}$/, 'official ruleset hash is required')
  assert.ok(['development', 'calibration', 'promotion-holdout'].includes(dataset.split),
    'unknown dataset split')
  if (dataset.split === 'promotion-holdout') {
    assert.ok(allowPromotionHoldout && dataset.promotionHoldoutOpened === true,
      'promotion holdout is sealed')
  }
  assert.equal(dataset.featureVersion, TERMINAL_VALUE_FEATURE_VERSION, 'feature version drift')
  assert.deepEqual(dataset.featureNames, [...TERMINAL_VALUE_FEATURE_NAMES], 'feature order drift')
  assert.ok(Array.isArray(dataset.games) && dataset.games.length > 0, 'dataset games are required')
  rejectForbiddenKeys(dataset)

  const identities = new Set()
  const seeds = new Set()
  let observations = 0
  for (const game of dataset.games) {
    assert.ok(typeof game.gameId === 'string' && game.gameId, 'gameId is required')
    assert.ok(!identities.has(game.gameId), `duplicate gameId ${game.gameId}`)
    identities.add(game.gameId)
    assert.ok(typeof game.seed === 'string' && game.seed, 'seed is required')
    assert.ok(!seeds.has(game.seed), `duplicate seed ${game.seed}`)
    seeds.add(game.seed)
    assert.equal(game.completed, true, `game ${game.gameId} must be completed`)
    assert.ok(Array.isArray(game.observations) && game.observations.length > 0,
      `game ${game.gameId} observations are required`)
    for (const observation of game.observations) {
      assert.ok(Number.isInteger(observation.turn) && observation.turn > 0,
        'observation turn must be positive')
      assert.ok(Number.isInteger(observation.phase), 'observation phase is required')
      assert.deepEqual(observation.seats.map((entry) => entry.seat), [0, 1],
        'observation seats must be ordered 0,1')
      observation.seats.forEach((entry) => validateFeatures(entry.features))
      observations += 1
    }
    assert.deepEqual(game.terminal.map((entry) => entry.seat), [0, 1],
      'terminal seats must be ordered 0,1')
    game.terminal.forEach((entry) => assert.ok(Number.isFinite(entry.money),
      'terminal money must be finite'))
  }
  return { games: dataset.games.length, observations }
}

export function buildPairwiseTrainingRows(dataset, options = {}) {
  validateValueDataset(dataset, options)
  return dataset.games.flatMap((game) => {
    const margin = game.terminal[0].money - game.terminal[1].money
    if (margin === 0) return []
    const target = Math.sign(margin)
    const weight = 1 / game.observations.length
    return game.observations.map((observation) => {
      const left = terminalValueFeatureVector(observation.seats[0].features)
      const right = terminalValueFeatureVector(observation.seats[1].features)
      return {
        gameId: game.gameId,
        split: dataset.split,
        turn: observation.turn,
        phase: observation.phase,
        difference: left.map((value, index) => value - right[index]),
        target,
        terminalMargin: margin,
        weight,
      }
    })
  })
}
