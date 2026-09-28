import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadStrategyFixtureManifest,
  validateStrategyFixtureManifest,
} from './strategy-fixture.mjs'

const manifestPath = 'fixtures/strategy-v1/manifest.json'

test('frozen strategy fixtures cover every independent promotion axis', async () => {
  const manifest = await loadStrategyFixtureManifest(manifestPath)
  assert.ok(manifest.cases.length >= 10)
  assert.ok(new Set(manifest.cases.filter((item) => item.source.phase === 5)
    .map((item) => item.source.subphase)).size >= 3)
})

test('strategy fixture policy input rejects hidden opponent state', async () => {
  const manifest = structuredClone(await loadStrategyFixtureManifest(manifestPath))
  manifest.cases[0].policyInput.observed.push({ reserveCards: [100, 200, 300] })
  assert.throws(
    () => validateStrategyFixtureManifest(manifest),
    /leaks private policy keys/,
  )
})

test('preferred strategy labels cannot bypass legality or feasibility', async () => {
  const manifest = structuredClone(await loadStrategyFixtureManifest(manifestPath))
  const preferred = manifest.cases[0].candidates.find(
    (candidate) => candidate.id === manifest.cases[0].expected.preferredCandidate,
  )
  preferred.feasibility = 'infeasible'
  assert.throws(
    () => validateStrategyFixtureManifest(manifest),
    /preferred candidate must be feasible/,
  )
})

test('abstraction pairs require different choices while hidden pairs require the same policy', async () => {
  const manifest = await loadStrategyFixtureManifest(manifestPath)
  const abstraction = Map.groupBy(
    manifest.cases.filter((item) => item.abstractionProbe),
    (item) => item.abstractionProbe.pairId,
  )
  for (const pair of abstraction.values()) {
    assert.equal(pair.length, 2)
    assert.notEqual(pair[0].expected.preferredCandidate, pair[1].expected.preferredCandidate)
  }
  const hidden = Map.groupBy(
    manifest.cases.filter((item) => item.metamorphicProbe),
    (item) => item.metamorphicProbe.pairId,
  )
  for (const pair of hidden.values()) {
    assert.deepEqual(pair[0].policyInput, pair[1].policyInput)
    assert.equal(pair[0].expected.preferredCandidate, pair[1].expected.preferredCandidate)
  }
})
