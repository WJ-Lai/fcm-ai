#!/usr/bin/env node

import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from '../src/baselines.mjs'
import { explainPublicPositionOutcome } from '../src/official-rollout.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import { summarizeValueCalibration, terminalSeatTargets } from '../src/value-calibration.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function nonNegativeInteger(name, fallback) {
  const value = Number(argument(name, fallback))
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be non-negative`)
  return value
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const developmentGames = nonNegativeInteger('--development-games', '3')
const holdoutGames = nonNegativeInteger('--holdout-games', '3')
const maxCommands = nonNegativeInteger('--max-commands', '700')
const summaryOnly = process.argv.includes('--summary-only')
if (developmentGames < 1 || holdoutGames < 1) {
  throw new Error('both development and holdout require at least one game')
}

const profiles = argument('--profiles', 'balanced,growth,cash').split(',').filter(Boolean)
if (!profiles.length) throw new Error('at least one evaluator profile is required')

// Keep stdout as one machine-readable report despite inherited engine diagnostics.
console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

function matchup(gameIndex) {
  const templates = [
    ['deterministic-strategy', 'safe-first-legal'],
    ['random-legal', 'safe-first-legal'],
    ['deterministic-strategy', 'random-legal'],
  ]
  const selected = [...templates[gameIndex % templates.length]]
  return gameIndex % 2 === 0 ? selected : selected.reverse()
}

function choose(policy, view, random) {
  if (policy === 'deterministic-strategy') return deterministicStrategy(view).selected.actions
  if (policy === 'random-legal') return randomLegal(view, random)
  return safeFirstLegal(view)
}

const evidenceByProfile = Object.fromEntries(profiles.map((profile) => [profile, []]))
const games = []
const gameCount = developmentGames + holdoutGames
for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
  const split = gameIndex < developmentGames ? 'development' : 'holdout'
  const splitIndex = split === 'development' ? gameIndex : gameIndex - developmentGames
  const seed = `value-calibration:${split}:${splitIndex}`
  const gameId = `${split}-${splitIndex}`
  const names = ['calibration-0', 'calibration-1']
  // Keep each split stable if the requested size of the other split changes.
  const policies = matchup((split === 'development' ? 0 : 3) + splitIndex)
  const randoms = names.map((_, seat) => seededPolicyRandom(`${seed}:seat:${seat}`))
  const env = OfflineEnvironment.fromSeed({ seed, playerNames: names, gameID: gameIndex + 1 })
  const observations = []
  let lastSampledTurn = null
  let commands = 0
  let error = null

  while (env.snapshot().phase !== 10 && commands < maxCommands) {
    try {
      const snapshot = env.snapshot()
      if (Number.isInteger(snapshot.turn) && snapshot.turn > 0 && snapshot.turn !== lastSampledTurn) {
        const explanations = Object.fromEntries(profiles.map((profile) => [profile, []]))
        for (let seat = 0; seat < names.length; seat += 1) {
          const seatView = await env.observe(seat)
          for (const profile of profiles) {
            explanations[profile].push({
              seat,
              ...explainPublicPositionOutcome(seatView, { seat, profile }),
            })
          }
        }
        observations.push({ turn: snapshot.turn, phase: snapshot.phase, explanations })
        lastSampledTurn = snapshot.turn
      }

      const pendingName = snapshot.currentPlayers?.[0]
      const seat = names.indexOf(pendingName)
      if (seat < 0) throw new Error(`unknown pending player ${pendingName}`)
      const view = await env.observe(seat)
      if (!view.legalActions?.yourTurn) throw new Error(`pending seat ${seat} has no advertised turn`)
      await env.step(seat, choose(policies[seat], view, randoms[seat]))
      commands += 1
    } catch (caught) {
      error = { code: caught.code ?? 'ERROR', message: caught.message }
      break
    }
  }

  const terminalView = await env.observe(0)
  const terminal = terminalView.state.players.map((player) => ({
    seat: player.index,
    money: player.money,
    bankrupt: Boolean(player.bankrupt),
  }))
  const completed = terminalView.state.phase === 10
  if (completed && !error) {
    for (const observation of observations) {
      for (const profile of profiles) {
        evidenceByProfile[profile].push({
          gameId,
          seed,
          split,
          turn: observation.turn,
          phase: observation.phase,
          provenance: {
            observation: 'seat-visible-decision-view',
            target: 'terminal-result',
          },
          predictions: observation.explanations[profile],
          terminal,
        })
      }
    }
  }
  games.push({
    gameId,
    seed,
    split,
    policies,
    commands,
    completed,
    error,
    sampledTurns: observations.map((observation) => observation.turn),
    terminal: terminalSeatTargets(terminal),
  })
}

const completed = games.filter((game) => game.completed && !game.error).length
const profileReports = Object.fromEntries(profiles.map((profile) => [
  profile,
  {
    evaluatorVersion: `fcm.public-position-outcome.v1:${profile}`,
    report: summarizeValueCalibration(evidenceByProfile[profile]),
    ...(summaryOnly ? {} : { evidence: evidenceByProfile[profile] }),
  },
]))
const output = {
  schemaVersion: 'fcm.value-calibration-audit.v1',
  source: 'official-offline-engine',
  developmentGames,
  holdoutGames,
  completed,
  games,
  profiles: profileReports,
  promoted: false,
  promotionBoundary: 'diagnostic only; terminal paired leagues remain required',
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (completed !== gameCount) process.exitCode = 2
