import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import type { DeskConfig } from '../../src/config';
import { ModelError, jsonSchemaOf, requestKey } from '../../src/model/types';
import type { ModelRequest } from '../../src/model/types';
import { buildExtractUser, extractSystem } from '../../src/prompts/extract';
import { ExtractArtifact, readArtifact } from '../../src/run/artifacts';
import { EXTRACT_EFFORT, EXTRACT_MAX_OUTPUT_TOKENS, extractReplySchema, runExtract } from '../../src/stages/extract';
import type { Snapshot } from '../../src/stages/fetch';
import { splitIntoParts, wordsIn } from '../../src/stages/page-parts';
import { FETCHED_AT, URLS, stageContext, useScratch } from '../support/context';
import { blocksOf, outsideBlocks } from '../support/prompts';
import { selectedStory, storySnapshots } from '../support/story';

// With the setting `extractChunkWords` the Extract stage reads a page in parts, one call to the model for each, so that each part gets a full pass. These tests give it a long page
// of paragraphs, each of which states one fact, and a fake model that answers each call with the facts of the part it was shown. Without the setting the stage is what it was
// (the tests in extract.test.ts), and for a page that is one part the call is the very call it was.

const scratch = useScratch();
const SNAPSHOTS = await storySnapshots(scratch);
const RELEASE = SNAPSHOTS[0] as Snapshot;
const REPORT = SNAPSHOTS[1] as Snapshot;

/** The sentence of the page that states fact `i`. */
const sentence = (i: number): string => `Fixture Robotics ships batch ${i} of FX-1 arms to depot ${i}.`;

/** What the model says for fact `i`, from the page `source`. */
function fact(i: number, overrides: Record<string, unknown> = {}) {
  return { text: sentence(i), label: `ships batch ${i}`, type: 'event', quote: sentence(i), values: [], basis: 'announcement', status: 'unspecified', source: 1, ...overrides };
}

/** A paragraph of `words` words that states fact `i`. */
const paragraphOf = (i: number, words = 100): string => `${sentence(i)} ${Array.from({ length: words - sentence(i).split(' ').length }, () => 'and').join(' ')}`;

/** A page of `count` paragraphs of 100 words, the first of which states fact 0. */
const pageOf = (count: number): string => Array.from({ length: count }, (_, i) => paragraphOf(i)).join('\n\n');

/** A snapshot of the release, with another text. */
const snapshotOf = (text: string): Snapshot => ({ ...RELEASE, text });

/** The facts that a part states, as the model would list them: every fact whose sentence is in the text of the block it was shown, with this basis. */
const listingWith =
  (overrides: Record<string, unknown>) =>
  (request: ModelRequest<unknown>): { claims: unknown[] } => {
    const shown = blocksOf(request.user)[0]?.text ?? '';
    return { claims: Array.from({ length: 40 }, (_, i) => i).filter((i) => shown.includes(sentence(i))).map((i) => fact(i, overrides)) };
  };
const listing = listingWith({});

const CHUNKED = (words: number): Partial<DeskConfig> => ({ extractChunkWords: words });

function setup(config: Partial<DeskConfig>, ...replies: unknown[]) {
  const made = stageContext(scratch, { config: { ...defaultConfig(), ...config } });
  made.fake.script('extract', ...replies);
  return made;
}

// 1,200 words in 12 paragraphs, read in parts of about 400: three parts of four paragraphs each.
const LONG = snapshotOf(pageOf(12));

