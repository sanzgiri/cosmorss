import { NextResponse } from 'next/server';
import { refreshFeedsPayload } from '@/lib/feeds-payload';

// Cron endpoint: hit by Vercel cron (see vercel.json) to warm the cache.
// In production we require CRON_SECRET to prevent abuse — Vercel cron jobs
// send "Authorization: Bearer $CRON_SECRET" automatically when the env var
// is set in the project. Locally, the check is skipped.
//
// Allow up to 5 minutes for a cold full refresh (Vercel Pro / Hobby cap
// will clamp this; on Hobby the practical ceiling is 60s).
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / unconfigured
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function refresh(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ?force=1 hard-invalidates the cache. Default behavior simply rebuilds
  // when the natural TTL has expired — which is what the scheduled cron
  // should use (see feeds-payload.ts).
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const startMs = Date.now();
  try {
    const payload = await refreshFeedsPayload({ force });
    return NextResponse.json({
      ok: true,
      force,
      durationMs: Date.now() - startMs,
      stats: payload.stats,
      lastUpdated: payload.lastUpdated,
    });
  } catch (error) {
    console.error('[cron] refresh failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: (error as Error)?.message ?? 'refresh failed',
        durationMs: Date.now() - startMs,
      },
      { status: 500 }
    );
  }
}

// Vercel cron triggers a GET. Allow POST too for manual curl-style invocation.
export const GET = refresh;
export const POST = refresh;
