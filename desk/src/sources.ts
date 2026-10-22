import { CATEGORY_VOCAB, addressParts, isSharedHost } from '@robywire/gate';
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
 * so this is empty there; the made-up world of the tests names two groups for a field. The schema of the registry accepts a group as a beat only when it is in
 * the vocabulary, so an entry with a `feed` in one of these groups must carry its own `beats`.
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
  if (!isSharedHost(parts.host)) return { host: parts.host, prefix: undefined };
  const prefix = parts.path.toLowerCase().replace(/\/+$/, '');
  // The whole of a shared host is never one source (the schema refuses the entry; a registry made by hand is not trusted either).
  return prefix === '' ? null : { host: parts.host, prefix };
}

const scopesOf = (entries: readonly { url: string }[]): Scope[] =>
  entries.flatMap((entry) => {
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

/**
 * Is this address a page of a source that the registry marks `blocked` (the Desk cannot read it: robots.txt forbids it, or it answers a bot with a 403)? Only the sources that can be
 * primary count (companies, research, standards), and with the same reading of the address as `sourceKind`: the whole host, or, on a host where many people publish, the path of the entry and
 * what is below it. An address that a source which is not blocked also covers is not blocked, as that source can be read. A page of a blocked source can never be fetched, so a
 * story cannot be written from it.
 */
export function isBlockedSource(url: string, registry: SourcesRegistry): boolean {
  const entries = [...companyEntries(registry), ...registry.primary.research, ...registry.primary.standards];
  return inScopes(url, scopesOf(entries.filter((entry) => entry.status === 'blocked'))) && !inScopes(url, scopesOf(entries.filter((entry) => entry.status !== 'blocked')));
}
