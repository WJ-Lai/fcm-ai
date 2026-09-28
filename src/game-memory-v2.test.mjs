import assert from 'node:assert/strict'
import test from 'node:test'

import { createGameMemory, updateGameMemory } from './game-memory.mjs'
import {
  STRATEGIC_MEMORY_VERSION,
  analyzeStrategicPlan,
  compileCandidatePlanFeatures,
  createStrategicMemory,
  migrateGameMemoryV1,
  rebuildStrategicMemory,
  updateStrategicMemory,
  validateStrategicMemory,
} from './game-memory-v2.mjs'

const header = { gameId: 12, seat: 0, rulesetHash: 'sha256:rules' }

function delayedPlanEvent() {
  return {
    type: 'plan-created',
    currentTurn: 1,
    plan: {
      planId: 'burger-r3',
      goal: {
        goalId: 'first-burger',
        kind: 'milestone',
        requiredCapabilities: ['market-burger'],
      },
      targetTurn: 3,
      deadlineTurn: 3,
      expectedValue: 30,
      confidence: 'medium',
      capabilities: [
        {
          capabilityId: 'hire-marketer', status: 'pending', leadTurns: 1,
          prerequisites: [],
        },
        {
          capabilityId: 'market-burger', status: 'pending', leadTurns: 1,
          prerequisites: ['hire-marketer'],
        },
      ],
      commitments: [
        {
          commitmentId: 'management-trainee', kind: 'employee', status: 'committed',
          reusableFor: ['alternate-marketing'], sunkValue: 5,
        },
      ],
      assumptions: [
        { assumptionId: 'milestone-open', origin: 'observed', statement: 'milestone window open' },
      ],
      repairOptions: [
        {
          repairId: 'alternate-marketing', requiredCapabilities: ['market-burger'],
          reusableCommitments: ['management-trainee'],
        },
      ],
      fallbackPlanIds: ['cash-flow'],
      invalidationRules: [
        { ruleId: 'milestone-closed', publicEvent: 'milestone:first-burger:closed' },
      ],
    },
  }
}

test('v2 preserves a zero-slack turn-1 enabler for a turn-3 goal', () => {
  const memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  const analysis = analyzeStrategicPlan(memory.strategicPlan)
  assert.equal(memory.schemaVersion, STRATEGIC_MEMORY_VERSION)
  assert.equal(analysis.earliestActivationTurn, 3)
  assert.equal(analysis.slackTurns, 0)
  assert.equal(analysis.feasibility, 'feasible')
  assert.deepEqual(analysis.criticalCapabilities, ['hire-marketer', 'market-burger'])

  const feature = compileCandidatePlanFeatures(memory, {
    id: 'hire-marketer-now', intent: 'foundation', actions: [{ type: 'hire', employee: 13 }],
    details: { providesCapabilities: ['hire-marketer'] },
  })
  assert.equal(feature.relation, 'plan-consistent')
  assert.equal(feature.deadlineCritical, true)
  assert.equal(feature.priority, 3)
})

test('v2 detects a missed deadline and an impossible prerequisite', () => {
  let memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  memory = updateStrategicMemory(memory, { type: 'turn-advanced', currentTurn: 2 })
  assert.equal(memory.strategicPlan.analysis.slackTurns, -1)
  assert.equal(memory.strategicPlan.analysis.feasibility, 'infeasible')
  assert.ok(memory.strategicPlan.analysis.reasons.includes('deadline-missed'))

  memory = updateStrategicMemory(memory, {
    type: 'capability-status', capabilityId: 'hire-marketer', status: 'impossible',
    evidence: 'employee supply exhausted',
  })
  assert.ok(memory.strategicPlan.analysis.reasons.includes('impossible-capability'))
})

test('v2 repair retains reusable commitments and records stranded assets', () => {
  let memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  memory = updateStrategicMemory(memory, {
    type: 'plan-repaired',
    repairId: 'alternate-marketing',
    retainedCommitmentIds: ['management-trainee'],
    strandedCommitments: [
      { commitmentId: 'obsolete-billboard', kind: 'campaign', sunkValue: 5 },
    ],
    reason: 'original trainer unavailable',
  })
  assert.equal(memory.strategicPlan.status, 'repairing')
  assert.equal(memory.strategicPlan.activeRepairId, 'alternate-marketing')
  assert.equal(memory.strategicPlan.commitments[0].status, 'reusable')
  assert.equal(memory.strategicPlan.commitments[1].status, 'stranded')
  assert.equal(memory.strategicPlan.repairHistory.length, 1)
})

