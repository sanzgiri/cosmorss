#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, '../tmp/fast_filtered_with_corporate.json');
const OUTPUT = path.join(__dirname, '../src/config/feeds.json');
const TARGET = parseInt(process.argv[3], 10) || 343;

const TIERS = {
  high: { minScore: 75, postsPerFeed: 4 },
  medium: { minScore: 45, postsPerFeed: 2 },
  low: { minScore: 0, postsPerFeed: 1 },
};

function getPostsPerFeed(score) {
  if (score >= TIERS.high.minScore) return TIERS.high.postsPerFeed;
  if (score >= TIERS.medium.minScore) return TIERS.medium.postsPerFeed;
  return TIERS.low.postsPerFeed;
}

if (!fs.existsSync(INPUT)) {
  console.error(`Input not found: ${INPUT}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
const feeds = payload.feeds || [];

const sorted = feeds.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
const selected = sorted.slice(0, TARGET);

const config = {
  settings: {
    maxFeeds: selected.length,
    refreshIntervalMinutes: 60,
    maxAgeDays: 14,
  },
  feeds: selected.map((feed) => ({
    url: feed.url,
    category: feed.primaryCategory || 'General',
    categories: feed.categories || [],
    score: feed.score || 0,
    postsPerFeed: getPostsPerFeed(feed.score || 0),
  })),
};

fs.writeFileSync(OUTPUT, JSON.stringify(config, null, 2));
console.log(`Wrote ${selected.length} feeds to ${OUTPUT}`);
