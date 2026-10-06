import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FetchError, FixtureFetcher, HttpFetcher } from '../../src/fetch/http';
import type { Fetcher } from '../../src/fetch/http';
import { DiscoverArtifact, candidateId, readArtifact } from '../../src/run/artifacts';
import { loadPublishedIndex } from '../../src/stages/context';
import { MAX_PER_SOURCE, MAX_TITLE_LENGTH, runDiscover } from '../../src/stages/discover';
import { RUN_DATE } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { publicLookup } from '../support/lookup';
import { fixtureRegistry, smallRegistry } from '../support/registry';
import { fileReply, scriptedTransport } from '../support/transport';

// Discover reads every newsroom and every feed of the registry and makes candidates of what it finds. These
// tests run it on the made-up world of desk/test/fixtures/: two outlets, a company with a newsroom, and the
// pages and feeds they serve. No model is called, and no test opens a connection.

const scratch = useScratch();
const FIXTURE_LEDGERS = fileURLToPath(new URL('../../../site/src/content-fixtures/ledger/', import.meta.url));

const ROOM = 'Fixture Robotics';
const roomStory = (slug: string, title: string, extra = {}) => {
  const url = `https://fixture-robotics.example/news/${slug}`;
  return { id: candidateId(url), title, url, outlet: ROOM, tier: 1, beats: ['humanoids'], origin: 'newsroom', ...extra };
};
const mercerStory = (url: string, title: string, publishedAt: string) => ({ id: candidateId(url), title, url, publishedAt, outlet: 'Mercer Wire', tier: 2, beats: ['humanoids', 'funding'], origin: 'feed' });

/** The world's map without one address. */
function without(...urls: string[]) {
  const map = worldMap();
  for (const url of urls) delete map[url];
  return map;
}

