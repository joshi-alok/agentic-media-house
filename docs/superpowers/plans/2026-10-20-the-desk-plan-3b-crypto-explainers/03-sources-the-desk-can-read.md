## Plan 3b (part 3) — Sources the Desk can really read

**Goal:** Discover finds stories where crypto people publish them, and Fetch can read what it finds. After this part the registry can hold primary feeds, short outlet names, keywords and GitHub repositories; Discover reads primary feeds (a standard's forum, a research feed, a project's blog) and filters every feed by keywords; the shortlist cannot be filled by one noisy source; Fetch reads plain text and markdown and cuts a very long page; `sources.yml` is the list for this domain; and `desk sources-check` says, for free, which entries the Desk can really read.

What a read-only check of the candidate feeds found on 2026-10-20, with the Desk's own `robots.txt` reader and user agent token (this is why the list in Task 12 is what it is):

| Reads fine | Closed or missing |
|---|---|
| `rss.arxiv.org/rss/cs.AI`, `cs.CR`, `cs.MA`; `ethresear.ch/latest.rss`; `ethereum-magicians.org/latest.rss`; `blog.ethereum.org/en/feed.xml` (the old address redirects); `eprint.iacr.org/rss/rss.xml`; `sec.gov/news/pressreleases.rss`; `cftc.gov/RSS/RSSGP/rssgp.xml`; `federalreserve.gov/feeds/press_all.xml`; `blog.cloudflare.com/rss/`; `stripe.com/blog/feed.rss`; `vitalik.eth.limo/feed.xml`; `a16zcrypto.com/feed.xml`; CoinDesk, Cointelegraph, Decrypt and The Block feeds; pages of `modelcontextprotocol.io`, `docs.x402.org`, `x402.org` | `github.com/.../releases.atom` (robots.txt); `thedefiant.io/api/feed` (robots.txt); `coinbase.com/blog/rss.xml` (403, a bot challenge); `fatf-gafi.org` (403); `eips.ethereum.org/all.atom` and `ercs.ethereum.org/all.atom` (404); `paradigm.xyz/feed.xml` (404); `blog.chain.link/feed/` (redirects to a page, no feed) |

| Task | What it does |
|---|---|
| 9 | The registry: `short`, `feed`, `keywords` and `beats` on a primary entry, `short` and `keywords` on a secondary one, a path for an address on a host that many people publish on; `tier1Feeds`; the new source kind `research`; kinds that follow paths. |
| 10 | Discover reads primary feeds and filters every feed by keywords; the shortlist takes at most `shortlistPerSource` stories from one source. |
| 11 | Fetch reads plain text and markdown, and cuts a page at `maxPageChars`. |
| 12 | The new `sources.yml`, its tests, the README paragraph. |
| 13 | `desk sources-check`: for each entry, fetched the way the Desk fetches, what it found; then the statuses of `sources.yml` are set to what was found. |

**Starting state:** Part 02 done; `npm run verify` green.

**Rules for every task in this part:** those of Part 01. The tasks use no key. Task 13 (Step 5 only) fetches public pages from the internet, at the pace of the settings, and needs a user agent that is not a placeholder (a file of settings, see the runbook).

---

### Task 9: A registry that holds primary feeds

**Files:**
- Create: `gate/src/address.ts`, `gate/test/sources-entries.test.ts`, `desk/test/sources-feeds.test.ts`
- Modify: `gate/src/constants.ts`, `gate/src/schemas.ts`, `gate/src/index.ts`, `desk/src/sources.ts` (rewritten), `desk/src/stages/claim-grounding.ts`, `desk/src/run/tune.ts`, `desk/test/sources.test.ts`

The shape of a registry entry after this task (all new fields optional):

```yaml
- name: Ethereum Foundation blog        # what the registry and the reports call it
  short: Ethereum Foundation            # what a sentence calls it (an outlet is named in a sentence; "Ethereum Foundation blog (Atom)" is not a name)
  url: "https://blog.ethereum.org/"     # a page of the source: where its pages are (a link below it is a page of the source)
  feed: "https://blog.ethereum.org/en/feed.xml"   # RSS or Atom, read by Discover instead of the page
  keywords: [agent, agents, agentic]    # an item is a candidate only if its title or summary has one of these words
  beats: [protocols-standards]          # the beats of the stories; the group of a company entry gives them when it is named for a beat
  status: unverified
```

A host that many people publish on (`github.com`, `medium.com`, `substack.com` and the rest of `SHARED_HOSTS`) is a source only below a path that the entry names: `https://github.com/coinbase/x402` makes the pages `github.com/coinbase/x402` and below it primary, and no other page of `github.com`. An entry on such a host with no path is refused by the schema. A `feed` address never makes its host primary: the pages of a source are where its `url` is.

- [ ] **Step 1: Write the failing tests**

`gate/test/sources-entries.test.ts`:

```ts
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
    expect(addressParts('https://WWW.Example.org:8443./a/B')).toEqual({ host: 'example.org', path: '/a/B' });
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
```

`desk/test/sources-feeds.test.ts`:

```ts
import { parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/gate -- test/sources-entries.test.ts` and `npm test --workspace @robywire/desk -- test/sources-feeds.test.ts`
Expected: FAIL (`../src/address` does not exist; `tier1Feeds` is not exported).

- [ ] **Step 3: The gate: constants, address helpers, schema**

`gate/src/constants.ts`, after `SOURCE_STATUSES`:

```ts
/**
 * Hosts where many different people publish. An address on one of them is the page of a project only below a path that `sources.yml` names
 * (`https://github.com/coinbase/x402`), never as a whole host: not every account on GitHub is the project.
 */
export const SHARED_HOSTS = [
  'github.com',
  'gist.github.com',
  'raw.githubusercontent.com',
  'medium.com',
  'mirror.xyz',
  'substack.com',
  'hackmd.io',
  'notion.site',
  'paragraph.xyz',
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'discord.com',
  't.me',
  'reddit.com',
  'linkedin.com',
  'facebook.com',
  'warpcast.com',
  'docs.google.com',
  'drive.google.com',
] as const;
```

`gate/src/address.ts`:

```ts
import { SHARED_HOSTS } from './constants';

/** The host and the path of an http or https address, or null for anything else. The host is in lowercase, without a port, a final dot or one leading `www.`. */
export function addressParts(address: string): { host: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return { host: url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, ''), path: url.pathname };
}

/** Is this the address of a host where many people publish (`SHARED_HOSTS`) with no path, which would make the whole host one source? */
export function isBareSharedHost(address: string): boolean {
  const parts = addressParts(address);
  return parts !== null && (SHARED_HOSTS as readonly string[]).includes(parts.host) && (parts.path === '' || parts.path === '/');
}
```

`gate/src/index.ts`: add `export * from './address';` (in the alphabetical place, first).

`gate/src/schemas.ts`: import `isBareSharedHost` from `./address`; replace `PrimaryEntry` and `SecondaryEntry` and `SourcesRegistry` (the section "sources.yml") with

```ts
// A tier-1 entry. The url must be a real http(s) URL unless the status is "n/a", where it may be a sentence (the funding "company announcement" entry).
// An entry may also have a `feed` (RSS or Atom), which Discover reads instead of the page, the `keywords` that an item of the feed must have one of, and
// its own `beats`; `short` is the name by which a sentence calls the source.
const PrimaryEntry = z
  .strictObject({
    name: text,
    short: text.optional(),
    url: text,
    feed: httpUrl.optional(),
    keywords: z.array(text).min(1).optional(),
    beats: z.array(z.enum(CATEGORY_VOCAB)).min(1).optional(),
    status: z.enum(SOURCE_STATUSES),
    note: text.optional(),
  })
  .refine((entry) => entry.status === 'n/a' || httpUrl.safeParse(entry.url).success, {
    message: 'url must be an http(s) URL unless status is n/a',
    path: ['url'],
  })
  .refine((entry) => !isBareSharedHost(entry.url), {
    message: 'an address on a host where many people publish (github.com, medium.com, ...) must name a path, such as https://github.com/owner/repo: the host alone is not one source',
    path: ['url'],
  });

// A tier-2 entry: used to discover stories, never to write from.
const SecondaryEntry = z.strictObject({
  name: text,
  short: text.optional(),
  feed: httpUrl,
  keywords: z.array(text).min(1).optional(),
  status: z.enum(SOURCE_STATUSES),
  beats: z.array(z.enum(CATEGORY_VOCAB)).min(1),
  note: text.optional(),
});

export const SourcesRegistry = z
  .strictObject({
    primary: z.strictObject({
      companies: z.record(text, z.array(PrimaryEntry)),
      research: z.array(PrimaryEntry),
      standards: z.array(PrimaryEntry),
      funding: z.array(PrimaryEntry),
      events: z.array(PrimaryEntry),
    }),
    secondary: z.array(SecondaryEntry),
    bar: z.strictObject({
      publish_if_any: z.array(text),
      do_not_publish: z.array(text),
      quiet_day_fallback: z.array(text),
    }),
  })
  .superRefine((registry, context) => {
    // A feed is read for stories, and a story with no beat is never selected: an entry with a feed has beats of its own or a group named for a beat.
    const needBeats = (entry: z.infer<typeof PrimaryEntry>, path: (string | number)[], groupIsBeat: boolean) => {
      if (entry.feed !== undefined && entry.beats === undefined && !groupIsBeat) {
        context.addIssue({ code: 'custom', path: [...path, 'beats'], message: 'an entry with a feed needs beats: its own, or a group of companies named for a beat' });
      }
    };
    for (const [group, entries] of Object.entries(registry.primary.companies)) {
      entries.forEach((entry, at) => needBeats(entry, ['primary', 'companies', group, at], (CATEGORY_VOCAB as readonly string[]).includes(group)));
    }
    for (const key of ['research', 'standards', 'funding', 'events'] as const) {
      registry.primary[key].forEach((entry, at) => needBeats(entry, ['primary', key, at], false));
    }
  });
