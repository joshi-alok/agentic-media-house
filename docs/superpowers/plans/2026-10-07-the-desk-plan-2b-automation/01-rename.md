## Plan 2b (part 1) — The new name

**Goal:** the owner has named the publication **Agentic Media House**. Everything that a reader sees changes: the wordmark, the page titles, the footer, the method text, the structured data, the feed, the fact card, the byline author, the user agent that the Desk shows to every website, the README. Everything that only the code meets stays as it is: the npm scope `@robywire/*`, the variable `ROBYWIRE_FIXTURES`, the folder names, the git history, and the plans and specs under `docs/`, which describe what was built at the time. Each task here is a test-first patch to code that already exists: the tests that pin the old name are changed first and shown failing, the change is the smallest that makes them pass, whatever is generated is regenerated, and there is one commit. The last task builds from a clean install and says what kept the old name and why.

| Task | What it does |
|---|---|
| 1 | The name has one home: `PUBLICATION_NAME`, `PUBLICATION_WORDMARK` and the author `DESK_AUTHOR_NAME` in the gate; the default user agent of the Desk and the placeholder address of the site follow; the prompts take the name from the constant. A count of every occurrence of the old name, sorted into reader-facing and internal. |
| 2 | The site says the new name: header, titles, footer, method text, structured data, feed, fact card, README and the descriptions of the packages, all built from the constants; the header holds at 375 pixels. |
| 3 | A new audit check, A18, fails when a built page, feed, sitemap, card or robots file contains the old name, in the production build and in the fixture build. |
| 4 | Verification from a clean install, and what kept the old name and why. No commit. |

**Starting state:** Plans 1 and 2 are built (Tasks 1 to 88 of Plan 1 and 1 to 50 of Plan 2). `npm run typecheck`, `npm test`, `npm run evals:seeded` (61 of 61 cases caught), `npm run fixtures:check` and `npm run verify` pass. The name of the publication is written out as a literal in many places: the header, the footer, the structured data, the feed, the fact card, the author of every piece, the user agent, the prompts and the README.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts`. Everything after the `--` goes to Vitest. Tests in the other workspaces are run with `--workspace @robywire/desk`, `--workspace @robywire/site` or `--workspace @robywire/evals`.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, the README or a fixture; where a test needs one, it uses `String.fromCharCode`. In the edits below, a sequence written with a backslash and `u` stays six characters.
- **No network, no key, no real site.** Nothing in this part opens a connection or reads an API key. The fixture pages are made up, the company is Fixture Robotics, and every host is `*.example`. The one program that needs a browser is Lighthouse, which Plan 1 already needs.
- Whatever the gate's behaviour changes is regenerated, never edited by hand: `npm run fixtures:generate --workspace @robywire/site` rewrites the fixtures and `npm run evals:seeded` rewrites `evals/scoreboard/seeded.json`. Both are committed with the task that changes them.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown, except Task 4, which changes nothing.

**Versions:** this part adds no package.

---

### Task 1: One place for the name

**Files:**
- Modify: `gate/src/constants.ts` (new `PUBLICATION_NAME` and `PUBLICATION_WORDMARK`; `DESK_AUTHOR_NAME` changes)
- Modify: `desk/src/config.ts` (the default user agent, the message that gives an example of one, a comment), `desk/src/fetch/robots.ts` (the example in an error message), `desk/src/prompts/select.ts`, `desk/src/prompts/extract.ts`, `desk/src/prompts/compose.ts`, `desk/src/prompts/verify.ts` (the first line of each prompt takes the name from the constant)
- Modify: `site/astro.config.mjs` (the placeholder address of the site), `site/scripts/audit/site.mjs` and `site/src/lib/jsonld.ts` (an example address in a comment)
- Modify (regenerated, not edited): the five pieces `site/src/content-fixtures/news/*.mdx`, whose frontmatter names the author
- Create: `desk/test/prompts/publication-name.test.ts`, `site/test/site-url.test.ts`
- Test: `gate/test/constants.test.ts`, `gate/test/frontmatter-consistency.test.ts`, `gate/test/g1-frontmatter.test.ts`, `gate/test/g4-values.test.ts`, `gate/test/gate.test.ts`, `gate/test/golden-draft.test.ts`, `gate/test/render.test.ts`, `gate/test/schemas.test.ts`, `desk/test/config.test.ts`, `desk/test/cli.test.ts`, `desk/test/fetch/http-lookup.test.ts`, `desk/test/fetch/http.test.ts`, `desk/test/fetch/robots.test.ts`, `desk/test/stages/discover.test.ts`, `desk/test/stages/fetch.test.ts`, `site/test/byline.test.ts`, `site/test/match-pieces.test.ts`, `site/test/feed.test.ts`, `site/test/jsonld.test.ts`, `site/test/robots.test.ts`, `site/test/support/small-site.ts`

The owner has named the publication Agentic Media House. Until now its old name, Robywire, was written out as a literal wherever a string needed it: in the header, the footer, the structured data, the feed, the fact card, the author of every piece, the user agent that the Desk shows to every website, the prompts of the models, the README. A name that is written in twenty places is changed in nineteen of them. This task gives the name one home, the gate package (the site, the Desk and the evals already import from it), and changes the three values that the whole system builds on. Task 2 changes the strings of the site, and Task 3 adds an audit check so that the old name cannot come back into a build.

**What changes and what does not.** The old name is in 154 tracked files outside `docs/`. Not every occurrence is something a person reads. Some are the names of things that the code is built from: the npm scope `@robywire/*` (every import specifier and every `package.json`), the environment variable `ROBYWIRE_FIXTURES`, the name of the root package, the names of the folders that tests make in the temporary folder. Those are internal and stay; renaming them is a separate decision that touches every import in the repository and breaks every checkout that has run `npm ci`. What a reader sees, reads or is shown does change: the wordmark, the titles, the footer, the method text, the structured data, the feed, the fact card, the byline author, the user agent and the address it links to, the placeholder address of the site, the headings of the README, and the words that the models are told. The command below counts every occurrence, in any case, and puts it in one of those two groups. It is a throwaway script, not part of the repository: it is written to the temporary folder of the machine, and it is run again at the end of Task 2 and in Task 4. A kind is **READER-FACING** when a reader, a feed reader, a crawler, the operator of a website, a screen reader or a model could meet it, and **INTERNAL** when only the code and its authors meet it.

- [ ] **Step 1: Count what carries the old name, and sort it**

Write the script. It reads the files that git tracks (and any new file that is not ignored), outside `docs/` (the plans and specs there describe what was built at the time, and stay as they are), finds each occurrence of the letters r-o-b-y-w-i-r-e in any case, and puts it in a kind by what stands around it.

```bash
cat > "${TMPDIR:-/tmp}/name-census.mjs" <<'EOF'
// Every occurrence of "robywire", in any case, in the files that git tracks or would track (new files that are not ignored) outside docs/, sorted into kinds.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const INTERNAL = [
  'the npm scope @robywire/*',
  'the environment variable ROBYWIRE_FIXTURES',
  'the name of the root package, in package.json and package-lock.json',
  'the old project named in the provenance comments of sources.yml',
  'folder names that tests and scripts make in the temporary folder',
  'a made-up pull request address in a test that builds no page',
  'a search for the old name in a test, to prove that it is gone',
  'the old name given on purpose to a test, as input that a check or a rule must refuse',
  'the check of the audit that looks for the old name (A18)',
];
const READER = [
  'the author name, Robywire Desk',
  'the user agent, RobywireDesk',
  'the placeholder host, robywire.example, .test or .org',
  'a made-up pull request address that a fixture page shows',
  'the wordmark in capitals, ROBYWIRE',
  'the name in a sentence, a title, a heading or a description',
];

function kindOf(file, line, at) {
  const before = line.slice(0, at);
  const after = line.slice(at + 'robywire'.length);
  const word = line.slice(at, at + 'robywire'.length);
  if (before.endsWith('@') && after.startsWith('/')) return INTERNAL[0];
  if (word === 'ROBYWIRE' && after.startsWith('_FIXTURES')) return INTERNAL[1];
  if (/package(-lock)?\.json$/.test(file) && /^\s*"name": "robywire",?$/.test(line)) return INTERNAL[2];
  if (file === 'sources.yml') return INTERNAL[3];
  if (/github\.(example|com)\/\S*$/.test(before)) return /^(gate|desk)\/test\//.test(file) ? INTERNAL[5] : READER[3];
  if (/test\//.test(file) && /on purpose/.test(line)) return INTERNAL[7];
  if (file === 'site/scripts/audit/checks-files.mjs') return INTERNAL[8];
  if (/test\//.test(file) && /[(=,\[]\s*\/$/.test(before)) return INTERNAL[6];
  if (/^-[a-z]/.test(after) && /(^|\/)(test|scripts)\//.test(file)) return INTERNAL[4];
  if (/^Desk/i.test(after)) return READER[1];
  if (word === 'Robywire' && after.startsWith(' Desk')) return READER[0];
  if (/^\.(example|test|org)\b/.test(after)) return READER[2];
  if (word === 'ROBYWIRE') return READER[4];
  return READER[5];
}

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.', ':!docs'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
const found = new Map();
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    for (const match of line.matchAll(/robywire/gi)) {
      const kind = kindOf(file, line, match.index);
      const entry = found.get(kind) ?? { files: new Set(), count: 0 };
      entry.files.add(file);
      entry.count++;
      found.set(kind, entry);
    }
  }
}

const row = (side, name, files, count) => `${side.padEnd(13)} ${String(files).padStart(4)} files ${String(count).padStart(4)} occurrences  ${name}`;
for (const [side, kinds] of [['INTERNAL', INTERNAL], ['READER-FACING', READER]]) {
  const all = new Set();
  let total = 0;
  for (const kind of kinds) {
    const entry = found.get(kind);
    if (entry === undefined) continue;
    console.log(row(side, kind, entry.files.size, entry.count));
    entry.files.forEach((file) => all.add(file));
    total += entry.count;
  }
  console.log(row(side, 'TOTAL', all.size, total));
}
EOF
```

Run it from the root of the repository.

Run: `node "${TMPDIR:-/tmp}/name-census.mjs"`
Expected: PASS — `READER-FACING` and `the user agent, RobywireDesk` and `the name in a sentence, a title, a heading or a description`

The table that it prints, on the repository as it is before this task:

```text
INTERNAL       111 files  201 occurrences  the npm scope @robywire/*
INTERNAL         8 files   16 occurrences  the environment variable ROBYWIRE_FIXTURES
INTERNAL         2 files    3 occurrences  the name of the root package, in package.json and package-lock.json
INTERNAL         1 files    4 occurrences  the old project named in the provenance comments of sources.yml
INTERNAL         8 files   14 occurrences  folder names that tests and scripts make in the temporary folder
INTERNAL         2 files    2 occurrences  a made-up pull request address in a test that builds no page
INTERNAL       121 files  240 occurrences  TOTAL
READER-FACING   16 files   22 occurrences  the author name, Robywire Desk
READER-FACING    9 files   39 occurrences  the user agent, RobywireDesk
READER-FACING   14 files   42 occurrences  the placeholder host, robywire.example, .test or .org
READER-FACING    4 files    8 occurrences  a made-up pull request address that a fixture page shows
READER-FACING    2 files    2 occurrences  the wordmark in capitals, ROBYWIRE
READER-FACING   22 files   40 occurrences  the name in a sentence, a title, a heading or a description
READER-FACING   54 files  153 occurrences  TOTAL
```

Every row marked READER-FACING is changed by Task 1 or Task 2; the rows marked INTERNAL are not. Each kind and the task that changes it:

| Kind | Side | Changed by |
|---|---|---|
| The npm scope `@robywire/*`; the variable `ROBYWIRE_FIXTURES`; the name of the root package; the folders that tests make in the temporary folder | INTERNAL | stays |
| The provenance comments of `sources.yml`, which say that the registry was copied from the project that was then called Robywire | INTERNAL | stays (history) |
| A made-up pull request address in a gate or Desk test, which no page shows | INTERNAL | stays |
| The author name `Robywire Desk` | READER-FACING | Task 1 |
| The user agent `RobywireDesk` and the host that it links to | READER-FACING | Task 1 |
| The placeholder host `robywire.example` of the site | READER-FACING | Task 1 |
| The words that the prompts say to the models | READER-FACING | Task 1 |
| The wordmark `ROBYWIRE` of the fact card; the name in the header, the titles, the footer, the structured data, the feed, the method page, the README and the descriptions of the packages | READER-FACING | Task 2 |
| A made-up pull request address that the fixture build shows on the holds page | READER-FACING | Task 2 |

- [ ] **Step 2: Write the tests of the three values, and change the tests that pin the old ones**

The gate has the three values. The test says what each is, that the wordmark is the name in capitals and the author is the name and the word Desk, and that none of them is the old name. It replaces the test that pinned the old author.

**In `gate/test/constants.test.ts`, replace:**
```ts
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  RELEASES,
  SAFE_BASES,
```

**with:**
```ts
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  PUBLICATION_NAME,
  PUBLICATION_WORDMARK,
  RELEASES,
  SAFE_BASES,
```

**In `gate/test/constants.test.ts`, replace:**
```ts
});

describe('the byline of the Desk', () => {
  it('names the author of every piece', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
  });

```

**with:**
```ts
});

describe('the name of the publication', () => {
  it('is Agentic Media House', () => {
    expect(PUBLICATION_NAME).toBe('Agentic Media House');
  });

  it('has a wordmark that is the same name in capitals, for the header and the fact card', () => {
    expect(PUBLICATION_WORDMARK).toBe('AGENTIC MEDIA HOUSE');
    expect(PUBLICATION_WORDMARK).toBe(PUBLICATION_NAME.toUpperCase());
  });

  it('is plain ASCII, and no name of it is the old one', () => {
    for (const name of [PUBLICATION_NAME, PUBLICATION_WORDMARK, DESK_AUTHOR_NAME]) {
      expect(name).toMatch(/^[\x20-\x7E]+$/);
      expect(name).not.toMatch(/robywire/i);
    }
  });
});

describe('the byline of the Desk', () => {
  it('names the author of every piece: the publication and the word Desk', () => {
    expect(DESK_AUTHOR_NAME).toBe('Agentic Media House Desk');
    expect(DESK_AUTHOR_NAME).toBe(`${PUBLICATION_NAME} Desk`);
  });

```

G1 refuses any author but the Desk, and the tests that feed it an author take the new one. The list of names that G1 must refuse now holds the old name as well, so that a piece that still carries it cannot get through.

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts

describe('G1_AUTHOR_NOT_DESK', () => {
  it.each(['Jane Doe', 'Robywire', 'robywire desk', 'Robywire  Desk', 'Robywire Desk ', ' Robywire Desk', 'Robywire Desk.'])(
    'fails for the author name %j, and says what it must be',
    (name) => {
```

**with:**
```ts

describe('G1_AUTHOR_NOT_DESK', () => {
  it.each([
    'Jane Doe',
    'Agentic Media House',
    'agentic media house desk',
    'Agentic Media House  Desk',
    'Agentic Media House Desk ',
    ' Agentic Media House Desk',
    'Agentic Media House Desk.',
    'Robywire Desk',
  ])(
    'fails for the author name %j, and says what it must be',
    (name) => {
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
          check: 'G1',
          code: 'G1_AUTHOR_NOT_DESK',
          message: `the author is "${name}", but every piece is written by the Desk: the author must be "Robywire Desk"`,
          where: 'author',
        },
```

**with:**
```ts
          check: 'G1',
          code: 'G1_AUTHOR_NOT_DESK',
          message: `the author is "${name}", but every piece is written by the Desk: the author must be "Agentic Media House Desk"`,
          where: 'author',
        },
```

**In `gate/test/frontmatter-consistency.test.ts`, replace:**
```ts
  ['an author of spaces', (g) => (g.draft.author.name = '   ')],
  ['another author', (g) => (g.draft.author.name = 'Jane Doe')],
  ['the Desk with a space after it', (g) => (g.draft.author.name = 'Robywire Desk ')],
];

```

**with:**
```ts
  ['an author of spaces', (g) => (g.draft.author.name = '   ')],
  ['another author', (g) => (g.draft.author.name = 'Jane Doe')],
  ['the Desk with a space after it', (g) => (g.draft.author.name = 'Agentic Media House Desk ')],
];

```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
      publishedAt: '2026-10-04',
      categories: ['humanoids'],
      author: { name: 'Robywire Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'It is fine.', claimIds: cited },
```

**with:**
```ts
      publishedAt: '2026-10-04',
      categories: ['humanoids'],
      author: { name: 'Agentic Media House Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'It is fine.', claimIds: cited },
```

**In `gate/test/gate.test.ts`, replace:**
```ts
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    author: { name: 'Robywire Desk' },
    title: { kind: 'fact', text: 'A title', claimIds: [] },
    description: { kind: 'fact', text: 'A description', claimIds: [] },
```

**with:**
```ts
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    author: { name: 'Agentic Media House Desk' },
    title: { kind: 'fact', text: 'A title', claimIds: [] },
    description: { kind: 'fact', text: 'A description', claimIds: [] },
```

**In `gate/test/golden-draft.test.ts`, replace:**
```ts
    expect(GOLDEN_DRAFT.publishedAt).toBe('2026-10-04');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_DRAFT.author).toEqual({ name: 'Robywire Desk' });
    for (const category of GOLDEN_DRAFT.categories) {
      expect(CATEGORY_VOCAB).toContain(category);
```

**with:**
```ts
    expect(GOLDEN_DRAFT.publishedAt).toBe('2026-10-04');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_DRAFT.author).toEqual({ name: 'Agentic Media House Desk' });
    for (const category of GOLDEN_DRAFT.categories) {
      expect(CATEGORY_VOCAB).toContain(category);
```

**In `gate/test/render.test.ts`, replace:**
```ts
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
  });
```

**with:**
```ts
      'featured: false',
      'author:',
      '  name: "Agentic Media House Desk"',
    ]);
  });
```

**In `gate/test/render.test.ts`, replace:**
```ts
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
    expect(splitMdx(updated.mdx).body).toBe(splitMdx(mdx).body);
```

**with:**
```ts
      'featured: false',
      'author:',
      '  name: "Agentic Media House Desk"',
    ]);
    expect(splitMdx(updated.mdx).body).toBe(splitMdx(mdx).body);
```

**In `gate/test/render.test.ts`, replace:**
```ts
      format: 'news',
      featured: false,
      author: { name: 'Robywire Desk' },
    });
  });
```

**with:**
```ts
      format: 'news',
      featured: false,
      author: { name: 'Agentic Media House Desk' },
    });
  });
```

**In `gate/test/render.test.ts`, replace:**
```ts
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };

```

**with:**
```ts
    format: 'news',
    featured: false,
    author: { name: 'Agentic Media House Desk' },
  };

```

**In `gate/test/schemas.test.ts`, replace:**
```ts
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: 'Robywire Desk' },
  title: fact('Fixture Robotics ships the FX-1 arm.', 'c-1'),
  description: fact('Fixture Robotics says the FX-1 arm is rated for 12 kg.', 'c-1'),
```

**with:**
```ts
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: 'Agentic Media House Desk' },
  title: fact('Fixture Robotics ships the FX-1 arm.', 'c-1'),
  description: fact('Fixture Robotics says the FX-1 arm is rated for 12 kg.', 'c-1'),
```

The Desk. The tests that mirror the default user agent, and the ones that use it as a sample, follow it: `AgenticMediaHouseDesk` is the product token that a website's `robots.txt` is matched against, and `agenticmediahouse.example` is the host that the user agent links to. The config test also says that the name is spelled in one place of the package: the prompts take it from the gate and no other file of `desk/src` writes it, apart from the default user agent in `config.ts`.

**In `desk/test/config.test.ts`, replace:**
```ts
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DeskConfig, defaultConfig, loadConfig, placeholderHost } from '../src/config';

```

**with:**
```ts
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PUBLICATION_NAME } from '@robywire/gate';
import { DeskConfig, defaultConfig, loadConfig, placeholderHost } from '../src/config';

```

**In `desk/test/config.test.ts`, replace:**
```ts
      minClaims: 3,
      maxRevisionRounds: 2,
      userAgent: 'RobywireDesk/0.1 (+https://robywire.example/method)',
      requestIntervalMs: 1000,
      maxBytes: 2_000_000,
```

**with:**
```ts
      minClaims: 3,
      maxRevisionRounds: 2,
      userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
      requestIntervalMs: 1000,
      maxBytes: 2_000_000,
```

**In `desk/test/config.test.ts`, replace:**
```ts

  it('names the Desk and links to the /method page in the user agent, which the fetcher sends to every site', () => {
    expect(defaultConfig().userAgent).toContain('RobywireDesk');
    expect(defaultConfig().userAgent).toContain('https://robywire.example/method');
  });

```

**with:**
```ts

  it('names the Desk and links to the /method page in the user agent, which the fetcher sends to every site', () => {
    expect(defaultConfig().userAgent).toContain('AgenticMediaHouseDesk');
    expect(defaultConfig().userAgent).toContain('https://agenticmediahouse.example/method');
    expect(defaultConfig().userAgent).toBe('AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)');
  });

  it('starts the user agent with the name of the publication without its spaces, and a placeholder address says so to a live run', () => {
    expect(defaultConfig().userAgent.startsWith(`${PUBLICATION_NAME.replaceAll(' ', '')}Desk/`)).toBe(true);
    expect(placeholderHost(defaultConfig().userAgent)).toBe('agenticmediahouse.example');
  });

  it('spells the name of the publication in this one place: the prompts take it from the gate and no other file of the package writes it', () => {
    const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && file !== 'config.ts',
    );
    expect(sources).toContain('index.ts');
    for (const file of sources) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(text, file).not.toMatch(/agentic\s?media\s?house/i);
      expect(text, file).not.toMatch(/robywire(?!\/)/i);
    }
  });

```

**In `desk/test/config.test.ts`, replace:**
```ts

  it('a user agent that does not link to the /method page', () => {
    expect(failure('userAgent: RobywireDesk\n')).toBe(
      'desk config <file>: userAgent: must include the address of the /method page, such as https://robywire.example/method',
    );
  });
```

**with:**
```ts

  it('a user agent that does not link to the /method page', () => {
    expect(failure('userAgent: AgenticMediaHouseDesk\n')).toBe(
      'desk config <file>: userAgent: must include the address of the /method page, such as https://agenticmediahouse.example/method',
    );
  });
```

**In `desk/test/config.test.ts`, replace:**
```ts
describe('placeholderHost', () => {
  // The user agent is what the Desk calls itself to every site, with the address of the page that says who it is. The default one links to an address that
  // does not exist, robywire.example, so a live run has to be given a real one: this says which hosts are placeholders (a name under .example is reserved for examples).
  it.each([
    ['the default user agent', 'RobywireDesk/0.1 (+https://robywire.example/method)', 'robywire.example'],
    ['a host in capitals', 'Desk/1 (+https://Desk.EXAMPLE/method)', 'desk.example'],
    ['a host that is only example', 'Desk/1 (+https://example/method)', 'example'],
    ['a host with a sub-domain', 'Desk/1 (+http://www.news.example/method)', 'www.news.example'],
    ['a host with a port', 'Desk/1 (+https://robywire.example:8443/method)', 'robywire.example'],
    ['a host with a dot at the end', 'Desk/1 (+https://robywire.example./method)', 'robywire.example'],
    ['an address in the middle of the text', 'Mozilla-like Desk/1 see https://robywire.example/method for more', 'robywire.example'],
  ])('finds the placeholder in %s', (_what, agent, host) => {
    expect(placeholderHost(agent)).toBe(host);
```

**with:**
```ts
describe('placeholderHost', () => {
  // The user agent is what the Desk calls itself to every site, with the address of the page that says who it is. The default one links to an address that
  // does not exist, agenticmediahouse.example, so a live run has to be given a real one: this says which hosts are placeholders (a name under .example is reserved for examples).
  it.each([
    ['the default user agent', 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)', 'agenticmediahouse.example'],
    ['a host in capitals', 'Desk/1 (+https://Desk.EXAMPLE/method)', 'desk.example'],
    ['a host that is only example', 'Desk/1 (+https://example/method)', 'example'],
    ['a host with a sub-domain', 'Desk/1 (+http://www.news.example/method)', 'www.news.example'],
    ['a host with a port', 'Desk/1 (+https://agenticmediahouse.example:8443/method)', 'agenticmediahouse.example'],
    ['a host with a dot at the end', 'Desk/1 (+https://agenticmediahouse.example./method)', 'agenticmediahouse.example'],
    ['an address in the middle of the text', 'Mozilla-like Desk/1 see https://agenticmediahouse.example/method for more', 'agenticmediahouse.example'],
  ])('finds the placeholder in %s', (_what, agent, host) => {
    expect(placeholderHost(agent)).toBe(host);
```

**In `desk/test/config.test.ts`, replace:**
```ts

  it.each([
    ['an address that is not a placeholder', 'Desk/1 (+https://robywire.org/method)'],
    ['a host that only has example inside its name', 'Desk/1 (+https://example.com/method)'],
    ['a host that ends in example without a dot', 'Desk/1 (+https://notexample/method)'],
    ['a name under .test', 'Desk/1 (+https://robywire.test/method)'],
    ['a path that has example in it', 'Desk/1 (+https://robywire.org/example/method)'],
    ['no address at all', 'Desk/1'],
    ['an address that cannot be read', 'Desk/1 (+https://[bad/method)'],
```

**with:**
```ts

  it.each([
    ['an address that is not a placeholder', 'Desk/1 (+https://agenticmediahouse.org/method)'],
    ['a host that only has example inside its name', 'Desk/1 (+https://example.com/method)'],
    ['a host that ends in example without a dot', 'Desk/1 (+https://notexample/method)'],
    ['a name under .test', 'Desk/1 (+https://agenticmediahouse.test/method)'],
    ['a path that has example in it', 'Desk/1 (+https://agenticmediahouse.org/example/method)'],
    ['no address at all', 'Desk/1'],
    ['an address that cannot be read', 'Desk/1 (+https://[bad/method)'],
```

**In `desk/test/config.test.ts`, replace:**
```ts

  it('judges the first address of the text, the one that must be the /method page', () => {
    expect(placeholderHost('Desk/1 (+https://robywire.org/method; https://robywire.example/other)')).toBeUndefined();
  });
});
```

**with:**
```ts

  it('judges the first address of the text, the one that must be the /method page', () => {
    expect(placeholderHost('Desk/1 (+https://agenticmediahouse.org/method; https://agenticmediahouse.example/other)')).toBeUndefined();
  });
});
```

**In `desk/test/cli.test.ts`, replace:**
```ts

/** The user agent of the tests: it links to an address that is not a placeholder, which a live run requires, and no site is ever asked. */
const TEST_AGENT = 'RobywireDesk/0.1 (+https://robywire.test/method)';

