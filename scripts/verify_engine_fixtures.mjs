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
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)
const { setupBrowserEnv } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/browser-env.mjs')).href
)

await setupBrowserEnv()
const engineErrors = []
const originalConsoleError = console.error
const originalConsoleLog = console.log
console.error = (...items) => {
  engineErrors.push(items.map((item) => String(item)).join(' '))
  originalConsoleError(...items)
}
console.log = (...items) => {
  const line = items.map((item) => String(item)).join(' ')
  if (line.startsWith('Error:')) engineErrors.push(line)
  originalConsoleLog(...items)
}
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
  const economy = result.state.decisionSupport?.economyPlayers
  assert.equal(economy?.length, result.state.players.length, `${name}: economic player count drift`)
  for (const [index, player] of economy.entries()) {
    assert.equal(player.seat, index, `${name}: economic seat drift`)
    assert.ok(player.freeSlots >= 0, `${name}: negative free slots`)
    assert.ok(player.salary.due >= 0, `${name}: negative salary`)
    assert.ok(Number.isFinite(player.price.unit), `${name}: invalid unit price`)
    assert.ok(Number.isFinite(player.price.discount), `${name}: invalid price discount`)
    assert.equal(
      player.company.ceoReports.length,
      player.company.ceoSlots,
      `${name}: CEO slot decoding drift`,
    )
    assert.ok(player.capacities.recruiting.total >= 0, `${name}: invalid recruiting capacity`)
    assert.ok(player.capacities.training.total >= 0, `${name}: invalid training capacity`)
    assert.ok(Array.isArray(player.capacities.production), `${name}: missing production capacity`)
    assert.ok(Array.isArray(player.capacities.marketing), `${name}: missing marketing capacity`)
  }
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
const environment = new OfflineEnvironment({ snapshot: dinnerInput })
const branch = environment.clone()
const transition = await branch.step(actor.seat, [{ type: 'end_turn' }])
const actualSnapshot = transition.after
assert.equal(actualSnapshot.latestUpdate, nextVersion, 'offline step did not advance version')
const actual = await new EngineRuntime().inspect({ snapshot: actualSnapshot, actor })
assert.equal(projected.after.bank, actual.state.bank, 'projected dinner bank differs from live result')
assert.deepEqual(
  projected.after.players.map(({ money, resources }) => ({ money, resources })),
  actual.state.players.map(({ money, resources }) => ({ money, resources })),
  'projected dinner player economy differs from live result',
)
assert.deepEqual(projected.after.houseDemands, actual.state.houseDemands, 'projected needs differ from live result')
assert.deepEqual(dinnerInput, beforeDinner.snapshot, 'dinner projection mutated its source snapshot')
assert.deepEqual(environment.snapshot(), dinnerInput, 'cloned offline branch mutated its parent')

const restructure = records.get('phase-03-subphase-01-seat-01.json')
assert.ok(restructure, 'restructuring fixture is missing')
const simultaneous = new OfflineEnvironment({ snapshot: restructure.snapshot })
for (const name of [...simultaneous.snapshot().currentPlayers]) {
  const seat = restructure.snapshot.playerNames.indexOf(name)
  assert.ok(seat >= 0, `unknown pending restructuring player ${name}`)
  const legal = await simultaneous.legal(seat)
  const placement = legal.actions.find((action) => action.type === 'place_employees')
  const count = Math.min(placement?.beach?.length ?? 0, placement?.slots?.length ?? 0)
  const actions = count > 0
    ? [{
        type: 'place_employees',
        employees: placement.beach.slice(0, count),
        slots: placement.slots.slice(0, count),
      }]
    : [{ type: 'end_turn' }]
  await simultaneous.step(seat, actions)
}
assert.equal(simultaneous.snapshot().phase, 4, 'simultaneous restructuring did not resolve')
await new Promise((resolve) => setTimeout(resolve, 25))
assert.deepEqual(engineErrors, [], `background engine errors: ${engineErrors.join('\n')}`)

process.stdout.write(
  `verified ${names.length} immutable fixtures, dinner parity, cloning and simultaneous resolution\n`,
)
process.exit(0)
