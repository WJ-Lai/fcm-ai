#!/usr/bin/env node

import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import {
  buildPublicReplayCapture,
  validatePublicReplayCapture,
} from '../src/public-replay.mjs'


function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}


function requireArgument(name) {
  const value = argument(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}


function parseGames(value) {
  const games = value.split(',').map((item) => Number(item.trim()))
  if (!games.length || games.some((game) => !Number.isInteger(game) || game <= 0)) {
    throw new Error('--games must be a comma-separated list of positive integers')
  }
  if (new Set(games).size !== games.length) throw new Error('--games contains duplicates')
  return games
}


class CdpSession {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
    this.sequence = 0
    this.pending = new Map()
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
  }

  command(method, params = {}, timeoutMs = 15_000) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs = 15_000 } = {}) {
    const result = await this.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    }, timeoutMs)
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'browser evaluation failed')
    }
    return result.result.value
  }

  close() {
    this.socket.close()
  }
}


async function waitFor(session, expression, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      if (await session.evaluate(expression)) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`${description} timed out${lastError ? `: ${lastError.message}` : ''}`)
}


async function createTarget(cdpBase, url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`cannot create browser target: HTTP ${response.status}`)
  return response.json()
}


async function closeTarget(cdpBase, targetId) {
  try {
    await fetch(`${cdpBase}/json/close/${targetId}`)
  } catch {
    // The target belongs only to this capture attempt; browser shutdown also closes it.
  }
}


async function captureGame(cdpBase, gameId) {
  const url = `https://www.onlineboardgamers.com/FCM/${gameId}/show/`
  const target = await createTarget(cdpBase, url)
  const session = new CdpSession(target.webSocketDebuggerUrl)
  try {
    await session.connect()
    await waitFor(
      session,
      `document.readyState === "complete" && Boolean(window.initData) && Boolean(document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia)`,
      `game ${gameId} application load`,
    )
    const pageMetadata = await session.evaluate(`({
      gameId: Number(window.initData.gameID),
      finishedGame: window.initData.finishedGame === true,
      startingMapIsArray: Array.isArray(window.initData.startingMap),
    })`)
    if (pageMetadata.gameId !== gameId) {
      throw new Error(`game ${gameId} page did not expose the requested game`)
    }
    if (!pageMetadata.finishedGame) throw new Error(`game ${gameId} is not finished`)
    if (!pageMetadata.startingMapIsArray) {
      throw new Error(`game ${gameId} uses an incompatible legacy startingMap format`)
    }
    const replayReady = await session.evaluate(`(() => {
      const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("store")
      return store.replayData.length > 0 && store.replayData.length === store.computedHistory.length
    })()`)
    if (!replayReady) {
      const clicked = await session.evaluate(`(() => {
        const item = [...document.querySelectorAll(".topMenuItem")]
          .find((element) => /^(Replay|回放)$/.test(element.innerText.trim()))
        if (!item) return false
        item.click()
        return true
      })()`)
      if (!clicked) throw new Error(`game ${gameId} has no Replay control`)
    }
    await waitFor(
      session,
      `(() => {
        const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("store")
        return store.viewSettings.generatingReplay === false
          && store.replayData.length > 0
          && store.replayData.length === store.computedHistory.length
      })()`,
      `game ${gameId} replay generation`,
      120_000,
    )
    const metadata = await session.evaluate(`(() => {
      const app = document.querySelector("#app").__vue_app__
      const store = app.config.globalProperties.$pinia._s.get("store")
      const scripts = [...document.scripts].map((script) => script.src).filter(Boolean)
      return {
        gameId: Number(window.initData.gameID),
        finishedGame: window.initData.finishedGame === true,
        startingOptions: JSON.parse(JSON.stringify(window.initData.startingOptions)),
        startingMap: JSON.parse(JSON.stringify(window.initData.startingMap)),
        playerNames: store.players.map((player) => String(player.name ?? player.displayName ?? "")),
        history: JSON.parse(JSON.stringify(store.computedHistory)),
        replayLength: store.replayData.length,
        clientBundle: scripts.find((source) => /FCM.*(?:main|output).*\.js/i.test(source)) ?? null,
      }
    })()`, { timeoutMs: 30_000 })
    const replayData = []
    const chunkSize = 20
    for (let offset = 0; offset < metadata.replayLength; offset += chunkSize) {
      const chunk = await session.evaluate(`(() => {
        const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("store")
        return [...store.replayData].slice(${offset}, ${offset + chunkSize})
      })()`, { timeoutMs: 30_000 })
      if (!Array.isArray(chunk) || chunk.length === 0) {
        throw new Error(`game ${gameId} replay chunk ${offset} is empty`)
      }
      replayData.push(...chunk)
    }
    if (replayData.length !== metadata.replayLength) {
      throw new Error(`game ${gameId} replay chunk count changed during capture`)
    }
    delete metadata.replayLength
    return { ...metadata, replayData }
  } finally {
    session.close()
    await closeTarget(cdpBase, target.id)
  }
}


async function main() {
  const games = parseGames(requireArgument('--games'))
  const maxGames = Number(argument('--max-games', '2'))
  const delayMs = Number(argument('--delay-ms', '1000'))
  const output = path.resolve(requireArgument('--output'))
  const requiredClass = argument('--require-class', null)
  const cdpBase = argument('--cdp', 'http://127.0.0.1:19825').replace(/\/$/, '')
  if (!Number.isInteger(maxGames) || maxGames < 1) throw new Error('--max-games must be positive')
  if (games.length > maxGames) throw new Error(`requested ${games.length} games exceeds --max-games ${maxGames}`)
  if (!Number.isInteger(delayMs) || delayMs < 500) throw new Error('--delay-ms must be at least 500')

  const parent = path.dirname(output)
  await mkdir(parent, { recursive: true })
  const staging = await mkdtemp(path.join(parent, '.public-replay-stage-'))
  const capturedAt = new Date().toISOString()
  const records = []
  try {
    for (const [index, gameId] of games.entries()) {
      process.stderr.write(`capturing public ended game ${gameId} (${index + 1}/${games.length})\n`)
      const raw = await captureGame(cdpBase, gameId)
      const capture = validatePublicReplayCapture(buildPublicReplayCapture(raw, { capturedAt }))
      if (requiredClass && capture.ruleset.classification !== requiredClass) {
        throw new Error(
          `game ${gameId} classified ${capture.ruleset.classification}, expected ${requiredClass}`,
        )
      }
      const filename = `game-${gameId}.json.gz`
      const serialized = JSON.stringify(capture, null, 2) + '\n'
      await writeFile(path.join(staging, filename), gzipSync(serialized, { level: 9, mtime: 0 }), { flag: 'wx' })
      records.push({
        gameId,
        file: filename,
        ruleset: capture.ruleset.classification,
        startingOptions: capture.ruleset.startingOptions,
        players: capture.participants.length,
        events: capture.integrity.eventCount,
        states: capture.integrity.stateCount,
        stateDigest: capture.integrity.stateDigest,
        trainingStatus: capture.trainingStatus,
      })
      if (index + 1 < games.length) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    const manifest = {
      schemaVersion: 'fcm.public-replay-manifest.v1',
      capturedAt,
      requestedGames: games,
      completedGames: records.length,
      scaleGate: maxGames,
      records,
    }
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(staging, output)
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}


main().catch((error) => {
  process.stderr.write(`public replay capture failed: ${error.message}\n`)
  process.exitCode = 2
})
