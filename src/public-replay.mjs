import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'


export const CAPTURE_SCHEMA = 'fcm.public-replay-capture.v1'
export const SIMPLE_MODEL_SCHEMA = 'fcm.simple-model.v1+gzip+base64'
export const HIST_END_GAME = 26

const BASE_STANDARD_OPTIONS = new Set([5])
const BASE_VARIANT_OPTIONS = new Set([1, 2, 3, 5, 6, 101, 102, 103])
const FORBIDDEN_KEYS = /(?:password|passwd|token|cookie|chat|commentary|reasoning|moveData)/i
const CREDENTIAL_TEXT = /(?:obg_pat_|bearer\s+[a-z0-9._~-]{12,})/i


function assert(condition, message) {
  if (!condition) throw new Error(message)
}


export function normalizeStartingOptions(value) {
  if (Array.isArray(value)) {
    const options = value.map(Number)
    assert(options.every(Number.isInteger), 'startingOptions must contain integers')
    return [...new Set(options)].sort((left, right) => left - right)
  }
  if (value && typeof value === 'object' && Object.keys(value).length === 0) return []
  throw new Error('startingOptions must be an array or an empty legacy object')
}


export function classifyRuleset(options) {
  const normalized = normalizeStartingOptions(options)
  if (normalized.every((option) => BASE_STANDARD_OPTIONS.has(option))) return 'base-standard'
  if (normalized.every((option) => BASE_VARIANT_OPTIONS.has(option))) return 'base-variant'
  return 'expansion'
}


export function decodeSimpleModel(encoded) {
  assert(typeof encoded === 'string' && encoded.length > 0, 'replay state must be base64 text')
  let model
  try {
    model = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
  } catch (error) {
    throw new Error(`invalid replay state: ${error.message}`)
  }
  assert(Array.isArray(model) && model.length === 21, 'replay state must contain 21 model fields')
  assert(Array.isArray(model[1]), 'replay state players must be an array')
  assert(
    model[6] && typeof model[6] === 'object' && !Array.isArray(model[6]),
    'replay state gameflow must be an object',
  )
  return model
}


export function encodeSimpleModel(model) {
  assert(Array.isArray(model) && model.length === 21, 'replay state must contain 21 model fields')
  return gzipSync(Buffer.from(JSON.stringify(model)), { level: 9, mtime: 0 }).toString('base64')
}


function replaceNames(text, aliases) {
  let result = text
  for (const [name, alias] of aliases) {
    if (!name) continue
    result = result.split(name).join(alias)
  }
  return result
}


function sanitizeValue(value, aliases, path = '$') {
  if (typeof value === 'string') {
    const result = replaceNames(value, aliases)
    assert(!CREDENTIAL_TEXT.test(result), `${path}: credential-like text is forbidden`)
    return result
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, aliases, `${path}[${index}]`))
  }
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, item] of Object.entries(value)) {
      assert(!FORBIDDEN_KEYS.test(key), `${path}.${key}: forbidden field`)
      result[key] = sanitizeValue(item, aliases, `${path}.${key}`)
    }
    return result
  }
  return value
}


function aliasesFromModels(rawNames, models) {
  const names = [...rawNames]
  for (const model of models) {
    for (const player of model[1]) {
      for (const key of ['name', 'displayName']) {
        if (typeof player?.[key] === 'string' && player[key]) names.push(player[key])
      }
    }
  }
  const unique = [...new Set(names.filter((name) => typeof name === 'string' && name))]
  return unique
    .map((name) => {
      const seat = models[0][1].findIndex(
        (player) => player?.name === name || player?.displayName === name,
      )
      return [name, seat >= 0 ? `seat-${seat}` : 'former-player']
    })
    .sort((left, right) => right[0].length - left[0].length)
}


function sanitizeModel(model, aliases) {
  const source = structuredClone(model)
  // History is stored once at package level. Keeping it in every state multiplies the corpus and
  // can retain legacy text fields that have no bearing on the position.
  source[13] = []
  // Reserve cards are simultaneous secret choices. Replay reconstructs them one player at a time,
  // which would let a later synthetic observation see an earlier player's still-hidden choice.
  // They are deliberately absent from the live MCP state, so retain only the public fact that a
  // card slot exists for each seat.
  source[19] = Array.from({ length: source[1].length }, () => -1)
  // Runtime context contains transient simultaneous-move buffers such as preMoveData. It is not
  // part of the persistent public position and must never enter a policy training record.
  source[20] = {}
  const result = sanitizeValue(source, aliases)
  for (const [seat, player] of result[1].entries()) {
    if (player && typeof player === 'object') {
      if ('name' in player) player.name = `seat-${seat}`
      if ('displayName' in player) player.displayName = `seat-${seat}`
    }
  }
  return result
}


