import assert from 'node:assert/strict'

/** Audit candidate scores against terminal margins while preserving static order on score ties. */
export function auditActionRegretRanking(dataset, scoreCandidate) {
  assert.ok(Array.isArray(dataset?.roots) && dataset.roots.length > 0, 'roots are required')
  assert.equal(typeof scoreCandidate, 'function', 'candidate scorer is required')
  const details = dataset.roots.map((root) => {
    assert.ok(Array.isArray(root.candidates) && root.candidates.length >= 2,
      `root ${root.rootId} requires candidates`)
    const scored = root.candidates.map((candidate) => {
      const score = scoreCandidate(candidate, root)
      assert.ok(Number.isFinite(score), `candidate ${candidate.candidateId} score must be finite`)
      return { candidate, score }
    })
    const selected = scored.reduce((best, entry) => (
      !best || entry.score > best.score ? entry : best
    ), null)
    const oracleMargin = Math.max(...root.candidates.map((candidate) => candidate.terminalMargin))
    const oracleCandidateIds = root.candidates
      .filter((candidate) => candidate.terminalMargin === oracleMargin)
      .map((candidate) => candidate.candidateId)
    return {
      rootId: root.rootId,
      selectedCandidateId: selected.candidate.candidateId,
      selectedScore: selected.score,
      selectedTerminalMargin: selected.candidate.terminalMargin,
      oracleCandidateIds,
      oracleTerminalMargin: oracleMargin,
      correct: oracleCandidateIds.includes(selected.candidate.candidateId),
      terminalRegret: oracleMargin - selected.candidate.terminalMargin,
    }
  })
  const top1Correct = details.filter((detail) => detail.correct).length
  return {
    schemaVersion: 'fcm.action-regret-ranking-audit.v1',
    roots: details.length,
    top1Correct,
    top1Accuracy: top1Correct / details.length,
    meanTerminalRegret: details.reduce((sum, detail) => sum + detail.terminalRegret, 0) /
      details.length,
    worstTerminalRegret: Math.max(...details.map((detail) => detail.terminalRegret)),
    details,
  }
}
