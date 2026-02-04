# TODO

## High Priority

- [ ] **Search** - Full-text search across post titles
- [ ] **Bookmarks/Favorites** - Save posts to read later (localStorage)
- [ ] **Read/Unread tracking** - Mark posts you've already clicked

## Medium Priority

- [ ] **OPML import/export** - Let users import their own feed lists
- [ ] **Dark/Light theme toggle** - Currently dark-only
- [ ] **Keyboard shortcuts** - j/k navigation, o to open, s to save
- [ ] **PWA support** - Install as app, offline reading

## Low Priority

- [ ] **Email digest** - Daily/weekly summary of top posts (requires backend/cron)
- [ ] **RSS output** - Generate a combined feed of all sources at /api/feed.xml
- [ ] **Social sharing** - Quick share buttons for Twitter/LinkedIn/Mastodon

## Infrastructure

- [ ] **Database** - Persist HN scores over time to track trending
- [ ] **Caching layer** - Redis/Upstash for faster feed fetches
- [ ] **Error monitoring** - Sentry integration
- [ ] **Analytics** - Track which posts get clicked

## Feed Improvements

- [ ] **Auto-discover feeds** - Given a blog URL, find the RSS feed
- [ ] **Feed health monitoring** - Track which feeds are failing
- [ ] **Duplicate detection** - Some posts appear on multiple feeds
- [ ] **Content snippets** - Show first paragraph/summary when available

## UI Enhancements

- [ ] **Infinite scroll** - Load more posts as you scroll
- [ ] **Grid view** - Alternative card-based layout
- [ ] **Source grouping** - Group posts by source instead of chronological
- [ ] **Time-based filtering** - Today, This Week, This Month
