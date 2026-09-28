import assert from 'node:assert/strict'

import { wilsonInterval } from './benchmark-stats.mjs'

function combination(n, k) {
  const bounded = Math.min(k, n - k)
  let result = 1
  for (let index = 1; index <= bounded; index += 1) {
    result = result * (n - bounded + index) / index
  }
  return result
}

export function exactTwoSidedSignPValue(positive, negative) {
  assert.ok(Number.isInteger(positive) && positive >= 0, 'positive signs must be non-negative')
  assert.ok(Number.isInteger(negative) && negative >= 0, 'negative signs must be non-negative')
  const samples = positive + negative
  if (samples === 0) return 1
  const tail = Math.min(positive, negative)
  let probability = 0
  for (let successes = 0; successes <= tail; successes += 1) {
    probability += combination(samples, successes) / (2 ** samples)
  }
  return Math.min(1, 2 * probability)
}

export function validatePairedSequentialProtocol(protocol) {
  assert.equal(protocol?.schemaVersion, 'fcm.paired-sequential-protocol.v1',
    'sequential protocol schema mismatch')
  assert.ok(Number.isFinite(protocol.overallAlpha) &&
    protocol.overallAlpha > 0 && protocol.overallAlpha < 1,
  'overall alpha must be between zero and one')
  assert.ok(Array.isArray(protocol.stages) && protocol.stages.length > 0,
    'sequential stages are required')
  let previousSamples = 0
  let spentAlpha = 0
  for (const stage of protocol.stages) {
    assert.ok(Number.isInteger(stage.samples) && stage.samples > previousSamples,
      'stage sample counts must strictly increase')
    assert.ok(Number.isFinite(stage.alpha) && stage.alpha > 0 && stage.alpha < 1,
      'stage alpha must be between zero and one')
    previousSamples = stage.samples
    spentAlpha += stage.alpha
  }
  assert.ok(spentAlpha <= protocol.overallAlpha + Number.EPSILON,
    'stage alpha budget exceeds overall alpha budget')
  return { stages: protocol.stages.length, maximumSamples: previousSamples, spentAlpha }
}

