import { describe, it, expect } from 'vitest';
import { normalizeUrl, normalizeUrlSafe } from './url';

describe('normalizeUrl', () => {
  it('lowercases the hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.com/Path')).toBe(
      'https://example.com/Path'
    );
  });

  it('strips leading www. by default', () => {
    expect(normalizeUrl('https://www.example.com/x')).toBe(
      'https://example.com/x'
    );
  });

  it('keeps www. when stripWww=false', () => {
    expect(
      normalizeUrl('https://www.example.com/x', { stripWww: false })
    ).toBe('https://www.example.com/x');
  });

  it('removes URL fragments', () => {
    expect(normalizeUrl('https://example.com/a#section')).toBe(
      'https://example.com/a'
    );
  });

  it('strips utm_* tracking parameters', () => {
    expect(
      normalizeUrl(
        'https://example.com/a?utm_source=x&utm_medium=y&kept=1'
      )
    ).toBe('https://example.com/a?kept=1');
  });

  it('strips ref, source, fbclid, gclid, mc_cid, mc_eid', () => {
    const u =
      'https://example.com/a?ref=x&source=y&fbclid=z&gclid=q&mc_cid=p&mc_eid=r&keep=1';
    expect(normalizeUrl(u)).toBe('https://example.com/a?keep=1');
  });

  it('preserves non-tracking query parameters', () => {
    expect(normalizeUrl('https://example.com/a?id=42&page=2')).toBe(
      'https://example.com/a?id=42&page=2'
    );
  });

  it('drops trailing slashes (but keeps the root /)', () => {
    expect(normalizeUrl('https://example.com/a/b/')).toBe(
      'https://example.com/a/b'
    );
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('lowercases path when lowercasePath=true', () => {
    expect(
      normalizeUrl('https://example.com/A/B', { lowercasePath: true })
    ).toBe('https://example.com/a/b');
  });

  it('returns null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });

  it('handles URLs with no path', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });
});

describe('normalizeUrlSafe', () => {
  it('returns normalized URL on success', () => {
    expect(normalizeUrlSafe('https://WWW.example.com/x/')).toBe(
      'https://example.com/x'
    );
  });

  it('falls back to trimmed input on parse failure', () => {
    expect(normalizeUrlSafe('  garbage  ')).toBe('garbage');
  });
});
