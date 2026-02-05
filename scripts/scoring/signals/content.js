const WEIGHT = 0.15;

/**
 * Calculate content quality score from feed content
 * Expects feedData with post titles and optional descriptions
 * Returns: { raw: object, normalized: number (0-100) }
 */
function getScore(feedData) {
  if (!feedData || !feedData.posts || feedData.posts.length === 0) {
    return {
      raw: { avgTitleLength: 0, substantiveTitles: 0, avgWordCount: 0 },
      normalized: 0
    };
  }

  const posts = feedData.posts;

  // Title quality metrics
  const titleLengths = posts.map(p => (p.title || '').length);
  const avgTitleLength = titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length;

  // Count "substantive" titles (not just clickbait or too short)
  const substantiveTitles = posts.filter(p => {
    const title = p.title || '';
    // Good title: 20-200 chars, not all caps, contains words
    return title.length >= 20 &&
           title.length <= 200 &&
           title !== title.toUpperCase() &&
           title.split(/\s+/).length >= 3;
  }).length;

  const substantiveRatio = substantiveTitles / posts.length;

  // Word count in descriptions (if available)
  let totalWordCount = 0;
  let descriptionCount = 0;
  for (const post of posts) {
    if (post.description) {
      const words = post.description.replace(/<[^>]*>/g, '').split(/\s+/).length;
      totalWordCount += words;
      descriptionCount++;
    }
  }
  const avgWordCount = descriptionCount > 0 ? totalWordCount / descriptionCount : 0;

  // Scoring:
  // - Good title length (40-100 chars) = 30 points
  // - High substantive ratio (>0.8) = 40 points
  // - Good description length (100+ words avg) = 30 points
  const titleLengthScore = avgTitleLength >= 40 && avgTitleLength <= 100
    ? 30
    : Math.max(0, 30 - Math.abs(avgTitleLength - 70) / 2);

  const substantiveScore = substantiveRatio * 40;

  const wordCountScore = Math.min(avgWordCount / 100, 1) * 30;

  const normalized = Math.round(titleLengthScore + substantiveScore + wordCountScore);

  return {
    raw: {
      avgTitleLength: Math.round(avgTitleLength),
      substantiveRatio: Math.round(substantiveRatio * 100) / 100,
      avgWordCount: Math.round(avgWordCount)
    },
    normalized
  };
}

module.exports = { getScore, WEIGHT, name: 'content' };
