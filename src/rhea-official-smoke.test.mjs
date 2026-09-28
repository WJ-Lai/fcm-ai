import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-v1/report.json', import.meta.url)

test('frozen RHEA smoke evaluates legal official-engine genomes', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-official-smoke.v1')
  assert.equal(report.experimentId, 27)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.privatePayloadPersisted, false)
  assert.equal(report.metrics.fallbackUsed, false)
  assert.ok(report.metrics.completedGenerations >= 1)
  assert.ok(report.metrics.scenarioEvaluations >= 8)
  assert.ok(report.bestGenome.length, 3)
  assert.ok(report.scenarios.every((scenario) => scenario.trace.length >= 1))
})
