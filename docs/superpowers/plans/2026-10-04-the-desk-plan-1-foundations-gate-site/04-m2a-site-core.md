## Milestone 2 (part A) — Renderer, fixtures and the site's core pages

**Goal:** turn the gate's work into a website. This part adds the renderer that turns a gated draft into an MDX file and a ledger entry, generates four fictional fixture pieces from the golden piece, and builds the core of the Astro site: the layout, the design system, the article page, the receipts page, the home page with its ledger strip, and one page for every beat. The site runs on fixtures here. A production build has no pieces, and shows an honest empty site instead. Nothing touches the network at run time, and no model is called.

**Starting state:** Milestones 0 and 1 are finished and committed. `npm run typecheck`, `npm test` and `npm run evals:seeded` pass. `gate/src/index.ts` exports the schemas (`Draft`, `Claim`, `LedgerEntry`, `DeskState`), the checks, `runGate`, `defaultContext` and `allSentences`; `gate/src/fixtures/` holds the golden piece (`cloneGolden()`, `GOLDEN_DRAFT`, `GOLDEN_CLAIMS`); `gate/test/helpers.ts` holds the test helpers `mutate`, `findSentence` and `claimById`. `site/` holds only a `package.json` with no scripts and no dependencies. Node 22 and npm 10 or newer are installed.

**What you need to know about the gate (a reminder).** A *draft* is made of *sentences* of kind `fact`, `analysis` or `limitation`; a sentence cites *claims* by id; `runGate(input, ctx)` runs checks G1 to G9 and returns a `route` of `publish`, `revise` or `hold`. `allSentences(draft)` lists every sentence of a draft in document order with its section. A *ledger entry* (`LedgerEntry`) is the public record of a published piece: its claims, the order in which the article first cites them, its sentences and the gate result. The golden piece is a complete, fictional news article (Fixture Robotics, the FX-1 arm, `*.example` domains) that passes every check.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one gate test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts`. For the site use `npm test --workspace @robywire/site -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- `npm install --save-exact` writes the exact version into `package.json`. Never use ranges (`^`, `~`), and never run `npm update` or `npm audit fix`.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, and never type a `\uXXXX` escape. Templates use HTML entities (`&mdash;`, `&middot;`, `&larr;`); TypeScript uses `String.fromCharCode` or `String.fromCodePoint` where it needs such a character.
- Code style matches the earlier milestones: two-space indentation, single quotes, semicolons, trailing commas, `import type` for imports that are only types.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions this milestone was verified against** (installed by the tasks below): astro 7.3.5, @astrojs/mdx 8.0.2, @astrojs/markdown-satteri 0.4.2, @astrojs/check 0.9.10, sharp 0.35.5, satteri 0.10.5, diff 9.0.0, typescript 6.0.3 (repository root and `site`) and 7.0.2 (`gate` and `evals`). Vite 8.3.2 and Zod 4.6.5 come with them.

---

### Task 31: Escape sentences for MDX

**Files:**
- Create: `gate/src/render/escape.ts`
- Test: `gate/test/escape.test.ts`

The renderer of the next task writes MDX, and every sentence in it came from a model. MDX is Markdown with code allowed in it: `{1+1}` is an expression, `<script>` is an element, a line starting with `import` is JavaScript, `#` starts a heading. A sentence that contains any of these must come out on the page as the plain words it contains. `escapeMdx(text)` writes a backslash before every character that Markdown or MDX could act on, writes the characters that only matter at the start of a line (`#`, `-`, `+`, `=`, a list number, and the words `import` and `export`) in a safe form on every line of the text, and changes nothing else.

The words `import` and `export` cannot take a backslash, because a backslash before a letter would show on the page. They are broken with a numeric character reference for their first letter instead (`&#105;mport`), which MDX does not read as a keyword and the page shows as `import`.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/escape.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { escapeMdx } from '../src/render/escape';

// escapeMdx makes a sentence safe to place in MDX prose: whatever the text
// contains, it must come out as plain text and never as a heading, a list, a
// link, emphasis, an expression, a JSX element or an import. The expected
// strings below spell out each backslash twice, because they are written
// inside JavaScript string literals.

describe('escapeMdx: text that needs no escaping', () => {
  it.each([
    ['plain words', 'Plain sentence.'],
    ['an empty string', ''],
    ['a hyphen inside a word', 'FX-1 ships to the Tarnmoor plant'],
    ['digits, a dot and a slash inside a line', 'Peak tool speed is 2.3 m/s at 1.4 m reach'],
    ['a dollar amount and a percentage', 'It costs $38,000 and cuts cycle time by 18%'],
    ['straight quotes and an apostrophe', 'He said "ready" and it\'s done'],
    ['parentheses, commas, colons and semicolons', 'One (a), two: b; three'],
    ['the words import and export inside a sentence', 'Fixtures import and export parts; imports and exports differ'],
    ['a capitalised Import or Export at the start', 'Export controls tighten. Import duties rise.'],
    ['letters outside ASCII', 'caf' + String.fromCodePoint(0xe9) + ' ' + String.fromCodePoint(0x6771) + String.fromCodePoint(0x4eac)],
  ])('leaves %s alone', (_label, text) => {
    expect(escapeMdx(text)).toBe(text);
  });
});

describe('escapeMdx: characters escaped wherever they appear', () => {
  it.each([
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['a backtick', 'run `ls` now', 'run \\`ls\\` now'],
    ['an asterisk', 'a *b* c', 'a \\*b\\* c'],
    ['an underscore', 'snake_case', 'snake\\_case'],
    ['curly braces', 'Use {x} here', 'Use \\{x\\} here'],
    ['angle brackets', 'a <b> and </b>', 'a \\<b\\> and \\</b\\>'],
    ['square brackets', 'see [1] and [a](b)', 'see \\[1\\] and \\[a\\](b)'],
    ['a tilde', 'about ~5 kg', 'about \\~5 kg'],
    ['an ampersand', 'AT&T and &copy;', 'AT\\&T and \\&copy;'],
    ['a pipe', 'a | b', 'a \\| b'],
    ['a greater-than sign in the middle of a line', 'a > b', 'a \\> b'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });
});

describe('escapeMdx: characters escaped only at the start of a line', () => {
  it.each([
    ['a heading marker', '# Heading', '\\# Heading'],
    ['a second-level heading marker', '## Heading', '\\## Heading'],
    ['a bullet hyphen', '- item', '\\- item'],
    ['a bullet plus', '+ item', '\\+ item'],
    ['a block quote marker', '> quote', '\\> quote'],
    ['a numbered list marker with a dot', '1. one', '1\\. one'],
    ['a numbered list marker with a bracket', '12) twelve', '12\\) twelve'],
    ['a setext underline', '=== x', '\\=== x'],
    ['a thematic break', '--- x', '\\--- x'],
    ['a marker after leading spaces', '  - item', '  \\- item'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });

  it('applies the line-start rule to every line of a multi-line text', () => {
    expect(escapeMdx('first\n# second\n- third\n1. fourth')).toBe('first\n\\# second\n\\- third\n1\\. fourth');
  });

  it('does not escape the same characters in the middle of a line', () => {
    expect(escapeMdx('a - b + c = d # e 1. f')).toBe('a - b + c = d # e 1. f');
  });
});

describe('escapeMdx: lines that MDX would read as an import or export', () => {
  it.each([
    ['import at the start', 'import x from "y"', '&#105;mport x from "y"'],
    ['export at the start', 'export const a = 1', '&#101;xport const a = 1'],
    ['export on a later line', 'a\nexport b', 'a\n&#101;xport b'],
    ['import after leading spaces', '  import y', '  &#105;mport y'],
  ])('breaks the keyword of %s with a character reference', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });

  it('leaves a word that merely starts with the keyword', () => {
    expect(escapeMdx('important news, exported goods, imports')).toBe('important news, exported goods, imports');
  });
});

describe('escapeMdx: text that GFM would turn into a link', () => {
  it.each([
    ['a URL with a scheme', 'see https://a.example/x', 'see https:\\/\\/a.example/x'],
    ['a www address', 'see www.a.example', 'see www\\.a.example'],
    ['a WWW address in capitals', 'see WWW.A.EXAMPLE', 'see WWW\\.A.EXAMPLE'],
    ['an email address', 'write to me@a.example', 'write to me\\@a.example'],
  ])('breaks up %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });
});

describe('escapeMdx: a hostile sentence', () => {
  it('comes out with nothing live in it', () => {
    const hostile = '<script>alert(1)</script> {1+1} *bold* [x](javascript:y) `z`';
    expect(escapeMdx(hostile)).toBe('\\<script\\>alert(1)\\</script\\> \\{1+1\\} \\*bold\\* \\[x\\](javascript:y) \\`z\\`');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/escape.test.ts`
Expected: FAIL — `Cannot find module '../src/render/escape'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/render/escape.ts`:**
```ts
// Escaping for the MDX renderer. A sentence comes from a model, so it is
// treated as hostile text: after escaping, an MDX parser must read it as plain
// prose and nothing else. The rules were checked against the MDX parser that
// Astro uses (site/test/escape-mdx.test.ts runs a hostile list through it).

/** Characters that are escaped wherever they appear, by a backslash in front. */
const ALWAYS = /[\\`*_{}<>[\]~&|]/g;

/** `://` starts a GFM autolink literal. Escaping the slashes keeps the URL as text. */
const SCHEME = /:\/\//g;

/** `www.` starts a GFM autolink literal. */
const WWW = /\bwww\./gi;

/** An at sign makes an email address into a link. */
const AT_SIGN = /@/g;

/** MDX reads a line that starts with `import` or `export` as JavaScript. */
const ESM_KEYWORD = /^(\s*)(import|export)(?![\p{L}\p{N}_])/u;

/** A character that starts a heading, a list item, a setext underline or a thematic break. */
const LINE_START = /^(\s*)([#+=-]|\d+[.)])/;

function escapeLineStart(line: string): string {
  const withKeyword = line.replace(ESM_KEYWORD, (_whole, space: string, word: string) => {
    // A backslash before a letter would show up in the page. A numeric
    // character reference for the first letter hides the keyword from MDX and
    // is shown as the letter.
    return `${space}&#${word.charCodeAt(0)};${word.slice(1)}`;
  });
  return withKeyword.replace(LINE_START, (_whole, space: string, marker: string) => {
    // A numbered marker is escaped on its last character: "1." becomes "1\.".
    return /^\d/.test(marker) ? `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}` : `${space}\\${marker}`;
  });
}

/**
 * `text` made safe as MDX prose. Every character MDX or GFM could act on is
 * escaped, and the characters that only matter at the start of a line (`#`,
 * `-`, `+`, `=`, a list number, `import`, `export`) are escaped on every line of
 * the text. Rendered, the result reads exactly like `text`.
 */
export function escapeMdx(text: string): string {
  return text
    .replace(ALWAYS, (char) => `\\${char}`)
    .replace(SCHEME, ':\\/\\/')
    .replace(WWW, (found) => `${found.slice(0, 3)}\\.`)
    .replace(AT_SIGN, '\\@')
    .split('\n')
    .map(escapeLineStart)
    .join('\n');
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/escape.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add gate/src/render/escape.ts gate/test/escape.test.ts
git commit -m "feat(gate): escape sentences so they are plain prose in MDX" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 32: Render a draft as MDX and a ledger entry

**Files:**
- Create: `gate/src/render/frontmatter.ts`, `gate/src/render/render.ts`, `gate/src/render/index.ts`
- Modify: `gate/src/index.ts` (export the render module)
- Test: `gate/test/render.test.ts`

No text written by a model reaches the repository directly. A gated draft goes through `renderDraft(draft, claims, meta)`, which returns two things: the MDX file of the article, and the ledger entry that records where every claim came from. The renderer is a pure function of its arguments, so the same draft always gives the same bytes.

The MDX layout is fixed:
- Frontmatter, in this key order: `title` and `description` as JSON-quoted strings (JSON strings are valid YAML), `publishedAt` as a quoted `"YYYY-MM-DD"` string, `categories` as a flow list, `format: news`, `featured: false`, and `author` with its `name`.
- No H1 (the page title comes from the frontmatter). The opening sentences as one paragraph; `## Key takeaways` with one bullet per takeaway; for each section a `## heading` and one paragraph per paragraph; and, when the draft has limitation sentences, `## What we couldn't verify` with them as one paragraph.
- Every sentence is its escaped text followed by one marker link per cited claim, `[N](/news/<slug>/receipts/#<claimId>)`, with no space before or between markers. `N` is the position of the claim in `order`, counted from 1. An analysis sentence starts with `**Analysis.** `.
- `order` lists the claim ids in the order the body first cites them (opening, takeaways, sections, limitations), then any claim that only the title or the description cites.

The ledger holds the cited claims in that order, every sentence in document order with its index, section and heading, the sources of the cited claims once each (sorted by URL, taking the first claim in `order` that uses the URL), and the gate result it was given. `NewsFrontmatter` is the Zod schema of the frontmatter. The site's content collection uses the same schema in a later task, so a piece the renderer writes is a piece the site accepts.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/render.test.ts`:**
```ts
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import { NewsFrontmatter, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
import { claimById, findSentence, mutate } from './helpers';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const RECEIPTS = `/news/${SLUG}/receipts/`;

const passed = (input: GateInput): GateResult => runGate(input, defaultContext());
const metaFor = (input: GateInput, extra: Partial<RenderMeta> = {}): RenderMeta => ({
  runId: 'fixture-run-1',
  gate: passed(input),
  ...extra,
});
const render = (input: GateInput, extra: Partial<RenderMeta> = {}) => renderDraft(input.draft, input.claims, metaFor(input, extra));

/** The frontmatter text and the body of a rendered piece. */
function splitMdx(mdx: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(mdx);
  if (match === null) throw new Error('the rendered piece has no frontmatter block');
  return { frontmatter: match[1]!, body: match[2]! };
}

/** The body as blocks, split on blank lines. */
const blocks = (mdx: string): string[] => splitMdx(mdx).body.trimEnd().split('\n\n');

describe('renderDraft: the golden piece', () => {
  const golden = cloneGolden();
  const { mdx, ledger } = render(golden);

  it('starts with the frontmatter, in the contract order, with quoted strings', () => {
    expect(splitMdx(mdx).frontmatter.split('\n')).toEqual([
      'title: "Fixture Robotics ships its FX-1 warehouse arm to a second plant"',
      'description: "Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor."',
      'publishedAt: "2026-10-04"',
      'categories: [industrial-warehouse, funding]',
      'format: news',
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
  });

  it('parses as YAML and satisfies NewsFrontmatter', () => {
    const data = parseYaml(splitMdx(mdx).frontmatter) as unknown;
    expect(NewsFrontmatter.parse(data)).toEqual({
      title: golden.draft.title.text,
      description: golden.draft.description.text,
      publishedAt: '2026-10-04',
      categories: ['industrial-warehouse', 'funding'],
      format: 'news',
      featured: false,
      author: { name: 'Robywire Desk' },
    });
  });

  it('has no H1, one Key takeaways heading, three section headings and one limitations heading', () => {
    const headings = splitMdx(mdx)
      .body.split('\n')
      .filter((line) => line.startsWith('#'));
    expect(headings).toEqual([
      '## Key takeaways',
      '## What shipped',
      '## What the customer reports',
      '## What the filing shows',
      "## What we couldn't verify",
    ]);
  });

  it('puts the opening sentences in one paragraph before the first heading', () => {
    const [opening] = blocks(mdx);
    expect(opening).not.toContain('\n');
    expect(opening!.startsWith('Fixture Robotics has begun shipping its FX-1 warehouse arm')).toBe(true);
    expect(opening!.match(/\]\(/g)).toHaveLength(5);
  });

  it('writes one bullet per takeaway', () => {
    const list = blocks(mdx)[2]!;
    expect(list.split('\n')).toHaveLength(golden.draft.takeaways.length);
    expect(list.split('\n').every((line) => line.startsWith('- '))).toBe(true);
  });

  it('writes one paragraph per paragraph of each section and one for the limitations', () => {
    const all = blocks(mdx);
    // opening, 2 for takeaways, then 1 + 3 + 1 + 3 + 1 + 2 for the sections, then 1 + 1 for the limitations
    expect(all).toHaveLength(1 + 2 + (1 + 3) + (1 + 3) + (1 + 2) + (1 + 1));
    const limitations = all[all.length - 1]!;
    expect(limitations.split(' ').length).toBeGreaterThan(40);
  });

  it('follows each sentence with marker links to the receipts page, with no space before the first marker', () => {
    const opening = blocks(mdx)[0]!;
    expect(opening).toContain(`Tarnmoor.[1](${RECEIPTS}#c-1) The first site`);
  });

  it('numbers markers by the position of the claim in order and joins several markers with no space', () => {
    const opening = blocks(mdx)[0]!;
    expect(opening).toContain(`and a third site is planned.[2](${RECEIPTS}#c-23)[3](${RECEIPTS}#c-26) The company`);
  });

  it('labels the one analysis sentence and nothing else', () => {
    expect(mdx.split('**Analysis.** ')).toHaveLength(2);
    expect(mdx).toContain('**Analysis.** The measured rate sits below the datasheet maximum');
  });

  it('ends with exactly one newline and uses only newline line endings', () => {
    expect(mdx.endsWith('\n')).toBe(true);
    expect(mdx.endsWith('\n\n')).toBe(false);
    expect(mdx).not.toContain('\r');
  });

  it('is identical when rendered twice', () => {
    const again = render(cloneGolden());
    expect(again.mdx).toBe(mdx);
    expect(JSON.stringify(again.ledger)).toBe(JSON.stringify(ledger));
  });

  it('does not change the draft or the claims it was given', () => {
    const input = cloneGolden();
    render(input);
    expect(input).toEqual(cloneGolden());
  });
});

describe('renderDraft: the ledger', () => {
  const golden = cloneGolden();
  const result = passed(golden);
  const { ledger } = render(golden);

  it('parses with the LedgerEntry schema', () => {
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });

  it('carries the slug, run id, date, title and categories', () => {
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.slug).toBe(SLUG);
    expect(ledger.runId).toBe('fixture-run-1');
    expect(ledger.publishedAt).toBe('2026-10-04');
    expect(ledger.title).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
    expect(ledger.categories).toEqual(['industrial-warehouse', 'funding']);
  });

  it('lists every sentence in document order with its index, section and heading', () => {
    const located = allSentences(golden.draft);
    expect(ledger.sentences).toHaveLength(located.length);
    expect(ledger.sentences.map((s) => s.index)).toEqual(located.map((_s, at) => at));
    expect(ledger.sentences[0]).toEqual({ index: 0, section: 'title', kind: 'fact', text: golden.draft.title.text, claimIds: ['c-1'] });
    expect(ledger.sentences[1]!.section).toBe('description');
    const body = ledger.sentences.find((s) => s.section === 'body')!;
    expect(body.heading).toBe('What shipped');
    const last = ledger.sentences[ledger.sentences.length - 1]!;
    expect(last.section).toBe('limitations');
    expect(last.kind).toBe('limitation');
  });

  it('orders the claims by first appearance in the body, then claims only the title or description cite', () => {
    expect(ledger.order.slice(0, 6)).toEqual(['c-1', 'c-23', 'c-26', 'c-17', 'c-18', 'c-8']);
    expect(new Set(ledger.order).size).toBe(ledger.order.length);
  });

  it('holds exactly the cited claims, in order, as full objects', () => {
    expect(ledger.claims.map((claim) => claim.id)).toEqual(ledger.order);
    expect(ledger.claims[0]).toEqual(claimById(golden.claims, 'c-1'));
  });

  it('lists each source url once, sorted by url, with the source of the first claim in order that uses it', () => {
    const urls = ledger.sources.map((source) => source.url);
    expect(urls).toEqual([...urls].sort());
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(5);
    expect(ledger.sources[0]).toEqual({
      url: 'https://brindle-logistics.example/news/ashvale-results',
      tier: 1,
      snapshotHash: claimById(golden.claims, 'c-23').source.snapshotHash,
      retrievedAt: '2026-10-04T04:30:00Z',
    });
  });

  it('records the gate result from the meta, without a verifier unless one is given', () => {
    expect(ledger.gate).toEqual({ route: result.route, checks: result.checks, holdReasons: result.holdReasons });
    expect('verifier' in ledger).toBe(false);
  });

  it('passes a verifier through', () => {
    const verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['all sentences entailed'] };
    expect(render(golden, { verifier }).ledger.verifier).toEqual(verifier);
  });
});

describe('renderDraft: order and the claims that count as cited', () => {
  const investors = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.text === 'It lists 7 investors in the round.');

  it('appends a claim that only the title cites, after every claim the body cites', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[2]!.paragraphs[0] = g.draft.sections[2]!.paragraphs[0]!.filter((s) => s.text !== 'It lists 7 investors in the round.');
      g.draft.title.claimIds = ['c-1', 'c-19'];
    });
    const { ledger } = render(input);
    expect(ledger.order[ledger.order.length - 1]).toBe('c-19');
    expect(ledger.claims.map((claim) => claim.id)).toEqual(ledger.order);
  });

  it('leaves out a claim that nothing cites', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[2]!.paragraphs[0] = g.draft.sections[2]!.paragraphs[0]!.filter((s) => s.text !== 'It lists 7 investors in the round.');
    });
    expect(render(input).ledger.order).not.toContain('c-19');
  });

  it('repeats no marker when a sentence cites the same claim twice', () => {
    const input = mutate(cloneGolden(), (g) => {
      findSentence(g.draft, (s) => s.text === 'The filing records the first sale on 29 September 2026.').claimIds = ['c-16', 'c-16'];
    });
    const { mdx, ledger } = render(input);
    const marker = ledger.order.indexOf('c-16') + 1;
    expect(mdx).toContain(`29 September 2026.[${marker}](${RECEIPTS}#c-16) It lists 7 investors`);
  });

  it('throws, naming the claim, when a sentence cites a claim that does not exist', () => {
    const input = mutate(cloneGolden(), (g) => {
      investors(g).claimIds = ['c-99'];
    });
    expect(() => render(input)).toThrow('renderDraft: a sentence cites c-99, but no claim has that id');
  });

  it('writes no empty paragraph for an empty opening or empty takeaways', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.opening = [];
      g.draft.takeaways = [];
    });
    const { mdx } = render(input);
    expect(mdx).not.toContain('\n\n\n');
    expect(blocks(mdx)[0]).toBe('## What shipped');
  });

  it('omits the limitations heading when the draft has no limitation sentences', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.limitations = [];
    });
    expect(render(input).mdx).not.toContain("couldn't verify");
  });
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
    mutate(cloneGolden(), (g) => {
      findSentence(g.draft, (s) => s.text === 'It lists 7 investors in the round.').text = text;
    });

  it('escapes braces, angle brackets and asterisks in a sentence', () => {
    const { mdx } = render(dirty('It lists {7} investors <b>in</b> the *round*.'));
    expect(mdx).toContain('It lists \\{7\\} investors \\<b\\>in\\</b\\> the \\*round\\*.[');
    expect(mdx).not.toContain('<b>');
    expect(mdx).not.toContain('{7}');
  });

  it('escapes a heading', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[0]!.heading = 'What <shipped>';
    });
    expect(render(input).mdx).toContain('## What \\<shipped\\>');
  });

  it('keeps the ledger text exactly as written', () => {
    const { ledger } = render(dirty('It lists {7} investors.'));
    expect(ledger.sentences.some((s) => s.text === 'It lists {7} investors.')).toBe(true);
  });

  it('quotes a title with quotation marks and backslashes so that YAML reads it back unchanged', () => {
    const title = 'He said "go" and left C:\\temp';
    const input = mutate(cloneGolden(), (g) => {
      g.draft.title.text = title;
    });
    const data = parseYaml(splitMdx(render(input).mdx).frontmatter) as { title: string };
    expect(data.title).toBe(title);
  });

  it('refuses a category that is not a plain slug', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.categories = ['humanoids, funding'];
    });
    expect(() => render(input)).toThrow('renderDraft: the category "humanoids, funding" is not a plain slug');
  });
});

