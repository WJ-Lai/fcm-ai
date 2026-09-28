import assert from 'node:assert/strict'

const FORBIDDEN_KEYS = new Set([
  'snapshot', 'legalActions', 'actions', 'token', 'password', 'credential',
  'gameData', 'moveData', 'reserveCard', 'reserveCards',
])

function rejectForbiddenKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenKeys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_KEYS.has(key), `forbidden key ${key}`)
    rejectForbiddenKeys(nested)
  }
}

function digest(value, label) {
  assert.match(value ?? '', /^sha256:[a-f0-9]{64}$/, `${label} must be a sha256 digest`)
}

export function validateActionRegretProtocol(protocol) {
  assert.equal(protocol?.schemaVersion, 'fcm.action-regret-protocol.v1',
    'protocol schema mismatch')
  assert.ok(['fcm.action-regret.v1', 'fcm.action-regret.v2'].includes(protocol.protocolVersion),
    'unsupported protocol version')
  assert.equal(protocol.promotionHoldoutOpened, false,
    'promotion holdout must remain sealed during development')
  assert.ok(Number.isInteger(protocol.candidateLimit) &&
    protocol.candidateLimit >= 2 && protocol.candidateLimit <= 8,
  'candidate limit must be between 2 and 8')
  assert.ok(typeof protocol.continuationPolicy === 'string' && protocol.continuationPolicy,
    'continuation policy is required')

  const splitNames = ['development', 'calibration', 'promotion-holdout']
  const seenSeeds = new Set()
  for (const split of splitNames) {
    const seeds = protocol.splits?.[split]
    assert.ok(Array.isArray(seeds) && seeds.length > 0, `${split} seeds are required`)
    for (const seed of seeds) {
      assert.ok(typeof seed === 'string' && seed, `${split} seed is invalid`)
      assert.ok(!seenSeeds.has(seed), `split leakage for seed ${seed}`)
      seenSeeds.add(seed)
    }
  }
  assert.ok(Array.isArray(protocol.rootSpecs) && protocol.rootSpecs.length > 0,
    'root specs are required')
  const rootIds = new Set()
  for (const root of protocol.rootSpecs) {
    assert.ok(typeof root.id === 'string' && root.id, 'root spec id is required')
    assert.ok(!rootIds.has(root.id), `duplicate root spec ${root.id}`)
    rootIds.add(root.id)
    assert.ok(Number.isInteger(root.phase) && Number.isInteger(root.subphase) &&
      Number.isInteger(root.minimumTurn) && root.minimumTurn > 0,
    `root spec ${root.id} is invalid`)
  }
  return {
    developmentSeeds: protocol.splits.development.length,
    calibrationSeeds: protocol.splits.calibration.length,
    promotionSeeds: protocol.splits['promotion-holdout'].length,
    rootSpecs: protocol.rootSpecs.length,
  }
}

export function validateActionRegretDataset(dataset, { allowPromotionHoldout = false } = {}) {
  assert.equal(dataset?.schemaVersion, 'fcm.action-regret-dataset.v1', 'dataset schema mismatch')
  assert.ok(['fcm.action-regret.v1', 'fcm.action-regret.v2'].includes(dataset.protocolVersion),
    'dataset protocol mismatch')
  assert.ok(['development', 'calibration', 'promotion-holdout'].includes(dataset.split),
    'unknown dataset split')
  if (dataset.split === 'promotion-holdout') {
    assert.ok(allowPromotionHoldout && dataset.promotionHoldoutOpened === true,
      'promotion holdout is sealed')
  }
  assert.match(dataset.rulesetHash ?? '', /^[a-f0-9]{64}$/, 'ruleset hash is required')
  assert.ok(typeof dataset.featureVersion === 'string' && dataset.featureVersion,
    'feature version is required')
  assert.ok(Array.isArray(dataset.featureNames) && dataset.featureNames.length > 0,
    'feature names are required')
  assert.equal(new Set(dataset.featureNames).size, dataset.featureNames.length,
    'feature names must be unique')
  assert.ok(Array.isArray(dataset.roots) && dataset.roots.length > 0, 'roots are required')
  rejectForbiddenKeys(dataset)

  const rootIds = new Set()
  let candidates = 0
  for (const root of dataset.roots) {
    assert.ok(typeof root.rootId === 'string' && root.rootId, 'rootId is required')
    assert.ok(!rootIds.has(root.rootId), `duplicate root ${root.rootId}`)
    rootIds.add(root.rootId)
    assert.ok(typeof root.seed === 'string' && root.seed, 'root seed is required')
    assert.ok(Number.isInteger(root.seat) && root.seat >= 0, 'root seat is invalid')
    assert.ok(Number.isInteger(root.turn) && root.turn > 0, 'root turn is invalid')
    assert.ok(Number.isInteger(root.phase), 'root phase is required')
    assert.ok(Number.isInteger(root.subphase), 'root subphase is required')
    digest(root.snapshotDigest, 'snapshotDigest')
    digest(root.strategicProjectionDigest, 'strategicProjectionDigest')
    assert.ok(Array.isArray(root.candidates) && root.candidates.length >= 2,
      `root ${root.rootId} requires at least two candidates`)
    const candidateIds = new Set()
    for (const [index, candidate] of root.candidates.entries()) {
      assert.ok(typeof candidate.candidateId === 'string' && candidate.candidateId,
        'candidateId is required')
      assert.ok(!candidateIds.has(candidate.candidateId),
        `duplicate candidate ${candidate.candidateId} in ${root.rootId}`)
      candidateIds.add(candidate.candidateId)
      assert.equal(candidate.staticRank, index, `static rank drift in ${root.rootId}`)
      assert.ok(Array.isArray(candidate.postActionPairFeatures) &&
        candidate.postActionPairFeatures.length === dataset.featureNames.length,
      `candidate ${candidate.candidateId} feature dimension mismatch`)
      assert.ok(candidate.postActionPairFeatures.every(Number.isFinite),
        `candidate ${candidate.candidateId} features must be finite`)
      assert.ok(Number.isFinite(candidate.terminalMargin),
        `candidate ${candidate.candidateId} terminal margin must be finite`)
      candidates += 1
    }
  }
  return { roots: dataset.roots.length, candidates }
}

export function buildActionPreferenceRows(dataset, options = {}) {
  validateActionRegretDataset(dataset, options)
  return dataset.roots.flatMap((root) => {
    const comparisons = []
    for (let leftIndex = 0; leftIndex < root.candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < root.candidates.length; rightIndex += 1) {
        const left = root.candidates[leftIndex]
        const right = root.candidates[rightIndex]
        const marginDifference = left.terminalMargin - right.terminalMargin
        if (marginDifference === 0) continue
        comparisons.push({
          gameId: `${root.rootId}:${left.candidateId}>${right.candidateId}`,
          rootId: root.rootId,
          split: dataset.split,
          turn: root.turn,
          phase: root.phase,
          leftCandidateId: left.candidateId,
          rightCandidateId: right.candidateId,
          difference: left.postActionPairFeatures.map(
            (value, index) => value - right.postActionPairFeatures[index],
          ),
          target: Math.sign(marginDifference),
          terminalMargin: marginDifference,
        })
      }
    }
    assert.ok(comparisons.length > 0, `root ${root.rootId} has no decisive comparison`)
    return comparisons.map((comparison) => ({
      ...comparison,
      weight: 1 / comparisons.length,
    }))
  })
}
