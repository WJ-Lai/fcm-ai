import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootsReportUrl = new URL(
  '../fixtures/rhea-training-context-classifier-roots-v23/report.json', import.meta.url)
const reportUrl = new URL(
  '../fixtures/rhea-training-context-classifier-samples-v24/report.json', import.meta.url)

test('three-sample classifier validation preserves the blind frozen roots', async () => {
  const frozen = JSON.parse(await readFile(rootsReportUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.partialCollection, false)
  assert.equal(report.sampleCount, 3)
  assert.equal(report.roots.length, 12)
  assert.deepEqual(report.roots.map((root) => root.rootId),
    frozen.roots.map((root) => root.rootId))
  for (const [index, root] of report.roots.entries()) {
    assert.equal(root.rootIdentityDigest, frozen.roots[index].rootIdentityDigest)
    assert.equal(root.classifierMatched, frozen.roots[index].classifierMatched)
    assert.equal(root.candidates.length, 2)
    assert.ok(root.candidates.every((candidate) => candidate.terminalRanks.length === 3))
  }
  assert.equal(report.contextClassifierAudit.status, 'collecting')
  assert.equal(report.contextClassifierAudit.eligibleForGate, false)
  assert.equal(report.contextClassifierAudit.passed, null)
  assert.equal(report.contextClassifierAudit.availableSamplesPerRoot, 3)
  assert.equal(report.audit.needsMoreSamplesRoots, 12)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
})
