import assert from 'node:assert/strict'

export const OPPONENT_CALIBRATION_VERSION = 'fcm.opponent-public-action-model.v1'

const SAMPLE_KEYS = new Set(['sampleId', 'modelId', 'publicEventCodes'])

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  for (const key of Object.keys(value)) assert.ok(expected.has(key), `unknown ${label} field ${key}`)
  for (const key of expected) assert.ok(Object.hasOwn(value, key), `${label} is missing ${key}`)
}

function stableId(value, label) {
  assert.match(value, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} must be a stable id`)
}

function validateSamples(samples, { knownModels = null, forbiddenIds = new Set() } = {}) {
  assert.ok(Array.isArray(samples) && samples.length > 0, 'samples must be non-empty')
  const ids = new Set()
  for (const sample of samples) {
    exactKeys(sample, SAMPLE_KEYS, 'sample')
    stableId(sample.sampleId, 'sampleId')
    assert.equal(ids.has(sample.sampleId), false, `duplicate sampleId ${sample.sampleId}`)
    assert.equal(forbiddenIds.has(sample.sampleId), false,
      `development sampleId reused in calibration: ${sample.sampleId}`)
    ids.add(sample.sampleId)
    stableId(sample.modelId, 'modelId')
    if (knownModels) assert.ok(knownModels.has(sample.modelId), `unknown modelId ${sample.modelId}`)
    assert.ok(Array.isArray(sample.publicEventCodes) && sample.publicEventCodes.length > 0,
      `${sample.sampleId}: publicEventCodes must be non-empty`)
    for (const code of sample.publicEventCodes) {
      assert.ok(Number.isInteger(code) && code >= 0 && code <= 65791,
        `${sample.sampleId}: invalid public event code`)
    }
  }
  return ids
}

function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right)
}

export function validateOpponentCalibrationDataset(dataset, {
  expectedModelIds,
  expectedSamplesPerModel,
  expectedCommandsPerGame,
  expectedFeatureVersion = 'public-event-histogram-v1',
}) {
  exactKeys(dataset, new Set([
    'schemaVersion', 'protocolDigest', 'populationDigest', 'rulesetHash', 'featureVersion',
    'promotionHoldoutOpened', 'splits',
  ]), 'calibration dataset')
  const temporal = expectedFeatureVersion === 'public-event-unigram-bigram-v2'
  assert.equal(dataset.schemaVersion, temporal
    ? 'fcm.opponent-calibration-dataset.v2'
    : 'fcm.opponent-calibration-dataset.v1')
  assert.match(dataset.protocolDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(dataset.populationDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(dataset.rulesetHash, /^[a-f0-9]{64}$/)
  assert.equal(dataset.featureVersion, expectedFeatureVersion)
  assert.equal(dataset.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
  exactKeys(dataset.splits, new Set(['development', 'calibration']), 'calibration splits')
  const allSampleIds = new Set()
  for (const splitName of ['development', 'calibration']) {
    const split = dataset.splits[splitName]
    exactKeys(split, new Set(['games', 'samples']), `${splitName} split`)
    assert.ok(Array.isArray(split.games) && split.games.length > 0, `${splitName} has no games`)
    for (const game of split.games) {
      exactKeys(game, new Set(['gameIndex', 'seed', 'commands', 'terminal']), 'calibration game')
      assert.ok(Number.isInteger(game.gameIndex) && game.gameIndex >= 0, 'invalid gameIndex')
      stableId(game.seed, 'calibration seed')
      assert.equal(game.commands, expectedCommandsPerGame, 'calibration command horizon differs')
      assert.equal(typeof game.terminal, 'boolean', 'terminal marker must be boolean')
    }
    const countsByModel = Object.fromEntries([...expectedModelIds].map((modelId) => [modelId, 0]))
    for (const sample of split.samples) {
      const sampleKeys = new Set([
        'sampleId', 'gameIndex', 'seat', 'modelId', 'publicEventCounts', 'totalEvents',
      ])
      if (temporal) sampleKeys.add('publicEventSequence')
      exactKeys(sample, sampleKeys, 'calibration sample')
      stableId(sample.sampleId, 'calibration sampleId')
      assert.equal(allSampleIds.has(sample.sampleId), false, `duplicate sampleId ${sample.sampleId}`)
      allSampleIds.add(sample.sampleId)
      assert.ok(Number.isInteger(sample.gameIndex) && sample.gameIndex >= 0, 'invalid sample gameIndex')
      assert.ok(Number.isInteger(sample.seat) && sample.seat >= 0, 'invalid sample seat')
      assert.ok(expectedModelIds.has(sample.modelId), `unknown modelId ${sample.modelId}`)
      assert.ok(sample.publicEventCounts && typeof sample.publicEventCounts === 'object'
        && !Array.isArray(sample.publicEventCounts), 'publicEventCounts must be an object')
      let total = 0
      for (const [rawCode, count] of Object.entries(sample.publicEventCounts)) {
        const code = Number(rawCode)
        assert.ok(Number.isInteger(code) && code >= 0 && code <= 255, 'invalid public event code')
        assert.ok(Number.isInteger(count) && count > 0, 'invalid public event count')
        total += count
      }
      assert.equal(total, sample.totalEvents, 'public event total differs')
      assert.ok(total > 0, 'sample has no public events')
      if (temporal) {
        assert.ok(Array.isArray(sample.publicEventSequence), 'publicEventSequence must be an array')
        assert.equal(sample.publicEventSequence.length, total, 'public event sequence length differs')
        const sequenceCounts = {}
        for (const code of sample.publicEventSequence) {
          assert.ok(Number.isInteger(code) && code >= 0 && code <= 255,
            'invalid public event sequence code')
          sequenceCounts[code] = (sequenceCounts[code] ?? 0) + 1
        }
        assert.deepEqual(
          Object.fromEntries(Object.entries(sequenceCounts).sort(
            (left, right) => Number(left[0]) - Number(right[0]),
          )),
          sample.publicEventCounts,
          'public event sequence does not reproduce counts',
        )
      }
      countsByModel[sample.modelId] += 1
    }
    for (const modelId of expectedModelIds) {
      assert.equal(countsByModel[modelId], expectedSamplesPerModel,
        `${splitName} sample count differs for ${modelId}`)
    }
  }
  return dataset
}

export function encodePublicEventFeatures(publicEventCodes, { includeTransitions = false } = {}) {
  assert.ok(Array.isArray(publicEventCodes) && publicEventCodes.length > 0,
    'publicEventCodes must be non-empty')
  for (const code of publicEventCodes) {
    assert.ok(Number.isInteger(code) && code >= 0 && code <= 255, 'invalid raw public event code')
  }
  if (!includeTransitions) return [...publicEventCodes]
  const transitions = publicEventCodes.slice(1).map((code, index) => (
    256 + publicEventCodes[index] * 256 + code
  ))
  return [...publicEventCodes, ...transitions]
}

export function fitPublicActionModel(samples, {
  alpha = 1,
  featureVersion = 'public-event-histogram-v1',
} = {}) {
  const sampleIds = validateSamples(samples)
  assert.ok(Number.isFinite(alpha) && alpha > 0, 'alpha must be positive')
  const modelIds = [...new Set(samples.map((sample) => sample.modelId))].sort()
  assert.ok(modelIds.length >= 2, 'at least two models are required')
  const vocabulary = sortedNumbers(new Set(samples.flatMap((sample) => sample.publicEventCodes)))
  const eventCounts = {}
  const sampleCounts = {}
  for (const modelId of modelIds) {
    eventCounts[modelId] = Object.fromEntries(vocabulary.map((code) => [code, 0]))
    sampleCounts[modelId] = 0
  }
  for (const sample of samples) {
    sampleCounts[sample.modelId] += 1
    for (const code of sample.publicEventCodes) eventCounts[sample.modelId][code] += 1
  }
  const totalSamples = samples.length
  return {
    schemaVersion: OPPONENT_CALIBRATION_VERSION,
    featureVersion,
    alpha,
    modelIds,
    vocabulary,
    sampleCounts,
    eventCounts,
    priors: Object.fromEntries(modelIds.map((modelId) => [
      modelId, sampleCounts[modelId] / totalSamples,
    ])),
    developmentSampleIds: [...sampleIds].sort(),
  }
}

function eventProbability(model, modelId, code) {
  const counts = model.eventCounts[modelId]
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const denominator = total + model.alpha * (model.vocabulary.length + 1)
  return ((counts[code] ?? 0) + model.alpha) / denominator
}

export function predictPublicActionModel(model, publicEventCodes) {
  assert.equal(model?.schemaVersion, OPPONENT_CALIBRATION_VERSION,
    'unsupported public action model')
  assert.ok(Array.isArray(publicEventCodes) && publicEventCodes.length > 0,
    'publicEventCodes must be non-empty')
  const vocabulary = new Set(model.vocabulary)
  const logScores = {}
  const meanNll = {}
  for (const modelId of model.modelIds) {
    const eventLogLikelihood = publicEventCodes.reduce((sum, code) => {
      assert.ok(Number.isInteger(code) && code >= 0 && code <= 65791, 'invalid public feature code')
      return sum + Math.log(eventProbability(model, modelId, code))
    }, 0)
    logScores[modelId] = Math.log(model.priors[modelId]) + eventLogLikelihood
    meanNll[modelId] = -eventLogLikelihood / publicEventCodes.length
  }
  const maximum = Math.max(...Object.values(logScores))
  const mass = Object.fromEntries(model.modelIds.map((modelId) => [
    modelId, Math.exp(logScores[modelId] - maximum),
  ]))
  const total = Object.values(mass).reduce((sum, value) => sum + value, 0)
  const probabilities = Object.fromEntries(model.modelIds.map((modelId) => [
    modelId, mass[modelId] / total,
  ]))
  const predictedModelId = [...model.modelIds].sort((left, right) => (
    probabilities[right] - probabilities[left] || left.localeCompare(right)
  ))[0]
  const unknownEventFraction = publicEventCodes.filter((code) => !vocabulary.has(code)).length
    / publicEventCodes.length
  const meanNegativeLogLikelihood = meanNll[predictedModelId]
  return {
    predictedModelId,
    probabilities,
    confidence: probabilities[predictedModelId],
    meanNegativeLogLikelihood,
    unknownEventFraction,
    outOfDistribution: unknownEventFraction > 0
      || (model.oodMeanNllThreshold != null
        && meanNegativeLogLikelihood > model.oodMeanNllThreshold),
  }
}

function quantile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(fraction * ordered.length) - 1)
  return ordered[index]
}

export function calibratePublicActionModel(model, samples, { knownQuantile = 0.95 } = {}) {
  assert.ok(Number.isFinite(knownQuantile) && knownQuantile > 0 && knownQuantile <= 1,
    'knownQuantile must be in (0, 1]')
  const modelIds = new Set(model.modelIds)
  validateSamples(samples, {
    knownModels: modelIds,
    forbiddenIds: new Set(model.developmentSampleIds),
  })
  const confusion = Object.fromEntries(model.modelIds.map((actual) => [
    actual, Object.fromEntries(model.modelIds.map((predicted) => [predicted, 0])),
  ]))
  let correct = 0
  let logLoss = 0
  let brier = 0
  const nlls = []
  const predictions = []
  for (const sample of samples) {
    const prediction = predictPublicActionModel(model, sample.publicEventCodes)
    predictions.push({ sampleId: sample.sampleId, actualModelId: sample.modelId, ...prediction })
    confusion[sample.modelId][prediction.predictedModelId] += 1
    if (prediction.predictedModelId === sample.modelId) correct += 1
    logLoss -= Math.log(Math.max(Number.EPSILON, prediction.probabilities[sample.modelId]))
    brier += model.modelIds.reduce((sum, modelId) => (
      sum + (prediction.probabilities[modelId] - Number(modelId === sample.modelId)) ** 2
    ), 0)
    nlls.push(prediction.meanNegativeLogLikelihood)
  }
  const confidenceBins = Array.from({ length: 5 }, (_, index) => {
    const lower = index / 5
    const upper = (index + 1) / 5
    const members = predictions.filter((prediction) => (
      prediction.confidence >= lower
      && (index === 4 ? prediction.confidence <= upper : prediction.confidence < upper)
    ))
    return {
      lower,
      upper,
      count: members.length,
      accuracy: members.length
        ? members.filter((item) => item.predictedModelId === item.actualModelId).length / members.length
        : null,
      meanConfidence: members.length
        ? members.reduce((sum, item) => sum + item.confidence, 0) / members.length
        : null,
    }
  })
  return {
    samples: samples.length,
    top1Accuracy: correct / samples.length,
    logLoss: logLoss / samples.length,
    brierScore: brier / samples.length,
    oodMeanNllThreshold: quantile(nlls, knownQuantile),
    confusion,
    confidenceBins,
    predictions,
  }
}
