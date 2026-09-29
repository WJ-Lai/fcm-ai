#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  decisionActionFamily,
  rootPhaseBucket,
  selectCounterfactualRoots,
  validateCounterfactualRootProtocol,
  validateCounterfactualRootReport,
} from '../src/counterfactual-root-suite.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname)
const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const protocolPath = path.resolve(argument(
  '--protocol', 'fixtures/counterfactual-root-suite-v1/protocol.json',
))
const outputPath = path.resolve(argument(
  '--output', 'fixtures/counterfactual-root-suite-v1/report.json',
))
const explore = process.argv.includes('--explore')
const maxCommands = Number(argument('--max-commands', '700'))
assert.ok(Number.isInteger(maxCommands) && maxCommands >= 100, 'max commands must be >= 100')

const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
validateCounterfactualRootProtocol(protocol)

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

async function scanGame(game, gameIndex) {
  const names = Array.from(
    { length: game.playerCount },
    (_, seat) => `root-suite-${explore ? 'explore' : 'collect'}-${gameIndex}-seat-${seat}`,
  )
  const environment = OfflineEnvironment.fromSeed({
    seed: game.seed,
    playerNames: names,
    gameID: 96000 + gameIndex,
    gameName: 'Counterfactual Root Suite v1',
  })
  const roots = []
  let commands = 0
  let decisionIndex = 0
  let rulesetHash = null
  while (environment.snapshot().phase !== 10 && commands < maxCommands) {
    const snapshot = environment.snapshot()
    const actorName = snapshot.currentPlayers?.[0]
    const seat = names.indexOf(actorName)
    assert.ok(seat >= 0, `unknown pending player ${actorName} in ${game.seed}`)
    const view = await environment.observe(seat)
    rulesetHash ??= view.rulesetHash
    assert.equal(view.rulesetHash, rulesetHash, `ruleset drift in ${game.seed}`)
    assert.equal(view.state.mySeat, seat, `seat projection drift in ${game.seed}`)
    assert.equal(view.legalActions?.yourTurn, true, `seat ${seat} lacks a turn in ${game.seed}`)
    const strategy = deterministicStrategy(view)
    const candidates = prefilterDiverseCandidates(strategy.ranked, {
      limit: protocol.candidateLimit,
    })
    if (view.state.turn > 0 && candidates.length >= 2 && snapshot.startingMap?.length) {
      try {
        const actionFamily = decisionActionFamily(view)
        const bucket = rootPhaseBucket(view)
        const candidateIds = candidates.map((candidate) => candidate.id)
        const candidateIntents = candidates.map((candidate) => candidate.intent)
        const mapDigest = digest({
          playerCount: game.playerCount,
          startingMap: snapshot.startingMap,
        })
        const publicProjectionDigest = strategicProjectionDigest({ view })
        const candidateSetDigest = digest(candidates.map((candidate) => ({
          id: candidate.id,
          intent: candidate.intent,
          actions: candidate.actions,
        })))
        roots.push({
          seed: game.seed,
          playerCount: game.playerCount,
          seat,
          decisionIndex,
          turn: view.state.turn,
          phase: view.state.phase,
          subphase: view.state.subphase,
          phaseBucket: bucket,
          actionFamily,
          mapDigest,
          publicProjectionDigest,
          candidateSetDigest,
          rootIdentityDigest: digest({
            seed: game.seed,
            playerCount: game.playerCount,
            seat,
            decisionIndex,
            publicProjectionDigest,
            candidateSetDigest,
          }),
          candidateIds,
          candidateIntents,
        })
      } catch (error) {
        if (!/no substantive legal action family/.test(error.message)) throw error
      }
    }
    await environment.step(seat, strategy.selected.actions)
    commands += 1
    decisionIndex += 1
  }
  return {
    game,
    rulesetHash,
    roots,
    commands,
    reachedGameOver: environment.snapshot().phase === 10,
  }
}

const games = explore ? protocol.explorationGames : protocol.collectionGames
const scans = []
for (const [index, game] of games.entries()) scans.push(await scanGame(game, index))
const rulesetHashes = new Set(scans.map((scan) => scan.rulesetHash))
assert.equal(rulesetHashes.size, 1, 'ruleset drift across root-suite games')
const pool = scans.flatMap((scan) => scan.roots)

function histogram(values) {
  return Object.fromEntries([...new Set(values)].sort().map(
    (value) => [value, values.filter((entry) => entry === value).length],
  ))
}

if (explore) {
  process.stdout.write(`${JSON.stringify({
    mode: 'exploration-only',
    games: scans.map((scan) => ({
      ...scan.game,
      commands: scan.commands,
      roots: scan.roots.length,
      reachedGameOver: scan.reachedGameOver,
    })),
    poolRoots: pool.length,
    byPlayerCount: histogram(pool.map((root) => String(root.playerCount))),
    byPhaseBucket: histogram(pool.map((root) => root.phaseBucket)),
    byActionFamily: histogram(pool.map((root) => root.actionFamily)),
    byJointStratum: histogram(pool.map((root) => [
      root.playerCount, root.seat, root.phaseBucket, root.actionFamily,
    ].join('/'))),
    terminalOutcomeFieldsRead: false,
    reportWritten: false,
  }, null, 2)}\n`)
  process.exit(0)
}

const roots = selectCounterfactualRoots(protocol, pool)
const summary = {
  roots: roots.length,
  twoPlayerRoots: roots.filter((root) => root.playerCount === 2).length,
  threePlayerRoots: roots.filter((root) => root.playerCount === 3).length,
  uniqueSeeds: new Set(roots.map((root) => root.seed)).size,
  uniqueMaps: new Set(roots.map((root) => root.mapDigest)).size,
  phaseBuckets: Object.fromEntries(['early', 'middle', 'late'].map((bucket) => [
    bucket, roots.filter((root) => root.phaseBucket === bucket).length,
  ])),
  actionFamilies: histogram(roots.map((root) => root.actionFamily)),
}
const report = {
  schemaVersion: 'fcm.counterfactual-root-suite-report.v1',
  suiteVersion: protocol.suiteVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  rulesetHash: [...rulesetHashes][0],
  candidateGenerator: protocol.candidateGenerator,
  candidateLimit: protocol.candidateLimit,
  discoveryPolicy: protocol.discoveryPolicy,
  frozenBeforeTerminalSampling: true,
  selectionUsesOutcomeFields: false,
  terminalOutcomeFieldsPersisted: false,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: false,
  roots,
  summary,
}
validateCounterfactualRootReport(report, protocol)
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  output: path.relative(repositoryRoot, outputPath),
  poolRoots: pool.length,
  scannedGames: scans.map((scan) => ({
    ...scan.game, commands: scan.commands, roots: scan.roots.length,
    reachedGameOver: scan.reachedGameOver,
  })),
  summary,
  terminalOutcomeFieldsRead: false,
  promotionHoldoutOpened: false,
}, null, 2)}\n`)
