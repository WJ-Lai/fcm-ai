import assert from 'node:assert/strict'
import test from 'node:test'

import { adjudicateHorizonAgreement, reserveDeadlineHeadroom } from './horizon-agreement.mjs'

const candidate = (id) => ({ id, actions: [{ type: id }] })
const search = (id, { fallback = false } = {}) => ({
  selected: candidate(id),
  metrics: { fallbackUsed: fallback, stopReason: fallback ? 'deadline' : 'complete' },
})

test('agreement permits a completed deep recommendation', () => {
  const result = adjudicateHorizonAgreement({
    staticSelected: candidate('static'),
    shallow: search('change'),
    deep: search('change'),
  })
  assert.equal(result.selected.id, 'change')
  assert.equal(result.gateReason, 'horizons-agree')
  assert.equal(result.fallbackUsed, false)
})

test('horizon disagreement preserves the static legal candidate', () => {
  const result = adjudicateHorizonAgreement({
    staticSelected: candidate('hire'),
    shallow: search('hire'),
    deep: search('skip'),
  })
  assert.equal(result.selected.id, 'hire')
  assert.equal(result.gateReason, 'horizon-disagreement')
  assert.equal(result.fallbackUsed, true)
})

test('an incomplete shallow or deep search fails closed', () => {
  for (const [shallow, deep, reason] of [
    [search('change', { fallback: true }), search('change'), 'shallow-incomplete'],
    [search('change'), search('change', { fallback: true }), 'deep-incomplete'],
  ]) {
    const result = adjudicateHorizonAgreement({
      staticSelected: candidate('static'), shallow, deep,
    })
    assert.equal(result.selected.id, 'static')
    assert.equal(result.gateReason, reason)
    assert.equal(result.fallbackUsed, true)
  }
})

test('deadline headroom reserves bounded time for non-preemptible engine transitions', () => {
  assert.equal(reserveDeadlineHeadroom(1000, 0.2), 800)
  assert.equal(reserveDeadlineHeadroom(3000, 0.2), 2400)
  assert.throws(() => reserveDeadlineHeadroom(1000, -0.1), /headroomRatio/)
  assert.throws(() => reserveDeadlineHeadroom(1000, 1), /headroomRatio/)
})
