import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previousUrl = new URL('../fixtures/rhea-training-pair-samples-v21/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-training-pair-samples-v22/report.json', import.meta.url)

test('sharded maximum-stage report preserves prefixes and closes the root gate', async () => {
  const previous = JSON.parse(await readFile(previousUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-pair-samples.v22')
  assert.equal(report.experimentId, 48)
  assert.equal(report.sampleCount, 15)
  assert.equal(report.resumedFromSampleCount, 7)
  assert.equal(report.partialCollection, false)
  assert.deepEqual(report.targetIndices, [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(report.collectionShards, [[0, 1], [2, 3], [4, 5], [6, 7]])
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
        assert.deepEqual(candidate[field].slice(0, 7), prior[field])
        assert.equal(candidate[field].length, 15)
      }
    }
  }
  assert.equal(report.audit.needsMoreSamplesRoots, 0)
  assert.ok(['passed', 'failed'].includes(report.rootGeneralizationAudit.status))
  assert.equal(typeof report.rootGeneralizationAudit.passed, 'boolean')
  assert.equal(report.promotionHoldoutOpened, false)
})
