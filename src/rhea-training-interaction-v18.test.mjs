import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previousUrl = new URL(
  '../fixtures/rhea-training-interaction-v17/report.json', import.meta.url)
const reportUrl = new URL(
  '../fixtures/rhea-training-interaction-v18/report.json', import.meta.url)

test('maximum-stage interaction audit preserves seven samples and closes every root', async () => {
  const previous = JSON.parse(await readFile(previousUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-interaction.v18')
  assert.equal(report.experimentId, 44)
  assert.equal(report.sampleCount, 15)
  assert.equal(report.resumedFromSampleCount, 7)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.deepEqual(report.predeclaredInteraction, previous.predeclaredInteraction)
  for (const root of report.roots) {
    const priorRoot = previous.roots.find((entry) => entry.rootId === root.rootId)
    assert.ok(priorRoot)
    assert.match(root.rootIdentityDigest, /^sha256:[a-f0-9]{64}$/)
    assert.equal(root.strategicProjectionDigest, priorRoot.strategicProjectionDigest)
    assert.equal(root.interactionMatched, priorRoot.interactionMatched)
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
  assert.ok(report.audit.details.every((entry) => (
    entry.status === 'selected' || entry.status === 'abstain-max-samples'
  )))
})
