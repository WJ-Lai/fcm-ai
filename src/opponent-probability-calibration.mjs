import assert from 'node:assert/strict'

export const OPPONENT_PROBABILITY_CALIBRATION_VERSION = 'fcm.opponent-probability-calibration.v1'

function validateProbabilities(probabilities) {
  assert.ok(probabilities && typeof probabilities === 'object' && !Array.isArray(probabilities),
    'probabilities must be an object')
  const entries = Object.entries(probabilities)
  assert.ok(entries.length >= 2, 'at least two model probabilities are required')
  let total = 0
  for (const [modelId, probability] of entries) {
    assert.match(modelId, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, 'invalid model id')
    assert.ok(Number.isFinite(probability) && probability >= 0 && probability <= 1,
      `invalid probability for ${modelId}`)
    total += probability
  }
  assert.ok(Math.abs(total - 1) <= 1e-9, 'probabilities must sum to 1')
  return entries.map(([modelId]) => modelId).sort()
}

function predictionFrom(probabilities) {
  const modelIds = validateProbabilities(probabilities)
  return modelIds.sort((left, right) => (
    probabilities[right] - probabilities[left] || left.localeCompare(right)
  ))[0]
}

export function temperatureScaleProbabilities(probabilities, temperature) {
  validateProbabilities(probabilities)
  assert.ok(Number.isFinite(temperature) && temperature > 0, 'temperature must be positive')
  const masses = Object.fromEntries(Object.entries(probabilities).map(([modelId, probability]) => [
    modelId,
    probability === 0 ? 0 : Math.exp(Math.log(probability) / temperature),
  ]))
  const total = Object.values(masses).reduce((sum, value) => sum + value, 0)
  assert.ok(Number.isFinite(total) && total > 0, 'temperature scaling has no finite mass')
  return Object.fromEntries(Object.entries(masses).map(([modelId, mass]) => [modelId, mass / total]))
}

function validatePredictionRows(rows, { requireSampleId = false } = {}) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'predictions must be non-empty')
  let modelIds = null
  const sampleIds = new Set()
  for (const row of rows) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row), 'prediction must be an object')
    if (requireSampleId) {
      assert.match(row.sampleId, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, 'invalid sampleId')
      assert.equal(sampleIds.has(row.sampleId), false, `duplicate sampleId ${row.sampleId}`)
      sampleIds.add(row.sampleId)
    }
    assert.equal(typeof row.actualModelId, 'string', 'actualModelId is required')
    const ids = validateProbabilities(row.probabilities)
    assert.ok(ids.includes(row.actualModelId), `unknown actualModelId ${row.actualModelId}`)
    if (modelIds == null) modelIds = ids
    else assert.deepEqual(ids, modelIds, 'probability model ids differ')
    assert.ok(Number.isFinite(row.meanNegativeLogLikelihood) && row.meanNegativeLogLikelihood >= 0,
      'meanNegativeLogLikelihood must be non-negative')
    if (row.unknownEventFraction != null) {
      assert.ok(Number.isFinite(row.unknownEventFraction)
        && row.unknownEventFraction >= 0 && row.unknownEventFraction <= 1,
      'unknownEventFraction must be in [0, 1]')
    }
  }
  return modelIds
}

function scoreRows(rows, temperature) {
  let correct = 0
  let logLoss = 0
  let brier = 0
  const scored = rows.map((row) => {
    const probabilities = temperatureScaleProbabilities(row.probabilities, temperature)
    const predictedModelId = predictionFrom(probabilities)
    const confidence = probabilities[predictedModelId]
    const isCorrect = predictedModelId === row.actualModelId
    if (isCorrect) correct += 1
    logLoss -= Math.log(Math.max(Number.EPSILON, probabilities[row.actualModelId]))
    brier += Object.keys(probabilities).reduce((sum, modelId) => (
      sum + (probabilities[modelId] - Number(modelId === row.actualModelId)) ** 2
    ), 0)
    return { ...row, probabilities, predictedModelId, confidence, isCorrect }
  })
  return {
    rows: scored,
    top1Accuracy: correct / rows.length,
    logLoss: logLoss / rows.length,
    brierScore: brier / rows.length,
  }
}

