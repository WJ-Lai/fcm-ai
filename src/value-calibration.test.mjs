import assert from 'node:assert/strict'
import test from 'node:test'

import {
  phaseBucket,
  summarizeValueCalibration,
  terminalSeatTargets,
} from './value-calibration.mjs'

test('terminal targets preserve money ties, rank order, and opponent margin', () => {
  const targets = terminalSeatTargets([
    { seat: 0, money: 80, bankrupt: false },
    { seat: 1, money: 30, bankrupt: false },
    { seat: 2, money: 80, bankrupt: false },
  ])
  assert.deepEqual(targets, [
    { seat: 0, rank: 1.5, rankValue: 0.75, first: true, money: 80, opponentMargin: 0 },
    { seat: 1, rank: 3, rankValue: 0, first: false, money: 30, opponentMargin: -50 },
    { seat: 2, rank: 1.5, rankValue: 0.75, first: true, money: 80, opponentMargin: 0 },
  ])
})

test('phase buckets are deterministic and reject invalid clocks', () => {
  assert.equal(phaseBucket({ turn: 1 }), 'early')
  assert.equal(phaseBucket({ turn: 3 }), 'early')
  assert.equal(phaseBucket({ turn: 4 }), 'middle')
  assert.equal(phaseBucket({ turn: 6 }), 'middle')
  assert.equal(phaseBucket({ turn: 7 }), 'late')
  assert.throws(() => phaseBucket({ turn: 0 }), /positive integer/)
})

test('calibration reports leader accuracy and pairwise concordance by split and phase', () => {
  const samples = [
    {
      gameId: 'dev-1', seed: 'seed-dev', split: 'development', turn: 2,
      provenance: { observation: 'seat-visible-decision-view', target: 'terminal-result' },
      predictions: [{ seat: 0, score: 9 }, { seat: 1, score: 3 }, { seat: 2, score: 1 }],
      terminal: [{ seat: 0, money: 40 }, { seat: 1, money: 20 }, { seat: 2, money: 10 }],
    },
    {
      gameId: 'hold-1', seed: 'seed-hold', split: 'holdout', turn: 5,
      provenance: { observation: 'seat-visible-decision-view', target: 'terminal-result' },
      predictions: [{ seat: 0, score: 0 }, { seat: 1, score: 4 }, { seat: 2, score: 4 }],
      terminal: [{ seat: 0, money: 10 }, { seat: 1, money: 20 }, { seat: 2, money: 30 }],
    },
  ]
  const report = summarizeValueCalibration(samples)
  assert.equal(report.schemaVersion, 'fcm.value-calibration-report.v1')
  assert.equal(report.overall.samples, 2)
  assert.equal(report.overall.leaderCredit, 1.5)
  assert.equal(report.overall.leaderAccuracy, 0.75)
  assert.equal(report.overall.predictedLeaderTies, 1)
  assert.equal(report.overall.decisiveLeaderSamples, 1)
  assert.equal(report.overall.decisiveLeaderAccuracy, 1)
  assert.equal(report.overall.pairwiseComparable, 6)
  assert.equal(report.overall.pairwiseCredit, 5.5)
  assert.equal(report.overall.pairwiseConcordance, 5.5 / 6)
  assert.equal(report.gameMacro.games, 2)
  assert.equal(report.gameMacro.meanLeaderAccuracy, 0.75)
  assert.ok(Math.abs(report.gameMacro.meanPairwiseConcordance - 11 / 12) < 1e-12)
  assert.equal(report.byGame['dev-1'].samples, 1)
  assert.equal(report.byGame['hold-1'].leaderAccuracy, 0.5)
  assert.equal(report.bySplit.development.leaderAccuracy, 1)
  assert.equal(report.bySplit.holdout.leaderAccuracy, 0.5)
  assert.equal(report.byPhase.early.samples, 1)
  assert.equal(report.byPhase.middle.samples, 1)
})

test('calibration fails closed on split leakage, seat mismatch, and non-seat-safe provenance', () => {
  const base = {
    gameId: 'one', seed: 'shared', split: 'development', turn: 1,
    provenance: { observation: 'seat-visible-decision-view', target: 'terminal-result' },
    predictions: [{ seat: 0, score: 1 }, { seat: 1, score: 0 }],
    terminal: [{ seat: 0, money: 1 }, { seat: 1, money: 0 }],
  }
  assert.throws(() => summarizeValueCalibration([
    base,
    { ...base, gameId: 'two', split: 'holdout' },
  ]), /seed split leakage/)
  assert.throws(() => summarizeValueCalibration([
    { ...base, predictions: [{ seat: 0, score: 1 }, { seat: 2, score: 0 }] },
  ]), /seat sets differ/)
  assert.throws(() => summarizeValueCalibration([
    { ...base, provenance: { observation: 'raw-engine', target: 'terminal-result' } },
  ]), /seat-visible/)
})
