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
    postsPerFeed: number;
    maxFeeds: number;
    refreshIntervalMinutes: number;
  };
}

type ViewOption = 'all' | 'top' | 'new' | 'hn';
const NEW_WINDOW_HOURS = 72;

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function Home() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewOption>('all');

  const fetchFeeds = useCallback(async () => {
    try {
      const response = await fetch('/api/feeds');
      if (!response.ok) throw new Error('Failed to fetch feeds');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();

    // Refresh every hour
    const interval = setInterval(fetchFeeds, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeeds]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];

    const now = Date.now();

    switch (view) {
      case 'hn': {
        return [...data.items]
          .filter((item) => item.hn !== null)
          .sort((a, b) => (b.hn?.score ?? 0) - (a.hn?.score ?? 0));
      }
      case 'top': {
        return [...data.items].sort((a, b) => {
          const scoreDiff = (b.feedScore ?? 0) - (a.feedScore ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          return b.timestamp - a.timestamp;
        });
      }
      case 'new': {
        const cutoffMs = NEW_WINDOW_HOURS * 60 * 60 * 1000;
        return data.items.filter((item) => now - item.timestamp <= cutoffMs);
      }
      default:
        return data.items;
    }
  }, [data?.items, view]);

  const hnCount = data?.items.filter((item) => item.hn !== null).length ?? 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight">COSMORSS</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            The small web, all in one place
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Views */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: 'all', label: 'All' },
            { id: 'top', label: 'Top' },
            { id: 'new', label: 'New' },
            { id: 'hn', label: 'HN' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setView(option.id as ViewOption)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                view === option.id
                  ? 'bg-white text-black'
                  : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-[var(--muted)]">
              Loading feeds...
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Feed Items */}
        {!loading && !error && filteredItems && (
          <div className="space-y-1">
            {filteredItems.map((item, index) => (
              <div
                key={`${item.link}-${index}`}
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
                        {formatTimeAgo(item.pubDate)}
                      </span>
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
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredItems?.length === 0 && (
          <div className="text-center py-20 text-[var(--muted)]">
            No posts found for this view.
          </div>
        )}

        {/* Stats & Last Updated */}
        {data && (
          <div className="mt-12 pt-8 border-t border-[var(--border)] text-center text-sm text-[var(--muted)]">
            <p>
              {data.items.length} posts · {hnCount} featured on Hacker News
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
