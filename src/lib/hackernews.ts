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

export async function getHNPopularity(url: string): Promise<HNData | null> {
  // Check cache first
  if (hnCache.has(url)) {
    return hnCache.get(url) || null;
  }

  try {
    // Use Algolia HN Search API
    const searchUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(url)}&restrictSearchableAttributes=url&hitsPerPage=1`;

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'UniverssRSSReader/1.0' },
    });

    if (!response.ok) {
      hnCache.set(url, null);
      return null;
    }

    const data: HNSearchResult = await response.json();

    if (data.hits && data.hits.length > 0) {
      const hit = data.hits[0];
      // Verify URL matches (Algolia search can be fuzzy)
      if (hit.url && (hit.url === url || url.includes(hit.url) || hit.url.includes(url))) {
        const hnData: HNData = {
          score: hit.points || 0,
          comments: hit.num_comments || 0,
          hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        };
        hnCache.set(url, hnData);
        return hnData;
      }
    }

    hnCache.set(url, null);
    return null;
  } catch (error) {
    console.error(`Failed to fetch HN data for ${url}:`, error);
    hnCache.set(url, null);
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
