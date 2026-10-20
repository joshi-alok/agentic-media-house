import { parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import { checkSources, formatSourceCheck } from '../../src/run/sources-check';
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

  it('lists the stories of an outlet that hold a keyword (all of them when it has none), newest first, whatever page they link to: an outlet does not link to a primary page', async () => {
    const lines = formatSourceCheck(await checkSources(REGISTRY, world()), { items: true });
    expect(lines.slice(6, 10)).toEqual([
      expect.stringMatching(/^ok +Mercer Wire +tier2 +feed: 3 items, 3 with a keyword, 0 on a primary page, newest 2026-10-04$/),
      "    2026-10-04  Fixture Robotics starts FX-1 deliveries to Brindle's second plant  https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant",
      '    2026-10-03  Northwind Handling raises $12 million for pallet-moving robots  https://mercer-wire.example/robotics/northwind-handling-raises-12-million',
      '    2026-09-28  Warehouse robot makers brace for new tariff rules & paperwork  https://mercer-wire.example/robotics/tariff-rules-and-paperwork',
    ]);
  });
});
