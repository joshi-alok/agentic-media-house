import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExtractError } from '../../src/fetch/extract-text';
import { FeedError } from '../../src/fetch/feeds';
import { FetchError } from '../../src/fetch/http';
import { canonicalUrl } from '../../src/fetch/url';
import { describeFailure, emptyPublished, isSourceFailure, loadPublishedIndex } from '../../src/stages/context';
import { useScratch } from '../support/context';

// What every stage is given, and what the stages share. The published index is read from the ledgers of
// the pieces; the ledgers of the fixture pieces of the site are the made-up ones that exist.

const scratch = useScratch();
const FIXTURE_LEDGERS = fileURLToPath(new URL('../../../site/src/content-fixtures/ledger/', import.meta.url));
const REAL_LEDGERS = fileURLToPath(new URL('../../../site/src/content/ledger/', import.meta.url));

describe('emptyPublished', () => {
  it('is nothing published, and a new object each time', () => {
    expect(emptyPublished()).toEqual({ slugs: [], titles: [], sourceUrls: [] });
    expect(emptyPublished()).not.toBe(emptyPublished());
    expect(emptyPublished().slugs).not.toBe(emptyPublished().slugs);
  });
});

describe('loadPublishedIndex', () => {
  it('reads the ledgers of the fixture pieces: their slugs, their titles with their days, and the addresses of their sources', async () => {
    const files = readdirSync(FIXTURE_LEDGERS)
      .filter((name) => name.endsWith('.json'))
      .sort();
    const index = await loadPublishedIndex(FIXTURE_LEDGERS);
    expect(files.length).toBeGreaterThan(0);
    expect(index.slugs).toEqual(files.map((name) => name.replace(/\.json$/, '')));
    expect(index.titles).toHaveLength(files.length);
    for (const entry of index.titles) {
      expect(entry.title).not.toBe('');
      expect(entry.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(index.sourceUrls).toContain('https://fixture-robotics.example/news/fx-1-second-plant');
  });

  it('lists each source address once, in its canonical form', async () => {
    const { sourceUrls } = await loadPublishedIndex(FIXTURE_LEDGERS);
    expect(new Set(sourceUrls).size).toBe(sourceUrls.length);
    for (const url of sourceUrls) expect(canonicalUrl(url)).toBe(url);
  });

  it('is empty for the folder of the site that holds no pieces yet, which holds only a placeholder file', async () => {
    expect(await loadPublishedIndex(REAL_LEDGERS)).toEqual(emptyPublished());
  });

  it('ignores files that are not ledgers', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, '.gitkeep'), '');
    writeFileSync(path.join(dir, 'notes.txt'), 'not a ledger');
    expect(await loadPublishedIndex(dir)).toEqual(emptyPublished());
  });

  it('refuses a folder that does not exist, because an index with nothing in it would let the Desk write a story twice', async () => {
    const missing = path.join(scratch(), 'nowhere');
    await expect(loadPublishedIndex(missing)).rejects.toThrow(`the ledger folder ${missing} does not exist`);
  });

  it('refuses a ledger that is not JSON, and one that is not a ledger, and names the file', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'broken.json'), '{"slug": ');
    await expect(loadPublishedIndex(dir)).rejects.toThrow('the ledger broken.json is not valid JSON');
    writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ slug: 'x' }));
    await expect(loadPublishedIndex(dir)).rejects.toThrow('the ledger broken.json is not valid: ');
  });

  it('refuses a folder when the path is a file', async () => {
    const dir = scratch();
    const file = path.join(dir, 'file.json');
    writeFileSync(file, '{}');
    await expect(loadPublishedIndex(file)).rejects.toThrow();
  });

  it('reads the ledgers in the order of their names', async () => {
    const { slugs } = await loadPublishedIndex(FIXTURE_LEDGERS);
    expect(slugs).toEqual([...slugs].sort());
  });

  it('counts only the ledgers that `keep` says yes to, and still refuses one that is not valid', async () => {
    const all = await loadPublishedIndex(FIXTURE_LEDGERS);
    const first = all.slugs[0] as string;
    const kept = await loadPublishedIndex(FIXTURE_LEDGERS, (entry) => entry.slug !== first);
    expect(kept.slugs).toEqual(all.slugs.slice(1));
    expect(kept.titles).toEqual(all.titles.slice(1));
    expect(await loadPublishedIndex(FIXTURE_LEDGERS, () => false)).toEqual(emptyPublished());
    const dir = scratch();
    writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ slug: 'x' }));
    await expect(loadPublishedIndex(dir, () => false)).rejects.toThrow('the ledger broken.json is not valid: ');
  });

  it('gives `keep` the whole ledger entry, so that it can read its run and its day', async () => {
    const seen: string[] = [];
    await loadPublishedIndex(FIXTURE_LEDGERS, (entry) => {
      seen.push(`${entry.runId} ${entry.publishedAt}`);
      return true;
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((line) => /^\S+ \d{4}-\d{2}-\d{2}$/.test(line))).toBe(true);
  });

  it('does not create the folder it is asked about', async () => {
    const dir = scratch();
    mkdirSync(path.join(dir, 'ledger'));
    await loadPublishedIndex(path.join(dir, 'ledger'));
    expect(readdirSync(dir)).toEqual(['ledger']);
  });
});