describe('NewsFrontmatter', () => {
  const valid = {
    title: 'A title',
    description: 'A description.',
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };

  it('accepts a valid block', () => {
    expect(NewsFrontmatter.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['an empty title', { ...valid, title: '' }],
    ['a description over 155 characters', { ...valid, description: 'x'.repeat(156) }],
    ['a date that is not a calendar date', { ...valid, publishedAt: '2026-02-30' }],
    ['no category', { ...valid, categories: [] }],
    ['four categories', { ...valid, categories: ['humanoids', 'funding', 'field-mobility', 'home-consumer'] }],
    ['a category outside the vocabulary', { ...valid, categories: ['robots'] }],
    ['another format', { ...valid, format: 'explainer' }],
    ['a key the contract does not know', { ...valid, image: 'x' }],
    ['an author without a name', { ...valid, author: { name: '' } }],
  ])('rejects %s', (_label, data) => {
    expect(NewsFrontmatter.safeParse(data).success).toBe(false);
  });
});

describe('the package index', () => {
  it('exports the renderer, the escape function and the frontmatter schema', () => {
    expect(api.renderDraft).toBe(renderDraft);
    expect(typeof api.escapeMdx).toBe('function');
    expect(api.NewsFrontmatter).toBe(NewsFrontmatter);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/render.test.ts`
Expected: FAIL — `Cannot find module '../src/render'`.

- [ ] **Step 3: Write the frontmatter schema**

**Create `gate/src/render/frontmatter.ts`:**
```ts
import { z } from 'zod';
import { CATEGORY_VOCAB } from '../constants';

/**
 * The frontmatter block of a news piece, as the content contract defines it
 * and as the renderer writes it. The site's `news` collection uses this same
 * schema, so a piece the renderer writes is a piece the site accepts, and a
 * hand-edited key the contract does not know is a build error.
 */
export const NewsFrontmatter = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1).max(155),
  publishedAt: z.iso.date(),
  categories: z.array(z.enum(CATEGORY_VOCAB)).min(1).max(3),
  format: z.literal('news'),
  featured: z.boolean(),
  author: z.strictObject({ name: z.string().min(1) }),
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
```

- [ ] **Step 4: Write the renderer**

**Create `gate/src/render/render.ts`:**
```ts
import type { GateResult } from '../gate';
import type { Claim, Draft, LedgerEntry, LedgerSentence, Sentence } from '../schemas';
import { allSentences } from '../sentences';
import type { LocatedSentence } from '../sentences';
import { escapeMdx } from './escape';

/** What the renderer needs besides the draft and the claims. */
export interface RenderMeta {
  runId: string;
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
}

/** The MDX file and the ledger entry that go with it. */
export interface RenderedPiece {
  mdx: string;
  ledger: LedgerEntry;
}

const TAKEAWAYS_HEADING = 'Key takeaways';
const LIMITATIONS_HEADING = "What we couldn't verify";
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Order by UTF-16 code units, so the result does not depend on the machine's locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The claim ids in the order the reader first meets them: the body (opening,
 * takeaways, sections, limitations) first, then any claim that only the title
 * or the description cites. The marker number of a claim is its position + 1.
 */
function claimOrder(located: readonly LocatedSentence[]): string[] {
  const inBody = located.filter((item) => item.section !== 'title' && item.section !== 'description');
  const inHead = located.filter((item) => item.section === 'title' || item.section === 'description');
  return [...new Set([...inBody, ...inHead].flatMap((item) => item.sentence.claimIds))];
}

/**
 * Render a gated draft as MDX plus its ledger entry. The output is a pure
 * function of the arguments: no clock, no randomness, newline line endings.
 * No text from the draft reaches the MDX unescaped.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
  const located = allSentences(draft);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  const order = claimOrder(located);
  for (const id of order) {
    if (!claimsById.has(id)) throw new Error(`renderDraft: a sentence cites ${id}, but no claim has that id`);
  }
  const markerOf = new Map(order.map((id, at) => [id, at + 1]));

  const receipts = `/news/${draft.slug}/receipts/`;
  const marker = (id: string) => `[${markerOf.get(id)}](${receipts}#${id})`;
  const sentence = (item: Sentence): string => {
    const label = item.kind === 'analysis' ? '**Analysis.** ' : '';
    const markers = [...new Set(item.claimIds)].map(marker).join('');
    return `${label}${escapeMdx(item.text)}${markers}`;
  };
  const paragraph = (items: readonly Sentence[]): string => items.map(sentence).join(' ');

  for (const category of draft.categories) {
    if (!PLAIN_SLUG.test(category)) throw new Error(`renderDraft: the category "${category}" is not a plain slug`);
  }
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(draft.title.text)}`,
    `description: ${JSON.stringify(draft.description.text)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    `categories: [${draft.categories.join(', ')}]`,
    'format: news',
    'featured: false',
    'author:',
    `  name: ${JSON.stringify(draft.author.name)}`,
    '---',
  ].join('\n');

  const blocks: string[] = [];
  if (draft.opening.length > 0) blocks.push(paragraph(draft.opening));
  if (draft.takeaways.length > 0) {
    blocks.push(`## ${TAKEAWAYS_HEADING}`);
    blocks.push(draft.takeaways.map((item) => `- ${sentence(item)}`).join('\n'));
  }
  for (const section of draft.sections) {
    blocks.push(`## ${escapeMdx(section.heading)}`);
    for (const paragraphOf of section.paragraphs) blocks.push(paragraph(paragraphOf));
  }
  if (draft.limitations.length > 0) {
    blocks.push(`## ${LIMITATIONS_HEADING}`);
    blocks.push(paragraph(draft.limitations));
  }
  const mdx = `${frontmatter}\n\n${blocks.join('\n\n')}\n`;

  const cited = order.map((id) => claimsById.get(id) as Claim);
  const sources = new Map<string, LedgerEntry['sources'][number]>();
  for (const claim of cited) {
    if (sources.has(claim.source.url)) continue;
    const { url, tier, snapshotHash, retrievedAt, outlet } = claim.source;
    sources.set(url, outlet === undefined ? { url, tier, snapshotHash, retrievedAt } : { url, tier, snapshotHash, retrievedAt, outlet });
  }

  const sentences: LedgerSentence[] = located.map((item) => {
    const entry: LedgerSentence = { index: item.index, section: item.section, kind: item.sentence.kind, text: item.sentence.text, claimIds: [...item.sentence.claimIds] };
    return item.heading === undefined ? entry : { ...entry, heading: item.heading };
  });

  const ledger: LedgerEntry = {
    schemaVersion: 1,
    slug: draft.slug,
    runId: meta.runId,
    publishedAt: draft.publishedAt,
    title: draft.title.text,
    categories: [...draft.categories],
    claims: structuredClone(cited),
    order,
    sentences,
    gate: { route: meta.gate.route, checks: { ...meta.gate.checks }, holdReasons: [...meta.gate.holdReasons] },
    ...(meta.verifier === undefined ? {} : { verifier: structuredClone(meta.verifier) }),
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
  };
  return { mdx, ledger };
}
```

- [ ] **Step 5: Write the module index and export it from the package**

**Create `gate/src/render/index.ts`:**
```ts
export * from './escape';
export * from './frontmatter';
export * from './render';
```

**In `gate/src/index.ts`, replace:**
```ts
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './schemas';
export * from './sentences';
export * from './slug';
```

**with:**
```ts
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './render';
export * from './schemas';
export * from './sentences';
export * from './slug';
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/render.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 8: Commit**

```bash
git add gate/src/render gate/src/index.ts gate/test/render.test.ts
git commit -m "feat(gate): render a gated draft as MDX with receipt markers and a claim ledger" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 33: Variants of the golden piece

**Files:**
- Create: `gate/src/fixtures/variant.ts`
- Modify: `gate/src/fixtures/index.ts` (export it)
- Test: `gate/test/variant.test.ts`

The site needs several pieces to show: a lead, pieces under different beats, a piece with a correction. Writing them by hand would mean four drafts to keep passing the gate. Instead `makeVariant(base, options)` makes a copy of a piece that tells the same story about something else. It turns the draft and the claims into JSON text, replaces text in both together (so a sentence and the claim it cites stay consistent), then sets the slug, the date and the categories. If every replacement has the same length as the text it replaces, the claims' span offsets stay correct. A replacement that matches nothing, or that is empty, or that contains a quotation mark or a backslash (which would break the JSON), throws.

The test is the important part: each variant has to pass the whole gate. A fixture that the gate would reject would show the reader something the real site could never publish.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/variant.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { defaultContext } from '../src/config';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { Claim, Draft } from '../src/schemas';

// The site's fixture pieces are variants of the golden piece: the same story
// about a different (fictional) product, so that the home page and the topic
// pages have several pieces to show. Each one must pass the whole gate, or the
// fixtures would show things the real site could never publish.

const swapProduct = (n: number): [string, string][] => [
  ['FX-1', `FX-${n}`],
  ['fx-1', `fx-${n}`],
];

const VARIANTS = [
  { n: 2, slug: 'fixture-robotics-ships-fx-2-to-second-plant', publishedAt: '2026-10-03', categories: ['humanoids'] },
  { n: 3, slug: 'fixture-robotics-ships-fx-3-to-second-plant', publishedAt: '2026-10-02', categories: ['policy-standards'] },
  { n: 4, slug: 'fixture-robotics-ships-fx-4-to-second-plant', publishedAt: '2026-10-01', categories: ['home-consumer', 'field-mobility'] },
];

const variantOf = (v: (typeof VARIANTS)[number]) =>
  makeVariant(cloneGolden(), { slug: v.slug, publishedAt: v.publishedAt, categories: v.categories, replace: swapProduct(v.n) });

describe('makeVariant: the variants pass the whole gate', () => {
  it.each(VARIANTS)('FX-$n publishes with no failures and no hold reasons', (v) => {
    const result = runGate(variantOf(v), defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
  });

  it('keeps every variant valid against the schemas', () => {
    for (const v of VARIANTS) {
      const variant = variantOf(v);
      expect(() => Draft.parse(variant.draft)).not.toThrow();
      for (const claim of variant.claims) expect(() => Claim.parse(claim)).not.toThrow();
    }
  });
});

describe('makeVariant: what changes', () => {
  const variant = variantOf(VARIANTS[0]!);

  it('sets the slug, the date and the categories', () => {
    expect(variant.draft.slug).toBe('fixture-robotics-ships-fx-2-to-second-plant');
    expect(variant.draft.publishedAt).toBe('2026-10-03');
    expect(variant.draft.categories).toEqual(['humanoids']);
  });

  it('sets the slug from the options even when the replacements would have produced another one', () => {
    const renamed = makeVariant(cloneGolden(), { slug: 'a-different-slug', publishedAt: '2026-10-03', categories: ['humanoids'], replace: swapProduct(2) });
    expect(renamed.draft.slug).toBe('a-different-slug');
  });

  it('applies each replacement to the draft and to the claims alike', () => {
    expect(variant.draft.title.text).toBe('Fixture Robotics ships its FX-2 warehouse arm to a second plant');
    const json = JSON.stringify(variant);
    expect(json).not.toContain('FX-1');
    expect(json).not.toContain('fx-1');
    const first = variant.claims[0]!;
    expect(first.span.quote).toContain('FX-2 warehouse arms');
    expect(first.values.map((value) => value.normalised)).toContain('fx-2');
    expect(first.source.url).toBe('https://fixture-robotics.example/news/fx-2-second-plant');
  });

  it('applies the replacements in the order given', () => {
    const chained = makeVariant(cloneGolden(), { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'], replace: [['FX-1', 'FX-2'], ['FX-2', 'FX-7']] });
    expect(chained.draft.title.text).toContain('FX-7');
    expect(chained.draft.title.text).not.toContain('FX-2');
  });

  it('keeps the span length equal to the quote length when the replacement has the same length', () => {
    for (const claim of variant.claims) expect(claim.span.end - claim.span.start).toBe(claim.span.quote.length);
  });
});

describe('makeVariant: the base is never changed', () => {
  it('leaves a frozen base untouched and returns a separate copy', () => {
    const base = { draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS };
    const variant = makeVariant(base, { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'], replace: swapProduct(2) });
    expect(variant.draft).not.toBe(GOLDEN_DRAFT);
    expect(variant.claims).not.toBe(GOLDEN_CLAIMS);
    expect(JSON.stringify(GOLDEN_DRAFT)).toContain('FX-1');
    expect(cloneGolden()).toEqual({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
  });

  it('works with no replacement at all', () => {
    const same = makeVariant(cloneGolden(), { slug: GOLDEN_DRAFT.slug, publishedAt: GOLDEN_DRAFT.publishedAt, categories: [...GOLDEN_DRAFT.categories], replace: [] });
    expect(same).toEqual(cloneGolden());
  });
});

describe('makeVariant: mistakes fail loudly', () => {
  const options = { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'] };

  it('throws when a replacement matches nothing', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-9', 'FX-8']] })).toThrow('makeVariant: "FX-9" does not occur in the draft or the claims');
  });

  it('throws when a replacement starts from an empty string', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['', 'x']] })).toThrow('makeVariant: a replacement cannot start from an empty string');
  });

  it('throws when a replacement contains a quotation mark or a backslash', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-1', 'FX"1']] })).toThrow('makeVariant: replacements may not contain quotation marks or backslashes');
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-1', 'FX\\1']] })).toThrow('makeVariant: replacements may not contain quotation marks or backslashes');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/variant.test.ts`
Expected: FAIL — `makeVariant is not a function`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/fixtures/variant.ts`:**
```ts
import type { GateInput } from '../gate';

/** How to turn one piece into another. */
export interface VariantOptions {
  slug: string;
  publishedAt: string;
  categories: string[];
  /**
   * Text to swap, in order, as [from, to] pairs. Every occurrence is replaced,
   * in the draft and in the claims together, so a sentence and the claim it
   * cites stay consistent. If `to` is as long as `from`, the claims' span
   * offsets stay correct too.
   */
  replace: [string, string][];
}

const NOT_JSON_SAFE = /["\\]/;

/**
 * A copy of `base` that tells the same story about something else. The
 * replacements run on the JSON text of the draft and the claims, so a name,
 * a number or a URL changes everywhere it appears. The slug, the date and the
 * categories are then set from `options`. `base` is never changed.
 */
export function makeVariant(base: GateInput, options: VariantOptions): GateInput {
  let json = JSON.stringify({ draft: base.draft, claims: base.claims });
  for (const [from, to] of options.replace) {
    if (from === '') throw new Error('makeVariant: a replacement cannot start from an empty string');
    if (NOT_JSON_SAFE.test(from) || NOT_JSON_SAFE.test(to)) {
      throw new Error('makeVariant: replacements may not contain quotation marks or backslashes');
    }
    if (!json.includes(from)) throw new Error(`makeVariant: "${from}" does not occur in the draft or the claims`);
    json = json.split(from).join(to);
  }
  const variant = JSON.parse(json) as GateInput;
  variant.draft.slug = options.slug;
  variant.draft.publishedAt = options.publishedAt;
  variant.draft.categories = [...options.categories];
  return variant;
}
```

**Replace `gate/src/fixtures/index.ts` with:**
```ts
export * from './golden';
export * from './variant';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/variant.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add gate/src/fixtures gate/test/variant.test.ts
git commit -m "feat(gate): make variants of the golden piece that still pass the whole gate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 34: Generate the fixture content

**Files:**
- Modify: `site/package.json` (scripts and dependencies), `package-lock.json`
- Create: `site/scripts/generate-fixtures.ts`
- Create (generated, then committed): `site/src/content-fixtures/news/*.mdx`, `site/src/content-fixtures/ledger/*.json`, `site/src/content-fixtures/desk-state.json`
- Test: `site/test/fixtures.test.ts`

The site reads fixture content only when it is built with `ROBYWIRE_FIXTURES=1` (a later task wires that up). This task writes the generator. It makes four pieces: the golden piece (industrial-warehouse and funding, 4 October 2026) and three variants that swap `FX-1` for `FX-2`, `FX-3` and `FX-4`, each one day earlier, under other beats (humanoids; policy-standards; home-consumer and field-mobility). Every piece is run through the whole gate and rendered with `renderDraft`, so the files are exactly what the real pipeline will produce. The generator also writes a desk state: a last run that published the golden piece, two holds on days with no piece (one with a gate code, one with `TIER2_ATTRIBUTION`) and one correction against the first variant. It stops with an error if any piece does not publish.

The files it writes are committed. They are large (each ledger is about 1,400 lines of JSON), which is why the plan generates them instead of listing them. Task 35 adds a check that fails when they drift from what the generator writes.

**Versions.** `site` now depends on the `gate` workspace and on `yaml` (the tests parse frontmatter). Step 1 adds both with npm; `yaml` 2.9.1 is already installed for `gate`, so nothing is downloaded.

- [ ] **Step 1: Declare the dependencies**

Run: `npm install --save-exact --no-audit --no-fund --workspace @robywire/site @robywire/gate@0.0.0 yaml@2.9.1`
Expected: PASS

Now give `site` its test command and the generator command.

**Replace `site/package.json` with:**
```json
{
  "name": "@robywire/site",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Astro static site. Astro and its scripts arrive in the site milestone.",
  "scripts": {
    "test": "vitest run",
    "fixtures:generate": "tsx scripts/generate-fixtures.ts"
  },
  "dependencies": {
    "@robywire/gate": "0.0.0",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 2: Write the failing test**

**Create `site/test/fixtures.test.ts`:**
```ts
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
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: FAIL — `Cannot find module '../scripts/generate-fixtures'`.

- [ ] **Step 4: Write the generator**

**Create `site/scripts/generate-fixtures.ts`:**
```ts
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DeskState, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeVariant } from '@robywire/gate/fixtures';

// Writes the fixture content the site shows when it is built with
// ROBYWIRE_FIXTURES=1: four news pieces with their ledgers, and a desk state.
// Everything is fictional (Fixture Robotics, the FX-1 family, *.example
// domains) and generated from the golden piece by the same renderer the real
// pipeline will use. Run it with `npm run fixtures:generate --workspace
// @robywire/site`; `npm run fixtures:check` fails if the committed files differ.

/** Where the committed fixtures live. */
export const FIXTURES_DIR = fileURLToPath(new URL('../src/content-fixtures/', import.meta.url));

export interface FixturePiece {
  slug: string;
  runId: string;
  input: GateInput;
}

// Each variant is the golden story about the next product, one day earlier.
const VARIANTS = [
  { n: 2, publishedAt: '2026-10-03', categories: ['humanoids'] },
  { n: 3, publishedAt: '2026-10-02', categories: ['policy-standards'] },
  { n: 4, publishedAt: '2026-10-01', categories: ['home-consumer', 'field-mobility'] },
];

const GOLDEN_RETRIEVED_AT = '2026-10-04T04:30:00Z';

/** The four fixture pieces as gate input: the golden piece and three variants of it. */
export function fixturePieces(): FixturePiece[] {
  const golden: FixturePiece = { slug: GOLDEN_DRAFT.slug, runId: 'fixture-run-1', input: cloneGolden() };
  const variants = VARIANTS.map(({ n, publishedAt, categories }, at): FixturePiece => {
    const slug = GOLDEN_DRAFT.slug.replace('fx-1', `fx-${n}`);
    const input = makeVariant(cloneGolden(), {
      slug,
      publishedAt,
      categories,
      replace: [
        ['FX-1', `FX-${n}`],
        ['fx-1', `fx-${n}`],
        [GOLDEN_RETRIEVED_AT, `${publishedAt}T04:30:00Z`],
      ],
    });
    return { slug, runId: `fixture-run-${at + 2}`, input };
  });
  return [golden, ...variants];
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function deskState(all: readonly FixturePiece[]): DeskState {
  const [latest, corrected] = [all[0]!, all[1]!];
  return DeskState.parse({
    lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'published', runId: latest.runId, slug: latest.slug },
    holds: [
      {
        at: '2026-09-30T04:38:05Z',
        categories: ['humanoids'],
        reasons: ['G4_NUMBER_UNSUPPORTED'],
        prUrl: 'https://github.example/robywire/robywire/pull/12',
      },
      { at: '2026-09-29T04:36:40Z', categories: ['policy-standards', 'funding'], reasons: ['TIER2_ATTRIBUTION'] },
    ],
    corrections: [
      {
        at: '2026-10-03T09:12:00Z',
        slug: corrected.slug,
        kind: 'correction',
        note: "The first version gave the arm's maximum reach as 1.6 m. The datasheet says 1.4 m, and the piece now says so.",
      },
    ],
  });
}

/**
 * Every fixture file as a map from its path under the fixtures folder to its
 * content, in sorted order. A piece that does not pass the whole gate stops
 * the generator: a fixture must be something the real site could publish.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
  const files = new Map<string, string>();
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
    if (result.route !== 'publish') {
      const codes = result.failures.map((failure) => failure.code).join(', ');
      throw new Error(`generate-fixtures: the fixture ${piece.slug} does not publish (route ${result.route}: ${codes})`);
    }
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, { runId: piece.runId, gate: result });
    files.set(`news/${piece.slug}.mdx`, mdx);
    files.set(`ledger/${piece.slug}.json`, json(ledger));
  }
  files.set('desk-state.json', json(deskState(all)));
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Write the fixture files under `outDir`. The `news` and `ledger` folders are
 * emptied first, so a piece that is no longer generated does not linger.
 * Returns the paths written, relative to `outDir`.
 */
export function writeFixtures(outDir: string): string[] {
  const files = fixtureFiles();
  for (const folder of ['news', 'ledger']) rmSync(path.join(outDir, folder), { recursive: true, force: true });
  for (const [name, content] of files) {
    const target = path.join(outDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return [...files.keys()];
}

/** The command line: `--out <folder>` writes somewhere other than the committed folder. */
export function main(argv: readonly string[]): void {
  let outDir = FIXTURES_DIR;
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]!;
    if (arg !== '--out') throw new Error(`unknown argument: ${arg}`);
    const folder = argv[++at];
    if (folder === undefined) throw new Error('--out needs a folder');
    outDir = path.resolve(folder);
  }
  const written = writeFixtures(outDir);
  console.log(`wrote ${written.length} fixture files to ${outDir}`);
}

// Run when started as a script (tsx scripts/generate-fixtures.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Generate the fixtures**

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 9 fixture files`.

Look at one of them. It is the first variant, so it is the one with a correction recorded against it.

Run: `head -12 site/src/content-fixtures/news/fixture-robotics-ships-fx-2-to-second-plant.mdx`
Expected: PASS — the frontmatter ends with `author:` and `name: "Robywire Desk"`, then a line `---`, and the opening paragraph follows; its first sentence ends with a link like `[1](/news/fixture-robotics-ships-fx-2-to-second-plant/receipts/#c-1)`.

Run: `ls site/src/content-fixtures site/src/content-fixtures/news site/src/content-fixtures/ledger`
Expected: PASS — lists `desk-state.json`, four `.mdx` files and four `.json` files.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json site/package.json site/scripts/generate-fixtures.ts site/test/fixtures.test.ts site/src/content-fixtures
git commit -m "feat(site): generate the fixture pieces, ledgers and desk state from the golden piece" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 35: Fail when the committed fixtures are out of date

**Files:**
- Modify: `package.json` (script `fixtures:check`), `site/package.json` (script and the `diff` dependency), `package-lock.json`
- Create: `site/scripts/check-fixtures.ts`
- Test: `site/test/check-fixtures.test.ts`

The fixtures are generated files that are also committed. If someone changes the gate, the renderer or the generator and forgets to regenerate, the committed files quietly go stale. `npm run fixtures:check` generates the fixtures into a scratch folder, compares them file by file with the committed folder, and exits 1 with a unified diff if they differ. The diff library is the `diff` package, a development dependency of `site`.

- [ ] **Step 1: Add the diff library**

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site diff@9.0.0`
Expected: PASS — `added 1 package`.

- [ ] **Step 2: Write the failing test**

**Create `site/test/check-fixtures.test.ts`:**
```ts
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFixtures, main } from '../scripts/check-fixtures';
import { writeFixtures } from '../scripts/generate-fixtures';

// The checker generates the fixtures into a scratch folder and compares them,
// file by file, with the folder that is committed. It must say "up to date"
// when they match and print a unified diff when they do not.

const GOLDEN = 'ledger/fixture-robotics-ships-fx-1-to-second-plant.json';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A folder holding a copy of the generated fixtures, standing in for the committed folder. */
function committedCopy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-committed-'));
  scratch.push(dir);
  writeFixtures(dir);
  return dir;
}

describe('checkFixtures', () => {
  it('is ok, with an empty diff, when the folder matches what the generator writes', () => {
    expect(checkFixtures(committedCopy())).toEqual({ ok: true, diff: '' });
  });

  it('is ok for the fixtures that are really committed in the repository', () => {
    expect(checkFixtures()).toEqual({ ok: true, diff: '' });
  });

  it('is not ok when a file was edited, and shows the committed line and the generated line', () => {
    const dir = committedCopy();
    const file = path.join(dir, 'desk-state.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"outcome": "published"', '"outcome": "failed"'));
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- committed/desk-state.json');
    expect(result.diff).toContain('+++ generated/desk-state.json');
    expect(result.diff).toContain('-    "outcome": "failed",');
    expect(result.diff).toContain('+    "outcome": "published",');
  });

  it('is not ok when a generated file is missing from the folder', () => {
    const dir = committedCopy();
    unlinkSync(path.join(dir, GOLDEN));
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- /dev/null');
    expect(result.diff).toContain(`+++ generated/${GOLDEN}`);
    expect(result.diff).toContain('+  "schemaVersion": 1,');
  });

  it('is not ok when the folder has a file the generator does not write', () => {
    const dir = committedCopy();
    mkdirSync(path.join(dir, 'news'), { recursive: true });
    writeFileSync(path.join(dir, 'news', 'stray.mdx'), 'stray\n');
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- committed/news/stray.mdx');
    expect(result.diff).toContain('+++ /dev/null');
    expect(result.diff).toContain('-stray');
  });

  it('is not ok when the folder has an empty file the generator does not write', () => {
    const dir = committedCopy();
    writeFileSync(path.join(dir, 'news', 'empty.mdx'), '');
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('+++ /dev/null');
  });

  it('removes the scratch folder it generated into', () => {
    const generatedFolders = () => readdirSync(tmpdir()).filter((name) => name.startsWith('robywire-generated-')).length;
    const before = generatedFolders();
    checkFixtures(committedCopy());
    expect(generatedFolders()).toBe(before);
  });

  it('is not ok when the folder does not exist at all', () => {
    const result = checkFixtures(path.join(tmpdir(), 'robywire-no-such-folder'));
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- /dev/null');
  });
});

describe('main', () => {
  it('prints that the fixtures are up to date and returns 0', () => {
    const lines: string[] = [];
    expect(main(committedCopy(), (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual(['Fixtures are up to date.']);
  });

  it('prints the diff and how to fix it, and returns 1', () => {
    const dir = committedCopy();
    unlinkSync(path.join(dir, 'desk-state.json'));
    const lines: string[] = [];
    expect(main(dir, (line) => lines.push(line))).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('+++ generated/desk-state.json');
    expect(output).toContain('Fixtures are out of date. Run "npm run fixtures:generate --workspace @robywire/site" and commit the result.');
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/check-fixtures.test.ts`
Expected: FAIL — `Cannot find module '../scripts/check-fixtures'`.

- [ ] **Step 4: Write the checker**

**Create `site/scripts/check-fixtures.ts`:**
```ts
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTwoFilesPatch } from 'diff';
import { FIXTURES_DIR, writeFixtures } from './generate-fixtures';

// `npm run fixtures:check` regenerates the fixtures into a scratch folder and
// compares them with the committed folder. If they differ, it prints a unified
// diff and exits 1, so a change to the gate, the renderer or the generator
// cannot leave the committed fixtures behind.

export interface CheckResult {
  ok: boolean;
  /** A unified diff from the committed files to the generated ones. Empty when ok. */
  diff: string;
}

/** The files under `dir`, as paths relative to it, in sorted order. A missing folder has none. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => statSync(path.join(dir, name)).isFile())
    .map((name) => name.split(path.sep).join('/'))
    .sort();
}

const read = (dir: string, name: string): string => readFileSync(path.join(dir, ...name.split('/')), 'utf8');

/** Compare the generated fixtures with the files in `committedDir` (by default the committed folder). */
export function checkFixtures(committedDir: string = FIXTURES_DIR): CheckResult {
  const generatedDir = mkdtempSync(path.join(tmpdir(), 'robywire-generated-'));
  try {
    writeFixtures(generatedDir);
    const committed = new Set(filesUnder(committedDir));
    const generated = new Set(filesUnder(generatedDir));
    const patches: string[] = [];
    for (const name of [...new Set([...committed, ...generated])].sort()) {
      const before = committed.has(name) ? read(committedDir, name) : '';
      const after = generated.has(name) ? read(generatedDir, name) : '';
      if (before === after && committed.has(name) === generated.has(name)) continue;
      const from = committed.has(name) ? `committed/${name}` : '/dev/null';
      const to = generated.has(name) ? `generated/${name}` : '/dev/null';
      patches.push(createTwoFilesPatch(from, to, before, after));
    }
    return { ok: patches.length === 0, diff: patches.join('\n') };
  } finally {
    rmSync(generatedDir, { recursive: true, force: true });
  }
}

/** Run the check and print the outcome. Returns the process exit code. */
export function main(committedDir: string = FIXTURES_DIR, print: (text: string) => void = console.log): number {
  const result = checkFixtures(committedDir);
  if (result.ok) {
    print('Fixtures are up to date.');
    return 0;
  }
  print(result.diff);
  print('Fixtures are out of date. Run "npm run fixtures:generate --workspace @robywire/site" and commit the result.');
  return 1;
}

// Run when started as a script (tsx scripts/check-fixtures.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/check-fixtures.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Add the commands**

**Replace `site/package.json` with:**
```json
{
  "name": "@robywire/site",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Astro static site. Astro and its scripts arrive in the site milestone.",
  "scripts": {
    "test": "vitest run",
    "fixtures:generate": "tsx scripts/generate-fixtures.ts",
    "fixtures:check": "tsx scripts/check-fixtures.ts"
  },
  "dependencies": {
    "@robywire/gate": "0.0.0",
    "yaml": "2.9.1"
  },
  "devDependencies": {
    "diff": "9.0.0"
  }
}
```

**Replace `package.json` with:**
```json
{
  "name": "robywire",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Robywire: a daily robotics news site, written by the Desk and checked by a code gate.",
  "engines": {
    "node": ">=22"
  },
  "workspaces": [
    "gate",
    "evals",
    "site"
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "evals:seeded": "npm run seeded --workspace @robywire/evals",
    "fixtures:check": "npm run fixtures:check --workspace @robywire/site"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "7.0.2",
    "vitest": "5.0.3"
  }
}
```

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 7: Prove the check can fail**

Change one value in a committed fixture, as if someone had edited it by hand.

Run: `sed -i.bak 's/"outcome": "published"/"outcome": "failed"/' site/src/content-fixtures/desk-state.json && rm site/src/content-fixtures/desk-state.json.bak`
Expected: PASS

Run: `npm run fixtures:check`
Expected: FAIL — `--- committed/desk-state.json`, `+++ generated/desk-state.json` and `Fixtures are out of date.`

Put the file back.

Run: `git checkout -- site/src/content-fixtures`
Expected: PASS

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json site/package.json site/scripts/check-fixtures.ts site/test/check-fixtures.test.ts
git commit -m "feat(site): fail fixtures:check, with a diff, when the committed fixtures are out of date" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 36: Scaffold the Astro site

**Files:**
- Modify: `package.json` (scripts `build` and `build:fixtures`, the TypeScript version), `gate/package.json` and `evals/package.json` (TypeScript 7.0.2), `site/package.json`, `package-lock.json`
- Create: `site/astro.config.mjs`, `site/tsconfig.json`, `site/src/env.d.ts`, `site/src/lib/env.ts`, `site/src/content.config.ts`, `site/src/data/desk-state.json`, `site/src/content/news/.gitkeep`, `site/src/content/ledger/.gitkeep`, `site/src/pages/index.astro` (a placeholder)
- Test: `site/test/zod.test.ts`, `site/test/env.test.ts`

This task installs Astro and wires the site to the content. Four decisions are worth knowing before you start.

**Fixture mode.** `src/lib/env.ts` decides whether this build is a fixture build: only when the environment variable `ROBYWIRE_FIXTURES` is exactly `1`. In a fixture build the content collections read `src/content-fixtures/`; otherwise they read `src/content/`, which is empty (it holds a `.gitkeep` file). Fixtures never ship: a production build must contain none of them.

**One definition of the schemas.** The content collections use `NewsFrontmatter` and `LedgerEntry` from the gate package as their schemas, so there is one definition of what a piece and a ledger entry look like. That only works if Astro's copy of Zod (`astro/zod`) and the gate's copy are the same copy. npm installs one Zod for both, and `site/test/zod.test.ts` proves it, so a second Zod appearing later fails a test instead of breaking the build in an obscure way.

**Two TypeScript versions.** TypeScript 7 is a native compiler with no JavaScript API, and Astro's type checker (`astro check`) is built on that API: it needs TypeScript 6. npm installs the checker's tools at the repository root, so the root's TypeScript must be 6.0.3. `gate` and `evals` keep the 7.0.2 compiler by declaring it in their own `package.json`; npm installs it inside each of them, and `tsc` run in those folders uses it.

**Plain text on the page.** Astro's Markdown processor can turn straight quotes into curly ones and `--` into a dash. The text of a piece must be exactly the text the gate checked, so the config turns that off.

- [ ] **Step 1: Write the failing tests**

**Create `site/test/zod.test.ts`:**
```ts
import { z as astroZ } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';

// The site's content collections take their schemas from the gate package, so
// there is one definition of what a piece and a ledger entry look like. That
// only works if Astro's copy of Zod and the gate's copy are the same copy: a
// schema built by one is not recognised by the other if they are two installs.

describe('Zod in the site', () => {
  it('is one install: Astro and the gate share the same classes', () => {
    expect(astroZ.ZodType).toBe(z.ZodType);
    expect(astroZ.ZodObject).toBe(z.ZodObject);
  });

  it('lets the gate schemas be used with Astro helpers, because they are Astro-compatible Zod schemas', () => {
    expect(LedgerEntry).toBeInstanceOf(astroZ.ZodType);
    expect(NewsFrontmatter).toBeInstanceOf(astroZ.ZodType);
  });
});
```

**Create `site/test/env.test.ts`:**
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentFolder, fixturesEnabled } from '../src/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fixturesEnabled', () => {
  it('is off when ROBYWIRE_FIXTURES is not set', () => {
    expect(fixturesEnabled({})).toBe(false);
  });

  it('is on only for the exact value 1', () => {
    expect(fixturesEnabled({ ROBYWIRE_FIXTURES: '1' })).toBe(true);
    for (const value of ['0', '', 'true', 'yes', ' 1', '1 ', '11']) {
      expect(fixturesEnabled({ ROBYWIRE_FIXTURES: value }), JSON.stringify(value)).toBe(false);
    }
  });

  it('reads the process environment when it is given none', () => {
    vi.stubEnv('ROBYWIRE_FIXTURES', '1');
    expect(fixturesEnabled()).toBe(true);
    vi.stubEnv('ROBYWIRE_FIXTURES', '0');
    expect(fixturesEnabled()).toBe(false);
  });
});

describe('contentFolder', () => {
  it('is content/ for a production build and content-fixtures/ for a fixture build', () => {
    expect(contentFolder(false)).toBe('content');
    expect(contentFolder(true)).toBe('content-fixtures');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/zod.test.ts test/env.test.ts`
Expected: FAIL — `Cannot find package 'astro/zod'` and `Cannot find module '../src/lib/env'`.

- [ ] **Step 3: Install TypeScript 6 at the root and keep TypeScript 7 in gate and evals**

Run: `npm install --save-exact --save-dev --no-audit --no-fund typescript@6.0.3`
Expected: PASS

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/gate --workspace @robywire/evals typescript@7.0.2`
Expected: PASS

Check which compiler each folder gets.

Run: `npx tsc -v`
Expected: PASS — `Version 6.0.3`.

Run: `(cd gate && npx tsc -v)`
Expected: PASS — `Version 7.0.2`.

- [ ] **Step 4: Install Astro**

Run: `npm install --save-exact --no-audit --no-fund --workspace @robywire/site astro@7.3.5 @astrojs/mdx@8.0.2 @astrojs/markdown-satteri@0.4.2 sharp@0.35.5 @robywire/evals@0.0.0`
Expected: PASS

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site @astrojs/check@0.9.10 typescript@6.0.3`
Expected: PASS

`@astrojs/check` must find TypeScript 6 and nothing else. Look at the tree.

Run: `npm ls typescript`
Expected: PASS — shows `typescript@7.0.2` under `@robywire/evals` and under `@robywire/gate`, and `typescript@6.0.3` at the root, under `@robywire/site` and under `@astrojs/check`.

Run: `npm ls typescript | grep -A1 volar`
Expected: PASS — prints `@volar/kit@2.4.28` and, under it, `typescript@6.0.3 deduped`: the checker's tools get TypeScript 6.

- [ ] **Step 5: Add the scripts**

`build:fixtures` sets `ROBYWIRE_FIXTURES=1` in front of the command, which works in macOS, Linux and WSL shells (CI runs Linux). `typecheck` is `astro check`, which type-checks the `.astro` files as well as the TypeScript. In the root `package.json`, `build` and `build:fixtures` hand over to the site's.

**Replace `site/package.json` with:**
```json
{
  "name": "@robywire/site",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "The Robywire site: static Astro pages built from src/content, or from src/content-fixtures when ROBYWIRE_FIXTURES=1.",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "build:fixtures": "ROBYWIRE_FIXTURES=1 astro build",
    "preview": "astro preview",
    "typecheck": "astro check",
    "test": "vitest run",
    "fixtures:generate": "tsx scripts/generate-fixtures.ts",
    "fixtures:check": "tsx scripts/check-fixtures.ts"
  },
  "dependencies": {
    "@astrojs/markdown-satteri": "0.4.2",
    "@astrojs/mdx": "8.0.2",
    "@robywire/evals": "0.0.0",
    "@robywire/gate": "0.0.0",
    "astro": "7.3.5",
    "sharp": "0.35.5",
    "yaml": "2.9.1"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.10",
    "diff": "9.0.0",
    "typescript": "6.0.3"
  }
}
```

**Replace `package.json` with:**
```json
{
  "name": "robywire",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Robywire: a daily robotics news site, written by the Desk and checked by a code gate.",
  "engines": {
    "node": ">=22"
  },
  "workspaces": [
    "gate",
    "evals",
    "site"
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "evals:seeded": "npm run seeded --workspace @robywire/evals",
    "fixtures:check": "npm run fixtures:check --workspace @robywire/site",
    "build": "npm run build --workspace @robywire/site",
    "build:fixtures": "npm run build:fixtures --workspace @robywire/site"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 6: Write the Astro configuration**

**Create `site/astro.config.mjs`:**
```js
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';

// A fully static site. Every route is a folder with an index.html, and every
// internal link ends in a slash.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://robywire.example',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The text of a piece is exactly the text the gate checked: no curly quotes,
  // no en dashes, no ellipsis characters added by the Markdown processor.
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
  integrations: [mdx()],
  vite: {
    build: {
      rolldownOptions: {
        // Astro puts a "use astro:head-inject" directive at the top of every MDX
        // module. Rolldown warns that bundling may not keep it, once per piece.
        // Our pieces import no styles or scripts, so there is nothing to inject.
        onLog(level, log, defaultHandler) {
          if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
          defaultHandler(level, log);
        },
      },
    },
  },
});
```

**Create `site/tsconfig.json`:**
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": [".astro/types.d.ts", "src/**/*", "scripts/**/*", "test/**/*"],
  "exclude": ["dist"]
}
```

**Create `site/src/env.d.ts`:**
```ts
/// <reference types="astro/client" />
```

- [ ] **Step 7: Write the fixture-mode module and the content collections**

**Create `site/src/lib/env.ts`:**
```ts
// Fixture mode. The fixtures are fictional pieces used to build and test the
// site before the Desk has published anything. They are read only when the
// build is started with ROBYWIRE_FIXTURES=1 (`npm run build:fixtures`); a
// production build reads src/content/ and never touches src/content-fixtures/.

/** True when `env` asks for fixture content. Only the exact value "1" does. */
export function fixturesEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.ROBYWIRE_FIXTURES === '1';
}

/** True for this build. */
export const useFixtures: boolean = fixturesEnabled();

/** The folder under src/ that holds the content to read. */
export function contentFolder(fixtures: boolean = useFixtures): 'content' | 'content-fixtures' {
  return fixtures ? 'content-fixtures' : 'content';
}
```

**Create `site/src/content.config.ts`:**
```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { contentFolder } from './lib/env';

// The schemas are the gate package's own, so a piece the renderer writes is a
// piece the site accepts, and a malformed file stops the build.
const base = `./src/${contentFolder()}`;

const news = defineCollection({
  loader: glob({ base: `${base}/news`, pattern: '**/*.mdx' }),
  schema: NewsFrontmatter,
});

const ledger = defineCollection({
  loader: glob({ base: `${base}/ledger`, pattern: '**/*.json' }),
  schema: LedgerEntry,
});

export const collections = { news, ledger };
```

The two content folders for a production build are empty; a `.gitkeep` file keeps them in git. The production desk state is the empty state.

Run: `mkdir -p site/src/content/news site/src/content/ledger site/src/data site/src/pages && touch site/src/content/news/.gitkeep site/src/content/ledger/.gitkeep`
Expected: PASS

**Create `site/src/data/desk-state.json`:**
```json
{"lastRun":null,"holds":[],"corrections":[]}
```

- [ ] **Step 8: Write a placeholder home page**

The real pages come in later tasks. This one only counts the entries in the two collections, which proves that the content loads and passes the schemas.

**Create `site/src/pages/index.astro`:**
```astro
---
import { getCollection } from 'astro:content';

const news = await getCollection('news');
const ledger = await getCollection('ledger');
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Robywire</title>
  </head>
  <body>
    <p>news: {news.length}, ledger: {ledger.length}</p>
  </body>
</html>
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/zod.test.ts test/env.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 10: Build with the fixtures**

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `cat site/dist/index.html`
Expected: PASS — the page contains `news: 4, ledger: 4`: four pieces and four ledger entries loaded and passed the gate package's schemas.

- [ ] **Step 11: Build for production**

Run: `npm run build`
Expected: PASS — `[build] Complete!`. Astro warns that it found no files in `src/content/news` and `src/content/ledger`; that is right, because a production build has no pieces yet.

Run: `cat site/dist/index.html`
Expected: PASS — the page contains `news: 0, ledger: 0`.

- [ ] **Step 12: Prove a bad ledger stops the build**

Break one ledger entry, as if the Desk had written a wrong file.

Run: `sed -i.bak 's/"schemaVersion": 1/"schemaVersion": 2/' site/src/content-fixtures/ledger/fixture-robotics-ships-fx-2-to-second-plant.json && rm site/src/content-fixtures/ledger/fixture-robotics-ships-fx-2-to-second-plant.json.bak`
Expected: PASS

Run: `npm run build:fixtures`
Expected: FAIL — `data does not match collection schema` and `schemaVersion: Invalid input: expected 1`.

Put the file back.

Run: `git checkout -- site/src/content-fixtures`
Expected: PASS

- [ ] **Step 13: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors` from `astro check`.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json gate/package.json evals/package.json site/package.json site/astro.config.mjs site/tsconfig.json site/src site/test/zod.test.ts site/test/env.test.ts
git commit -m "feat(site): scaffold the Astro site with content collections that use the gate's schemas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 37: Check the escaping with the real MDX parser

**Files:**
- Create: `site/markdown-features.mjs`, `site/test/escape-mdx.test.ts`
- Modify: `site/astro.config.mjs` (read the parser features from the new file), `site/package.json` (the `satteri` dev dependency), `package-lock.json`
- Modify: `gate/src/render/escape.ts`, `gate/test/escape.test.ts` (remove rules that turn out to do nothing)

The tests of Task 31 compare strings. They show that `escapeMdx` writes the backslashes we meant, not that an MDX parser reads the result as plain text. This task asks the real parser. Astro 7 parses MDX with Satteri, and the `satteri` package exposes the same parser as a function, `mdxToHast`. The test parses a list of hostile sentences, and whole rendered pieces, and checks what the parser sees: one paragraph of plain text each, and no expression, no JSX, no import, no raw HTML, and no link except the receipt markers.

The parser is configured by one object, in `site/markdown-features.mjs`, which both the Astro config and the test read, so the test parses text exactly the way the build does.

Running the test shows a problem that the string tests could not: with GitHub-flavoured Markdown on (the default), a bare `www.example.com` or `me@example.com` in a sentence becomes a link, and no escape stops it, because the parser finds addresses in the text after it has resolved the escapes. The site uses nothing from GitHub-flavoured Markdown (no tables, strikethrough, footnotes or task lists), so the fix is to turn it off. Three rules in `escapeMdx` that tried to prevent the links (for `://`, `www.` and `@`) did nothing, and so did the escapes for `~` and `|`, which only matter with it on. They are removed.

- [ ] **Step 1: Add the parser as a development dependency**

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site satteri@0.10.5`
Expected: PASS

- [ ] **Step 2: Write the failing test**

**Create `site/test/escape-mdx.test.ts`:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mdxToHast } from 'satteri';
import { cloneGolden, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { defaultContext, escapeMdx, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { markdownFeatures } from '../markdown-features.mjs';

// escapeMdx and the renderer are tested in the gate package as strings. This
// file runs their output through the MDX parser that Astro uses (Satteri) and
// checks what the parser sees: prose and the receipt markers, and nothing that
// could run, import or restyle the page.

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

// The parser is configured exactly as the site's build configures it.
const parse = (source: string): Node => mdxToHast(source, { features: markdownFeatures }) as unknown as Node;

/** Every node in the tree, parents before children. */
function nodes(node: Node): Node[] {
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

/** Nodes that are code or markup rather than prose: MDX expressions, JSX, imports, raw HTML. */
const liveNodes = (tree: Node): Node[] => nodes(tree).filter((node) => node.type.startsWith('mdx') || node.type === 'raw');

function textOf(node: Node): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** The elements of the tree other than the root's whitespace text. */
const elementNames = (tree: Node): string[] => nodes(tree).filter((node) => node.type === 'element').map((node) => node.tagName ?? '');

// Sentences a model might write, on purpose or by accident.
const HOSTILE = [
  'Plain sentence.',
  'It costs $38,000 & weighs 38 kg (about 84 lb).',
  'Use {braces} and <tags> and </end> and <!-- comment --> and {/* x */}',
  'Stars *a* **b** _c_ __d__ `code` ``x`` ~~s~~ ~t~ ~5 kg',
  'Link [a](http://x.example) ![i](y) [^1] [ref]: z',
  'AT&T R&D &copy; &amp; &#35; &lt;',
  'See www.example.com or http://a.example/x or https://a.example or me@x.example',
  '# Heading',
  '- item',
  '+ plus',
  '> quote',
  '1. one',
  '2) two',
  '=== x',
  '--- x',
  '***',
  '___',
  '| a | b |',
  'back\\slash and \\* already escaped',
  'import x from "y"',
  'export const a = 1',
  'imports and exports are fine',
  '$x$ $$y$$ ^sup^ :::note',
  '<script>alert(1)</script>',
  '{1+1}',
  '<Component prop={1} />',
  'Dashes -- and ellipsis ... and "quotes" and it\'s',
];

describe('the parser configuration', () => {
  it('keeps GitHub-flavoured Markdown off: it turns bare web addresses and email addresses into links, and no escape can stop that', () => {
    expect(markdownFeatures.gfm).toBe(false);
  });

  it('keeps smart punctuation off: the text on the page is the text the gate checked', () => {
    expect(markdownFeatures.smartPunctuation).toBe(false);
  });
});

describe('the detector', () => {
  it('sees code and markup in text that has not been escaped', () => {
    expect(liveNodes(parse('Hello {x} and <b>y</b>')).map((node) => node.type)).toEqual(['mdxTextExpression', 'mdxJsxTextElement']);
    expect(liveNodes(parse('import x from "y"')).map((node) => node.type)).toEqual(['mdxjsEsm']);
  });
});

describe('escapeMdx through the MDX parser', () => {
  it.each(HOSTILE)('reads %j as one paragraph of plain text, character for character', (sentence) => {
    const tree = parse(escapeMdx(sentence));
    expect(liveNodes(tree)).toEqual([]);
    const blocks = (tree.children ?? []).filter((node) => node.type === 'element');
    expect(blocks.map((node) => node.tagName)).toEqual(['p']);
    expect(textOf(blocks[0]!)).toBe(sentence);
    expect(elementNames(tree)).toEqual(['p']);
  });

  it('makes no heading, list, quote, table, rule, link or emphasis out of a multi-line text', () => {
    const tree = parse(escapeMdx('first\n# second\n- third\n1. fourth\n> fifth\n===\n---\n| a |\n|---|\nexport const x = 1'));
    expect(liveNodes(tree)).toEqual([]);
    expect(new Set(elementNames(tree))).toEqual(new Set(['p']));
  });
});

/** A rendered piece in which every sentence the gate does not read for markup is hostile. */
function hostilePiece(): string {
  const input: GateInput = cloneGolden();
  const texts = HOSTILE.filter((text) => !text.includes('\n'));
  let next = 0;
  for (const paragraph of input.draft.sections[0]!.paragraphs[0]!) {
    paragraph.text = texts[next++ % texts.length]!;
  }
  input.draft.takeaways[0]!.text = '# a heading in a takeaway';
  input.draft.opening[0]!.text = 'import everything from "the model"';
  return renderDraft(input.draft, input.claims, { runId: 'hostile', gate: runGate(input, defaultContext()) }).mdx;
}

describe('whole pieces through the MDX parser', () => {
  const fixtureDir = new URL('../src/content-fixtures/news/', import.meta.url);
  const fixtures = readdirSync(fixtureDir).map((name) => [name, readFileSync(new URL(name, fixtureDir), 'utf8')] as const);

  it.each(fixtures)('%s contains nothing live and only the elements a piece needs', (_name, mdx) => {
    const tree = parse(mdx);
    expect(liveNodes(tree)).toEqual([]);
    expect(new Set(elementNames(tree))).toEqual(new Set(['p', 'a', 'h2', 'ul', 'li', 'strong']));
    expect(elementNames(tree).filter((name) => name === 'h2')).toHaveLength(5);
  });

  it.each(fixtures)('%s links only to its own receipts page', (_name, mdx) => {
    const links = nodes(parse(mdx)).filter((node) => node.tagName === 'a');
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) expect(String(link.properties?.href)).toMatch(/^\/news\/[a-z0-9-]+\/receipts\/#c-\d+$/);
  });

  it('keeps a piece full of hostile sentences free of anything live, and its headings unchanged', () => {
    const tree = parse(hostilePiece());
    expect(liveNodes(tree)).toEqual([]);
    expect(elementNames(tree).filter((name) => name === 'h2')).toHaveLength(5);
    expect(elementNames(tree).filter((name) => name === 'h1')).toEqual([]);
    expect(elementNames(tree)).not.toContain('script');
    expect(nodes(tree).filter((node) => node.tagName === 'a').every((node) => String(node.properties?.href).startsWith(`/news/${GOLDEN_DRAFT.slug}/receipts/#c-`))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/escape-mdx.test.ts`
Expected: FAIL — `Cannot find module '../markdown-features.mjs'`.

- [ ] **Step 4: Move the parser features into one file**

This is the configuration the site has had since Task 36: only smart punctuation is off.

**Create `site/markdown-features.mjs`:**
```js
// The parser features for every Markdown and MDX file the site builds. The
// astro config and the tests read this one object, so the tests parse text
// exactly the way the build does.
export const markdownFeatures = {
  // The text on the page is the text the gate checked: no curly quotes, no
  // en dashes, no ellipsis characters added by the parser.
  smartPunctuation: false,
};
```

**In `site/astro.config.mjs`, replace:**
```js
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';

// A fully static site. Every route is a folder with an index.html, and every
// internal link ends in a slash.
```

**with:**
```js
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import { markdownFeatures } from './markdown-features.mjs';

// A fully static site. Every route is a folder with an index.html, and every
// internal link ends in a slash.
```

**In `site/astro.config.mjs`, replace:**
```js
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The text of a piece is exactly the text the gate checked: no curly quotes,
  // no en dashes, no ellipsis characters added by the Markdown processor.
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
  integrations: [mdx()],
  vite: {
    build: {
```

**with:**
```js
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { processor: satteri({ features: markdownFeatures }) },
  integrations: [mdx()],
  vite: {
    build: {
```

- [ ] **Step 5: Run the test and see the real problem**

Run: `npm test --workspace @robywire/site -- test/escape-mdx.test.ts`
Expected: FAIL — `keeps GitHub-flavoured Markdown off`, `expected [ 'p', 'a' ] to deeply equal [ 'p' ]` and `expected [ 'p', 'a', 'a', 'a', 'a' ] to deeply equal [ 'p' ]`: the sentence with an address in it came out as a paragraph with links in it.

- [ ] **Step 6: Turn GitHub-flavoured Markdown off**

**Replace `site/markdown-features.mjs` with:**
```js
// The parser features for every Markdown and MDX file the site builds. The
// astro config and the tests read this one object, so the tests parse text
// exactly the way the build does.
export const markdownFeatures = {
  // GitHub-flavoured Markdown would turn a bare "www.example.com" or
  // "me@example.com" in a sentence into a link, and no backslash escape stops
  // it. The site uses none of its features (tables, strikethrough, footnotes,
  // task lists), so it stays off.
  gfm: false,
  // The text on the page is the text the gate checked: no curly quotes, no
  // en dashes, no ellipsis characters added by the parser.
  smartPunctuation: false,
};
```

Run: `npm test --workspace @robywire/site -- test/escape-mdx.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 7: Remove the rules that do nothing**

`escapeMdx` loses its three address rules and the escapes for `~` and `|`, and its comment now says what it relies on.

**Replace `gate/src/render/escape.ts` with:**
```ts
// Escaping for the MDX renderer. A sentence comes from a model, so it is
// treated as hostile text: after escaping, an MDX parser must read it as plain
// prose and nothing else. site/test/escape-mdx.test.ts runs a hostile list
// through the MDX parser that Astro uses, configured as the site configures it.
//
// This module assumes GitHub-flavoured Markdown is off (site/markdown-features.mjs).
// With it on, a bare web or email address in a sentence becomes a link whatever
// is escaped, so the test fails if someone turns it on.

/** Characters that are escaped wherever they appear, by a backslash in front. */
const ALWAYS = /[\\`*_{}<>[\]&]/g;

/** MDX reads a line that starts with `import` or `export` as JavaScript. */
const ESM_KEYWORD = /^(\s*)(import|export)(?![\p{L}\p{N}_])/u;

/** A character that starts a heading, a list item, a setext underline or a thematic break. */
const LINE_START = /^(\s*)([#+=-]|\d+[.)])/;

function escapeLineStart(line: string): string {
  const withKeyword = line.replace(ESM_KEYWORD, (_whole, space: string, word: string) => {
    // A backslash before a letter would show up in the page. A numeric
    // character reference for the first letter hides the keyword from MDX and
    // is shown as the letter.
    return `${space}&#${word.charCodeAt(0)};${word.slice(1)}`;
  });
  return withKeyword.replace(LINE_START, (_whole, space: string, marker: string) => {
    // A numbered marker is escaped on its last character: "1." becomes "1\.".
    return /^\d/.test(marker) ? `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}` : `${space}\\${marker}`;
  });
}

/**
 * `text` made safe as MDX prose. Every character that MDX or Markdown could act
 * on is escaped, and the characters that only matter at the start of a line (`#`,
 * `-`, `+`, `=`, a list number, `import`, `export`) are escaped on every line of
 * the text. Rendered, the result reads exactly like `text`.
 */
export function escapeMdx(text: string): string {
  return text
    .replace(ALWAYS, (char) => `\\${char}`)
    .split('\n')
    .map(escapeLineStart)
    .join('\n');
}
```

The tests for the removed rules go too.

**In `gate/test/escape.test.ts`, replace:**
```ts
    ['curly braces', 'Use {x} here', 'Use \\{x\\} here'],
    ['angle brackets', 'a <b> and </b>', 'a \\<b\\> and \\</b\\>'],
    ['square brackets', 'see [1] and [a](b)', 'see \\[1\\] and \\[a\\](b)'],
    ['a tilde', 'about ~5 kg', 'about \\~5 kg'],
    ['an ampersand', 'AT&T and &copy;', 'AT\\&T and \\&copy;'],
    ['a pipe', 'a | b', 'a \\| b'],
    ['a greater-than sign in the middle of a line', 'a > b', 'a \\> b'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
```

**with:**
```ts
    ['curly braces', 'Use {x} here', 'Use \\{x\\} here'],
    ['angle brackets', 'a <b> and </b>', 'a \\<b\\> and \\</b\\>'],
    ['square brackets', 'see [1] and [a](b)', 'see \\[1\\] and \\[a\\](b)'],
    ['an ampersand', 'AT&T and &copy;', 'AT\\&T and \\&copy;'],
    ['a greater-than sign in the middle of a line', 'a > b', 'a \\> b'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
```

**In `gate/test/escape.test.ts`, replace:**
```ts
  });
});

describe('escapeMdx: text that GFM would turn into a link', () => {
  it.each([
    ['a URL with a scheme', 'see https://a.example/x', 'see https:\\/\\/a.example/x'],
    ['a www address', 'see www.a.example', 'see www\\.a.example'],
    ['a WWW address in capitals', 'see WWW.A.EXAMPLE', 'see WWW\\.A.EXAMPLE'],
    ['an email address', 'write to me@a.example', 'write to me\\@a.example'],
  ])('breaks up %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });
});

describe('escapeMdx: a hostile sentence', () => {
  it('comes out with nothing live in it', () => {
    const hostile = '<script>alert(1)</script> {1+1} *bold* [x](javascript:y) `z`';
```

**with:**
```ts
  });
});

describe('escapeMdx: a hostile sentence', () => {
  it('comes out with nothing live in it', () => {
    const hostile = '<script>alert(1)</script> {1+1} *bold* [x](javascript:y) `z`';
```

Run: `npm test --workspace @robywire/gate -- test/escape.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Run: `npm test --workspace @robywire/site -- test/escape-mdx.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 8: Typecheck and build**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

- [ ] **Step 9: Commit**

```bash
git add package-lock.json site/package.json site/markdown-features.mjs site/astro.config.mjs site/test/escape-mdx.test.ts gate/src/render/escape.ts gate/test/escape.test.ts
git commit -m "fix(gate): check the escaping with the real MDX parser and keep GFM off" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 38: Read the desk state and join each piece with its ledger

**Files:**
- Create: `site/src/lib/desk-state.ts`, `site/src/lib/match-pieces.ts`, `site/src/lib/pieces.ts`
- Test: `site/test/desk-state.test.ts`, `site/test/match-pieces.test.ts`

A piece is two files with the same name: the MDX the reader sees (`news/<slug>.mdx`) and the ledger behind its receipts (`ledger/<slug>.json`). The site needs them joined, newest first, and it must refuse content where they do not belong together: a piece with no ledger would be an article with no receipts, which is exactly what this site must not publish.

- `match-pieces.ts` is the pure part. `matchPieces(news, ledgers)` joins entries by id, sorts them by date (newest first; a day's pieces stay in slug order), and throws one error that lists every problem: a piece with no ledger file, a ledger entry with no piece, and a ledger entry whose slug, title, date or categories differ from the piece. It knows nothing about Astro, so it is tested directly.
- `pieces.ts` feeds it Astro's two collections. It imports `astro:content`, which only exists inside Astro, so it is covered by the builds, not by Vitest.
- `desk-state.ts` reads the desk state (the fixture file in a fixture build, the production file otherwise), validates it with the `DeskState` schema, and finds the corrections recorded for one piece.

- [ ] **Step 1: Write the failing tests**

**Create `site/test/desk-state.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionsFor, getDeskState, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';

const correction = (at: string, slug: string, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: `note ${at}` });

describe('parseDeskState', () => {
  it('accepts the empty state', () => {
    expect(parseDeskState(EMPTY)).toEqual(EMPTY);
  });

  it('rejects a state that does not match the schema, naming the problem', () => {
    expect(() => parseDeskState({ lastRun: null, holds: [{ at: 'yesterday', categories: [], reasons: [] }], corrections: [] })).toThrow('at');
    expect(() => parseDeskState({ lastRun: null, holds: [] })).toThrow('corrections');
    expect(() => parseDeskState(null)).toThrow();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getDeskState', () => {
  it('reads the production state when fixtures are off: nothing has run, nothing is held', async () => {
    expect(await getDeskState(false)).toEqual(EMPTY);
  });

  it('reads the fixture state when fixtures are on', async () => {
    const state = await getDeskState(true);
    const file = JSON.parse(readFileSync(new URL('../src/content-fixtures/desk-state.json', import.meta.url), 'utf8')) as unknown;
    expect(state).toEqual(parseDeskState(file));
    expect(state.lastRun?.outcome).toBe('published');
    expect(state.corrections).toHaveLength(1);
  });

  it('follows the build mode when it is not told which to read', async () => {
    vi.stubEnv('ROBYWIRE_FIXTURES', '1');
    vi.resetModules();
    const inFixtureMode = await import('../src/lib/desk-state');
    expect((await inFixtureMode.getDeskState()).lastRun?.outcome).toBe('published');

    vi.stubEnv('ROBYWIRE_FIXTURES', '');
    vi.resetModules();
    const inProductionMode = await import('../src/lib/desk-state');
    expect((await inProductionMode.getDeskState()).lastRun).toBeNull();
  });
});

describe('correctionsFor', () => {
  const state: DeskState = {
    ...EMPTY,
    corrections: [
      correction('2026-10-02T08:00:00Z', FX2),
      correction('2026-10-03T09:12:00Z', 'other-piece'),
      correction('2026-10-04T10:00:00Z', FX2, 'retraction'),
    ],
  };

  it('lists the entries for one slug, newest first', () => {
    expect(correctionsFor(state, FX2).map((entry) => [entry.at, entry.kind])).toEqual([
      ['2026-10-04T10:00:00Z', 'retraction'],
      ['2026-10-02T08:00:00Z', 'correction'],
    ]);
  });

  it('is empty for a slug with no entry', () => {
    expect(correctionsFor(state, 'no-such-piece')).toEqual([]);
  });

  it('does not change the state it is given', () => {
    const before = structuredClone(state);
    correctionsFor(state, FX2);
    expect(state).toEqual(before);
  });
});
```

**Create `site/test/match-pieces.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import type { NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from '../src/lib/match-pieces';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
const base = LedgerEntry.parse(JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')));

/** A news entry and a ledger entry for one slug, shaped like Astro's collection entries. */
function pair(slug: string, publishedAt: string, change: Partial<LedgerEntry> = {}) {
  const ledger: LedgerEntry = { ...base, slug, publishedAt, title: `Title of ${slug}`, categories: ['humanoids'], ...change };
  const data: NewsFrontmatter = {
    title: `Title of ${slug}`,
    description: 'A description.',
    publishedAt,
    categories: ['humanoids'],
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };
  return { news: { id: slug, data }, ledger: { id: slug, data: ledger } };
}

const matched = (...pairs: ReturnType<typeof pair>[]) => matchPieces(pairs.map((p) => p.news), pairs.map((p) => p.ledger));

describe('matchPieces: joining', () => {
  it('returns an empty list when there is no content', () => {
    expect(matchPieces([], [])).toEqual([]);
  });

  it('pairs each piece with the ledger entry of the same id', () => {
    const a = pair('a-piece', '2026-10-03');
    const [only] = matched(a);
    expect(only).toEqual({ slug: 'a-piece', news: a.news, ledger: a.ledger });
  });

  it('pairs by id, whatever order the two lists come in', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    const result = matchPieces([a.news, b.news], [b.ledger, a.ledger]);
    expect(result.map((piece) => [piece.slug, piece.ledger.id])).toEqual([
      ['a-piece', 'a-piece'],
      ['b-piece', 'b-piece'],
    ]);
  });
});

describe('matchPieces: order', () => {
  it('puts the newest piece first', () => {
    const result = matched(pair('old', '2026-10-01'), pair('new', '2026-10-04'), pair('middle', '2026-10-02'));
    expect(result.map((piece) => piece.slug)).toEqual(['new', 'middle', 'old']);
  });

  it('orders pieces of the same day by slug', () => {
    const result = matched(pair('b-piece', '2026-10-04'), pair('a-piece', '2026-10-04'), pair('c-piece', '2026-10-04'));
    expect(result.map((piece) => piece.slug)).toEqual(['a-piece', 'b-piece', 'c-piece']);
  });

  it('does not change the lists it is given', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-04');
    const news = [a.news, b.news];
    matchPieces(news, [a.ledger, b.ledger]);
    expect(news.map((entry) => entry.id)).toEqual(['a-piece', 'b-piece']);
  });
});

describe('matchPieces: content that does not fit together', () => {
  it('names a piece that has no ledger entry', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([a.news], [])).toThrow('the piece "a-piece" has no ledger file');
  });

  it('names a ledger entry that has no piece', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([], [a.ledger])).toThrow('the ledger entry "a-piece" has no piece');
  });

  it('names a ledger whose slug is not its file name', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { slug: 'other' }))).toThrow('the ledger entry "a-piece" says its slug is "other"');
  });

  it('names a ledger whose title, date or categories differ from the piece', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { title: 'Another title' }))).toThrow('the title in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { publishedAt: '2026-10-02' }))).toThrow('the date in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { categories: ['humanoids', 'funding'] }))).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
    const longer = pair('a-piece', '2026-10-03');
    longer.news.data.categories = ['humanoids', 'funding'];
    expect(() => matched(longer)).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
  });

  it('reports every problem at once, under one heading', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [b.ledger])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has no ledger file\n- the ledger entry "b-piece" has no piece',
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/desk-state.test.ts test/match-pieces.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/desk-state'` and `Cannot find module '../src/lib/match-pieces'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/match-pieces.ts`:**
```ts
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';

// A piece is two files with the same name: the MDX the reader sees and the
// ledger JSON behind its receipts. This module joins them and refuses content
// where they do not belong together, so a half-written piece fails the build
// instead of producing a page with no receipts. It knows nothing about Astro,
// so it can be tested on its own; lib/pieces.ts feeds it Astro's collections.

/** The part of an Astro collection entry that is used here. */
export interface Keyed<T> {
  id: string;
  data: T;
}

export interface Matched<N, L> {
  slug: string;
  news: N;
  ledger: L;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, at) => item === b[at]);

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
 * the same day stay in slug order, because the lists are sorted by id first and
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, and a ledger entry whose
 * slug, title, date or categories disagree with its piece.
 */
export function matchPieces<N extends Keyed<NewsFrontmatter>, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
): Matched<N, L>[] {
  const ledgerById = new Map(ledgers.map((entry) => [entry.id, entry]));
  const newsIds = new Set(news.map((entry) => entry.id));
  const problems: string[] = [];
  const matched: Matched<N, L>[] = [];

  for (const piece of [...news].sort(byId)) {
    const ledger = ledgerById.get(piece.id);
    if (ledger === undefined) {
      problems.push(`the piece "${piece.id}" has no ledger file`);
      continue;
    }
    if (ledger.data.slug !== piece.id) problems.push(`the ledger entry "${piece.id}" says its slug is "${ledger.data.slug}"`);
    if (ledger.data.title !== piece.data.title) problems.push(`the title in the ledger entry "${piece.id}" differs from the piece`);
    if (ledger.data.publishedAt !== piece.data.publishedAt) problems.push(`the date in the ledger entry "${piece.id}" differs from the piece`);
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });
  }
  for (const ledger of [...ledgers].sort(byId)) {
    if (!newsIds.has(ledger.id)) problems.push(`the ledger entry "${ledger.id}" has no piece`);
  }

  if (problems.length > 0) throw new Error(`The site content does not fit together:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);

  return matched.sort((a, b) => (a.news.data.publishedAt < b.news.data.publishedAt ? 1 : a.news.data.publishedAt > b.news.data.publishedAt ? -1 : 0));
}
```

**Create `site/src/lib/desk-state.ts`:**
```ts
import { DeskState } from '@robywire/gate';
import { useFixtures } from './env';

// The desk state is what the Desk reports about itself: its last run, the
// drafts it held and the corrections it published. The Desk will commit it as
// src/data/desk-state.json. A fixture build reads the fixture copy instead.

/** Check `raw` against the DeskState schema. A file that does not fit stops the build. */
export function parseDeskState(raw: unknown): DeskState {
  return DeskState.parse(raw);
}

/** The desk state for this build, or for fixture mode when `fixtures` says so. */
export async function getDeskState(fixtures: boolean = useFixtures): Promise<DeskState> {
  // Dynamic imports, so a production build never loads the fixture file.
  const file = fixtures ? await import('../content-fixtures/desk-state.json') : await import('../data/desk-state.json');
  return parseDeskState(file.default);
}

/** The corrections and retractions recorded against one piece, newest first. */
export function correctionsFor(state: DeskState, slug: string): DeskState['corrections'] {
  return state.corrections.filter((entry) => entry.slug === slug).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
```

**Create `site/src/lib/pieces.ts`:**
```ts
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from './match-pieces';

/** A published piece: its frontmatter, its ledger and the entry Astro renders. */
export interface Piece {
  slug: string;
  data: NewsFrontmatter;
  ledger: LedgerEntry;
  entry: CollectionEntry<'news'>;
}

/** Every piece, newest first. Throws if a piece and its ledger do not belong together. */
export async function getPieces(): Promise<Piece[]> {
  const [news, ledgers] = await Promise.all([getCollection('news'), getCollection('ledger')]);
  return matchPieces(news, ledgers).map(({ slug, news: entry, ledger }) => ({ slug, data: entry.data, ledger: ledger.data, entry }));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/desk-state.test.ts test/match-pieces.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/desk-state.ts site/src/lib/match-pieces.ts site/src/lib/pieces.ts site/test/desk-state.test.ts site/test/match-pieces.test.ts
git commit -m "feat(site): read the desk state and join each piece with its ledger" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 39: Design tokens, global styles and the rules that guard them

**Files:**
- Create: `site/src/styles/tokens.css`, `site/src/styles/global.css`
- Test: `site/test/contrast.test.ts`

The house register is quieter, thinner and greyer: system fonts only (no font requests), one-pixel hairlines, square corners, no italics, no images, one reading column of about 65 characters, light and dark following the system setting, colour only where it means something. Blue marks links and anything that links to a receipt; green and red appear only for a gate that passed or failed.

Those rules are easy to break by accident, so they are tests first. `site/test/contrast.test.ts` does two jobs:
- It reads `tokens.css` and checks, in both the light and the dark scheme, that every text colour (`t1`, `t2`, `link`, `pass`, `fail`) reaches the WCAG AA contrast of 4.5 to 1 on both grounds (`bg` and `paper`). The contrast function is the WCAG formula, tested against known values.
- It reads every `.css` and `.astro` file under `site/src` and fails on italics, an `<i>` or `<em>`, a web font, an `<img>`, a rounded corner, or a border wider than one pixel. A table of small snippets proves that the detector flags each of these and allows the near misses (a two-pixel outline is not a border).

You write the tokens from the suggested starting values, watch the test find the one that is too pale, and darken it.

- [ ] **Step 1: Write the failing test**

**Create `site/test/contrast.test.ts`:**
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The design register is quiet, thin and grey, and it has rules that a
// reviewer would otherwise have to check by eye: text must be readable in both
// colour schemes, borders are one pixel, corners are square, nothing is
// italic, there are no web fonts and no images. This file turns the rules
// into tests that read the real stylesheets and templates.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// --- WCAG contrast ----------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a colour written as #rrggbb. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio of two #rrggbb colours, from 1 (identical) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('contrast', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#5B6470', '#5B6470')).toBeCloseTo(1, 5);
  });

  it('does not depend on which colour is the text', () => {
    expect(contrast('#14181D', '#FFFFFF')).toBeCloseTo(contrast('#FFFFFF', '#14181D'), 10);
  });

  it('matches the well-known values for grey on white', () => {
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

// --- Tokens -----------------------------------------------------------------

function declarations(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) found[match[1]!] = match[2]!.trim();
  return found;
}

/** The light tokens (:root) and the dark tokens (inside the prefers-color-scheme: dark media query). */
function readTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const media = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(css);
  if (media === null) throw new Error('tokens.css has no @media (prefers-color-scheme: dark) block');
  const start = media.index + media[0].length;
  let depth = 1;
  let end = start;
  while (end < css.length && depth > 0) {
    if (css[end] === '{') depth++;
    if (css[end] === '}') depth--;
    end++;
  }
  const root = (block: string): string => /:root\s*\{([^}]*)\}/.exec(block)?.[1] ?? '';
  return { light: declarations(root(css.slice(0, media.index) + css.slice(end))), dark: declarations(root(css.slice(start, end - 1))) };
}

const tokens = readTokens(readFileSync(path.join(SRC, 'styles', 'tokens.css'), 'utf8'));
const SCHEMES = [
  ['light', tokens.light],
  ['dark', tokens.dark],
] as const;
const TEXT_TOKENS = ['t1', 't2', 'link', 'pass', 'fail'];
const GROUNDS = ['bg', 'paper'];
const ALL_TOKENS = ['bg', 'paper', 'line', 'line-2', ...TEXT_TOKENS];

describe('tokens.css', () => {
  it.each(SCHEMES)('defines every colour token in the %s scheme as a six-digit hex colour', (_scheme, values) => {
    for (const name of ALL_TOKENS) expect(values[name], name).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  const cases = SCHEMES.flatMap(([scheme, values]) => TEXT_TOKENS.flatMap((text) => GROUNDS.map((ground) => [scheme, text, ground, values] as const)));

  it.each(cases)('%s scheme: %s text on %s reaches 4.5:1', (_scheme, text, ground, values) => {
    expect(contrast(values[text]!, values[ground]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the two schemes apart: dark text is light and the dark ground is dark', () => {
    expect(luminance(tokens.dark.bg!)).toBeLessThan(0.05);
    expect(luminance(tokens.dark.t1!)).toBeGreaterThan(0.5);
    expect(luminance(tokens.light.bg!)).toBeGreaterThan(0.9);
  });
});

// --- The stylesheet and template rules ---------------------------------------

/** What is wrong with a stylesheet or template, in words. An empty list means it keeps the rules. */
function lawViolations(source: string): string[] {
  const found: string[] = [];
  if (/font-style\s*:\s*italic/i.test(source)) found.push('uses font-style: italic');
  if (/<(i|em)[\s>]/i.test(source)) found.push('uses an <i> or <em> element');
  if (/@font-face/i.test(source)) found.push('declares a web font with @font-face');
  if (/<img[\s>]/i.test(source)) found.push('uses an <img> element');

  for (const match of source.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]*)/gi)) {
    const values = match[1]!.replace(/!important/i, '').trim().split(/[\s/]+/);
    if (!values.every((value) => /^0(px|rem|em|%)?$/.test(value))) found.push(`has a rounded corner: ${match[0]!.trim()}`);
  }

  for (const match of source.matchAll(/(?<![a-z-])border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?\s*:\s*([^;}]*)/gi)) {
    const value = match[1]!;
    if (/\b(medium|thick)\b/i.test(value)) found.push(`has a border wider than 1px: ${match[0]!.trim()}`);
    for (const size of value.matchAll(/(\d*\.?\d+)\s*(px|rem|em)\b/gi)) {
      const pixels = Number(size[1]) * (size[2]!.toLowerCase() === 'px' ? 1 : 16);
      if (pixels > 1) found.push(`has a border wider than 1px: ${match[0]!.trim()}`);
    }
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(css|astro)$/.test(name) ? [full] : [];
  });
}

describe('the rules the detector knows', () => {
  it.each([
    ['italic text', '.a { font-style: italic; }', 'uses font-style: italic'],
    ['an <em> element', '<p>a <em>b</em></p>', 'uses an <i> or <em> element'],
    ['an <i> element', '<p>a <i>b</i></p>', 'uses an <i> or <em> element'],
    ['a web font', '@font-face { font-family: X; }', 'declares a web font with @font-face'],
    ['an image', '<img src="a.png" alt="">', 'uses an <img> element'],
    ['a rounded corner', '.a { border-radius: 4px; }', 'has a rounded corner: border-radius: 4px'],
    ['a rounded corner on one corner', '.a { border-top-left-radius: 50%; }', 'has a rounded corner: border-top-left-radius: 50%'],
    ['a two-pixel border', '.a { border: 2px solid red; }', 'has a border wider than 1px: border: 2px solid red'],
    ['a three-pixel bottom border', '.a { border-bottom: 3px solid red; }', 'has a border wider than 1px: border-bottom: 3px solid red'],
    ['a border width in rem', '.a { border-width: 0.5rem; }', 'has a border wider than 1px: border-width: 0.5rem'],
    ['a thick border', '.a { border: thick solid; }', 'has a border wider than 1px: border: thick solid'],
  ])('flags %s', (_label, source, expected) => {
    expect(lawViolations(source)).toEqual([expected]);
  });

  it.each([
    ['a hairline border', '.a { border: 1px solid var(--line); }'],
    ['no border', '.a { border: none; border-top: 0; }'],
    ['square corners', '.a { border-radius: 0; border-radius: 0 !important; }'],
    ['a two-pixel outline, which is not a border', '.a { outline: 2px solid var(--link); }'],
    ['a two-pixel underline thickness', '.a { text-decoration-thickness: 2px; }'],
    ['a fractional hairline', '.a { border-bottom: 0.5px solid red; }'],
  ])('allows %s', (_label, source) => {
    expect(lawViolations(source)).toEqual([]);
  });
});

describe('the stylesheets and templates under site/src', () => {
  const files = sourceFiles(SRC);

  it('include the token and global stylesheets, so the rules are not checked against nothing', () => {
    const names = files.map((file) => path.basename(file));
    expect(names).toContain('tokens.css');
    expect(names).toContain('global.css');
  });

  it.each(files.map((file) => [path.relative(SRC, file), file] as const))('%s keeps the rules', (_name, file) => {
    expect(lawViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` and `tokens.css`.

- [ ] **Step 3: Write the tokens, with the suggested starting values**

**Create `site/src/styles/tokens.css`:**
```css
/* Design tokens. Colour means something here: blue is a link or a receipt,
   green and red appear only for a gate that passed or failed, and everything
   else is grey. Light and dark follow the system setting; there is no toggle. */
:root {
  color-scheme: light dark;

  --bg: #FFFFFF;
  --paper: #F6F7F8;
  --line: #E4E7EA;
  --line-2: #C9CDD2;
  --t1: #14181D;
  --t2: #5B6470;
  --link: #1F6FEB;
  --pass: #0E7C3A;
  --fail: #C4262C;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0F1216;
    --paper: #151A20;
    --line: #232A32;
    --line-2: #343D47;
    --t1: #E8ECF0;
    --t2: #9AA6B2;
    --link: #6EA8FF;
    --pass: #3DD68C;
    --fail: #FF7A7F;
  }
}
```

The test also looks for a file called `global.css`, so create it with a one-line placeholder for now.

**Create `site/src/styles/global.css`:**
```css
/* placeholder so the law tests have a file to read */
```

- [ ] **Step 4: Run the test and see the colour that fails**

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: FAIL — `light scheme: link text on paper reaches 4.5:1` and `expected 4.32`: the suggested blue is only 4.3 to 1 on the light grey of `paper`. Everything else reaches 4.5 or more.

- [ ] **Step 5: Darken the light link colour and write the global stylesheet**

The light link becomes `#1B66DF`: 5.2 to 1 on white and 4.9 to 1 on `paper`. The comment records why.

**Replace `site/src/styles/tokens.css` with:**
```css
/* Design tokens. Colour means something here: blue is a link or a receipt,
   green and red appear only for a gate that passed or failed, and everything
   else is grey. Light and dark follow the system setting; there is no toggle.
   Every text colour reaches 4.5:1 on both grounds in both schemes
   (site/test/contrast.test.ts). The light link began as #1F6FEB, which reaches
   only 4.3:1 on paper, so it is #1B66DF. */
:root {
  color-scheme: light dark;

  --bg: #FFFFFF;
  --paper: #F6F7F8;
  --line: #E4E7EA;
  --line-2: #C9CDD2;
  --t1: #14181D;
  --t2: #5B6470;
  --link: #1B66DF;
  --pass: #0E7C3A;
  --fail: #C4262C;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0F1216;
    --paper: #151A20;
    --line: #232A32;
    --line-2: #343D47;
    --t1: #E8ECF0;
    --t2: #9AA6B2;
    --link: #6EA8FF;
    --pass: #3DD68C;
    --fail: #FF7A7F;
  }
}
```

The global stylesheet holds the reset, the type, the reading column, the skip link, the focus ring, the claim marker, the chips, the tables and the ledger strip. Each rule belongs to a page built in this milestone; later tasks add rules in files of their own.

**Replace `site/src/styles/global.css` with:**
```css
/* Reset, base type and the pieces shared by every page. System fonts only, so
   the site makes no font requests. One-pixel hairlines and square corners
   throughout. Focus rings are outlines, which are not borders, so they may be
   two pixels wide. There is no motion. */

*,
*::before,
*::after {
  box-sizing: border-box;
  border-radius: 0;
}

html {
  font-size: 106.25%;
  -webkit-text-size-adjust: 100%;
}

@media (min-width: 48em) {
  html {
    font-size: 112.5%;
  }
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--t1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

h1 {
  font-size: 2rem;
}

h2 {
  font-size: 1.35rem;
}

h3 {
  font-size: 1.1rem;
}

p,
ul,
ol,
dl,
blockquote,
table {
  margin: 0 0 1em;
}

a {
  color: var(--link);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

code,
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}

/* Keyboard focus: a two-pixel outline in the link colour. */
:focus-visible {
  outline: 2px solid var(--link);
  outline-offset: 2px;
}

/* The page frame. */
.container {
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding-inline: 1.25rem;
}

/* Skip link: the first thing a keyboard reaches, hidden until it has focus. */
.skip-link {
  position: absolute;
  left: 0.5rem;
  top: -4rem;
  z-index: 10;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  color: var(--link);
}

.skip-link:focus {
  top: 0.5rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* One reading column, about 65 characters wide. */
.prose {
  max-width: 65ch;
}

.prose h2 {
  margin: 2em 0 0.6em;
}

.prose ul {
  padding-left: 1.2em;
}

.prose li {
  margin-bottom: 0.4em;
}

/* A claim marker: a small blue number after a sentence that links to its receipt. */
.prose a[href*="/receipts/#"] {
  font-size: 0.7em;
  line-height: 0;
  vertical-align: super;
  text-decoration: none;
}

.prose a[href*="/receipts/#"] + a[href*="/receipts/#"] {
  margin-left: 0.3em;
}

.prose a[href*="/receipts/#"]:hover {
  text-decoration: underline;
}

/* Chips: small labels in a hairline box. Green and red mean a gate passed or failed, nothing else. */
.chip {
  display: inline-block;
  padding: 0 0.5em;
  border: 1px solid var(--line-2);
  color: var(--t2);
  font-size: 0.75rem;
  line-height: 1.5;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.chip--pass {
  border-color: var(--pass);
  color: var(--pass);
}

.chip--fail {
  border-color: var(--fail);
  color: var(--fail);
}

.chip--tier1 {
  border-color: var(--t1);
  color: var(--t1);
}

.chip--tier2 {
  border-style: dashed;
  color: var(--t2);
}

/* Tables: hairline rows, a firmer line under the header. */
table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.5rem 1rem 0.5rem 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

th {
  border-bottom-color: var(--line-2);
  font-weight: 600;
}

/* The ledger strip: four plain figures with a label each. */
.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem 2rem;
  margin: 0;
  padding: 1rem 0;
  border-top: 1px solid var(--line-2);
  border-bottom: 1px solid var(--line);
}

.stat {
  margin: 0;
}

.stat dt {
  color: var(--t2);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stat dd {
  margin: 0;
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add site/src/styles site/test/contrast.test.ts
git commit -m "feat(site): add the design tokens and global styles, with contrast and style-rule tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Prove the rule test can fail on a real file**

Add a forbidden rule to the stylesheet.

Run: `printf '\n.x { font-style: italic; border: 2px solid red; }\n' >> site/src/styles/global.css`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: FAIL — `styles/global.css keeps the rules`.

Take it out again.

Run: `git checkout -- site/src/styles/global.css`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

---

### Task 40: Date, beat-label, plural and title helpers

**Files:**
- Create: `site/src/lib/format.ts`
- Test: `site/test/format.test.ts`

Small text helpers that the pages share. Dates are written from their digits, never through the machine's time zone, so a build gives the same page anywhere; a test changes `TZ` to prove it.

- `formatDate('2026-10-04')` is `4 Oct 2026`. It throws unless the text is a real calendar date: `2026-02-30` and `2027-02-29` are refused.
- `formatDateTime('2026-10-04T04:41:12Z')` is `4 Oct 2026, 04:41 UTC`; an offset is converted to UTC.
- `beatLabel(slug)` is the name shown for a beat or the funding tag, and throws for anything else.
- `plural(n, one, many)` is a count with the right word: `1 claim`, `28 claims`.
- `documentTitle(page)` is the text of the `<title>`: the page name, a dash, then `Robywire`, unless the page name already says Robywire.

- [ ] **Step 1: Write the failing test**

**Create `site/test/format.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB } from '@robywire/gate';
import { beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

describe('formatDate', () => {
  it.each([
    ['2026-10-04', '4 Oct 2026'],
    ['2026-01-01', '1 Jan 2026'],
    ['2026-12-31', '31 Dec 2026'],
    ['2026-02-28', '28 Feb 2026'],
    ['2028-02-29', '29 Feb 2028'],
    ['2026-09-09', '9 Sep 2026'],
  ])('writes %s as %s', (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['2026-00-10'], ['2026-10-32'], ['2027-02-29'], ['0050-01-01'], ['4 Oct 2026'], ['2026-10-4'], ['2026-10-04T04:30:00Z'], [''], [' 2026-10-04']])(
    'refuses %j',
    (bad) => {
      expect(() => formatDate(bad)).toThrow(`formatDate: ${JSON.stringify(bad)} is not a date in the form YYYY-MM-DD`);
    },
  );

  it('does not depend on the time zone of the machine', () => {
    const before = process.env.TZ;
    try {
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        process.env.TZ = zone;
        expect(formatDate('2026-10-04')).toBe('4 Oct 2026');
        expect(formatDateTime('2026-10-04T23:59:00Z')).toBe('4 Oct 2026, 23:59 UTC');
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('formatDateTime', () => {
  it.each([
    ['2026-10-04T04:41:12Z', '4 Oct 2026, 04:41 UTC'],
    ['2026-10-03T09:12:00Z', '3 Oct 2026, 09:12 UTC'],
    ['2026-12-31T23:59:59Z', '31 Dec 2026, 23:59 UTC'],
    ['2026-10-04T00:00:00Z', '4 Oct 2026, 00:00 UTC'],
  ])('writes %s as %s', (iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });

  it('converts an offset to UTC', () => {
    expect(formatDateTime('2026-10-04T06:41:12+02:00')).toBe('4 Oct 2026, 04:41 UTC');
    expect(formatDateTime('2026-10-03T23:30:00-05:00')).toBe('4 Oct 2026, 04:30 UTC');
  });

  it('refuses something that is not a date and time', () => {
    expect(() => formatDateTime('yesterday')).toThrow('formatDateTime: "yesterday" is not a date and time');
    expect(() => formatDateTime('2026-10-04')).toThrow('formatDateTime: "2026-10-04" is not a date and time');
    expect(() => formatDateTime('2026-13-45T25:61:00Z')).toThrow('formatDateTime: "2026-13-45T25:61:00Z" is not a date and time');
  });
});

describe('beatLabel', () => {
  it('has a label for every beat and tag in the vocabulary, each different', () => {
    const labels = CATEGORY_VOCAB.map((slug) => beatLabel(slug));
    expect(new Set(labels).size).toBe(CATEGORY_VOCAB.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it('gives the labels the header and the chips show', () => {
    expect(beatLabel('humanoids')).toBe('Humanoids');
    expect(beatLabel('home-consumer')).toBe('Home & consumer');
    expect(beatLabel('industrial-warehouse')).toBe('Industrial & warehouse');
    expect(beatLabel('field-mobility')).toBe('Field & mobility');
    expect(beatLabel('software-autonomy')).toBe('Software & autonomy');
    expect(beatLabel('components-supply-chain')).toBe('Components & supply chain');
    expect(beatLabel('policy-standards')).toBe('Policy & standards');
    expect(beatLabel('funding')).toBe('Funding');
  });

  it('throws on a slug that is not in the vocabulary', () => {
    expect(() => beatLabel('robots')).toThrow('beatLabel: "robots" is not a beat or a tag');
    expect(() => beatLabel('')).toThrow('beatLabel: "" is not a beat or a tag');
    expect(() => beatLabel('constructor')).toThrow('beatLabel: "constructor" is not a beat or a tag');
  });
});

describe('plural', () => {
  it.each([
    [0, '0 claims'],
    [1, '1 claim'],
    [2, '2 claims'],
    [28, '28 claims'],
  ])('writes %i as %s', (n, expected) => {
    expect(plural(n, 'claim', 'claims')).toBe(expected);
  });

  it('uses the words it is given', () => {
    expect(plural(1, 'source', 'sources')).toBe('1 source');
    expect(plural(5, 'hold', 'holds')).toBe('5 holds');
  });
});

// The em dash is written as a code, so this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);

describe('documentTitle', () => {
  it('adds the site name after a dash', () => {
    expect(documentTitle('Humanoids')).toBe(`Humanoids ${EM_DASH} Robywire`);
  });

  it('leaves a title that already names the site as it is', () => {
    expect(documentTitle('Robywire')).toBe('Robywire');
    expect(documentTitle('Robywire: daily robotics news')).toBe('Robywire: daily robotics news');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/format.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/format'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/format.ts`:**
```ts
import type { Category } from '@robywire/gate';

// Small text helpers for the pages. Dates are written from their digits, never
// through the machine's time zone, so a build gives the same page anywhere.

export const SITE_NAME = 'Robywire';

// Written as a code so that this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "2026-10-04" as "4 Oct 2026". Throws unless the text is a real calendar date. */
export function formatDate(isoDate: string): string {
  const match = DATE.exec(isoDate);
  if (match !== null) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // A date that rolls over (30 February) or an old year that Date reads as
    // 19xx does not write back as the same text.
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === isoDate) {
      return `${day} ${MONTHS[month - 1]} ${year}`;
    }
  }
  throw new Error(`formatDate: ${JSON.stringify(isoDate)} is not a date in the form YYYY-MM-DD`);
}

/** "2026-10-04T04:41:12Z" as "4 Oct 2026, 04:41 UTC". Any offset is converted to UTC. */
export function formatDateTime(isoDateTime: string): string {
  const moment = new Date(isoDateTime);
  if (!DATE_TIME.test(isoDateTime) || Number.isNaN(moment.getTime())) {
    throw new Error(`formatDateTime: ${JSON.stringify(isoDateTime)} is not a date and time`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${moment.getUTCDate()} ${MONTHS[moment.getUTCMonth()]} ${moment.getUTCFullYear()}, ${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())} UTC`;
}

const LABELS: Record<Category, string> = {
  humanoids: 'Humanoids',
  'home-consumer': 'Home & consumer',
  'industrial-warehouse': 'Industrial & warehouse',
  'field-mobility': 'Field & mobility',
  'software-autonomy': 'Software & autonomy',
  'components-supply-chain': 'Components & supply chain',
  'policy-standards': 'Policy & standards',
  funding: 'Funding',
};

/** The name shown for a beat or tag slug. Throws for a slug outside the vocabulary. */
export function beatLabel(slug: string): string {
  if (!Object.hasOwn(LABELS, slug)) throw new Error(`beatLabel: ${JSON.stringify(slug)} is not a beat or a tag`);
  return LABELS[slug as Category];
}

/** A count with the right word: "1 claim", "28 claims". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The text of the <title> element: the page name, then the site name, unless the page name already has it. */
export function documentTitle(page: string): string {
  return page.includes(SITE_NAME) ? page : `${page} ${EM_DASH} ${SITE_NAME}`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/format.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/format.ts site/test/format.test.ts
git commit -m "feat(site): add date, beat-label, plural and title helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 41: The base layout, header, footer and fixture ribbon

**Files:**
- Create: `site/src/lib/nav.ts`, `site/src/layouts/Base.astro`, `site/src/components/Header.astro`, `site/src/components/Footer.astro`, `site/src/components/FixtureRibbon.astro`, `site/src/styles/layout.css`
- Modify: `site/src/pages/index.astro` (use the layout)
- Test: `site/test/nav.test.ts`

Every page is wrapped in `Base.astro`: the language, character set, viewport, a `<title>` built with `documentTitle`, the description, a canonical link built from the site URL, Open Graph tags, a skip link as the first focusable element, the header, `<main id="main">`, and the footer. In a fixture build a ribbon at the top says `FIXTURE DATA — not real reporting`; a production build has none.

`src/lib/nav.ts` holds what the header and footer link to, so it can be tested: the seven beats and Method in the header (the wordmark is the link home), and the footer's links to the method, status, holds and corrections pages and the feed. It also holds the disclosure sentence of the footer. The disclosure says that pieces are produced by an automated pipeline and published only when every factual sentence is traced to a primary source, and the test makes sure it claims nothing the site does not yet do: no second model, no independent check, no human review. Those belong on the method page, described as the design.

The pages the footer links to (`/method/`, `/status/`, `/holds/`, `/corrections/`, `/rss.xml`) do not exist yet; a later milestone builds them.

- [ ] **Step 1: Write the failing test**

**Create `site/test/nav.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { BEATS } from '@robywire/gate';
import { DISCLOSURE, FOOTER_LINKS, NAV_ITEMS, isCurrent } from '../src/lib/nav';
import { beatLabel } from '../src/lib/format';

describe('NAV_ITEMS', () => {
  it('lists the seven beats in vocabulary order, then Method', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([...BEATS.map((beat) => `/topics/${beat}/`), '/method/']);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([...BEATS.map((beat) => beatLabel(beat)), 'Method']);
  });

  it('does not list the funding tag, which is not a beat', () => {
    expect(NAV_ITEMS.some((item) => item.href.includes('funding'))).toBe(false);
  });

  it('links to folders, every href ending in a slash', () => {
    for (const item of NAV_ITEMS) expect(item.href.endsWith('/'), item.href).toBe(true);
  });
});

describe('FOOTER_LINKS', () => {
  it('links to the method, status, holds and corrections pages and the feed', () => {
    expect(FOOTER_LINKS).toEqual([
      { label: 'Method', href: '/method/' },
      { label: 'Status', href: '/status/' },
      { label: 'Holds', href: '/holds/' },
      { label: 'Corrections', href: '/corrections/' },
      { label: 'RSS', href: '/rss.xml' },
    ]);
  });
});

describe('DISCLOSURE', () => {
  it('says the pieces come from an automated pipeline and are published only when every factual sentence is traced to a primary source', () => {
    expect(DISCLOSURE).toContain('automated pipeline');
    expect(DISCLOSURE).toContain('every factual sentence');
    expect(DISCLOSURE).toContain('primary source');
  });

  it('claims nothing the site does not do yet: no second model, no independent check, no human review', () => {
    expect(DISCLOSURE).not.toMatch(/second model|verifier|independent|review|human|editor/i);
  });

  it('is a short passage, not a page', () => {
    expect(DISCLOSURE.length).toBeLessThan(400);
  });
});

describe('isCurrent', () => {
  it('is true for the page itself', () => {
    expect(isCurrent('/method/', '/method/')).toBe(true);
    expect(isCurrent('/topics/humanoids/', '/topics/humanoids/')).toBe(true);
  });

  it('is true for a page below it', () => {
    expect(isCurrent('/topics/humanoids/', '/topics/humanoids/page/2/')).toBe(true);
  });

  it('is false for another page, including one whose address only starts the same way', () => {
    expect(isCurrent('/topics/humanoids/', '/topics/home-consumer/')).toBe(false);
    expect(isCurrent('/topics/home/', '/topics/home-consumer/')).toBe(false);
    expect(isCurrent('/method/', '/')).toBe(false);
  });

  it('treats the home page as current only for the home page', () => {
    expect(isCurrent('/', '/')).toBe(true);
    expect(isCurrent('/', '/method/')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/nav.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/nav'`.

- [ ] **Step 3: Write the navigation module**

**Create `site/src/lib/nav.ts`:**
```ts
import { BEATS } from '@robywire/gate';
import { beatLabel } from './format';

// What the header and footer link to, and what the footer says. The wordmark
// is the link home, so the header lists the seven beats and Method.

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  ...BEATS.map((beat) => ({ label: beatLabel(beat), href: `/topics/${beat}/` })),
  { label: 'Method', href: '/method/' },
];

export const FOOTER_LINKS: readonly NavItem[] = [
  { label: 'Method', href: '/method/' },
  { label: 'Status', href: '/status/' },
  { label: 'Holds', href: '/holds/' },
  { label: 'Corrections', href: '/corrections/' },
  { label: 'RSS', href: '/rss.xml' },
];

/**
 * The disclosure shown on every page. It says only what is true of the
 * design: it does not mention a second model or a human, because the page for
 * the method describes those, as plans, where they belong.
 */
export const DISCLOSURE =
  'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

/** True when `pathname` is the page `href` or a page below it. The home page matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/nav.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Write the components, the layout and its stylesheet**

**Create `site/src/components/FixtureRibbon.astro`:**
```astro
---
// Shown on every page of a fixture build and on no page of a production build.
---

<div class="ribbon" role="note">FIXTURE DATA &mdash; not real reporting</div>
```

**Create `site/src/components/Header.astro`:**
```astro
---
import { NAV_ITEMS, isCurrent } from '../lib/nav';

const pathname = Astro.url.pathname;
---

<header class="site-header">
  <div class="container site-header__inner">
    <a class="wordmark" href="/">Robywire</a>
    <nav aria-label="Beats">
      <ul class="nav">
        {
          NAV_ITEMS.map((item) => (
            <li>
              <a href={item.href} aria-current={isCurrent(item.href, pathname) ? 'page' : undefined}>
                {item.label}
              </a>
            </li>
          ))
        }
      </ul>
    </nav>
  </div>
</header>
```

**Create `site/src/components/Footer.astro`:**
```astro
---
import { DISCLOSURE, FOOTER_LINKS } from '../lib/nav';
---

<footer class="site-footer">
  <div class="container">
    <p class="disclosure">{DISCLOSURE}</p>
    <nav aria-label="About this site">
      <ul class="footer-links">
        {
          FOOTER_LINKS.map((item) => (
            <li>
              <a href={item.href}>{item.label}</a>
            </li>
          ))
        }
      </ul>
    </nav>
  </div>
</footer>
```

**Create `site/src/layouts/Base.astro`:**
```astro
---
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/layout.css';
import FixtureRibbon from '../components/FixtureRibbon.astro';
import Footer from '../components/Footer.astro';
import Header from '../components/Header.astro';
import { useFixtures } from '../lib/env';
import { documentTitle } from '../lib/format';

interface Props {
  /** The name of the page. The site name is added after it. */
  title: string;
  description: string;
  /** The path of the page, such as "/news/some-slug/". The canonical link is built from it and the site URL. */
  canonicalPath: string;
  noindex?: boolean;
  /** The path or URL of the share image. */
  ogImage?: string;
  ogType?: 'website' | 'article';
}

const { title, description, canonicalPath, noindex = false, ogImage, ogType = 'website' } = Astro.props;
const fullTitle = documentTitle(title);
const canonical = new URL(canonicalPath, Astro.site).href;
const image = ogImage === undefined ? undefined : new URL(ogImage, Astro.site).href;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <!-- An empty icon, so that browsers do not ask for /favicon.ico. -->
    <link rel="icon" href="data:," />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:site_name" content="Robywire" />
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    {image !== undefined && <meta property="og:image" content={image} />}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to the content</a>
    {useFixtures && <FixtureRibbon />}
    <Header />
    <main id="main">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

**Create `site/src/styles/layout.css`:**
```css
/* The frame around every page: the fixture ribbon, the header, the footer. */

.ribbon {
  padding: 0.35rem 1.25rem;
  border-bottom: 1px solid var(--line-2);
  background: var(--paper);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-align: center;
}

.site-header {
  border-bottom: 1px solid var(--line);
}

.site-header__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 2rem;
  padding-block: 1rem;
}

.wordmark {
  color: var(--t1);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.nav,
.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.nav a,
.footer-links a {
  color: var(--t2);
  text-decoration: none;
}

.nav a:hover,
.footer-links a:hover {
  color: var(--link);
  text-decoration: underline;
}

.nav a[aria-current="page"] {
  color: var(--t1);
  text-decoration: underline;
}

main {
  padding-block: 2rem 3rem;
}

.site-footer {
  padding-block: 2rem;
  border-top: 1px solid var(--line);
  color: var(--t2);
  font-size: 0.85rem;
}

.disclosure {
  max-width: 65ch;
}
```

Make the placeholder home page use the layout.

**Replace `site/src/pages/index.astro` with:**
```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';

const news = await getCollection('news');
const ledger = await getCollection('ledger');
---

<Base title="Robywire" description="Daily robotics news, with every factual sentence traced to a primary source." canonicalPath="/">
  <div class="container">
    <p>news: {news.length}, ledger: {ledger.length}</p>
  </div>
</Base>
```

- [ ] **Step 6: Build with the fixtures and look at the frame**

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run:
```bash
F=site/dist/index.html
grep -o '<title>[^<]*</title>' $F
grep -o '<link rel="canonical" href="[^"]*">' $F
grep -o '<body><a class="skip-link" href="#main">Skip to the content</a>' $F
grep -o '<div class="ribbon" role="note">[^<]*</div>' $F
grep -o '<main id="main">' $F
grep -o 'every factual sentence in it is traced to a quoted passage in a primary source' $F
```
Expected: PASS — prints `<title>Robywire</title>`, `<link rel="canonical" href="https://robywire.example/">`, the skip link as the first thing in the body, the ribbon `FIXTURE DATA &mdash; not real reporting`, `<main id="main">` and the disclosure fragment.

- [ ] **Step 7: Build for production and check the ribbon is gone**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `grep -c 'class="ribbon"' site/dist/index.html`
Expected: FAIL — prints `0`; grep exits 1 when it counts no match.

- [ ] **Step 8: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 9: Commit**

```bash
git add site/src site/test/nav.test.ts
git commit -m "feat(site): add the base layout, header, footer and fixture ribbon" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 42: Route paths and the NewsArticle structured data

**Files:**
- Create: `site/src/lib/paths.ts`, `site/src/lib/jsonld.ts`
- Test: `site/test/paths.test.ts`, `site/test/jsonld.test.ts`

`paths.ts` writes the routes of the site once: `articlePath(slug)` is `/news/<slug>/`, `receiptsPath(slug)` is `/news/<slug>/receipts/`, `cardPath(slug)` is `/news/<slug>/card.png` (the share image, built by a later milestone), `topicPath(topic)` is `/topics/<topic>/`. A slug that is not lowercase kebab-case, and a topic outside the vocabulary, throw, so a hostile or mistyped slug cannot build a link that goes somewhere else.

`jsonld.ts` builds the `NewsArticle` structured data that goes in the article page: headline, description, `datePublished`, `dateModified` (the time of the latest correction or retraction of the piece, else the publication date), the Desk as author, Robywire as publisher, the article URL as `mainEntityOfPage` and the card URL as `image`. `jsonLdScript` writes it as JSON that is safe inside a `<script>` element: every `<` becomes the JSON escape for it, so no text in the data can close the element.

- [ ] **Step 1: Write the failing tests**

**Create `site/test/paths.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { articlePath, cardPath, receiptsPath, topicPath } from '../src/lib/paths';

describe('route paths', () => {
  it('builds the article, receipts and card paths for a slug', () => {
    expect(articlePath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/');
    expect(receiptsPath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/receipts/');
    expect(cardPath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/card.png');
  });

  it('builds the topic path for a beat or tag', () => {
    expect(topicPath('humanoids')).toBe('/topics/humanoids/');
    expect(topicPath('funding')).toBe('/topics/funding/');
  });

  it.each([[''], ['Has-Capitals'], ['has space'], ['../escape'], ['a/b'], ['-leading'], ['trailing-'], ['double--hyphen']])(
    'refuses the slug %j',
    (slug) => {
      expect(() => articlePath(slug)).toThrow(`not a slug: ${JSON.stringify(slug)}`);
      expect(() => receiptsPath(slug)).toThrow('not a slug');
      expect(() => cardPath(slug)).toThrow('not a slug');
    },
  );

  it('refuses a topic that is not in the vocabulary', () => {
    expect(() => topicPath('robots')).toThrow('not a beat or a tag: "robots"');
  });
});
```

**Create `site/test/jsonld.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

const SITE = 'https://robywire.example';
const piece = {
  slug: 'fixture-robotics-ships-fx-2-to-second-plant',
  title: 'Fixture Robotics ships its FX-2 warehouse arm to a second plant',
  description: 'Fixture Robotics has begun shipping the FX-2 arm.',
  publishedAt: '2026-10-03',
};
const correction = (at: string, slug = piece.slug, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: 'n' });

describe('newsArticleJsonLd', () => {
  const data = newsArticleJsonLd(piece, [], SITE);

  it('is a schema.org NewsArticle', () => {
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('NewsArticle');
  });

  it('carries the headline, description and publication date', () => {
    expect(data.headline).toBe(piece.title);
    expect(data.description).toBe(piece.description);
    expect(data.datePublished).toBe('2026-10-03');
  });

  it('names the Desk as the author and Robywire as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: 'Robywire Desk' });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Robywire', url: SITE });
  });

  it('points at the article page and at the card image, with full URLs', () => {
    expect(data.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': `${SITE}/news/${piece.slug}/` });
    expect(data.image).toBe(`${SITE}/news/${piece.slug}/card.png`);
  });

  it('builds the same URLs when the site URL ends in a slash', () => {
    expect(newsArticleJsonLd(piece, [], `${SITE}/`).image).toBe(`${SITE}/news/${piece.slug}/card.png`);
  });
});

describe('newsArticleJsonLd: dateModified', () => {
  it('is the publication date when nothing was corrected', () => {
    expect(newsArticleJsonLd(piece, [], SITE).dateModified).toBe('2026-10-03');
  });

  it('is the time of the latest correction or retraction of this piece', () => {
    const corrections = [correction('2026-10-04T10:00:00Z', piece.slug, 'retraction'), correction('2026-10-03T09:12:00Z')];
    expect(newsArticleJsonLd(piece, corrections, SITE).dateModified).toBe('2026-10-04T10:00:00Z');
    expect(newsArticleJsonLd(piece, [...corrections].reverse(), SITE).dateModified).toBe('2026-10-04T10:00:00Z');
  });

  it('ignores corrections of other pieces', () => {
    expect(newsArticleJsonLd(piece, [correction('2026-10-05T00:00:00Z', 'another-piece')], SITE).dateModified).toBe('2026-10-03');
  });
});

describe('jsonLdScript', () => {
  it('writes JSON that parses back to the same data', () => {
    const data = newsArticleJsonLd(piece, [], SITE);
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it('never lets the data close the script element', () => {
    const hostile = { headline: '</script><script>alert(1)</script> <!-- x' };
    const text = jsonLdScript(hostile);
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(hostile);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/paths.test.ts test/jsonld.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/jsonld'` and `Cannot find module '../src/lib/paths'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/paths.ts`:**
```ts
import { CATEGORY_VOCAB, SLUG_PATTERN } from '@robywire/gate';

// The routes of the site, written once. Every path ends in a slash except the
// share image, and every slug is checked, so a typo or a hostile slug cannot
// build a link that goes somewhere else.

function checkedSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`paths: not a slug: ${JSON.stringify(slug)}`);
  return slug;
}

/** An article page. */
export const articlePath = (slug: string): string => `/news/${checkedSlug(slug)}/`;

/** The receipts page of an article. */
export const receiptsPath = (slug: string): string => `/news/${checkedSlug(slug)}/receipts/`;

/** The share image of an article. */
export const cardPath = (slug: string): string => `/news/${checkedSlug(slug)}/card.png`;

/** The page for a beat or a tag. */
export function topicPath(topic: string): string {
  if (!(CATEGORY_VOCAB as readonly string[]).includes(topic)) throw new Error(`paths: not a beat or a tag: ${JSON.stringify(topic)}`);
  return `/topics/${topic}/`;
}
```

**Create `site/src/lib/jsonld.ts`:**
```ts
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';

// The structured data that goes in the page of an article, as schema.org
// NewsArticle. Pure, so it is tested without building the site.

export interface NewsArticleJsonLd {
  '@context': 'https://schema.org';
  '@type': 'NewsArticle';
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: { '@type': 'Organization'; name: string };
  publisher: { '@type': 'Organization'; name: string; url: string };
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string };
  image: string;
}

export interface JsonLdPiece {
  slug: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  publishedAt: string;
}

/**
 * The NewsArticle data for a piece. `dateModified` is the time of the latest
 * correction or retraction recorded for the piece, or the publication date if
 * there is none. `siteUrl` is the site's address, such as "https://robywire.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
  const absolute = (path: string): string => new URL(path, siteUrl).href;
  const latest = corrections
    .filter((entry) => entry.slug === piece.slug)
    .map((entry) => entry.at)
    .sort()
    .at(-1);
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: piece.title,
    description: piece.description,
    datePublished: piece.publishedAt,
    dateModified: latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: 'Robywire Desk' },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
    image: absolute(cardPath(piece.slug)),
  };
}

/**
 * `data` as JSON that is safe inside a <script> element: every "<" is written
 * as the JSON escape for it, so no text in the data can close the element.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\' + 'u003c');
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/paths.test.ts test/jsonld.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/paths.ts site/src/lib/jsonld.ts site/test/paths.test.ts site/test/jsonld.test.ts
git commit -m "feat(site): add route paths and the NewsArticle structured data" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 43: The article page

**Files:**
- Create: `site/src/pages/news/[slug]/index.astro`, `site/src/components/BeatChips.astro`, `site/src/components/CorrectionNotice.astro`, `site/src/styles/article.css`
- Modify: `site/src/styles/global.css` (the row of beat chips)

One page per piece, at `/news/<slug>/`, made at build time from `getPieces()`. It shows the beat chips; one `h1` with the title; the description as a dek; a byline, `Robywire Desk · automated, source-verified · <date>`, whose first part links to the method page; a notice at the top for every correction or retraction recorded against the piece (its kind, when, and the note); the article itself, rendered from the MDX inside `.prose`; and a closing line, `28 claims from 5 sources — see the receipts`, that links to the receipts page. The `NewsArticle` JSON-LD goes in a script element at the end.

The page has no test of its own: it is checked by building the site and reading the HTML, below. The helpers it uses are tested in the tasks before.

- [ ] **Step 1: Write the components and the stylesheet**

**Create `site/src/components/BeatChips.astro`:**
```astro
---
import { beatLabel } from '../lib/format';
import { topicPath } from '../lib/paths';

interface Props {
  /** Category slugs from a piece: beats and tags. */
  categories: readonly string[];
}

const { categories } = Astro.props;
---

<ul class="chips" aria-label="Beats">
  {
    categories.map((slug) => (
      <li>
        <a class="chip" href={topicPath(slug)}>
          {beatLabel(slug)}
        </a>
      </li>
    ))
  }
</ul>
```

**Create `site/src/components/CorrectionNotice.astro`:**
```astro
---
import type { DeskState } from '@robywire/gate';
import { formatDateTime } from '../lib/format';

interface Props {
  /** The corrections and retractions recorded for this piece, newest first. */
  corrections: DeskState['corrections'];
}

const { corrections } = Astro.props;
const KIND = { correction: 'Correction', retraction: 'Retraction' } as const;
---

{
  corrections.map((entry) => (
    <aside class="notice" aria-label={KIND[entry.kind]}>
      <p>
        <span class="notice__kind">{KIND[entry.kind]}</span>
        <span class="notice__when">{formatDateTime(entry.at)}</span>
      </p>
      <p>{entry.note}</p>
    </aside>
  ))
}
```

**Create `site/src/styles/article.css`:**
```css
/* The page of an article. */

.article-header {
  max-width: 65ch;
  margin-bottom: 2rem;
}

.article-header h1 {
  margin: 0.25rem 0 1rem;
  font-size: 2.25rem;
  line-height: 1.15;
}

.dek {
  margin: 0 0 1rem;
  color: var(--t2);
  font-size: 1.15rem;
}

.byline {
  margin: 0;
  color: var(--t2);
  font-size: 0.85rem;
}

.byline a {
  color: var(--t2);
}

.notice {
  max-width: 65ch;
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line-2);
  background: var(--paper);
}

.notice p {
  margin: 0;
}

.notice p + p {
  margin-top: 0.4rem;
}

.notice__kind {
  margin-right: 0.75rem;
  font-weight: 600;
}

.notice__when {
  color: var(--t2);
  font-size: 0.85rem;
}

.receipts-link {
  max-width: 65ch;
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line-2);
  color: var(--t2);
}
```

The chips are links to the topic pages; add the row to the global stylesheet.

**In `site/src/styles/global.css`, replace:**
```css
  color: var(--t2);
}

/* Tables: hairline rows, a firmer line under the header. */
table {
  width: 100%;
```

**with:**
```css
  color: var(--t2);
}

/* A row of beat chips; each links to its topic page. */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}

a.chip {
  text-decoration: none;
}

a.chip:hover {
  border-color: var(--link);
  color: var(--link);
}

/* Tables: hairline rows, a firmer line under the header. */
table {
  width: 100%;
```

- [ ] **Step 2: Write the page**

**Create the folder first.** The page's folder name has brackets, which some shells treat as a pattern, so quote the path.

Run: `mkdir -p "site/src/pages/news/[slug]"`
Expected: PASS

**Create `site/src/pages/news/[slug]/index.astro`:**
```astro
---
import { render } from 'astro:content';
import BeatChips from '../../../components/BeatChips.astro';
import CorrectionNotice from '../../../components/CorrectionNotice.astro';
import Base from '../../../layouts/Base.astro';
import { correctionsFor, getDeskState } from '../../../lib/desk-state';
import { formatDate, plural } from '../../../lib/format';
import { jsonLdScript, newsArticleJsonLd } from '../../../lib/jsonld';
import { articlePath, receiptsPath } from '../../../lib/paths';
import { getPieces } from '../../../lib/pieces';
import '../../../styles/article.css';

export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { piece } }));
}

const { piece } = Astro.props;
if (Astro.site === undefined) throw new Error('site/astro.config.mjs must set `site`');

const { Content } = await render(piece.entry);
const corrections = correctionsFor(await getDeskState(), piece.slug);
const claims = plural(piece.ledger.claims.length, 'claim', 'claims');
const sources = plural(piece.ledger.sources.length, 'source', 'sources');
const jsonLd = jsonLdScript(newsArticleJsonLd({ slug: piece.slug, ...piece.data }, corrections, Astro.site.href));
---

<Base title={piece.data.title} description={piece.data.description} canonicalPath={articlePath(piece.slug)} ogType="article">
  <article class="container">
    <header class="article-header">
      <BeatChips categories={piece.data.categories} />
      <h1>{piece.data.title}</h1>
      <p class="dek">{piece.data.description}</p>
      <p class="byline"><a href="/method/">Robywire Desk &middot; automated, source-verified</a> &middot; <time datetime={piece.data.publishedAt}>{formatDate(piece.data.publishedAt)}</time></p>
    </header>
    <CorrectionNotice corrections={corrections} />
    <div class="prose">
      <Content />
    </div>
    <p class="receipts-link">{claims} from {sources} &mdash; <a href={receiptsPath(piece.slug)}>see the receipts</a></p>
    <script type="application/ld+json" set:html={jsonLd} />
  </article>
</Base>
```

- [ ] **Step 3: Build with the fixtures**

Run: `npm run build:fixtures`
Expected: PASS — `/news/fixture-robotics-ships-fx-1-to-second-plant/index.html` and the three other article pages are listed, then `[build] Complete!`.

- [ ] **Step 4: Read the golden article's HTML**

Run:
```bash
F=site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html
grep -o 'Key takeaways' $F | head -1
grep -o "What we couldn&#39;t verify" $F
grep -o 'href="/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/#c-1"' $F | head -1
grep -o '<h1' $F | wc -l | tr -d ' '
grep -o '"@type":"NewsArticle"' $F
grep -o '<p class="byline">.*</p></header>' $F
grep -o '<p class="receipts-link">.*</a></p>' $F
```
Expected: PASS — prints `Key takeaways`, `What we couldn&#39;t verify` (the apostrophe is the HTML escape for a straight quote, as written), the marker link, the number 1 (exactly one top-level heading), `"@type":"NewsArticle"`, the byline with `Robywire Desk &middot; automated, source-verified</a> &middot; <time datetime="2026-10-04">4 Oct 2026</time>`, and `28 claims from 5 sources &mdash; <a href="/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/">see the receipts</a>`.

- [ ] **Step 5: Read the corrected article's notice**

The first variant has the correction recorded against it; the golden piece has none.

Run: `grep -o '<aside class="notice" aria-label="Correction">.*</aside>' site/dist/news/fixture-robotics-ships-fx-2-to-second-plant/index.html`
Expected: PASS — prints the notice with `3 Oct 2026, 09:12 UTC` and the note `The first version gave the arm&#39;s maximum reach as 1.6 m.`

Run: `grep -c 'class="notice"' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: FAIL — prints `0`: no notice on the piece that was never corrected.

Run: `grep -o '"dateModified":"[^"]*"' site/dist/news/fixture-robotics-ships-fx-2-to-second-plant/index.html`
Expected: PASS — `"dateModified":"2026-10-03T09:12:00Z"`, the time of the correction.

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 7: Commit**

```bash
git add site/src
git commit -m "feat(site): add the article page with correction notices and structured data" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 44: The receipts view

**Files:**
- Create: `site/src/lib/receipts.ts`
- Test: `site/test/receipts.test.ts`

The receipts page of Task 45 only lays out data, and the data is built by a pure function so that what the page says can be tested. `receiptsView(ledger)` returns the claims in the order the article first cites them, each with its marker number (the number on the article's link), id, label, text, the quoted passage of the source, the source (URL, tier, outlet if it has one, retrieval time), the first 12 characters of the snapshot hash, basis, status and the 0-based indexes of the sentences that cite it; a gate summary with G1 to G9 in order, each pass or fail, the route and the hold reasons; and the verifier row when the ledger has one. A ledger whose order names a claim it does not hold, or that holds a claim its order leaves out, throws.

- [ ] **Step 1: Write the failing test**

**Create `site/test/receipts.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, LedgerEntry } from '@robywire/gate';
import { receiptsView } from '../src/lib/receipts';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
const golden = LedgerEntry.parse(JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')));
const view = receiptsView(golden);

describe('receiptsView: the claims', () => {
  it('lists the claims in the order the article first cites them, numbered from 1', () => {
    expect(view.claims.map((claim) => claim.id)).toEqual(golden.order);
    expect(view.claims.map((claim) => claim.marker)).toEqual(golden.order.map((_id, at) => at + 1));
    expect(view.claims.slice(0, 3).map((claim) => [claim.marker, claim.id])).toEqual([
      [1, 'c-1'],
      [2, 'c-23'],
      [3, 'c-26'],
    ]);
  });

  it('carries the label, the text and the quoted span of each claim', () => {
    const first = view.claims[0]!;
    expect(first.label).toBe('Tarnmoor shipment');
    expect(first.text).toBe('Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.');
    expect(first.quote).toBe(
      'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    );
  });

  it('carries the source, the short hash, the basis and the status', () => {
    const first = view.claims[0]!;
    expect(first.source).toEqual({ url: 'https://fixture-robotics.example/news/fx-1-second-plant', tier: 1, retrievedAt: '2026-10-04T04:30:00Z' });
    const full = golden.claims.find((claim) => claim.id === 'c-1')!.source.snapshotHash;
    expect(first.hash).toBe(full.slice(0, 12));
    expect(first.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(first.basis).toBe('press-release');
    expect(first.status).toBe('unspecified');
  });

  it('lists the 0-based indexes of the sentences that cite the claim', () => {
    const first = view.claims[0]!;
    const expected = golden.sentences.filter((s) => s.claimIds.includes('c-1')).map((s) => s.index);
    expect(first.citedBy).toEqual(expected);
    expect(first.citedBy[0]).toBe(0);
    expect(first.citedBy.length).toBeGreaterThan(3);
    for (const claim of view.claims) expect(claim.citedBy.length, claim.id).toBeGreaterThan(0);
  });

  it('includes the outlet only for a source that has one', () => {
    expect('outlet' in view.claims[0]!.source).toBe(false);
    const withOutlet = structuredClone(golden);
    withOutlet.claims[0]!.source = { ...withOutlet.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    expect(receiptsView(withOutlet).claims[0]!.source).toEqual({
      url: 'https://fixture-robotics.example/news/fx-1-second-plant',
      tier: 2,
      outlet: 'Mercer Wire',
      retrievedAt: '2026-10-04T04:30:00Z',
    });
  });
});

describe('receiptsView: the gate summary', () => {
  it('lists G1 to G9 in order, each with its result', () => {
    expect(view.gate.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
    expect(view.gate.checks.every((check) => check.result === 'pass')).toBe(true);
  });

  it('lists the checks in order whatever order the ledger stores them in', () => {
    const shuffled = structuredClone(golden);
    shuffled.gate.checks = Object.fromEntries(Object.entries(shuffled.gate.checks).reverse()) as typeof shuffled.gate.checks;
    expect(receiptsView(shuffled).gate.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
  });

  it('carries the route and the hold reasons', () => {
    expect(view.gate.route).toBe('publish');
    expect(view.gate.holdReasons).toEqual([]);
    const held = structuredClone(golden);
    held.gate = { route: 'hold', checks: { ...held.gate.checks, G6: 'fail' }, holdReasons: ['TIER2_ATTRIBUTION'] };
    const heldView = receiptsView(held);
    expect(heldView.gate.route).toBe('hold');
    expect(heldView.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(heldView.gate.checks.find((check) => check.id === 'G6')).toEqual({ id: 'G6', result: 'fail' });
  });

  it('has no verifier row when the ledger has no verifier', () => {
    expect(view.verifier).toBeUndefined();
    expect('verifier' in view).toBe(false);
  });

  it('has the verifier row when the ledger has one', () => {
    const checked = structuredClone(golden);
    checked.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['every sentence entailed'] };
    expect(receiptsView(checked).verifier).toEqual({ model: 'claude-sonnet-5-5', passed: true, notes: ['every sentence entailed'] });
  });
});

describe('receiptsView: the page header', () => {
  it('carries the slug and the title', () => {
    expect(view.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
    expect(view.title).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
  });
});

describe('receiptsView: a ledger that does not hold together', () => {
  it('throws when the order names a claim the ledger does not hold', () => {
    const broken = structuredClone(golden);
    broken.order.push('c-99');
    expect(() => receiptsView(broken)).toThrow('receiptsView: the order lists c-99, but the ledger holds no such claim');
  });

  it('throws when the ledger holds a claim the order leaves out', () => {
    const broken = structuredClone(golden);
    broken.order = broken.order.filter((id) => id !== 'c-5');
    expect(() => receiptsView(broken)).toThrow('receiptsView: the ledger holds c-5, but the order does not list it');
  });
});

describe('receiptsView', () => {
  it('does not change the ledger it is given', () => {
    const copy = structuredClone(golden);
    receiptsView(copy);
    expect(copy).toEqual(golden);
  });

  it('returns lists of its own, so changing the view cannot change the ledger', () => {
    const copy = structuredClone(golden);
    copy.gate.holdReasons = ['TIER2_ATTRIBUTION'];
    copy.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['one'] };
    const result = receiptsView(copy);
    result.gate.holdReasons.push('x');
    result.verifier!.notes.push('x');
    expect(copy.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(copy.verifier.notes).toEqual(['one']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/receipts'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/receipts.ts`:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Route, Status } from '@robywire/gate';

// The receipts page, as data. The page only lays this out, so what it says can
// be tested without building the site.

export interface ReceiptClaim {
  /** The number shown on the article's marker for this claim: its position in the order, from 1. */
  marker: number;
  id: string;
  label: string;
  text: string;
  /** The passage of the source that supports the claim, word for word. */
  quote: string;
  source: { url: string; tier: 1 | 2; outlet?: string; retrievedAt: string };
  /** The first 12 characters of the snapshot hash. */
  hash: string;
  basis: Basis;
  status: Status;
  /** The 0-based indexes, in the ledger's sentence list, of the sentences that cite this claim. */
  citedBy: number[];
}

export interface GateSummary {
  route: Route;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: string[];
}

export interface ReceiptsView {
  slug: string;
  title: string;
  claims: ReceiptClaim[];
  gate: GateSummary;
  verifier?: { model: string; passed: boolean; notes: string[] };
}

/** Everything the receipts page shows, from a piece's ledger entry. */
export function receiptsView(ledger: LedgerEntry): ReceiptsView {
  const byId = new Map(ledger.claims.map((claim) => [claim.id, claim]));
  for (const id of ledger.order) {
    if (!byId.has(id)) throw new Error(`receiptsView: the order lists ${id}, but the ledger holds no such claim`);
  }
  for (const claim of ledger.claims) {
    if (!ledger.order.includes(claim.id)) throw new Error(`receiptsView: the ledger holds ${claim.id}, but the order does not list it`);
  }

  const claims = ledger.order.map((id, at): ReceiptClaim => {
    const claim = byId.get(id)!;
    const { url, tier, outlet, retrievedAt } = claim.source;
    return {
      marker: at + 1,
      id,
      label: claim.label,
      text: claim.text,
      quote: claim.span.quote,
      source: outlet === undefined ? { url, tier, retrievedAt } : { url, tier, outlet, retrievedAt },
      hash: claim.source.snapshotHash.slice(0, 12),
      basis: claim.basis,
      status: claim.status,
      citedBy: ledger.sentences.filter((sentence) => sentence.claimIds.includes(id)).map((sentence) => sentence.index),
    };
  });

  const view: ReceiptsView = {
    slug: ledger.slug,
    title: ledger.title,
    claims,
    gate: {
      route: ledger.gate.route,
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: [...ledger.gate.holdReasons],
    },
  };
  if (ledger.verifier !== undefined) view.verifier = { ...ledger.verifier, notes: [...ledger.verifier.notes] };
  return view;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/receipts.ts site/test/receipts.test.ts
git commit -m "feat(site): build the receipts view from a ledger entry" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 45: The receipts page

**Files:**
- Create: `site/src/pages/news/[slug]/receipts/index.astro`, `site/src/styles/receipts.css`

The page at `/news/<slug>/receipts/` is where every marker in the article leads. It has one `h1`, `Receipts — <title>`, a link back to the article, one sentence saying that the full source snapshot is kept in a private evidence store and that the public record keeps its hash, the retrieval time and the quoted passage, the gate result (G1 to G9, each a green `pass` or red `fail` chip: green and red appear nowhere else on the site), and then every claim as an `<article id="c-23">` block. The `id` is the anchor the article's markers point at. Each block shows the claim, the quoted passage in a `<blockquote>`, the source as a link (`rel="noopener noreferrer"`), chips for the source tier, the basis and the status, when it was retrieved, the short snapshot hash, and how many sentences cite it.

- [ ] **Step 1: Write the stylesheet and the page**

**Create `site/src/styles/receipts.css`:**
```css
/* The receipts page of an article. */

.back {
  margin: 0 0 1rem;
  font-size: 0.85rem;
}

.receipts-intro {
  max-width: 65ch;
  color: var(--t2);
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.gate-notes {
  max-width: 65ch;
}

.receipt {
  max-width: 65ch;
  padding: 1.5rem 0;
  border-top: 1px solid var(--line);
  scroll-margin-top: 1rem;
}

.receipt:target {
  background: var(--paper);
}

.receipt h3 {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
}

.receipt__marker {
  min-width: 1.5rem;
  color: var(--link);
  font-weight: 400;
}

.receipt blockquote {
  margin: 0 0 1rem;
  padding: 0.25rem 0 0.25rem 1rem;
  border-left: 1px solid var(--line-2);
}

.receipt blockquote p {
  margin: 0;
}

.receipt__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
}

.receipt__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 1rem 0 0;
  font-size: 0.85rem;
}

.receipt__meta dt {
  color: var(--t2);
}

.receipt__meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
```

Run: `mkdir -p "site/src/pages/news/[slug]/receipts"`
Expected: PASS

**Create `site/src/pages/news/[slug]/receipts/index.astro`:**
```astro
---
import Base from '../../../../layouts/Base.astro';
import { formatDateTime, plural } from '../../../../lib/format';
import { articlePath, receiptsPath } from '../../../../lib/paths';
import { getPieces } from '../../../../lib/pieces';
import { receiptsView } from '../../../../lib/receipts';
import '../../../../styles/receipts.css';

export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { ledger: piece.ledger } }));
}

const view = receiptsView(Astro.props.ledger);
const passed = view.gate.checks.filter((check) => check.result === 'pass').length;
const sources = new Set(view.claims.map((claim) => claim.source.url)).size;
const resultChip = (passes: boolean) => (passes ? 'chip chip--pass' : 'chip chip--fail');
---

<Base title={`Receipts: ${view.title}`} description={`The source passage behind every claim in "${view.title}".`} canonicalPath={receiptsPath(view.slug)}>
  <div class="container">
    <p class="back"><a href={articlePath(view.slug)}>&larr; Back to the article</a></p>
    <h1>Receipts &mdash; {view.title}</h1>
    <p class="receipts-intro">
      Each number in the article links to a claim below: the passage of the source it rests on, word for word, and where and when that source was fetched. The full source snapshot is kept in a private
      evidence store; this public record keeps its hash, the retrieval time and the quoted passage.
    </p>

    <section aria-labelledby="gate-heading">
      <h2 id="gate-heading">Gate result</h2>
      <p>{passed} of {view.gate.checks.length} checks passed. Route: <span class="chip">{view.gate.route}</span></p>
      <ul class="checks">
        {
          view.gate.checks.map((check) => (
            <li>
              <span class="mono">{check.id}</span> <span class={resultChip(check.result === 'pass')}>{check.result}</span>
            </li>
          ))
        }
      </ul>
      <p class="gate-notes">
        Hold reasons: {view.gate.holdReasons.length === 0 ? 'none' : view.gate.holdReasons.join(', ')}. What each check looks at is on the <a href="/method/">method page</a>.
      </p>
      {
        view.verifier !== undefined && (
          <div class="gate-notes">
            <p>
              Model check (G10), <span class="mono">{view.verifier.model}</span>: <span class={resultChip(view.verifier.passed)}>{view.verifier.passed ? 'pass' : 'fail'}</span>
            </p>
            {view.verifier.notes.length > 0 && (
              <ul>
                {view.verifier.notes.map((note) => (
                  <li>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    </section>

    <section aria-labelledby="claims-heading">
      <h2 id="claims-heading">{plural(view.claims.length, 'claim', 'claims')} from {plural(sources, 'source', 'sources')}</h2>
      {
        view.claims.map((claim) => (
          <article class="receipt" id={claim.id}>
            <h3>
              <span class="receipt__marker">{claim.marker}</span>
              <span>{claim.label}</span>
            </h3>
            <p>{claim.text}</p>
            <blockquote>
              <p>{claim.quote}</p>
            </blockquote>
            <p class="receipt__chips">
              <span class={claim.source.tier === 1 ? 'chip chip--tier1' : 'chip chip--tier2'}>{claim.source.tier === 1 ? 'Tier 1 source' : 'Tier 2 source'}</span>
              <span class="chip">{claim.basis}</span>
              <span class="chip">{claim.status}</span>
            </p>
            <dl class="receipt__meta">
              <dt>Source</dt>
              <dd>
                <a href={claim.source.url} rel="noopener noreferrer">
                  {claim.source.url}
                </a>
                {claim.source.outlet !== undefined && <span> ({claim.source.outlet})</span>}
              </dd>
              <dt>Retrieved</dt>
              <dd>{formatDateTime(claim.source.retrievedAt)}</dd>
              <dt>Snapshot</dt>
              <dd class="mono">{claim.hash}</dd>
              <dt>Cited by</dt>
              <dd>{plural(claim.citedBy.length, 'sentence', 'sentences')}</dd>
            </dl>
          </article>
        ))
      }
    </section>
  </div>
</Base>
```

- [ ] **Step 2: Build with the fixtures**

Run: `npm run build:fixtures`
Expected: PASS — `/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/index.html` is listed, then `[build] Complete!`.

- [ ] **Step 3: Read the golden receipts page**

Run:
```bash
F=site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/index.html
grep -o '<h1>[^<]*</h1>' $F
grep -o '<h2 id="claims-heading">[^<]*</h2>' $F
grep -o '<p>[0-9] of [0-9] checks passed. Route: <span class="chip">[a-z]*</span></p>' $F
grep -o '<article class="receipt"' $F | wc -l | tr -d ' '
grep -o '<article class="receipt" id="c-23">' $F
grep -o 'rel="noopener noreferrer"' $F | head -1
grep -o 'The full source snapshot is kept in a private' $F
grep -o '<span class="chip chip--fail">' $F | wc -l | tr -d ' '
```
Expected: PASS — prints the page heading `Receipts &mdash; Fixture Robotics ships its FX-1 warehouse arm to a second plant`, `28 claims from 5 sources`, `9 of 9 checks passed. Route: <span class="chip">publish</span>`, `28` (one block per claim), `<article class="receipt" id="c-23">`, `rel="noopener noreferrer"`, `The full source snapshot is kept in a private`, and `0` (no failing check).

- [ ] **Step 4: Check that every marker in an article has a block to land on**

Run:
```bash
A=site/dist/news/fixture-robotics-ships-fx-3-to-second-plant/index.html
R=site/dist/news/fixture-robotics-ships-fx-3-to-second-plant/receipts/index.html
grep -o 'receipts/#c-[0-9]*' $A | sed 's/.*#//' | sort -u > /tmp/markers.txt
grep -o '<article class="receipt" id="c-[0-9]*"' $R | sed 's/.*id="//; s/"//' | sort -u > /tmp/blocks.txt
wc -l < /tmp/markers.txt | tr -d ' '
diff /tmp/markers.txt /tmp/blocks.txt && echo same-ids
```
Expected: PASS — prints `28` and `same-ids`: the article links to 28 claims and the receipts page has a block for each, no more and no fewer.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add site/src
git commit -m "feat(site): add the receipts page for each article" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 46: The ledger strip figures and grouping by beat

**Files:**
- Create: `site/src/lib/stats.ts`, `site/src/lib/group.ts`
- Test: `site/test/stats.test.ts`, `site/test/group.test.ts`

The home page shows a thin strip of live ledger numbers and lists recent pieces under their beats. Both are computed by pure functions.

- `ledgerStats(entries, state)` gives the number of pieces, the claims they cite (added up), the drafts held (`state.holds.length`) and the last run. `stripItems(stats)` turns that into the four items of the strip as text: `Pieces published`, `Claims verified`, `Drafts held`, and `Last run`, which reads `never` before the first run, and otherwise shows the date with the time and outcome as a note under it (`04:41 UTC, published`).
- `groupByBeat(pieces)` files each piece under the first of its categories that is a beat, in the order of the beats, leaving out beats with no piece. `piecesIn(pieces, topic)` lists the pieces that have a beat or tag among their categories. `firstBeat(categories)` is the helper under both.

- [ ] **Step 1: Write the failing tests**

**Create `site/test/stats.test.ts`:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DeskState, LedgerEntry } from '@robywire/gate';
import { ledgerStats, stripItems } from '../src/lib/stats';

const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const ledgers = readdirSync(new URL('ledger/', FIXTURES)).map((name) => LedgerEntry.parse(JSON.parse(readFileSync(new URL(`ledger/${name}`, FIXTURES), 'utf8'))));
const fixtureState = DeskState.parse(JSON.parse(readFileSync(new URL('desk-state.json', FIXTURES), 'utf8')));
const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };

describe('ledgerStats', () => {
  it('is all zeros, with no last run, when nothing has been published', () => {
    expect(ledgerStats([], EMPTY)).toEqual({ pieces: 0, claims: 0, held: 0, lastRun: null });
  });

  it('counts the pieces, adds up the claims they cite, counts the holds and passes the last run through', () => {
    const stats = ledgerStats(ledgers, fixtureState);
    expect(stats.pieces).toBe(4);
    expect(stats.claims).toBe(ledgers.reduce((total, entry) => total + entry.claims.length, 0));
    expect(stats.claims).toBe(4 * 28);
    expect(stats.held).toBe(2);
    expect(stats.lastRun).toEqual(fixtureState.lastRun);
  });

  it('counts holds from the desk state, not from the pieces', () => {
    expect(ledgerStats(ledgers, EMPTY).held).toBe(0);
    expect(ledgerStats([], fixtureState).held).toBe(2);
  });
});

describe('stripItems', () => {
  it('shows zeros and "never" for an empty site', () => {
    expect(stripItems(ledgerStats([], EMPTY))).toEqual([
      { label: 'Pieces published', value: '0' },
      { label: 'Claims verified', value: '0' },
      { label: 'Drafts held', value: '0' },
      { label: 'Last run', value: 'never' },
    ]);
  });

  it('shows the figures, and the date, time and outcome of the last run', () => {
    expect(stripItems(ledgerStats(ledgers, fixtureState))).toEqual([
      { label: 'Pieces published', value: '4' },
      { label: 'Claims verified', value: '112' },
      { label: 'Drafts held', value: '2' },
      { label: 'Last run', value: '4 Oct 2026', note: '04:41 UTC, published' },
    ]);
  });

  it('groups thousands in a large count', () => {
    expect(stripItems({ pieces: 1234, claims: 56789, held: 0, lastRun: null }).map((item) => item.value).slice(0, 2)).toEqual(['1,234', '56,789']);
  });

  it('names every outcome plainly', () => {
    const outcome = (kind: 'published' | 'no-story' | 'held' | 'failed') =>
      stripItems({ pieces: 0, claims: 0, held: 0, lastRun: { at: '2026-10-04T04:41:12Z', outcome: kind, runId: 'r', slug: null } })[3]!.note;
    expect(outcome('published')).toBe('04:41 UTC, published');
    expect(outcome('no-story')).toBe('04:41 UTC, no story');
    expect(outcome('held')).toBe('04:41 UTC, held');
    expect(outcome('failed')).toBe('04:41 UTC, failed');
  });
});
```

**Create `site/test/group.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { firstBeat, groupByBeat, piecesIn } from '../src/lib/group';

const piece = (slug: string, ...categories: string[]) => ({ slug, data: { categories } });

describe('firstBeat', () => {
  it('is the first category that is a beat', () => {
    expect(firstBeat(['humanoids', 'funding'])).toBe('humanoids');
    expect(firstBeat(['funding', 'field-mobility'])).toBe('field-mobility');
  });

  it('is undefined when there is no beat among the categories', () => {
    expect(firstBeat(['funding'])).toBeUndefined();
    expect(firstBeat([])).toBeUndefined();
  });
});

describe('groupByBeat', () => {
  it('is empty for no pieces', () => {
    expect(groupByBeat([])).toEqual([]);
  });

  it('groups pieces by their first beat, in the order of the beats, and keeps each group in the order given', () => {
    const a = piece('a', 'policy-standards');
    const b = piece('b', 'humanoids');
    const c = piece('c', 'policy-standards', 'funding');
    const d = piece('d', 'funding', 'humanoids');
    expect(groupByBeat([a, b, c, d])).toEqual([
      { beat: 'humanoids', pieces: [b, d] },
      { beat: 'policy-standards', pieces: [a, c] },
    ]);
  });

  it('leaves out beats that have no piece', () => {
    expect(groupByBeat([piece('a', 'humanoids')]).map((group) => group.beat)).toEqual(['humanoids']);
  });

  it('files a piece under its first beat only, not under its other beats', () => {
    const groups = groupByBeat([piece('a', 'humanoids', 'field-mobility')]);
    expect(groups).toHaveLength(1);
  });

  it('throws, naming the piece, when a piece has no beat', () => {
    expect(() => groupByBeat([piece('only-funding', 'funding')])).toThrow('groupByBeat: the piece "only-funding" has no beat among its categories');
  });
});

describe('piecesIn', () => {
  const a = piece('a', 'humanoids', 'funding');
  const b = piece('b', 'field-mobility');
  const c = piece('c', 'funding', 'field-mobility');

  it('lists the pieces that have the topic among their categories, in the order given', () => {
    expect(piecesIn([a, b, c], 'funding')).toEqual([a, c]);
    expect(piecesIn([a, b, c], 'field-mobility')).toEqual([b, c]);
  });

  it('is empty when no piece has the topic', () => {
    expect(piecesIn([a, b, c], 'policy-standards')).toEqual([]);
    expect(piecesIn([], 'humanoids')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/stats.test.ts test/group.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/group'` and `Cannot find module '../src/lib/stats'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/stats.ts`:**
```ts
import type { DeskState, LedgerEntry, RunOutcome } from '@robywire/gate';
import { formatDateTime } from './format';

// The numbers in the strip on the home page, from the ledger and the desk state.

export interface LedgerStats {
  /** Pieces published. */
  pieces: number;
  /** Claims cited by those pieces, added up. */
  claims: number;
  /** Drafts the gate held for the owner. */
  held: number;
  lastRun: DeskState['lastRun'];
}

export function ledgerStats(entries: readonly LedgerEntry[], state: DeskState): LedgerStats {
  return {
    pieces: entries.length,
    claims: entries.reduce((total, entry) => total + entry.claims.length, 0),
    held: state.holds.length,
    lastRun: state.lastRun,
  };
}

export interface StripItem {
  label: string;
  value: string;
  /** A smaller line under the value. */
  note?: string;
}

const OUTCOME_TEXT: Record<RunOutcome, string> = {
  published: 'published',
  'no-story': 'no story',
  held: 'held',
  failed: 'failed',
};

const count = (n: number): string => n.toLocaleString('en-US');

/** The four items of the strip, as text. */
export function stripItems(stats: LedgerStats): StripItem[] {
  const items: StripItem[] = [
    { label: 'Pieces published', value: count(stats.pieces) },
    { label: 'Claims verified', value: count(stats.claims) },
    { label: 'Drafts held', value: count(stats.held) },
  ];
  if (stats.lastRun === null) return [...items, { label: 'Last run', value: 'never' }];
  const [date, time] = formatDateTime(stats.lastRun.at).split(', ');
  return [...items, { label: 'Last run', value: date!, note: `${time}, ${OUTCOME_TEXT[stats.lastRun.outcome]}` }];
}
```

**Create `site/src/lib/group.ts`:**
```ts
import { BEATS } from '@robywire/gate';
import type { Beat } from '@robywire/gate';

// Which pieces go under which beat. A piece has one to three categories, and
// at least one of them is a beat; the home page files it under the first.

interface HasCategories {
  slug: string;
  data: { categories: readonly string[] };
}

/** The first of `categories` that is one of the seven beats, or undefined if none is. */
export function firstBeat(categories: readonly string[]): Beat | undefined {
  return categories.find((category): category is Beat => (BEATS as readonly string[]).includes(category));
}

/**
 * Group pieces by their first beat. Groups come in the order of the beats,
 * beats with no piece are left out, and pieces keep the order they were given.
 */
export function groupByBeat<T extends HasCategories>(pieces: readonly T[]): { beat: Beat; pieces: T[] }[] {
  const groups = new Map<Beat, T[]>();
  for (const piece of pieces) {
    const beat = firstBeat(piece.data.categories);
    if (beat === undefined) throw new Error(`groupByBeat: the piece ${JSON.stringify(piece.slug)} has no beat among its categories`);
    groups.set(beat, [...(groups.get(beat) ?? []), piece]);
  }
  return BEATS.filter((beat) => groups.has(beat)).map((beat) => ({ beat, pieces: groups.get(beat)! }));
}

/** The pieces that have `topic` (a beat or a tag) among their categories, in the order given. */
export function piecesIn<T extends HasCategories>(pieces: readonly T[], topic: string): T[] {
  return pieces.filter((piece) => piece.data.categories.includes(topic));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/stats.test.ts test/group.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/stats.ts site/src/lib/group.ts site/test/stats.test.ts site/test/group.test.ts
git commit -m "feat(site): compute the ledger strip figures and group pieces by beat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 47: The home page

**Files:**
- Create: `site/src/components/PieceList.astro`, `site/src/components/LedgerStrip.astro`, `site/src/styles/home.css`
- Modify: `site/src/pages/index.astro`, `site/src/styles/global.css`, `site/src/styles/article.css`

The home page has a quiet `h1`, then the newest piece as the lead (beat chips, the title as a link, the description, the date), then up to 14 older pieces grouped under their first beat, each beat heading a link to its topic page, then the strip: `Pieces published`, `Claims verified`, `Drafts held` and `Last run`. With no pieces it says `No pieces yet.` and shows the strip with zeros and `Last run: never`; there are no empty sections.

The lead and the article page both use the dek and byline styles, so those two rules move from `article.css` to the global stylesheet, and the strip gets a rule for the small note under a value.

- [ ] **Step 1: Write the components and the stylesheet**

**Create `site/src/components/PieceList.astro`:**
```astro
---
import { formatDate } from '../lib/format';
import { articlePath } from '../lib/paths';
import type { Piece } from '../lib/pieces';

interface Props {
  pieces: readonly Pick<Piece, 'slug' | 'data'>[];
}

const { pieces } = Astro.props;
---

<ul class="piece-list">
  {
    pieces.map((piece) => (
      <li>
        <a class="piece-list__title" href={articlePath(piece.slug)}>
          {piece.data.title}
        </a>
        <span class="piece-list__meta">{formatDate(piece.data.publishedAt)}</span>
        <span class="piece-list__dek">{piece.data.description}</span>
      </li>
    ))
  }
</ul>
```

**Create `site/src/components/LedgerStrip.astro`:**
```astro
---
import type { StripItem } from '../lib/stats';

interface Props {
  items: readonly StripItem[];
}

const { items } = Astro.props;
---

<dl class="strip" aria-label="The ledger in numbers">
  {
    items.map((item) => (
      <div class="stat">
        <dt>{item.label}</dt>
        <dd>
          {item.value}
          {item.note !== undefined && <span class="stat__note">{item.note}</span>}
        </dd>
      </div>
    ))
  }
</dl>
```

**Create `site/src/styles/home.css`:**
```css
/* The home page, and the lists of pieces that the topic pages share. */

.home-title {
  max-width: 32ch;
  margin: 0 0 2rem;
  color: var(--t2);
  font-size: 1.25rem;
  font-weight: 400;
  letter-spacing: 0;
}

.lead {
  max-width: 65ch;
  margin-bottom: 3rem;
}

.lead__title {
  margin: 0 0 0.75rem;
  font-size: 2rem;
  line-height: 1.15;
}

.lead__title a,
.piece-list__title {
  color: var(--t1);
}

.beat-group {
  max-width: 65ch;
  margin-bottom: 2rem;
}

.beat-group h2 {
  margin-bottom: 0.25rem;
  font-size: 1rem;
}

.piece-list {
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.piece-list li {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}

.piece-list__title {
  font-weight: 600;
}

.piece-list__meta,
.piece-list__dek {
  display: block;
  color: var(--t2);
  font-size: 0.85rem;
}

.empty {
  max-width: 65ch;
  margin-bottom: 3rem;
  color: var(--t2);
}
```

Move the dek and byline rules out of the article stylesheet and into the global one, and add the strip note.

**In `site/src/styles/article.css`, replace:**
```css
  line-height: 1.15;
}

.dek {
  margin: 0 0 1rem;
  color: var(--t2);
  font-size: 1.15rem;
}

.byline {
  margin: 0;
  color: var(--t2);
  font-size: 0.85rem;
}

.byline a {
  color: var(--t2);
}

.notice {
  max-width: 65ch;
  margin: 0 0 1.5rem;
```

**with:**
```css
  line-height: 1.15;
}

.notice {
  max-width: 65ch;
  margin: 0 0 1.5rem;
```

**In `site/src/styles/global.css`, replace:**
```css
  color: var(--t2);
}

/* A row of beat chips; each links to its topic page. */
.chips {
  display: flex;
```

**with:**
```css
  color: var(--t2);
}

/* The line under a headline, and the line with the date. Shared by the article and the home page. */
.dek {
  margin: 0 0 1rem;
  color: var(--t2);
  font-size: 1.15rem;
}

.byline {
  margin: 0;
  color: var(--t2);
  font-size: 0.85rem;
}

.byline a {
  color: var(--t2);
}

/* A row of beat chips; each links to its topic page. */
.chips {
  display: flex;
```

**In `site/src/styles/global.css`, replace:**
```css
  line-height: 1.2;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
```

**with:**
```css
  line-height: 1.2;
}

.stat__note {
  display: block;
  color: var(--t2);
  font-size: 0.85rem;
  letter-spacing: 0;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
```

- [ ] **Step 2: Write the page**

**Replace `site/src/pages/index.astro` with:**
```astro
---
import BeatChips from '../components/BeatChips.astro';
import LedgerStrip from '../components/LedgerStrip.astro';
import PieceList from '../components/PieceList.astro';
import Base from '../layouts/Base.astro';
import { getDeskState } from '../lib/desk-state';
import { beatLabel, formatDate } from '../lib/format';
import { groupByBeat } from '../lib/group';
import { articlePath, topicPath } from '../lib/paths';
import { getPieces } from '../lib/pieces';
import { ledgerStats, stripItems } from '../lib/stats';
import '../styles/home.css';

// How many pieces below the lead the home page lists: about two weeks of a daily site.
const RECENT = 14;

const pieces = await getPieces();
const [lead, ...older] = pieces;
const groups = groupByBeat(older.slice(0, RECENT));
const items = stripItems(
  ledgerStats(
    pieces.map((piece) => piece.ledger),
    await getDeskState(),
  ),
);
---

<Base
  title="Robywire"
  description="Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on."
  canonicalPath="/"
>
  <div class="container">
    <h1 class="home-title">Robotics news with a receipt for every claim.</h1>
    {
      lead === undefined ? (
        <p class="empty">No pieces yet.</p>
      ) : (
        <section class="lead" aria-labelledby="lead-title">
          <BeatChips categories={lead.data.categories} />
          <h2 class="lead__title" id="lead-title">
            <a href={articlePath(lead.slug)}>{lead.data.title}</a>
          </h2>
          <p class="dek">{lead.data.description}</p>
          <p class="byline">
            <time datetime={lead.data.publishedAt}>{formatDate(lead.data.publishedAt)}</time>
          </p>
        </section>
      )
    }
    {
      groups.map((group) => (
        <section class="beat-group">
          <h2>
            <a href={topicPath(group.beat)}>{beatLabel(group.beat)}</a>
          </h2>
          <PieceList pieces={group.pieces} />
        </section>
      ))
    }
    <LedgerStrip items={items} />
  </div>
</Base>
```

- [ ] **Step 3: Build with the fixtures and read the home page**

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run:
```bash
F=site/dist/index.html
grep -o '<h1 class="home-title">[^<]*</h1>' $F
grep -o '<h2 class="lead__title" id="lead-title"><a href="[^"]*">[^<]*</a></h2>' $F
grep -o '<section class="beat-group"><h2><a href="[^"]*">[^<]*</a></h2>' $F
grep -o '<dl class="strip".*</dl>' $F
```
Expected: PASS — prints the page heading `Robotics news with a receipt for every claim.`; the lead, which is the golden piece `/news/fixture-robotics-ships-fx-1-to-second-plant/`; three beat groups (`Humanoids`, `Home &amp; consumer`, `Policy &amp; standards`, in the order of the beats); and the strip with `Pieces published</dt><dd>4`, `Claims verified</dt><dd>112`, `Drafts held</dt><dd>2` and `Last run</dt><dd>4 Oct 2026<span class="stat__note">04:41 UTC, published`.

- [ ] **Step 4: Build for production and read the empty home page**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run:
```bash
F=site/dist/index.html
grep -o '<p class="empty">[^<]*</p>' $F
grep -o '<dl class="strip".*</dl>' $F
grep -c 'class="lead"' $F
```
Expected: FAIL — prints `<p class="empty">No pieces yet.</p>`, the strip with `Pieces published</dt><dd>0`, `Claims verified</dt><dd>0`, `Drafts held</dt><dd>0` and `Last run</dt><dd>never`, and `0` (no lead section); the last command exits 1 because it counts no match.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add site/src
git commit -m "feat(site): add the home page with the lead piece, recent pieces by beat and the ledger strip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 48: A page for every beat and tag

**Files:**
- Create: `site/src/pages/topics/[beat]/index.astro`
- Modify: `site/src/lib/format.ts` (`beatBlurb`), `site/test/format.test.ts`

`/topics/<beat>/` lists the pieces filed under a beat, newest first, or says `Nothing under <beat> yet.` There is one page for each of the seven beats and for the `funding` tag. The pages are generated from the vocabulary, not from the pieces, so a beat with no piece still has its page, and the links in the header never lead nowhere. Each page opens with one sentence on what the beat covers (`beatBlurb`, from the content contract).

- [ ] **Step 1: Write the failing tests**

**In `site/test/format.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB } from '@robywire/gate';
import { beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

describe('formatDate', () => {
  it.each([
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB } from '@robywire/gate';
import { beatBlurb, beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

describe('formatDate', () => {
  it.each([
```

**In `site/test/format.test.ts`, replace:**
```ts
  });
});

describe('plural', () => {
  it.each([
    [0, '0 claims'],
```

**with:**
```ts
  });
});

describe('beatBlurb', () => {
  it('has one sentence for every beat and tag, each different and each ending in a full stop', () => {
    const blurbs = CATEGORY_VOCAB.map((slug) => beatBlurb(slug));
    expect(new Set(blurbs).size).toBe(CATEGORY_VOCAB.length);
    for (const blurb of blurbs) expect(blurb.endsWith('.'), blurb).toBe(true);
  });

  it('says what the beat covers, as the content contract does', () => {
    expect(beatBlurb('humanoids')).toBe('General-purpose bipeds and androids, commercial and research.');
    expect(beatBlurb('funding')).toBe('Rounds, acquisitions, public listings and shutdowns, filed under the beat they concern.');
  });

  it('throws on a slug that is not in the vocabulary', () => {
    expect(() => beatBlurb('robots')).toThrow('beatBlurb: "robots" is not a beat or a tag');
    expect(() => beatBlurb('toString')).toThrow('beatBlurb: "toString" is not a beat or a tag');
  });
});

describe('plural', () => {
  it.each([
    [0, '0 claims'],
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/format.test.ts`
Expected: FAIL — `beatBlurb is not a function`.

- [ ] **Step 3: Write the implementation**

**In `site/src/lib/format.ts`, replace:**
```ts
  return LABELS[slug as Category];
}

/** A count with the right word: "1 claim", "28 claims". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
```

**with:**
```ts
  return LABELS[slug as Category];
}

const BLURBS: Record<Category, string> = {
  humanoids: 'General-purpose bipeds and androids, commercial and research.',
  'home-consumer': 'Robots for domestic and personal use, including home humanoids.',
  'industrial-warehouse': 'Arms, cobots, mobile robots, fulfilment and manufacturing cells.',
  'field-mobility': 'Agriculture, construction, inspection, drones and outdoor autonomy.',
  'software-autonomy': 'Vision-language-action models, sim-to-real, control stacks, teleoperation and perception.',
  'components-supply-chain': 'Actuators, drives, sensors, batteries, chips and supply.',
  'policy-standards': 'Regulation, safety standards, certification and labour.',
  funding: 'Rounds, acquisitions, public listings and shutdowns, filed under the beat they concern.',
};

/** One sentence on what a beat or tag covers. Throws for a slug outside the vocabulary. */
export function beatBlurb(slug: string): string {
  if (!Object.hasOwn(BLURBS, slug)) throw new Error(`beatBlurb: ${JSON.stringify(slug)} is not a beat or a tag`);
  return BLURBS[slug as Category];
}

/** A count with the right word: "1 claim", "28 claims". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
```

Run: `npm test --workspace @robywire/site -- test/format.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 4: Write the page**

Run: `mkdir -p "site/src/pages/topics/[beat]"`
Expected: PASS

**Create `site/src/pages/topics/[beat]/index.astro`:**
```astro
---
import { CATEGORY_VOCAB } from '@robywire/gate';
import PieceList from '../../../components/PieceList.astro';
import Base from '../../../layouts/Base.astro';
import { beatBlurb, beatLabel } from '../../../lib/format';
import { piecesIn } from '../../../lib/group';
import { topicPath } from '../../../lib/paths';
import { getPieces } from '../../../lib/pieces';
import '../../../styles/home.css';

// One page for every beat and for the funding tag, whether or not a piece has been
// filed under it yet. The paths come from the vocabulary, not from the pieces.
export function getStaticPaths() {
  return CATEGORY_VOCAB.map((beat) => ({ params: { beat } }));
}

const { beat } = Astro.params;
const label = beatLabel(beat);
const pieces = piecesIn(await getPieces(), beat);
---

<Base title={label} description={beatBlurb(beat)} canonicalPath={topicPath(beat)}>
  <div class="container">
    <h1>{label}</h1>
    <p class="dek">{beatBlurb(beat)}</p>
    {pieces.length === 0 ? <p class="empty">Nothing under {label} yet.</p> : <PieceList pieces={pieces} />}
  </div>
</Base>
```

- [ ] **Step 5: Build with the fixtures and read the topic pages**

Run: `npm run build:fixtures`
Expected: PASS — eight topic pages are listed, from `/topics/humanoids/index.html` to `/topics/funding/index.html`.

Run:
```bash
grep -o 'Fixture Robotics ships its FX-2 warehouse arm to a second plant' site/dist/topics/humanoids/index.html | head -1
grep -o 'Fixture Robotics ships its FX-1 warehouse arm to a second plant' site/dist/topics/funding/index.html | head -1
grep -o 'Nothing under [A-Za-z &;]* yet.' site/dist/topics/software-autonomy/index.html
```
Expected: PASS — prints the FX-2 title (humanoids), the FX-1 title (the golden piece is tagged funding), and `Nothing under Software &amp; autonomy yet.`

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 7: Commit**

```bash
git add site/src site/test/format.test.ts
git commit -m "feat(site): add a topic page for every beat and tag, whether or not it has pieces" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Verify the milestone**

Everything this milestone built, checked once more from the top. The production build runs last, so that `site/dist` is left as a production build.

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

Run: `npm run evals:seeded`
Expected: PASS — `PASS: every seeded defect was caught.`

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `find site/dist -name index.html | wc -l | tr -d ' '`
Expected: PASS — `17`: the home page, four articles, four receipts pages and eight topic pages.

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `find site/dist -name index.html | wc -l | tr -d ' '`
Expected: PASS — `9`: the home page and eight topic pages, and no article, because a production build has no pieces.

A production build must contain no fixture content and no ribbon.

Run: `grep -ril "fixture robotics" site/dist`
Expected: FAIL — prints nothing, and exits 1 because nothing matches.

Run: `grep -rl "FIXTURE DATA" site/dist`
Expected: FAIL — prints nothing, and exits 1 because nothing matches.

Run: `git status --porcelain`
Expected: PASS — prints nothing: everything is committed.
