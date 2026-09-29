import assert from 'node:assert/strict'

import { phaseBucket } from './value-calibration.mjs'

export const COUNTERFACTUAL_ROOT_SUITE_VERSION = 'fcm.counterfactual-root-suite.v1'
export const ROOT_DISCOVERY_POLICY_VERSION = 'fcm.deterministic-root-discovery.v1'

const PHASE_BUCKETS = new Set(['early', 'middle', 'late'])
const ACTION_TYPE_FAMILIES = new Map([
  ['place_restaurant', 'setup'],
  ['choose_reserve_card', 'reserve'],
  ['place_employees', 'restructure'],
  ['choose_turn_order', 'turn-order'],
  ['hire', 'hiring'],
  ['train', 'training'],
  ['marketing', 'marketing'],
  ['produce', 'production'],
  ['collect_drinks', 'production'],
  ['build_house', 'building'],
  ['open_restaurant', 'restaurant'],
  ['resolve_payday', 'payday'],
  ['resolve_cleanup', 'cleanup'],
])
const CONTROL_TYPES = new Set(['end_turn', 'next_subphase'])
const FORBIDDEN_KEYS = new Set([
  'snapshot', 'gameData', 'moveData', 'hiddenState', 'trustedWorld', 'preMoveData',
  'terminalMoney', 'terminalRank', 'terminalMargin', 'winner', 'winners', 'result',
  'password', 'credential', 'token',
])

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(new Set(Object.keys(value)), expected, `${label} fields changed`)
}

function sha256(value, label) {
  assert.match(value ?? '', /^sha256:[a-f0-9]{64}$/, `${label} must be a sha256 digest`)
}

function rejectForbidden(value) {
  if (Array.isArray(value)) {
    value.forEach(rejectForbidden)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_KEYS.has(key), `forbidden persisted field ${key}`)
    rejectForbidden(nested)
  }
}

export function decisionActionFamily(view) {
  const types = new Set()
  for (const action of view?.legalActions?.actions ?? []) {
    if (!CONTROL_TYPES.has(action.type)) types.add(action.type)
  }
  assert.ok(types.size > 0, 'decision has no substantive legal action family')
  const families = new Set([...types].map((type) => {
    const family = ACTION_TYPE_FAMILIES.get(type)
    assert.ok(family, `unclassified legal action type ${type}`)
    return family
  }))
  assert.equal(families.size, 1,
    `decision spans unrelated action families: ${[...families].sort().join(',')}`)
  return [...families][0]
}

export function rootPhaseBucket(view) {
  return phaseBucket({ turn: view?.state?.turn })
}

export function validateCounterfactualRootProtocol(protocol) {
  exactKeys(protocol, new Set([
    'schemaVersion', 'suiteVersion', 'experimentId', 'ruleset', 'candidateGenerator',
    'candidateLimit', 'discoveryPolicy', 'explorationGames', 'collectionGames', 'slots',
    'maximumRootsPerSeed', 'maximumRootsPerMap', 'minimumUniqueSeeds', 'minimumUniqueMaps',
    'terminalOutcomesAllowed', 'selectionUsesOutcomeFields', 'promotionHoldoutOpened',
  ]), 'protocol')
  assert.equal(protocol.schemaVersion, 'fcm.counterfactual-root-suite-protocol.v1')
  assert.equal(protocol.suiteVersion, COUNTERFACTUAL_ROOT_SUITE_VERSION)
  assert.equal(protocol.discoveryPolicy, ROOT_DISCOVERY_POLICY_VERSION)
  assert.equal(protocol.ruleset, 'base-game')
  assert.ok(typeof protocol.candidateGenerator === 'string' && protocol.candidateGenerator)
  assert.ok(Number.isInteger(protocol.candidateLimit) &&
    protocol.candidateLimit >= 2 && protocol.candidateLimit <= 8,
  'candidate limit must be between 2 and 8')
  assert.equal(protocol.terminalOutcomesAllowed, false)
  assert.equal(protocol.selectionUsesOutcomeFields, false)
  assert.equal(protocol.promotionHoldoutOpened, false)
  for (const field of [
    'maximumRootsPerSeed', 'maximumRootsPerMap', 'minimumUniqueSeeds', 'minimumUniqueMaps',
  ]) assert.ok(Number.isInteger(protocol[field]) && protocol[field] > 0, `${field} is invalid`)
  for (const field of ['explorationGames', 'collectionGames']) {
    assert.ok(Array.isArray(protocol[field]) && protocol[field].length > 0, `${field} are required`)
    for (const game of protocol[field]) {
      exactKeys(game, new Set(['seed', 'playerCount']), `${field} game`)
      assert.ok(typeof game.seed === 'string' && game.seed, `${field} seed is invalid`)
      assert.ok([2, 3].includes(game.playerCount), `${field} player count is invalid`)
    }
  }
  const explorationSeeds = new Set(protocol.explorationGames.map((game) => game.seed))
  const collectionSeeds = protocol.collectionGames.map((game) => game.seed)
  assert.equal(new Set(collectionSeeds).size, collectionSeeds.length,
    'collection game seeds must be unique')
  assert.ok(collectionSeeds.every((seed) => !explorationSeeds.has(seed)),
    'exploration/collection seed leakage')
  assert.ok(Array.isArray(protocol.slots) && protocol.slots.length === 24,
    'v1 must freeze exactly 24 root slots')
  const slotIds = new Set()
  for (const slot of protocol.slots) {
    exactKeys(slot, new Set(['id', 'seed', 'playerCount', 'seat', 'phaseBucket', 'actionFamily']),
      `slot ${slot.id ?? '<missing>'}`)
    assert.match(slot.id ?? '', /^root-[0-9]{2}$/)
    assert.ok(!slotIds.has(slot.id), `duplicate slot ${slot.id}`)
    slotIds.add(slot.id)
    assert.ok(protocol.collectionGames.some(
      (game) => game.seed === slot.seed && game.playerCount === slot.playerCount,
    ), `slot ${slot.id} references an unfrozen game`)
    assert.ok([2, 3].includes(slot.playerCount), `slot ${slot.id} player count is invalid`)
    assert.ok(Number.isInteger(slot.seat) && slot.seat >= 0 && slot.seat < slot.playerCount,
      `slot ${slot.id} seat is invalid`)
    assert.ok(PHASE_BUCKETS.has(slot.phaseBucket), `slot ${slot.id} phase bucket is invalid`)
    assert.ok([...ACTION_TYPE_FAMILIES.values()].includes(slot.actionFamily),
      `slot ${slot.id} action family is invalid`)
  }
  assert.ok(protocol.minimumUniqueSeeds <= protocol.collectionGames.length,
    'minimum unique seeds exceeds collection seeds')
  return {
    slots: protocol.slots.length,
    twoPlayerSlots: protocol.slots.filter((slot) => slot.playerCount === 2).length,
    threePlayerSlots: protocol.slots.filter((slot) => slot.playerCount === 3).length,
  }
}

