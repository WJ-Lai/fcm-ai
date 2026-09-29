import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { MARKETING_PROPOSAL_VERSION } from './candidates.mjs'

const protocolUrl = new URL('../fixtures/marketing-effect-spread-v28/protocol.json', import.meta.url)
const trainingUrl = new URL(
  '../fixtures/marketing-effect-spread-v28/training-report.json', import.meta.url)

test('effect-spread validation gates are frozen before opening the disjoint slice', async () => {
  const protocol = JSON.parse(await readFile(protocolUrl, 'utf8'))
  const training = JSON.parse(await readFile(trainingUrl, 'utf8'))
  assert.equal(protocol.candidateVersion, MARKETING_PROPOSAL_VERSION)
  assert.equal(training.candidateVersion, MARKETING_PROPOSAL_VERSION)
  assert.ok(training.boundedEffectEquivalentOffered
    > protocol.trainingResult.previousBounded)
  assert.ok(training.enumeratedEffectEquivalentOffered
    > protocol.trainingResult.previousEnumerated)
  assert.ok(protocol.validationGate.minimumBoundedEffectEquivalentOffered
    > protocol.validationBaseline.boundedEffectEquivalentOffered)
  assert.ok(protocol.validationGate.minimumEnumeratedEffectEquivalentOffered
    > protocol.validationBaseline.enumeratedEffectEquivalentOffered)
  assert.equal(protocol.validationOpened, false)
  assert.equal(training.validationOpened, false)
  assert.equal(protocol.promotionHoldoutOpened, false)
})