/**
```

**with:**
```ts

/** The user agent of the tests: it links to an address that is not a placeholder, which a live run requires, and no site is ever asked. */
const TEST_AGENT = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)';

/**
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    'runDir: out/runs',
    'evidenceDir: out/evidence',
    'userAgent: "RobywireDesk/0.1 (+https://robywire.test/method)"',
    '',
  ].join('\n');
```

**with:**
```ts
    'runDir: out/runs',
    'evidenceDir: out/evidence',
    'userAgent: "AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)"',
    '',
  ].join('\n');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
  // links to robywire.example, an address that does not exist, so a live run that has not been given a real one is refused before it asks a site.
  const PLACEHOLDER = 'RobywireDesk/0.1 (+https://robywire.example/method)';

  it('refuses a live run with the default user agent, with exit code 2 and the way out, and writes nothing and asks nobody', async () => {
```

**with:**
```ts
describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
  // links to agenticmediahouse.example, an address that does not exist, so a live run that has not been given a real one is refused before it asks a site.
  const PLACEHOLDER = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';

  it('refuses a live run with the default user agent, with exit code 2 and the way out, and writes nothing and asks nobody', async () => {
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(out).toEqual([]);
    expect(err).toEqual([
      `desk: the user agent "${PLACEHOLDER}" links to robywire.example, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
    ]);
    expect(git.commits).toEqual([]);
```

**with:**
```ts
    expect(out).toEqual([]);
    expect(err).toEqual([
      `desk: the user agent "${PLACEHOLDER}" links to agenticmediahouse.example, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
    ]);
    expect(git.commits).toEqual([]);
```

**In `desk/test/fetch/http-lookup.test.ts`, replace:**
```ts
}));

const UA = 'RobywireDesk/0.1 (+https://robywire.example/method)';

describe('HttpFetcher: the lookup that it uses when it is given none', () => {
```

**with:**
```ts
}));

const UA = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';

describe('HttpFetcher: the lookup that it uses when it is given none', () => {
```

**In `desk/test/fetch/http.test.ts`, replace:**
```ts
// transport that answers from a script, so no test opens a connection.

const UA = 'RobywireDesk/0.1 (+https://robywire.example/method)';
const NOW = new Date('2026-10-05T04:31:00.000Z');
const HOST = 'https://www.fixture-robotics.example';
```

**with:**
```ts
// transport that answers from a script, so no test opens a connection.

const UA = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';
const NOW = new Date('2026-10-05T04:31:00.000Z');
const HOST = 'https://www.fixture-robotics.example';
```

**In `desk/test/fetch/http.test.ts`, replace:**
```ts
    expect(error.kind).toBe('robots');
    expect(error.url).toBe(PAGE);
    expect(error.message).toBe(`${PAGE}: ${HOST}/robots.txt does not allow RobywireDesk to fetch /news/fx-1-ships`);
    expect(urlsOf(sent)).toEqual([ROBOTS]);
  });

  it('reads the robots.txt as the Desk: the group that names it applies, and the group for everyone does not', async () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: RobywireDesk\nDisallow: /private';
    const { fetcher } = setup(site({ [ROBOTS]: { type: 'text/plain', body: robots }, [PAGE]: { body: 'x' }, [`${HOST}/private/a`]: { body: 'y' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
```

**with:**
```ts
    expect(error.kind).toBe('robots');
    expect(error.url).toBe(PAGE);
    expect(error.message).toBe(`${PAGE}: ${HOST}/robots.txt does not allow AgenticMediaHouseDesk to fetch /news/fx-1-ships`);
    expect(urlsOf(sent)).toEqual([ROBOTS]);
  });

  it('reads the robots.txt as the Desk: the group that names it applies, and the group for everyone does not', async () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: AgenticMediaHouseDesk\nDisallow: /private';
    const { fetcher } = setup(site({ [ROBOTS]: { type: 'text/plain', body: robots }, [PAGE]: { body: 'x' }, [`${HOST}/private/a`]: { body: 'y' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
```

**In `desk/test/fetch/http.test.ts`, replace:**
```ts

  it('throws the error that an address is mapped to, as it is', async () => {
    const error = new FetchError('robots', PAGE, 'robots.txt does not allow RobywireDesk to fetch /news/fx-1-ships');
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: error }, now);
    await expect(fetcher.get(PAGE)).rejects.toBe(error);
```

**with:**
```ts

  it('throws the error that an address is mapped to, as it is', async () => {
    const error = new FetchError('robots', PAGE, 'robots.txt does not allow AgenticMediaHouseDesk to fetch /news/fx-1-ships');
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: error }, now);
    await expect(fetcher.get(PAGE)).rejects.toBe(error);
```

**In `desk/test/fetch/robots.test.ts`, replace:**
```ts
// so the reading of the file has to be exact: the standard (RFC 9309) decides every case below.

const TOKEN = 'RobywireDesk';
const file = (...lines: string[]): string => lines.join('\n');

describe('productToken', () => {
  it('is the name at the start of the user agent, before the version and the comment', () => {
    expect(productToken('RobywireDesk/0.1 (+https://robywire.example/method)')).toBe('RobywireDesk');
    expect(productToken('Some_Bot-2 extra words')).toBe('Some_Bot-2');
  });

  it('refuses a user agent that does not start with a name', () => {
    expect(() => productToken(' RobywireDesk/0.1')).toThrow('has no product token');
    expect(() => productToken('')).toThrow('has no product token');
  });
```

**with:**
```ts
// so the reading of the file has to be exact: the standard (RFC 9309) decides every case below.

const TOKEN = 'AgenticMediaHouseDesk';
const file = (...lines: string[]): string => lines.join('\n');

describe('productToken', () => {
  it('is the name at the start of the user agent, before the version and the comment', () => {
    expect(productToken('AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)')).toBe('AgenticMediaHouseDesk');
    expect(productToken('Some_Bot-2 extra words')).toBe('Some_Bot-2');
  });

  it('refuses a user agent that does not start with a name', () => {
    expect(() => productToken(' AgenticMediaHouseDesk/0.1')).toThrow('has no product token');
    expect(() => productToken('')).toThrow('has no product token');
  });
```

**In `desk/test/fetch/robots.test.ts`, replace:**
```ts
    ['a group for another agent does not apply', file('User-agent: otherbot', 'Disallow: /'), '/news', true],
    ['a group for another agent does not apply: the star group does', file('User-agent: otherbot', 'Disallow: /', '', 'User-agent: *', 'Disallow: /x'), '/news', true],
    ['our own group applies', file('User-agent: RobywireDesk', 'Disallow: /'), '/news', false],
    ['the name of the agent is not case-sensitive', file('User-agent: robywiredesk', 'Disallow: /'), '/news', false],
    ['only the whole name matches: a longer name is another agent', file('User-agent: RobywireDeskPlus', 'Disallow: /'), '/news', true],
    ['only the whole name matches: a shorter name is another agent', file('User-agent: Robywire', 'Disallow: /'), '/news', true],
    ['a version after the name does not match, the name alone is the token', file('User-agent: RobywireDesk/0.1', 'Disallow: /'), '/news', true],
    ['our group replaces the star group: the star group is not added to it', file('User-agent: *', 'Disallow: /', '', 'User-agent: RobywireDesk', 'Disallow: /secret'), '/news', true],
    ['our group replaces the star group: our own rules still apply', file('User-agent: *', 'Disallow: /', '', 'User-agent: RobywireDesk', 'Disallow: /secret'), '/secret', false],
    ['our group may allow what the star group blocks', file('User-agent: *', 'Disallow: /', '', 'User-agent: RobywireDesk', 'Allow: /'), '/news', true],
    ['an agent line before ours shares its group with ours', file('User-agent: otherbot', 'User-agent: RobywireDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after ours shares its group with ours', file('User-agent: RobywireDesk', 'User-agent: otherbot', 'Disallow: /x'), '/x', false],
    ['a blank line does not end a list of agents', file('User-agent: otherbot', '', 'User-agent: RobywireDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after a rule starts a new group', file('User-agent: otherbot', 'Disallow: /x', 'User-agent: RobywireDesk', 'Disallow: /y'), '/x', true],
    ['two groups of the same agent are one group: the first', file('User-agent: RobywireDesk', 'Disallow: /a', '', 'User-agent: RobywireDesk', 'Disallow: /b'), '/a', false],
    ['two groups of the same agent are one group: the second', file('User-agent: RobywireDesk', 'Disallow: /a', '', 'User-agent: RobywireDesk', 'Disallow: /b'), '/b', false],
    ['a Sitemap line is not a rule', file('Sitemap: https://www.fixture-robotics.example/sitemap.xml', 'User-agent: *', 'Disallow: /x'), '/x', false],
    ['a Sitemap line between agents does not break the list', file('User-agent: otherbot', 'Sitemap: https://www.fixture-robotics.example/s.xml', 'User-agent: RobywireDesk', 'Disallow: /x'), '/x', false],
    ['a Crawl-delay line is not a rule', file('User-agent: *', 'Crawl-delay: 10'), '/x', true],
    ['a rule before any User-agent line is ignored', file('Disallow: /', 'User-agent: *', 'Disallow: /x'), '/news', true],
```

**with:**
```ts
    ['a group for another agent does not apply', file('User-agent: otherbot', 'Disallow: /'), '/news', true],
    ['a group for another agent does not apply: the star group does', file('User-agent: otherbot', 'Disallow: /', '', 'User-agent: *', 'Disallow: /x'), '/news', true],
    ['our own group applies', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /'), '/news', false],
    ['the name of the agent is not case-sensitive', file('User-agent: agenticmediahousedesk', 'Disallow: /'), '/news', false],
    ['only the whole name matches: a longer name is another agent', file('User-agent: AgenticMediaHouseDeskPlus', 'Disallow: /'), '/news', true],
    ['only the whole name matches: a shorter name is another agent', file('User-agent: AgenticMediaHouse', 'Disallow: /'), '/news', true],
    ['a version after the name does not match, the name alone is the token', file('User-agent: AgenticMediaHouseDesk/0.1', 'Disallow: /'), '/news', true],
    ['our group replaces the star group: the star group is not added to it', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /secret'), '/news', true],
    ['our group replaces the star group: our own rules still apply', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /secret'), '/secret', false],
    ['our group may allow what the star group blocks', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Allow: /'), '/news', true],
    ['an agent line before ours shares its group with ours', file('User-agent: otherbot', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after ours shares its group with ours', file('User-agent: AgenticMediaHouseDesk', 'User-agent: otherbot', 'Disallow: /x'), '/x', false],
    ['a blank line does not end a list of agents', file('User-agent: otherbot', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after a rule starts a new group', file('User-agent: otherbot', 'Disallow: /x', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /y'), '/x', true],
    ['two groups of the same agent are one group: the first', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /a', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /b'), '/a', false],
    ['two groups of the same agent are one group: the second', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /a', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /b'), '/b', false],
    ['a Sitemap line is not a rule', file('Sitemap: https://www.fixture-robotics.example/sitemap.xml', 'User-agent: *', 'Disallow: /x'), '/x', false],
    ['a Sitemap line between agents does not break the list', file('User-agent: otherbot', 'Sitemap: https://www.fixture-robotics.example/s.xml', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['a Crawl-delay line is not a rule', file('User-agent: *', 'Crawl-delay: 10'), '/x', true],
    ['a rule before any User-agent line is ignored', file('Disallow: /', 'User-agent: *', 'Disallow: /x'), '/news', true],
```

**In `desk/test/fetch/robots.test.ts`, replace:**
```ts
describe('parseRobots', () => {
  it('lists the groups, with the agents in lowercase and the rules in file order', () => {
    const parsed = parseRobots(file('User-agent: RobywireDesk', 'User-agent: OtherBot', 'Disallow: /a', 'Allow: /a/b', '', 'User-agent: *', 'Disallow: /'));
    expect(parsed.groups).toEqual([
      {
        agents: ['robywiredesk', 'otherbot'],
        rules: [
          { allow: false, pattern: '/a' },
```

**with:**
```ts
describe('parseRobots', () => {
  it('lists the groups, with the agents in lowercase and the rules in file order', () => {
    const parsed = parseRobots(file('User-agent: AgenticMediaHouseDesk', 'User-agent: OtherBot', 'Disallow: /a', 'Allow: /a/b', '', 'User-agent: *', 'Disallow: /'));
    expect(parsed.groups).toEqual([
      {
        agents: ['agenticmediahousedesk', 'otherbot'],
        rules: [
          { allow: false, pattern: '/a' },
```

**In `desk/test/stages/discover.test.ts`, replace:**
```ts

  it('skips a source that the fetcher was refused', async () => {
    const refusal = new FetchError('robots', URLS.gantryFeed, 'https://gantry-daily.example/robots.txt does not allow RobywireDesk to fetch /atom.xml');
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.gantryFeed]: refusal }) });
    expect((await runDiscover(ctx)).skipped).toEqual([{ source: 'Gantry Daily', reason: refusal.message }]);
```

**with:**
```ts

  it('skips a source that the fetcher was refused', async () => {
    const refusal = new FetchError('robots', URLS.gantryFeed, 'https://gantry-daily.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /atom.xml');
    const { ctx } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [URLS.gantryFeed]: refusal }) });
    expect((await runDiscover(ctx)).skipped).toEqual([{ source: 'Gantry Daily', reason: refusal.message }]);
```

**In `desk/test/stages/discover.test.ts`, replace:**
```ts
    const artifact = await runDiscover({ ...ctx, fetcher });
    expect(artifact.skipped).toEqual([
      { source: 'Gantry Daily', reason: `${URLS.gantryFeed}: https://gantry-daily.example/robots.txt does not allow RobywireDesk to fetch /atom.xml` },
    ]);
    expect(sent.map((request) => request.url)).not.toContain(URLS.gantryFeed);
```

**with:**
```ts
    const artifact = await runDiscover({ ...ctx, fetcher });
    expect(artifact.skipped).toEqual([
      { source: 'Gantry Daily', reason: `${URLS.gantryFeed}: https://gantry-daily.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /atom.xml` },
    ]);
    expect(sent.map((request) => request.url)).not.toContain(URLS.gantryFeed);
```

**In `desk/test/stages/fetch.test.ts`, replace:**
```ts

describe('runFetch: a page that cannot be had', () => {
  const robots = new FetchError('robots', URLS.release, 'https://fixture-robotics.example/robots.txt does not allow RobywireDesk to fetch /news/fx-1-second-plant');
  const tooLarge = new FetchError('too-large', URLS.mercerArticle, 'the page is larger than the limit of 2000000 bytes');

```

**with:**
```ts

describe('runFetch: a page that cannot be had', () => {
  const robots = new FetchError('robots', URLS.release, 'https://fixture-robotics.example/robots.txt does not allow AgenticMediaHouseDesk to fetch /news/fx-1-second-plant');
  const tooLarge = new FetchError('too-large', URLS.mercerArticle, 'the page is larger than the limit of 2000000 bytes');

```

Every prompt tells its model whom it works for. One test goes through the five system prompts (select, extract, compose, revise and verify).

**Create `desk/test/prompts/publication-name.test.ts`:**
```ts
import { PUBLICATION_NAME } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { composeSystem, reviseSystem } from '../../src/prompts/compose';
import { extractSystem } from '../../src/prompts/extract';
import { selectSystem } from '../../src/prompts/select';
import { verifySystem } from '../../src/prompts/verify';

// A model is told whom it works for. The name comes from the gate's constant, so that it is spelled in one place,
// and no prompt may carry a name that the publication no longer has.

const PROMPTS = [
  ['select', selectSystem],
  ['extract', extractSystem],
  ['compose', composeSystem],
  ['revise', reviseSystem],
  ['verify', verifySystem],
] as const;

describe.each(PROMPTS)('the %s prompt', (_stage, system) => {
  it('says that the model works for the publication, by its name', () => {
    expect(system()).toContain(`of ${PUBLICATION_NAME}, a robotics news site`);
    expect(system()).toContain('of Agentic Media House, a robotics news site');
  });

  it('carries no old name', () => {
    expect(system()).not.toMatch(/robywire/i);
  });
});
```

The site. The tests that pin the author and the placeholder address follow, and a new test reads `site/astro.config.mjs` to say what the site is built for when `SITE_URL` is not set.

**In `site/test/byline.test.ts`, replace:**
```ts
describe('the byline constants', () => {
  it('are the ones the gate publishes', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
  });
```

**with:**
```ts
describe('the byline constants', () => {
  it('are the ones the gate publishes', () => {
    expect(DESK_AUTHOR_NAME).toBe('Agentic Media House Desk');
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
  });
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };
  // The body of a piece as Astro hands it over: the text under the frontmatter, without its outer blank lines.
```

**with:**
```ts
    format: 'news',
    featured: false,
    author: { name: 'Agentic Media House Desk' },
  };
  // The body of a piece as Astro hands it over: the text under the frontmatter, without its outer blank lines.
```

**In `site/test/feed.test.ts`, replace:**
```ts
import { feedOptions, rssItems } from '../src/lib/feed';

const SITE = 'https://robywire.example';

const piece = (slug: string, title: string, publishedAt: string, categories: string[], description = `About ${title}.`) => ({
```

**with:**
```ts
import { feedOptions, rssItems } from '../src/lib/feed';

const SITE = 'https://agenticmediahouse.example';

const piece = (slug: string, title: string, publishedAt: string, categories: string[], description = `About ${title}.`) => ({
```

**In `site/test/feed.test.ts`, replace:**
```ts
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.link).toBe('https://robywire.example/');
    expect(rss.channel.language).toBe('en');
  });
```

**with:**
```ts
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.link).toBe('https://agenticmediahouse.example/');
    expect(rss.channel.language).toBe('en');
  });
```

**In `site/test/feed.test.ts`, replace:**
```ts
    const { rss } = parse(await feed([FX1, FX2]));
    const items = rss.channel.item as { title: string; link: string; pubDate: string; category: string[]; guid: { '#text': string } }[];
    expect(items.map((item) => item.link)).toEqual(['https://robywire.example/news/fx-1/', 'https://robywire.example/news/fx-2/']);
    expect(items[0]?.pubDate).toBe('Sun, 04 Oct 2026 00:00:00 GMT');
    expect(items[0]?.category).toEqual(['Industrial & warehouse', 'Funding']);
    expect(items[0]?.guid['#text']).toBe('https://robywire.example/news/fx-1/');
  });

```

**with:**
```ts
    const { rss } = parse(await feed([FX1, FX2]));
    const items = rss.channel.item as { title: string; link: string; pubDate: string; category: string[]; guid: { '#text': string } }[];
    expect(items.map((item) => item.link)).toEqual(['https://agenticmediahouse.example/news/fx-1/', 'https://agenticmediahouse.example/news/fx-2/']);
    expect(items[0]?.pubDate).toBe('Sun, 04 Oct 2026 00:00:00 GMT');
    expect(items[0]?.category).toEqual(['Industrial & warehouse', 'Funding']);
    expect(items[0]?.guid['#text']).toBe('https://agenticmediahouse.example/news/fx-1/');
  });

```

**In `site/test/jsonld.test.ts`, replace:**
```ts
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

const SITE = 'https://robywire.example';
const piece = {
  slug: 'fixture-robotics-ships-fx-2-to-second-plant',
```

**with:**
```ts
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

const SITE = 'https://agenticmediahouse.example';
const piece = {
  slug: 'fixture-robotics-ships-fx-2-to-second-plant',
```

**In `site/test/robots.test.ts`, replace:**
```ts
describe('robotsTxt', () => {
  it('allows every crawler and points at the sitemap index on the site', () => {
    expect(robotsTxt(new URL('https://robywire.example'))).toBe('User-agent: *\nAllow: /\n\nSitemap: https://robywire.example/sitemap-index.xml\n');
  });

```

**with:**
```ts
describe('robotsTxt', () => {
  it('allows every crawler and points at the sitemap index on the site', () => {
    expect(robotsTxt(new URL('https://agenticmediahouse.example'))).toBe('User-agent: *\nAllow: /\n\nSitemap: https://agenticmediahouse.example/sitemap-index.xml\n');
  });

```

**In `site/test/robots.test.ts`, replace:**
```ts

  it('ends with exactly one newline and disallows nothing', () => {
    const text = robotsTxt('https://robywire.example');
    expect(text.endsWith('xml\n')).toBe(true);
    expect(text).not.toMatch(/disallow/i);
```

**with:**
```ts

  it('ends with exactly one newline and disallows nothing', () => {
    const text = robotsTxt('https://agenticmediahouse.example');
    expect(text.endsWith('xml\n')).toBe(true);
    expect(text).not.toMatch(/disallow/i);
```

**In `site/test/support/small-site.ts`, replace:**
```ts
// runner and of the command line change it to break one thing at a time.

const ORIGIN = 'https://robywire.example';

/** A page that passes the checks on pages. */
```

**with:**
```ts
// runner and of the command line change it to break one thing at a time.