export type SourcesRegistry = z.infer<typeof SourcesRegistry>;
```

(If `grep -rn "SourcesRegistry\." gate desk site evals` shows a use of `.shape`, `.extend` or `.partial` on the schema, stop and say so.)

- [ ] **Step 4: The desk: `desk/src/sources.ts`**

Replace the file with:

```ts
import { CATEGORY_VOCAB, SHARED_HOSTS, addressParts } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { hostKey } from './fetch/url';

// What the Desk reads from `sources.yml`, as the questions the stages ask: which feeds to poll, which newsrooms to read, and whether an address is a
// primary source. The registry is loaded and checked by `loadSources` of the gate package; these functions only read it.

type PrimaryEntry = SourcesRegistry['primary']['research'][number];

/** A newsroom to read for stories: the news page of a project or a company, for an entry that has no feed. */
export interface Newsroom {
  name: string;
  url: string;
  /** The beats of the entry, or of its group; empty when neither names one. */
  beats: string[];
}

/** A feed to read for stories. */
export interface Tier2Feed {
  name: string;
  feed: string;
  beats: string[];
  /** One of these words must be in the title or the summary of an item; empty: every item. */
  keywords: string[];
}

/** The feed of a primary source (a project's blog, a standards forum, a research feed), to read for stories that the Desk can write from at once. */
export interface PrimaryFeed {
  name: string;
  feed: string;
  beats: string[];
  keywords: string[];
}

/**
 * The name by which a sentence of a piece calls a source: `short` when the entry has one, else `name`. The registry names an entry in full ("IEEE Spectrum -
 * Robotics"); a reader is told "IEEE Spectrum".
 */
export const outletName = (entry: { name: string; short?: string }): string => entry.short ?? entry.name;

/**
 * The groups of companies in `sources.yml` that are not named for a beat, and the beats they stand for. The registry of the Desk names its groups for beats,
 * so this is empty there; the made-up world of the tests names two groups for a field.
 */
export const COMPANY_GROUP_BEATS: Readonly<Record<string, readonly string[]>> = {
  industrial: ['agent-infrastructure'],
  software: ['protocols-standards'],
};

function beatsOfGroup(group: string): string[] {
  if ((CATEGORY_VOCAB as readonly string[]).includes(group)) return [group];
  return [...(COMPANY_GROUP_BEATS[group] ?? [])];
}

/** The beats of an entry: its own, else those of its group. */
const beatsOf = (entry: PrimaryEntry, group: string | undefined): string[] => (entry.beats !== undefined ? [...entry.beats] : group === undefined ? [] : beatsOfGroup(group));

/** An address that is the address of a page, and not a sentence that says where to look (the `n/a` entries). */
const isAddress = (url: string): boolean => hostKey(url) !== null;

const withGroup = (registry: SourcesRegistry): { entry: PrimaryEntry; group: string | undefined }[] => [
  ...Object.entries(registry.primary.companies).flatMap(([group, entries]) => entries.map((entry) => ({ entry, group: group as string | undefined }))),
  ...(['research', 'standards', 'funding', 'events'] as const).flatMap((key) => registry.primary[key].map((entry) => ({ entry, group: undefined as string | undefined }))),
];

/**
 * The newsrooms to read as pages: every company entry that has no feed and whose address is an http or https address, except those whose status is
 * `blocked` (the Desk cannot read them), in the order of the file.
 */
export function tier1Newsrooms(registry: SourcesRegistry): Newsroom[] {
  return Object.entries(registry.primary.companies).flatMap(([group, entries]) =>
    entries
      .filter((entry) => entry.status !== 'blocked' && entry.feed === undefined && isAddress(entry.url))
      .map((entry) => ({ name: outletName(entry), url: entry.url, beats: beatsOf(entry, group) })),
  );
}

/**
 * The feeds of primary sources to read: every primary entry that has a feed, except those whose status is `blocked`, in the order of the file
 * (companies, research, standards, funding, events).
 */
export function tier1Feeds(registry: SourcesRegistry): PrimaryFeed[] {
  return withGroup(registry)
    .filter(({ entry }) => entry.status !== 'blocked' && entry.feed !== undefined)
    .map(({ entry, group }) => ({ name: outletName(entry), feed: entry.feed as string, beats: beatsOf(entry, group), keywords: [...(entry.keywords ?? [])] }));
}

/** The feeds of other outlets to read: every secondary source except those whose status is `blocked`, in the order of the file. */
export function tier2Feeds(registry: SourcesRegistry): Tier2Feed[] {
  return registry.secondary
    .filter((entry) => entry.status !== 'blocked')
    .map((entry) => ({ name: outletName(entry), feed: entry.feed, beats: [...entry.beats], keywords: [...(entry.keywords ?? [])] }));
}

/**
 * Where the pages of a source are: a whole host, or, for a host where many people publish (`SHARED_HOSTS`), a path and what is below it. The address of a feed is
 * not here: the pages of a source are where its `url` is, and a feed on another host says nothing about that host.
 */
interface Scope {
  host: string;
  prefix: string | undefined;
}

function scopeOf(url: string): Scope | null {
  const parts = addressParts(url);
  if (parts === null) return null;
  if (!(SHARED_HOSTS as readonly string[]).includes(parts.host)) return { host: parts.host, prefix: undefined };
  const prefix = parts.path.toLowerCase().replace(/\/+$/, '');
  // The whole of a shared host is never one source (the schema refuses the entry; a registry made by hand is not trusted either).
  return prefix === '' ? null : { host: parts.host, prefix };
}

const scopesOf = (entries: readonly { url: string }[]): Scope[] => entries.flatMap((entry) => {
  const scope = scopeOf(entry.url);
  return scope === null ? [] : [scope];
});

function inScopes(url: string, scopes: readonly Scope[]): boolean {
  const parts = addressParts(url);
  if (parts === null) return false;
  const path = parts.path.toLowerCase();
  return scopes.some((scope) => scope.host === parts.host && (scope.prefix === undefined || path === scope.prefix || path.startsWith(`${scope.prefix}/`)));
}

const companyEntries = (registry: SourcesRegistry) => Object.values(registry.primary.companies).flat();

/** The hosts (see `hostKey`) of the addresses of the companies, the research entries and the standards bodies in the registry, whatever their status, except hosts where many people publish. */
export function tier1Hosts(registry: SourcesRegistry): Set<string> {
  const scopes = scopesOf([...companyEntries(registry), ...registry.primary.research, ...registry.primary.standards]);
  return new Set(scopes.filter((scope) => scope.prefix === undefined).map((scope) => scope.host));
}

/** What kind of source an address is. Only the first five are primary sources. */
export type SourceKind = 'company-newsroom' | 'arxiv' | 'sec' | 'research' | 'standard' | 'tier2' | 'unknown';

const isHostOrSubdomain = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/**
 * What kind of source an address is, by its host (and, on a host where many people publish, its path). The rules, in this order, so that the first that applies decides:
 *
 * 1. `tier2`: the host of one of the feeds of other outlets in the registry. An outlet is never a primary source, even if the registry also lists its host as a company's by mistake.
 * 2. `arxiv`: `arxiv.org` or any subdomain of it.
 * 3. `sec`: `sec.gov` or any subdomain of it.
 * 4. `company-newsroom`: the address of a company or project entry in the registry (`url`).
 * 5. `research`: the address of an entry of the research list (a forum, an archive of papers).
 * 6. `standard`: the address of an entry of the standards list (a standards body, a regulator, an open protocol).
 * 7. `unknown`: anything else, including a subdomain of a registered host, an address that is not an http or https address, text that is not an address, and any page of a host
 *    where many people publish that the registry does not name by a path. `unknown` is never treated as a primary source.
 */
export function sourceKind(url: string, registry: SourcesRegistry): SourceKind {
  const host = hostKey(url);
  if (host === null) return 'unknown';
  if (registry.secondary.some((entry) => hostKey(entry.feed) === host)) return 'tier2';
  if (isHostOrSubdomain(host, 'arxiv.org')) return 'arxiv';
  if (isHostOrSubdomain(host, 'sec.gov')) return 'sec';
  if (inScopes(url, scopesOf(companyEntries(registry)))) return 'company-newsroom';
  if (inScopes(url, scopesOf(registry.primary.research))) return 'research';
  if (inScopes(url, scopesOf(registry.primary.standards))) return 'standard';
  return 'unknown';
}

/** Is this address a primary source (tier 1): a project's or a company's own page, an arXiv or SEC page, a research page, or a standards body's page? */
export function isTier1(url: string, registry: SourcesRegistry): boolean {
  const kind = sourceKind(url, registry);
  return kind === 'company-newsroom' || kind === 'arxiv' || kind === 'sec' || kind === 'research' || kind === 'standard';
}
```

- [ ] **Step 5: The kinds in the tables that are keyed by them**

`desk/src/stages/claim-grounding.ts`: the two tables become

```ts
export const ALLOWED_BASES: Readonly<Record<SourceKind, readonly Basis[]>> = {
  'company-newsroom': ['announcement', 'docs', 'briefing', 'demo'],
  arxiv: ['paper'],
  sec: ['filing'],
  research: ['paper', 'docs'],
  standard: ['standard', 'filing'],
  tier2: ['reported'],
  unknown: [],
};

