import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-hire-stability-v9/report.json', import.meta.url)

test('contradictory RHEA hire roots use paired multi-continuation evidence', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-hire-stability.v9')
  assert.equal(report.experimentId, 35)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.roots.length, 2)
  assert.equal(report.audit.roots, 2)
  assert.equal(report.audit.selectedRoots, 0)
  assert.equal(report.audit.needsMoreSamplesRoots, 2)
  for (const root of report.roots) {
    assert.equal(root.candidates.length, 2)
    for (const candidate of root.candidates) {
      assert.equal(candidate.terminalMargins.length, 3)
      assert.equal(candidate.terminalRanks.length, 3)
      assert.equal(candidate.terminalMoney.length, 3)
      assert.equal(candidate.completed.every(Boolean), true)
    }
    assert.equal(root.sampleZeroReproduced, true)
    const detail = report.audit.details.find((item) => item.rootId === root.rootId)
    assert.equal(detail.nextSamples, 7)
    const comparison = detail.stages[0].comparisons[0]
    assert.equal(comparison.positive, 1)
    assert.equal(comparison.negative, 0)
    assert.equal(comparison.ties, 2)
  }
})
