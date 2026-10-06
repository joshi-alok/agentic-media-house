import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { extractPage } from '../../src/fetch/extract-text';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import { sha256Hex } from '../../src/model/types';
import { FetchArtifact, readArtifact } from '../../src/run/artifacts';
import type { SelectArtifact } from '../../src/run/artifacts';
import type { EvidenceStore } from '../../src/run/evidence';
import { fixtureText } from '../support/fixtures';
import { MAX_TITLE_LENGTH } from '../../src/stages/discover';
import { runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

// Fetch gets the pages that the story will be written from and keeps their text as evidence. These tests run it on
// the made-up world of Task 20, with a FixtureFetcher that serves files and errors; no page is ever fetched for real.

const scratch = useScratch();

const ARTICLE = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", publishedAt: '2026-10-04T09:15:00.000Z' });
const RELEASE = candidate({ url: URLS.release, title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant', tier: 1, outlet: 'Fixture Robotics', origin: 'newsroom', publishedAt: undefined });

const selected = (chosen: ReturnType<typeof candidate> | null, tier1Url: string | null): SelectArtifact => ({
  date: RUN_DATE,
  chosen,
  reasons: ['A product reached a customer site.'],
  tier1Url,
  shortlist: chosen === null ? [] : [chosen.id],
});

const releaseText = extractPage(fixtureText('pages/fixture-robotics-fx-1-second-plant.html'), URLS.release).text;
const articleText = extractPage(fixtureText('pages/mercer-wire-fx-1-second-plant.html'), URLS.mercerArticle).text;

describe('runFetch: the primary source and the story are both fetched', () => {
  it('stores the text of each page, and records where each came from and its hash, the primary source first', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact).toEqual({
      date: RUN_DATE,
      documents: [
        {
          url: URLS.release,
          finalUrl: URLS.release,
          tier: 1,
          hash: sha256Hex(releaseText),
          retrievedAt: FETCHED_AT.toISOString(),
          bytes: Buffer.byteLength(releaseText, 'utf8'),
          title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant',
        },
        {
          url: URLS.mercerArticle,
          finalUrl: URLS.mercerArticle,
          tier: 2,
          hash: sha256Hex(articleText),
          retrievedAt: FETCHED_AT.toISOString(),
          bytes: Buffer.byteLength(articleText, 'utf8'),
          title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant - Mercer Wire",
        },
      ],
      failures: [],
    });
  });

  it('hands the text of each page to the next stage in memory, with the same record', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    expect(result.snapshots.map((snapshot) => snapshot.text)).toEqual([releaseText, articleText]);
    expect(result.snapshots.map(({ text: _text, ...document }) => document)).toEqual(result.artifact.documents);
  });

  it('puts each text in the evidence store under its hash, with where it came from', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    expect(await ctx.evidence.get(sha256Hex(releaseText))).toEqual({
      text: releaseText,
      meta: { url: URLS.release, finalUrl: URLS.release, tier: 1, retrievedAt: FETCHED_AT.toISOString() },
    });
    expect((await ctx.evidence.get(sha256Hex(articleText))).meta.tier).toBe(2);
  });

  it('writes 03-fetch.json, and never the text of a page into it, only its hash', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(await readArtifact(ctx.runDir, '03-fetch', FetchArtifact)).toEqual(result.artifact);
    const raw = readFileSync(path.join(ctx.runDir, '03-fetch.json'), 'utf8');
    expect(raw).not.toContain('FX-1 warehouse arms');
    expect(raw).not.toContain('Specifications are in');
    expect(raw).toContain(sha256Hex(releaseText));
  });

  it('fetches the primary source first, then the page of the story, and each once', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { fetcher });
    await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(fetcher.requests).toEqual([URLS.release, URLS.mercerArticle]);
  });

  it('asks no model for anything', async () => {
    const { ctx, fake } = stageContext(scratch);
    await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(fake.calls).toEqual([]);
  });

  it('records the address after redirects, and the size in bytes of the text, not in characters', async () => {
    const page = `<html><head><title>Caf${'&eacute;'}</title></head><body><p>caf&eacute;</p></body></html>`;
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerArticle]: page }) });
    const result = await runFetch(ctx, selected(ARTICLE, null));
    const [document] = result.artifact.documents;
    expect(document?.bytes).toBe(5);
    expect(document?.title).toBe(`Caf${String.fromCharCode(0xe9)}`);
  });

  it('records the final address when the page was redirected', async () => {
    const map = { ...worldMap(), [URLS.mercerArticle]: { file: 'pages/mercer-wire-fx-1-second-plant.html', finalUrl: 'https://mercer-wire.example/robotics/moved-here' } };
    const { ctx } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, map, () => FETCHED_AT) });
    const result = await runFetch(ctx, selected(ARTICLE, null));
    expect(result.artifact.documents[0]).toMatchObject({ url: URLS.mercerArticle, finalUrl: 'https://mercer-wire.example/robotics/moved-here' });
    expect((await ctx.evidence.get(result.artifact.documents[0]!.hash)).meta.finalUrl).toBe('https://mercer-wire.example/robotics/moved-here');
  });

  it(`cuts a title to ${MAX_TITLE_LENGTH} characters`, async () => {
    const page = `<html><head><title>${'word '.repeat(200)}</title></head><body><p>Some text.</p></body></html>`;
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerArticle]: page }) });
    const result = await runFetch(ctx, selected(ARTICLE, null));
    expect(result.artifact.documents[0]?.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('keeps one snapshot for two pages that have the same text, and records both', async () => {
    const same = '<body><p>The same text on two addresses.</p></body>';
    const { ctx, evidenceDir } = stageContext(scratch, {
      fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: same, [URLS.mercerArticle]: same }),
    });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    const [first, second] = result.artifact.documents;
    expect(first?.hash).toBe(second?.hash);
    expect(readdirSync(evidenceDir)).toHaveLength(2);
  });
});

