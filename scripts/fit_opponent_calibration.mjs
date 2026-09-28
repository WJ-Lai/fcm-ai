#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import {
  calibratePublicActionModel,
  fitPublicActionModel,
  predictPublicActionModel,
  validateOpponentCalibrationDataset,
} from '../src/opponent-calibration.mjs'
import { validatePublicReplayCapture } from '../src/public-replay.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function expandCounts(counts) {
  return Object.entries(counts)
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .flatMap(([code, count]) => Array.from({ length: count }, () => Number(code)))
}

function trainingSamples(rows) {
  return rows.map((row) => ({
    sampleId: row.sampleId,
    modelId: row.modelId,
    publicEventCodes: expandCounts(row.publicEventCounts),
  }))
}

const protocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-calibration-v1/protocol.json'), 'utf8',
))
const dataset = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-calibration-v1/dataset.json'), 'utf8',
))
assert.equal(dataset.schemaVersion, 'fcm.opponent-calibration-dataset.v1')
assert.equal(dataset.protocolDigest, digest(protocol), 'dataset protocol digest differs')
assert.equal(dataset.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
validateOpponentCalibrationDataset(dataset, {
  expectedModelIds: new Set([
    'deterministic-balanced-v1', 'safe-first-v1', 'seeded-random-v1', 'official-built-in-v1',
  ]),
  expectedSamplesPerModel: protocol.developmentSeeds.length,
  expectedCommandsPerGame: protocol.publicCommandHorizon,
})

const model = fitPublicActionModel(trainingSamples(dataset.splits.development.samples), {
  alpha: protocol.laplaceAlpha,
})
const calibration = calibratePublicActionModel(
  model,
  trainingSamples(dataset.splits.calibration.samples),
  { knownQuantile: protocol.oodKnownQuantile },
)
const calibratedModel = {
  ...model,
  calibrationId: 'opponent-public-events-v1',
  oodMeanNllThreshold: calibration.oodMeanNllThreshold,
}

const publicRoot = path.join(root, 'data/public-replays/pilot-100')
const manifest = JSON.parse(await readFile(path.join(publicRoot, 'manifest.json'), 'utf8'))
const humanRecords = manifest.records.slice(50)
const humanPredictions = []
const excludedHumanPrefixes = []
for (const record of humanRecords) {
  const capture = validatePublicReplayCapture(JSON.parse(gunzipSync(
    await readFile(path.join(publicRoot, record.file)),
  ).toString('utf8')))
  for (const participant of capture.participants) {
    const events = capture.history
      .filter((event) => event.seat === participant.seat)
      .map((event) => event.eventCode)
    if (events.length < protocol.humanPrefixEventsPerSeat) {
      excludedHumanPrefixes.push({ gameId: record.gameId, seat: participant.seat, events: events.length })
      continue
    }
    const prediction = predictPublicActionModel(
      calibratedModel,
      events.slice(0, protocol.humanPrefixEventsPerSeat),
    )
    humanPredictions.push({
      sampleId: `human-${record.gameId}-seat-${participant.seat}`,
      ...prediction,
    })
  }
}
assert.ok(humanPredictions.length > 0, 'no human prefixes available')
const humanOod = humanPredictions.filter((prediction) => prediction.outOfDistribution).length
const humanPredictedModels = Object.fromEntries(model.modelIds.map((modelId) => [modelId, 0]))
for (const prediction of humanPredictions) humanPredictedModels[prediction.predictedModelId] += 1
const human = {
  games: humanRecords.length,
  prefixes: humanPredictions.length,
  excludedPrefixes: excludedHumanPrefixes,
  prefixEvents: protocol.humanPrefixEventsPerSeat,
  oodPrefixes: humanOod,
  oodRate: humanOod / humanPredictions.length,
  meanConfidence: humanPredictions.reduce((sum, item) => sum + item.confidence, 0)
    / humanPredictions.length,
  meanNegativeLogLikelihood: humanPredictions.reduce(
    (sum, item) => sum + item.meanNegativeLogLikelihood, 0,
  ) / humanPredictions.length,
  predictedModels: humanPredictedModels,
}
const gates = {
  knownTop1Passed: calibration.top1Accuracy >= protocol.minimumKnownTop1Accuracy,
  humanOodPassed: human.oodRate >= protocol.minimumHumanOodRate,
}
const report = {
  schemaVersion: 'fcm.opponent-calibration-report.v1',
  experimentId: 9,
  hypothesis: 'public-event-prefixes-identify-frozen-policies-and-reject-unmodelled-human-play',
  protocolDigest: digest(protocol),
  datasetDigest: digest(dataset),
  rulesetHash: dataset.rulesetHash,
  model: calibratedModel,
  calibration,
  human,
  gates,
  passed: Object.values(gates).every(Boolean),
  promotionHoldoutOpened: false,
}
const output = path.join(root, 'fixtures/opponent-calibration-v1/report.json')
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  output,
  knownTop1Accuracy: calibration.top1Accuracy,
  logLoss: calibration.logLoss,
  brierScore: calibration.brierScore,
  humanOodRate: human.oodRate,
  humanPrefixes: human.prefixes,
  gates,
  passed: report.passed,
}, null, 2)}\n`)
