import { fileURLToPath } from 'node:url';
import { CATEGORY_VOCAB, loadSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { hostKey } from '../src/fetch/url';
import { COMPANY_GROUP_BEATS, isTier1, sourceKind, tier1Hosts, tier1Newsrooms, tier2Feeds } from '../src/sources';
import { fixtureRegistry } from './support/registry';

// The registry says where the Desk reads and which sources it may write from. These helpers are the
// questions the stages ask of it. The rules are checked on a small registry made up for the tests, and
// the real sources.yml is checked for the properties that must hold for any version of it.

const realRegistry = () => loadSources(fileURLToPath(new URL('../../sources.yml', import.meta.url)));

describe('tier1Hosts', () => {
  it('is the hosts of the companies and of the standards bodies, without www., whatever the status of the entry', () => {
    expect(tier1Hosts(fixtureRegistry())).toEqual(
      new Set(['fixture-robotics.example', 'northwind-machines.example', 'brindle-logistics.example', 'quarry-robotics.example', 'hollis-dynamics.example', 'standards.example']),
    );
  });

  it('does not hold the host of an event, of a feed of another outlet, or of an entry that has no address', () => {
    const hosts = tier1Hosts(fixtureRegistry());
    for (const host of ['expo.example', 'mercer-wire.example', 'gantry-daily.example', 'old-feed.example']) expect(hosts.has(host)).toBe(false);
    expect(hosts.size).toBe(6);
  });
});

describe('tier2Feeds', () => {
  it('lists the feeds of other outlets in the order of the file, with their beats, and leaves out the blocked one', () => {
    expect(tier2Feeds(fixtureRegistry())).toEqual([
      { name: 'Mercer Wire', feed: 'https://mercer-wire.example/feed.xml', beats: ['payments-commerce', 'funding'], keywords: [] },
      { name: 'Gantry Daily', feed: 'https://gantry-daily.example/atom.xml', beats: ['agent-infrastructure'], keywords: [] },
    ]);
  });

  it('gives copies of the beats, so that a caller cannot change the registry', () => {
    const registry = fixtureRegistry();
    tier2Feeds(registry)[0]?.beats.push('policy-regulation');
    expect(registry.secondary[0]?.beats).toEqual(['payments-commerce', 'funding']);
  });
});

describe('tier1Newsrooms', () => {
  it('lists the companies newsrooms in the order of the file, with the beats of their group, and leaves out the blocked one', () => {
    expect(tier1Newsrooms(fixtureRegistry())).toEqual([
      { name: 'Fixture Robotics', url: 'https://fixture-robotics.example/news', beats: ['payments-commerce'] },
      { name: 'Northwind Machines', url: 'https://www.northwind-machines.example/press', beats: ['payments-commerce'] },
      { name: 'Brindle Logistics', url: 'https://brindle-logistics.example/news', beats: ['agent-infrastructure'] },
      { name: 'Hollis Dynamics', url: 'https://hollis-dynamics.example/blog', beats: ['protocols-standards'] },
    ]);
  });

  it('gives a company in a group that is no beat and has no mapping no beat, so that its stories are not selected', () => {
    const registry = fixtureRegistry();
    registry.primary.companies.exotic = [{ name: 'Exotic Co', url: 'https://exotic.example/news', status: 'unverified' }];
    expect(tier1Newsrooms(registry).find((room) => room.name === 'Exotic Co')?.beats).toEqual([]);
  });

  it('leaves out an entry that has no address, only a sentence that says where to look', () => {
    const registry = fixtureRegistry();
    registry.primary.companies['payments-commerce']?.push({ name: 'Somewhere', url: '(announced on its own site)', status: 'n/a' });
    expect(tier1Newsrooms(registry).map((room) => room.name)).not.toContain('Somewhere');
  });

  it('maps each group to beats of the vocabulary only', () => {
    for (const beats of Object.values(COMPANY_GROUP_BEATS)) for (const beat of beats) expect(CATEGORY_VOCAB as readonly string[]).toContain(beat);
  });
});

describe('sourceKind', () => {
  const CASES: [string, string, string][] = [
    // [what the case shows, the address, its kind]
    ['a page of a company in the registry', 'https://fixture-robotics.example/news/fx-1-second-plant', 'company-newsroom'],
    ['a page of a company, with www. and another case', 'https://WWW.Fixture-Robotics.example/x', 'company-newsroom'],
    ['a page of a company that the registry writes with www.', 'https://northwind-machines.example/press/a', 'company-newsroom'],
    ['a page of a company on another port', 'https://fixture-robotics.example:8443/x', 'company-newsroom'],
    ['a page of a company whose newsroom is blocked', 'https://quarry-robotics.example/news/a', 'company-newsroom'],
    ['a subdomain of a company is not the company until it is registered', 'https://blog.fixture-robotics.example/x', 'unknown'],
    ['a page of a standards body', 'https://standards.example/robotics/rule-1', 'standard'],
    ['a page of arXiv', 'https://arxiv.org/abs/0000.00000', 'arxiv'],
    ['a page of arXiv, on its export host', 'https://export.arxiv.org/abs/0000.00000', 'arxiv'],
    ['a name that ends like arXiv but is not', 'https://notarxiv.org/abs/1', 'unknown'],
    ['arXiv as the start of another host', 'https://arxiv.org.other.example/abs/1', 'unknown'],
    ['a filing of the SEC', 'https://www.sec.gov/Archives/edgar/data/1/a.htm', 'sec'],
    ['a page of the SEC on its search host', 'https://efts.sec.gov/LATEST/search-index?q=robotics', 'sec'],
    ['the SEC with no subdomain', 'https://sec.gov/a', 'sec'],
    ['a name that ends like the SEC but is not', 'https://fakesec.gov/a', 'unknown'],
    ['the SEC as the start of another host', 'https://sec.gov.other.example/a', 'unknown'],
    ['a page of another outlet', 'https://mercer-wire.example/robotics/a', 'tier2'],
    ['a page of another outlet, whose feed is on its host', 'https://gantry-daily.example/2026/10/a', 'tier2'],
    ['a page of an outlet whose feed is blocked', 'https://old-feed.example/a', 'tier2'],
    ['a page of an event, which is not a source to write from', 'https://expo.example/', 'unknown'],
    ['a host the registry does not know', 'https://random.example/a', 'unknown'],
    ['an address that is not http or https', 'ftp://fixture-robotics.example/a', 'unknown'],
    ['an address that is not an address', 'not a url', 'unknown'],
    ['an empty string', '', 'unknown'],
  ];

  it.each(CASES)('%s', (_name, address, kind) => {
    expect(sourceKind(address, fixtureRegistry())).toBe(kind);
  });

  it('never counts the host of an outlet as primary, even when the registry also lists it as a company', () => {
    const registry = fixtureRegistry();
    registry.primary.companies['payments-commerce']?.push({ name: 'Mercer Wire again', url: 'https://mercer-wire.example/news', status: 'unverified' });
    expect(sourceKind('https://mercer-wire.example/robotics/a', registry)).toBe('tier2');
    expect(isTier1('https://mercer-wire.example/robotics/a', registry)).toBe(false);
  });

  it('reads a registry with no companies and no outlets as knowing only arXiv, the SEC and the standards', () => {
    const registry = fixtureRegistry();
    registry.primary.companies = {};
    registry.secondary = [];
    expect(sourceKind('https://fixture-robotics.example/news/a', registry)).toBe('unknown');
    expect(sourceKind('https://arxiv.org/abs/1', registry)).toBe('arxiv');
  });
});

describe('isTier1', () => {
  it.each([
    ['https://fixture-robotics.example/news/a', true],
    ['https://arxiv.org/abs/0000.00000', true],
    ['https://www.sec.gov/Archives/a', true],
    ['https://standards.example/robotics/a', true],
    ['https://mercer-wire.example/robotics/a', false],
    ['https://expo.example/', false],
    ['https://random.example/', false],
    ['not a url', false],
  ])('says whether %s is a primary source: %s', (address, expected) => {
    expect(isTier1(address, fixtureRegistry())).toBe(expected);
  });
});

describe('the real sources.yml', () => {
  it('has newsrooms to read, each with an address, a name and a beat of the vocabulary', () => {
    const rooms = tier1Newsrooms(realRegistry());
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.url, room.name).toMatch(/^https?:\/\//);
      expect(room.name).not.toBe('');
      expect(room.beats.length, `${room.name} has a beat`).toBeGreaterThan(0);
      for (const beat of room.beats) expect(CATEGORY_VOCAB as readonly string[], room.name).toContain(beat);
    }
  });

  it('gives every group of companies at least one beat, so that no newsroom is read for nothing', () => {
    for (const group of Object.keys(realRegistry().primary.companies)) {
      const known = (CATEGORY_VOCAB as readonly string[]).includes(group) || group in COMPANY_GROUP_BEATS;
      expect(known, `the group "${group}" of companies has no beat: add it to COMPANY_GROUP_BEATS`).toBe(true);
    }
  });

  it('has feeds to read, all of them on https, and none that is blocked', () => {
    const registry = realRegistry();
    const feeds = tier2Feeds(registry);
    expect(feeds.length).toBe(registry.secondary.filter((entry) => entry.status !== 'blocked').length);
    expect(feeds.length).toBeGreaterThan(0);
    for (const feed of feeds) {
      expect(feed.feed, feed.name).toMatch(/^https:\/\//);
      expect(feed.beats.length, feed.name).toBeGreaterThan(0);
    }
  });

  it('reads the address of every newsroom as a company, and of every feed as another outlet', () => {
    const registry = realRegistry();
    for (const room of tier1Newsrooms(registry)) expect(sourceKind(room.url, registry), room.name).toBe('company-newsroom');
    for (const feed of tier2Feeds(registry)) expect(sourceKind(feed.feed, registry), feed.name).toBe('tier2');
  });

  it('keeps the hosts of the companies and of the outlets apart: no host is both', () => {
    const registry = realRegistry();
    const outlets = new Set(registry.secondary.map((entry) => hostKey(entry.feed)));
    for (const host of tier1Hosts(registry)) expect(outlets.has(host), host).toBe(false);
  });

  it('has the hosts of every company address among its tier-1 hosts', () => {
    const registry = realRegistry();
    const hosts = tier1Hosts(registry);
    expect(hosts.size).toBeGreaterThan(0);
    for (const entry of Object.values(registry.primary.companies).flat()) {
      const host = hostKey(entry.url);
      if (host !== null) expect(hosts.has(host), entry.name).toBe(true);
    }
  });

  it('does not take the entry that has no address for a source', () => {
    const registry = realRegistry();
    expect(tier1Hosts(registry).has('')).toBe(false);
    for (const host of tier1Hosts(registry)) expect(host, 'a host has a dot').toContain('.');
  });
});
