#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { rheaStrategy } from '../src/rhea-strategy.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2] ?? 'rhea-intervention-discovery-v7'
assert.match(fixtureName, /^rhea-[a-z0-9-]+$/)
const fixtureDirectory = path.join(root, 'fixtures', fixtureName)
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(fixtureDirectory, 'report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
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

function terminalOutcome(view, agentSeat, commands) {
  const ranking = [...view.state.players]
    .sort((left, right) => right.money - left.money || left.index - right.index)
  const opponentSeat = 1 - agentSeat
  return {
    completed: view.state.phase === 10,
    commands,
    rank: ranking.findIndex((player) => player.index === agentSeat) + 1,
    money: view.state.players[agentSeat].money,
    opponentMoney: view.state.players[opponentSeat].money,
  }
}

function compareOutcome(left, right) {
  if (left.rank !== right.rank) return left.rank < right.rank ? 1 : -1
  if (left.money !== right.money) return left.money > right.money ? 1 : -1
  return 0
}

async function finishBranch(rootEnv, agentSeat, firstCandidate, continuationSeed) {
  const env = rootEnv.clone()
  await env.step(agentSeat, firstCandidate.actions)
  let commands = 1
  let opponentDecision = 0
  while (env.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    const snapshot = env.snapshot()
    const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
    assert.ok(seat >= 0, 'continuation has unknown pending seat')
    if (seat === 1 - agentSeat) {
      await env.stepBuiltinAI(seat, `${continuationSeed}:opponent:${opponentDecision}`)
      opponentDecision += 1
    } else {
      const view = await env.observe(agentSeat)
      await env.step(agentSeat, deterministicStrategy(view).selected.actions)
    }
    commands += 1
  }
  return terminalOutcome(await env.observe(agentSeat), agentSeat, commands)
}

const trajectories = []
const interventions = []
let gameID = 9912
for (const seed of protocol.seeds) {
  for (const agentSeat of protocol.seats) {
    const opponentSeat = 1 - agentSeat
    const playerNames = agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
    const env = OfflineEnvironment.fromSeed({
      seed, playerNames, gameID: gameID++, gameName: 'RHEA intervention discovery',
    })
    const scanned = []
    let commands = 0
    let opponentDecision = 0
    let violation = null
    while (env.snapshot().phase !== 10 && commands < protocol.maxCommands) {
      try {
        const snapshot = env.snapshot()
        const seat = snapshot.playerNames.indexOf(snapshot.currentPlayers[0])
        assert.ok(seat >= 0, 'trajectory has unknown pending seat')
        if (seat === opponentSeat) {
          await env.stepBuiltinAI(seat, `discovery-main:${seed}:${agentSeat}:${opponentDecision}`)
          opponentDecision += 1
        } else {
          const view = await env.observe(agentSeat)
          const staticResult = deterministicStrategy(view)
          if (scanned.length < protocol.maxScannedDecisionsPerTrajectory
            && view.state.phase === 5 && !view.legalActions.isSimulPhase
            && staticResult.ranked.length > 1) {
            const index = scanned.length
            const decisionKey = `rhea-discovery:${seed}:${agentSeat}:${index}`
            const roots = prefilterDiverseCandidates(staticResult.ranked, {
              limit: protocol.maxRootCandidates ?? 2,
            })
            const planned = await rheaStrategy(view, {
              env, seat: agentSeat, population,
              belief: officialBelief(view, opponentSeat),
              sampleSeeds: [`${decisionKey}:belief-a`, `${decisionKey}:belief-b`],
              evolutionSeed: `${decisionKey}:evolution`,
              rheaBudget: protocol.rheaBudget,
              deadlineMs: protocol.externalDeadlineMs,
              headroomRatio: protocol.headroomRatio,
              maxRootCandidates: protocol.maxRootCandidates ?? 2,
            })
            const row = {
              index,
              turn: view.state.turn,
              phase: view.state.phase,
              subphase: view.state.subphase,
              staticCandidateId: planned.staticSelected.id,
              selectedCandidateId: planned.selected.id,
              changedStatic: planned.selected.id !== planned.staticSelected.id,
              elapsedMs: planned.metrics.elapsedMs,
              fallbackUsed: planned.metrics.fallbackUsed,
              stopReason: planned.metrics.stopReason,
              completedGenerations: planned.metrics.completedGenerations,
              uniqueGenomesEvaluated: planned.metrics.uniqueGenomesEvaluated,
              scenarioEvaluations: planned.metrics.scenarioEvaluations,
              bestGenome: planned.bestGenome,
              bestMeanScore: planned.bestMeanScore,
              rootScores: roots.map((candidate, rootIndex) => ({
                candidateId: candidate.id,
                bestMeanScore: Math.max(...planned.evaluated
                  .filter((item) => item.genome[0] === rootIndex)
                  .map((item) => item.meanScore)),
              })),
            }
            scanned.push(row)
            if (row.changedStatic) {
              const continuationSeed = `audit:${seed}:${agentSeat}:${index}`
              const [staticTerminal, selectedTerminal] = await Promise.all([
                finishBranch(env, agentSeat, planned.staticSelected, continuationSeed),
                finishBranch(env, agentSeat, planned.selected, continuationSeed),
              ])
              const comparison = compareOutcome(selectedTerminal, staticTerminal)
              interventions.push({
                seed, agentSeat, ...row,
                staticTerminal,
                selectedTerminal,
                classification: comparison > 0 ? 'beneficial'
                  : comparison < 0 ? 'harmful' : 'neutral',
              })
            }
          }
          await env.step(agentSeat, staticResult.selected.actions)
        }
        commands += 1
      } catch (error) {
        violation = { code: error.code ?? 'ERROR', message: error.message }
        break
      }
    }
    const terminal = await env.observe(agentSeat)
    trajectories.push({
      seed, agentSeat, scanned,
      completed: terminal.state.phase === 10,
      violation,
      commands,
    })
  }
}

const scannedRows = trajectories.flatMap((trajectory) => trajectory.scanned)
const summary = {
  scannedDecisions: scannedRows.length,
  acceptedChanges: interventions.length,
  terminalAudits: interventions.length,
  beneficial: interventions.filter((row) => row.classification === 'beneficial').length,
  harmful: interventions.filter((row) => row.classification === 'harmful').length,
  neutral: interventions.filter((row) => row.classification === 'neutral').length,
  fallbacks: scannedRows.filter((row) => row.fallbackUsed).length,
  trajectoriesCompleted: trajectories.filter((row) => row.completed).length,
  violations: trajectories.filter((row) => row.violation).length,
  maximumDecisionMs: Math.max(...scannedRows.map((row) => row.elapsedMs)),
}
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  summary,
  trajectories,
  interventions,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
  strengthPromoted: false,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, summary, interventions }, null, 2)}\n`)
if (summary.violations || summary.trajectoriesCompleted !== trajectories.length) process.exitCode = 2
