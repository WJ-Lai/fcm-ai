import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-root-breadth-v8/report.json', import.meta.url)

test('three-root breadth audit exposes a meaningful same-intent alternative', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-root-breadth.v8')
  assert.equal(report.experimentId, 34)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.summary.scannedDecisions, 32)
  assert.equal(report.summary.trajectoriesCompleted, 4)
  assert.equal(report.summary.violations, 0)
  assert.ok(report.summary.maximumDecisionMs <= 3000)
  const scanned = report.trajectories.flatMap((trajectory) => trajectory.scanned)
  for (const row of scanned) {
    assert.equal(row.rootScores.length, 3)
    assert.equal(row.rootScores[1].candidateId.includes('fallback'), true)
    assert.equal(row.rootScores[2].candidateId.includes('fallback'), false)
    assert.equal(row.completedGenerations, 1)
    assert.equal(row.scenarioEvaluations, 6)
  }
  assert.equal(report.summary.acceptedChanges, report.interventions.length)
  assert.equal(report.summary.terminalAudits, report.interventions.length)
  for (const intervention of report.interventions) {
    assert.equal(intervention.staticTerminal.completed, true)
    assert.equal(intervention.selectedTerminal.completed, true)
  }
})
