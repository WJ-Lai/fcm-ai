export function wilsonInterval(successes, samples, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(samples) || samples < 0) {
    throw new TypeError('successes and samples must be non-negative integers')
  }
  if (successes < 0 || successes > samples) {
    throw new RangeError('successes must be between zero and samples')
  }
  if (!Number.isFinite(z) || z <= 0) throw new RangeError('z must be positive')
  if (samples === 0) return null

  const rate = successes / samples
  const zSquared = z * z
  const denominator = 1 + zSquared / samples
  const center = (rate + zSquared / (2 * samples)) / denominator
  const margin = z * Math.sqrt(
    (rate * (1 - rate) + zSquared / (4 * samples)) / samples,
  ) / denominator
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  }
}

export function rankedSampleSummary(samples) {
  const firsts = samples.filter((sample) => sample.rank === 1).length
  return {
    samples: samples.length,
    firsts,
    firstRate: samples.length ? firsts / samples.length : null,
    firstRate95CI: wilsonInterval(firsts, samples.length),
    meanRank: samples.length
      ? samples.reduce((total, sample) => total + sample.rank, 0) / samples.length
      : null,
    meanMoney: samples.length
      ? samples.reduce((total, sample) => total + sample.money, 0) / samples.length
      : null,
  }
}
