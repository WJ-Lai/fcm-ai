#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

import {
  STRATEGIC_ABSTRACTION_VERSION,
  strategicProjectionDigest,
} from '../src/strategic-abstraction.mjs'

function merge(base, patch) {
  if (Array.isArray(patch)) return structuredClone(patch)
  if (!patch || typeof patch !== 'object') return patch
  const result = structuredClone(base ?? {})
  for (const [key, value] of Object.entries(patch)) result[key] = merge(result[key], value)
  return result
}

const manifest = JSON.parse(await readFile(
  new URL('../fixtures/abstraction-v1/manifest.json', import.meta.url), 'utf8',
))
if (manifest.abstractionVersion !== STRATEGIC_ABSTRACTION_VERSION) {
  throw new Error('fixture abstraction version differs from implementation')
}

const cases = manifest.cases.map((fixture) => {
  const leftDigest = strategicProjectionDigest(merge(manifest.common, fixture.leftPatch))
  const rightDigest = strategicProjectionDigest(merge(manifest.common, fixture.rightPatch))
  const actualRelation = leftDigest === rightDigest ? 'same' : 'different'
  return {
    id: fixture.id,
    axis: fixture.axis,
    expectedRelation: fixture.expectedRelation,
    actualRelation,
    passed: actualRelation === fixture.expectedRelation,
    leftDigest,
    rightDigest,
  }
})
const failed = cases.filter((item) => !item.passed)
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'fcm.strategic-abstraction-audit.v1',
  abstractionVersion: STRATEGIC_ABSTRACTION_VERSION,
  fixtureSchemaVersion: manifest.schemaVersion,
  totalCases: cases.length,
  materialCases: cases.filter((item) => item.expectedRelation === 'different').length,
  invariantCases: cases.filter((item) => item.expectedRelation === 'same').length,
  collisions: failed.filter((item) => item.expectedRelation === 'different').length,
  irrelevantLeaks: failed.filter((item) => item.expectedRelation === 'same').length,
  passed: failed.length === 0,
  cases,
}, null, 2)}\n`)
if (failed.length) process.exitCode = 1
