import assert from 'node:assert/strict'

function orderedBest(items, value, staticRank) {
  return items.reduce((best, item) => {
    if (!best) return item
    const itemValue = value(item)
    const bestValue = value(best)
    if (itemValue > bestValue) return item
    if (itemValue < bestValue) return best
    return staticRank.get(item.candidateId) < staticRank.get(best.candidateId) ? item : best
  }, null)
}

/** Compare leaf recommendations while holding root candidates and terminal continuations fixed. */
export function summarizeFixedRootCutoffs({ staticOrder, cutoffs, candidates }) {
  assert.ok(Array.isArray(staticOrder) && staticOrder.length > 0, 'static order is required')
  assert.equal(new Set(staticOrder).size, staticOrder.length, 'static order must be unique')
  assert.ok(Array.isArray(cutoffs) && cutoffs.length > 0, 'cutoffs are required')
  assert.deepEqual(
    cutoffs,
    [...new Set(cutoffs)].sort((left, right) => left - right),
    'cutoffs must be unique and sorted',
  )
  assert.ok(cutoffs.every((cutoff) => Number.isInteger(cutoff) && cutoff >= 0),
    'cutoffs must be non-negative integers')
  assert.ok(Array.isArray(candidates) && candidates.length === staticOrder.length,
    'every static candidate requires a trajectory')
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]))
  assert.equal(byId.size, candidates.length, 'candidate trajectories must be unique')
  assert.deepEqual([...byId.keys()].sort(), [...staticOrder].sort(), 'candidate set drift')
  for (const candidate of candidates) {
    assert.ok(Number.isFinite(candidate.terminalMargin), 'terminal margin must be finite')
    for (const cutoff of cutoffs) {
      assert.ok(Number.isFinite(candidate.leafScores?.[cutoff]),
        `candidate ${candidate.candidateId} is missing cutoff ${cutoff}`)
    }
  }

  const staticRank = new Map(staticOrder.map((candidateId, index) => [candidateId, index]))
  const oracle = orderedBest(candidates, (candidate) => candidate.terminalMargin, staticRank)
  const cutoffResults = cutoffs.map((cutoff) => {
    const selected = orderedBest(candidates, (candidate) => candidate.leafScores[cutoff], staticRank)
    return {
      cutoff,
      selectedCandidate: selected.candidateId,
      selectedLeafScore: selected.leafScores[cutoff],
      selectedTerminalMargin: selected.terminalMargin,
      matchesOracle: selected.candidateId === oracle.candidateId,
      allAbstained: candidates.every((candidate) => candidate.leafScores[cutoff] === 0),
    }
  })
  const reversals = { total: 0, towardOracle: 0, awayFromOracle: 0, lateral: 0 }
  for (let index = 1; index < cutoffResults.length; index += 1) {
    const previous = cutoffResults[index - 1]
    const current = cutoffResults[index]
    if (previous.selectedCandidate === current.selectedCandidate) continue
    reversals.total += 1
    if (!previous.matchesOracle && current.matchesOracle) reversals.towardOracle += 1
    else if (previous.matchesOracle && !current.matchesOracle) reversals.awayFromOracle += 1
    else reversals.lateral += 1
  }
  return {
    oracleCandidate: oracle.candidateId,
    oracleTerminalMargin: oracle.terminalMargin,
    cutoffs: cutoffResults,
    reversals,
  }
}
