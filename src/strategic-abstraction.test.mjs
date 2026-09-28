import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  STRATEGIC_ABSTRACTION_VERSION,
  strategicProjectionDigest,
  trustedPlannerCacheKey,
} from './strategic-abstraction.mjs'

const manifest = JSON.parse(await readFile(
  new URL('../fixtures/abstraction-v1/manifest.json', import.meta.url), 'utf8',
))

function merge(base, patch) {
  if (Array.isArray(patch)) return structuredClone(patch)
  if (!patch || typeof patch !== 'object') return patch
  const result = structuredClone(base ?? {})
  for (const [key, value] of Object.entries(patch)) result[key] = merge(result[key], value)
  return result
}

test('frozen abstraction pairs separate every material strategic boundary', () => {
  assert.equal(manifest.abstractionVersion, STRATEGIC_ABSTRACTION_VERSION)
  assert.equal(manifest.cases.filter((item) => item.expectedRelation === 'different').length, 6)
  assert.deepEqual(new Set(manifest.cases.map((item) => item.axis)), new Set([
    'restaurant-blocking', 'sequential-inventory', 'salary-timing', 'milestone-closure',
    'bank-horizon', 'reusable-commitment', 'invariance',
  ]))
  assert.equal(new Set(manifest.cases.map((item) => item.id)).size, manifest.cases.length)
  for (const fixture of manifest.cases) {
    const left = merge(manifest.common, fixture.leftPatch)
    const right = merge(manifest.common, fixture.rightPatch)
    const leftDigest = strategicProjectionDigest(left)
    const rightDigest = strategicProjectionDigest(right)
    if (fixture.expectedRelation === 'different') {
      assert.notEqual(leftDigest, rightDigest, `${fixture.id} abstraction collision`)
      assert.notEqual(fixture.preferredMacro.left, fixture.preferredMacro.right)
    } else {
      assert.equal(leftDigest, rightDigest, `${fixture.id} irrelevant mutation leaked`)
      assert.equal(fixture.preferredMacro.left, fixture.preferredMacro.right)
    }
  }
})

test('trusted planner cache key includes every declared strategic dimension', () => {
  const input = {
    ...manifest.common,
    rulesetHash: 'sha256:rules',
    snapshotDigest: `sha256:${'a'.repeat(64)}`,
    seat: 0,
    candidateId: 'candidate-a',
    horizon: 2,
    evaluatorVersion: 'value-v1',
    beliefVersion: 'belief-v1',
  }
  const baseline = trustedPlannerCacheKey(input)
  const mutations = {
    rulesetHash: 'sha256:other',
    snapshotDigest: `sha256:${'b'.repeat(64)}`,
    seat: 1,
    candidateId: 'candidate-b',
    horizon: 3,
    evaluatorVersion: 'value-v2',
    beliefVersion: 'belief-v2',
  }
  for (const [key, value] of Object.entries(mutations)) {
    assert.notEqual(trustedPlannerCacheKey({ ...input, [key]: value }), baseline, key)
  }
  assert.throws(
    () => trustedPlannerCacheKey({ ...input, snapshotDigest: 'public-view-only' }),
    /snapshotDigest/,
  )
})

test('equivalent public sets and object insertion order have a stable projection', () => {
  const left = structuredClone(manifest.common)
  const right = structuredClone(manifest.common)
  left.view.state.players[0].resources = [4, 3, 3]
  right.view.state.players[0].resources = [3, 4, 3]
  right.view.state.availableEmployees = Object.fromEntries(
    Object.entries(right.view.state.availableEmployees).reverse(),
  )
  assert.equal(strategicProjectionDigest(left), strategicProjectionDigest(right))
})
