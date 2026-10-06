import type { SelectArtifact } from '../../src/run/artifacts';
import { runFetch } from '../../src/stages/fetch';
import type { Snapshot } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from './candidates';
import { URLS, stageContext } from './context';

// The story that the tests of the later stages are told: the report of Mercer Wire on the second plant of Brindle Logistics (a
// tier-2 page) and the release of Fixture Robotics that it cites (the tier-1 page). Both are files in `desk/test/fixtures/pages/`.

/** The candidate that Select chose: the page of the outlet, found in a feed. */
export const ARTICLE = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", publishedAt: '2026-10-04T09:15:00.000Z' });

/** What Select hands on for `chosen`: that story, and the address of its primary source (none when `tier1Url` is null). */
export function selectedStory(chosen: SelectArtifact['chosen'] = ARTICLE, tier1Url: string | null = URLS.release): SelectArtifact {
  return { date: RUN_DATE, chosen, reasons: ['A product reached a customer site.'], tier1Url, shortlist: chosen === null ? [] : [chosen.id] };
}

/** The pages of the story as Fetch hands them on: the release (tier 1) first, then the article (tier 2). */
export async function storySnapshots(scratch: () => string): Promise<Snapshot[]> {
  const { ctx } = stageContext(scratch);
  const result = await runFetch(ctx, selectedStory());
  if (!result.ok) throw new Error('the pages of the story could not be fetched');
  return result.snapshots;
}
