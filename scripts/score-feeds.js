#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');

// Configuration
const INPUT_FILE = process.argv[2] || '/home/node/cosmorss/all_feeds.txt';
const OUTPUT_FILE = '/home/node/cosmorss/scored_feeds.json';
const BATCH_SIZE = 50;
const MAX_FEEDS = parseInt(process.argv[3]) || 5000; // Start with first N feeds
const TIMEOUT = 8000;

// Results storage
const results = [];
let processed = 0;

// Extract domain from URL
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

// Fetch URL with timeout
function fetchUrl(url, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      timeout,
      headers: { 'User-Agent': 'CosmoRSS-Scorer/1.0' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Check HN presence for a domain
async function getHNScore(domain) {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(domain)}&tags=story&hitsPerPage=100`;
    const { data } = await fetchUrl(url, 10000);
    const json = JSON.parse(data);

    if (json.hits && json.hits.length > 0) {
      // Count stories and total points
      const stories = json.hits.filter(h => h.url && h.url.includes(domain));
      const totalPoints = stories.reduce((sum, h) => sum + (h.points || 0), 0);
      return {
        hnStories: stories.length,
        hnPoints: totalPoints,
        hnAvgPoints: stories.length > 0 ? Math.round(totalPoints / stories.length) : 0
      };
    }
  } catch (e) {
    // Ignore HN errors
  }
  return { hnStories: 0, hnPoints: 0, hnAvgPoints: 0 };
}

// Parse feed and check activity
async function checkFeedActivity(feedUrl) {
  try {
    const { status, data } = await fetchUrl(feedUrl);

    if (status !== 200) {
      return { active: false, error: `HTTP ${status}` };
    }

    // Simple XML parsing for dates
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

    // Find all date-like patterns
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

    if (dates.length === 0) {
      return { active: false, error: 'No dates found' };
    }

    dates.sort((a, b) => b - a); // newest first
    const latestPost = dates[0];
    const postsLast30Days = dates.filter(d => d > thirtyDaysAgo).length;
    const postsLast90Days = dates.filter(d => d > ninetyDaysAgo).length;

    // Extract title
    const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;

    return {
      active: latestPost > thirtyDaysAgo,
      title,
      latestPost: new Date(latestPost).toISOString(),
      postsLast30Days,
      postsLast90Days,
      totalPosts: dates.length
    };
  } catch (e) {
    return { active: false, error: e.message };
  }
}

// Categorize based on URL/title
function categorize(url, title = '') {
  const text = (url + ' ' + (title || '')).toLowerCase();
  if (text.match(/secur|hack|cyber|infosec/)) return 'Security';
  if (text.match(/photo|camera|film|fuji|leica/)) return 'Photography';
  if (text.match(/music|audio|sound|synth|guitar/)) return 'Music';
  if (text.match(/game|gaming|nintendo|playstation/)) return 'Gaming';
  if (text.match(/art|design|creative|ux|ui/)) return 'Design';
  if (text.match(/food|cook|recipe|kitchen/)) return 'Food';
  if (text.match(/travel|adventure|hiking/)) return 'Travel';
  if (text.match(/science|physics|math|biology/)) return 'Science';
  if (text.match(/book|read|writing|fiction|novel/)) return 'Writing';
  if (text.match(/finance|money|invest|stock|crypto/)) return 'Finance';
  if (text.match(/\bai\b|machine.?learn|neural|gpt|llm/)) return 'AI';
  if (text.match(/tech|software|programming|code|dev/)) return 'Tech';
  return 'Blog';
}

// Process a single feed
async function processFeed(feedUrl) {
  const domain = getDomain(feedUrl);
  if (!domain) return null;

  const [activity, hn] = await Promise.all([
    checkFeedActivity(feedUrl),
    getHNScore(domain)
  ]);

  if (!activity.active) {
    return null; // Skip inactive feeds
  }

  // Calculate composite score
  // Weight: activity (40%) + HN presence (60%)
  const activityScore = Math.min(activity.postsLast30Days * 10, 100);
  const hnScore = Math.min(hn.hnStories * 5 + hn.hnAvgPoints, 100);
  const totalScore = Math.round(activityScore * 0.4 + hnScore * 0.6);

  return {
    url: feedUrl,
    domain,
    title: activity.title,
    category: categorize(feedUrl, activity.title),
    score: totalScore,
    activity: {
      postsLast30Days: activity.postsLast30Days,
      postsLast90Days: activity.postsLast90Days,
      latestPost: activity.latestPost
    },
    hn: {
      stories: hn.hnStories,
      totalPoints: hn.hnPoints,
      avgPoints: hn.hnAvgPoints
    }
  };
}

// Process feeds in batches
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

// Main
async function main() {
  console.log(`Reading feeds from ${INPUT_FILE}...`);
  const allFeeds = fs.readFileSync(INPUT_FILE, 'utf-8')
    .split('\n')
    .filter(url => url.trim().startsWith('http'))
    .slice(0, MAX_FEEDS);

  console.log(`Processing ${allFeeds.length} feeds in batches of ${BATCH_SIZE}...`);
  console.log('This will take a while. Progress updates every batch.\n');

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
}

function saveResults() {
  // Sort by score
  results.sort((a, b) => b.score - a.score);

  const output = {
    generatedAt: new Date().toISOString(),
    totalFeeds: results.length,
    feeds: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

main().catch(console.error);
