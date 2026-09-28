#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { horizonAgreementScenarioBeamStrategy } from '../src/horizon-agreement.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/horizon-agreement-development-v4/protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(root, 'fixtures/horizon-agreement-development-v4/report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function officialBelief(view, opponentSeat) {
  const belief = buildOpponentBelief(population, {
    observed: {
      publicHistoryDigest: digest(view), turn: view.state.turn, seat: opponentSeat, publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: { confidence: 'high', sampleCount: 2, outOfDistribution: false },
  })
  belief.believed.models = belief.believed.models.map((model) => ({
    ...model,
    probability: model.modelId === 'official-built-in-v1' ? 1 : 0,
    confidence: model.modelId === 'official-built-in-v1' ? 'high' : 'low',
  }))
  return belief
}

async function play(arm, seed, agentSeat, gameID) {
  const opponentSeat = 1 - agentSeat
  const playerNames = agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
  const env = OfflineEnvironment.fromSeed({ seed, playerNames, gameID, gameName: arm.id })
  const decisions = []
  let commands = 0
  let violation = null
  const started = performance.now()
  while (env.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    try {
      const snapshot = env.snapshot()
      const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
      assert.ok(seat >= 0, 'unknown pending seat')
      if (seat === opponentSeat) {
        await env.stepBuiltinAI(seat, `common-opponent:${seed}:${agentSeat}:${commands}`)
      } else {
        const view = await env.observe(agentSeat)
        const staticResult = deterministicStrategy(view)
        let selected = staticResult.selected
        if (arm.mode !== 'static' && decisions.length < protocol.maxGateDecisions
          && view.state.phase === 5 && !view.legalActions.isSimulPhase
          && staticResult.ranked.length > 1) {
          const options = {
            env,
            seat: agentSeat,
            belief: officialBelief(view, opponentSeat),
            population,
            sampleSeeds: [`${seed}-seat-${agentSeat}-belief-a`, `${seed}-seat-${agentSeat}-belief-b`],
            beamBudget: protocol.beamBudget,
          }
          const gated = arm.mode === 'agreement'
            ? await horizonAgreementScenarioBeamStrategy(view, {
              ...options, deadlineMs: arm.deadlineMs,
            })
            : await scenarioBeamStrategy(view, {
              ...options,
              beamBudget: { ...protocol.beamBudget, deadlineMs: arm.deadlineMs },
            })
          selected = gated.selected
          const agreement = arm.mode === 'agreement'
          decisions.push({
            elapsedMs: gated.metrics.elapsedMs,
            gateReason: agreement ? gated.gateReason : 'ungated',
            fallbackUsed: agreement ? gated.fallbackUsed : gated.metrics.fallbackUsed,
            staticCandidateId: gated.staticSelected.id,
            shallowCandidateId: agreement ? gated.shallowCandidateId : null,
            deepCandidateId: agreement ? gated.deepCandidateId : gated.selected.id,
            selectedCandidateId: gated.selected.id,
            shallowStopReason: agreement ? gated.shallow.metrics.stopReason : null,
            deepStopReason: agreement ? gated.deep.metrics.stopReason : gated.metrics.stopReason,
          })
        }
        await env.step(agentSeat, selected.actions)
      }
      commands += 1
    } catch (error) {
      violation = { code: error.code ?? 'ERROR', message: error.message }
      break
    }
  }
  const terminal = await env.observe(agentSeat)
  const ranking = [...terminal.state.players]
    .sort((left, right) => right.money - left.money || left.index - right.index)
  return {
    arm: arm.id, seed, agentSeat,
    completed: terminal.state.phase === 10,
    violation,
    commands,
    gameLatencyMs: Math.round(performance.now() - started),
    agentRank: ranking.findIndex((player) => player.index === agentSeat) + 1,
    agentMoney: terminal.state.players[agentSeat].money,
    opponentMoney: terminal.state.players[opponentSeat].money,
    gate: {
      decisions: decisions.length,
      fallbacks: decisions.filter((item) => item.fallbackUsed).length,
      details: decisions,
    },
  }
}

let games = []
try {
  const checkpoint = JSON.parse(await readFile(outputPath, 'utf8'))
  games = (checkpoint.games ?? []).filter((game) => protocol.arms.some((arm) => arm.id === game.arm))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
for (const arm of protocol.arms) {
  for (let seedIndex = 0; seedIndex < protocol.seeds.length; seedIndex += 1) {
    const seed = protocol.seeds[seedIndex]
    for (const seat of [0, 1]) {
      const exists = games.some((game) => game.arm === arm.id
        && game.seed === seed && game.agentSeat === seat)
      if (!exists) games.push(await play(arm, seed, seat, 9840 + seedIndex * 2 + seat))
    }
  }
}
const summary = Object.fromEntries(protocol.arms.map((arm) => {
  const rows = games.filter((game) => game.arm === arm.id)
  return [arm.id, {
    games: rows.length,
    completed: rows.filter((game) => game.completed).length,
    violations: rows.filter((game) => game.violation).length,
    firstPlaces: rows.filter((game) => game.agentRank === 1).length,
    meanAgentMoney: rows.reduce((sum, game) => sum + game.agentMoney, 0) / rows.length,
    gateFallbacks: rows.reduce((sum, game) => sum + game.gate.fallbacks, 0),
    maxDecisionMs: rows.some((game) => game.gate.details.length)
      ? Math.max(...rows.flatMap((game) => game.gate.details.map((item) => item.elapsedMs))) : 0,
  }]
}))
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  protocol,
  summary,
  games,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
  strengthPromoted: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, summary }, null, 2)}\n`)
if (games.some((game) => !game.completed || game.violation)) process.exitCode = 2
