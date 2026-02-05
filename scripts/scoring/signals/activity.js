const WEIGHT = 0.20;

/**
 * Calculate activity score from feed data
 * Expects feedData with parsed post dates
 * Returns: { raw: object, normalized: number (0-100) }
 */
function getScore(feedData) {
  if (!feedData || !feedData.dates || feedData.dates.length === 0) {
    return {
      raw: { postsLast30Days: 0, postsLast90Days: 0, totalPosts: 0 },
      normalized: 0
    };
  }

  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

  const postsLast30Days = feedData.dates.filter(d => d > thirtyDaysAgo).length;
  const postsLast90Days = feedData.dates.filter(d => d > ninetyDaysAgo).length;
  const totalPosts = feedData.dates.length;

  // Scoring:
  // - 10+ posts in 30 days = max recent activity score (50 points)
  // - 30+ posts in 90 days = max sustained activity score (50 points)
  const recentScore = Math.min(postsLast30Days / 10, 1) * 50;
  const sustainedScore = Math.min(postsLast90Days / 30, 1) * 50;
  const normalized = Math.round(recentScore + sustainedScore);

  return {
    raw: { postsLast30Days, postsLast90Days, totalPosts },
    normalized
  };
}

module.exports = { getScore, WEIGHT, name: 'activity' };
