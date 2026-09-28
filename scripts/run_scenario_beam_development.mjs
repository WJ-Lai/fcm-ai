#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const protocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/scenario-beam-development-v2/protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(root, 'fixtures/scenario-beam-development-v2/report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function percentile95(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

function officialBelief(view, opponentSeat, sampleCount) {
  const belief = buildOpponentBelief(population, {
    observed: {
      publicHistoryDigest: digest(view),
      turn: view.state.turn,
      seat: opponentSeat,
      publicEvents: [],
    },
    derived: { actionFamilyCounts: {} },
    believed: { confidence: 'high', sampleCount, outOfDistribution: false },
  })
  belief.believed.models = belief.believed.models.map((model) => ({
    ...model,
    probability: model.modelId === 'official-built-in-v1' ? 1 : 0,
    confidence: model.modelId === 'official-built-in-v1' ? 'high' : 'low',
  }))
  return belief
}

async function play({ arm, seed, agentSeat, gameID }) {
  const opponentSeat = 1 - agentSeat
  const playerNames = agentSeat === 0 ? ['beam-agent', 'FcmAI'] : ['FcmAI', 'beam-agent']
  const env = OfflineEnvironment.fromSeed({ seed, playerNames, gameID, gameName: arm.id })
  const beamMetrics = []
  let commands = 0
  let violation = null
  const started = performance.now()
  while (env.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    try {
      const snapshot = env.snapshot()
      const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
      assert.ok(seat >= 0, 'official environment has no known pending seat')
      if (seat === opponentSeat) {
        await env.stepBuiltinAI(seat, `${arm.id}:${seed}:${agentSeat}:${commands}`)
      } else {
        const view = await env.observe(agentSeat)
        const staticResult = deterministicStrategy(view)
        let selected = staticResult.selected
        const eligible = arm.deadlineMs != null
          && beamMetrics.length < protocol.maxBeamDecisions
          && view.state.phase === 5
          && !view.legalActions.isSimulPhase
          && staticResult.ranked.length > 1
        if (eligible) {
          const planned = await scenarioBeamStrategy(view, {
            env,
            seat: agentSeat,
            belief: officialBelief(view, opponentSeat, 2),
            population,
            sampleSeeds: [`${seed}-seat-${agentSeat}-belief-a`, `${seed}-seat-${agentSeat}-belief-b`],
            beamBudget: { ...protocol.beamBudget, deadlineMs: arm.deadlineMs },
          })
          selected = planned.selected
          beamMetrics.push({
            elapsedMs: planned.metrics.elapsedMs,
            stopReason: planned.metrics.stopReason,
            fallbackUsed: planned.metrics.fallbackUsed,
            changedStatic: planned.selected.id !== planned.staticSelected.id,
            staticCandidateId: planned.staticSelected.id,
            selectedCandidateId: planned.selected.id,
            completedRootScenarios: planned.metrics.completedRootScenarios,
            officialTransitions: planned.metrics.officialTransitions,
            maxOwnDepthReached: planned.metrics.maxOwnDepthReached,
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
    arm: arm.id,
    seed,
    agentSeat,
    completed: terminal.state.phase === 10,
    violation,
    commands,
    gameLatencyMs: Math.round(performance.now() - started),
    agentRank: ranking.findIndex((player) => player.index === agentSeat) + 1,
    agentMoney: terminal.state.players[agentSeat].money,
    opponentMoney: terminal.state.players[opponentSeat].money,
    beam: {
      decisions: beamMetrics.length,
      changedStatic: beamMetrics.filter((metric) => metric.changedStatic).length,
      fallbacks: beamMetrics.filter((metric) => metric.fallbackUsed).length,
      decisionP95Ms: percentile95(beamMetrics.map((metric) => metric.elapsedMs)),
      metrics: beamMetrics,
    },
  }
}

const games = []
let gameID = 9821
for (const arm of protocol.arms) {
  for (const seed of protocol.seeds) {
    for (const agentSeat of [0, 1]) {
      games.push(await play({ arm, seed, agentSeat, gameID }))
      gameID += 1
    }
  }
}

const summary = Object.fromEntries(protocol.arms.map((arm) => {
  const samples = games.filter((game) => game.arm === arm.id)
  const safe = samples.filter((game) => game.completed && game.violation == null)
  const decisions = samples.flatMap((game) => game.beam.metrics)
  return [arm.id, {
    games: samples.length,
    completed: samples.filter((game) => game.completed).length,
    violations: samples.filter((game) => game.violation != null).length,
    firstPlaces: safe.filter((game) => game.agentRank === 1).length,
    meanAgentMoney: safe.length
      ? safe.reduce((sum, game) => sum + game.agentMoney, 0) / safe.length : null,
    beamDecisions: decisions.length,
    changedStatic: decisions.filter((metric) => metric.changedStatic).length,
    fallbacks: decisions.filter((metric) => metric.fallbackUsed).length,
    decisionP95Ms: percentile95(decisions.map((metric) => metric.elapsedMs)),
  }]
}))
const report = {
  schemaVersion: 'fcm.scenario-beam-development-league.v2',
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  protocol,
  arms: protocol.arms.map((arm) => arm.id),
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
if (games.some((game) => !game.completed || game.violation != null)) process.exitCode = 2