function sanitizeHistory(history, aliases) {
  return history.map((entry, sequence) => {
    assert(Array.isArray(entry) && entry.length >= 4, `history[${sequence}] must have four fields`)
    assert(Number.isInteger(entry[0]), `history[${sequence}] event code must be an integer`)
    assert(Number.isInteger(entry[1]), `history[${sequence}] seat must be an integer`)
    return {
      sequence,
      eventCode: entry[0],
      seat: entry[1],
      payload: sanitizeValue(entry[3], aliases, `history[${sequence}].payload`),
    }
  })
}


function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}


export function buildPublicReplayCapture(raw, { capturedAt }) {
  assert(raw && typeof raw === 'object', 'raw capture must be an object')
  assert(Number.isInteger(raw.gameId) && raw.gameId > 0, 'gameId must be a positive integer')
  assert(raw.finishedGame === true, 'only finished games may be captured')
  assert(Array.isArray(raw.history) && raw.history.length > 0, 'history must be non-empty')
  assert(Array.isArray(raw.replayData) && raw.replayData.length > 0, 'replayData must be non-empty')
  assert(raw.history.length === raw.replayData.length, 'history and replay state counts differ')
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(capturedAt), 'capturedAt must be UTC')

  const startingOptions = normalizeStartingOptions(raw.startingOptions)
  assert(Array.isArray(raw.startingMap), 'startingMap must be an array')
  assert(raw.startingMap.every(Number.isInteger), 'startingMap must contain integers')
  const models = raw.replayData.map(decodeSimpleModel)
  const playerCount = models[0][1].length
  assert(playerCount >= 2 && playerCount <= 6, 'player count must be between 2 and 6')
  assert(models.every((model) => model[1].length === playerCount), 'player count changed during replay')
  const aliases = aliasesFromModels(raw.playerNames ?? [], models)
  const history = sanitizeHistory(raw.history, aliases)
  assert(history.at(-1).eventCode === HIST_END_GAME, 'history does not end with the official game-over event')
  const replayStates = models.map((model) => encodeSimpleModel(sanitizeModel(model, aliases)))
  const serializedStates = replayStates.join('\n')

  const capture = {
    schemaVersion: CAPTURE_SCHEMA,
    source: {
      site: 'onlineboardgamers.com',
      gameId: raw.gameId,
      publicUrl: `https://www.onlineboardgamers.com/FCM/${raw.gameId}/show/`,
      capturedAt,
      clientBundle: typeof raw.clientBundle === 'string' ? raw.clientBundle : null,
      publicEndedGame: true,
    },
    ruleset: {
      classification: classifyRuleset(startingOptions),
      startingOptions,
      startingMap: sanitizeValue(raw.startingMap, aliases, '$.startingMap'),
    },
    participants: Array.from({ length: playerCount }, (_, seat) => ({ seat, id: `seat-${seat}` })),
    history,
    replay: {
      format: SIMPLE_MODEL_SCHEMA,
      states: replayStates,
    },
    integrity: {
      eventCount: history.length,
      stateCount: replayStates.length,
      stateDigest: digest(serializedStates),
    },
    trainingStatus: 'quarantined-pending-engine-validation',
  }
  const serialized = JSON.stringify(capture)
  assert(!CREDENTIAL_TEXT.test(serialized), 'capture contains credential-like text')
  for (const [name] of aliases) assert(!serialized.includes(name), 'capture contains a player identity')
  return capture
}


export function validatePublicReplayCapture(capture) {
  assert(capture?.schemaVersion === CAPTURE_SCHEMA, 'unsupported capture schema')
  assert(capture?.source?.publicEndedGame === true, 'capture is not an ended public game')
  assert(capture?.trainingStatus === 'quarantined-pending-engine-validation', 'capture skipped quarantine')
  assert(Array.isArray(capture.history), 'capture history is missing')
  assert(Array.isArray(capture?.replay?.states), 'capture replay states are missing')
  assert(capture.integrity.eventCount === capture.history.length, 'history integrity count differs')
  assert(capture.integrity.stateCount === capture.replay.states.length, 'state integrity count differs')
  assert(capture.history.length === capture.replay.states.length, 'history and state counts differ')
  assert(capture.history.at(-1)?.eventCode === HIST_END_GAME, 'capture history is not terminal')
  const digestValue = digest(capture.replay.states.join('\n'))
  assert(digestValue === capture.integrity.stateDigest, 'state digest differs')
  for (const [index, encoded] of capture.replay.states.entries()) {
    const model = decodeSimpleModel(encoded)
    assert(model[13].length === 0, `state ${index} retained embedded history`)
    assert(
      model[19].length === model[1].length && model[19].every((card) => card === -1),
      `state ${index} retained a private reserve-card choice`,
    )
    assert(Object.keys(model[20]).length === 0, `state ${index} retained runtime context`)
    for (const [seat, player] of model[1].entries()) {
      if ('name' in player) assert(player.name === `seat-${seat}`, `state ${index} name is not anonymous`)
      if ('displayName' in player) {
        assert(player.displayName === `seat-${seat}`, `state ${index} display name is not anonymous`)
      }
    }
  }
  return capture
}
