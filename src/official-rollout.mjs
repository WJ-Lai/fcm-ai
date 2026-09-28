import assert from 'node:assert/strict'

import { safeFirstLegal } from './baselines.mjs'
import { selectWithOfficialRollouts } from './rollout-planner.mjs'
import { deterministicStrategy, evaluatePosition } from './strategy.mjs'

/**
 * Advance only decisions that belong to the same seat and are visible in that
 * seat's own DecisionView. Never inspect another seat or resolve an unknown
 * simultaneous choice.
 */
export async function continueOwnPublicTurn({
  env,
  seat,
  remainingTransitions,
  deadline,
  now,
}) {
  assert.ok(Number.isInteger(remainingTransitions) && remainingTransitions >= 0)
  let transitions = 0
  let stopReason = 'transition-budget'

  while (transitions < remainingTransitions) {
    if (now() >= deadline) {
      stopReason = 'deadline'
      break
    }
    const snapshot = env.snapshot()
    if (snapshot.phase === 10) {
      stopReason = 'game-over'
      break
    }
    const pendingName = snapshot.currentPlayers?.[0]
    const pendingSeat = snapshot.playerNames?.indexOf(pendingName) ?? -1
    if (pendingSeat !== seat) {
      stopReason = 'other-player'
      break
    }
    const view = await env.observe(seat)
    if (view.legalActions?.isSimulPhase) {
      stopReason = 'unresolved-simultaneous'
      break
    }
    assert.equal(view.legalActions?.yourTurn, true, 'pending seat has no advertised turn')
    await env.step(seat, safeFirstLegal(view))
    transitions += 1
  }

  return { transitions, stopReason }
}

/** Score only public fields plus the acting seat's own private state. */
export function explainPublicPositionOutcome(
  view,
  { seat = view.state.mySeat, profile = 'balanced' } = {},
) {
  const position = evaluatePosition(view, { seat, profile })
  const me = view.state.players[seat]
  const opponentMoney = view.state.players
    .filter((player) => player.index !== seat)
    .map((player) => player.money ?? 0)
  const publicCashLead = opponentMoney.length
    ? (me.money ?? 0) - Math.max(...opponentMoney)
    : 0
  const breakdown = { ...position.breakdown, publicCashLead: publicCashLead * 0.25 }
  return {
    score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    breakdown,
  }
}

/** Preserve the scalar interface used by bounded rollout selection. */
export function scorePublicPositionOutcome(view, options = {}) {
  return explainPublicPositionOutcome(view, options).score
}

/** Static pre-ranking plus bounded consequence checks in official engine clones. */
export async function officialRolloutStrategy(view, { env, seat = view.state.mySeat, ...options } = {}) {
  const staticResult = deterministicStrategy(view, options)
  const rollout = await selectWithOfficialRollouts({
    env,
    seat,
    view,
    rankedCandidates: staticResult.ranked,
    scoreOutcome: (after) => scorePublicPositionOutcome(after, { seat }),
    continueRollout: continueOwnPublicTurn,
    budget: options.rolloutBudget,
    now: options.now,
  })
  return { ...rollout, staticSelected: staticResult.selected }
}
