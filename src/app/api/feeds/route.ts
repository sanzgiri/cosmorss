import { NextResponse } from 'next/server';
import { buildFeedsPayload, refreshFeedsPayload } from '@/lib/feeds-payload';

// User-facing route: should always be a fast read from the cache populated
// by the cron job (/api/cron/refresh). On a true cold cache it falls back
// to building inline, which can be slow — but with the cron warming hourly
// that should be rare.
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const isRefresh = url.searchParams.get('refresh') === '1';

    const payload = isRefresh
      ? await refreshFeedsPayload({ force: true })
      : await buildFeedsPayload();

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control':
          'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error building feeds payload:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feeds' },
      { status: 500 }
    );
  }
}
