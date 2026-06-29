/**
 * Single source of truth for building (and caching) the feeds payload.
 *
 * - `/api/feeds` (user-facing): reads from cache via buildFeedsPayload().
 * - `/api/cron/refresh` (Vercel cron / manual): calls refreshFeedsPayload()
 *   which busts the cache tag and rebuilds eagerly, so the next user request
 *   is always a hot read.
 */

import { unstable_cache, revalidateTag } from 'next/cache';
import { fetchAllFeeds, type FeedItem } from './rss';
import { enrichWithHNData, type HNData } from './hackernews';
import { normalizeUrlSafe } from './url';
import feedsConfig from '@/config/feeds.json';

export const FEEDS_CACHE_TAG = 'feeds-payload';
// TTL is intentionally a little shorter than the cron interval so the cron
// always sees a stale cache and triggers a fresh rebuild. With cron every
// 2h (see vercel.json) and TTL = 110 min, that holds with a 10-minute margin.
export const FEEDS_CACHE_TTL_SECONDS = 110 * 60;

export type EnrichedItem = FeedItem & { hn: HNData | null };

export interface FeedsPayload {
  items: EnrichedItem[];
  lastUpdated: string;
  settings: typeof feedsConfig.settings;
  stats: {
    totalFeeds: number;
    totalItems: number;
    hnMatched: number;
    buildMs: number;
  };
}

// Exported for unit testing.
export function dedupeItems<
  T extends { link: string; title: string; source: string }
>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const link =
      item.link && item.link !== '#' ? normalizeUrlSafe(item.link) : '';
    const key = link || `${item.source}::${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

async function computeFeedsPayload(): Promise<FeedsPayload> {
  const startMs = Date.now();

  const rawItems = await fetchAllFeeds(
    feedsConfig.feeds,
    feedsConfig.settings
  );

  // Dedupe BEFORE HN enrichment — saves a lot of Algolia calls.
  const deduped = dedupeItems(rawItems);
  const enriched = await enrichWithHNData(deduped);

  const hnMatched = enriched.reduce((n, it) => n + (it.hn ? 1 : 0), 0);
  const buildMs = Date.now() - startMs;

  console.log(
    `[feeds] built payload: ${enriched.length} items, ${hnMatched} on HN, ${buildMs} ms`
  );

  return {
    items: enriched,
    lastUpdated: new Date().toISOString(),
    settings: feedsConfig.settings,
    stats: {
      totalFeeds: feedsConfig.feeds.length,
      totalItems: enriched.length,
      hnMatched,
      buildMs,
    },
  };
}

/**
 * Cached entry point used by the user-facing route. On a miss this WILL
 * trigger a full build (warm via the cron route to avoid that).
 */
export const buildFeedsPayload = unstable_cache(
  computeFeedsPayload,
  ['feeds-payload-v1'],
  { revalidate: FEEDS_CACHE_TTL_SECONDS, tags: [FEEDS_CACHE_TAG] }
);

/**
 * Force-rebuild and warm the cache. Used by the cron endpoint.
 *
 * We do NOT call `revalidateTag` here — doing so in the same request as the
 * rebuild causes the invalidation timestamp to shadow the just-written entry,
 * forcing the next user request to rebuild from cold. Instead we rely on
 * `FEEDS_CACHE_TTL_SECONDS` being shorter than the cron interval, so the cron's
 * `buildFeedsPayload()` call always lands on an expired entry and rebuilds.
 *
 * The optional `force` flag exposes the legacy behavior for manual use
 * (e.g. `/api/cron/refresh?force=1`) when you really do want to bust the
 * cache regardless. Note: doing so makes the FIRST subsequent user request
 * slow.
 */
export async function refreshFeedsPayload(
  opts: { force?: boolean } = {}
): Promise<FeedsPayload> {
  if (opts.force) {
    revalidateTag(FEEDS_CACHE_TAG, 'default');
    await new Promise((r) => setTimeout(r, 0));
  }
  return buildFeedsPayload();
}
