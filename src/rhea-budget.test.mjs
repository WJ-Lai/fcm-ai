import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-budget-v3/report.json', import.meta.url)

test('RHEA budget baseline reports both external tiers and legal fallback', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-budget-baseline.v3')
  assert.equal(report.experimentId, 29)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.rows.length, 16)
  assert.deepEqual(Object.keys(report.summary), ['1000', '3000'])
  for (const row of report.rows) {
    assert.ok([row.staticCandidateId, ...row.evaluatedRootCandidateIds]
      .includes(row.selectedCandidateId))
    assert.equal(row.internalDeadlineMs, row.externalDeadlineMs * 0.8)
    assert.equal(row.evaluatedRootCandidateIds.length, 2)
  }
  for (const summary of Object.values(report.summary)) assert.equal(summary.replicates, 8)
})
