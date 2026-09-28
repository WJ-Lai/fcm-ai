#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

import {
  decodeSimpleModel,
  encodeSimpleModel,
  validatePublicReplayCapture,
} from '../src/public-replay.mjs'
import {
  assertReplayParity,
  buildDecisionGroups,
  toDecisionObservation,
  validateDecisionObservation,
} from '../src/replay-observation.mjs'
import { classifyReplayDecisionGroup } from '../src/replay-action-label.mjs'


function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const captureRoot = path.resolve(argument('--captures', 'data/public-replays/pilot-2'))
const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))

await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const browser = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/browser-env.mjs')).href
)
const { FCMAdapter } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/fcm-adapter.mjs')).href
)
const { buildEngineMetadata } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/engine-contract.mjs')).href
)

await browser.setupBrowserEnv()
await browser.loadPersonalStore()
const modules = await browser.loadFCMModules()
const engine = await buildEngineMetadata()
globalThis.alert = (message) => {
  throw new Error(`official engine alert: ${message}`)
}
globalThis.__fcmLocalTransport = async (url) => new Response(
  JSON.stringify(url.includes('/FCM/data/') ? { latest: true } : { latestUpdate: '0' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)


function historyPrefix(capture, throughIndex) {
  return capture.history.slice(0, throughIndex + 1).map((event) => [
    event.eventCode, event.seat, 0, structuredClone(event.payload),
  ])
}


function prepareSourceModel(capture, group) {
  const source = decodeSimpleModel(capture.replay.states[group.sourceIndex])
  const sourcePhase = source[6].phase
  source[6].phase = group.phase
  source[6].turn = group.turn
  source[6].subphase = group.subphase

  if (group.simultaneous) {
    source[6].turnOrder = capture.participants.map((participant) => participant.seat)
  } else if (sourcePhase !== group.phase) {
    if (group.phase === 4) {
      source[6].turnOrder = [...source[6].fullTurnOrder]
    } else {
      const firstActionState = decodeSimpleModel(capture.replay.states[group.eventIndexes[0]])
      source[6].turnOrder = [...firstActionState[6].turnOrder]
    }
  }
  if (!group.simultaneous) {
    // Replay reconstructs action effects but does not advance every UI-only current-player marker.
    // The public history actor is authoritative for whose decision boundary this is.
    source[6].turnOrder = [
      group.seat,
      ...source[6].turnOrder.filter((seat) => seat !== group.seat),
    ]
  }

  source[13] = historyPrefix(capture, group.sourceIndex)
  source[19] = Array.from({ length: source[1].length }, () => -1)
  source[20] = {}
  return source
}


function hydrateActorView(capture, group, source) {
  const seat = group.seat
  const names = capture.participants.map((participant) => participant.id)
  browser.resetStore()
  browser.setInitData({
    startingOptions: capture.ruleset.startingOptions,
    startingMap: capture.ruleset.startingMap,
    playerNames: names,
    displayNames: names,
    gameID: capture.source.gameId,
    name: names[seat],
    pov: seat,
    latestUpdate: String(group.sourceIndex),
    finishedGame: false,
    gameData: 'replay-observation',
    currentPlayers: source[6].turnOrder.map((index) => names[index]),
  })
  modules.model.setInternalStartingOptions(capture.ruleset.startingOptions)
  const store = modules.storeMod.useModelStore()
  store.externalStartingOptions.splice(0)
  store.externalStartingOptions.push(...capture.ruleset.startingOptions)
  modules.funcs.simpleImportWholeFCMmodel(encodeSimpleModel(source))
  browser.setPersonalState({
    gameID: capture.source.gameId,
    name: names[seat],
    pov: seat,
    latestUpdate: String(group.sourceIndex),
  })

  const adapter = new FCMAdapter({ username: names[seat] })
  adapter.ready = true
  adapter.modules = modules
  adapter.playerIndex = seat
  adapter.actorName = names[seat]
  adapter.currentGameID = capture.source.gameId
  adapter.currentVersion = String(group.sourceIndex)
  store.gameName = `Public replay ${capture.source.gameId}`
  modules.controller.startPlayerTurn(group.phase === 5)
  return {
    state: adapter.getState(),
    legalActions: adapter.getLegalActions(seat),
  }
}


const manifest = JSON.parse(await readFile(path.join(captureRoot, 'manifest.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 'fcm.public-replay-manifest.v1', 'unsupported manifest')
const report = []

for (const record of manifest.records) {
  const capture = validatePublicReplayCapture(JSON.parse(gunzipSync(
    await readFile(path.join(captureRoot, record.file)),
  ).toString('utf8')))
  assert.equal(capture.ruleset.classification, 'base-standard', 'only base-standard is approved')
  const groups = buildDecisionGroups(capture)
  const actionTypes = new Set()
  const labelStatusCounts = {}
  const informationLoss = new Map()
  let simultaneous = 0
  for (const group of groups) {
    const label = classifyReplayDecisionGroup(group)
    labelStatusCounts[label.status] = (labelStatusCounts[label.status] ?? 0) + 1
    for (const item of label.informationLoss) informationLoss.set(item.eventCode, item.reason)
    const source = prepareSourceModel(capture, group)
    const { state, legalActions } = hydrateActorView(capture, group, source)
    const observation = toDecisionObservation({
      state,
      legalActions,
      metadata: {
        sourceGameId: capture.source.gameId,
        sourceStateIndex: group.sourceIndex,
        eventIndexes: group.eventIndexes,
        eventCodes: group.events.map((event) => event.eventCode),
        seat: group.seat,
        phase: group.phase,
        subphase: group.subphase,
        simultaneous: group.simultaneous,
        rulesetHash: engine.rulesetHash,
      },
    })
    if (!legalActions.yourTurn) {
      throw new Error(
        `game ${capture.source.gameId} state ${group.sourceIndex} phase ${group.phase} `
        + `subphase ${group.subphase} seat ${group.seat} is not an MCP decision boundary`,
      )
    }
    validateDecisionObservation(observation, { playerCount: capture.participants.length })
    assertReplayParity(observation, source)
    for (const action of legalActions.actions) actionTypes.add(action.type)
    if (group.simultaneous) simultaneous += 1
  }
  report.push({
    gameId: capture.source.gameId,
    rulesetHash: engine.rulesetHash,
    decisionBoundaries: groups.length,
    simultaneousBoundaries: simultaneous,
    labelStatusCounts,
    informationLoss: [...informationLoss].map(([eventCode, reason]) => ({ eventCode, reason })),
    actionTypes: [...actionTypes].sort(),
    omittedPublicFields: ['chat'],
    hiddenFieldsRejected: [
      'reserveCards', 'context', 'preMoveData', 'moveData', 'chosenResCard',
    ],
    status: 'observation-parity-passed-labels-quarantined',
  })
}

process.stdout.write(JSON.stringify({
  schemaVersion: 'fcm.public-replay-observation-audit-report.v1',
  auditedGames: report.length,
  mcpProjection: 'FCMAdapter.getState + FCMAdapter.getLegalActions',
  report,
}, null, 2) + '\n')
