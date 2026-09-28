import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/horizon-agreement-discovery-v6/report.json', import.meta.url)

test('agreement discovery report is bounded, legal, public, and keeps holdout sealed', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.horizon-agreement-discovery.v6')
  assert.equal(report.experimentId, 24)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.trajectories.length, 4)
  assert.ok(report.summary.scannedDecisions > 0)
  assert.ok(report.summary.scannedDecisions <= 24)
  assert.equal(report.summary.violations, 0)
  for (const trajectory of report.trajectories) {
    assert.equal(trajectory.completed, true)
    assert.equal(trajectory.violation, null)
    assert.ok(trajectory.scanned.length <= 6)
    assert.ok(trajectory.scanned.every((row) => row.elapsedMs <= 3000))
  }
  assert.equal(report.summary.acceptedChanges, report.acceptedInterventions.length)
  for (const intervention of report.acceptedInterventions) {
    assert.notEqual(intervention.staticCandidateId, intervention.selectedCandidateId)
    assert.equal(intervention.staticTerminal.completed, true)
    assert.equal(intervention.selectedTerminal.completed, true)
  }
})
