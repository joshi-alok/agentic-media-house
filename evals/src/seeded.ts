import { defaultContext } from '@robywire/gate';
import type { CheckId, GateContext, GateInput } from '@robywire/gate';
import { SPEC_CASES } from './cases/spec';

/**
 * One known defect. `apply` receives a deep copy of the golden piece and
 * returns it broken in exactly one way. The case is caught when the gate
 * reports a failure from `check` with `code`.
 */
export type SeededCase = {
  /** Stable, kebab-case, unique. The scoreboard is keyed by it. */
  id: string;
  check: CheckId;
  code: string;
  /** One plain sentence saying what is wrong with the piece. */
  description: string;
  apply: (base: GateInput) => GateInput;
};

// The hygiene check compares a piece with what is already published, so the
// cases run in a context that has something published. The golden piece has
// neither of these, so it still publishes; the hygiene cases copy them.
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({ publishedSlugs: [SEEDED_PUBLISHED_SLUG], recentTitles: [SEEDED_RECENT_TITLE] });
}

export const SEEDED_CASES: SeededCase[] = [...SPEC_CASES];
