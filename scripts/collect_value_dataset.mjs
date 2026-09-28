#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { randomLegal, safeFirstLegal, seededPolicyRandom } from '../src/baselines.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import {
  TERMINAL_VALUE_FEATURE_NAMES,
  TERMINAL_VALUE_FEATURE_VERSION,
  extractTerminalValueFeatures,
} from '../src/terminal-value-v2.mjs'
import { validateValueDataset } from '../src/value-dataset.mjs'
import { listValueDatasetGames } from '../src/value-dataset-protocol.mjs'

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
const split = argument('--split', 'development')
const start = nonNegativeInteger('--start', '0')
const allSpecs = listValueDatasetGames(split)
const requestedLimit = nonNegativeInteger('--limit', String(allSpecs.length - start))
const specs = allSpecs.slice(start, start + requestedLimit)
const maxCommands = nonNegativeInteger('--max-commands', '700')
const outputPath = argument('--output', null)
if (!specs.length) throw new Error('selected dataset slice is empty')

const protocolManifest = JSON.parse(await readFile(
  new URL('../fixtures/value-calibration-v2/protocol.json', import.meta.url),
  'utf8',
))
if (split === 'promotion-holdout' && protocolManifest.promotionHoldoutOpened !== true) {
  throw new Error('promotion holdout is sealed by the frozen protocol manifest')
}

// Preserve one JSON stdout document despite inherited engine diagnostics.
console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

function playerNames(policies) {
  return policies.map((policy, seat) => policy === 'official-builtin' ? 'FcmAI' : `value-v2-${seat}`)
}

function choose(policy, view, random) {
  if (policy === 'deterministic-strategy') return deterministicStrategy(view).selected.actions
  if (policy === 'random-legal') return randomLegal(view, random)
  if (policy === 'safe-first-legal') return safeFirstLegal(view)
  throw new Error(`policy ${policy} requires the official builtin adapter`)
}

const games = []
let rulesetHash = null
for (const spec of specs) {
  const names = playerNames(spec.policies)
  const env = OfflineEnvironment.fromSeed({
    seed: spec.seed,
    playerNames: names,
    gameID: spec.index + 1,
  })
  const randoms = names.map((_, seat) => seededPolicyRandom(`${spec.seed}:policy:${seat}`))
  const initialView = await env.observe(0)
  if (!/^[a-f0-9]{64}$/.test(initialView.rulesetHash ?? '')) {
    throw new Error('official engine did not provide a valid ruleset hash')
  }
  if (rulesetHash != null && rulesetHash !== initialView.rulesetHash) {
    throw new Error(`ruleset drift inside dataset: ${rulesetHash} != ${initialView.rulesetHash}`)
  }
  rulesetHash = initialView.rulesetHash
  const observations = []
  let lastSampledTurn = null
  let commands = 0
  let error = null
  let builtinPolicy = null

  while (env.snapshot().phase !== 10 && commands < maxCommands) {
    try {
      const snapshot = env.snapshot()
      if (Number.isInteger(snapshot.turn) && snapshot.turn > 0 && snapshot.turn !== lastSampledTurn) {
        const seats = []
        for (let seat = 0; seat < names.length; seat += 1) {
          const view = await env.observe(seat)
          seats.push({ seat, policy: spec.policies[seat], features: extractTerminalValueFeatures(view) })
        }
        observations.push({ turn: snapshot.turn, phase: snapshot.phase, seats })
        lastSampledTurn = snapshot.turn
      }

      const pendingName = snapshot.currentPlayers?.[0]
      const seat = names.indexOf(pendingName)
      if (seat < 0) throw new Error(`unknown pending player ${pendingName}`)
      const policy = spec.policies[seat]
      if (policy === 'official-builtin') {
        const transition = await env.stepBuiltinAI(seat, `${spec.seed}:builtin:${commands}`)
        builtinPolicy ??= transition.engine.builtinPolicy
      } else {
        const view = await env.observe(seat)
        if (!view.legalActions?.yourTurn) {
          throw new Error(`pending seat ${seat} has no advertised turn`)
        }
        await env.step(seat, choose(policy, view, randoms[seat]))
      }
      commands += 1
    } catch (caught) {
      error = { code: caught.code ?? 'ERROR', message: caught.message }
      break
    }
  }

  const terminalView = await env.observe(0)
  games.push({
    gameId: spec.gameId,
    seed: spec.seed,
    policies: [...spec.policies],
    builtinPolicy,
    completed: terminalView.state.phase === 10,
    commands,
    error,
    observations,
    terminal: terminalView.state.players
      .map((player) => ({ seat: player.index, money: player.money, bankrupt: Boolean(player.bankrupt) }))
      .sort((left, right) => left.seat - right.seat),
  })
}

const dataset = {
  schemaVersion: 'fcm.value-feature-dataset.v2',
  protocolVersion: protocolManifest.protocolVersion,
  rulesetHash,
  split,
  promotionHoldoutOpened: protocolManifest.promotionHoldoutOpened,
  featureVersion: TERMINAL_VALUE_FEATURE_VERSION,
  featureNames: [...TERMINAL_VALUE_FEATURE_NAMES],
  engine: 'official-offline-engine',
  games,
}
const validation = validateValueDataset(dataset, {
  allowPromotionHoldout: protocolManifest.promotionHoldoutOpened === true,
})
if (outputPath) {
  await writeFile(path.resolve(outputPath), `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'fcm.value-feature-collection-result.v2',
    output: path.resolve(outputPath),
    split,
    ...validation,
    commandCounts: games.map((game) => game.commands),
  }, null, 2)}\n`)
} else {
  process.stdout.write(`${JSON.stringify(dataset, null, 2)}\n`)
}
