import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { extractPage } from '../../src/fetch/extract-text';
import { FixtureFetcher } from '../../src/fetch/http';
import type { Fetcher } from '../../src/fetch/http';
import { sha256Hex } from '../../src/model/types';
import { FetchArtifact, readArtifact } from '../../src/run/artifacts';
import type { SelectArtifact } from '../../src/run/artifacts';
import { runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, worldMap } from '../support/context';
import { FIXTURE_DIR, fixtureText } from '../support/fixtures';

const scratch = useScratch();
const URL = 'https://eips.example/ercs/erc-0000.md';
const STORY = candidate({ url: URL, title: 'ERC-0000: Agent payment registry', tier: 1, outlet: 'Ethereum Magicians', origin: 'feed', publishedAt: '2026-10-04T09:15:00.000Z' });
const selected: SelectArtifact = { date: RUN_DATE, chosen: STORY, reasons: ['A proposal was published.'], tier1Url: URL, shortlist: [STORY.id] };
const world = (entries: Record<string, string>) => new FixtureFetcher(FIXTURE_DIR, entries, () => FETCHED_AT);

describe('runFetch: a page that is markdown', () => {
  it('stores its text as it is, with the heading as the title', async () => {
    const { ctx } = stageContext(scratch, { fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.documents[0]).toMatchObject({ url: URL, tier: 1, title: 'ERC-0000: Agent payment registry' });
    expect(result.snapshots[0]?.text).toContain('The registry MUST store one address for each agent identifier.');
    expect(result.artifact.documents[0]?.hash).toBe(sha256Hex(result.snapshots[0]!.text));
  });
});

describe('runFetch: a page that is longer than maxPageChars', () => {
  it('stores the cut text, records that it was cut, and says so in the log', async () => {
    const { ctx, logs } = stageContext(scratch, { config: { ...defaultConfig(), maxPageChars: 60 }, fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.snapshots[0]!.text;
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text).toBe('# ERC-0000: Agent payment registry\n\nStatus: Draft');
    expect(result.artifact.documents[0]).toMatchObject({ truncated: true, bytes: Buffer.byteLength(text, 'utf8'), hash: sha256Hex(text) });
    expect(logs.some((line) => line.startsWith(`fetch: ${URL} is longer than 60 characters and was cut to`))).toBe(true);
  });

  it('keeps the cut text in the evidence store and the artifact on disk says that it was cut', async () => {
    const { ctx } = stageContext(scratch, { config: { ...defaultConfig(), maxPageChars: 60 }, fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    if (!result.ok) throw new Error('the fetch failed');
    const document = result.artifact.documents[0]!;
    expect((await ctx.evidence.get(document.hash)).text).toBe(result.snapshots[0]!.text);
    const onDisk = await readArtifact(ctx.runDir, '03-fetch', FetchArtifact);
    expect(onDisk).toEqual(result.artifact);
    expect(onDisk.documents[0]?.truncated).toBe(true);
  });

  it('records nothing about cutting for a page that fits', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    expect(result.ok && 'truncated' in result.artifact.documents[0]!).toBe(false);
    expect(logs.some((line) => line.includes('was cut'))).toBe(false);
  });

  it('records nothing about cutting for a page that is exactly as long as the limit', async () => {
    const length = fixtureText('pages/sample-proposal.md').trim().length;
    const { ctx } = stageContext(scratch, { config: { ...defaultConfig(), maxPageChars: length }, fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    expect(result.ok && 'truncated' in result.artifact.documents[0]!).toBe(false);
  });

  it('has 150000 characters by default', () => {
    expect(defaultConfig().maxPageChars).toBe(150_000);
  });
});

describe('runFetch: a text with nothing to read', () => {
  const serving = (body: string): Fetcher => ({
    get: async (url) => ({ url, finalUrl: url, status: 200, contentType: 'text/plain; charset=utf-8', body, retrievedAt: FETCHED_AT.toISOString() }),
  });

  it('is a failure of the page, as an empty html page is', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: serving('  \n \r\n') });
    const result = await runFetch(ctx, selected);
    expect(result.ok).toBe(false);
    expect(result.artifact.documents).toEqual([]);
    expect(result.artifact.failures).toEqual([{ url: URL, tier: 1, reason: 'the page has no text to read' }]);
    expect(logs).toContain(`fetch: ${URL} has no text to read`);
  });

  it('is a failure of the page when the limit leaves nothing of the first character, and nothing empty is stored', async () => {
    const { ctx } = stageContext(scratch, { config: { ...defaultConfig(), maxPageChars: 1 }, fetcher: serving(String.fromCodePoint(0x1f600).repeat(3)) });
    const result = await runFetch(ctx, selected);
    expect(result.ok).toBe(false);
    expect(result.artifact.failures).toEqual([{ url: URL, tier: 1, reason: 'the page has no text to read' }]);
  });
});

describe('runFetch: a page of html that is longer than maxPageChars', () => {
  it('is cut at a block, and the text that is stored is the beginning of the text that is read', async () => {
    const full = extractPage(fixtureText('pages/fixture-robotics-fx-1-second-plant.html'), URLS.release).text;
    const release = candidate({ url: URLS.release, title: 'The release', tier: 1, outlet: 'Fixture Robotics', origin: 'newsroom', publishedAt: undefined });
    const { ctx } = stageContext(scratch, { config: { ...defaultConfig(), maxPageChars: 400 } });
    const result = await runFetch(ctx, { date: RUN_DATE, chosen: release, reasons: ['A release.'], tier1Url: URLS.release, shortlist: [release.id] });
    expect(full.length).toBeGreaterThan(400);
    if (!result.ok) throw new Error(`the fetch failed: ${result.reason}`);
    const text = result.snapshots[0]!.text;
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text.length).toBeGreaterThan(200);
    expect(full.startsWith(`${text}\n`)).toBe(true);
    expect(result.artifact.documents[0]).toMatchObject({ truncated: true, hash: sha256Hex(text), bytes: Buffer.byteLength(text, 'utf8') });
  });
});

describe('runFetch: a story with no date of its own whose page is markdown', () => {
  it('ends with no story, as a page of html that gives no date does: a text does not say when it was published', async () => {
    const undated = candidate({ url: URL, title: 'ERC-0000: Agent payment registry', tier: 1, outlet: 'Ethereum Magicians', origin: 'newsroom', publishedAt: undefined });
    const { ctx } = stageContext(scratch, { fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, { date: RUN_DATE, chosen: undated, reasons: ['A proposal was published.'], tier1Url: URL, shortlist: [undated.id] });
    if (result.ok) throw new Error('the fetch went on');
    expect(result.outcome).toBe('no-story');
    expect(result.reason).toBe('stale-or-undated: the story has no date and its page gives none either');
    expect(result.artifact.documents).toEqual([]);
    expect(result.artifact.failures).toEqual([{ url: URL, tier: 1, reason: result.reason }]);
  });
});
