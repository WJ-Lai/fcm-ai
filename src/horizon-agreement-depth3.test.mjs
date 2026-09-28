import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/horizon-agreement-depth3-v7/report.json', import.meta.url)

test('depth-3 agreement discovery completes and audits every accepted intervention', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.horizon-agreement-depth3.v7')
  assert.equal(report.experimentId, 25)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.summary.scannedDecisions, 24)
  assert.equal(report.summary.violations, 0)
  assert.ok((report.summary.gateReasons['deep-incomplete'] ?? 0) < 24)
  assert.equal(report.summary.acceptedChanges, report.acceptedInterventions.length)
  for (const intervention of report.acceptedInterventions) {
    assert.equal(intervention.staticTerminal.completed, true)
    assert.equal(intervention.selectedTerminal.completed, true)
  }
})
