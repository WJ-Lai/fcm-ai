#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { decodeSimpleModel, validatePublicReplayCapture } from '../src/public-replay.mjs'


const root = path.resolve(process.argv[2] ?? '')
if (!process.argv[2]) {
  process.stderr.write('usage: node scripts/audit_public_replays.mjs CAPTURE_DIRECTORY\n')
  process.exit(2)
}

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'fcm.public-replay-manifest.v1') {
  throw new Error('unsupported public replay manifest')
}
if (manifest.completedGames !== manifest.records.length) {
  throw new Error('manifest completedGames differs from record count')
}

const report = []
for (const record of manifest.records) {
  const compressed = await readFile(path.join(root, record.file))
  const capture = validatePublicReplayCapture(JSON.parse(gunzipSync(compressed).toString('utf8')))
  if (capture.source.gameId !== record.gameId) throw new Error(`${record.file}: game id differs`)
  if (capture.integrity.stateDigest !== record.stateDigest) {
    throw new Error(`${record.file}: manifest digest differs`)
  }
  if (capture.integrity.eventCount !== record.events) {
    throw new Error(`${record.file}: manifest event count differs`)
  }
  const identities = new Set()
  for (const state of capture.replay.states) {
    for (const player of decodeSimpleModel(state)[1]) {
      if (player.name) identities.add(player.name)
      if (player.displayName) identities.add(player.displayName)
    }
  }
  const expectedIdentities = new Set(capture.participants.map((participant) => participant.id))
  if (
    identities.size !== expectedIdentities.size
    || [...identities].some((identity) => !expectedIdentities.has(identity))
  ) {
    throw new Error(`${record.file}: non-seat identity found`)
  }
  report.push({
    gameId: record.gameId,
    ruleset: capture.ruleset.classification,
    players: capture.participants.length,
    events: capture.integrity.eventCount,
    states: capture.integrity.stateCount,
    terminalEvent: capture.history.at(-1).eventCode,
    identities: [...identities].sort(),
    stateDigest: capture.integrity.stateDigest,
    trainingStatus: capture.trainingStatus,
  })
}

process.stdout.write(JSON.stringify({ auditedGames: report.length, report }, null, 2) + '\n')
