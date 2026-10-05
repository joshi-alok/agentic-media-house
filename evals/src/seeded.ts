import type { CheckId, GateInput } from '@robywire/gate';

export { SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_PUBLISHED_AT, SEEDED_RECENT_TITLE, seededContext } from './context';
export { SEEDED_CASES } from './cases';

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
