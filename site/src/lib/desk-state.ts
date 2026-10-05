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

/** The corrections and retractions recorded against one piece, newest first. */
export function correctionsFor(state: DeskState, slug: string): DeskState['corrections'] {
  return state.corrections.filter((entry) => entry.slug === slug).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