const ORIGIN = 'https://agenticmediahouse.example';

/** A page that passes the checks on pages. */
```

**Create `site/test/site-url.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The site is built for an address, and that address is not chosen yet: until it is, the build uses a placeholder on
// a name that no one owns, and the variable SITE_URL puts the real one in its place. Canonical links, the sitemap, the
// feed and robots.txt are all written from this one address.

const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

describe('the address the site is built for', () => {
  it('is the placeholder of the publication unless SITE_URL gives another', () => {
    expect(config).toContain("site: process.env.SITE_URL ?? 'https://agenticmediahouse.example'");
  });

  it('is on .example, a name that is reserved for examples and that no one can own', () => {
    const placeholder = /process\.env\.SITE_URL \?\? '([^']+)'/.exec(config)?.[1];
    expect(placeholder).toBeDefined();
    expect(new URL(placeholder!).hostname.endsWith('.example')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests and confirm that they fail**

The gate fails because the constants do not exist and the author is still the old one.

Run: `npm test --workspace @robywire/gate`
Expected: FAIL — `expected undefined to be 'Agentic Media House'` and `expected 'Robywire Desk' to be 'Agentic Media House Desk'`

The Desk fails because its user agent and its prompts still carry the old name.

Run: `npm test --workspace @robywire/desk`
Expected: FAIL — `to contain 'AgenticMediaHouseDesk'` and `FAIL  test/prompts/publication-name.test.ts`

The site fails because the author is still the old one and the build is for the old address.

Run: `npm test --workspace @robywire/site`
Expected: FAIL — `expected 'Robywire Desk' to be 'Agentic Media House Desk'` and `FAIL  test/site-url.test.ts`

- [ ] **Step 4: Give the name one home**

The constants. `PUBLICATION_WORDMARK` and `DESK_AUTHOR_NAME` are written out, and not computed from the name, so that their types stay literal types; the test of Step 2 keeps them in agreement with `PUBLICATION_NAME`.

**In `gate/src/constants.ts`, replace:**
```ts
/** The name every piece is published under. G1 rejects any other author, and the frontmatter schema accepts no other. */
export const DESK_AUTHOR_NAME = 'Robywire Desk';

/**
```

**with:**
```ts
/**
 * The name of the publication, spelled as every reader-facing string spells it. The site, the feed, the structured
 * data and the prompts of the Desk take it from here and never write it out themselves.
 */
export const PUBLICATION_NAME = 'Agentic Media House';

/** The name in capitals: the wordmark in the header of the site and on the fact card. */
export const PUBLICATION_WORDMARK = 'AGENTIC MEDIA HOUSE';

/** The name every piece is published under: the publication and the word Desk. G1 rejects any other author, and the frontmatter schema accepts no other. */
export const DESK_AUTHOR_NAME = 'Agentic Media House Desk';

/**
```

The Desk. The default user agent names the Desk and links to the page that says who the Desk is; the host is still a placeholder (the real domain is not chosen yet), and a live run is still refused while the user agent links to a name under `.example`. The error message of `productToken` gave `RobywireDesk` as an example of a product token; it now gives a made-up one, so that the name is not written in a second file.

**In `desk/src/config.ts`, replace:**
```ts
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
    message: 'must include the address of the /method page, such as https://robywire.example/method',
  }),
  /** Fetch: the least pause between two requests to one host. */
```

**with:**
```ts
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
    message: 'must include the address of the /method page, such as https://agenticmediahouse.example/method',
  }),
  /** Fetch: the least pause between two requests to one host. */
```

**In `desk/src/config.ts`, replace:**
```ts
    minClaims: 3,
    maxRevisionRounds: 2,
    userAgent: 'RobywireDesk/0.1 (+https://robywire.example/method)',
    requestIntervalMs: 1000,
    maxBytes: 2_000_000,
```

**with:**
```ts
    minClaims: 3,
    maxRevisionRounds: 2,
    userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
    requestIntervalMs: 1000,
    maxBytes: 2_000_000,
```

**In `desk/src/config.ts`, replace:**
```ts
/**
 * The host of the address that a user agent links to, when that host is a placeholder: `example`, or a name under `.example`, which no one owns
 * and the default user agent uses (robywire.example). `undefined` when the first address of the text is anything else, or when there is none. The
 * first address is the one that has to be the /method page (the schema of the setting requires it). A live run needs a real one: a site that
 * is asked by a user agent that points nowhere cannot find out who is asking.
```

**with:**
```ts
/**
 * The host of the address that a user agent links to, when that host is a placeholder: `example`, or a name under `.example`, which no one owns
 * and the default user agent uses (agenticmediahouse.example). `undefined` when the first address of the text is anything else, or when there is none. The
 * first address is the one that has to be the /method page (the schema of the setting requires it). A live run needs a real one: a site that
 * is asked by a user agent that points nowhere cannot find out who is asking.
```

**In `desk/src/fetch/robots.ts`, replace:**
```ts
export function productToken(userAgent: string): string {
  const token = /^[A-Za-z0-9_-]+/.exec(userAgent)?.[0];
  if (token === undefined) throw new Error(`the user agent ${JSON.stringify(userAgent)} has no product token: it must start with a name such as RobywireDesk`);
  return token;
}
```

**with:**
```ts
export function productToken(userAgent: string): string {
  const token = /^[A-Za-z0-9_-]+/.exec(userAgent)?.[0];
  if (token === undefined) throw new Error(`the user agent ${JSON.stringify(userAgent)} has no product token: it must start with a name such as ExampleDesk`);
  return token;
}
```

The first line of each prompt takes the name from the gate.

**In `desk/src/prompts/select.ts`, replace:**
```ts
import { systemPrompt, wrapSource } from '../index';
import type { Candidate } from '../index';
import type { SourcesRegistry } from '@robywire/gate';

```

**with:**
```ts
import { systemPrompt, wrapSource } from '../index';
import type { Candidate } from '../index';
import { PUBLICATION_NAME } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';

```

**In `desk/src/prompts/select.ts`, replace:**
```ts
/** What the model is told to do, and what each field of its reply means. The client adds the JSON Schema of the reply to it. */
export const SELECT_INSTRUCTIONS = [
  'You are the story selector of Robywire, a robotics news site whose every claim comes from a primary source.',
  'Each day you choose at most one story to write about, from a list of candidates, or you choose none.',
  '',
```

**with:**
```ts
/** What the model is told to do, and what each field of its reply means. The client adds the JSON Schema of the reply to it. */
export const SELECT_INSTRUCTIONS = [
  `You are the story selector of ${PUBLICATION_NAME}, a robotics news site whose every claim comes from a primary source.`,
  'Each day you choose at most one story to write about, from a list of candidates, or you choose none.',
  '',
```

**In `desk/src/prompts/extract.ts`, replace:**
```ts
import { systemPrompt, wrapSource } from '../index';
import type { SourceKind } from '../index';
```

**with:**
```ts
import { PUBLICATION_NAME } from '@robywire/gate';
import { systemPrompt, wrapSource } from '../index';
import type { SourceKind } from '../index';
```

**In `desk/src/prompts/extract.ts`, replace:**
```ts
/** What the model is told to do, and what each field of a claim means. The client adds the JSON Schema of the reply to it. */
export const EXTRACT_INSTRUCTIONS = [
  'You are the claim extractor of Robywire, a robotics news site whose every sentence traces to a passage of a primary source.',
  'You are given one or more sources. Each is the text of a web page, in a block that starts with <source id="N">, where N is the number of the source. You read them and list claims. A claim is one statement of fact that a source makes. You write nothing else.',
  '',
```

**with:**
```ts
/** What the model is told to do, and what each field of a claim means. The client adds the JSON Schema of the reply to it. */
export const EXTRACT_INSTRUCTIONS = [
  `You are the claim extractor of ${PUBLICATION_NAME}, a robotics news site whose every sentence traces to a passage of a primary source.`,
  'You are given one or more sources. Each is the text of a web page, in a block that starts with <source id="N">, where N is the number of the source. You read them and list claims. A claim is one statement of fact that a source makes. You write nothing else.',
  '',
```

**In `desk/src/prompts/compose.ts`, replace:**
```ts
import { SENTENCE_STARTERS, defaultConfig as defaultGateConfig } from '@robywire/gate';
import type { Claim, LedgerSection } from '@robywire/gate';
import { systemPrompt, wrapSource } from '../index';
```

**with:**
```ts
import { PUBLICATION_NAME, SENTENCE_STARTERS, defaultConfig as defaultGateConfig } from '@robywire/gate';
import type { Claim, LedgerSection } from '@robywire/gate';
import { systemPrompt, wrapSource } from '../index';
```

**In `desk/src/prompts/compose.ts`, replace:**
```ts
/** What the model is told to do, and what each part of its reply means. The client adds the JSON Schema of the reply to it. */
export const COMPOSE_INSTRUCTIONS = [
  'You are the writer of Robywire, a robotics news site whose every factual sentence traces to a passage of a primary source.',
  'You are given claims, each with an id, a text, a label, a quoted passage from its source and the values (numbers, dates and names) that it licenses. You write one news piece from them, as sentences that cite claim ids. You write nothing that the claims do not support, and you add nothing from what you know.',
  '',
```

**with:**
```ts
/** What the model is told to do, and what each part of its reply means. The client adds the JSON Schema of the reply to it. */
export const COMPOSE_INSTRUCTIONS = [
  `You are the writer of ${PUBLICATION_NAME}, a robotics news site whose every factual sentence traces to a passage of a primary source.`,
  'You are given claims, each with an id, a text, a label, a quoted passage from its source and the values (numbers, dates and names) that it licenses. You write one news piece from them, as sentences that cite claim ids. You write nothing that the claims do not support, and you add nothing from what you know.',
  '',
```

**In `desk/src/prompts/compose.ts`, replace:**
```ts
 */
export const REVISE_INSTRUCTIONS = [
  'You are the writer of Robywire, a robotics news site whose every factual sentence traces to a passage of a primary source.',
  'You wrote a piece from claims, and it was checked. Some of its sentences and headings were found wanting. You are given the claims again, and only the items that failed. Each item is in a block with an id that starts with s (a sentence) or h (a heading), and the problems found in it are in the block that follows. Rewrite each item so that none of its problems remains and so that it breaks none of the rules below. Keep what was right in it. You are not given the rest of the piece, so do not try to change anything else.',
  '',
```

**with:**
```ts
 */
export const REVISE_INSTRUCTIONS = [
  `You are the writer of ${PUBLICATION_NAME}, a robotics news site whose every factual sentence traces to a passage of a primary source.`,
  'You wrote a piece from claims, and it was checked. Some of its sentences and headings were found wanting. You are given the claims again, and only the items that failed. Each item is in a block with an id that starts with s (a sentence) or h (a heading), and the problems found in it are in the block that follows. Rewrite each item so that none of its problems remains and so that it breaks none of the rules below. Keep what was right in it. You are not given the rest of the piece, so do not try to change anything else.',
  '',
```

**In `desk/src/prompts/verify.ts`, replace:**
```ts
import type { Basis, Claim, LedgerSection, Status } from '@robywire/gate';
import { systemPrompt, wrapSource } from '../index';
```

**with:**
```ts
import { PUBLICATION_NAME } from '@robywire/gate';
import type { Basis, Claim, LedgerSection, Status } from '@robywire/gate';
import { systemPrompt, wrapSource } from '../index';
```

**In `desk/src/prompts/verify.ts`, replace:**
```ts
/** What the verifier is told to do, and what each part of its reply means. The client adds the JSON Schema of the reply to it. */
export const VERIFY_INSTRUCTIONS = [
  'You are the independent checker of Robywire, a robotics news site whose every sentence must be supported by a passage of a primary source. You did not write the piece. Your job is to find what the passages do not support.',
  'You are given passages, each from a source and each in a block with the id of a claim, and items, each a sentence or a heading of the piece in a block with an id that starts with s or h. For each item the message says which passages it relies on. You judge from those passages alone. Do not use anything you know from elsewhere.',
  '',
```

**with:**
```ts
/** What the verifier is told to do, and what each part of its reply means. The client adds the JSON Schema of the reply to it. */
export const VERIFY_INSTRUCTIONS = [
  `You are the independent checker of ${PUBLICATION_NAME}, a robotics news site whose every sentence must be supported by a passage of a primary source. You did not write the piece. Your job is to find what the passages do not support.`,
  'You are given passages, each from a source and each in a block with the id of a claim, and items, each a sentence or a heading of the piece in a block with an id that starts with s or h. For each item the message says which passages it relies on. You judge from those passages alone. Do not use anything you know from elsewhere.',
  '',
```

The site. The placeholder address of the build, which `SITE_URL` still overrides, and two comments that give an example of an address.

**In `site/astro.config.mjs`, replace:**
```js
// internal link ends in a slash.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://robywire.example',
  output: 'static',
  trailingSlash: 'always',
```

**with:**
```js
// internal link ends in a slash.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://agenticmediahouse.example',
  output: 'static',
  trailingSlash: 'always',
```

**In `site/scripts/audit/site.mjs`, replace:**
```js
 * @property {Page[]} pages  Sorted by path.
 * @property {Sheet[]} stylesheets  CSS files, <style> elements and style attributes.
 * @property {string} origin  The address the site is built for, such as "https://robywire.example".
 */

```

**with:**
```js
 * @property {Page[]} pages  Sorted by path.
 * @property {Sheet[]} stylesheets  CSS files, <style> elements and style attributes.
 * @property {string} origin  The address the site is built for, such as "https://agenticmediahouse.example".
 */

```

**In `site/src/lib/jsonld.ts`, replace:**
```ts
 * when it has one; otherwise the time of the latest correction or retraction
 * recorded for it; otherwise the publication date. `siteUrl` is the site's
 * address, such as "https://robywire.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
```

**with:**
```ts
 * when it has one; otherwise the time of the latest correction or retraction
 * recorded for it; otherwise the publication date. `siteUrl` is the site's
 * address, such as "https://agenticmediahouse.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
```

- [ ] **Step 5: Regenerate the fixtures**

The five fixture pieces carry the author in their frontmatter, and the renderer writes it from `DESK_AUTHOR_NAME`, so they are out of date.

Run: `npm run fixtures:check`
Expected: FAIL — `Fixtures are out of date`

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 11 fixture files`

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 6: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  35 passed (35)`

Run: `npm test --workspace @robywire/desk`
Expected: PASS — `Test Files  60 passed (60)`

Run: `npm test --workspace @robywire/site`
Expected: PASS — `Test Files  37 passed (37)`

- [ ] **Step 7: Run the whole check**

The seeded evals are unchanged: no case of the scoreboard names the author, and `evals/scoreboard/seeded.json` does not change.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

Run: `git status --short -- evals`
Expected: PASS — prints nothing

Run: `npm run desk:demo`
Expected: PASS — `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`

- [ ] **Step 8: Commit**

```bash
git add gate/src/constants.ts gate/test/constants.test.ts gate/test/frontmatter-consistency.test.ts gate/test/g1-frontmatter.test.ts gate/test/g4-values.test.ts gate/test/gate.test.ts gate/test/golden-draft.test.ts gate/test/render.test.ts gate/test/schemas.test.ts desk/src/config.ts desk/src/fetch/robots.ts desk/src/prompts/compose.ts desk/src/prompts/extract.ts desk/src/prompts/select.ts desk/src/prompts/verify.ts desk/test/cli.test.ts desk/test/config.test.ts desk/test/fetch/http-lookup.test.ts desk/test/fetch/http.test.ts desk/test/fetch/robots.test.ts desk/test/stages/discover.test.ts desk/test/stages/fetch.test.ts desk/test/prompts/publication-name.test.ts site/astro.config.mjs site/scripts/audit/site.mjs site/src/lib/jsonld.ts site/src/content-fixtures/news site/test/byline.test.ts site/test/match-pieces.test.ts site/test/feed.test.ts site/test/jsonld.test.ts site/test/robots.test.ts site/test/support/small-site.ts site/test/site-url.test.ts
git commit -m "feat: the publication has one name, Agentic Media House, spelled in one place: PUBLICATION_NAME and PUBLICATION_WORDMARK in the gate, the author Agentic Media House Desk, the user agent AgenticMediaHouseDesk and the placeholder address agenticmediahouse.example" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The site says the new name

**Files:**
- Modify: `site/src/lib/format.ts` (`SITE_NAME` is gone; `documentTitle` uses `PUBLICATION_NAME`), `site/src/lib/feed.ts` (the title of the channel), `site/src/lib/jsonld.ts` (the publisher), `site/src/lib/card.ts` (the wordmark of the fact card), `site/src/lib/copy.ts` (the four sentences that begin with the name)
- Modify: `site/src/components/Header.astro` (the wordmark), `site/src/layouts/Base.astro` (the share name and the title of the feed link), `site/src/pages/index.astro` (the title of the home page), `site/src/pages/method/index.astro` (the description)
- Modify: `site/scripts/generate-fixtures.ts` (the made-up pull request address), `site/src/content-fixtures/desk-state.json` (regenerated)
- Modify: `README.md`, `package.json`, `site/package.json`, `desk/package.json` (descriptions), `sources.yml` (its title)
- Create: `site/test/publication-name.test.ts`
- Test: `site/test/format.test.ts`, `site/test/feed.test.ts`, `site/test/jsonld.test.ts`, `site/test/card.test.ts`, `site/test/copy.test.ts`, `site/test/fixtures.test.ts`, `site/test/desk-pages.test.ts`, `site/test/support/small-site.ts`, `gate/test/g1-frontmatter.test.ts`

Task 1 gave the name one home and changed the author, the user agent and the placeholder address. This task changes everything else that a reader meets, and builds each of those strings from the constants: the site code imports `PUBLICATION_NAME` and `PUBLICATION_WORDMARK` from `@robywire/gate` and never writes the name. The sentences of the site that are copy stay where they are (`site/src/lib/copy.ts`, `site/src/lib/method.ts`); only the name in them becomes a template slot.

Where the name shows:

| Place | Value |
|---|---|
| The wordmark in the header of every page | `PUBLICATION_WORDMARK` |
| The `<title>` of every page: the page name, a dash and the name; the home page has just the name | `PUBLICATION_NAME` |
| `og:site_name` and the title of the link to the feed, in the head of every page | `PUBLICATION_NAME` |
| The footer (the disclosure) and the first paragraph of the method page | `PUBLICATION_NAME` in `copy.ts` |
| The description of the method page | `PUBLICATION_NAME` |
| `publisher` in the structured data of an article (`author` is `DESK_AUTHOR_NAME`, changed in Task 1) | `PUBLICATION_NAME` |
| The title of the RSS channel | `PUBLICATION_NAME` |
| The wordmark in the SVG of the fact card, in the file that is the share image and in the card inside the page | `PUBLICATION_WORDMARK` |
| The title of the README, its first sentence, and the descriptions of the packages | the name written out (they are files, not code) |

The pages `/status`, `/holds`, `/corrections`, `/method`, the receipts pages and the 404 page do not write the name themselves: they reach it through the title, the header and the footer, so they need no change of their own. The description of the feed (`siteDescription()`) does not contain the name either, and stays.

**Three things that were checked and needed nothing.** *The header.* The name is longer (19 characters in capitals against 8), so the header was measured, not assumed. At 375 pixels the wordmark is about 234 pixels wide in a content width of 335, on one line, and no page of the site scrolls sideways; at 768, 1024, 1200 and 1440 pixels the header has the same height and the same number of rows of links as before. So the style sheet is not changed. On a narrower screen, or in a wider system font, the link would wrap onto a second line, which `flex-wrap` and the plain text of the link already allow. *The fact card.* The wordmark is set at size 26 with letter spacing 6; the estimate of the layout test puts it at about 410 pixels from the left edge of a card that is 1200 wide, and a new test keeps it in the left half. *The title.* A page title is the name of the page, a dash and the name of the publication; the name is 11 characters longer than before. The longest title of the fixture build is the receipts page of a piece (95 characters, of which 22 are the dash and the name); the production build's longest is 51. The gate does not limit the length of a title, so no length is enforced; a search engine shows the start of a title and cuts the end, which is the name of the publication.

- [ ] **Step 1: Write the tests, and change the tests that pin the old name**

The titles. `documentTitle` is tested with the new name, with a title that already has it, and with a title that has the old name in it, which is no longer the name of the publication and so gets the suffix. One test says what the suffix is made of, so that the room a page name has in a title is known.

**In `site/test/format.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB } from '@robywire/gate';
import { beatBlurb, beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB, PUBLICATION_NAME } from '@robywire/gate';
import { beatBlurb, beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

```

**In `site/test/format.test.ts`, replace:**
```ts

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

**with:**
```ts

describe('documentTitle', () => {
  it('adds the name of the publication after a dash', () => {
    expect(documentTitle('Humanoids')).toBe(`Humanoids ${EM_DASH} Agentic Media House`);
  });

  it('leaves a title that already names the publication as it is', () => {
    expect(documentTitle('Agentic Media House')).toBe('Agentic Media House');
    expect(documentTitle('Agentic Media House: daily robotics news')).toBe('Agentic Media House: daily robotics news');
  });

  it('adds nothing but a dash and the name, so the room that a page name has in a title is known', () => {
    const page = 'x'.repeat(10);
    expect(documentTitle(page).length).toBe(page.length + ' - '.length + PUBLICATION_NAME.length);
  });

  it('adds the name to a title that has the old one in it, because the old one is not the name', () => {
    expect(documentTitle('Robywire')).toBe(`Robywire ${EM_DASH} Agentic Media House`); // the old name, on purpose
  });

});
```

The feed, the structured data, the card and the small site that other tests build pages from.

**In `site/test/feed.test.ts`, replace:**
```ts
    const { rss } = parse(xml);
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.link).toBe('https://agenticmediahouse.example/');
    expect(rss.channel.language).toBe('en');
```

**with:**
```ts
    const { rss } = parse(xml);
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Agentic Media House');
    expect(rss.channel.link).toBe('https://agenticmediahouse.example/');
    expect(rss.channel.language).toBe('en');
```

**In `site/test/feed.test.ts`, replace:**
```ts
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.item).toBeUndefined();
  });
```

**with:**
```ts
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss.channel.title).toBe('Agentic Media House');
    expect(rss.channel.item).toBeUndefined();
  });
```

**In `site/test/jsonld.test.ts`, replace:**
```ts
  });

  it('names the Desk as the author and Robywire as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: DESK_AUTHOR_NAME });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Robywire', url: SITE });
  });

```

**with:**
```ts
  });

  it('names the Desk as the author and Agentic Media House as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: DESK_AUTHOR_NAME });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Agentic Media House', url: SITE });
  });

```

**In `site/test/card.test.ts`, replace:**
```ts

  it('carries the wordmark and the title, wrapped over at most three lines', () => {
    expect(textsWithRole(svg, 'wordmark')).toEqual(['ROBYWIRE']);
    const title = textsWithRole(svg, 'title');
    expect(title.length).toBeGreaterThanOrEqual(2);
```

**with:**
```ts

  it('carries the wordmark and the title, wrapped over at most three lines', () => {
    expect(textsWithRole(svg, 'wordmark')).toEqual(['AGENTIC MEDIA HOUSE']);
    const title = textsWithRole(svg, 'title');
    expect(title.length).toBeGreaterThanOrEqual(2);
```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('would notice a text that runs off the card', () => {
    const wide = renderCardSvg(GOLDEN).replace('>funding round<', `>${'funding round '.repeat(20)}<`);
```

**with:**
```ts
  });

  it('keeps the wordmark in the left half of the card, so that the title and the figures stay the loudest things on it', () => {
    for (const svg of [renderCardSvg(GOLDEN), renderInlineCardSvg(GOLDEN)]) {
      const tag = /<text data-role="wordmark" x="(\d+)" y="\d+" font-family="[^"]*" font-size="(\d+)"[^>]*letter-spacing="(\d+)"[^>]*>([^<]*)<\/text>/.exec(svg)!;
      const [x, size, spacing, content] = [Number(tag[1]), Number(tag[2]), Number(tag[3]), tag[4]!];
      expect(content).toBe('AGENTIC MEDIA HOUSE');
      expect(x + content.length * (size * 0.6 + spacing)).toBeLessThan(CARD_WIDTH / 2);
    }
  });

  it('would notice a text that runs off the card', () => {
    const wide = renderCardSvg(GOLDEN).replace('>funding round<', `>${'funding round '.repeat(20)}<`);
```

**In `site/test/support/small-site.ts`, replace:**
```ts
  'sitemap-index.xml': `<?xml version="1.0" encoding="UTF-8"?><sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`,
  'sitemap-0.xml': `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/status/</loc></url></urlset>`,
  'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Robywire</title></channel></rss>',
};

```

**with:**
```ts
  'sitemap-index.xml': `<?xml version="1.0" encoding="UTF-8"?><sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`,
  'sitemap-0.xml': `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/status/</loc></url></urlset>`,
  'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Agentic Media House</title></channel></rss>',
};

```

The copy. The four sentences of `copy.ts` that begin with the name are pinned in full, for every setting of the flags, so the test changes with them. The description of the repository is pinned too.

**In `site/test/copy.test.ts`, replace:**
```ts
describe('disclosure', () => {
  const OFF =
    'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
  const ON =
    'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
```

**with:**
```ts
describe('disclosure', () => {
  const OFF =
    'Agentic Media House will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
  const ON =
    'Agentic Media House is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
```

**In `site/test/copy.test.ts`, replace:**
```ts
describe('deskIntro', () => {
  const OFF =
    'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
  const ON =
    'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
```

**with:**
```ts
describe('deskIntro', () => {
  const OFF =
    'Agentic Media House is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
  const ON =
    'Agentic Media House is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
```

**In `site/test/copy.test.ts`, replace:**
```ts
    if (!LIVE.scheduler) expect(pkg.description).not.toMatch(/\bdaily\b/i);
    if (!LIVE.publishing) expect(pkg.description).not.toMatch(/\bwritten by\b/i);
    expect(pkg.description).toMatch(/^Robywire: /);
  });
});
```

**with:**
```ts
    if (!LIVE.scheduler) expect(pkg.description).not.toMatch(/\bdaily\b/i);
    if (!LIVE.publishing) expect(pkg.description).not.toMatch(/\bwritten by\b/i);
    expect(pkg.description).toMatch(/^Agentic Media House: /);
  });
});
```

The made-up pull request address of the holds page of the fixture build has no old name in it.

**In `site/test/fixtures.test.ts`, replace:**
```ts
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
    expect(state.holds[0]!.prUrl).toBe('https://github.example/robywire/robywire/pull/12');
    expect(state.holds[1]!.prUrl).toBeUndefined();
  });
