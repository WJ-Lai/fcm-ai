#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateActionRegretDataset } from '../src/action-regret-dataset.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import {
  TERMINAL_VALUE_FEATURE_NAMES,
  TERMINAL_VALUE_FEATURE_VERSION,
  extractTerminalValueFeatures,
  terminalValueFeatureVector,
} from '../src/terminal-value-v2.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const split = argument('--split', 'development')
const outputPath = path.resolve(argument(
  '--output',
  `fixtures/action-regret-v1/${split}.json`,
))
const protocolPath = path.resolve(argument(
  '--protocol',
  'fixtures/action-regret-v1/protocol.json',
))
const maxCommands = 700
const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
assert.equal(protocol.schemaVersion, 'fcm.action-regret-protocol.v1')
assert.ok(Array.isArray(protocol.splits?.[split]) && protocol.splits[split].length > 0,
  `unknown or empty split ${split}`)
if (split === 'promotion-holdout' && protocol.promotionHoldoutOpened !== true) {
  throw new Error('promotion holdout is sealed by the frozen protocol')
}

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

async function collectSeed(seed, seedIndex) {
  const names = [`regret-${split}-${seedIndex}-0`, 'FcmAI']
  const environment = OfflineEnvironment.fromSeed({
    seed,
    playerNames: names,
    gameID: 92000 + seedIndex,
  })
  const roots = []
  let commands = 0

  async function pendingDecision(env) {
    const snapshot = env.snapshot()
    const seat = names.indexOf(snapshot.currentPlayers?.[0])
    assert.ok(seat >= 0, `unknown pending player ${snapshot.currentPlayers?.[0]}`)
    const view = await env.observe(seat)
    assert.equal(view.legalActions?.yourTurn, true, `seat ${seat} lacks an advertised turn`)
    return { snapshot, seat, view }
  }

  while (roots.length < protocol.rootSpecs.length && environment.snapshot().phase !== 10) {
    assert.ok(commands < maxCommands, `root discovery exceeded ${maxCommands} commands`)
    const decision = await pendingDecision(environment)
    const rootSpec = protocol.rootSpecs.find(
      (spec) => !roots.some((root) => root.spec.id === spec.id),
    )
    if (
      decision.seat === 0 &&
      decision.view.state.turn >= rootSpec.minimumTurn &&
      decision.view.state.phase === rootSpec.phase &&
      decision.view.state.subphase === rootSpec.subphase &&
      decision.view.legalActions?.isSimulPhase === false
    ) {
      const strategy = deterministicStrategy(decision.view)
      if (strategy.ranked.length > 1) {
        roots.push({
          spec: rootSpec,
          seat: decision.seat,
          env: environment.clone(),
          view: decision.view,
          ranked: strategy.ranked,
          snapshotDigest: digest(decision.snapshot),
        })
      }
    }
    if (roots.length >= protocol.rootSpecs.length) break
    if (decision.seat === 1) {
      await environment.stepBuiltinAI(1, `${seed}:discovery:${commands}`)
    } else {
      await environment.step(0, deterministicStrategy(decision.view).selected.actions)
    }
    commands += 1
  }
  assert.equal(roots.length, protocol.rootSpecs.length, `seed ${seed} missed a declared root`)

  async function advanceContinuation(env, step) {
    const decision = await pendingDecision(env)
    if (decision.seat === 1) {
      return env.stepBuiltinAI(1, `${seed}:continuation:${step}`)
    }
    return env.step(0, deterministicStrategy(decision.view).selected.actions)
  }

  const records = []
  for (const root of roots) {
    const candidates = prefilterDiverseCandidates(root.ranked, { limit: protocol.candidateLimit })
    assert.ok(candidates.length >= 2 && candidates.length <= protocol.candidateLimit,
      `${root.spec.id} candidate count is outside the frozen bound`)
    const candidateRecords = []
    for (const [staticRank, candidate] of candidates.entries()) {
      const branch = root.env.clone()
      await branch.step(root.seat, candidate.actions)
      const postActionView = await branch.observe(root.seat)
      const opponentSeat = root.seat === 0 ? 1 : 0
      const seatVector = terminalValueFeatureVector(
        extractTerminalValueFeatures(postActionView, { seat: root.seat }),
      )
      const opponentVector = terminalValueFeatureVector(
        extractTerminalValueFeatures(postActionView, { seat: opponentSeat }),
      )
      let terminalCommands = 1
      let builtinPolicy = null
      while (branch.snapshot().phase !== 10) {
        assert.ok(terminalCommands < maxCommands,
          `candidate ${candidate.id} exceeded ${maxCommands} commands`)
        const transition = await advanceContinuation(branch, terminalCommands)
        builtinPolicy ??= transition?.engine?.builtinPolicy ?? null
        terminalCommands += 1
      }
      const terminalView = await branch.observe(root.seat)
      const terminalMoney = terminalView.state.players.map((player) => player.money)
      candidateRecords.push({
        candidateId: candidate.id,
        staticRank,
        postActionPairFeatures: seatVector.map(
          (value, index) => value - opponentVector[index],
        ),
        terminalMargin: terminalMoney[root.seat] - terminalMoney[opponentSeat],
        terminalMoney,
        terminalCommands,
        builtinPolicy,
      })
    }
    records.push({
      rootId: `${split}-${String(seedIndex).padStart(2, '0')}-${root.spec.id}`,
      seed,
      seat: root.seat,
      turn: root.view.state.turn,
      phase: root.view.state.phase,
      subphase: root.view.state.subphase,
      snapshotDigest: root.snapshotDigest,
      strategicProjectionDigest: strategicProjectionDigest({ view: root.view }),
      candidates: candidateRecords,
    })
  }
  return records
}

const roots = []
for (const [seedIndex, seed] of protocol.splits[split].entries()) {
  roots.push(...await collectSeed(seed, seedIndex))
}
const rulesetHashes = new Set()
for (const root of roots) {
  const environment = OfflineEnvironment.fromSeed({
    seed: root.seed,
    playerNames: ['ruleset-0', 'ruleset-1'],
    gameID: 1,
  })
  rulesetHashes.add((await environment.observe(0)).rulesetHash)
}
assert.equal(rulesetHashes.size, 1, 'ruleset drift inside action-regret dataset')

const dataset = {
  schemaVersion: 'fcm.action-regret-dataset.v1',
  protocolVersion: protocol.protocolVersion,
  split,
  rulesetHash: [...rulesetHashes][0],
  featureVersion: TERMINAL_VALUE_FEATURE_VERSION,
  featureNames: [...TERMINAL_VALUE_FEATURE_NAMES],
  continuationPolicy: protocol.continuationPolicy,
  candidateGenerator: 'fcm.phase-candidates.v1',
  candidateLimit: protocol.candidateLimit,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
  roots,
}
const validation = validateActionRegretDataset(dataset, {
  allowPromotionHoldout: protocol.promotionHoldoutOpened === true,
})
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  output: path.relative(repositoryRoot, outputPath),
  split,
  ...validation,
  rulesetHash: dataset.rulesetHash,
  terminalMargins: roots.map((root) => ({
    rootId: root.rootId,
    margins: root.candidates.map((candidate) => candidate.terminalMargin),
  })),
  promotionHoldoutOpened: dataset.promotionHoldoutOpened,
}, null, 2)}\n`)
