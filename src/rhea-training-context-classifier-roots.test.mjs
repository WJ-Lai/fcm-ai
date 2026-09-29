import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL(
  '../fixtures/rhea-training-context-classifier-roots-v23/report.json', import.meta.url)

test('one-feature classifier roots are balanced and frozen before terminal sampling', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-training-context-classifier-roots.v23')
  assert.equal(report.experimentId, 49)
  assert.equal(report.frozenBeforeTerminalSampling, true)
  assert.equal(report.terminalOutcomeFieldsPersisted, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.roots.length, 12)
  assert.equal(report.trajectories.length, 12)
  assert.ok(report.trajectories.every((entry) => entry.rootFound))
  assert.equal(new Set(report.roots.map((entry) => entry.rootIdentityDigest)).size, 12)
  assert.deepEqual(report.contextClassifier, {
    name: 'low-exclusive-reach',
    feature: 'exclusivelyReachableHouses',
    operator: '<=',
    threshold: 1,
    matchedRecommendation: 'p5s2-train-2dd5d77261',
    unmatchedRecommendation: 'p5s2-train-1adebf1880',
    developmentRoots: 12,
    validation: {
      minimumMatchedRoots: 8,
      minimumUnmatchedRoots: 2,
      pairedContinuationSamplesPerRoot: 15,
      integrityStages: [3, 7, 15],
      matchedGate: {
        minimumDecisiveRoots: 7,
        minimumAlternatePositiveRoots: 7,
        maximumStaticPositiveRoots: 0,
        twoSidedExactSignAlpha: 0.025,
      },
      unmatchedGate: { maximumAlternatePositiveRoots: 0 },
    },
    failurePolicy: 'Reject the classifier and keep the static action; never change threshold, feature, roots, or class membership after this freeze.',
  })
  assert.ok(report.classBalance.matchedRoots >= 8)
  assert.ok(report.classBalance.unmatchedRoots >= 2)
  for (const root of report.roots) {
    assert.equal(root.classifierMatched,
      root.publicFeatures.exclusivelyReachableHouses <= 1)
    assert.equal(root.scanIndex, 4)
    assert.equal(root.trainingScanIndex, 1)
  }
})