```

**with:**
```ts
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
    expect(state.holds[0]!.prUrl).toBe('https://github.example/agentic-media-house/agentic-media-house/pull/12');
    expect(state.holds[1]!.prUrl).toBeUndefined();
  });
```

**In `site/test/desk-pages.test.ts`, replace:**
```ts
      categories: ['humanoids'],
      reasons: ['G4_NUMBER_UNSUPPORTED', 'G9_BANNED_PHRASE'],
      prUrl: 'https://github.example/robywire/robywire/pull/12',
    },
  ],
```

**with:**
```ts
      categories: ['humanoids'],
      reasons: ['G4_NUMBER_UNSUPPORTED', 'G9_BANNED_PHRASE'],
      prUrl: 'https://github.example/agentic-media-house/agentic-media-house/pull/12',
    },
  ],
```

One new file looks at the code of the site and at the files that say what the repository is. It says that the name is not written out in the code, that the old name is not in it except in the names it stays in (`@robywire/*`, `ROBYWIRE_FIXTURES`, the temporary folder of the fixture check), that each place that shows the name gets it from the constant, and that the README, the descriptions of the packages and the title of `sources.yml` say the new name. The provenance lines of `sources.yml`, which say that the list was copied from the project that was then called Robywire, are history and stay.

**Create `site/test/publication-name.test.ts`:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLICATION_NAME, PUBLICATION_WORDMARK } from '@robywire/gate';
import { describe, expect, it } from 'vitest';

// The name of the publication is written once, in the gate package. Nothing in the code of the site writes it out:
// the header, the page titles, the footer, the structured data, the feed and the fact card take it from the constants,
// so that a change of name is one edit and no page can be left with the old one. The old name survives only in the
// names of things that the code is built from (the scope @robywire/*, the variable ROBYWIRE_FIXTURES and the folder that
// the fixture check makes in the temporary folder), and those are taken out of the text before it is searched.

const SITE = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');
const CODE_FOLDERS = ['src/components', 'src/layouts', 'src/lib', 'src/pages', 'src/styles', 'scripts'];
const EM_DASH = String.fromCharCode(0x2014);

/** The text without the names that the old name is allowed to stay in. */
const withoutInternalNames = (text: string): string => text.replace(/@robywire\/[a-z]+|ROBYWIRE_FIXTURES|robywire-generated-/g, ''); // the names that it stays in, on purpose
const OLD_NAME = /robywire/i;
/** The lines of sources.yml that say where the list was copied from, which keep the name that the project had then. */
const PROVENANCE = /^# Provenance:|^# the robywire-astro project|per the Robywire docs/; // history, on purpose

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  );
}

