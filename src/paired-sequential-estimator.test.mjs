import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditPairedSequentialDataset,
  evaluatePairedSequentialRoot,
  exactTwoSidedSignPValue,
  validatePairedSequentialProtocol,
} from './paired-sequential-estimator.mjs'

const protocol = {
  schemaVersion: 'fcm.paired-sequential-protocol.v1',
  overallAlpha: 0.05,
  stages: [
    { samples: 3, alpha: 0.005 },
    { samples: 7, alpha: 0.02 },
    { samples: 15, alpha: 0.025 },
  ],
}

function candidate(candidateId, margins) {
  return {
    candidateId,
    terminalMargins: margins,
    terminalCommands: margins.map(() => 10),
  }
}

test('exact sign test is symmetric and conservative for small samples', () => {
  assert.equal(exactTwoSidedSignPValue(7, 0), 0.015625)
  assert.equal(exactTwoSidedSignPValue(0, 7), 0.015625)
  assert.equal(exactTwoSidedSignPValue(4, 3), 1)
  assert.equal(exactTwoSidedSignPValue(0, 0), 1)
})

test('paired sequential estimator waits at three samples and selects at a declared stage', () => {
  validatePairedSequentialProtocol(protocol)
  const root = {
    rootId: 'strong-root',
    candidates: [
      candidate('produce', Array(7).fill(10)),
      candidate('skip', Array(7).fill(-10)),
    ],
  }
  const result = evaluatePairedSequentialRoot(root, protocol)
  assert.equal(result.status, 'selected')
  assert.equal(result.selectedCandidateId, 'produce')
  assert.equal(result.stopSamples, 7)
  assert.equal(result.stages[0].selectedCandidateId, null)
  assert.equal(result.stages[1].comparisons[0].pValue, 0.015625)
  assert.deepEqual(result.stages[1].comparisons[0].decisiveWinRate95CI, {
    low: 0.6456695649333126,
    high: 1,
  })
})

test('noisy evidence abstains at the maximum and partial evidence requests more samples', () => {
  const noisy = evaluatePairedSequentialRoot({
    rootId: 'noisy-root',
    candidates: [
      candidate('produce', Array.from({ length: 15 }, (_, i) => i % 2 === 0 ? 10 : -10)),
      candidate('skip', Array.from({ length: 15 }, (_, i) => i % 2 === 0 ? -10 : 10)),
    ],
  }, protocol)
  assert.equal(noisy.status, 'abstain-max-samples')
  assert.equal(noisy.selectedCandidateId, null)

  const partial = evaluatePairedSequentialRoot({
    rootId: 'partial-root',
    candidates: [candidate('a', [10, -10, 10]), candidate('b', [-10, 10, -10])],
  }, protocol)
  assert.equal(partial.status, 'needs-more-samples')
  assert.equal(partial.nextSamples, 7)
})

test('dataset audit reports coverage without turning abstention into a preference', () => {
  const dataset = {
    sampleCount: 3,
    roots: [
      {
        rootId: 'root-a',
        candidates: [candidate('a', [10, -10, 10]), candidate('b', [-10, 10, -10])],
      },
      {
        rootId: 'root-b',
        candidates: [candidate('a', [-10, 10, -10]), candidate('b', [10, -10, 10])],
      },
    ],
  }
  const audit = auditPairedSequentialDataset(dataset, protocol)
  assert.deepEqual({ ...audit, details: undefined }, {
    schemaVersion: 'fcm.paired-sequential-audit.v1',
    roots: 2,
    selectedRoots: 0,
    abstainedRoots: 0,
    needsMoreSamplesRoots: 2,
    coverage: 0,
    details: undefined,
  })
  assert.equal(audit.details.length, 2)
})

test('multiple-candidate correction skips a stage whose best possible p-value cannot pass', () => {
  const root = {
    rootId: 'three-candidate-root',
    candidates: [
      candidate('a', [10, 10, 10]),
      candidate('b', [-10, -10, -10]),
      candidate('c', [-20, -20, -20]),
    ],
  }
  const result = evaluatePairedSequentialRoot(root, protocol)
  assert.equal(result.stages[0].selectionReachable, false)
  assert.equal(result.stages[0].minimumPossiblePValue, 0.25)
  assert.equal(result.nextSamples, 15)
})

test('protocol rejects alpha overspend and non-increasing stages', () => {
  assert.throws(
    () => validatePairedSequentialProtocol({
      ...protocol,
      stages: [{ samples: 3, alpha: 0.03 }, { samples: 7, alpha: 0.03 }],
    }),
    /alpha budget/,
  )
  assert.throws(
    () => validatePairedSequentialProtocol({
      ...protocol,
      stages: [{ samples: 7, alpha: 0.01 }, { samples: 3, alpha: 0.01 }],
    }),
    /strictly increase/,
  )
})
