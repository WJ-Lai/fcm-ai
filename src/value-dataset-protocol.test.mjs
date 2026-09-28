import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  VALUE_DATASET_PROTOCOL_VERSION,
  VALUE_DATASET_MATCHUPS,
  VALUE_DATASET_SPLIT_COUNTS,
  listValueDatasetGames,
  valueDatasetGameSpec,
} from './value-dataset-protocol.mjs'

test('v2 predeclares disjoint development, calibration, and promotion seeds', () => {
  const development = listValueDatasetGames('development')
  const calibration = listValueDatasetGames('calibration')
  const holdout = listValueDatasetGames('promotion-holdout')
  assert.equal(development.length, 12)
  assert.equal(calibration.length, 12)
  assert.equal(holdout.length, 24)
  const allSeeds = [...development, ...calibration, ...holdout].map((game) => game.seed)
  assert.equal(new Set(allSeeds).size, allSeeds.length)
  assert.ok(allSeeds.every((seed) => seed.includes(VALUE_DATASET_PROTOCOL_VERSION)))
})

test('each 12-game block balances every declared matchup across both seats', () => {
  const games = listValueDatasetGames('development')
  const signatures = new Set(games.map((game) => game.policies.join(' vs ')))
  assert.equal(signatures.size, 12)
  for (const game of games) {
    const reverse = game.policies.toReversed().join(' vs ')
    assert.ok(signatures.has(reverse), `missing reverse matchup ${reverse}`)
  }
  assert.equal(games.filter((game) => game.policies.includes('official-builtin')).length, 6)
})

test('game identity is stable and out-of-range or unknown splits fail closed', () => {
  assert.deepEqual(
    valueDatasetGameSpec('calibration', 3),
    valueDatasetGameSpec('calibration', 3),
  )
  assert.throws(() => valueDatasetGameSpec('development', 12), /out of range/)
  assert.throws(() => listValueDatasetGames('test'), /unknown dataset split/)
})

test('frozen protocol manifest matches the executable split before collection', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('../fixtures/value-calibration-v2/protocol.json', import.meta.url),
    'utf8',
  ))
  assert.equal(manifest.protocolVersion, VALUE_DATASET_PROTOCOL_VERSION)
  assert.deepEqual(manifest.splitCounts, VALUE_DATASET_SPLIT_COUNTS)
  assert.deepEqual(manifest.matchups, VALUE_DATASET_MATCHUPS)
  assert.equal(manifest.promotionHoldoutOpened, false)
})
