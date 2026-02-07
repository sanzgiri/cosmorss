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

type SortOption = 'recent' | 'popular';

const categoryColors: Record<string, string> = {
  // New content-based categories
  'Web Development': 'bg-blue-500/20 text-blue-400',
  'Backend/Infrastructure': 'bg-sky-500/20 text-sky-400',
  'Security': 'bg-red-500/20 text-red-400',
  'AI/ML': 'bg-purple-500/20 text-purple-400',
  'Systems/Low-Level': 'bg-slate-500/20 text-slate-400',
  'Startups/Business': 'bg-amber-500/20 text-amber-400',
  'Career/Personal': 'bg-lime-500/20 text-lime-400',
  'Science': 'bg-green-500/20 text-green-400',
  'Design': 'bg-indigo-500/20 text-indigo-400',
  'Gaming': 'bg-rose-500/20 text-rose-400',
  'Open Source': 'bg-cyan-500/20 text-cyan-400',
  'General': 'bg-gray-500/20 text-gray-400',
  // Legacy categories (for backward compatibility)
  'Blog': 'bg-gray-500/20 text-gray-400',
  'Tech': 'bg-blue-500/20 text-blue-400',
  'AI': 'bg-purple-500/20 text-purple-400',
  'Photography': 'bg-amber-500/20 text-amber-400',
  'Music': 'bg-pink-500/20 text-pink-400',
  'Writing': 'bg-cyan-500/20 text-cyan-400',
  'Food': 'bg-orange-500/20 text-orange-400',
  'Travel': 'bg-teal-500/20 text-teal-400',
  'Finance': 'bg-emerald-500/20 text-emerald-400',
};

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
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortOption>('recent');

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

  const categories = data
    ? ['all', ...Array.from(new Set(data.items.map((item) => item.category))).sort()]
    : ['all'];

  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];

    let items = data.items.filter(
      (item) => filter === 'all' || item.category === filter
    );

    if (sort === 'popular') {
      // Sort by HN score (items with HN data first, then by score)
      items = [...items].sort((a, b) => {
        const scoreA = a.hn?.score ?? -1;
        const scoreB = b.hn?.score ?? -1;
        return scoreB - scoreA;
      });
    }
    // 'recent' is already sorted by API

    return items;
  }, [data?.items, filter, sort]);

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
        {/* Filters and Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  filter === category
                    ? 'bg-white text-black'
                    : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
                }`}
              >
                {category === 'all' ? 'All' : category}
              </button>
            ))}
          </div>

          {/* Sort Options */}
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted)] text-sm">Sort:</span>
            <button
              onClick={() => setSort('recent')}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                sort === 'recent'
                  ? 'bg-white text-black'
                  : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSort('popular')}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                sort === 'popular'
                  ? 'bg-orange-500 text-white'
                  : 'bg-[var(--card)] text-[var(--muted)] hover:text-white'
              }`}
            >
              HN Popular
            </button>
          </div>
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
        {!loading && !error && filteredAndSortedItems && (
          <div className="space-y-1">
            {filteredAndSortedItems.map((item, index) => (
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
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          categoryColors[item.category] ||
                          'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {item.category}
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
        {!loading && !error && filteredAndSortedItems?.length === 0 && (
          <div className="text-center py-20 text-[var(--muted)]">
            No posts found for this category.
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
