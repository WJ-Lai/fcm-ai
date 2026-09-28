import assert from 'node:assert/strict'

import { validateStrategicMemory } from './game-memory-v2.mjs'

export const PLAN_ARBITRATION_VERSION = 'fcm.plan-arbitration.v1'

const MODES = Object.freeze([
  'continue', 'repair', 'tactical_deviation', 'pivot', 'abandon',
])
const TRIGGERS = new Set([
  'milestone-closure', 'missed-prerequisite', 'opponent-change', 'cash-danger',
  'prediction-error', 'high-impact-uncertainty', 'scheduled-review',
])
const EVIDENCE_FIELDS = new Set([
  'observationDigest', 'trigger', 'currentTurn', 'planValue', 'repairValue',
  'tacticalValue', 'pivotValue', 'abandonValue', 'switchingCost', 'tacticalCost',
  'assetReuseFraction', 'salaryRunwayTurns', 'opportunityExpiryTurns', 'confidence',
  'impact', 'uncertainty',
])
const THRESHOLDS = Object.freeze({
  enterMargin: 2,
  exitMargin: 1,
  alternateMargin: 3,
  cooldownTurns: 1,
  minimumConfidence: 0.55,
  emergencyImpact: 0.85,
})

function exactFields(value, fields, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), `${label} fields differ`)
}

function nullableFinite(value, label) {
  assert.ok(value == null || Number.isFinite(value), `${label} must be finite or null`)
}

function validateEvidence(evidence, memory) {
  exactFields(evidence, EVIDENCE_FIELDS, 'arbiter evidence')
  assert.match(evidence.observationDigest, /^sha256:[a-f0-9]{64}$/, 'invalid observationDigest')
  assert.ok(TRIGGERS.has(evidence.trigger), 'invalid review trigger')
  assert.equal(evidence.currentTurn, memory.currentTurn, 'evidence turn must match memory')
  for (const key of ['planValue', 'abandonValue', 'switchingCost', 'tacticalCost']) {
    assert.ok(Number.isFinite(evidence[key]), `${key} must be finite`)
  }
  for (const key of ['repairValue', 'tacticalValue', 'pivotValue']) {
    nullableFinite(evidence[key], key)
  }
  assert.ok(evidence.switchingCost >= 0, 'switchingCost must be non-negative')
  assert.ok(evidence.tacticalCost >= 0, 'tacticalCost must be non-negative')
  assert.ok(Number.isFinite(evidence.assetReuseFraction)
    && evidence.assetReuseFraction >= 0 && evidence.assetReuseFraction <= 1,
  'assetReuseFraction must be in [0, 1]')
  assert.ok(Number.isFinite(evidence.salaryRunwayTurns) && evidence.salaryRunwayTurns >= 0,
    'salaryRunwayTurns must be non-negative')
  assert.ok(evidence.opportunityExpiryTurns == null
    || (Number.isInteger(evidence.opportunityExpiryTurns) && evidence.opportunityExpiryTurns >= 0),
  'opportunityExpiryTurns must be a non-negative integer or null')
  for (const key of ['confidence', 'impact', 'uncertainty']) {
    assert.ok(Number.isFinite(evidence[key]) && evidence[key] >= 0 && evidence[key] <= 1,
      `${key} must be in [0, 1]`)
  }
}

function publicPlanHealth(plan) {
  const invalid = ['invalidated', 'abandoned', 'pivoted'].includes(plan.status)
  return {
    feasible: !invalid && plan.analysis.feasibility === 'feasible',
    emergency: invalid || plan.analysis.feasibility === 'infeasible',
    deadlinePenalty: plan.analysis.slackTurns < 0
      ? Math.abs(plan.analysis.slackTurns) * 6
      : (plan.analysis.slackTurns === 0 ? 2 : 0),
  }
}

