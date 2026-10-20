import { CATEGORY_VOCAB } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { hostKey } from './fetch/url';

// What the Desk reads from `sources.yml`, as the questions the stages ask: which feeds to poll, which
// newsrooms to read, and whether an address is a primary source. The registry is loaded and checked by
// `loadSources` of the gate package; these functions only read it.

/** A newsroom to read for stories: a company's own news page. */
export interface Newsroom {
  name: string;
  url: string;
  /** The beats of the company, as slugs of the vocabulary; empty when the group of the registry maps to none. */
  beats: string[];
}

/** A feed of another outlet, to read for stories (never to write from). */
export interface Tier2Feed {
  name: string;
  feed: string;
  beats: string[];
}

/**
 * A group of companies in `sources.yml` named for a beat of the vocabulary is that beat; the two groups of the
 * made-up world of the tests are named for a field, and the table says their beats. Any other group has no beat,
 * and its stories are not selected, because the Desk does not guess which beat a story is about.
 */
export const COMPANY_GROUP_BEATS: Readonly<Record<string, readonly string[]>> = {
  industrial: ['agent-infrastructure'],
  software: ['protocols-standards'],
};

function beatsOfGroup(group: string): string[] {
  if ((CATEGORY_VOCAB as readonly string[]).includes(group)) return [group];
  return [...(COMPANY_GROUP_BEATS[group] ?? [])];
}

/** An address that is the address of a page, and not a sentence that says where to look (the `n/a` entries). */
const isAddress = (url: string): boolean => hostKey(url) !== null;

/**
 * The companies' newsrooms to read: every company entry whose address is an http or https address, except those
 * whose status is `blocked` (the Desk cannot read them), in the order of the file.
 */
export function tier1Newsrooms(registry: SourcesRegistry): Newsroom[] {
  return Object.entries(registry.primary.companies).flatMap(([group, entries]) =>
    entries.filter((entry) => entry.status !== 'blocked' && isAddress(entry.url)).map((entry) => ({ name: entry.name, url: entry.url, beats: beatsOfGroup(group) })),
  );
}

/** The feeds of other outlets to read: every secondary source except those whose status is `blocked`, in the order of the file. */
export function tier2Feeds(registry: SourcesRegistry): Tier2Feed[] {
  return registry.secondary.filter((entry) => entry.status !== 'blocked').map((entry) => ({ name: entry.name, feed: entry.feed, beats: [...entry.beats] }));
}

/** The hosts (see `hostKey`) of some addresses; an entry whose address is not the address of a page has none. */
function hostsOf(entries: readonly { url: string }[]): Set<string> {
  const hosts = new Set<string>();
  for (const entry of entries) {
    const host = hostKey(entry.url);
    if (host !== null) hosts.add(host);
  }
  return hosts;
}

const companyEntries = (registry: SourcesRegistry) => Object.values(registry.primary.companies).flat();

/** The hosts (see `hostKey`) of the companies' addresses and of the standards bodies' addresses in the registry, whatever their status. */
export function tier1Hosts(registry: SourcesRegistry): Set<string> {
  return new Set([...hostsOf(companyEntries(registry)), ...hostsOf(registry.primary.standards)]);
}

/** What kind of source an address is. Only the first four are primary sources. */
export type SourceKind = 'company-newsroom' | 'arxiv' | 'sec' | 'standard' | 'tier2' | 'unknown';

const isHostOrSubdomain = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/**
 * What kind of source an address is, by its host. The rules, in this order, so that the first that applies decides:
 *
 * 1. `tier2`: the host of one of the feeds of other outlets in the registry. An outlet is never a primary source,
 *    even if the registry also lists its host as a company's by mistake.
 * 2. `arxiv`: `arxiv.org` or any subdomain of it. The registry lists only an arXiv feed, not the pages of papers.
 * 3. `sec`: `sec.gov` or any subdomain of it, for the same reason.
 * 4. `company-newsroom`: the host of a company's address in the registry (see `hostKey`: a leading `www.` and a port do not matter).
 * 5. `standard`: the host of a standards body's address in the registry.
 * 6. `unknown`: anything else, including a subdomain of a registered host, the pages of events, an address that is not
 *    an http or https address, and text that is not an address. `unknown` is never treated as a primary source.
 */
export function sourceKind(url: string, registry: SourcesRegistry): SourceKind {
  const host = hostKey(url);
  if (host === null) return 'unknown';
  if (hostsOf(registry.secondary.map((entry) => ({ url: entry.feed }))).has(host)) return 'tier2';
  if (isHostOrSubdomain(host, 'arxiv.org')) return 'arxiv';
  if (isHostOrSubdomain(host, 'sec.gov')) return 'sec';
  if (hostsOf(companyEntries(registry)).has(host)) return 'company-newsroom';
  if (hostsOf(registry.primary.standards).has(host)) return 'standard';
  return 'unknown';
}

/** Is this address a primary source (tier 1): a company's own page, an arXiv page, a filing, or a standards body's page? */
export function isTier1(url: string, registry: SourcesRegistry): boolean {
  const kind = sourceKind(url, registry);
  return kind === 'company-newsroom' || kind === 'arxiv' || kind === 'sec' || kind === 'standard';
}
