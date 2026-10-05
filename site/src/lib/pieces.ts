import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { getDeskState } from './desk-state';
import { matchPieces } from './match-pieces';

/** A published piece: its frontmatter, its ledger and the entry Astro renders. */
export interface Piece {
  slug: string;
  data: NewsFrontmatter;
  ledger: LedgerEntry;
  entry: CollectionEntry<'news'>;
}

/** Every piece, newest first. Throws if a piece and its ledger, or its updatedAt and the desk state, do not belong together. */
export async function getPieces(): Promise<Piece[]> {
  const [news, ledgers, state] = await Promise.all([getCollection('news'), getCollection('ledger'), getDeskState()]);
  return matchPieces(news, ledgers, state.corrections).map(({ slug, news: entry, ledger }) => ({ slug, data: entry.data, ledger: ledger.data, entry }));
}