describe('runExtract with extractChunkWords: one call for each part', () => {
  it('makes one call for each part, one after the other and in order, each with the text of the part and nothing of the rest of the page', async () => {
    const { ctx, fake } = setup(CHUNKED(400), listing, listing, listing);
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(3);
    const parts = splitIntoParts(LONG.text, 400);
    expect(parts).toHaveLength(3);
    expect(fake.calls.map((call) => blocksOf(call.user).map((block) => block.text))).toEqual(parts.map((part) => [part.trim()]));
    expect(fake.calls.map((call) => blocksOf(call.user)[0]?.id)).toEqual(['1', '1', '1']);
    expect(fake.pending('extract')).toBe(0);
  });

  it('asks as the stage always asked: the role, the model, the reply schema, the limit on the reply and the effort are the same for every part', async () => {
    const { ctx, fake } = setup(CHUNKED(400), listing, listing, listing);
    await runExtract(ctx, [LONG], selectedStory());
    for (const call of fake.calls) {
      expect(Object.keys(call).sort()).toEqual(['effort', 'maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
      expect(call.role).toBe('extract');
      expect(call.model).toBe(ctx.config.models.extract);
      expect(call.maxOutputTokens).toBe(EXTRACT_MAX_OUTPUT_TOKENS);
      expect(call.effort).toBe(EXTRACT_EFFORT);
      expect(jsonSchemaOf(call.schema)).toEqual(jsonSchemaOf(extractReplySchema(1)));
      expect(call.system).toBe(extractSystem({ inParts: true }));
    }
  });

  it('tells the model, outside the block and from the Desk\'s own counts, which part of how many it has, how long the page is and how long the part is', async () => {
    const { ctx, fake } = setup(CHUNKED(400), listing, listing, listing);
    await runExtract(ctx, [LONG], selectedStory());
    const parts = splitIntoParts(LONG.text, 400);
    expect(wordsIn(LONG.text)).toBe(1200);
    fake.calls.forEach((call, at) => {
      expect(call.user).toBe(buildExtractUser([{ tier: 1, kind: 'company-newsroom', text: (parts[at] as string).trim(), part: { number: at + 1, of: 3, pageWords: 1200 } }]));
      expect(outsideBlocks(call.user)).toContain(`The text is part ${at + 1} of 3 of a page of about 1200 words, and this part has about 400 words.`);
      expect(outsideBlocks(call.user)).not.toContain('The page has about');
    });
  });

  it('numbers the claims c-1, c-2 and so on across the parts, in order, and keeps every fact of every part', async () => {
    const { ctx } = setup(CHUNKED(400), listing, listing, listing);
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(Array.from({ length: 12 }, (_, i) => `c-${i + 1}`));
    expect(result.artifact.claims.map((claim) => claim.text)).toEqual(Array.from({ length: 12 }, (_, i) => sentence(i)));
    expect(result.artifact.dropped).toEqual([]);
  });

  it('takes the source and the span from the whole page, as the page has it: the offsets are those of the page and not of the part', async () => {
    const { ctx } = setup(CHUNKED(400), listing, listing, listing);
    const result = await runExtract(ctx, [LONG], selectedStory());
    for (const claim of result.artifact.claims) {
      expect(LONG.text.slice(claim.span.start, claim.span.end)).toBe(claim.span.quote);
      expect(claim.source).toEqual({ url: URLS.release, tier: 1, snapshotHash: RELEASE.hash, retrievedAt: FETCHED_AT.toISOString() });
    }
    expect(result.artifact.claims[5]?.span.start).toBe(LONG.text.indexOf(sentence(5)));
  });

  it('writes 04-extract.json, which reads back as the artifact', async () => {
    const { ctx } = setup(CHUNKED(400), listing, listing, listing);
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
  });

  it('logs that the page is read in parts, and how many claims were proposed, kept and dropped', async () => {
    const { ctx, logs } = setup(CHUNKED(400), listing, listing, listing);
    await runExtract(ctx, [LONG], selectedStory());
    expect(logs).toEqual([`extract: ${URLS.release} is read in 3 parts`, 'extract: 12 claims proposed, 12 kept, 0 dropped']);
  });
});

describe('runExtract with extractChunkWords: what is the same as without it', () => {
  it('reads a page that is one part in one call that is the call it was: the same system prompt, user message and reply schema, so the same key of a recorded reply', async () => {
    const short = snapshotOf(pageOf(4));
    const whole = setup({}, listing);
    await runExtract(whole.ctx, [short], selectedStory());
    const chunked = setup(CHUNKED(400), listing);
    const result = await runExtract(chunked.ctx, [short], selectedStory());
    expect(chunked.fake.calls).toHaveLength(1);
    expect(requestKey(chunked.fake.calls[0] as ModelRequest<unknown>)).toBe(requestKey(whole.fake.calls[0] as ModelRequest<unknown>));
    expect(chunked.fake.calls[0]?.system).toBe(extractSystem());
    expect(outsideBlocks(chunked.fake.calls[0]?.user ?? '')).toContain('The page has about 400 words.');
    expect(chunked.logs).toEqual(['extract: 4 claims proposed, 4 kept, 0 dropped']);
    expect(result.artifact.claims).toHaveLength(4);
  });

  it('reads the pages whole, in one call, when the setting is absent: the stage is what it was', async () => {
    const { ctx, fake, logs } = setup({}, listing);
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.system).toBe(extractSystem());
    expect(fake.calls[0]?.user).toBe(buildExtractUser([{ tier: 1, kind: 'company-newsroom', text: LONG.text }]));
    expect(result.artifact.claims).toHaveLength(12);
    expect(logs).toEqual(['extract: 12 claims proposed, 12 kept, 0 dropped']);
  });

  it('does not fall back to parts for a setting that is undefined', async () => {
    const { ctx, fake } = setup({ extractChunkWords: undefined }, listing);
    await runExtract(ctx, [LONG], selectedStory());
    expect(fake.calls).toHaveLength(1);
  });
});

describe('runExtract with extractChunkWords: dropped claims and duplicates', () => {
  it('numbers the places of the dropped claims over all the parts, so that each is a place of its own, in the order of the replies', async () => {
    const bad = (i: number) => fact(i, { quote: `Not on the page ${i}.` });
    const { ctx } = setup(CHUNKED(400), { claims: [fact(0), bad(100), fact(1)] }, { claims: [bad(101), fact(4)] }, { claims: [fact(8), fact(9), bad(102), bad(103)] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5']);
    expect(result.artifact.dropped.map((item) => item.index)).toEqual([1, 3, 7, 8]);
    expect(new Set(result.artifact.dropped.map((item) => item.index)).size).toBe(4);
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['quote-not-found'], ['quote-not-found'], ['quote-not-found'], ['quote-not-found']]);
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
  });

  it('checks a claim of any part against the whole page, so that the rules are the same: a quotation that is on the page is kept, though the part did not hold it', async () => {
    // the model of the second part quotes a sentence of the first, which the page has
    const { ctx } = setup(CHUNKED(400), { claims: [fact(0)] }, { claims: [fact(5), fact(2, { text: 'Fixture Robotics ships batch 2 of FX-1 arms to depot 2.' })] }, { claims: [] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims.map((claim) => claim.text)).toEqual([sentence(0), sentence(5), sentence(2)]);
    expect(result.artifact.dropped).toEqual([]);
  });

  it('skips a claim whose quotation is at the same place in the page as a claim that an earlier part kept, does not count it as dropped, and logs how many', async () => {
    const { ctx, logs } = setup(CHUNKED(400), { claims: [fact(0), fact(1)] }, { claims: [fact(1), fact(4)] }, { claims: [fact(0, { text: 'Fixture Robotics ships batch 0 of FX-1 arms.', label: 'ships batch 0' }), fact(8)] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims.map((claim) => claim.text)).toEqual([sentence(0), sentence(1), sentence(4), sentence(8)]);
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4']);
    expect(result.artifact.dropped).toEqual([]);
    expect(logs.at(-1)).toBe('extract: 6 claims proposed, 4 kept, 0 dropped, 2 duplicates skipped');
  });

  it('says duplicate in the singular for one', async () => {
    const { ctx, logs } = setup(CHUNKED(400), { claims: [fact(0)] }, { claims: [fact(0), fact(4)] }, { claims: [fact(8)] });
    await runExtract(ctx, [LONG], selectedStory());
    expect(logs.at(-1)).toBe('extract: 4 claims proposed, 3 kept, 0 dropped, 1 duplicate skipped');
  });

  it('keeps every claim of one reply that quotes the same passage, as the stage does without parts, because one passage may serve more than one claim; only a part after the first can duplicate', async () => {
    const { ctx, logs } = setup(CHUNKED(400), { claims: [fact(0), fact(0, { text: 'Fixture Robotics ships batch 0 of FX-1 arms.', label: 'ships batch 0' })] }, { claims: [fact(4)] }, { claims: [] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims).toHaveLength(3);
    expect(result.artifact.claims[0]?.span).toEqual(result.artifact.claims[1]?.span);
    expect(logs.at(-1)).toBe('extract: 3 claims proposed, 3 kept, 0 dropped');
  });

  it('counts a claim that is dropped for a problem as dropped even when its quotation is where a kept claim is, and a duplicate only when it would have been kept', async () => {
    const { ctx, logs } = setup(CHUNKED(400), { claims: [fact(0)] }, { claims: [fact(0, { basis: 'filing' })] }, { claims: [] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.artifact.claims).toHaveLength(1);
    expect(result.artifact.dropped.map((item) => [item.index, item.reasons.map((reason) => reason.code)])).toEqual([[1, ['basis-not-allowed']]]);
    expect(logs.at(-1)).toBe('extract: 2 claims proposed, 1 kept, 1 dropped');
  });

  it('counts the labels cut to six words over all the parts', async () => {
    const long = (i: number) => fact(i, { label: `Fixture Robotics ships batch ${i} of FX-1` });
    const { ctx, logs } = setup(CHUNKED(400), { claims: [long(0)] }, { claims: [long(4), fact(5)] }, { claims: [long(8)] });
    await runExtract(ctx, [LONG], selectedStory());
    expect(logs.at(-1)).toBe('extract: 4 claims proposed, 4 kept, 0 dropped, 3 labels cut to 6 words');
  });

  it('says the labels that were cut before the duplicates that were skipped', async () => {
    const { ctx, logs } = setup(CHUNKED(400), { claims: [fact(0, { label: 'Fixture Robotics ships batch 0 of FX-1' })] }, { claims: [fact(0), fact(4)] }, { claims: [fact(8)] });
    await runExtract(ctx, [LONG], selectedStory());
    expect(logs.at(-1)).toBe('extract: 4 claims proposed, 3 kept, 0 dropped, 1 label cut to 6 words, 1 duplicate skipped');
  });

  it('ends with no-story when too few claims survive all the parts together, with the reason of the stage', async () => {
    const { ctx } = setup(CHUNKED(400), { claims: [fact(0)] }, { claims: [fact(4, { quote: 'Not on the page.' })] }, { claims: [] });
    const result = await runExtract(ctx, [LONG], selectedStory());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('1 of the 2 claims proposed survived the checks, and at least 3 are needed to write a piece');
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
  });
});

describe('runExtract with extractChunkWords: a page that is not a known kind of source', () => {
  it('is not read, in parts or whole, and when none is left no model is asked and the run ends with no story', async () => {
    const redirected: Snapshot = { ...LONG, finalUrl: 'https://elsewhere.example/landing' };
    const { ctx, fake, logs } = setup(CHUNKED(400), listing);
    const result = await runExtract(ctx, [redirected], selectedStory());
    expect(fake.calls).toEqual([]);
    expect(logs[0]).toBe(`extract: ${URLS.release} is not a known kind of source, so it is not read`);
    expect(result.ok).toBe(false);
    expect(result.artifact).toEqual({ date: ctx.date, claims: [], dropped: [] });
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
  });
});

describe('runExtract with extractChunkWords: a reply that is not valid ends the run', () => {
  it('fails with a schema error and writes nothing when a part is answered for a source that was not shown, though the parts before it were answered well', async () => {
    const { ctx, fake } = setup(CHUNKED(400), listing, { claims: [fact(4, { source: 2 })] }, listing);
    await expect(runExtract(ctx, [LONG], selectedStory())).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
    expect(fake.calls).toHaveLength(2);
    expect(existsSync(path.join(ctx.runDir, '04-extract.json'))).toBe(false);
  });

  it('fails, and asks for no more parts, when the model cannot be reached for one of them', async () => {
    const { ctx, fake } = setup(CHUNKED(400), listing, new ModelError('transport', 'the model cannot be reached', { retryable: false }), listing);
    await expect(runExtract(ctx, [LONG], selectedStory())).rejects.toMatchObject({ kind: 'transport' });
    expect(fake.calls).toHaveLength(2);
    expect(existsSync(path.join(ctx.runDir, '04-extract.json'))).toBe(false);
  });
});

describe('runExtract with extractChunkWords: more than one page', () => {
  // The release is short and the article of the outlet is long: the release is one call, as a page that is one part is, and the article is read in parts.
  const LONG_REPORT: Snapshot = { ...REPORT, text: pageOf(12) };
  const FRAME = 'The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.';
  const FROM_RELEASE = { text: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage.', label: 'existing conveyor frames', type: 'spec', quote: FRAME, values: [], basis: 'announcement', status: 'unspecified', source: 1 };
  const reported = listingWith({ basis: 'reported' });

  it('reads each page by itself, the first page first, with a block that is numbered 1 in every call, and gives every claim the source of its own page', async () => {
    expect(RELEASE.text).toContain(FRAME);
    const { ctx, fake } = setup(CHUNKED(400), { claims: [FROM_RELEASE] }, reported, reported, reported);
    const result = await runExtract(ctx, [RELEASE, LONG_REPORT], selectedStory());
    expect(fake.calls).toHaveLength(4);
    expect(fake.calls.map((call) => blocksOf(call.user).map((block) => block.id))).toEqual([['1'], ['1'], ['1'], ['1']]);
    expect(blocksOf(fake.calls[0]?.user ?? '')[0]?.text).toBe(RELEASE.text);
    expect(outsideBlocks(fake.calls[0]?.user ?? '')).toContain('The page has about');
    expect(fake.calls[0]?.system).toBe(extractSystem());
    expect(outsideBlocks(fake.calls[1]?.user ?? '')).toContain('Source 1 is a report by Mercer Wire (tier 2)');
    expect(outsideBlocks(fake.calls[1]?.user ?? '')).toContain('The text is part 1 of 3 of a page of about 1200 words');
    expect(fake.calls[1]?.system).toBe(extractSystem({ inParts: true }));
    expect(result.artifact.dropped).toEqual([]);
    expect(result.artifact.claims).toHaveLength(13);
    expect(result.artifact.claims[0]?.span.quote).toBe(FRAME);
    expect(result.artifact.claims[0]?.source.url).toBe(URLS.release);
    expect(result.artifact.claims.slice(1).map((claim) => [claim.source.url, claim.source.tier, claim.source.outlet])).toEqual(Array(12).fill([URLS.mercerArticle, 2, 'Mercer Wire']));
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(Array.from({ length: 13 }, (_, i) => `c-${i + 1}`));
  });

  it('finds the places of duplicates page by page: the same place in another page is another place', async () => {
    const twin: Snapshot = { ...REPORT, text: RELEASE.text };
    const { ctx, logs } = setup(CHUNKED(400), { claims: [FROM_RELEASE] }, { claims: [{ ...FROM_RELEASE, basis: 'reported' }] });
    const result = await runExtract(ctx, [RELEASE, twin], selectedStory());
    expect(result.artifact.claims).toHaveLength(2);
    expect(logs.at(-1)).toBe('extract: 2 claims proposed, 2 kept, 0 dropped');
  });
});
