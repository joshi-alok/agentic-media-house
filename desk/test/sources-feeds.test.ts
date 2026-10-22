import { addressParts, parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { hostKey } from '../src/fetch/url';
import { isTier1, outletName, sourceKind, tier1Feeds, tier1Hosts, tier1Newsrooms, tier2Feeds } from '../src/sources';

const REGISTRY = parseSources(`
primary:
  companies:
    protocols-standards:
      - { name: Ethereum Foundation blog, short: Ethereum Foundation, url: "https://blog.ethereum.org/", feed: "https://blog.ethereum.org/en/feed.xml", status: unverified }
    payments-commerce:
      - { name: Stripe blog, short: Stripe, url: "https://stripe.com/blog", feed: "https://stripe.com/blog/feed.rss", keywords: [stablecoin, agent, agents], status: unverified }
      - { name: Closed project, url: "https://closed.example/blog", feed: "https://closed.example/feed.xml", status: blocked }
      - { name: Newsroom only, url: "https://newsroom-only.example/news", status: unverified }
  research:
    - { name: arXiv cs.AI, short: arXiv, url: "https://arxiv.org/list/cs.AI/recent", feed: "https://rss.arxiv.org/rss/cs.AI", beats: [agent-infrastructure], keywords: [blockchain], status: unverified }
    - { name: ethresear.ch, url: "https://ethresear.ch/", feed: "https://ethresear.ch/latest.rss", beats: [protocols-standards], status: unverified }
  standards:
    - { name: EIPs, url: "https://eips.ethereum.org/", status: unverified }
    - { name: x402 repository, url: "https://github.com/coinbase/x402", status: unverified }
  funding: []
  events: []
secondary:
  - { name: CoinDesk, short: CoinDesk, feed: "https://www.coindesk.com/arc/outboundfeeds/rss", status: unverified, beats: [funding, payments-commerce], keywords: [agent, AI] }
  - { name: The Block, feed: "https://www.theblock.co/rss.xml", status: unverified, beats: [funding] }
bar:
  publish_if_any: [A standard was published.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`);

describe('outletName', () => {
  it('is the short name when there is one, and the name otherwise', () => {
    expect(outletName({ name: 'Ethereum Foundation blog', short: 'Ethereum Foundation' })).toBe('Ethereum Foundation');
    expect(outletName({ name: 'The Block' })).toBe('The Block');
  });
});

describe('tier1Feeds', () => {
  it('lists the entries that have a feed, in the order of the file (companies, then research, standards), not the blocked ones, with beats and keywords', () => {
    expect(tier1Feeds(REGISTRY)).toEqual([
      { name: 'Ethereum Foundation', feed: 'https://blog.ethereum.org/en/feed.xml', beats: ['protocols-standards'], keywords: [] },
      { name: 'Stripe', feed: 'https://stripe.com/blog/feed.rss', beats: ['payments-commerce'], keywords: ['stablecoin', 'agent', 'agents'] },
      { name: 'arXiv', feed: 'https://rss.arxiv.org/rss/cs.AI', beats: ['agent-infrastructure'], keywords: ['blockchain'] },
      { name: 'ethresear.ch', feed: 'https://ethresear.ch/latest.rss', beats: ['protocols-standards'], keywords: [] },
    ]);
  });

  it('lists the entries of funding and events that have a feed after the companies, the research and the standards, with the beats of the entry', () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.standards[0]!.feed = 'https://eips.ethereum.org/feed.xml';
    registry.primary.standards[0]!.beats = ['protocols-standards'];
    registry.primary.funding.push({ name: 'Funding wire', short: 'Funding', url: 'https://funding.example/', feed: 'https://funding.example/rss', beats: ['funding'], keywords: ['raises'], status: 'unverified' });
    registry.primary.events.push({ name: 'Summit', url: 'https://summit.example/', feed: 'https://summit.example/rss', beats: ['policy-regulation'], status: 'unverified' });
    registry.primary.events.push({ name: 'Summit, closed', url: 'https://closed-summit.example/', feed: 'https://closed-summit.example/rss', beats: ['policy-regulation'], status: 'blocked' });
    expect(tier1Feeds(registry).map((feed) => [feed.name, feed.beats])).toEqual([
      ['Ethereum Foundation', ['protocols-standards']],
      ['Stripe', ['payments-commerce']],
      ['arXiv', ['agent-infrastructure']],
      ['ethresear.ch', ['protocols-standards']],
      ['EIPs', ['protocols-standards']],
      ['Funding', ['funding']],
      ['Summit', ['policy-regulation']],
    ]);
    expect(tier1Feeds(registry).find((feed) => feed.name === 'Funding')?.keywords).toEqual(['raises']);
  });

  it('takes the beats of the entry before the beats of its group', () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.companies['payments-commerce']![0]!.beats = ['wallets-keys'];
    expect(tier1Feeds(registry).find((feed) => feed.name === 'Stripe')?.beats).toEqual(['wallets-keys']);
  });

  it('gives copies, so that a caller cannot change the registry', () => {
    tier1Feeds(REGISTRY)[1]?.keywords.push('x');
    expect(REGISTRY.primary.companies['payments-commerce']?.[0]?.keywords).toEqual(['stablecoin', 'agent', 'agents']);
  });
});

describe('tier1Newsrooms', () => {
  it('lists only the entries that have no feed, which Discover reads as pages, and not the blocked ones', () => {
    expect(tier1Newsrooms(REGISTRY)).toEqual([{ name: 'Newsroom only', url: 'https://newsroom-only.example/news', beats: ['payments-commerce'] }]);
  });
});

