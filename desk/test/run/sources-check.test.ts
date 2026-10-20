import { parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import type { Fetcher } from '../../src/fetch/http';
import { LATEST_ITEMS, checkSources, formatSourceCheck } from '../../src/run/sources-check';
import type { CheckRow, SourceCheck } from '../../src/run/sources-check';
import { FETCHED_AT } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

const REGISTRY = parseSources(`
primary:
  companies:
    protocols-standards:
      - { name: Fixture Research, short: Fixture Research, url: "https://ethresear.ch/", feed: "https://ethresear.ch/latest.rss", keywords: [agent, agents], status: unverified }
      - { name: Closed feed, url: "https://closed.example/", feed: "https://closed.example/feed.xml", status: unverified }
      - { name: Not a feed, url: "https://notfeed.example/", feed: "https://notfeed.example/feed.xml", status: unverified }
      - { name: A page, url: "https://fixture-robotics.example/news", status: unverified }
      - { name: Skipped by status, url: "https://skip.example/", feed: "https://skip.example/feed.xml", status: blocked }
  research: []
  standards: []
  funding:
    - { name: Project announcement, url: "(look on the site)", status: n/a }
  events: []
secondary:
  - { name: Mercer Wire, feed: "https://mercer-wire.example/feed.xml", status: unverified, beats: [funding] }
bar:
  publish_if_any: [A thing.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`);

const world = () =>
  new FixtureFetcher(
    FIXTURE_DIR,
    {
      'https://ethresear.ch/latest.rss': 'feeds/ethresear.rss.xml',
      'https://closed.example/feed.xml': new FetchError('robots', 'https://closed.example/feed.xml', 'https://closed.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /feed.xml'),
      'https://notfeed.example/feed.xml': { file: 'feeds/not-a-feed.html', contentType: 'text/html' },
      'https://fixture-robotics.example/news': 'pages/fixture-robotics-news.html',
      'https://mercer-wire.example/feed.xml': 'feeds/mercer-wire.rss.xml',
    },
    () => FETCHED_AT,
  );

describe('checkSources', () => {
  it('checks every entry that has an address, the page or the feed, in the order of the file: companies, research, standards, then the outlets', async () => {
    const report = await checkSources(REGISTRY, world());
    expect(report.rows.map((row) => row.name)).toEqual(['Fixture Research', 'Closed feed', 'Not a feed', 'A page', 'Skipped by status', 'Mercer Wire']);
  });

  it('reads a feed: the items, the items that hold a keyword, the items that link to a primary page, and the newest date', async () => {
    const [row] = (await checkSources(REGISTRY, world())).rows;
    expect(row).toMatchObject({ name: 'Fixture Research', target: 'https://ethresear.ch/latest.rss', kind: 'company-newsroom', result: 'ok' });
    expect(row?.feed).toEqual({
      items: 3,
      filtered: true,
      matching: 2,
      primary: 2,
      newest: '2026-10-04T06:00:00.000Z',
      latest: [{ title: 'Agents that settle on chain', link: 'https://ethresear.ch/t/agents-that-settle-on-chain/9001', publishedAt: '2026-10-04T06:00:00.000Z' }],
    });
  });

  it('says why an address cannot be read: robots.txt, or that it is not a feed', async () => {
    const rows = (await checkSources(REGISTRY, world())).rows;
    expect(rows[1]).toMatchObject({ name: 'Closed feed', result: 'robots' });
    expect(rows[1]?.detail).toContain('robots.txt does not allow');
    expect(rows[2]).toMatchObject({ name: 'Not a feed', result: 'not-a-feed' });
  });

  it('reads a page as a page: it has text', async () => {
    const row = (await checkSources(REGISTRY, world())).rows[3];
    expect(row).toMatchObject({ name: 'A page', result: 'ok' });
    expect(row?.feed).toBeNull();
    expect(row?.detail).toMatch(/^page, \d+ characters of text$/);
  });

  it('does not fetch an entry whose status is blocked, and says so', async () => {
    const row = (await checkSources(REGISTRY, world())).rows[4];
    expect(row).toMatchObject({ name: 'Skipped by status', result: 'skipped', detail: 'its status is blocked' });
  });

  it('leaves out an entry that has no address, only a sentence', async () => {
    const names = (await checkSources(REGISTRY, world())).rows.map((row) => row.name);
    expect(names).not.toContain('Project announcement');
  });

  it('counts how many it could read, of how many it tried', async () => {
    const report = await checkSources(REGISTRY, world());
    expect(report.tried).toBe(5);
    expect(report.readable).toBe(3);
  });
});

describe('formatSourceCheck', () => {
  it('writes one line for each entry and a last line with the count', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()));
    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatch(/^ok +Fixture Research +company-newsroom +feed: 3 items, 2 with a keyword, 2 on a primary page, newest 2026-10-04$/);
    expect(lines[1]).toMatch(/^robots +Closed feed /);
    expect(lines.at(-1)).toBe('3 of 5 entries can be read; 1 was not tried');
  });

  it('with items, lists under a feed that was read its newest stories that hold a keyword and link to a primary page: the date, the title and the address', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()), { items: true });
    expect(lines).toHaveLength(11);
    expect(lines[1]).toBe('    2026-10-04  Agents that settle on chain  https://ethresear.ch/t/agents-that-settle-on-chain/9001');
  });

  it('lists the stories of an outlet that hold a keyword (all of them when it has none, and the line says that there is no filter), newest first, whatever page they link to: an outlet does not link to a primary page', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()), { items: true });
    expect(lines.slice(6, 10)).toEqual([
      expect.stringMatching(/^ok +Mercer Wire +tier2 +feed: 3 items, no keyword filter, 0 on a primary page, newest 2026-10-04$/),
      "    2026-10-04  Fixture Robotics starts FX-1 deliveries to Brindle's second plant  https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant",
      '    2026-10-03  Northwind Handling raises $12 million for pallet-moving robots  https://mercer-wire.example/robotics/northwind-handling-raises-12-million',
      '    2026-09-28  Warehouse robot makers brace for new tariff rules & paperwork  https://mercer-wire.example/robotics/tariff-rules-and-paperwork',
    ]);
  });
});

