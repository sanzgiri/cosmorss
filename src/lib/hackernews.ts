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

interface HNData {
  score: number;
  comments: number;
  hnUrl: string;
}

// Cache HN lookups to avoid hammering the API
const hnCache = new Map<string, HNData | null>();

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_name',
  'utm_id',
  'utm',
  'ref',
  'source',
]);

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hostname = host;
    url.hash = '';

    const params = url.searchParams;
    for (const key of Array.from(params.keys())) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
        params.delete(key);
      }
    }
    url.search = params.toString() ? `?${params.toString()}` : '';

    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return null;
  }
}

export async function getHNPopularity(url: string): Promise<HNData | null> {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;

  // Check cache first
  if (hnCache.has(normalizedUrl)) {
    return hnCache.get(normalizedUrl) || null;
  }

  try {
    // Use Algolia HN Search API
    const searchUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(normalizedUrl)}&restrictSearchableAttributes=url&hitsPerPage=5`;

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'UniverssRSSReader/1.0' },
    });

    if (!response.ok) {
      hnCache.set(normalizedUrl, null);
      return null;
    }

    const data: HNSearchResult = await response.json();

    if (data.hits && data.hits.length > 0) {
      for (const hit of data.hits) {
        if (!hit.url) continue;
        const normalizedHit = normalizeUrl(hit.url);
        if (!normalizedHit) continue;
        if (normalizedHit !== normalizedUrl) continue;

        const hnData: HNData = {
          score: hit.points || 0,
          comments: hit.num_comments || 0,
          hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        };
        hnCache.set(normalizedUrl, hnData);
        return hnData;
      }
    }

    hnCache.set(normalizedUrl, null);
    return null;
  } catch (error) {
    console.error(`Failed to fetch HN data for ${url}:`, error);
    hnCache.set(normalizedUrl, null);
    return null;
  }
}

export async function enrichWithHNData<T extends { link: string }>(
  items: T[]
): Promise<(T & { hn: HNData | null })[]> {
  // Process in batches to avoid rate limiting
  const batchSize = 10;
  const results: (T & { hn: HNData | null })[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const enrichedBatch = await Promise.all(
      batch.map(async (item) => {
        const hn = await getHNPopularity(item.link);
        return { ...item, hn };
      })
    );
    results.push(...enrichedBatch);
  }

  return results;
}
