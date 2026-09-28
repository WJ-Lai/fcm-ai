import assert from 'node:assert/strict'

import { validateGameMemory } from './game-memory.mjs'

export const STRATEGIC_MEMORY_VERSION = 'fcm.game-memory.v2'
const PLAN_ARBITRATION_VERSION = 'fcm.plan-arbitration.v1'

const CONFIDENCE = new Set(['low', 'medium', 'high'])
const PLAN_STATUS = new Set([
  'active', 'repairing', 'tactical-deviation', 'pivoted', 'abandoned', 'completed', 'invalidated',
])
const CAPABILITY_STATUS = new Set(['pending', 'active', 'impossible'])
const COMMITMENT_STATUS = new Set(['committed', 'reusable', 'stranded', 'released'])
const ORIGINS = new Set(['observed', 'derived', 'believed'])
const PRIVATE_KEYS = new Set([
  'reservecards', 'chosenrescard', 'premovedata', 'movedata', 'context', 'hiddenstate',
])
const SENSITIVE_KEY = /(?:token|password|secret|cookie|authorization|credential)/i
const SENSITIVE_TEXT = /(?:bearer\s+[a-z0-9._~-]+|fcm_agent_token|sessionid=)/i
const ARBITRATION_MODES = new Set([
  'continue', 'repair', 'tactical_deviation', 'pivot', 'abandon',
])

function bounded(items, limit) {
  return items.slice(Math.max(0, items.length - limit))
}

