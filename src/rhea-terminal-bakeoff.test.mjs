import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/rhea-terminal-bakeoff-v6/report.json', import.meta.url)

test('RHEA terminal bake-off is paired, safe, and keeps promotion holdout sealed', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.rhea-terminal-bakeoff.v6')
  assert.equal(report.experimentId, 32)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.strengthPromoted, false)
  assert.deepEqual(report.arms, ['static', 'beam-3000ms', 'rhea-3000ms'])
  assert.equal(report.games.length, 12)
  for (const arm of report.arms) {
    assert.equal(report.summary[arm].games, 4)
    assert.equal(report.summary[arm].completed, 4)
    assert.equal(report.summary[arm].violations, 0)
  }
  for (const game of report.games) {
    assert.equal(game.completed, true)
    assert.equal(game.violation, null)
    if (game.arm !== 'static') {
      assert.equal(game.planner.decisions, 1)
      assert.ok(game.planner.decisionP95Ms <= 3000)
    }
  }
})