const sources = CODE_FOLDERS.flatMap((folder) => filesIn(path.join(SITE, folder)))
  .filter((file) => /\.(astro|ts|mjs|css)$/.test(file))
  .map((file) => ({ name: path.relative(SITE, file), text: readFileSync(file, 'utf8') }));
const textOf = (name: string): string => sources.find((source) => source.name === name)?.text ?? '';

describe('the code of the site', () => {
  it('looks at the pages, the components, the lib and the scripts, so the search is not made of nothing', () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain(path.join('src', 'components', 'Header.astro'));
    expect(names).toContain(path.join('src', 'lib', 'card.ts'));
    expect(names).toContain(path.join('scripts', 'generate-fixtures.ts'));
    expect(sources.length).toBeGreaterThan(40);
  });

  it('does not write the name of the publication out: it takes it from the gate', () => {
    const offenders = sources.filter(({ text }) => /agentic\s+media\s+house/i.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('does not carry the old name, except in the names that it stays in', () => {
    const offenders = sources.filter(({ text }) => OLD_NAME.test(withoutInternalNames(text))).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['src/components/Header.astro', 'PUBLICATION_WORDMARK'],
    ['src/lib/card.ts', 'PUBLICATION_WORDMARK'],
    ['src/layouts/Base.astro', 'PUBLICATION_NAME'],
    ['src/pages/index.astro', 'PUBLICATION_NAME'],
    ['src/pages/method/index.astro', 'PUBLICATION_NAME'],
    ['src/lib/format.ts', 'PUBLICATION_NAME'],
    ['src/lib/feed.ts', 'PUBLICATION_NAME'],
    ['src/lib/jsonld.ts', 'PUBLICATION_NAME'],
    ['src/lib/copy.ts', 'PUBLICATION_NAME'],
  ])('shows the name through the constant: %s uses %s', (file, constant) => {
    expect(textOf(path.join(...file.split('/')))).toContain(constant);
  });

  it('has the name of the publication twice in the head of every page: the share name and the title of the feed link', () => {
    const base = textOf(path.join('src', 'layouts', 'Base.astro'));
    expect(base).toContain('property="og:site_name" content={PUBLICATION_NAME}');
    expect(base).toContain('type="application/rss+xml" title={PUBLICATION_NAME}');
  });
});

describe('the files that say what the repository is', () => {
  it('has the name of the publication as the title of the README and in its first sentence', () => {
    const readme = read('README.md');
    expect(readme.startsWith(`# ${PUBLICATION_NAME}\n`)).toBe(true);
    expect(readme).toContain(`${PUBLICATION_NAME} is a robotics news site`);
  });

  it('has no old name in the README, except in the names that it stays in', () => {
    expect(withoutInternalNames(read('README.md'))).not.toMatch(OLD_NAME);
  });

  it.each(['package.json', 'site/package.json', 'desk/package.json'])('names the publication in the description of %s, and not the old name', (file) => {
    const { description } = JSON.parse(read(file)) as { description: string };
    expect(description).toContain(PUBLICATION_NAME);
    expect(withoutInternalNames(description)).not.toMatch(OLD_NAME);
  });

  it('puts the name of the publication in the title of the source registry, and keeps the old project name where it says where the list came from', () => {
    const registry = read('sources.yml');
    expect(registry).toContain(`# ${PUBLICATION_NAME} ${EM_DASH} source list for the daily desk`);
    const outside = registry.split('\n').filter((line) => !PROVENANCE.test(line));
    expect(outside.join('\n')).not.toMatch(OLD_NAME);
  });
});

describe('the wordmark', () => {
  it('is the name in capitals', () => {
    expect(PUBLICATION_WORDMARK).toBe(PUBLICATION_NAME.toUpperCase());
  });
});
```

The old name is still in a few tests, on purpose: a test that refuses it, a test that looks for it. The census of Task 1 tells those from the rest by a marker, the words "on purpose" on the same line. The one place in the gate's tests that has not got it yet is the list of names that G1 must refuse.

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
    ' Agentic Media House Desk',
    'Agentic Media House Desk.',
    'Robywire Desk',
  ])(
    'fails for the author name %j, and says what it must be',
```

**with:**
```ts
    ' Agentic Media House Desk',
    'Agentic Media House Desk.',
    'Robywire Desk', // the old name, on purpose
  ])(
    'fails for the author name %j, and says what it must be',
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/site`
Expected: FAIL — `FAIL  test/publication-name.test.ts` and `FAIL  test/copy.test.ts` and `expected 'Robywire' to be 'Agentic Media House'` and `expected [ 'ROBYWIRE' ] to deeply equal [ 'AGENTIC MEDIA HOUSE' ]`

- [ ] **Step 3: Build the strings from the constants**

The title and the feed. `SITE_NAME` is removed: nothing but `documentTitle` and the feed used it.

**In `site/src/lib/format.ts`, replace:**
```ts
import type { Category } from '@robywire/gate';

```

**with:**
```ts
import { PUBLICATION_NAME } from '@robywire/gate';
import type { Category } from '@robywire/gate';

```

**In `site/src/lib/format.ts`, replace:**
```ts
// through the machine's time zone, so a build gives the same page anywhere.

export const SITE_NAME = 'Robywire';

// Written as a code so that this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);
```

**with:**
```ts
// through the machine's time zone, so a build gives the same page anywhere.

// Written as a code so that this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);
```

**In `site/src/lib/format.ts`, replace:**
```ts
}

/** The text of the <title> element: the page name, then the site name, unless the page name already has it. */
export function documentTitle(page: string): string {
  return page.includes(SITE_NAME) ? page : `${page} ${EM_DASH} ${SITE_NAME}`;
}
```

**with:**
```ts
}

/** The text of the <title> element: the page name, then the name of the publication, unless the page name already has it. */
export function documentTitle(page: string): string {
  return page.includes(PUBLICATION_NAME) ? page : `${page} ${EM_DASH} ${PUBLICATION_NAME}`;
}
```

**In `site/src/lib/feed.ts`, replace:**
```ts
import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { siteDescription } from './copy';
import { SITE_NAME, beatLabel } from './format';
import { articlePath } from './paths';

```

**with:**
```ts
import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { PUBLICATION_NAME } from '@robywire/gate';
import { siteDescription } from './copy';
import { beatLabel } from './format';
import { articlePath } from './paths';

```

**In `site/src/lib/feed.ts`, replace:**
```ts
export function feedOptions(pieces: readonly FeedPiece[], site: URL | string): RSSOptions {
  return {
    title: SITE_NAME,
    description: siteDescription(),
    site,
```

**with:**
```ts
export function feedOptions(pieces: readonly FeedPiece[], site: URL | string): RSSOptions {
  return {
    title: PUBLICATION_NAME,
    description: siteDescription(),
    site,
```

The structured data and the fact card.

**In `site/src/lib/jsonld.ts`, replace:**
```ts
import { DESK_AUTHOR_NAME } from '@robywire/gate';
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';
```

**with:**
```ts
import { DESK_AUTHOR_NAME, PUBLICATION_NAME } from '@robywire/gate';
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';
```

**In `site/src/lib/jsonld.ts`, replace:**
```ts
    dateModified: piece.updatedAt ?? latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
    image: absolute(cardPath(piece.slug)),
```

**with:**
```ts
    dateModified: piece.updatedAt ?? latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: PUBLICATION_NAME, url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
    image: absolute(cardPath(piece.slug)),
```

**In `site/src/lib/card.ts`, replace:**
```ts
import type { Basis, LedgerEntry } from '@robywire/gate';
import { plural } from './format';
```

**with:**
```ts
import { PUBLICATION_WORDMARK } from '@robywire/gate';
import type { Basis, LedgerEntry } from '@robywire/gate';
import { plural } from './format';
```

**In `site/src/lib/card.ts`, replace:**
```ts
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${background}"/>`,
    `<rect x="24.5" y="24.5" width="${CARD_WIDTH - 49}" height="${CARD_HEIGHT - 49}" fill="none" stroke="${frame}" stroke-width="1"/>`,
    text('wordmark', LEFT, 100, 26, 600, ink, 'ROBYWIRE', ' letter-spacing="6"'),
  ];

```

**with:**
```ts
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${background}"/>`,
    `<rect x="24.5" y="24.5" width="${CARD_WIDTH - 49}" height="${CARD_HEIGHT - 49}" fill="none" stroke="${frame}" stroke-width="1"/>`,
    text('wordmark', LEFT, 100, 26, 600, ink, PUBLICATION_WORDMARK, ' letter-spacing="6"'),
  ];

