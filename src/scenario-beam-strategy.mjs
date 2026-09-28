import assert from 'node:assert/strict'

import { dispatchOpponentPolicy, validateOpponentPopulation } from './opponent-population.mjs'
import { scorePublicPositionOutcome } from './official-rollout.mjs'
import { selectWithScenarioBeam } from './scenario-beam.mjs'
import { deterministicStrategy } from './strategy.mjs'

/**
 * Production adapter for the generic beam contract. The population supplies
 * versioned opponent policy implementations; the caller supplies a calibrated
 * public belief and common-random-number seed block.
 */
export async function scenarioBeamStrategy(view, {
  env,
  belief,
  population,
  sampleSeeds,
  seat = view.state.mySeat,
  memory = null,
  profile = 'balanced',
  beamBudget = {},
  now,
} = {}) {
  assert.ok(env, 'official environment is required')
  const validatedPopulation = validateOpponentPopulation(population)
  const models = new Map(validatedPopulation.models.map((model) => [model.modelId, model]))
  const staticResult = deterministicStrategy(view, { memory, profile })
  const result = await selectWithScenarioBeam({
    env,
    seat,
    view,
    belief,
    sampleSeeds,
    rankedCandidates: staticResult.ranked,
    rankOwnCandidates: (futureView) => deterministicStrategy(futureView, {
      memory,
      profile,
    }).ranked,
    opponentPolicy: ({ modelId, view: opponentView, seed }) => {
      const model = models.get(modelId)
      assert.ok(model, `belief references missing population model ${modelId}`)
      return dispatchOpponentPolicy(model, { legalView: opponentView, seed })
    },
    scoreOutcome: (after) => scorePublicPositionOutcome(after, { seat, profile }),
    budget: beamBudget,
    ...(now == null ? {} : { now }),
  })
  return { ...result, staticSelected: staticResult.selected }
}
