import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildOpponentBelief } from './opponent-population.mjs'
import {
  normalizeRheaOpponentBeliefs,
  sampleRheaOpponentModels,
} from './rhea-strategy.mjs'

const populationUrl = new URL('../fixtures/opponent-population-v1/manifest.json', import.meta.url)

function view(players) {
  return { state: { players: Array.from({ length: players }, (_, index) => ({ index })) } }
}

function evidence(seat, marker) {
  return {
    observed: {
      publicHistoryDigest: `sha256:${marker.repeat(64)}`,
      turn: 3,
      seat,
      publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: { confidence: 'medium', sampleCount: 10, outOfDistribution: false },
  }
}

test('two-player RHEA keeps the backward-compatible single-opponent belief', async () => {
  const population = JSON.parse(await readFile(populationUrl, 'utf8'))
  const belief = buildOpponentBelief(population, evidence(1, 'a'))
  const normalized = normalizeRheaOpponentBeliefs({ view: view(2), seat: 0, belief })
  assert.deepEqual([...normalized.keys()], [1])
  const bySeat = normalizeRheaOpponentBeliefs({
    view: view(2), seat: 0, beliefBySeat: { 1: belief },
  })
  assert.deepEqual([...bySeat.keys()], [1])
})

test('multiplayer RHEA requires exactly one seat-safe belief for every opponent', async () => {
  const population = JSON.parse(await readFile(populationUrl, 'utf8'))
  const seat1 = buildOpponentBelief(population, evidence(1, 'b'))
  const seat2 = buildOpponentBelief(population, evidence(2, 'c'))
  assert.throws(() => normalizeRheaOpponentBeliefs({
    view: view(3), seat: 0, belief: seat1,
  }), /requires beliefBySeat/)
  assert.throws(() => normalizeRheaOpponentBeliefs({
    view: view(3), seat: 0, beliefBySeat: { 1: seat1 },
  }), /cover exactly every opponent/)
  assert.throws(() => normalizeRheaOpponentBeliefs({
    view: view(3), seat: 0, beliefBySeat: { 1: seat1, 2: seat2, 3: seat1 },
  }), /cover exactly every opponent/)
  const normalized = normalizeRheaOpponentBeliefs({
    view: view(3), seat: 0, beliefBySeat: { 1: seat1, 2: seat2 },
  })
  assert.deepEqual([...normalized.keys()], [1, 2])
})

test('common random stream derives independent reproducible samples by opponent seat', async () => {
  const population = JSON.parse(await readFile(populationUrl, 'utf8'))
  const beliefsBySeat = normalizeRheaOpponentBeliefs({
    view: view(3),
    seat: 0,
    beliefBySeat: {
      1: buildOpponentBelief(population, evidence(1, 'd')),
      2: buildOpponentBelief(population, evidence(2, 'e')),
    },
  })
  const first = sampleRheaOpponentModels({ beliefsBySeat, population, sampleSeed: 'stream-0' })
  const second = sampleRheaOpponentModels({ beliefsBySeat, population, sampleSeed: 'stream-0' })
  assert.deepEqual([...first].map(([seat, model]) => [seat, model.modelId]),
    [...second].map(([seat, model]) => [seat, model.modelId]))
  assert.deepEqual([...first.keys()], [1, 2])
  const wrongPopulation = new Map([[1, {
    ...beliefsBySeat.get(1), populationId: 'different-population-v1',
  }]])
  assert.throws(() => sampleRheaOpponentModels({
    beliefsBySeat: wrongPopulation, population, sampleSeed: 'stream-0',
  }), /population differs/)
})
