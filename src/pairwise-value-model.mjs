import assert from 'node:assert/strict'

function validateRows(rows, featureNames) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'training rows are required')
  assert.ok(Array.isArray(featureNames) && featureNames.length > 0, 'feature names are required')
  assert.equal(new Set(featureNames).size, featureNames.length, 'feature names must be unique')
  for (const row of rows) {
    assert.ok(row.target === -1 || row.target === 1, 'row target must be -1 or 1')
    assert.ok(Number.isFinite(row.weight) && row.weight > 0, 'row weight must be positive')
    assert.ok(Array.isArray(row.difference) && row.difference.length === featureNames.length,
      'row feature dimension mismatch')
    assert.ok(row.difference.every(Number.isFinite), 'row features must be finite')
  }
}

function logisticLoss(margin) {
  if (margin >= 0) return Math.log1p(Math.exp(-margin))
  return -margin + Math.log1p(Math.exp(margin))
}

function errorFactor(margin) {
  if (margin >= 0) {
    const value = Math.exp(-margin)
    return value / (1 + value)
  }
  return 1 / (1 + Math.exp(margin))
}

export function fitPairwiseValueModel(rows, {
  featureNames,
  lambda = 1,
  iterations = 1200,
  learningRate = 0.2,
} = {}) {
  validateRows(rows, featureNames)
  assert.ok(Number.isFinite(lambda) && lambda >= 0, 'lambda must be non-negative')
  assert.ok(Number.isInteger(iterations) && iterations > 0, 'iterations must be positive')
  assert.ok(Number.isFinite(learningRate) && learningRate > 0, 'learning rate must be positive')
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0)
  const scales = featureNames.map((_, index) => {
    const secondMoment = rows.reduce(
      (sum, row) => sum + row.weight * row.difference[index] ** 2,
      0,
    ) / totalWeight
    const scale = Math.sqrt(secondMoment)
    return scale > 1e-12 ? scale : 1
  })
  const normalized = rows.map((row) => ({
    ...row,
    values: row.difference.map((value, index) => value / scales[index]),
  }))
  const weights = featureNames.map(() => 0)
  // L2 contributes a lambda-Lipschitz gradient. Scale the caller's base step so large
  // regularization contracts weights instead of making fixed-step descent oscillate or diverge.
  const optimizerStep = learningRate / (1 + lambda)

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = weights.map((weight) => lambda * weight)
    for (const row of normalized) {
      const score = row.values.reduce((sum, value, index) => sum + value * weights[index], 0)
      const multiplier = -row.target * errorFactor(row.target * score) * row.weight / totalWeight
      for (let index = 0; index < gradient.length; index += 1) {
        gradient[index] += multiplier * row.values[index]
      }
    }
    for (let index = 0; index < weights.length; index += 1) {
      weights[index] -= optimizerStep * gradient[index]
      if (Math.abs(weights[index]) < 1e-15) weights[index] = 0
    }
  }

  const dataLoss = normalized.reduce((sum, row) => {
    const score = row.values.reduce((total, value, index) => total + value * weights[index], 0)
    return sum + row.weight * logisticLoss(row.target * score)
  }, 0) / totalWeight
  const regularizationLoss = lambda * weights.reduce((sum, weight) => sum + weight ** 2, 0) / 2
  return Object.freeze({
    schemaVersion: 'fcm.pairwise-value-model.v1',
    featureNames: Object.freeze([...featureNames]),
    scales: Object.freeze(scales),
    standardizedWeights: Object.freeze(weights),
    lambda,
    iterations,
    learningRate,
    optimizerStep,
    trainingRows: rows.length,
    trainingGames: new Set(rows.map((row) => row.gameId)).size,
    objective: dataLoss + regularizationLoss,
    dataLoss,
    regularizationLoss,
  })
}

export function scorePairwiseDifference(model, difference) {
  assert.equal(model?.schemaVersion, 'fcm.pairwise-value-model.v1', 'model schema mismatch')
  assert.ok(Array.isArray(difference) && difference.length === model.featureNames.length,
    'feature dimension mismatch')
  assert.ok(difference.every(Number.isFinite), 'features must be finite')
  return difference.reduce((score, value, index) => (
    score + value / model.scales[index] * model.standardizedWeights[index]
  ), 0)
}

function phaseBucket(turn) {
  if (turn <= 3) return 'early'
  if (turn <= 6) return 'middle'
  return 'late'
}