function matches(slot, root) {
  return slot.seed === root.seed && slot.playerCount === root.playerCount && slot.seat === root.seat &&
    slot.phaseBucket === root.phaseBucket && slot.actionFamily === root.actionFamily
}

/** Outcome-blind exact-slot matching with deterministic backtracking and concentration caps. */
export function selectCounterfactualRoots(protocol, pool) {
  validateCounterfactualRootProtocol(protocol)
  assert.ok(Array.isArray(pool) && pool.length > 0, 'root pool is required')
  for (const root of pool) {
    assert.ok(!Object.keys(root).some((key) => FORBIDDEN_KEYS.has(key)),
      'root pool contains an outcome/private field')
  }
  const orderedPool = [...pool].sort((left, right) =>
    left.seed.localeCompare(right.seed) || left.playerCount - right.playerCount ||
    left.decisionIndex - right.decisionIndex || left.seat - right.seat)
  const slotOrder = protocol.slots.map((slot, index) => ({ slot, index }))
    .sort((left, right) => {
      const leftCount = orderedPool.filter((root) => matches(left.slot, root)).length
      const rightCount = orderedPool.filter((root) => matches(right.slot, root)).length
      return leftCount - rightCount || left.index - right.index
    })
  const selected = new Array(protocol.slots.length)
  const identities = new Set()
  const seedCounts = new Map()
  const mapCounts = new Map()

  function visit(depth) {
    if (depth === slotOrder.length) {
      return new Set(selected.map((root) => root.seed)).size >= protocol.minimumUniqueSeeds &&
        new Set(selected.map((root) => root.mapDigest)).size >= protocol.minimumUniqueMaps
    }
    const { slot, index } = slotOrder[depth]
    for (const root of orderedPool) {
      if (!matches(slot, root) || identities.has(root.rootIdentityDigest)) continue
      if ((seedCounts.get(root.seed) ?? 0) >= protocol.maximumRootsPerSeed) continue
      if ((mapCounts.get(root.mapDigest) ?? 0) >= protocol.maximumRootsPerMap) continue
      selected[index] = root
      identities.add(root.rootIdentityDigest)
      seedCounts.set(root.seed, (seedCounts.get(root.seed) ?? 0) + 1)
      mapCounts.set(root.mapDigest, (mapCounts.get(root.mapDigest) ?? 0) + 1)
      if (visit(depth + 1)) return selected.map((entry, slotIndex) => ({
        ...entry, slotId: protocol.slots[slotIndex].id,
      }))
      identities.delete(root.rootIdentityDigest)
      seedCounts.set(root.seed, seedCounts.get(root.seed) - 1)
      mapCounts.set(root.mapDigest, mapCounts.get(root.mapDigest) - 1)
      selected[index] = undefined
    }
    return null
  }
  const result = visit(0)
  assert.ok(result, 'no root selection satisfies the frozen slots and concentration caps')
  return result
}