// The stories that `--items` lists are what a person chooses pages from, so which they are, in which order, and how many, is pinned with feeds that give the items out of order, with one that has no date,
// and with more than `LATEST_ITEMS` that qualify. The feeds are made here, with addresses that end in .example.
const STORIES = parseSources(`
primary:
  companies:
    protocols-standards:
      - { name: Alpha Lab, url: "https://alpha-lab.example/", feed: "https://alpha-lab.example/feed.xml", keywords: [agent], status: unverified }
      - { name: Open Lab, url: "https://open-lab.example/", feed: "https://open-lab.example/feed.xml", status: unverified }
  research: []
  standards: []
  funding: []
  events: []
secondary:
  - { name: Beta Wire, feed: "https://beta-wire.example/feed.xml", keywords: [agent], status: unverified, beats: [funding] }
bar:
  publish_if_any: [A thing.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`);

interface Story {
  title: string;
  link: string;
  date?: string;
}

const rss = (stories: Story[]): string =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>A feed</title>${stories
    .map((story) => `<item><title>${story.title}</title><link>${story.link}</link>${story.date === undefined ? '' : `<pubDate>${story.date}</pubDate>`}</item>`)
    .join('')}</channel></rss>`;

/** A fetcher that answers each address with a feed made from the stories it is given. */
function feeds(byAddress: Record<string, Story[]>): Fetcher {
  return {
    async get(url) {
      const stories = byAddress[url];
      if (stories === undefined) throw new FetchError('network', url, 'no feed is made for this address');
      return { url, finalUrl: url, status: 200, contentType: 'application/xml', body: rss(stories), retrievedAt: FETCHED_AT.toISOString() };
    },
  };
}

const ALPHA = 'https://alpha-lab.example/feed.xml';
const BETA = 'https://beta-wire.example/feed.xml';
const OPEN = 'https://open-lab.example/feed.xml';
const alpha = (path: string): string => `https://alpha-lab.example/p/${path}`;