/** The words for a kind of source in a message, for a reader and for a model. */
export const KIND_WORDS: Readonly<Record<SourceKind, string>> = {
  'company-newsroom': 'a project or company page',
  arxiv: 'an arXiv page',
  sec: 'an SEC page',
  research: 'a research page',
  standard: 'a page of a standards body, a regulator or an open protocol',
  tier2: 'another outlet',
  unknown: 'an unknown kind of page',
};
```

and the comment above `ALLOWED_BASES` gains: "A research page (a forum of proposals, an archive of papers) is a paper or the author's own documentation. A page of a standards body, a regulator or an open protocol is a standard, or, for a regulator's own statement, a filing."

`desk/src/run/tune.ts`: line 95 `const KINDS = [...]` and line 184 `TIERS` gain `'research'`: `KINDS = ['company-newsroom', 'arxiv', 'sec', 'research', 'standard', 'tier2', 'unknown']` and `TIERS` gets `research: 'tier 1'`.

- [ ] **Step 6: Run the new tests; fix the existing ones**

Run both new test files → PASS. Then `npm run typecheck && npm test`. **Rule R8:** `desk/test/sources.test.ts` expects `{ name, feed, beats }` from `tier2Feeds` and `{ name, url, beats }` from `tier1Newsrooms`: `tier2Feeds` now also has `keywords: []`; add it to the expectations. Tests that build a `Record<SourceKind, ...>` add `research`. Any other failure: stop and say which.

- [ ] **Step 7: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat: the source registry holds primary feeds, short names, keywords and beats, GitHub repositories by path, and a research kind of source" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Discover reads primary feeds

A project's blog, a standards forum and a research feed are primary sources that have feeds. Discover reads them as it reads another outlet's feed, and keeps an item only if it holds a keyword of its source and its link is a page of a primary source. A source that publishes a great deal (arXiv) can no longer fill the shortlist: Select takes at most `shortlistPerSource` stories from one source.

**Files:**
- Create: `desk/src/stages/keywords.ts`, `desk/test/stages/keywords.test.ts`, `desk/test/stages/discover-primary-feeds.test.ts`, `desk/test/fixtures/feeds/ethresear.rss.xml`, `desk/test/stages/select-quota.test.ts`
- Modify: `desk/src/stages/discover.ts`, `desk/src/stages/select.ts`, `desk/src/config.ts`, `desk/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

`desk/test/stages/keywords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchesKeywords, plainText } from '../../src/stages/keywords';

describe('matchesKeywords', () => {
  it('keeps everything when there are no keywords', () => {
    expect(matchesKeywords('anything at all', [])).toBe(true);
  });

  it('matches whole words or phrases, ignoring case', () => {
    expect(matchesKeywords('Agents that pay: x402 in practice', ['agents'])).toBe(true);
    expect(matchesKeywords('An AGENT pays', ['agent'])).toBe(true);
    expect(matchesKeywords('smart contract wallets', ['Smart Contract'])).toBe(true);
  });

  it('does not match a longer word or a part of one', () => {
    expect(matchesKeywords('A reagent in the lab', ['agent'])).toBe(false);
    expect(matchesKeywords('Agentic payments', ['agent'])).toBe(false);
    expect(matchesKeywords('said again', ['AI'])).toBe(false);
  });

  it('matches a keyword that has punctuation inside it', () => {
    expect(matchesKeywords('ERC-8004 registries', ['ERC-8004'])).toBe(true);
    expect(matchesKeywords('on-chain agents', ['on-chain'])).toBe(true);
  });

  it('is true if any one keyword matches', () => {
    expect(matchesKeywords('Stablecoins and wallets', ['agent', 'wallets'])).toBe(true);
    expect(matchesKeywords('Stablecoins and wallets', ['agent', 'bots'])).toBe(false);
  });
});

describe('plainText', () => {
  it('takes the tags out of a summary and folds white space', () => {
    expect(plainText('<p>Agents  <b>pay</b>\n now</p>')).toBe('Agents pay now');
    expect(plainText(undefined)).toBe('');
  });
});
```

`desk/test/fixtures/feeds/ethresear.rss.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Ethereum Research</title>
    <link>https://ethresear.ch/</link>
    <item>
      <title>Agents that settle on chain</title>
      <link>https://ethresear.ch/t/agents-that-settle-on-chain/9001</link>
      <pubDate>Sun, 04 Oct 2026 06:00:00 +0000</pubDate>
      <description>&lt;p&gt;A proposal for agent payments.&lt;/p&gt;</description>
    </item>
    <item>
      <title>Inclusion lists and proposer incentives</title>
      <link>https://ethresear.ch/t/inclusion-lists/9002</link>
      <pubDate>Sun, 04 Oct 2026 05:00:00 +0000</pubDate>
      <description>&lt;p&gt;Nothing about the topic.&lt;/p&gt;</description>
    </item>
    <item>
      <title>An agent post that links elsewhere</title>
      <link>https://elsewhere.example/t/agent-post</link>
      <pubDate>Sun, 04 Oct 2026 04:00:00 +0000</pubDate>
      <description>&lt;p&gt;agent&lt;/p&gt;</description>
    </item>
  </channel>
</rss>
```

`desk/test/stages/discover-primary-feeds.test.ts` (look at `desk/test/stages/discover.test.ts` for `stageContext` and `FixtureFetcher` usage; the fetcher here is built the same way):

```ts
import { parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { FixtureFetcher } from '../../src/fetch/http';
import { runDiscover } from '../../src/stages/discover';
import { FETCHED_AT, stageContext, useScratch } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

const scratch = useScratch();

const REGISTRY = parseSources(`
primary:
  companies: {}
  research:
    - { name: ethresear.ch, short: Ethereum Research, url: "https://ethresear.ch/", feed: "https://ethresear.ch/latest.rss", beats: [protocols-standards], keywords: [agent, agents], status: unverified }
  standards: []
  funding: []
  events: []
secondary: []
bar:
  publish_if_any: [A standard was published.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`);

const world = () => new FixtureFetcher(FIXTURE_DIR, { 'https://ethresear.ch/latest.rss': 'feeds/ethresear.rss.xml' }, () => FETCHED_AT);

describe('runDiscover: the feed of a primary source', () => {
  it('makes a tier-1 candidate of each item that holds a keyword and links to a page of the source, under the short name, with the beats of the entry', async () => {
    const { ctx } = stageContext(scratch, { sources: REGISTRY, fetcher: world() });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.map((candidate) => [candidate.title, candidate.tier, candidate.outlet, candidate.origin, candidate.beats])).toEqual([
      ['Agents that settle on chain', 1, 'Ethereum Research', 'feed', ['protocols-standards']],
    ]);
  });

  it('says in the log how many items had no keyword and how many linked to a page that is not the source', async () => {
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: world() });
    await runDiscover(ctx);
    expect(logs).toContain('discover: Ethereum Research: 1 item(s) held no keyword of the source and were left out');
    expect(logs).toContain('discover: Ethereum Research: 1 item(s) link to a page that is not a primary source and were left out');
  });

  it('keeps every item of a feed that has no keywords', async () => {
    const registry = structuredClone(REGISTRY);
    delete registry.primary.research[0]!.keywords;
    const { ctx } = stageContext(scratch, { sources: registry, fetcher: world() });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.map((candidate) => candidate.url)).toEqual([
      'https://ethresear.ch/t/agents-that-settle-on-chain/9001',
      'https://ethresear.ch/t/inclusion-lists/9002',
    ]);
  });

  it('skips a feed that cannot be read, and goes on', async () => {
    const { ctx } = stageContext(scratch, { sources: REGISTRY, fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    await expect(runDiscover(ctx)).rejects.toThrow('discover: every source failed (1 of 1)');
  });
});
```

(The last case relies on the fixture fetcher throwing for an address it does not know; `desk/test/stages/discover.test.ts` has a case that does the same: copy its expectation if the message differs.)

`desk/test/stages/select-quota.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { shortlistOf } from '../../src/stages/select';
import { RUN_DATE, candidate } from '../support/candidates';
import { emptyPublished } from '../../src/stages/context';

const ctx = (overrides: Partial<ReturnType<typeof defaultConfig>> = {}) => ({ date: RUN_DATE, config: { ...defaultConfig(), ...overrides }, published: emptyPublished() });
const from = (outlet: string, n: number) =>
  candidate({ url: `https://${outlet.toLowerCase().replace(/\W/g, '')}.example/p/${n}`, title: `${outlet} story ${n} about agents`, outlet, tier: 1, origin: 'feed', beats: ['protocols-standards'], publishedAt: `2026-10-04T0${9 - n}:00:00.000Z` });

describe('shortlistOf: the share of one source', () => {
  it('takes at most shortlistPerSource stories from one source, the newest first, and then the others', () => {
    const noisy = [1, 2, 3, 4, 5].map((n) => from('arXiv', n));
    const quiet = [from('Ethereum Research', 1)];
    const list = shortlistOf([...noisy, ...quiet], ctx({ shortlistPerSource: 2 }));
    // Newest first; the two stories of 08:00 keep the order in which they were found, and the third arXiv story is over the share.
    expect(list.map((item) => item.title)).toEqual(['arXiv story 1 about agents', 'Ethereum Research story 1 about agents', 'arXiv story 2 about agents']);
  });

  it('still stops at shortlistMax', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((outlet) => [1, 2].map((n) => from(outlet, n)));
    expect(shortlistOf(many, ctx({ shortlistPerSource: 2, shortlistMax: 5 }))).toHaveLength(5);
  });

  it('has 3 by default', () => {
    expect(defaultConfig().shortlistPerSource).toBe(3);
  });
});
```

(Read `desk/test/support/candidates.ts` for the `candidate()` helper's fields before writing: use its real parameter names; the call above assumes `candidate({ url, title, outlet, tier, origin, beats, publishedAt })`, which `fetch.test.ts` uses in the same way.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/stages/keywords.test.ts test/stages/discover-primary-feeds.test.ts test/stages/select-quota.test.ts`
Expected: FAIL (`../../src/stages/keywords` does not exist).