/** A feed of `count` items, each with a title and an address of its own. */
const bigFeed = (count: number): string =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${Array.from(
    { length: count },
    (_, index) => `<item><title>t${index}a t${index}b t${index}c t${index}d</title><link>https://mercer-wire.example/robotics/story-${index}</link></item>`,
  ).join('')}</channel></rss>`;

describe('runDiscover: the fixture world', () => {
  it('makes candidates of the headlines of the newsroom, undated, then of the items of each feed, dated, and drops the second report of a story', async () => {
    const { ctx } = stageContext(scratch);
    const artifact = await runDiscover(ctx);
    expect(artifact).toEqual({
      date: RUN_DATE,
      candidates: [
        roomStory('fx-1-second-plant', 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant'),
        roomStory('demo-day-2026', 'Fixture Robotics announces a demo day for warehouse customers'),
        roomStory('fx-1-datasheet-update', 'Updated FX-1 datasheet adds an IP54 rating'),
        mercerStory(URLS.mercerArticle, "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", '2026-10-04T09:15:00.000Z'),
        mercerStory('https://mercer-wire.example/robotics/northwind-handling-raises-12-million', 'Northwind Handling raises $12 million for pallet-moving robots', '2026-10-03T16:00:00.000Z'),
        mercerStory('https://mercer-wire.example/robotics/tariff-rules-and-paperwork', 'Warehouse robot makers brace for new tariff rules & paperwork', '2026-09-28T07:30:00.000Z'),
        {
          id: candidateId('https://gantry-daily.example/2026/10/brindle-opens-tarnmoor'),
          title: 'Brindle Logistics opens its second plant at Tarnmoor',
          url: 'https://gantry-daily.example/2026/10/brindle-opens-tarnmoor',
          publishedAt: '2026-10-02T18:45:00.000Z',
          outlet: 'Gantry Daily',
          tier: 2,
          beats: ['industrial-warehouse'],
          origin: 'feed',
        },
      ],
      skipped: [],
    });
  });

  it('gives a candidate from a newsroom no date at all, not even an empty one, and one from a feed its date', async () => {
    const { ctx } = stageContext(scratch);
    const { candidates } = await runDiscover(ctx);
    for (const candidate of candidates.filter((entry) => entry.origin === 'newsroom')) expect(Object.keys(candidate)).not.toContain('publishedAt');
    for (const candidate of candidates.filter((entry) => entry.origin === 'feed')) expect(Object.keys(candidate)).toContain('publishedAt');
  });

  it('says nothing about left-out items when a feed has none', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerFeed]: bigFeed(3), [URLS.gantryFeed]: bigFeed(3) }) });
    await runDiscover(ctx);
    expect(logs.filter((line) => line.includes('left out'))).toEqual([]);
  });

  it('does not make a candidate of a link that is not a story: a short text, the pager, another page of the site, another host', async () => {
    const { ctx } = stageContext(scratch);
    const urls = (await runDiscover(ctx)).candidates.map((candidate) => candidate.url);
    for (const left of ['/news?page=2', '/press-kit', '/about/leadership-team-and-board']) expect(urls).not.toContain(`https://fixture-robotics.example${left}`);
    expect(urls).not.toContain('https://brindle-logistics.example/news/second-plant-opens');
    expect(urls).not.toContain(URLS.newsroom);
  });

  it('writes what it returns to 01-discover.json, in the folder of the run', async () => {
    const { ctx } = stageContext(scratch);
    const artifact = await runDiscover(ctx);
    expect(await readArtifact(ctx.runDir, '01-discover', DiscoverArtifact)).toEqual(artifact);
  });

  it('logs what it left out: the items of a feed that had no link, and the second report of a story', async () => {
    const { ctx, logs } = stageContext(scratch);
    await runDiscover(ctx);
    expect(logs).toContain('discover: Mercer Wire: 1 item(s) with no title or no link were left out');
    expect(logs).toContain('discover: Gantry Daily: 1 item(s) with no title or no link were left out');
    expect(logs).toContain(
      `discover: ${JSON.stringify('Fixture Robotics starts FX-1 deliveries to second Brindle plant')} tells the story of ${JSON.stringify("Fixture Robotics starts FX-1 deliveries to Brindle's second plant")}, which was found first`,
    );
  });

  it('keeps the announcement of a company over the report of an outlet when both tell one story, because the newsroom is read first', async () => {
    const map = worldMap();
    const { ctx } = stageContext(scratch, {
      fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, map, () => FETCHED_AT), {
        [URLS.mercerFeed]:
          '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant</title><link>https://mercer-wire.example/robotics/same-story</link></item></channel></rss>',
      }),
    });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.map((candidate) => candidate.url)).toContain(URLS.release);
    expect(artifact.candidates.map((candidate) => candidate.url)).not.toContain('https://mercer-wire.example/robotics/same-story');
  });

  it('asks no model for anything', async () => {
    const { ctx, fake } = stageContext(scratch);
    await runDiscover(ctx);
    expect(fake.calls).toEqual([]);
  });

  it('does not fetch a source that the registry marks as blocked', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx } = stageContext(scratch, { fetcher, sources: fixtureRegistry() });
    await runDiscover(ctx);
    expect(fetcher.requests).not.toContain('https://old-feed.example/rss');
    expect(fetcher.requests).not.toContain('https://quarry-robotics.example/news');
    expect(fetcher.requests).toContain('https://www.northwind-machines.example/press');
  });
});

