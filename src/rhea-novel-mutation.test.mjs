import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-novel-mutation-v5/report.json', import.meta.url)

test('novel mutation makes the second generation real and budget compliant', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-novel-mutation.v5')
  assert.equal(report.experimentId, 31)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.rows.length, 8)
  assert.equal(report.summary['3000'].replicates, 8)
  assert.equal(report.summary['3000'].completed, 8)
  assert.equal(report.summary['3000'].withinBudget, true)
  for (const row of report.rows) {
    assert.equal(row.fallbackUsed, false)
    assert.equal(row.completedGenerations, 2)
    assert.equal(row.uniqueGenomesEvaluated, 3)
    assert.equal(row.scenarioEvaluations, 6)
    assert.equal(row.internalDeadlineMs, 2400)
    assert.equal(row.evaluatedRootCandidateIds.length, 2)
  }
})
