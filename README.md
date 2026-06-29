# CosmoRSS

A feed reader for the small web - aggregating posts from indie blogs and personal sites with Hacker News popularity data.

Based on the [Kagi Small Web](https://github.com/kagisearch/smallweb) collection of 29,000+ feeds.

## Features

- **~340 active feeds** curated from the Small Web (29,000+ available in `all_feeds.txt`)
- **Hacker News integration** - See which posts made it to HN with scores and comment counts
- **Conditional GETs** - Sends `If-None-Match` / `If-Modified-Since` to upstream blogs; on warm runs ~80% return `304 Not Modified` and we re-use cached items
- **Per-Lambda cache** plus Next.js `unstable_cache` so the user-facing `/api/feeds` is a hot read (<50ms)
- **Cron warming** - `/api/cron/refresh` rebuilds the cache every 2 hours so users rarely pay rebuild cost
- **Category filtering** - 11 categories assigned by content-based scoring
- **Sort options** - All / Top (by score) / New (last 72h) / HN (sorted by points)
- **Aggregate RSS feed** at `/feed.xml`
- **Dark minimalist UI**
- **Age filtering** - Only shows posts from the last 14 days

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

### Option 1: GitHub (Recommended)

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import and deploy

### Option 2: CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

## Configuration

Edit `src/config/feeds.json`:

```json
{
  "settings": {
    "maxFeeds": 343,
    "refreshIntervalMinutes": 60,
    "maxAgeDays": 14
  },
  "feeds": [
    { "url": "https://example.com/feed.xml", "category": "Web Development", "score": 80, "postsPerFeed": 4 }
  ]
}
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxFeeds` | 343 | Max feeds to process |
| `maxAgeDays` | 14 | Filter posts older than this |
| `refreshIntervalMinutes` | 60 | How often the client refetches `/api/feeds` |

`postsPerFeed` is set per-feed in the `feeds` array, based on the curated score tier:
- High score (>=75): 4 posts
- Medium (45-74): 2 posts
- Low (<45): 1 post

### Categories

Web Development, AI/ML, Open Source, Design, Systems/Low-Level, Science,
Startups/Business, Security, Backend/Infrastructure, Career/Personal, Gaming.

## Full Feed List

The complete Small Web list (29,000+ feeds) is in `all_feeds.txt`.

## Regenerating the curated feed list

`src/config/feeds.json` is checked in, but the intermediate score files are not
(they're large and reproducible). To rebuild them from `all_feeds.txt`:

```bash
# 1. Score every feed (HN/Lobsters/Reddit + activity/consistency/content signals)
node scripts/scoring/index.js               # writes scored_feeds.json (~13 MB)

# 2. Pick the top N with category quotas
node scripts/select-feeds.js scored_feeds.json 300   # writes src/config/feeds.json
```

The scoring step uses a disk cache under `scripts/.cache/` and supports
`--resume` to continue after interruption.

## License

MIT
