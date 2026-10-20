import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { G1_CODES, checkG1 } from '../src/checks';
import { defaultContext } from '../src/config';
import { cloneGolden, makeVariant } from '../src/fixtures';
import type { GateInput, GateResult } from '../src/gate';
import { NewsFrontmatter, renderDraft } from '../src/render';
import { mutate } from './helpers';

// G1 checks the frontmatter of a draft; NewsFrontmatter is what the site checks
// when it builds the page. If the two disagree, a piece can pass the gate and
// then fail the build, which opens a pull request instead of going back for
// revision. This file runs one list of drafts through both and fails if they
// ever disagree:
//
//   1. whenever G1 has no complaint about the frontmatter, the frontmatter the
//      renderer writes satisfies the schema; and
//   2. whenever G1 rejects the frontmatter, the schema rejects it too, or
//      changes it (trims it), or the renderer refuses to write it.
//
// G1_SLUG_FORMAT is left out of the second rule: the slug is the name of the
// file, not a frontmatter field. A date before the year 1000 is not tested:
// G1 rejects it and the schema accepts it, which cannot make a piece fail the build.

const FRONTMATTER_CODES: readonly string[] = G1_CODES.filter((code) => code !== 'G1_SLUG_FORMAT');

const PUBLISH: GateResult = {
  route: 'publish',
  failures: [],
  warnings: [],
  holdReasons: [],
  checks: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' },
};

/** What the schema makes of the frontmatter the renderer writes for `input`; undefined if the renderer refuses the draft. */
function schemaSays(input: GateInput) {
  let mdx: string;
  try {
    mdx = renderDraft(input.draft, input.claims, { runId: 'consistency', gate: PUBLISH }).mdx;
  } catch {
    return undefined;
  }
  const block = /^---\n([\s\S]*?)\n---\n/.exec(mdx)![1]!;
  return NewsFrontmatter.safeParse(parseYaml(block));
}

/** The frontmatter fields exactly as the draft has them. */
const asWritten = (input: GateInput) => ({
  title: input.draft.title.text,
  description: input.draft.description.text,
  publishedAt: input.draft.publishedAt,
  categories: input.draft.categories,
  format: 'news',
  featured: false,
  author: { name: input.draft.author.name },
});

const variant = (n: number, categories: string[], publishedAt: string): GateInput =>
  makeVariant(cloneGolden(), {
    slug: `fixture-robotics-ships-fx-${n}-to-second-plant`,
    publishedAt,
    categories,
    replace: [
      ['FX-1', `FX-${n}`],
      ['fx-1', `fx-${n}`],
    ],
  });

type Change = (copy: GateInput) => void;

/** Drafts whose frontmatter is fine. */
const ACCEPTED: [string, GateInput][] = [
  ['the golden piece', cloneGolden()],
  ['the FX-2 variant', variant(2, ['humanoids'], '2026-10-03')],
  ['the FX-3 variant', variant(3, ['policy-standards'], '2026-10-02')],
  ['the FX-4 variant', variant(4, ['home-consumer', 'field-mobility'], '2026-10-01')],
  ...(
    [
      ['a reworded description', (g) => (g.draft.description.text = 'Fixture Robotics has begun deliveries to a second plant.')],
      ['a one-word description', (g) => (g.draft.description.text = 'Shipments')],
      ['a description of exactly 155 characters', (g) => (g.draft.description.text = 'x'.repeat(155))],
      ['a description with spaces around it, 155 characters in all', (g) => (g.draft.description.text = ` ${'x'.repeat(153)} `)],
      ['a reworded title', (g) => (g.draft.title.text = 'Fixture Robotics starts deliveries to its second plant')],
      ['a one-word title', (g) => (g.draft.title.text = 'Funding')],
      ['reordered categories', (g) => (g.draft.categories = ['funding', 'industrial-warehouse'])],
      ['another beat', (g) => (g.draft.categories = ['software-autonomy', 'funding'])],
      ['one category', (g) => (g.draft.categories = ['components-supply-chain'])],
      ['an extra category within the vocabulary', (g) => (g.draft.categories = ['industrial-warehouse', 'field-mobility', 'funding'])],
      ['a leap day', (g) => (g.draft.publishedAt = '2028-02-29')],
      ['the end of the year', (g) => (g.draft.publishedAt = '2026-12-31')],
      ['a title with quotation marks and a colon', (g) => (g.draft.title.text = 'Fixture says: "ships"')],
      ['a description with a hash and a dash', (g) => (g.draft.description.text = '# one - two: three')],
    ] as [string, Change][]
  ).map(([name, change]): [string, GateInput] => [name, mutate(cloneGolden(), change)]),
];

