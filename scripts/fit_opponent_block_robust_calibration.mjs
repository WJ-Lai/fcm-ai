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
  fitBlockRobustProbabilityCalibration,
  fitClassConditionalOodThresholds,
} from '../src/opponent-probability-calibration.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = (name) => path.join(root, 'fixtures', name)
const protocolPath = fixture('opponent-calibration-v5/protocol.json')
const baseReportPath = fixture('opponent-calibration-v2/report.json')
const consumedPaths = [
  fixture('opponent-calibration-v3/validation.json'),
  fixture('opponent-calibration-v4/validation.json'),
]
const validationPath = fixture('opponent-calibration-v5/validation.json')
const outputPath = fixture('opponent-calibration-v5/report.json')
const fitOnly = process.argv.includes('--fit-only')

function jsonDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function readHashedJson(filePath, expectedHash, label) {
  const bytes = await readFile(filePath)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash,
    `${label} bytes differ from frozen protocol`)
  return JSON.parse(bytes)
}

function predictRows(samples, model, prefix) {
  return samples.map((sample) => {
    const prediction = predictPublicActionModel(
      model, encodePublicEventFeatures(sample.publicEventSequence, { includeTransitions: true }),
    )
    return {
      sampleId: `${prefix}-${sample.sampleId}`,
      actualModelId: sample.modelId,
      probabilities: prediction.probabilities,
      meanNegativeLogLikelihood: prediction.meanNegativeLogLikelihood,
      unknownEventFraction: prediction.unknownEventFraction,
    }
  })
}

const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
const baseReport = await readHashedJson(
  baseReportPath, protocol.baseReportSha256, 'base report',
)
const consumed = await Promise.all(consumedPaths.map((filePath, index) => readHashedJson(
  filePath, protocol.consumedValidationSha256[index], `consumed validation ${index}`,
)))
const calibrationRows = baseReport.calibration.predictions.map((row, index) => ({
  ...row, sampleId: `base-${index}`,
}))
const classConditional = fitClassConditionalOodThresholds(calibrationRows, {
  quantile: protocol.classConditionalOodQuantile,
})
const developmentBlocks = [
  { blockId: 'base-calibration', rows: calibrationRows },
  ...consumed.map((dataset, index) => ({
    blockId: `consumed-${index + 1}`,
    rows: predictRows(dataset.splits.validation.samples, baseReport.model, `consumed-${index + 1}`),
  })),
]
const calibration = fitBlockRobustProbabilityCalibration(developmentBlocks, {
  temperatureGrid: protocol.temperatureGrid,
  minimumPerBlockCoverage: protocol.fittingGates.minimumPerBlockCoverage,
  minimumPerBlockSelectiveAccuracy: protocol.fittingGates.minimumPerBlockSelectiveAccuracy,
  requirePerBlockLogLossNonInferiority:
    protocol.fittingGates.requirePerBlockLogLossNonInferiority,
  oodMeanNllThresholdByPredictedModel: classConditional.thresholdsByPredictedModel,
})
calibration.classConditionalOodFit = classConditional

if (fitOnly) {
  process.stdout.write(`${JSON.stringify({ calibration, promotionHoldoutOpened: false }, null, 2)}\n`)
  process.exit(0)
}

const validation = JSON.parse(await readFile(validationPath, 'utf8'))
assert.equal(validation.protocolDigest, jsonDigest(protocol), 'validation protocol digest differs')
assert.equal(validation.rulesetHash, baseReport.rulesetHash, 'validation ruleset differs')
assert.equal(validation.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
validateOpponentValidationDataset(validation, {
  expectedModelIds: new Set(baseReport.model.modelIds),
  expectedSamplesPerModel: protocol.validationSeeds.length,
  expectedCommandsPerGame: protocol.publicCommandHorizon,
})
assert.equal(validation.splits.validation.games.length % protocol.validationBlockSize, 0,
  'validation games do not form complete blocks')
const freshRows = predictRows(validation.splits.validation.samples, baseReport.model, 'fresh')
  .map((row, index) => ({
    ...row,
    gameIndex: validation.splits.validation.samples[index].gameIndex,
  }))
const blockCount = validation.splits.validation.games.length / protocol.validationBlockSize
const validationBlocks = Array.from({ length: blockCount }, (_, blockIndex) => {
  const lowerGame = blockIndex * protocol.validationBlockSize
  const upperGame = lowerGame + protocol.validationBlockSize
  const rows = freshRows.filter((row) => row.gameIndex >= lowerGame && row.gameIndex < upperGame)
    .map(({ gameIndex: _gameIndex, ...row }) => row)
  const evaluation = evaluateProbabilityCalibration(rows, calibration)
  const gates = {
    top1Passed: evaluation.top1Accuracy
      >= protocol.validationGates.minimumPerBlockTop1Accuracy,
    logLossPassed: !protocol.validationGates.requirePerBlockLogLossNonInferiority
      || evaluation.calibratedLogLoss <= evaluation.uncalibratedLogLoss + 1e-12,
    ecePassed: evaluation.expectedCalibrationError
      <= protocol.validationGates.maximumPerBlockExpectedCalibrationError,
    selectiveCoveragePassed: evaluation.selectiveCoverage
      >= protocol.validationGates.minimumPerBlockSelectiveCoverage,
    selectiveAccuracyPassed: evaluation.selectiveAccuracy != null
      && evaluation.selectiveAccuracy
        >= protocol.validationGates.minimumPerBlockSelectiveAccuracy,
  }
  return {
    blockId: `fresh-${blockIndex + 1}`,
    gameIndexes: Array.from({ length: protocol.validationBlockSize }, (_, offset) => (
      lowerGame + offset
    )),
    evaluation,
    gates,
    passed: Object.values(gates).every(Boolean),
  }
})
const aggregateRows = freshRows.map(({ gameIndex: _gameIndex, ...row }) => row)
const aggregateEvaluation = evaluateProbabilityCalibration(aggregateRows, calibration)
const report = {
  schemaVersion: 'fcm.opponent-block-robust-calibration-report.v5',
  experimentId: 13,
  hypothesis: 'worst-block-constrained-calibration-generalizes-across-fresh-seed-blocks',
  protocolDigest: jsonDigest(protocol),
  validationDigest: jsonDigest(validation),
  rulesetHash: validation.rulesetHash,
  calibration,
  validationBlocks,
  aggregateEvaluation,
  passed: validationBlocks.every((block) => block.passed),
  promotionHoldoutOpened: false,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  temperature: calibration.temperature,
  abstentionThreshold: calibration.abstentionThreshold,
  developmentBlocks: calibration.developmentBlocks,
  validationBlocks: validationBlocks.map((block) => ({
    blockId: block.blockId,
    top1Accuracy: block.evaluation.top1Accuracy,
    logLoss: [block.evaluation.uncalibratedLogLoss, block.evaluation.calibratedLogLoss],
    ece: block.evaluation.expectedCalibrationError,
    coverage: block.evaluation.selectiveCoverage,
    selectiveAccuracy: block.evaluation.selectiveAccuracy,
    gates: block.gates,
    passed: block.passed,
  })),
  passed: report.passed,
}, null, 2)}\n`)