- [ ] **Step 3: Implement**

`desk/src/stages/keywords.ts`:

```ts
import { hasWholePhrase } from '@robywire/gate';

// The words by which a feed is narrowed to the beats of the publication. A feed such as arXiv or a trade outlet publishes mostly what the publication is not about,
// and a model that is shown every title spends its attention (and the shortlist) on them. An item is a candidate only if its title or its summary holds one of the keywords
// of its source, as a whole word or phrase: "agent" is not "reagent" and not "agents", so a source lists the forms it wants.

/** `text` with its tags taken out and its white space folded: a summary of a feed may hold HTML. */
export function plainText(text: string | undefined): string {
  return (text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Does `text` hold one of `keywords`? No keywords: yes, every item is kept. Case is ignored. */
export function matchesKeywords(text: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return true;
  const folded = text.toLowerCase().replace(/\s+/g, ' ');
  return keywords.some((keyword) => hasWholePhrase(folded, keyword.toLowerCase().replace(/\s+/g, ' ')));
}
```

`desk/src/stages/discover.ts`:
- imports: `import { DiscoverArtifact, candidateId, extractPage, hostKey, isTier1, parseFeed, tier1Feeds, tier1Newsrooms, tier2Feeds, writeArtifact } from '../index';`, `import type { Candidate, Newsroom, PageLink, PrimaryFeed, Tier2Feed } from '../index';` and `import { matchesKeywords, plainText } from './keywords';` (if `PrimaryFeed` or `isTier1` is not exported by `desk/src/index.ts`, it re-exports `./sources` with `export *`: check `grep -n "sources" desk/src/index.ts`).
- After the loop over newsrooms, add

```ts
  for (const feed of tier1Feeds(ctx.sources)) {
    await attempt(feed.name, () => readFeed(ctx, feed, 1));
  }
```

- and make the loop over `tier2Feeds` call `readFeed(ctx, feed, 2)`.
- Replace `readFeed` with

```ts
async function readFeed(ctx: StageContext, feed: Tier2Feed | PrimaryFeed, tier: 1 | 2): Promise<Candidate[]> {
  const page = await ctx.fetcher.get(feed.feed);
  const parsed = parseFeed(page.body);
  if (parsed.skipped > 0) ctx.log(`discover: ${feed.name}: ${parsed.skipped} item(s) with no title or no link were left out`);
  let offTopic = 0;
  let elsewhere = 0;
  const items = parsed.items.filter((item) => {
    if (!matchesKeywords(`${item.title} ${plainText(item.summary)}`, feed.keywords)) {
      offTopic++;
      return false;
    }
    // A primary feed is trusted for what it says it published, not for where it links: an item whose page is not a page of a primary source is not written from.
    if (tier === 1 && !isTier1(item.link, ctx.sources)) {
      elsewhere++;
      return false;
    }
    return true;
  });
  if (offTopic > 0) ctx.log(`discover: ${feed.name}: ${offTopic} item(s) held no keyword of the source and were left out`);
  if (elsewhere > 0) ctx.log(`discover: ${feed.name}: ${elsewhere} item(s) link to a page that is not a primary source and were left out`);
  return items.map((item) => candidateOf({ title: item.title, url: item.link, publishedAt: item.publishedAt, outlet: feed.name, tier, beats: feed.beats, origin: 'feed' }));
}
```

- Update the doc comment of `runDiscover` ("Newsrooms are read first, then the feeds of primary sources, then the feeds of other outlets, so that when a project's own post and an outlet's report of it tell the same story, the post is the one kept").

`desk/src/config.ts`: add after `shortlistMax`

```ts
  /** Select: the most stories that one source can have on the shortlist, so that a source that publishes a great deal cannot fill it. */
  shortlistPerSource: count,
```

and `shortlistPerSource: 3,` in `defaultConfig()`; `desk/test/config.test.ts` expected defaults gain it.

`desk/src/stages/select.ts`, in `shortlistOf`, replace the last line

```ts
  return kept.sort((a, b) => timeOf(b) - timeOf(a)).slice(0, ctx.config.shortlistMax);
```
with
```ts
  // At most `shortlistPerSource` from one source, so that a source that publishes a great deal cannot fill the shortlist.
  const taken = new Map<string, number>();
  const shortlist: Candidate[] = [];
  for (const candidate of kept.sort((a, b) => timeOf(b) - timeOf(a))) {
    const used = taken.get(candidate.outlet) ?? 0;
    if (used >= ctx.config.shortlistPerSource) continue;
    taken.set(candidate.outlet, used + 1);
    shortlist.push(candidate);
    if (shortlist.length === ctx.config.shortlistMax) break;
  }
  return shortlist;
```

and add to its doc comment "…and cut to `config.shortlistMax`, with at most `config.shortlistPerSource` from one source."

- [ ] **Step 4: Run the new tests, then the rest**

Run the three new files → PASS. Then `npm test --workspace @robywire/desk`. **Rule R9:** a test of Select or Discover that has more than `shortlistPerSource` (3) candidates from one outlet and expects them all on the shortlist, sets `shortlistPerSource` high in its config (`{ ...defaultConfig(), shortlistPerSource: 99 }`); it is not about the quota.

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): Discover reads the feeds of primary sources and narrows every feed by keywords, and one source cannot fill the shortlist" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Fetch reads plain text and markdown, and cuts a long page

Documentation, proposals and READMEs are served as plain text or markdown, which `extractPage` (an HTML reader) treats as a page with no structure. And a page can be longer than the budget of a run: the Extract call gets the whole text, and a 400-page specification would end the run on the budget. Fetch now reads plain text and markdown as text, and cuts a text at `maxPageChars` (150,000 characters, about 37,000 tokens) at the last paragraph before the limit, records that it did, and stores the cut text, so that the evidence is what Extract read.

**Files:**
- Create: `desk/src/fetch/read-page.ts`, `desk/test/fetch/read-page.test.ts`, `desk/test/stages/fetch-text.test.ts`, `desk/test/fixtures/pages/sample-proposal.md`
- Modify: `desk/src/stages/fetch.ts`, `desk/src/config.ts`, `desk/src/run/artifacts.ts` (`FetchDocument`), `desk/src/index.ts` (export), `desk/src/stages/select.ts` (`findTier1` uses `readPage`), `desk/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

`desk/test/fixtures/pages/sample-proposal.md`:

```markdown
# ERC-0000: Agent payment registry

Status: Draft

## Abstract

This proposal defines a registry in which an agent publishes the address that accepts its payments.
See [the discussion](https://ethereum-magicians.org/t/agent-payment-registry/9999) and [the reference code](/code/registry).

## Specification

The registry MUST store one address for each agent identifier.
```

`desk/test/fetch/read-page.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cutText, readPage } from '../../src/fetch/read-page';

const page = (contentType: string, body: string, finalUrl = 'https://eips.example/ercs/erc-0000.md') => ({ contentType, body, finalUrl });

describe('readPage: html', () => {
  it('reads html as the Desk always has', () => {
    const read = readPage(page('text/html; charset=utf-8', '<html><head><title>A page</title></head><body><article><p>Some text of the page.</p></article></body></html>', 'https://a.example/x'));
    expect(read.title).toBe('A page');
    expect(read.text).toContain('Some text of the page.');
  });
});

describe('readPage: plain text and markdown', () => {
  const body = ['# ERC-0000: Agent payment registry', '', '', '', 'Status: Draft   ', 'See [the discussion](https://ethereum-magicians.org/t/x/1) and [the code](/code/registry).', ''].join('\r\n');

  it.each(['text/plain', 'text/markdown; charset=utf-8', 'text/x-markdown'])('reads %s as text', (contentType) => {
    const read = readPage(page(contentType, body));
    expect(read.title).toBe('ERC-0000: Agent payment registry');
    expect(read.text).toBe(['# ERC-0000: Agent payment registry', '', 'Status: Draft', 'See [the discussion](https://ethereum-magicians.org/t/x/1) and [the code](/code/registry).'].join('\n'));
  });

  it('reads the links of markdown, resolved against the address of the page, each once', () => {
    const read = readPage(page('text/markdown', `${body}\nAgain [the discussion](https://ethereum-magicians.org/t/x/1).`));
    expect(read.links).toEqual([
      { url: 'https://ethereum-magicians.org/t/x/1', text: 'the discussion' },
      { url: 'https://eips.example/code/registry', text: 'the code' },
    ]);
  });

  it('has no date: a text does not say when it was published', () => {
    expect(readPage(page('text/plain', 'Just text.')).publishedAt).toBeUndefined();
  });

  it('takes the first line as the title when there is no heading, at most 200 characters', () => {
    expect(readPage(page('text/plain', 'A first line\nsecond line')).title).toBe('A first line');
    expect(readPage(page('text/plain', 'x'.repeat(500))).title).toHaveLength(200);
  });

  it('is empty for an empty text', () => {
    expect(readPage(page('text/plain', '  \n ')).text).toBe('');
  });
});

