import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../fixtures/horizon-agreement-development-v4/report.json', import.meta.url)

test('horizon agreement development league completes safely under both budgets', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'))
  assert.equal(report.schemaVersion, 'fcm.horizon-agreement-development.v4')
  assert.equal(report.experimentId, 22)
  assert.equal(report.games.length, 16)
  assert.equal(report.promotionHoldoutOpened, false)
  assert.equal(report.strengthPromoted, false)
  assert.ok(report.summary['agreement-1000ms'].maxDecisionMs <= 1000)
  assert.ok(report.summary['agreement-3000ms'].maxDecisionMs <= 3000)
  for (const game of report.games) {
    assert.equal(game.completed, true)
    assert.equal(game.violation, null)
    assert.equal(game.gate.decisions, game.arm === 'static' ? 0 : 1)
  }
  for (const reference of report.games.filter((game) => game.arm === 'static')) {
    for (const arm of ['agreement-1000ms', 'agreement-3000ms']) {
      const paired = report.games.find((game) => game.arm === arm
        && game.seed === reference.seed && game.agentSeat === reference.agentSeat)
      assert.ok(paired, `missing paired ${arm} game`)
      assert.equal(paired.gate.fallbacks, 1)
      assert.equal(paired.gate.details[0].headroomRatio, 0.2)
      assert.equal(paired.agentRank, reference.agentRank)
      assert.equal(paired.agentMoney, reference.agentMoney)
      assert.equal(paired.opponentMoney, reference.opponentMoney)
    }
  }
  const unsafe = report.games.filter((game) => game.arm === 'unsafe-3000ms')
  assert.equal(unsafe.length, 4)
  assert.ok(unsafe.every((game) => game.gate.details[0].selectedCandidateId
    === 'p5s1-fallback-21d4f44933'))
  assert.ok(unsafe.some((game) => {
    const reference = report.games.find((item) => item.arm === 'static'
      && item.seed === game.seed && item.agentSeat === game.agentSeat)
    return game.agentMoney !== reference.agentMoney || game.agentRank !== reference.agentRank
  }))
})
