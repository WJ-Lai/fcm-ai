import assert from 'node:assert/strict'


export function manifestGameIds(manifest) {
  assert.ok(Array.isArray(manifest?.records), 'manifest records must be an array')
  const ids = []
  const seen = new Set()
  for (const record of manifest.records) {
    assert.ok(Number.isSafeInteger(record?.gameId), 'invalid game id')
    assert.ok(!seen.has(record.gameId), `duplicate game id ${record.gameId}`)
    seen.add(record.gameId)
    ids.push(record.gameId)
  }
  return ids
}


export function excludeManifestGames(manifest, excludedGameIds) {
  const available = new Set(manifestGameIds(manifest))
  for (const gameId of excludedGameIds) {
    assert.ok(available.has(gameId), `missing exclusion game id ${gameId}`)
  }
  return {
    ...structuredClone(manifest),
    records: manifest.records
      .filter((record) => !excludedGameIds.has(record.gameId))
      .map((record) => structuredClone(record)),
  }
}
