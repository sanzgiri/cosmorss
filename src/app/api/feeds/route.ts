import { NextResponse } from 'next/server';
import { fetchAllFeeds } from '@/lib/rss';
import { enrichWithHNData } from '@/lib/hackernews';
import feedsConfig from '@/config/feeds.json';

// Cache the response for 1 hour (3600 seconds)
export const revalidate = 3600;

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

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.toLowerCase();
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
    return raw.trim();
  }
}

function dedupeItems<T extends { link: string; title: string; source: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const link = item.link && item.link !== '#' ? normalizeUrl(item.link) : '';
    const key = link || `${item.source}::${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export async function GET() {
  try {
    const items = await fetchAllFeeds(feedsConfig.feeds, feedsConfig.settings);

    // Enrich with Hacker News data
    const enrichedItems = await enrichWithHNData(items);
    const dedupedItems = dedupeItems(enrichedItems);

    return NextResponse.json({
      items: dedupedItems,
      lastUpdated: new Date().toISOString(),
      settings: feedsConfig.settings,
    });
  } catch (error) {
    console.error('Error fetching feeds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feeds' },
      { status: 500 }
    );
  }
}
