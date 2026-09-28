import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  evaluateProbabilityCalibration,
  fitClassConditionalOodThresholds,
  fitProbabilityCalibration,
  temperatureScaleProbabilities,
} from './opponent-probability-calibration.mjs'

const frozenReport = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v3/report.json', import.meta.url),
))
const classConditionalReport = JSON.parse(await readFile(
  new URL('../fixtures/opponent-calibration-v4/report.json', import.meta.url),
))

const calibrationPredictions = [
  { actualModelId: 'a', probabilities: { a: 0.99, b: 0.01 }, meanNegativeLogLikelihood: 1 },
  { actualModelId: 'a', probabilities: { a: 0.98, b: 0.02 }, meanNegativeLogLikelihood: 1 },
  { actualModelId: 'b', probabilities: { a: 0.95, b: 0.05 }, meanNegativeLogLikelihood: 1 },
  { actualModelId: 'b', probabilities: { a: 0.1, b: 0.9 }, meanNegativeLogLikelihood: 1 },
]

test('temperature scaling preserves ordering and normalizes probabilities', () => {
  const scaled = temperatureScaleProbabilities({ a: 0.9, b: 0.1 }, 2)
  assert.ok(scaled.a > scaled.b)
  assert.ok(Math.abs(scaled.a + scaled.b - 1) < 1e-12)
  assert.ok(scaled.a < 0.9)
  assert.throws(() => temperatureScaleProbabilities({ a: 1, b: 0 }, 0), /temperature/)
})

test('fit chooses a declared temperature and deterministic selective threshold', () => {
  const fitted = fitProbabilityCalibration(calibrationPredictions, {
    temperatureGrid: [1, 2, 4],
    minimumSelectiveAccuracy: 0.95,
    minimumCoverage: 0.25,
    oodMeanNllThreshold: 2,
  })
  assert.ok([1, 2, 4].includes(fitted.temperature))
  assert.ok(fitted.calibration.calibratedLogLoss <= fitted.calibration.uncalibratedLogLoss)
  assert.ok(fitted.abstentionThreshold >= 0 && fitted.abstentionThreshold <= 1)
  assert.deepEqual(fitted, fitProbabilityCalibration(structuredClone(calibrationPredictions), {
    temperatureGrid: [1, 2, 4],
    minimumSelectiveAccuracy: 0.95,
    minimumCoverage: 0.25,
    oodMeanNllThreshold: 2,
  }))
})

test('independent evaluation reports proper scores, ECE, coverage and OOD-first abstention', () => {
  const fitted = fitProbabilityCalibration(calibrationPredictions, {
    temperatureGrid: [1, 2, 4],
    minimumSelectiveAccuracy: 0.5,
    minimumCoverage: 0.25,
    oodMeanNllThreshold: 2,
  })
  const report = evaluateProbabilityCalibration([
    { sampleId: 'v-1', actualModelId: 'a', probabilities: { a: 0.8, b: 0.2 }, meanNegativeLogLikelihood: 1, unknownEventFraction: 0 },
    { sampleId: 'v-2', actualModelId: 'b', probabilities: { a: 0.3, b: 0.7 }, meanNegativeLogLikelihood: 3, unknownEventFraction: 0 },
  ], fitted)
  assert.equal(report.top1Accuracy, 1)
  assert.equal(report.oodCount, 1)
  assert.equal(report.accepted, 1)
  assert.equal(report.selectiveAccuracy, 1)
  assert.ok(report.expectedCalibrationError >= 0 && report.expectedCalibrationError <= 1)
  assert.equal(report.confidenceBins.reduce((sum, bin) => sum + bin.count, 0), 2)
})

