const { fetchJson } = require('../utils/fetch');
const cache = require('../utils/cache');
const { limiters } = require('../utils/rate-limiter');

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const WEIGHT = 0.15;

/**
 * Get Lobsters score for a domain
 * Returns: { raw: number, normalized: number (0-100) }
 */
async function getScore(domain) {
  const cacheKey = `lobsters_${domain}`;
  const cached = cache.get(cacheKey, CACHE_TTL);

  if (cached !== null) {
    return cached;
  }

  await limiters.lobsters.wait();

  try {
    // Lobsters search API
    const url = `https://lobste.rs/search.json?q=domain:${encodeURIComponent(domain)}&what=stories&order=score&page=1`;
    const json = await fetchJson(url, { timeout: 10000 });

    let stories = 0;
    let totalScore = 0;

    if (json && Array.isArray(json)) {
      stories = json.length;
      totalScore = json.reduce((sum, story) => sum + (story.score || 0), 0);
    }

    const avgScore = stories > 0 ? totalScore / stories : 0;

    // Normalize: 20+ stories or 50+ avg score = 100
    const storyScore = Math.min(stories / 20, 1) * 50;
    const scoreScore = Math.min(avgScore / 50, 1) * 50;
    const normalized = Math.round(storyScore + scoreScore);

    const result = {
      raw: { stories, totalScore, avgScore: Math.round(avgScore) },
      normalized
    };

    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    const result = { raw: { stories: 0, totalScore: 0, avgScore: 0 }, normalized: 0 };
    cache.set(cacheKey, result);
    return result;
  }
}

module.exports = { getScore, WEIGHT, name: 'lobsters' };
