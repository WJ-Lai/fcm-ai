import assert from 'node:assert/strict'

export const GAME_MEMORY_VERSION = 'fcm.game-memory.v1'
const CONFIDENCE = new Set(['low', 'medium', 'high'])
const SENSITIVE_KEY = /(?:token|password|secret|cookie|authorization|credential)/i
const SENSITIVE_TEXT = /(?:bearer\s+[a-z0-9._~-]+|fcm_agent_token|sessionid=)/i

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
      assertSafe(item, `${path}.${key}`)
    }
  }
}

function bounded(items, limit) {
  return items.slice(Math.max(0, items.length - limit))
}

export function createGameMemory({ gameId, seat, rulesetHash }) {
  assert.ok(Number.isInteger(seat) && seat >= 0, 'memory seat must be non-negative')
  assert.ok(typeof rulesetHash === 'string' && rulesetHash.length > 0, 'rulesetHash is required')
  return {
    schemaVersion: GAME_MEMORY_VERSION,
    gameId,
    seat,
    rulesetHash,
    revision: 0,
    strategicPlan: null,
    opponentBeliefs: [],
    predictionErrors: [],
    decisions: [],
  }
}

export function validateGameMemory(memory) {
  assert.equal(memory?.schemaVersion, GAME_MEMORY_VERSION, 'unsupported game memory version')
  assert.ok(Number.isInteger(memory.seat) && memory.seat >= 0, 'invalid memory seat')
  assert.ok(Number.isInteger(memory.revision) && memory.revision >= 0, 'invalid memory revision')
  assert.ok(Array.isArray(memory.opponentBeliefs), 'opponentBeliefs must be a list')
  assert.ok(Array.isArray(memory.predictionErrors), 'predictionErrors must be a list')
  assert.ok(Array.isArray(memory.decisions), 'decisions must be a list')
  if (memory.strategicPlan) {
    assert.ok(CONFIDENCE.has(memory.strategicPlan.confidence), 'invalid plan confidence')
  }
  for (const belief of memory.opponentBeliefs) {
    assert.ok(Number.isInteger(belief.seat) && belief.seat !== memory.seat, 'invalid opponent seat')
    assert.ok(CONFIDENCE.has(belief.confidence), 'invalid belief confidence')
  }
  assert.ok(memory.opponentBeliefs.length <= 12, 'too many opponent beliefs')
  assert.ok(memory.predictionErrors.length <= 32, 'too many prediction errors')
  assert.ok(memory.decisions.length <= 64, 'too many decisions')
  assertSafe(memory)
  return memory
}

export function updateGameMemory(memory, event) {
  validateGameMemory(memory)
  assert.ok(event && typeof event === 'object', 'memory event is required')
  const next = structuredClone(memory)
  if (event.type === 'plan') {
    assert.ok(typeof event.intent === 'string' && event.intent.length > 0, 'plan intent is required')
    assert.ok(CONFIDENCE.has(event.confidence), 'invalid plan confidence')
    next.strategicPlan = {
      intent: event.intent,
      horizonTurns: Math.max(1, Math.min(5, Math.floor(event.horizonTurns ?? 1))),
      confidence: event.confidence,
      evidence: bounded([...(event.evidence ?? [])], 8),
    }
  } else if (event.type === 'belief') {
    assert.ok(Number.isInteger(event.seat) && event.seat !== memory.seat, 'invalid opponent seat')
    assert.ok(CONFIDENCE.has(event.confidence), 'invalid belief confidence')
    next.opponentBeliefs = bounded([
      ...next.opponentBeliefs.filter((belief) => belief.seat !== event.seat),
      {
        seat: event.seat, hypothesis: event.hypothesis,
        confidence: event.confidence, evidenceDecision: event.evidenceDecision,
      },
    ], 12)
  } else if (event.type === 'prediction-error') {
    assert.ok(Number.isFinite(event.predicted) && Number.isFinite(event.actual), 'prediction values must be finite')
    next.predictionErrors = bounded([...next.predictionErrors, {
      decisionId: event.decisionId,
      metric: event.metric,
      predicted: event.predicted,
      actual: event.actual,
      error: event.actual - event.predicted,
    }], 32)
  } else if (event.type === 'decision') {
    assert.ok(typeof event.candidateId === 'string' && event.candidateId.length > 0, 'candidateId is required')
    next.decisions = bounded([...next.decisions, {
      decisionId: event.decisionId,
      phase: event.phase,
      subphase: event.subphase,
      candidateId: event.candidateId,
      intent: event.intent,
    }], 64)
  } else {
    throw new Error(`unknown game memory event ${event.type}`)
  }
  next.revision += 1
  return validateGameMemory(next)
}

export function rebuildGameMemory(header, events) {
  return events.reduce((memory, event) => updateGameMemory(memory, event), createGameMemory(header))
}
