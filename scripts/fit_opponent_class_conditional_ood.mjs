#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  encodePublicEventFeatures,
  predictPublicActionModel,
  validateOpponentValidationDataset,
} from '../src/opponent-calibration.mjs'
import {
  evaluateProbabilityCalibration,
  fitClassConditionalOodThresholds,
} from '../src/opponent-probability-calibration.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = (name) => path.join(root, 'fixtures', name)
const protocolPath = fixture('opponent-calibration-v4/protocol.json')
const baseDatasetPath = fixture('opponent-calibration-v2/dataset.json')
const baseReportPath = fixture('opponent-calibration-v2/report.json')
const probabilityReportPath = fixture('opponent-calibration-v3/report.json')
const validationPath = fixture('opponent-calibration-v4/validation.json')
const outputPath = fixture('opponent-calibration-v4/report.json')

function jsonDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function readHashedJson(filePath, expectedHash, label) {
  const bytes = await readFile(filePath)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash,
    `${label} bytes differ from frozen protocol`)
  return JSON.parse(bytes)
}

const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
await readHashedJson(baseDatasetPath, protocol.baseDatasetSha256, 'base dataset')
const baseReport = await readHashedJson(baseReportPath, protocol.baseReportSha256, 'base report')
const probabilityReport = await readHashedJson(
  probabilityReportPath, protocol.probabilityReportSha256, 'probability report',
)
assert.equal(probabilityReport.calibration.temperature, protocol.frozenTemperature,
  'frozen temperature differs')
assert.equal(probabilityReport.calibration.abstentionThreshold,
  protocol.frozenAbstentionThreshold, 'frozen abstention threshold differs')
assert.equal(probabilityReport.promotionHoldoutOpened, false, 'prior holdout must remain sealed')

const validation = JSON.parse(await readFile(validationPath, 'utf8'))
assert.equal(validation.protocolDigest, jsonDigest(protocol), 'validation protocol digest differs')
assert.equal(validation.rulesetHash, baseReport.rulesetHash, 'validation ruleset differs')
assert.equal(validation.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
const modelIds = new Set(baseReport.model.modelIds)
validateOpponentValidationDataset(validation, {
  expectedModelIds: modelIds,
  expectedSamplesPerModel: protocol.validationSeeds.length,
  expectedCommandsPerGame: protocol.publicCommandHorizon,
})

const classConditional = fitClassConditionalOodThresholds(baseReport.calibration.predictions, {
  quantile: protocol.classConditionalOodQuantile,
})
const calibration = {
  schemaVersion: 'fcm.opponent-probability-calibration.v1',
  temperature: protocol.frozenTemperature,
  abstentionThreshold: protocol.frozenAbstentionThreshold,
  oodMeanNllThreshold: baseReport.model.oodMeanNllThreshold,
  oodMeanNllThresholdByPredictedModel: classConditional.thresholdsByPredictedModel,
  classConditionalOodFit: classConditional,
}
const validationRows = validation.splits.validation.samples.map((sample) => {
  const features = encodePublicEventFeatures(sample.publicEventSequence, { includeTransitions: true })
  const prediction = predictPublicActionModel(baseReport.model, features)
  return {
    sampleId: sample.sampleId,
    actualModelId: sample.modelId,
    probabilities: prediction.probabilities,
    meanNegativeLogLikelihood: prediction.meanNegativeLogLikelihood,
    unknownEventFraction: prediction.unknownEventFraction,
  }
})
const evaluation = evaluateProbabilityCalibration(validationRows, calibration)
const gates = {
  top1Passed: evaluation.top1Accuracy >= protocol.validationGates.minimumTop1Accuracy,
  logLossPassed: evaluation.calibratedLogLoss <= evaluation.uncalibratedLogLoss + 1e-12,
  ecePassed: evaluation.expectedCalibrationError
    <= protocol.validationGates.maximumExpectedCalibrationError,
  selectiveCoveragePassed: evaluation.selectiveCoverage
    >= protocol.validationGates.minimumSelectiveCoverage,
  selectiveAccuracyPassed: evaluation.selectiveAccuracy != null
    && evaluation.selectiveAccuracy >= protocol.validationGates.minimumSelectiveAccuracy,
}
const report = {
  schemaVersion: 'fcm.opponent-class-conditional-ood-report.v4',
  experimentId: 12,
  hypothesis: 'predicted-class-conditional-ood-recovers-valid-belief-coverage',
  protocolDigest: jsonDigest(protocol),
  validationDigest: jsonDigest(validation),
  rulesetHash: validation.rulesetHash,
  calibration,
  evaluation,
  gates,
  passed: Object.values(gates).every(Boolean),
  promotionHoldoutOpened: false,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  thresholds: classConditional.thresholdsByPredictedModel,
  thresholdSamples: classConditional.samplesByPredictedModel,
  top1Accuracy: evaluation.top1Accuracy,
  calibratedLogLoss: evaluation.calibratedLogLoss,
  expectedCalibrationError: evaluation.expectedCalibrationError,
  oodRate: evaluation.oodRate,
  selectiveCoverage: evaluation.selectiveCoverage,
  selectiveAccuracy: evaluation.selectiveAccuracy,
  gates,
  passed: report.passed,
}, null, 2)}\n`)