describe('tier2Feeds', () => {
  it('has the short name, the beats and the keywords (none for an outlet that has none)', () => {
    expect(tier2Feeds(REGISTRY)).toEqual([
      { name: 'CoinDesk', feed: 'https://www.coindesk.com/arc/outboundfeeds/rss', beats: ['funding', 'payments-commerce'], keywords: ['agent', 'AI'] },
      { name: 'The Block', feed: 'https://www.theblock.co/rss.xml', beats: ['funding'], keywords: [] },
    ]);
  });
});

describe('sourceKind', () => {
  it('knows a research page: the host of a research entry that is not arXiv', () => {
    expect(sourceKind('https://ethresear.ch/t/some-post/1234', REGISTRY)).toBe('research');
    expect(sourceKind('https://arxiv.org/abs/2610.00001', REGISTRY)).toBe('arxiv');
  });

  it('knows a company page by the host of its url, and the page of a standard by the host of its entry', () => {
    expect(sourceKind('https://blog.ethereum.org/2026/10/01/post', REGISTRY)).toBe('company-newsroom');
    expect(sourceKind('https://eips.ethereum.org/EIPS/eip-8004', REGISTRY)).toBe('standard');
  });

  it('does not make a host primary because a feed is there: only the url of an entry does', () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.companies['payments-commerce']![2]!.feed = 'https://feeds.example/newsroom.xml';
    expect(sourceKind('https://feeds.example/post', registry)).toBe('unknown');
  });

  it('follows a path on a host where many people publish: the repository named, and what is below it, and nothing else of that host', () => {
    for (const url of ['https://github.com/coinbase/x402', 'https://github.com/coinbase/x402/releases/tag/v2', 'https://github.com/Coinbase/X402/pull/1']) expect(sourceKind(url, REGISTRY), url).toBe('standard');
    for (const url of ['https://github.com/coinbase/x402-other', 'https://github.com/evil/x402', 'https://github.com/coinbase', 'https://github.com/']) expect(sourceKind(url, REGISTRY), url).toBe('unknown');
  });

  it('reads the path of an entry without regard to its case or a final slash, on any list that holds an entry', () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.standards[1]!.url = 'https://www.GitHub.com/Coinbase/X402/';
    registry.primary.research.push({ name: 'A paper repository', url: 'https://github.com/example-lab/papers', status: 'unverified' });
    expect(sourceKind('https://github.com/coinbase/x402/issues/1', registry)).toBe('standard');
    expect(sourceKind('https://github.com/coinbase/x402-other', registry)).toBe('unknown');
    expect(sourceKind('https://github.com/example-lab/papers/blob/main/a.md', registry)).toBe('research');
    expect(sourceKind('https://github.com/example-lab/papers-2', registry)).toBe('unknown');
  });

  it('does not make a whole shared host primary when a registry made by hand names it with no path', () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.standards[1]!.url = 'https://github.com/';
    registry.primary.research.push({ name: 'Medium', url: 'https://medium.com', status: 'unverified' });
    for (const url of ['https://github.com/coinbase/x402', 'https://github.com/evil/x402', 'https://medium.com/@someone/a-post']) expect(sourceKind(url, registry), url).toBe('unknown');
    expect(tier1Hosts(registry).has('github.com')).toBe(false);
    expect(tier1Hosts(registry).has('medium.com')).toBe(false);
  });

  it('puts the feed of another outlet first: an outlet is never a primary source', () => {
    expect(sourceKind('https://www.theblock.co/post/1', REGISTRY)).toBe('tier2');
  });

  it('counts research as a primary source', () => {
    expect(isTier1('https://ethresear.ch/t/x/1', REGISTRY)).toBe(true);
    expect(isTier1('https://github.com/evil/x402', REGISTRY)).toBe(false);
  });
});

describe('tier1Hosts', () => {
  it('holds the hosts of the companies, the research entries and the standards bodies that are not shared hosts', () => {
    expect(tier1Hosts(REGISTRY)).toEqual(new Set(['blog.ethereum.org', 'stripe.com', 'closed.example', 'newsroom-only.example', 'arxiv.org', 'ethresear.ch', 'eips.ethereum.org']));
  });
});

describe('the two ways to compute a host', () => {
  // `hostKey` (the Desk's fetch layer) and `addressParts` (the gate, which the schema and the path scopes use) must give one host for one address: the
  // registry is checked with the one and read with the other.
  const ADDRESSES = [
    'https://example.org/a',
    'https://Example.ORG/a',
    'https://example.org:8443/a',
    'https://www.example.org/a',
    'https://www.www.example.org/a',
    'https://example.org./a',
    'https://www.example.org.:8443/a',
    'https://user:secret@example.org/a',
    'https://user@www.Example.org:8443/a',
    'HTTPS://EXAMPLE.ORG/a',
    'http://example.org',
    'https://' + String.fromCharCode(0x00e9) + 'xample.org/a',
    'https://xn--xample-9ua.org/a',
    'https://[2001:db8::1]/a',
    'https://[2001:db8::1]:8443/a',
    'https://127.0.0.1:8080/a',
    'https://github.com/coinbase/x402',
    'ftp://example.org/a',
    'mailto:someone@example.org',
    '(look on the site)',
    '/a/path/only',
    '',
  ];

  it.each(ADDRESSES)('give the same host for %s', (address) => {
    expect(addressParts(address)?.host ?? null, address).toBe(hostKey(address));
  });
});

describe('the host of an address that is not an address', () => {
  it('is none for both ways', () => {
    for (const address of ['(look on the site)', '/a/path/only', 'ftp://example.org/a', '']) {
      expect(hostKey(address), address).toBeNull();
      expect(addressParts(address), address).toBeNull();
    }
  });
});
