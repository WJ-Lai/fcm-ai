#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'


function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const fixtureRoot = path.resolve(argument('--fixtures', 'fixtures/base-v1'))
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { EngineRuntime } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/engine-runtime.mjs')).href
)
const { setupBrowserEnv } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/browser-env.mjs')).href
)

await setupBrowserEnv()
globalThis.alert = (message) => {
  throw new Error(`official engine alert: ${message}`)
}

globalThis.__fcmLocalTransport = async (url) => new Response(
  JSON.stringify(url.includes('/FCM/data/') ? { latest: true } : { latestUpdate: '0' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)

const names = (await readdir(fixtureRoot)).filter((name) => name.endsWith('.json')).sort()
assert.ok(names.length > 0, 'no engine fixtures found')
const records = new Map()

for (const name of names) {
  process.stdout.write(`checking ${name}\n`)
  const record = JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'))
  records.set(name, record)
  const before = JSON.stringify(record.snapshot)
  const seat = record.expected.actorSeat
  const runtime = new EngineRuntime()
  const result = await runtime.inspect({
    snapshot: record.snapshot,
    actor: { name: record.snapshot.playerNames[seat], seat },
  })
  const actionTypes = [...new Set(result.legalActions.actions.map((action) => action.type))].sort()
  assert.equal(result.state.phase, record.expected.phase, `${name}: phase drift`)
  assert.equal(result.state.subphase, record.expected.subphase, `${name}: subphase drift`)
  assert.deepEqual(actionTypes, record.expected.legalActionTypes, `${name}: legal-action drift`)
  assert.equal(result.rulesetHash, record.expected.rulesetHash, `${name}: ruleset drift`)
  assert.equal(JSON.stringify(record.snapshot), before, `${name}: inspect mutated source snapshot`)
}

const beforeDinner = records.get('phase-05-subphase-07-seat-00.json')
assert.ok(beforeDinner, 'pre-dinner parity fixture is missing')
const dinnerInput = structuredClone(beforeDinner.snapshot)
const dinnerRuntime = new EngineRuntime()
const actor = {
  name: dinnerInput.playerNames[beforeDinner.expected.actorSeat],
  seat: beforeDinner.expected.actorSeat,
}
const projected = await dinnerRuntime.projectDinner({
  snapshot: dinnerInput,
  actor,
})
const nextVersion = String(BigInt(dinnerInput.latestUpdate) + 1n)
const actualRuntime = new EngineRuntime()
const transition = await actualRuntime.executeBatch({
  snapshot: structuredClone(dinnerInput),
  actor,
  expectedVersion: dinnerInput.latestUpdate,
  actions: [{ type: 'end_turn' }],
  transportContext: {
    existingMoves: [],
    pendingPlayerNames: dinnerInput.currentPlayers,
    acceptedPhases: [5],
    nextVersion,
    sideData: '',
  },
})
assert.ok(transition.canonicalSave, 'official end-turn transition produced no canonical save')
const actualSnapshot = {
  ...structuredClone(dinnerInput),
  gameData: transition.canonicalSave.gameData,
  phase: transition.canonicalSave.phase,
  turn: transition.canonicalSave.turn,
  latestUpdate: nextVersion,
  startingMap: transition.canonicalSave.mapTiles ?? dinnerInput.startingMap,
  currentPlayers: transition.canonicalSave.nextPlayer ?? [],
}
const actual = await new EngineRuntime().inspect({ snapshot: actualSnapshot, actor })
assert.equal(projected.after.bank, actual.state.bank, 'projected dinner bank differs from live result')
assert.deepEqual(
  projected.after.players.map(({ money, resources }) => ({ money, resources })),
  actual.state.players.map(({ money, resources }) => ({ money, resources })),
  'projected dinner player economy differs from live result',
)
assert.deepEqual(projected.after.houseDemands, actual.state.houseDemands, 'projected needs differ from live result')
assert.deepEqual(dinnerInput, beforeDinner.snapshot, 'dinner projection mutated its source snapshot')

process.stdout.write(`verified ${names.length} immutable engine fixtures and official dinner-transition parity\n`)
process.exit(0)
