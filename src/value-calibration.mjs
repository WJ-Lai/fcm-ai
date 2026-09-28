import assert from 'node:assert/strict'

const OBSERVATION_PROVENANCE = 'seat-visible-decision-view'
const TARGET_PROVENANCE = 'terminal-result'
const SPLITS = new Set(['development', 'holdout'])

function validateSeats(entries, label, valueKey) {
  assert.ok(Array.isArray(entries) && entries.length >= 2, `${label} requires at least two seats`)
  const seats = entries.map((entry) => entry.seat)
  assert.equal(new Set(seats).size, seats.length, `${label} seats must be unique`)
  for (const entry of entries) {
    assert.ok(Number.isInteger(entry.seat) && entry.seat >= 0, `${label} seat must be non-negative`)
    assert.ok(Number.isFinite(entry[valueKey]), `${label} ${valueKey} must be finite`)
  }
  return [...seats].sort((left, right) => left - right)
}

export function terminalSeatTargets(players) {
  validateSeats(players, 'terminal', 'money')
  const orderedMoney = [...players].map((player) => player.money).sort((a, b) => b - a)
  const bestMoney = orderedMoney[0]
  const count = players.length
  return players.map((player) => {
    const better = orderedMoney.filter((money) => money > player.money).length
    const equal = orderedMoney.filter((money) => money === player.money).length
    const rank = better + (equal + 1) / 2
    const opponentBest = Math.max(...players
      .filter((other) => other.seat !== player.seat)
      .map((other) => other.money))
    return {
      seat: player.seat,
      rank,
      rankValue: count === 1 ? 1 : (count - rank) / (count - 1),
      first: player.money === bestMoney,
      money: player.money,
      opponentMargin: player.money - opponentBest,
    }
  })
}

export function phaseBucket({ turn }) {
  assert.ok(Number.isInteger(turn) && turn > 0, 'turn must be a positive integer')
  if (turn <= 3) return 'early'
  if (turn <= 6) return 'middle'
  return 'late'
}

function sampleCredits(sample) {
  const predictionSeats = validateSeats(sample.predictions, 'predictions', 'score')
  const terminalSeats = validateSeats(sample.terminal, 'terminal', 'money')
  assert.deepEqual(predictionSeats, terminalSeats, 'prediction and terminal seat sets differ')

  const bestScore = Math.max(...sample.predictions.map((entry) => entry.score))
  const predictedLeaders = sample.predictions
    .filter((entry) => entry.score === bestScore)
    .map((entry) => entry.seat)
  const bestMoney = Math.max(...sample.terminal.map((entry) => entry.money))
  const terminalLeaders = new Set(sample.terminal
    .filter((entry) => entry.money === bestMoney)
    .map((entry) => entry.seat))
  const leaderCredit = predictedLeaders.filter((seat) => terminalLeaders.has(seat)).length /
    predictedLeaders.length

  const predictions = new Map(sample.predictions.map((entry) => [entry.seat, entry.score]))
  const terminal = new Map(sample.terminal.map((entry) => [entry.seat, entry.money]))
  let pairwiseComparable = 0
  let pairwiseCredit = 0
  for (let left = 0; left < predictionSeats.length; left += 1) {
    for (let right = left + 1; right < predictionSeats.length; right += 1) {
      const a = predictionSeats[left]
      const b = predictionSeats[right]
      const actual = Math.sign(terminal.get(a) - terminal.get(b))
      if (actual === 0) continue
      pairwiseComparable += 1
      const predicted = Math.sign(predictions.get(a) - predictions.get(b))
      if (predicted === 0) pairwiseCredit += 0.5
      else if (predicted === actual) pairwiseCredit += 1
    }
  }
  return {
    leaderCredit,
    predictedLeaderTie: predictedLeaders.length > 1 ? 1 : 0,
    decisiveLeaderCorrect: predictedLeaders.length === 1 && leaderCredit === 1 ? 1 : 0,
    pairwiseComparable,
    pairwiseCredit,
  }
}