describe('checkSources: the newest stories of a feed', () => {
  it('lists at most LATEST_ITEMS, the newest first, whatever the order of the feed, and never an undated story ahead of a dated one', async () => {
    expect(LATEST_ITEMS).toBe(3);
    const stories: Story[] = [
      { title: 'Agent undated', link: alpha('undated') },
      { title: 'Agent two', link: alpha('two'), date: '2026-10-02T06:00:00Z' },
      { title: 'Agent five', link: alpha('five'), date: '2026-10-05T06:00:00Z' },
      { title: 'Agent one', link: alpha('one'), date: '2026-10-01T06:00:00Z' },
      { title: 'Agent four', link: alpha('four'), date: '2026-10-04T06:00:00Z' },
      { title: 'Agent three', link: alpha('three'), date: '2026-10-03T06:00:00Z' },
    ];
    const row = (await checkSources(STORIES, feeds({ [ALPHA]: stories }))).rows[0];
    expect(row?.feed).toMatchObject({ items: 6, filtered: true, matching: 6, primary: 6, newest: '2026-10-05T06:00:00.000Z' });
    expect(row?.feed?.latest).toEqual([
      { title: 'Agent five', link: alpha('five'), publishedAt: '2026-10-05T06:00:00.000Z' },
      { title: 'Agent four', link: alpha('four'), publishedAt: '2026-10-04T06:00:00.000Z' },
      { title: 'Agent three', link: alpha('three'), publishedAt: '2026-10-03T06:00:00.000Z' },
    ]);
  });

  it('puts an undated story after the dated ones, and lists it when there are fewer than LATEST_ITEMS dated ones', async () => {
    const stories: Story[] = [
      { title: 'Agent undated', link: alpha('undated') },
      { title: 'Agent older', link: alpha('older'), date: '2026-10-01T06:00:00Z' },
      { title: 'Agent newer', link: alpha('newer'), date: '2026-10-02T06:00:00Z' },
    ];
    const row = (await checkSources(STORIES, feeds({ [ALPHA]: stories }))).rows[0];
    expect(row?.feed?.latest.map((story) => [story.title, story.publishedAt])).toEqual([
      ['Agent newer', '2026-10-02T06:00:00.000Z'],
      ['Agent older', '2026-10-01T06:00:00.000Z'],
      ['Agent undated', null],
    ]);
  });

  it('for a primary feed lists only the stories that hold a keyword and link to a primary page: a newer story that links elsewhere, or holds no keyword, is not listed', async () => {
    const stories: Story[] = [
      { title: 'Agent elsewhere newest', link: 'https://elsewhere.example/a', date: '2026-10-09T06:00:00Z' },
      { title: 'Agent elsewhere newer', link: 'https://elsewhere.example/b', date: '2026-10-08T06:00:00Z' },
      { title: 'Nothing about the topic', link: alpha('no-keyword'), date: '2026-10-07T06:00:00Z' },
      { title: 'Agent primary one', link: alpha('one'), date: '2026-10-01T06:00:00Z' },
      { title: 'Agent primary three', link: alpha('three'), date: '2026-10-03T06:00:00Z' },
      { title: 'Agent primary two', link: alpha('two'), date: '2026-10-02T06:00:00Z' },
      { title: 'Agent primary zero', link: alpha('zero'), date: '2026-09-30T06:00:00Z' },
    ];
    const row = (await checkSources(STORIES, feeds({ [ALPHA]: stories }))).rows[0];
    expect(row?.feed).toMatchObject({ items: 7, matching: 6, primary: 5 });
    expect(row?.feed?.latest.map((story) => story.title)).toEqual(['Agent primary three', 'Agent primary two', 'Agent primary one']);
  });

  it('for a primary feed that has no keywords lists the newest stories that link to a primary page, and says that it does not filter', async () => {
    const stories: Story[] = [
      { title: 'Elsewhere', link: 'https://elsewhere.example/a', date: '2026-10-09T06:00:00Z' },
      { title: 'Open one', link: 'https://open-lab.example/1', date: '2026-10-01T06:00:00Z' },
      { title: 'Open four', link: 'https://open-lab.example/4', date: '2026-10-04T06:00:00Z' },
      { title: 'Open two', link: 'https://open-lab.example/2', date: '2026-10-02T06:00:00Z' },
      { title: 'Open three', link: 'https://open-lab.example/3', date: '2026-10-03T06:00:00Z' },
    ];
    const report = await checkSources(STORIES, feeds({ [OPEN]: stories }));
    const open = report.rows.find((candidate) => candidate.name === 'Open Lab');
    expect(open?.feed).toMatchObject({ items: 5, filtered: false, matching: 5, primary: 4 });
    expect(open?.feed?.latest.map((story) => story.title)).toEqual(['Open four', 'Open three', 'Open two']);
    expect(formatSourceCheck(report).find((line) => line.includes('Open Lab'))).toMatch(/feed: 5 items, no keyword filter, 4 on a primary page, newest 2026-10-09$/);
  });

  it('for an outlet needs only the keyword: the stories need not link to a primary page, and the newest three that hold it are listed, newest first, with the undated one last', async () => {
    const stories: Story[] = [
      { title: 'Not about the topic, and the newest', link: 'https://beta-wire.example/x', date: '2026-10-09T06:00:00Z' },
      { title: 'Agent undated', link: 'https://beta-wire.example/undated' },
      { title: 'Agent b', link: 'https://beta-wire.example/b', date: '2026-10-02T06:00:00Z' },
      { title: 'Agent e', link: 'https://elsewhere.example/e', date: '2026-10-05T06:00:00Z' },
      { title: 'Agent a', link: alpha('a'), date: '2026-10-01T06:00:00Z' },
      { title: 'Agent d', link: 'https://beta-wire.example/d', date: '2026-10-04T06:00:00Z' },
      { title: 'Agent c', link: 'https://beta-wire.example/c', date: '2026-10-03T06:00:00Z' },
    ];
    const beta = (await checkSources(STORIES, feeds({ [BETA]: stories }))).rows.find((candidate) => candidate.name === 'Beta Wire');
    expect(beta?.feed).toMatchObject({ items: 7, filtered: true, matching: 6, primary: 1 });
    expect(beta?.feed?.latest.map((story) => story.title)).toEqual(['Agent e', 'Agent d', 'Agent c']);
  });
});

