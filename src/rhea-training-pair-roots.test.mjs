import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-training-pair-roots-v19/report.json', import.meta.url)

test('candidate-wide roots are frozen on fresh seeds before terminal sampling', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-pair-roots.v19')
  assert.equal(report.experimentId, 45)
  assert.equal(report.frozenBeforeTerminalSampling, true)
  assert.equal(report.terminalOutcomeFieldsPersisted, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.trajectories.length, 8)
  assert.equal(report.roots.length, 8)
  assert.ok(report.trajectories.every((entry) => entry.rootFound))
  assert.equal(new Set(report.roots.map((entry) => entry.rootIdentityDigest)).size, 8)
  assert.ok(report.roots.every((root) => (
    root.turn === 3 && root.phase === 5 && root.subphase === 2
  )))
  assert.ok(report.roots.every((root) => (
    root.candidateIds[0] === 'p5s2-train-1adebf1880'
    && root.candidateIds[1] === 'p5s2-train-2dd5d77261'
  )))
  assert.deepEqual(report.candidateWideHypothesis.gate, {
    minimumFrozenRoots: 8,
    minimumDecisiveRoots: 7,
    minimumAlternatePositiveRoots: 7,
    maximumStaticPositiveRoots: 0,
    twoSidedExactSignAlpha: 0.025,
  })
})
