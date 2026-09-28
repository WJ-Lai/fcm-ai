import assert from 'node:assert/strict'

import { scorePhaseRoutedDifference } from './phase-value-model.mjs'

const PHASES = Object.freeze(['early', 'middle', 'late'])
const REMAINING_BUCKETS = Object.freeze(['far', 'medium', 'near', 'boundary'])

function phaseBucket(turn) {
  if (turn <= 3) return 'early'
  if (turn <= 6) return 'middle'
  return 'late'
}

function remainingBucket(remainingTurns) {
  if (remainingTurns === 0) return 'boundary'
  if (remainingTurns <= 3) return 'near'
  if (remainingTurns <= 6) return 'medium'
  return 'far'
}

function logisticLoss(margin) {
  if (margin >= 0) return Math.log1p(Math.exp(-margin))
  return -margin + Math.log1p(Math.exp(margin))
}

function credit(score, target) {
  if (score === 0) return 0.5
  return Math.sign(score) === target ? 1 : 0
}

function summarize(rows) {
  if (!rows.length) return null
  const perGameCounts = new Map()
  for (const row of rows) perGameCounts.set(row.gameId, (perGameCounts.get(row.gameId) ?? 0) + 1)
  const weighted = rows.map((row) => ({
    ...row,
    auditWeight: 1 / perGameCounts.get(row.gameId),
  }))
  const totalWeight = weighted.reduce((sum, row) => sum + row.auditWeight, 0)
  return {
    observations: rows.length,
    games: perGameCounts.size,
    totalWeight,
    weightedAccuracy: weighted.reduce(
      (sum, row) => sum + row.auditWeight * credit(row.score, row.target),
      0,
    ) / totalWeight,
    weightedLogLoss: weighted.reduce(
      (sum, row) => sum + row.auditWeight * logisticLoss(row.target * row.score),
      0,
    ) / totalWeight,
    abstentionRate: weighted.reduce(
      (sum, row) => sum + (row.score === 0 ? row.auditWeight : 0),
      0,
    ) / totalWeight,
  }
}

/**
 * Retrospective leaf audit. `remainingTurns` is calculated from the completed trajectory and must
 * never be passed into an online policy as if it were observable future information.
 */
export function auditValueCutoffs(model, rows) {
  assert.equal(model?.schemaVersion, 'fcm.phase-routed-value-model.v1', 'model schema mismatch')
  assert.ok(Array.isArray(rows) && rows.length > 0, 'completed trajectory rows are required')
  const finalTurns = new Map()
  for (const row of rows) {
    assert.ok(typeof row.gameId === 'string' && row.gameId, 'gameId is required')
    assert.ok(Number.isInteger(row.turn) && row.turn > 0, 'turn must be positive')
    assert.ok(row.target === -1 || row.target === 1, 'target must be -1 or 1')
    finalTurns.set(row.gameId, Math.max(finalTurns.get(row.gameId) ?? 0, row.turn))
  }
  const scored = rows.map((row) => {
    const remainingTurns = finalTurns.get(row.gameId) - row.turn
    return {
      ...row,
      remainingTurns,
      remainingBucket: remainingBucket(remainingTurns),
      phaseBucket: phaseBucket(row.turn),
      score: scorePhaseRoutedDifference(model, row),
    }
  })

  const reversals = { total: 0, towardOutcome: 0, awayFromOutcome: 0, other: 0 }
  for (const gameId of [...finalTurns.keys()].sort()) {
    const nonAbstaining = scored
      .filter((row) => row.gameId === gameId && row.score !== 0)
      .sort((left, right) => left.turn - right.turn)
    for (let index = 1; index < nonAbstaining.length; index += 1) {
      const previous = nonAbstaining[index - 1]
      const current = nonAbstaining[index]
      if (Math.sign(previous.score) === Math.sign(current.score)) continue
      reversals.total += 1
      if (Math.sign(current.score) === current.target) reversals.towardOutcome += 1
      else if (Math.sign(previous.score) === previous.target) reversals.awayFromOutcome += 1
      else reversals.other += 1
    }
  }

  return {
    schemaVersion: 'fcm.value-cutoff-audit.v1',
    games: finalTurns.size,
    observations: scored.length,
    overall: summarize(scored),
    byPhase: Object.fromEntries(PHASES.map((phase) => [
      phase,
      summarize(scored.filter((row) => row.phaseBucket === phase)),
    ])),
    byRemainingTurns: Object.fromEntries(REMAINING_BUCKETS.map((bucket) => [
      bucket,
      summarize(scored.filter((row) => row.remainingBucket === bucket)),
    ])),
    reversals,
  }
}
