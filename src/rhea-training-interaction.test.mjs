import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL(
  '../fixtures/rhea-training-interaction-v16/report.json', import.meta.url)

test('independent training roots apply the preregistered interaction without leakage', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-interaction.v16')
  assert.equal(report.experimentId, 42)
  assert.equal(report.sampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.deepEqual(report.predeclaredInteraction.predicate, {
    exclusivelyReachableHouses: { equals: 0 },
    distanceDeficitTotal: { minimum: 10 },
  })
  assert.equal(report.roots.length, 2)
  assert.ok(report.roots.every((root) => root.sampleZeroReproduced))
  assert.ok(report.roots.every((root) => root.candidates.every((candidate) => (
    candidate.completed.length === 3 && candidate.completed.every(Boolean)
  ))))
  assert.ok(report.roots.every((root) => typeof root.interactionMatched === 'boolean'))
  assert.ok(report.audit.details.every((entry) => entry.status === 'needs-more-samples'))
})
