#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  auditPairedSequentialDataset,
  validatePairedSequentialProtocol,
} from '../src/paired-sequential-estimator.mjs'
import { validateActionRegretStability } from '../src/action-regret-stability.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const datasetPath = path.resolve(argument(
  '--dataset',
  'fixtures/action-regret-stability-v1/report.json',
))
const protocolPath = path.resolve(argument(
  '--protocol',
  'fixtures/paired-sequential-v1/protocol.json',
))
const outputPath = path.resolve(argument(
  '--output',
  'fixtures/paired-sequential-v1/iteration-4.json',
))
const datasetText = await readFile(datasetPath, 'utf8')
const protocolText = await readFile(protocolPath, 'utf8')
const dataset = JSON.parse(datasetText)
const protocol = JSON.parse(protocolText)
validateActionRegretStability(dataset)
const protocolSummary = validatePairedSequentialProtocol(protocol)
assert.equal(protocol.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')

const audit = auditPairedSequentialDataset(dataset, protocol)
const report = {
  schemaVersion: 'fcm.paired-sequential-experiment.v1',
  experimentId: 4,
  hypothesis: 'sequential paired evidence abstains instead of forcing noisy action labels',
  datasetDigest: digest(datasetText),
  protocolDigest: digest(protocolText),
  rulesetHash: dataset.rulesetHash,
  protocolSummary,
  audit,
  promotionHoldoutOpened: false,
  promotionStatus: 'not-evaluated',
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ output: outputPath, ...report }, null, 2)}\n`)
