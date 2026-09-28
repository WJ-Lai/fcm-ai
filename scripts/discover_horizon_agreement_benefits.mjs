#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { horizonAgreementScenarioBeamStrategy } from '../src/horizon-agreement.mjs'
import { buildOpponentBelief } from '../src/opponent-population.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2] ?? 'horizon-agreement-discovery-v6'
const protocol = JSON.parse(await readFile(
  path.join(root, `fixtures/${fixtureName}/protocol.json`), 'utf8'))
const population = JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8'))
const outputPath = path.join(root, `fixtures/${fixtureName}/report.json`)

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

function betterThan(left, right) {
  return left.rank < right.rank || (left.rank === right.rank && left.money > right.money)
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
const acceptedInterventions = []
let gameID = 9860
for (const seed of protocol.seeds) {
  for (const agentSeat of protocol.seats) {
    const opponentSeat = 1 - agentSeat
    const playerNames = agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
    const env = OfflineEnvironment.fromSeed({ seed, playerNames, gameID: gameID++, gameName: 'agreement discovery' })
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
            const gated = await horizonAgreementScenarioBeamStrategy(view, {
              env,
              seat: agentSeat,
              belief: officialBelief(view, opponentSeat),
              population,
              sampleSeeds: [`${seed}-seat-${agentSeat}-root-${index}-a`, `${seed}-seat-${agentSeat}-root-${index}-b`],
              beamBudget: protocol.beamBudget,
              deadlineMs: protocol.deadlineMs,
            })
            const row = {
              index,
              turn: view.state.turn,
              phase: view.state.phase,
              subphase: view.state.subphase,
              staticCandidateId: gated.staticSelected.id,
              shallowCandidateId: gated.shallowCandidateId,
              deepCandidateId: gated.deepCandidateId,
              selectedCandidateId: gated.selected.id,
              gateReason: gated.gateReason,
              elapsedMs: gated.metrics.elapsedMs,
            }
            scanned.push(row)
            if (gated.selected.id !== gated.staticSelected.id) {
              const continuationSeed = `accepted:${seed}:${agentSeat}:${index}`
              const [staticTerminal, selectedTerminal] = await Promise.all([
                finishBranch(env, agentSeat, gated.staticSelected, continuationSeed),
                finishBranch(env, agentSeat, gated.selected, continuationSeed),
              ])
              acceptedInterventions.push({
                seed, agentSeat, ...row,
                staticTerminal,
                selectedTerminal,
                selectedBetter: betterThan(selectedTerminal, staticTerminal),
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
  acceptedChanges: acceptedInterventions.length,
  beneficialAcceptedChanges: acceptedInterventions.filter((row) => row.selectedBetter).length,
  trajectoriesCompleted: trajectories.filter((row) => row.completed).length,
  violations: trajectories.filter((row) => row.violation).length,
  gateReasons: Object.fromEntries([...new Set(scannedRows.map((row) => row.gateReason))]
    .map((reason) => [reason, scannedRows.filter((row) => row.gateReason === reason).length])),
  maximumDecisionMs: Math.max(...scannedRows.map((row) => row.elapsedMs)),
}
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  summary,
  trajectories,
  acceptedInterventions,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, summary, acceptedInterventions }, null, 2)}\n`)
if (summary.violations || summary.trajectoriesCompleted !== trajectories.length) process.exitCode = 2
