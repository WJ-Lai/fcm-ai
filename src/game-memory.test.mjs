import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGameMemory,
  rebuildGameMemory,
  updateGameMemory,
  validateGameMemory,
} from './game-memory.mjs'

const header = { gameId: 12, seat: 0, rulesetHash: 'sha256:rules' }

test('game memory is deterministic and rebuildable from bounded events', () => {
  const events = [
    { type: 'plan', intent: 'demand-engine', horizonTurns: 3, confidence: 'medium', evidence: ['open milestone'] },
    { type: 'belief', seat: 1, hypothesis: 'price pressure', confidence: 'low', evidenceDecision: 'd1' },
    { type: 'decision', decisionId: 'd1', phase: 5, subphase: 3, candidateId: 'c1', intent: 'create-demand' },
    { type: 'prediction-error', decisionId: 'd1', metric: 'revenue', predicted: 20, actual: 15 },
  ]
  const rebuilt = rebuildGameMemory(header, events)
  let incremental = createGameMemory(header)
  for (const event of events) incremental = updateGameMemory(incremental, event)
  assert.deepEqual(rebuilt, incremental)
  assert.equal(rebuilt.predictionErrors[0].error, -5)
  assert.equal(rebuilt.revision, 4)
})

test('game memory replaces per-seat beliefs and bounds long histories', () => {
  let memory = createGameMemory(header)
  memory = updateGameMemory(memory, {
    type: 'belief', seat: 1, hypothesis: 'supply', confidence: 'low', evidenceDecision: 'd0',
  })
  memory = updateGameMemory(memory, {
    type: 'belief', seat: 1, hypothesis: 'marketing', confidence: 'high', evidenceDecision: 'd1',
  })
  for (let index = 0; index < 80; index += 1) {
    memory = updateGameMemory(memory, {
      type: 'decision', decisionId: `d${index}`, phase: 5, subphase: 1,
      candidateId: `c${index}`, intent: 'hire',
    })
  }
  assert.equal(memory.opponentBeliefs.length, 1)
  assert.equal(memory.opponentBeliefs[0].hypothesis, 'marketing')
  assert.equal(memory.decisions.length, 64)
  assert.equal(memory.decisions[0].decisionId, 'd16')
})

test('game memory rejects credentials, unbounded text and invalid confidence', () => {
  const memory = createGameMemory(header)
  assert.throws(() => updateGameMemory(memory, {
    type: 'plan', intent: 'Bearer abcdef', confidence: 'high', evidence: [],
  }), /credential-like/)
  assert.throws(() => updateGameMemory(memory, {
    type: 'belief', seat: 1, hypothesis: 'x', confidence: 'certain',
  }), /confidence/)
  const forged = { ...memory, authToken: 'secret' }
  assert.throws(() => validateGameMemory(forged), /sensitive key/)
})
