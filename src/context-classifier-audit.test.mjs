import assert from 'node:assert/strict'
import test from 'node:test'

import { auditContextClassifier } from './context-classifier-audit.mjs'

const classifier = {
  validation: {
    minimumMatchedRoots: 8,
    minimumUnmatchedRoots: 2,
    pairedContinuationSamplesPerRoot: 15,
    matchedGate: {
      minimumDecisiveRoots: 7,
      minimumAlternatePositiveRoots: 7,
      maximumStaticPositiveRoots: 0,
      twoSidedExactSignAlpha: 0.025,
    },
    unmatchedGate: { maximumAlternatePositiveRoots: 0 },
  },
}

function root(rootId, classifierMatched, sign, samples = 15) {
  const staticRank = sign === 'alternate-positive' ? 2 : 1
  const alternateRank = sign === 'static-positive' ? 2 : 1
  return {
    rootId,
    classifierMatched,
    candidates: [
      { terminalRanks: Array(samples).fill(staticRank) },
      { terminalRanks: Array(samples).fill(alternateRank) },
    ],
  }
}

function passingRoots(samples = 15) {
  return [
    ...Array.from({ length: 7 }, (_, index) => root(
      `matched-positive-${index}`, true, 'alternate-positive', samples)),
    root('matched-tie', true, 'tie', samples),
    root('unmatched-static', false, 'static-positive', samples),
    root('unmatched-tie', false, 'tie', samples),
  ]
}

test('passes only when both matched and unmatched preregistered gates pass', () => {
  const audit = auditContextClassifier(passingRoots(), classifier)
  assert.equal(audit.status, 'passed')
  assert.equal(audit.passed, true)
  assert.equal(audit.matched.alternatePositiveRoots, 7)
  assert.equal(audit.matched.staticPositiveRoots, 0)
  assert.equal(audit.matched.twoSidedExactSignPValue, 0.015625)
  assert.equal(audit.unmatched.alternatePositiveRoots, 0)
})

test('one matched static-positive root fails the matched gate', () => {
  const roots = passingRoots()
  roots[7] = root('matched-negative', true, 'static-positive')
  const audit = auditContextClassifier(roots, classifier)
  assert.equal(audit.status, 'failed')
  assert.equal(audit.passed, false)
})

test('one unmatched alternate-positive root fails the safety gate', () => {
  const roots = passingRoots()
  roots[8] = root('unmatched-positive', false, 'alternate-positive')
  const audit = auditContextClassifier(roots, classifier)
  assert.equal(audit.status, 'failed')
  assert.equal(audit.passed, false)
})

test('interim samples remain collecting with no pass verdict', () => {
  const audit = auditContextClassifier(passingRoots(3), classifier)
  assert.equal(audit.status, 'collecting')
  assert.equal(audit.eligibleForGate, false)
  assert.equal(audit.passed, null)
})
