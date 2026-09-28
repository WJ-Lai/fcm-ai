#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { summarizeFixedRootCutoffs } from '../src/fixed-root-cutoff.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import { explainTerminalLeafValue } from '../src/terminal-leaf-value.mjs'

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
const modelPath = path.resolve(argument(
  '--model',
  'fixtures/value-calibration-v2/phase-selection.json',
))
const outputPath = path.resolve(argument(
  '--output',
  'fixtures/value-calibration-v2/fixed-root-cutoff-puncture.json',
))
const seed = argument('--seed', 'fcm.fixed-root-cutoff.v1:0')
const rootSpecs = [
  { id: 'middle-hiring', minimumTurn: 4, subphase: 1 },
  { id: 'middle-marketing', minimumTurn: 4, subphase: 3 },
  { id: 'middle-production', minimumTurn: 4, subphase: 4 },
]
const cutoffs = [0, 2, 5, 11]
const candidateLimit = 3
const maxCommands = 700

const selectionText = await readFile(modelPath, 'utf8')
const selection = JSON.parse(selectionText)
assert.equal(selection.promotionStatus, 'not-evaluated')
assert.equal(selection.data?.promotionHoldoutOpened, false)

console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const names = ['cutoff-seat-0', 'cutoff-seat-1']
const environment = OfflineEnvironment.fromSeed({ seed, playerNames: names, gameID: 91001 })
const roots = []
let commands = 0

async function pendingDecision(env) {
  const snapshot = env.snapshot()
  const pendingName = snapshot.currentPlayers?.[0]
  const seat = names.indexOf(pendingName)
  assert.ok(seat >= 0, `unknown pending player ${pendingName}`)
  const view = await env.observe(seat)
  assert.equal(view.legalActions?.yourTurn, true, `seat ${seat} lacks an advertised turn`)
  return { snapshot, seat, view }
}

while (roots.length < rootSpecs.length && environment.snapshot().phase !== 10) {
  assert.ok(commands < maxCommands, 'root discovery exceeded command limit')
  const decision = await pendingDecision(environment)
  const rootSpec = rootSpecs.find((spec) => !roots.some((root) => root.id === spec.id))
  if (
    decision.view.state.turn >= rootSpec.minimumTurn &&
    decision.view.state.phase === 5 &&
    decision.view.state.subphase === rootSpec.subphase &&
    decision.view.legalActions?.isSimulPhase === false
  ) {
    const strategy = deterministicStrategy(decision.view)
    if (strategy.ranked.length > 1) {
      roots.push({
        id: rootSpec.id,
        minimumTurn: rootSpec.minimumTurn,
        seat: decision.seat,
        env: environment.clone(),
        view: decision.view,
        ranked: strategy.ranked,
        snapshotDigest: digest(decision.snapshot),
      })
    }
  }
  if (roots.length >= rootSpecs.length) break
  await environment.step(decision.seat, deterministicStrategy(decision.view).selected.actions)
  commands += 1
}
assert.equal(roots.length, rootSpecs.length, 'failed to discover every fixed root')

async function advanceDeterministic(env) {
  const decision = await pendingDecision(env)
  await env.step(decision.seat, deterministicStrategy(decision.view).selected.actions)
}

const rootReports = []
for (const root of roots) {
  const candidates = prefilterDiverseCandidates(root.ranked, { limit: candidateLimit })
  const trajectories = []
  for (const candidate of candidates) {
    const branch = root.env.clone()
    await branch.step(root.seat, candidate.actions)
    let transitions = 0
    const leafScores = {}
    const leafDetails = {}

    while (branch.snapshot().phase !== 10 && transitions <= cutoffs.at(-1)) {
      if (cutoffs.includes(transitions)) {
        const explained = explainTerminalLeafValue(
          selection.frozenModel,
          await branch.observe(root.seat),
          { seat: root.seat },
        )
        leafScores[transitions] = explained.score
        leafDetails[transitions] = {
          phase: explained.phase,
          abstained: explained.abstained,
        }
      }
      if (transitions === cutoffs.at(-1)) break
      await advanceDeterministic(branch)
      transitions += 1
    }

    while (branch.snapshot().phase !== 10) {
      assert.ok(transitions < maxCommands, `candidate ${candidate.id} exceeded command limit`)
      await advanceDeterministic(branch)
      transitions += 1
    }
    const terminalView = await branch.observe(root.seat)
    const terminalLeaf = explainTerminalLeafValue(selection.frozenModel, terminalView, {
      seat: root.seat,
    })
    for (const cutoff of cutoffs) {
      if (leafScores[cutoff] !== undefined) continue
      leafScores[cutoff] = terminalLeaf.score
      leafDetails[cutoff] = { phase: terminalLeaf.phase, abstained: terminalLeaf.abstained }
    }
    const opponentSeat = root.seat === 0 ? 1 : 0
    const money = terminalView.state.players.map((player) => player.money)
    trajectories.push({
      candidateId: candidate.id,
      intent: candidate.intent,
      leafScores,
      leafDetails,
      terminalMargin: money[root.seat] - money[opponentSeat],
      terminalMoney: money,
      terminalTransitions: transitions,
    })
  }
  const staticOrder = candidates.map((candidate) => candidate.id)
  rootReports.push({
    id: root.id,
    minimumTurn: root.minimumTurn,
    actualTurn: root.view.state.turn,
    phase: root.view.state.phase,
    subphase: root.view.state.subphase,
    seat: root.seat,
    rulesetHash: root.view.rulesetHash,
    snapshotDigest: root.snapshotDigest,
    strategicProjectionDigest: strategicProjectionDigest({ view: root.view }),
    staticOrder,
    candidates: trajectories,
    summary: summarizeFixedRootCutoffs({ staticOrder, cutoffs, candidates: trajectories }),
  })
}

assert.ok(rootReports.every((root) => root.rulesetHash === selection.rulesetHash),
  'root/model ruleset drift')
const aggregateReversals = rootReports.reduce((totals, root) => {
  for (const [name, value] of Object.entries(root.summary.reversals)) totals[name] += value
  return totals
}, { total: 0, towardOracle: 0, awayFromOracle: 0, lateral: 0 })
const report = {
  schemaVersion: 'fcm.fixed-root-cutoff-puncture.v1',
  status: 'diagnostic-not-promotion-evidence',
  seed,
  rulesetHash: selection.rulesetHash,
  modelPath: path.relative(repositoryRoot, modelPath),
  modelDigest: digest(selectionText),
  evaluatorVersion: selection.frozenModel.schemaVersion,
  continuationPolicy: 'fcm.deterministic-strategy.v1',
  candidateGenerator: 'fcm.phase-candidates.v1',
  rootSpecs,
  cutoffs,
  candidateLimit,
  promotionHoldoutOpened: false,
  aggregateReversals,
  roots: rootReports,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({
  output: path.relative(repositoryRoot, outputPath),
  status: report.status,
  aggregateReversals,
  roots: rootReports.map((root) => ({ id: root.id, summary: root.summary })),
  promotionHoldoutOpened: report.promotionHoldoutOpened,
}, null, 2)}\n`)