export function validateCounterfactualRootReport(report, protocol) {
  validateCounterfactualRootProtocol(protocol)
  rejectForbidden(report)
  exactKeys(report, new Set([
    'schemaVersion', 'suiteVersion', 'experimentId', 'protocolDigest', 'rulesetHash',
    'candidateGenerator', 'candidateLimit', 'discoveryPolicy', 'frozenBeforeTerminalSampling',
    'selectionUsesOutcomeFields', 'terminalOutcomeFieldsPersisted', 'privatePayloadPersisted',
    'promotionHoldoutOpened', 'roots', 'summary',
  ]), 'report')
  assert.equal(report.schemaVersion, 'fcm.counterfactual-root-suite-report.v1')
  assert.equal(report.suiteVersion, protocol.suiteVersion)
  assert.equal(report.experimentId, protocol.experimentId)
  sha256(report.protocolDigest, 'protocolDigest')
  assert.match(report.rulesetHash ?? '', /^[a-f0-9]{64}$/, 'rulesetHash is invalid')
  assert.equal(report.candidateGenerator, protocol.candidateGenerator)
  assert.equal(report.candidateLimit, protocol.candidateLimit)
  assert.equal(report.discoveryPolicy, protocol.discoveryPolicy)
  assert.equal(report.frozenBeforeTerminalSampling, true)
  assert.equal(report.selectionUsesOutcomeFields, false)
  assert.equal(report.terminalOutcomeFieldsPersisted, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.roots.length, protocol.slots.length)
  const identities = new Set()
  const seeds = new Set()
  const maps = new Set()
  for (const [index, root] of report.roots.entries()) {
    const slot = protocol.slots[index]
    exactKeys(root, new Set([
      'seed', 'playerCount', 'seat', 'decisionIndex', 'turn', 'phase', 'subphase',
      'phaseBucket', 'actionFamily', 'mapDigest', 'publicProjectionDigest',
      'candidateSetDigest', 'rootIdentityDigest', 'candidateIds', 'candidateIntents', 'slotId',
    ]), `root ${slot.id}`)
    assert.equal(root.slotId, slot.id, `slot order drift at ${slot.id}`)
    assert.ok(matches(slot, root), `root does not match ${slot.id}`)
    assert.ok(protocol.collectionGames.some(
      (game) => game.seed === root.seed && game.playerCount === root.playerCount,
    ), `unfrozen game ${root.seed}/${root.playerCount}`)
    assert.ok(Number.isInteger(root.decisionIndex) && root.decisionIndex >= 0,
      `invalid decision index in ${slot.id}`)
    assert.ok(Number.isInteger(root.turn) && root.turn > 0, `invalid turn in ${slot.id}`)
    sha256(root.mapDigest, 'mapDigest')
    sha256(root.publicProjectionDigest, 'publicProjectionDigest')
    sha256(root.candidateSetDigest, 'candidateSetDigest')
    sha256(root.rootIdentityDigest, 'rootIdentityDigest')
    assert.ok(!identities.has(root.rootIdentityDigest), `duplicate root identity in ${slot.id}`)
    identities.add(root.rootIdentityDigest)
    assert.ok(Array.isArray(root.candidateIds) && root.candidateIds.length >= 2 &&
      root.candidateIds.length <= protocol.candidateLimit, `candidate count invalid in ${slot.id}`)
    assert.equal(new Set(root.candidateIds).size, root.candidateIds.length,
      `duplicate candidate in ${slot.id}`)
    seeds.add(root.seed)
    maps.add(root.mapDigest)
  }
  assert.ok(seeds.size >= protocol.minimumUniqueSeeds, 'insufficient seed diversity')
  assert.ok(maps.size >= protocol.minimumUniqueMaps, 'insufficient map diversity')
  for (const seed of seeds) {
    assert.ok(report.roots.filter((root) => root.seed === seed).length <= protocol.maximumRootsPerSeed,
      `seed cap exceeded for ${seed}`)
  }
  for (const map of maps) {
    assert.ok(report.roots.filter((root) => root.mapDigest === map).length <= protocol.maximumRootsPerMap,
      `map cap exceeded for ${map}`)
  }
  assert.deepEqual(report.summary, {
    roots: report.roots.length,
    twoPlayerRoots: report.roots.filter((root) => root.playerCount === 2).length,
    threePlayerRoots: report.roots.filter((root) => root.playerCount === 3).length,
    uniqueSeeds: seeds.size,
    uniqueMaps: maps.size,
    phaseBuckets: Object.fromEntries([...PHASE_BUCKETS].map((bucket) => [
      bucket, report.roots.filter((root) => root.phaseBucket === bucket).length,
    ])),
    actionFamilies: Object.fromEntries([...new Set(report.roots.map((root) => root.actionFamily))]
      .sort().map((family) => [
        family, report.roots.filter((root) => root.actionFamily === family).length,
      ])),
  }, 'report summary drift')
  return report.summary
}
