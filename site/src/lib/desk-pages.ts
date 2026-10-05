import type { DeskState } from '@robywire/gate';
import { newestFirst } from './desk-state';
import { beatLabel, formatDate, formatDateTime } from './format';
import { reasonLabel } from './reasons';
import { OUTCOME_TEXT } from './stats';

// What the status, holds and corrections pages show, worked out from the desk
// state. The pages only lay these rows out.

export interface StatusView {
  lastRun: { when: string; outcome: string; runId: string; slug: string | null } | null;
  holds: number;
  corrections: number;
}

/** The facts of the status page: the last run in words, and how many holds and corrections there are. */
export function statusView(state: DeskState): StatusView {
  const run = state.lastRun;
  return {
    lastRun: run === null ? null : { when: formatDateTime(run.at), outcome: OUTCOME_TEXT[run.outcome], runId: run.runId, slug: run.slug },
    holds: state.holds.length,
    corrections: state.corrections.length,
  };
}

export interface HoldRow {
  at: string;
  /** The day of the hold. */
  when: string;
  /** The names of the beats and tags the held draft was filed under. */
  beats: string[];
  reasons: { code: string; label: string }[];
}

/**
 * The holds, newest first. A row has the date, the beats and the reasons and
 * nothing else. The held text is not in the desk state, and the address of the
 * draft pull request is left out on purpose, because the page never shows it.
 */
export function holdRows(state: DeskState): HoldRow[] {
  return newestFirst(state.holds).map((hold) => ({
    at: hold.at,
    when: formatDate(new Date(hold.at).toISOString().slice(0, 10)),
    beats: hold.categories.map(beatLabel),
    reasons: hold.reasons.map((code) => ({ code, label: reasonLabel(code) })),
  }));
}

export interface CorrectionRow {
  at: string;
  when: string;
  slug: string;
  /** The title of the piece, or undefined if the site has no such piece. */
  title: string | undefined;
  kind: 'Correction' | 'Retraction';
  note: string;
}

const KIND: Record<DeskState['corrections'][number]['kind'], CorrectionRow['kind']> = {
  correction: 'Correction',
  retraction: 'Retraction',
};

/** The corrections and retractions, newest first, with the title of each piece from `titles` (slug to title). */
export function correctionRows(state: DeskState, titles: ReadonlyMap<string, string>): CorrectionRow[] {
  return newestFirst(state.corrections).map((entry) => ({
    at: entry.at,
    when: formatDateTime(entry.at),
    slug: entry.slug,
    title: titles.get(entry.slug),
    kind: KIND[entry.kind],
    note: entry.note,
  }));
}
