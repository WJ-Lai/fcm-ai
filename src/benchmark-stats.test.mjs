import assert from 'node:assert/strict'
import test from 'node:test'

import { rankedSampleSummary, wilsonInterval } from './benchmark-stats.mjs'

test('Wilson interval is bounded and handles empty and extreme samples', () => {
  assert.equal(wilsonInterval(0, 0), null)
  const none = wilsonInterval(0, 20)
  const all = wilsonInterval(20, 20)
  assert.equal(none.low, 0)
  assert.ok(none.high > 0 && none.high < 0.2)
  assert.ok(all.low > 0.8 && all.low < 1)
  assert.equal(all.high, 1)
  assert.throws(() => wilsonInterval(2, 1), /between zero and samples/)
})

test('ranked summary reports first-place rate, confidence and money', () => {
  const result = rankedSampleSummary([
    { rank: 1, money: 30 },
    { rank: 2, money: 10 },
    { rank: 1, money: 20 },
  ])
  assert.equal(result.samples, 3)
  assert.equal(result.firsts, 2)
  assert.equal(result.firstRate, 2 / 3)
  assert.equal(result.meanRank, 4 / 3)
  assert.equal(result.meanMoney, 20)
  assert.ok(result.firstRate95CI.low < result.firstRate)
  assert.ok(result.firstRate95CI.high > result.firstRate)
})
