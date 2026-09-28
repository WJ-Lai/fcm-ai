#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildPairwiseTrainingRows } from '../src/value-dataset.mjs'
import { auditValueCutoffs } from '../src/value-cutoff-audit.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const modelPath = path.resolve(argument(
  '--model',
  'fixtures/value-calibration-v2/phase-selection.json',
))
const datasetPath = path.resolve(argument(
  '--dataset',
  'fixtures/value-calibration-v2/calibration.json',
))
const outputPath = path.resolve(argument(
  '--output',
  'fixtures/value-calibration-v2/cutoff-audit.json',
))
const modelText = await readFile(modelPath, 'utf8')
const datasetText = await readFile(datasetPath, 'utf8')
const selection = JSON.parse(modelText)
const dataset = JSON.parse(datasetText)

assert.equal(dataset.split, 'calibration', 'cutoff audit is frozen to calibration data')
assert.equal(dataset.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
assert.equal(selection.promotionStatus, 'not-evaluated', 'promoted model cannot be tuned here')
assert.equal(selection.rulesetHash, dataset.rulesetHash, 'model/dataset ruleset drift')
assert.equal(selection.featureVersion, dataset.featureVersion, 'model/dataset feature drift')
assert.equal(
  selection.data?.calibration?.digest,
  digest(datasetText),
  'calibration dataset changed after model selection',
)

const audit = auditValueCutoffs(selection.calibrationModel, buildPairwiseTrainingRows(dataset))
const report = {
  ...audit,
  rulesetHash: dataset.rulesetHash,
  featureVersion: dataset.featureVersion,
  modelSchemaVersion: selection.calibrationModel.schemaVersion,
  modelTrainingBoundary: 'development-only-selected-on-disjoint-calibration',
  modelPath: path.relative(repositoryRoot, modelPath),
  modelDigest: digest(modelText),
  datasetPath: path.relative(repositoryRoot, datasetPath),
  datasetDigest: digest(datasetText),
  horizonSemantics: 'retrospective-realized-remaining-observed-turns-not-policy-input',
  promotionHoldoutOpened: false,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  output: path.relative(repositoryRoot, outputPath),
  games: report.games,
  observations: report.observations,
  byPhase: report.byPhase,
  byRemainingTurns: report.byRemainingTurns,
  reversals: report.reversals,
  promotionHoldoutOpened: report.promotionHoldoutOpened,
}, null, 2)}\n`)
