import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import { buildDecisionGroups } from './replay-observation.mjs'
import { PROPOSAL_PRIOR } from './proposal-prior.mjs'


function trainingPattern(payload) {
  const transitions = []
  for (let index = 0; index < payload.length; index += 2) {
    const encodedFrom = payload[index]
    const origin = encodedFrom === -1 ? 1 : encodedFrom >= 50 ? 2 : 0
    const employee = encodedFrom >= 50 ? encodedFrom - 50 : encodedFrom
    transitions.push(`${origin}/${employee}>${payload[index + 1]}`)
  }
  return transitions.sort().join(',')
}


test('proposal prior is reproducibly derived from the declared development manifest', async () => {
  const manifest = JSON.parse(await readFile(PROPOSAL_PRIOR.sourceManifest, 'utf8'))
  const captureDirectory = dirname(PROPOSAL_PRIOR.sourceManifest)
  const encodedGameIds = JSON.stringify(manifest.records.map((record) => record.gameId))
  const manifestHash = createHash('sha256').update(`${encodedGameIds}\n`).digest('hex')
  assert.equal(PROPOSAL_PRIOR.sourceGameIdsHash, `sha256:${manifestHash}`)

  const hireCounts = new Map()
  const trainCounts = new Map()
  const trainTransitionCounts = new Map()
  for (const record of manifest.records) {
    const capture = JSON.parse(gunzipSync(await readFile(
      join(captureDirectory, record.file),
    )))
    for (const group of buildDecisionGroups(capture)) {
      if (group.phase !== 5 || ![1, 2].includes(group.subphase)) continue
      if (group.subphase === 1) {
        const pattern = group.events.filter((event) => event.eventCode === 7)
          .flatMap((event) => event.payload).sort((left, right) => left - right).join(',')
        hireCounts.set(pattern, (hireCounts.get(pattern) ?? 0) + 1)
      } else {
        const transitions = group.events.filter((event) => event.eventCode === 8)
          .flatMap((event) => trainingPattern(event.payload).split(','))
          .filter(Boolean)
        const pattern = transitions.sort().join(',')
        trainCounts.set(pattern, (trainCounts.get(pattern) ?? 0) + 1)
        for (const transition of transitions) {
          trainTransitionCounts.set(
            transition,
            (trainTransitionCounts.get(transition) ?? 0) + 1,
          )
        }
      }
    }
  }

  for (const pattern of PROPOSAL_PRIOR.hirePatterns) {
    assert.ok(
      (hireCounts.get([...pattern].sort((left, right) => left - right).join(',')) ?? 0) >=
        PROPOSAL_PRIOR.minimumSupport,
      `hire prior ${pattern} lacks declared support`,
    )
  }
  for (const pattern of PROPOSAL_PRIOR.trainPatterns) {
    assert.ok(
      (trainCounts.get([...pattern].sort().join(',')) ?? 0) >=
        PROPOSAL_PRIOR.trainPatternMinimumSupport,
      `train prior ${pattern} lacks declared support`,
    )
  }
  assert.deepEqual(
    PROPOSAL_PRIOR.trainTransitionSupport,
    Object.fromEntries([...trainTransitionCounts]
      .filter(([, count]) => count >= PROPOSAL_PRIOR.transitionMinimumSupport)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))),
  )
})


test('proposal prior patterns are unique and bounded to one working-day subphase', () => {
  assert.equal(
    new Set(PROPOSAL_PRIOR.hirePatterns.map((pattern) => pattern.join(','))).size,
    PROPOSAL_PRIOR.hirePatterns.length,
  )
  assert.equal(
    new Set(PROPOSAL_PRIOR.trainPatterns.map((pattern) => pattern.join(','))).size,
    PROPOSAL_PRIOR.trainPatterns.length,
  )
  assert.ok(PROPOSAL_PRIOR.hirePatterns.every((pattern) => pattern.length >= 2 && pattern.length <= 3))
  assert.ok(PROPOSAL_PRIOR.trainPatterns.every((pattern) => pattern.length >= 2 && pattern.length <= 4))
})
