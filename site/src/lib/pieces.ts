import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from './match-pieces';

/** A published piece: its frontmatter, its ledger and the entry Astro renders. */
export interface Piece {
  slug: string;
  data: NewsFrontmatter;
  ledger: LedgerEntry;
  entry: CollectionEntry<'news'>;
}

/** Every piece, newest first. Throws if a piece and its ledger do not belong together. */
export async function getPieces(): Promise<Piece[]> {
  const [news, ledgers] = await Promise.all([getCollection('news'), getCollection('ledger')]);
  return matchPieces(news, ledgers).map(({ slug, news: entry, ledger }) => ({ slug, data: entry.data, ledger: ledger.data, entry }));
}
