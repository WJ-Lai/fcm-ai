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
  fitProbabilityCalibration,
} from '../src/opponent-probability-calibration.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocolPath = path.join(root, 'fixtures/opponent-calibration-v3/protocol.json')
const baseDatasetPath = path.join(root, 'fixtures/opponent-calibration-v2/dataset.json')
const baseReportPath = path.join(root, 'fixtures/opponent-calibration-v2/report.json')
const validationPath = path.join(root, 'fixtures/opponent-calibration-v3/validation.json')
const outputPath = path.join(root, 'fixtures/opponent-calibration-v3/report.json')

function jsonDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
const baseDatasetBytes = await readFile(baseDatasetPath)
assert.equal(createHash('sha256').update(baseDatasetBytes).digest('hex'), protocol.baseDatasetSha256,
  'base dataset bytes differ from frozen protocol')
const baseReport = JSON.parse(await readFile(baseReportPath, 'utf8'))
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

const calibration = fitProbabilityCalibration(baseReport.calibration.predictions, {
  temperatureGrid: protocol.temperatureGrid,
  minimumSelectiveAccuracy: protocol.minimumCalibrationSelectiveAccuracy,
  minimumCoverage: protocol.minimumCalibrationCoverage,
  oodMeanNllThreshold: baseReport.model.oodMeanNllThreshold,
})
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
  schemaVersion: 'fcm.opponent-probability-calibration-report.v3',
  experimentId: 11,
  hypothesis: 'temperature-and-abstention-calibrate-temporal-opponent-beliefs-on-new-seeds',
  protocolDigest: jsonDigest(protocol),
  baseDatasetSha256: protocol.baseDatasetSha256,
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
  temperature: calibration.temperature,
  abstentionThreshold: calibration.abstentionThreshold,
  top1Accuracy: evaluation.top1Accuracy,
  uncalibratedLogLoss: evaluation.uncalibratedLogLoss,
  calibratedLogLoss: evaluation.calibratedLogLoss,
  expectedCalibrationError: evaluation.expectedCalibrationError,
  selectiveCoverage: evaluation.selectiveCoverage,
  selectiveAccuracy: evaluation.selectiveAccuracy,
  gates,
  passed: report.passed,
}, null, 2)}\n`)
