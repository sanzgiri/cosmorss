#!/usr/bin/env python3
import csv
import json
import math
import os
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / 'scored_feeds.json'
OUT_DIR = ROOT / 'tmp'

BLOCKED_FEEDS_FILE = ROOT / 'config' / 'blocked_feeds.txt'
BLOCKED_DOMAINS_FILE = ROOT / 'config' / 'blocked_domains.txt'

AGGREGATOR_DOMAIN_HINTS = [
    'news.ycombinator.com',
    'lobste.rs',
    'reddit.com',
    'hnrss',
    'newsblur',
    'feedly',
    'inoreader',
    'feedburner.com',
    'rsshub',
]

AGGREGATOR_URL_HINTS = [
    'hnrss',
    'rsshub',
    'feedburner',
]

CORPORATE_DOMAIN_HINTS = [
    'github.blog',
    'blog.cloudflare.com',
    'cloudflare.com',
    'aws.amazon.com',
    'devblogs.microsoft.com',
    'microsoft.com',
    'googleblog.com',
    'engineering.fb.com',
    'engineering.atspotify.com',
    'netflixtechblog.com',
    'slack.engineering',
    'dropbox.tech',
    'stripe.com/blog',
    'shopify.engineering',
    'engineering.shopify.com',
    'openai.com',
    'deepmind.com',
]

CORPORATE_TITLE_HINTS = [
    'engineering',
    'dev blog',
    'developer blog',
    'tech blog',
]


def load_blocklist(path: Path) -> set:
    if not path.exists():
        return set()
    return {
        line.strip().lower()
        for line in path.read_text().splitlines()
        if line.strip() and not line.strip().startswith('#')
    }


def get_signal(feed: Dict[str, Any], key: str) -> Dict[str, Any]:
    return (feed.get('signals') or {}).get(key) or {}


def is_aggregator(feed: Dict[str, Any]) -> bool:
    domain = (feed.get('domain') or '').lower()
    url = (feed.get('url') or '').lower()
    title = (feed.get('title') or '').lower()

    if any(hint in domain for hint in AGGREGATOR_DOMAIN_HINTS):
        return True
    if any(hint in url for hint in AGGREGATOR_URL_HINTS):
        return True

    # Lightweight title-based hinting (conservative)
    if 'newsletter' in title or 'digest' in title or 'roundup' in title:
        return True

    return False


def is_corporate(feed: Dict[str, Any]) -> bool:
    domain = (feed.get('domain') or '').lower()
    url = (feed.get('url') or '').lower()
    title = (feed.get('title') or '').lower()

    if any(hint in domain for hint in CORPORATE_DOMAIN_HINTS):
        return True
    if any(hint in url for hint in CORPORATE_DOMAIN_HINTS):
        return True
    if any(hint in title for hint in CORPORATE_TITLE_HINTS):
        return True

    if 'engineering.' in domain or domain.startswith('engineering.'):
        return True

    return False


def fast_score(feed: Dict[str, Any]) -> float:
    hn = get_signal(feed, 'hn').get('normalized') or 0
    activity = get_signal(feed, 'activity').get('normalized') or 0
    content = get_signal(feed, 'content').get('normalized') or 0
    consistency = get_signal(feed, 'consistency').get('normalized') or 0
    recency = get_signal(feed, 'recency').get('multiplier') or 1.0

    base = (0.6 * hn) + (0.2 * activity) + (0.1 * content) + (0.1 * consistency)
    score = base * recency
    return max(0.0, min(100.0, score))


