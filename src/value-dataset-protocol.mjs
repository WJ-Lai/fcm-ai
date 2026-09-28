import assert from 'node:assert/strict'

export const VALUE_DATASET_PROTOCOL_VERSION = 'fcm.value-dataset.v2'

export const VALUE_DATASET_MATCHUPS = Object.freeze([
  ['deterministic-strategy', 'safe-first-legal'],
  ['safe-first-legal', 'deterministic-strategy'],
  ['random-legal', 'safe-first-legal'],
  ['safe-first-legal', 'random-legal'],
  ['deterministic-strategy', 'random-legal'],
  ['random-legal', 'deterministic-strategy'],
  ['official-builtin', 'safe-first-legal'],
  ['safe-first-legal', 'official-builtin'],
  ['official-builtin', 'random-legal'],
  ['random-legal', 'official-builtin'],
  ['official-builtin', 'deterministic-strategy'],
  ['deterministic-strategy', 'official-builtin'],
])

export const VALUE_DATASET_SPLIT_COUNTS = Object.freeze({
  development: 12,
  calibration: 12,
  'promotion-holdout': 24,
})

export function valueDatasetGameSpec(split, index) {
  const count = VALUE_DATASET_SPLIT_COUNTS[split]
  assert.ok(count, `unknown dataset split ${split}`)
  assert.ok(Number.isInteger(index) && index >= 0 && index < count,
    `${split} game index is out of range`)
  const block = Math.floor(index / VALUE_DATASET_MATCHUPS.length)
  const matchup = VALUE_DATASET_MATCHUPS[index % VALUE_DATASET_MATCHUPS.length]
  return Object.freeze({
    protocolVersion: VALUE_DATASET_PROTOCOL_VERSION,
    split,
    index,
    block,
    gameId: `${split}-${String(index).padStart(2, '0')}`,
    seed: `${VALUE_DATASET_PROTOCOL_VERSION}:${split}:${index}`,
    policies: Object.freeze([...matchup]),
  })
}

export function listValueDatasetGames(split) {
  const count = VALUE_DATASET_SPLIT_COUNTS[split]
  assert.ok(count, `unknown dataset split ${split}`)
  return Object.freeze(Array.from({ length: count }, (_, index) => (
    valueDatasetGameSpec(split, index)
  )))
}
