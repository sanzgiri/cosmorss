const fs = require('fs');

const scored = JSON.parse(fs.readFileSync('/home/node/cosmorss/scored_feeds.json', 'utf-8'));
const topN = parseInt(process.argv[2]) || 300;

// Dedupe by domain (skip proxy domains)
const seenDomains = new Set();
const proxyDomains = ['feeds.feedburner.com', 'feedproxy.google.com', 'rss.app'];

const dedupedFeeds = scored.feeds.filter(f => {
  // Skip proxy domains or extract real name
  if (proxyDomains.some(p => f.domain.includes(p))) {
    const match = f.url.match(/feedburner\.com\/([^\/\?]+)/);
    if (match) {
      f.domain = match[1];
    } else {
      return false;
    }
  }

  if (seenDomains.has(f.domain)) return false;
  seenDomains.add(f.domain);
  return true;
});

// Get top N
const topFeeds = dedupedFeeds.slice(0, topN);

// Create config
const config = {
  settings: {
    postsPerFeed: 2,
    maxFeeds: topN,
    refreshIntervalMinutes: 60,
    maxAgeDays: 14
  },
  feeds: topFeeds.map(f => ({
    url: f.url,
    category: f.category
  }))
};

fs.writeFileSync('/home/node/cosmorss/src/config/feeds.json', JSON.stringify(config, null, 2));

// Print stats
const categories = {};
topFeeds.forEach(f => {
  categories[f.category] = (categories[f.category] || 0) + 1;
});

console.log('Created config with ' + topFeeds.length + ' unique feeds:');
console.log('Categories:', JSON.stringify(categories, null, 2));
console.log('\nTop 15 by score:');
topFeeds.slice(0, 15).forEach((f, i) => {
  const name = f.title || f.domain;
  console.log((i+1) + '. ' + name + ' (score: ' + f.score + ', HN: ' + f.hn.stories + ' stories, ' + f.activity.postsLast30Days + ' posts/mo)');
});
