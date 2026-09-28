#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { auditPairedSequentialDataset } from '../src/paired-sequential-estimator.mjs'
import { auditRootGeneralization } from '../src/root-generalization.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixtureName = process.argv[2]
assert.match(fixtureName ?? '', /^rhea-[a-z0-9-]+$/, 'fixture name is required')
const fixtureDirectory = path.join(root, 'fixtures', fixtureName)
const protocol = JSON.parse(await readFile(path.join(fixtureDirectory, 'protocol.json'), 'utf8'))
const sequentialProtocol = JSON.parse(await readFile(
  path.join(root, 'fixtures/paired-sequential-v1/protocol.json'), 'utf8'))

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

assert.ok(Array.isArray(protocol.collectionShards) && protocol.collectionShards.length > 1,
  'collection shards are required')
const reports = []
for (let index = 0; index < protocol.collectionShards.length; index += 1) {
  const report = JSON.parse(await readFile(
    path.join(fixtureDirectory, `report-shard-${index}.json`), 'utf8'))
  assert.equal(report.protocolDigest, digest(protocol), `protocol drift in shard ${index}`)
  assert.equal(report.schemaVersion, protocol.reportSchemaVersion, `schema drift in shard ${index}`)
  assert.equal(report.sampleCount, protocol.sampleCount, `sample drift in shard ${index}`)
  assert.equal(report.partialCollection, true, `shard ${index} is not marked partial`)
  assert.deepEqual(report.targetIndices, protocol.collectionShards[index],
    `target coverage drift in shard ${index}`)
  reports.push(report)
}
const flattenedIndices = reports.flatMap((report) => report.targetIndices)
assert.deepEqual([...flattenedIndices].sort((left, right) => left - right),
  protocol.targets.map((_, index) => index), 'shards must cover every target exactly once')
assert.equal(new Set(flattenedIndices).size, protocol.targets.length,
  'shards contain duplicate target indices')
const rootsById = new Map(reports.flatMap((report) => report.roots)
  .map((entry) => [entry.rootId, entry]))
assert.equal(rootsById.size, protocol.targets.length, 'merged roots are incomplete or duplicated')
const roots = protocol.targets.map((target) => {
  const entry = rootsById.get(target.rootId)
  assert.ok(entry, `merged report lacks ${target.rootId}`)
  return entry
})
const estimatorDataset = {
  roots: roots.map((entry) => ({
    rootId: entry.rootId,
    candidates: entry.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      terminalMargins: candidate.terminalMargins,
    })),
  })),
}
const report = {
  schemaVersion: protocol.reportSchemaVersion,
  experimentId: protocol.experimentId,
  protocolDigest: digest(protocol),
  sampleCount: protocol.sampleCount,
  resumedFromSampleCount: reports[0].resumedFromSampleCount,
  targetIndices: protocol.targets.map((_, index) => index),
  partialCollection: false,
  collectionShards: protocol.collectionShards,
  roots,
  audit: auditPairedSequentialDataset(estimatorDataset, sequentialProtocol),
  rootGeneralizationAudit: auditRootGeneralization(roots, protocol.candidateWideHypothesis),
  predeclaredInteraction: null,
  privatePayloadPersisted: false,
  promotionHoldoutOpened: protocol.promotionHoldoutOpened,
}
assert.ok(reports.every((entry) => entry.resumedFromSampleCount === report.resumedFromSampleCount),
  'resume sample count differs across shards')
const serialized = `${JSON.stringify(report, null, 2)}\n`
for (const forbidden of ['_moves', 'trustedWorld', 'preMoveData', 'hiddenState', 'moveData']) {
  assert.equal(serialized.includes(forbidden), false, `merged report leaked ${forbidden}`)
}
const outputPath = path.join(fixtureDirectory, 'report.json')
await writeFile(outputPath, serialized)
process.stdout.write(`${JSON.stringify({
  output: outputPath,
  roots: roots.length,
  audit: report.rootGeneralizationAudit,
}, null, 2)}\n`)
