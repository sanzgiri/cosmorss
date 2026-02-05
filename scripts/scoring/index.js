#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { fetchUrl } = require('./utils/fetch');
const cache = require('./utils/cache');
const { limiters, sleep } = require('./utils/rate-limiter');

// Signal modules
const hnSignal = require('./signals/hn');
const lobstersSignal = require('./signals/lobsters');
const redditSignal = require('./signals/reddit');
const activitySignal = require('./signals/activity');
const consistencySignal = require('./signals/consistency');
const contentSignal = require('./signals/content');
const recencySignal = require('./signals/recency');

// Configuration
const INPUT_FILE = process.argv[2] || path.join(__dirname, '../../all_feeds.txt');
const OUTPUT_FILE = path.join(__dirname, '../../scored_feeds.json');
const BATCH_SIZE = 50;
const MAX_FEEDS = parseInt(process.argv[3]) || 5000;
const FEED_TIMEOUT = 8000;

// Results storage
const results = [];
let processed = 0;

/**
 * Extract domain from URL
 */
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Parse feed and extract structured data
 */
async function parseFeed(feedUrl) {
  await limiters.feed.wait();

  try {
    const { status, data } = await fetchUrl(feedUrl, { timeout: FEED_TIMEOUT });

    if (status !== 200) {
      return { error: `HTTP ${status}` };
    }

    // Parse dates
    const datePatterns = [
      /<pubDate>([^<]+)<\/pubDate>/gi,
      /<published>([^<]+)<\/published>/gi,
      /<updated>([^<]+)<\/updated>/gi,
      /<dc:date>([^<]+)<\/dc:date>/gi,
    ];

    const dates = [];
    for (const pattern of datePatterns) {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime())) {
          dates.push(d.getTime());
        }
      }
    }

    // Parse titles and descriptions
    const posts = [];

    // RSS items
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(data)) !== null && posts.length < 20) {
      const itemContent = itemMatch[1];
      const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const descMatch = itemContent.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

      posts.push({
        title: titleMatch ? cleanText(titleMatch[1]) : '',
        description: descMatch ? cleanText(descMatch[1]) : ''
      });
    }

    // Atom entries
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let entryMatch;
    while ((entryMatch = entryRegex.exec(data)) !== null && posts.length < 20) {
      const entryContent = entryMatch[1];
      const titleMatch = entryContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const summaryMatch = entryContent.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
      const contentMatch = entryContent.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);

      posts.push({
        title: titleMatch ? cleanText(titleMatch[1]) : '',
        description: summaryMatch ? cleanText(summaryMatch[1]) : (contentMatch ? cleanText(contentMatch[1]) : '')
      });
    }

    // Extract feed title
    const feedTitleMatch = data.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const feedTitle = feedTitleMatch ? cleanText(feedTitleMatch[1]) : null;

    return {
      title: feedTitle,
      dates: dates.length > 0 ? dates : null,
      posts: posts.length > 0 ? posts : null,
      rawContent: data.slice(0, 5000) // Keep first 5KB for categorization
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Clean text content
 */
function cleanText(text) {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Process a single feed with all signals
 */
async function processFeed(feedUrl) {
  const domain = getDomain(feedUrl);
  if (!domain) return null;

  // Fetch and parse feed
  const feedData = await parseFeed(feedUrl);

  if (feedData.error || !feedData.dates || feedData.dates.length === 0) {
    return null; // Skip feeds with errors or no dates
  }

  // Check if feed is active (has posts in last 30 days)
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const latestPost = Math.max(...feedData.dates);

  if (latestPost < thirtyDaysAgo) {
    return null; // Skip inactive feeds
  }

  // Get social signals (parallel)
  const [hnScore, lobstersScore, redditScore] = await Promise.all([
    hnSignal.getScore(domain),
    lobstersSignal.getScore(domain),
    redditSignal.getScore(domain)
  ]);

  // Get content-based signals (sync, no API calls)
  const activityScore = activitySignal.getScore(feedData);
  const consistencyScore = consistencySignal.getScore(feedData);
  const contentScore = contentSignal.getScore(feedData);
  const recencyData = recencySignal.getMultiplier(feedData);

  // Calculate composite score
  const weightedScore =
    (hnScore.normalized * hnSignal.WEIGHT) +
    (lobstersScore.normalized * lobstersSignal.WEIGHT) +
    (redditScore.normalized * redditSignal.WEIGHT) +
    (activityScore.normalized * activitySignal.WEIGHT) +
    (consistencyScore.normalized * consistencySignal.WEIGHT) +
    (contentScore.normalized * contentSignal.WEIGHT);

  // Apply recency multiplier
  const finalScore = Math.round(weightedScore * recencyData.multiplier);

  return {
    url: feedUrl,
    domain,
    title: feedData.title,
    score: finalScore,
    signals: {
      hn: hnScore,
      lobsters: lobstersScore,
      reddit: redditScore,
      activity: activityScore,
      consistency: consistencyScore,
      content: contentScore,
      recency: recencyData
    },
    // Keep raw data for categorization
    _posts: feedData.posts
  };
}

/**
 * Process feeds in batches
 */
async function processBatch(feeds) {
  const promises = feeds.map(async (url) => {
    try {
      return await processFeed(url);
    } catch (e) {
      return null;
    }
  });
  return Promise.all(promises);
}

/**
 * Save results to file
 */
function saveResults() {
  // Sort by score
  results.sort((a, b) => b.score - a.score);

  const output = {
    generatedAt: new Date().toISOString(),
    totalFeeds: results.length,
    scoreDistribution: {
      min: Math.min(...results.map(f => f.score)),
      max: Math.max(...results.map(f => f.score)),
      avg: Math.round(results.reduce((sum, f) => sum + f.score, 0) / results.length),
      median: results[Math.floor(results.length / 2)]?.score || 0
    },
    feeds: results.map(f => {
      // Remove internal fields before saving
      const { _posts, ...rest } = f;
      return rest;
    })
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

/**
 * Main entry point
 */
async function main() {
  console.log(`Reading feeds from ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const allFeeds = fs.readFileSync(INPUT_FILE, 'utf-8')
    .split('\n')
    .filter(url => url.trim().startsWith('http'))
    .slice(0, MAX_FEEDS);

  console.log(`Processing ${allFeeds.length} feeds in batches of ${BATCH_SIZE}...`);
  console.log('Signals: HN (25%), Lobsters (15%), Reddit (10%), Activity (20%), Consistency (10%), Content (15%)');
  console.log('Recency multiplier: 0.5x - 1.2x\n');

  const startTime = Date.now();

  for (let i = 0; i < allFeeds.length; i += BATCH_SIZE) {
    const batch = allFeeds.slice(i, i + BATCH_SIZE);
    const batchResults = await processBatch(batch);

    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }

    processed += batch.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / elapsed).toFixed(1);
    console.log(`Processed ${processed}/${allFeeds.length} (${results.length} active) - ${rate} feeds/sec`);

    // Save intermediate results every 500 feeds
    if (processed % 500 === 0) {
      saveResults();
    }
  }

  saveResults();
  console.log(`\nDone! Found ${results.length} active feeds.`);
  console.log(`Results saved to ${OUTPUT_FILE}`);

  // Print score distribution
  if (results.length > 0) {
    console.log('\nScore distribution:');
    console.log(`  Min: ${Math.min(...results.map(f => f.score))}`);
    console.log(`  Max: ${Math.max(...results.map(f => f.score))}`);
    console.log(`  Avg: ${Math.round(results.reduce((sum, f) => sum + f.score, 0) / results.length)}`);

    console.log('\nTop 10 by score:');
    results.slice(0, 10).forEach((f, i) => {
      const name = f.title || f.domain;
      console.log(`  ${i + 1}. ${name} (score: ${f.score})`);
    });
  }
}

// Clear old cache entries on startup
cache.clearExpired(48 * 60 * 60 * 1000); // 48 hours

main().catch(console.error);
