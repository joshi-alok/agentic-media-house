import { defaultContext } from '@robywire/gate';
import type { GateContext } from '@robywire/gate';

// The hygiene check compares a piece with what is already published, so the
// cases run in a context that has something published. The golden piece has
// neither of these, so it still publishes; the hygiene cases copy them.
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';
/** Two days before the golden piece (2026-10-04), so the title is inside the 14-day window. */
export const SEEDED_RECENT_PUBLISHED_AT = '2026-10-02';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({
    publishedSlugs: [SEEDED_PUBLISHED_SLUG],
    recentTitles: [{ title: SEEDED_RECENT_TITLE, publishedAt: SEEDED_RECENT_PUBLISHED_AT }],
  });
}
