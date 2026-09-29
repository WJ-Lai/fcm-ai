import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/marketing-proposal-ceiling-v27/report.json', import.meta.url)

test('marketing ceiling decomposition is complete and keeps validation sealed', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.single.verifiedLabels + report.multi.verifiedLabels,
    report.verifiedMarketingLabels)
  assert.equal(report.single.boundedEffectEquivalentOffered
    + report.single.budgetPruningLoss,
  report.single.enumeratedEffectEquivalentOffered)
  assert.equal(report.single.enumeratedEffectEquivalentOffered
    + report.single.enumerationSelectionLoss,
  report.single.exhaustiveEffectEquivalentOffered)
  assert.equal(report.single.intermediateDurationLabels
    + report.single.endpointDurationLabels,
  report.single.verifiedLabels)
  assert.equal(report.single.endpointDurationEnumerated
    + report.single.endpointSpatialSelectionLoss,
  report.single.endpointDurationLabels)
  assert.equal(report.single.unexpectedExhaustiveMiss, 0)
  assert.ok(report.single.endpointSpatialSelectionLoss > report.single.intermediateDurationLabels)
  assert.equal(report.validationOpened, false)
  assert.equal(report.promotionHoldoutOpened, false)
})
