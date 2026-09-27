#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'


function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const fixtureRoot = path.resolve(argument('--fixtures', 'fixtures/base-v1'))
await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { buildEngineMetadata } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/engine-contract.mjs')).href
)
const { EngineRuntime } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/engine-runtime.mjs')).href
)
const { setupBrowserEnv } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/browser-env.mjs')).href
)
await setupBrowserEnv()
globalThis.alert = (message) => { throw new Error(`official engine alert: ${message}`) }
globalThis.__fcmLocalTransport = async (url) => new Response(
  JSON.stringify(url.includes('/FCM/data/') ? { latest: true } : { latestUpdate: '0' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)
const { rulesetHash } = await buildEngineMetadata()
let count = 0
for (const name of (await readdir(fixtureRoot)).filter((item) => item.endsWith('.json'))) {
  const target = path.join(fixtureRoot, name)
  const record = JSON.parse(await readFile(target, 'utf8'))
  const seat = record.expected.actorSeat
  const inspected = await new EngineRuntime().inspect({
    snapshot: record.snapshot,
    actor: { name: record.snapshot.playerNames[seat], seat },
  })
  record.expected.rulesetHash = rulesetHash
  record.expected.legalActionTypes = [
    ...new Set(inspected.legalActions.actions.map((action) => action.type)),
  ].sort()
  await writeFile(target, `${JSON.stringify(record, null, 2)}\n`)
  count += 1
}
process.stdout.write(`updated ${count} fixtures to ruleset ${rulesetHash}\n`)
