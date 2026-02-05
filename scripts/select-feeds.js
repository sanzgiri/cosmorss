#!/usr/bin/env node

/**
 * Feed selection with quota-based category balancing
 * Ensures minority categories get visibility while prioritizing high-scoring feeds
 */

const fs = require('fs');
const path = require('path');

const SCORED_FEEDS_FILE = process.argv[2] || path.join(__dirname, '../scored_feeds.json');
const OUTPUT_FILE = path.join(__dirname, '../src/config/feeds.json');
const TARGET_FEEDS = parseInt(process.argv[3]) || 300;

// Tier configuration for postsPerFeed
const TIERS = {
  high: { minScore: 75, postsPerFeed: 4 },
  medium: { minScore: 45, postsPerFeed: 2 },
  low: { minScore: 0, postsPerFeed: 1 }
};

// Category quotas (min, max, priority)
// Priority: 3 = highest, 0 = lowest (fill last)
const QUOTAS = {
  'Security': { min: 15, max: 50, priority: 3 },
  'AI/ML': { min: 20, max: 60, priority: 3 },
  'Web Development': { min: 30, max: 80, priority: 2 },
  'Backend/Infrastructure': { min: 20, max: 60, priority: 2 },
  'Systems/Low-Level': { min: 15, max: 40, priority: 2 },
  'Startups/Business': { min: 15, max: 40, priority: 1 },
  'Career/Personal': { min: 10, max: 30, priority: 1 },
  'Science': { min: 10, max: 30, priority: 1 },
  'Design': { min: 10, max: 30, priority: 1 },
  'Gaming': { min: 10, max: 25, priority: 1 },
  'Open Source': { min: 10, max: 30, priority: 2 },
  'General': { min: 20, max: 100, priority: 0 }
};

// Proxy domains to skip or rename
const PROXY_DOMAINS = ['feeds.feedburner.com', 'feedproxy.google.com', 'rss.app'];

/**
 * Calculate postsPerFeed tier based on score
 */
function getPostsPerFeed(score) {
  if (score >= TIERS.high.minScore) return TIERS.high.postsPerFeed;
  if (score >= TIERS.medium.minScore) return TIERS.medium.postsPerFeed;
  return TIERS.low.postsPerFeed;
}

/**
 * Get tier name based on score
 */
function getTierName(score) {
  if (score >= TIERS.high.minScore) return 'high';
  if (score >= TIERS.medium.minScore) return 'medium';
  return 'low';
}

/**
 * Select feeds using quota-based algorithm
 */
function selectFeeds(scoredFeeds, targetCount) {
  // Dedupe by domain
  const seenDomains = new Set();
  const dedupedFeeds = scoredFeeds.filter(f => {
    let domain = f.domain;

    // Handle proxy domains
    if (PROXY_DOMAINS.some(p => domain.includes(p))) {
      const match = f.url.match(/feedburner\.com\/([^\/\?]+)/);
      if (match) {
        domain = match[1];
      } else {
        return false;
      }
    }

    if (seenDomains.has(domain)) return false;
    seenDomains.add(domain);
    return true;
  });

  // Group by primary category
  const byCategory = {};
  for (const feed of dedupedFeeds) {
    const cat = feed.primaryCategory || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(feed);
  }

  // Sort each category by score
  for (const cat in byCategory) {
    byCategory[cat].sort((a, b) => b.score - a.score);
  }

  const selected = [];
  const categoryCount = {};

  // Initialize counts
  for (const cat in QUOTAS) {
    categoryCount[cat] = 0;
  }

  // Phase 1: Fill minimum quotas (high priority first)
  const priorityOrder = Object.entries(QUOTAS)
    .sort((a, b) => b[1].priority - a[1].priority)
    .map(([cat]) => cat);

  for (const cat of priorityOrder) {
    const quota = QUOTAS[cat];
    const available = byCategory[cat] || [];

    while (categoryCount[cat] < quota.min && available.length > 0 && selected.length < targetCount) {
      const feed = available.shift();
      selected.push(feed);
      categoryCount[cat]++;
    }
  }

  // Phase 2: Fill remaining slots with top-scoring feeds (respect max limits)
  const remaining = [];
  for (const cat in byCategory) {
    remaining.push(...byCategory[cat]);
  }
  remaining.sort((a, b) => b.score - a.score);

  for (const feed of remaining) {
    if (selected.length >= targetCount) break;

    const cat = feed.primaryCategory || 'General';
    const quota = QUOTAS[cat] || { min: 0, max: Infinity };

    if (categoryCount[cat] < quota.max) {
      selected.push(feed);
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }
  }

  return { selected, categoryCount };
}

/**
 * Main function
 */
function main() {
  console.log(`Reading scored feeds from ${SCORED_FEEDS_FILE}...`);

  if (!fs.existsSync(SCORED_FEEDS_FILE)) {
    console.error(`Scored feeds file not found: ${SCORED_FEEDS_FILE}`);
    console.error('Run scripts/scoring/index.js first to generate scored_feeds.json');
    process.exit(1);
  }

  const scored = JSON.parse(fs.readFileSync(SCORED_FEEDS_FILE, 'utf-8'));
  console.log(`Loaded ${scored.feeds.length} scored feeds`);

  // Select feeds
  const { selected, categoryCount } = selectFeeds(scored.feeds, TARGET_FEEDS);
  console.log(`Selected ${selected.length} feeds`);

  // Calculate tier distribution
  const tierCount = { high: 0, medium: 0, low: 0 };
  for (const feed of selected) {
    tierCount[getTierName(feed.score)]++;
  }

  // Build output config
  const config = {
    settings: {
      maxFeeds: selected.length,
      refreshIntervalMinutes: 60,
      maxAgeDays: 14
    },
    feeds: selected.map(f => ({
      url: f.url,
      category: f.primaryCategory || 'General',
      categories: f.categories,
      score: f.score,
      postsPerFeed: getPostsPerFeed(f.score)
    }))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${OUTPUT_FILE}`);

  // Print statistics
  console.log('\n=== Selection Statistics ===\n');

  console.log('Category distribution:');
  Object.entries(categoryCount)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const quota = QUOTAS[cat] || { min: 0, max: Infinity };
      const pct = ((count / selected.length) * 100).toFixed(1);
      const status = count >= quota.min ? '✓' : '✗';
      console.log(`  ${status} ${cat}: ${count} (${pct}%) [quota: ${quota.min}-${quota.max}]`);
    });

  console.log('\nTier distribution (postsPerFeed):');
  console.log(`  High (${TIERS.high.postsPerFeed} posts, score >= ${TIERS.high.minScore}): ${tierCount.high}`);
  console.log(`  Medium (${TIERS.medium.postsPerFeed} posts, score >= ${TIERS.medium.minScore}): ${tierCount.medium}`);
  console.log(`  Low (${TIERS.low.postsPerFeed} post, score < ${TIERS.medium.minScore}): ${tierCount.low}`);

  console.log('\nScore distribution:');
  const scores = selected.map(f => f.score);
  console.log(`  Min: ${Math.min(...scores)}`);
  console.log(`  Max: ${Math.max(...scores)}`);
  console.log(`  Avg: ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}`);

  console.log('\nTop 10 selected feeds:');
  selected.slice(0, 10).forEach((f, i) => {
    const name = f.title || f.domain;
    console.log(`  ${i + 1}. ${name} (score: ${f.score}, ${f.primaryCategory}, ${getPostsPerFeed(f.score)} posts)`);
  });
}

main();
