import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YAMLParseError } from 'yaml';
import { ZodError } from 'zod';
import { isBareSharedHost } from '../src/address';
import { CATEGORY_VOCAB } from '../src/constants';
import type { SourcesRegistry } from '../src/schemas';
import { loadSources, parseSources } from '../src/sources';

// Resolved from this file, not from the working directory, so the test passes
// whether it is run from the repo root or from gate/.
const SOURCES_PATH = fileURLToPath(new URL('../../sources.yml', import.meta.url));

const load = () => loadSources(SOURCES_PATH);

/** Every entry of the registry, tier 1 and tier 2. */
function everyEntry(registry: SourcesRegistry) {
  const { companies, research, standards, funding, events } = registry.primary;
  return [...Object.values(companies).flat(), ...research, ...standards, ...funding, ...events, ...registry.secondary];
}

/** Every `status` in the registry, tier 1 and tier 2. */
const everyStatus = (registry: SourcesRegistry): string[] => everyEntry(registry).map((entry) => entry.status);

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

  it('lists at least ten primary feeds (research, a forum of proposals, the blogs of projects, regulators), every one on https', () => {
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

  it('says why an entry is blocked: every blocked entry has a note', () => {
    for (const entry of everyEntry(load())) if (entry.status === 'blocked') expect(entry.note, entry.name).toBeTruthy();
  });

  it('lists a keyword once: no list has the same word twice, in any case', () => {
    for (const entry of everyEntry(load())) {
      const lowercase = (entry.keywords ?? []).map((keyword) => keyword.toLowerCase());
      expect(lowercase, entry.name).toEqual([...new Set(lowercase)]);
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

const MINIMAL = `
primary:
  companies:
    payments-commerce:
      - { name: Fixture Robotics, url: "https://fixture-robotics.example/news", status: unverified }
  research: []
  standards: []
  funding: []
  events: []
secondary:
  - name: Example Robot News
    feed: "https://news.example/feed"
    status: unverified
    beats: [payments-commerce, funding]
bar:
  publish_if_any: [A product shipped.]
  do_not_publish: [A demo with no specification behind it.]
  quiet_day_fallback: [A follow-up on an earlier launch.]
`;

/** Replace `from` with `to`, failing loudly if `from` is not there (so a typo cannot make a test a no-op). */
function swap(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

/** The dotted path of every validation issue `parseSources` reports for `yamlText`. */
function failurePaths(yamlText: string): string[] {
  try {
    parseSources(yamlText);
  } catch (error) {
    if (error instanceof ZodError) {
      return error.issues.map((issue) => issue.path.join('.') || '(root)');
    }
    throw error;
  }
  throw new Error('expected parseSources to throw');
}

describe('parseSources', () => {
  it('parses a minimal registry', () => {
    const registry = parseSources(MINIMAL);
    expect(registry.primary.companies['payments-commerce']?.[0]?.name).toBe('Fixture Robotics');
    expect(registry.secondary[0]?.beats).toEqual(['payments-commerce', 'funding']);
  });

  it('rejects a status that is not verified, unverified, blocked or n/a', () => {
    const bad = swap(MINIMAL, 'status: unverified }', 'status: maybe }');
    expect(failurePaths(bad)).toEqual(['primary.companies.payments-commerce.0.status']);
  });

  it('rejects a beat that is not in the category vocabulary', () => {
    const bad = swap(MINIMAL, 'beats: [payments-commerce, funding]', 'beats: [payments-commerce, quantum]');
    expect(failurePaths(bad)).toEqual(['secondary.0.beats.1']);
  });

  it('rejects an empty document', () => {
    expect(failurePaths('')).toEqual(['(root)']);
  });

  it('rejects text that is not valid YAML', () => {
    expect(() => parseSources('primary: [unclosed')).toThrow(YAMLParseError);
  });

  it('rejects a duplicated key instead of letting the second one win', () => {
    const doubled = `${MINIMAL}bar:\n  publish_if_any: []\n`;
    expect(() => parseSources(doubled)).toThrow(YAMLParseError);
  });
});

describe('loadSources', () => {
  it('fails with the file system error when the file does not exist', () => {
    expect(() => loadSources(`${SOURCES_PATH}.missing`)).toThrow(/ENOENT/);
  });
});
