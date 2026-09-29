#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

console.log = () => {}
import '../../obg-server-fcm-agent-rebased/mcp-server/register-hook.mjs'
import { OfflineEnvironment } from '../../obg-server-fcm-agent-rebased/mcp-server/offline-environment.mjs'

import { prefilterDiverseCandidates } from '../src/rollout-planner.mjs'
import { strategicProjectionDigest } from '../src/strategic-abstraction.mjs'
import { deterministicStrategy } from '../src/strategy.mjs'
import { extractTerminalValueFeatures } from '../src/terminal-value-v2.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2] ?? 'rhea-training-pair-roots-v19'
assert.match(fixtureName, /^rhea-[a-z0-9-]+$/, 'invalid fixture name')
const fixtureDirectory = path.join(root, 'fixtures', fixtureName)
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const outputPath = path.join(fixtureDirectory, 'report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function exactCandidatePair(candidates) {
  if (candidates.length < 3) return null
  const [staticCandidate, alternateCandidate] = [candidates[0], candidates[2]]
  if (staticCandidate.id !== protocol.eligibility.staticCandidateId
    || alternateCandidate.id !== protocol.eligibility.alternateCandidateId) return null
  assert.deepEqual(staticCandidate.actions, protocol.eligibility.staticActions)
  assert.deepEqual(alternateCandidate.actions, protocol.eligibility.alternateActions)
  return [staticCandidate, alternateCandidate]
}

function classifierMatch(features) {
  const classifier = protocol.contextClassifier
  if (classifier == null) return null
  const value = features[classifier.feature]
  assert.ok(Number.isFinite(value), `classifier feature ${classifier.feature} is unavailable`)
  if (classifier.operator === '<=') return value <= classifier.threshold
  if (classifier.operator === '==') return value === classifier.threshold
  throw new Error(`unsupported classifier operator ${classifier.operator}`)
}

async function scanTrajectory(seed, agentSeat, gameID) {
  const names = agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
  const environment = OfflineEnvironment.fromSeed({
    seed, playerNames: names, gameID, gameName: 'RHEA training pair validation',
  })
  let commands = 0
  let opponentDecision = 0
  let scanned = 0
  let trainingScanned = 0
  while (environment.snapshot().phase !== 10 && commands < protocol.maxCommands
    && scanned < protocol.maxScannedDecisionsPerTrajectory) {
    const snapshot = environment.snapshot()
    const seat = names.indexOf(snapshot.currentPlayers?.[0])
    assert.ok(seat >= 0, `unknown pending player in ${seed}/seat-${agentSeat}`)
    if (seat === 1 - agentSeat) {
      await environment.stepBuiltinAI(
        seat, `training-pair-main:${seed}:${agentSeat}:${opponentDecision}`)
      opponentDecision += 1
    } else {
      const view = await environment.observe(agentSeat)
      const staticResult = deterministicStrategy(view)
      const eligibleDecision = view.state.phase === protocol.eligibility.phase
        && !view.legalActions.isSimulPhase
        && staticResult.ranked.length > 1
      if (eligibleDecision) {
        const scanIndex = scanned
        scanned += 1
        const isTrainingDecision = view.state.subphase === protocol.eligibility.subphase
        const trainingScanIndex = isTrainingDecision ? trainingScanned : null
        if (isTrainingDecision) trainingScanned += 1
        const candidates = isTrainingDecision
          ? prefilterDiverseCandidates(staticResult.ranked, { limit: protocol.candidateLimit })
          : []
        const pair = isTrainingDecision ? exactCandidatePair(candidates) : null
        if (view.state.turn === protocol.eligibility.turn && pair != null) {
          const publicFeatures = extractTerminalValueFeatures(view, { seat: agentSeat })
          const projectionDigest = strategicProjectionDigest({ view })
          const candidateIds = pair.map((candidate) => candidate.id)
          return {
            root: {
              rootId: `${seed}-seat-${agentSeat}-index-${scanIndex}`,
              seed,
              agentSeat,
              scanIndex,
              trainingScanIndex,
              gameID,
              turn: view.state.turn,
              phase: view.state.phase,
              subphase: view.state.subphase,
              strategicProjectionDigest: projectionDigest,
              publicFeatures,
              classifierMatched: classifierMatch(publicFeatures),
              candidateIds,
              candidateActions: pair.map((candidate) => candidate.actions),
              rootIdentityDigest: digest({
                strategicProjectionDigest: projectionDigest,
                publicFeatures,
                candidateIds,
              }),
            },
            scannedDecisions: scanned,
            trainingScannedDecisions: trainingScanned,
            commands,
          }
        }
      }
      await environment.step(agentSeat, staticResult.selected.actions)
    }
    commands += 1
  }
  return {
    root: null, scannedDecisions: scanned,
    trainingScannedDecisions: trainingScanned, commands,
  }
}

const roots = []
const trajectories = []
let gameID = protocol.gameIdStart
for (const seed of protocol.seeds) {
  for (const agentSeat of protocol.seats) {
    const result = await scanTrajectory(seed, agentSeat, gameID)
    trajectories.push({
      seed, agentSeat, gameID, scannedDecisions: result.scannedDecisions,
      trainingScannedDecisions: result.trainingScannedDecisions,
      commands: result.commands, rootFound: result.root != null,
    })
    if (result.root) roots.push(result.root)
    gameID += 1
  }
}

const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  frozenBeforeTerminalSampling: true,
  candidateWideHypothesis: protocol.candidateWideHypothesis,
  contextClassifier: protocol.contextClassifier ?? null,
  trajectories,
  roots,
  terminalOutcomeFieldsPersisted: false,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
assert.equal(protocol.terminalOutcomesAllowed, false)
assert.equal(roots.length, protocol.expectedFrozenRoots
  ?? protocol.candidateWideHypothesis?.gate.minimumFrozenRoots,
  'fresh root discovery did not meet the preregistered root count')
assert.equal(new Set(roots.map((entry) => entry.rootIdentityDigest)).size, roots.length,
  'duplicate normalized root identity')
if (protocol.contextClassifier) {
  const matchedRoots = roots.filter((entry) => entry.classifierMatched).length
  const unmatchedRoots = roots.length - matchedRoots
  assert.ok(matchedRoots >= protocol.contextClassifier.validation.minimumMatchedRoots,
    'classifier-matched root count is below the preregistered minimum')
  assert.ok(unmatchedRoots >= protocol.contextClassifier.validation.minimumUnmatchedRoots,
    'classifier-unmatched root count is below the preregistered minimum')
  report.classBalance = { matchedRoots, unmatchedRoots }
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of [
  '_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData',
  'terminalMoney', 'terminalRank', 'terminalMargin', 'classification',
]) {
  assert.equal(serialized.includes(forbidden), false, `report leaked forbidden field ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, roots: roots.length, trajectories }, null, 2)}\n`)