describe('formatSourceCheck: the lines', () => {
  const row = (over: Partial<CheckRow>): CheckRow => ({ name: 'Name', target: 'https://name.example/', kind: 'tier2', result: 'ok', detail: 'page, 10 characters of text', feed: null, ...over });
  const reportOf = (rows: CheckRow[]): SourceCheck => ({ rows, tried: rows.filter((candidate) => candidate.result !== 'skipped').length, readable: rows.filter((candidate) => candidate.result === 'ok').length });
  /** Where the name and the kind of a row start in its line. */
  const starts = (line: string, candidate: CheckRow): { name: number; kind: number } => {
    const name = line.indexOf(candidate.name);
    return { name, kind: line.indexOf(candidate.kind, name + candidate.name.length) };
  };

  it('keeps the columns apart when a result is as wide as the widest: not-a-feed is followed by a space', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()));
    expect(lines[2]).toMatch(/^not-a-feed Not a feed +company-newsroom /);
    expect(lines[0]).toMatch(/^ok {9}Fixture Research /);
  });

  it('keeps the columns apart when a name is 40 characters or longer, and starts each column at the same place in every line', () => {
    const long = 'The Institute for Agentic Payment Research';
    expect(long.length).toBeGreaterThanOrEqual(40);
    const rows = [row({ name: 'Short', kind: 'standard' }), row({ name: long, kind: 'company-newsroom' }), row({ name: 'Not a feed', result: 'not-a-feed', detail: 'it is not a feed' }), row({ name: 'Mid-size name here', kind: 'research', result: 'error' })];
    const lines = formatSourceCheck(reportOf(rows));
    const found = rows.map((candidate, at) => starts(lines[at] as string, candidate));
    expect(new Set(found.map((start) => start.name)).size).toBe(1);
    expect(new Set(found.map((start) => start.kind)).size).toBe(1);
    for (const [at, start] of found.entries()) {
      const line = lines[at] as string;
      expect(line.charAt(start.name - 1), line).toBe(' ');
      expect(line.charAt(start.kind - 1), line).toBe(' ');
    }
    expect(lines[1]).toMatch(new RegExp(`^ok +${long} +company-newsroom page, 10 characters of text$`));
  });

  it('does not widen the columns for a story, and lists the stories as before', () => {
    const feed = { items: 1, filtered: true, matching: 1, primary: 1, newest: '2026-10-04T06:00:00.000Z', latest: [{ title: 'A title', link: 'https://a.example/t', publishedAt: null }] };
    const lines = formatSourceCheck(reportOf([row({ name: 'A', kind: 'research', detail: 'feed, 1 items', feed })]), { items: true });
    expect(lines[0]).toBe('ok A research feed: 1 items, 1 with a keyword, 1 on a primary page, newest 2026-10-04');
    expect(lines[1]).toBe('    undated     A title  https://a.example/t');
  });

  it('prints no control character from a title, a name or a message: a feed cannot write escape codes to the terminal', () => {
    const escape = String.fromCharCode(27);
    const bell = String.fromCharCode(7);
    const del = String.fromCharCode(127);
    const feed = { items: 1, filtered: true, matching: 1, primary: 1, newest: null, latest: [{ title: `${escape}[31mRed${escape}[0m title${del}`, link: `https://a.example/${bell}t`, publishedAt: null }] };
    const rows = [row({ name: `Na${bell}me${escape}`, detail: 'feed, 1 items', feed }), row({ name: 'Other', result: 'error', detail: `it said${escape}[2J and stopped\nthen more` })];
    const lines = formatSourceCheck(reportOf(rows), { items: true });
    for (const line of lines) expect(line, line).not.toMatch(/[\u0000-\u0008\u000a-\u001f\u007f]/);
    expect(lines[0]).toMatch(/^ok +Name /);
    expect(lines[1]).toBe('    undated     [31mRed[0m title  https://a.example/t');
    expect(lines[2]).toContain('it said[2J and stoppedthen more');
  });

  it('ends a row that could not be read with the address that was tried, unless its detail starts with it', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()));
    // The message of a failed fetch starts with the address it tried, so it is not said twice; the message of a feed that cannot be read does not.
    expect(lines[1]).toMatch(/^robots +Closed feed .*: https:\/\/closed\.example\/robots\.txt does not allow AgenticMediaHouseDesk to fetch \/feed\.xml$/);
    expect(lines[1]?.match(/closed\.example\/feed\.xml/g)).toHaveLength(1);
    expect(lines[2]).toMatch(/^not-a-feed Not a feed .* {2}https:\/\/notfeed\.example\/feed\.xml$/);
    const own = row({ name: 'Gone', result: 'error', target: 'https://gone.example/f.xml', detail: 'https://gone.example/f.xml: the site answered with status 404' });
    const empty = row({ name: 'Empty', result: 'empty', target: 'https://empty.example/f.xml', detail: 'the feed has no items' });
    const lone = formatSourceCheck(reportOf([own, empty]));
    expect(lone[0]).toMatch(/status 404$/);
    expect(lone[1]).toMatch(/the feed has no items {2}https:\/\/empty\.example\/f\.xml$/);
  });

  it('does not add the address to a row that was read, or to one that was not tried', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()));
    expect(lines[3]).toMatch(/page, \d+ characters of text$/);
    expect(lines[4]).toMatch(/its status is blocked$/);
    expect(lines[0]).not.toContain('latest.rss');
  });

  it('says that there is no keyword filter for a feed whose entry has no keywords, and counts the items for one that has them', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()));
    expect(lines[0]).toContain('2 with a keyword');
    expect(lines[5]).toContain('no keyword filter');
    expect(lines[5]).not.toContain('with a keyword');
  });
});
