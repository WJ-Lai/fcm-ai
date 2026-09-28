import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const priorUrl = new URL('../fixtures/rhea-hire-stability-v9/report.json', import.meta.url)
const reportUrl = new URL('../fixtures/rhea-hire-stability-v10/report.json', import.meta.url)

test('seven-sample hire stability preserves the verified three-sample prefix', async () => {
  const prior = JSON.parse(await readFile(priorUrl, 'utf8'))
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-hire-stability.v10')
  assert.equal(report.experimentId, 36)
  assert.equal(report.sampleCount, 7)
  assert.equal(report.resumedFromSampleCount, 3)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.audit.roots, 2)
  for (const root of report.roots) {
    const previousRoot = prior.roots.find((entry) => entry.rootId === root.rootId)
    assert.match(root.strategicProjectionDigest, /^sha256:[a-f0-9]{64}$/)
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
})