describe('loadPublishedIndex: the stories that are held', () => {
  const RUN_DAY = '2026-10-20';
  const hold = (at: string, extra: Record<string, string> = {}) => ({ at, categories: ['humanoids'], reasons: ['G10_NOT_ENTAILED'], ...extra });
  const story = { slug: 'a-held-piece', sourceUrl: 'https://mercer-wire.example/robotics/a-held-story' };

  it('counts a hold from yesterday: its slug is among the slugs and the address of its story among the addresses', async () => {
    const dir = scratch();
    const index = await loadPublishedIndex(dir, undefined, { holds: [hold('2026-10-19T04:31:00.000Z', story)], date: RUN_DAY });
    expect(index.slugs).toEqual(['a-held-piece']);
    expect(index.sourceUrls).toEqual(['https://mercer-wire.example/robotics/a-held-story']);
    expect(index.titles).toEqual([]);
  });

  it.each([
    ['on the day of the run', '2026-10-20T01:00:00.000Z', true],
    ['14 days before it, the last day of the window of the gate', '2026-10-06T23:59:59.000Z', true],
    ['15 days before it', '2026-10-05T23:59:59.000Z', false],
    ['the day after it', '2026-10-21T00:00:01.000Z', false],
    ['a year before it', '2025-10-20T04:31:00.000Z', false],
  ])('a hold recorded %s %s counted', async (_when, at, counted) => {
    const index = await loadPublishedIndex(scratch(), undefined, { holds: [hold(at, story)], date: RUN_DAY });
    expect(index.slugs).toEqual(counted ? ['a-held-piece'] : []);
    expect(index.sourceUrls).toEqual(counted ? ['https://mercer-wire.example/robotics/a-held-story'] : []);
  });

  it('is harmless for a hold that has neither a slug nor an address (one recorded before the desk state remembered them), whatever its age', async () => {
    const index = await loadPublishedIndex(scratch(), undefined, { holds: [hold('2026-10-19T04:31:00.000Z'), hold('2026-10-20T04:31:00.000Z')], date: RUN_DAY });
    expect(index).toEqual(emptyPublished());
  });

  it('counts a hold that has a slug and no address, and one that has an address and no slug, for what each has', async () => {
    const index = await loadPublishedIndex(scratch(), undefined, { holds: [hold('2026-10-19T04:31:00.000Z', { slug: 'only-a-slug' }), hold('2026-10-19T05:31:00.000Z', { sourceUrl: 'https://mercer-wire.example/only-an-address' })], date: RUN_DAY });
    expect(index.slugs).toEqual(['only-a-slug']);
    expect(index.sourceUrls).toEqual(['https://mercer-wire.example/only-an-address']);
  });

  it('keeps the address in its canonical form, as it keeps those of the ledgers, so that the candidate that Discover finds is recognised', async () => {
    const index = await loadPublishedIndex(scratch(), undefined, { holds: [hold('2026-10-19T04:31:00.000Z', { sourceUrl: 'https://Mercer-Wire.example/robotics/a-held-story#comments' })], date: RUN_DAY });
    expect(index.sourceUrls).toEqual([canonicalUrl('https://mercer-wire.example/robotics/a-held-story')]);
  });

  it('adds the holds to the published pieces and lists nothing twice, whether a hold shares its address or its slug with a piece or with another hold', async () => {
    const published = await loadPublishedIndex(FIXTURE_LEDGERS);
    const [slug] = published.slugs;
    const [address] = published.sourceUrls;
    const index = await loadPublishedIndex(FIXTURE_LEDGERS, undefined, {
      holds: [hold('2026-10-05T04:31:00.000Z', { slug: slug as string, sourceUrl: address as string }), hold('2026-10-05T05:31:00.000Z', story), hold('2026-10-05T06:31:00.000Z', story)],
      date: '2026-10-06',
    });
    expect(index.slugs).toEqual([...published.slugs, 'a-held-piece']);
    expect(index.sourceUrls).toEqual([...published.sourceUrls, 'https://mercer-wire.example/robotics/a-held-story']);
    expect(index.titles).toEqual(published.titles);
  });

  it('counts only the holds that were recorded before `before`, which is how a replay sees what there was when its run began and not the hold that the run made', async () => {
    const holds = [hold('2026-10-19T04:31:00.000Z', story), hold('2026-10-20T04:31:00.000Z', { slug: 'made-by-the-run', sourceUrl: 'https://mercer-wire.example/the-run' })];
    const index = await loadPublishedIndex(scratch(), undefined, { holds, date: RUN_DAY, before: '2026-10-20T04:31:00.000Z' });
    expect(index.slugs).toEqual(['a-held-piece']);
    expect(index.sourceUrls).toEqual(['https://mercer-wire.example/robotics/a-held-story']);
  });

  it('is what it was before, when it is given no holds, and when it is given none that count', async () => {
    expect(await loadPublishedIndex(FIXTURE_LEDGERS, undefined, { holds: [], date: '2026-10-06' })).toEqual(await loadPublishedIndex(FIXTURE_LEDGERS));
  });
});

describe('isSourceFailure and describeFailure', () => {
  const fetchError = new FetchError('status', 'https://a.example/x', 'answered 404', { status: 404 });
  const feedError = new FeedError('malformed', 'the feed is not well-formed XML: x');
  const extractError = new ExtractError('the page is nested more than 512 levels deep');

  it('counts a failure to fetch, to read a feed or to read a page as a failure of a source, and nothing else', () => {
    expect(isSourceFailure(fetchError)).toBe(true);
    expect(isSourceFailure(feedError)).toBe(true);
    expect(isSourceFailure(extractError)).toBe(true);
    expect(isSourceFailure(new Error('a bug'))).toBe(false);
    expect(isSourceFailure(new TypeError('a bug'))).toBe(false);
    expect(isSourceFailure('text')).toBe(false);
    expect(isSourceFailure(undefined)).toBe(false);
  });

  it('says what went wrong in a sentence', () => {
    expect(describeFailure(fetchError)).toBe('https://a.example/x: answered 404');
    expect(describeFailure(feedError)).toBe('the feed cannot be read: the feed is not well-formed XML: x');
    expect(describeFailure(extractError)).toBe('the page cannot be read: the page is nested more than 512 levels deep');
  });
});
