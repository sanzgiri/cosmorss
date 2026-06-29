import { describe, it, expect } from 'vitest';
import { dedupeItems } from './feeds-payload';

type T = { link: string; title: string; source: string };

describe('dedupeItems', () => {
  it('drops items with identical normalized URLs', () => {
    const items: T[] = [
      { link: 'https://example.com/post', title: 'A', source: 'src' },
      { link: 'https://EXAMPLE.com/post', title: 'A', source: 'src' },
      { link: 'https://example.com/post?utm_source=x', title: 'A', source: 'src' },
    ];
    const out = dedupeItems(items);
    expect(out.length).toBe(1);
    expect(out[0].link).toBe('https://example.com/post');
  });

  it('treats trailing-slash and www. as the same URL', () => {
    const items: T[] = [
      { link: 'https://example.com/post/', title: 'A', source: 'src' },
      { link: 'https://www.example.com/post', title: 'A', source: 'src2' },
    ];
    expect(dedupeItems(items).length).toBe(1);
  });

  it('preserves distinct posts under the same domain', () => {
    const items: T[] = [
      { link: 'https://example.com/a', title: 'A', source: 'src' },
      { link: 'https://example.com/b', title: 'B', source: 'src' },
      { link: 'https://example.com/c', title: 'C', source: 'src' },
    ];
    expect(dedupeItems(items).length).toBe(3);
  });

  it('keeps the first occurrence (stable dedup)', () => {
    const items: T[] = [
      { link: 'https://example.com/x', title: 'first', source: 'src' },
      { link: 'https://example.com/x', title: 'second', source: 'src' },
    ];
    const out = dedupeItems(items);
    expect(out.length).toBe(1);
    expect(out[0].title).toBe('first');
  });

  it('falls back to source::title key when link is missing', () => {
    const items: T[] = [
      { link: '#', title: 'hello', source: 'BlogX' },
      { link: '#', title: 'HELLO', source: 'blogx' },
      { link: '', title: 'hello', source: 'BlogX' },
    ];
    expect(dedupeItems(items).length).toBe(1);
  });

  it('handles an empty list', () => {
    expect(dedupeItems([])).toEqual([]);
  });
});
