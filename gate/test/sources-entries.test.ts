import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SHARED_HOSTS } from '../src/constants';
import { addressParts, isBareSharedHost } from '../src/address';
import { parseSources } from '../src/sources';

const registry = (parts: { companies?: string; research?: string; standards?: string; secondary?: string }): string => `
primary:
  companies:${parts.companies ?? ' {}'}
  research:${parts.research ?? ' []'}
  standards:${parts.standards ?? ' []'}
  funding: []
  events: []
secondary:${parts.secondary ?? ' []'}
bar:
  publish_if_any: [A standard was published.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`;

const paths = (text: string): string[] => {
  try {
    parseSources(text);
  } catch (error) {
    if (error instanceof ZodError) return error.issues.map((issue) => issue.path.join('.'));
    throw error;
  }
  throw new Error('expected parseSources to throw');
};

describe('addressParts', () => {
  it('gives the host, without www., a port or a final dot, in lowercase, and the path', () => {
    expect(addressParts('https://WWW.Example.org.:8443/a/B')).toEqual({ host: 'example.org', path: '/a/B' });
    expect(addressParts('https://example.org')).toEqual({ host: 'example.org', path: '/' });
  });

  it('gives nothing for what is not an http or https address', () => {
    expect(addressParts('ftp://example.org/a')).toBeNull();
    expect(addressParts('(look on the site)')).toBeNull();
  });
});

describe('isBareSharedHost', () => {
  it('is true for a shared host with no path, with or without a slash, and false with a path', () => {
    expect(isBareSharedHost('https://github.com')).toBe(true);
    expect(isBareSharedHost('https://www.medium.com/')).toBe(true);
    expect(isBareSharedHost('https://github.com/coinbase/x402')).toBe(false);
    expect(isBareSharedHost('https://project.medium.com/')).toBe(false);
    expect(isBareSharedHost('https://example.org/')).toBe(false);
  });

  it('knows the hosts where many people publish', () => {
    for (const host of ['github.com', 'medium.com', 'substack.com', 'mirror.xyz', 'x.com']) expect(SHARED_HOSTS).toContain(host);
    for (const host of SHARED_HOSTS) expect(host).toBe(host.toLowerCase());
  });
});

describe('a primary entry', () => {
  const FULL = `
    protocols-standards:
      - { name: Ethereum Foundation blog, short: Ethereum Foundation, url: "https://blog.ethereum.org/", feed: "https://blog.ethereum.org/en/feed.xml", keywords: [agent, agents], beats: [protocols-standards], status: unverified }`;

  it('may have a short name, a feed, keywords and beats', () => {
    const parsed = parseSources(registry({ companies: FULL }));
    expect(parsed.primary.companies['protocols-standards']?.[0]).toMatchObject({ short: 'Ethereum Foundation', feed: 'https://blog.ethereum.org/en/feed.xml', keywords: ['agent', 'agents'] });
  });

  it('is refused with a key it does not know, an empty list of keywords, a feed that is not an address and a beat outside the vocabulary', () => {
    expect(paths(registry({ companies: FULL.replace('short:', 'shortt:') }))).toEqual(['primary.companies.protocols-standards.0']);
    expect(paths(registry({ companies: FULL.replace('[agent, agents]', '[]') }))).toEqual(['primary.companies.protocols-standards.0.keywords']);
    expect(paths(registry({ companies: FULL.replace('"https://blog.ethereum.org/en/feed.xml"', '"not an address"') }))).toEqual(['primary.companies.protocols-standards.0.feed']);
    expect(paths(registry({ companies: FULL.replace('[protocols-standards], status', '[quantum], status') }))).toEqual(['primary.companies.protocols-standards.0.beats.0']);
  });

  it('with a feed needs beats from somewhere: its own, or a group named for a beat', () => {
    const research = (beats: string) => `\n    - { name: ethresear.ch, url: "https://ethresear.ch/", feed: "https://ethresear.ch/latest.rss", ${beats}status: unverified }`;
    expect(() => parseSources(registry({ research: research('beats: [protocols-standards], ') }))).not.toThrow();
    expect(paths(registry({ research: research('') }))).toEqual(['primary.research.0.beats']);
    const company = (group: string, beats: string) => `\n    ${group}:\n      - { name: A, url: "https://a.example/", feed: "https://a.example/feed", ${beats}status: unverified }`;
    expect(() => parseSources(registry({ companies: company('wallets-keys', '') }))).not.toThrow();
    expect(paths(registry({ companies: company('misc', '') }))).toEqual(['primary.companies.misc.0.beats']);
    expect(() => parseSources(registry({ companies: company('misc', 'beats: [wallets-keys], ') }))).not.toThrow();
  });

  it('with no feed needs no beats', () => {
    const entry = `\n    misc:\n      - { name: A, url: "https://a.example/news", status: unverified }`;
    expect(() => parseSources(registry({ companies: entry }))).not.toThrow();
  });

  it('on a host where many people publish must name a path, and may name one', () => {
    const entry = (url: string) => `\n    - { name: x402, url: "${url}", status: unverified }`;
    expect(paths(registry({ standards: entry('https://github.com/') }))).toEqual(['primary.standards.0.url']);
    expect(paths(registry({ standards: entry('https://medium.com') }))).toEqual(['primary.standards.0.url']);
    expect(() => parseSources(registry({ standards: entry('https://github.com/coinbase/x402') }))).not.toThrow();
    expect(() => parseSources(registry({ standards: entry('https://project.medium.com/') }))).not.toThrow();
  });
});

describe('a secondary entry', () => {
  it('may have a short name and keywords, and no other new key', () => {
    const feed = (extra: string) => `\n  - { name: CoinDesk, feed: "https://www.coindesk.com/arc/outboundfeeds/rss", status: unverified, beats: [funding], ${extra} }`;
    expect(parseSources(registry({ secondary: feed('short: CoinDesk, keywords: [agent, AI]') })).secondary[0]).toMatchObject({ short: 'CoinDesk', keywords: ['agent', 'AI'] });
    expect(paths(registry({ secondary: feed('keywords: []') }))).toEqual(['secondary.0.keywords']);
  });
});
