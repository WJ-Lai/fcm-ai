import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calibratePublicActionModel,
  encodePublicEventFeatures,
  fitPublicActionModel,
  predictPublicActionModel,
  validateOpponentCalibrationDataset,
} from './opponent-calibration.mjs'

const frozenDataset = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v1/dataset.json', import.meta.url),
))
const frozenReport = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v1/report.json', import.meta.url),
))
const temporalDataset = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v2/dataset.json', import.meta.url),
))
const temporalReport = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v2/report.json', import.meta.url),
))

const development = [
  { sampleId: 'a-1', modelId: 'model-a', publicEventCodes: [1, 1, 2] },
  { sampleId: 'a-2', modelId: 'model-a', publicEventCodes: [1, 2, 2] },
  { sampleId: 'b-1', modelId: 'model-b', publicEventCodes: [8, 8, 9] },
  { sampleId: 'b-2', modelId: 'model-b', publicEventCodes: [8, 9, 9] },
]

test('public-event model fits reproducibly and predicts held-out archetypes', () => {
  const first = fitPublicActionModel(development, { alpha: 1 })
  const second = fitPublicActionModel(structuredClone(development), { alpha: 1 })
  assert.deepEqual(first, second)
  const prediction = predictPublicActionModel(first, [1, 1, 2])
  assert.equal(prediction.predictedModelId, 'model-a')
  assert.ok(prediction.probabilities['model-a'] > prediction.probabilities['model-b'])
  assert.ok(Number.isFinite(prediction.meanNegativeLogLikelihood))
})

test('calibration reports disjoint accuracy, proper scores, and an OOD threshold', () => {
  const model = fitPublicActionModel(development, { alpha: 1 })
  const report = calibratePublicActionModel(model, [
    { sampleId: 'a-c', modelId: 'model-a', publicEventCodes: [1, 2, 1] },
    { sampleId: 'b-c', modelId: 'model-b', publicEventCodes: [9, 8, 9] },
  ], { knownQuantile: 0.95 })
  assert.equal(report.top1Accuracy, 1)
  assert.ok(report.logLoss >= 0)
  assert.ok(report.brierScore >= 0)
  assert.ok(Number.isFinite(report.oodMeanNllThreshold))
  assert.equal(report.confusion['model-a']['model-a'], 1)
  assert.equal(report.confidenceBins.reduce((sum, bin) => sum + bin.count, 0), 2)
})

test('unknown public events are OOD instead of silently entering the vocabulary', () => {
  const model = fitPublicActionModel(development, { alpha: 1 })
  const prediction = predictPublicActionModel(model, [99, 99])
  assert.equal(prediction.unknownEventFraction, 1)
  assert.equal(prediction.outOfDistribution, true)
})

test('v2 public temporal encoding separates equal histograms with different order', () => {
  const left = encodePublicEventFeatures([1, 2, 1, 2], { includeTransitions: true })
  const right = encodePublicEventFeatures([1, 1, 2, 2], { includeTransitions: true })
  assert.notDeepEqual(left.sort((a, b) => a - b), right.sort((a, b) => a - b))
  const model = fitPublicActionModel([
    { sampleId: 'left-1', modelId: 'left', publicEventCodes: left },
    { sampleId: 'right-1', modelId: 'right', publicEventCodes: right },
  ], { alpha: 1, featureVersion: 'public-event-unigram-bigram-v2' })
  assert.equal(predictPublicActionModel(model, left).predictedModelId, 'left')
  assert.equal(model.featureVersion, 'public-event-unigram-bigram-v2')
})

test('training fails closed on split duplication, unknown labels, and hidden-shaped fields', () => {
  assert.throws(() => fitPublicActionModel([...development, { ...development[0] }], { alpha: 1 }),
    /duplicate sampleId/)
  assert.throws(() => fitPublicActionModel([
    ...development,
    { sampleId: 'bad', modelId: 'model-a', publicEventCodes: [1], hiddenState: {} },
  ], { alpha: 1 }), /unknown sample field/)
  const model = fitPublicActionModel(development, { alpha: 1 })
  assert.throws(() => calibratePublicActionModel(model, [
    { sampleId: 'a-1', modelId: 'model-a', publicEventCodes: [1] },
  ], { knownQuantile: 0.95 }), /development sampleId reused/)
  assert.throws(() => calibratePublicActionModel(model, [
    { sampleId: 'c', modelId: 'model-c', publicEventCodes: [1] },
  ], { knownQuantile: 0.95 }), /unknown modelId/)
})

test('frozen official-engine prefixes are balanced, public-only, and disjoint', () => {
  const modelIds = new Set([
    'deterministic-balanced-v1', 'safe-first-v1', 'seeded-random-v1', 'official-built-in-v1',
  ])
  const validated = validateOpponentCalibrationDataset(frozenDataset, {
    expectedModelIds: modelIds,
    expectedSamplesPerModel: 6,
    expectedCommandsPerGame: 160,
  })
  assert.equal(validated.splits.development.samples.length, 24)
  assert.equal(validated.splits.calibration.samples.length, 24)
  const forged = structuredClone(frozenDataset)
  forged.splits.development.samples[0].hiddenState = { reserveCards: [1] }
  assert.throws(() => validateOpponentCalibrationDataset(forged, {
    expectedModelIds: modelIds,
    expectedSamplesPerModel: 6,
    expectedCommandsPerGame: 160,
  }), /unknown calibration sample field/)
})

test('frozen calibration failure remains explicit and promotion holdout stays sealed', () => {
  assert.equal(frozenReport.calibration.top1Accuracy, 17 / 24)
  assert.equal(frozenReport.human.oodRate, 82 / 120)
  assert.equal(frozenReport.gates.knownTop1Passed, false)
  assert.equal(frozenReport.passed, false)
  assert.equal(frozenReport.promotionHoldoutOpened, false)
})

test('temporal dataset adds only public sequences over the identical frozen prefixes', () => {
  const modelIds = new Set([
    'deterministic-balanced-v1', 'safe-first-v1', 'seeded-random-v1', 'official-built-in-v1',
  ])
  validateOpponentCalibrationDataset(temporalDataset, {
    expectedModelIds: modelIds,
    expectedSamplesPerModel: 6,
    expectedCommandsPerGame: 160,
    expectedFeatureVersion: 'public-event-unigram-bigram-v2',
  })
  for (const split of ['development', 'calibration']) {
    for (const [index, sample] of temporalDataset.splits[split].samples.entries()) {
      assert.deepEqual(sample.publicEventCounts,
        frozenDataset.splits[split].samples[index].publicEventCounts)
    }
  }
})

test('temporal representation passes selection gates but remains overconfident', () => {
  assert.equal(temporalReport.calibration.top1Accuracy, 22 / 24)
  assert.equal(temporalReport.human.oodRate, 102 / 120)
  assert.equal(temporalReport.passed, true)
  assert.equal(temporalReport.calibration.confidenceBins[4].count, 24)
  assert.ok(temporalReport.calibration.confidenceBins[4].meanConfidence > 0.98)
  assert.equal(temporalReport.promotionHoldoutOpened, false)
})
