# CosmoRSS

A feed reader for the small web - aggregating posts from indie blogs and personal sites with Hacker News popularity data.

Based on the [Kagi Small Web](https://github.com/kagisearch/smallweb) collection of 29,000+ feeds.

## Features

- **400 active feeds** curated from the Small Web (29,000+ available in `all_feeds.txt`)
- **Hacker News integration** - See which posts made it to HN with scores and comment counts
- **Category filtering** - Blog, Security, Photography, AI, Science, Music, Writing, Food, Gaming, Design, Travel, Finance
- **Sort options** - Recent or HN Popular
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
    "postsPerFeed": 2,
    "maxFeeds": 400,
    "refreshIntervalMinutes": 60,
    "maxAgeDays": 14
  },
  "feeds": [
    { "url": "https://example.com/feed.xml", "category": "Blog" }
  ]
}
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `postsPerFeed` | 2 | Posts per feed |
| `maxFeeds` | 400 | Max feeds to process |
| `maxAgeDays` | 14 | Filter old posts |

### Categories

Blog, Security, Photography, AI, Science, Music, Writing, Food, Gaming, Design, Travel, Finance

## Full Feed List

The complete Small Web list (29,000+ feeds) is in `all_feeds.txt`.

## License

MIT
