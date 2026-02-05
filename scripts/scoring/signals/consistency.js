const WEIGHT = 0.10;

/**
 * Calculate consistency score from post intervals
 * Expects feedData with parsed post dates
 * Returns: { raw: object, normalized: number (0-100) }
 */
function getScore(feedData) {
  if (!feedData || !feedData.dates || feedData.dates.length < 2) {
    return {
      raw: { avgInterval: 0, intervalVariance: 0, consistency: 0 },
      normalized: 0
    };
  }

  const dates = [...feedData.dates].sort((a, b) => b - a); // newest first

  // Calculate intervals between posts
  const intervals = [];
  for (let i = 0; i < dates.length - 1; i++) {
    intervals.push(dates[i] - dates[i + 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const avgIntervalDays = avgInterval / (24 * 60 * 60 * 1000);

  // Calculate variance (lower = more consistent)
  const squaredDiffs = intervals.map(i => Math.pow(i - avgInterval, 2));
  const variance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / intervals.length);
  const coefficientOfVariation = avgInterval > 0 ? variance / avgInterval : 1;

  // Scoring:
  // - Regular posting (1-7 day intervals) = max frequency score (50 points)
  // - Low variance (CV < 0.5) = max consistency score (50 points)
  const frequencyScore = avgIntervalDays > 0
    ? Math.min(7 / avgIntervalDays, 1) * 50
    : 0;
  const consistencyScore = Math.max(0, 1 - coefficientOfVariation) * 50;
  const normalized = Math.round(frequencyScore + consistencyScore);

  return {
    raw: {
      avgIntervalDays: Math.round(avgIntervalDays * 10) / 10,
      coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
      postCount: dates.length
    },
    normalized
  };
}

module.exports = { getScore, WEIGHT, name: 'consistency' };
