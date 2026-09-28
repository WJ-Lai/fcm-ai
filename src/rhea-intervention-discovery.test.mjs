import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-intervention-discovery-v7/report.json', import.meta.url)

test('RHEA intervention discovery audits every non-static choice to terminal', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-intervention-discovery.v7')
  assert.equal(report.experimentId, 33)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.trajectories.length, 4)
  assert.equal(report.summary.trajectoriesCompleted, 4)
  assert.equal(report.summary.violations, 0)
  assert.equal(report.summary.scannedDecisions, 32)
  assert.equal(report.summary.acceptedChanges, report.interventions.length)
  assert.equal(report.summary.terminalAudits, report.interventions.length)
  assert.equal(report.summary.beneficial + report.summary.harmful + report.summary.neutral,
    report.interventions.length)
  assert.ok(report.summary.maximumDecisionMs <= 3000)
  const scanned = report.trajectories.flatMap((trajectory) => trajectory.scanned)
  const margins = scanned.map((row) => {
    assert.equal(row.rootScores.length, 2)
    assert.equal(row.rootScores[1].candidateId.includes('fallback'), true)
    return row.rootScores[0].bestMeanScore - row.rootScores[1].bestMeanScore
  })
  assert.equal(margins.filter((margin) => margin === 0).length, 8)
  assert.equal(margins.filter((margin) => margin > 0).length, 24)
  assert.equal(margins.filter((margin) => margin < 0).length, 0)
  for (const intervention of report.interventions) {
    assert.notEqual(intervention.selectedCandidateId, intervention.staticCandidateId)
    assert.equal(intervention.staticTerminal.completed, true)
    assert.equal(intervention.selectedTerminal.completed, true)
    assert.ok(['beneficial', 'harmful', 'neutral'].includes(intervention.classification))
  }
})