function credit(score, target) {
  const direction = Math.sign(score)
  if (direction === 0) return 0.5
  return direction === target ? 1 : 0
}

function summarizeRows(model, rows) {
  const scored = rows.map((row) => ({ ...row, score: scorePairwiseDifference(model, row.difference) }))
  const totalWeight = scored.reduce((sum, row) => sum + row.weight, 0)
  return {
    turns: scored.length,
    totalWeight,
    correctTurns: scored.reduce((sum, row) => sum + credit(row.score, row.target), 0),
    weightedAccuracy: scored.reduce(
      (sum, row) => sum + row.weight * credit(row.score, row.target),
      0,
    ) / totalWeight,
    weightedLogLoss: scored.reduce(
      (sum, row) => sum + row.weight * logisticLoss(row.target * row.score),
      0,
    ) / totalWeight,
  }
}

export function auditPairwiseValueModel(model, rows) {
  validateRows(rows, model.featureNames)
  const gameIds = [...new Set(rows.map((row) => row.gameId))]
  let gameCorrect = 0
  for (const gameId of gameIds) {
    const selected = rows.filter((row) => row.gameId === gameId)
    const targets = new Set(selected.map((row) => row.target))
    assert.equal(targets.size, 1, `game ${gameId} has inconsistent targets`)
    const totalWeight = selected.reduce((sum, row) => sum + row.weight, 0)
    const meanScore = selected.reduce(
      (sum, row) => sum + row.weight * scorePairwiseDifference(model, row.difference),
      0,
    ) / totalWeight
    gameCorrect += credit(meanScore, selected[0].target)
  }
  const byPhase = Object.fromEntries(['early', 'middle', 'late'].map((bucket) => {
    const selected = rows.filter((row) => phaseBucket(row.turn) === bucket)
    return [bucket, selected.length ? summarizeRows(model, selected) : null]
  }))
  return {
    schemaVersion: 'fcm.pairwise-value-audit.v1',
    ...summarizeRows(model, rows),
    games: gameIds.length,
    gameCorrect,
    gameAccuracy: gameCorrect / gameIds.length,
    byPhase,
  }
}

export function crossValidatePairwiseValueModel(rows, options = {}) {
  validateRows(rows, options.featureNames)
  const gameIds = [...new Set(rows.map((row) => row.gameId))].sort()
  assert.ok(gameIds.length >= 3, 'cross-validation requires at least three games')
  const folds = gameIds.map((holdoutGame) => {
    const training = rows.filter((row) => row.gameId !== holdoutGame)
    const holdout = rows.filter((row) => row.gameId === holdoutGame)
    const model = fitPairwiseValueModel(training, options)
    return {
      holdoutGame,
      trainingGames: model.trainingGames,
      audit: auditPairwiseValueModel(model, holdout),
    }
  })
  const byPhase = Object.fromEntries(['early', 'middle', 'late'].map((bucket) => {
    const parts = folds.map((fold) => fold.audit.byPhase[bucket]).filter(Boolean)
    if (!parts.length) return [bucket, null]
    const totalWeight = parts.reduce((sum, part) => sum + part.totalWeight, 0)
    const turns = parts.reduce((sum, part) => sum + part.turns, 0)
    const correctTurns = parts.reduce((sum, part) => sum + part.correctTurns, 0)
    return [bucket, {
      turns,
      totalWeight,
      correctTurns,
      turnAccuracy: correctTurns / turns,
      weightedAccuracy: parts.reduce(
        (sum, part) => sum + part.totalWeight * part.weightedAccuracy,
        0,
      ) / totalWeight,
      weightedLogLoss: parts.reduce(
        (sum, part) => sum + part.totalWeight * part.weightedLogLoss,
        0,
      ) / totalWeight,
    }]
  }))
  return {
    schemaVersion: 'fcm.pairwise-value-cross-validation.v1',
    games: gameIds.length,
    gameAccuracy: folds.reduce((sum, fold) => sum + fold.audit.gameAccuracy, 0) / folds.length,
    weightedAccuracy: folds.reduce(
      (sum, fold) => sum + fold.audit.weightedAccuracy,
      0,
    ) / folds.length,
    weightedLogLoss: folds.reduce(
      (sum, fold) => sum + fold.audit.weightedLogLoss,
      0,
    ) / folds.length,
    byPhase,
    folds,
  }
}
