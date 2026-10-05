import type { DeskState, LedgerEntry, RunOutcome } from '@robywire/gate';
import { formatDateTime } from './format';

// The numbers in the strip on the home page, from the ledger and the desk state.

export interface LedgerStats {
  /** Pieces published. */
  pieces: number;
  /** Claims cited by those pieces, added up. */
  claims: number;
  /** Drafts the gate held for the owner. */
  held: number;
  lastRun: DeskState['lastRun'];
}

export function ledgerStats(entries: readonly LedgerEntry[], state: DeskState): LedgerStats {
  return {
    pieces: entries.length,
    claims: entries.reduce((total, entry) => total + entry.claims.length, 0),
    held: state.holds.length,
    lastRun: state.lastRun,
  };
}

export interface StripItem {
  label: string;
  value: string;
  /** A smaller line under the value. */
  note?: string;
}

const OUTCOME_TEXT: Record<RunOutcome, string> = {
  published: 'published',
  'no-story': 'no story',
  held: 'held',
  failed: 'failed',
};

const count = (n: number): string => n.toLocaleString('en-US');

/** The four items of the strip, as text. */
export function stripItems(stats: LedgerStats): StripItem[] {
  const items: StripItem[] = [
    { label: 'Pieces published', value: count(stats.pieces) },
    { label: 'Claims verified', value: count(stats.claims) },
    { label: 'Drafts held', value: count(stats.held) },
  ];
  if (stats.lastRun === null) return [...items, { label: 'Last run', value: 'never' }];
  const [date, time] = formatDateTime(stats.lastRun.at).split(', ');
  return [...items, { label: 'Last run', value: date!, note: `${time}, ${OUTCOME_TEXT[stats.lastRun.outcome]}` }];
}
