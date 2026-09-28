import { performance } from 'node:perf_hooks'

import { spatialConsequenceSignature } from './spatial-consequence.mjs'

const SPATIAL_ACTIONS = new Set(['build_house', 'open_restaurant'])

/** Execute bounded spatial candidates on isolated official-engine clones. */
export async function evaluateSpatialCandidates({ environment, seat, beforeView, candidates }) {
  if (beforeView?.state?.mySeat !== seat) throw new Error('seat does not match the before view')
  const labels = []
  for (const candidate of candidates) {
    const spatialCount = candidate.actions.filter((action) => SPATIAL_ACTIONS.has(action.type)).length
    if (spatialCount !== 1) continue
    const clone = environment.clone()
    const started = performance.now()
    await clone.step(seat, candidate.actions)
    const afterView = await clone.observe(seat)
    const consequence = spatialConsequenceSignature(beforeView, afterView, candidate.actions)
    labels.push({
      candidateId: candidate.id,
      consequence,
      evaluationMs: performance.now() - started,
    })
  }
  return labels
}
