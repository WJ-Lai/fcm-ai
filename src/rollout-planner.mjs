import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const DEFAULT_BUDGET = Object.freeze({
  maxCandidates: 6,
  maxTransitions: 24,
  deadlineMs: 3000,
})

export function prefilterDiverseCandidates(rankedCandidates, { limit = 6 } = {}) {
  assert.ok(Number.isInteger(limit) && limit > 0, 'candidate limit must be positive')
  const selected = []
  const ids = new Set()
  const intents = new Set()
  for (const candidate of rankedCandidates) {
    if (selected.length >= limit) break
    if (intents.has(candidate.intent)) continue
    selected.push(candidate)
    ids.add(candidate.id)
    intents.add(candidate.intent)
  }
  for (const candidate of rankedCandidates) {
    if (selected.length >= limit) break
    if (ids.has(candidate.id)) continue
    selected.push(candidate)
    ids.add(candidate.id)
  }
  return selected
}

function normalizedBudget(budget = {}) {
  const result = { ...DEFAULT_BUDGET, ...budget }
  for (const key of ['maxCandidates', 'maxTransitions', 'deadlineMs']) {
    assert.ok(Number.isFinite(result[key]) && result[key] > 0, `${key} must be positive`)
  }
  result.maxCandidates = Math.floor(result.maxCandidates)
  result.maxTransitions = Math.floor(result.maxTransitions)
  return result
}

/**
 * Compare pre-ranked legal candidates through isolated official environment clones.
 * The caller owns consequence scoring and optional public-information continuation.
 */
export async function selectWithOfficialRollouts({
  env,
  seat,
  view,
  rankedCandidates,
  scoreOutcome,
  continueRollout = null,
  budget = {},
  now = () => performance.now(),
}) {
  assert.ok(env?.clone, 'official cloneable environment is required')
  assert.ok(Number.isInteger(seat) && seat >= 0, 'seat must be non-negative')
  assert.ok(rankedCandidates?.length, 'at least one ranked legal candidate is required')
  assert.equal(typeof scoreOutcome, 'function', 'scoreOutcome is required')
  const limits = normalizedBudget(budget)
  const started = now()
  const deadline = started + limits.deadlineMs
  const candidates = prefilterDiverseCandidates(rankedCandidates, { limit: limits.maxCandidates })
  const evaluated = []
  const failures = []
  let officialTransitions = 0
  let stopReason = 'complete'

  for (const candidate of candidates) {
    if (now() >= deadline) {
      stopReason = 'deadline'
      break
    }
    if (officialTransitions >= limits.maxTransitions) {
      stopReason = 'transition-budget'
      break
    }
    const clone = env.clone()
    try {
      await clone.step(seat, candidate.actions)
      officialTransitions += 1
      let continuation = null
      if (
        !view.legalActions?.isSimulPhase &&
        continueRollout &&
        officialTransitions < limits.maxTransitions
      ) {
        continuation = await continueRollout({
          env: clone,
          seat,
          candidate,
          remainingTransitions: limits.maxTransitions - officialTransitions,
          deadline,
          now,
        })
        const used = continuation?.transitions ?? 0
        assert.ok(Number.isInteger(used) && used >= 0, 'continuation transitions must be non-negative')
        assert.ok(
          used <= limits.maxTransitions - officialTransitions,
          'continuation exceeded its transition budget',
        )
        officialTransitions += used
        if (now() >= deadline) {
          stopReason = 'deadline'
          break
        }
      }
      const after = await clone.observe(seat)
      const outcomeScore = scoreOutcome(after, { candidate, continuation })
      assert.ok(Number.isFinite(outcomeScore), 'rollout outcome score must be finite')
      evaluated.push({ candidate, outcomeScore, continuation })
    } catch (error) {
      failures.push({
        candidateId: candidate.id,
        code: error.code ?? 'ERROR',
        message: error.message,
      })
    }
  }

  if (stopReason === 'complete' && evaluated.length < candidates.length) {
    stopReason = officialTransitions >= limits.maxTransitions ? 'transition-budget' : 'incomplete'
  }
  // `evaluated` follows the original static rank. Preserve that ordering on
  // equal consequences so shallow/unresolved rollouts cannot introduce an
  // arbitrary candidate-id preference.
  const bestEvaluated = evaluated.reduce((best, current) => (
    !best || current.outcomeScore > best.outcomeScore ? current : best
  ), null)
  const fallbackUsed = stopReason === 'deadline' || !bestEvaluated
  return {
    selected: fallbackUsed ? rankedCandidates[0] : bestEvaluated.candidate,
    evaluated,
    failures,
    metrics: {
      offeredCandidates: rankedCandidates.length,
      rolloutCandidates: candidates.length,
      evaluatedCandidates: evaluated.length,
      officialTransitions,
      elapsedMs: Math.max(0, now() - started),
      stopReason,
      fallbackUsed,
    },
  }
}
