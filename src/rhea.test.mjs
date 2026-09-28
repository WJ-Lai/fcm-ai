import assert from 'node:assert/strict'
import test from 'node:test'

import { selectWithRhea } from './rhea.mjs'

const candidate = (id) => ({ id, actions: [{ type: id }] })
const roots = [candidate('static-root'), candidate('alternate-root')]
const beliefSeeds = ['rhea-belief-a', 'rhea-belief-b']

function request(overrides = {}) {
  return {
    rankedCandidates: roots,
    sampleSeeds: beliefSeeds,
    evolutionSeed: 'rhea-evolution-v1',
    evaluateGenome: async ({ genome }) => ({
      score: (genome[0] === 1 ? 10 : 0) + (genome[1] === 2 ? 4 : 0),
      trace: [...genome],
    }),
    budget: {
      populationSize: 9,
      eliteCount: 3,
      generations: 4,
      horizonLength: 3,
      geneCardinality: 3,
      maxEvaluations: 72,
      deadlineMs: 1000,
    },
    now: () => 0,
    ...overrides,
  }
}

test('RHEA reproducibly discovers and selects a stronger macro genome', async () => {
  const left = await selectWithRhea(request())
  const right = await selectWithRhea(request())
  assert.deepEqual(left, right)
  assert.equal(left.selected.id, 'alternate-root')
  assert.equal(left.bestGenome[0], 1)
  assert.equal(left.bestGenome[1], 2)
  assert.equal(left.metrics.fallbackUsed, false)
  assert.ok(left.metrics.completedGenerations >= 1)
})

test('equal genome values preserve static root order', async () => {
  const result = await selectWithRhea(request({
    evaluateGenome: async ({ genome }) => ({ score: 5, trace: [...genome] }),
  }))
  assert.equal(result.selected.id, 'static-root')
  assert.equal(result.bestGenome[0], 0)
})

test('a later generation evaluates a novel child when one-step genotype space remains', async () => {
  const result = await selectWithRhea(request({
    evolutionSeed: 'rhea-budget-evolution-v1',
    budget: {
      populationSize: 2,
      eliteCount: 1,
      generations: 2,
      horizonLength: 2,
      geneCardinality: 3,
      maxEvaluations: 8,
      deadlineMs: 1000,
    },
  }))
  assert.equal(result.metrics.completedGenerations, 2)
  assert.equal(result.metrics.uniqueGenomesEvaluated, 3)
  assert.equal(result.metrics.scenarioEvaluations, 6)
})

test('deadline and incomplete common-sample evaluation fail closed', async () => {
  let clock = 0
  const deadline = await selectWithRhea(request({ now: () => clock += 600 }))
  assert.equal(deadline.selected.id, 'static-root')
  assert.equal(deadline.metrics.fallbackUsed, true)
  assert.equal(deadline.metrics.stopReason, 'deadline')

  const failed = await selectWithRhea(request({
    evaluateGenome: async ({ genome, sampleSeed }) => {
      if (sampleSeed === beliefSeeds[1]) throw new Error('sample failed')
      return { score: genome[0], trace: [...genome] }
    },
  }))
  assert.equal(failed.selected.id, 'static-root')
  assert.equal(failed.metrics.fallbackUsed, true)
  assert.ok(failed.failures.length > 0)
})

test('malformed budgets and non-finite scores are rejected or fail closed', async () => {
  await assert.rejects(selectWithRhea(request({
    budget: { ...request().budget, eliteCount: 10 },
  })), /eliteCount/)
  const nonFinite = await selectWithRhea(request({
    evaluateGenome: async () => ({ score: Number.NaN, trace: [] }),
  }))
  assert.equal(nonFinite.metrics.fallbackUsed, true)
  assert.ok(nonFinite.failures.length > 0)
})
