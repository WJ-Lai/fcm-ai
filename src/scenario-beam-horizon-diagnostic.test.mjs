import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/scenario-beam-horizon-v3/report.json', import.meta.url)

test('frozen horizon diagnostic compares the same roots and belief samples at every depth', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.scenario-beam-horizon-diagnostic.v3')
  assert.equal(report.experimentId, 21)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.terminalReference.staticCandidateId, 'p5s1-hire-1dfd160273')
  assert.equal(report.terminalReference.staticFirstPlaces, 4)
  assert.equal(report.terminalReference.skipFirstPlaces, 0)
  assert.deepEqual(report.rows.map((row) => row.maxOwnDepth), [1, 2, 3, 4, 5, 6, 7, 8])
  for (const row of report.rows) {
    assert.equal(row.stopReason, 'complete')
    assert.equal(row.fallbackUsed, false)
    assert.equal(row.evaluated.length, 2)
    assert.ok(row.evaluated.every((item) => item.scenarioCount === 2))
  }
})