describe('runFetch: only one page is wanted', () => {
  it('fetches one page when the story is on the site of the company, which is its own primary source', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { fetcher });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    expect(fetcher.requests).toEqual([URLS.release]);
    expect(result.artifact.documents.map((document) => [document.url, document.tier])).toEqual([[URLS.release, 1]]);
  });

  it('fetches only the page of the story, as tier 2, when no primary source was found', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { fetcher });
    const result = await runFetch(ctx, selected(ARTICLE, null));
    expect(fetcher.requests).toEqual([URLS.mercerArticle]);
    expect(result.artifact.documents.map((document) => [document.url, document.tier])).toEqual([[URLS.mercerArticle, 2]]);
    expect(result.artifact.failures).toEqual([]);
  });
});

describe('runFetch: a story that has no date of its own', () => {
  // A headline link on a newsroom page has no date, so Select lets it through whatever its age. The page of the story has to say that
  // it is new: a date of its own, within recencyHours of the run (the same window as Select's, in UTC).
  const dated = (publishedAt: string | undefined) => {
    const head = publishedAt === undefined ? '' : `<meta property="article:published_time" content="${publishedAt}">`;
    return `<html><head><title>FX-1 news</title>${head}</head><body><article><p>Fixture Robotics begins shipping FX-1 arms.</p></article></body></html>`;
  };
  const serving = (page: string) => withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: page });

  it('goes on with a page that says that it was published inside the window', async () => {
    const { ctx } = stageContext(scratch, { fetcher: serving(dated('2026-10-04T06:00:00Z')) });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.failures).toEqual([]);
    expect(result.artifact.documents.map((document) => document.url)).toEqual([URLS.release]);
  });

  it.each([
    ['the start of the window', '2026-10-03T00:00:00Z'],
    ['the last moment of the day of the run', '2026-10-05T23:59:59Z'],
  ])('goes on with a page that was published at %s', async (_what, at) => {
    const { ctx } = stageContext(scratch, { fetcher: serving(dated(at)) });
    expect((await runFetch(ctx, selected(RELEASE, URLS.release))).ok).toBe(true);
  });

  it('ends with no-story when the page says it was published before the window, and records why in 03-fetch.json, and stores nothing', async () => {
    const { ctx, evidenceDir } = stageContext(scratch, { fetcher: serving(dated('2026-10-02T23:59:59Z')) });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    const reason = 'stale-or-undated: the story has no date and its page says it was published 2026-10-02T23:59:59.000Z, outside the 72 hours before the end of 2026-10-05';
    expect(result).toEqual({
      ok: false,
      outcome: 'no-story',
      reason,
      artifact: { date: RUN_DATE, documents: [], failures: [{ url: URLS.release, tier: 1, reason }] },
    });
    expect(await readArtifact(ctx.runDir, '03-fetch', FetchArtifact)).toEqual(result.artifact);
    expect(existsSync(evidenceDir)).toBe(false);
  });

  it('ends with no-story when the page says it was published after the day of the run', async () => {
    const { ctx } = stageContext(scratch, { fetcher: serving(dated('2026-10-06T00:00:00Z')) });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    expect(result.ok).toBe(false);
    expect(result.artifact.failures[0]?.reason).toContain('stale-or-undated: the story has no date and its page says it was published 2026-10-06T00:00:00.000Z');
  });

  it('ends with no-story when the page has no date of its own, and says so', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: serving(dated(undefined)) });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    const reason = 'stale-or-undated: the story has no date and its page gives none either';
    expect(result).toMatchObject({ ok: false, outcome: 'no-story', reason });
    expect(result.artifact.failures).toEqual([{ url: URLS.release, tier: 1, reason }]);
    expect(logs).toContain(`fetch: ${URLS.release} is stale or undated: ${reason}`);
  });

  it('follows the configuration: with 24 hours the day before the run is stale', async () => {
    const config = { ...defaultConfig(), recencyHours: 24 };
    const { ctx } = stageContext(scratch, { config, fetcher: serving(dated('2026-10-04T23:00:00Z')) });
    expect((await runFetch(ctx, selected(RELEASE, URLS.release))).ok).toBe(false);
  });

  it('does not look at the date of the page when the story has a date', async () => {
    const old = { [URLS.mercerArticle]: dated('2020-01-01T00:00:00Z'), [URLS.release]: dated(undefined) };
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), old) });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.failures).toEqual([]);
    expect(result.artifact.documents).toHaveLength(2);
  });

  it('looks only at the page of the story, and not at its primary source, which a dated story may link to whatever its age', async () => {
    const undated = candidate({ url: URLS.mercerArticle, title: 'A story from a feed without a date', publishedAt: undefined });
    const pages = { [URLS.release]: dated('2020-01-01T00:00:00Z'), [URLS.mercerArticle]: dated('2026-10-04T08:00:00Z') };
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), pages) });
    const result = await runFetch(ctx, selected(undated, URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.documents.map((document) => document.url)).toEqual([URLS.release, URLS.mercerArticle]);
  });

  it('keeps the primary source that was stored before the page of the story was found stale, and ends with no-story', async () => {
    const undated = candidate({ url: URLS.mercerArticle, title: 'A story from a feed without a date', publishedAt: undefined });
    const pages = { [URLS.mercerArticle]: dated('2020-01-01T00:00:00Z') };
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), pages) });
    const result = await runFetch(ctx, selected(undated, URLS.release));
    expect(result.ok).toBe(false);
    expect(result.artifact.documents.map((document) => document.url)).toEqual([URLS.release]);
    expect(result.artifact.failures.map((failure) => [failure.url, failure.tier])).toEqual([[URLS.mercerArticle, 2]]);
  });
});

