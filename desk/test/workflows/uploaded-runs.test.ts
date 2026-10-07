import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defaultContext } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { DEMO_DATE } from '../../src/demo/world';
import { PackedRun, PackedStage, packArtifact, packRun } from '../../src/run/pack';
import { FakeClient } from '../../src/model/fake';
import { useScratch } from '../support/context';
import { SELECT, setupRun, unentailed } from '../support/run';
import { filesBelow } from '../support/site';
import { loadWorkflow, stepNamed } from '../support/workflow';

// The workflow keeps a PACK of the run as an artifact for 14 days (`desk pack-artifact`), and the artifacts of a public repository can be read by anyone. The pages that the Desk reads are
// somebody else's text, and what a model wrote about them is not the repository's to print either. This is made true by construction, in two places that these tests hold: every file
// that a run writes into its folder is of a kind that is known and checked here (a new kind fails the test, so that somebody decides whether it may go in the pack), and the pack is made by
// naming the fields that go in (test/run/pack.test.ts tries to make anything else go in). So a run of every kind of ending is made in the made-up world, packed, and nothing in the pack
// shares with any page more than a few characters, and the upload step takes the pack and nothing else.

const scratch = useScratch();

/** The most characters of a page that the pack may hold in one piece: no more than a hash or a number could share with a text by chance. A run that is not packed may hold a quotation, which is up to `spanMax` characters. */
const PACK_MAX = 20;
/** What the gate accepts as one quotation of a page, which the folder of a run holds, and the pack never does. */
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

describe('the folder of a run', () => {
  it.each(ENDINGS)('has only files of the kinds that are known, when the run %s', async (how) => {
    const { files } = await aRun(how);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(kindOf(file), file).toBeDefined();
  });

  it('has, over the four ways that a run can end, every kind that there is and no other: a new kind of file makes this test fail, so that someone decides whether it may be packed', async () => {
    const kinds = new Set<string>();
    for (const how of ENDINGS) for (const file of (await aRun(how)).files) kinds.add(kindOf(file) as string);
    expect([...kinds].sort()).toEqual(KINDS.map(({ kind }) => kind).sort());
  });

  it.each(ENDINGS)('holds no more of any page than the length of a quotation, in any string of any file, when the run %s: that is the folder, which is not uploaded', async (how) => {
    const { day, files, pages } = await aRun(how);
    expect(pages.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const string of stringsIn(JSON.parse(readFileSync(path.join(day, file), 'utf8')))) {
        for (const page of pages) expect(longestCommonRun(string, page), `${file} shares ${longestCommonRun(string, page)} characters in a row with a page`).toBeLessThanOrEqual(QUOTATION_MAX);
      }
    }
  });

  it('does hold the quotations of its claims, so that the tests of the pack are looking at something', async () => {
    const { day, pages } = await aRun('published');
    const quotes = (JSON.parse(readFileSync(path.join(day, '04-extract.json'), 'utf8')) as { claims: { span: { quote: string } }[] }).claims.map((claim) => claim.span.quote);
    expect(quotes.length).toBeGreaterThan(3);
    for (const quote of quotes) expect(pages.some((page) => page.includes(quote))).toBe(true);
  });
});

describe('the pack of a run, as the workflow uploads it', () => {
  it.each(ENDINGS)('holds no more of any page than a few characters in a row, and no quotation, when the run ends %s', async (how) => {
    const { day, pages } = await aRun(how);
    expect(pages.length).toBeGreaterThan(0);
    const quotes = (JSON.parse(readFileSync(path.join(day, '04-extract.json'), 'utf8')) as { claims: { span: { quote: string } }[] }).claims.map((claim) => claim.span.quote);
    for (const [file, text] of Object.entries(await packRun(day))) {
      for (const string of stringsIn(JSON.parse(text))) {
        for (const page of pages) expect(longestCommonRun(string, page), `${file} shares ${longestCommonRun(string, page)} characters in a row with a page`).toBeLessThanOrEqual(PACK_MAX);
      }
      for (const quote of quotes) expect(text, file).not.toContain(quote);
    }
  });

  it.each(ENDINGS)('is a run.json and the files of the stages that left an artifact, each valid, and nothing else, when the run %s', async (how) => {
    const { day, files } = await aRun(how);
    const out = path.join(scratch(), 'pack');
    const packed = await packArtifact(day, out);
    expect(readdirSync(out).sort()).toEqual(packed?.files);
    const stages = files.filter((file) => /^\d{2}-[a-z]+\.json$/.test(file));
    expect(packed?.files).toEqual([...stages, 'run.json'].sort());
    for (const file of packed?.files ?? []) {
      const data: unknown = JSON.parse(readFileSync(path.join(out, file), 'utf8'));
      if (file === 'run.json') PackedRun.parse(data);
      else PackedStage.parse(data);
    }
  });

  it('is small: each file of it is a few hundred bytes, and the whole of it a few kilobytes, for every ending', async () => {
    for (const how of ENDINGS) {
      const sizes = Object.values(await packRun((await aRun(how)).day)).map((text) => Buffer.byteLength(text, 'utf8'));
      expect(Math.max(...sizes)).toBeLessThan(4096);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(12 * 1024);
    }
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
  const workflow = loadWorkflow('desk.yml');
  const pack = stepNamed(workflow, 'Pack the run, with nothing in it that a model or a page wrote');
  const upload = stepNamed(workflow, 'Keep the artifacts of the run for 14 days');

  it('takes the folder that the pack step writes, and nothing else: not runs/, not the evidence, not the trials of `desk tune`, not the site, not the settings', () => {
    expect(pack.run).toBe('npm run desk -- pack-artifact "runs/$(date -u +%F)" "$RUNNER_TEMP/desk-run"');
    expect(upload.with).toEqual({ name: 'desk-runs', path: '${{ runner.temp }}/desk-run', 'retention-days': 14, 'if-no-files-found': 'ignore' });
    // The folder that is packed and the folder that is uploaded are one place: RUNNER_TEMP is what `runner.temp` says.
    expect(String(upload.with?.path)).toBe('${{ runner.temp }}/desk-run');
    const patterns = String(upload.with?.path);
    for (const other of ['runs', 'evidence', 'runs/tune', 'site', 'desk.config.yml', '.env']) expect(patterns).not.toContain(other);
  });

  it('is asked after the run whatever way it ended, and is not an error for a day that has no folder of runs', () => {
    expect(pack.if).toBe('${{ !cancelled() }}');
    expect(upload.if).toBe('${{ !cancelled() }}');
    expect(upload.with?.['if-no-files-found']).toBe('ignore');
  });
});
