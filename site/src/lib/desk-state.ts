import { DeskState } from '@robywire/gate';
import { useFixtures } from './env';

// The desk state is what the Desk reports about itself: its last run, the
// drafts it held and the corrections it published. The Desk will commit it as
// src/data/desk-state.json. A fixture build reads the fixture copy instead.

/** Check `raw` against the DeskState schema. A file that does not fit stops the build. */
export function parseDeskState(raw: unknown): DeskState {
  return DeskState.parse(raw);
}

/** The desk state for this build, or for fixture mode when `fixtures` says so. */
export async function getDeskState(fixtures: boolean = useFixtures): Promise<DeskState> {
  // Dynamic imports, so a production build never loads the fixture file.
  const file = fixtures ? await import('../content-fixtures/desk-state.json') : await import('../data/desk-state.json');
  return parseDeskState(file.default);
}

/**
 * `items` sorted newest first by their `at` time. Times are compared as moments, not as text, because
 * the schema allows any UTC offset. Items at the same moment keep their order. The array is a new one.
 */
export function newestFirst<T extends { at: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The corrections and retractions recorded against one piece, newest first. */
export function correctionsFor(state: DeskState, slug: string): DeskState['corrections'] {
  return newestFirst(state.corrections.filter((entry) => entry.slug === slug));
}

/** The UTC day (YYYY-MM-DD) of the moment `at`, which may be written with any UTC offset. */
export function correctionDay(at: string): string {
  return new Date(Date.parse(at)).toISOString().slice(0, 10);
}

/**
 * The day of the latest correction or retraction recorded for the piece `slug`, or undefined if there is none.
 * A piece that has one must say so in its frontmatter: `updatedAt` is this day (see match-pieces.ts).
 */
export function latestCorrectionDay(corrections: DeskState['corrections'], slug: string): string | undefined {
  const latest = newestFirst(corrections.filter((entry) => entry.slug === slug))[0];
  return latest === undefined ? undefined : correctionDay(latest.at);
}
