import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { seededPolicyRandom } from './baselines.mjs'

export const RHEA_VERSION = 'fcm.rhea.v1'

const DEFAULT_BUDGET = Object.freeze({
  populationSize: 8,
  eliteCount: 2,
  generations: 4,
  horizonLength: 3,
  geneCardinality: 3,
  maxEvaluations: 64,
  deadlineMs: 1000,
})

function normalizeBudget(raw = {}) {
  const budget = { ...DEFAULT_BUDGET, ...raw }
  for (const key of [
    'populationSize', 'eliteCount', 'generations', 'horizonLength',
    'geneCardinality', 'maxEvaluations',
  ]) assert.ok(Number.isSafeInteger(budget[key]) && budget[key] > 0,
    `${key} must be a positive integer`)
  assert.ok(budget.eliteCount < budget.populationSize,
    'eliteCount must be smaller than populationSize')
  assert.ok(Number.isFinite(budget.deadlineMs) && budget.deadlineMs > 0,
    'deadlineMs must be positive')
  return budget
}

function validateCandidate(candidate, label) {
  assert.ok(candidate && typeof candidate === 'object', `${label} must be an object`)
  assert.match(candidate.id, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, `${label} has invalid id`)
  assert.ok(Array.isArray(candidate.actions) && candidate.actions.length > 0,
    `${label} has no actions`)
}

function genomeKey(genome) {
  return genome.join(':')
}

function compareGenome(left, right) {
  if (left.meanScore !== right.meanScore) return right.meanScore - left.meanScore
  for (let index = 0; index < left.genome.length; index += 1) {
    if (left.genome[index] !== right.genome[index]) {
      return left.genome[index] - right.genome[index]
    }
  }
  return 0
}

function initialPopulation(rootCount, budget) {
  return Array.from({ length: budget.populationSize }, (_, index) => {
    const group = Math.floor(index / rootCount)
    return Array.from({ length: budget.horizonLength }, (_unused, gene) => (
      gene === 0 ? index % rootCount : (group + gene - 1) % budget.geneCardinality
    ))
  })
}

function mutatePopulation(elites, rootCount, budget, random) {
  const next = elites.map((item) => [...item.genome])
  while (next.length < budget.populationSize) {
    const parent = elites[Math.floor(random() * elites.length)].genome
    const child = [...parent]
    const gene = Math.floor(random() * budget.horizonLength)
    const cardinality = gene === 0 ? rootCount : budget.geneCardinality
    if (gene === 0) {
      child[0] = Math.floor(random() * rootCount)
    } else {
      const offset = 1 + Math.floor(random() * Math.max(1, cardinality - 1))
      child[gene] = (child[gene] + offset) % cardinality
    }
    next.push(child)
  }
  return next
}

export async function selectWithRhea({
  rankedCandidates,
  sampleSeeds,
  evolutionSeed,
  evaluateGenome,
  budget: rawBudget = {},
  now = () => performance.now(),
}) {
  assert.ok(Array.isArray(rankedCandidates) && rankedCandidates.length > 0,
    'at least one ranked candidate is required')
  rankedCandidates.forEach((candidate, index) => validateCandidate(candidate, `root[${index}]`))
  assert.ok(Array.isArray(sampleSeeds) && sampleSeeds.length >= 2,
    'at least two common belief samples are required')
  assert.equal(new Set(sampleSeeds).size, sampleSeeds.length, 'sample seeds must be unique')
  assert.match(evolutionSeed, /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/,
    'evolutionSeed must be stable')
  assert.equal(typeof evaluateGenome, 'function', 'evaluateGenome is required')
  const budget = normalizeBudget(rawBudget)
  const started = now()
  const deadline = started + budget.deadlineMs
  const random = seededPolicyRandom(evolutionSeed)
  const failures = []
  const cache = new Map()
  let population = initialPopulation(rankedCandidates.length, budget)
  let evaluations = 0
  let completedGenerations = 0
  let stopReason = 'complete'
  let best = null

  async function evaluate(genome) {
    const key = genomeKey(genome)
    if (cache.has(key)) return cache.get(key)
    const scenarios = []
    for (const sampleSeed of sampleSeeds) {
      if (now() >= deadline) {
        stopReason = 'deadline'
        return null
      }
      if (evaluations >= budget.maxEvaluations) {
        stopReason = 'evaluation-budget'
        return null
      }
      try {
        const outcome = await evaluateGenome({ genome: [...genome], sampleSeed })
        assert.ok(Number.isFinite(outcome?.score), 'genome score must be finite')
        scenarios.push({ sampleSeed, score: outcome.score, trace: outcome.trace ?? [] })
        evaluations += 1
      } catch (error) {
        failures.push({
          genome: [...genome], sampleSeed,
          code: error.code ?? 'ERROR', message: error.message,
        })
        stopReason = 'scenario-failure'
        return null
      }
    }
    const result = {
      genome: [...genome],
      meanScore: scenarios.reduce((sum, item) => sum + item.score, 0) / scenarios.length,
      scenarios,
    }
    cache.set(key, result)
    return result
  }

  for (let generation = 0; generation < budget.generations; generation += 1) {
    const evaluated = []
    for (const genome of population) {
      const item = await evaluate(genome)
      if (!item) break
      evaluated.push(item)
    }
    if (evaluated.length !== population.length) break
    evaluated.sort(compareGenome)
    completedGenerations += 1
    if (!best || compareGenome(evaluated[0], best) < 0) best = evaluated[0]
    if (generation + 1 < budget.generations) {
      population = mutatePopulation(
        evaluated.slice(0, budget.eliteCount), rankedCandidates.length, budget, random,
      )
    }
  }

  const fallbackUsed = best == null
  const evaluated = [...cache.values()].sort(compareGenome).map((item) => ({
    genome: [...item.genome],
    meanScore: item.meanScore,
    scenarioCount: item.scenarios.length,
  }))
  return {
    schemaVersion: RHEA_VERSION,
    selected: fallbackUsed ? rankedCandidates[0] : rankedCandidates[best.genome[0]],
    bestGenome: fallbackUsed ? null : best.genome,
    bestMeanScore: fallbackUsed ? null : best.meanScore,
    scenarios: fallbackUsed ? [] : best.scenarios,
    evaluated,
    failures,
    metrics: {
      fallbackUsed,
      stopReason: fallbackUsed ? stopReason : (stopReason === 'complete' ? 'complete' : stopReason),
      completedGenerations,
      uniqueGenomesEvaluated: cache.size,
      scenarioEvaluations: evaluations,
      elapsedMs: Math.max(0, now() - started),
      budget,
    },
  }
}
