import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const AXES = new Set([
  'long-horizon', 'reactive', 'tactical', 'abstraction', 'information-set', 'leaf-cutoff',
])
const LEGALITY = new Set(['legal', 'illegal'])
const FEASIBILITY = new Set(['feasible', 'infeasible', 'unknown'])
const DESIRABILITY = new Set(['preferred', 'acceptable', 'trap', 'forbidden', 'unscored'])
const REQUIRED_TAGS = new Set([
  'delayed-activation', 'salary-runway', 'demand-donation', 'expiring-opportunity',
  'attractive-bait', 'restaurant-blocking', 'sequential-inventory', 'milestone-closure',
  'hidden-state-invariance', 'leaf-cutoff',
])
const PRIVATE_POLICY_KEYS = new Set([
  'reserveCards', 'chosenResCard', 'preMoveData', 'moveData', 'context', 'hiddenState',
])

function assertPlainRecord(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
}

function collectKeys(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, result)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      result.push(key)
      collectKeys(item, result)
    }
  }
  return result
}

export function validateStrategyFixtureManifest(manifest) {
  assertPlainRecord(manifest, 'manifest')
  assert.equal(manifest.schemaVersion, 'fcm.strategy-fixtures.v1')
  assert.equal(manifest.policyIndependent, true)
  assert.match(manifest.frozenAt, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(Array.isArray(manifest.cases) && manifest.cases.length >= 10, 'at least ten cases required')

  const ids = new Set()
  const coveredAxes = new Set()
  const coveredTags = new Set()
  const workingSubphases = new Set()
  const abstractionPairs = new Map()
  const metamorphicPairs = new Map()
  for (const fixture of manifest.cases) {
    assert.match(fixture.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.equal(ids.has(fixture.id), false, `duplicate fixture id ${fixture.id}`)
    ids.add(fixture.id)
    assert.ok(AXES.has(fixture.axis), `unknown fixture axis ${fixture.axis}`)
    coveredAxes.add(fixture.axis)
    assert.ok(Array.isArray(fixture.tags) && fixture.tags.length > 0, `${fixture.id} needs tags`)
    fixture.tags.forEach((tag) => coveredTags.add(tag))

    assertPlainRecord(fixture.source, `${fixture.id}.source`)
    assert.match(fixture.source.path, /^fixtures\/base-v1\/[a-z0-9-]+\.json$/)
    assert.match(fixture.source.sha256, /^[a-f0-9]{64}$/)
    assert.ok(Number.isInteger(fixture.source.seat) && fixture.source.seat >= 0)
    if (fixture.source.phase === 5) workingSubphases.add(fixture.source.subphase)

    assertPlainRecord(fixture.policyInput, `${fixture.id}.policyInput`)
    for (const category of ['observed', 'derived', 'believed']) {
      assert.ok(Array.isArray(fixture.policyInput[category]), `${fixture.id} lacks ${category} facts`)
    }
    const leaked = collectKeys(fixture.policyInput).filter((key) => PRIVATE_POLICY_KEYS.has(key))
    assert.deepEqual(leaked, [], `${fixture.id} leaks private policy keys`)

    assert.ok(Array.isArray(fixture.candidates) && fixture.candidates.length >= 2)
    const candidateIds = new Set()
    let preferred = 0
    for (const candidate of fixture.candidates) {
      assert.match(candidate.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      assert.equal(candidateIds.has(candidate.id), false, `${fixture.id} duplicates candidate id`)
      candidateIds.add(candidate.id)
      assert.ok(LEGALITY.has(candidate.legality))
      assert.ok(FEASIBILITY.has(candidate.feasibility))
      assert.ok(DESIRABILITY.has(candidate.desirability))
      if (candidate.desirability === 'preferred') {
        preferred += 1
        assert.equal(candidate.legality, 'legal', 'preferred candidate must be legal')
        assert.equal(candidate.feasibility, 'feasible', 'preferred candidate must be feasible')
      }
    }
    assert.equal(preferred, 1, `${fixture.id} must freeze exactly one preferred candidate`)
    assert.ok(candidateIds.has(fixture.expected.preferredCandidate))
    assert.equal(
      fixture.candidates.find((candidate) => candidate.id === fixture.expected.preferredCandidate)
        .desirability,
      'preferred',
    )
    if (fixture.abstractionProbe) {
      const pair = abstractionPairs.get(fixture.abstractionProbe.pairId) ?? []
      pair.push(fixture)
      abstractionPairs.set(fixture.abstractionProbe.pairId, pair)
    }
    if (fixture.metamorphicProbe) {
      const pair = metamorphicPairs.get(fixture.metamorphicProbe.pairId) ?? []
      pair.push(fixture)
      metamorphicPairs.set(fixture.metamorphicProbe.pairId, pair)
    }
  }

  assert.deepEqual(coveredAxes, AXES, 'fixture axes are incomplete')
  assert.ok(workingSubphases.size >= 3, 'fewer than three working-day subphases')
  for (const tag of REQUIRED_TAGS) assert.ok(coveredTags.has(tag), `missing fixture tag ${tag}`)
  for (const [pairId, pair] of abstractionPairs) {
    assert.equal(pair.length, 2, `abstraction pair ${pairId} must have two cases`)
    assert.notEqual(
      pair[0].expected.preferredCandidate,
      pair[1].expected.preferredCandidate,
      `abstraction pair ${pairId} must require different preferences`,
    )
    assert.ok(pair.every((fixture) => fixture.abstractionProbe.distinctionFields.length > 0))
  }
  for (const [pairId, pair] of metamorphicPairs) {
    assert.equal(pair.length, 2, `metamorphic pair ${pairId} must have two cases`)
    assert.deepEqual(pair[0].policyInput, pair[1].policyInput)
    assert.equal(pair[0].expected.preferredCandidate, pair[1].expected.preferredCandidate)
    assert.notDeepEqual(pair[0].testOnlyMutation, pair[1].testOnlyMutation)
  }
  return manifest
}

export async function loadStrategyFixtureManifest(filePath) {
  const absoluteManifest = path.resolve(filePath)
  const root = path.resolve(path.dirname(absoluteManifest), '..', '..')
  const manifest = validateStrategyFixtureManifest(JSON.parse(await readFile(absoluteManifest, 'utf8')))
  for (const fixture of manifest.cases) {
    const sourcePath = path.resolve(root, fixture.source.path)
    assert.equal(path.relative(root, sourcePath).startsWith('..'), false, 'source escapes repository')
    const digest = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
    assert.equal(digest, fixture.source.sha256, `${fixture.id} source fixture changed`)
  }
  return manifest
}
