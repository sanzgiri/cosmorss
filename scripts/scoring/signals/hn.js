const { fetchJson } = require('../utils/fetch');
const cache = require('../utils/cache');
const { limiters } = require('../utils/rate-limiter');

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const WEIGHT = 0.25;

/**
 * Get Hacker News score for a domain
 * Returns: { raw: number, normalized: number (0-100) }
 */
async function getScore(domain) {
  const cacheKey = `hn_${domain}`;
  const cached = cache.get(cacheKey, CACHE_TTL);

  if (cached !== null) {
    return cached;
  }

  await limiters.hn.wait();

  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(domain)}&tags=story&hitsPerPage=100`;
    const json = await fetchJson(url, { timeout: 10000 });

    let stories = 0;
    let totalPoints = 0;

    if (json.hits && json.hits.length > 0) {
      const domainHits = json.hits.filter(h => h.url && h.url.includes(domain));
      stories = domainHits.length;
      totalPoints = domainHits.reduce((sum, h) => sum + (h.points || 0), 0);
    }

    const avgPoints = stories > 0 ? totalPoints / stories : 0;

    // Normalize: 50+ stories or 200+ avg points = 100
    const storyScore = Math.min(stories / 50, 1) * 50;
    const pointsScore = Math.min(avgPoints / 200, 1) * 50;
    const normalized = Math.round(storyScore + pointsScore);

    const result = {
      raw: { stories, totalPoints, avgPoints: Math.round(avgPoints) },
      normalized
    };

    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    const result = { raw: { stories: 0, totalPoints: 0, avgPoints: 0 }, normalized: 0 };
    cache.set(cacheKey, result);
    return result;
  }
}

module.exports = { getScore, WEIGHT, name: 'hn' };
