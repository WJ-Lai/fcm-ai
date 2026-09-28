#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { dispatchOpponentPolicy, validateOpponentPopulation } from '../src/opponent-population.mjs'

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function countEvents(history, seat) {
  const counts = {}
  for (const event of history) {
    if (event[1] !== seat) continue
    const code = String(event[0])
    counts[code] = (counts[code] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => Number(left[0]) - Number(right[0])))
}

function sequenceEvents(history, seat) {
  return history.filter((event) => event[1] === seat).map((event) => event[0])
}

const root = path.resolve(new URL('..', import.meta.url).pathname)
const serverRoot = path.resolve(argument('--server', '../obg-server-fcm-agent-rebased'))
const protocolPath = path.resolve(argument(
  '--protocol', 'fixtures/opponent-calibration-v1/protocol.json',
))
const outputPath = path.resolve(argument(
  '--output', 'fixtures/opponent-calibration-v1/dataset.json',
))
const protocol = JSON.parse(await readFile(
  protocolPath, 'utf8',
))
const population = validateOpponentPopulation(JSON.parse(await readFile(
  path.join(root, 'fixtures/opponent-population-v1/manifest.json'), 'utf8',
)))
assert.equal(protocol.populationId, population.populationId, 'population id differs from protocol')
assert.equal(protocol.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
const declaredSeeds = protocol.validationSeeds
  ?? [...protocol.developmentSeeds, ...protocol.calibrationSeeds]
assert.equal(new Set(declaredSeeds).size, declaredSeeds.length, 'protocol seeds overlap')

await import(pathToFileURL(path.join(serverRoot, 'mcp-server/register-hook.mjs')).href)
const { OfflineEnvironment } = await import(
  pathToFileURL(path.join(serverRoot, 'mcp-server/offline-environment.mjs')).href
)

const maxCommands = protocol.publicCommandHorizon
let rulesetHash = null
const splits = {}
const splitDefinitions = protocol.validationSeeds
  ? [['validation', protocol.validationSeeds]]
  : [
      ['development', protocol.developmentSeeds],
      ['calibration', protocol.calibrationSeeds],
    ]
for (const [split, seeds] of splitDefinitions) {
  const samples = []
  const games = []
  for (const [seedIndex, seed] of seeds.entries()) {
    const orderedModels = population.models.map((_, index) => (
      population.models[(index + seedIndex) % population.models.length]
    ))
    const names = orderedModels.map((model, seat) => (
      model.policyKind === 'environment-adapter' ? 'FcmAI' : `opponent-${seat}`
    ))
    assert.equal(new Set(names).size, names.length, `${seed}: player names must be unique`)
    const env = OfflineEnvironment.fromSeed({
      seed,
      playerNames: names,
      gameID: split === 'development' ? seedIndex + 1
        : split === 'calibration' ? seedIndex + 101 : seedIndex + 201,
    })
    let commands = 0
    while (env.snapshot().phase !== 10 && commands < maxCommands) {
      const snapshot = env.snapshot()
      const seat = names.indexOf(snapshot.currentPlayers?.[0])
      assert.ok(seat >= 0, `${seed}: unknown pending player`)
      const model = orderedModels[seat]
      if (model.policyKind === 'environment-adapter') {
        await env.stepBuiltinAI(seat, `${seed}:official:${commands}`)
      } else {
        const legalView = await env.observe(seat)
        assert.equal(legalView.legalActions.yourTurn, true, `${seed}: pending seat lacks legal turn`)
        const decision = dispatchOpponentPolicy(model, {
          legalView,
          seed: `${seed}:${seat}:${commands}`,
        })
        assert.equal(decision.kind, 'actions')
        await env.step(seat, decision.actions)
      }
      commands += 1
    }
    const terminal = await env.observe(0)
    assert.equal(commands, maxCommands, `${seed}: game ended before the frozen public prefix`)
    if (rulesetHash == null) rulesetHash = terminal.rulesetHash
    assert.equal(terminal.rulesetHash, rulesetHash, `${seed}: ruleset drift`)
    for (const [seat, model] of orderedModels.entries()) {
      const publicEventCounts = countEvents(terminal.state.history, seat)
      const totalEvents = Object.values(publicEventCounts).reduce((sum, count) => sum + count, 0)
      assert.ok(totalEvents > 0, `${seed}: seat ${seat} has no public events`)
      samples.push({
        sampleId: `${split}-${String(seedIndex).padStart(2, '0')}-seat-${seat}`,
        gameIndex: seedIndex,
        seat,
        modelId: model.modelId,
        publicEventCounts,
        ...(protocol.featureVersion === 'public-event-unigram-bigram-v2'
          ? { publicEventSequence: sequenceEvents(terminal.state.history, seat) }
          : {}),
        totalEvents,
      })
    }
    games.push({ gameIndex: seedIndex, seed, commands, terminal: terminal.state.phase === 10 })
    process.stderr.write(`${split} ${seedIndex + 1}/${seeds.length}: ${commands} commands\n`)
  }
  splits[split] = { games, samples }
}

const dataset = {
  schemaVersion: protocol.validationSeeds
    ? 'fcm.opponent-validation-dataset.v3'
    : protocol.featureVersion === 'public-event-unigram-bigram-v2'
      ? 'fcm.opponent-calibration-dataset.v2'
      : 'fcm.opponent-calibration-dataset.v1',
  protocolDigest: digest(protocol),
  populationDigest: digest(population),
  rulesetHash,
  featureVersion: protocol.featureVersion,
  promotionHoldoutOpened: false,
  splits,
}
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  games: splitDefinitions.reduce((sum, [, seeds]) => sum + seeds.length, 0),
  samples: Object.values(splits).reduce((sum, split) => sum + split.samples.length, 0),
  rulesetHash,
}, null, 2)}\n`)
