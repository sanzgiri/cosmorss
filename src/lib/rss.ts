import Parser from 'rss-parser';
import { readFile } from 'fs/promises';
import path from 'path';

const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const USER_AGENT = 'CosmoRSS/0.1 (+https://github.com/sanzgiri/cosmorss)';
const ACCEPT_HEADER =
  'application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';
const BLOCKED_FEEDS_PATH = path.join(process.cwd(), 'config', 'blocked_feeds.txt');
const BLOCKED_DOMAINS_PATH = path.join(process.cwd(), 'config', 'blocked_domains.txt');

// Per-feed cache (etag/last-modified + parsed items) — module-level so each
// serverless instance accumulates cache hits over its lifetime. We keep ALL
// recently-parsed items, then apply per-call postsPerFeed/maxAgeDays slicing,
// so a 304 Not Modified still yields the correct trimmed result.
const FEED_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14d
const FEED_CACHE_MAX_ENTRIES = 2000;

interface CachedFeedEntry {
  etag?: string;
  lastModified?: string;
  /** Parsed items from the LAST 200 OK response (not yet trimmed). */
  items: ParsedFeedItem[];
  /** Title resolved from the feed XML (for FeedItem.source). */
  feedTitle?: string;
  /** Link resolved from the feed XML (for FeedItem.sourceUrl). */
  feedLink?: string;
  fetchedAt: number;
}

interface ParsedFeedItem {
  title: string;
  link: string;
  timestamp: number;
}

const feedCache = new Map<string, CachedFeedEntry>();

// Lightweight counters for observability across a single fetchAllFeeds run.
let metric304 = 0;
let metric200 = 0;
let metricCacheBytes = 0;

function bumpCacheEntry(url: string, entry: CachedFeedEntry) {
  feedCache.set(url, entry);
  // Crude LRU-ish trim: when we exceed the cap, drop the oldest entries by
  // fetchedAt. Cheap because it only runs when the cache actually grows.
  if (feedCache.size > FEED_CACHE_MAX_ENTRIES) {
    const sorted = Array.from(feedCache.entries()).sort(
      (a, b) => a[1].fetchedAt - b[1].fetchedAt
    );
    const toDrop = sorted.slice(0, sorted.length - FEED_CACHE_MAX_ENTRIES);
    for (const [k] of toDrop) feedCache.delete(k);
  }
}

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
  /** Hint to clients for how often to refetch /api/feeds. Default 60. */
  refreshIntervalMinutes?: number;
  maxAgeDays: number;
}

const DEFAULT_POSTS_PER_FEED = 2;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
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

// Memoize blocklist loads for the lifetime of the process. Files are read
// from disk once per Lambda instance instead of on every request.
let blocklistsPromise: Promise<{ feeds: Set<string>; domains: Set<string> }> | null = null;
function getBlocklists() {
  if (!blocklistsPromise) {
    blocklistsPromise = Promise.all([
      loadBlocklist(BLOCKED_FEEDS_PATH),
      loadBlocklist(BLOCKED_DOMAINS_PATH),
    ]).then(([feeds, domains]) => ({ feeds, domains }));
  }
  return blocklistsPromise;
}

// Exported for unit testing.
export function isBlockedFeed(
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

const RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

// Exported for unit testing.
export function isRetryableError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message ?? '').toLowerCase();
  const code = (error as { code?: string } | undefined)?.code;

  if (code && RETRYABLE_CODES.has(code)) return true;

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up') ||
    message.includes('aborted') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    /\b5\d\d\b/.test(message) // 5xx in message
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

// Exported for unit testing.
export function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isValidDate(date) ? date : null;
}

/**
 * Conditional GET against an RSS/Atom feed. Returns either:
 *  - 'not-modified' if the server replied 304 (cached entry is still good), or
 *  - a parsed body + new etag/last-modified headers.
 */
async function conditionalFetchFeed(
  url: string,
  cached?: CachedFeedEntry
): Promise<
  | { status: 'not-modified' }
  | { status: 'ok'; body: string; etag?: string; lastModified?: string }
> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: ACCEPT_HEADER,
    'Accept-Encoding': 'gzip, deflate, br',
  };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.status === 304) {
      return { status: 'not-modified' };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.text();
    return {
      status: 'ok',
      body,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function parseFeedBody(body: string): Promise<{
  items: ParsedFeedItem[];
  feedTitle?: string;
  feedLink?: string;
}> {
  const feed = await parser.parseString(body);
  const items: ParsedFeedItem[] = [];
  for (const item of feed.items) {
    const date = parseDate(item.pubDate) || parseDate(item.isoDate);
    if (!date) continue;
    // Skip items with no canonical link — they can't be clicked or deduped
    // reliably (e.g. meyerweb "Excuse of the Day" feed).
    const link = (item.link ?? '').trim();
    if (!link || link === '#') continue;
    items.push({
      title: item.title || 'Untitled',
      link,
      timestamp: date.getTime(),
    });
  }
  // Newest first so trimming `postsPerFeed` later picks the most recent.
  items.sort((a, b) => b.timestamp - a.timestamp);
  return {
    items,
    feedTitle: feed.title,
    feedLink: feed.link,
  };
}

function trimToOutput(
  parsed: ParsedFeedItem[],
  feedTitle: string | undefined,
  feedLink: string | undefined,
  feedConfig: FeedConfig,
  postsPerFeed: number,
  maxAgeDays: number
): FeedItem[] {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const out: FeedItem[] = [];
  const source = feedTitle || new URL(feedConfig.url).hostname;
  const sourceUrl = feedLink || feedConfig.url;

  for (const item of parsed) {
    if (out.length >= postsPerFeed) break;
    if (now - item.timestamp > maxAgeMs) continue;
    out.push({
      title: item.title,
      link: item.link,
      pubDate: new Date(item.timestamp).toISOString(),
      timestamp: item.timestamp,
      source,
      sourceUrl,
      category: feedConfig.category,
      feedScore: feedConfig.score ?? 0,
    });
  }
  return out;
}

export async function fetchFeed(
  feedConfig: FeedConfig,
  postsPerFeed: number,
  maxAgeDays: number
): Promise<FeedItem[]> {
  const url = feedConfig.url;

  // Drop entries we haven't seen in a long time so the cache stays small.
  const existing = feedCache.get(url);
  if (existing && Date.now() - existing.fetchedAt > FEED_CACHE_MAX_AGE_MS) {
    feedCache.delete(url);
  }
  const cached = feedCache.get(url);

  try {
    const result = await fetchWithRetry(() => conditionalFetchFeed(url, cached));

    if (result.status === 'not-modified' && cached) {
      metric304++;
      // Update the freshness timestamp but keep the same body.
      bumpCacheEntry(url, { ...cached, fetchedAt: Date.now() });
      return trimToOutput(
        cached.items,
        cached.feedTitle,
        cached.feedLink,
        feedConfig,
        postsPerFeed,
        maxAgeDays
      );
    }

    // status === 'ok' (or 'not-modified' without a cached entry — rare; treat as miss)
    if (result.status === 'not-modified') {
      // Server claims unchanged but we have nothing cached. Re-request without
      // conditional headers to actually get the body.
      const fallback = await fetchWithRetry(() => conditionalFetchFeed(url, undefined));
      if (fallback.status !== 'ok') return [];
      return ingestAndTrim(fallback, url, feedConfig, postsPerFeed, maxAgeDays);
    }

    metric200++;
    metricCacheBytes += result.body.length;
    return ingestAndTrim(result, url, feedConfig, postsPerFeed, maxAgeDays);
  } catch (error) {
    console.error(`Failed to fetch feed ${url}:`, (error as Error).message);
    return [];
  }
}

async function ingestAndTrim(
  result: { status: 'ok'; body: string; etag?: string; lastModified?: string },
  url: string,
  feedConfig: FeedConfig,
  postsPerFeed: number,
  maxAgeDays: number
): Promise<FeedItem[]> {
  const parsed = await parseFeedBody(result.body);
  bumpCacheEntry(url, {
    etag: result.etag,
    lastModified: result.lastModified,
    items: parsed.items,
    feedTitle: parsed.feedTitle,
    feedLink: parsed.feedLink,
    fetchedAt: Date.now(),
  });
  return trimToOutput(
    parsed.items,
    parsed.feedTitle,
    parsed.feedLink,
    feedConfig,
    postsPerFeed,
    maxAgeDays
  );
}

export async function fetchAllFeeds(
  feeds: FeedConfig[],
  settings: FeedSettings
): Promise<FeedItem[]> {
  const startMs = Date.now();
  metric304 = 0;
  metric200 = 0;
  metricCacheBytes = 0;

  const { feeds: blockedFeeds, domains: blockedDomains } = await getBlocklists();

  const filteredFeeds = feeds.filter(
    (feed) => !isBlockedFeed(feed.url, blockedFeeds, blockedDomains)
  );
  const skippedCount = feeds.length - filteredFeeds.length;
  if (skippedCount > 0) {
    console.log(`[rss] skipped ${skippedCount} blocked feeds/domains`);
  }

  const feedsToFetch = filteredFeeds.slice(0, settings.maxFeeds);
  const maxAgeDays = settings.maxAgeDays || 30;

  const results = await mapWithConcurrency(
    feedsToFetch,
    FETCH_CONCURRENCY,
    (feed) => {
      const postsPerFeed = feed.postsPerFeed || DEFAULT_POSTS_PER_FEED;
      return fetchFeed(feed, postsPerFeed, maxAgeDays);
    }
  );

  let succeeded = 0;
  let failed = 0;
  const allItems: FeedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      succeeded++;
      allItems.push(...result.value);
    } else {
      failed++;
    }
  }

  allItems.sort((a, b) => b.timestamp - a.timestamp);

  const elapsedMs = Date.now() - startMs;
  const kb = (metricCacheBytes / 1024).toFixed(0);
  console.log(
    `[rss] ${allItems.length} items from ${succeeded}/${feedsToFetch.length} feeds ` +
      `(${failed} failed) in ${(elapsedMs / 1000).toFixed(1)}s ` +
      `[200=${metric200} 304=${metric304} body=${kb}KB]`
  );

  return allItems;
}