function assertId(value, label) {
  assert.match(value, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} must be a stable id`)
}

function assertSafe(value, path = '$') {
  if (typeof value === 'string') {
    assert.ok(value.length <= 500, `${path}: memory text exceeds 500 characters`)
    assert.ok(!SENSITIVE_TEXT.test(value), `${path}: credential-like text is forbidden`)
    return
  }
  if (Array.isArray(value)) {
    assert.ok(value.length <= 128, `${path}: memory list exceeds 128 items`)
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!SENSITIVE_KEY.test(key), `${path}.${key}: sensitive key is forbidden`)
      const normalizedKey = key.replaceAll(/[_-]/g, '').toLowerCase()
      assert.ok(!PRIVATE_KEYS.has(normalizedKey), `${path}.${key}: private key is forbidden`)
      assertSafe(item, `${path}.${key}`)
    }
  }
}

function uniqueIds(items, key, label) {
  const ids = new Set()
  for (const item of items) {
    assertId(item[key], `${label}.${key}`)
    assert.equal(ids.has(item[key]), false, `duplicate ${label} ${item[key]}`)
    ids.add(item[key])
  }
  return ids
}

function validateArbitrationRecord(record, currentTurn) {
  const expected = [
    'schemaVersion', 'observationDigest', 'currentTurn', 'trigger', 'previousMode', 'mode',
    'scores', 'eligibleModes', 'reasonCodes', 'thresholds',
  ]
  assert.deepEqual(Object.keys(record).sort(), expected.sort(), 'arbitration fields differ')
  assert.equal(record.schemaVersion, PLAN_ARBITRATION_VERSION,
    'unsupported plan arbitration version')
  assert.match(record.observationDigest, /^sha256:[a-f0-9]{64}$/,
    'invalid arbitration observation digest')
  assert.ok(ARBITRATION_MODES.has(record.previousMode), 'invalid previous arbitration mode')
  assert.ok(ARBITRATION_MODES.has(record.mode), 'invalid arbitration mode')
  assert.ok(Number.isInteger(record.currentTurn) && record.currentTurn <= currentTurn,
    'arbitration turn cannot exceed memory')
  assert.deepEqual(Object.keys(record.scores).sort(), [...ARBITRATION_MODES].sort(),
    'arbitration score fields differ')
  for (const score of Object.values(record.scores)) {
    assert.ok(score == null || Number.isFinite(score), 'arbitration score must be finite or null')
  }
  assert.ok(Array.isArray(record.eligibleModes) && record.eligibleModes.length > 0,
    'arbitration needs eligible modes')
  record.eligibleModes.forEach((mode) => assert.ok(ARBITRATION_MODES.has(mode),
    'invalid eligible arbitration mode'))
  assert.ok(Array.isArray(record.reasonCodes) && record.reasonCodes.length > 0,
    'arbitration needs reason codes')
  record.reasonCodes.forEach((reason) => assertId(reason, 'arbitration reason'))
  assert.ok(record.thresholds && typeof record.thresholds === 'object',
    'arbitration thresholds are required')
  Object.values(record.thresholds).forEach((value) => assert.ok(Number.isFinite(value),
    'arbitration threshold must be finite'))
  return record
}

function normalizeCapability(capability) {
  assert.ok(capability && typeof capability === 'object', 'capability must be an object')
  assertId(capability.capabilityId, 'capabilityId')
  assert.ok(CAPABILITY_STATUS.has(capability.status), 'invalid capability status')
  assert.ok(Number.isInteger(capability.leadTurns) && capability.leadTurns >= 0 && capability.leadTurns <= 8,
    'capability leadTurns must be between 0 and 8')
  const prerequisites = [...(capability.prerequisites ?? [])]
  prerequisites.forEach((id) => assertId(id, 'capability prerequisite'))
  const candidateIntents = [...(capability.candidateIntents ?? [])]
  candidateIntents.forEach((id) => assertId(id, 'capability candidate intent'))
  if (capability.status === 'active' && capability.achievedTurn != null) {
    assert.ok(Number.isInteger(capability.achievedTurn) && capability.achievedTurn >= 0,
      'invalid capability achievedTurn')
  }
  return {
    capabilityId: capability.capabilityId,
    status: capability.status,
    leadTurns: capability.leadTurns,
    prerequisites,
    candidateIntents,
    ...(capability.achievedTurn == null ? {} : { achievedTurn: capability.achievedTurn }),
    ...(capability.evidence == null ? {} : { evidence: capability.evidence }),
  }
}

function normalizeCommitment(commitment) {
  assert.ok(commitment && typeof commitment === 'object', 'commitment must be an object')
  assertId(commitment.commitmentId, 'commitmentId')
  assertId(commitment.kind, 'commitment kind')
  const status = commitment.status ?? 'committed'
  assert.ok(COMMITMENT_STATUS.has(status), 'invalid commitment status')
  assert.ok(Number.isFinite(commitment.sunkValue ?? 0), 'commitment sunkValue must be finite')
  const reusableFor = [...(commitment.reusableFor ?? [])]
  reusableFor.forEach((id) => assertId(id, 'commitment reusableFor'))
  return {
    commitmentId: commitment.commitmentId,
    kind: commitment.kind,
    status,
    reusableFor,
    sunkValue: commitment.sunkValue ?? 0,
  }
}

function normalizePlan(raw, currentTurn) {
  assert.ok(raw && typeof raw === 'object', 'plan is required')
  assertId(raw.planId, 'planId')
  assert.ok(raw.goal && typeof raw.goal === 'object', 'plan goal is required')
  assertId(raw.goal.goalId, 'goalId')
  assertId(raw.goal.kind, 'goal kind')
  const capabilities = (raw.capabilities ?? []).map(normalizeCapability)
  const capabilityIds = uniqueIds(capabilities, 'capabilityId', 'capability')
  const requiredCapabilities = [...(raw.goal.requiredCapabilities ?? [])]
  for (const id of requiredCapabilities) {
    assert.ok(capabilityIds.has(id), `goal references unknown capability ${id}`)
  }
  for (const capability of capabilities) {
    for (const id of capability.prerequisites) {
      assert.ok(capabilityIds.has(id), `${capability.capabilityId} references unknown prerequisite ${id}`)
      assert.notEqual(id, capability.capabilityId, 'capability cannot depend on itself')
    }
  }
  assert.ok(Number.isInteger(raw.targetTurn) && raw.targetTurn >= currentTurn,
    'targetTurn cannot precede the current turn')
  assert.ok(Number.isInteger(raw.deadlineTurn) && raw.deadlineTurn >= raw.targetTurn,
    'deadlineTurn cannot precede targetTurn')
  assert.ok(Number.isFinite(raw.expectedValue), 'expectedValue must be finite')
  assert.ok(CONFIDENCE.has(raw.confidence), 'invalid plan confidence')

  const commitments = (raw.commitments ?? []).map(normalizeCommitment)
  const commitmentIds = uniqueIds(commitments, 'commitmentId', 'commitment')
  const assumptions = (raw.assumptions ?? []).map((assumption) => {
    assertId(assumption.assumptionId, 'assumptionId')
    assert.ok(ORIGINS.has(assumption.origin), 'invalid assumption origin')
    assert.ok(typeof assumption.statement === 'string' && assumption.statement.length > 0,
      'assumption statement is required')
    if (assumption.origin === 'believed') assert.ok(CONFIDENCE.has(assumption.confidence),
      'believed assumption needs confidence')
    return structuredClone(assumption)
  })
  uniqueIds(assumptions, 'assumptionId', 'assumption')

  const repairOptions = (raw.repairOptions ?? []).map((repair) => {
    assertId(repair.repairId, 'repairId')
    const required = [...(repair.requiredCapabilities ?? [])]
    const reusable = [...(repair.reusableCommitments ?? [])]
    required.forEach((id) => assert.ok(capabilityIds.has(id), `repair references unknown capability ${id}`))
    reusable.forEach((id) => assert.ok(commitmentIds.has(id), `repair references unknown commitment ${id}`))
    return { repairId: repair.repairId, requiredCapabilities: required, reusableCommitments: reusable }
  })
  uniqueIds(repairOptions, 'repairId', 'repair')

  const fallbackPlanIds = [...(raw.fallbackPlanIds ?? [])]
  fallbackPlanIds.forEach((id) => assertId(id, 'fallback plan id'))
  const invalidationRules = (raw.invalidationRules ?? []).map((rule) => {
    assertId(rule.ruleId, 'invalidation rule id')
    assert.ok(typeof rule.publicEvent === 'string' && rule.publicEvent.length > 0,
      'invalidation rule needs publicEvent')
    return { ruleId: rule.ruleId, publicEvent: rule.publicEvent }
  })
  uniqueIds(invalidationRules, 'ruleId', 'invalidation rule')

  const plan = {
    planId: raw.planId,
    goal: { goalId: raw.goal.goalId, kind: raw.goal.kind, requiredCapabilities },
    status: 'active',
    createdTurn: currentTurn,
    currentTurn,
    targetTurn: raw.targetTurn,
    deadlineTurn: raw.deadlineTurn,
    expectedValue: raw.expectedValue,
    confidence: raw.confidence,
    capabilities,
    commitments,
    assumptions,
    repairOptions,
    fallbackPlanIds,
    invalidationRules,
    invalidationHistory: [],
    repairHistory: [],
    activeRepairId: null,
  }
  return withAnalysis(plan)
}

export function analyzeStrategicPlan(plan) {
  assert.ok(plan && typeof plan === 'object', 'strategic plan is required')
  const byId = new Map(plan.capabilities.map((capability) => [capability.capabilityId, capability]))
  const visiting = new Set()
  const memo = new Map()
  const completeTurn = (id) => {
    if (memo.has(id)) return memo.get(id)
    assert.equal(visiting.has(id), false, `capability dependency cycle at ${id}`)
    visiting.add(id)
    const capability = byId.get(id)
    assert.ok(capability, `unknown capability ${id}`)
    const prerequisiteTurn = capability.prerequisites.reduce(
      (latest, prerequisite) => Math.max(latest, completeTurn(prerequisite)),
      plan.currentTurn,
    )
    const result = capability.status === 'active'
      ? (capability.achievedTurn ?? plan.currentTurn)
      : prerequisiteTurn + capability.leadTurns
    visiting.delete(id)
    memo.set(id, result)
    return result
  }
  for (const id of byId.keys()) completeTurn(id)
  const required = plan.goal.requiredCapabilities
  const earliestActivationTurn = required.reduce(
    (latest, id) => Math.max(latest, completeTurn(id)),
    plan.currentTurn,
  )
  const critical = new Set()
  const includePrerequisites = (id) => {
    const capability = byId.get(id)
    for (const prerequisite of capability.prerequisites) includePrerequisites(prerequisite)
    if (capability.status !== 'active') critical.add(id)
  }
  required.forEach(includePrerequisites)
  const relevant = new Set(critical)
  const impossible = [...relevant].some((id) => byId.get(id).status === 'impossible')
  const slackTurns = plan.deadlineTurn - earliestActivationTurn
  const reasons = []
  if (slackTurns < 0) reasons.push('deadline-missed')
  if (impossible) reasons.push('impossible-capability')
  return {
    earliestActivationTurn,
    slackTurns,
    feasibility: reasons.length ? 'infeasible' : 'feasible',
    reasons,
    criticalCapabilities: [...critical],
  }
}

function withAnalysis(plan) {
  return { ...plan, analysis: analyzeStrategicPlan(plan) }
}

export function createStrategicMemory({ gameId, seat, rulesetHash }) {
  assert.ok(Number.isInteger(seat) && seat >= 0, 'memory seat must be non-negative')
  assert.ok(typeof rulesetHash === 'string' && rulesetHash.length > 0, 'rulesetHash is required')
  return {
    schemaVersion: STRATEGIC_MEMORY_VERSION,
    gameId,
    seat,
    rulesetHash,
    revision: 0,
    currentTurn: 0,
    strategicPlan: null,
    legacyContext: null,
    migration: null,
    opponentBeliefs: [],
    predictionErrors: [],
    decisions: [],
    planHistory: [],
    lastArbitration: null,
  }
}

export function validateStrategicMemory(memory) {
  assert.equal(memory?.schemaVersion, STRATEGIC_MEMORY_VERSION,
    'unsupported strategic memory version')
  assert.ok(Number.isInteger(memory.seat) && memory.seat >= 0, 'invalid memory seat')
  assert.ok(Number.isInteger(memory.revision) && memory.revision >= 0, 'invalid memory revision')
  assert.ok(Number.isInteger(memory.currentTurn) && memory.currentTurn >= 0, 'invalid current turn')
  assert.ok(Array.isArray(memory.opponentBeliefs) && memory.opponentBeliefs.length <= 12,
    'invalid opponent beliefs')
  assert.ok(Array.isArray(memory.predictionErrors) && memory.predictionErrors.length <= 32,
    'invalid prediction errors')
  assert.ok(Array.isArray(memory.decisions) && memory.decisions.length <= 64,
    'invalid decisions')
  assert.ok(Array.isArray(memory.planHistory) && memory.planHistory.length <= 16,
    'invalid plan history')
  if (memory.lastArbitration) {
    validateArbitrationRecord(memory.lastArbitration, memory.currentTurn)
  }
  if (memory.strategicPlan) {
    assert.ok(PLAN_STATUS.has(memory.strategicPlan.status), 'invalid plan status')
    assert.equal(memory.strategicPlan.currentTurn, memory.currentTurn,
      'plan current turn must match memory current turn')
    assert.deepEqual(memory.strategicPlan.analysis, analyzeStrategicPlan(memory.strategicPlan),
      'stale strategic plan analysis')
  }
  assertSafe(memory)
  return memory
}

function updateLegacyEvidence(next, event) {
  if (event.type === 'belief') {
    assert.ok(Number.isInteger(event.seat) && event.seat !== next.seat, 'invalid opponent seat')
    assert.ok(CONFIDENCE.has(event.confidence), 'invalid belief confidence')
    next.opponentBeliefs = bounded([
      ...next.opponentBeliefs.filter((belief) => belief.seat !== event.seat),
      {
        seat: event.seat, hypothesis: event.hypothesis,
        confidence: event.confidence, evidenceDecision: event.evidenceDecision,
      },
    ], 12)
  } else if (event.type === 'prediction-error') {
    assert.ok(Number.isFinite(event.predicted) && Number.isFinite(event.actual),
      'prediction values must be finite')
    next.predictionErrors = bounded([...next.predictionErrors, {
      decisionId: event.decisionId,
      metric: event.metric,
      predicted: event.predicted,
      actual: event.actual,
      error: event.actual - event.predicted,
    }], 32)
  } else {
    assert.ok(typeof event.candidateId === 'string' && event.candidateId.length > 0,
      'candidateId is required')
    next.decisions = bounded([...next.decisions, {
      decisionId: event.decisionId,
      phase: event.phase,
      subphase: event.subphase,
      candidateId: event.candidateId,
      intent: event.intent,
    }], 64)
  }
}

export function updateStrategicMemory(memory, event) {
  validateStrategicMemory(memory)
  assert.ok(event && typeof event === 'object', 'memory event is required')
  assertSafe(event)
  const next = structuredClone(memory)
  if (event.type === 'plan-created') {
    assert.ok(Number.isInteger(event.currentTurn) && event.currentTurn >= memory.currentTurn,
      'plan currentTurn cannot move backwards')
    if (next.strategicPlan) {
      next.planHistory = bounded([...next.planHistory, {
        planId: next.strategicPlan.planId,
        status: next.strategicPlan.status,
        endedAtRevision: next.revision,
      }], 16)
    }
    next.currentTurn = event.currentTurn
    next.strategicPlan = normalizePlan(event.plan, event.currentTurn)
  } else if (event.type === 'turn-advanced') {
    assert.ok(Number.isInteger(event.currentTurn) && event.currentTurn >= next.currentTurn,
      'current turn cannot move backwards')
    next.currentTurn = event.currentTurn
    if (next.strategicPlan) {
      next.strategicPlan.currentTurn = event.currentTurn
      next.strategicPlan = withAnalysis(next.strategicPlan)
    }
  } else if (event.type === 'capability-status') {
    assert.ok(next.strategicPlan, 'capability update requires an active plan')
    assert.ok(CAPABILITY_STATUS.has(event.status), 'invalid capability status')
    const index = next.strategicPlan.capabilities.findIndex(
      (capability) => capability.capabilityId === event.capabilityId,
    )
    assert.notEqual(index, -1, `unknown capability ${event.capabilityId}`)
    const capability = next.strategicPlan.capabilities[index]
    next.strategicPlan.capabilities[index] = normalizeCapability({
      ...capability,
      status: event.status,
      ...(event.achievedTurn == null ? {} : { achievedTurn: event.achievedTurn }),
      ...(event.evidence == null ? {} : { evidence: event.evidence }),
    })
    next.strategicPlan = withAnalysis(next.strategicPlan)
  } else if (event.type === 'plan-repaired') {
    assert.ok(next.strategicPlan, 'repair requires an active plan')
    const repair = next.strategicPlan.repairOptions.find((item) => item.repairId === event.repairId)
    assert.ok(repair, `unknown repair ${event.repairId}`)
    const retained = new Set(event.retainedCommitmentIds ?? [])
    for (const id of retained) {
      assert.ok(repair.reusableCommitments.includes(id), `repair cannot retain commitment ${id}`)
    }
    next.strategicPlan.commitments = next.strategicPlan.commitments.map((commitment) => (
      retained.has(commitment.commitmentId) ? { ...commitment, status: 'reusable' } : commitment
    ))
    for (const raw of event.strandedCommitments ?? []) {
      assert.equal(next.strategicPlan.commitments.some(
        (commitment) => commitment.commitmentId === raw.commitmentId,
      ), false, `duplicate commitment ${raw.commitmentId}`)
      next.strategicPlan.commitments.push(normalizeCommitment({ ...raw, status: 'stranded' }))
    }
    next.strategicPlan.status = 'repairing'
    next.strategicPlan.activeRepairId = event.repairId
    next.strategicPlan.repairHistory = bounded([...next.strategicPlan.repairHistory, {
      repairId: event.repairId,
      revision: next.revision + 1,
      reason: event.reason,
      retainedCommitmentIds: [...retained],
    }], 16)
    next.strategicPlan = withAnalysis(next.strategicPlan)
  } else if (event.type === 'public-event') {
    assert.ok(typeof event.publicEvent === 'string' && event.publicEvent.length > 0,
      'publicEvent is required')
    if (next.strategicPlan) {
      const matching = next.strategicPlan.invalidationRules.filter(
        (rule) => rule.publicEvent === event.publicEvent,
      )
      if (matching.length) {
        next.strategicPlan.status = 'invalidated'
        next.strategicPlan.invalidationHistory = bounded([
          ...next.strategicPlan.invalidationHistory,
          ...matching.map((rule) => ({
            ruleId: rule.ruleId, publicEvent: event.publicEvent, revision: next.revision + 1,
          })),
        ], 16)
      }
    }
  } else if (event.type === 'plan-arbitrated') {
    assert.ok(next.strategicPlan, 'arbitration requires a strategic plan')
    assert.ok(!['pivoted', 'abandoned', 'completed'].includes(next.strategicPlan.status),
      'terminal plan status requires an explicit replacement plan')
    const decision = structuredClone(event.decision)
    validateArbitrationRecord(decision, next.currentTurn)
    assert.equal(decision.currentTurn, next.currentTurn, 'arbitration turn must match memory')
    const statusByMode = {
      continue: 'active',
      repair: 'repairing',
      tactical_deviation: 'tactical-deviation',
      pivot: 'pivoted',
      abandon: 'abandoned',
    }
    assert.ok(statusByMode[decision.mode], 'invalid arbitration mode')
    next.strategicPlan.status = statusByMode[decision.mode]
    next.lastArbitration = decision
  } else if (['belief', 'prediction-error', 'decision'].includes(event.type)) {
    updateLegacyEvidence(next, event)
  } else {
    throw new Error(`unknown strategic memory event ${event.type}`)
  }
  next.revision += 1
  return validateStrategicMemory(next)
}

export function rebuildStrategicMemory(header, events) {
  return events.reduce(
    (memory, event) => updateStrategicMemory(memory, event),
    createStrategicMemory(header),
  )
}

export function migrateGameMemoryV1(legacy) {
  validateGameMemory(legacy)
  const migrated = createStrategicMemory({
    gameId: legacy.gameId, seat: legacy.seat, rulesetHash: legacy.rulesetHash,
  })
  migrated.revision = legacy.revision
  migrated.legacyContext = legacy.strategicPlan ? {
    intent: legacy.strategicPlan.intent,
    horizonTurns: legacy.strategicPlan.horizonTurns,
    confidence: legacy.strategicPlan.confidence,
    evidence: structuredClone(legacy.strategicPlan.evidence),
  } : null
  migrated.migration = { sourceVersion: legacy.schemaVersion, sourceRevision: legacy.revision }
  migrated.opponentBeliefs = structuredClone(legacy.opponentBeliefs)
  migrated.predictionErrors = structuredClone(legacy.predictionErrors)
  migrated.decisions = structuredClone(legacy.decisions)
  return validateStrategicMemory(migrated)
}

export function compileCandidatePlanFeatures(memory, candidate) {
  validateStrategicMemory(memory)
  assert.ok(candidate && typeof candidate === 'object', 'candidate is required')
  const plan = memory.strategicPlan
  if (!plan) return { relation: 'off-plan', eligible: true, priority: 0 }
  const planOperational = ['active', 'repairing', 'tactical-deviation'].includes(plan.status)
  const details = candidate.details ?? {}
  const provides = [...(details.providesCapabilities ?? [])]
  const critical = new Set(plan.analysis.criticalCapabilities)
  const intentCapabilities = plan.capabilities.filter(
    (capability) => critical.has(capability.capabilityId) &&
      capability.candidateIntents.includes(candidate.intent),
  ).map((capability) => capability.capabilityId)
  const supportsCapabilities = [...new Set([
    ...provides.filter((id) => critical.has(id)),
    ...intentCapabilities,
  ])]
  const supportsCritical = planOperational && supportsCapabilities.length > 0
  let relation = 'off-plan'
  if (details.strategicIntent === 'tactical-deviation') relation = 'tactical-deviation'
  else if (details.repairId) relation = 'repair'
  else if (details.pivotPlanId) relation = 'pivot'
  else if (supportsCritical) relation = 'plan-consistent'
  else if (candidate.intent === 'fallback') relation = 'fallback'
  if (!planOperational && !['pivot', 'fallback'].includes(relation)) relation = 'off-plan'
  const opportunityUrgency = Number.isInteger(details.opportunityExpiryTurn)
    ? Math.max(0, details.opportunityExpiryTurn - memory.currentTurn + 1)
    : null
  const arbitrationMode = memory.lastArbitration?.mode ?? null
  const targetRelation = {
    continue: 'plan-consistent',
    repair: 'repair',
    tactical_deviation: 'tactical-deviation',
    pivot: 'pivot',
    abandon: 'fallback',
  }[arbitrationMode] ?? null
  const arbitrationMatch = targetRelation != null && relation === targetRelation
  const planPriority = supportsCritical ? (plan.analysis.slackTurns <= 0 ? 3 : 2) : 0
  return {
    relation,
    eligible: true,
    priority: arbitrationMatch ? Math.max(4, planPriority) : planPriority,
    deadlineCritical: supportsCritical && plan.analysis.slackTurns <= 0,
    supportsCapabilities,
    opportunityUrgency,
    arbitrationMode,
    arbitrationMatch,
  }
}
