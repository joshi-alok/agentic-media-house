import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defaultContext } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { DEMO_DATE } from '../../src/demo/world';
import { loadConfig } from '../../src/config';
import { FakeClient } from '../../src/model/fake';
import { useScratch } from '../support/context';
import { SELECT, setupRun, unentailed } from '../support/run';
import { filesBelow } from '../support/site';
import { ROOT, loadWorkflow, stepNamed } from '../support/workflow';

// The workflow keeps the folder of the runs as an artifact for 14 days, and the artifacts of a public repository can be read by anyone. The pages that the Desk reads are
// somebody else's text, and the repository may hold only the short quotations of the claims (at most `spanMax` characters each) and hashes. This is made true by
// construction, in two places that these tests hold: the snapshots are in the evidence store and not in `runs/` (with `evidence.kind: r2` there is no folder of evidence at
// all), and every file that a run writes into `runs/` is of a kind that is known and checked here. So a run of every kind of ending is made in the made-up world, every file
// it wrote is listed by kind, and no string in any of them shares with any page more than a quotation's length of characters.

const scratch = useScratch();

/** The most characters of a page that an artifact may hold in one piece: the longest quotation that the gate accepts. */
const QUOTATION_MAX = defaultContext().config.spanMax;

/** The kinds of file that the orchestrator writes into the folder of a run, each with how a name of that kind looks. A file of a kind that is not here fails the test below. */
const KINDS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'the artifact of a stage', pattern: /^\d{2}-[a-z]+\.json$/ },
  { kind: 'a held draft', pattern: /^held\/[a-z0-9-]+\.json$/ },
  { kind: 'a recorded reply of the model', pattern: /^cassettes\/[0-9a-f]{64}\.json$/ },
  { kind: 'the record of the run', pattern: /^run\.json$/ },
];

/** The kind of the file `name`, a path below the folder of its day. */
const kindOf = (name: string): string | undefined => KINDS.find(({ pattern }) => pattern.test(name))?.kind;

/** The length of the longest run of characters that `a` and `b` have in common, one after the other in both. */
function longestCommonRun(a: string, b: string): number {
  let longest = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = (previous[j - 1] as number) + 1;
        if ((row[j] as number) > longest) longest = row[j] as number;
      }
    }
    previous = row;
  }
  return longest;
}

/** Every string in a value read from JSON (the values, not the names of the fields). */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn);
  return [];
};

