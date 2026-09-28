#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildOpponentBelief,
  sampleOpponentModel,
  updateOpponentBelief,
  validateOpponentPopulation,
} from '../src/opponent-population.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const manifestPath = path.join(root, 'fixtures/opponent-population-v1/manifest.json')
const outputPath = path.join(root, 'fixtures/opponent-population-v1/audit.json')
const samples = 4096

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`
}

function distribution(belief, prefix) {
  const counts = Object.fromEntries(belief.believed.models.map((model) => [model.modelId, 0]))
  for (let index = 0; index < samples; index += 1) {
    counts[sampleOpponentModel(belief, `${prefix}-${index}`).modelId] += 1
  }
  return belief.believed.models.map((model) => ({
    modelId: model.modelId,
    expectedProbability: model.probability,
    observedCount: counts[model.modelId],
    observedProbability: counts[model.modelId] / samples,
    absoluteError: Math.abs(counts[model.modelId] / samples - model.probability),
  }))
}

const manifest = validateOpponentPopulation(JSON.parse(await readFile(manifestPath, 'utf8')))
const evidence = {
  observed: {
    publicHistoryDigest: `sha256:${'a'.repeat(64)}`,
    turn: 3,
    seat: 1,
    publicEvents: [{ type: 'hire', employee: 17 }],
  },
  derived: { actionFamilyCounts: { hire: 1 } },
  believed: { confidence: 'low', sampleCount: 1, outOfDistribution: false },
}
const prior = buildOpponentBelief(manifest, evidence)
const shifted = updateOpponentBelief(manifest, evidence, {
  updaterId: 'public-action-count-v1',
  sourcePublicHistoryDigest: evidence.observed.publicHistoryDigest,
  modelScores: { 'deterministic-balanced-v1': 1 },
})
const priorDistribution = distribution(prior, 'prior')
const shiftedDistribution = distribution(shifted, 'shifted')
const report = {
  schemaVersion: 'fcm.opponent-population-audit.v1',
  experimentId: 8,
  hypothesis: 'versioned-public-belief-sampler-is-reproducible-and-sensitive-to-explicit-public-updates',
  populationDigest: digest(manifest),
  populationId: manifest.populationId,
  modelCount: manifest.models.length,
  sampleCountPerCondition: samples,
  priorDistribution,
  shiftedDistribution,
  maximumAbsoluteSamplingError: Math.max(
    ...priorDistribution.map((item) => item.absoluteError),
    ...shiftedDistribution.map((item) => item.absoluteError),
  ),
  publicUpdateChangedDistribution: digest(prior.believed.models) !== digest(shifted.believed.models),
  promotionHoldoutOpened: false,
  interpretation: 'Mechanical sampler audit only; population weights are not yet empirically calibrated.',
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ output: outputPath, ...report }, null, 2))