test('v2 exposes valuable tactical and off-plan candidates instead of tunneling', () => {
  const memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  const tactical = compileCandidatePlanFeatures(memory, {
    id: 'temporary-demand-gap', intent: 'opportunity', actions: [{ type: 'marketing' }],
    details: { strategicIntent: 'tactical-deviation', opportunityExpiryTurn: 1 },
  })
  const offPlan = compileCandidatePlanFeatures(memory, {
    id: 'novel-route', intent: 'novel', actions: [{ type: 'open_restaurant' }], details: {},
  })
  assert.deepEqual(
    { relation: tactical.relation, eligible: tactical.eligible, urgency: tactical.opportunityUrgency },
    { relation: 'tactical-deviation', eligible: true, urgency: 1 },
  )
  assert.equal(offPlan.relation, 'off-plan')
  assert.equal(offPlan.eligible, true)
})

test('v2 rebuild is deterministic and v1 migration is explicit', () => {
  const events = [
    delayedPlanEvent(),
    { type: 'capability-status', capabilityId: 'hire-marketer', status: 'active', achievedTurn: 2 },
    { type: 'turn-advanced', currentTurn: 2 },
  ]
  const rebuilt = rebuildStrategicMemory(header, events)
  let incremental = createStrategicMemory(header)
  for (const event of events) incremental = updateStrategicMemory(incremental, event)
  assert.equal(JSON.stringify(rebuilt), JSON.stringify(incremental))

  let legacy = createGameMemory(header)
  legacy = updateGameMemory(legacy, {
    type: 'plan', intent: 'demand-engine', horizonTurns: 3, confidence: 'medium',
    evidence: ['open milestone'],
  })
  assert.throws(() => validateStrategicMemory(legacy), /unsupported strategic memory version/)
  const migrated = migrateGameMemoryV1(legacy)
  assert.equal(migrated.schemaVersion, STRATEGIC_MEMORY_VERSION)
  assert.equal(migrated.strategicPlan, null)
  assert.equal(migrated.legacyContext.intent, 'demand-engine')
  assert.equal(migrated.migration.sourceVersion, 'fcm.game-memory.v1')
})

test('v2 rejects hidden engine state and non-public assumptions', () => {
  const memory = createStrategicMemory(header)
  const event = delayedPlanEvent()
  event.plan.hiddenState = { reserveCards: [1, 2, 3] }
  assert.throws(() => updateStrategicMemory(memory, event), /private key/)

  const snakeCase = delayedPlanEvent()
  snakeCase.plan.hidden_state = { chosen_res_card: 2 }
  assert.throws(() => updateStrategicMemory(memory, snakeCase), /private key/)

  const nonPublic = delayedPlanEvent()
  nonPublic.plan.assumptions[0].origin = 'hidden'
  assert.throws(() => updateStrategicMemory(memory, nonPublic), /assumption origin/)
})

test('v2 rejects a forged memory whose plan clock diverges from the event clock', () => {
  const memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  const forged = structuredClone(memory)
  forged.currentTurn = 2
  assert.throws(() => validateStrategicMemory(forged), /plan current turn/)
})

test('v2 rejects dependency cycles even outside the terminal goal path', () => {
  const event = delayedPlanEvent()
  event.plan.capabilities.push(
    { capabilityId: 'unused-a', status: 'pending', leadTurns: 1, prerequisites: ['unused-b'] },
    { capabilityId: 'unused-b', status: 'pending', leadTurns: 1, prerequisites: ['unused-a'] },
  )
  assert.throws(
    () => updateStrategicMemory(createStrategicMemory(header), event),
    /capability dependency cycle/,
  )
})

test('public invalidation disables plan priority without deleting the audit trail', () => {
  let memory = updateStrategicMemory(createStrategicMemory(header), delayedPlanEvent())
  memory = updateStrategicMemory(memory, {
    type: 'public-event', publicEvent: 'milestone:first-burger:closed',
  })
  assert.equal(memory.strategicPlan.status, 'invalidated')
  assert.equal(memory.strategicPlan.invalidationHistory[0].ruleId, 'milestone-closed')
  const feature = compileCandidatePlanFeatures(memory, {
    id: 'too-late', intent: 'foundation', actions: [{ type: 'hire', employee: 13 }],
    details: { providesCapabilities: ['hire-marketer'] },
  })
  assert.deepEqual(
    { relation: feature.relation, priority: feature.priority, eligible: feature.eligible },
    { relation: 'off-plan', priority: 0, eligible: true },
  )
})
