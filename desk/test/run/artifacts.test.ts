import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, DiscoverArtifact, FetchArtifact, SelectArtifact, candidateId, readArtifact, runPath, writeArtifact } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { RUN_DATE, candidate } from '../support/candidates';

// The artifacts are the Desk's record of a run: one JSON file per stage, in a folder named for the day.
// Every later stage, and `desk replay`, reads them back, so they are checked when written and when read.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-artifacts-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** The path of a folder that does not exist yet. */
const freshDir = (): string => path.join(scratch, `run-${++counter}`, RUN_DATE);

// Every hex digit appears in it, so that a pattern that leaves one out would refuse it.
const HASH = '0123456789abcdef'.repeat(4);

const discoverArtifact = (): DiscoverArtifact => ({
  date: RUN_DATE,
  candidates: [candidate(), candidate({ url: 'https://www.fixture-robotics.example/news/fx-1-ships', title: 'FX-1 ships', outlet: 'Fixture Robotics', tier: 1, origin: 'newsroom', publishedAt: undefined })],
  skipped: [{ source: 'Gantry Daily', reason: 'robots.txt does not allow the Desk to fetch /feed' }],
});

const selectArtifact = (): SelectArtifact => {
  const chosen = candidate();
  return {
    date: RUN_DATE,
    chosen,
    reasons: ['A product reached a customer site.'],
    tier1Url: 'https://www.fixture-robotics.example/news/fx-1-ships',
    shortlist: [chosen.id, candidateId('https://www.mercer-wire.example/other')],
  };
};

const fetchArtifact = (): FetchArtifact => ({
  date: RUN_DATE,
  documents: [
    {
      url: 'https://www.fixture-robotics.example/news/fx-1-ships',
      finalUrl: 'https://www.fixture-robotics.example/news/fx-1-ships',
      tier: 1,
      hash: HASH,
      retrievedAt: '2026-10-05T04:31:00.000Z',
      bytes: 2048,
      title: 'Fixture Robotics ships the FX-1',
    },
  ],
  failures: [{ url: 'https://www.mercer-wire.example/2026/10/fixture-robotics-ships-fx-1', tier: 2, reason: 'the page is too large' }],
});

/** What parsing `value` with `schema` reports, or '' if it is valid. */
const problem = (schema: z.ZodType, value: unknown): string => {
  const result = schema.safeParse(value);
  return result.success ? '' : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
};

describe('runPath', () => {
  it('is the runs folder and the date', () => {
    expect(runPath('runs', '2026-10-05')).toBe(path.join('runs', '2026-10-05'));
    expect(runPath('/var/desk/runs', '2026-01-31')).toBe(path.join('/var/desk/runs', '2026-01-31'));
  });

  it.each(['', '2026-10-5', '2026-13-01', '2026-02-30', '../2026-10-05', '2026-10-05/x', ' 2026-10-05', '20261005'])('refuses %j as a date', (date) => {
    expect(() => runPath('runs', date)).toThrow('is not a date');
  });
});

