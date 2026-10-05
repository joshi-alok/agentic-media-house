import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import type { NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from '../src/lib/match-pieces';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
const base = LedgerEntry.parse(JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')));

/** A news entry and a ledger entry for one slug, shaped like Astro's collection entries. */
function pair(slug: string, publishedAt: string, change: Partial<LedgerEntry> = {}) {
  const ledger: LedgerEntry = { ...base, slug, publishedAt, title: `Title of ${slug}`, categories: ['humanoids'], ...change };
  const data: NewsFrontmatter = {
    title: `Title of ${slug}`,
    description: 'A description.',
    publishedAt,
    categories: ['humanoids'],
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };
  return { news: { id: slug, data }, ledger: { id: slug, data: ledger } };
}

const matched = (...pairs: ReturnType<typeof pair>[]) => matchPieces(pairs.map((p) => p.news), pairs.map((p) => p.ledger));

describe('matchPieces: joining', () => {
  it('returns an empty list when there is no content', () => {
    expect(matchPieces([], [])).toEqual([]);
  });

  it('pairs each piece with the ledger entry of the same id', () => {
    const a = pair('a-piece', '2026-10-03');
    const [only] = matched(a);
    expect(only).toEqual({ slug: 'a-piece', news: a.news, ledger: a.ledger });
  });

  it('pairs by id, whatever order the two lists come in', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    const result = matchPieces([a.news, b.news], [b.ledger, a.ledger]);
    expect(result.map((piece) => [piece.slug, piece.ledger.id])).toEqual([
      ['a-piece', 'a-piece'],
      ['b-piece', 'b-piece'],
    ]);
  });
});

describe('matchPieces: order', () => {
  it('puts the newest piece first', () => {
    const result = matched(pair('old', '2026-10-01'), pair('new', '2026-10-04'), pair('middle', '2026-10-02'));
    expect(result.map((piece) => piece.slug)).toEqual(['new', 'middle', 'old']);
  });

  it('orders pieces of the same day by slug', () => {
    const result = matched(pair('b-piece', '2026-10-04'), pair('a-piece', '2026-10-04'), pair('c-piece', '2026-10-04'));
    expect(result.map((piece) => piece.slug)).toEqual(['a-piece', 'b-piece', 'c-piece']);
  });

  it('does not change the lists it is given', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-04');
    const news = [a.news, b.news];
    matchPieces(news, [a.ledger, b.ledger]);
    expect(news.map((entry) => entry.id)).toEqual(['a-piece', 'b-piece']);
  });
});

describe('matchPieces: content that does not fit together', () => {
  it('names a piece that has no ledger entry', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([a.news], [])).toThrow('the piece "a-piece" has no ledger file');
  });

  it('names a ledger entry that has no piece', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([], [a.ledger])).toThrow('the ledger entry "a-piece" has no piece');
  });

  it('names a ledger whose slug is not its file name', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { slug: 'other' }))).toThrow('the ledger entry "a-piece" says its slug is "other"');
  });

  it('names a ledger whose title, date or categories differ from the piece', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { title: 'Another title' }))).toThrow('the title in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { publishedAt: '2026-10-02' }))).toThrow('the date in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { categories: ['humanoids', 'funding'] }))).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
    const longer = pair('a-piece', '2026-10-03');
    longer.news.data.categories = ['humanoids', 'funding'];
    expect(() => matched(longer)).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
  });

  it('reports every problem at once, under one heading', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [b.ledger])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has no ledger file\n- the ledger entry "b-piece" has no piece',
    );
  });
});
