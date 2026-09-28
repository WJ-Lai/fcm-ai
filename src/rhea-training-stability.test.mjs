import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-training-stability-v12/report.json', import.meta.url)

test('contradictory RHEA training roots use paired multi-continuation evidence', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-stability.v12')
  assert.equal(report.experimentId, 38)
  assert.equal(report.sampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.roots.length, 2)
  assert.equal(report.audit.roots, 2)
  assert.equal(report.audit.selectedRoots, 0)
  assert.equal(report.audit.needsMoreSamplesRoots, 2)
  for (const root of report.roots) {
    assert.match(root.strategicProjectionDigest, /^sha256:[a-f0-9]{64}$/)
    assert.equal(root.sampleZeroReproduced, true)
    assert.equal(root.candidates.length, 2)
    for (const candidate of root.candidates) {
      assert.equal(candidate.terminalMargins.length, 3)
      assert.equal(candidate.terminalRanks.length, 3)
      assert.equal(candidate.terminalMoney.length, 3)
      assert.equal(candidate.completed.every(Boolean), true)
    }
    const detail = report.audit.details.find((entry) => entry.rootId === root.rootId)
    assert.equal(detail.nextSamples, 7)
  }
  const comparisons = report.audit.details.map((detail) => detail.stages[0].comparisons[0])
  assert.deepEqual(comparisons.map((entry) => [entry.positive, entry.negative, entry.ties]), [
    [0, 0, 3],
    [0, 2, 1],
  ])
})
