import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-training-context-v15/report.json', import.meta.url)

test('training context audit is public, reproducible, and candidate matched', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-context.v15')
  assert.equal(report.experimentId, 41)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.roots.length, 2)
  assert.deepEqual(report.differences, [
    { name: 'reachableHouses', left: 5, right: 6 },
    { name: 'exclusivelyReachableHouses', left: 4, right: 0 },
    { name: 'closestHouses', left: 4, right: 2 },
    { name: 'distanceDeficitTotal', left: 2, right: 10 },
  ])
  assert.deepEqual(report.roots.map((root) => root.candidates.map((entry) => entry.candidateId)), [
    ['p5s2-train-1adebf1880', 'p5s2-train-2dd5d77261'],
    ['p5s2-train-1adebf1880', 'p5s2-train-2dd5d77261'],
  ])
  assert.deepEqual(report.roots.map((root) => root.terminalStatus), [
    'abstain-max-samples', 'selected',
  ])
  assert.deepEqual(report.predeclaredInteraction.predicate, {
    exclusivelyReachableHouses: { equals: 0 },
    distanceDeficitTotal: { minimum: 10 },
  })
  assert.equal(report.predeclaredInteraction.validation.discoveryRootsExcluded, true)
  assert.equal(report.predeclaredInteraction.recommendationWhenUnmatched, 'abstain')
})