def main() -> None:
    if not INPUT.exists():
        raise SystemExit(f"Missing {INPUT}. Run scoring first.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    blocked_feeds = load_blocklist(BLOCKED_FEEDS_FILE)
    blocked_domains = load_blocklist(BLOCKED_DOMAINS_FILE)

    data = json.loads(INPUT.read_text())
    feeds = data.get('feeds', [])

    filtered = []
    filtered_with_corporate = []
    excluded = []

    # Gate parameters (tuned to yield ~350 candidates with current data)
    hn_strict = 57
    hn_relaxed = 50
    min_stories = 8
    min_avg_points = 100

    for feed in feeds:
        url = (feed.get('url') or '').lower()
        domain = (feed.get('domain') or '').lower()

        hn_raw = get_signal(feed, 'hn').get('raw') or {}
        hn_norm = get_signal(feed, 'hn').get('normalized') or 0
        stories = hn_raw.get('stories') or 0
        avg_points = hn_raw.get('avgPoints') or 0

        passes_gate = (hn_norm >= hn_strict) or (
            hn_norm >= hn_relaxed and stories >= min_stories and avg_points >= min_avg_points
        )
        spike = avg_points >= 250 and stories <= 4

        aggregator = is_aggregator(feed)
        corporate = is_corporate(feed)
        blocked = url in blocked_feeds or domain in blocked_domains or any(domain.endswith(f'.{d}') for d in blocked_domains)

        score = fast_score(feed)

        enriched = dict(feed)
        enriched['scoreOriginal'] = feed.get('score')
        enriched['score'] = round(score, 2)
        enriched['fastScore'] = round(score, 2)
        enriched['flags'] = {
            'blocked': blocked,
            'aggregator': aggregator,
            'corporate': corporate,
            'spike': spike,
            'hnGate': passes_gate,
        }

        if blocked:
            excluded.append((enriched, 'blocked'))
            continue
        if spike:
            excluded.append((enriched, 'hn_spike'))
            continue
        if not passes_gate:
            excluded.append((enriched, 'hn_gate'))
            continue
        if aggregator:
            excluded.append((enriched, 'aggregator'))
            continue

        filtered_with_corporate.append(enriched)
        if not corporate:
            filtered.append(enriched)
        else:
            excluded.append((enriched, 'corporate'))

    def write_json(path: Path, items):
        payload = {
            'generatedAt': data.get('generatedAt'),
            'totalFeeds': len(items),
            'feeds': items,
        }
        path.write_text(json.dumps(payload, indent=2))

    def write_csv(path: Path, items, reason_map=None):
        fields = [
            'url', 'domain', 'title', 'score', 'hn_norm', 'hn_stories', 'hn_avg_points',
            'activity', 'content', 'consistency', 'recency', 'is_aggregator', 'is_corporate', 'reason'
        ]
        with path.open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for item in items:
                feed = item[0] if reason_map else item
                reason = item[1] if reason_map else ''
                hn = get_signal(feed, 'hn')
                activity = get_signal(feed, 'activity')
                content = get_signal(feed, 'content')
                consistency = get_signal(feed, 'consistency')
                recency = get_signal(feed, 'recency')
                row = {
                    'url': feed.get('url'),
                    'domain': feed.get('domain'),
                    'title': feed.get('title'),
                    'score': feed.get('score'),
                    'hn_norm': hn.get('normalized') or 0,
                    'hn_stories': (hn.get('raw') or {}).get('stories') or 0,
                    'hn_avg_points': (hn.get('raw') or {}).get('avgPoints') or 0,
                    'activity': activity.get('normalized') or 0,
                    'content': content.get('normalized') or 0,
                    'consistency': consistency.get('normalized') or 0,
                    'recency': recency.get('multiplier') or 1.0,
                    'is_aggregator': feed.get('flags', {}).get('aggregator'),
                    'is_corporate': feed.get('flags', {}).get('corporate'),
                    'reason': reason,
                }
                writer.writerow(row)

    write_json(OUT_DIR / 'fast_filtered.json', filtered)
    write_json(OUT_DIR / 'fast_filtered_with_corporate.json', filtered_with_corporate)
    write_json(OUT_DIR / 'fast_excluded.json', [item[0] for item in excluded])

    write_csv(OUT_DIR / 'fast_filtered.csv', filtered)
    write_csv(OUT_DIR / 'fast_filtered_with_corporate.csv', filtered_with_corporate)
    write_csv(OUT_DIR / 'fast_excluded.csv', excluded, reason_map=True)

    print(f"Filtered (no corporate): {len(filtered)}")
    print(f"Filtered (with corporate): {len(filtered_with_corporate)}")
    print(f"Excluded: {len(excluded)}")
    print(f"Output in {OUT_DIR}")


if __name__ == '__main__':
    main()
