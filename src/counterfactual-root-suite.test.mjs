import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  COUNTERFACTUAL_ROOT_SUITE_VERSION,
  ROOT_DISCOVERY_POLICY_VERSION,
  decisionActionFamily,
  selectCounterfactualRoots,
  validateCounterfactualRootProtocol,
  validateCounterfactualRootReport,
} from './counterfactual-root-suite.mjs'

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

function slots() {
  return Array.from({ length: 24 }, (_, index) => ({
    id: `root-${String(index + 1).padStart(2, '0')}`,
    seed: `collect-${index}`,
    playerCount: index < 18 ? 2 : 3,
    seat: index < 18 ? index % 2 : (index - 18) % 3,
    phaseBucket: ['early', 'middle', 'late'][index % 3],
    actionFamily: ['hiring', 'training', 'production'][index % 3],
  }))
}

function protocol() {
  return {
    schemaVersion: 'fcm.counterfactual-root-suite-protocol.v1',
    suiteVersion: COUNTERFACTUAL_ROOT_SUITE_VERSION,
    experimentId: 55,
    ruleset: 'base-game',
    candidateGenerator: 'fcm.phase-candidates.v1',
    candidateLimit: 6,
    discoveryPolicy: ROOT_DISCOVERY_POLICY_VERSION,
    explorationGames: [{ seed: 'explore-0', playerCount: 2 }],
    collectionGames: Array.from({ length: 24 }, (_, index) => ({
      seed: `collect-${index}`, playerCount: index < 18 ? 2 : 3,
    })),
    slots: slots(),
    maximumRootsPerSeed: 1,
    maximumRootsPerMap: 1,
    minimumUniqueSeeds: 24,
    minimumUniqueMaps: 24,
    terminalOutcomesAllowed: false,
    selectionUsesOutcomeFields: false,
    promotionHoldoutOpened: false,
  }
}

function root(slot, index) {
  return {
    seed: `collect-${index}`,
    playerCount: slot.playerCount,
    seat: slot.seat,
    decisionIndex: index,
    turn: index % 3 + 1,
    phase: 5,
    subphase: index % 3 + 1,
    phaseBucket: slot.phaseBucket,
    actionFamily: slot.actionFamily,
    mapDigest: hash(`map-${index}`),
    publicProjectionDigest: hash(`public-${index}`),
    candidateSetDigest: hash(`candidates-${index}`),
    rootIdentityDigest: hash(`root-${index}`),
    candidateIds: [`candidate-${index}-0`, `candidate-${index}-1`],
    candidateIntents: ['fallback', slot.actionFamily],
  }
}

function report(inputProtocol, roots) {
  const selected = roots.map((entry, index) => ({ ...entry, slotId: inputProtocol.slots[index].id }))
  const families = [...new Set(selected.map((entry) => entry.actionFamily))].sort()
  return {
    schemaVersion: 'fcm.counterfactual-root-suite-report.v1',
    suiteVersion: inputProtocol.suiteVersion,
    experimentId: inputProtocol.experimentId,
    protocolDigest: hash(JSON.stringify(inputProtocol)),
    rulesetHash: hash('rules').slice(7),
    candidateGenerator: inputProtocol.candidateGenerator,
    candidateLimit: inputProtocol.candidateLimit,
    discoveryPolicy: inputProtocol.discoveryPolicy,
    frozenBeforeTerminalSampling: true,
    selectionUsesOutcomeFields: false,
    terminalOutcomeFieldsPersisted: false,
    privatePayloadPersisted: false,
    promotionHoldoutOpened: false,
    roots: selected,
    summary: {
      roots: 24,
      twoPlayerRoots: 18,
      threePlayerRoots: 6,
      uniqueSeeds: 24,
      uniqueMaps: 24,
      phaseBuckets: Object.fromEntries(['early', 'middle', 'late'].map((bucket) => [
        bucket, selected.filter((entry) => entry.phaseBucket === bucket).length,
      ])),
      actionFamilies: Object.fromEntries(families.map((family) => [
        family, selected.filter((entry) => entry.actionFamily === family).length,
      ])),
    },
  }
}

test('action-family classifier merges production primitives and rejects unknown or mixed families', () => {
  assert.equal(decisionActionFamily({ legalActions: { actions: [
    { type: 'produce' }, { type: 'collect_drinks' }, { type: 'next_subphase' },
  ] } }), 'production')
  assert.throws(() => decisionActionFamily({ legalActions: { actions: [
    { type: 'hire' }, { type: 'marketing' },
  ] } }), /unrelated action families/)
  assert.throws(() => decisionActionFamily({ legalActions: { actions: [
    { type: 'future_expansion_action' },
  ] } }), /unclassified legal action type/)
})

test('protocol rejects split leakage, malformed slots, and any permission to inspect outcomes', () => {
  const valid = protocol()
  assert.equal(validateCounterfactualRootProtocol(valid).slots, 24)
  assert.throws(() => validateCounterfactualRootProtocol({
    ...valid, collectionGames: [{ seed: 'explore-0', playerCount: 2 }],
  }), /seed leakage/)
  assert.throws(() => validateCounterfactualRootProtocol({
    ...valid, terminalOutcomesAllowed: true,
  }))
  const badSlots = structuredClone(valid.slots)
  badSlots[0].seat = 2
  assert.throws(() => validateCounterfactualRootProtocol({ ...valid, slots: badSlots }),
    /seat is invalid/)
})

test('selector fills exact slots deterministically without seed or map concentration', () => {
  const inputProtocol = protocol()
  const pool = inputProtocol.slots.map(root)
  const first = selectCounterfactualRoots(inputProtocol, [...pool].reverse())
  const second = selectCounterfactualRoots(inputProtocol, pool)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map((entry) => entry.slotId), inputProtocol.slots.map((slot) => slot.id))
  assert.equal(new Set(first.map((entry) => entry.seed)).size, 24)
})

test('selector cannot silently relax an impossible slot or inspect terminal labels', () => {
  const inputProtocol = protocol()
  const pool = inputProtocol.slots.map(root)
  assert.throws(() => selectCounterfactualRoots(inputProtocol, pool.slice(1)),
    /no root selection satisfies/)
  assert.throws(() => selectCounterfactualRoots(inputProtocol, [
    { ...pool[0], terminalRank: 1 }, ...pool.slice(1),
  ]), /outcome\/private field/)
})

test('report gate rejects private payloads, terminal results, identity duplication, and summary drift', () => {
  const inputProtocol = protocol()
  const roots = inputProtocol.slots.map(root)
  const valid = report(inputProtocol, roots)
  assert.equal(validateCounterfactualRootReport(valid, inputProtocol).roots, 24)
  assert.throws(() => validateCounterfactualRootReport({
    ...valid, roots: valid.roots.map((entry, index) => index ? entry : { ...entry, gameData: 'private' }),
  }, inputProtocol), /forbidden persisted field/)
  assert.throws(() => validateCounterfactualRootReport({
    ...valid, terminalMoney: [100, 0],
  }, inputProtocol), /forbidden persisted field/)
  const duplicate = structuredClone(valid)
  duplicate.roots[1].rootIdentityDigest = duplicate.roots[0].rootIdentityDigest
  assert.throws(() => validateCounterfactualRootReport(duplicate, inputProtocol), /duplicate root/)
  assert.throws(() => validateCounterfactualRootReport({
    ...valid, summary: { ...valid.summary, roots: 23 },
  }, inputProtocol), /summary drift/)
})
