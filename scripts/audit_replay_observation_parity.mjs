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
import {
  ACTION_LABEL_STATUS,
  classifyEngineReplayFailure,
  classifyReplayDecisionGroup,
  markLabelEngineIncompatible,
  markLabelEngineReplayed,
} from '../src/replay-action-label.mjs'
import { mapReplayDecisionGroup } from '../src/replay-action-mapper.mjs'
import {
  decisionBatchShape,
  decisionPatternKey,
  exactCandidateRank,
  marketingEffectSignature,
  projectedCandidateRank,
  winnerSeatsFromPlayers,
} from '../src/candidate-imitation.mjs'
import { generateCandidates } from '../src/candidates.mjs'
import { rankCandidates } from '../src/strategy.mjs'


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
  adapter.rebindActions()
  store.gameName = `Public replay ${capture.source.gameId}`
  modules.controller.startPlayerTurn(group.phase === 5)
  return {
    state: adapter.getState(),
    legalActions: adapter.getLegalActions(seat),
    adapter,
    store,
  }
}


function plain(value) {
  return JSON.parse(JSON.stringify(value))
}


function verifyActionEffects(group, store, target) {
  const seat = group.seat
  const codes = new Set(group.events.map((event) => event.eventCode))
  const actualPlayer = plain(store.players[seat])
  const targetPlayer = target[1][seat]
  if (codes.has(1) || codes.has(14) || codes.has(15)) {
    assert.deepEqual(actualPlayer.restaurants, targetPlayer.restaurants, 'restaurant effect differs')
  }
  if (codes.has(2)) {
    const choice = group.events.find((event) => event.eventCode === 2).payload[0]
    assert.equal(store.reserveCards[seat], choice, 'reserve card differs')
  }
  if (codes.has(3)) {
    assert.deepEqual(
      actualPlayer.employees.filter((employee) => employee !== modules.reference.BLANK_EMPLOYEE_SPACE),
      targetPlayer.employees,
      'structure employees differ',
    )
    assert.deepEqual(
      [...actualPlayer.beach].sort((left, right) => left - right),
      [...targetPlayer.beach].sort((left, right) => left - right),
      'structure beach differs',
    )
  }
  if (codes.has(5)) {
    const position = group.events.find((event) => event.eventCode === 5).payload[0]
    assert.equal(store.gameflow.newTurnOrder[position], seat, 'turn-order choice differs')
  }
  if (codes.has(7) || codes.has(8)) {
    assert.deepEqual(actualPlayer.employees, targetPlayer.employees, 'employee structure differs')
    assert.deepEqual(actualPlayer.beach, targetPlayer.beach, 'employee beach differs')
    assert.deepEqual(plain(store.availableEmployees), target[3], 'employee supply differs')
  }
  if (codes.has(9)) {
    assert.deepEqual(plain(store.campaigns), target[7], 'marketing campaign effect differs')
    assert.deepEqual(actualPlayer.marketers, targetPlayer.marketers, 'marketer effect differs')
    assert.deepEqual(plain(store.availableMarketingCampaigns), target[2], 'campaign supply differs')
  }
  if (codes.has(12)) assert.deepEqual(plain(store.gardens), target[8], 'garden effect differs')
  if (codes.has(13)) assert.deepEqual(plain(store.houses), target[9], 'house effect differs')
  if (codes.has(24)) {
    assert.deepEqual(
      [...actualPlayer.resources].sort((left, right) => left - right),
      [...targetPlayer.resources].sort((left, right) => left - right),
      'cleanup resources differ',
    )
  }
}