/** Drafts whose frontmatter G1 rejects. */
const REJECTED: [string, Change][] = [
  ['an empty title', (g) => (g.draft.title.text = '')],
  ['a title of spaces', (g) => (g.draft.title.text = '   ')],
  ['an empty description', (g) => (g.draft.description.text = '')],
  ['a description of spaces', (g) => (g.draft.description.text = '  \t ')],
  ['a description of 156 characters', (g) => (g.draft.description.text = 'x'.repeat(156))],
  ['a description of 156 characters with spaces at the end', (g) => (g.draft.description.text = `${'x'.repeat(150)}      `)],
  ['an impossible date', (g) => (g.draft.publishedAt = '2026-02-30')],
  ['a non-leap 29 February', (g) => (g.draft.publishedAt = '2026-02-29')],
  ['a month 13', (g) => (g.draft.publishedAt = '2026-13-01')],
  ['a date without zeros', (g) => (g.draft.publishedAt = '2026-8-4')],
  ['a date in words', (g) => (g.draft.publishedAt = '24 August 2026')],
  ['a year only', (g) => (g.draft.publishedAt = '2026')],
  ['a date with a time', (g) => (g.draft.publishedAt = '2026-10-04T00:00:00Z')],
  ['an empty date', (g) => (g.draft.publishedAt = '')],
  ['no category', (g) => (g.draft.categories = [])],
  ['four categories', (g) => (g.draft.categories = ['humanoids', 'home-consumer', 'field-mobility', 'funding'])],
  ['a repeated category', (g) => (g.draft.categories = ['humanoids', 'humanoids'])],
  ['an unknown category', (g) => (g.draft.categories = ['humanoids', 'quantum-robots'])],
  ['a category in capitals', (g) => (g.draft.categories = ['Humanoids'])],
  ['a category that is not a plain slug', (g) => (g.draft.categories = ['humanoids, funding'])],
  ['funding without a beat', (g) => (g.draft.categories = ['funding'])],
  ['funding beside an unknown category', (g) => (g.draft.categories = ['funding', 'robots'])],
  ['a blank author', (g) => (g.draft.author.name = '')],
  ['an author of spaces', (g) => (g.draft.author.name = '   ')],
  ['another author', (g) => (g.draft.author.name = 'Jane Doe')],
  ['the Desk with a space after it', (g) => (g.draft.author.name = 'Agentic Media House Desk ')],
];

describe('G1 and NewsFrontmatter: a draft that G1 accepts satisfies the schema', () => {
  it.each(ACCEPTED)('%s', (_name, input) => {
    const complaints = checkG1(input, defaultContext()).failures.filter((failure) => FRONTMATTER_CODES.includes(failure.code));
    expect(complaints).toEqual([]);
    const result = schemaSays(input);
    expect(result?.success, JSON.stringify(result)).toBe(true);
  });
});

describe('G1 and NewsFrontmatter: a draft that G1 rejects is rejected or changed by the schema', () => {
  it.each(REJECTED)('%s', (_name, change) => {
    const input = mutate(cloneGolden(), change);
    const complaints = checkG1(input, defaultContext()).failures.filter((failure) => FRONTMATTER_CODES.includes(failure.code));
    expect(complaints.length).toBeGreaterThan(0);

    const result = schemaSays(input);
    if (result === undefined) return; // the renderer refuses to write the draft at all
    const unchanged = result.success && JSON.stringify(result.data) === JSON.stringify(asWritten(input));
    expect(unchanged, 'the schema accepts, as written, a frontmatter that G1 rejects').toBe(false);
  });

  it('covers every code of G1 that is about the frontmatter', () => {
    const covered = new Set(
      REJECTED.flatMap(([, change]) =>
        checkG1(mutate(cloneGolden(), change), defaultContext()).failures.map((failure) => failure.code),
      ),
    );
    expect([...covered].sort()).toEqual([...FRONTMATTER_CODES].sort());
  });
});
