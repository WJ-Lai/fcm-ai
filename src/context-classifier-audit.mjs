import assert from 'node:assert/strict'

import { exactTwoSidedSignPValue } from './paired-sequential-estimator.mjs'

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function summarizeClass(details) {
  const alternatePositiveRoots = details.filter(
    (entry) => entry.sign === 'alternate-positive').length
  const staticPositiveRoots = details.filter(
    (entry) => entry.sign === 'static-positive').length
  const tiedRoots = details.length - alternatePositiveRoots - staticPositiveRoots
  const decisiveRoots = alternatePositiveRoots + staticPositiveRoots
  return {
    roots: details.length,
    alternatePositiveRoots,
    staticPositiveRoots,
    tiedRoots,
    decisiveRoots,
    twoSidedExactSignPValue: exactTwoSidedSignPValue(
      alternatePositiveRoots, staticPositiveRoots),
  }
}

export function auditContextClassifier(roots, classifier) {
  assert.ok(Array.isArray(roots) && roots.length > 0, 'roots are required')
  const validation = classifier?.validation
  const requiredSamples = validation?.pairedContinuationSamplesPerRoot
  assert.ok(Number.isInteger(requiredSamples) && requiredSamples > 0,
    'paired continuation sample count must be positive')
  assert.ok(Number.isInteger(validation.minimumMatchedRoots)
    && validation.minimumMatchedRoots > 0, 'minimum matched roots must be positive')
  assert.ok(Number.isInteger(validation.minimumUnmatchedRoots)
    && validation.minimumUnmatchedRoots > 0, 'minimum unmatched roots must be positive')

  const details = roots.map((root) => {
    assert.ok(typeof root?.rootId === 'string' && root.rootId, 'rootId is required')
    assert.equal(typeof root.classifierMatched, 'boolean', 'classifier membership is required')
    assert.equal(root.candidates?.length, 2, 'exactly two ordered candidates are required')
    const [staticCandidate, alternateCandidate] = root.candidates
    assert.ok(Array.isArray(staticCandidate.terminalRanks), 'static terminal ranks are required')
    assert.ok(Array.isArray(alternateCandidate.terminalRanks),
      'alternate terminal ranks are required')
    assert.equal(staticCandidate.terminalRanks.length, alternateCandidate.terminalRanks.length,
      'paired root arrays must have equal length')
    assert.ok(staticCandidate.terminalRanks.length > 0, 'at least one paired sample is required')
    assert.ok([...staticCandidate.terminalRanks, ...alternateCandidate.terminalRanks]
      .every((rank) => Number.isInteger(rank) && rank > 0),
    'terminal ranks must be positive integers')
    const lifts = staticCandidate.terminalRanks.map(
      (rank, index) => rank - alternateCandidate.terminalRanks[index])
    const meanRankLift = mean(lifts)
    return {
      rootId: root.rootId,
      classifierMatched: root.classifierMatched,
      samples: lifts.length,
      meanRankLift,
      sign: meanRankLift > 0 ? 'alternate-positive'
        : (meanRankLift < 0 ? 'static-positive' : 'tie'),
    }
  })
  assert.equal(new Set(details.map((entry) => entry.rootId)).size, details.length,
    'root ids must be unique')
  const sampleCounts = new Set(details.map((entry) => entry.samples))
  assert.equal(sampleCounts.size, 1, 'all roots must have equal sample counts')
  const availableSamplesPerRoot = details[0].samples
  const matched = summarizeClass(details.filter((entry) => entry.classifierMatched))
  const unmatched = summarizeClass(details.filter((entry) => !entry.classifierMatched))
  const eligibleForGate = availableSamplesPerRoot >= requiredSamples
    && matched.roots >= validation.minimumMatchedRoots
    && unmatched.roots >= validation.minimumUnmatchedRoots
  const matchedPassed = matched.decisiveRoots >= validation.matchedGate.minimumDecisiveRoots
    && matched.alternatePositiveRoots >= validation.matchedGate.minimumAlternatePositiveRoots
    && matched.staticPositiveRoots <= validation.matchedGate.maximumStaticPositiveRoots
    && matched.twoSidedExactSignPValue <= validation.matchedGate.twoSidedExactSignAlpha
  const unmatchedPassed = unmatched.alternatePositiveRoots
    <= validation.unmatchedGate.maximumAlternatePositiveRoots
  const passed = eligibleForGate && matchedPassed && unmatchedPassed
  return {
    schemaVersion: 'fcm.context-classifier-audit.v1',
    status: eligibleForGate ? (passed ? 'passed' : 'failed') : 'collecting',
    eligibleForGate,
    passed: eligibleForGate ? passed : null,
    availableSamplesPerRoot,
    requiredSamplesPerRoot: requiredSamples,
    matched: { ...matched, gate: validation.matchedGate },
    unmatched: { ...unmatched, gate: validation.unmatchedGate },
    details,
  }
}
