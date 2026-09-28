import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previousUrl = new URL(
  '../fixtures/rhea-training-interaction-v16/report.json', import.meta.url)
const reportUrl = new URL(
  '../fixtures/rhea-training-interaction-v17/report.json', import.meta.url)

test('seven-sample interaction validation preserves the complete three-sample prefix', async () => {
  const previous = JSON.parse(await readFile(previousUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-interaction.v17')
  assert.equal(report.experimentId, 43)
  assert.equal(report.sampleCount, 7)
  assert.equal(report.resumedFromSampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.deepEqual(report.predeclaredInteraction, previous.predeclaredInteraction)
  for (const root of report.roots) {
    const priorRoot = previous.roots.find((entry) => entry.rootId === root.rootId)
    assert.ok(priorRoot)
    assert.equal(root.strategicProjectionDigest, priorRoot.strategicProjectionDigest)
    // The legacy full-view digest includes non-semantic legal-action envelope detail and is not a
    // root identity gate. Strategic projection + exact candidate assertions are the stable v17 gate;
    // v18 adds a normalized rootIdentityDigest over projection, features and candidate ids.
    assert.equal(root.interactionMatched, priorRoot.interactionMatched)
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
})
