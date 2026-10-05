import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YAMLParseError } from 'yaml';
import { ZodError } from 'zod';
import { CATEGORY_VOCAB } from '../src/constants';
import type { SourcesRegistry } from '../src/schemas';
import { loadSources, parseSources } from '../src/sources';

// Resolved from this file, not from the working directory, so the test passes
// whether it is run from the repo root or from gate/.
const SOURCES_PATH = fileURLToPath(new URL('../../sources.yml', import.meta.url));

const load = () => loadSources(SOURCES_PATH);

/** Every `status` in the registry, tier 1 and tier 2. */
function everyStatus(registry: SourcesRegistry): string[] {
  const { companies, research, standards, funding, events } = registry.primary;
  const primary = [...Object.values(companies).flat(), ...research, ...standards, ...funding, ...events];
  return [...primary.map((entry) => entry.status), ...registry.secondary.map((entry) => entry.status)];
}

describe('the real sources.yml', () => {
  it('parses and validates', () => {
    expect(() => load()).not.toThrow();
  });

  it('has no verified status, because the desk has fetched nothing yet', () => {
    const statuses = everyStatus(load());
    expect(statuses).not.toContain('verified');
    expect(statuses).toContain('unverified');
  });

  it('keeps the documented blocked and n/a statuses', () => {
    const statuses = everyStatus(load());
    expect(statuses).toContain('blocked');
    expect(statuses).toContain('n/a');
  });

  it('lists at least five humanoid companies', () => {
    expect((load().primary.companies.humanoids ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('gives every secondary source an https feed and beats from the vocabulary', () => {
    const { secondary } = load();
    expect(secondary.length).toBeGreaterThan(0);
    for (const entry of secondary) {
      expect(entry.feed, entry.name).toMatch(/^https:\/\//);
      expect(entry.beats.length, entry.name).toBeGreaterThan(0);
      for (const beat of entry.beats) {
        expect(CATEGORY_VOCAB, entry.name).toContain(beat);
      }
    }
  });

  it('marks the arXiv research entry blocked and says why', () => {
    const arxiv = load().primary.research.find((entry) => entry.name === 'arXiv cs.RO');
    expect(arxiv?.status).toBe('blocked');
    expect(arxiv?.note).toMatch(/robots\.txt/);
  });

  it('carries the editorial bar', () => {
    const { bar } = load();
    expect(bar.publish_if_any.length).toBeGreaterThan(0);
    expect(bar.do_not_publish.length).toBeGreaterThan(0);
    expect(bar.quiet_day_fallback.length).toBeGreaterThan(0);
  });
});

const MINIMAL = `
primary:
  companies:
    humanoids:
      - { name: Fixture Robotics, url: "https://fixture-robotics.example/news", status: unverified }
  research: []
  standards: []
  funding: []
  events: []
secondary:
  - name: Example Robot News
    feed: "https://news.example/feed"
    status: unverified
    beats: [humanoids, funding]
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
    expect(registry.primary.companies.humanoids?.[0]?.name).toBe('Fixture Robotics');
    expect(registry.secondary[0]?.beats).toEqual(['humanoids', 'funding']);
  });

  it('rejects a status that is not verified, unverified, blocked or n/a', () => {
    const bad = swap(MINIMAL, 'status: unverified }', 'status: maybe }');
    expect(failurePaths(bad)).toEqual(['primary.companies.humanoids.0.status']);
  });

  it('rejects a beat that is not in the category vocabulary', () => {
    const bad = swap(MINIMAL, 'beats: [humanoids, funding]', 'beats: [humanoids, quantum]');
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
