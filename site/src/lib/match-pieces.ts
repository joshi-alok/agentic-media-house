import { renderBody } from '@robywire/gate';
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';

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

/** A piece: its frontmatter, and the text of the file below the frontmatter, which Astro keeps as `body`. */
export interface KeyedPiece extends Keyed<NewsFrontmatter> {
  body?: string;
}

export interface Matched<N, L> {
  slug: string;
  news: N;
  ledger: L;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, at) => item === b[at]);

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The most characters of a line that a message shows, and how many of them come before the first difference. */
const WINDOW = 70;
const LEAD = 30;

/** `line` from character `from`, at most 70 characters, with "..." where it is cut. */
const excerpt = (line: string, from: number): string =>
  `${from > 0 ? '...' : ''}${line.slice(from, from + WINDOW)}${line.length > from + WINDOW ? '...' : ''}`;

/**
 * Where two texts first differ, as a short description, or undefined if they are equal. Lines are
 * counted from 1, and so are the columns. `actual` is the text of the file and `expected` what the
 * ledger renders. A paragraph is one long line, so the message shows the stretch of each line around
 * the first character that differs, not the start of it.
 */
export function firstDifference(actual: string, expected: string): string | undefined {
  const have = actual.split('\n');
  const want = expected.split('\n');
  for (let at = 0; at < Math.max(have.length, want.length); at++) {
    const [now, then] = [have[at], want[at]];
    if (now === then) continue;
    if (now === undefined) return `line ${at + 1}: the file ends before this line, where the ledger gives "${excerpt(then as string, 0)}"`;
    if (then === undefined) return `line ${at + 1}: the file has "${excerpt(now, 0)}" where the ledger has nothing`;
    let column = 0;
    while (now[column] === then[column]) column++;
    const from = Math.max(0, column - LEAD);
    return `line ${at + 1}, column ${column + 1}: the file has "${excerpt(now, from)}" but the ledger gives "${excerpt(then, from)}"`;
  }
  return undefined;
}

/**
 * What is wrong with the body of a piece, or undefined when it is exactly what its ledger renders. A ledger
 * that `renderBody` cannot write (a sentence cites a claim the order lacks, a body sentence has no heading)
 * is a problem of its own, named by the piece.
 */
function bodyProblem(id: string, body: string | undefined, ledger: LedgerEntry): string | undefined {
  let expected: string;
  try {
    expected = renderBody(ledger);
  } catch (error) {
    return `the ledger entry "${id}" cannot be written as a body: ${error instanceof Error ? error.message : String(error)}`;
  }
  // Astro keeps the body without the blank lines around it, so both sides are trimmed.
  const difference = firstDifference((body ?? '').trim(), expected.trim());
  return difference === undefined ? undefined : `the body of the piece "${id}" differs from its ledger at ${difference}`;
}

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
 * the same day stay in slug order, because the lists are sorted by id first and
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, title, date or categories disagree with its piece, and a piece whose
 * `updatedAt` does not agree with the corrections recorded for it (a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
 * one, and a piece that says it was updated needs a record that explains it),
 * and a piece whose body is not what `renderBody` writes from its ledger, so
 * that the article and its receipts cannot drift apart.
 */
export function matchPieces<N extends KeyedPiece, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
  corrections: DeskState['corrections'],
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

    const bodyIssue = bodyProblem(piece.id, piece.body, ledger.data);
    if (bodyIssue !== undefined) problems.push(bodyIssue);

    const recorded = latestCorrectionDay(corrections, piece.id);
    const { updatedAt } = piece.data;
    if (recorded !== undefined && updatedAt === undefined) {
      problems.push(`the piece "${piece.id}" has a correction or retraction recorded on ${recorded} but no updatedAt; add updatedAt: "${recorded}" to its frontmatter`);
    } else if (recorded !== undefined && updatedAt !== recorded) {
      problems.push(`the piece "${piece.id}" says updatedAt is ${updatedAt}, but its latest correction or retraction was recorded on ${recorded}`);
    } else if (recorded === undefined && updatedAt !== undefined) {
      problems.push(`the piece "${piece.id}" has updatedAt ${updatedAt}, but no correction or retraction is recorded for it`);
    }
  }
  for (const ledger of [...ledgers].sort(byId)) {
    if (!newsIds.has(ledger.id)) problems.push(`the ledger entry "${ledger.id}" has no piece`);
  }

  if (problems.length > 0) throw new Error(`The site content does not fit together:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);

  return matched.sort((a, b) => (a.news.data.publishedAt < b.news.data.publishedAt ? 1 : a.news.data.publishedAt > b.news.data.publishedAt ? -1 : 0));
}