function rankUtility(margin) {
  if (margin > 0) return 1
  if (margin < 0) return 0
  return 0.5
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardError(values) {
  if (values.length < 2) return null
  const average = mean(values)
  const variance = values.reduce(
    (sum, value) => sum + ((value - average) ** 2),
    0,
  ) / (values.length - 1)
  return Math.sqrt(variance / values.length)
}

function validateRoot(root, minimumSamples) {
  assert.ok(typeof root?.rootId === 'string' && root.rootId, 'rootId is required')
  assert.ok(Array.isArray(root.candidates) && root.candidates.length >= 2,
    'at least two candidates are required')
  const candidateIds = new Set()
  let availableSamples = null
  for (const candidate of root.candidates) {
    assert.ok(typeof candidate.candidateId === 'string' && candidate.candidateId,
      'candidateId is required')
    assert.ok(!candidateIds.has(candidate.candidateId), 'candidate IDs must be unique')
    candidateIds.add(candidate.candidateId)
    assert.ok(Array.isArray(candidate.terminalMargins) &&
      candidate.terminalMargins.length >= minimumSamples &&
      candidate.terminalMargins.every(Number.isFinite),
    `candidate ${candidate.candidateId} needs finite terminal margins`)
    availableSamples ??= candidate.terminalMargins.length
    assert.equal(candidate.terminalMargins.length, availableSamples,
      'candidates must have equal paired sample counts')
  }
  return availableSamples
}

function compareCandidates(left, right, samples, alpha) {
  const marginAdvantages = []
  const rankLifts = []
  let positive = 0
  let negative = 0
  let ties = 0
  for (let sample = 0; sample < samples; sample += 1) {
    marginAdvantages.push(left.terminalMargins[sample] - right.terminalMargins[sample])
    const lift = rankUtility(left.terminalMargins[sample]) -
      rankUtility(right.terminalMargins[sample])
    rankLifts.push(lift)
    if (lift > 0) positive += 1
    else if (lift < 0) negative += 1
    else ties += 1
  }
  const pValue = exactTwoSidedSignPValue(positive, negative)
  const significant = pValue <= alpha && positive !== negative
  const winnerCandidateId = significant
    ? (positive > negative ? left.candidateId : right.candidateId)
    : null
  const decisiveSamples = positive + negative
  return {
    leftCandidateId: left.candidateId,
    rightCandidateId: right.candidateId,
    samples,
    positive,
    negative,
    ties,
    pValue,
    alpha,
    significant,
    winnerCandidateId,
    meanRankLift: mean(rankLifts),
    meanMarginAdvantage: mean(marginAdvantages),
    marginAdvantageStandardError: standardError(marginAdvantages),
    decisiveWinRate95CI: wilsonInterval(Math.max(positive, negative), decisiveSamples),
  }
}

export function evaluatePairedSequentialRoot(root, protocol) {
  const protocolSummary = validatePairedSequentialProtocol(protocol)
  const availableSamples = validateRoot(root, protocol.stages[0].samples)
  const comparisonCount = root.candidates.length * (root.candidates.length - 1) / 2
  const stageReachability = (stage) => {
    const comparisonAlpha = stage.alpha / comparisonCount
    const minimumPossiblePValue = 2 / (2 ** stage.samples)
    return {
      comparisonAlpha,
      minimumPossiblePValue,
      selectionReachable: minimumPossiblePValue <= comparisonAlpha,
    }
  }
  const stages = []
  for (const stage of protocol.stages) {
    if (stage.samples > availableSamples) break
    const reachability = stageReachability(stage)
    const { comparisonAlpha } = reachability
    const comparisons = []
    for (let leftIndex = 0; leftIndex < root.candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < root.candidates.length; rightIndex += 1) {
        comparisons.push(compareCandidates(
          root.candidates[leftIndex],
          root.candidates[rightIndex],
          stage.samples,
          comparisonAlpha,
        ))
      }
    }
    const wins = new Map(root.candidates.map((candidate) => [candidate.candidateId, 0]))
    for (const comparison of comparisons) {
      if (comparison.winnerCandidateId) {
        wins.set(comparison.winnerCandidateId, wins.get(comparison.winnerCandidateId) + 1)
      }
    }
    const stageWinners = [...wins.entries()]
      .filter(([, count]) => count === root.candidates.length - 1)
      .map(([candidateId]) => candidateId)
    const selectedCandidateId = reachability.selectionReachable && stageWinners.length === 1
      ? stageWinners[0]
      : null
    stages.push({
      samples: stage.samples,
      stageAlpha: stage.alpha,
      ...reachability,
      selectedCandidateId,
      comparisons,
    })
    if (selectedCandidateId) {
      return {
        rootId: root.rootId,
        availableSamples,
        status: 'selected',
        selectedCandidateId,
        stopSamples: stage.samples,
        nextSamples: null,
        stages,
      }
    }
  }

  const maximumSamples = protocolSummary.maximumSamples
  const exhausted = availableSamples >= maximumSamples
  const nextReachableStage = protocol.stages.find(
    (stage) => stage.samples > availableSamples && stageReachability(stage).selectionReachable,
  )
  const unreachableProtocol = !exhausted && !nextReachableStage
  return {
    rootId: root.rootId,
    availableSamples,
    status: exhausted
      ? 'abstain-max-samples'
      : (unreachableProtocol ? 'abstain-unreachable-protocol' : 'needs-more-samples'),
    selectedCandidateId: null,
    stopSamples: exhausted ? maximumSamples : null,
    nextSamples: exhausted || unreachableProtocol ? null : nextReachableStage.samples,
    stages,
  }
}

export function auditPairedSequentialDataset(dataset, protocol) {
  assert.ok(Array.isArray(dataset?.roots) && dataset.roots.length > 0, 'dataset roots are required')
  const details = dataset.roots.map((root) => evaluatePairedSequentialRoot(root, protocol))
  const selectedRoots = details.filter((detail) => detail.status === 'selected').length
  const abstainedRoots = details.filter((detail) => detail.status.startsWith('abstain-')).length
  const needsMoreSamplesRoots = details.filter(
    (detail) => detail.status === 'needs-more-samples',
  ).length
  return {
    schemaVersion: 'fcm.paired-sequential-audit.v1',
    roots: details.length,
    selectedRoots,
    abstainedRoots,
    needsMoreSamplesRoots,
    coverage: selectedRoots / details.length,
    details,
  }
}