describe('candidateId', () => {
  it('is the first 12 hex characters of the SHA-256 of the address', () => {
    const url = 'https://www.mercer-wire.example/a';
    expect(candidateId(url)).toBe(sha256Hex(url).slice(0, 12));
    expect(candidateId(url)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is pinned, because stored artifacts and recorded model replies name candidates by it', () => {
    expect(candidateId('https://www.mercer-wire.example/a')).toBe('005805db3ee0');
  });

  it('differs for different addresses', () => {
    expect(candidateId('https://www.mercer-wire.example/a')).not.toBe(candidateId('https://www.mercer-wire.example/b'));
  });
});

describe('Candidate', () => {
  it('accepts a candidate from a feed, and a newsroom candidate with no date', () => {
    expect(problem(Candidate, candidate())).toBe('');
    expect(problem(Candidate, discoverArtifact().candidates[1])).toBe('');
  });

  it('accepts texts of a single character, which is the least the schemas allow', () => {
    expect(problem(Candidate, candidate({ title: 'X', outlet: 'Y', beats: ['z'] }))).toBe('');
    expect(problem(DiscoverArtifact, { date: RUN_DATE, candidates: [], skipped: [{ source: 'S', reason: 'r' }] })).toBe('');
    expect(problem(SelectArtifact, { ...selectArtifact(), reasons: ['r'], shortlist: [selectArtifact().shortlist[0], 'x'] })).toBe('');
    expect(problem(FetchArtifact, { ...fetchArtifact(), failures: [{ url: 'https://a.example/x', tier: 2, reason: 'r' }] })).toBe('');
  });

  it('accepts a date with an offset', () => {
    expect(problem(Candidate, candidate({ publishedAt: '2026-10-04T10:00:00+02:00' }))).toBe('');
  });

  it.each([
    ['an id that is not the id of the address', { id: '0'.repeat(12) }, 'id: id must be candidateId(url)'],
    ['an id of the wrong shape', { id: 'abc' }, 'id:'],
    ['an empty title', { title: '' }, 'title:'],
    ['an address that is not http or https', { url: 'ftp://www.mercer-wire.example/a', id: candidateId('ftp://www.mercer-wire.example/a') }, 'url:'],
    ['a date that is only a day', { publishedAt: '2026-10-04' }, 'publishedAt:'],
    ['an empty outlet', { outlet: '' }, 'outlet:'],
    ['a tier that is not 1 or 2', { tier: 3 }, 'tier:'],
    ['an empty beat', { beats: [''] }, 'beats.0:'],
    ['an origin that is not feed or newsroom', { origin: 'tip' }, 'origin:'],
  ])('refuses %s', (_name, change, fragment) => {
    expect(problem(Candidate, { ...candidate(), ...change })).toContain(fragment);
  });

  it('refuses a field it does not know', () => {
    expect(problem(Candidate, { ...candidate(), summary: 'x' })).toContain('Unrecognized key');
  });
});

describe('DiscoverArtifact', () => {
  it('accepts candidates and the sources that were skipped', () => {
    expect(problem(DiscoverArtifact, discoverArtifact())).toBe('');
    expect(problem(DiscoverArtifact, { date: RUN_DATE, candidates: [], skipped: [] })).toBe('');
  });

  it('refuses a date that is not a day', () => {
    expect(problem(DiscoverArtifact, { ...discoverArtifact(), date: '2026-10-05T00:00:00Z' })).toContain('date:');
  });

  it('refuses two candidates with one id', () => {
    const one = candidate();
    expect(problem(DiscoverArtifact, { ...discoverArtifact(), candidates: [one, one] })).toContain('candidates: two candidates have the id');
  });

  it('refuses a skipped source with no reason', () => {
    expect(problem(DiscoverArtifact, { ...discoverArtifact(), skipped: [{ source: 'Gantry Daily', reason: '' }] })).toContain('skipped.0.reason:');
  });

  it('refuses a candidate that is not valid', () => {
    expect(problem(DiscoverArtifact, { ...discoverArtifact(), candidates: [{ ...candidate(), tier: 7 }] })).toContain('candidates.0.tier:');
  });
});

describe('SelectArtifact', () => {
  it('accepts a chosen story with its tier-1 address', () => {
    expect(problem(SelectArtifact, selectArtifact())).toBe('');
  });

  it('accepts a chosen story that has no tier-1 address', () => {
    expect(problem(SelectArtifact, { ...selectArtifact(), tier1Url: null })).toBe('');
  });

  it('accepts no story at all, with the reasons', () => {
    expect(problem(SelectArtifact, { date: RUN_DATE, chosen: null, reasons: ['Nothing met the bar.'], tier1Url: null, shortlist: [] })).toBe('');
  });

  it('refuses a tier-1 address when no story was chosen', () => {
    const none = { date: RUN_DATE, chosen: null, reasons: [], tier1Url: 'https://www.fixture-robotics.example/news/x', shortlist: [] };
    expect(problem(SelectArtifact, none)).toContain('tier1Url: no story was chosen, so there is no tier-1 address');
  });

  it('refuses a chosen story that is not on the shortlist', () => {
    expect(problem(SelectArtifact, { ...selectArtifact(), shortlist: [candidateId('https://www.mercer-wire.example/other')] })).toContain(
      'chosen: the chosen story is not on the shortlist',
    );
  });

  it('refuses a tier-1 address that is not an address', () => {
    expect(problem(SelectArtifact, { ...selectArtifact(), tier1Url: 'not a url' })).toContain('tier1Url:');
  });

  it('refuses a reason that is empty', () => {
    expect(problem(SelectArtifact, { ...selectArtifact(), reasons: [''] })).toContain('reasons.0:');
  });
});

describe('FetchArtifact', () => {
  it('accepts the documents that were fetched and the ones that were not', () => {
    expect(problem(FetchArtifact, fetchArtifact())).toBe('');
    expect(problem(FetchArtifact, { date: RUN_DATE, documents: [], failures: [] })).toBe('');
  });

  it('accepts a page with no title', () => {
    const artifact = fetchArtifact();
    expect(problem(FetchArtifact, { ...artifact, documents: [{ ...artifact.documents[0], title: '' }] })).toBe('');
  });

  it.each([
    ['a hash that is not 64 hex characters', { hash: 'abc' }, 'documents.0.hash:'],
    ['a hash in capitals', { hash: 'A'.repeat(64) }, 'documents.0.hash:'],
    ['a negative size', { bytes: -1 }, 'documents.0.bytes:'],
    ['a size that is not whole', { bytes: 1.5 }, 'documents.0.bytes:'],
    ['a tier that is not 1 or 2', { tier: 0 }, 'documents.0.tier:'],
    ['a retrieval time that is only a day', { retrievedAt: '2026-10-05' }, 'documents.0.retrievedAt:'],
    ['a final address that is not an address', { finalUrl: 'x' }, 'documents.0.finalUrl:'],
  ])('refuses %s', (_name, change, fragment) => {
    const artifact = fetchArtifact();
    expect(problem(FetchArtifact, { ...artifact, documents: [{ ...artifact.documents[0], ...change }] })).toContain(fragment);
  });

  it('refuses a failure with no reason', () => {
    expect(problem(FetchArtifact, { ...fetchArtifact(), failures: [{ url: 'https://www.mercer-wire.example/a', tier: 2, reason: '' }] })).toContain('failures.0.reason:');
  });

  it('refuses a field it does not know', () => {
    const artifact = fetchArtifact();
    expect(problem(FetchArtifact, { ...artifact, documents: [{ ...artifact.documents[0], text: 'the page text' }] })).toContain('Unrecognized key');
  });
});

describe('writeArtifact', () => {
  it('writes the artifact as JSON with two-space indents, sorted keys and a final newline', async () => {
    const dir = freshDir();
    const file = await writeArtifact(dir, '02-select', { ...selectArtifact(), chosen: null, tier1Url: null, shortlist: [], reasons: ['none'] }, SelectArtifact);
    expect(file).toBe(path.join(dir, '02-select.json'));
    expect(readFileSync(file, 'utf8')).toBe(
      ['{', '  "chosen": null,', '  "date": "2026-10-05",', '  "reasons": [', '    "none"', '  ],', '  "shortlist": [],', '  "tier1Url": null', '}', ''].join('\n'),
    );
  });

  it('writes the same bytes whatever order the keys were built in', async () => {
    const forward = { date: RUN_DATE, candidates: [], skipped: [] };
    const backward = { skipped: [], candidates: [], date: RUN_DATE };
    const a = await writeArtifact(freshDir(), '01-discover', forward, DiscoverArtifact);
    const b = await writeArtifact(freshDir(), '01-discover', backward, DiscoverArtifact);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });

  it('sorts the keys of every object, at every depth', async () => {
    const file = await writeArtifact(freshDir(), '01-discover', discoverArtifact(), DiscoverArtifact);
    const keys = [...readFileSync(file, 'utf8').matchAll(/^\s*"([a-zA-Z0-9]+)":/gm)].map((match) => match[1]);
    // Top level: candidates, date, skipped; then the first candidate: beats, id, origin, outlet, publishedAt, tier, title, url.
    expect(keys.slice(0, 1)).toEqual(['candidates']);
    expect(keys.slice(1, 9)).toEqual(['beats', 'id', 'origin', 'outlet', 'publishedAt', 'tier', 'title', 'url']);
  });

  it('writes a field that is not set as no field at all', async () => {
    const file = await writeArtifact(freshDir(), '01-discover', discoverArtifact(), DiscoverArtifact);
    const written = JSON.parse(readFileSync(file, 'utf8')) as DiscoverArtifact;
    expect(Object.keys(written.candidates[1] ?? {})).not.toContain('publishedAt');
  });

  it('creates the run folder', async () => {
    const dir = freshDir();
    expect(existsSync(dir)).toBe(false);
    await writeArtifact(dir, '03-fetch', fetchArtifact(), FetchArtifact);
    expect(readdirSync(dir)).toEqual(['03-fetch.json']);
  });

  it('writes nothing, not even the folder, for an artifact that does not match its schema', async () => {
    const dir = freshDir();
    await expect(writeArtifact(dir, '03-fetch', { ...fetchArtifact(), date: 'yesterday' }, FetchArtifact)).rejects.toThrow('03-fetch.json does not match its schema: date:');
    expect(existsSync(dir)).toBe(false);
  });

  it('replaces the artifact of an earlier run of the same stage', async () => {
    const dir = freshDir();
    await writeArtifact(dir, '01-discover', discoverArtifact(), DiscoverArtifact);
    await writeArtifact(dir, '01-discover', { date: RUN_DATE, candidates: [], skipped: [] }, DiscoverArtifact);
    expect(await readArtifact(dir, '01-discover', DiscoverArtifact)).toEqual({ date: RUN_DATE, candidates: [], skipped: [] });
    expect(readdirSync(dir)).toEqual(['01-discover.json']);
  });

  it.each(['discover', '1-discover', '01-', '01-Discover', '../01-discover', '01-discover/x', '01-discover.json', ''])('refuses %j as an artifact name', async (name) => {
    await expect(writeArtifact(freshDir(), name, discoverArtifact(), DiscoverArtifact)).rejects.toThrow('is not an artifact name');
  });
});

describe('readArtifact', () => {
  it('reads back what was written', async () => {
    const dir = freshDir();
    await writeArtifact(dir, '01-discover', discoverArtifact(), DiscoverArtifact);
    await writeArtifact(dir, '02-select', selectArtifact(), SelectArtifact);
    await writeArtifact(dir, '03-fetch', fetchArtifact(), FetchArtifact);
    expect(await readArtifact(dir, '01-discover', DiscoverArtifact)).toEqual(discoverArtifact());
    expect(await readArtifact(dir, '02-select', SelectArtifact)).toEqual(selectArtifact());
    expect(await readArtifact(dir, '03-fetch', FetchArtifact)).toEqual(fetchArtifact());
  });

  it('says which artifact is missing, and where', async () => {
    const dir = freshDir();
    await expect(readArtifact(dir, '02-select', SelectArtifact)).rejects.toThrow(`the artifact 02-select.json is not in ${dir}`);
  });

  it('refuses a file that is not JSON', async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '01-discover.json'), '{"date": ');
    await expect(readArtifact(dir, '01-discover', DiscoverArtifact)).rejects.toThrow('01-discover.json is not valid JSON');
  });

  it('refuses a file that does not match the schema, and names the field', async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '03-fetch.json'), JSON.stringify({ date: RUN_DATE, documents: [{ ...fetchArtifact().documents[0], hash: 'abc' }], failures: [] }));
    await expect(readArtifact(dir, '03-fetch', FetchArtifact)).rejects.toThrow('03-fetch.json does not match its schema: documents.0.hash:');
  });

  it('refuses a name that is not an artifact name', async () => {
    await expect(readArtifact(freshDir(), '../etc', DiscoverArtifact)).rejects.toThrow('is not an artifact name');
  });
});