describe('cutText', () => {
  it('leaves a text that fits, and says it was not cut', () => {
    expect(cutText('One.\n\nTwo.', 100)).toEqual({ text: 'One.\n\nTwo.', cut: false });
  });

  it('cuts at the last paragraph before the limit', () => {
    expect(cutText('One.\n\nTwo two.\n\nThree three three.', 20)).toEqual({ text: 'One.\n\nTwo two.', cut: true });
  });

  it('cuts at the last space when there is no paragraph break, and at the limit when there is no space', () => {
    expect(cutText('aaa bbb ccc ddd', 9)).toEqual({ text: 'aaa bbb', cut: true });
    expect(cutText('abcdefghij', 5)).toEqual({ text: 'abcde', cut: true });
  });

  it('keeps a whole character: it does not cut a surrogate pair in two', () => {
    const cut = cutText('ab\u{1F600}cd', 3);
    expect(cut.cut).toBe(true);
    expect(cut.text).toBe('ab');
  });
});
```

`desk/test/stages/fetch-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { FixtureFetcher } from '../../src/fetch/http';
import { sha256Hex } from '../../src/model/types';
import { runFetch } from '../../src/stages/fetch';
import type { SelectArtifact } from '../../src/run/artifacts';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, stageContext, useScratch } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

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
    expect(result.artifact.documents[0]).toMatchObject({ truncated: true, bytes: Buffer.byteLength(text, 'utf8'), hash: sha256Hex(text) });
    expect(logs.some((line) => line.startsWith(`fetch: ${URL} is longer than 60 characters and was cut to`))).toBe(true);
  });

  it('records nothing about cutting for a page that fits', async () => {
    const { ctx } = stageContext(scratch, { fetcher: world({ [URL]: 'pages/sample-proposal.md' }) });
    const result = await runFetch(ctx, selected);
    expect(result.ok && 'truncated' in result.artifact.documents[0]!).toBe(false);
  });

  it('has 150000 characters by default', () => {
    expect(defaultConfig().maxPageChars).toBe(150_000);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/fetch/read-page.test.ts test/stages/fetch-text.test.ts`
Expected: FAIL (`../../src/fetch/read-page` does not exist).

- [ ] **Step 3: Implement**

`desk/src/fetch/read-page.ts`:

```ts
import { extractPage } from './extract-text';
import type { ExtractedPage, PageLink } from './extract-text';
import { canonicalUrl } from './url';

// A page is read according to what the server says it is: html through the html reader, and plain text and markdown as text. The fetcher already refuses
// every other type. Documentation, proposals and READMEs are often served as markdown, which an html reader would take for a page without structure.

/** The longest title, in characters, that a text gives itself. */
const TITLE_MAX = 200;

const MARKDOWN_LINK = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** The links of a markdown text, resolved against the address of the page, each address once, in the order of the text. */
function markdownLinks(text: string, base: string): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const url = canonicalUrl(match[2] as string, base);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, text: (match[1] as string).trim() });
  }
  return links;
}

/** A text as the Desk keeps it: lines end with a line feed, no line ends with a space, and no more than one empty line stands between two blocks. */
function tidy(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const mediaTypeOf = (contentType: string): string => contentType.split(';')[0]!.trim().toLowerCase();

/** Read a page: html through `extractPage`, plain text and markdown as text with a title, links and no date. */
export function readPage(page: { contentType: string; body: string; finalUrl: string }): ExtractedPage {
  const type = mediaTypeOf(page.contentType);
  if (type !== 'text/plain' && type !== 'text/markdown' && type !== 'text/x-markdown') return extractPage(page.body, page.finalUrl);
  const text = tidy(page.body);
  const heading = /^#{1,6}\s+(.+)$/m.exec(text);
  const first = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const title = (heading?.[1] ?? first).trim().slice(0, TITLE_MAX);
  return { title, text, links: markdownLinks(text, page.finalUrl) };
}

/**
 * `text`, cut to at most `limit` characters at the last paragraph break before the limit, else at the last space, else at the limit (never inside a character
 * of two code units). `cut` says whether it was cut.
 */
export function cutText(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false };
  let end = limit;
  // Do not end between the two halves of a character that is written with two code units.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  const head = text.slice(0, end);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > 0) return { text: head.slice(0, paragraph).trimEnd(), cut: true };
  const space = head.lastIndexOf(' ');
  if (space > 0) return { text: head.slice(0, space).trimEnd(), cut: true };
  return { text: head, cut: true };
}
```

`desk/src/index.ts`: add `export * from './fetch/read-page';` beside the other `./fetch/*` exports.

`desk/src/config.ts`: add after `maxBytes`

```ts
  /** Fetch: the most characters of one page that go on to be read. A longer text is cut at a paragraph and the artifact says so. */
  maxPageChars: count,
```

and `maxPageChars: 150_000,` in `defaultConfig()` (and in the expected defaults of `desk/test/config.test.ts`).

`desk/src/run/artifacts.ts`, `FetchDocument`: add after `title`

```ts
  /** True only when the text was cut at `maxPageChars`: what was stored and read is the beginning of the page. */
  truncated: z.literal(true).optional(),
```

`desk/src/stages/fetch.ts`: import `cutText, readPage` from `'../fetch/read-page'` (through `'../index'` as the other imports do), replace `const { title, text, publishedAt } = extractPage(page.body, page.finalUrl);` by

```ts
      const read = readPage(page);
      const { title, publishedAt } = read;
      const { text, cut } = cutText(read.text, ctx.config.maxPageChars);
      if (cut) ctx.log(`fetch: ${target.url} is longer than ${ctx.config.maxPageChars} characters and was cut to ${text.length}`);
```

and add `...(cut ? { truncated: true as const } : {}),` to the `FetchDocument` object. Update the stage's doc comment ("The text is extracted once, by `readPage`, ... and is cut at `maxPageChars`"). `extractPage` stays imported in `fetch.ts` only if still used (remove the import if not).

`desk/src/stages/select.ts`, `findTier1`: replace `extractPage(page.body, page.finalUrl).links` with `readPage(page).links` (and the import).

- [ ] **Step 4: Run the new tests, then everything; commit**

```bash
npm test --workspace @robywire/desk -- test/fetch/read-page.test.ts test/stages/fetch-text.test.ts
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): Fetch reads plain text and markdown as text and cuts a page at maxPageChars, and says so" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green. If a test of `FetchDocument` with `toEqual` fails, the page it fetched was cut: raise `maxPageChars` in its config.

---

### Task 12: The sources of the domain

**Files:**
- Modify: `sources.yml` (rewritten), `gate/test/sources.test.ts`, `README.md` (the paragraph at line 29 and the tier paragraph), `desk/test/runbook.test.ts` (only if it fails)
- Create: nothing

The registry says where the Desk reads. The list below is a **starter list**: the sources that were checked on 2026-10-20 (see the table at the top of this part), with the protocols and standards that agents in crypto are built on. The owner adds the projects, exchanges and wallets they know (a block at the end of the file is kept for them). The wording of the editorial bar is the Desk's brief to the model that chooses the story.

- [ ] **Step 1: Write the failing tests**

Replace the `describe('the real sources.yml', ...)` block of `gate/test/sources.test.ts` (everything from its first line to the line before `const MINIMAL`) with:

```ts
describe('the real sources.yml', () => {
  it('parses and validates', () => {
    expect(() => load()).not.toThrow();
  });

  it('says what it is: the source list of the daily desk, with the name of the publication and none of the name before it', () => {
    const text = readFileSync(SOURCES_PATH, 'utf8');
    expect(text).toContain('# Agentic Media House — source list for the daily desk');
    expect(text).not.toMatch(/robywire/i);
  });

  it('has only the four statuses there are, and keeps the n/a of the announcement of a round', () => {
    const statuses = new Set(everyStatus(load()));
    for (const status of statuses) expect(['verified', 'unverified', 'blocked', 'n/a']).toContain(status);
    expect(statuses).toContain('n/a');
  });

  it('is described truthfully by the README: it names each status the file has', () => {
    const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');
    const line = readme.split('\n').find((text) => text.startsWith('Every `status`'));
    expect(line, 'the README sentence about the statuses').toBeDefined();
    for (const status of new Set(everyStatus(load()))) expect(line, status).toContain(`\`${status}\``);
  });

  it('lists primary feeds for research, a forum of proposals and the blogs of projects, each with beats of its own or of its group', () => {
    const { primary } = load();
    const feeds = [...Object.values(primary.companies).flat(), ...primary.research, ...primary.standards].filter((entry) => entry.feed !== undefined);
    expect(feeds.length).toBeGreaterThanOrEqual(10);
    for (const entry of feeds) expect(entry.feed, entry.name).toMatch(/^https:\/\//);
  });

  it('narrows a feed that is mostly about something else by keywords: every arXiv entry and every trade outlet has them', () => {
    const registry = load();
    for (const entry of registry.primary.research.filter((candidate) => /arxiv/i.test(candidate.name))) expect(entry.keywords?.length, entry.name).toBeGreaterThan(0);
    for (const entry of registry.secondary) expect(entry.keywords?.length, entry.name).toBeGreaterThan(0);
  });

  it('gives every entry that a sentence will name a short name that has no dash and no feed word in it', () => {
    const registry = load();
    const named = [...Object.values(registry.primary.companies).flat(), ...registry.primary.research, ...registry.primary.standards, ...registry.secondary].filter((entry) => entry.short !== undefined);
    expect(named.length).toBeGreaterThan(5);
    for (const entry of named) expect(entry.short, entry.name).not.toMatch(/—|–| - |\b(rss|atom|feed)\b/i);
  });

  it('gives every secondary source an https feed and beats from the vocabulary', () => {
    const { secondary } = load();
    expect(secondary.length).toBeGreaterThanOrEqual(4);
    for (const entry of secondary) {
      expect(entry.feed, entry.name).toMatch(/^https:\/\//);
      expect(entry.beats.length, entry.name).toBeGreaterThan(0);
      for (const beat of entry.beats) expect(CATEGORY_VOCAB, entry.name).toContain(beat);
    }
  });

  it('marks as blocked, with the reason, the sources that the check of 2026-10-20 found closed to the Desk', () => {
    const all = [...Object.values(load().primary.companies).flat(), ...load().primary.research, ...load().primary.standards, ...load().secondary];
    for (const name of ['Coinbase blog', 'The Defiant']) {
      const entry = all.find((candidate) => candidate.name === name);
      expect(entry?.status, name).toBe('blocked');
      expect(entry?.note, name).toMatch(/robots\.txt|403/);
    }
  });

  it('never makes a whole host where many people publish one source', () => {
    const { primary } = load();
    for (const entry of [...Object.values(primary.companies).flat(), ...primary.research, ...primary.standards]) expect(isBareSharedHost(entry.url), entry.name).toBe(false);
  });

  it('carries the editorial bar for explainers: no price, no market move, no token to buy', () => {
    const { bar } = load();
    expect(bar.publish_if_any.length).toBeGreaterThan(0);
    expect(bar.quiet_day_fallback.length).toBeGreaterThan(0);
    expect(bar.do_not_publish.join(' ')).toMatch(/price/i);
  });
});
```

and fix the imports at the top of that file: add `isBareSharedHost` to the import from `'../src/address'`; delete the test `lists at least five humanoid companies` and `marks the arXiv research entry blocked` (they are replaced above). The `MINIMAL` registry below it keeps working (its group is now `payments-commerce` after Task 6).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/gate -- test/sources.test.ts`
Expected: FAIL (the file still lists the robots).

