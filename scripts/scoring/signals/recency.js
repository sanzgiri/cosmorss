/**
 * Calculate recency multiplier (not a weighted score, but a multiplier)
 * Expects feedData with parsed post dates
 * Returns: { raw: object, multiplier: number (0.5-1.2) }
 */
function getMultiplier(feedData) {
  if (!feedData || !feedData.dates || feedData.dates.length === 0) {
    return {
      raw: { latestPostDaysAgo: null },
      multiplier: 0.5
    };
  }

  const now = Date.now();
  const latestPost = Math.max(...feedData.dates);
  const daysAgo = (now - latestPost) / (24 * 60 * 60 * 1000);

  let multiplier;
  if (daysAgo < 1) {
    multiplier = 1.2;  // Posted today
  } else if (daysAgo < 3) {
    multiplier = 1.15; // Posted in last 3 days
  } else if (daysAgo < 7) {
    multiplier = 1.1;  // Posted in last week
  } else if (daysAgo < 14) {
    multiplier = 1.0;  // Posted in last 2 weeks
  } else if (daysAgo < 30) {
    multiplier = 0.9;  // Posted in last month
  } else if (daysAgo < 60) {
    multiplier = 0.7;  // Posted in last 2 months
  } else {
    multiplier = 0.5;  // Older
  }

  return {
    raw: {
      latestPost: new Date(latestPost).toISOString(),
      daysAgo: Math.round(daysAgo * 10) / 10
    },
    multiplier
  };
}

module.exports = { getMultiplier, name: 'recency' };
