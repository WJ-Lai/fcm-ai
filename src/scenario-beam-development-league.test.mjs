import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/scenario-beam-development-v2/report.json', import.meta.url)

test('frozen ScenarioBeam development puncture is paired, legal, and keeps holdout sealed', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.scenario-beam-development-league.v2')
  assert.equal(report.experimentId, 20)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.strengthPromoted, false)
  assert.deepEqual(report.arms, ['static', 'beam-1000ms', 'beam-3000ms'])
  assert.equal(report.games.length, 12)
  for (const game of report.games) {
    assert.equal(game.completed, true)
    assert.equal(game.violation, null)
    assert.ok(game.commands <= report.protocol.maxCommands)
    if (game.arm === 'static') assert.equal(game.beam.decisions, 0)
    else assert.equal(game.beam.decisions, 1)
  }
  for (const summary of Object.values(report.summary)) {
    assert.equal(summary.games, 4)
    assert.equal(summary.completed, 4)
    assert.equal(summary.violations, 0)
  }
})
