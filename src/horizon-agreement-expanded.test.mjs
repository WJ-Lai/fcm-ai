import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/horizon-agreement-expanded-v8/report.json', import.meta.url)

test('expanded agreement scan reaches later decisions and audits accepted changes', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.horizon-agreement-expanded.v8')
  assert.equal(report.experimentId, 26)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.summary.scannedDecisions, 48)
  assert.equal(report.summary.violations, 0)
  assert.equal(report.summary.trajectoriesCompleted, 4)
  assert.ok(report.trajectories.every((trajectory) => trajectory.scanned.some((row) => row.turn >= 4)))
  assert.equal(report.summary.acceptedChanges, report.acceptedInterventions.length)
  for (const intervention of report.acceptedInterventions) {
    assert.equal(intervention.staticTerminal.completed, true)
    assert.equal(intervention.selectedTerminal.completed, true)
  }
})
