#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { fitPhaseRoutedValueModel } from '../src/phase-value-model.mjs'
import { buildPairwiseTrainingRows } from '../src/value-dataset.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const artifactPath = (value) => path.relative(repositoryRoot, value)

const developmentPath = path.resolve(argument(
  '--development',
  'fixtures/value-calibration-v2/development.json',
))
const calibrationPath = path.resolve(argument(
  '--calibration',
  'fixtures/value-calibration-v2/calibration.json',
))
const outputPath = path.resolve(argument(
  '--output',
  'fixtures/value-calibration-v2/phase-selection.json',
))
const developmentText = await readFile(developmentPath, 'utf8')
const calibrationText = await readFile(calibrationPath, 'utf8')
const development = JSON.parse(developmentText)
const calibration = JSON.parse(calibrationText)
if (development.split !== 'development' || calibration.split !== 'calibration') {
  throw new Error('expected declared development and calibration splits')
}
if (JSON.stringify(development.featureNames) !== JSON.stringify(calibration.featureNames)) {
  throw new Error('development/calibration feature order differs')
}
if (development.rulesetHash !== calibration.rulesetHash) {
  throw new Error('development/calibration ruleset hashes differ')
}

const result = fitPhaseRoutedValueModel(
  buildPairwiseTrainingRows(development),
  buildPairwiseTrainingRows(calibration),
  {
    featureNames: development.featureNames,
    lambdas: [0.01, 0.1, 1, 10, 100],
    iterations: 1200,
    learningRate: 0.2,
  },
)
const artifact = {
  ...result,
  featureVersion: development.featureVersion,
  rulesetHash: development.rulesetHash,
  data: {
    development: {
      path: artifactPath(developmentPath),
      digest: digest(developmentText),
      games: development.games.length,
    },
    calibration: {
      path: artifactPath(calibrationPath),
      digest: digest(calibrationText),
      games: calibration.games.length,
    },
    promotionHoldoutOpened: false,
  },
}
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  schemaVersion: artifact.schemaVersion,
  output: outputPath,
  selectedLambdas: artifact.selectedLambdas,
  calibrationAudit: artifact.calibrationAudit,
  data: artifact.data,
  promotionStatus: artifact.promotionStatus,
}, null, 2)}\n`)
