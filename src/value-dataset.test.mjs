import assert from 'node:assert/strict'
import test from 'node:test'

import { TERMINAL_VALUE_FEATURE_NAMES, TERMINAL_VALUE_FEATURE_VERSION } from './terminal-value-v2.mjs'
import { buildPairwiseTrainingRows, validateValueDataset } from './value-dataset.mjs'

function features(offset) {
  return Object.fromEntries([
    ['version', TERMINAL_VALUE_FEATURE_VERSION],
    ...TERMINAL_VALUE_FEATURE_NAMES.map((name, index) => [name, index + offset]),
  ])
}

function dataset() {
  return {
    schemaVersion: 'fcm.value-feature-dataset.v2',
    protocolVersion: 'fcm.value-dataset.v2',
    rulesetHash: 'a'.repeat(64),
    split: 'development',
    featureVersion: TERMINAL_VALUE_FEATURE_VERSION,
    featureNames: [...TERMINAL_VALUE_FEATURE_NAMES],
    games: [
      {
        gameId: 'development-00', seed: 'fcm.value-dataset.v2:development:0',
        completed: true, policies: ['a', 'b'],
        observations: [
          { turn: 1, phase: 5, seats: [{ seat: 0, features: features(2) }, { seat: 1, features: features(1) }] },
          { turn: 2, phase: 5, seats: [{ seat: 0, features: features(4) }, { seat: 1, features: features(2) }] },
        ],
        terminal: [{ seat: 0, money: 20 }, { seat: 1, money: 10 }],
      },
      {
        gameId: 'development-01', seed: 'fcm.value-dataset.v2:development:1',
        completed: true, policies: ['b', 'a'],
        observations: [
          { turn: 1, phase: 5, seats: [{ seat: 0, features: features(0) }, { seat: 1, features: features(3) }] },
        ],
        terminal: [{ seat: 0, money: 5 }, { seat: 1, money: 30 }],
      },
    ],
  }
}

test('dataset validation and pair rows preserve equal total weight per game', () => {
  const input = dataset()
  assert.equal(validateValueDataset(input).games, 2)
  const rows = buildPairwiseTrainingRows(input)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].target, 1)
  assert.equal(rows[2].target, -1)
  assert.equal(rows[0].weight, 0.5)
  assert.equal(rows[1].weight, 0.5)
  assert.equal(rows[2].weight, 1)
  assert.equal(rows[0].difference.length, TERMINAL_VALUE_FEATURE_NAMES.length)
  assert.ok(rows[0].difference.every((value) => value === 1))
})

test('dataset rejects private engine payloads, incomplete games, and feature drift', () => {
  const privatePayload = dataset()
  privatePayload.games[0].observations[0].gameData = 'hidden'
  assert.throws(() => validateValueDataset(privatePayload), /forbidden key gameData/)

  const incomplete = dataset()
  incomplete.games[0].completed = false
  assert.throws(() => validateValueDataset(incomplete), /must be completed/)

  const drift = dataset()
  delete drift.games[0].observations[0].seats[0].features.cash
  assert.throws(() => validateValueDataset(drift), /feature names drift/)
})

test('dataset binds every observation to one official ruleset hash', () => {
  const missing = dataset()
  delete missing.rulesetHash
  assert.throws(() => validateValueDataset(missing), /ruleset hash/)

  const malformed = dataset()
  malformed.rulesetHash = 'not-a-ruleset-hash'
  assert.throws(() => validateValueDataset(malformed), /ruleset hash/)
})

test('promotion holdout remains sealed unless the frozen protocol explicitly opens it', () => {
  const holdout = dataset()
  holdout.split = 'promotion-holdout'
  assert.throws(() => validateValueDataset(holdout), /promotion holdout is sealed/)
  holdout.promotionHoldoutOpened = true
  assert.equal(validateValueDataset(holdout, { allowPromotionHoldout: true }).games, 2)
})
