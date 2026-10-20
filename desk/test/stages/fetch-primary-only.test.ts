import { describe, expect, it } from 'vitest';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import type { SelectArtifact } from '../../src/run/artifacts';
import { runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

// With the profile `explainer` the piece is written from the primary page alone: the article of the outlet that led to it is not fetched, so no claim of another outlet can
// enter the piece. With any other profile both pages are fetched, as before.

const scratch = useScratch();

const ARTICLE = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", publishedAt: '2026-10-04T09:15:00.000Z' });
const RELEASE = candidate({ url: URLS.release, title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant', tier: 1, outlet: 'Fixture Robotics', origin: 'newsroom', publishedAt: undefined });
const selected = (tier1Url: string | null, chosen = ARTICLE): SelectArtifact => ({ date: RUN_DATE, chosen, reasons: ['It is today.'], tier1Url, shortlist: [chosen.id] });

describe('runFetch for an explainer', () => {
  it('fetches the primary page and not the article of the outlet that led to it', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { profile: 'explainer', fetcher });
    const result = await runFetch(ctx, selected(URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.documents.map((document) => [document.url, document.tier])).toEqual([[URLS.release, 1]]);
    expect(result.artifact.failures).toEqual([]);
    expect(fetcher.requests).toEqual([URLS.release]);
  });

  it('hands on the text of the primary page alone', async () => {
    const { ctx } = stageContext(scratch, { profile: 'explainer' });
    const result = await runFetch(ctx, selected(URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    expect(result.snapshots.map((snapshot) => snapshot.url)).toEqual([URLS.release]);
  });

  it('is a bug of the Desk, not a story, to be given a story that has no primary page', async () => {
    const { ctx } = stageContext(scratch, { profile: 'explainer' });
    await expect(runFetch(ctx, selected(null))).rejects.toThrow('runFetch: an explainer is written from a primary page, and Select found none');
  });

  it('fetches nothing before it refuses a story that has no primary page', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { profile: 'explainer', fetcher });
    await expect(runFetch(ctx, selected(null))).rejects.toThrow('an explainer is written from a primary page');
    expect(fetcher.requests).toEqual([]);
  });

  it('ends the run as no story when the primary page cannot be fetched, and does not fall back to the article of the outlet', async () => {
    const down = new FetchError('robots', URLS.release, 'robots.txt does not allow it');
    const fetcher = withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: down });
    const { ctx } = stageContext(scratch, { profile: 'explainer', fetcher });
    const result = await runFetch(ctx, selected(URLS.release));
    expect(result.ok).toBe(false);
    expect(result.artifact.documents).toEqual([]);
    expect(result.artifact.failures.map((failure) => failure.url)).toEqual([URLS.release]);
    if (!result.ok) expect(result.reason).toContain('none of the pages of the story could be fetched');
  });

  it('still holds a story that has no date of its own, and is itself the primary page, to the window of recency', async () => {
    const old = '<html><head><title>Old news</title><meta property="article:published_time" content="2026-01-01T00:00:00Z"></head><body><p>An old announcement.</p></body></html>';
    const { ctx } = stageContext(scratch, { profile: 'explainer', fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: old }) });
    const result = await runFetch(ctx, selected(URLS.release, RELEASE));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^stale-or-undated: /);
  });
});

describe('runFetch for any other profile', () => {
  it.each([
    ['none', {}],
    ['brief', { profile: 'brief' as const }],
  ])('fetches the primary page and the article, as before (profile: %s)', async (_name, overrides) => {
    const { ctx } = stageContext(scratch, overrides);
    const result = await runFetch(ctx, selected(URLS.release));
    expect(result.artifact.documents.map((document) => document.tier)).toEqual([1, 2]);
  });

  it('fetches the article alone when there is no primary page', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(null));
    expect(result.artifact.documents.map((document) => document.url)).toEqual([URLS.mercerArticle]);
  });
});