function calibrationBins(rows) {
  return Array.from({ length: 5 }, (_, index) => {
    const lower = index / 5
    const upper = (index + 1) / 5
    const members = rows.filter((row) => row.confidence >= lower
      && (index === 4 ? row.confidence <= upper : row.confidence < upper))
    return {
      lower,
      upper,
      count: members.length,
      accuracy: members.length
        ? members.filter((row) => row.isCorrect).length / members.length
        : null,
      meanConfidence: members.length
        ? members.reduce((sum, row) => sum + row.confidence, 0) / members.length
        : null,
    }
  })
}

function ece(bins, total) {
  return bins.reduce((sum, bin) => sum + (bin.count === 0 ? 0
    : (bin.count / total) * Math.abs(bin.accuracy - bin.meanConfidence)), 0)
}

function linearQuantile(values, fraction) {
  assert.ok(Array.isArray(values) && values.length > 0, 'quantile values must be non-empty')
  assert.ok(Number.isFinite(fraction) && fraction >= 0 && fraction <= 1,
    'quantile must be in [0, 1]')
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function oodThresholdFor(row, calibration) {
  const byModel = calibration.oodMeanNllThresholdByPredictedModel
  if (byModel != null) {
    assert.ok(Object.hasOwn(byModel, row.predictedModelId),
      `missing OOD threshold for ${row.predictedModelId}`)
    const threshold = byModel[row.predictedModelId]
    assert.ok(Number.isFinite(threshold) && threshold >= 0,
      `invalid OOD threshold for ${row.predictedModelId}`)
    return threshold
  }
  assert.ok(Number.isFinite(calibration.oodMeanNllThreshold)
    && calibration.oodMeanNllThreshold >= 0, 'oodMeanNllThreshold must be non-negative')
  return calibration.oodMeanNllThreshold
}

function isOod(row, calibration) {
  return (row.unknownEventFraction ?? 0) > 0
    || row.meanNegativeLogLikelihood > oodThresholdFor(row, calibration)
}

function selectiveMetrics(rows, threshold, calibration) {
  const accepted = rows.filter((row) => !isOod(row, calibration) && row.confidence >= threshold)
  return {
    accepted: accepted.length,
    coverage: accepted.length / rows.length,
    accuracy: accepted.length
      ? accepted.filter((row) => row.isCorrect).length / accepted.length
      : null,
  }
}

export function fitClassConditionalOodThresholds(rows, { quantile }) {
  const modelIds = validatePredictionRows(rows)
  assert.ok(Number.isFinite(quantile) && quantile >= 0 && quantile <= 1,
    'quantile must be in [0, 1]')
  const scored = scoreRows(rows, 1).rows
  const thresholdsByPredictedModel = {}
  const samplesByPredictedModel = {}
  for (const modelId of modelIds) {
    const nlls = scored.filter((row) => row.predictedModelId === modelId)
      .map((row) => row.meanNegativeLogLikelihood)
    assert.ok(nlls.length > 0, `no calibration rows predicted as ${modelId}`)
    thresholdsByPredictedModel[modelId] = linearQuantile(nlls, quantile)
    samplesByPredictedModel[modelId] = nlls.length
  }
  return { quantile, thresholdsByPredictedModel, samplesByPredictedModel }
}

export function fitBlockRobustProbabilityCalibration(blocks, {
  temperatureGrid,
  minimumPerBlockCoverage,
  minimumPerBlockSelectiveAccuracy,
  requirePerBlockLogLossNonInferiority,
  oodMeanNllThresholdByPredictedModel,
}) {
  assert.ok(Array.isArray(blocks) && blocks.length >= 2, 'at least two blocks are required')
  assert.ok(Array.isArray(temperatureGrid) && temperatureGrid.length > 0,
    'temperatureGrid must be non-empty')
  assert.equal(new Set(temperatureGrid).size, temperatureGrid.length,
    'temperatureGrid values must be unique')
  temperatureGrid.forEach((value) => assert.ok(Number.isFinite(value) && value > 0,
    'temperatureGrid values must be positive'))
  assert.ok(Number.isFinite(minimumPerBlockCoverage)
    && minimumPerBlockCoverage >= 0 && minimumPerBlockCoverage <= 1,
  'minimumPerBlockCoverage must be in [0, 1]')
  assert.ok(Number.isFinite(minimumPerBlockSelectiveAccuracy)
    && minimumPerBlockSelectiveAccuracy >= 0 && minimumPerBlockSelectiveAccuracy <= 1,
  'minimumPerBlockSelectiveAccuracy must be in [0, 1]')
  assert.equal(typeof requirePerBlockLogLossNonInferiority, 'boolean',
    'requirePerBlockLogLossNonInferiority must be boolean')
  const blockIds = new Set()
  let modelIds = null
  for (const block of blocks) {
    assert.match(block?.blockId, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, 'invalid blockId')
    assert.equal(blockIds.has(block.blockId), false, `duplicate blockId ${block.blockId}`)
    blockIds.add(block.blockId)
    const ids = validatePredictionRows(block.rows)
    if (modelIds == null) modelIds = ids
    else assert.deepEqual(ids, modelIds, 'block probability model ids differ')
  }
  assert.deepEqual(Object.keys(oodMeanNllThresholdByPredictedModel).sort(), modelIds,
    'class-conditional OOD threshold models differ')
  const oodCalibration = { oodMeanNllThresholdByPredictedModel }
  const rawByBlock = blocks.map((block) => scoreRows(block.rows, 1))
  const configurations = []
  for (const temperature of temperatureGrid) {
    const scoredByBlock = blocks.map((block) => scoreRows(block.rows, temperature))
    const thresholds = [0, ...new Set(scoredByBlock.flatMap((scored) => (
      scored.rows.map((row) => row.confidence)
    )))].sort((left, right) => left - right)
    for (const threshold of thresholds) {
      const developmentBlocks = blocks.map((block, index) => {
        const selective = selectiveMetrics(scoredByBlock[index].rows, threshold, oodCalibration)
        return {
          blockId: block.blockId,
          samples: block.rows.length,
          coverage: selective.coverage,
          selectiveAccuracy: selective.accuracy,
          uncalibratedLogLoss: rawByBlock[index].logLoss,
          calibratedLogLoss: scoredByBlock[index].logLoss,
        }
      })
      const eligible = developmentBlocks.every((block) => (
        block.coverage >= minimumPerBlockCoverage
        && block.selectiveAccuracy != null
        && block.selectiveAccuracy >= minimumPerBlockSelectiveAccuracy
        && (!requirePerBlockLogLossNonInferiority
          || block.calibratedLogLoss <= block.uncalibratedLogLoss + 1e-12)
      ))
      if (!eligible) continue
      configurations.push({
        temperature,
        abstentionThreshold: threshold,
        developmentBlocks,
        worstBlockCoverage: Math.min(...developmentBlocks.map((block) => block.coverage)),
        meanBlockCoverage: developmentBlocks.reduce((sum, block) => sum + block.coverage, 0)
          / developmentBlocks.length,
        aggregateCalibratedLogLoss: developmentBlocks.reduce(
          (sum, block) => sum + block.calibratedLogLoss * block.samples, 0,
        ) / developmentBlocks.reduce((sum, block) => sum + block.samples, 0),
      })
    }
  }
  assert.ok(configurations.length > 0, 'no block-robust calibration satisfies fitting gates')
  configurations.sort((left, right) => (
    right.worstBlockCoverage - left.worstBlockCoverage
    || right.meanBlockCoverage - left.meanBlockCoverage
    || left.aggregateCalibratedLogLoss - right.aggregateCalibratedLogLoss
    || left.temperature - right.temperature
    || left.abstentionThreshold - right.abstentionThreshold
  ))
  return {
    schemaVersion: OPPONENT_PROBABILITY_CALIBRATION_VERSION,
    temperature: configurations[0].temperature,
    abstentionThreshold: configurations[0].abstentionThreshold,
    oodMeanNllThresholdByPredictedModel,
    developmentBlocks: configurations[0].developmentBlocks,
    worstBlockCoverage: configurations[0].worstBlockCoverage,
    meanBlockCoverage: configurations[0].meanBlockCoverage,
    aggregateCalibratedLogLoss: configurations[0].aggregateCalibratedLogLoss,
  }
}

export function fitProbabilityCalibration(rows, {
  temperatureGrid,
  minimumSelectiveAccuracy,
  minimumCoverage,
  oodMeanNllThreshold,
}) {
  validatePredictionRows(rows)
  assert.ok(Array.isArray(temperatureGrid) && temperatureGrid.length > 0,
    'temperatureGrid must be non-empty')
  assert.equal(new Set(temperatureGrid).size, temperatureGrid.length,
    'temperatureGrid values must be unique')
  temperatureGrid.forEach((value) => assert.ok(Number.isFinite(value) && value > 0,
    'temperatureGrid values must be positive'))
  assert.ok(Number.isFinite(minimumSelectiveAccuracy)
    && minimumSelectiveAccuracy >= 0 && minimumSelectiveAccuracy <= 1,
  'minimumSelectiveAccuracy must be in [0, 1]')
  assert.ok(Number.isFinite(minimumCoverage) && minimumCoverage >= 0 && minimumCoverage <= 1,
    'minimumCoverage must be in [0, 1]')
  assert.ok(Number.isFinite(oodMeanNllThreshold) && oodMeanNllThreshold >= 0,
    'oodMeanNllThreshold must be non-negative')

  const trials = temperatureGrid.map((temperature) => ({
    temperature,
    ...scoreRows(rows, temperature),
  })).sort((left, right) => left.logLoss - right.logLoss || left.temperature - right.temperature)
  const selected = trials[0]
  const thresholds = [0, ...new Set(selected.rows.map((row) => row.confidence))]
    .sort((left, right) => left - right)
  const eligible = thresholds.map((threshold) => ({
    threshold,
    ...selectiveMetrics(selected.rows, threshold, { oodMeanNllThreshold }),
  })).filter((item) => item.coverage >= minimumCoverage
    && item.accuracy != null && item.accuracy >= minimumSelectiveAccuracy)
    .sort((left, right) => right.coverage - left.coverage || left.threshold - right.threshold)
  const abstention = eligible[0] ?? {
    threshold: 1,
    ...selectiveMetrics(selected.rows, 1, { oodMeanNllThreshold }),
  }
  const uncalibrated = scoreRows(rows, 1)
  return {
    schemaVersion: OPPONENT_PROBABILITY_CALIBRATION_VERSION,
    temperature: selected.temperature,
    abstentionThreshold: abstention.threshold,
    oodMeanNllThreshold,
    calibration: {
      samples: rows.length,
      uncalibratedLogLoss: uncalibrated.logLoss,
      calibratedLogLoss: selected.logLoss,
      uncalibratedBrierScore: uncalibrated.brierScore,
      calibratedBrierScore: selected.brierScore,
      top1Accuracy: selected.top1Accuracy,
      selectiveCoverage: abstention.coverage,
      selectiveAccuracy: abstention.accuracy,
    },
  }
}

export function evaluateProbabilityCalibration(rows, calibration) {
  validatePredictionRows(rows, { requireSampleId: true })
  assert.equal(calibration?.schemaVersion ?? OPPONENT_PROBABILITY_CALIBRATION_VERSION,
    OPPONENT_PROBABILITY_CALIBRATION_VERSION, 'unsupported probability calibration version')
  const scored = scoreRows(rows, calibration.temperature)
  const uncalibrated = scoreRows(rows, 1)
  const bins = calibrationBins(scored.rows)
  const oodCount = scored.rows.filter((row) => isOod(row, calibration)).length
  const selective = selectiveMetrics(
    scored.rows, calibration.abstentionThreshold, calibration,
  )
  return {
    samples: rows.length,
    top1Accuracy: scored.top1Accuracy,
    uncalibratedLogLoss: uncalibrated.logLoss,
    calibratedLogLoss: scored.logLoss,
    uncalibratedBrierScore: uncalibrated.brierScore,
    calibratedBrierScore: scored.brierScore,
    expectedCalibrationError: ece(bins, rows.length),
    confidenceBins: bins,
    oodCount,
    oodRate: oodCount / rows.length,
    accepted: selective.accepted,
    selectiveCoverage: selective.coverage,
    selectiveAccuracy: selective.accuracy,
    predictions: scored.rows.map((row) => ({
      sampleId: row.sampleId,
      actualModelId: row.actualModelId,
      predictedModelId: row.predictedModelId,
      confidence: row.confidence,
      outOfDistribution: isOod(row, calibration),
      accepted: !isOod(row, calibration)
        && row.confidence >= calibration.abstentionThreshold,
    })),
  }
}
