#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from '../src/baselines.mjs'
import { rankedSampleSummary, wilsonInterval } from '../src/benchmark-stats.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback))
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const episodes = positiveInteger('--episodes', '1')
const maxCommands = positiveInteger('--max-commands', '500')
const players = positiveInteger('--players', '3')
const seedOffset = Number(argument('--seed-offset', '0'))
if (!Number.isSafeInteger(seedOffset) || seedOffset < 0) {
  throw new Error('--seed-offset must be a non-negative integer')
}
if (players < 2 || players > 6) throw new Error('--players must be between 2 and 6')
const policyName = argument('--policy', 'safe-first-legal')
if (!['safe-first-legal', 'random-legal'].includes(policyName)) {
  throw new Error('--policy must be safe-first-legal or random-legal')
}
const opponent = argument('--opponent', 'none')
if (!['none', 'official-builtin'].includes(opponent)) {
  throw new Error('--opponent must be none or official-builtin')
}
const builtinSeatArgument = argument('--builtin-seat', '1')
const builtinSeat = builtinSeatArgument === 'alternate' ? 'alternate' : Number(builtinSeatArgument)
if (builtinSeat !== 'alternate' && (
  !Number.isInteger(builtinSeat) || builtinSeat < 0 || builtinSeat >= players
)) throw new Error('--builtin-seat must identify an existing seat or be alternate')
if (opponent === 'official-builtin' && players !== 2) {
  throw new Error('official-builtin is the original 1v1 policy and requires --players 2')
}

// The legacy engine contains diagnostic console.log calls. Keep stdout as one
// machine-readable JSON document; opt into those diagnostics on stderr only.
console.log = (...items) => {
  if (process.env.FCM_BENCHMARK_TRACE === '1') {
    process.stderr.write(`${items.map((item) => String(item)).join(' ')}\n`)
  }
}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const results = []
for (let episode = 0; episode < episodes; episode += 1) {
  const pairedSeats = opponent === 'official-builtin' && builtinSeat === 'alternate'
  const seedIndex = seedOffset + (pairedSeats ? Math.floor(episode / players) : episode)
  const names = Array.from({ length: players }, (_, seat) => `baseline-${seat}`)
  const episodeBuiltinSeat = builtinSeat === 'alternate' ? episode % players : builtinSeat
  if (opponent === 'official-builtin') names[episodeBuiltinSeat] = 'FcmAI'
  const seatPolicies = names.map((name) => (
    name === 'FcmAI' ? 'official-builtin' : `${policyName}-v1`
  ))
  const env = OfflineEnvironment.fromSeed({
    seed: `benchmark:${seedIndex}:${players}`,
    playerNames: names,
    gameID: episode + 1,
  })
  const started = performance.now()
  const random = seededPolicyRandom(`policy:${policyName}:${seedIndex}:${players}`)
  let commands = 0
  const actionCounts = {}
  let violation = null
  let builtinPolicy = null
  while (env.snapshot().phase !== 10 && commands < maxCommands) {
    try {
      const pending = env.snapshot().currentPlayers
      if (!pending.length) throw new Error('official environment has no pending player before Game Over')
      const seat = names.indexOf(pending[0])
      if (seat < 0) throw new Error(`unknown pending player ${pending[0]}`)
      if (names[seat] === 'FcmAI') {
        actionCounts.official_builtin_ai = (actionCounts.official_builtin_ai ?? 0) + 1
        const transition = await env.stepBuiltinAI(
          seat,
          `builtin:${seedIndex}:${players}:${commands}`,
        )
        builtinPolicy ??= transition.engine.builtinPolicy
        commands += 1
        continue
      }
      const view = await env.observe(seat)
      if (!view.legalActions.yourTurn) throw new Error(`seat ${seat} is pending but has no turn`)
      const actions = policyName === 'random-legal'
        ? randomLegal(view, random)
        : safeFirstLegal(view)
      for (const action of actions) {
        actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1
      }
      await env.step(seat, actions)
    } catch (error) {
      violation = { code: error.code ?? 'ERROR', message: error.message }
      break
    }
    commands += 1
  }
  const terminalView = await env.observe(0)
  const ranking = terminalView.state.players
    .map((player) => ({
      seat: player.index,
      policy: seatPolicies[player.index],
      money: player.money,
      bankrupt: player.bankrupt,
    }))
    .sort((a, b) => b.money - a.money || a.seat - b.seat)
  results.push({
    seed: `benchmark:${seedIndex}:${players}`,
    replicate: episode,
    completed: terminalView.state.phase === 10,
    violations: violation ? 1 : 0,
    error: violation,
    seatPolicies,
    builtinPolicy,
    commands,
    turn: terminalView.state.turn,
    phase: terminalView.state.phase,
    bank: terminalView.state.bank,
    latencyMs: Math.round(performance.now() - started),
    actionCounts,
    stateDigest: {
      activeCampaigns: terminalView.state.campaigns?.length ?? 0,
      demandedItems: (terminalView.state.houseDemands ?? []).reduce(
        (total, demand) => total + (demand?.goods?.length ?? 0),
        0,
      ),
      companies: terminalView.state.players.map((player) => ({
        seat: player.index,
        employees: [...(player.employees ?? [])],
        beach: [...(player.beach ?? [])],
        marketers: [...(player.marketers ?? [])],
        resources: [...(player.resources ?? [])],
      })),
    },
    ranking,
  })
}

const seatRanks = Array.from({ length: players }, (_, seat) => {
  const completed = results.filter((result) => result.completed && !result.violations)
  const ranks = completed.map((result) => (
    result.ranking.findIndex((entry) => entry.seat === seat) + 1
  ))
  const money = completed.map((result) => (
    result.ranking.find((entry) => entry.seat === seat).money
  ))
  return { seat, ...rankedSampleSummary(ranks.map((rank, index) => ({ rank, money: money[index] }))) }
})
const policyResults = [...new Set(results.flatMap((result) => result.seatPolicies))].map((policy) => {
  const samples = results
    .filter((result) => result.completed && !result.violations)
    .flatMap((result) => result.ranking.flatMap((entry, rank) => (
      entry.policy === policy ? [{ rank: rank + 1, money: entry.money }] : []
    )))
  return { policy, ...rankedSampleSummary(samples) }
})
const completedCount = results.filter((result) => result.completed).length
process.stdout.write(`${JSON.stringify({
  benchmarkVersion: 'fcm-benchmark-v1',
  policy: `${policyName}-v1`,
  opponent,
  builtinSeat: opponent === 'official-builtin' ? builtinSeat : null,
  builtinPolicy: results.find((result) => result.builtinPolicy)?.builtinPolicy ?? null,
  players,
  seedOffset,
  summary: {
    completed: completedCount,
    completionRate: completedCount / results.length,
    completionRate95CI: wilsonInterval(completedCount, results.length),
    violations: results.reduce((total, result) => total + result.violations, 0),
    meanLatencyMs: Math.round(
      results.reduce((total, result) => total + result.latencyMs, 0) / results.length,
    ),
    seatRanks,
    policyResults,
  },
  episodes: results,
}, null, 2)}\n`)
if (results.some((result) => !result.completed || result.violations)) process.exitCode = 2
