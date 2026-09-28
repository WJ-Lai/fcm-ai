import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  buildPublicReplayCapture,
  classifyRuleset,
  decodeSimpleModel,
  encodeSimpleModel,
  validatePublicReplayCapture,
} from './public-replay.mjs'


function model(name = 'Alice') {
  return [
    [[], []],
    [
      { name, displayName: `${name} AI`, money: 20 },
      { name: 'Bob', displayName: 'Bob', money: 10 },
    ],
    [], [], [], 100,
    { turn: 0, phase: 3, turnOrder: [0, 1], newTurnOrder: [], subphase: 1 },
    [], [], [], 3, [], false,
    [[4, 0, 123456, { message: `${name} hired` }]],
    [], [], [], [], [], [], { preMoveData: { hiddenReserve: 200 } },
  ]
}


function raw(overrides = {}) {
  const first = encodeSimpleModel(model())
  const secondModel = model()
  secondModel[1][0].money = 30
  const second = encodeSimpleModel(secondModel)
  return {
    gameId: 123,
    finishedGame: true,
    startingOptions: [5],
    startingMap: [1, 0, 2, 1],
    playerNames: ['Alice', 'Bob'],
    history: [
      [4, 0, 123456, { employee: 2, label: 'Alice hired' }],
      [26, -1, 123457, { winner: 'Bob' }],
    ],
    replayData: [first, second],
    clientBundle: 'https://example.test/main.js',
    ...overrides,
  }
}


test('classifies standard, variant and expansion rulesets without guessing', () => {
  assert.equal(classifyRuleset([]), 'base-standard')
  assert.equal(classifyRuleset([5]), 'base-standard')
  assert.equal(classifyRuleset([1, 5]), 'base-variant')
  assert.equal(classifyRuleset([5, 19]), 'expansion')
})


test('builds a quarantined capture with anonymous players and no embedded history', () => {
  const capture = buildPublicReplayCapture(raw(), { capturedAt: '2026-09-28T01:00:00.000Z' })
  validatePublicReplayCapture(capture)
  const serialized = JSON.stringify(capture)

  assert.equal(capture.ruleset.classification, 'base-standard')
  assert.equal(capture.history[0].payload.label, 'seat-0 hired')
  assert.ok(!serialized.includes('Alice'))
  assert.ok(!serialized.includes('Bob'))
  assert.ok(!serialized.includes('123456'))
  const decoded = decodeSimpleModel(capture.replay.states[0])
  assert.equal(decoded[13].length, 0)
  assert.deepEqual(decoded[19], [-1, -1])
  assert.deepEqual(decoded[20], {})
})


test('rejects incomplete, mismatched and credential-bearing captures', () => {
  assert.throws(
    () => buildPublicReplayCapture(raw({ finishedGame: false }), { capturedAt: '2026-09-28T01:00:00.000Z' }),
    /only finished games/,
  )
  assert.throws(
    () => buildPublicReplayCapture(raw({ replayData: raw().replayData.slice(0, 1) }), { capturedAt: '2026-09-28T01:00:00.000Z' }),
    /counts differ/,
  )
  const unsafe = raw()
  unsafe.history[0][3] = { auth: 'Bearer abcdefghijklmnopqrstuvwxyz' }
  assert.throws(
    () => buildPublicReplayCapture(unsafe, { capturedAt: '2026-09-28T01:00:00.000Z' }),
    /credential-like/,
  )
})


test('rejects legacy non-array map metadata before it can be called a replay capture', () => {
  assert.throws(
    () => buildPublicReplayCapture(raw({ startingMap: 18 }), { capturedAt: '2026-09-28T01:00:00.000Z' }),
    /startingMap/,
  )
})


test('detects state tampering after capture', () => {
  const capture = buildPublicReplayCapture(raw(), { capturedAt: '2026-09-28T01:00:00.000Z' })
  capture.replay.states[0] = capture.replay.states[1]
  assert.throws(() => validatePublicReplayCapture(capture), /digest differs/)
})


test('rejects a capture that reintroduces a hidden reserve-card choice', () => {
  const capture = buildPublicReplayCapture(raw(), { capturedAt: '2026-09-28T01:00:00.000Z' })
  const decoded = decodeSimpleModel(capture.replay.states[0])
  decoded[19][0] = 3
  capture.replay.states[0] = encodeSimpleModel(decoded)
  capture.integrity.stateDigest = `sha256:${createHash('sha256')
    .update(capture.replay.states.join('\n')).digest('hex')}`
  assert.throws(() => validatePublicReplayCapture(capture), /private reserve-card choice/)
})
