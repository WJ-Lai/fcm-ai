import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-second-generation-v4/report.json', import.meta.url)

test('three-second RHEA fixture preserves the detected no-novelty failure', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-second-generation.v4')
  assert.equal(report.experimentId, 30)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.rows.length, 8)
  assert.deepEqual(Object.keys(report.summary), ['3000'])
  assert.equal(report.summary['3000'].replicates, 8)
  assert.equal(report.summary['3000'].completed, 8)
  assert.equal(report.summary['3000'].withinBudget, true)
  for (const row of report.rows) {
    assert.equal(row.fallbackUsed, false)
    assert.equal(row.completedGenerations, 2)
    assert.equal(row.uniqueGenomesEvaluated, 2)
    assert.equal(row.scenarioEvaluations, 4)
    assert.equal(row.internalDeadlineMs, 2400)
    assert.equal(row.evaluatedRootCandidateIds.length, 2)
    assert.ok([row.staticCandidateId, ...row.evaluatedRootCandidateIds]
      .includes(row.selectedCandidateId))
  }
})
