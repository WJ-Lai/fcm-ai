/** Return the one-based rank of an exact complete action batch, or null. */
export function exactCandidateRank(rankedCandidates, humanActions) {
  const encoded = JSON.stringify(humanActions)
  const index = rankedCandidates.findIndex(
    (candidate) => JSON.stringify(candidate.actions) === encoded,
  )
  return index < 0 ? null : { candidateId: rankedCandidates[index].id, rank: index + 1 }
}
