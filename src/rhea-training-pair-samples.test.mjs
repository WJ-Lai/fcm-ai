import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootsUrl = new URL('../fixtures/rhea-training-pair-roots-v19/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-training-pair-samples-v20/report.json', import.meta.url)

test('three-sample candidate-wide audit preserves every frozen root and remains interim', async () => {
  const frozen = JSON.parse(await readFile(rootsUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-pair-samples.v20')
  assert.equal(report.experimentId, 46)
  assert.equal(report.sampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.roots.length, 8)
  assert.deepEqual(report.roots.map((root) => root.rootId),
    frozen.roots.map((root) => root.rootId))
  for (const root of report.roots) {
    const frozenRoot = frozen.roots.find((entry) => entry.rootId === root.rootId)
    assert.equal(root.rootIdentityDigest, frozenRoot.rootIdentityDigest)
    assert.equal(root.sampleZeroReferenceAvailable, false)
    assert.equal(root.sampleZeroReproduced, null)
    assert.ok(root.candidates.every((candidate) => (
      candidate.terminalRanks.length === 3 && candidate.completed.every(Boolean)
    )))
  }
  assert.equal(report.audit.needsMoreSamplesRoots, 8)
  assert.equal(report.rootGeneralizationAudit.status, 'collecting')
  assert.equal(report.rootGeneralizationAudit.eligibleForGate, false)
  assert.equal(report.rootGeneralizationAudit.passed, null)
})
