#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { auditPairedSequentialDataset } from '../src/paired-sequential-estimator.mjs'
import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import { extractTerminalValueFeatures } from '../src/terminal-value-v2.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2] ?? 'rhea-hire-stability-v9'
assert.match(fixtureName, /^rhea-[a-z0-9-]+$/)
const fixtureDirectory = path.join(root, 'fixtures', fixtureName)
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const sequentialProtocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/paired-sequential-v1/protocol.json'), 'utf8'))
const sourceReport = JSON.parse(await readFile(
  path.join(root, 'fixtures/rhea-root-breadth-v8/report.json'), 'utf8'))
const outputPath = path.join(fixtureDirectory, 'report.json')
const priorReport = protocol.resumeFrom == null ? null : JSON.parse(await readFile(
  path.join(root, protocol.resumeFrom), 'utf8'))

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function matchesInteraction(features, interaction) {
  if (interaction == null) return null
  return Object.entries(interaction.predicate).every(([name, condition]) => {
    const value = features[name]
    if (Object.hasOwn(condition, 'equals') && value !== condition.equals) return false
    if (Object.hasOwn(condition, 'minimum') && value < condition.minimum) return false
    if (Object.hasOwn(condition, 'maximum') && value > condition.maximum) return false
    return true
  })
}

async function pendingSeat(environment, names) {
  const snapshot = environment.snapshot()
  const seat = names.indexOf(snapshot.currentPlayers?.[0])
  assert.ok(seat >= 0, `unknown pending player ${snapshot.currentPlayers?.[0]}`)
  return { snapshot, seat, view: await environment.observe(seat) }
}

async function reconstructRoot(target) {
  const names = target.agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
  const environment = OfflineEnvironment.fromSeed({
    seed: target.seed, playerNames: names, gameID: target.gameID,
    gameName: 'RHEA intervention discovery',
  })
  let commands = 0
  let opponentDecision = 0
  let scanned = 0
  while (environment.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    const decision = await pendingSeat(environment, names)
    if (decision.seat === 1 - target.agentSeat) {
      await environment.stepBuiltinAI(
        decision.seat,
        `discovery-main:${target.seed}:${target.agentSeat}:${opponentDecision}`,
      )
      opponentDecision += 1
    } else {
      const staticResult = deterministicStrategy(decision.view)
      const eligible = decision.view.state.phase === 5
        && !decision.view.legalActions.isSimulPhase
        && staticResult.ranked.length > 1
      if (eligible && scanned === target.scanIndex) {
        const candidates = prefilterDiverseCandidates(staticResult.ranked, { limit: 3 })
        assert.deepEqual(
          [candidates[0].id, candidates[2].id],
          [target.staticCandidateId, target.alternateCandidateId],
          `candidate drift at ${target.rootId}`,
        )
        const strategicDigest = strategicProjectionDigest({ view: decision.view })
        const publicFeatures = extractTerminalValueFeatures(
          decision.view, { seat: target.agentSeat })
        return {
          environment, names,
          candidates: [candidates[0], candidates[2]],
          strategicProjectionDigest: strategicDigest,
          publicFeatures,
          rootIdentityDigest: digest({
            strategicProjectionDigest: strategicDigest,
            publicFeatures,
            candidateIds: [candidates[0].id, candidates[2].id],
          }),
        }
      }
      if (eligible) scanned += 1
      await environment.step(target.agentSeat, staticResult.selected.actions)
    }
    commands += 1
  }
  throw new Error(`failed to reconstruct ${target.rootId}`)
}

async function completeBranch(reconstructed, target, candidate, sample) {
  const branch = reconstructed.environment.clone()
  await branch.step(target.agentSeat, candidate.actions)
  let commands = 1
  let opponentDecision = 0
  const base = `audit:${target.seed}:${target.agentSeat}:${target.scanIndex}`
  const sampleKey = sample === 0 ? base : `${base}:sample-${sample}`
  while (branch.snapshot().phase !== 10 && commands < protocol.maxCommands) {
    const decision = await pendingSeat(branch, reconstructed.names)
    if (decision.seat === 1 - target.agentSeat) {
      await branch.stepBuiltinAI(
        decision.seat, `${sampleKey}:opponent:${opponentDecision}`,
      )
      opponentDecision += 1
    } else {
      await branch.step(target.agentSeat, deterministicStrategy(decision.view).selected.actions)
    }
    commands += 1
  }
  const terminal = await branch.observe(target.agentSeat)
  assert.equal(terminal.state.phase, 10, `${target.rootId}/${candidate.id}/sample-${sample} incomplete`)
  const opponentSeat = 1 - target.agentSeat
  const ranking = [...terminal.state.players]
    .sort((left, right) => right.money - left.money || left.index - right.index)
  return {
    completed: true,
    terminalMargin: terminal.state.players[target.agentSeat].money -
      terminal.state.players[opponentSeat].money,
    terminalRank: ranking.findIndex((player) => player.index === target.agentSeat) + 1,
    terminalMoney: terminal.state.players[target.agentSeat].money,
    terminalCommands: commands,
  }
}

