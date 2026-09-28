import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const priorUrl = new URL('../fixtures/rhea-training-stability-v12/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-training-stability-v13/report.json', import.meta.url)

test('seven-sample training stability preserves the verified prefix', async () => {
  const prior = JSON.parse(await readFile(priorUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-stability.v13')
  assert.equal(report.experimentId, 39)
  assert.equal(report.sampleCount, 7)
  assert.equal(report.resumedFromSampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.audit.roots, 2)
  assert.equal(report.audit.selectedRoots, 0)
  assert.equal(report.audit.needsMoreSamplesRoots, 2)
  for (const root of report.roots) {
    const previousRoot = prior.roots.find((entry) => entry.rootId === root.rootId)
    assert.equal(root.strategicProjectionDigest, previousRoot.strategicProjectionDigest)
    for (const candidate of root.candidates) {
      const previous = previousRoot.candidates.find(
        (entry) => entry.candidateId === candidate.candidateId)
      assert.deepEqual(candidate.terminalMargins.slice(0, 3), previous.terminalMargins)
      assert.deepEqual(candidate.terminalRanks.slice(0, 3), previous.terminalRanks)
      assert.deepEqual(candidate.terminalMoney.slice(0, 3), previous.terminalMoney)
      assert.deepEqual(candidate.terminalCommands.slice(0, 3), previous.terminalCommands)
      assert.equal(candidate.terminalMargins.length, 7)
      assert.equal(candidate.completed.every(Boolean), true)
    }
  }
  const comparisons = report.audit.details.map((detail) => {
    assert.equal(detail.nextSamples, 15)
    return detail.stages.at(-1).comparisons[0]
  })
  assert.deepEqual(comparisons.map((entry) => [entry.positive, entry.negative, entry.ties]), [
    [0, 0, 7],
    [0, 3, 4],
  ])
})
