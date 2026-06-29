import { describe, it, expect } from 'vitest';
import { isBlockedFeed, isRetryableError, parseDate } from './rss';

describe('isBlockedFeed', () => {
  it('matches an exact blocked URL (case-insensitive)', () => {
    const feeds = new Set(['https://example.com/feed.xml']);
    expect(isBlockedFeed('https://EXAMPLE.com/feed.xml', feeds, new Set())).toBe(
      true
    );
  });

  it('does not match a different path on a blocked-by-URL host', () => {
    const feeds = new Set(['https://example.com/feed.xml']);
    expect(isBlockedFeed('https://example.com/other', feeds, new Set())).toBe(
      false
    );
  });

  it('blocks by exact domain', () => {
    const domains = new Set(['spammy.example']);
    expect(
      isBlockedFeed('https://spammy.example/x', new Set(), domains)
    ).toBe(true);
  });

  it('blocks by subdomain via dot-suffix match', () => {
    const domains = new Set(['example.com']);
    expect(
      isBlockedFeed('https://blog.example.com/x', new Set(), domains)
    ).toBe(true);
    expect(
      isBlockedFeed('https://notexample.com/x', new Set(), domains)
    ).toBe(false);
  });

  it('returns false for unparseable URLs without domain match', () => {
    expect(isBlockedFeed('::bad::', new Set(), new Set(['x.com']))).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('flags known retryable Node error codes', () => {
    for (const code of [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
    ]) {
      expect(isRetryableError({ code })).toBe(true);
    }
  });

  it('flags timeout / rate-limit / 5xx error messages', () => {
    expect(isRetryableError(new Error('Connection timed out'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableError(new Error('HTTP 429'))).toBe(true);
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryableError(new Error('HTTP 503'))).toBe(true);
    expect(isRetryableError(new Error('aborted'))).toBe(true);
  });

  it('does not flag 4xx errors (except 429) or arbitrary errors', () => {
    expect(isRetryableError(new Error('HTTP 404'))).toBe(false);
    expect(isRetryableError(new Error('HTTP 403'))).toBe(false);
    expect(isRetryableError(new Error('parse error'))).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('parseDate', () => {
  it('parses RFC 2822 / ISO 8601 dates', () => {
    expect(parseDate('2024-01-15T10:00:00Z')?.toISOString()).toBe(
      '2024-01-15T10:00:00.000Z'
    );
    expect(parseDate('Mon, 15 Jan 2024 10:00:00 GMT')?.toISOString()).toBe(
      '2024-01-15T10:00:00.000Z'
    );
  });

  it('returns null for invalid input', () => {
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});
