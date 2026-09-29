import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { MARKETING_PROPOSAL_VERSION } from './candidates.mjs'

const protocolUrl = new URL('../fixtures/marketing-effect-spread-v28/protocol.json', import.meta.url)
const trainingUrl = new URL(
  '../fixtures/marketing-effect-spread-v28/training-report.json', import.meta.url)
const validationUrl = new URL(
  '../fixtures/marketing-effect-spread-v28/validation-report.json', import.meta.url)

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

test('same-slice A/B is descriptive and cannot masquerade as a valid preregistered promotion', async () => {
  const report = JSON.parse(await readFile(validationUrl, 'utf8'))
  assert.equal(report.preregisteredGate.status, 'invalid')
  assert.equal(report.pairedDescriptiveDelta.boundedEffectEquivalentOffered,
    report.newSelector.boundedEffectEquivalentOffered
      - report.sameSliceOldSelector.boundedEffectEquivalentOffered)
  assert.equal(report.pairedDescriptiveDelta.enumeratedEffectEquivalentOffered,
    report.newSelector.enumeratedEffectEquivalentOffered
      - report.sameSliceOldSelector.enumeratedEffectEquivalentOffered)
  assert.ok(report.pairedDescriptiveDelta.boundedEffectEquivalentOffered > 0)
  assert.ok(report.pairedDescriptiveDelta.enumeratedEffectEquivalentOffered > 0)
  assert.equal(report.officialExecutionAudit.invalid, 0)
  assert.ok(report.officialExecutionAudit.maximumCandidatesPerDecision <= 32)
  assert.match(report.decision, /not-strategy-promotion$/)
  assert.equal(report.promotionHoldoutOpened, false)
})
