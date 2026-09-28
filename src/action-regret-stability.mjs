import assert from 'node:assert/strict'

const FORBIDDEN_KEYS = new Set([
  'snapshot', 'legalActions', 'actions', 'token', 'password', 'credential',
  'gameData', 'moveData', 'reserveCard', 'reserveCards',
])

function rejectForbiddenKeys(value) {
  if (Array.isArray(value)) return value.forEach(rejectForbiddenKeys)
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_KEYS.has(key), `forbidden key ${key}`)
    rejectForbiddenKeys(nested)
  }
}

export function validateActionRegretStability(dataset) {
  assert.equal(dataset?.schemaVersion, 'fcm.action-regret-stability.v1',
    'stability schema mismatch')
  assert.match(dataset.rulesetHash ?? '', /^[a-f0-9]{64}$/, 'ruleset hash is required')
  assert.equal(dataset.promotionHoldoutOpened, false, 'promotion holdout must remain sealed')
  assert.ok(typeof dataset.continuationPolicy === 'string' && dataset.continuationPolicy,
    'continuation policy is required')
  assert.ok(Number.isInteger(dataset.sampleCount) && dataset.sampleCount >= 2,
    'at least two continuation samples are required')
  assert.ok(Array.isArray(dataset.roots) && dataset.roots.length > 0, 'roots are required')
  rejectForbiddenKeys(dataset)

  const rootIds = new Set()
  let candidates = 0
  for (const root of dataset.roots) {
    assert.ok(typeof root.rootId === 'string' && root.rootId, 'rootId is required')
    assert.ok(!rootIds.has(root.rootId), `duplicate root ${root.rootId}`)
    rootIds.add(root.rootId)
    assert.ok(['development', 'calibration'].includes(root.sourceSplit),
      'source split must be development or calibration')
    assert.match(root.snapshotDigest ?? '', /^sha256:[a-f0-9]{64}$/,
      'snapshotDigest must be a sha256 digest')
    if (root.strategicProjectionDigest !== undefined) {
      assert.match(root.strategicProjectionDigest, /^sha256:[a-f0-9]{64}$/,
        'strategicProjectionDigest must be a sha256 digest')
    }
    assert.ok(Array.isArray(root.candidates) && root.candidates.length >= 2,
      `root ${root.rootId} requires at least two candidates`)
    const candidateIds = new Set()
    for (const candidate of root.candidates) {
      assert.ok(typeof candidate.candidateId === 'string' && candidate.candidateId,
        'candidateId is required')
      assert.ok(!candidateIds.has(candidate.candidateId), 'duplicate candidateId')
      candidateIds.add(candidate.candidateId)
      assert.equal(candidate.terminalMargins?.length, dataset.sampleCount,
        `candidate ${candidate.candidateId} terminal sample count mismatch`)
      assert.equal(candidate.terminalCommands?.length, dataset.sampleCount,
        `candidate ${candidate.candidateId} command sample count mismatch`)
      assert.ok(candidate.terminalMargins.every(Number.isFinite),
        'terminal margins must be finite')
      assert.ok(candidate.terminalCommands.every(
        (value) => Number.isInteger(value) && value > 0,
      ), 'terminal commands must be positive integers')
      candidates += 1
    }
  }
  return { roots: dataset.roots.length, candidates, samples: dataset.sampleCount }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function auditActionRegretStability(dataset) {
  validateActionRegretStability(dataset)
  const details = dataset.roots.map((root) => {
    const sampleOracles = Array.from({ length: dataset.sampleCount }, (_, sample) => {
      const best = Math.max(...root.candidates.map(
        (candidate) => candidate.terminalMargins[sample],
      ))
      return root.candidates
        .filter((candidate) => candidate.terminalMargins[sample] === best)
        .map((candidate) => candidate.candidateId)
        .sort()
        .join('+')
    })
    const counts = new Map()
    for (const oracle of sampleOracles) counts.set(oracle, (counts.get(oracle) ?? 0) + 1)
    const oraclePatterns = [...counts.keys()].sort()
    const maxAgreement = Math.max(...counts.values())
    const means = root.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      meanTerminalMargin: mean(candidate.terminalMargins),
      minTerminalMargin: Math.min(...candidate.terminalMargins),
      maxTerminalMargin: Math.max(...candidate.terminalMargins),
    }))
    const bestMean = Math.max(...means.map((candidate) => candidate.meanTerminalMargin))
    return {
      rootId: root.rootId,
      oraclePatterns,
      sampleAgreement: maxAgreement / dataset.sampleCount,
      stable: oraclePatterns.length === 1,
      meanOracleCandidateIds: means
        .filter((candidate) => candidate.meanTerminalMargin === bestMean)
        .map((candidate) => candidate.candidateId),
      candidates: means,
    }
  })
  return {
    schemaVersion: 'fcm.action-regret-stability-audit.v1',
    roots: details.length,
    stableRoots: details.filter((detail) => detail.stable).length,
    flippedRoots: details.filter((detail) => !detail.stable).length,
    meanSampleAgreement: mean(details.map((detail) => detail.sampleAgreement)),
    details,
  }
}

export function prepareActionRegretStabilityResume(existing, {
  requestedSampleCount,
  targets,
}) {
  validateActionRegretStability(existing)
  assert.ok(Number.isInteger(requestedSampleCount) &&
    requestedSampleCount > existing.sampleCount,
  'requested sample count must increase')
  assert.ok(Array.isArray(targets) && targets.length === existing.roots.length,
    'frozen root set mismatch')
  for (const [index, root] of existing.roots.entries()) {
    const target = targets[index]
    assert.equal(target?.rootId, root.rootId, 'frozen root set mismatch')
    assert.deepEqual(
      target?.candidateIds,
      root.candidates.map((candidate) => candidate.candidateId),
      `frozen candidate set mismatch for ${root.rootId}`,
    )
  }
  return {
    previousSampleCount: existing.sampleCount,
    requestedSampleCount,
    roots: structuredClone(existing.roots),
  }
}
