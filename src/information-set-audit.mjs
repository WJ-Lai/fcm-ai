import assert from 'node:assert/strict'

import { sampleOpponentModel, validateOpponentBelief } from './opponent-population.mjs'

export const INFORMATION_SET_AUDIT_VERSION = 'fcm.information-set-audit.v1'

function stableId(value, label) {
  assert.match(value, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} must be a stable id`)
}

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields differ`)
}

function validateCandidates(candidateIds, label) {
  assert.ok(Array.isArray(candidateIds) && candidateIds.length >= 2,
    `${label} needs at least two legal candidates`)
  const unique = new Set(candidateIds)
  assert.equal(unique.size, candidateIds.length, `${label} candidates must be unique`)
  candidateIds.forEach((candidateId) => stableId(candidateId, `${label} candidateId`))
  return [...candidateIds].sort()
}

function totalVariation(leftCounts, rightCounts, candidateIds, samples) {
  return candidateIds.reduce((sum, candidateId) => (
    sum + Math.abs((leftCounts[candidateId] ?? 0) / samples
      - (rightCounts[candidateId] ?? 0) / samples)
  ), 0) / 2
}

export async function auditInformationSetPolicy({
  worlds,
  belief,
  sampleSeeds,
  maximumTotalVariation,
  recommend,
}) {
  validateOpponentBelief(belief)
  assert.ok(Array.isArray(worlds) && worlds.length >= 2, 'at least two hidden worlds are required')
  assert.ok(Array.isArray(sampleSeeds) && sampleSeeds.length >= 2,
    'at least two sample seeds are required')
  assert.equal(new Set(sampleSeeds).size, sampleSeeds.length, 'sample seeds must be unique')
  sampleSeeds.forEach((seed) => stableId(seed, 'sample seed'))
  assert.ok(Number.isFinite(maximumTotalVariation)
    && maximumTotalVariation >= 0 && maximumTotalVariation <= 1,
  'maximumTotalVariation must be in [0, 1]')
  assert.equal(typeof recommend, 'function', 'recommend must be a function')

  const worldIds = new Set()
  let publicObservationDigest = null
  let legalCandidateIds = null
  for (const world of worlds) {
    exactKeys(world,
      new Set(['worldId', 'publicObservationDigest', 'legalCandidateIds', 'trustedWorld']),
      'world')
    stableId(world.worldId, 'worldId')
    assert.equal(worldIds.has(world.worldId), false, `duplicate worldId ${world.worldId}`)
    worldIds.add(world.worldId)
    assert.match(world.publicObservationDigest, /^sha256:[a-f0-9]{64}$/,
      'invalid public observation digest')
    const candidates = validateCandidates(world.legalCandidateIds, world.worldId)
    if (publicObservationDigest == null) publicObservationDigest = world.publicObservationDigest
    else assert.equal(world.publicObservationDigest, publicObservationDigest,
      'public observation digests differ')
    if (legalCandidateIds == null) legalCandidateIds = candidates
    else assert.deepEqual(candidates, legalCandidateIds, 'legal candidates differ across worlds')
  }

  const choicesByWorld = new Map(worlds.map((world) => [world.worldId, []]))
  const countsByWorld = new Map(worlds.map((world) => [
    world.worldId, Object.fromEntries(legalCandidateIds.map((candidateId) => [candidateId, 0])),
  ]))
  for (const seed of sampleSeeds) {
    const sampled = sampleOpponentModel(belief, seed)
    for (const world of worlds) {
      const recommendation = await recommend({
        trustedWorld: world.trustedWorld,
        publicObservationDigest,
        legalCandidateIds: [...legalCandidateIds],
        sampledOpponentModelId: sampled.modelId,
        seed,
      })
      exactKeys(recommendation, new Set(['candidateId']), 'recommendation')
      stableId(recommendation.candidateId, 'recommended candidateId')
      assert.ok(legalCandidateIds.includes(recommendation.candidateId),
        `illegal candidate ${recommendation.candidateId}`)
      choicesByWorld.get(world.worldId).push(recommendation.candidateId)
      countsByWorld.get(world.worldId)[recommendation.candidateId] += 1
    }
  }

  let mismatchedSeeds = 0
  const referenceChoices = choicesByWorld.get(worlds[0].worldId)
  for (let index = 0; index < sampleSeeds.length; index += 1) {
    if (worlds.slice(1).some((world) => (
      choicesByWorld.get(world.worldId)[index] !== referenceChoices[index]
    ))) mismatchedSeeds += 1
  }
  const pairwise = []
  for (let left = 0; left < worlds.length; left += 1) {
    for (let right = left + 1; right < worlds.length; right += 1) {
      pairwise.push({
        leftWorldId: worlds[left].worldId,
        rightWorldId: worlds[right].worldId,
        totalVariation: totalVariation(
          countsByWorld.get(worlds[left].worldId),
          countsByWorld.get(worlds[right].worldId),
          legalCandidateIds,
          sampleSeeds.length,
        ),
      })
    }
  }
  const maximumPairwiseTotalVariation = Math.max(...pairwise.map((item) => item.totalVariation))
  return {
    schemaVersion: INFORMATION_SET_AUDIT_VERSION,
    populationId: belief.populationId,
    publicObservationDigest,
    worldIds: worlds.map((world) => world.worldId),
    legalCandidateIds,
    samplesPerWorld: sampleSeeds.length,
    candidateCountsByWorld: Object.fromEntries(worlds.map((world) => [
      world.worldId, countsByWorld.get(world.worldId),
    ])),
    pairwise,
    maximumPairwiseTotalVariation,
    perSeedMismatchRate: mismatchedSeeds / sampleSeeds.length,
    maximumTotalVariation,
    passed: maximumPairwiseTotalVariation <= maximumTotalVariation
      && mismatchedSeeds === 0,
  }
}