const manifest = JSON.parse(await readFile(path.join(captureRoot, 'manifest.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 'fcm.public-replay-manifest.v1', 'unsupported manifest')
const report = []
const imitation = {
  verifiedLabels: 0,
  candidateOffered: 0,
  staticTop1: 0,
  staticTop3: 0,
  winnerVerifiedLabels: 0,
  winnerCandidateOffered: 0,
  winnerStaticTop1: 0,
  winnerStaticTop3: 0,
  byDecision: {},
  missingExamples: [],
}

for (const [recordIndex, record] of manifest.records.entries()) {
  process.stderr.write(
    `auditing game ${record.gameId} (${recordIndex + 1}/${manifest.records.length})\n`,
  )
  const capture = validatePublicReplayCapture(JSON.parse(gunzipSync(
    await readFile(path.join(captureRoot, record.file)),
  ).toString('utf8')))
  const winnerSeats = new Set(winnerSeatsFromPlayers(
    decodeSimpleModel(capture.replay.states.at(-1))[1],
  ))
  assert.equal(capture.ruleset.classification, 'base-standard', 'only base-standard is approved')
  const groups = buildDecisionGroups(capture)
  const actionTypes = new Set()
  const labelStatusCounts = {}
  const informationLoss = new Map()
  const engineReplayFailures = []
  let simultaneous = 0
  for (const group of groups) {
    let label = classifyReplayDecisionGroup(group)
    for (const item of label.informationLoss) informationLoss.set(item.eventCode, item.reason)
    const source = prepareSourceModel(capture, group)
    const { state, legalActions, adapter, store } = hydrateActorView(capture, group, source)
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
    if (label.status === ACTION_LABEL_STATUS.CANDIDATE) {
      try {
        const actions = mapReplayDecisionGroup(group, {
          legalActions,
          state,
          importIndex: modules.funcs.importIndex,
          reference: modules.reference,
        })
        for (const action of actions) {
          await adapter.doAction(action, { playerIndex: group.seat, save: false })
        }
        const target = decodeSimpleModel(capture.replay.states[Math.max(...group.eventIndexes)])
        verifyActionEffects(group, store, target)
        label = markLabelEngineReplayed(label, actions)
        const comparableActions = [0, 1].includes(group.phase)
          ? [...actions, { type: 'end_turn' }]
          : actions
        const ranked = rankCandidates(
          { state, legalActions },
          generateCandidates({ state, legalActions }),
        )
        const match = exactCandidateRank(ranked, comparableActions)
        const effectMatch = group.phase === 5 && group.subphase === 3
          ? projectedCandidateRank(
            ranked,
            comparableActions,
            (candidateActions) => marketingEffectSignature(candidateActions, legalActions),
          )
          : null
        const decisionKey = `${group.phase}/${group.subphase}`
        const bucket = imitation.byDecision[decisionKey] ??= {
          verifiedLabels: 0, candidateOffered: 0, staticTop1: 0, staticTop3: 0,
          effectEquivalentOffered: 0, effectEquivalentTop1: 0, effectEquivalentTop3: 0,
          winnerVerifiedLabels: 0, winnerCandidateOffered: 0,
          winnerStaticTop1: 0, winnerStaticTop3: 0,
          actionCountHistogram: {}, actionTypeHistogram: {},
          patternHistogram: {}, winnerPatternHistogram: {},
        }
        const shape = decisionBatchShape(comparableActions)
        imitation.verifiedLabels += 1
        bucket.verifiedLabels += 1
        const winnerDecision = winnerSeats.has(group.seat)
        if (winnerDecision) {
          imitation.winnerVerifiedLabels += 1
          bucket.winnerVerifiedLabels += 1
        }
        bucket.actionCountHistogram[shape.actionCount] =
          (bucket.actionCountHistogram[shape.actionCount] ?? 0) + 1
        const actionFamily = shape.actionTypes.join('+') || 'phase-control-only'
        const pattern = decisionPatternKey(comparableActions)
        bucket.actionTypeHistogram[actionFamily] =
          (bucket.actionTypeHistogram[actionFamily] ?? 0) + 1
        bucket.patternHistogram[pattern] = (bucket.patternHistogram[pattern] ?? 0) + 1
        if (winnerDecision) {
          bucket.winnerPatternHistogram[pattern] =
            (bucket.winnerPatternHistogram[pattern] ?? 0) + 1
        }
        if (effectMatch) {
          bucket.effectEquivalentOffered += 1
          if (effectMatch.rank === 1) bucket.effectEquivalentTop1 += 1
          if (effectMatch.rank <= 3) bucket.effectEquivalentTop3 += 1
        }
        if (match) {
          imitation.candidateOffered += 1
          bucket.candidateOffered += 1
          if (match.rank === 1) {
            imitation.staticTop1 += 1
            bucket.staticTop1 += 1
          }
          if (match.rank <= 3) {
            imitation.staticTop3 += 1
            bucket.staticTop3 += 1
          }
          if (winnerDecision) {
            imitation.winnerCandidateOffered += 1
            bucket.winnerCandidateOffered += 1
            if (match.rank === 1) {
              imitation.winnerStaticTop1 += 1
              bucket.winnerStaticTop1 += 1
            }
            if (match.rank <= 3) {
              imitation.winnerStaticTop3 += 1
              bucket.winnerStaticTop3 += 1
            }
          }
        } else if (imitation.missingExamples.length < 20) {
          imitation.missingExamples.push({
            gameId: capture.source.gameId,
            sourceStateIndex: group.sourceIndex,
            phase: group.phase,
            subphase: group.subphase,
            seat: group.seat,
            actionTypes: actions.map((action) => action.type),
            candidateCount: ranked.length,
          })
        }
      } catch (error) {
        const failure = {
          sourceStateIndex: group.sourceIndex,
          seat: group.seat,
          eventCodes: group.events.map((event) => event.eventCode),
          reason: error.message,
          failureClass: classifyEngineReplayFailure(error.message),
        }
        engineReplayFailures.push(failure)
        label = markLabelEngineIncompatible(label, error.message)
      }
    }
    labelStatusCounts[label.status] = (labelStatusCounts[label.status] ?? 0) + 1
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
    engineReplayFailures,
    actionTypes: [...actionTypes].sort(),
    omittedPublicFields: ['chat'],
    hiddenFieldsRejected: [
      'reserveCards', 'context', 'preMoveData', 'moveData', 'chosenResCard',
    ],
    status: engineReplayFailures.length > 0
      ? 'observation-parity-passed-incompatible-labels-quarantined'
      : 'observation-parity-and-exact-action-replay-passed',
  })
}

const unclassifiedEngineReplayFailures = report.reduce(
  (total, game) => total + game.engineReplayFailures.filter(
    (failure) => failure.failureClass === 'unclassified-engine-replay-failure',
  ).length,
  0,
)
const output = {
  schemaVersion: 'fcm.public-replay-observation-audit-report.v2',
  auditedGames: report.length,
  mcpProjection: 'FCMAdapter.getState + FCMAdapter.getLegalActions',
  scaleGatePassed: unclassifiedEngineReplayFailures === 0,
  unclassifiedEngineReplayFailures,
  candidateImitation: {
    ...imitation,
    candidateRecall: imitation.verifiedLabels
      ? imitation.candidateOffered / imitation.verifiedLabels
      : 0,
    staticTop1RateGivenOffered: imitation.candidateOffered
      ? imitation.staticTop1 / imitation.candidateOffered
      : 0,
    staticTop3RateGivenOffered: imitation.candidateOffered
      ? imitation.staticTop3 / imitation.candidateOffered
      : 0,
    winnerCandidateRecall: imitation.winnerVerifiedLabels
      ? imitation.winnerCandidateOffered / imitation.winnerVerifiedLabels
      : 0,
    winnerStaticTop1RateGivenOffered: imitation.winnerCandidateOffered
      ? imitation.winnerStaticTop1 / imitation.winnerCandidateOffered
      : 0,
    winnerStaticTop3RateGivenOffered: imitation.winnerCandidateOffered
      ? imitation.winnerStaticTop3 / imitation.winnerCandidateOffered
      : 0,
  },
  report,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!output.scaleGatePassed) process.exitCode = 2
