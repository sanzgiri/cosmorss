import { unstable_cache } from 'next/cache';
import { normalizeUrl } from './url';

interface HNSearchResult {
  hits: Array<{
    objectID: string;
    title: string;
    url: string;
    points: number;
    num_comments: number;
    created_at: string;
  }>;
}

export interface HNData {
  score: number;
  comments: number;
  hnUrl: string;
}

const USER_AGENT = 'CosmoRSS/0.1 (+https://github.com/sanzgiri/cosmorss)';
const HN_TTL_SECONDS = 24 * 60 * 60; // 24h
const HN_TAG = 'hn-lookup';
const HN_REQUEST_TIMEOUT_MS = 8000;
const ENRICH_CONCURRENCY = 8;

/**
 * Two URLs are considered equivalent for HN-match purposes if their
 * normalized hostname + pathname match. (Query strings vary wildly.)
 */
function urlMatchKey(normalized: string): string | null {
  try {
    const u = new URL(normalized);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Raw network call to Algolia HN search. No caching here — the caller
 * wraps this in unstable_cache so results persist across requests/instances.
 */
async function fetchHNRaw(normalizedUrl: string): Promise<HNData | null | 'retry'> {
  const matchKey = urlMatchKey(normalizedUrl);
  if (!matchKey) return null;

  const searchUrl =
    'https://hn.algolia.com/api/v1/search' +
    `?query=${encodeURIComponent(normalizedUrl)}` +
    '&restrictSearchableAttributes=url' +
    '&hitsPerPage=10';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (response.status === 429 || response.status >= 500) {
      // Transient: don't cache as "miss".
      return 'retry';
    }
    if (!response.ok) return null;

    const data = (await response.json()) as HNSearchResult;
    if (!data.hits?.length) return null;

    // Best match: same hostname+pathname after normalization, highest points.
    let best: HNSearchResult['hits'][number] | null = null;
    for (const hit of data.hits) {
      if (!hit.url) continue;
      const hitNorm = normalizeUrl(hit.url);
      if (!hitNorm) continue;
      const hitKey = urlMatchKey(hitNorm);
      if (hitKey !== matchKey) continue;
      if (!best || (hit.points ?? 0) > (best.points ?? 0)) {
        best = hit;
      }
    }
    if (!best) return null;

    return {
      score: best.points ?? 0,
      comments: best.num_comments ?? 0,
      hnUrl: `https://news.ycombinator.com/item?id=${best.objectID}`,
    };
  } catch (error) {
    // Network / abort / parse error — treat as retryable miss (don't cache).
    if ((error as Error)?.name === 'AbortError') return 'retry';
    console.error(`HN lookup failed for ${normalizedUrl}:`, error);
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cache-aware HN lookup.
 *
 * Two-layer design:
 *  1. `cachedHNHit` returns only the "definitive" result (hit or confirmed
 *     miss). It's wrapped in unstable_cache once at module load so the
 *     wrapper itself is reused (creating a new wrapper per call defeats
 *     the cache entirely).
 *  2. If the raw fetch returns 'retry' (transient: 429, 5xx, timeout, abort)
 *     we throw, which unstable_cache does NOT persist. The caller catches
 *     and returns null without polluting the cache.
 */
async function definitiveHNLookup(
  normalizedUrl: string
): Promise<HNData | null> {
  const result = await fetchHNRaw(normalizedUrl);
  if (result === 'retry') {
    // Throwing prevents unstable_cache from memoizing this transient failure.
    throw new Error('hn-transient');
  }
  return result;
}

const cachedHNLookup = unstable_cache(
  definitiveHNLookup,
  ['hn-lookup-v2'],
  { revalidate: HN_TTL_SECONDS, tags: [HN_TAG] }
);

async function lookupHN(normalizedUrl: string): Promise<HNData | null> {
  try {
    return await cachedHNLookup(normalizedUrl);
  } catch {
    return null;
  }
}

export async function getHNPopularity(url: string): Promise<HNData | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  return lookupHN(normalized);
}

/**
 * Enrich a batch of items with HN data. Uses bounded concurrency rather than
 * sequential batches so slow lookups don't block the whole batch.
 */
export async function enrichWithHNData<T extends { link: string }>(
  items: T[]
): Promise<(T & { hn: HNData | null })[]> {
  const results: (T & { hn: HNData | null })[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(ENRICH_CONCURRENCY, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) break;
        const item = items[i];
        const hn = await getHNPopularity(item.link).catch(() => null);
        results[i] = { ...item, hn };
      }
    }
  );

  await Promise.all(workers);
  return results;
}
