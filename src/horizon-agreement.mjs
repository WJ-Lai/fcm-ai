import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { scenarioBeamStrategy } from './scenario-beam-strategy.mjs'

export const HORIZON_AGREEMENT_VERSION = 'fcm.horizon-agreement.v1'

function validateSearch(result, label) {
  assert.ok(result?.selected?.id, `${label} has no selected candidate`)
  assert.equal(typeof result.metrics?.fallbackUsed, 'boolean', `${label} lacks fallback status`)
}

export function adjudicateHorizonAgreement({ staticSelected, shallow, deep }) {
  assert.ok(staticSelected?.id, 'staticSelected is required')
  validateSearch(shallow, 'shallow search')
  validateSearch(deep, 'deep search')
  let gateReason = 'horizons-agree'
  if (shallow.metrics.fallbackUsed) gateReason = 'shallow-incomplete'
  else if (deep.metrics.fallbackUsed) gateReason = 'deep-incomplete'
  else if (shallow.selected.id !== deep.selected.id) gateReason = 'horizon-disagreement'
  const fallbackUsed = gateReason !== 'horizons-agree'
  return {
    schemaVersion: HORIZON_AGREEMENT_VERSION,
    selected: fallbackUsed ? staticSelected : deep.selected,
    gateReason,
    fallbackUsed,
    shallowCandidateId: shallow.selected.id,
    deepCandidateId: deep.selected.id,
  }
}

/** Share one wall-clock envelope between a cheap depth-1 probe and the target-depth search. */
export async function horizonAgreementScenarioBeamStrategy(view, {
  deadlineMs = 3000,
  shallowDeadlineMs = Math.min(500, deadlineMs * 0.2),
  shallowDepth = 1,
  beamBudget = {},
  now = () => performance.now(),
  ...options
} = {}) {
  assert.ok(Number.isFinite(deadlineMs) && deadlineMs > 0, 'deadlineMs must be positive')
  assert.ok(Number.isFinite(shallowDeadlineMs) && shallowDeadlineMs > 0
    && shallowDeadlineMs < deadlineMs, 'shallowDeadlineMs must be inside total deadline')
  assert.ok(Number.isSafeInteger(shallowDepth) && shallowDepth > 0,
    'shallowDepth must be a positive integer')
  const started = now()
  const shallow = await scenarioBeamStrategy(view, {
    ...options,
    now,
    beamBudget: { ...beamBudget, maxOwnDepth: shallowDepth, deadlineMs: shallowDeadlineMs },
  })
  const remainingMs = Math.max(1, deadlineMs - Math.max(0, now() - started))
  const deep = await scenarioBeamStrategy(view, {
    ...options,
    now,
    beamBudget: { ...beamBudget, deadlineMs: remainingMs },
  })
  const gate = adjudicateHorizonAgreement({
    staticSelected: deep.staticSelected,
    shallow,
    deep,
  })
  return {
    ...gate,
    staticSelected: deep.staticSelected,
    shallow,
    deep,
    metrics: {
      elapsedMs: Math.max(0, now() - started),
      deadlineMs,
      shallowDeadlineMs,
      remainingDeepDeadlineMs: remainingMs,
      gateReason: gate.gateReason,
      fallbackUsed: gate.fallbackUsed,
    },
  }
}