describe('runDiscover: a source that fails', () => {
  it('skips it, says why in the artifact and the log, and goes on with the others', async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, without(URLS.gantryFeed), () => FETCHED_AT) });
    const artifact = await runDiscover(ctx);
    expect(artifact.skipped).toEqual([{ source: 'Gantry Daily', reason: `${URLS.gantryFeed}: no fixture is registered for this address` }]);
    expect(logs).toContain(`discover: skipped Gantry Daily: ${URLS.gantryFeed}: no fixture is registered for this address`);
    expect(artifact.candidates.map((candidate) => candidate.outlet)).toEqual([ROOM, ROOM, ROOM, 'Mercer Wire', 'Mercer Wire', 'Mercer Wire']);
  });

  it('skips a feed that is not well-formed, and says that the feed cannot be read', async () => {
    const map = { ...worldMap(), [URLS.mercerFeed]: 'feeds/malformed.xml' };
    const { ctx } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, map, () => FETCHED_AT) });
    const artifact = await runDiscover(ctx);
    expect(artifact.skipped).toHaveLength(1);
    expect(artifact.skipped[0]?.source).toBe('Mercer Wire');
    expect(artifact.skipped[0]?.reason).toMatch(/^the feed cannot be read: the feed is not well-formed XML: /);
    // With the first report gone, the second report of the FX-1 story is the one that is kept.
    expect(artifact.candidates.map((candidate) => candidate.title)).toContain('Fixture Robotics starts FX-1 deliveries to second Brindle plant');
  });

  it('skips a page that is nested too deeply, and says that the page cannot be read', async () => {
    const deep = `<body>${'<div>'.repeat(600)}</body>`;
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.newsroom]: deep }) });
    const artifact = await runDiscover(ctx);
    expect(artifact.skipped).toEqual([{ source: ROOM, reason: 'the page cannot be read: the page is nested more than 512 levels deep' }]);
    expect(artifact.candidates.every((candidate) => candidate.tier === 2)).toBe(true);
  });

  it('skips a source that the fetcher was refused', async () => {
    const refusal = new FetchError('robots', URLS.gantryFeed, 'https://gantry-daily.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /atom.xml');
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.gantryFeed]: refusal }) });
    expect((await runDiscover(ctx)).skipped).toEqual([{ source: 'Gantry Daily', reason: refusal.message }]);
  });

  it('respects a robots.txt block end to end: the feed that the site forbids is never requested', async () => {
    const { transport, sent } = scriptedTransport({
      'https://fixture-robotics.example/robots.txt': { status: 404 },
      [URLS.newsroom]: fileReply('pages/fixture-robotics-news.html'),
      'https://mercer-wire.example/robots.txt': { type: 'text/plain', body: 'User-agent: *\nAllow: /' },
      [URLS.mercerFeed]: fileReply('feeds/mercer-wire.rss.xml'),
      'https://gantry-daily.example/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /atom.xml' },
      [URLS.gantryFeed]: fileReply('feeds/gantry-daily.atom.xml'),
    });
    const { ctx } = stageContext(scratch);
    const fetcher = new HttpFetcher({ userAgent: ctx.config.userAgent, maxBytes: ctx.config.maxBytes, requestIntervalMs: 0, transport, now: () => FETCHED_AT, lookup: publicLookup });
    const artifact = await runDiscover({ ...ctx, fetcher });
    expect(artifact.skipped).toEqual([
      { source: 'Gantry Daily', reason: `${URLS.gantryFeed}: https://gantry-daily.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /atom.xml` },
    ]);
    expect(sent.map((request) => request.url)).not.toContain(URLS.gantryFeed);
    expect(artifact.candidates).toHaveLength(6);
  });

  it('fails when every source fails, after it has written the artifact that says why', async () => {
    const { ctx } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    await expect(runDiscover(ctx)).rejects.toThrow(`discover: every source failed (3 of 3); the first: ${ROOM}: https://fixture-robotics.example/news: no fixture is registered for this address`);
    const written = await readArtifact(ctx.runDir, '01-discover', DiscoverArtifact);
    expect(written.candidates).toEqual([]);
    expect(written.skipped.map((entry) => entry.source)).toEqual([ROOM, 'Mercer Wire', 'Gantry Daily']);
  });

  it('does not fail when only some sources fail', async () => {
    const { ctx } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, { [URLS.mercerFeed]: 'feeds/mercer-wire.rss.xml' }, () => FETCHED_AT) });
    const artifact = await runDiscover(ctx);
    expect(artifact.skipped).toHaveLength(2);
    expect(artifact.candidates.length).toBeGreaterThan(0);
  });

  it('fails at once, and writes nothing, when the registry has nothing to read', async () => {
    const registry = smallRegistry();
    registry.primary.companies = {};
    registry.secondary = [];
    const { ctx } = stageContext(scratch, { sources: registry });
    await expect(runDiscover(ctx)).rejects.toThrow('discover: the registry has no newsroom or feed to read');
    expect(existsSync(ctx.runDir)).toBe(false);
  });

  it('does not hide a bug of the Desk as a failing source: any other error ends the run', async () => {
    const fetcher: Fetcher = {
      get: async () => {
        throw new TypeError('a bug in the fetcher');
      },
    };
    const { ctx } = stageContext(scratch, { fetcher });
    await expect(runDiscover(ctx)).rejects.toThrow(new TypeError('a bug in the fetcher'));
    expect(existsSync(ctx.runDir)).toBe(false);
  });
});

