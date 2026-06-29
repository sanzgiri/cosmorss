import { buildFeedsPayload } from '@/lib/feeds-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://cosmorss.vercel.app';
const FEED_TITLE = 'CosmoRSS — The small web';
const FEED_DESCRIPTION =
  'Aggregated feed of indie blogs and personal sites, sorted by recency.';
const MAX_FEED_ITEMS = 100;

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const payload = await buildFeedsPayload();
  const items = payload.items.slice(0, MAX_FEED_ITEMS);

  const itemsXml = items
    .map((item) => {
      const title = escapeXml(item.title);
      const link = escapeXml(item.link);
      const source = escapeXml(item.source);
      const category = escapeXml(item.category);
      const pubDate = new Date(item.timestamp).toUTCString();
      const guid = escapeXml(item.link);
      const hnPart = item.hn
        ? `\n      <hn:points>${item.hn.score}</hn:points>\n      <hn:comments>${item.hn.comments}</hn:comments>\n      <hn:url>${escapeXml(item.hn.hnUrl)}</hn:url>`
        : '';
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${category}</category>
      <source url="${escapeXml(item.sourceUrl)}">${source}</source>${hnPart}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:hn="https://news.ycombinator.com/">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${new Date(payload.lastUpdated).toUTCString()}</lastBuildDate>
    <generator>CosmoRSS</generator>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
