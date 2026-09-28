import assert from 'node:assert/strict'
import test from 'node:test'

import { arbitratePlanHealth } from './plan-arbiter.mjs'
import {
  compileCandidatePlanFeatures,
  createStrategicMemory,
  rebuildStrategicMemory,
  updateStrategicMemory,
} from './game-memory-v2.mjs'

const header = { gameId: 41, seat: 0, rulesetHash: 'sha256:rules' }

function plannedMemory() {
  return updateStrategicMemory(createStrategicMemory(header), {
    type: 'plan-created',
    currentTurn: 2,
    plan: {
      planId: 'burger-engine',
      goal: { goalId: 'burger-sales', kind: 'cash-engine', requiredCapabilities: ['supply'] },
      targetTurn: 3,
      deadlineTurn: 4,
      expectedValue: 24,
      confidence: 'medium',
      capabilities: [{
        capabilityId: 'supply', status: 'pending', leadTurns: 1,
        prerequisites: [], candidateIntents: ['production'],
      }],
      commitments: [{
        commitmentId: 'burger-cook', kind: 'employee', status: 'committed',
        reusableFor: ['pizza-repair'], sunkValue: 8,
      }],
      assumptions: [{
        assumptionId: 'demand-open', origin: 'observed', statement: 'demand remains reachable',
      }],
      repairOptions: [{
        repairId: 'pizza-repair', requiredCapabilities: ['supply'],
        reusableCommitments: ['burger-cook'],
      }],
      fallbackPlanIds: ['price-engine'],
      invalidationRules: [],
    },
  })
}

function evidence(patch = {}) {
  return {
    observationDigest: `sha256:${'a'.repeat(64)}`,
    trigger: 'opponent-change',
    currentTurn: 2,
    planValue: 24,
    repairValue: 18,
    tacticalValue: 20,
    pivotValue: 19,
    abandonValue: 0,
    switchingCost: 6,
    tacticalCost: 2,
    assetReuseFraction: 0.5,
    salaryRunwayTurns: 2,
    opportunityExpiryTurns: 1,
    confidence: 0.8,
    impact: 0.7,
    uncertainty: 0.2,
    ...patch,
  }
}

test('arbiter takes a genuine expiring opportunity without erasing the plan', () => {
  const memory = plannedMemory()
  const decision = arbitratePlanHealth(memory, evidence({ tacticalValue: 31, tacticalCost: 2 }))
  assert.equal(decision.mode, 'tactical_deviation')
  const updated = updateStrategicMemory(memory, { type: 'plan-arbitrated', decision })
  assert.equal(updated.strategicPlan.status, 'tactical-deviation')
  assert.equal(updated.strategicPlan.planId, 'burger-engine')
  assert.deepEqual(updated.strategicPlan.capabilities, memory.strategicPlan.capabilities)
  assert.deepEqual(updated.strategicPlan.commitments, memory.strategicPlan.commitments)
  const tactical = compileCandidatePlanFeatures(updated, {
    id: 'temporary-demand', intent: 'opportunity', actions: [{ type: 'marketing' }],
    details: { strategicIntent: 'tactical-deviation', opportunityExpiryTurn: 2 },
  })
  const continuePlan = compileCandidatePlanFeatures(updated, {
    id: 'continue-supply', intent: 'production', actions: [{ type: 'produce_food' }],
    details: { providesCapabilities: ['supply'] },
  })
  assert.equal(tactical.arbitrationMatch, true)
  assert.ok(tactical.priority > continuePlan.priority)
})

test('arbiter rejects attractive bait after commitment and return costs', () => {
  const decision = arbitratePlanHealth(plannedMemory(), evidence({
    tacticalValue: 33,
    tacticalCost: 12,
    assetReuseFraction: 0,
  }))
  assert.equal(decision.mode, 'continue')
  assert.ok(decision.reasonCodes.includes('challenger-below-enter-margin'))
})

test('arbiter repairs reusable assets after a missed prerequisite', () => {
  let memory = plannedMemory()
  memory = updateStrategicMemory(memory, {
    type: 'capability-status', capabilityId: 'supply', status: 'impossible',
    evidence: 'public employee supply exhausted',
  })
  const decision = arbitratePlanHealth(memory, evidence({
    trigger: 'missed-prerequisite', repairValue: 23, planValue: 8,
    pivotValue: 13, assetReuseFraction: 1,
  }))
  assert.equal(decision.mode, 'repair')
})

