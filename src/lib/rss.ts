import Parser from 'rss-parser';

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
}

export interface FeedSettings {
  postsPerFeed: number;
  maxFeeds: number;
  refreshIntervalMinutes: number;
  maxAgeDays: number;
}

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'UniverssRSSReader/1.0',
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
  const feedsToFetch = feeds.slice(0, settings.maxFeeds);
  const maxAgeDays = settings.maxAgeDays || 30;

  const results = await Promise.allSettled(
    feedsToFetch.map((feed) => fetchFeed(feed, settings.postsPerFeed, maxAgeDays))
  );

  const allItems: FeedItem[] = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  });

  // Sort by date, newest first
  allItems.sort((a, b) => b.timestamp - a.timestamp);

  return allItems;
}