/** The patterns of an upload step, one to a line, as the action reads them: a line that starts with `!` takes files out. */
function uploaded(patterns: string, files: readonly string[]): string[] {
  const regexp = (glob: string): RegExp =>
    new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`);
  const lines = patterns.split('\n').filter((line) => line.trim() !== '');
  const wanted = lines.filter((line) => !line.startsWith('!')).map(regexp);
  const unwanted = lines.filter((line) => line.startsWith('!')).map((line) => regexp(line.slice(1)));
  return files.filter((file) => wanted.some((pattern) => pattern.test(file)) && !unwanted.some((pattern) => pattern.test(file)));
}

/** A run of the made-up world that ends the way `how` says, with its replies recorded as the workflow's runs are. Not dry: the piece is published to a made-up site. */
async function aRun(how: 'published' | 'held' | 'no-story' | 'failed') {
  const made = setupRun(scratch, {
    record: true,
    ...(how === 'held' ? { fake: unentailed() } : {}),
    // No story because Extract keeps too few claims: the pages were fetched, so they are in the store.
    ...(how === 'no-story' ? { fake: new FakeClient().script('select', SELECT).script('extract', { claims: [] }) } : {}),
    ...(how === 'failed'
      ? {
          stages: {
            compose: async () => {
              throw new Error('the composer fell over');
            },
          },
        }
      : {}),
  });
  const result = await made.run();
  expect(result.outcome).toBe(how);
  const day = path.join(made.config.runDir, DEMO_DATE);
  const pages = readdirSync(made.config.evidenceDir)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => readFileSync(path.join(made.config.evidenceDir, name), 'utf8'));
  return { day, files: filesBelow(day), pages };
}

const ENDINGS = ['published', 'held', 'no-story', 'failed'] as const;

describe('the folder of a run, as the workflow uploads it', () => {
  it.each(ENDINGS)('has only files of the kinds that are known, when the run %s', async (how) => {
    const { files } = await aRun(how);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(kindOf(file), file).toBeDefined();
  });

  it('has, over the four ways that a run can end, every kind that there is and no other: a new kind of file makes this test fail, so that someone decides whether it may be public', async () => {
    const kinds = new Set<string>();
    for (const how of ENDINGS) for (const file of (await aRun(how)).files) kinds.add(kindOf(file) as string);
    expect([...kinds].sort()).toEqual(KINDS.map(({ kind }) => kind).sort());
  });

  it.each(ENDINGS)('holds no more of any page than the length of a quotation, in any string of any file, when the run %s', async (how) => {
    const { day, files, pages } = await aRun(how);
    expect(pages.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(path.join(day, file), 'utf8');
      for (const string of stringsIn(JSON.parse(text))) {
        for (const page of pages) expect(longestCommonRun(string, page), `${file} shares ${longestCommonRun(string, page)} characters in a row with a page`).toBeLessThanOrEqual(QUOTATION_MAX);
      }
    }
  });

  it('does hold the quotations of its claims, so that the test above is looking at something', async () => {
    const { day, pages } = await aRun('published');
    const quotes = (JSON.parse(readFileSync(path.join(day, '04-extract.json'), 'utf8')) as { claims: { span: { quote: string } }[] }).claims.map((claim) => claim.span.quote);
    expect(quotes.length).toBeGreaterThan(3);
    for (const quote of quotes) expect(pages.some((page) => page.includes(quote))).toBe(true);
  });

  it('keeps no snapshot: not a file of text of a page, whatever its name', async () => {
    const { day, files, pages } = await aRun('published');
    for (const file of files) for (const page of pages) expect(readFileSync(path.join(day, file), 'utf8'), file).not.toContain(page);
  });
});

describe('longestCommonRun, which says how much of a page is in a string', () => {
  const page = 'Fixture Robotics announced that deliveries have started to a second plant, and the company said the arm needs no new safety cage.';

  it('says the length of the longest stretch that the two have in common, and 0 for none', () => {
    expect(longestCommonRun('abcdef', 'xxcdexx')).toBe(3);
    expect(longestCommonRun('abc', 'xyz')).toBe(0);
    expect(longestCommonRun('', 'xyz')).toBe(0);
    expect(longestCommonRun(page, page)).toBe(page.length);
  });

  it('finds a page that is copied into a longer string, so a leak of the whole page would fail the test', () => {
    const leaked = `{"notes": "${page}${page}"}`;
    expect(longestCommonRun(leaked, page)).toBe(page.length);
    expect(longestCommonRun(leaked, page + page)).toBe(page.length * 2);
    expect(longestCommonRun(`${page.slice(0, 40)}-${page.slice(40)}`, page)).toBeLessThan(page.length);
  });
});

describe('desk.yml: what the artifact step takes', () => {
  const patterns = stepNamed(loadWorkflow('desk.yml'), 'Keep the artifacts of the run for 14 days').with!.path as string;

  it('takes every file of every kind that a run writes, below the folder that the settings give the runs', async () => {
    const { runDir } = loadConfig(`${ROOT}desk.config.yml`);
    const all: string[] = [];
    for (const how of ENDINGS) all.push(...(await aRun(how)).files.map((file) => `${runDir}/${DEMO_DATE}/${file}`));
    expect(all.length).toBeGreaterThan(10);
    expect(uploaded(patterns, all)).toEqual(all);
  });

  it('takes nothing else: not the evidence, not the trials of `desk tune`, not the site, not the settings, not a file that begins with a dot', () => {
    const others = [
      'evidence/1f1ad911cc7868886e36831a9bee848782f8f6d838d715e448c149f012762e8f.txt',
      'evidence/1f1ad911cc7868886e36831a9bee848782f8f6d838d715e448c149f012762e8f.json',
      'runs/tune/20261006-120000/evidence/abc.txt',
      'runs/tune/20261006-120000/tune.json',
      'site/src/content/news/a-piece.mdx',
      'desk.config.yml',
      '.env',
      'package.json',
    ];
    expect(uploaded(patterns, others)).toEqual([]);
  });

  it('is told by this test what it takes: a pattern that took the evidence would take its file', () => {
    expect(uploaded('runs/**\nevidence/**', ['evidence/a.txt', 'runs/x/run.json'])).toEqual(['evidence/a.txt', 'runs/x/run.json']);
    expect(uploaded('runs/**\n!runs/tune/**', ['runs/tune/x/run.json', 'runs/2026-10-05/run.json'])).toEqual(['runs/2026-10-05/run.json']);
  });
});