```

The copy: each of the four sentences becomes a template literal with the name in it.

**In `site/src/lib/copy.ts`, replace:**
```ts
import { LIVE } from './live';
import type { Live } from './live';
```

**with:**
```ts
import { PUBLICATION_NAME } from '@robywire/gate';
import { LIVE } from './live';
import type { Live } from './live';
```

**In `site/src/lib/copy.ts`, replace:**
```ts
export function disclosure(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.'
    : 'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
}

```

**with:**
```ts
export function disclosure(live: Live = LIVE): string {
  return live.publishing
    ? `${PUBLICATION_NAME} is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.`
    : `${PUBLICATION_NAME} will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.`;
}

```

**In `site/src/lib/copy.ts`, replace:**
```ts
export function deskIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.'
    : 'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
}

```

**with:**
```ts
export function deskIntro(live: Live = LIVE): string {
  return live.publishing
    ? `${PUBLICATION_NAME} is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.`
    : `${PUBLICATION_NAME} is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.`;
}

```

The header, the head of every page, the home page and the description of the method page.

**In `site/src/components/Header.astro`, replace:**
```astro
---
import { NAV_ITEMS, isCurrent } from '../lib/nav';

```

**with:**
```astro
---
import { PUBLICATION_WORDMARK } from '@robywire/gate';
import { NAV_ITEMS, isCurrent } from '../lib/nav';

```

**In `site/src/components/Header.astro`, replace:**
```astro
<header class="site-header">
  <div class="container site-header__inner">
    <a class="wordmark" href="/">Robywire</a>
    <nav aria-label="Beats">
      <ul class="nav">
```

**with:**
```astro
<header class="site-header">
  <div class="container site-header__inner">
    <a class="wordmark" href="/">{PUBLICATION_WORDMARK}</a>
    <nav aria-label="Beats">
      <ul class="nav">
```

**In `site/src/layouts/Base.astro`, replace:**
```astro
---
import '../styles/tokens.css';
import '../styles/global.css';
```

**with:**
```astro
---
import { PUBLICATION_NAME } from '@robywire/gate';
import '../styles/tokens.css';
import '../styles/global.css';
```

**In `site/src/layouts/Base.astro`, replace:**
```astro
    <!-- An empty icon, so that browsers do not ask for /favicon.ico. -->
    <link rel="icon" href="data:," />
    <link rel="alternate" type="application/rss+xml" title="Robywire" href="/rss.xml" />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:site_name" content="Robywire" />
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={fullTitle} />
```

**with:**
```astro
    <!-- An empty icon, so that browsers do not ask for /favicon.ico. -->
    <link rel="icon" href="data:," />
    <link rel="alternate" type="application/rss+xml" title={PUBLICATION_NAME} href="/rss.xml" />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:site_name" content={PUBLICATION_NAME} />
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={fullTitle} />
```

**In `site/src/pages/index.astro`, replace:**
```astro
---
import BeatChips from '../components/BeatChips.astro';
import LedgerStrip from '../components/LedgerStrip.astro';
```

**with:**
```astro
---
import { PUBLICATION_NAME } from '@robywire/gate';
import BeatChips from '../components/BeatChips.astro';
import LedgerStrip from '../components/LedgerStrip.astro';
```

**In `site/src/pages/index.astro`, replace:**
```astro
---

<Base title="Robywire" description={siteDescription()} canonicalPath="/">
  <div class="container">
    <h1 class="home-title">Robotics news with a receipt for every claim.</h1>
```

**with:**
```astro
---

<Base title={PUBLICATION_NAME} description={siteDescription()} canonicalPath="/">
  <div class="container">
    <h1 class="home-title">Robotics news with a receipt for every claim.</h1>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
---
import board from '@robywire/evals/scoreboard';
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
```

**with:**
```astro
---
import board from '@robywire/evals/scoreboard';
import { PUBLICATION_NAME } from '@robywire/gate';
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
<Base
  title="Method"
  description="How Robywire is made: the two kinds of source, the claim ledger, the nine rules of the gate and their known limits, what the Desk never does, and the scoreboard of defects the gate was tested against."
  canonicalPath="/method/"
>
```

**with:**
```astro
<Base
  title="Method"
  description={`How ${PUBLICATION_NAME} is made: the two kinds of source, the claim ledger, the nine rules of the gate and their known limits, what the Desk never does, and the scoreboard of defects the gate was tested against.`}
  canonicalPath="/method/"
>
```

The made-up pull request address that the fixture generator writes into the desk state.

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
        categories: ['humanoids'],
        reasons: ['G4_NUMBER_UNSUPPORTED'],
        prUrl: 'https://github.example/robywire/robywire/pull/12',
      },
      { at: '2026-09-29T04:36:40Z', categories: ['policy-standards', 'funding'], reasons: ['TIER2_ATTRIBUTION'] },
```

**with:**
```ts
        categories: ['humanoids'],
        reasons: ['G4_NUMBER_UNSUPPORTED'],
        prUrl: 'https://github.example/agentic-media-house/agentic-media-house/pull/12',
      },
      { at: '2026-09-29T04:36:40Z', categories: ['policy-standards', 'funding'], reasons: ['TIER2_ATTRIBUTION'] },
```

The README says what the repository is, in the new name: its title, its first sentence and the one place that names the host of the default user agent.

**In `README.md`, replace:**
```markdown
# Robywire

Robywire is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer, the site and the Desk itself. The Desk is built and tested offline, with scripted models; it has not yet run against live sources or a live model, and nothing it writes has been published (see Which parts are live and The desk workspace).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**with:**
```markdown
# Agentic Media House

Agentic Media House is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer, the site and the Desk itself. The Desk is built and tested offline, with scripted models; it has not yet run against live sources or a live model, and nothing it writes has been published (see Which parts are live and The desk workspace).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**In `README.md`, replace:**
```markdown
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to robywire.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.
```

**with:**
```markdown
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.
```

The descriptions of the packages, and the title of the source registry.

**In `package.json`, replace:**
```json
  "private": true,
  "type": "module",
  "description": "Robywire: a robotics news site built so that every factual sentence traces to a primary source, with a code gate that checks it and the Desk, the pipeline that will write it.",
  "engines": {
    "node": ">=22"
```

