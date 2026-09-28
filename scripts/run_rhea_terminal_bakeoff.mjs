#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { reserveDeadlineHeadroom } from '../src/horizon-agreement.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { rheaStrategy } from '../src/rhea-strategy.mjs'
import { scenarioBeamStrategy } from '../src/scenario-beam-strategy.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = 'rhea-terminal-bakeoff-v6'
const fixtureDirectory = path.join(root, 'fixtures', fixtureName)
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(fixtureDirectory, 'report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function percentile95(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

function officialBelief(view, opponentSeat) {
  const belief = buildOpponentBelief(population, {
    observed: {
      publicHistoryDigest: digest(view), turn: view.state.turn,
      seat: opponentSeat, publicEvents: [],
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

async function plan(arm, view, env, seat, opponentSeat, decisionKey) {
  const staticResult = deterministicStrategy(view)
  const sampleSeeds = [`${decisionKey}:belief-a`, `${decisionKey}:belief-b`]
  if (arm === 'beam-3000ms') {
    const result = await scenarioBeamStrategy(view, {
      env, seat, population, sampleSeeds,
      belief: officialBelief(view, opponentSeat),
      beamBudget: {
        ...protocol.beamBudget,
        deadlineMs: reserveDeadlineHeadroom(
          protocol.externalDeadlineMs, protocol.headroomRatio,
        ),
      },
    })
    return {
      selected: result.selected,
      metric: {
        elapsedMs: result.metrics.elapsedMs,
        fallbackUsed: result.metrics.fallbackUsed,
        stopReason: result.metrics.stopReason,
        changedStatic: result.selected.id !== result.staticSelected.id,
        staticCandidateId: result.staticSelected.id,
        selectedCandidateId: result.selected.id,
        work: result.metrics.officialTransitions,
      },
    }
  }
  if (arm === 'rhea-3000ms') {
    const result = await rheaStrategy(view, {
      env, seat, population, sampleSeeds,
      evolutionSeed: `${decisionKey}:evolution`,
      belief: officialBelief(view, opponentSeat),
      rheaBudget: protocol.rheaBudget,
      deadlineMs: protocol.externalDeadlineMs,
      headroomRatio: protocol.headroomRatio,
    })
    return {
      selected: result.selected,
      metric: {
        elapsedMs: result.metrics.elapsedMs,
        fallbackUsed: result.metrics.fallbackUsed,
        stopReason: result.metrics.stopReason,
        changedStatic: result.selected.id !== result.staticSelected.id,
        staticCandidateId: result.staticSelected.id,
        selectedCandidateId: result.selected.id,
        work: result.metrics.scenarioEvaluations,
      },
    }
  }
  return { selected: staticResult.selected, metric: null }
}

async function play({ arm, seed, agentSeat, gameID }) {
  const opponentSeat = 1 - agentSeat
  const playerNames = agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
  const env = OfflineEnvironment.fromSeed({ seed, playerNames, gameID, gameName: arm })
  const metrics = []
  let commands = 0
  let opponentDecision = 0
  let violation = null
  const started = performance.now()
  while (env.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    try {
      const snapshot = env.snapshot()
      const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
      assert.ok(seat >= 0, 'official environment has no known pending seat')
      if (seat === opponentSeat) {
        await env.stepBuiltinAI(seat, `common-opponent:${seed}:${agentSeat}:${opponentDecision}`)
        opponentDecision += 1
      } else {
        const view = await env.observe(agentSeat)
        const staticResult = deterministicStrategy(view)
        const eligible = arm !== 'static'
          && metrics.length < protocol.maxPlannerDecisions
          && view.state.phase === 5
          && !view.legalActions.isSimulPhase
          && staticResult.ranked.length > 1
        if (eligible) {
          const planned = await plan(
            arm, view, env, agentSeat, opponentSeat,
            `common-plan:${seed}:${agentSeat}:${metrics.length}`,
          )
          metrics.push(planned.metric)
          await env.step(agentSeat, planned.selected.actions)
        } else {
          await env.step(agentSeat, staticResult.selected.actions)
        }
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
    arm, seed, agentSeat,
    completed: terminal.state.phase === 10,
    violation,
    commands,
    gameLatencyMs: Math.round(performance.now() - started),
    agentRank: ranking.findIndex((player) => player.index === agentSeat) + 1,
    agentMoney: terminal.state.players[agentSeat].money,
    opponentMoney: terminal.state.players[opponentSeat].money,
    planner: {
      decisions: metrics.length,
      changedStatic: metrics.filter((metric) => metric.changedStatic).length,
      fallbacks: metrics.filter((metric) => metric.fallbackUsed).length,
      decisionP95Ms: percentile95(metrics.map((metric) => metric.elapsedMs)),
      metrics,
    },
  }
}

const games = []
let gameID = 9900
for (const arm of protocol.arms) {
  for (const seed of protocol.seeds) {
    for (const agentSeat of protocol.seats) {
      games.push(await play({ arm, seed, agentSeat, gameID: gameID++ }))
    }
  }
}

const summary = Object.fromEntries(protocol.arms.map((arm) => {
  const samples = games.filter((game) => game.arm === arm)
  const safe = samples.filter((game) => game.completed && game.violation == null)
  const decisions = samples.flatMap((game) => game.planner.metrics)
  return [arm, {
    games: samples.length,
    completed: samples.filter((game) => game.completed).length,
    violations: samples.filter((game) => game.violation != null).length,
    firstPlaces: safe.filter((game) => game.agentRank === 1).length,
    meanAgentMoney: safe.length
      ? safe.reduce((sum, game) => sum + game.agentMoney, 0) / safe.length : null,
    plannerDecisions: decisions.length,
    changedStatic: decisions.filter((metric) => metric.changedStatic).length,
    fallbacks: decisions.filter((metric) => metric.fallbackUsed).length,
    decisionP95Ms: percentile95(decisions.map((metric) => metric.elapsedMs)),
  }]
}))
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  arms: protocol.arms,
  summary,
  games,
  privatePayloadPersisted: false,
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
