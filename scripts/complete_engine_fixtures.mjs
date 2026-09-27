#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'


function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const fixtureRoot = path.resolve(argument('--fixtures', 'fixtures/base-v1'))
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { FCMAdapter } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/fcm-adapter.mjs')).href
)
globalThis.__fcmLocalTransport = async (url) => new Response(
  JSON.stringify(url.includes('/FCM/data/') ? { latest: true } : { latestUpdate: '0' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)

async function readFixture(name) {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'))
}

function fixtureKey(phase, subphase, seat) {
  const subphaseLabel = Number.isInteger(subphase)
    ? String(subphase).padStart(2, '0')
    : String(subphase).replace('.', '_')
  return `phase-${String(phase).padStart(2, '0')}-subphase-${subphaseLabel}-seat-${String(seat).padStart(2, '0')}`
}

async function synthesize(source, { phase, subphase, prepare = () => {} }) {
  const snapshot = structuredClone(source.snapshot)
  const seat = snapshot.mySeat
  const adapter = new FCMAdapter({ username: snapshot.playerNames[seat], latestUpdate: snapshot.latestUpdate })
  await adapter.loadSnapshot(snapshot, { actorName: snapshot.playerNames[seat], actorSeat: seat })
  const store = adapter.store
  const reference = adapter.modules.reference

  store.gameflow.phase = phase
  store.gameflow.subphase = subphase
  store.gameflow.turnOrder = [seat]
  store.gameflow.fullTurnOrder = [seat]
  store.context.justTrained = []
  store.context.justBuilt = []
  store.context.justOpened = []
  prepare({ store, player: store.players[seat], reference })

  snapshot.phase = phase
  snapshot.currentPlayers = [snapshot.playerNames[seat]]
  snapshot.chatData = ''
  snapshot.moveData = ''
  snapshot.gameData = adapter.exportBlob(false)

  const state = adapter.getState()
  const legal = adapter.getLegalActions(seat)
  const key = fixtureKey(phase, subphase, seat)
  const record = {
    fixtureVersion: 'fcm-engine-fixture-v1',
    key,
    snapshot,
    expected: {
      phase: state.phase,
      subphase: state.subphase,
      actorSeat: seat,
      sourceVersion: String(snapshot.latestUpdate),
      rulesetHash: source.expected.rulesetHash,
      legalActionTypes: [...new Set(legal.actions.map((action) => action.type))].sort(),
    },
    provenance: {
      kind: 'official-engine-synthetic',
      sourceFixture: source.key,
      note: 'Only phase/context and reachable employee holdings were prepared; rules and legal actions come from the official JavaScript engine.',
    },
  }
  await writeFile(path.join(fixtureRoot, `${key}.json`), `${JSON.stringify(record, null, 2)}\n`)
  process.stdout.write(`${key}: ${record.expected.legalActionTypes.join(', ')}\n`)
}

const setup = await readFixture('phase-00-subphase-01-seat-01.json')
await synthesize(setup, { phase: 1, subphase: 1 })

const workday = await readFixture('phase-05-subphase-03-seat-00.json')
await synthesize(workday, {
  phase: 5,
  subphase: 2,
  prepare({ store, player, reference }) {
    player.employees.push(reference.TRAINER)
    player.beach.push(reference.RECRUITING_GIRL)
    store.availableEmployees[reference.RECRUITING_MANAGER] = Math.max(
      1, store.availableEmployees[reference.RECRUITING_MANAGER] ?? 0,
    )
  },
})
await synthesize(workday, {
  phase: 5,
  subphase: 5,
  prepare({ player, reference }) {
    player.employees.push(reference.NEW_BUSINESS_DEVELOPER)
  },
})
await synthesize(workday, {
  phase: 5,
  subphase: 6,
  prepare({ player, reference }) {
    player.employees.push(reference.LOCAL_MANAGER)
  },
})

process.exit(0)