test('malformed calibration inputs fail closed', () => {
  assert.throws(() => fitProbabilityCalibration([], {
    temperatureGrid: [1], minimumSelectiveAccuracy: 1, minimumCoverage: 1,
    oodMeanNllThreshold: 2,
  }), /non-empty/)
  assert.throws(() => fitProbabilityCalibration(calibrationPredictions, {
    temperatureGrid: [1, 1], minimumSelectiveAccuracy: 1, minimumCoverage: 1,
    oodMeanNllThreshold: 2,
  }), /unique/)
  assert.throws(() => evaluateProbabilityCalibration([
    { ...calibrationPredictions[0], sampleId: 'x', probabilities: { a: 2, b: -1 } },
  ], { temperature: 1, abstentionThreshold: 0, oodMeanNllThreshold: 2 }), /probability/)
})

test('class-conditional OOD thresholds are fitted by predicted model only', () => {
  const fitted = fitClassConditionalOodThresholds([
    { actualModelId: 'a', probabilities: { a: 0.9, b: 0.1 }, meanNegativeLogLikelihood: 1 },
    { actualModelId: 'b', probabilities: { a: 0.8, b: 0.2 }, meanNegativeLogLikelihood: 3 },
    { actualModelId: 'b', probabilities: { a: 0.1, b: 0.9 }, meanNegativeLogLikelihood: 10 },
    { actualModelId: 'a', probabilities: { a: 0.2, b: 0.8 }, meanNegativeLogLikelihood: 20 },
  ], { quantile: 0.95 })
  assert.deepEqual(fitted.thresholdsByPredictedModel, { a: 2.9, b: 19.5 })
  assert.deepEqual(fitted.samplesByPredictedModel, { a: 2, b: 2 })
  assert.equal(fitted.quantile, 0.95)
})

test('evaluation applies the threshold belonging to the predicted model', () => {
  const report = evaluateProbabilityCalibration([
    { sampleId: 'class-a', actualModelId: 'a', probabilities: { a: 0.8, b: 0.2 }, meanNegativeLogLikelihood: 3 },
    { sampleId: 'class-b', actualModelId: 'b', probabilities: { a: 0.2, b: 0.8 }, meanNegativeLogLikelihood: 3 },
  ], {
    schemaVersion: 'fcm.opponent-probability-calibration.v1',
    temperature: 1,
    abstentionThreshold: 0,
    oodMeanNllThreshold: 99,
    oodMeanNllThresholdByPredictedModel: { a: 2, b: 4 },
  })
  assert.equal(report.predictions[0].outOfDistribution, true)
  assert.equal(report.predictions[1].outOfDistribution, false)
  assert.equal(report.accepted, 1)
})

test('frozen new-seed calibration failure is explicit and holdout remains sealed', () => {
  assert.equal(frozenReport.calibration.temperature, 3)
  assert.equal(frozenReport.evaluation.top1Accuracy, 21 / 24)
  assert.ok(frozenReport.evaluation.calibratedLogLoss
    < frozenReport.evaluation.uncalibratedLogLoss)
  assert.ok(frozenReport.evaluation.expectedCalibrationError < 0.15)
  assert.equal(frozenReport.evaluation.accepted, 11)
  assert.equal(frozenReport.gates.selectiveCoveragePassed, false)
  assert.equal(frozenReport.passed, false)
  assert.equal(frozenReport.promotionHoldoutOpened, false)
})

test('frozen class-conditional OOD result recovers coverage but fails log-loss stability', () => {
  assert.equal(classConditionalReport.evaluation.top1Accuracy, 23 / 24)
  assert.equal(classConditionalReport.evaluation.accepted, 12)
  assert.equal(classConditionalReport.evaluation.selectiveAccuracy, 1)
  assert.equal(classConditionalReport.gates.selectiveCoveragePassed, true)
  assert.ok(classConditionalReport.evaluation.calibratedLogLoss
    > classConditionalReport.evaluation.uncalibratedLogLoss)
  assert.equal(classConditionalReport.gates.logLossPassed, false)
  assert.equal(classConditionalReport.passed, false)
  assert.equal(classConditionalReport.promotionHoldoutOpened, false)
})
