import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previousUrl = new URL(
  '../fixtures/rhea-training-context-classifier-samples-v24/report.json', import.meta.url)
const reportUrl = new URL(
  '../fixtures/rhea-training-context-classifier-samples-v25/report.json', import.meta.url)

test('seven-sample checkpoint preserves all three-sample prefixes and memberships', async () => {
  const previous = JSON.parse(await readFile(previousUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.partialCollection, false)
  assert.equal(report.sampleCount, 7)
  assert.equal(report.resumedFromSampleCount, 3)
  assert.equal(report.roots.length, 12)
  for (const [index, root] of report.roots.entries()) {
    const prior = previous.roots[index]
    assert.equal(root.rootId, prior.rootId)
    assert.equal(root.rootIdentityDigest, prior.rootIdentityDigest)
    assert.equal(root.classifierMatched, prior.classifierMatched)
    for (const [candidateIndex, candidate] of root.candidates.entries()) {
      assert.equal(candidate.terminalRanks.length, 7)
      assert.deepEqual(candidate.terminalRanks.slice(0, 3),
        prior.candidates[candidateIndex].terminalRanks)
      assert.deepEqual(candidate.terminalMargins.slice(0, 3),
        prior.candidates[candidateIndex].terminalMargins)
    }
  }
  assert.equal(report.contextClassifierAudit.status, 'collecting')
  assert.equal(report.contextClassifierAudit.passed, null)
  assert.equal(report.contextClassifierAudit.availableSamplesPerRoot, 7)
  assert.equal(report.audit.needsMoreSamplesRoots, 12)
  assert.equal(report.promotionHoldoutOpened, false)
})
