import assert from 'node:assert/strict'
import test from 'node:test'

import { auditRootGeneralization } from './root-generalization.mjs'

const hypothesis = {
  unitOfGeneralization: 'root',
  pairedContinuationSamplesPerRoot: 15,
  gate: {
    minimumFrozenRoots: 8,
    minimumDecisiveRoots: 7,
    minimumAlternatePositiveRoots: 7,
    maximumStaticPositiveRoots: 0,
    twoSidedExactSignAlpha: 0.025,
  },
}

function root(index, staticRanks, alternateRanks) {
  return {
    rootId: `root-${index}`,
    candidates: [
      { candidateId: 'static', terminalRanks: staticRanks },
      { candidateId: 'alternate', terminalRanks: alternateRanks },
    ],
  }
}

test('root-level gate passes seven positive roots and one tie without pooling continuations', () => {
  const positive = Array.from({ length: 7 }, (_, index) => root(
    index, Array(15).fill(2), Array(15).fill(1)))
  const report = auditRootGeneralization([
    ...positive, root(7, Array(15).fill(1), Array(15).fill(1)),
  ], hypothesis)
  assert.equal(report.status, 'passed')
  assert.equal(report.alternatePositiveRoots, 7)
  assert.equal(report.staticPositiveRoots, 0)
  assert.equal(report.tiedRoots, 1)
  assert.equal(report.twoSidedExactSignPValue, 0.015625)
})

test('one opposite root fails the preregistered gate even when seven roots are positive', () => {
  const positive = Array.from({ length: 7 }, (_, index) => root(
    index, Array(15).fill(2), Array(15).fill(1)))
  const report = auditRootGeneralization([
    ...positive, root(7, Array(15).fill(1), Array(15).fill(2)),
  ], hypothesis)
  assert.equal(report.status, 'failed')
  assert.equal(report.staticPositiveRoots, 1)
  assert.equal(report.twoSidedExactSignPValue, 0.0703125)
})

test('an interim three-sample report is collecting and cannot pass', () => {
  const report = auditRootGeneralization(Array.from({ length: 8 }, (_, index) => root(
    index, [2, 2, 2], [1, 1, 1])), hypothesis)
  assert.equal(report.status, 'collecting')
  assert.equal(report.eligibleForGate, false)
  assert.equal(report.passed, null)
})

test('root audit rejects duplicate roots and unpaired rank arrays', () => {
  const duplicate = root(0, Array(15).fill(2), Array(15).fill(1))
  assert.throws(() => auditRootGeneralization(Array(8).fill(duplicate), hypothesis),
    /root ids must be unique/)
  assert.throws(() => auditRootGeneralization([
    root(0, [2, 2], [1]), ...Array.from({ length: 7 }, (_, index) => root(
      index + 1, [2, 2], [1, 1])),
  ], hypothesis), /paired root arrays must have equal length/)
})
