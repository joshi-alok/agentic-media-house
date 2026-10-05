import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';

// A piece is two files with the same name: the MDX the reader sees and the
// ledger JSON behind its receipts. This module joins them and refuses content
// where they do not belong together, so a half-written piece fails the build
// instead of producing a page with no receipts. It knows nothing about Astro,
// so it can be tested on its own; lib/pieces.ts feeds it Astro's collections.

/** The part of an Astro collection entry that is used here. */
export interface Keyed<T> {
  id: string;
  data: T;
}

export interface Matched<N, L> {
  slug: string;
  news: N;
  ledger: L;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, at) => item === b[at]);

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
 * the same day stay in slug order, because the lists are sorted by id first and
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, and a ledger entry whose
 * slug, title, date or categories disagree with its piece.
 */
export function matchPieces<N extends Keyed<NewsFrontmatter>, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
): Matched<N, L>[] {
  const ledgerById = new Map(ledgers.map((entry) => [entry.id, entry]));
  const newsIds = new Set(news.map((entry) => entry.id));
  const problems: string[] = [];
  const matched: Matched<N, L>[] = [];

  for (const piece of [...news].sort(byId)) {
    const ledger = ledgerById.get(piece.id);
    if (ledger === undefined) {
      problems.push(`the piece "${piece.id}" has no ledger file`);
      continue;
    }
    if (ledger.data.slug !== piece.id) problems.push(`the ledger entry "${piece.id}" says its slug is "${ledger.data.slug}"`);
    if (ledger.data.title !== piece.data.title) problems.push(`the title in the ledger entry "${piece.id}" differs from the piece`);
    if (ledger.data.publishedAt !== piece.data.publishedAt) problems.push(`the date in the ledger entry "${piece.id}" differs from the piece`);
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });
  }
  for (const ledger of [...ledgers].sort(byId)) {
    if (!newsIds.has(ledger.id)) problems.push(`the ledger entry "${ledger.id}" has no piece`);
  }

  if (problems.length > 0) throw new Error(`The site content does not fit together:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);

  return matched.sort((a, b) => (a.news.data.publishedAt < b.news.data.publishedAt ? 1 : a.news.data.publishedAt > b.news.data.publishedAt ? -1 : 0));
}
