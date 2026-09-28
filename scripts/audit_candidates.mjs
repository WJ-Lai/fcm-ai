#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { safeFirstLegal } from '../src/baselines.mjs'
import { generateCandidates } from '../src/candidates.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback))
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const seeds = positiveInteger('--seeds', '2')
const maxCommands = positiveInteger('--max-commands', '500')
console.log = () => {}
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const results = []
let invalid = 0
let totalCandidates = 0
let totalGenerationMs = 0
const phaseCoverage = new Map()

for (let seed = 0; seed < seeds; seed += 1) {
  const names = ['candidate-audit-0', 'candidate-audit-1']
  const env = OfflineEnvironment.fromSeed({
    seed: `candidate-audit:${seed}`, playerNames: names, gameID: seed + 1,
  })
  let commands = 0
  while (env.snapshot().phase !== 10 && commands < maxCommands) {
    const pending = env.snapshot().currentPlayers
    const seat = names.indexOf(pending[0])
    if (seat < 0) throw new Error(`unknown pending player ${pending[0]}`)
    const view = await env.observe(seat)
    const started = performance.now()
    const candidates = generateCandidates(view)
    totalGenerationMs += performance.now() - started
    totalCandidates += candidates.length
    const key = `${view.state.phase}/${view.state.subphase}`
    phaseCoverage.set(key, (phaseCoverage.get(key) ?? 0) + candidates.length)
    for (const candidate of candidates) {
      try {
        await env.clone().step(seat, candidate.actions)
      } catch (error) {
        invalid += 1
        results.push({
          seed, command: commands, phase: view.state.phase, subphase: view.state.subphase,
          candidateId: candidate.id, intent: candidate.intent,
          error: { code: error.code ?? 'ERROR', message: error.message },
        })
      }
    }
    await env.step(seat, safeFirstLegal(view))
    commands += 1
  }
  if (env.snapshot().phase !== 10) {
    invalid += 1
    results.push({ seed, error: { code: 'INCOMPLETE', message: `exceeded ${maxCommands} commands` } })
  }
}

const output = {
  schemaVersion: 'fcm.candidate-audit.v1',
  seeds,
  totalCandidates,
  invalid,
  meanGenerationMs: totalCandidates ? totalGenerationMs / totalCandidates : 0,
  phaseCoverage: Object.fromEntries([...phaseCoverage].sort()),
  failures: results,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (invalid > 0) process.exitCode = 2