describe('runFetch: a page that cannot be had', () => {
  const robots = new FetchError('robots', URLS.release, 'https://fixture-robotics.example/robots.txt does not allow RobywireDesk to fetch /news/fx-1-second-plant');
  const tooLarge = new FetchError('too-large', URLS.mercerArticle, 'the page is larger than the limit of 2000000 bytes');

  it('goes on with the page of the story when the primary source is refused by its robots.txt, and records the refusal', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: robots }) });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    expect(result.snapshots.map((snapshot) => [snapshot.url, snapshot.tier])).toEqual([[URLS.mercerArticle, 2]]);
    expect(result.artifact.failures).toEqual([{ url: URLS.release, tier: 1, reason: robots.message }]);
    expect(logs).toContain(`fetch: ${URLS.release} could not be fetched (tier 1): ${robots.message}`);
    expect(await readArtifact(ctx.runDir, '03-fetch', FetchArtifact)).toEqual(result.artifact);
  });

  it('goes on with the primary source when the page of the story is too large, and records it', async () => {
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerArticle]: tooLarge }) });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    expect(result.snapshots.map((snapshot) => snapshot.tier)).toEqual([1]);
    expect(result.artifact.failures).toEqual([{ url: URLS.mercerArticle, tier: 2, reason: tooLarge.message }]);
  });

  it('ends the story with no-story when every page fails, and writes the artifact that says why, and stores nothing', async () => {
    const { ctx, evidenceDir } = stageContext(scratch, {
      fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: robots, [URLS.mercerArticle]: tooLarge }),
    });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(result).toEqual({
      ok: false,
      outcome: 'no-story',
      reason: `none of the pages of the story could be fetched: ${URLS.release}: ${robots.message}; ${URLS.mercerArticle}: ${tooLarge.message}`,
      artifact: {
        date: RUN_DATE,
        documents: [],
        failures: [
          { url: URLS.release, tier: 1, reason: robots.message },
          { url: URLS.mercerArticle, tier: 2, reason: tooLarge.message },
        ],
      },
    });
    expect(await readArtifact(ctx.runDir, '03-fetch', FetchArtifact)).toEqual(result.artifact);
    expect(existsSync(evidenceDir)).toBe(false);
  });

  it('ends the story with no-story when the only page cannot be fetched', async () => {
    const { ctx } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    const result = await runFetch(ctx, selected(RELEASE, URLS.release));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(`none of the pages of the story could be fetched: ${URLS.release}: ${URLS.release}: no fixture is registered for this address`);
  });

  it('treats a page with no text in it as a page that cannot be had', async () => {
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerArticle]: '<html><body><script>only code</script></body></html>' }) });
    const result = await runFetch(ctx, selected(ARTICLE, null));
    expect(result.ok).toBe(false);
    expect(result.artifact.failures).toEqual([{ url: URLS.mercerArticle, tier: 2, reason: 'the page has no text to read' }]);
  });

  it('treats a page that is nested too deeply as a page that cannot be had', async () => {
    const deep = `<body>${'<div>'.repeat(600)}</body>`;
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.release]: deep }) });
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.failures).toEqual([{ url: URLS.release, tier: 1, reason: 'the page cannot be read: the page is nested more than 512 levels deep' }]);
  });

  it('refuses to run without a story', async () => {
    const { ctx } = stageContext(scratch);
    await expect(runFetch(ctx, selected(null, null))).rejects.toThrow('runFetch needs a story: the Select stage chose none');
    expect(existsSync(ctx.runDir)).toBe(false);
  });
});

describe('runFetch: what ends the run', () => {
  it('ends the run when the evidence store cannot be written, and writes no artifact: the Desk does not go on without the evidence it will cite', async () => {
    const evidence: EvidenceStore = {
      put: async () => {
        throw new Error('the evidence store is unreachable');
      },
      get: async () => Promise.reject(new Error('unreachable')),
      has: async () => false,
    };
    const { ctx } = stageContext(scratch, { evidence });
    await expect(runFetch(ctx, selected(ARTICLE, URLS.release))).rejects.toThrow('the evidence store is unreachable');
    expect(existsSync(ctx.runDir)).toBe(false);
  });

  it('does not hide a bug of the Desk as a page that cannot be had', async () => {
    const fetcher = {
      get: async () => {
        throw new TypeError('a bug in the fetcher');
      },
    };
    const { ctx } = stageContext(scratch, { fetcher });
    await expect(runFetch(ctx, selected(ARTICLE, URLS.release))).rejects.toThrow(new TypeError('a bug in the fetcher'));
  });
});
