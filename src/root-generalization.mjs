import assert from 'node:assert/strict'

import { exactTwoSidedSignPValue } from './paired-sequential-estimator.mjs'

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function auditRootGeneralization(roots, hypothesis) {
  assert.ok(Array.isArray(roots) && roots.length > 0, 'roots are required')
  assert.equal(hypothesis?.unitOfGeneralization, 'root', 'generalization unit must be root')
  const requiredSamples = hypothesis.pairedContinuationSamplesPerRoot
  assert.ok(Number.isInteger(requiredSamples) && requiredSamples > 0,
    'paired continuation sample count must be positive')
  const gate = hypothesis.gate
  for (const [name, value] of Object.entries({
    minimumFrozenRoots: gate?.minimumFrozenRoots,
    minimumDecisiveRoots: gate?.minimumDecisiveRoots,
    minimumAlternatePositiveRoots: gate?.minimumAlternatePositiveRoots,
    maximumStaticPositiveRoots: gate?.maximumStaticPositiveRoots,
  })) assert.ok(Number.isInteger(value) && value >= 0, `${name} must be non-negative integer`)
  assert.ok(Number.isFinite(gate.twoSidedExactSignAlpha)
    && gate.twoSidedExactSignAlpha > 0 && gate.twoSidedExactSignAlpha < 1,
  'sign alpha must be between zero and one')

  const details = roots.map((root) => {
    assert.ok(typeof root?.rootId === 'string' && root.rootId, 'rootId is required')
    assert.equal(root.candidates?.length, 2, 'exactly two ordered candidates are required')
    const [staticCandidate, alternateCandidate] = root.candidates
    assert.ok(Array.isArray(staticCandidate.terminalRanks), 'static terminal ranks are required')
    assert.ok(Array.isArray(alternateCandidate.terminalRanks), 'alternate terminal ranks are required')
    assert.equal(staticCandidate.terminalRanks.length, alternateCandidate.terminalRanks.length,
      'paired root arrays must have equal length')
    assert.ok(staticCandidate.terminalRanks.length > 0, 'at least one paired sample is required')
    assert.ok([...staticCandidate.terminalRanks, ...alternateCandidate.terminalRanks]
      .every((rank) => Number.isInteger(rank) && rank > 0), 'terminal ranks must be positive integers')
    const lifts = staticCandidate.terminalRanks.map(
      (rank, index) => rank - alternateCandidate.terminalRanks[index])
    const meanRankLift = mean(lifts)
    return {
      rootId: root.rootId,
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
  const alternatePositiveRoots = details.filter(
    (entry) => entry.sign === 'alternate-positive').length
  const staticPositiveRoots = details.filter((entry) => entry.sign === 'static-positive').length
  const tiedRoots = details.length - alternatePositiveRoots - staticPositiveRoots
  const decisiveRoots = alternatePositiveRoots + staticPositiveRoots
  const pValue = exactTwoSidedSignPValue(alternatePositiveRoots, staticPositiveRoots)
  const eligibleForGate = roots.length >= gate.minimumFrozenRoots
    && availableSamplesPerRoot >= requiredSamples
  const passed = eligibleForGate
    && decisiveRoots >= gate.minimumDecisiveRoots
    && alternatePositiveRoots >= gate.minimumAlternatePositiveRoots
    && staticPositiveRoots <= gate.maximumStaticPositiveRoots
    && pValue <= gate.twoSidedExactSignAlpha
  return {
    schemaVersion: 'fcm.root-generalization-audit.v1',
    status: eligibleForGate ? (passed ? 'passed' : 'failed') : 'collecting',
    eligibleForGate,
    passed: eligibleForGate ? passed : null,
    roots: details.length,
    availableSamplesPerRoot,
    requiredSamplesPerRoot: requiredSamples,
    alternatePositiveRoots,
    staticPositiveRoots,
    tiedRoots,
    decisiveRoots,
    twoSidedExactSignPValue: pValue,
    gate,
    details,
  }
}
