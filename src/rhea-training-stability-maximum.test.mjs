import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const priorUrl = new URL('../fixtures/rhea-training-stability-v13/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-training-stability-v14/report.json', import.meta.url)

test('maximum training stability preserves seven samples and closes the audit', async () => {
  const prior = JSON.parse(await readFile(priorUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-stability.v14')
  assert.equal(report.experimentId, 40)
  assert.equal(report.sampleCount, 15)
  assert.equal(report.resumedFromSampleCount, 7)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.audit.roots, 2)
  assert.equal(report.audit.needsMoreSamplesRoots, 0)
  assert.equal(report.audit.selectedRoots, 1)
  assert.equal(report.audit.abstainedRoots, 1)
  for (const root of report.roots) {
    const previousRoot = prior.roots.find((entry) => entry.rootId === root.rootId)
    assert.equal(root.strategicProjectionDigest, previousRoot.strategicProjectionDigest)
    for (const candidate of root.candidates) {
      const previous = previousRoot.candidates.find(
        (entry) => entry.candidateId === candidate.candidateId)
      assert.deepEqual(candidate.terminalMargins.slice(0, 7), previous.terminalMargins)
      assert.deepEqual(candidate.terminalRanks.slice(0, 7), previous.terminalRanks)
      assert.deepEqual(candidate.terminalMoney.slice(0, 7), previous.terminalMoney)
      assert.deepEqual(candidate.terminalCommands.slice(0, 7), previous.terminalCommands)
      assert.equal(candidate.terminalMargins.length, 15)
      assert.equal(candidate.completed.every(Boolean), true)
    }
  }
  const [cashOnly, rankSelected] = report.audit.details
  assert.equal(cashOnly.status, 'abstain-max-samples')
  assert.equal(cashOnly.stages.at(-1).comparisons[0].ties, 15)
  assert.equal(rankSelected.status, 'selected')
  assert.equal(rankSelected.selectedCandidateId, 'p5s2-train-2dd5d77261')
  const comparison = rankSelected.stages.at(-1).comparisons[0]
  assert.equal(comparison.positive, 0)
  assert.equal(comparison.negative, 9)
  assert.equal(comparison.ties, 6)
  assert.equal(comparison.pValue, 0.00390625)
})
