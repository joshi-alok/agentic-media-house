import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';

// The fixture pieces are what the site shows when it is built with
// ROBYWIRE_FIXTURES=1. They are generated, never written by hand, and every
// one of them has passed the whole gate.

const GOLDEN_SLUG = GOLDEN_DRAFT.slug;
const SLUGS = [
  GOLDEN_SLUG,
  'fixture-robotics-ships-fx-2-to-second-plant',
  'fixture-robotics-ships-fx-3-to-second-plant',
  'fixture-robotics-ships-fx-4-to-second-plant',
];

const scratch: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-fixtures-'));
  scratch.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const files = fixtureFiles();
const text = (name: string): string => {
  const content = files.get(name);
  if (content === undefined) throw new Error(`no fixture file ${name}`);
  return content;
};

describe('fixtureFiles: what is generated', () => {
  it('has a piece and a ledger for each of the four slugs, and the desk state', () => {
    expect([...files.keys()].sort()).toEqual(
      [...SLUGS.flatMap((slug) => [`news/${slug}.mdx`, `ledger/${slug}.json`]), 'desk-state.json'].sort(),
    );
  });

  it('lists the files in a fixed order', () => {
    const names = [...files.keys()];
    expect(names).toEqual([...names].sort());
  });

  it('generates identical files every time', () => {
    expect([...fixtureFiles().entries()]).toEqual([...files.entries()]);
  });

  it('ends every file with a single newline', () => {
    for (const [name, content] of files) {
      expect(content.endsWith('\n'), name).toBe(true);
      expect(content.endsWith('\n\n'), name).toBe(false);
    }
  });
});

describe('fixtureFiles: a fixture must be publishable', () => {
  it('stops, naming the piece and the failure, when a piece does not pass the gate', () => {
    const broken = fixturePieces();
    broken[1]!.input.draft.opening = [];
    expect(() => fixtureFiles(broken)).toThrow(
      'generate-fixtures: the fixture fixture-robotics-ships-fx-2-to-second-plant does not publish (route revise: G2_OPENING_LENGTH',
    );
  });
});

describe('fixtureFiles: the pieces', () => {
  it('dates the golden piece 4 Oct 2026 and the variants one day earlier each', () => {
    const dates = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).publishedAt);
    expect(dates).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
  });

  it('files the golden piece under industrial-warehouse and funding, and gives the others other beats', () => {
    const categories = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).categories);
    expect(categories).toEqual([['industrial-warehouse', 'funding'], ['humanoids'], ['policy-standards'], ['home-consumer', 'field-mobility']]);
  });

  it.each(SLUGS.map((slug, at) => [slug, at + 1] as const))('%s: ledger and MDX agree and the gate said publish', (slug, run) => {
    const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
    expect(ledger.slug).toBe(slug);
    expect(ledger.runId).toBe(`fixture-run-${run}`);
    expect(ledger.gate.route).toBe('publish');
    expect(Object.values(ledger.gate.checks).every((result) => result === 'pass')).toBe(true);

    const mdx = text(`news/${slug}.mdx`);
    const front = NewsFrontmatter.parse(parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(mdx)![1]!));
    expect(front.title).toBe(ledger.title);
    expect(front.publishedAt).toBe(ledger.publishedAt);
    expect(front.categories).toEqual(ledger.categories);
    expect(mdx).toContain(`](/news/${slug}/receipts/#c-1)`);
  });

  it('gives the corrected piece an updatedAt on the day of its correction, and no other piece one', () => {
    const frontmatter = (slug: string) => NewsFrontmatter.parse(parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(text(`news/${slug}.mdx`))![1]!));
    const state = DeskState.parse(JSON.parse(text('desk-state.json')));
    expect(state.corrections[0]!.at.slice(0, 10)).toBe('2026-10-03');
    expect(frontmatter(SLUGS[1]!).updatedAt).toBe('2026-10-03');
    expect(text(`news/${SLUGS[1]}.mdx`)).toContain('publishedAt: "2026-10-03"\nupdatedAt: "2026-10-03"\ncategories:');
    for (const slug of [SLUGS[0]!, SLUGS[2]!, SLUGS[3]!]) expect(frontmatter(slug).updatedAt, slug).toBeUndefined();
  });

  it('names a different product in each piece', () => {
    const titles = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).title);
    expect(titles.map((title) => /FX-(\d)/.exec(title)![1])).toEqual(['1', '2', '3', '4']);
  });

  it('only cites sources on .example domains, so nothing in a fixture can be mistaken for a real source', () => {
    for (const slug of SLUGS) {
      const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
      for (const source of ledger.sources) expect(new URL(source.url).hostname.endsWith('.example'), source.url).toBe(true);
    }
  });

  it('dates each variant retrieval on the day of that variant', () => {
    const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${SLUGS[1]}.json`)));
    expect(ledger.sources.every((source) => source.retrievedAt === '2026-10-03T04:30:00Z')).toBe(true);
  });
});

describe('fixtureFiles: the desk state', () => {
  const state = DeskState.parse(JSON.parse(text('desk-state.json')));

  it('records a published last run for the golden piece', () => {
    expect(state.lastRun).toEqual({ at: '2026-10-04T04:41:12Z', outcome: 'published', runId: 'fixture-run-1', slug: GOLDEN_SLUG });
  });

  it('records two holds, with a gate code and the tier-2 reason, on days with no piece', () => {
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
    expect(state.holds[0]!.prUrl).toBe('https://github.example/robywire/robywire/pull/12');
    expect(state.holds[1]!.prUrl).toBeUndefined();
  });

  it('records one correction, against one of the fixture pieces', () => {
    expect(state.corrections).toHaveLength(1);
    expect(state.corrections[0]!.slug).toBe(SLUGS[1]);
    expect(state.corrections[0]!.kind).toBe('correction');
  });
});

describe('writeFixtures', () => {
  it('writes exactly the generated files under the folder it is given', () => {
    const dir = tempDir();
    const written = writeFixtures(dir);
    expect(written.sort()).toEqual([...files.keys()].sort());
    for (const [name, content] of files) expect(readFileSync(path.join(dir, name), 'utf8')).toBe(content);
  });

  it('removes a stale piece left over from an earlier run', () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'news'), { recursive: true });
    writeFileSync(path.join(dir, 'news', 'old-piece.mdx'), 'old\n');
    writeFixtures(dir);
    expect(existsSync(path.join(dir, 'news', 'old-piece.mdx'))).toBe(false);
  });
});

describe('main', () => {
  it('writes to the folder given with --out', () => {
    const dir = tempDir();
    main(['--out', dir]);
    expect(readFileSync(path.join(dir, 'desk-state.json'), 'utf8')).toBe(text('desk-state.json'));
  });

  it('refuses --out with no folder', () => {
    expect(() => main(['--out'])).toThrow('--out needs a folder');
  });

  it('refuses an argument it does not know', () => {
    expect(() => main(['--oops'])).toThrow('unknown argument: --oops');
  });
});