- [ ] **Step 3: Write `sources.yml`**

Replace the whole file with the following. Keep the first comment line exactly (the test of the name reads it; the dash is U+2014).

```yaml
# Agentic Media House — source list for the daily desk
#
# The Desk's source registry, checked by gate/src/sources.ts (loadSources) and gate/test/sources.test.ts.
#
# Status values:
#   verified   = fetched by the Desk (desk sources-check) and confirmed readable
#   unverified = plausible address, not yet checked
#   blocked    = the Desk cannot read it (robots.txt, an answer of 403, no feed); the note says why
#   n/a        = no fixed address (the entry says where to look instead)
#
# Two tiers, and the distinction is the whole editorial model:
#
#   TIER 1 (primary)   — what we WRITE FROM. A project's own post or documentation, a standard or a
#                        proposal, a paper, a regulator's statement, a filing.
#   TIER 2 (secondary) — what we use to DISCOVER. Other outlets' feeds tell us something happened.
#                        They are never the source of a claim, and never what we paraphrase.
#
# Entry fields: name (what this file and the reports call it), short (what a sentence calls it),
# url (a page of the source: where its pages are), feed (RSS or Atom, read instead of the page),
# keywords (an item of a feed is a candidate only if its title or summary has one of these words,
# whole words, so "agent" is not "agents"), beats (the beats of its stories, when the group is not a beat).
# An address on a host where many people publish (github.com, medium.com, substack.com, ...) names a path.
#
# House rule: discover in tier 2 or in a primary feed, write from tier 1. A story whose primary page
# cannot be reached is not written.

# ---------------------------------------------------------------------------
# TIER 1 — PRIMARY
# ---------------------------------------------------------------------------

primary:

  # Projects and companies that publish in public. Groups are named for beats.
  companies:
    payments-commerce:
      - name: Stripe blog
        short: Stripe
        url: "https://stripe.com/blog"
        feed: "https://stripe.com/blog/feed.rss"
        keywords: [stablecoin, stablecoins, agent, agents, agentic, USDC, crypto, x402]
        status: unverified
      - name: Coinbase blog
        short: Coinbase
        url: "https://www.coinbase.com/blog"
        feed: "https://www.coinbase.com/blog/rss.xml"
        beats: [payments-commerce, wallets-keys]
        status: blocked
        note: Answers 403 with a bot challenge (checked 2026-10-20). Needs another route; the Desk does not work around it.
    protocols-standards:
      - name: Ethereum Foundation blog
        short: Ethereum Foundation
        url: "https://blog.ethereum.org/"
        feed: "https://blog.ethereum.org/en/feed.xml"
        status: unverified
      - name: Vitalik Buterin's blog
        short: Vitalik Buterin's blog
        url: "https://vitalik.eth.limo/"
        feed: "https://vitalik.eth.limo/feed.xml"
        status: unverified
      - name: a16z crypto
        short: a16z crypto
        url: "https://a16zcrypto.com/"
        feed: "https://a16zcrypto.com/feed.xml"
        beats: [protocols-standards, agent-infrastructure, policy-regulation]
        keywords: [agent, agents, agentic, AI, x402, stablecoin, stablecoins]
        status: unverified
    agent-infrastructure:
      - name: Cloudflare blog
        short: Cloudflare
        url: "https://blog.cloudflare.com/"
        feed: "https://blog.cloudflare.com/rss/"
        beats: [agent-infrastructure, payments-commerce]
        keywords: [agent, agents, agentic, x402, stablecoin, stablecoins, crypto, blockchain]
        status: unverified
      - name: Chainlink blog
        short: Chainlink
        url: "https://chain.link/blog"
        status: unverified
        note: The old feed address redirects to the page, so the Desk reads the page.

  # Research. A paper is primary; a press release about a paper is not.
  research:
    - name: arXiv cs.AI
      short: arXiv
      url: "https://arxiv.org/list/cs.AI/recent"
      feed: "https://rss.arxiv.org/rss/cs.AI"
      beats: [agent-infrastructure]
      keywords: [blockchain, onchain, on-chain, smart contract, smart contracts, DeFi, cryptocurrency, wallet, wallets, stablecoin, x402, ERC-8004]
      status: unverified
      note: The page of a paper is its abstract; the Desk does not read PDFs. The API and the Atom feeds are closed to the Desk by robots.txt; rss.arxiv.org is open.
    - name: arXiv cs.CR
      short: arXiv
      url: "https://arxiv.org/list/cs.CR/recent"
      feed: "https://rss.arxiv.org/rss/cs.CR"
      beats: [security-incidents]
      keywords: [blockchain, onchain, on-chain, smart contract, smart contracts, DeFi, wallet, wallets, stablecoin, MEV, rollup, account abstraction]
      status: unverified
    - name: arXiv cs.MA
      short: arXiv
      url: "https://arxiv.org/list/cs.MA/recent"
      feed: "https://rss.arxiv.org/rss/cs.MA"
      beats: [agent-infrastructure]
      keywords: [blockchain, onchain, on-chain, smart contract, smart contracts, DeFi, cryptocurrency, wallet, stablecoin, payment, payments]
      status: unverified
    - name: IACR ePrint
      short: IACR ePrint
      url: "https://eprint.iacr.org/"
      feed: "https://eprint.iacr.org/rss/rss.xml"
      beats: [identity-trust, security-incidents]
      keywords: [agent, agents, agentic, blockchain, smart contract, smart contracts, wallet, wallets, account abstraction]
      status: unverified
    - name: Ethereum Research
      short: Ethereum Research
      url: "https://ethresear.ch/"
      feed: "https://ethresear.ch/latest.rss"
      beats: [protocols-standards, wallets-keys]
      keywords: [agent, agents, agentic, AI, account abstraction, intent, intents, payment, payments, wallet, wallets, ERC-8004, x402]
      status: unverified
    - name: Ethereum Magicians
      short: Ethereum Magicians
      url: "https://ethereum-magicians.org/"
      feed: "https://ethereum-magicians.org/latest.rss"
      beats: [protocols-standards, identity-trust]
      keywords: [agent, agents, agentic, AI, account abstraction, intent, intents, payment, payments, wallet, wallets, ERC-8004, x402]
      status: unverified

  # Standards, open protocols and regulators. Underserved and highly checkable. An entry with no feed is a place the Desk
  # recognises as primary when a story links to it.
  standards:
    - { name: Ethereum Improvement Proposals, short: EIPs, url: "https://eips.ethereum.org/", status: unverified }
    - { name: Ethereum Requests for Comment, short: ERCs, url: "https://ercs.ethereum.org/", status: unverified }
    - { name: Model Context Protocol, short: Model Context Protocol, url: "https://modelcontextprotocol.io/", status: unverified }
    - { name: x402 documentation, short: x402, url: "https://docs.x402.org/", status: unverified }
    - { name: x402 site, short: x402, url: "https://www.x402.org/", status: unverified }
    - { name: x402 repository, short: x402, url: "https://github.com/coinbase/x402", status: unverified, note: "Pages only: the Atom feed of releases is closed to the Desk by robots.txt." }
    - { name: Agent2Agent protocol, short: Agent2Agent, url: "https://a2a-protocol.org/", status: unverified }
    - { name: Agent2Agent repository, short: Agent2Agent, url: "https://github.com/a2aproject/A2A", status: unverified }
    - { name: W3C, short: W3C, url: "https://www.w3.org/", status: unverified }
    - { name: IETF datatracker, short: IETF, url: "https://datatracker.ietf.org/", status: unverified }
    - name: SEC press releases
      short: SEC
      url: "https://www.sec.gov/newsroom/press-releases"
      feed: "https://www.sec.gov/news/pressreleases.rss"
      beats: [policy-regulation]
      keywords: [crypto, digital asset, digital assets, blockchain, stablecoin, stablecoins, token, tokens]
      status: unverified
    - name: CFTC press releases
      short: CFTC
      url: "https://www.cftc.gov/PressRoom/PressReleases"
      feed: "https://www.cftc.gov/RSS/RSSGP/rssgp.xml"
      beats: [policy-regulation]
      keywords: [crypto, digital asset, digital assets, blockchain, stablecoin, stablecoins, token, tokens]
      status: unverified
    - name: Federal Reserve press releases
      short: Federal Reserve
      url: "https://www.federalreserve.gov/newsevents/pressreleases.htm"
      feed: "https://www.federalreserve.gov/feeds/press_all.xml"
      beats: [policy-regulation]
      keywords: [stablecoin, stablecoins, digital asset, digital assets, crypto, payment, payments]
      status: unverified

  # Money. A filing or the project's own announcement beats any coverage of it.
  funding:
    - { name: Project announcement, url: "(the round is always announced on the project's own site first)", status: n/a }

  events: []

# ---------------------------------------------------------------------------
# TIER 2 — SECONDARY (discovery only)
# ---------------------------------------------------------------------------
# Every one of these is a competitor. Reading them to learn what happened is normal practice.
# Rewriting them is not. Most of what they publish is prices and markets, which this publication
# does not cover, so every feed is narrowed by keywords.

secondary:
  - name: CoinDesk
    short: CoinDesk
    feed: "https://www.coindesk.com/arc/outboundfeeds/rss"
    status: unverified
    beats: [payments-commerce, wallets-keys, security-incidents, policy-regulation, funding]
    keywords: [agent, agents, agentic, AI, x402, ERC-8004, MCP, autonomous]
  - name: Cointelegraph
    short: Cointelegraph
    feed: "https://cointelegraph.com/rss"
    status: unverified
    beats: [payments-commerce, wallets-keys, security-incidents, policy-regulation, funding]
    keywords: [agent, agents, agentic, AI, x402, ERC-8004, MCP, autonomous]
  - name: Decrypt
    short: Decrypt
    feed: "https://decrypt.co/feed"
    status: unverified
    beats: [payments-commerce, wallets-keys, security-incidents, policy-regulation, funding]
    keywords: [agent, agents, agentic, AI, x402, ERC-8004, MCP, autonomous]
  - name: The Block
    short: The Block
    feed: "https://www.theblock.co/rss.xml"
    status: unverified
    beats: [payments-commerce, wallets-keys, security-incidents, policy-regulation, funding]
    keywords: [agent, agents, agentic, AI, x402, ERC-8004, MCP, autonomous]
  - name: The Defiant
    short: The Defiant
    feed: "https://thedefiant.io/api/feed"
    status: blocked
    beats: [payments-commerce, funding]
    note: robots.txt does not allow the Desk to read the feed (checked 2026-10-20).

# The owner adds the projects, exchanges and wallets they follow under `primary.companies`, in the group of the beat
# they belong to, in the form above. Check an entry with `npm run desk -- sources-check` before relying on it.

# ---------------------------------------------------------------------------
# EDITORIAL BAR
# ---------------------------------------------------------------------------
# One piece a day. On a quiet day, publish the smaller true thing rather than inflating the biggest available thing.

bar:
  publish_if_any:
    - A protocol, a standard or a proposal for agents was published or changed, and its text can be read.
    - A project shipped something agents can use, with documentation that says what it does.
    - A paper or a post explains how agents pay, prove who they are, hold keys or are attacked.
    - A regulator or a standards body said something about agents or about the money they handle.
    - An incident that involved an agent, with a write-up by the people who found or fixed it.

  do_not_publish:
    - A price, a market move, a listing, or a token to buy.
    - A partnership or a memorandum with no deliverable and no date.
    - A funding rumour with no named source.
    - A restatement of another outlet's story with nothing added.
    - A claim that only a trade outlet makes.

  quiet_day_fallback:
    - A primer on a standard or a protocol that readers keep mis-reading.
    - A follow-up on a proposal or a launch covered months ago.
```