const roots = []
for (const target of protocol.targets) {
  const reconstructed = await reconstructRoot(target)
  const source = sourceReport.interventions.find((row) => (
    row.seed === target.seed && row.agentSeat === target.agentSeat &&
    row.index === target.scanIndex
  ))
  assert.ok(source, `missing source intervention ${target.rootId}`)
  const candidates = []
  for (const candidate of reconstructed.candidates) {
    const priorRoot = priorReport?.roots.find((entry) => entry.rootId === target.rootId) ?? null
    if (priorReport) {
      assert.ok(priorRoot, `resume source lacks root ${target.rootId}`)
      if (priorRoot.strategicProjectionDigest) {
        assert.equal(priorRoot.strategicProjectionDigest, reconstructed.strategicProjectionDigest,
          `resume strategic projection drift at ${target.rootId}`)
      }
      if (priorRoot.rootIdentityDigest) {
        assert.equal(priorRoot.rootIdentityDigest, reconstructed.rootIdentityDigest,
          `resume root identity drift at ${target.rootId}`)
      }
    }
    const priorCandidate = priorRoot?.candidates.find((entry) => entry.candidateId === candidate.id)
      ?? null
    if (priorRoot) assert.ok(priorCandidate, `resume source lacks candidate ${candidate.id}`)
    const terminalMargins = priorCandidate ? [...priorCandidate.terminalMargins] : []
    const terminalRanks = priorCandidate ? [...priorCandidate.terminalRanks] : []
    const terminalMoney = priorCandidate ? [...priorCandidate.terminalMoney] : []
    const terminalCommands = priorCandidate ? [...priorCandidate.terminalCommands] : []
    const completed = priorCandidate ? [...priorCandidate.completed] : []
    assert.ok(terminalMargins.length <= protocol.sampleCount, 'resume source exceeds sample target')
    for (let sample = terminalMargins.length; sample < protocol.sampleCount; sample += 1) {
      const result = await completeBranch(reconstructed, target, candidate, sample)
      terminalMargins.push(result.terminalMargin)
      terminalRanks.push(result.terminalRank)
      terminalMoney.push(result.terminalMoney)
      terminalCommands.push(result.terminalCommands)
      completed.push(result.completed)
    }
    const expected = candidate.id === target.staticCandidateId
      ? source.staticTerminal : source.selectedTerminal
    assert.equal(terminalRanks[0], expected.rank, `${target.rootId}/${candidate.id} rank drift`)
    assert.equal(terminalMoney[0], expected.money, `${target.rootId}/${candidate.id} money drift`)
    candidates.push({
      candidateId: candidate.id,
      terminalMargins,
      terminalRanks,
      terminalMoney,
      terminalCommands,
      completed,
    })
  }
  roots.push({
    rootId: target.rootId,
    strategicProjectionDigest: reconstructed.strategicProjectionDigest,
    rootIdentityDigest: reconstructed.rootIdentityDigest,
    publicFeatures: protocol.predeclaredInteraction == null
      ? undefined : reconstructed.publicFeatures,
    interactionMatched: matchesInteraction(
      reconstructed.publicFeatures, protocol.predeclaredInteraction),
    sampleZeroReproduced: true,
    candidates,
  })
}

const estimatorDataset = {
  roots: roots.map((entry) => ({
    rootId: entry.rootId,
    candidates: entry.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      terminalMargins: candidate.terminalMargins,
    })),
  })),
}
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  sampleCount: protocol.sampleCount,
  resumedFromSampleCount: priorReport?.sampleCount ?? null,
  predeclaredInteraction: protocol.predeclaredInteraction ?? null,
  roots,
  audit: auditPairedSequentialDataset(estimatorDataset, sequentialProtocol),
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, audit: report.audit, roots }, null, 2)}\n`)
