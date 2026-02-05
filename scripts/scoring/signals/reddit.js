const { fetchJson } = require('../utils/fetch');
const cache = require('../utils/cache');
const { limiters } = require('../utils/rate-limiter');

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const WEIGHT = 0.10;

/**
 * Get Reddit score for a domain
 * Returns: { raw: number, normalized: number (0-100) }
 */
async function getScore(domain) {
  const cacheKey = `reddit_${domain}`;
  const cached = cache.get(cacheKey, CACHE_TTL);

  if (cached !== null) {
    return cached;
  }

  await limiters.reddit.wait();

  try {
    // Reddit search API (public, no auth needed for basic searches)
    const url = `https://www.reddit.com/search.json?q=site:${encodeURIComponent(domain)}&sort=top&limit=100`;
    const json = await fetchJson(url, {
      timeout: 10000,
      userAgent: 'CosmoRSS-Scorer/2.0 (RSS feed curation tool)'
    });

    let posts = 0;
    let totalScore = 0;
    let totalComments = 0;

    if (json?.data?.children) {
      posts = json.data.children.length;
      for (const child of json.data.children) {
        totalScore += child.data.score || 0;
        totalComments += child.data.num_comments || 0;
      }
    }

    const avgScore = posts > 0 ? totalScore / posts : 0;

    // Normalize: 30+ posts or 100+ avg score = 100
    const postScore = Math.min(posts / 30, 1) * 50;
    const scoreScore = Math.min(avgScore / 100, 1) * 50;
    const normalized = Math.round(postScore + scoreScore);

    const result = {
      raw: { posts, totalScore, totalComments, avgScore: Math.round(avgScore) },
      normalized
    };

    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    const result = { raw: { posts: 0, totalScore: 0, totalComments: 0, avgScore: 0 }, normalized: 0 };
    cache.set(cacheKey, result);
    return result;
  }
}

module.exports = { getScore, WEIGHT, name: 'reddit' };