describe('runDiscover: stories that are not new', () => {
  it('drops a candidate whose address a published piece cites, and one whose title tells the story of a piece published in the last 14 days', async () => {
    const published = {
      slugs: [],
      titles: [{ title: 'Northwind Handling raises $12 million for pallet-moving robots', publishedAt: '2026-10-04' }],
      sourceUrls: ['https://fixture-robotics.example/news/demo-day-2026'],
    };
    const { ctx, logs } = stageContext(scratch, { published });
    const urls = (await runDiscover(ctx)).candidates.map((candidate) => candidate.url);
    expect(urls).not.toContain('https://fixture-robotics.example/news/demo-day-2026');
    expect(urls).not.toContain('https://mercer-wire.example/robotics/northwind-handling-raises-12-million');
    expect(urls).toHaveLength(5);
    expect(logs).toContain('discover: https://fixture-robotics.example/news/demo-day-2026 is already covered by a published piece');
    expect(logs).toContain('discover: https://mercer-wire.example/robotics/northwind-handling-raises-12-million is already covered by a published piece');
  });

  it('keeps a candidate whose title is like that of a piece published more than 14 days ago', async () => {
    const published = { slugs: [], titles: [{ title: 'Northwind Handling raises $12 million for pallet-moving robots', publishedAt: '2026-09-01' }], sourceUrls: [] };
    const { ctx } = stageContext(scratch, { published });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.url)).toContain('https://mercer-wire.example/robotics/northwind-handling-raises-12-million');
  });

  it('knows the pieces of the fixture ledgers: the release they cite is not a candidate again', async () => {
    const { ctx, logs } = stageContext(scratch, { published: await loadPublishedIndex(FIXTURE_LEDGERS) });
    const urls = (await runDiscover(ctx)).candidates.map((candidate) => candidate.url);
    expect(urls).not.toContain(URLS.release);
    expect(logs).toContain(`discover: ${URLS.release} is already covered by a published piece`);
  });

  it('keeps one candidate for an address that is found twice, and says so', async () => {
    const feed =
      '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>' +
      '<item><title>First alpha beta gamma</title><link>https://mercer-wire.example/robotics/same?utm_source=a</link></item>' +
      '<item><title>Second delta epsilon zeta</title><link>https://mercer-wire.example/robotics/same#top</link></item></channel></rss>';
    const { ctx, logs } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerFeed]: feed }) });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.filter((candidate) => candidate.url === 'https://mercer-wire.example/robotics/same').map((candidate) => candidate.title)).toEqual(['First alpha beta gamma']);
    expect(logs).toContain('discover: https://mercer-wire.example/robotics/same was found twice');
  });
});

