'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

interface HNData {
  score: number;
  comments: number;
  hnUrl: string;
}

interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
  category: string;
  feedScore: number;
  hn: HNData | null;
}

interface FeedResponse {
  items: FeedItem[];
  lastUpdated: string;
  settings: {
    maxFeeds: number;
    refreshIntervalMinutes?: number;
    maxAgeDays?: number;
  };
  stats?: {
    totalFeeds: number;
    totalItems: number;
    hnMatched: number;
    buildMs: number;
  };
}

type ViewOption = 'all' | 'top' | 'new' | 'hn';
const NEW_WINDOW_HOURS = 72;
const ALL_CATEGORIES = '__all__';
const DEFAULT_REFRESH_MINUTES = 60;

const VIEW_OPTIONS: { id: ViewOption; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'top', label: 'Top' },
  { id: 'new', label: 'New' },
  { id: 'hn', label: 'HN' },
];

function formatTimeAgo(timestamp: number, now: number): string {
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Home() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewOption>('all');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const fetchFeeds = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    try {
      const response = await fetch('/api/feeds');
      if (!response.ok) throw new Error('Failed to fetch feeds');
      const result: FeedResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      if (opts.silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
    // Use the server-supplied refresh interval if provided (from feeds.json
    // settings.refreshIntervalMinutes); otherwise fall back to 60 min.
    const minutes =
      data?.settings?.refreshIntervalMinutes ?? DEFAULT_REFRESH_MINUTES;
    const intervalMs = Math.max(5, minutes) * 60 * 1000;
    const interval = setInterval(() => fetchFeeds({ silent: true }), intervalMs);
    return () => clearInterval(interval);
  }, [fetchFeeds, data?.settings?.refreshIntervalMinutes]);

  // Categories present in the current dataset, ordered by item count.
  const categoryOptions = useMemo(() => {
    if (!data?.items.length) return [] as { id: string; count: number }[];
    const counts = new Map<string, number>();
    for (const item of data.items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }));
  }, [data?.items]);

  // Reset the category filter if the dataset no longer contains it.
  useEffect(() => {
    if (category === ALL_CATEGORIES) return;
    if (!categoryOptions.some((c) => c.id === category)) {
      setCategory(ALL_CATEGORIES);
    }
  }, [category, categoryOptions]);

  const filteredItems = useMemo<FeedItem[]>(() => {
    if (!data?.items) return [];
    const now = Date.now();

    // 1) Filter by category first (cheap)
    const base =
      category === ALL_CATEGORIES
        ? data.items
        : data.items.filter((item) => item.category === category);

    // 2) Then apply the view transform
    switch (view) {
      case 'hn':
        return base
          .filter((item) => item.hn !== null)
          .slice()
          .sort((a, b) => (b.hn?.score ?? 0) - (a.hn?.score ?? 0));
      case 'top':
        return base.slice().sort((a, b) => {
          const scoreDiff = (b.feedScore ?? 0) - (a.feedScore ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          return b.timestamp - a.timestamp;
        });
      case 'new': {
        const cutoffMs = NEW_WINDOW_HOURS * 60 * 60 * 1000;
        return base.filter((item) => now - item.timestamp <= cutoffMs);
      }
      case 'all':
      default:
        return base.slice();
    }
  }, [data?.items, view, category]);

  const hnCount = data?.items.filter((item) => item.hn !== null).length ?? 0;
  // Single "now" reference per render so every row formats against the same instant.
  const renderNow = Date.now();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-black focus:px-3 focus:py-1 focus:rounded"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">COSMORSS</h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              The small web, all in one place
            </p>
          </div>
          {refreshing && (
            <span
              className="text-xs text-[var(--muted)] animate-pulse"
              aria-live="polite"
            >
              Refreshing…
            </span>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {/* Views */}
        <div
          className="flex flex-wrap gap-2 mb-4"
          role="tablist"
          aria-label="View"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = view === option.id;
            return (
              <button
                key={option.id}
                role="tab"
                aria-selected={active}
                onClick={() => setView(option.id)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  active
                    ? 'bg-white text-black'
                    : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        {categoryOptions.length > 0 && (
          <div
            className="flex flex-wrap gap-2 mb-8"
            role="tablist"
            aria-label="Category"
          >
            <button
              role="tab"
              aria-selected={category === ALL_CATEGORIES}
              onClick={() => setCategory(ALL_CATEGORIES)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                category === ALL_CATEGORIES
                  ? 'bg-[var(--foreground)] text-black'
                  : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
              }`}
            >
              All categories
            </button>
            {categoryOptions.map(({ id, count }) => {
              const active = category === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(id)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                    active
                      ? 'bg-[var(--foreground)] text-black'
                      : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
                  }`}
                >
                  {id}{' '}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-1" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading feeds…</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="py-3 px-4 -mx-4 rounded-lg animate-pulse"
              >
                <div
                  className="h-4 bg-[var(--card)] rounded"
                  style={{ width: `${65 + ((i * 7) % 30)}%` }}
                />
                <div className="flex gap-2 mt-2">
                  <div className="h-3 w-24 bg-[var(--card)] rounded" />
                  <div className="h-3 w-16 bg-[var(--card)] rounded" />
                  <div className="h-3 w-20 bg-[var(--card)] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Feed Items */}
        {!loading && !error && (
          <div className="space-y-1">
            {filteredItems.map((item) => {
              // Mirror the dedup key: when the feed has no <link>, the post
              // was kept by its source+title fingerprint, so we must do the
              // same here to avoid duplicate React keys on items with link='#'.
              const reactKey =
                item.link && item.link !== '#'
                  ? item.link
                  : `${item.source}::${item.title}`;
              return (
              <div
                key={reactKey}
                className="py-3 px-4 -mx-4 rounded-lg hover:bg-[var(--card)] transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <h2 className="font-medium text-[var(--foreground)] group-hover:text-white">
                        {item.title}
                      </h2>
                    </a>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm">
                      <span className="text-[var(--muted)]">{item.source}</span>
                      <span className="text-[var(--border)]">•</span>
                      <span className="text-[var(--muted)]">
                        {formatTimeAgo(item.timestamp, renderNow)}
                      </span>
                      <button
                        onClick={() => setCategory(item.category)}
                        className="px-2 py-0.5 rounded text-xs bg-[var(--card)] text-[var(--muted)] hover:text-white transition-colors"
                        title={`Filter by ${item.category}`}
                      >
                        {item.category}
                      </button>
                      <span className="px-2 py-0.5 rounded text-xs bg-[var(--card)] text-[var(--muted)]">
                        Score {Math.round(item.feedScore ?? 0)}
                      </span>
                      {item.hn && (
                        <a
                          href={item.hn.hnUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg
                            className="w-3 h-3"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                          </svg>
                          {item.hn.score} pts
                          {item.hn.comments > 0 && (
                            <span className="text-orange-400/70">
                              · {item.hn.comments}
                            </span>
                          )}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="text-center py-20 text-[var(--muted)]">
            No posts found for this view.
          </div>
        )}

        {/* Stats & Last Updated */}
        {data && (
          <div className="mt-12 pt-8 border-t border-[var(--border)] text-center text-sm text-[var(--muted)]">
            <p>
              Showing {filteredItems.length} of {data.items.length} posts
              {' · '}
              {hnCount} featured on Hacker News
            </p>
            <p className="mt-1">
              Last updated: {new Date(data.lastUpdated).toLocaleString()}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