test('arbiter pivots an infeasible goal and abandons when no alternative is viable', () => {
  let memory = plannedMemory()
  memory = updateStrategicMemory(memory, {
    type: 'capability-status', capabilityId: 'supply', status: 'impossible',
    evidence: 'public employee supply exhausted',
  })
  const pivot = arbitratePlanHealth(memory, evidence({
    trigger: 'milestone-closure', planValue: 5, repairValue: 6,
    pivotValue: 25, switchingCost: 5,
  }))
  assert.equal(pivot.mode, 'pivot')
  const pivoted = updateStrategicMemory(memory, { type: 'plan-arbitrated', decision: pivot })
  const pivotFeature = compileCandidatePlanFeatures(pivoted, {
    id: 'price-engine', intent: 'pivot', actions: [{ type: 'train' }],
    details: { pivotPlanId: 'price-engine' },
  })
  assert.equal(pivotFeature.arbitrationMatch, true)
  assert.equal(pivotFeature.priority, 4)

  const abandon = arbitratePlanHealth(memory, evidence({
    trigger: 'cash-danger', planValue: -8, repairValue: -5,
    tacticalValue: -4, pivotValue: -2, abandonValue: 0,
    salaryRunwayTurns: 0,
  }))
  assert.equal(abandon.mode, 'abandon')
})

test('unchanged observations and cooldown prevent oscillation', () => {
  let memory = plannedMemory()
  const first = arbitratePlanHealth(memory, evidence({ tacticalValue: 31 }))
  memory = updateStrategicMemory(memory, { type: 'plan-arbitrated', decision: first })

  const unchanged = arbitratePlanHealth(memory, evidence({ tacticalValue: 10 }))
  assert.equal(unchanged.mode, 'tactical_deviation')
  assert.ok(unchanged.reasonCodes.includes('unchanged-observation'))

  const changedDigest = `sha256:${'b'.repeat(64)}`
  const cooldown = arbitratePlanHealth(memory, evidence({
    observationDigest: changedDigest, tacticalValue: 10, planValue: 40,
  }))
  assert.equal(cooldown.mode, 'tactical_deviation')
  assert.ok(cooldown.reasonCodes.includes('cooldown-held'))
})

test('low-confidence opportunity evidence cannot replace a feasible plan', () => {
  const decision = arbitratePlanHealth(plannedMemory(), evidence({
    tacticalValue: 80, confidence: 0.2, uncertainty: 0.8,
  }))
  assert.equal(decision.mode, 'continue')
  assert.ok(decision.reasonCodes.includes('insufficient-evidence'))
})

test('arbitration survives turn advance and rebuilds byte-for-byte', () => {
  const created = {
    type: 'plan-created',
    currentTurn: 2,
    plan: {
      planId: 'simple-plan',
      goal: { goalId: 'cash', kind: 'cash-engine', requiredCapabilities: ['supply'] },
      targetTurn: 3,
      deadlineTurn: 4,
      expectedValue: 20,
      confidence: 'medium',
      capabilities: [{
        capabilityId: 'supply', status: 'pending', leadTurns: 1,
        prerequisites: [], candidateIntents: ['production'],
      }],
      commitments: [], assumptions: [], repairOptions: [], fallbackPlanIds: [],
      invalidationRules: [],
    },
  }
  let memory = updateStrategicMemory(createStrategicMemory(header), created)
  const decision = arbitratePlanHealth(memory, evidence({ tacticalValue: 31 }))
  const events = [created, { type: 'plan-arbitrated', decision }, {
    type: 'turn-advanced', currentTurn: 3,
  }]
  memory = updateStrategicMemory(memory, events[1])
  memory = updateStrategicMemory(memory, events[2])
  assert.equal(memory.lastArbitration.currentTurn, 2)
  assert.equal(JSON.stringify(memory), JSON.stringify(rebuildStrategicMemory(header, events)))
})

test('forged arbitration records fail closed', () => {
  const memory = plannedMemory()
  const decision = arbitratePlanHealth(memory, evidence())
  decision.scores.continue = Number.NaN
  assert.throws(() => updateStrategicMemory(memory, {
    type: 'plan-arbitrated', decision,
  }), /score must be finite/)
})

test('a terminal plan cannot be silently resurrected by another arbitration', () => {
  let memory = plannedMemory()
  const pivot = arbitratePlanHealth(memory, evidence({
    planValue: 2, repairValue: 3, pivotValue: 30, switchingCost: 2,
  }))
  memory = updateStrategicMemory(memory, { type: 'plan-arbitrated', decision: pivot })
  assert.equal(memory.strategicPlan.status, 'pivoted')
  assert.throws(() => arbitratePlanHealth(memory, evidence({ planValue: 100 })),
    /replacement plan/)
})

test('arbiter evidence rejects private and credential-shaped payloads', () => {
  assert.throws(() => arbitratePlanHealth(plannedMemory(), {
    ...evidence(), hiddenState: { reserveCards: [1, 2] },
  }), /fields differ|private/i)
  assert.throws(() => arbitratePlanHealth(plannedMemory(), {
    ...evidence(), observationDigest: 'Bearer secret-value',
  }), /observationDigest/)
})
