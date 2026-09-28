import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const STRATEGIC_ABSTRACTION_VERSION = 'fcm.strategic-abstraction.v1'

function defined(value) {
  return value === undefined ? null : value
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return defined(value)
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value))
}

function sortedScalars(values) {
  return [...(values ?? [])].sort((left, right) => (
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
  ))
}

function sortedRecords(values, key = null) {
  return [...(values ?? [])].map(canonical).sort((left, right) => {
    if (key && left?.[key] != null && right?.[key] != null) {
      const leftValue = left[key]
      const rightValue = right[key]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue
      return String(leftValue).localeCompare(String(rightValue))
    }
    return canonicalJson(left).localeCompare(canonicalJson(right))
  })
}

function projectPlayer(player) {
  return {
    index: player.index,
    money: player.money,
    bankrupt: player.bankrupt,
    resources: sortedScalars(player.resources),
    employees: sortedScalars(player.employees),
    beach: sortedScalars(player.beach),
    ceoSlots: player.ceoSlots,
    restaurants: sortedScalars(player.restaurants),
    milestones: sortedScalars(player.milestones),
    marketers: sortedRecords(player.marketers),
    coffeeShops: sortedScalars(player.coffeeShops),
  }
}

function projectPlan(plan) {
  if (!plan) return null
  return canonical({
    planId: plan.planId,
    status: plan.status,
    currentTurn: plan.currentTurn,
    targetTurn: plan.targetTurn,
    deadlineTurn: plan.deadlineTurn,
    expectedValue: plan.expectedValue,
    confidence: plan.confidence,
    goal: plan.goal,
    analysis: plan.analysis,
    capabilities: sortedRecords(plan.capabilities, 'capabilityId'),
    commitments: sortedRecords(plan.commitments, 'commitmentId'),
    assumptions: sortedRecords(plan.assumptions, 'assumptionId'),
    repairOptions: sortedRecords(plan.repairOptions, 'repairId'),
    fallbackPlanIds: sortedScalars(plan.fallbackPlanIds),
    activeRepairId: plan.activeRepairId,
    invalidationRules: sortedRecords(plan.invalidationRules, 'ruleId'),
  })
}

/**
 * Conservative seat-visible policy projection. It deliberately retains the complete public board,
 * economy and threat structures until held-out collision audits justify a smaller abstraction.
 */
export function strategicProjection({ view, plan = null }) {
  assert.ok(view?.state && view?.legalActions, 'seat-visible DecisionView is required')
  const state = view.state
  return canonical({
    abstractionVersion: STRATEGIC_ABSTRACTION_VERSION,
    phase: state.phase,
    subphase: state.subphase,
    turn: state.turn,
    bank: state.bank,
    bankBroken: state.bankBroken,
    mySeat: state.mySeat,
    turnOrder: state.turnOrder,
    newTurnOrder: state.newTurnOrder,
    fullTurnOrder: state.fullTurnOrder,
    players: [...(state.players ?? [])].map(projectPlayer)
      .sort((left, right) => left.index - right.index),
    availableEmployees: state.availableEmployees,
    houseDemands: sortedRecords(state.houseDemands, 'house'),
    activeCampaigns: sortedRecords(state.activeCampaigns),
    availableMilestones: sortedScalars(state.availableMilestones),
    availableMarketingCampaigns: sortedRecords(state.availableMarketingCampaigns),
    board: state.board,
    decisionSupport: state.decisionSupport,
    startingOptions: state.startingOptions,
    catalog: state.catalog,
    legalActions: view.legalActions,
    strategicPlan: projectPlan(plan),
  })
}

export function strategicProjectionDigest(input) {
  return `sha256:${createHash('sha256').update(canonicalJson(strategicProjection(input))).digest('hex')}`
}

function requiredText(value, label) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 128,
    `${label} is required`)
  return value
}

/** Trusted-local cache identity; callers must obtain snapshotDigest from the official engine. */
export function trustedPlannerCacheKey({
  view,
  plan = null,
  rulesetHash,
  snapshotDigest,
  seat,
  candidateId,
  horizon,
  evaluatorVersion,
  beliefVersion,
}) {
  requiredText(rulesetHash, 'rulesetHash')
  assert.match(snapshotDigest, /^sha256:[a-f0-9]{64}$/, 'snapshotDigest must be a sha256 digest')
  assert.ok(Number.isInteger(seat) && seat >= 0, 'seat must be non-negative')
  requiredText(candidateId, 'candidateId')
  assert.ok(Number.isInteger(horizon) && horizon > 0 && horizon <= 64,
    'horizon must be between 1 and 64')
  requiredText(evaluatorVersion, 'evaluatorVersion')
  requiredText(beliefVersion, 'beliefVersion')
  const identity = {
    abstractionVersion: STRATEGIC_ABSTRACTION_VERSION,
    projectionDigest: strategicProjectionDigest({ view, plan }),
    rulesetHash,
    snapshotDigest,
    seat,
    candidateId,
    horizon,
    evaluatorVersion,
    beliefVersion,
  }
  return `sha256:${createHash('sha256').update(canonicalJson(identity)).digest('hex')}`
}
