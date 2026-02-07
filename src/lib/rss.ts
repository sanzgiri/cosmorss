import Parser from 'rss-parser';
import { readFile } from 'fs/promises';
import path from 'path';

// In-memory cache for feeds (works in dev mode too)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let feedCache: { items: FeedItem[]; timestamp: number } | null = null;
const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const BLOCKED_FEEDS_PATH = path.join(process.cwd(), 'config', 'blocked_feeds.txt');
const BLOCKED_DOMAINS_PATH = path.join(process.cwd(), 'config', 'blocked_domains.txt');

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
  category: string;
  feedScore: number;
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
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    'User-Agent': 'CosmoRSS/2.0',
  },
});

async function loadBlocklist(filePath: string): Promise<Set<string>> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => line.toLowerCase())
    );
  } catch {
    return new Set();
  }
}

function isBlockedFeed(
  url: string,
  blockedFeeds: Set<string>,
  blockedDomains: Set<string>
): boolean {
  const normalizedUrl = url.trim().toLowerCase();
  if (blockedFeeds.has(normalizedUrl)) return true;

  try {
    const host = new URL(url).hostname.toLowerCase();
    if (blockedDomains.has(host)) return true;
    for (const domain of blockedDomains) {
      if (host.endsWith(`.${domain}`)) return true;
    }
  } catch {
    // If URL parsing fails, don't block by domain.
  }

  return false;
}

function isRetryableError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message ?? '').toLowerCase();
  const code = (error as { code?: string } | undefined)?.code;

  if (code && ['ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true;
  }

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('429') ||
    message.includes('rate limit')
  );
}

async function fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = 500 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      try {
        const value = await worker(items[current]);
        results[current] = { status: 'fulfilled', value };
      } catch (error) {
        results[current] = { status: 'rejected', reason: error };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

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
    const feed = await fetchWithRetry(() => parser.parseURL(feedConfig.url));
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
        feedScore: feedConfig.score ?? 0,
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
  const [blockedFeeds, blockedDomains] = await Promise.all([
    loadBlocklist(BLOCKED_FEEDS_PATH),
    loadBlocklist(BLOCKED_DOMAINS_PATH),
  ]);

  const filteredFeeds = feeds.filter(
    (feed) => !isBlockedFeed(feed.url, blockedFeeds, blockedDomains)
  );
  const skippedCount = feeds.length - filteredFeeds.length;
  if (skippedCount > 0) {
    console.log(`Skipped ${skippedCount} blocked feeds/domains`);
  }

  const feedsToFetch = filteredFeeds.slice(0, settings.maxFeeds);
  const maxAgeDays = settings.maxAgeDays || 30;
  const defaultPostsPerFeed = settings.postsPerFeed || 2;

  const results = await mapWithConcurrency(
    feedsToFetch,
    FETCH_CONCURRENCY,
    (feed) => {
      const postsPerFeed = feed.postsPerFeed || defaultPostsPerFeed;
      return fetchFeed(feed, postsPerFeed, maxAgeDays);
    }
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