**with:**
```json
  "private": true,
  "type": "module",
  "description": "Agentic Media House: a robotics news site built so that every factual sentence traces to a primary source, with a code gate that checks it and the Desk, the pipeline that will write it.",
  "engines": {
    "node": ">=22"
```

**In `site/package.json`, replace:**
```json
  "private": true,
  "type": "module",
  "description": "The Robywire site: static Astro pages built from src/content, or from src/content-fixtures when ROBYWIRE_FIXTURES=1.",
  "scripts": {
    "dev": "astro dev",
```

**with:**
```json
  "private": true,
  "type": "module",
  "description": "The Agentic Media House site: static Astro pages built from src/content, or from src/content-fixtures when ROBYWIRE_FIXTURES=1.",
  "scripts": {
    "dev": "astro dev",
```

**In `desk/package.json`, replace:**
```json
  "private": true,
  "type": "module",
  "description": "The Desk: the pipeline that will write Robywire, built and tested offline.",
  "exports": {
    ".": "./src/index.ts"
```

**with:**
```json
  "private": true,
  "type": "module",
  "description": "The Desk: the pipeline that will write Agentic Media House, built and tested offline.",
  "exports": {
    ".": "./src/index.ts"
```

**In `sources.yml`, replace:**
```yaml
#   n/a        = no fixed URL (the entry says where to look instead)
#
# Robywire — source list for the daily desk
#
# Two tiers, and the distinction is the whole editorial model:
```

**with:**
```yaml
#   n/a        = no fixed URL (the entry says where to look instead)
#
# Agentic Media House — source list for the daily desk
#
# Two tiers, and the distinction is the whole editorial model:
```

- [ ] **Step 4: Regenerate the fixtures**

The desk state of the fixtures has a pull request address in it, so it is out of date.

Run: `npm run fixtures:check`
Expected: FAIL — `Fixtures are out of date`

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 11 fixture files`

Run: `git status --short -- site/src/content-fixtures`
Expected: PASS — `site/src/content-fixtures/desk-state.json`

- [ ] **Step 5: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/site -- test/publication-name.test.ts test/copy.test.ts test/format.test.ts test/feed.test.ts test/jsonld.test.ts test/card.test.ts`
Expected: PASS — `Test Files  6 passed (6)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Build the fixture site and read what a reader reads**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

The home page has the name as its title, as its share name and as its wordmark; no file of the build has the old name; the feed and the card have the new one.

Run: `grep -o '<title>[^<]*</title>' site/dist/index.html`
Expected: PASS — `<title>Agentic Media House</title>`

Run: `grep -o 'og:site_name" content="[^"]*"' site/dist/index.html`
Expected: PASS — `og:site_name" content="Agentic Media House"`

Run: `grep -o 'class="wordmark" href="/">[^<]*' site/dist/index.html`
Expected: PASS — `AGENTIC MEDIA HOUSE`

Run: `grep -o '<title>[^<]*</title>' site/dist/rss.xml`
Expected: PASS — `<title>Agentic Media House</title>`

Run: `grep -o '"publisher":{[^}]*}' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: PASS — `"name":"Agentic Media House"`

Run: `grep -o '<text data-role="wordmark"[^>]*>[^<]*' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/card.svg`
Expected: PASS — `>AGENTIC MEDIA HOUSE`

Run: `grep -rIli robywire site/dist`
Expected: prints nothing

- [ ] **Step 7: Check the header at 375 pixels, and the length of the titles**

This script is a throwaway, like the census: it is run from the root of the repository, uses the Chrome that Lighthouse uses, and writes nothing. It opens every page of `site/dist` on a screen 375 pixels wide and says how far anything runs past the right edge, and whether the wordmark stays on one line.

```bash
node --input-type=module <<'EOF'
// Open every page of site/dist in headless Chrome on a screen 375 pixels wide, and say whether anything runs past the right edge.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { launch } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';
import { chromeFlags } from './site/scripts/lighthouse-lib.mjs';
import { serve } from './site/scripts/serve-dist.mjs';

const dist = path.resolve('site/dist');
const routes = (dir, prefix = '') =>
  readdirSync(path.join(dir, prefix)).flatMap((name) => {
    const file = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(path.join(dir, file)).isDirectory()) return routes(dir, file);
    return file.endsWith('.html') ? [file.endsWith('index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`] : [];
  });

const server = await serve(dist);
const chrome = await launch({ chromeFlags: chromeFlags(process.env) });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1, isMobile: true });
  let widest = 0;
  let oneLine = true;
  const all = routes(dist).sort();
  for (const route of all) {
    await page.goto(new URL(route, server.url).href, { waitUntil: 'load' });
    const found = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lines: document.querySelector('.wordmark')?.getClientRects().length ?? 0,
    }));
    widest = Math.max(widest, found.overflow);
    if (found.lines !== 1) oneLine = false;
  }
  console.log(`pages measured: ${all.length}`);
  console.log(`widest overflow at 375 px: ${widest} px`);
  console.log(`wordmark on one line on every page: ${oneLine ? 'yes' : 'no'}`);
} finally {
  await browser.disconnect();
  chrome.kill();
  await server.close();
}
EOF
```

Expected: PASS — `widest overflow at 375 px: 0 px` and `wordmark on one line on every page: yes`

Then the length of every title:

```bash
node --input-type=module <<'EOF'
// The length of the <title> of every page in site/dist, the longest first.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? walk(path.join(dir, name)) : [path.join(dir, name)]));
const titles = walk('site/dist')
  .filter((file) => file.endsWith('.html'))
  .map((file) => [path.relative('site/dist', file), /<title>([^<]*)<\/title>/.exec(readFileSync(file, 'utf8'))?.[1] ?? '']);
titles.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
for (const [file, title] of titles.slice(0, 3)) console.log(`${String(title.length).padStart(3)} characters  ${file}`);
console.log(`pages: ${titles.length}, longest title: ${titles[0][1].length} characters, shortest: ${titles.at(-1)[1].length} characters`);
EOF
```

Expected: PASS — `longest title: 95 characters` and `shortest: 19 characters`

- [ ] **Step 8: Audit the fixture build, measure it with Lighthouse, and audit the production build**

Run: `npm run audit`
Expected: PASS — `Passed: 16 checks.`

Run: `npm run lighthouse`
Expected: PASS — `All scores are 95 or more.`

Run: `npm run build`
Expected: PASS — `Complete!`

Run: `npm run audit:prod`
Expected: PASS — `Passed: 17 checks.`

Run: `grep -rIli robywire site/dist`
Expected: prints nothing

- [ ] **Step 9: Count again**

Every occurrence of the old name that is left is internal. The count is run again on the repository as it is now.

Run: `node "${TMPDIR:-/tmp}/name-census.mjs" | grep '^READER-FACING'`
Expected: PASS — `READER-FACING    0 files    0 occurrences  TOTAL`

Run: `node "${TMPDIR:-/tmp}/name-census.mjs" | grep '^INTERNAL'`
Expected: PASS — `the npm scope @robywire/*` and `the environment variable ROBYWIRE_FIXTURES` and `a search for the old name in a test, to prove that it is gone` and `the old name given on purpose to a test, as input that a check or a rule must refuse`

- [ ] **Step 10: Commit**

```bash
git add README.md desk/package.json gate/test/g1-frontmatter.test.ts package.json site/package.json site/scripts/generate-fixtures.ts site/src/components/Header.astro site/src/content-fixtures/desk-state.json site/src/layouts/Base.astro site/src/lib/card.ts site/src/lib/copy.ts site/src/lib/feed.ts site/src/lib/format.ts site/src/lib/jsonld.ts site/src/pages/index.astro site/src/pages/method/index.astro site/test/card.test.ts site/test/copy.test.ts site/test/desk-pages.test.ts site/test/feed.test.ts site/test/fixtures.test.ts site/test/format.test.ts site/test/jsonld.test.ts site/test/support/small-site.ts site/test/publication-name.test.ts sources.yml
git commit -m "feat(site): the site says Agentic Media House: the wordmark of the header and the fact card, the titles, the footer, the method page, the structured data, the feed, the README and the descriptions of the packages are built from the constants, and the fixture pull request address carries no old name" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The audit refuses the old name

**Files:**
- Modify: `site/scripts/audit/checks-files.mjs` (new `checkNoOldName`, the check A18), `site/scripts/audit/checks.mjs` (A18 joins the list)
- Modify: `README.md` (the line about the audit)
- Test: `site/test/audit.test.ts`, `site/test/audit-run.test.ts`, `site/test/audit-cli.test.ts`, `site/test/verify.test.ts`, `site/test/publication-name.test.ts`

Task 2 changed every string that the code builds, and the tests that read the code say so. But a test of the code cannot see what a build contains: a template that an author edits, a file that a library copies into the page, a string that comes from data. The audit reads the built site, so it is where the old name must be refused. A18 reads every text file of `site/dist` (pages, feeds, sitemaps, the SVG cards, robots.txt, style sheets and scripts) and every file name, and fails for any file that has the letters r-o-b-y-w-i-r-e in any case. It runs on every build, the fixture build and the production build, so it is not marked `prodOnly`.

The check is strict on purpose. The names that the old name stays in (the npm scope `@robywire/*`, the variable `ROBYWIRE_FIXTURES`, the folders that tests make) are internal, and none of them is ever written into a page: the build reads `ROBYWIRE_FIXTURES` when it runs and writes nothing about it, and the packages are imported, not shown. So the check has no list of allowed names. If a build ever has one of them in it, something has leaked, and the check says so. That claim is not argued here; it is proved in Steps 5 and 7 by running the real audit on both real builds, which pass. The pure function is tested with snippets it must accept and snippets it must reject, as every check of the audit is, and Steps 6 and 8 prove that it can fail on a real build by putting the old name back into a built file.

What a problem looks like: the file, and the twenty characters on each side of the first place where the name is, on one line, so that a person can tell where the name comes from, as in `index.html: contains the old name, in "ial-scale=1"><title>Robywire</title><meta name=""`. A file that has it ten times is named once. A file that is named after it (a folder `news/robywire/`, a card `robywire.png`) is named too, whatever its text.

- [ ] **Step 1: Write the tests**

The tests of the function. The old name is written in one place of the file, `OLD`, and the line says that it is there on purpose, which is how the census of Task 1 knows that this occurrence is a test of a rule and not a string of the site.

**In `site/test/audit.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkNoOldName, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
```

**In `site/test/audit.test.ts`, replace:**
```ts
});

describe('A14 checkXmlWellFormed', () => {
  it('accepts a feed, a sitemap and a card that are well-formed', () => {
```

**with:**
```ts
});

describe('A18 checkNoOldName', () => {
  // The old name of the publication is written here and nowhere else in this file: the check must refuse it in any case.
  const OLD = 'Robywire'; // the old name, on purpose
  const ODD = 'rObYwIrE'; // the old name in odd capitals, on purpose

  it('accepts a build that says the new name everywhere', () => {
    const files = {
      'index.html': page('<h1>Agentic Media House</h1>'),
      'rss.xml': '<rss><channel><title>Agentic Media House</title></channel></rss>',
      'robots.txt': 'User-agent: *\nAllow: /\n',
      'n/card.svg': '<svg><text>AGENTIC MEDIA HOUSE</text></svg>',
      '_astro/a.css': 'a{margin:0}',
    };
    expect(checkNoOldName(site(files, ['n/card.png']))).toEqual(ok('A18'));
  });

  it.each([OLD, OLD.toUpperCase(), OLD.toLowerCase(), ODD])('rejects the old name written as %s', (name) => {
    expect(checkNoOldName(site({ 'rss.xml': `<title>${name}</title>` }))).toEqual({
      id: 'A18',
      ok: false,
      problems: [`rss.xml: contains the old name, in "<title>${name}</title>"`],
    });
  });

  it('rejects it in a page, a feed, a sitemap, a card, a robots file and a stylesheet, and lists the files in order', () => {
    const files = {
      'index.html': page(`<h1>${OLD}</h1>`),
      'rss.xml': `<title>${OLD}</title>`,
      'sitemap-0.xml': `<loc>https://${OLD.toLowerCase()}.example/</loc>`,
      'n/card.svg': `<text>${OLD.toUpperCase()}</text>`,
      'robots.txt': `# ${OLD}\nUser-agent: *\n`,
      '_astro/a.css': `/* ${OLD} */`,
    };
    expect(checkNoOldName(site(files)).problems.map((problem) => problem.split(': ')[0])).toEqual([
      '_astro/a.css',
      'index.html',
      'n/card.svg',
      'robots.txt',
      'rss.xml',
      'sitemap-0.xml',
    ]);
  });

  it('rejects a file that is named after the old name, even when its text is clean', () => {
    const problems = checkNoOldName(site({ 'index.html': page('<h1>x</h1>') }, [`news/${OLD.toLowerCase()}/card.png`])).problems;
    expect(problems).toEqual([`news/${OLD.toLowerCase()}/card.png: is named after the old name`]);
  });

  it('says what stands around the name, twenty characters before it and twenty after it, and says each file once', () => {
    const dots = '.'.repeat(30);
    const problems = checkNoOldName(site({ 'a.txt': `${dots}${OLD}${dots} ${OLD}` })).problems;
    expect(problems).toEqual([`a.txt: contains the old name, in "${'.'.repeat(20)}${OLD}${'.'.repeat(20)}"`]);
  });

  it('shows the text on one line, however many lines it was on', () => {
    expect(checkNoOldName(site({ 'a.txt': `one\n  two ${OLD}\n\nthree` })).problems).toEqual([`a.txt: contains the old name, in "one two ${OLD} three"`]);
  });

  it('shows the name without the spaces that would stand at the edge of what is shown', () => {
    expect(checkNoOldName(site({ 'a.txt': `  \n ${OLD} \n  ` })).problems).toEqual([`a.txt: contains the old name, in "${OLD}"`]);
  });

  it('is strict: the names that the old name stays in (the npm scope, the variable of the fixtures) are not allowed in a build either', () => {
    const files = { 'a.txt': 'import x from "@robywire/gate"', 'b.txt': 'ROBYWIRE_FIXTURES=1' };
    expect(checkNoOldName(site(files)).problems).toHaveLength(2);
  });

  it('looks only at the name of a file that is not text', () => {
    expect(checkNoOldName(site({ 'index.html': page('<h1>x</h1>') }, ['n/card.png', 'x/font.woff2']))).toEqual(ok('A18'));
  });
});

describe('A14 checkXmlWellFormed', () => {
  it('accepts a feed, a sitemap and a card that are well-formed', () => {
```

The audit has eighteen checks now, A13 alone is for the production build, and the small site that the tests of the command line build passes all but A13. A feed with the old name in it fails A18 and nothing else, in a fixture build and in a production build, and the command line exits 1 and names the file.

**In `site/test/audit-run.test.ts`, replace:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A17 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 17 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**with:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A18 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 18 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**In `site/test/audit-run.test.ts`, replace:**
```ts
  });

  it('fails the checks that the breakage belongs to, and only those', () => {
    const changes = {
```

**with:**
```ts
  });

  it('fails A18 and nothing else when the old name of the publication is in a feed, in a fixture build and in a production build', () => {
    const changes = { 'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Robywire</title></channel></rss>' }; // the old name, on purpose
    expect(failed(run(changes))).toEqual(['A18']);
    expect(failed(run(changes, true))).toEqual(['A18']);
  });

  it('fails the checks that the breakage belongs to, and only those', () => {
    const changes = {
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 16 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**with:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 17 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 17 checks.');
  });

```

