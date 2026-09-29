import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateCounterfactualRootProtocol } from './counterfactual-root-suite.mjs'

const failureUrl = new URL(
  '../fixtures/counterfactual-root-suite-v1/failure-report.json', import.meta.url)
const revisedProtocolUrl = new URL(
  '../fixtures/counterfactual-root-suite-v2/protocol.json', import.meta.url)

test('v1 availability failure cannot be mistaken for a frozen root suite', async () => {
  const failure = JSON.parse(await readFile(failureUrl, 'utf8'))
  assert.equal(failure.reportWritten, false)
  assert.equal(failure.selectionUsesOutcomeFields, false)
  assert.equal(failure.terminalOutcomeFieldsRead, false)
  assert.equal(failure.terminalOutcomeFieldsPersisted, false)
  assert.equal(failure.privatePayloadPersisted, false)
  assert.equal(failure.unavailableSlots.length, 3)
  assert.match(failure.decision, /^reject-/)
})

test('v2 uses fresh games while preserving player, phase, seat, and action-family coverage', async () => {
  const protocol = JSON.parse(await readFile(revisedProtocolUrl, 'utf8'))
  const summary = validateCounterfactualRootProtocol(protocol)
  assert.deepEqual(summary, { slots: 24, twoPlayerSlots: 18, threePlayerSlots: 6 })
  assert.deepEqual(Object.fromEntries(['early', 'middle', 'late'].map((bucket) => [
    bucket, protocol.slots.filter((slot) => slot.phaseBucket === bucket).length,
  ])), { early: 8, middle: 8, late: 8 })
  assert.deepEqual(new Set(protocol.slots.map((slot) => slot.actionFamily)), new Set([
    'hiring', 'training', 'production', 'marketing', 'restructure', 'turn-order',
  ]))
  assert.deepEqual(new Set(protocol.slots.filter((slot) => slot.playerCount === 3)
    .map((slot) => slot.seat)), new Set([0, 1, 2]))
  const exploration = new Set(protocol.explorationGames.map((game) => game.seed))
  assert.ok(protocol.collectionGames.every((game) => !exploration.has(game.seed)))
})
