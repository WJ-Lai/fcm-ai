#!/usr/bin/env node

import assert from 'node:assert/strict'
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  auditActionRegretStability,
  prepareActionRegretStabilityResume,
  validateActionRegretStability,
} from '../src/action-regret-stability.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const protocolPath = path.resolve(argument(
  '--protocol',
  'fixtures/action-regret-stability-v1/protocol.json',
))
const outputPath = path.resolve(argument(
  '--output',
  'fixtures/action-regret-stability-v1/report.json',
))
const sourceRoot = path.resolve(argument('--source-root', 'fixtures/action-regret-v2'))
const resumeRequested = process.argv.includes('--resume')
const maxCommands = 700
const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
assert.equal(protocol.schemaVersion, 'fcm.action-regret-stability-protocol.v1')
assert.equal(protocol.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
assert.ok(Number.isInteger(protocol.sampleCount) && protocol.sampleCount >= 2)
assert.ok(Array.isArray(protocol.targets) && protocol.targets.length > 0)

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const sourceDatasets = new Map()
for (const split of new Set(protocol.targets.map((target) => target.sourceSplit))) {
  const dataset = JSON.parse(await readFile(path.join(sourceRoot, `${split}.json`), 'utf8'))
  assert.equal(dataset.split, split)
  assert.equal(dataset.promotionHoldoutOpened, false)
  sourceDatasets.set(split, dataset)
}
let outputExists = true
try {
  await access(outputPath)
} catch {
  outputExists = false
}
assert.ok(resumeRequested || !outputExists,
  'output already exists; pass --resume to preserve verified samples')
assert.ok(!resumeRequested || outputExists, 'cannot resume a missing output file')
let resumePlan = null
if (resumeRequested) {
  const existing = JSON.parse(await readFile(outputPath, 'utf8'))
  const targets = protocol.targets.map((target) => {
    const source = sourceDatasets.get(target.sourceSplit).roots.find(
      (root) => root.rootId === target.rootId,
    )
    assert.ok(source, `unknown source root ${target.rootId}`)
    return {
      rootId: target.rootId,
      candidateIds: source.candidates.map((candidate) => candidate.candidateId),
    }
  })
  resumePlan = prepareActionRegretStabilityResume(existing, {
    requestedSampleCount: protocol.sampleCount,
    targets,
  })
}

async function pendingDecision(environment, names) {
  const snapshot = environment.snapshot()
  const seat = names.indexOf(snapshot.currentPlayers?.[0])
  assert.ok(seat >= 0, `unknown pending player ${snapshot.currentPlayers?.[0]}`)
  const view = await environment.observe(seat)
  assert.equal(view.legalActions?.yourTurn, true, `seat ${seat} lacks an advertised turn`)
  return { snapshot, seat, view }
}

async function reconstructRoot(source, split) {
  const seedIndex = Number(source.rootId.split('-')[1])
  assert.ok(Number.isInteger(seedIndex), `invalid root seed index ${source.rootId}`)
  const names = [`regret-${split}-${seedIndex}-0`, 'FcmAI']
  const environment = OfflineEnvironment.fromSeed({
    seed: source.seed,
    playerNames: names,
    gameID: 92000 + seedIndex,
  })
  let commands = 0
  while (environment.snapshot().phase !== 10) {
    assert.ok(commands < maxCommands, `root reconstruction exceeded ${maxCommands} commands`)
    const decision = await pendingDecision(environment, names)
    if (
      decision.seat === source.seat &&
      decision.view.state.turn === source.turn &&
      decision.view.state.phase === source.phase &&
      decision.view.state.subphase === source.subphase
    ) {
      assert.equal(strategicProjectionDigest({ view: decision.view }),
        source.strategicProjectionDigest,
      `strategic projection reconstruction drift for ${source.rootId}`)
      const candidates = prefilterDiverseCandidates(deterministicStrategy(decision.view).ranked, {
        limit: source.candidates.length,
      })
      assert.deepEqual(
        candidates.map((candidate) => candidate.id),
        source.candidates.map((candidate) => candidate.candidateId),
        `candidate reconstruction drift for ${source.rootId}`,
      )
      return { environment, names, candidates }
    }
    if (decision.seat === 1) {
      await environment.stepBuiltinAI(1, `${source.seed}:discovery:${commands}`)
    } else {
      await environment.step(0, deterministicStrategy(decision.view).selected.actions)
    }
    commands += 1
  }
  throw new Error(`root ${source.rootId} was not reconstructed`)
}

async function completeBranch(root, source, candidate, sample) {
  const branch = root.environment.clone()
  await branch.step(source.seat, candidate.actions)
  let commands = 1
  while (branch.snapshot().phase !== 10) {
    assert.ok(commands < maxCommands,
      `${source.rootId}/${candidate.id}/sample-${sample} exceeded ${maxCommands} commands`)
    const decision = await pendingDecision(branch, root.names)
    if (decision.seat === 1) {
      const sampleKey = sample === 0
        ? `${source.seed}:continuation:${commands}`
        : `${source.seed}:continuation-sample-${sample}:${commands}`
      await branch.stepBuiltinAI(1, sampleKey)
    } else {
      await branch.step(0, deterministicStrategy(decision.view).selected.actions)
    }
    commands += 1
  }
  const terminal = await branch.observe(source.seat)
  const opponentSeat = source.seat === 0 ? 1 : 0
  return {
    terminalMargin: terminal.state.players[source.seat].money -
      terminal.state.players[opponentSeat].money,
    terminalCommands: commands,
  }
}

const roots = []
let rulesetHash = null
for (const target of protocol.targets) {
  assert.ok(['development', 'calibration'].includes(target.sourceSplit),
    `invalid source split ${target.sourceSplit}`)
  const dataset = sourceDatasets.get(target.sourceSplit)
  const source = dataset.roots.find((root) => root.rootId === target.rootId)
  assert.ok(source, `unknown source root ${target.rootId}`)
  assert.ok([1, 3, 4].includes(source.subphase),
    `stability puncture does not support subphase ${source.subphase} at ${target.rootId}`)
  rulesetHash ??= dataset.rulesetHash
  assert.equal(dataset.rulesetHash, rulesetHash, 'source ruleset drift')
  const root = await reconstructRoot(source, target.sourceSplit)
  const priorRoot = resumePlan?.roots.find((stored) => stored.rootId === source.rootId) ?? null
  const candidates = []
  for (const candidate of root.candidates) {
    const priorCandidate = priorRoot?.candidates.find(
      (stored) => stored.candidateId === candidate.id,
    ) ?? null
    const terminalMargins = priorCandidate ? [...priorCandidate.terminalMargins] : []
    const terminalCommands = priorCandidate ? [...priorCandidate.terminalCommands] : []
    for (let sample = terminalMargins.length; sample < protocol.sampleCount; sample += 1) {
      const result = await completeBranch(root, source, candidate, sample)
      terminalMargins.push(result.terminalMargin)
      terminalCommands.push(result.terminalCommands)
    }
    const original = source.candidates.find((stored) => stored.candidateId === candidate.id)
    assert.equal(terminalMargins[0], original.terminalMargin,
      `baseline continuation drift for ${source.rootId}/${candidate.id}`)
    candidates.push({ candidateId: candidate.id, terminalMargins, terminalCommands })
  }
  roots.push({
    rootId: source.rootId,
    sourceSplit: target.sourceSplit,
    snapshotDigest: source.snapshotDigest,
    strategicProjectionDigest: source.strategicProjectionDigest,
    candidates,
  })
}

const dataset = {
  schemaVersion: 'fcm.action-regret-stability.v1',
  rulesetHash,
  continuationPolicy: protocol.continuationPolicy,
  sampleCount: protocol.sampleCount,
  resumedFromSampleCount: resumePlan?.previousSampleCount ?? null,
  promotionHoldoutOpened: false,
  roots,
}
const validation = validateActionRegretStability(dataset)
const audit = auditActionRegretStability(dataset)
const report = { ...dataset, audit }
const temporaryPath = `${outputPath}.tmp`
await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
await rename(temporaryPath, outputPath)
process.stdout.write(`${JSON.stringify({ output: outputPath, validation, audit }, null, 2)}\n`)
