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
import {
  extractTerminalValueFeatures, TERMINAL_VALUE_FEATURE_NAMES,
} from '../src/terminal-value-v2.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureDirectory = path.join(root, 'fixtures/rhea-training-context-v15')
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const sourceProtocol = JSON.parse(await readFile(path.join(root, protocol.sourceProtocol), 'utf8'))
const sourceReport = JSON.parse(await readFile(path.join(root, protocol.sourceReport), 'utf8'))
const outputPath = path.join(fixtureDirectory, 'report.json')

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function reconstruct(target) {
  const names = target.agentSeat === 0 ? ['policy-agent', 'FcmAI'] : ['FcmAI', 'policy-agent']
  const environment = OfflineEnvironment.fromSeed({
    seed: target.seed, playerNames: names, gameID: target.gameID,
    gameName: 'RHEA intervention discovery',
  })
  let commands = 0
  let opponentDecision = 0
  let scanned = 0
  while (environment.snapshot().phase !== 10 && commands < sourceProtocol.maxCommands) {
    const snapshot = environment.snapshot()
    const seat = names.indexOf(snapshot.currentPlayers?.[0])
    assert.ok(seat >= 0, 'unknown pending seat')
    if (seat === 1 - target.agentSeat) {
      await environment.stepBuiltinAI(
        seat, `discovery-main:${target.seed}:${target.agentSeat}:${opponentDecision}`,
      )
      opponentDecision += 1
    } else {
      const view = await environment.observe(target.agentSeat)
      const staticResult = deterministicStrategy(view)
      const eligible = view.state.phase === 5 && !view.legalActions.isSimulPhase
        && staticResult.ranked.length > 1
      if (eligible && scanned === target.scanIndex) {
        const candidates = prefilterDiverseCandidates(staticResult.ranked, {
          limit: protocol.candidateLimit,
        })
        assert.deepEqual(
          [candidates[0].id, candidates[2].id],
          [target.staticCandidateId, target.alternateCandidateId],
          `candidate drift at ${target.rootId}`,
        )
        return {
          rootId: target.rootId,
          strategicProjectionDigest: strategicProjectionDigest({ view }),
          features: extractTerminalValueFeatures(view, { seat: target.agentSeat }),
          candidates: [candidates[0], candidates[2]].map((candidate) => ({
            candidateId: candidate.id,
            intent: candidate.intent,
            actions: candidate.actions,
            score: candidate.score,
            scoreBreakdown: candidate.scoreBreakdown,
          })),
        }
      }
      if (eligible) scanned += 1
      await environment.step(target.agentSeat, staticResult.selected.actions)
    }
    commands += 1
  }
  throw new Error(`failed to reconstruct ${target.rootId}`)
}

const roots = []
for (const target of sourceProtocol.targets) {
  const reconstructed = await reconstruct(target)
  const source = sourceReport.roots.find((entry) => entry.rootId === target.rootId)
  assert.ok(source, `source report lacks ${target.rootId}`)
  assert.equal(reconstructed.strategicProjectionDigest, source.strategicProjectionDigest,
    `strategic projection drift at ${target.rootId}`)
  const audit = sourceReport.audit.details.find((entry) => entry.rootId === target.rootId)
  roots.push({
    ...reconstructed,
    terminalStatus: audit.status,
    selectedCandidateId: audit.selectedCandidateId,
  })
}
const differences = TERMINAL_VALUE_FEATURE_NAMES
  .filter((name) => roots[0].features[name] !== roots[1].features[name])
  .map((name) => ({ name, left: roots[0].features[name], right: roots[1].features[name] }))
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  featureVersion: roots[0].features.version,
  roots,
  differences,
  predeclaredInteraction: protocol.predeclaredInteraction,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`)
}
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({ output: outputPath, differences, roots }, null, 2)}\n`)