**with:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 18 checks.');
  });

```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 16 checks.');
  });

```

**with:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 17 checks.');
  });

  it('exits 1 and names the file when the old name of the publication is in the build, with or without --prod', () => {
    const dir = build({ 'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Robywire</title></channel></rss>' }); // the old name, on purpose
    for (const args of [['--dir', dir], ['--prod', '--dir', dir]]) {
      const { code, output } = audit(args);
      expect(code).toBe(1);
      expect(output).toContain('FAIL  A18');
      expect(output).toContain('- rss.xml: contains the old name, in ');
    }
  });

```

The README names the checks that run on every build. The scan of the site's code for the old name (`publication-name.test.ts`) excepts the check that looks for it.

**In `site/test/verify.test.ts`, replace:**
```ts
  });

  it('names the Node version Lighthouse needs, and the fixture flag', () => {
    expect(readme).toContain('22.19');
```

**with:**
```ts
  });

  it('lists the checks of the audit that run on every build: A1 to A12 and A14 to A18', () => {
    expect(readme).toContain('Run the checks A1 to A12 and A14 to A18 on `site/dist`');
  });

  it('names the Node version Lighthouse needs, and the fixture flag', () => {
    expect(readme).toContain('22.19');
```

**In `site/test/publication-name.test.ts`, replace:**
```ts
  });

  it('does not carry the old name, except in the names that it stays in', () => {
    const offenders = sources.filter(({ text }) => OLD_NAME.test(withoutInternalNames(text))).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
```

**with:**
```ts
  });

  it('does not carry the old name, except in the names that it stays in and in the check of the audit that looks for it', () => {
    const offenders = sources
      .filter(({ name }) => name !== path.join('scripts', 'audit', 'checks-files.mjs'))
      .filter(({ text }) => OLD_NAME.test(withoutInternalNames(text)))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts test/verify.test.ts`
Expected: FAIL — `checkNoOldName is not a function` and `Passed: 18 checks.` and `Passed: 17 checks.` and `expected [] to deeply equal [ 'A18' ]`

- [ ] **Step 3: Write the check**

The function reads the model of the site that every check reads (`site.paths` is every file, `site.files` the text of the text files), so it needs nothing that the other checks do not.

**In `site/scripts/audit/checks-files.mjs`, replace:**
```js

// The checks about the files of the build as a whole: no fixture content in a
// production build, XML that is well-formed, and the files that crawlers and
// feed readers look for. Every check takes the model of the site (see site.mjs)
// and returns { id, ok, problems }.

/** What gives away fixture content: the ribbon, the fictional company, and the slug of its pieces. */
```

**with:**
```js

// The checks about the files of the build as a whole: no fixture content in a
// production build, no trace of the old name of the publication, XML that is
// well-formed, and the files that crawlers and feed readers look for. Every
// check takes the model of the site (see site.mjs) and returns { id, ok, problems }.

/** What gives away fixture content: the ribbon, the fictional company, and the slug of its pieces. */
```

**In `site/scripts/audit/checks-files.mjs`, replace:**
```js
}

/**
 * A14: every XML file (the feed, the sitemaps, the SVG cards) is well-formed.
```

**with:**
```js
}

/** The old name of the publication, in any case. It is the name of things that the code is built from, and of no page, feed or card. */
const OLD_NAME = /robywire/i;

/**
 * What stands around the first place where `text` has the old name: twenty characters before it and twenty after it, on one line.
 * @param {string} text
 * @returns {string}
 */
function around(text) {
  const found = /** @type {RegExpExecArray} */ (OLD_NAME.exec(text));
  return text
    .slice(Math.max(0, found.index - 20), found.index + found[0].length + 20)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A18: the old name of the publication is nowhere in the build: no page, feed, sitemap, card, stylesheet or robots file has it, in any case,
 * and no file is named after it. This holds for the production build and for the fixture build. The check is strict: the names that the old
 * name stays in (the npm scope @robywire/*, the variable ROBYWIRE_FIXTURES, the folders that tests make) are never written into a build
 * either, so a build that has one of them is a build that has leaked something, and the check says so.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoOldName(site) {
  /** @type {string[]} */
  const problems = [];
  for (const file of [...site.paths].sort()) {
    if (OLD_NAME.test(file)) problems.push(`${file}: is named after the old name`);
    const text = site.files.get(file);
    if (text !== undefined && OLD_NAME.test(text)) problems.push(`${file}: contains the old name, in "${around(text)}"`);
  }
  return result('A18', problems);
}

/**
 * A14: every XML file (the feed, the sitemaps, the SVG cards) is well-formed.
```

It joins the list. It is not `prodOnly`.

**In `site/scripts/audit/checks.mjs`, replace:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
```

**with:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkNoOldName, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
```

**In `site/scripts/audit/checks.mjs`, replace:**
```js
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
  { id: 'A17', title: 'Every article shows its fact card, a labelled figure with an inline SVG', run: checkFactCard },
];

```

**with:**
```js
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
  { id: 'A17', title: 'Every article shows its fact card, a labelled figure with an inline SVG', run: checkFactCard },
  { id: 'A18', title: 'The old name of the publication is nowhere in the build: no page, feed, sitemap, card or robots file has it, and no file is named after it', run: checkNoOldName },
];

```

The README says which checks `npm run audit` runs.

**In `README.md`, replace:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A17 on `site/dist`: HTML, links, receipts, the fact card, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
```

**with:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A18 on `site/dist`: HTML, links, receipts, the fact card, CSS rules, colours, feeds, and that the old name of the publication is nowhere in the build. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts test/verify.test.ts test/publication-name.test.ts`
Expected: PASS — `Test Files  5 passed (5)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Run the real audit on the fixture build**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Run: `npm run audit`
Expected: PASS — `ok    A18` and `Passed: 17 checks.`

- [ ] **Step 6: Prove that it can fail on the fixture build**

Put the old name back into the title of the home page of the build, and run the audit again. It must exit with 1 and name the file.

Run: `node -e "const fs=require('fs');const f='site/dist/index.html';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('<title>Agentic Media House</title>','<title>Robywire</title>'))"`
Expected: PASS — prints nothing

Run: `npm run audit`
Expected: FAIL — `FAIL  A18` and `- index.html: contains the old name, in "` and `FAILED: 1 problem in 1 of 17 checks.`

- [ ] **Step 7: Run the real audit on the production build, and prove that it can fail there**

Run: `npm run build`
Expected: PASS — `Complete!`

Run: `npm run audit:prod`
Expected: PASS — `ok    A18` and `Passed: 18 checks.`

This time the old name goes into the feed.

Run: `node -e "const fs=require('fs');const f='site/dist/rss.xml';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('<title>Agentic Media House</title>','<title>Robywire</title>'))"`
Expected: PASS — prints nothing

Run: `npm run audit:prod`
Expected: FAIL — `FAIL  A18` and `- rss.xml: contains the old name, in "` and `FAILED: 1 problem in 1 of 18 checks.`

- [ ] **Step 8: Build again, so that the build is the real one, and audit it**

The two changes of Steps 6 and 7 were made to files that a build writes, and are not in git. A new build replaces them.

Run: `npm run build:fixtures && npm run audit`
Expected: PASS — `Passed: 17 checks.`

Run: `npm run build && npm run audit:prod`
Expected: PASS — `Passed: 18 checks.`

The builds wrote nothing that git tracks in the site: the pages, the fixtures and the descriptions are as the commit of Step 10 will have them.

Run: `git status --porcelain -- site/src site/package.json`
Expected: PASS — prints nothing

- [ ] **Step 9: Count again**

The census now has one more internal kind: the check that looks for the old name.

Run: `node "${TMPDIR:-/tmp}/name-census.mjs" | grep '^READER-FACING'`
Expected: PASS — `READER-FACING    0 files    0 occurrences  TOTAL`

Run: `node "${TMPDIR:-/tmp}/name-census.mjs" | grep 'A18'`
Expected: PASS — `the check of the audit that looks for the old name (A18)`

- [ ] **Step 10: Commit**

```bash
git add README.md site/scripts/audit/checks-files.mjs site/scripts/audit/checks.mjs site/test/audit.test.ts site/test/audit-run.test.ts site/test/audit-cli.test.ts site/test/verify.test.ts site/test/publication-name.test.ts
git commit -m "feat(site): audit check A18 fails when a built page, feed, sitemap, card or robots file has the old name of the publication, in the production build and in the fixture build" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verify from a clean install, and say what kept the old name

This task changes nothing and makes no commit. Tasks 1 to 3 changed the gate, the Desk, the site, the audit and the README, so the proof of Plan 2's last task (a clean install and a whole `npm run verify`) is out of date, and this task makes it again. Then it says what still has the old name, and why.

- [ ] **Step 1: Start from nothing**

Delete every installed package, as a fresh clone would have none.

Run: `rm -rf node_modules gate/node_modules evals/node_modules site/node_modules desk/node_modules`
Expected: PASS

Run: `npm ci --no-audit --no-fund`
Expected: PASS — `added`

`npm ci` fails if `package-lock.json` and the `package.json` files disagree, so this also proves that the lock file is complete. This part installed no package and changed no version, and the lock file is not touched: the descriptions that Task 2 changed are not in it.

- [ ] **Step 2: Run every check**

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. The lines of the output that matter, in the order they appear, as they were when this part was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the repository after Task 3 and change when a test is added; the rest of the output is build and test noise:

```text
Result (101 files):
- 0 errors

Test Files  35 passed (35)
Tests  2221 passed (2221)
Test Files  6 passed (6)
Tests  253 passed (253)
Test Files  38 passed (38)
Tests  1271 passed (1271)
Test Files  60 passed (60)
Tests  2435 passed (2435)

61 of 61 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

extract: 7 claims proposed, 7 kept, 0 dropped
compose: the gate says publish (0 failures, 0 hold reasons)
verify: the model check passed
verify: round 0: the gate says publish, the model check passed
outcome: published
dry run: nothing was written to the site or to git (3 files would have been)
04-extract: equal
05-compose: equal
06-verify: equal
replay: equal
desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality

Passed: 18 checks.   (audit:prod)
Passed: 17 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

The two audit lines are the production build (`audit:prod`, 18 checks: A1 to A18) and the fixture build (`audit`, 17 checks: A13, the check for fixture content, runs on the production build only). A18, the old name, is one of both. Compared with the end of Plan 2, the audit has one more check on each build, the tests of `gate` are 4 more, those of `site` 40 more and those of `desk` 12 more, and the number of seeded defects (61) and the scores of Lighthouse (100 in every category on all five pages) are the same.

- [ ] **Step 3: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

The checks wrote no file that is not already committed: `evals/scoreboard/seeded.json` is rewritten with the same content, `site/dist` and `.astro` are ignored by git, and the demo of the Desk makes its run folder in the temporary folder and removes it.

- [ ] **Step 4: Count the old name one last time**

The census of Task 1 is run on the repository as it is after Task 3. No kind that a reader can meet is left; everything that is left is internal.

Run: `node "${TMPDIR:-/tmp}/name-census.mjs"`
Expected: PASS — `READER-FACING    0 files    0 occurrences  TOTAL` and `the npm scope @robywire/*` and `the environment variable ROBYWIRE_FIXTURES`

If the file is gone (the temporary folder was cleared), write it again with the first step of Task 1; it is not part of the repository.

```text
INTERNAL       122 files  218 occurrences  the npm scope @robywire/*
INTERNAL        11 files   20 occurrences  the environment variable ROBYWIRE_FIXTURES
INTERNAL         2 files    3 occurrences  the name of the root package, in package.json and package-lock.json
INTERNAL         1 files    3 occurrences  the old project named in the provenance comments of sources.yml
INTERNAL         8 files   14 occurrences  folder names that tests and scripts make in the temporary folder
INTERNAL         2 files    2 occurrences  a made-up pull request address in a test that builds no page
INTERNAL         4 files    4 occurrences  a search for the old name in a test, to prove that it is gone
INTERNAL         6 files   11 occurrences  the old name given on purpose to a test, as input that a check or a rule must refuse
INTERNAL         1 files    1 occurrences  the check of the audit that looks for the old name (A18)
INTERNAL       135 files  276 occurrences  TOTAL
READER-FACING    0 files    0 occurrences  TOTAL
```

- [ ] **Step 5: What kept the old name, and why**

Nothing that a reader, a feed reader, a crawler, a website operator, a screen reader or a model is shown has the old name, and the audit says so on every build (A18). What does have it:

| What | Where | Why it stays |
|---|---|---|
| The npm scope `@robywire/*` | The `name` of the four workspaces, every `@robywire/gate`, `@robywire/evals`, `@robywire/site` and `@robywire/desk` that is imported or listed as a dependency, and the lock file | It is an identifier that the tools read, not something a person is shown: the packages are private and are never published. Renaming it touches every import of the repository and the lock file, and breaks every checkout until it has run `npm ci` again. A rename is possible, and is a separate decision. |
| The environment variable `ROBYWIRE_FIXTURES` | `site/src/lib/env.ts`, the `build:fixtures` script, the README, the generator of the fixtures and their tests | It is an interface between a command and a build, and no page shows it. Changing it breaks scripts and habits for nothing a reader sees. |
| The name of the root package, `robywire` | `package.json` and `package-lock.json` | It is the name of the folder of workspaces, and appears nowhere else. |
| The prefixes of the folders that tests and scripts make in the temporary folder, such as `robywire-seeded-` | The tests of the evals and of the site, and `site/scripts/check-fixtures.ts` | They are deleted when the test ends, and no output has them. |
| The provenance comments of `sources.yml` | Three lines that say that the list was copied on 2026-10-04 from the docs of the project that was then called Robywire | It is a record of where the file came from; changing it would make the record false. The title of the file is changed. |
| A made-up pull request address in a test of the gate and one of the Desk | `gate/test/schemas.test.ts`, `desk/test/run/desk-state.test.ts` | They are values that a schema test accepts; no page and no build has them. The address that a fixture page does show was changed in Task 2. |
| The old name given on purpose to a test, and the tests that search for it | G1's list of names that it must refuse, the title test of the page, the tests of A18, the tests that look for the old name in the code | They are the proof that the old name is refused or gone; they would prove nothing without it. |
| The check A18 itself | `site/scripts/audit/checks-files.mjs` | It is the pattern that it looks for. |
| Git history | Every commit before Task 1, and the messages of the commits of Plan 1 and Plan 2 | History is not rewritten. |
| The plans and specs under `docs/` | The two design documents, and the two plans with their parts | They describe what was built at the time, under the name that it had; they are the record of the decisions, and the plans are replayed against the repository as it was. They will say Agentic Media House from the documents that come after this one. |

A later, separate decision may rename the scope, the variable and the root package. If it does, it is one task of the same kind as these: a failing test that pins the new name, a change of every occurrence, the lock file regenerated, and the same whole check.

**What is still a placeholder.** The name is decided; the domain is not. The address of the site is `https://agenticmediahouse.example` (set `SITE_URL` to build for another), the user agent of the Desk links to `https://agenticmediahouse.example/method`, and `desk run` still refuses a live run while the user agent links to a name under `.example`. The owner has to choose a domain and put its `/method` page in the user agent before the Desk goes to any website.
