import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/scenario-beam-information-set-v2/report.json', import.meta.url)

test('frozen ScenarioBeam audit passes both official hidden-information boundaries', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))

  assert.equal(report.schemaVersion, 'fcm.scenario-beam-information-set-audit.v2')
  assert.equal(report.experimentId, 19)
  assert.equal(report.planner, 'scenario-beam-v1')
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.boundaries.length, 2)
  for (const boundary of report.boundaries) {
    assert.equal(boundary.publicViewsEqual, true)
    assert.equal(boundary.publicSnapshotsEqual, true)
    assert.equal(boundary.hiddenEnvelopesDiffer, true)
    assert.equal(boundary.rootFallbackReason, 'root-simultaneous')
    assert.equal(boundary.cloneAttempted, false)
    assert.equal(boundary.audit.perSeedMismatchRate, 0)
    assert.equal(boundary.audit.maximumPairwiseTotalVariation, 0)
    assert.equal(boundary.audit.passed, true)
  }
})