function scoredModes(memory, evidence) {
  const plan = memory.strategicPlan
  const health = publicPlanHealth(plan)
  const cashPenalty = evidence.salaryRunwayTurns === 0
    ? 12
    : (evidence.salaryRunwayTurns < 2 ? 4 : 0)
  const uncertaintyPenalty = evidence.uncertainty * 4
  const weakEvidence = evidence.confidence < THRESHOLDS.minimumConfidence
    && !health.emergency && evidence.salaryRunwayTurns > 0
  const scores = {
    continue: evidence.planValue - health.deadlinePenalty - cashPenalty,
    repair: null,
    tactical_deviation: null,
    pivot: null,
    abandon: null,
  }

  if (!weakEvidence && evidence.repairValue != null && plan.repairOptions.length > 0) {
    scores.repair = evidence.repairValue
      - ((1 - evidence.assetReuseFraction) * evidence.switchingCost * 0.5)
      - (uncertaintyPenalty * 0.5)
  }
  if (
    !weakEvidence
    && health.feasible
    && evidence.tacticalValue != null
    && evidence.opportunityExpiryTurns != null
    && evidence.opportunityExpiryTurns <= 2
  ) {
    scores.tactical_deviation = evidence.tacticalValue
      - evidence.tacticalCost
      // A bounded deviation returns to the same plan, so charge only the
      // disruption share of permanent switching cost. tacticalCost carries
      // the direct action/tempo loss.
      - ((1 - evidence.assetReuseFraction) * evidence.switchingCost * 0.25)
      - uncertaintyPenalty
  }
  if (!weakEvidence && evidence.pivotValue != null) {
    scores.pivot = evidence.pivotValue - evidence.switchingCost - uncertaintyPenalty
  }
  if (health.emergency || evidence.salaryRunwayTurns === 0) {
    scores.abandon = evidence.abandonValue
  }
  return { health, weakEvidence, scores }
}

function bestMode(scores) {
  return MODES.reduce((best, mode) => {
    const score = scores[mode]
    if (score == null) return best
    if (!best || score > best.score) return { mode, score }
    return best
  }, null)
}

function marginFor(previousMode, challenger) {
  if (previousMode === 'continue') return THRESHOLDS.enterMargin
  if (challenger === 'continue') return THRESHOLDS.exitMargin
  return THRESHOLDS.alternateMargin
}

export function arbitratePlanHealth(memory, evidence) {
  validateStrategicMemory(memory)
  assert.ok(memory.strategicPlan, 'plan arbitration requires a strategic plan')
  assert.ok(!['pivoted', 'abandoned', 'completed'].includes(memory.strategicPlan.status),
    'terminal plan status requires an explicit replacement plan')
  validateEvidence(evidence, memory)
  const previous = memory.lastArbitration ?? null
  const previousMode = previous?.mode ?? 'continue'
  const { health, weakEvidence, scores } = scoredModes(memory, evidence)
  const eligibleModes = MODES.filter((mode) => scores[mode] != null)
  const reasonCodes = []
  let mode = previousMode

  if (
    previous?.observationDigest === evidence.observationDigest
    && previous.currentTurn === evidence.currentTurn
  ) {
    reasonCodes.push('unchanged-observation')
  } else {
    const best = bestMode(scores)
    assert.ok(best, 'arbiter produced no eligible mode')
    const incumbentScore = scores[previousMode]
    const emergency = health.emergency
      || evidence.salaryRunwayTurns === 0
      || (evidence.trigger === 'cash-danger' && evidence.impact >= THRESHOLDS.emergencyImpact)
    const inCooldown = previous
      && evidence.currentTurn - previous.currentTurn <= THRESHOLDS.cooldownTurns
    if (weakEvidence) reasonCodes.push('insufficient-evidence')
    if (best.mode === previousMode) {
      mode = previousMode
      reasonCodes.push('incumbent-best')
      if (previousMode === 'continue' && eligibleModes.length > 1) {
        reasonCodes.push('challenger-below-enter-margin')
      }
    } else if (inCooldown && !emergency) {
      mode = previousMode
      reasonCodes.push('cooldown-held')
    } else {
      const requiredMargin = marginFor(previousMode, best.mode)
      const comparisonScore = incumbentScore ?? Number.NEGATIVE_INFINITY
      if (best.score >= comparisonScore + requiredMargin) {
        mode = best.mode
        reasonCodes.push('challenger-cleared-margin')
      } else {
        mode = previousMode
        reasonCodes.push('challenger-below-enter-margin')
      }
    }
  }

  return {
    schemaVersion: PLAN_ARBITRATION_VERSION,
    observationDigest: evidence.observationDigest,
    currentTurn: evidence.currentTurn,
    trigger: evidence.trigger,
    previousMode,
    mode,
    scores,
    eligibleModes,
    reasonCodes,
    thresholds: { ...THRESHOLDS },
  }
}