- [ ] **Step 4: Fix the tests that read the file, and the README**

Run: `npm test --workspace @robywire/gate -- test/sources.test.ts` → PASS.

`README.md`: the paragraph at line 29 (`Every \`status\` ...`) becomes: ``Every `status` starts as `unverified`, except the entries the check of 2026-10-20 found closed to the Desk, which are `blocked` with a note that says why, and `n/a` for the funding announcement, which has no fixed address. `desk sources-check` fetches every entry the way the Desk fetches and says which can be read; the statuses of the entries it could read are then `verified`. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.`` (After Task 13 sets the statuses, this sentence names `verified` as well; the test requires that it names every status the file has.) The tier paragraph (the bullet "Tier 1 (primary) sources"): Task 7 already rewrote it to mirror the `tiers` sentence of `site/src/lib/copy.ts`; leave it as it is, and only check that it agrees with the new registry (a project's or a company's own post or documentation, a paper, a filing, a standard or a proposal).

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`. `desk/test/runbook.test.ts` (the forced-hold command) and `site/test/publication-name.test.ts` read the real file: both pass with this file (the command empties `primary`, and there are more than three unblocked outlets in `secondary`). Any other failure: stop and say which.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sources.yml lists the primary feeds, standards, regulators and trade outlets of AI agents in crypto, as checked on 2026-10-20" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `desk sources-check`

A registry is a claim about the web, and the web changes: a feed moves, a site starts a bot challenge, a robots.txt closes. `desk sources-check` fetches every entry of `sources.yml` the way the Desk fetches (robots.txt honoured, the pace of the settings, the user agent of the settings), reads each feed, and prints one line for each entry: whether it can be read, what kind of source the registry says it is, and for a feed how many items it has, how many hold a keyword, how many link to a primary page, and the newest date. It writes nothing and uses no key; it is the free check to run before relying on a source and after any change to the registry.

**Files:**
- Create: `desk/src/run/sources-check.ts`, `desk/test/run/sources-check.test.ts`, `desk/test/fixtures/feeds/not-a-feed.html`
- Modify: `desk/src/cli.ts`, `desk/src/index.ts` (export), `desk/test/cli.test.ts`, `README.md` (the command list), `docs/runbook.md` (one line in the step that chooses pages: `grep -n "tune --urls" docs/runbook.md`)
- Modify (data): `sources.yml` (the statuses, Step 5)

- [ ] **Step 1: Write the failing tests**

`desk/test/fixtures/feeds/not-a-feed.html`:

```html
<!doctype html><html><head><title>Not a feed</title></head><body><p>Hello</p></body></html>
```

`desk/test/run/sources-check.test.ts`:

```ts
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
    expect(lines).toHaveLength(8);
    expect(lines[1]).toBe('    2026-10-04  Agents that settle on chain  https://ethresear.ch/t/agents-that-settle-on-chain/9001');
  });
});
```

(`FixtureFetcher` entries take a file name, `{ file, contentType }` or a `FetchError`; `desk/src/fetch/http.ts:364` has the type. The feed fixture of Task 10 is reused: it has 3 items, 2 of which hold `agent` or `agents`, and 2 of which link to `ethresear.ch`. In this registry the entry is listed under `companies`, so its kind is `company-newsroom`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/desk -- test/run/sources-check.test.ts`
Expected: FAIL (`../../src/run/sources-check` does not exist).

- [ ] **Step 3: Implement**

`desk/src/run/sources-check.ts`:

```ts
import type { SourcesRegistry } from '@robywire/gate';
import { FeedError, FetchError, isTier1, parseFeed, sourceKind } from '../index';
import type { Fetcher, SourceKind } from '../index';
import { readPage } from '../fetch/read-page';
import { matchesKeywords, plainText } from '../stages/keywords';

// A registry is a claim about the web. `checkSources` fetches each entry the way the Desk fetches (the fetcher it is given honours robots.txt and the pace of the
// settings), reads each feed, and reports what it found, so that an entry that cannot be read is known before a run depends on it. It writes nothing and asks no model.

/** What was found in a feed. */
export interface FeedFinding {
  items: number;
  /** Items that hold a keyword of the entry (all of them when the entry has none). */
  matching: number;
  /** Items whose link is a page of a primary source (what Discover would keep of a primary feed). */
  primary: number;
  /** The newest date any item has, or null. */
  newest: string | null;
  /** The newest stories, at most `LATEST_ITEMS`, that hold a keyword and, for a primary feed, link to a primary page: the pages a story could be written from. */
  latest: { title: string; link: string; publishedAt: string | null }[];
}

/** How many stories of a feed the report lists. */
export const LATEST_ITEMS = 3;

export type CheckResult = 'ok' | 'robots' | 'error' | 'not-a-feed' | 'empty' | 'skipped';

export interface CheckRow {
  name: string;
  /** The address that was fetched: the feed when there is one, else the page. */
  target: string;
  kind: SourceKind;
  result: CheckResult;
  /** In words: why it failed, or what the page or feed was. */
  detail: string;
  /** For a feed that was read; null for a page and for a failure. */
  feed: FeedFinding | null;
}

export interface SourceCheck {
  rows: CheckRow[];
  /** How many entries were fetched. */
  tried: number;
  /** How many of them could be read. */
  readable: number;
}

interface Entry {
  name: string;
  url: string | undefined;
  feed: string | undefined;
  keywords: readonly string[];
  status: string;
  tier: 1 | 2;
}

const isAddress = (text: string): boolean => /^https?:\/\//i.test(text);

function entriesOf(registry: SourcesRegistry): Entry[] {
  const primary = [
    ...Object.values(registry.primary.companies).flat(),
    ...registry.primary.research,
    ...registry.primary.standards,
    ...registry.primary.funding,
    ...registry.primary.events,
  ].map((entry): Entry => ({ name: entry.name, url: entry.url, feed: entry.feed, keywords: entry.keywords ?? [], status: entry.status, tier: 1 }));
  const secondary = registry.secondary.map((entry): Entry => ({ name: entry.name, url: undefined, feed: entry.feed, keywords: entry.keywords ?? [], status: entry.status, tier: 2 }));
  return [...primary, ...secondary].filter((entry) => (entry.feed ?? entry.url ?? '') !== '' && isAddress(entry.feed ?? entry.url ?? ''));
}

/** Fetch every entry that has an address and report what was found; an entry whose status is `blocked` is not fetched. */
export async function checkSources(registry: SourcesRegistry, fetcher: Fetcher): Promise<SourceCheck> {
  const rows: CheckRow[] = [];
  for (const entry of entriesOf(registry)) {
    const target = (entry.feed ?? entry.url) as string;
    const kind = sourceKind(entry.url ?? target, registry);
    const row = (result: CheckResult, detail: string, feed: FeedFinding | null = null): CheckRow => ({ name: entry.name, target, kind, result, detail, feed });
    if (entry.status === 'blocked') {
      rows.push(row('skipped', 'its status is blocked'));
      continue;
    }
    try {
      const page = await fetcher.get(target);
      if (entry.feed === undefined) {
        const text = readPage(page).text;
        rows.push(text === '' ? row('empty', 'the page has no text to read') : row('ok', `page, ${text.length} characters of text`));
        continue;
      }
      const parsed = parseFeed(page.body);
      const dates = parsed.items.flatMap((item) => (item.publishedAt === undefined ? [] : [item.publishedAt])).sort();
      const matching = parsed.items.filter((item) => matchesKeywords(`${item.title} ${plainText(item.summary)}`, entry.keywords));
      const wanted = matching.filter((item) => entry.tier === 2 || isTier1(item.link, registry));
      const finding: FeedFinding = {
        items: parsed.items.length,
        matching: matching.length,
        primary: parsed.items.filter((item) => isTier1(item.link, registry)).length,
        newest: dates.at(-1) ?? null,
        latest: [...wanted]
          .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
          .slice(0, LATEST_ITEMS)
          .map((item) => ({ title: item.title, link: item.link, publishedAt: item.publishedAt ?? null })),
      };
      rows.push(parsed.items.length === 0 ? row('empty', 'the feed has no items', finding) : row('ok', `feed, ${finding.items} items`, finding));
    } catch (error) {
      if (error instanceof FeedError) rows.push(row('not-a-feed', error.message));
      else if (error instanceof FetchError) rows.push(row(error.kind === 'robots' ? 'robots' : 'error', error.message));
      else throw error;
    }
  }
  const tried = rows.filter((row) => row.result !== 'skipped').length;
  return { rows, tried, readable: rows.filter((row) => row.result === 'ok').length };
}

/** The report as lines to print: one for each entry (with `items`, the newest stories of a feed under it), then the count. */
export function formatSourceCheck(report: SourceCheck, options: { items?: boolean } = {}): string[] {
  const pad = (text: string, width: number): string => text.padEnd(width);
  const lines = report.rows.map((row) => {
    const what =
      row.feed !== null && row.result === 'ok'
        ? `feed: ${row.feed.items} items, ${row.feed.matching} with a keyword, ${row.feed.primary} on a primary page, newest ${row.feed.newest === null ? 'unknown' : row.feed.newest.slice(0, 10)}`
        : row.detail;
    const line = `${pad(row.result, 10)}${pad(row.name, 32)}${pad(row.kind, 18)}${what}`;
    const stories = options.items === true && row.feed !== null ? row.feed.latest.map((story) => `    ${story.publishedAt === null ? 'undated   ' : story.publishedAt.slice(0, 10)}  ${story.title}  ${story.link}`) : [];
    return [line, ...stories];
  }).flat();
  const skipped = report.rows.length - report.tried;
  return [...lines, `${report.readable} of ${report.tried} entries can be read; ${skipped} ${skipped === 1 ? 'was' : 'were'} not tried`];
}
```

`desk/src/index.ts`: add `export * from './run/sources-check';`.

`desk/src/cli.ts`:
1. `Parsed` gains `| { command: 'sources-check'; items: boolean; config: string | undefined }`.
2. `USAGE` gains a line `'  desk sources-check [--items] [--config <path>]'` after the `desk status` line, and a paragraph `'        sources-check fetches every entry of sources.yml as the Desk fetches (robots.txt honoured, at the pace of the settings), reads each feed, and prints whether it can be read; it writes nothing and needs no key. --items lists under each feed its newest stories that hold a keyword and link to a primary page, to choose pages from. It needs --config for the real user agent, as a live run does.'`.
3. `OPTIONS` gains `'sources-check': { flags: ['--items'], valued: ['--config'] }` (and the key type of the record gains `'sources-check'`).
4. In `parseArgs`: add `&& command !== 'sources-check'` to the check of the command that precedes `const given = new Map` (the list of commands in its message gains `sources-check`), and after the `status` branch add

```ts
  if (command === 'sources-check') {
    if (positional.length > 0) return fail(`sources-check takes no arguments, but was given "${positional[0]}"`);
    return { ok: true, args: { command: 'sources-check', items: given.has('--items'), config: value('--config') } };
  }
```

5. In `main`, `case 'sources-check': return sourcesCheckCommand(parsed.args, deps);`, and the function, placed beside `tuneCommand`:

```ts
/**
 * `desk sources-check`: every entry of `sources.yml` is fetched as the Desk fetches (`sourcesOf('live', ...)`: robots.txt honoured, the pace and the user agent of the settings) and
 * the result of each is printed. Exit code 0 when every entry that was tried could be read, 1 when some could not (the lines say which), 2 for a mistake in the arguments or a user agent
 * that links to an `.example` address (a site that is asked by a user agent that points nowhere cannot find out who is asking).
 */
async function sourcesCheckCommand(args: Extract<Parsed, { command: 'sources-check' }>, deps: CliDeps): Promise<number> {
  let config: DeskConfig;
  try {
    config = loadConfig(args.config === undefined ? undefined : path.resolve(deps.cwd, args.config));
  } catch (error) {
    deps.err(describeError(error));
    return 2;
  }
  const placeholder = placeholderHost(config.userAgent);
  if (placeholder !== undefined) {
    deps.err(`desk: the user agent links to ${placeholder}, which does not exist: a check of live sources needs a file of settings (--config) with the real address of the /method page`);
    return 2;
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf('live', deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }
  const report = await checkSources(world.sources, world.fetcher);
  for (const line of formatSourceCheck(report, { items: args.items })) deps.out(line);
  return report.readable === report.tried ? 0 : 1;
}
```

   (Use the same helpers that `tuneCommand` uses to load the config and refuse a placeholder: read its first 25 lines (`cli.ts` around line 520) and use its exact calls instead of the ones written above if they differ: the names `loadConfig`, `placeholderHost`, `sourcesOf` and `describeError` are the ones the file already has.)
6. `desk/test/cli.test.ts`: add three tests in the style of the existing `tune` tests: the usage text lists `sources-check`; `desk sources-check --config <file with a real user agent>` with `deps.fetcher` faked prints one line for each entry and exits 1 when one cannot be read; and a placeholder user agent exits 2 and prints the sentence above. (`grep -n "tune" desk/test/cli.test.ts` shows how the existing tests inject the fetcher and the config.)

- [ ] **Step 4: Run the tests, then everything**

Run: `npm test --workspace @robywire/desk -- test/run/sources-check.test.ts test/cli.test.ts` → PASS, then `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check` → green.

README: add `` `npm run desk -- sources-check [--config <path>]` fetches every entry of `sources.yml` as the Desk fetches and says which can be read; it writes nothing and needs no key. `` to the list of commands (after `status`). `docs/runbook.md`: in the step that chooses pages for the trials, add one sentence: "Run `npm run desk -- sources-check --config desk.config.yml` first; an entry that is not `ok` is not a source to rely on."

- [ ] **Step 5: Run it for real, and set the statuses**

This fetches about forty public pages and feeds at one request a second to a host, and needs the settings file with the real address of the /method page (the file `runs/tune-settings.yml` of the diagnosis run has it; if it is not there, ask the owner for the address).

```bash
npm run desk -- sources-check --config runs/tune-settings.yml
```

Expected: one line for each entry and a count. Read it against the table at the top of this part. For each entry:
- `ok`: set its `status` in `sources.yml` to `verified`;
- `robots`, `error`, `not-a-feed` or `empty`: set `status: blocked` and add a `note:` that says what the line said and the date (`checked 2026-10-21`); do not delete the entry;
- an entry that is `ok` but whose feed shows `0 with a keyword` or `0 on a primary page`: leave it `verified` and add to its `note:` what the line said, because the keywords or the host of its `url` may need to change; say so in the commit message.

Then `npm test --workspace @robywire/gate -- test/sources.test.ts` (the README sentence must name every status the file has: add `` `verified` `` to it) and the whole suite.

```bash
git add -A
git commit -m "feat(desk): desk sources-check fetches every source as the Desk does and says which can be read, and the statuses of sources.yml are what it found" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
