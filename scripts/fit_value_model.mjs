#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  auditPairwiseValueModel,
  crossValidatePairwiseValueModel,
  fitPairwiseValueModel,
} from '../src/pairwise-value-model.mjs'
import { buildPairwiseTrainingRows } from '../src/value-dataset.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)

const inputPath = path.resolve(argument(
  '--input',
  'fixtures/value-calibration-v2/development.json',
))
const outputPath = argument('--output', null)
const lambdas = argument('--lambdas', '0.01,0.1,1,10,100')
  .split(',')
  .map(Number)
if (!lambdas.length || lambdas.some((value) => !Number.isFinite(value) || value < 0)) {
  throw new Error('--lambdas must contain non-negative finite numbers')
}

const dataset = JSON.parse(await readFile(inputPath, 'utf8'))
if (dataset.split !== 'development') {
  throw new Error('this fitting stage accepts development data only')
}
const rows = buildPairwiseTrainingRows(dataset)
const candidates = lambdas.map((lambda) => {
  const options = {
    featureNames: dataset.featureNames,
    lambda,
    iterations: 1200,
    learningRate: 0.2,
  }
  const model = fitPairwiseValueModel(rows, options)
  const crossValidation = crossValidatePairwiseValueModel(rows, options)
  const topWeights = dataset.featureNames.map((name, index) => ({
    name,
    standardizedWeight: model.standardizedWeights[index],
    rawWeight: model.standardizedWeights[index] / model.scales[index],
  })).sort((left, right) => (
    Math.abs(right.standardizedWeight) - Math.abs(left.standardizedWeight) ||
    left.name.localeCompare(right.name)
  )).slice(0, 12)
  return {
    lambda,
    developmentAudit: auditPairwiseValueModel(model, rows),
    leaveOneGameOut: crossValidation,
    topWeights,
    model,
  }
})
const report = {
  schemaVersion: 'fcm.value-development-fit.v2',
  dataset: {
    path: path.relative(repositoryRoot, inputPath),
    protocolVersion: dataset.protocolVersion,
    featureVersion: dataset.featureVersion,
    rulesetHash: dataset.rulesetHash,
    games: dataset.games.length,
    rows: rows.length,
  },
  candidates,
  selectionStatus: 'deferred-to-frozen-calibration-split',
  promotionStatus: 'not-promoted',
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath) {
  await writeFile(path.resolve(outputPath), serialized, 'utf8')
  process.stdout.write(`${JSON.stringify({
    schemaVersion: report.schemaVersion,
    output: path.resolve(outputPath),
    dataset: report.dataset,
    candidates: candidates.map((candidate) => ({
      lambda: candidate.lambda,
      developmentGameAccuracy: candidate.developmentAudit.gameAccuracy,
      crossValidatedGameAccuracy: candidate.leaveOneGameOut.gameAccuracy,
      crossValidatedTurnAccuracy: candidate.leaveOneGameOut.weightedAccuracy,
      crossValidatedLogLoss: candidate.leaveOneGameOut.weightedLogLoss,
      topWeights: candidate.topWeights.slice(0, 5),
    })),
    selectionStatus: report.selectionStatus,
    promotionStatus: report.promotionStatus,
  }, null, 2)}\n`)
} else {
  process.stdout.write(serialized)
}
