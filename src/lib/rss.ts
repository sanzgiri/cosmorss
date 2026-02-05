import Parser from 'rss-parser';

// In-memory cache for feeds (works in dev mode too)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let feedCache: { items: FeedItem[]; timestamp: number } | null = null;

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
  category: string;
}

export interface FeedConfig {
  url: string;
  category: string;
  categories?: string[];
  score?: number;
  postsPerFeed?: number;
}

export interface FeedSettings {
  maxFeeds: number;
  refreshIntervalMinutes: number;
  maxAgeDays: number;
  postsPerFeed?: number; // Default/fallback, deprecated in favor of per-feed
}

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'CosmoRSS/2.0',
  },
});

function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isValidDate(date) ? date : null;
}

export async function fetchFeed(
  feedConfig: FeedConfig,
  postsPerFeed: number,
  maxAgeDays: number
): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    const items: FeedItem[] = [];

    for (const item of feed.items) {
      if (items.length >= postsPerFeed) break;

      const date = parseDate(item.pubDate) || parseDate(item.isoDate);

      // Skip items without valid dates or older than maxAgeDays
      if (!date) continue;
      const timestamp = date.getTime();
      if (now - timestamp > maxAgeMs) continue;

      items.push({
        title: item.title || 'Untitled',
        link: item.link || '#',
        pubDate: date.toISOString(),
        timestamp,
        source: feed.title || new URL(feedConfig.url).hostname,
        sourceUrl: feed.link || feedConfig.url,
        category: feedConfig.category,
      });
    }

    return items;
  } catch (error) {
    console.error(`Failed to fetch feed ${feedConfig.url}:`, error);
    return [];
  }
}

export async function fetchAllFeeds(
  feeds: FeedConfig[],
  settings: FeedSettings
): Promise<FeedItem[]> {
  // Check cache first
  if (feedCache && Date.now() - feedCache.timestamp < CACHE_TTL_MS) {
    console.log('Using cached feeds (age: ' + Math.round((Date.now() - feedCache.timestamp) / 60000) + ' minutes)');
    return feedCache.items;
  }

  console.log('Fetching fresh feeds...');
  const feedsToFetch = feeds.slice(0, settings.maxFeeds);
  const maxAgeDays = settings.maxAgeDays || 30;
  const defaultPostsPerFeed = settings.postsPerFeed || 2;

  const results = await Promise.allSettled(
    feedsToFetch.map((feed) => {
      // Use per-feed postsPerFeed if available, otherwise use default
      const postsPerFeed = feed.postsPerFeed || defaultPostsPerFeed;
      return fetchFeed(feed, postsPerFeed, maxAgeDays);
    })
  );

  const allItems: FeedItem[] = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  });

  // Sort by date, newest first
  allItems.sort((a, b) => b.timestamp - a.timestamp);

  // Update cache
  feedCache = { items: allItems, timestamp: Date.now() };
  console.log(`Cached ${allItems.length} feed items`);

  return allItems;
}
