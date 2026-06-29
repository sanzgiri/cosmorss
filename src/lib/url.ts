/**
 * Shared URL normalization helpers.
 *
 * Used for:
 *  - Deduplicating items across feeds that publish the same post
 *  - Producing stable cache keys for the HN Algolia lookup
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_name',
  'utm_id',
  'utm',
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

export interface NormalizeOptions {
  /** Strip a leading "www." from the hostname. Default: true. */
  stripWww?: boolean;
  /** Lower-case the pathname (helpful for case-insensitive servers). Default: false. */
  lowercasePath?: boolean;
}

/**
 * Normalize a URL: lowercase host, strip fragment, drop tracking params,
 * remove trailing slashes. Returns null on parse failure.
 */
export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  const { stripWww = true, lowercasePath = false } = opts;
  try {
    const url = new URL(raw);

    let host = url.hostname.toLowerCase();
    if (stripWww) host = host.replace(/^www\./, '');
    url.hostname = host;

    url.hash = '';

    const params = url.searchParams;
    for (const key of Array.from(params.keys())) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        params.delete(key);
      }
    }
    url.search = params.toString() ? `?${params.toString()}` : '';

    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (lowercasePath) pathname = pathname.toLowerCase();
    url.pathname = pathname;

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Like normalizeUrl but falls back to the trimmed input when parsing fails.
 * Convenient for dedup where we'd rather group obvious dupes than drop them.
 */
export function normalizeUrlSafe(raw: string, opts?: NormalizeOptions): string {
  return normalizeUrl(raw, opts) ?? raw.trim();
}