function aggregate(samples) {
  const credits = samples.map(sampleCredits)
  const leaderCredit = credits.reduce((sum, item) => sum + item.leaderCredit, 0)
  const predictedLeaderTies = credits.reduce((sum, item) => sum + item.predictedLeaderTie, 0)
  const decisiveLeaderSamples = samples.length - predictedLeaderTies
  const decisiveLeaderCorrect = credits.reduce(
    (sum, item) => sum + item.decisiveLeaderCorrect,
    0,
  )
  const pairwiseComparable = credits.reduce((sum, item) => sum + item.pairwiseComparable, 0)
  const pairwiseCredit = credits.reduce((sum, item) => sum + item.pairwiseCredit, 0)
  return {
    samples: samples.length,
    leaderCredit,
    leaderAccuracy: samples.length ? leaderCredit / samples.length : null,
    predictedLeaderTies,
    decisiveLeaderSamples,
    decisiveLeaderCorrect,
    decisiveLeaderAccuracy: decisiveLeaderSamples
      ? decisiveLeaderCorrect / decisiveLeaderSamples
      : null,
    pairwiseComparable,
    pairwiseCredit,
    pairwiseConcordance: pairwiseComparable ? pairwiseCredit / pairwiseComparable : null,
  }
}

export function summarizeValueCalibration(samples) {
  assert.ok(Array.isArray(samples) && samples.length > 0, 'calibration samples are required')
  const seedSplits = new Map()
  for (const sample of samples) {
    assert.ok(typeof sample.gameId === 'string' && sample.gameId, 'gameId is required')
    assert.ok(typeof sample.seed === 'string' && sample.seed, 'seed is required')
    assert.ok(SPLITS.has(sample.split), 'split must be development or holdout')
    assert.equal(
      sample.provenance?.observation,
      OBSERVATION_PROVENANCE,
      'observation provenance must be seat-visible',
    )
    assert.equal(sample.provenance?.target, TARGET_PROVENANCE, 'target provenance must be terminal')
    phaseBucket(sample)
    const prior = seedSplits.get(sample.seed)
    assert.ok(!prior || prior === sample.split, `seed split leakage: ${sample.seed}`)
    seedSplits.set(sample.seed, sample.split)
    sampleCredits(sample)
  }

  const bySplit = Object.fromEntries([...SPLITS]
    .map((split) => [split, samples.filter((sample) => sample.split === split)])
    .filter(([, selected]) => selected.length)
    .map(([split, selected]) => [split, aggregate(selected)]))
  const byPhase = Object.fromEntries(['early', 'middle', 'late']
    .map((bucket) => [bucket, samples.filter((sample) => phaseBucket(sample) === bucket)])
    .filter(([, selected]) => selected.length)
    .map(([bucket, selected]) => [bucket, aggregate(selected)]))
  const gameIds = [...new Set(samples.map((sample) => sample.gameId))].sort()
  const byGame = Object.fromEntries(gameIds.map((gameId) => [
    gameId,
    aggregate(samples.filter((sample) => sample.gameId === gameId)),
  ]))
  const gameMetrics = Object.values(byGame)
  const definedPairwise = gameMetrics.filter((metric) => metric.pairwiseConcordance !== null)

  return {
    schemaVersion: 'fcm.value-calibration-report.v1',
    provenance: { observation: OBSERVATION_PROVENANCE, target: TARGET_PROVENANCE },
    overall: aggregate(samples),
    gameMacro: {
      games: gameMetrics.length,
      meanLeaderAccuracy: gameMetrics.reduce(
        (sum, metric) => sum + metric.leaderAccuracy,
        0,
      ) / gameMetrics.length,
      meanPairwiseConcordance: definedPairwise.length
        ? definedPairwise.reduce((sum, metric) => sum + metric.pairwiseConcordance, 0) /
          definedPairwise.length
        : null,
    },
    byGame,
    bySplit,
    byPhase,
  }
}