describe('runDiscover: limits', () => {
  it(`keeps at most ${MAX_PER_SOURCE} candidates from one source, and says so`, async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerFeed]: bigFeed(250) }) });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.filter((candidate) => candidate.outlet === 'Mercer Wire')).toHaveLength(MAX_PER_SOURCE);
    expect(logs).toContain(`discover: Mercer Wire has 250 candidates, and only the first ${MAX_PER_SOURCE} are kept`);
  });

  it(`keeps all of a source that has exactly ${MAX_PER_SOURCE}, without a word about it`, async () => {
    const { ctx, logs } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerFeed]: bigFeed(MAX_PER_SOURCE) }) });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.filter((candidate) => candidate.outlet === 'Mercer Wire')).toHaveLength(MAX_PER_SOURCE);
    expect(logs.filter((line) => line.includes('are kept'))).toEqual([]);
  });

  it(`cuts a title to ${MAX_TITLE_LENGTH} characters`, async () => {
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>${'word '.repeat(200)}</title><link>https://mercer-wire.example/robotics/long</link></item></channel></rss>`;
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.mercerFeed]: feed }) });
    const long = (await runDiscover(ctx)).candidates.find((candidate) => candidate.url === 'https://mercer-wire.example/robotics/long');
    expect(long?.title).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe('runDiscover: which links of a newsroom are stories', () => {
  const rootRoom = (url: string) => {
    const registry = smallRegistry();
    registry.primary.companies = { humanoids: [{ name: ROOM, url, status: 'unverified' }] };
    registry.secondary = [];
    return registry;
  };
  const serving = (url: string) => new FixtureFetcher(FIXTURE_DIR, { [url]: 'pages/fixture-robotics-news.html' }, () => FETCHED_AT);

  it('takes any page of the site below the root, with a headline for a text, when the newsroom is the root of the site', async () => {
    const url = 'https://fixture-robotics.example/';
    const { ctx } = stageContext(scratch, { sources: rootRoom(url), fetcher: serving(url) });
    const urls = (await runDiscover(ctx)).candidates.map((candidate) => candidate.url);
    expect(urls).toEqual([
      'https://fixture-robotics.example/news/fx-1-second-plant',
      'https://fixture-robotics.example/news/demo-day-2026',
      'https://fixture-robotics.example/news/fx-1-datasheet-update',
      'https://fixture-robotics.example/about/leadership-team-and-board',
    ]);
  });

  it('takes the pages below the newsroom, and not the newsroom itself, when its address ends with a slash', async () => {
    const url = 'https://fixture-robotics.example/news/';
    const { ctx } = stageContext(scratch, { sources: rootRoom(url), fetcher: serving(url) });
    expect((await runDiscover(ctx)).candidates).toHaveLength(3);
  });

  it('takes the host of the newsroom with or without www.', async () => {
    const url = 'https://www.fixture-robotics.example/news';
    const { ctx } = stageContext(scratch, { sources: rootRoom(url), fetcher: serving(url) });
    expect((await runDiscover(ctx)).candidates).toHaveLength(3);
  });

  it('takes no page below another path: a path that only starts with the same letters is not below it', async () => {
    const html = '<main><a href="/newsletter/sign-up-for-the-weekly-update">Sign up for the weekly update</a><a href="/news/real-story-about-an-arm">A real story about an arm</a></main>';
    const url = 'https://fixture-robotics.example/news';
    const { ctx } = stageContext(scratch, { sources: rootRoom(url), fetcher: withPages(serving(url), { [url]: html }) });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.url)).toEqual(['https://fixture-robotics.example/news/real-story-about-an-arm']);
  });

  it('takes a link of exactly three words and not one of two', async () => {
    const html = '<main><a href="/news/two-words">Two words</a><a href="/news/three-words-here">Three words here</a></main>';
    const url = 'https://fixture-robotics.example/news';
    const { ctx } = stageContext(scratch, { sources: rootRoom(url), fetcher: withPages(serving(url), { [url]: html }) });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.title)).toEqual(['Three words here']);
  });
});
