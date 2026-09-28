import assert from 'node:assert/strict'
import test from 'node:test'

import { excludeManifestGames, manifestGameIds } from './replay-split.mjs'


test('manifestGameIds rejects duplicate or invalid game ids', () => {
  assert.deepEqual(manifestGameIds({ records: [{ gameId: 10 }, { gameId: 20 }] }), [10, 20])
  assert.throws(
    () => manifestGameIds({ records: [{ gameId: 10 }, { gameId: 10 }] }),
    /duplicate game id 10/,
  )
  assert.throws(() => manifestGameIds({ records: [{ gameId: '10' }] }), /invalid game id/)
})


test('excludeManifestGames creates a disjoint stable validation slice', () => {
  const manifest = {
    schemaVersion: 'fcm.public-replay-manifest.v1',
    records: [
      { gameId: 30, file: '30.json.gz' },
      { gameId: 10, file: '10.json.gz' },
      { gameId: 20, file: '20.json.gz' },
    ],
  }
  const selected = excludeManifestGames(manifest, new Set([10]))
  assert.deepEqual(selected.records.map((record) => record.gameId), [30, 20])
  assert.equal(selected.schemaVersion, manifest.schemaVersion)
  assert.notEqual(selected, manifest)
  assert.deepEqual(manifest.records.map((record) => record.gameId), [30, 10, 20])
})


test('excludeManifestGames fails when an exclusion id is absent', () => {
  const manifest = { records: [{ gameId: 10 }] }
  assert.throws(() => excludeManifestGames(manifest, new Set([99])), /missing exclusion game id 99/)
})
