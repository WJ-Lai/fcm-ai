import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previousUrl = new URL('../fixtures/rhea-training-pair-samples-v20/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-training-pair-samples-v21/report.json', import.meta.url)

test('seven-sample candidate-wide audit preserves all eight three-sample prefixes', async () => {
  const previous = JSON.parse(await readFile(previousUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-pair-samples.v21')
  assert.equal(report.experimentId, 47)
  assert.equal(report.sampleCount, 7)
  assert.equal(report.resumedFromSampleCount, 3)
  assert.equal(report.roots.length, 8)
  for (const root of report.roots) {
    const priorRoot = previous.roots.find((entry) => entry.rootId === root.rootId)
    assert.ok(priorRoot)
    assert.equal(root.rootIdentityDigest, priorRoot.rootIdentityDigest)
    for (const candidate of root.candidates) {
      const prior = priorRoot.candidates.find((entry) => entry.candidateId === candidate.candidateId)
      assert.ok(prior)
      for (const field of ['terminalMargins', 'terminalRanks', 'terminalMoney',
        'terminalCommands', 'completed']) {
        assert.deepEqual(candidate[field].slice(0, 3), prior[field])
        assert.equal(candidate[field].length, 7)
      }
    }
  }
  assert.equal(report.audit.needsMoreSamplesRoots, 8)
  assert.equal(report.rootGeneralizationAudit.status, 'collecting')
  assert.equal(report.rootGeneralizationAudit.passed, null)
  assert.equal(report.promotionHoldoutOpened, false)
})
