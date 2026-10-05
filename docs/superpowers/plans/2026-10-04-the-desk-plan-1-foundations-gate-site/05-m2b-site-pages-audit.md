## Milestone 2 (part B) — Remaining pages, feeds, share cards, audit and Lighthouse

**Goal:** finish the site and prove it. This part adds the pages that the header and footer already link to (`/status/`, `/holds/`, `/corrections/` and `/method/`), the RSS feed, the sitemap, `robots.txt` and a 404 page, and the fact card of each piece as an SVG and a PNG share image. It then builds the audit script that checks the built site against the rules of the design and the content (fifteen checks, each tested with a page it must accept and a page it must reject), a small static server and a Lighthouse command that measures the home page, an article and a receipts page and fails below 95, and `npm run verify`, which CI runs step by step. The last task runs everything from a clean install. Nothing here calls a model or touches the network at run time.

**Starting state:** Milestones 0 and 1 and part A of Milestone 2 are finished and committed. `npm run typecheck`, `npm test`, `npm run evals:seeded`, `npm run fixtures:check`, `npm run build` and `npm run build:fixtures` pass. `site/` builds the home page, the article pages, the receipts pages and a page for every beat, from `site/src/content-fixtures/` when `ROBYWIRE_FIXTURES=1` and from the empty `site/src/content/` otherwise; the production build has 9 pages and the fixture build 17. `gate/` exports the schemas, the checks, `runGate`, `renderDraft` and the other names of Milestone 1. The layout, the header and the footer already link to `/method/`, `/status/`, `/holds/`, `/corrections/` and `/rss.xml`, and the article's structured data points at `/news/<slug>/card.png`; none of those exist yet, which is the work of this part. `evals/` exports `@robywire/evals/scoreboard`, the committed file `evals/scoreboard/seeded.json`.

**What you need to know about the site (a reminder).** A *piece* is a news article (an MDX file) with a *ledger entry* (a JSON file) that records its claims, their sources and the gate result; `site/src/lib/pieces.ts` joins them. The *desk state* (`site/src/data/desk-state.json`, or the fixture copy) is the record of the last run, the holds and the corrections. The *golden slug* of the fixtures is `fixture-robotics-ships-fx-1-to-second-plant`. Design rules, all checked by tests: one-pixel borders, square corners, no italics, no images, no web fonts, colours only from `site/src/styles/tokens.css`.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one site test file, use `npm test --workspace @robywire/site -- test/<name>.test.ts`; for the gate, `npm test --workspace @robywire/gate -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- `npm install --save-exact` writes the exact version into `package.json`. Never use ranges (`^`, `~`), and never run `npm update` or `npm audit fix`.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, and never type a `\uXXXX` escape: some tools turn it into the character itself on the way. Templates use HTML entities (`&mdash;`, `&middot;`, `&larr;`); code uses `String.fromCharCode` where it needs such a character.
- The audit, the static server and the Lighthouse command are plain `.mjs` files with JSDoc types, because they run under Node with no TypeScript step. Their tests are `.ts` files and import them. Code style matches the earlier milestones: two-space indentation, single quotes, semicolons, trailing commas, `import type` for imports that are only types.
- Where a step edits a file with `sed -i.bak ... && rm file.bak`, it is written that way because it works the same on macOS and Linux.
- `npm run build` and `npm run build:fixtures` both write `site/dist`, and each audit step reads whichever was built last. Follow the order of the steps.
- Each task ends with one commit, using exactly the message and the two `-m` options shown. Task 70 only checks and makes no commit.

**Versions this milestone was verified against** (installed by the tasks below): @astrojs/rss 4.0.19, @astrojs/sitemap 3.7.4, parse5 8.0.1, fast-xml-validator 1.4.2, fast-xml-parser 5.11.2, lighthouse 13.5.0 and chrome-launcher 1.2.2, on top of the versions of part A (astro 7.3.5, sharp 0.35.5, typescript 6.0.3 in the repository root and `site` and 7.0.2 in `gate` and `evals`). Lighthouse 13 needs Node 22.19 or newer. The Lighthouse command also needs Google Chrome.

---

### Task 49: List the hold reasons in the gate

**Files:**
- Modify: `gate/src/checks/g6-sourcing.ts` (export the list of hold reasons)
- Modify: `gate/src/checks/index.ts` (re-export it)
- Test: `gate/test/g6-sourcing.test.ts`, `gate/test/golden-gate.test.ts`

A check can stop a piece in two ways. A *failure* sends the draft back for revision; its code is listed in `ALL_FAILURE_CODES`. A *hold reason* sends a draft that has no failure to the owner. G6 has one, `TIER2_ATTRIBUTION` (a piece that rests on another outlet's reporting never publishes by itself), but it is a private constant, so nothing outside the gate can know the full list. The `/holds/` page of this milestone must give every reason a plain-English label and must fail a test when a new reason has none. This task makes the list public as `HOLD_REASONS`, next to the lists of failure codes.

- [ ] **Step 1: Write the failing tests**

The G6 test imports the new list and checks that the reason G6 reports is in it.

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { HOLD_REASONS, checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
```

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
  it('is not asked for when no sentence cites the tier-2 claim', () => {
    expect(run((g) => addTier2Copy(g, 'c-19'))).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G6_TIER2_IN_ANALYSIS', () => {
```

**with:**
```ts
  it('is not asked for when no sentence cites the tier-2 claim', () => {
    expect(run((g) => addTier2Copy(g, 'c-19'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('is listed in HOLD_REASONS, which the site reads to give every hold reason a label', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(HOLD_REASONS).toEqual(['TIER2_ATTRIBUTION']);
    expect(output.holdReasons.every((reason) => (HOLD_REASONS as readonly string[]).includes(reason))).toBe(true);
  });
});

describe('G6_TIER2_IN_ANALYSIS', () => {
```

The package test that lists the public names gets one more name.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
    'checkG8',
    'checkG9',
    'ALL_FAILURE_CODES',
    // slugs and titles
    'disambiguateSlug',
    'titleTokens',
```

**with:**
```ts
    'checkG8',
    'checkG9',
    'ALL_FAILURE_CODES',
    'HOLD_REASONS',
    // slugs and titles
    'disambiguateSlug',
    'titleTokens',
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts test/golden-gate.test.ts`
Expected: FAIL — `is listed in HOLD_REASONS` and `exports HOLD_REASONS`.

- [ ] **Step 3: Write the implementation**

**In `gate/src/checks/g6-sourcing.ts`, replace:**
```ts
/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS'] as const;

/** Why a piece that cites a tier-2 claim, even a properly attributed one, can never publish by itself. */
const HOLD_TIER2 = 'TIER2_ATTRIBUTION';

/**
 * G6, sourcing: a claim from a tier-2 outlet (another publication's reporting)
```

**with:**
```ts
/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS'] as const;

/**
 * Every reason a check can ask for a hold, as opposed to a failure. A piece with
 * a hold reason and no failure goes to the owner instead of being revised. The
 * site gives each reason a label, and a test there fails if one has none.
 */
export const HOLD_REASONS = ['TIER2_ATTRIBUTION'] as const;

/** Why a piece that cites a tier-2 claim, even a properly attributed one, can never publish by itself. */
const HOLD_TIER2 = HOLD_REASONS[0];

/**
 * G6, sourcing: a claim from a tier-2 outlet (another publication's reporting)
```

**In `gate/src/checks/index.ts`, replace:**
```ts
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';
import { G8_CODES, checkG8 } from './g8-limitations';
import { G9_CODES, checkG9 } from './g9-hygiene';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES };
export { TITLE_STOP_WORDS, titleTokens } from './g9-hygiene';

/**
```

**with:**
```ts
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, HOLD_REASONS, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';
import { G8_CODES, checkG8 } from './g8-limitations';
import { G9_CODES, checkG9 } from './g9-hygiene';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES };
export { HOLD_REASONS };
export { TITLE_STOP_WORDS, titleTokens } from './g9-hygiene';

/**
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts test/golden-gate.test.ts test/failure-codes.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks gate/test/g6-sourcing.test.ts gate/test/golden-gate.test.ts
git commit -m "feat(gate): list the hold reasons a check can ask for" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 50: Plain-English labels for failure codes and hold reasons

**Files:**
- Create: `site/src/lib/reasons.ts`
- Test: `site/test/reasons.test.ts`

The gate reports a code such as `G4_NUMBER_UNSUPPORTED`. A reader of `/holds/` needs words. `REASON_LABELS` maps each code to a short phrase, and `reasonLabel(code)` looks one up. A code with no label comes back as the code itself, so an unlabelled reason is shown in the table and never hidden. The tests make an unlabelled code impossible to ship: they fail for every code in `ALL_FAILURE_CODES` and every entry of `HOLD_REASONS` that has no label, and for any label whose code no longer exists.

- [ ] **Step 1: Write the failing test**

**Create `site/test/reasons.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, HOLD_REASONS } from '@robywire/gate';
import { REASON_LABELS, reasonLabel } from '../src/lib/reasons';

// The holds page tells a reader why the gate stopped a draft. The gate reports
// codes such as G4_NUMBER_UNSUPPORTED; a reader needs words. These tests make a
// code without words impossible: a check that gains a code fails here until
// the code is labelled.

describe('REASON_LABELS', () => {
  it('has a label for every failure code the gate can report', () => {
    const missing = ALL_FAILURE_CODES.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has a label for every hold reason, and TIER2_ATTRIBUTION is one of them', () => {
    expect(HOLD_REASONS).toContain('TIER2_ATTRIBUTION');
    const missing = HOLD_REASONS.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has no label for a code that does not exist, so a removed code does not leave a stale label', () => {
    const known = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS]);
    const stale = Object.keys(REASON_LABELS).filter((code) => !known.has(code));
    expect(stale).toEqual([]);
  });

  it('gives each code its own label', () => {
    const labels = Object.values(REASON_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('writes every label as a short plain phrase: it starts with a capital, does not end in a full stop and does not repeat the code', () => {
    for (const [code, label] of Object.entries(REASON_LABELS)) {
      expect(label, code).toMatch(/^[A-Z]/);
      expect(label, code).not.toMatch(/[.!?]$/);
      expect(label.length, code).toBeLessThanOrEqual(70);
      expect(label, code).not.toMatch(/\bG\d_|_/);
    }
  });
});

describe('reasonLabel', () => {
  it('returns the label of a failure code', () => {
    expect(reasonLabel('G4_NUMBER_UNSUPPORTED')).toBe('A number was not in the claims it cites');
  });

  it('returns the label of the tier-2 hold reason', () => {
    expect(reasonLabel('TIER2_ATTRIBUTION')).toBe("Rests on another outlet's reporting");
  });

  it('shows a code it does not know exactly as it is, so a new reason is never hidden', () => {
    expect(reasonLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('does not take a name from the object prototype for a code', () => {
    expect(reasonLabel('constructor')).toBe('constructor');
    expect(reasonLabel('toString')).toBe('toString');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/reasons'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/reasons.ts`:**
```ts
// Plain words for the codes the gate reports. The holds page shows a label
// beside each code. site/test/reasons.test.ts fails when the gate gains a
// failure code or a hold reason that has no label here.

export const REASON_LABELS: Readonly<Record<string, string>> = {
  G1_TITLE_EMPTY: 'The title was empty',
  G1_DESCRIPTION_TOO_LONG: 'The description was too long',
  G1_BAD_DATE: 'The date was not a real date',
  G1_SLUG_FORMAT: 'The page address was malformed',
  G1_CATEGORY_COUNT: 'The piece had the wrong number of categories',
  G1_CATEGORY_UNKNOWN: 'A category is not one the site uses',
  G1_CATEGORY_NO_BEAT: 'Tagged funding without a beat',
  G1_AUTHOR_MISSING: 'The author name was missing',
  G2_OPENING_LENGTH: 'The opening paragraph was the wrong length',
  G2_TAKEAWAYS_COUNT: 'The piece had the wrong number of key takeaways',
  G2_BODY_LENGTH: 'The piece was too short or too long',
  G2_SECTIONS_MIN: 'The piece had fewer than two sections',
  G2_HEADING_QUESTION: 'A heading asked a question',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
  G4_NUMBER_UNSUPPORTED: 'A number was not in the claims it cites',
  G4_DATE_UNSUPPORTED: 'A date was not in the claims it cites',
  G4_NAME_UNSUPPORTED: 'A name was not in the claims it cites',
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
  G6_TIER2_IN_ANALYSIS: 'Analysis rested on another outlet',
  G7_ANALYSIS_PLACEMENT: 'Analysis stood where only facts are allowed',
  G7_ANALYSIS_SHARE: 'Too much of the piece was analysis',
  G7_ANALYSIS_NEW_VALUE: 'Analysis brought in a number, date or name of its own',
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation did not cite exactly one claim',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
  G9_TITLE_DUPLICATE: 'The title was too close to a recent one',
  G9_BANNED_PHRASE: 'A banned filler phrase was used',
  TIER2_ATTRIBUTION: "Rests on another outlet's reporting",
};

/** The words for a failure code or hold reason. A code with no label is returned as it is, never hidden. */
export function reasonLabel(code: string): string {
  return Object.hasOwn(REASON_LABELS, code) ? REASON_LABELS[code]! : code;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/reasons.ts site/test/reasons.test.ts
git commit -m "feat(site): give every failure code and hold reason a plain-English label" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Prove the guard can fail**

Take one label out, as if the gate had gained a code that nobody labelled.

Run: `sed -i.bak '/G9_BANNED_PHRASE/d' site/src/lib/reasons.ts && rm site/src/lib/reasons.ts.bak`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G9_BANNED_PHRASE`.

Put the file back.

Run: `git checkout -- site/src/lib/reasons.ts`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

---

### Task 51: Work out the rows of the status, holds and corrections pages

**Files:**
- Create: `site/src/lib/desk-pages.ts`
- Modify: `site/src/lib/desk-state.ts` (`newestFirst`), `site/src/lib/stats.ts` (export `OUTCOME_TEXT`)
- Test: `site/test/desk-pages.test.ts`, `site/test/desk-state.test.ts`

The three desk pages are tables and a few facts, all computed from the desk state: the record the Desk keeps of its own runs, its holds and its corrections. The computing goes in pure functions so that tests can reach it; the pages in the next task only lay the rows out.

- `statusView(state)` gives the last run in words (`4 Oct 2026, 04:41 UTC`, the outcome as the home page strip writes it, the run id and the slug of the piece) and the numbers of holds and corrections.
- `holdRows(state)` gives one row per hold, newest first: the day, the names of the beats, and each reason as a code with its label. A row has nothing else. The desk state holds no draft text, and the address of the draft pull request is left out on purpose, because the holds page never shows held text and must not link to it.
- `correctionRows(state, titles)` gives one row per correction or retraction, newest first, with the title of the piece looked up in `titles`.

Sorting by `at` as text is wrong, because the schema allows any UTC offset (`2026-10-02T04:30:00+05:30` sorts after `2026-10-02T00:00:00Z` as text but happened before it). `newestFirst` compares the moments, and `correctionsFor` from an earlier task now uses it too.

- [ ] **Step 1: Write the failing tests**

**Create `site/test/desk-pages.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionRows, holdRows, statusView } from '../src/lib/desk-pages';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX1 = 'fixture-robotics-ships-fx-1-to-second-plant';
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';

const STATE: DeskState = {
  lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'published', runId: 'fixture-run-1', slug: FX1 },
  holds: [
    {
      at: '2026-09-29T04:36:40Z',
      categories: ['policy-standards', 'funding'],
      reasons: ['TIER2_ATTRIBUTION'],
    },
    {
      at: '2026-09-30T04:38:05Z',
      categories: ['humanoids'],
      reasons: ['G4_NUMBER_UNSUPPORTED', 'G9_BANNED_PHRASE'],
      prUrl: 'https://github.example/robywire/robywire/pull/12',
    },
  ],
  corrections: [
    { at: '2026-10-03T09:12:00Z', slug: FX2, kind: 'correction', note: 'The reach is 1.4 m.' },
    { at: '2026-10-04T10:00:00Z', slug: FX1, kind: 'retraction', note: 'Withdrawn.' },
  ],
};

describe('statusView', () => {
  it('says nothing has run, and counts nothing, for an empty state', () => {
    expect(statusView(EMPTY)).toEqual({ lastRun: null, holds: 0, corrections: 0 });
  });

  it('writes the last run in words and counts the holds and the corrections', () => {
    expect(statusView(STATE)).toEqual({
      lastRun: { when: '4 Oct 2026, 04:41 UTC', outcome: 'published', runId: 'fixture-run-1', slug: FX1 },
      holds: 2,
      corrections: 2,
    });
  });

  it('writes each outcome the way the home page strip does', () => {
    const outcome = (value: 'published' | 'no-story' | 'held' | 'failed') =>
      statusView({ ...EMPTY, lastRun: { at: '2026-10-04T04:41:12Z', outcome: value, runId: 'r', slug: null } }).lastRun?.outcome;
    expect([outcome('published'), outcome('no-story'), outcome('held'), outcome('failed')]).toEqual(['published', 'no story', 'held', 'failed']);
  });

  it('keeps a missing slug as null', () => {
    const view = statusView({ ...EMPTY, lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'no-story', runId: 'r', slug: null } });
    expect(view.lastRun?.slug).toBeNull();
  });
});

describe('holdRows', () => {
  it('is empty when nothing has been held', () => {
    expect(holdRows(EMPTY)).toEqual([]);
  });

  it('lists the newest hold first, with beat names and a label beside each reason code', () => {
    expect(holdRows(STATE)).toEqual([
      {
        at: '2026-09-30T04:38:05Z',
        when: '30 Sep 2026',
        beats: ['Humanoids'],
        reasons: [
          { code: 'G4_NUMBER_UNSUPPORTED', label: 'A number was not in the claims it cites' },
          { code: 'G9_BANNED_PHRASE', label: 'A banned filler phrase was used' },
        ],
      },
      {
        at: '2026-09-29T04:36:40Z',
        when: '29 Sep 2026',
        beats: ['Policy & standards', 'Funding'],
        reasons: [{ code: 'TIER2_ATTRIBUTION', label: "Rests on another outlet's reporting" }],
      },
    ]);
  });

  it('carries nothing but the date, the beats and the reasons: no pull request address and no held text', () => {
    for (const row of holdRows(STATE)) expect(Object.keys(row).sort()).toEqual(['at', 'beats', 'reasons', 'when']);
  });

  it('orders by the moment, not by the text of the time, when the times have different offsets', () => {
    const state: DeskState = {
      ...EMPTY,
      holds: [
        // 2026-10-01 23:00 UTC, written with an offset that makes its text sort last.
        { at: '2026-10-02T04:30:00+05:30', categories: ['humanoids'], reasons: [] },
        { at: '2026-10-02T00:00:00Z', categories: ['humanoids'], reasons: [] },
      ],
    };
    expect(holdRows(state).map((row) => row.at)).toEqual(['2026-10-02T00:00:00Z', '2026-10-02T04:30:00+05:30']);
  });

  it('shows a reason it has no label for as the code itself', () => {
    const state: DeskState = { ...EMPTY, holds: [{ at: '2026-10-01T00:00:00Z', categories: ['humanoids'], reasons: ['SOMETHING_NEW'] }] };
    expect(holdRows(state)[0]?.reasons).toEqual([{ code: 'SOMETHING_NEW', label: 'SOMETHING_NEW' }]);
  });

  it('stops with a clear message when a hold names a beat the site does not have', () => {
    const state: DeskState = { ...EMPTY, holds: [{ at: '2026-10-01T00:00:00Z', categories: ['cooking'], reasons: [] }] };
    expect(() => holdRows(state)).toThrow('"cooking" is not a beat or a tag');
  });

  it('does not change the state it is given', () => {
    const before = structuredClone(STATE);
    holdRows(STATE);
    expect(STATE).toEqual(before);
  });
});

describe('correctionRows', () => {
  const titles = new Map([
    [FX1, 'Fixture Robotics ships its FX-1 warehouse arm to a second plant'],
    [FX2, 'Fixture Robotics ships its FX-2 warehouse arm to a second plant'],
  ]);

  it('is empty when there are no corrections', () => {
    expect(correctionRows(EMPTY, titles)).toEqual([]);
  });

  it('lists the newest first, with the title of the piece, the kind in words and the note', () => {
    expect(correctionRows(STATE, titles)).toEqual([
      {
        at: '2026-10-04T10:00:00Z',
        when: '4 Oct 2026, 10:00 UTC',
        slug: FX1,
        title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
        kind: 'Retraction',
        note: 'Withdrawn.',
      },
      {
        at: '2026-10-03T09:12:00Z',
        when: '3 Oct 2026, 09:12 UTC',
        slug: FX2,
        title: 'Fixture Robotics ships its FX-2 warehouse arm to a second plant',
        kind: 'Correction',
        note: 'The reach is 1.4 m.',
      },
    ]);
  });

  it('leaves the title undefined for a piece the site does not have, so the page shows the slug without a link', () => {
    const rows = correctionRows(STATE, new Map([[FX2, 'A title']]));
    expect(rows.map((row) => row.title)).toEqual([undefined, 'A title']);
  });
});
```

Add tests for `newestFirst` to the desk-state tests.

**In `site/test/desk-state.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionsFor, getDeskState, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionsFor, getDeskState, newestFirst, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';
```

**In `site/test/desk-state.test.ts`, replace:**
```ts
    expect(state).toEqual(before);
  });
});
```

**with:**
```ts
    expect(state).toEqual(before);
  });
});

describe('newestFirst', () => {
  it('sorts by the moment, newest first', () => {
    const items = [{ at: '2026-10-01T00:00:00Z' }, { at: '2026-10-03T00:00:00Z' }, { at: '2026-10-02T00:00:00Z' }];
    expect(newestFirst(items).map((item) => item.at)).toEqual(['2026-10-03T00:00:00Z', '2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z']);
  });

  it('compares moments, not text: 04:30 at +05:30 is the evening before, in UTC', () => {
    const items = [{ at: '2026-10-02T04:30:00+05:30' }, { at: '2026-10-02T00:00:00Z' }];
    expect(newestFirst(items).map((item) => item.at)).toEqual(['2026-10-02T00:00:00Z', '2026-10-02T04:30:00+05:30']);
  });

  it('keeps the given order for entries at the same moment', () => {
    const items = [
      { at: '2026-10-02T00:00:00Z', n: 1 },
      { at: '2026-10-02T00:00:00Z', n: 2 },
      { at: '2026-10-02T00:00:00Z', n: 3 },
    ];
    expect(newestFirst(items).map((item) => item.n)).toEqual([1, 2, 3]);
  });

  it('returns a new array and leaves the given one alone', () => {
    const items = [{ at: '2026-10-01T00:00:00Z' }, { at: '2026-10-02T00:00:00Z' }];
    const sorted = newestFirst(items);
    expect(sorted).not.toBe(items);
    expect(items.map((item) => item.at)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/desk-pages.test.ts test/desk-state.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/desk-pages'` and `newestFirst is not a function`.

- [ ] **Step 3: Write the implementation**

**In `site/src/lib/desk-state.ts`, replace:**
```ts
  return parseDeskState(file.default);
}

/** The corrections and retractions recorded against one piece, newest first. */
export function correctionsFor(state: DeskState, slug: string): DeskState['corrections'] {
  return state.corrections.filter((entry) => entry.slug === slug).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
```

**with:**
```ts
  return parseDeskState(file.default);
}

/**
 * `items` sorted newest first by their `at` time. Times are compared as moments, not as text, because
 * the schema allows any UTC offset. Items at the same moment keep their order. The array is a new one.
 */
export function newestFirst<T extends { at: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The corrections and retractions recorded against one piece, newest first. */
export function correctionsFor(state: DeskState, slug: string): DeskState['corrections'] {
  return newestFirst(state.corrections.filter((entry) => entry.slug === slug));
}
```

The status view writes the outcome the way the home page strip does, so that table is exported from the stats module instead of being written twice.

**In `site/src/lib/stats.ts`, replace:**
```ts
  note?: string;
}

const OUTCOME_TEXT: Record<RunOutcome, string> = {
  published: 'published',
  'no-story': 'no story',
  held: 'held',
```

**with:**
```ts
  note?: string;
}

/** How each outcome of a run reads on the page. */
export const OUTCOME_TEXT: Record<RunOutcome, string> = {
  published: 'published',
  'no-story': 'no story',
  held: 'held',
```

**Create `site/src/lib/desk-pages.ts`:**
```ts
import type { DeskState } from '@robywire/gate';
import { newestFirst } from './desk-state';
import { beatLabel, formatDate, formatDateTime } from './format';
import { reasonLabel } from './reasons';
import { OUTCOME_TEXT } from './stats';

// What the status, holds and corrections pages show, worked out from the desk
// state. The pages only lay these rows out.

export interface StatusView {
  lastRun: { when: string; outcome: string; runId: string; slug: string | null } | null;
  holds: number;
  corrections: number;
}

/** The facts of the status page: the last run in words, and how many holds and corrections there are. */
export function statusView(state: DeskState): StatusView {
  const run = state.lastRun;
  return {
    lastRun: run === null ? null : { when: formatDateTime(run.at), outcome: OUTCOME_TEXT[run.outcome], runId: run.runId, slug: run.slug },
    holds: state.holds.length,
    corrections: state.corrections.length,
  };
}

export interface HoldRow {
  at: string;
  /** The day of the hold. */
  when: string;
  /** The names of the beats and tags the held draft was filed under. */
  beats: string[];
  reasons: { code: string; label: string }[];
}

/**
 * The holds, newest first. A row has the date, the beats and the reasons and
 * nothing else. The held text is not in the desk state, and the address of the
 * draft pull request is left out on purpose, because the page never shows it.
 */
export function holdRows(state: DeskState): HoldRow[] {
  return newestFirst(state.holds).map((hold) => ({
    at: hold.at,
    when: formatDate(new Date(hold.at).toISOString().slice(0, 10)),
    beats: hold.categories.map(beatLabel),
    reasons: hold.reasons.map((code) => ({ code, label: reasonLabel(code) })),
  }));
}

export interface CorrectionRow {
  at: string;
  when: string;
  slug: string;
  /** The title of the piece, or undefined if the site has no such piece. */
  title: string | undefined;
  kind: 'Correction' | 'Retraction';
  note: string;
}

const KIND: Record<DeskState['corrections'][number]['kind'], CorrectionRow['kind']> = {
  correction: 'Correction',
  retraction: 'Retraction',
};

/** The corrections and retractions, newest first, with the title of each piece from `titles` (slug to title). */
export function correctionRows(state: DeskState, titles: ReadonlyMap<string, string>): CorrectionRow[] {
  return newestFirst(state.corrections).map((entry) => ({
    at: entry.at,
    when: formatDateTime(entry.at),
    slug: entry.slug,
    title: titles.get(entry.slug),
    kind: KIND[entry.kind],
    note: entry.note,
  }));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/desk-pages.test.ts test/desk-state.test.ts test/stats.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib site/test
git commit -m "feat(site): work out the rows of the status, holds and corrections pages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 52: The status, holds and corrections pages

**Files:**
- Create: `site/src/pages/status/index.astro`, `site/src/pages/holds/index.astro`, `site/src/pages/corrections/index.astro`, `site/src/components/TableWrap.astro`, `site/src/styles/pages.css`
- Modify: `site/src/styles/home.css`, `site/src/styles/global.css` (the `.empty` rule moves)

Three plain pages that the header, the footer and the article byline already link to.

- `/status/` says what the page is, then lists the last run (time, outcome, run id and the piece it published), the number of drafts held with a link to `/holds/`, and the number of corrections with a link to `/corrections/`. It ends with what the four outcomes mean. With no run yet it says `The Desk has not run yet.`
- `/holds/` explains what a hold is and says, in a sentence, that it never shows the held text. It lists date, beats and reasons (each a mono code and its label). With no hold it says `Nothing has been held.`
- `/corrections/` explains the correction policy and lists date, piece (a link), kind and note. With none it says `No corrections.`

`TableWrap` puts a table in a box that scrolls sideways on a narrow screen instead of widening the page, and gets keyboard focus so that a keyboard user can scroll it. The `.empty` rule, which the topic pages already use, moves from the home stylesheet to the global one because these pages use it too.

- [ ] **Step 1: Move the empty-state rule**

**In `site/src/styles/home.css`, replace:**
```css
  color: var(--t2);
  font-size: 0.85rem;
}

.empty {
  max-width: 65ch;
  margin-bottom: 3rem;
  color: var(--t2);
}
```

**with:**
```css
  color: var(--t2);
  font-size: 0.85rem;
}
```

**In `site/src/styles/global.css`, replace:**
```css
  font-weight: 600;
}

/* The ledger strip: four plain figures with a label each. */
.strip {
  display: grid;
```

**with:**
```css
  font-weight: 600;
}

/* What a list or table says when it has nothing to show. */
.empty {
  max-width: 65ch;
  margin-bottom: 3rem;
  color: var(--t2);
}

/* The ledger strip: four plain figures with a label each. */
.strip {
  display: grid;
```

- [ ] **Step 2: Write the shared pieces**

**Create `site/src/components/TableWrap.astro`:**
```astro
---
// A table that can scroll sideways on a narrow screen, and that a keyboard can
// reach in order to scroll it.
interface Props {
  /** What the table is, for a screen reader. */
  label: string;
}

const { label } = Astro.props;
---

<div class="table-wrap" role="region" aria-label={label} tabindex="0">
  <slot />
</div>
```

**Create `site/src/styles/pages.css`:**
```css
/* The plain pages: status, holds, corrections and the method. */

.page-head {
  max-width: 65ch;
  margin-bottom: 1.5rem;
}

.page-head h1 {
  margin-bottom: 0.5rem;
}

.page-head .dek {
  margin-bottom: 0;
}

.page-text {
  max-width: 65ch;
}

/* Name and value pairs: a small grey label, then the value. */
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 2rem;
  max-width: 65ch;
  margin: 0 0 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line-2);
}

.facts dt {
  padding-top: 0.2em;
  color: var(--t2);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.facts dd {
  margin: 0;
}

/* A table that scrolls sideways on a narrow screen instead of widening the page. */
.table-wrap {
  overflow-x: auto;
  margin-bottom: 2rem;
}

.table-wrap table {
  margin-bottom: 0;
}

.reasons {
  margin: 0;
  padding: 0;
  list-style: none;
}

.reasons li + li {
  margin-top: 0.25rem;
}
```

- [ ] **Step 3: Write the three pages**

**Create `site/src/pages/status/index.astro`:**
```astro
---
import Base from '../../layouts/Base.astro';
import { statusView } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
import { articlePath } from '../../lib/paths';
import { getPieces } from '../../lib/pieces';
import '../../styles/pages.css';

const view = statusView(await getDeskState());
const lastRun = view.lastRun;
// The piece the last run published, if the site has it.
const piece = lastRun?.slug == null ? undefined : (await getPieces()).find((candidate) => candidate.slug === lastRun.slug);
---

<Base title="Status" description="When the Desk last ran, how that run ended, and how many drafts the gate has held." canonicalPath="/status/">
  <div class="container">
    <header class="page-head">
      <h1>Status</h1>
      <p class="dek">What the Desk did last.</p>
    </header>
    <div class="page-text">
      <p>
        This page shows the record the Desk keeps of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is
        built from that record.
      </p>
      {lastRun === null && <p class="empty">The Desk has not run yet.</p>}
    </div>
    <dl class="facts">
      {
        lastRun !== null && (
          <>
            <dt>Last run</dt>
            <dd>{lastRun.when}</dd>
            <dt>Outcome</dt>
            <dd>{lastRun.outcome}</dd>
            <dt>Run</dt>
            <dd class="mono">{lastRun.runId}</dd>
          </>
        )
      }
      {
        piece !== undefined && (
          <>
            <dt>Piece</dt>
            <dd>
              <a href={articlePath(piece.slug)}>{piece.data.title}</a>
            </dd>
          </>
        )
      }
      <dt>Drafts held</dt>
      <dd>{view.holds} &middot; <a href="/holds/">what the gate stopped</a></dd>
      <dt>Corrections</dt>
      <dd>{view.corrections} &middot; <a href="/corrections/">every correction and retraction</a></dd>
    </dl>
    <h2>What the outcomes mean</h2>
    <dl class="facts">
      <dt>Published</dt>
      <dd>A piece cleared the gate and went live.</dd>
      <dt>No story</dt>
      <dd>Nothing met the bar that day, so nothing was written. This is a normal outcome.</dd>
      <dt>Held</dt>
      <dd>A draft did not clear the gate and waits for the owner. Nothing was published.</dd>
      <dt>Failed</dt>
      <dd>The run itself broke. Nothing was published.</dd>
    </dl>
  </div>
</Base>
```

**Create `site/src/pages/holds/index.astro`:**
```astro
---
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { holdRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
import '../../styles/pages.css';

const rows = holdRows(await getDeskState());
---

<Base title="Holds" description="The drafts the gate stopped: when, under which beats and why. The held text is never shown." canonicalPath="/holds/">
  <div class="container">
    <header class="page-head">
      <h1>Holds</h1>
      <p class="dek">What the gate stopped, and why.</p>
    </header>
    <div class="page-text">
      <p>
        A hold is a draft the gate did not clear. It is not published: it waits for the owner. This page lists when each hold happened, which beats the draft was filed under, and the reasons the gate
        gave. It never shows the held text, because a draft that was stopped is text this site does not vouch for.
      </p>
      <p>Each reason is a code from the gate with a plain-English label. What the gate checks is on the <a href="/method/">method page</a>.</p>
    </div>
    {
      rows.length === 0 ? (
        <p class="empty">Nothing has been held.</p>
      ) : (
        <TableWrap label="Holds">
          <table>
            <caption class="visually-hidden">Drafts held by the gate, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Beats</th>
                <th scope="col">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr>
                  <td>
                    <time datetime={row.at}>{row.when}</time>
                  </td>
                  <td>{row.beats.join(', ')}</td>
                  <td>
                    {row.reasons.length === 0 ? (
                      'None recorded'
                    ) : (
                      <ul class="reasons">
                        {row.reasons.map((reason) => (
                          <li>
                            <span class="mono">{reason.code}</span> {reason.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )
    }
  </div>
</Base>
```

**Create `site/src/pages/corrections/index.astro`:**
```astro
---
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { correctionRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
import { articlePath } from '../../lib/paths';
import { getPieces } from '../../lib/pieces';
import '../../styles/pages.css';

const titles = new Map((await getPieces()).map((piece) => [piece.slug, piece.data.title] as const));
const rows = correctionRows(await getDeskState(), titles);
---

<Base title="Corrections" description="Every correction and retraction the Desk has published, newest first." canonicalPath="/corrections/">
  <div class="container">
    <header class="page-head">
      <h1>Corrections</h1>
      <p class="dek">Every correction and retraction, newest first.</p>
    </header>
    <div class="page-text">
      <p>
        Nothing on this site is changed or removed without a record. A correction fixes a factual error: the article gets a notice at the top and its updated date changes. A retraction withdraws a
        piece: the page stays up with a notice, and its receipts stay public. Both are listed here.
      </p>
    </div>
    {
      rows.length === 0 ? (
        <p class="empty">No corrections.</p>
      ) : (
        <TableWrap label="Corrections">
          <table>
            <caption class="visually-hidden">Corrections and retractions, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Piece</th>
                <th scope="col">Kind</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr>
                  <td>
                    <time datetime={row.at}>{row.when}</time>
                  </td>
                  <td>{row.title === undefined ? <span class="mono">{row.slug}</span> : <a href={articlePath(row.slug)}>{row.title}</a>}</td>
                  <td>{row.kind}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )
    }
  </div>
</Base>
```

- [ ] **Step 4: Build with the fixtures and read the pages**

Run: `npm run build:fixtures`
Expected: PASS — `/status/index.html`, `/holds/index.html` and `/corrections/index.html` are listed, and the build ends with `[build] Complete!`.

Run:
```bash
F=site/dist/status/index.html
grep -o '<dt>Last run</dt><dd>[^<]*</dd>' $F
grep -o '<dt>Outcome</dt><dd>[^<]*</dd>' $F
grep -o '<dt>Drafts held</dt><dd>2' $F
grep -o '<dt>Corrections</dt><dd>1' $F
```
Expected: PASS — prints `<dt>Last run</dt><dd>4 Oct 2026, 04:41 UTC</dd>`, `<dt>Outcome</dt><dd>published</dd>`, `<dt>Drafts held</dt><dd>2` and `<dt>Corrections</dt><dd>1`.

Run:
```bash
F=site/dist/holds/index.html
grep -o '<caption class="visually-hidden">[^<]*</caption>' $F
grep -o '<td>Humanoids</td>' $F
grep -o 'G4_NUMBER_UNSUPPORTED</span> A number was not in the claims it cites' $F
grep -o 'Rests on another outlet&#39;s reporting' $F
grep -o 'never shows the held text' $F
```
Expected: PASS — prints the caption `Drafts held by the gate, newest first`, `<td>Humanoids</td>`, the first reason with its label, the second label (Astro writes the apostrophe as `&#39;`) and `never shows the held text`.

Run:
```bash
F=site/dist/corrections/index.html
grep -o '<td>Correction</td>' $F
grep -o '<a href="/news/fixture-robotics-ships-fx-2-to-second-plant/">[^<]*</a>' $F
```
Expected: PASS — prints `<td>Correction</td>` and a link to the FX-2 piece, the one the fixture desk state corrects.

- [ ] **Step 5: Build for production and read the empty pages**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run:
```bash
grep -o 'The Desk has not run yet\.' site/dist/status/index.html
grep -o 'Nothing has been held\.' site/dist/holds/index.html
grep -o 'No corrections\.' site/dist/corrections/index.html
```
Expected: PASS — prints `The Desk has not run yet.`, `Nothing has been held.` and `No corrections.`

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 7: Commit**

```bash
git add site/src
git commit -m "feat(site): add the status, holds and corrections pages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 53: The words of the method page that tests can reach

**Files:**
- Create: `site/src/lib/method.ts`
- Test: `site/test/method.test.ts`

The method page is where a distrustful reader checks what the Desk says about itself, so two parts of its text are written as data that tests can hold to account.

- `gateRules(config)` returns the nine checks in plain English, one sentence each. The numbers in the sentences (155 characters, 40 to 60 words, 20 percent) are taken from the gate's own configuration, `defaultConfig()`, so a change to a limit changes the page. A test requires one rule for each id in `CHECK_IDS`, in order, so a tenth check fails the test until it is described.
- `PIPELINE_STAGES` lists the seven stages of the Desk (discover, select, fetch, extract, compose, verify, publish or hold). None of them runs yet, so every description must be in the future tense, and a test requires the word `will` in each.
- `scoreboardHeadline(board)` writes `40 of 40 seeded defects caught`.

- [ ] **Step 1: Write the failing test**

**Create `site/test/method.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig } from '@robywire/gate';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
// about itself. These tests keep its numbers in step with the gate, and keep
// the parts of the pipeline that are not built yet in the future tense.

describe('gateRules', () => {
  const rules = gateRules();

  it('has one rule for each check of the gate, in order, so a new check fails this test until it is described', () => {
    expect(rules.map((rule) => rule.id)).toEqual([...CHECK_IDS]);
  });

  it('gives each rule its own name', () => {
    expect(rules.map((rule) => rule.name)).toEqual(['Frontmatter', 'Structure', 'Coverage', 'Values', 'Quotes', 'Sourcing', 'Analysis', 'Limitations', 'Hygiene']);
  });

  it.each(rules.map((rule) => [rule.id, rule.text] as const))('%s is written as one sentence: a capital, one full stop at the end and none inside', (_id, text) => {
    expect(text).toMatch(/^[A-Z]/);
    expect(text.endsWith('.')).toBe(true);
    expect(text.slice(0, -1)).not.toMatch(/[.!?](\s|$)/);
  });

  it('takes its numbers from the gate configuration', () => {
    const text = (id: string) => rules.find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 155 characters');
    expect(text('G1')).toContain('1 to 3 categories');
    expect(text('G2')).toContain('40 to 60 words');
    expect(text('G2')).toContain('3 to 5 key takeaways');
    expect(text('G2')).toContain('600 to 850 words');
    expect(text('G7')).toContain('at most 20 percent');
  });

  it('follows the configuration it is given', () => {
    const config = { ...defaultConfig(), descriptionMax: 99, analysisShareCap: 0.35, bodyWords: { min: 100, max: 200 } };
    const text = (id: string) => gateRules(config).find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(text('G2')).toContain('100 to 200 words');
    expect(text('G7')).toContain('at most 35 percent');
  });

  it('says that a piece which uses another outlet is held, and that analysis is labelled', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('held for the owner');
    expect(rules.find((rule) => rule.id === 'G7')?.text).toContain('is labelled');
  });
});

describe('PIPELINE_STAGES', () => {
  it('lists the seven stages of the design, in order', () => {
    expect(PIPELINE_STAGES.map((stage) => stage.name)).toEqual(['Discover', 'Select', 'Fetch', 'Extract', 'Compose', 'Verify', 'Publish or hold']);
  });

  it('describes every stage in the future tense, because none of them runs yet', () => {
    for (const stage of PIPELINE_STAGES) expect(stage.text, stage.name).toMatch(/\bwill\b/);
  });

  it('writes each stage as plain sentences', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.text, stage.name).toMatch(/^[A-Z]/);
      expect(stage.text.endsWith('.'), stage.name).toBe(true);
    }
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
    expect(scoreboardHeadline({ total: 40, caught: 40 })).toBe('40 of 40 seeded defects caught');
  });

  it('says so when some were missed', () => {
    expect(scoreboardHeadline({ total: 40, caught: 38 })).toBe('38 of 40 seeded defects caught');
  });

  it('uses the singular for one defect', () => {
    expect(scoreboardHeadline({ total: 1, caught: 1 })).toBe('1 of 1 seeded defect caught');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/method.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/method'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/method.ts`:**
```ts
import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, and the
// seven stages of the pipeline, which are written in the future tense because
// none of them is running yet.

export interface GateRule {
  id: CheckId;
  name: string;
  /** What the check requires, in one sentence. */
  text: string;
}

/** The nine deterministic checks in plain English, with the limits taken from `config`. */
export function gateRules(config: GateConfig = defaultConfig()): GateRule[] {
  const { openingWords, takeaways, bodyWords } = config;
  const share = Math.round(config.analysisShareCap * 100);
  return [
    {
      id: 'G1',
      name: 'Frontmatter',
      text: `The title is not empty, the description is at most ${config.descriptionMax} characters, the date is a real date, the page address is lowercase words joined by hyphens, there are 1 to 3 categories from the closed list with at least one beat among them, and an author is named.`,
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, no heading asks a question, and a piece that rests on a company's own datasheet, press release, briefing or demo has a section on what could not be verified.`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites, and every value a claim lists is really in its quoted passage; the name check is strict on purpose, because a false alarm only sends a draft back for revision.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in quotation marks is word for word inside the quoted passage of a claim that the sentence cites.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only as an attribution that names the outlet, never in analysis, and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, and may not bring in a number, date or name that no factual sentence contains.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each comes from a fixed template that describes one claim's basis or status, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: 'The page address is not already in use, the title is not a near-duplicate of a recent title, and none of the banned filler phrases appears.',
    },
  ];
}

export interface PipelineStage {
  name: string;
  text: string;
}

/** The seven stages of the Desk. They are the design the Desk is being built to, so each is in the future tense. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    name: 'Discover',
    text: 'The Desk will poll the primary newsrooms and the secondary feeds in its source registry, and drop anything it has already seen.',
  },
  {
    name: 'Select',
    text: 'A small model will rank what is new against a written rubric and pick one story, or none. A story with no reachable primary source can still be picked, but it will be written in attributed form and will always be held.',
  },
  {
    name: 'Fetch',
    text: 'The Desk will fetch each primary source, respecting its robots.txt, and keep its text with a SHA-256 hash and the time it was fetched.',
  },
  {
    name: 'Extract',
    text: 'A model will break each source into atomic claims, each with the exact passage it rests on. Code will confirm that every passage appears word for word in the stored source.',
  },
  {
    name: 'Compose',
    text: 'A model will write the piece as sentences that each cite claim ids. A renderer written as code will turn those sentences into the page, so no text a model wrote reaches the site any other way.',
  },
  {
    name: 'Verify',
    text: 'The gate will check the draft. A draft that fails will go back for revision with the exact failures, at most twice.',
  },
  {
    name: 'Publish or hold',
    text: 'A draft that passes will be built and published. A draft that does not will be held for the owner as a draft pull request that carries the gate report.',
  },
];

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
  return `${board.caught} of ${board.total} seeded ${board.total === 1 ? 'defect' : 'defects'} caught`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/method.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/method.ts site/test/method.test.ts
git commit -m "feat(site): write the gate rules and pipeline stages for the method page, with their numbers taken from the gate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 54: The method page

**Files:**
- Create: `site/src/pages/method/index.astro`
- Modify: `site/src/styles/pages.css`, `site/src/styles/global.css` (ordered lists in prose)

`/method/` is written for a reader who has reason to doubt. It says what the Desk is; what is built and what is not running yet; the two kinds of source; the seven stages (in the future tense); the claim ledger and the receipts; the nine rules of the gate; the independent model check (a design, not yet running); holds; corrections and retractions; the disclosure; what the Desk never does; and the scoreboard of seeded defects, read from `@robywire/evals/scoreboard`, which is the committed file `evals/scoreboard/seeded.json`. The `evals` package already exports it under that name, and `site` already depends on `evals`.

Nothing on the page may say that something is happening which is not built. The stages, the model check, the schedule and the trial period are in the future tense or described as designs, and the page says plainly which parts exist.

The rules are a definition list, and the scoreboard is a table of case, check, code and result, with the result in green or red because those two colours mean a gate passed or failed.

- [ ] **Step 1: Add the styles**

**In `site/src/styles/global.css`, replace:**
```css
  margin: 2em 0 0.6em;
}

.prose ul {
  padding-left: 1.2em;
}

```

**with:**
```css
  margin: 2em 0 0.6em;
}

.prose ul,
.prose ol {
  padding-left: 1.2em;
}

```

**In `site/src/styles/pages.css`, replace:**
```css
.reasons li + li {
  margin-top: 0.25rem;
}
```

**with:**
```css
.reasons li + li {
  margin-top: 0.25rem;
}

/* The gate rules on the method page: the label is the check, the value is the sentence. */
.rules {
  margin-bottom: 1rem;
}

/* A large plain figure, as on the home page strip. */
.figure {
  margin: 0 0 0.25rem;
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* The one-line description under a case id in the scoreboard. */
.case-note {
  display: block;
  color: var(--t2);
  font-size: 0.85rem;
}

/* On a narrow screen the labels sit above their values. */
@media (max-width: 40em) {
  .facts {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }

  .facts dd {
    margin-bottom: 0.75rem;
  }
}
```

- [ ] **Step 2: Write the page**

**Create `site/src/pages/method/index.astro`:**
```astro
---
import board from '@robywire/evals/scoreboard';
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

const rules = gateRules();
---

<Base
  title="Method"
  description="How Robywire is made: the two kinds of source, the claim ledger, the nine rules of the gate, what the Desk never does, and the scoreboard of defects the gate was tested against."
  canonicalPath="/method/"
>
  <div class="container">
    <header class="page-head">
      <h1>Method</h1>
      <p class="dek">How a piece gets here, and what stops it.</p>
    </header>

    <div class="prose">
      <h2 id="what">What the Desk is</h2>
      <p>
        Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code
        decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot
        trace is not published.
      </p>

      <h2 id="today">What exists today, and what does not</h2>
      <p>
        Built and tested: the gate with its nine checks, the format of the claim ledger, the renderer that turns a checked draft into a page, the receipts pages, the status, holds and corrections
        pages, and the scoreboard at the end of this page.
      </p>
      <p>
        Not running yet: the pipeline that finds, fetches and writes stories, the independent model check, and the daily schedule. Before the Desk publishes on its own it will run for five days in
        shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial. The parts that are not running are described in
        the future tense below.
      </p>

      <h2 id="sources">Two kinds of source</h2>
      <p>
        A tier 1 source is a primary one: a company's own announcement or datasheet, a paper, a regulatory filing, a standard, a results sheet. The Desk writes from tier 1 sources. A tier 2 source
        is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it never states a fact on that authority. A claim that has only a tier 2 source can appear only as an
        attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk does not rewrite a
        competitor's reporting; the story is held.
      </p>

      <h2 id="pipeline">How a piece is made</h2>
      <p>The Desk is designed as seven stages. Each stage will read only the typed output of the one before it.</p>
      <ol>
        {
          PIPELINE_STAGES.map((stage) => (
            <li>
              <strong>{stage.name}.</strong> {stage.text}
            </li>
          ))
        }
      </ol>

      <h2 id="ledger">The claim ledger and the receipts</h2>
      <p>
        Every factual sentence is built from claims. A claim is one atomic statement, such as a number with its unit, a date or a name. It carries the exact passage of the source it rests on (at most
        300 characters, word for word), the address of the source, a hash of the source as it was fetched, and the time it was fetched. It also records the basis of the figure, such as a datasheet, a
        press release, a filing, a paper, a measurement or a demonstration, and its status: demonstrated, deployed, planned or unspecified.
      </p>
      <p>
        Each sentence cites the claims it rests on. On the page, a small numbered link follows the sentence and leads to the receipt for that claim: the passage, the source, the hash and the time.
        The receipts page of a piece also shows the result of every check. The full text of a source is not republished.
      </p>

      <h2 id="gate">The gate: nine rules</h2>
      <p>
        The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same
        answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.
      </p>
    </div>
    <dl class="facts rules">
      {
        rules.map((rule) => (
          <>
            <dt>
              {rule.id} {rule.name}
            </dt>
            <dd>{rule.text}</dd>
          </>
        ))
      }
    </dl>

    <div class="prose">
      <h2 id="model-check">The independent model check</h2>
      <p>
        On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and
        status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a
        second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some
        subtly distorted. It is not running yet.
      </p>

      <h2 id="holds">Holds</h2>
      <p>
        A piece is held when the gate cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's
        reporting. A held draft is not published. It is designed to go to the owner as a draft pull request that carries the gate report. What was stopped and why is public on the
        <a href="/holds/">holds page</a>: the date, the beats and the reasons. The held text is not. A hold is the normal result when the Desk is unsure. A day with no piece is better than a day with a
        wrong one.
      </p>

      <h2 id="corrections">Corrections and retractions</h2>
      <p>
        Nothing is edited or removed in silence. A correction fixes a factual error: the article gets a notice at the top that says what changed and when, the page's updated date is set, and the
        correction is listed on the <a href="/corrections/">corrections page</a>. A retraction withdraws a piece: the page stays up with a visible notice, and its receipts stay public.
      </p>

      <h2 id="disclosure">Disclosure</h2>
      <p>
        Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to
        have been reported by a person.
      </p>

      <h2 id="never">What the Desk never does</h2>
      <ul>
        <li>It contacts no one. It sends no email to a company and asks nobody for comment, so no piece says "we asked and did not hear back".</li>
        <li>It does not republish its sources. A piece quotes short passages, each attributed and at most 300 characters, and does not copy articles.</li>
        <li>It uses no photographs. Each piece gets a fact card drawn from its own claims.</li>
        <li>It does not rewrite another outlet's reporting as its own. A story with no reachable primary source is held.</li>
        <li>It does not publish a sentence the gate cannot trace to a source.</li>
      </ul>

      <h2 id="scoreboard">The scoreboard</h2>
      <p>
        A gate is worth what it catches. To test this one, the golden example piece is broken on purpose, once for every failure code of the nine checks, and the gate has to catch every break. A
        missed defect fails the tests. The result is kept with the code, and this table is read from it.
      </p>
      <p class="figure">{scoreboardHeadline(board)}</p>
      <p>The unbroken golden piece {board.baselinePasses ? 'publishes' : 'does not publish'}.</p>
    </div>
    <TableWrap label="Seeded defects and the gate's result for each">
      <table>
        <caption class="visually-hidden">Seeded defects, the check and code that should catch each, and whether the gate caught it</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Check</th>
            <th scope="col">Code</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {
            board.cases.map((item) => (
              <tr>
                <td>
                  <span class="mono">{item.id}</span>
                  <span class="case-note">{item.description}</span>
                </td>
                <td>{item.check}</td>
                <td class="mono">{item.code}</td>
                <td>
                  <span class={item.caught ? 'chip chip--pass' : 'chip chip--fail'}>{item.caught ? 'caught' : 'missed'}</span>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </TableWrap>
  </div>
</Base>
```

- [ ] **Step 3: Build with the fixtures and read the page**

Run: `npm run build:fixtures`
Expected: PASS — `/method/index.html` is listed, and the build ends with `[build] Complete!`.

Run:
```bash
F=site/dist/method/index.html
grep -o '<h2 id="[a-z-]*">' $F
grep -o '<dt>G[1-9] [A-Za-z]*</dt>' $F
grep -o '[0-9]* of [0-9]* seeded defects caught' $F
grep -o 'chip chip--pass">caught' $F | wc -l | tr -d ' '
grep -o 'The unbroken golden piece [a-z ]*\.' $F
```
Expected: PASS — prints the twelve section ids from `<h2 id="what">` to `<h2 id="scoreboard">`; the nine rules from `<dt>G1 Frontmatter</dt>` to `<dt>G9 Hygiene</dt>`; `40 of 40 seeded defects caught`; `40` (one green `caught` chip for each case); and `The unbroken golden piece publishes.`

- [ ] **Step 4: Build for production and check the page is there**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `grep -c "40 of 40 seeded defects caught" site/dist/method/index.html`
Expected: PASS — `1`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add site/src
git commit -m "feat(site): add the method page with the gate rules in plain English and the seeded-defect scoreboard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 55: A strict check that XML is well-formed

**Files:**
- Modify: `site/package.json`, `package-lock.json` (one dev dependency)
- Create: `site/scripts/audit/xml.mjs`
- Test: `site/test/xml.test.ts`

Three things this milestone builds are XML: the RSS feed, the sitemap and the share cards. A forgiving parser would let a broken one through, so the tests and the audit script use one strict check, `xmlProblem(text)`. It returns `undefined` for a well-formed document and, for a broken one, a sentence with the line and column. It is a plain `.mjs` file because the audit script of a later task runs under Node without a TypeScript step, and the tests import it too.

**Versions.** `fast-xml-validator` 1.4.2. (`fast-xml-parser` has an `XMLValidator` too, but its type information marks it deprecated in favour of this package.) The validator throws instead of returning an error, and it accepts a second root element unless it is told `multipleRoots: false`, so the wrapper passes that.

- [ ] **Step 1: Install the validator**

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site fast-xml-validator@1.4.2`
Expected: PASS

Run: `grep -n "fast-xml-validator" site/package.json`
Expected: PASS — `"fast-xml-validator": "1.4.2"`.

- [ ] **Step 2: Write the failing test**

**Create `site/test/xml.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';

// The feed, the sitemap and the share cards are XML. A parser that is
// forgiving would let a broken one through, so the check is strict.

describe('xmlProblem', () => {
  it.each([
    ['a document with a declaration, attributes and escaped text', '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>A &amp; B</title></channel></rss>'],
    ['an SVG with a namespace', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="1" y="2">Fish &amp; chips</text></svg>'],
    ['an element that closes itself', '<a><b/></a>'],
    ['a comment after the root', '<a>text</a><!-- end -->'],
  ])('finds nothing wrong with %s', (_name, xml) => {
    expect(xmlProblem(xml)).toBeUndefined();
  });

  it.each([
    ['a tag closed by the wrong name', '<a><b></a>', "Expected closing tag 'b'"],
    ['a bare ampersand', '<a>fish & chips</a>', "char '&' is not expected"],
    ['a bare less-than sign', '<a>1 < 2</a>', "Invalid space after '<'"],
    ['an attribute with no quotes', '<a x=1/>', "Attribute 'x' is without value"],
    ['an attribute given twice', '<a b="1" b="2"/>', "Attribute 'b' is repeated"],
    ['two root elements', '<a/><b/>', 'Multiple possible root nodes found'],
    ['text after the root', '<a>x</a>trailing', 'Extra text at the end'],
    ['an empty document', '', 'Start tag expected'],
    ['a document of spaces', '   \n', 'Start tag expected'],
    ['text that is not XML', 'just text', "char 'j' is not expected"],
  ])('reports %s', (_name, xml, fragment) => {
    expect(xmlProblem(xml)).toContain(fragment);
  });

  it('says where the problem is', () => {
    expect(xmlProblem('<a>\n  <b>\n</a>')).toMatch(/line 3, column \d+\)$/);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/xml.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/xml.mjs'`.

- [ ] **Step 4: Write the implementation**

**Create `site/scripts/audit/xml.mjs`:**
```js
import { SyntaxValidator } from 'fast-xml-validator';

/**
 * What is wrong with an XML document, in words and with the line and column,
 * or undefined when it is well-formed. The check is strict: a second root
 * element, text after the root, a bare ampersand and an unquoted attribute
 * are all problems.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function xmlProblem(text) {
  try {
    SyntaxValidator.validate(text, { multipleRoots: false });
    return undefined;
  } catch (error) {
    // The validator throws a ValidationError with `line` and `col`.
    const { message, line, col } = /** @type {{ message: string; line: number; col: number }} */ (error);
    return `${message} (line ${line}, column ${col})`;
  }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/xml.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json site/package.json site/scripts site/test/xml.test.ts
git commit -m "feat(site): add a strict XML well-formedness check for the feed, sitemap and cards" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 56: The RSS feed

**Files:**
- Modify: `site/package.json`, `package-lock.json` (one dependency, one dev dependency), `site/src/layouts/Base.astro` (feed autodiscovery link)
- Create: `site/src/lib/feed.ts`, `site/src/pages/rss.xml.ts`
- Test: `site/test/feed.test.ts`

`/rss.xml` has one item for every piece, newest first, with the title, the description, the link, the date and the names of the categories. Items carry no article text: the article and its receipts are on the site. `rssItems(pieces)` is the pure mapping from pieces to items, and `feedOptions(pieces, site)` is the whole options object for `rss()` from `@astrojs/rss`, so a test can build the real XML with `getRssString`. A piece is dated at the start of its day in UTC, because its date has no time. A production build has no pieces and writes a valid feed with no items.

The tests build the XML and check that it is well-formed (with the check of the last task), that the channel and items read back correctly, that the empty feed is valid, and that a hostile title (`A < B & "C" </title><script>`) is escaped.

**Versions.** `@astrojs/rss` 4.0.19 and `fast-xml-parser` 5.11.2. The feed library already uses `fast-xml-parser` inside, and the test reads the feed back with its `XMLParser`, so it is declared as a dev dependency of its own.

- [ ] **Step 1: Install**

Run: `npm install --save-exact --no-audit --no-fund --workspace @robywire/site @astrojs/rss@4.0.19`
Expected: PASS

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site fast-xml-parser@5.11.2`
Expected: PASS

Run: `grep -n "astrojs/rss\|fast-xml-parser" site/package.json`
Expected: PASS — `"@astrojs/rss": "4.0.19"` and `"fast-xml-parser": "5.11.2"`.

- [ ] **Step 2: Write the failing test**

**Create `site/test/feed.test.ts`:**
```ts
import { getRssString } from '@astrojs/rss';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { feedOptions, rssItems } from '../src/lib/feed';

const SITE = 'https://robywire.example';

const piece = (slug: string, title: string, publishedAt: string, categories: string[], description = `About ${title}.`) => ({
  slug,
  data: { title, description, publishedAt, categories },
});

const FX1 = piece('fx-1', 'Fixture Robotics ships its FX-1 warehouse arm to a second plant', '2026-10-04', ['industrial-warehouse', 'funding']);
const FX2 = piece('fx-2', 'Fixture Robotics ships its FX-2 warehouse arm to a second plant', '2026-10-03', ['humanoids']);

describe('rssItems', () => {
  it('is empty when there are no pieces', () => {
    expect(rssItems([])).toEqual([]);
  });

  it('maps a piece to an item with its title, description, article path, date and the names of its categories', () => {
    expect(rssItems([FX1])).toEqual([
      {
        title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
        description: 'About Fixture Robotics ships its FX-1 warehouse arm to a second plant.',
        link: '/news/fx-1/',
        pubDate: new Date('2026-10-04T00:00:00Z'),
        categories: ['Industrial & warehouse', 'Funding'],
      },
    ]);
  });

  it('keeps the order it is given, which is newest first', () => {
    expect(rssItems([FX1, FX2]).map((item) => item.link)).toEqual(['/news/fx-1/', '/news/fx-2/']);
  });

  it('stops with a clear message for a category the site does not have', () => {
    expect(() => rssItems([piece('x', 'T', '2026-10-04', ['cooking'])])).toThrow('"cooking" is not a beat or a tag');
  });

  it('does not change the pieces it is given', () => {
    const before = structuredClone([FX1, FX2]);
    rssItems([FX1, FX2]);
    expect([FX1, FX2]).toEqual(before);
  });
});

describe('the feed', () => {
  const feed = (pieces: Parameters<typeof rssItems>[0]) => getRssString(feedOptions(pieces, SITE));
  const parse = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml) as { rss: { '@_version': string; channel: Record<string, unknown> } };

  it('is well-formed RSS 2.0 with the site as its channel', async () => {
    const xml = await feed([FX1, FX2]);
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.link).toBe('https://robywire.example/');
    expect(rss.channel.language).toBe('en');
  });

  it('lists every piece, newest first, with an absolute link, a date and its categories', async () => {
    const { rss } = parse(await feed([FX1, FX2]));
    const items = rss.channel.item as { title: string; link: string; pubDate: string; category: string[]; guid: { '#text': string } }[];
    expect(items.map((item) => item.link)).toEqual(['https://robywire.example/news/fx-1/', 'https://robywire.example/news/fx-2/']);
    expect(items[0]?.pubDate).toBe('Sun, 04 Oct 2026 00:00:00 GMT');
    expect(items[0]?.category).toEqual(['Industrial & warehouse', 'Funding']);
    expect(items[0]?.guid['#text']).toBe('https://robywire.example/news/fx-1/');
  });

  it('is valid, and has a channel but no items, when there are no pieces', async () => {
    const xml = await feed([]);
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.item).toBeUndefined();
  });

  it('escapes markup in a title, so a hostile title cannot break the feed', async () => {
    const xml = await feed([piece('x', 'A < B & "C" </title><script>', '2026-10-04', ['humanoids'])]);
    expect(xmlProblem(xml)).toBeUndefined();
    expect(xml).not.toContain('<script>');
    const { rss } = parse(xml);
    expect((rss.channel.item as { title: string }).title).toBe('A < B & "C" </title><script>');
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/feed.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/feed'`.

- [ ] **Step 4: Write the implementation**

**Create `site/src/lib/feed.ts`:**
```ts
import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { SITE_NAME, beatLabel } from './format';
import { articlePath } from './paths';

// The RSS feed: one item for every piece, newest first, with the title, the
// description, the link, the date and the names of the categories. Items carry
// no article text; the article and its receipts are on the site.

/** What the feed needs of a piece. */
interface FeedPiece {
  slug: string;
  data: { title: string; description: string; publishedAt: string; categories: readonly string[] };
}

/** One item for each piece, in the order the pieces are given. A piece is dated at the start of its day, UTC. */
export function rssItems(pieces: readonly FeedPiece[]): RSSFeedItem[] {
  return pieces.map((piece) => ({
    title: piece.data.title,
    description: piece.data.description,
    link: articlePath(piece.slug),
    pubDate: new Date(`${piece.data.publishedAt}T00:00:00Z`),
    categories: piece.data.categories.map(beatLabel),
  }));
}

/** The options for `rss()` for these pieces, on the site at `site`. */
export function feedOptions(pieces: readonly FeedPiece[], site: URL | string): RSSOptions {
  return {
    title: SITE_NAME,
    description: 'Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.',
    site,
    items: rssItems(pieces),
    customData: '<language>en</language>',
  };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/feed.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Add the endpoint and the autodiscovery link**

**Create `site/src/pages/rss.xml.ts`:**
```ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { feedOptions } from '../lib/feed';
import { getPieces } from '../lib/pieces';

// /rss.xml: the feed of every piece, newest first. A production build with no
// pieces writes a valid feed with no items.
export async function GET(context: APIContext) {
  if (context.site === undefined) throw new Error('site/astro.config.mjs must set `site`');
  return rss(feedOptions(await getPieces(), context.site));
}
```

Feed readers find a feed from a `<link rel="alternate">` in the head of every page.

**In `site/src/layouts/Base.astro`, replace:**
```astro
    <link rel="canonical" href={canonical} />
    <!-- An empty icon, so that browsers do not ask for /favicon.ico. -->
    <link rel="icon" href="data:," />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:site_name" content="Robywire" />
    <meta property="og:type" content={ogType} />
```

**with:**
```astro
    <link rel="canonical" href={canonical} />
    <!-- An empty icon, so that browsers do not ask for /favicon.ico. -->
    <link rel="icon" href="data:," />
    <link rel="alternate" type="application/rss+xml" title="Robywire" href="/rss.xml" />
    {noindex && <meta name="robots" content="noindex" />}
    <meta property="og:site_name" content="Robywire" />
    <meta property="og:type" content={ogType} />
```

- [ ] **Step 7: Build for production and check that the feed is valid and empty**

Run: `npm run build`
Expected: PASS — `/rss.xml` is listed, and the build ends with `[build] Complete!`.

Run: `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { xmlProblem } from './site/scripts/audit/xml.mjs'; const xml = readFileSync('site/dist/rss.xml', 'utf8'); console.log('problem:', xmlProblem(xml), 'items:', (xml.match(/<item>/g) ?? []).length);"`
Expected: PASS — `problem: undefined items: 0`.

- [ ] **Step 8: Build with the fixtures and check the feed**

Run: `npm run build:fixtures`
Expected: PASS — `/rss.xml` is listed, and the build ends with `[build] Complete!`.

Run: `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { xmlProblem } from './site/scripts/audit/xml.mjs'; const xml = readFileSync('site/dist/rss.xml', 'utf8'); console.log('problem:', xmlProblem(xml), 'items:', (xml.match(/<item>/g) ?? []).length);"`
Expected: PASS — `problem: undefined items: 4`.

Run:
```bash
grep -o '<link rel="alternate"[^>]*>' site/dist/index.html
grep -o '<title>[^<]*</title><link>[^<]*</link>' site/dist/rss.xml | head -2
```
Expected: PASS — prints `<link rel="alternate" type="application/rss+xml" title="Robywire" href="/rss.xml">` and the FX-1 and FX-2 items (FX-1, the newest, first) with links such as `https://robywire.example/news/fixture-robotics-ships-fx-1-to-second-plant/`.

- [ ] **Step 9: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 10: Commit**

```bash
git add package-lock.json site/package.json site/src site/test/feed.test.ts
git commit -m "feat(site): add the RSS feed with an item for every piece, newest first" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 57: The sitemap, robots.txt and a 404 page

**Files:**
- Modify: `site/package.json`, `package-lock.json` (one dependency), `site/astro.config.mjs` (the sitemap integration)
- Create: `site/src/lib/robots.ts`, `site/src/pages/robots.txt.ts`, `site/src/pages/404.astro`
- Test: `site/test/robots.test.ts`

Three small things that crawlers and lost readers need.

- `@astrojs/sitemap` writes `sitemap-index.xml` and `sitemap-0.xml` at build time from the site's pages. It leaves out the 404 page by itself.
- `robots.txt` allows every crawler and names the sitemap. A `Sitemap:` line must be a full address, and the address of the site is a setting of the build (`SITE_URL`), not something to write by hand into a file under `public/`, where it could point at the wrong domain in production. So `robots.txt` is a page like the others: `robotsTxt(site)` writes the text from the site address, and `src/pages/robots.txt.ts` serves it.
- `404.astro` says `This page isn't in the record.`, links home, and asks search engines not to index it. Astro writes it to `dist/404.html`, the file a static host serves for an unknown address.

**Versions.** `@astrojs/sitemap` 3.7.4 (it brings `sitemap` 9.0.1).

- [ ] **Step 1: Install**

Run: `npm install --save-exact --no-audit --no-fund --workspace @robywire/site @astrojs/sitemap@3.7.4`
Expected: PASS

Run: `grep -n "astrojs/sitemap" site/package.json`
Expected: PASS — `"@astrojs/sitemap": "3.7.4"`.

- [ ] **Step 2: Write the failing test**

**Create `site/test/robots.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { robotsTxt } from '../src/lib/robots';

describe('robotsTxt', () => {
  it('allows every crawler and points at the sitemap index on the site', () => {
    expect(robotsTxt(new URL('https://robywire.example'))).toBe('User-agent: *\nAllow: /\n\nSitemap: https://robywire.example/sitemap-index.xml\n');
  });

  it('follows the address of the site, so a build for another domain points at that domain', () => {
    expect(robotsTxt('https://news.example.org')).toContain('Sitemap: https://news.example.org/sitemap-index.xml\n');
  });

  it('keeps the path of a site that lives below the root of its domain', () => {
    expect(robotsTxt('https://example.org/robots/')).toContain('Sitemap: https://example.org/robots/sitemap-index.xml\n');
  });

  it('ends with exactly one newline and disallows nothing', () => {
    const text = robotsTxt('https://robywire.example');
    expect(text.endsWith('xml\n')).toBe(true);
    expect(text).not.toMatch(/disallow/i);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/robots.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/robots'`.

- [ ] **Step 4: Write the implementation**

**Create `site/src/lib/robots.ts`:**
```ts
// robots.txt: every crawler may read every page, and the sitemap is named. A
// Sitemap line must be a full address, so the file is written from the site
// address of the build and cannot point at the wrong domain.

/** The text of robots.txt for the site at `site`. */
export function robotsTxt(site: URL | string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/robots.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Add the pages and the sitemap integration**

**Create `site/src/pages/robots.txt.ts`:**
```ts
import type { APIContext } from 'astro';
import { robotsTxt } from '../lib/robots';

export function GET(context: APIContext) {
  if (context.site === undefined) throw new Error('site/astro.config.mjs must set `site`');
  return new Response(robotsTxt(context.site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
```

**Create `site/src/pages/404.astro`:**
```astro
---
import Base from '../layouts/Base.astro';
---

<Base title="Page not found" description="This page isn't in the record." canonicalPath="/404.html" noindex>
  <div class="container">
    <h1>This page isn't in the record.</h1>
    <p class="dek">The address may be wrong, or the page may have moved.</p>
    <p><a href="/">Back to the home page</a></p>
  </div>
</Base>
```

**In `site/astro.config.mjs`, replace:**
```js
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import { markdownFeatures } from './markdown-features.mjs';

```

**with:**
```js
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { markdownFeatures } from './markdown-features.mjs';

```

**In `site/astro.config.mjs`, replace:**
```js
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { processor: satteri({ features: markdownFeatures }) },
  integrations: [mdx()],
  vite: {
    build: {
      rolldownOptions: {
```

**with:**
```js
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { processor: satteri({ features: markdownFeatures }) },
  integrations: [mdx(), sitemap()],
  vite: {
    build: {
      rolldownOptions: {
```

- [ ] **Step 7: Build for production and check the files**

Run: `npm run build`
Expected: PASS — `/404.html` and `/robots.txt` are listed, `sitemap-index.xml` is created, and the build ends with `[build] Complete!`.

Run: `ls site/dist/404.html site/dist/robots.txt site/dist/rss.xml site/dist/sitemap-index.xml site/dist/sitemap-0.xml`
Expected: PASS — all five files are listed.

Run: `cat site/dist/robots.txt`
Expected: PASS — `User-agent: *`, `Allow: /` and `Sitemap: https://robywire.example/sitemap-index.xml`.

Run:
```bash
grep -o '<title>Page not found' site/dist/404.html
grep -o '<meta name="robots"[^>]*>' site/dist/404.html
grep -o '<h1>[^<]*</h1>' site/dist/404.html
grep -o '<loc>' site/dist/sitemap-0.xml | wc -l | tr -d ' '
grep -c '404' site/dist/sitemap-0.xml
```
Expected: FAIL — prints `<title>Page not found`, `<meta name="robots" content="noindex">`, `<h1>This page isn't in the record.</h1>`, `13` (the home page, eight topic pages, status, holds, corrections and method) and `0`; the last command exits 1 because the sitemap does not list the 404 page.

Run: `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { xmlProblem } from './site/scripts/audit/xml.mjs'; for (const f of ['rss.xml', 'sitemap-index.xml', 'sitemap-0.xml']) console.log(f, xmlProblem(readFileSync('site/dist/' + f, 'utf8')));"`
Expected: PASS — `rss.xml undefined`, `sitemap-index.xml undefined` and `sitemap-0.xml undefined`: all three are well-formed.

- [ ] **Step 8: Build with the fixtures and check the same files**

Run: `npm run build:fixtures`
Expected: PASS — `sitemap-index.xml` is created, and the build ends with `[build] Complete!`.

Run:
```bash
ls site/dist/404.html site/dist/robots.txt site/dist/rss.xml site/dist/sitemap-index.xml site/dist/sitemap-0.xml
grep -o '<loc>' site/dist/sitemap-0.xml | wc -l | tr -d ' '
```
Expected: PASS — the five files are listed, and `21` (the 13 pages above, four articles and four receipts pages).

- [ ] **Step 9: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 10: Commit**

```bash
git add package-lock.json site/package.json site/astro.config.mjs site/src site/test/robots.test.ts
git commit -m "feat(site): add the sitemap, robots.txt and a 404 page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 58: Draw the fact card of a piece

**Files:**
- Create: `site/src/lib/card.ts`
- Test: `site/test/card.test.ts`

Each piece gets a picture, and the picture is drawn from the piece's own claims, with no photograph. `renderCardSvg(entry)` takes a ledger entry and returns a 1200 by 630 SVG document: a white field with a one-pixel hairline frame; the wordmark `ROBYWIRE`; the title in up to three lines; up to three key figures (value and label) set large, in weight 400 and in the link colour; the number of claims and sources; and the host of the first source the article cites. It is the share image of the article (a later task turns it into a PNG) and also a page of its own.

The pieces, each tested alone:

- `wrapText(text, maxChars, maxLines)` breaks text at spaces into lines of at most `maxChars` characters. A word longer than a line is cut. If the text needs more than `maxLines` lines, the last line is shortened and ends with an ellipsis.
- `cardFigures(entry)` takes the first three claims whose type is `number`, in the order the article cites them (`entry.order`). A figure is the claim's first number value (or its first value of any kind) and the claim's label. A claim with no value is skipped.
- `escapeXml(text)` escapes `& < > " '` and removes the control characters that XML 1.0 does not allow at all. Every piece of text in the card goes through it, so a hostile title cannot break the document or add an element.

The card uses only fonts that every system has, no `<image>`, no link and no web font, and its colours are the light design tokens; a test reads `tokens.css` to prove that. The same ledger always gives the same bytes.

Source files stay plain ASCII, and a backslash-u escape typed into a file can turn into the character itself on the way, so the ellipsis and the forbidden control characters are written with `String.fromCharCode`.

- [ ] **Step 1: Write the failing test**

**Create `site/test/card.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, cardFigures, escapeXml, renderCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const GOLDEN = LedgerEntry.parse(JSON.parse(read('ledger/fixture-robotics-ships-fx-1-to-second-plant.json')));

const unescape = (text: string): string => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

/** The text of the <text> elements that have the given data-role, unescaped, in document order. */
function textsWithRole(svg: string, role: string): string[] {
  return [...svg.matchAll(/<text[^>]*data-role="([^"]*)"[^>]*>([^<]*)<\/text>/g)].filter((match) => match[1] === role).map((match) => unescape(match[2]!));
}

/** A copy of the golden ledger entry with `change` applied. */
function entryWith(change: (copy: LedgerEntry) => void): LedgerEntry {
  const copy = structuredClone(GOLDEN);
  change(copy);
  return copy;
}

describe('wrapText', () => {
  it.each([
    ['fits on one line', 'one two three', 20, 3, ['one two three']],
    ['breaks at a space', 'one two three four', 9, 3, ['one two', 'three', 'four']],
    ['breaks after the last word that fits', 'aaa bbb ccc', 7, 3, ['aaa bbb', 'ccc']],
    ['fits a line of exactly the maximum length', 'abcde fghij', 5, 3, ['abcde', 'fghij']],
    ['collapses runs of spaces and trims the ends', '  one   two  ', 20, 3, ['one two']],
    ['is empty for empty text', '   ', 20, 3, []],
    ['cuts a word that is longer than a line', 'abcdefghij', 4, 3, ['abcd', 'efgh', 'ij']],
  ])('%s', (_name, text, maxChars, maxLines, expected) => {
    expect(wrapText(text, maxChars, maxLines)).toEqual(expected);
  });

  it('ends the last line with an ellipsis when the text needs more lines than it may have', () => {
    expect(wrapText('one two three four five six', 9, 2)).toEqual(['one two', `three${ELLIPSIS}`]);
  });

  it('shortens the last line to make room for the ellipsis', () => {
    expect(wrapText('aaaa bbbb cccc dddd', 4, 2)).toEqual(['aaaa', `bbb${ELLIPSIS}`]);
  });

  it('never makes a line longer than the maximum', () => {
    const lines = wrapText('Fixture Robotics ships its FX-1 warehouse arm to a second plant and then some more words follow', 16, 3);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(16);
  });

  it('does not add an ellipsis when the text fits exactly', () => {
    expect(wrapText('one two three four', 9, 3)).toEqual(['one two', 'three', 'four']);
  });

  it('rejects a line length or line count that cannot hold text, and says which', () => {
    expect(() => wrapText('x', 1, 3)).toThrow(RangeError);
    expect(() => wrapText('x', 1, 3)).toThrow('maxChars must be a whole number of at least 2');
    expect(() => wrapText('x', 2.5, 3)).toThrow('maxChars must be a whole number of at least 2');
    expect(() => wrapText('x', 10, 0)).toThrow(RangeError);
    expect(() => wrapText('x', 10, 0)).toThrow('maxLines must be a whole number of at least 1');
    expect(() => wrapText('x', 10, 1.5)).toThrow('maxLines must be a whole number of at least 1');
  });

  it('accepts the smallest line length and line count that can hold text', () => {
    expect(wrapText('ab cd', 2, 3)).toEqual(['ab', 'cd']);
    expect(wrapText('abc', 5, 1)).toEqual(['abc']);
  });
});

describe('escapeXml', () => {
  it('escapes the five characters XML cares about', () => {
    expect(escapeXml(`a & b < c > d " e '`)).toBe('a &amp; b &lt; c &gt; d &quot; e &#39;');
  });

  it('removes characters that XML 1.0 does not allow at all', () => {
    expect(escapeXml(`a${String.fromCharCode(0)}b${String.fromCharCode(1)}c${String.fromCharCode(11)}d${String.fromCharCode(31)}e`)).toBe('abcde');
  });

  it('keeps tabs and line feeds', () => {
    expect(escapeXml('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('cardFigures', () => {
  it('takes the value and label of the first three number claims, in the order the article cites them', () => {
    expect(cardFigures(GOLDEN)).toEqual([
      { value: 'USD 450 million', label: 'funding round' },
      { value: '18 per cent', label: 'cycle-time cut' },
      { value: '$38,000', label: 'list price' },
    ]);
  });

  it('ignores claims of other types, even when they have numbers', () => {
    const figures = cardFigures(GOLDEN);
    expect(figures.map((figure) => figure.label)).not.toContain('payload');
  });

  it('shows fewer figures when there are fewer number claims', () => {
    const entry = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardFigures(entry)).toEqual([{ value: 'USD 450 million', label: 'funding round' }]);
  });

  it('shows none when no claim is a number claim', () => {
    expect(cardFigures(entryWith((copy) => copy.claims.forEach((claim) => (claim.type = 'event'))))).toEqual([]);
  });

  it('uses the first value of a number claim that lists no number, and skips a number claim with no value at all', () => {
    const entry = entryWith((copy) => {
      const byId = new Map(copy.claims.map((claim) => [claim.id, claim]));
      byId.get('c-17')!.values = [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }];
      byId.get('c-20')!.values = [];
    });
    expect(cardFigures(entry).map((figure) => figure.value)).toEqual(['Corvane Partners', '$38,000', '940']);
  });

  it('follows the order of the ledger, not the order of the claims list', () => {
    const entry = entryWith((copy) => {
      copy.order = [...copy.order].reverse();
    });
    expect(cardFigures(entry).map((figure) => figure.label)).toEqual(['investor count', 'measured pick rate', 'list price']);
  });
});

describe('renderCardSvg', () => {
  const svg = renderCardSvg(GOLDEN);

  it('is a well-formed XML document', () => {
    expect(xmlProblem(svg)).toBeUndefined();
  });

  it('is 1200 by 630', () => {
    expect([CARD_WIDTH, CARD_HEIGHT]).toEqual([1200, 630]);
    expect(svg).toContain('width="1200" height="630" viewBox="0 0 1200 630"');
  });

  it('carries the wordmark and the title, wrapped over at most three lines', () => {
    expect(textsWithRole(svg, 'wordmark')).toEqual(['ROBYWIRE']);
    const title = textsWithRole(svg, 'title');
    expect(title.length).toBeGreaterThanOrEqual(2);
    expect(title.length).toBeLessThanOrEqual(3);
    expect(title.join(' ')).toBe(GOLDEN.title);
  });

  it('shows the three key figures with their labels', () => {
    expect(textsWithRole(svg, 'figure')).toEqual(['USD 450 million', '18 per cent', '$38,000']);
    expect(textsWithRole(svg, 'figure-label')).toEqual(['funding round', 'cycle-time cut', 'list price']);
  });

  it('sets the figures large, in weight 400 and in the link colour', () => {
    const figures = [...svg.matchAll(/<text[^>]*data-role="figure"[^>]*>/g)].map((match) => match[0]);
    expect(figures).toHaveLength(3);
    for (const tag of figures) {
      expect(tag).toContain('font-weight="400"');
      expect(tag).toContain(`fill="${CARD_COLOURS.link}"`);
      expect(Number(/font-size="(\d+)"/.exec(tag)?.[1])).toBeGreaterThanOrEqual(44);
    }
  });

  it('says how many claims and sources the article has, and the host of the first source it cites', () => {
    expect(textsWithRole(svg, 'counts')).toEqual(['28 claims from 5 sources']);
    expect(textsWithRole(svg, 'host')).toEqual(['fixture-robotics.example']);
  });

  it('sets all the figures of a card at one size, chosen for the longest of them', () => {
    const sizeOf = (card: string) => [...card.matchAll(/data-role="figure" [^>]*font-size="(\d+)"/g)].map((match) => Number(match[1]));
    expect(sizeOf(svg)).toEqual([44, 44, 44]);
    const short = renderCardSvg(entryWith((copy) => {
      for (const claim of copy.claims) if (claim.type === 'number') claim.values = [{ kind: 'number', raw: String(claim.label.length), normalised: '1' }];
    }));
    expect(sizeOf(short)).toEqual([64, 64, 64]);
  });

  it.each([
    [1, 64],
    [8, 64],
    [9, 52],
    [12, 52],
    [13, 44],
    [15, 44],
  ])('sets figures whose longest is %i characters at %i', (length, size) => {
    const card = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.values = [{ kind: 'number', raw: 'x'.repeat(length), normalised: '1' }];
        for (const id of ['c-20', 'c-4']) copy.claims.find((claim) => claim.id === id)!.values = [{ kind: 'number', raw: '1', normalised: '1' }];
      }),
    );
    expect([...card.matchAll(/data-role="figure" [^>]*font-size="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([size, size, size]);
  });

  it('places the title lines 62 pixels apart, from 190', () => {
    const long = renderCardSvg(entryWith((copy) => (copy.title = 'word '.repeat(60).trim())));
    const baselines = [...long.matchAll(/data-role="title" x="\d+" y="(\d+)"/g)].map((match) => Number(match[1]));
    expect(baselines).toEqual([190, 252, 314]);
  });

  it('cuts a label that is too long for its column', () => {
    const card = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.label = 'a label that goes on and on and on and on';
      }),
    );
    const [first] = textsWithRole(card, 'figure-label');
    expect(first!.length).toBeLessThanOrEqual(26);
    expect(first!.endsWith(ELLIPSIS)).toBe(true);
  });

  it('cuts a figure that is too long for its column', () => {
    const long = renderCardSvg(entryWith((copy) => {
      copy.claims.find((claim) => claim.id === 'c-17')!.values = [{ kind: 'number', raw: 'about 4,500,000,000 US dollars', normalised: '4500000000' }];
    }));
    const [first] = textsWithRole(long, 'figure');
    expect(first!.length).toBeLessThanOrEqual(15);
    expect(first!.endsWith(ELLIPSIS)).toBe(true);
  });

  it('draws a one-pixel hairline frame', () => {
    expect(svg).toMatch(/<rect [^>]*fill="none"[^>]*stroke-width="1"/);
    expect(svg).not.toMatch(/stroke-width="(?!1")/);
  });

  it('contains no image, no link and no web font', () => {
    expect(svg).not.toMatch(/<image|<img|href=|url\(|@font-face|<style|<script/i);
  });

  it('names only system fonts', () => {
    const families = [...svg.matchAll(/font-family="([^"]*)"/g)].map((match) => match[1]);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) expect(family).toBe('-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif');
  });

  it('is the same every time', () => {
    expect(renderCardSvg(GOLDEN)).toBe(svg);
    expect(renderCardSvg(structuredClone(GOLDEN))).toBe(svg);
  });

  it('escapes markup in the title, so a hostile title cannot break the card or add elements', () => {
    const hostile = renderCardSvg(entryWith((copy) => (copy.title = 'A & B <script>alert(1)</script> "quoted"')));
    expect(xmlProblem(hostile)).toBeUndefined();
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&amp;');
    expect(hostile).toContain('&lt;script&gt;');
    expect(textsWithRole(hostile, 'title').join(' ')).toContain('A & B <script>alert(1)</script>');
  });

  it('escapes the label of a figure and the host as well', () => {
    const hostile = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.label = 'a <b> & c';
      }),
    );
    expect(xmlProblem(hostile)).toBeUndefined();
    expect(hostile).toContain('a &lt;b&gt; &amp; c');
  });

  it('stays well-formed with a character that XML 1.0 forbids in the title', () => {
    const odd = renderCardSvg(entryWith((copy) => (copy.title = `Bad${String.fromCharCode(1)}title`)));
    expect(xmlProblem(odd)).toBeUndefined();
    expect(textsWithRole(odd, 'title')).toEqual(['Badtitle']);
  });

  it('ends a very long title with an ellipsis on the third line', () => {
    const long = renderCardSvg(entryWith((copy) => (copy.title = 'word '.repeat(60).trim())));
    const lines = textsWithRole(long, 'title');
    expect(lines).toHaveLength(3);
    expect(lines[2]!.endsWith(ELLIPSIS)).toBe(true);
    expect(xmlProblem(long)).toBeUndefined();
  });

  it('draws a card with no figures, no claims and no sources without failing', () => {
    const bare = renderCardSvg(entryWith((copy) => Object.assign(copy, { claims: [], order: [], sources: [] })));
    expect(xmlProblem(bare)).toBeUndefined();
    expect(textsWithRole(bare, 'counts')).toEqual(['0 claims from 0 sources']);
    expect(bare).not.toContain('data-role="host"');
    expect(bare).not.toContain('data-role="figure"');
  });

  it('uses only colours from the light design tokens', () => {
    const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    // The light scheme is the first block, before the dark media query.
    const lightBlock = tokens.slice(0, tokens.indexOf('@media'));
    const allowed = new Set([...lightBlock.matchAll(/--[a-z0-9-]+\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((match) => match[1]!.toUpperCase()));
    const used = new Set([...svg.matchAll(/#[0-9A-Fa-f]{6}/g)].map((match) => match[0].toUpperCase()));
    expect(used.size).toBeGreaterThan(2);
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/card.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/card'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/card.ts`:**
```ts
import type { LedgerEntry } from '@robywire/gate';
import { plural } from './format';

// The fact card: a 1200 by 630 picture drawn from a piece's own ledger, used
// as the share image. It is an SVG written by this file and nothing else: no
// image, no link, no web font. The same ledger always gives the same bytes.
// The colours are the light design tokens; a test checks that.

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export const CARD_COLOURS = {
  background: '#FFFFFF',
  frame: '#C9CDD2',
  rule: '#E4E7EA',
  text: '#14181D',
  quiet: '#5B6470',
  link: '#1B66DF',
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Written as a code so that this file stays plain ASCII.
const ELLIPSIS = String.fromCharCode(0x2026);

const LEFT = 72;
const RIGHT = CARD_WIDTH - LEFT;
const TITLE_LINES = 3;
const TITLE_CHARS = 34;
const FIGURE_COLUMNS = [72, 430, 788];

// XML 1.0 forbids the control characters other than tab, line feed and carriage return.
// The class is built from character codes so that this file stays plain ASCII.
const code = String.fromCharCode;
const FORBIDDEN = new RegExp(`[${code(0)}-${code(8)}${code(11)}${code(12)}${code(14)}-${code(31)}]`, 'g');

/** `text` with the five characters XML cares about replaced, and the characters XML 1.0 forbids removed. */
export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Break `text` into lines of at most `maxChars` characters, at spaces, and at most `maxLines` lines.
 * A word longer than a line is cut. If the text needs more lines, the last line is shortened and
 * ends with an ellipsis.
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new RangeError(`wrapText: maxChars must be a whole number of at least 2, not ${maxChars}`);
  if (!Number.isInteger(maxLines) || maxLines < 1) throw new RangeError(`wrapText: maxLines must be a whole number of at least 1, not ${maxLines}`);

  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((item) => item !== '')) {
    for (let start = 0; start < word.length; start += maxChars) {
      const piece = word.slice(start, start + maxChars);
      if (line === '') line = piece;
      else if (line.length + 1 + piece.length <= maxChars) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line !== '') lines.push(line);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, maxChars - 1).trimEnd()}${ELLIPSIS}`;
  return kept;
}

export interface CardFigure {
  value: string;
  label: string;
}

/**
 * Up to three figures for the card: the first three claims of type `number`, in the order the
 * article cites them. A figure is the claim's first number value, or its first value of any kind,
 * and a claim with no value is skipped.
 */
export function cardFigures(entry: LedgerEntry): CardFigure[] {
  const byId = new Map(entry.claims.map((claim) => [claim.id, claim]));
  const figures: CardFigure[] = [];
  for (const id of entry.order) {
    const claim = byId.get(id);
    if (claim === undefined || claim.type !== 'number') continue;
    const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
    if (value === undefined) continue;
    figures.push({ value: value.raw, label: claim.label });
    if (figures.length === 3) break;
  }
  return figures;
}

/** The host of the first source the article cites, or undefined if it cites none. */
function leadHost(entry: LedgerEntry): string | undefined {
  const first = entry.claims.find((claim) => claim.id === entry.order[0]);
  return first === undefined ? undefined : new URL(first.source.url).hostname;
}

/** The longest a figure may be, in characters. A longer one is cut with an ellipsis. */
const FIGURE_CHARS = 15;

/** The type size of the figures: all three share one, chosen so that the longest fits its column. */
function figureSize(longest: number): number {
  if (longest <= 8) return 64;
  return longest <= 12 ? 52 : 44;
}

function text(role: string, x: number, y: number, size: number, weight: number, fill: string, content: string, extra = ''): string {
  return `<text data-role="${role}" x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${escapeXml(content)}</text>`;
}

/** The fact card of a piece as an SVG document. */
export function renderCardSvg(entry: LedgerEntry): string {
  const { background, frame, rule, text: ink, quiet, link } = CARD_COLOURS;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escapeXml(entry.title)}">`,
    `<title>${escapeXml(entry.title)}</title>`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${background}"/>`,
    `<rect x="24.5" y="24.5" width="${CARD_WIDTH - 49}" height="${CARD_HEIGHT - 49}" fill="none" stroke="${frame}" stroke-width="1"/>`,
    text('wordmark', LEFT, 100, 26, 600, ink, 'ROBYWIRE', ' letter-spacing="6"'),
  ];

  wrapText(entry.title, TITLE_CHARS, TITLE_LINES).forEach((line, index) => {
    parts.push(text('title', LEFT, 190 + index * 62, 52, 600, ink, line));
  });

  const figures = cardFigures(entry).map((figure) => ({
    value: wrapText(figure.value, FIGURE_CHARS, 1)[0] ?? '',
    label: wrapText(figure.label, 26, 1)[0] ?? '',
  }));
  const size = figureSize(Math.max(0, ...figures.map((figure) => figure.value.length)));
  figures.forEach((figure, index) => {
    parts.push(text('figure', FIGURE_COLUMNS[index]!, 448, size, 400, link, figure.value, ' letter-spacing="-1"'));
    parts.push(text('figure-label', FIGURE_COLUMNS[index]!, 488, 22, 400, quiet, figure.label));
  });

  parts.push(`<line x1="${LEFT}" y1="530" x2="${RIGHT}" y2="530" stroke="${rule}" stroke-width="1"/>`);
  const counts = `${plural(entry.claims.length, 'claim', 'claims')} from ${plural(entry.sources.length, 'source', 'sources')}`;
  parts.push(text('counts', LEFT, 574, 24, 400, quiet, counts));
  const host = leadHost(entry);
  if (host !== undefined) parts.push(text('host', RIGHT, 574, 24, 400, quiet, host, ' text-anchor="end"'));

  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/card.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/card.ts site/test/card.test.ts
git commit -m "feat(site): draw the fact card of a piece as an SVG from its own claims" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 59: Serve the fact card as SVG and PNG, and use it as the share image

**Files:**
- Create: `site/src/lib/card-png.ts`, `site/src/pages/news/[slug]/card.svg.ts`, `site/src/pages/news/[slug]/card.png.ts`
- Modify: `site/src/layouts/Base.astro` (Twitter card meta), `site/src/pages/news/[slug]/index.astro` (pass the share image)
- Test: `site/test/card-png.test.ts`

Social networks do not show SVG, so the card is also served as a PNG. `cardPng(svg)` draws the SVG at 1200 by 630 pixels with `sharp`, which is already a dependency of `site`. The tests check the PNG signature, the size, a white field with the one-pixel frame in the frame colour, and that the same card gives the same bytes. They do not look at the text pixels, because which system font draws the text depends on the machine.

Each piece then has two files next to its page: `/news/<slug>/card.svg` and `/news/<slug>/card.png`. They are built from the same ledger entry that the receipts page reads. The article passes the PNG to the layout as its share image, and the layout writes `og:image` (it already did when it was given an image) and the Twitter card tags: `summary_large_image` with the image when there is one, plain `summary` otherwise. The article's structured data already pointed at this PNG.

`Response` accepts a `Uint8Array` as a body but TypeScript does not accept a `Buffer`, so the PNG endpoint copies the bytes into a `Uint8Array`.

- [ ] **Step 1: Write the failing test**

**Create `site/test/card-png.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { renderCardSvg } from '../src/lib/card';
import { cardPng } from '../src/lib/card-png';

const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const GOLDEN = LedgerEntry.parse(JSON.parse(readFileSync(new URL('ledger/fixture-robotics-ships-fx-1-to-second-plant.json', FIXTURES), 'utf8')));
const SVG = renderCardSvg(GOLDEN);

describe('cardPng', () => {
  it('is a PNG: it starts with the PNG signature', async () => {
    const png = await cardPng(SVG);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('is 1200 by 630 pixels, the size social networks show', async () => {
    const meta = await sharp(await cardPng(SVG)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });

  it('has a white field and a hairline frame in the frame colour', async () => {
    const { data, info } = await sharp(await cardPng(SVG)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(pixel(5, 5)).toEqual([255, 255, 255]);
    expect(pixel(600, 300)).toEqual([255, 255, 255]);
    // The frame is the one-pixel rectangle that starts 24 pixels in.
    expect(pixel(24, 300)).toEqual([0xc9, 0xcd, 0xd2]);
    expect(pixel(25, 300)).toEqual([255, 255, 255]);
  });

  it('gives the same picture for the same card', async () => {
    const [first, second] = await Promise.all([cardPng(SVG), cardPng(SVG)]);
    expect(first.equals(second)).toBe(true);
  });

  it('refuses text that is not an SVG', async () => {
    await expect(cardPng('not a picture')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/card-png.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/card-png'`.

- [ ] **Step 3: Write the implementation**

**Create `site/src/lib/card-png.ts`:**
```ts
import sharp from 'sharp';
import { CARD_HEIGHT, CARD_WIDTH } from './card';

/**
 * The PNG of a fact card: the SVG from `renderCardSvg` drawn at 1200 by 630 pixels, the size that
 * social networks show. Throws if `svg` is not an SVG document.
 */
export async function cardPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(CARD_WIDTH, CARD_HEIGHT).png().toBuffer();
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/card-png.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Write the two endpoints**

**Create `site/src/pages/news/[slug]/card.svg.ts`:**
```ts
import type { LedgerEntry } from '@robywire/gate';
import type { APIContext } from 'astro';
import { renderCardSvg } from '../../../lib/card';
import { getPieces } from '../../../lib/pieces';

// /news/<slug>/card.svg: the fact card of a piece.
export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { ledger: piece.ledger } }));
}

export function GET({ props }: APIContext<{ ledger: LedgerEntry }>) {
  return new Response(renderCardSvg(props.ledger), { headers: { 'Content-Type': 'image/svg+xml' } });
}
```

**Create `site/src/pages/news/[slug]/card.png.ts`:**
```ts
import type { LedgerEntry } from '@robywire/gate';
import type { APIContext } from 'astro';
import { renderCardSvg } from '../../../lib/card';
import { cardPng } from '../../../lib/card-png';
import { getPieces } from '../../../lib/pieces';

// /news/<slug>/card.png: the same card as a picture, which is the share image of the article.
export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { ledger: piece.ledger } }));
}

export async function GET({ props }: APIContext<{ ledger: LedgerEntry }>) {
  const png = await cardPng(renderCardSvg(props.ledger));
  // A copy as a plain Uint8Array, which is what Response accepts as a body.
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
```

- [ ] **Step 6: Use the card as the share image**

The layout writes the Twitter card tags.

**In `site/src/layouts/Base.astro`, replace:**
```astro
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    {image !== undefined && <meta property="og:image" content={image} />}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to the content</a>
```

**with:**
```astro
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    {image !== undefined && <meta property="og:image" content={image} />}
    <meta name="twitter:card" content={image === undefined ? 'summary' : 'summary_large_image'} />
    {image !== undefined && <meta name="twitter:image" content={image} />}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to the content</a>
```

The article page passes the share image.

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
import { correctionsFor, getDeskState } from '../../../lib/desk-state';
import { formatDate, plural } from '../../../lib/format';
import { jsonLdScript, newsArticleJsonLd } from '../../../lib/jsonld';
import { articlePath, receiptsPath } from '../../../lib/paths';
import { getPieces } from '../../../lib/pieces';
import '../../../styles/article.css';

```

**with:**
```astro
import { correctionsFor, getDeskState } from '../../../lib/desk-state';
import { formatDate, plural } from '../../../lib/format';
import { jsonLdScript, newsArticleJsonLd } from '../../../lib/jsonld';
import { articlePath, cardPath, receiptsPath } from '../../../lib/paths';
import { getPieces } from '../../../lib/pieces';
import '../../../styles/article.css';

```

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
const jsonLd = jsonLdScript(newsArticleJsonLd({ slug: piece.slug, ...piece.data }, corrections, Astro.site.href));
---

<Base title={piece.data.title} description={piece.data.description} canonicalPath={articlePath(piece.slug)} ogType="article">
  <article class="container">
    <header class="article-header">
      <BeatChips categories={piece.data.categories} />
```

**with:**
```astro
const jsonLd = jsonLdScript(newsArticleJsonLd({ slug: piece.slug, ...piece.data }, corrections, Astro.site.href));
---

<Base title={piece.data.title} description={piece.data.description} canonicalPath={articlePath(piece.slug)} ogImage={cardPath(piece.slug)} ogType="article">
  <article class="container">
    <header class="article-header">
      <BeatChips categories={piece.data.categories} />
```

- [ ] **Step 7: Build with the fixtures and check the cards**

Run: `npm run build:fixtures`
Expected: PASS — `card.png` and `card.svg` are listed for each of the four pieces, and the build ends with `[build] Complete!`.

Run: `ls site/dist/news/fixture-robotics-ships-fx-1-to-second-plant`
Expected: PASS — `card.png`, `card.svg`, `index.html` and `receipts`.

Run: `node -e "require('sharp')('site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/card.png').metadata().then(m => console.log(m.format, m.width, m.height))"`
Expected: PASS — `png 1200 630`.

Run: `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { xmlProblem } from './site/scripts/audit/xml.mjs'; console.log('problem:', xmlProblem(readFileSync('site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/card.svg', 'utf8')));"`
Expected: PASS — `problem: undefined`.

Run:
```bash
F=site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html
grep -o '<meta property="og:image" content="[^"]*">' $F
grep -o '<meta name="twitter:[a-z]*" content="[^"]*">' $F
grep -o '<meta name="twitter:[a-z]*" content="[^"]*">' site/dist/index.html
```
Expected: PASS — prints the `og:image` tag with the address `https://robywire.example/news/fixture-robotics-ships-fx-1-to-second-plant/card.png`; `<meta name="twitter:card" content="summary_large_image">` and a `twitter:image` tag with the same address; and, for the home page, which has no image, `<meta name="twitter:card" content="summary">`.

- [ ] **Step 8: Build for production and check that no card is made**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `ls site/dist/news`
Expected: FAIL — `No such file or directory`, because a production build has no pieces and so no cards.

- [ ] **Step 9: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 10: Commit**

```bash
git add site/src site/test/card-png.test.ts
git commit -m "feat(site): serve each fact card as SVG and PNG and use the PNG as the share image" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 60: One detector for the CSS rules

**Files:**
- Create: `site/scripts/audit/css-rules.mjs`
- Modify: `site/test/contrast.test.ts` (use the new module)
- Test: `site/test/css-rules.test.ts`

The audit script of the next tasks must check the built site against the same rules that `site/test/contrast.test.ts` already checks in the source stylesheets: nothing is italic, there are no web fonts, corners are square, and no border is wider than a pixel. Writing the detector twice would let the two drift apart, so it moves into one module, `cssViolations(css)`, that both use. It returns the violations as `{ rule, message }` objects with the same messages as before.

The built CSS is minified (`.a{border:2px solid red}`, `border-radius:0!important`), so the new test checks minified input as well as the written form, and checks that a rule mentioned only in a comment is ignored. The module is a plain `.mjs` file because the audit script runs under Node without a TypeScript step.

- [ ] **Step 1: Write the failing test**

**Create `site/test/css-rules.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { cssViolations } from '../scripts/audit/css-rules.mjs';

// The design register has four rules about CSS: nothing is italic, there are no
// web fonts, corners are square and a border is never wider than a pixel. The
// source test and the audit of the built site both use this one detector, so
// it must read minified CSS as well as the files people write.

describe('cssViolations', () => {
  it.each([
    ['italic text', '.a { font-style: italic; }', 'italic', 'uses font-style: italic'],
    ['italic text, minified', '.a{font-style:italic}', 'italic', 'uses font-style: italic'],
    ['a web font', '@font-face { font-family: X; src: url(x.woff2); }', 'font-face', 'declares a web font with @font-face'],
    ['a web font, minified', '@font-face{font-family:X;src:url(x.woff2)}', 'font-face', 'declares a web font with @font-face'],
    ['a rounded corner', '.a { border-radius: 4px; }', 'radius', 'has a rounded corner: border-radius: 4px'],
    ['a rounded corner on one corner', '.a { border-top-left-radius: 50%; }', 'radius', 'has a rounded corner: border-top-left-radius: 50%'],
    ['a rounded corner, minified', '.a{border-radius:.25rem}', 'radius', 'has a rounded corner: border-radius:.25rem'],
    ['a square corner next to a rounded one', '.a { border-radius: 0 4px; }', 'radius', 'has a rounded corner: border-radius: 0 4px'],
    ['a rounded corner before a closing brace', '.a { border-radius: 4px }', 'radius', 'has a rounded corner: border-radius: 4px'],
    ['a wide border before a closing brace', '.a { border: 2px solid red }', 'border', 'has a border wider than 1px: border: 2px solid red'],
    ['a two-pixel border', '.a { border: 2px solid red; }', 'border', 'has a border wider than 1px: border: 2px solid red'],
    ['a three-pixel bottom border', '.a { border-bottom: 3px solid red; }', 'border', 'has a border wider than 1px: border-bottom: 3px solid red'],
    ['a border width in rem', '.a { border-width: 0.5rem; }', 'border', 'has a border wider than 1px: border-width: 0.5rem'],
    ['a thick border', '.a { border: thick solid; }', 'border', 'has a border wider than 1px: border: thick solid'],
    ['a two-pixel border, minified', '.a{border-top:2px solid var(--line)}', 'border', 'has a border wider than 1px: border-top:2px solid var(--line)'],
  ])('flags %s', (_name, css, rule, message) => {
    expect(cssViolations(css)).toEqual([{ rule, message }]);
  });

  it.each([
    ['a hairline border', '.a { border: 1px solid var(--line); }'],
    ['a hairline border, minified', '.a{border:1px solid var(--line)}'],
    ['a hairline in rem', '.a{border-bottom:.0625rem solid red}'],
    ['no border', '.a { border: none; border-top: 0; }'],
    ['square corners', '.a { border-radius: 0; border-radius: 0 !important; }'],
    ['square corners, minified', '*,:before,:after{box-sizing:border-box;border-radius:0}'],
    ['important square corners, minified', '.a{border-radius:0!important}'],
    ['a two-pixel outline, which is not a border', '.a { outline: 2px solid var(--link); }'],
    ['a two-pixel underline thickness', '.a { text-decoration-thickness: 2px; }'],
    ['a fractional hairline', '.a { border-bottom: 0.5px solid red; }'],
    ['normal text', '.a { font-style: normal; }'],
    ['a one-pixel border written with a capital unit', '.a { border: 1PX solid red; }'],
    ['box-sizing, which has the word border in it', '.a { box-sizing: border-box; }'],
  ])('allows %s', (_name, css) => {
    expect(cssViolations(css)).toEqual([]);
  });

  it('ignores a rule that is only mentioned in a comment', () => {
    expect(cssViolations('/* no font-style: italic here, and no border: 3px solid */ .a { color: red; }')).toEqual([]);
  });

  it('reports every violation', () => {
    const css = '.a { font-style: italic; } .b { border: 2px solid red; }';
    expect(cssViolations(css).map((violation) => violation.rule)).toEqual(['italic', 'border']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/css-rules.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/css-rules.mjs'`.

- [ ] **Step 3: Write the module**

**Create `site/scripts/audit/css-rules.mjs`:**
```js
// The rules of the design register that can be read from CSS, written once.
// test/contrast.test.ts applies them to the stylesheets in src/, and the audit
// applies them to the CSS of the built site, which is minified.

/**
 * @typedef {object} CssViolation
 * @property {'italic' | 'font-face' | 'radius' | 'border'} rule
 * @property {string} message
 */

/**
 * What is wrong with some CSS: italic text, a web font, a rounded corner or a
 * border wider than one pixel. An empty list means it keeps the rules. Comments
 * are ignored. A two-pixel outline is not a border.
 *
 * @param {string} css
 * @returns {CssViolation[]}
 */
export function cssViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {CssViolation[]} */
  const found = [];
  if (/font-style\s*:\s*italic/i.test(source)) found.push({ rule: 'italic', message: 'uses font-style: italic' });
  if (/@font-face/i.test(source)) found.push({ rule: 'font-face', message: 'declares a web font with @font-face' });

  for (const match of source.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]*)/gi)) {
    const values = match[1].replace(/!important/i, '').trim().split(/[\s/]+/);
    if (!values.every((value) => /^0(px|rem|em|%)?$/.test(value))) found.push({ rule: 'radius', message: `has a rounded corner: ${match[0].trim()}` });
  }

  for (const match of source.matchAll(/(?<![a-z-])border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?\s*:\s*([^;}]*)/gi)) {
    const value = match[1];
    const message = `has a border wider than 1px: ${match[0].trim()}`;
    if (/\b(medium|thick)\b/i.test(value)) found.push({ rule: 'border', message });
    for (const size of value.matchAll(/(\d*\.?\d+)\s*(px|rem|em)\b/gi)) {
      const pixels = Number(size[1]) * (size[2].toLowerCase() === 'px' ? 1 : 16);
      if (pixels > 1) found.push({ rule: 'border', message });
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/css-rules.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Make the source test use the module**

The source test keeps its own markup rules (`<i>`, `<em>`, `<img>`), which only apply to templates, and takes the CSS rules from the module.

**In `site/test/contrast.test.ts`, replace:**
```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The design register is quiet, thin and grey, and it has rules that a
// reviewer would otherwise have to check by eye: text must be readable in both
```

**with:**
```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssViolations } from '../scripts/audit/css-rules.mjs';

// The design register is quiet, thin and grey, and it has rules that a
// reviewer would otherwise have to check by eye: text must be readable in both
```

**In `site/test/contrast.test.ts`, replace:**
```ts

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

```

**with:**
```ts

// --- The stylesheet and template rules ---------------------------------------

/**
 * What is wrong with a stylesheet or template, in words. An empty list means it keeps the rules.
 * The CSS rules are the audit's own (scripts/audit/css-rules.mjs); the markup rules are checked here.
 */
function lawViolations(source: string): string[] {
  const found = cssViolations(source).map((violation) => violation.message);
  if (/<(i|em)[\s>]/i.test(source)) found.push('uses an <i> or <em> element');
  if (/<img[\s>]/i.test(source)) found.push('uses an <img> element');
  return found;
}

```

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`. Every test of the detector that was there before still passes unchanged.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts/audit/css-rules.mjs site/test/css-rules.test.ts site/test/contrast.test.ts
git commit -m "refactor(site): share one detector for the CSS rules between the source test and the audit" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 61: Read the built site into a model for the audit

**Files:**
- Modify: `site/package.json`, `package-lock.json` (one dev dependency)
- Create: `site/scripts/audit/dom.mjs`, `site/scripts/audit/site.mjs`
- Test: `site/test/audit-site.test.ts`

The audit script of the next tasks checks `site/dist`, the built site. Every check takes the same input, a model of the site, and nothing else, so a test can build a small site from a few strings and the script can build the real one from the folder.

- `dom.mjs` parses HTML with `parse5`, the HTML parser that browsers' parsers are modelled on, and gives the checks a small reading interface: `elements(root, tag)`, `attr(element, name)`, `textOf(node)`. `parseHtml(html)` returns the document and a list of problems: the parse errors the HTML standard names (a missing doctype, a repeated attribute, a null character), plus every element that was opened in the source and never closed. A browser silently drops an end tag that closes nothing, so `parse5` does not report a stray end tag; the element it should have closed is reported instead.
- `site.mjs` has `siteFromFiles(textFiles, otherPaths)`, which builds the model from files given as text keyed by their path inside `dist/`, and `loadSite(dir)`, which reads a folder into it. The model has `files` (text by path), `paths` (every file, including the PNG cards), `pages` (each HTML file parsed, with its route such as `/news/a/`), `stylesheets` (CSS files, `<style>` elements and `style` attributes, each with where it was found), `origin` (the address the site was built for, read from a canonical link) and `idsOf(page)`.

Both are plain `.mjs` files because the audit runs under Node without a TypeScript step.

**Versions.** `parse5` 8.0.1.

- [ ] **Step 1: Install the HTML parser**

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site parse5@8.0.1`
Expected: PASS

Run: `grep -n "parse5" site/package.json`
Expected: PASS — `"parse5": "8.0.1"`.

- [ ] **Step 2: Write the failing test**

**Create `site/test/audit-site.test.ts`:**
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attr, elements, parseHtml, textOf } from '../scripts/audit/dom.mjs';
import { idsOf, loadSite, routeOf, siteFromFiles } from '../scripts/audit/site.mjs';

const PAGE = (body: string, head = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`;

describe('parseHtml', () => {
  it('parses a page with no problems', () => {
    expect(parseHtml(PAGE('<p>hi</p>')).errors).toEqual([]);
  });

  it('reports a missing doctype', () => {
    expect(parseHtml('<html><head><title>T</title></head><body></body></html>').errors[0]).toContain('missing-doctype');
  });

  it('reports a repeated attribute, with the position', () => {
    expect(parseHtml(PAGE('<a href="x" href="y">l</a>')).errors).toEqual(['duplicate-attribute (line 1, column 105)']);
  });

  it('reports an element that is opened and never closed', () => {
    expect(parseHtml(PAGE('<div><p>x</p>')).errors).toEqual(['unclosed-element <div> (line 1, column 89)']);
  });

  it('reports the inner element when a closing tag closes the outer one over it', () => {
    expect(parseHtml(PAGE('<div><span>x</div>')).errors).toEqual(['unclosed-element <span> (line 1, column 94)']);
  });

  it('does not report the elements that never have an end tag, or that may leave it out', () => {
    const body = '<br><img src="a" alt=""><input><ul><li>a<li>b</ul><p>one<p>two<table><tr><td>a<td>b</table><select><option>a<option>b</select>';
    expect(parseHtml(PAGE(body)).errors).toEqual([]);
  });

  it('does not report a self-closing element of an inline SVG', () => {
    expect(parseHtml(PAGE('<svg><path d="M0 0"/><g></g></svg>')).errors).toEqual([]);
  });
});

describe('the DOM helpers', () => {
  const { document } = parseHtml(PAGE('<div class="a b"><p id="x" title="t">one <b>two</b></p><p>three</p></div><template><p>hidden</p></template>'));

  it('finds elements by tag name, in document order, and not inside a template', () => {
    expect(elements(document, 'p').map((p) => textOf(p))).toEqual(['one two', 'three']);
  });

  it('reads an attribute, or undefined', () => {
    const [first] = elements(document, 'p');
    expect(attr(first, 'id')).toBe('x');
    expect(attr(first, 'title')).toBe('t');
    expect(attr(first, 'lang')).toBeUndefined();
  });

  it('joins the text of an element and its children', () => {
    expect(textOf(elements(document, 'div')[0])).toBe('one twothree');
  });

  it('leaves out comments', () => {
    const { document: other } = parseHtml(PAGE('<p>a<!-- hidden -->b</p>'));
    expect(textOf(elements(other, 'p')[0])).toBe('ab');
  });
});

describe('routeOf', () => {
  it.each([
    ['index.html', '/'],
    ['status/index.html', '/status/'],
    ['news/a-b/receipts/index.html', '/news/a-b/receipts/'],
    ['404.html', '/404.html'],
  ])('%s is the page at %s', (file, route) => {
    expect(routeOf(file)).toBe(route);
  });
});

describe('siteFromFiles', () => {
  const site = siteFromFiles(
    {
      'status/index.html': PAGE('<p id="a">x</p>', '<style>.a{color:red}</style>'),
      'index.html': PAGE('<p style="color: blue">x</p>', '<link rel="canonical" href="https://news.example/">'),
      '_astro/Base.css': '.b{margin:0}',
      'robots.txt': 'User-agent: *',
    },
    ['news/x/card.png'],
  );

  it('lists the pages sorted by file, each with its route and its parse errors', () => {
    expect(site.pages.map((page) => [page.file, page.route, page.errors])).toEqual([
      ['index.html', '/', []],
      ['status/index.html', '/status/', []],
    ]);
  });

  it('lists every file, text or not, in paths, and keeps the text of the text files', () => {
    expect([...site.paths].sort()).toEqual(['_astro/Base.css', 'index.html', 'news/x/card.png', 'robots.txt', 'status/index.html']);
    expect(site.files.get('robots.txt')).toBe('User-agent: *');
    expect(site.files.has('news/x/card.png')).toBe(false);
  });

  it('collects stylesheets from CSS files, style elements and style attributes', () => {
    expect(site.stylesheets).toEqual([
      { where: '_astro/Base.css', css: '.b{margin:0}' },
      { where: 'index.html (style attribute)', css: 'x{color: blue}' },
      { where: 'status/index.html (style element)', css: '.a{color:red}' },
    ]);
  });

  it('lists CSS files sorted by path', () => {
    const sorted = siteFromFiles({ 'index.html': PAGE(''), 'b.css': '.b{}', 'a.css': '.a{}' });
    expect(sorted.stylesheets.map((sheet) => sheet.where)).toEqual(['a.css', 'b.css']);
  });

  it('takes the origin of the site from the canonical link of a page', () => {
    expect(site.origin).toBe('https://news.example');
  });

  it('falls back to a made-up origin when no page has a canonical link', () => {
    expect(siteFromFiles({ 'index.html': PAGE('') }).origin).toBe('https://site.invalid');
  });

  it('skips a canonical link that is not a full address', () => {
    const pages = { 'index.html': PAGE('', '<link rel="canonical" href="/relative/">'), 'a/index.html': PAGE('', '<link rel="canonical" href="https://later.example/a/">') };
    expect(siteFromFiles(pages).origin).toBe('https://later.example');
    expect(siteFromFiles({ 'index.html': pages['index.html'] }).origin).toBe('https://site.invalid');
  });

  it('collects the ids of a page', () => {
    expect([...idsOf(site.pages[1])]).toEqual(['a']);
  });
});

describe('loadSite', () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it('reads a folder into the same model', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'robywire-audit-'));
    folders.push(dir);
    mkdirSync(path.join(dir, 'news', 'x'), { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), PAGE('<p>x</p>'));
    writeFileSync(path.join(dir, 'news', 'x', 'card.png'), Buffer.from([0x89, 0x50]));
    writeFileSync(path.join(dir, 'style.css'), '.a{margin:0}');
    const site = loadSite(dir);
    expect(site.pages.map((page) => page.file)).toEqual(['index.html']);
    expect([...site.paths].sort()).toEqual(['index.html', 'news/x/card.png', 'style.css']);
    expect(site.stylesheets).toEqual([{ where: 'style.css', css: '.a{margin:0}' }]);
  });

  it('says to build the site first when the folder is missing', () => {
    expect(() => loadSite(path.join(tmpdir(), 'robywire-no-such-folder'))).toThrow('Build the site first');
  });

  it('says so when the folder holds no page', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'robywire-audit-'));
    folders.push(dir);
    expect(() => loadSite(dir)).toThrow('contains no HTML page');
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/audit-site.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/dom.mjs'`.

- [ ] **Step 4: Write the two modules**

**Create `site/scripts/audit/dom.mjs`:**
```js
import { parse } from 'parse5';

// A small reading interface over parse5's tree, so that the checks do not each
// walk it by hand.

/** @typedef {import('parse5').DefaultTreeAdapterMap['node']} Node */
/** @typedef {import('parse5').DefaultTreeAdapterMap['element']} Element */
/** @typedef {import('parse5').DefaultTreeAdapterMap['document']} Document */

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** Elements that never have an end tag. */
const VOID_ELEMENTS = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** Elements whose end tag the HTML standard lets a page leave out. */
const OPTIONAL_END_TAG = new Set(['body', 'caption', 'colgroup', 'dd', 'dt', 'head', 'html', 'li', 'optgroup', 'option', 'p', 'rp', 'rt', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);

/**
 * Parse an HTML document the way a browser does. The problems are the parse
 * errors that the HTML standard names (a missing doctype, a repeated
 * attribute, a null character and so on) and every element that was opened in
 * the source and never closed, with their positions.
 *
 * A browser silently drops an end tag that closes nothing, so a stray end tag
 * is not reported; the element it should have closed is.
 *
 * @param {string} html
 * @returns {{ document: Document, errors: string[] }}
 */
export function parseHtml(html) {
  /** @type {string[]} */
  const errors = [];
  const document = parse(html, {
    sourceCodeLocation: true,
    onParseError: (error) => errors.push(`${error.code} (line ${error.startLine}, column ${error.startCol})`),
  });
  for (const element of allElements(document)) {
    const location = element.sourceCodeLocation;
    if (location?.startTag === undefined || location.endTag !== undefined) continue;
    if (element.namespaceURI !== HTML_NAMESPACE || VOID_ELEMENTS.has(element.tagName) || OPTIONAL_END_TAG.has(element.tagName)) continue;
    errors.push(`unclosed-element <${element.tagName}> (line ${location.startLine}, column ${location.startCol})`);
  }
  return { document, errors };
}

/**
 * True for an element node.
 * @param {Node} node
 * @returns {node is Element}
 */
function isElement(node) {
  return 'tagName' in node;
}

/**
 * Every element below `root`, in document order. The content of a <template> is not part of the page and is skipped.
 * @param {Node} root
 * @returns {Element[]}
 */
export function allElements(root) {
  /** @type {Element[]} */
  const found = [];
  /** @param {Node} node */
  const visit = (node) => {
    if (isElement(node)) found.push(node);
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return found;
}

/**
 * The elements below `root` with the given tag name.
 * @param {Node} root
 * @param {string} tagName
 * @returns {Element[]}
 */
export function elements(root, tagName) {
  return allElements(root).filter((element) => element.tagName === tagName);
}

/**
 * The value of an attribute, or undefined when the element does not have it.
 * @param {Element} element
 * @param {string} name
 * @returns {string | undefined}
 */
export function attr(element, name) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

/**
 * The text inside a node: all its text descendants joined.
 * @param {Node} node
 * @returns {string}
 */
export function textOf(node) {
  if ('value' in node && node.nodeName === '#text') return node.value;
  if (!('childNodes' in node)) return '';
  return node.childNodes.map(textOf).join('');
}
```

**Create `site/scripts/audit/site.mjs`:**
```js
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { allElements, attr, elements, parseHtml, textOf } from './dom.mjs';

// The built site as the audit sees it: every file by its path inside dist/, the
// HTML pages parsed, and all the CSS in one list. The checks take this model
// and nothing else, so a test can build a small site from a few strings.

/**
 * @typedef {object} Page
 * @property {string} file  Path inside dist/, such as "news/a/index.html".
 * @property {string} route  The address of the page, such as "/news/a/".
 * @property {string} html
 * @property {import('./dom.mjs').Document} document
 * @property {string[]} errors  HTML parse errors.
 */

/**
 * @typedef {object} Sheet
 * @property {string} where  Where the CSS was found, for the report.
 * @property {string} css
 */

/**
 * @typedef {object} Site
 * @property {Map<string, string>} files  Text files by path.
 * @property {Set<string>} paths  Every file, text or not.
 * @property {Page[]} pages  Sorted by path.
 * @property {Sheet[]} stylesheets  CSS files, <style> elements and style attributes.
 * @property {string} origin  The address the site is built for, such as "https://robywire.example".
 */

/** The extensions whose files are read as text. */
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.svg', '.txt']);

/**
 * The address of the page in file `file`: "index.html" is "/", "a/index.html" is "/a/", "404.html" is "/404.html".
 * @param {string} file
 * @returns {string}
 */
export function routeOf(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

/**
 * Build the model from files given as text, keyed by their path inside dist/, and the paths of the files that are not text.
 * @param {Record<string, string>} textFiles
 * @param {string[]} [otherPaths]
 * @returns {Site}
 */
export function siteFromFiles(textFiles, otherPaths = []) {
  const files = new Map(Object.entries(textFiles));
  const paths = new Set([...files.keys(), ...otherPaths]);

  const pages = [...files.keys()]
    .filter((file) => file.endsWith('.html'))
    .sort()
    .map((file) => {
      const html = files.get(file) ?? '';
      const { document, errors } = parseHtml(html);
      return { file, route: routeOf(file), html, document, errors };
    });

  /** @type {Sheet[]} */
  const stylesheets = [...files.keys()]
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map((file) => ({ where: file, css: files.get(file) ?? '' }));
  for (const page of pages) {
    for (const style of elements(page.document, 'style')) stylesheets.push({ where: `${page.file} (style element)`, css: textOf(style) });
    for (const element of allElements(page.document)) {
      const inline = attr(element, 'style');
      if (inline !== undefined) stylesheets.push({ where: `${page.file} (style attribute)`, css: `x{${inline}}` });
    }
  }

  return { files, paths, pages, stylesheets, origin: originOf(pages) };
}

/**
 * The origin in the first canonical link of any page, or a made-up one.
 * @param {Page[]} pages
 * @returns {string}
 */
function originOf(pages) {
  for (const page of pages) {
    const link = elements(page.document, 'link').find((element) => attr(element, 'rel') === 'canonical');
    const href = link === undefined ? undefined : attr(link, 'href');
    if (href !== undefined && URL.canParse(href)) return new URL(href).origin;
  }
  return 'https://site.invalid';
}

/** @type {WeakMap<Page, Set<string>>} */
const idCache = new WeakMap();

/**
 * The ids of all the elements of a page.
 * @param {Page} page
 * @returns {Set<string>}
 */
export function idsOf(page) {
  let ids = idCache.get(page);
  if (ids === undefined) {
    ids = new Set(allElements(page.document).flatMap((element) => attr(element, 'id') ?? []));
    idCache.set(page, ids);
  }
  return ids;
}

/**
 * The paths of all the files under `dir`, relative to it and written with forward slashes.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listFiles(dir, prefix = '') {
  return readdirSync(path.join(dir, prefix)).flatMap((name) => {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    return statSync(path.join(dir, relative)).isDirectory() ? listFiles(dir, relative) : [relative];
  });
}

/**
 * Read a built site from a folder.
 * @param {string} dir
 * @returns {Site}
 */
export function loadSite(dir) {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist. Build the site first.`);
  /** @type {Record<string, string>} */
  const textFiles = {};
  /** @type {string[]} */
  const others = [];
  for (const file of listFiles(dir)) {
    if (TEXT_EXTENSIONS.has(path.extname(file))) textFiles[file] = readFileSync(path.join(dir, file), 'utf8');
    else others.push(file);
  }
  const site = siteFromFiles(textFiles, others);
  if (site.pages.length === 0) throw new Error(`${dir} contains no HTML page. Build the site first.`);
  return site;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/audit-site.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Try the model on the real site**

The fixture build from the last tasks is still in `site/dist`. Build it again to be sure, then load it.

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `node --input-type=module -e "import { loadSite } from './site/scripts/audit/site.mjs'; const site = loadSite('site/dist'); console.log('pages:', site.pages.length, 'origin:', site.origin, 'problems:', site.pages.flatMap((page) => page.errors).length);"`
Expected: PASS — `pages: 22 origin: https://robywire.example problems: 0`: the 21 pages and the 404 page, all of which parse with no errors.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json site/package.json site/scripts site/test/audit-site.test.ts
git commit -m "feat(site): read the built site into a model of pages, stylesheets and ids for the audit" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 62: Audit the markup: parsing, headings, metadata, images and the skip link

**Files:**
- Create: `site/scripts/audit/result.mjs`, `site/scripts/audit/checks-markup.mjs`
- Test: `site/test/audit.test.ts`

The audit is a list of checks. Each check is a pure function that takes the model of the site (last task) and returns `{ id, ok, problems }`, where `problems` has one sentence for each thing it found, starting with the file. `result(id, problems)` builds that object. This task writes the five checks that read the HTML:

- **A1** every page parses with no problems (the parse errors and unclosed elements of `parseHtml`).
- **A2** every page has exactly one `<h1>`.
- **A3** every page has a `lang` on `<html>` and a non-empty `<title>`, and every page except `404.html` has a meta description.
- **A4** no page has an `<img>` element, and no CSS loads a file with `url()`. Graphics are inline SVG.
- **A10** the first link in the `<body>` of every page is the skip link: `href="#main"` with the class `skip-link`.

Every check is tested twice, with a small page it must accept and a small page it must reject, and the rejection must name the file and say what is wrong. `page(body, options)` in the test builds a page that passes every check, so a test breaks exactly one thing.

- [ ] **Step 1: Write the failing test**

**Create `site/test/audit.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

// Every check of the audit is tested twice: with a snippet it must accept and
// with a snippet it must reject, and the rejection must say which file and
// what is wrong. The snippets are small pages built here.

interface PageOptions {
  title?: string;
  lang?: string | null;
  description?: string | null;
  head?: string;
  skip?: boolean;
}

/** A page that passes every check, with the changes in `options`. */
function page(body: string, options: PageOptions = {}): string {
  const { title = 'A page', lang = 'en', description = 'About the page.', head = '', skip = true } = options;
  return [
    '<!doctype html>',
    `<html${lang === null ? '' : ` lang="${lang}"`}>`,
    '<head><meta charset="utf-8">',
    `<title>${title}</title>`,
    description === null ? '' : `<meta name="description" content="${description}">`,
    head,
    '</head>',
    `<body>${skip ? '<a class="skip-link" href="#main">Skip</a>' : ''}<main id="main">${body}</main></body></html>`,
  ].join('');
}

const site = (files: Record<string, string>, others: string[] = []) => siteFromFiles(files, others);
const ok = (id: string) => ({ id, ok: true, problems: [] });

describe('A1 checkHtmlParses', () => {
  it('accepts pages that parse with no problems', () => {
    expect(checkHtmlParses(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A1'));
  });

  it('rejects a page with a repeated attribute, naming the file and the position', () => {
    const result = checkHtmlParses(site({ 'index.html': page('<h1>x</h1>'), 'a/index.html': page('<a href="x" href="y">l</a>') }));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.stringMatching(/^a\/index\.html: duplicate-attribute \(line 1, column \d+\)$/)]);
  });

  it('rejects an element that is never closed', () => {
    const result = checkHtmlParses(site({ 'index.html': page('<div><h1>x</h1>') }));
    expect(result.problems).toEqual([expect.stringMatching(/^index\.html: unclosed-element <div> /)]);
  });

  it('rejects a page with no doctype', () => {
    const result = checkHtmlParses(site({ 'index.html': '<html lang="en"><head><title>T</title></head><body></body></html>' }));
    expect(result.problems[0]).toContain('missing-doctype');
  });
});

describe('A2 checkOneHeading', () => {
  it('accepts a page with exactly one h1', () => {
    expect(checkOneHeading(site({ 'index.html': page('<h1>x</h1><h2>y</h2>') }))).toEqual(ok('A2'));
  });

  it('rejects a page with no h1', () => {
    expect(checkOneHeading(site({ 'index.html': page('<h2>y</h2>') }))).toEqual({
      id: 'A2',
      ok: false,
      problems: ['index.html: has 0 <h1> elements; a page needs exactly 1'],
    });
  });

  it('rejects a page with two', () => {
    expect(checkOneHeading(site({ 'a/index.html': page('<h1>x</h1><h1>y</h1>') })).problems).toEqual(['a/index.html: has 2 <h1> elements; a page needs exactly 1']);
  });
});

describe('A3 checkMetadata', () => {
  it('accepts a page with a language, a title and a description', () => {
    expect(checkMetadata(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A3'));
  });

  it.each([
    ['no lang', { lang: null }, 'index.html: <html> has no lang attribute'],
    ['an empty lang', { lang: '' }, 'index.html: <html> has no lang attribute'],
    ['a blank lang', { lang: '  ' }, 'index.html: <html> has no lang attribute'],
    ['an empty title', { title: '  ' }, 'index.html: the <title> is empty'],
    ['no description', { description: null }, 'index.html: has no meta description'],
    ['an empty description', { description: '' }, 'index.html: has no meta description'],
    ['a blank description', { description: '   ' }, 'index.html: has no meta description'],
  ])('rejects a page with %s', (_name, options, problem) => {
    expect(checkMetadata(site({ 'index.html': page('<h1>x</h1>', options) })).problems).toEqual([problem]);
  });

  it('rejects a page with no title element at all', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="description" content="d"></head><body></body></html>';
    expect(checkMetadata(site({ 'index.html': html })).problems).toEqual(['index.html: the <title> is empty']);
  });

  it('does not ask the 404 page for a description, but does ask it for a language and a title', () => {
    expect(checkMetadata(site({ '404.html': page('<h1>x</h1>', { description: null }) }))).toEqual(ok('A3'));
    expect(checkMetadata(site({ '404.html': page('<h1>x</h1>', { description: null, lang: null, title: '' }) })).problems).toEqual([
      '404.html: <html> has no lang attribute',
      '404.html: the <title> is empty',
    ]);
  });
});

describe('A4 checkNoImages', () => {
  it('accepts pages with inline SVG and no image element', () => {
    expect(checkNoImages(site({ 'index.html': page('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>') }))).toEqual(ok('A4'));
  });

  it('rejects an <img> element, and says which file it is in', () => {
    expect(checkNoImages(site({ 'a/index.html': page('<p><img src="/x.png" alt=""></p>') }))).toEqual({
      id: 'A4',
      ok: false,
      problems: ['a/index.html: has an <img> element'],
    });
  });

  it('rejects a CSS rule that loads a file with url()', () => {
    const result = checkNoImages(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{background-image:url(/x.png)}' }));
    expect(result.problems).toEqual(['_astro/a.css: loads a file with url()']);
  });

  it('accepts CSS that has no url()', () => {
    expect(checkNoImages(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{background:var(--paper)}' }))).toEqual(ok('A4'));
  });
});

describe('A10 checkSkipLink', () => {
  it('accepts a page whose first link is the skip link to #main', () => {
    expect(checkSkipLink(site({ 'index.html': page('<h1>x</h1><a href="/">home</a>') }))).toEqual(ok('A10'));
  });

  it('rejects a page with no skip link', () => {
    expect(checkSkipLink(site({ 'index.html': page('<h1>x</h1><a href="/">home</a>', { skip: false }) })).problems).toEqual([
      'index.html: the first link in <body> is "/", not the skip link to #main',
    ]);
  });

  it('rejects a page where another link comes first', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a href="/">home</a><a class="skip-link" href="#main">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "/", not the skip link to #main']);
  });

  it('rejects a skip link that does not point at #main', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a class="skip-link" href="#content">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "#content", not the skip link to #main']);
  });

  it('rejects a link to #main that is not marked as the skip link', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a href="#main">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "#main", not the skip link to #main']);
  });

  it('rejects a page with no link at all', () => {
    const html = '<!doctype html><html lang="en"><head><title>T</title></head><body><p>x</p></body></html>';
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: has no links, so no skip link']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/checks-markup.mjs'`.

- [ ] **Step 3: Write the checks**

**Create `site/scripts/audit/result.mjs`:**
```js
/**
 * What a check returns: its id, whether the site passed, and one sentence for
 * each problem that starts with the file it was found in.
 *
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {boolean} ok
 * @property {string[]} problems
 */

/**
 * @param {string} id
 * @param {string[]} problems
 * @returns {CheckResult}
 */
export function result(id, problems) {
  return { id, ok: problems.length === 0, problems };
}
```

**Create `site/scripts/audit/checks-markup.mjs`:**
```js
import { attr, elements, textOf } from './dom.mjs';
import { result } from './result.mjs';

// The checks that read the HTML of each page. Every check takes the model of
// the site (see site.mjs) and returns { id, ok, problems }.

/** The page that is exempt from the description check. */
const NOT_FOUND_PAGE = '404.html';

/**
 * A1: every page parses with no errors, and no element is left open.
 * @param {import('./site.mjs').Site} site
 */
export function checkHtmlParses(site) {
  return result(
    'A1',
    site.pages.flatMap((page) => page.errors.map((error) => `${page.file}: ${error}`)),
  );
}

/**
 * A2: every page has exactly one <h1>.
 * @param {import('./site.mjs').Site} site
 */
export function checkOneHeading(site) {
  return result(
    'A2',
    site.pages.flatMap((page) => {
      const count = elements(page.document, 'h1').length;
      return count === 1 ? [] : [`${page.file}: has ${count} <h1> elements; a page needs exactly 1`];
    }),
  );
}

/**
 * A3: every page has a language and a title, and every page except the 404 page has a meta description.
 * @param {import('./site.mjs').Site} site
 */
export function checkMetadata(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    const [root] = elements(page.document, 'html');
    if ((root === undefined ? '' : (attr(root, 'lang') ?? '')).trim() === '') problems.push(`${page.file}: <html> has no lang attribute`);

    const [title] = elements(page.document, 'title');
    if (title === undefined || textOf(title).trim() === '') problems.push(`${page.file}: the <title> is empty`);

    if (page.file === NOT_FOUND_PAGE) continue;
    const description = elements(page.document, 'meta').find((meta) => attr(meta, 'name') === 'description');
    if ((description === undefined ? '' : (attr(description, 'content') ?? '')).trim() === '') problems.push(`${page.file}: has no meta description`);
  }
  return result('A3', problems);
}

/**
 * A4: no page has an <img> element and no CSS loads a file with url(). Graphics are inline SVG.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoImages(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    if (elements(page.document, 'img').length > 0) problems.push(`${page.file}: has an <img> element`);
  }
  for (const sheet of site.stylesheets) {
    if (/url\(/i.test(sheet.css)) problems.push(`${sheet.where}: loads a file with url()`);
  }
  return result('A4', problems);
}

/**
 * A10: the first link in the <body> of every page is the skip link to #main.
 * @param {import('./site.mjs').Site} site
 */
export function checkSkipLink(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    const [body] = elements(page.document, 'body');
    const [first] = body === undefined ? [] : elements(body, 'a');
    if (first === undefined) {
      problems.push(`${page.file}: has no links, so no skip link`);
      continue;
    }
    const href = attr(first, 'href') ?? '';
    const isSkipLink = href === '#main' && (attr(first, 'class') ?? '').split(/\s+/).includes('skip-link');
    if (!isSkipLink) problems.push(`${page.file}: the first link in <body> is "${href}", not the skip link to #main`);
  }
  return result('A10', problems);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Run the checks on the real site**

The fixture build is still in `site/dist`.

Run: `node --input-type=module -e "import { loadSite } from './site/scripts/audit/site.mjs'; import * as m from './site/scripts/audit/checks-markup.mjs'; const site = loadSite('site/dist'); for (const check of [m.checkHtmlParses, m.checkOneHeading, m.checkMetadata, m.checkNoImages, m.checkSkipLink]) console.log(JSON.stringify(check(site)));"`
Expected: PASS — five lines, one for each check, each `"ok":true,"problems":[]`: `{"id":"A1","ok":true,"problems":[]}` to `{"id":"A10","ok":true,"problems":[]}`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts site/test/audit.test.ts
git commit -m "feat(site): audit that pages parse, have one h1, have metadata, use no images and start with the skip link" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 63: Audit the CSS: italics, fonts, hairlines and colours

**Files:**
- Create: `site/scripts/audit/checks-style.mjs`
- Modify: `site/test/audit.test.ts` (tests for four more checks)

Four checks that read the CSS of the built site, which is the files in `_astro/`, the `<style>` elements and the `style` attributes (the model puts all three in `site.stylesheets`).

- **A5** no italics. No `<i>` or `<em>` element, and none of the elements that browsers set in italics unless a stylesheet says otherwise (`cite`, `dfn`, `address`, `var`), and no CSS that sets `font-style: italic`.
- **A6** no web fonts. No `@font-face`, no request to a font host (Google Fonts, Typekit and so on), no `<link as="font">` preload, and no font file in the build.
- **A7** the hairline law. No border wider than one pixel and no rounded corner, using the detector of Task 60.
- **A12** the colour law. Every colour in the CSS, and in the SVG files (the fact cards), is one of the colours that `tokens.css` defines. Colours are compared as lowercase six-digit hex, because the build minifies them (`#FFFFFF` becomes `#fff`). A colour with an alpha channel is a different colour. A colour written as a function (`rgb()`, `hsl()`) is not a token. Only the inside of rule blocks is read, so an id selector such as `#add` is not mistaken for a colour. The check takes the text of `tokens.css` as a second argument, and refuses a tokens file that defines no colour, because every colour would then be wrong.

- [ ] **Step 1: Write the failing tests**

Add the import and the tests for the four checks.

**In `site/test/audit.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

// Every check of the audit is tested twice: with a snippet it must accept and
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

// Every check of the audit is tested twice: with a snippet it must accept and
```

**In `site/test/audit.test.ts`, replace:**
```ts
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: has no links, so no skip link']);
  });
});
```

**with:**
```ts
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: has no links, so no skip link']);
  });
});

describe('A5 checkNoItalics', () => {
  it('accepts pages and CSS without italics', () => {
    expect(checkNoItalics(site({ 'index.html': page('<p>x <strong>y</strong></p>'), '_astro/a.css': '.a{font-style:normal}' }))).toEqual(ok('A5'));
  });

  it.each([
    ['an <em> element', '<p>a <em>b</em></p>', 'index.html: has an <em> element'],
    ['an <i> element', '<p>a <i>b</i></p>', 'index.html: has an <i> element'],
    ['a <cite> element, which browsers set in italics', '<p><cite>b</cite></p>', 'index.html: has a <cite> element, which browsers set in italics'],
    ['a <dfn> element', '<p><dfn>b</dfn></p>', 'index.html: has a <dfn> element, which browsers set in italics'],
    ['a style attribute', '<p style="font-style: italic">b</p>', 'index.html (style attribute): uses font-style: italic'],
  ])('rejects %s', (_name, body, problem) => {
    expect(checkNoItalics(site({ 'index.html': page(body) })).problems).toEqual([problem]);
  });

  it('rejects italics in a CSS file, in minified form too', () => {
    expect(checkNoItalics(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{font-style:italic}' })).problems).toEqual(['_astro/a.css: uses font-style: italic']);
  });

  it('rejects italics in a style element', () => {
    const html = page('<h1>x</h1>', { head: '<style>.a{font-style:italic}</style>' });
    expect(checkNoItalics(site({ 'index.html': html })).problems).toEqual(['index.html (style element): uses font-style: italic']);
  });
});

describe('A6 checkNoWebFonts', () => {
  it('accepts pages that use system fonts only', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': 'body{font-family:-apple-system,Arial,sans-serif}' }))).toEqual(ok('A6'));
  });

  it('rejects @font-face', () => {
    const css = '@font-face{font-family:X;src:local(X)}';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual(['_astro/a.css: declares a web font with @font-face']);
  });

  it('rejects a stylesheet from Google Fonts', () => {
    const head = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>', { head }) })).problems).toEqual(['index.html: loads from fonts.googleapis.com']);
  });

  it('rejects a font host named in CSS', () => {
    const css = '@import "https://fonts.gstatic.com/x.css";';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual(['_astro/a.css: loads from fonts.gstatic.com']);
  });

  it('rejects a link that preloads a font', () => {
    const head = '<link rel="preload" href="/f.woff2" as="font" type="font/woff2" crossorigin>';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>', { head }) })).problems).toContain('index.html: preloads a font');
  });

  it('rejects a font file in the build', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>') }, ['fonts/inter.woff2'])).problems).toEqual(['fonts/inter.woff2: is a font file']);
  });

  it('lists font files in order of their path', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>') }, ['fonts/b.woff2', 'fonts/a.ttf'])).problems).toEqual(['fonts/a.ttf: is a font file', 'fonts/b.woff2: is a font file']);
  });
});

describe('A7 checkHairlines', () => {
  it('accepts one-pixel borders and square corners', () => {
    const css = '*{border-radius:0}.a{border:1px solid var(--line);outline:2px solid red}';
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css }))).toEqual(ok('A7'));
  });

  it('rejects a border wider than a pixel', () => {
    const css = '.a{border-top:2px solid var(--line)}';
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual([
      '_astro/a.css: has a border wider than 1px: border-top:2px solid var(--line)',
    ]);
  });

  it('rejects a rounded corner in a style element', () => {
    const html = page('<h1>x</h1>', { head: '<style>.a{border-radius:4px}</style>' });
    expect(checkHairlines(site({ 'index.html': html })).problems).toEqual(['index.html (style element): has a rounded corner: border-radius:4px']);
  });

  it('does not report italics, which are A5\'s', () => {
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{font-style:italic}' }))).toEqual(ok('A7'));
  });
});

describe('A12 checkColourLaw', () => {
  const tokens = ':root{--bg:#FFFFFF;--t1:#14181D;--link:#1B66DF}@media (prefers-color-scheme:dark){:root{--bg:#0F1216}}/* once #123456 */';
  const withCss = (css: string, others: Record<string, string> = {}) => site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css, ...others });

  it('accepts the colours of the tokens, in any case and in short form', () => {
    expect(checkColourLaw(withCss('a{color:#14181d;background:#fff;border-color:#0F1216}.b{fill:#1B66DF}'), tokens)).toEqual(ok('A12'));
  });

  it('accepts a page with no colour at all', () => {
    expect(checkColourLaw(withCss('a{color:var(--link);margin:0}'), tokens)).toEqual(ok('A12'));
  });

  it('rejects a colour that is not a token', () => {
    expect(checkColourLaw(withCss('a{color:#ff0000}'), tokens).problems).toEqual(['_astro/a.css: #ff0000 is not a colour of the design tokens']);
  });

  it('expands short colours before it compares: #f00 is #ff0000', () => {
    expect(checkColourLaw(withCss('a{color:#f00}'), tokens).problems).toEqual(['_astro/a.css: #ff0000 is not a colour of the design tokens']);
  });

  it('does not count a colour that is only mentioned in a comment of the tokens file', () => {
    expect(checkColourLaw(withCss('a{color:#123456}'), tokens).problems).toEqual(['_astro/a.css: #123456 is not a colour of the design tokens']);
  });

  it('rejects a colour with an alpha channel, which is a different colour', () => {
    expect(checkColourLaw(withCss('a{color:#14181dcc}'), tokens).problems).toEqual(['_astro/a.css: #14181dcc is not a colour of the design tokens']);
  });

  it('reads colours of four and eight digits, which have an alpha channel and are never a token', () => {
    expect(checkColourLaw(withCss('a{color:#f00f}.b{color:#00000000}'), tokens).problems).toEqual([
      '_astro/a.css: #ff0000ff is not a colour of the design tokens',
      '_astro/a.css: #00000000 is not a colour of the design tokens',
    ]);
  });

  it('reads a function colour written in capitals', () => {
    expect(checkColourLaw(withCss('a{color:RGB(0 0 0)}'), tokens).problems).toEqual(['_astro/a.css: rgb() is not a colour of the design tokens']);
  });

  it('rejects colours written as functions', () => {
    expect(checkColourLaw(withCss('a{color:rgb(20 24 29)}.b{color:hsla(0,0%,0%,.5)}'), tokens).problems).toEqual([
      '_astro/a.css: rgb() is not a colour of the design tokens',
      '_astro/a.css: hsla() is not a colour of the design tokens',
    ]);
  });

  it('reads style elements and style attributes too', () => {
    const html = page('<p style="color:#00ff00">x</p>', { head: '<style>.a{color:#ff00ff}</style>' });
    expect(checkColourLaw(site({ 'index.html': html }), tokens).problems).toEqual([
      'index.html (style element): #ff00ff is not a colour of the design tokens',
      'index.html (style attribute): #00ff00 is not a colour of the design tokens',
    ]);
  });

  it('reads SVG files, such as the fact cards', () => {
    expect(checkColourLaw(withCss('a{margin:0}', { 'news/a/card.svg': '<svg><rect fill="#FFFFFF" stroke="#1B66DF"/></svg>' }), tokens)).toEqual(ok('A12'));
    expect(checkColourLaw(withCss('a{margin:0}', { 'news/a/card.svg': '<svg><rect fill="#ABCDEF"/></svg>' }), tokens).problems).toEqual([
      'news/a/card.svg: #abcdef is not a colour of the design tokens',
    ]);
  });

  it('does not take an id selector for a colour', () => {
    expect(checkColourLaw(withCss('#add{margin:0}#bad .x{margin:0}'), tokens)).toEqual(ok('A12'));
  });

  it('reports a colour once for each place, however often it appears there', () => {
    expect(checkColourLaw(withCss('a{color:#ff0000}b{color:#FF0000}'), tokens).problems).toHaveLength(1);
  });

  it('refuses a tokens file that defines no colour, because every colour would then be wrong', () => {
    expect(() => checkColourLaw(withCss('a{margin:0}'), '/* nothing */')).toThrow('defines no colour');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/checks-style.mjs'`.

- [ ] **Step 3: Write the checks**

**Create `site/scripts/audit/checks-style.mjs`:**
```js
import { cssViolations } from './css-rules.mjs';
import { allElements, attr, elements } from './dom.mjs';
import { result } from './result.mjs';

// The checks that read the CSS of the built site: the files in _astro/, the
// <style> elements and the style attributes. Every check takes the model of the
// site (see site.mjs) and returns { id, ok, problems }.

/** Elements that browsers set in italics unless a stylesheet says otherwise. */
const ITALIC_ELEMENTS = {
  i: 'an <i> element',
  em: 'an <em> element',
  cite: 'a <cite> element, which browsers set in italics',
  dfn: 'a <dfn> element, which browsers set in italics',
  address: 'an <address> element, which browsers set in italics',
  var: 'a <var> element, which browsers set in italics',
};

/**
 * A5: no italics: no <i> or <em> element (or another that browsers set in italics), and no CSS that sets italic text.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoItalics(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    for (const [tag, description] of Object.entries(ITALIC_ELEMENTS)) {
      if (elements(page.document, tag).length > 0) problems.push(`${page.file}: has ${description}`);
    }
  }
  for (const sheet of site.stylesheets) {
    for (const violation of cssViolations(sheet.css)) {
      if (violation.rule === 'italic') problems.push(`${sheet.where}: ${violation.message}`);
    }
  }
  return result('A5', problems);
}

/** Hosts that serve web fonts. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net', 'fonts.bunny.net', 'use.fontawesome.com'];

const FONT_FILE = /\.(woff2?|ttf|otf|eot)$/i;

/**
 * A6: no web fonts: no @font-face, no request to a font host, no font preload and no font file in the build.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoWebFonts(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    for (const element of allElements(page.document)) {
      const address = `${attr(element, 'href') ?? ''} ${attr(element, 'src') ?? ''}`;
      for (const host of FONT_HOSTS) {
        if (address.includes(host)) problems.push(`${page.file}: loads from ${host}`);
      }
      if (element.tagName === 'link' && attr(element, 'as') === 'font') problems.push(`${page.file}: preloads a font`);
    }
  }
  for (const sheet of site.stylesheets) {
    for (const violation of cssViolations(sheet.css)) {
      if (violation.rule === 'font-face') problems.push(`${sheet.where}: ${violation.message}`);
    }
    for (const host of FONT_HOSTS) {
      if (sheet.css.includes(host)) problems.push(`${sheet.where}: loads from ${host}`);
    }
  }
  for (const file of [...site.paths].sort()) {
    if (FONT_FILE.test(file)) problems.push(`${file}: is a font file`);
  }
  return result('A6', problems);
}

/**
 * A7: the hairline law: no border wider than one pixel and no rounded corner.
 * @param {import('./site.mjs').Site} site
 */
export function checkHairlines(site) {
  return result(
    'A7',
    site.stylesheets.flatMap((sheet) =>
      cssViolations(sheet.css)
        .filter((violation) => violation.rule === 'border' || violation.rule === 'radius')
        .map((violation) => `${sheet.where}: ${violation.message}`),
    ),
  );
}

/**
 * The colours the tokens file declares, as lowercase six-digit hex.
 * @param {string} tokensCss
 * @returns {Set<string>}
 */
function tokenColours(tokensCss) {
  const source = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...source.matchAll(/--[a-z0-9-]+\s*:\s*(#[0-9a-f]{3,8})(?![0-9a-z])/gi)].map((match) => normaliseHex(match[1])));
}

/**
 * A hex colour in lowercase with its short form expanded: "#FFF" is "#ffffff".
 * @param {string} hex
 * @returns {string}
 */
function normaliseHex(hex) {
  const lower = hex.toLowerCase();
  if (lower.length === 4 || lower.length === 5) return `#${[...lower.slice(1)].map((digit) => digit + digit).join('')}`;
  return lower;
}

const HEX_COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/gi;
const FUNCTION_COLOUR = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

/**
 * The colours written in some CSS, as normalised hex or as "rgb()". Only the inside of rule blocks is read, so an id selector such as #add is not a colour.
 * @param {string} css
 * @returns {string[]}
 */
function coloursIn(css) {
  const declarations = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{[^{}]*\}/g) ?? []).join(' ');
  return [...declarations.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])).concat([...declarations.matchAll(FUNCTION_COLOUR)].map((match) => `${match[1].toLowerCase()}()`));
}

/**
 * A12: the colour law: every colour in the CSS, and in the SVG files, is one of the colours the tokens file defines.
 * @param {import('./site.mjs').Site} site
 * @param {string} tokensCss  The text of src/styles/tokens.css.
 */
export function checkColourLaw(site, tokensCss) {
  const allowed = tokenColours(tokensCss);
  if (allowed.size === 0) throw new Error('checkColourLaw: the tokens file defines no colour, so there is nothing to check the site against');

  /** @type {{ where: string, colours: string[] }[]} */
  const places = site.stylesheets.map((sheet) => ({ where: sheet.where, colours: coloursIn(sheet.css) }));
  for (const [file, text] of site.files) {
    if (file.endsWith('.svg')) places.push({ where: file, colours: [...text.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])) });
  }

  /** @type {string[]} */
  const problems = [];
  for (const place of places) {
    for (const colour of new Set(place.colours)) {
      if (!allowed.has(colour)) problems.push(`${place.where}: ${colour} is not a colour of the design tokens`);
    }
  }
  return result('A12', problems);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Run the checks on the real site**

Run: `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { loadSite } from './site/scripts/audit/site.mjs'; import * as s from './site/scripts/audit/checks-style.mjs'; const site = loadSite('site/dist'); const tokens = readFileSync('site/src/styles/tokens.css', 'utf8'); for (const r of [s.checkNoItalics(site), s.checkNoWebFonts(site), s.checkHairlines(site), s.checkColourLaw(site, tokens)]) console.log(JSON.stringify(r));"`
Expected: PASS — four lines, `{"id":"A5","ok":true,"problems":[]}`, `A6`, `A7` and `{"id":"A12","ok":true,"problems":[]}`. The minified CSS of the real site keeps all four rules.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts site/test/audit.test.ts
git commit -m "feat(site): audit that the built CSS has no italics, web fonts, wide borders, rounded corners or colours outside the tokens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 64: Audit the links: internal links, receipts pages and claim markers

**Files:**
- Create: `site/scripts/audit/checks-links.mjs`
- Modify: `site/test/audit.test.ts` (tests for three more checks)

Three checks about how pages point at each other. They need one thing the others do not: to know where an address on a page leads. `resolveInternal(site, page, value)` resolves an address against the route of the page it is written on, and returns the file it names and its fragment, or `undefined` for an address that leads somewhere else (another origin, `mailto:`, `data:`, `javascript:`). An absolute address on the site's own origin counts as internal, so canonical links and share images are checked too.

- **A8** every internal address resolves to a file in the build, and every `#fragment` is the id of an element on the page it points at. The addresses are the `href` and `src` attributes and the `content` of the `og:image`, `og:url` and `twitter:image` meta tags. A folder written without its trailing slash does not resolve, and the message says to add it. A problem is reported once for a page however often it occurs.
- **A9** every article page (`news/<slug>/index.html`) links to its receipts page, the receipts page exists, both have a canonical link that points at the page itself, and the article has structured data that parses as JSON and has the type `NewsArticle`.
- **A11** every claim marker in an article (a link to a fragment of a receipts page) points at the receipts page of the same article, at a claim anchor like `#c-1`, that exists on that page; and an article has at least one marker. The plain link to the receipts page has no fragment and is not a marker.

- [ ] **Step 1: Write the failing tests**

**In `site/test/audit.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

```

**In `site/test/audit.test.ts`, replace:**
```ts
    expect(() => checkColourLaw(withCss('a{margin:0}'), '/* nothing */')).toThrow('defines no colour');
  });
});
```

**with:**
```ts
    expect(() => checkColourLaw(withCss('a{margin:0}'), '/* nothing */')).toThrow('defines no colour');
  });
});

describe('A8 checkInternalLinks', () => {
  const home = (body: string, head = '') => page(body, { head: `<link rel="canonical" href="https://news.example/">${head}` });

  it('accepts links to pages, to files and to ids that exist', () => {
    const files = {
      'index.html': home('<a href="/status/">s</a><a href="/status/#facts">f</a><a href="#main">m</a><a href="/rss.xml">r</a>', '<link rel="stylesheet" href="/_astro/a.css">'),
      'status/index.html': page('<h1 id="facts">x</h1>'),
      '_astro/a.css': 'a{margin:0}',
      'rss.xml': '<rss/>',
    };
    expect(checkInternalLinks(site(files))).toEqual(ok('A8'));
  });

  it('ignores addresses that point away from the site', () => {
    const body = '<a href="https://other.example/x">a</a><a href="mailto:me@example.org">m</a><a href="//cdn.example/x.js">c</a><a href="data:,">d</a><a href="javascript:void(0)">j</a>';
    expect(checkInternalLinks(site({ 'index.html': home(body) }))).toEqual(ok('A8'));
  });

  it('rejects a link to a page that does not exist', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="/missing/">m</a>') }))).toEqual({
      id: 'A8',
      ok: false,
      problems: ['index.html: <a href="/missing/"> does not match any file in the build'],
    });
  });

  it('rejects a link to a folder written without its trailing slash, and says so', () => {
    const files = { 'index.html': home('<a href="/status">s</a>'), 'status/index.html': page('<h1>x</h1>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/status"> does not match any file in the build; the folder needs a trailing slash']);
  });

  it('rejects a link to an id that is not on the page it points at', () => {
    const files = { 'index.html': home('<a href="/status/#nope">s</a>'), 'status/index.html': page('<h1 id="facts">x</h1>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/status/#nope"> points at #nope, which is not an id on that page']);
  });

  it('rejects a link to an id on its own page that does not exist', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="#nope">s</a>') })).problems).toEqual(['index.html: <a href="#nope"> points at #nope, which is not an id on that page']);
  });

  it('rejects a link with a fragment into a file that is not a page', () => {
    const files = { 'index.html': home('<a href="/rss.xml#x">r</a>'), 'rss.xml': '<rss/>' };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/rss.xml#x"> points at #x in a file that is not a page']);
  });

  it('rejects a stylesheet, script or image address that does not exist', () => {
    const head = '<link rel="stylesheet" href="/_astro/gone.css"><script src="/gone.js"></script>';
    expect(checkInternalLinks(site({ 'index.html': home('<h1>x</h1>', head) })).problems).toEqual([
      'index.html: <link href="/_astro/gone.css"> does not match any file in the build',
      'index.html: <script src="/gone.js"> does not match any file in the build',
    ]);
  });

  it('follows an absolute address on the same origin, such as a canonical link or a share image', () => {
    const head = '<meta property="og:image" content="https://news.example/news/a/card.png"><meta property="og:url" content="https://news.example/gone/">';
    const result = checkInternalLinks(site({ 'index.html': home('<h1>x</h1>', head) }, ['news/a/card.png']));
    expect(result.problems).toEqual(['index.html: <meta og:url content="https://news.example/gone/"> does not match any file in the build']);
  });

  it('works for a site whose origin is http as well as https', () => {
    const html = page('<a href="/gone/">g</a><a href="/">h</a><a href="https://news.example/">https</a>', { head: '<link rel="canonical" href="http://news.example/">' });
    expect(checkInternalLinks(site({ 'index.html': html })).problems).toEqual(['index.html: <a href="/gone/"> does not match any file in the build']);
  });

  it('ignores a query string and resolves a relative address against the page', () => {
    const files = { 'index.html': home('<a href="/status/?q=1">s</a>'), 'status/index.html': page('<a href="../">up</a><a href="missing/">m</a>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['status/index.html: <a href="missing/"> does not match any file in the build']);
  });

  it('reports the same problem once for a page, however often it occurs', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="/m/">1</a><a href="/m/">2</a>') })).problems).toHaveLength(1);
  });
});

describe('A9 checkArticlePages', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const ldJson = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const canonical = (route: string) => `<link rel="canonical" href="https://news.example${route}">`;
  const goodArticle = (head = `${canonical(`/news/${SLUG}/`)}${ldJson({ '@type': 'NewsArticle', headline: 'H' })}`, body = `<h1>x</h1><a href="/news/${SLUG}/receipts/">receipts</a>`) =>
    page(body, { head });
  const good = () => ({ [ARTICLE]: goodArticle(), [RECEIPTS]: page('<h1>r</h1>', { head: canonical(`/news/${SLUG}/receipts/`) }) });

  it('accepts an article that links to its receipts, has a canonical link and has NewsArticle data', () => {
    expect(checkArticlePages(site(good()))).toEqual(ok('A9'));
  });

  it('accepts a site with no article, such as a production build with no pieces', () => {
    expect(checkArticlePages(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A9'));
  });

  it('rejects an article that does not link to its receipts page', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(undefined, '<h1>x</h1>') };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: does not link to its receipts page`]);
  });

  it('rejects an article whose receipts page is missing', () => {
    const files = good();
    delete (files as Record<string, string>)[RECEIPTS];
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: its receipts page ${RECEIPTS} does not exist`]);
  });

  it('rejects an article with no canonical link', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(ldJson({ '@type': 'NewsArticle' })) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: has no canonical link`]);
  });

  it('rejects a canonical link that points at another page', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(`${canonical('/news/other/')}${ldJson({ '@type': 'NewsArticle' })}`) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: the canonical link points at /news/other/, not at /news/${SLUG}/`]);
  });

  it('rejects an article with no structured data, or data of another type', () => {
    const none = { ...good(), [ARTICLE]: goodArticle(canonical(`/news/${SLUG}/`)) };
    expect(checkArticlePages(site(none)).problems).toEqual([`${ARTICLE}: has no NewsArticle structured data`]);
    const other = { ...good(), [ARTICLE]: goodArticle(`${canonical(`/news/${SLUG}/`)}${ldJson({ '@type': 'WebPage' })}`) };
    expect(checkArticlePages(site(other)).problems).toEqual([`${ARTICLE}: has no NewsArticle structured data`]);
  });

  it('rejects structured data that is not valid JSON', () => {
    const head = `${canonical(`/news/${SLUG}/`)}<script type="application/ld+json">{not json</script>`;
    const files = { ...good(), [ARTICLE]: goodArticle(head) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: its structured data is not valid JSON`, `${ARTICLE}: has no NewsArticle structured data`]);
  });

  it('rejects a receipts page with no canonical link', () => {
    const files = { ...good(), [RECEIPTS]: page('<h1>r</h1>') };
    expect(checkArticlePages(site(files)).problems).toEqual([`${RECEIPTS}: has no canonical link`]);
  });
});

describe('A11 checkClaimMarkers', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const marker = (n: number, slug = SLUG, claim = `c-${n}`) => `<a href="/news/${slug}/receipts/#${claim}">${n}</a>`;
  const receipts = (...ids: string[]) => page(`<h1>r</h1>${ids.map((id) => `<article class="receipt" id="${id}">x</article>`).join('')}`);
  const files = (body: string, ...ids: string[]) => ({ [ARTICLE]: page(`<h1>x</h1><div class="prose"><p>${body}</p></div>`), [RECEIPTS]: receipts(...ids) });

  it('accepts markers that point at claims on the receipts page of the same article', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}${marker(2)}. Two${marker(1)}.`, 'c-1', 'c-2')))).toEqual(ok('A11'));
  });

  it('accepts a site with no article', () => {
    expect(checkClaimMarkers(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A11'));
  });

  it('rejects a marker whose claim is not on the receipts page', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}${marker(9)}.`, 'c-1'))).problems).toEqual([
      `${ARTICLE}: the marker "/news/${SLUG}/receipts/#c-9" has no claim with that id on the receipts page`,
    ]);
  });

  it('rejects a marker that points at the receipts of another piece', () => {
    const both = { ...files(`One${marker(1)}${marker(2, 'other')}.`, 'c-1', 'c-2'), 'news/other/receipts/index.html': receipts('c-2') };
    expect(checkClaimMarkers(site(both)).problems).toEqual([`${ARTICLE}: the marker "/news/other/receipts/#c-2" points at another piece's receipts`]);
  });

  it('rejects a marker that does not point at a claim anchor', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}<a href="/news/${SLUG}/receipts/#gate-heading">g</a>.`, 'c-1', 'gate-heading'))).problems).toEqual([
      `${ARTICLE}: the marker "/news/${SLUG}/receipts/#gate-heading" is not a claim anchor like #c-1`,
    ]);
  });

  it('rejects an article with no marker at all', () => {
    expect(checkClaimMarkers(site(files('No markers here.', 'c-1'))).problems).toEqual([`${ARTICLE}: has no claim markers`]);
  });

  it('does not take the plain link to the receipts page for a marker', () => {
    const body = `One${marker(1)}.</p><p><a href="/news/${SLUG}/receipts/">see the receipts</a>`;
    expect(checkClaimMarkers(site(files(body, 'c-1')))).toEqual(ok('A11'));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/checks-links.mjs'`.

- [ ] **Step 3: Write the checks**

**Create `site/scripts/audit/checks-links.mjs`:**
```js
import { allElements, attr, elements, textOf } from './dom.mjs';
import { result } from './result.mjs';
import { idsOf } from './site.mjs';

// The checks about how the pages point at each other: internal links, the
// receipts page of every article, and the claim markers in the text. Every check
// takes the model of the site (see site.mjs) and returns { id, ok, problems }.

/** Meta tags whose content is an address. */
const META_ADDRESSES = new Set(['og:image', 'og:url', 'twitter:image']);

/**
 * An address written on a page, with the way to show it in a message.
 * @typedef {{ label: string, value: string }} Address
 */

/**
 * Every address a page writes: href and src attributes, and the content of the meta tags that hold one.
 * @param {import('./site.mjs').Page} page
 * @returns {Address[]}
 */
function addressesOf(page) {
  /** @type {Address[]} */
  const found = [];
  for (const element of allElements(page.document)) {
    for (const name of ['href', 'src']) {
      const value = attr(element, name);
      if (value !== undefined && value !== '') found.push({ label: `<${element.tagName} ${name}="${value}">`, value });
    }
    if (element.tagName === 'meta') {
      const key = attr(element, 'property') ?? attr(element, 'name') ?? '';
      const content = attr(element, 'content');
      if (META_ADDRESSES.has(key) && content !== undefined) found.push({ label: `<meta ${key} content="${content}">`, value: content });
    }
  }
  return found;
}

/**
 * Where an address written on `page` points inside the site: the file it names and the fragment. Undefined when it points
 * elsewhere (another site, a mailto: or data: address) or cannot be read.
 *
 * @param {import('./site.mjs').Site} site
 * @param {import('./site.mjs').Page} page
 * @param {string} value
 * @returns {{ file: string, pathname: string, fragment: string } | undefined}
 */
export function resolveInternal(site, page, value) {
  let url;
  try {
    url = new URL(value, new URL(page.route, site.origin));
  } catch {
    return undefined;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== site.origin) return undefined;
  let pathname;
  let fragment;
  try {
    pathname = decodeURIComponent(url.pathname);
    fragment = decodeURIComponent(url.hash.slice(1));
  } catch {
    return undefined;
  }
  return { file: pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1), pathname, fragment };
}

/**
 * A8: every internal address resolves to a file in the build, and every fragment is the id of an element on the page it points at.
 * @param {import('./site.mjs').Site} site
 */
export function checkInternalLinks(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    /** @type {Set<string>} */
    const seen = new Set();
    for (const address of addressesOf(page)) {
      const target = resolveInternal(site, page, address.value);
      if (target === undefined) continue;
      /** @type {string | undefined} */
      let problem;
      if (!site.paths.has(target.file)) {
        const folder = !target.pathname.endsWith('/') && site.paths.has(`${target.file}/index.html`);
        problem = `${address.label} does not match any file in the build${folder ? '; the folder needs a trailing slash' : ''}`;
      } else if (target.fragment !== '') {
        const destination = site.pages.find((candidate) => candidate.file === target.file);
        if (destination === undefined) problem = `${address.label} points at #${target.fragment} in a file that is not a page`;
        else if (!idsOf(destination).has(target.fragment)) problem = `${address.label} points at #${target.fragment}, which is not an id on that page`;
      }
      if (problem !== undefined && !seen.has(problem)) {
        seen.add(problem);
        problems.push(`${page.file}: ${problem}`);
      }
    }
  }
  return result('A8', problems);
}

const ARTICLE_FILE = /^news\/([^/]+)\/index\.html$/;

/**
 * The pages of the articles, with the file of each one's receipts page.
 * @param {import('./site.mjs').Site} site
 */
function articles(site) {
  return site.pages.flatMap((page) => {
    const match = ARTICLE_FILE.exec(page.file);
    return match === null ? [] : [{ page, receiptsFile: `news/${match[1]}/receipts/index.html` }];
  });
}

/**
 * The problem with the canonical link of a page, or undefined when it has one that points at the page itself.
 * @param {import('./site.mjs').Site} site
 * @param {import('./site.mjs').Page} page
 * @returns {string | undefined}
 */
function canonicalProblem(site, page) {
  const link = elements(page.document, 'link').find((element) => attr(element, 'rel') === 'canonical');
  const href = link === undefined ? undefined : attr(link, 'href');
  if (href === undefined || href === '') return `${page.file}: has no canonical link`;
  const pathname = new URL(href, site.origin).pathname;
  return pathname === page.route ? undefined : `${page.file}: the canonical link points at ${pathname}, not at ${page.route}`;
}

/**
 * A9: every article page links to its receipts page, which exists and has a canonical link, and has a canonical link and NewsArticle structured data of its own.
 * @param {import('./site.mjs').Site} site
 */
export function checkArticlePages(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const linksToReceipts = addressesOf(page).some((address) => resolveInternal(site, page, address.value)?.file === receiptsFile);
    if (!linksToReceipts) problems.push(`${page.file}: does not link to its receipts page`);

    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    if (receipts === undefined) problems.push(`${page.file}: its receipts page ${receiptsFile} does not exist`);

    const canonical = canonicalProblem(site, page);
    if (canonical !== undefined) problems.push(canonical);

    let hasNewsArticle = false;
    for (const script of elements(page.document, 'script').filter((element) => attr(element, 'type') === 'application/ld+json')) {
      try {
        if (JSON.parse(textOf(script))?.['@type'] === 'NewsArticle') hasNewsArticle = true;
      } catch {
        problems.push(`${page.file}: its structured data is not valid JSON`);
      }
    }
    if (!hasNewsArticle) problems.push(`${page.file}: has no NewsArticle structured data`);

    if (receipts !== undefined) {
      const receiptsCanonical = canonicalProblem(site, receipts);
      if (receiptsCanonical !== undefined) problems.push(receiptsCanonical);
    }
  }
  return result('A9', problems);
}

/**
 * A11: every claim marker in an article points at a claim anchor (#c-1) that exists on the receipts page of the same article, and an article has at least one marker.
 * @param {import('./site.mjs').Site} site
 */
export function checkClaimMarkers(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    const seen = new Set();
    for (const element of elements(page.document, 'a')) {
      const href = attr(element, 'href') ?? '';
      const target = resolveInternal(site, page, href);
      // A marker is a link to a fragment of a receipts page; a plain link to the page has no fragment.
      if (target === undefined || target.fragment === '' || !/^news\/[^/]+\/receipts\/index\.html$/.test(target.file) || seen.has(href)) continue;
      seen.add(href);
      if (target.file !== receiptsFile) problems.push(`${page.file}: the marker "${href}" points at another piece's receipts`);
      else if (!/^c-\d+$/.test(target.fragment)) problems.push(`${page.file}: the marker "${href}" is not a claim anchor like #c-1`);
      else if (receipts === undefined || !idsOf(receipts).has(target.fragment)) problems.push(`${page.file}: the marker "${href}" has no claim with that id on the receipts page`);
    }
    if (seen.size === 0) problems.push(`${page.file}: has no claim markers`);
  }
  return result('A11', problems);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Run the checks on the real site**

Run: `node --input-type=module -e "import { loadSite } from './site/scripts/audit/site.mjs'; import * as l from './site/scripts/audit/checks-links.mjs'; const site = loadSite('site/dist'); for (const r of [l.checkInternalLinks(site), l.checkArticlePages(site), l.checkClaimMarkers(site)]) console.log(JSON.stringify(r));"`
Expected: PASS — `{"id":"A8","ok":true,"problems":[]}`, `{"id":"A9","ok":true,"problems":[]}` and `{"id":"A11","ok":true,"problems":[]}`: every link of the fixture site leads somewhere, and every marker of every article leads to its claim.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts site/test/audit.test.ts
git commit -m "feat(site): audit internal links, the receipts page of every article and every claim marker" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 65: Audit fixture leakage, XML files and the crawl files

**Files:**
- Create: `site/scripts/audit/checks-files.mjs`
- Modify: `site/test/audit.test.ts` (tests for three more checks)

Three checks about the build as a whole.

- **A13** (run only for a production build) nothing comes from the fixtures. No file contains the ribbon text `FIXTURE DATA`, the fictional company `Fixture Robotics` or the slug `fixture-robotics`, in any case, and no file is named after a fixture. It reads every text file: pages, CSS, the feed, the sitemaps and the cards.
- **A14** every XML file (`.xml` and `.svg`) is well-formed, using the strict check of Task 55. HTML is not read as XML.
- **A15** the files that crawlers and feed readers look for are there and agree with each other. `robots.txt`, `sitemap-index.xml`, `rss.xml` and `404.html` exist. `robots.txt` has an `Allow: /` line and a `Sitemap:` line that points at a file of this site. The sitemap index lists sitemaps that exist, the sitemaps list pages that exist (and not the 404 page), and every page except the 404 page is listed.

A14 and A15 are additions to the list of checks that the milestone asked for (A1 to A13). The feed, the sitemap and the cards are new files that none of the other checks reads, so these two make sure they are not left unchecked.

- [ ] **Step 1: Write the failing tests**

**In `site/test/audit.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**In `site/test/audit.test.ts`, replace:**
```ts
    expect(checkClaimMarkers(site(files(body, 'c-1')))).toEqual(ok('A11'));
  });
});
```

**with:**
```ts
    expect(checkClaimMarkers(site(files(body, 'c-1')))).toEqual(ok('A11'));
  });
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
    expect(checkNoFixtureLeakage(site({ 'index.html': page('<h1>Robotics news</h1>'), 'rss.xml': '<rss/>', '_astro/a.css': 'a{margin:0}' }, ['x/card.png']))).toEqual(ok('A13'));
  });

  it('rejects the fixture ribbon', () => {
    const html = page('<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div><h1>x</h1>');
    expect(checkNoFixtureLeakage(site({ 'index.html': html })).problems).toEqual(['index.html: contains the fixture ribbon text']);
  });

  it('rejects the fictional company, in any case', () => {
    expect(checkNoFixtureLeakage(site({ 'a/index.html': page('<h1>fixture ROBOTICS ships</h1>') })).problems).toEqual(['a/index.html: contains "Fixture Robotics"']);
  });

  it('rejects the company in a feed, a stylesheet and a card as well as in a page', () => {
    const files = { 'index.html': page('<h1>x</h1>'), 'rss.xml': '<title>Fixture Robotics ships</title>', '_astro/a.css': '/* Fixture Robotics */', 'n/card.svg': '<title>Fixture Robotics</title>' };
    expect(checkNoFixtureLeakage(site(files)).problems).toEqual(['_astro/a.css: contains "Fixture Robotics"', 'n/card.svg: contains "Fixture Robotics"', 'rss.xml: contains "Fixture Robotics"']);
  });

  it('rejects a fixture slug in an address or in a file name', () => {
    const files = { 'index.html': page('<a href="/news/fixture-robotics-ships-fx-1/">x</a><h1>x</h1>') };
    expect(checkNoFixtureLeakage(site(files, ['news/fixture-robotics-ships-fx-1/card.png'])).problems).toEqual([
      'index.html: contains "fixture-robotics"',
      'news/fixture-robotics-ships-fx-1/card.png: is named after a fixture',
    ]);
  });
});

describe('A14 checkXmlWellFormed', () => {
  it('accepts a feed, a sitemap and a card that are well-formed', () => {
    const files = {
      'index.html': page('<h1>x</h1>'),
      'rss.xml': '<?xml version="1.0"?><rss version="2.0"><channel><title>A &amp; B</title></channel></rss>',
      'sitemap-0.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.example/</loc></url></urlset>',
      'n/card.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>x</text></svg>',
    };
    expect(checkXmlWellFormed(site(files))).toEqual(ok('A14'));
  });

  it('does not read HTML as XML', () => {
    expect(checkXmlWellFormed(site({ 'index.html': '<!doctype html><br><p>x' }))).toEqual(ok('A14'));
  });

  it('rejects a feed with a tag closed by the wrong name, with the position', () => {
    expect(checkXmlWellFormed(site({ 'rss.xml': '<rss><channel></rss>' }))).toEqual({
      id: 'A14',
      ok: false,
      problems: ["rss.xml: Expected closing tag 'channel' (opened in line 1, col 6) instead of closing tag 'rss'. (line 1, column 15)"],
    });
  });

  it('rejects a card with a bare ampersand', () => {
    expect(checkXmlWellFormed(site({ 'n/card.svg': '<svg><text>A & B</text></svg>' })).problems).toEqual(["n/card.svg: char '&' is not expected. (line 1, column 14)"]);
  });
});

describe('A15 checkCrawlFiles', () => {
  const sitemapIndex = '<sitemapindex><sitemap><loc>https://news.example/sitemap-0.xml</loc></sitemap></sitemapindex>';
  const urlset = (...paths: string[]) => `<urlset>${paths.map((path) => `<url><loc>https://news.example${path}</loc></url>`).join('')}</urlset>`;
  /** A small site with every crawl file in order; a value of null removes a file. */
  const crawl = (changes: Record<string, string | null> = {}, others: string[] = []) => {
    const files: Record<string, string | null> = {
      'index.html': page('<h1>x</h1>', { head: '<link rel="canonical" href="https://news.example/">' }),
      'status/index.html': page('<h1>s</h1>'),
      '404.html': page('<h1>n</h1>'),
      'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://news.example/sitemap-index.xml\n',
      'sitemap-index.xml': sitemapIndex,
      'sitemap-0.xml': urlset('/', '/status/'),
      'rss.xml': '<rss version="2.0"><channel><title>T</title></channel></rss>',
      ...changes,
    };
    return site(Object.fromEntries(Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== null)), others);
  };

  it('accepts a build with robots.txt, a sitemap that lists every page but the 404 page, a feed and a 404 page', () => {
    expect(checkCrawlFiles(crawl())).toEqual(ok('A15'));
  });

  it.each(['robots.txt', 'sitemap-index.xml', 'rss.xml', '404.html'])('rejects a build with no %s', (file) => {
    expect(checkCrawlFiles(crawl({ [file]: null })).problems[0]).toBe(`${file}: is missing`);
  });

  it('rejects a robots.txt that does not allow every crawler', () => {
    const robots = 'User-agent: *\nDisallow: /\nSitemap: https://news.example/sitemap-index.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': robots })).problems).toEqual(['robots.txt: has no "Allow: /" line']);
  });

  it('rejects a robots.txt with no Sitemap line', () => {
    expect(checkCrawlFiles(crawl({ 'robots.txt': 'User-agent: *\nAllow: /\n' })).problems).toEqual(['robots.txt: has no Sitemap line']);
  });

  it('rejects a Sitemap line that points at a file that is not in the build, or at another site', () => {
    const missing = 'User-agent: *\nAllow: /\nSitemap: https://news.example/other.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': missing })).problems).toEqual(['robots.txt: the Sitemap line points at https://news.example/other.xml, which is not a file in the build']);
    const elsewhere = 'User-agent: *\nAllow: /\nSitemap: https://elsewhere.example/sitemap-index.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': elsewhere })).problems).toEqual([
      'robots.txt: the Sitemap line points at https://elsewhere.example/sitemap-index.xml, which is not on https://news.example',
    ]);
  });

  it('rejects a sitemap index that lists a sitemap that is not in the build', () => {
    const index = '<sitemapindex><sitemap><loc>https://news.example/sitemap-1.xml</loc></sitemap></sitemapindex>';
    expect(checkCrawlFiles(crawl({ 'sitemap-index.xml': index })).problems).toContain('sitemap-index.xml: lists https://news.example/sitemap-1.xml, which is not a file in the build');
  });

  it('rejects a sitemap that lists a page that does not exist', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/', '/status/', '/gone/') })).problems).toEqual(['sitemap-0.xml: lists https://news.example/gone/, which is not a page in the build']);
  });

  it('reads an address with spaces or a line break around it in <loc>', () => {
    const spaced = '<urlset><url><loc>\n  https://news.example/\n</loc></url><url><loc> https://news.example/status/ </loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': spaced }))).toEqual(ok('A15'));
    const gone = '<urlset><url><loc>https://news.example/</loc></url><url><loc>https://news.example/status/</loc></url><url><loc>\n https://news.example/gone/ \n</loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': gone })).problems).toEqual(['sitemap-0.xml: lists https://news.example/gone/, which is not a page in the build']);
  });

  it('rejects a sitemap index that lists a sitemap on another site or an address that is not one', () => {
    const elsewhere = '<sitemapindex><sitemap><loc>https://elsewhere.example/sitemap-0.xml</loc></sitemap><sitemap><loc>not an address</loc></sitemap></sitemapindex>';
    const problems = checkCrawlFiles(crawl({ 'sitemap-index.xml': elsewhere })).problems;
    expect(problems).toContain('sitemap-index.xml: lists https://elsewhere.example/sitemap-0.xml, which is not a file in the build');
    expect(problems).toContain('sitemap-index.xml: lists not an address, which is not a file in the build');
  });

  it('rejects a sitemap that lists the 404 page, or an address on another site', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/', '/status/', '/404.html') })).problems).toEqual(['sitemap-0.xml: lists https://news.example/404.html, which is the 404 page']);
    const other = '<urlset><url><loc>https://elsewhere.example/</loc></url><url><loc>https://news.example/</loc></url><url><loc>https://news.example/status/</loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': other })).problems).toEqual(['sitemap-0.xml: lists https://elsewhere.example/, which is not on https://news.example']);
  });

  it('rejects a page that is missing from the sitemap, and says which', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/') })).problems).toEqual(['status/index.html: is not in the sitemap']);
  });

  it('does not ask for the 404 page in the sitemap', () => {
    expect(checkCrawlFiles(crawl()).problems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/checks-files.mjs'`.

- [ ] **Step 3: Write the checks**

**Create `site/scripts/audit/checks-files.mjs`:**
```js
import { result } from './result.mjs';
import { xmlProblem } from './xml.mjs';

// The checks about the files of the build as a whole: no fixture content in a
// production build, XML that is well-formed, and the files that crawlers and
// feed readers look for. Every check takes the model of the site (see site.mjs)
// and returns { id, ok, problems }.

/** What gives away fixture content: the ribbon, the fictional company, and the slug of its pieces. */
const FIXTURE_TEXT = [
  { pattern: /fixture data/i, description: 'the fixture ribbon text' },
  { pattern: /fixture robotics/i, description: '"Fixture Robotics"' },
  { pattern: /fixture-robotics/i, description: '"fixture-robotics"' },
];

/**
 * A13 (production build only): nothing in the build comes from the fixtures: no ribbon, no fictional company, no file named after one.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoFixtureLeakage(site) {
  /** @type {string[]} */
  const problems = [];
  for (const file of [...site.paths].sort()) {
    if (/fixture/i.test(file)) problems.push(`${file}: is named after a fixture`);
    const text = site.files.get(file);
    if (text === undefined) continue;
    for (const { pattern, description } of FIXTURE_TEXT) {
      if (pattern.test(text)) problems.push(`${file}: contains ${description}`);
    }
  }
  return result('A13', problems);
}

/**
 * A14: every XML file (the feed, the sitemaps, the SVG cards) is well-formed.
 * @param {import('./site.mjs').Site} site
 */
export function checkXmlWellFormed(site) {
  /** @type {string[]} */
  const problems = [];
  for (const [file, text] of [...site.files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!/\.(xml|svg)$/.test(file)) continue;
    const problem = xmlProblem(text);
    if (problem !== undefined) problems.push(`${file}: ${problem}`);
  }
  return result('A14', problems);
}

/** The files a crawler or a feed reader asks for. */
const CRAWL_FILES = ['robots.txt', 'sitemap-index.xml', 'rss.xml', '404.html'];

/**
 * The addresses in the <loc> elements of an XML sitemap.
 * @param {string} xml
 * @returns {string[]}
 */
function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1].trim());
}

/**
 * A15: the files crawlers look for are there and agree: robots.txt allows everything and names a sitemap that exists, the sitemap index lists sitemaps that exist, the sitemaps list pages that exist, and every page but the 404 page is listed.
 * @param {import('./site.mjs').Site} site
 */
export function checkCrawlFiles(site) {
  /** @type {string[]} */
  const problems = [];
  for (const file of CRAWL_FILES) {
    if (!site.paths.has(file)) problems.push(`${file}: is missing`);
  }

  const robots = site.files.get('robots.txt');
  if (robots !== undefined) {
    if (!/^Allow:\s*\/\s*$/m.test(robots)) problems.push('robots.txt: has no "Allow: /" line');
    const line = /^Sitemap:\s*(\S+)\s*$/m.exec(robots);
    if (line === null) problems.push('robots.txt: has no Sitemap line');
    else if (!URL.canParse(line[1]) || new URL(line[1]).origin !== site.origin) problems.push(`robots.txt: the Sitemap line points at ${line[1]}, which is not on ${site.origin}`);
    else if (!site.paths.has(new URL(line[1]).pathname.slice(1))) problems.push(`robots.txt: the Sitemap line points at ${line[1]}, which is not a file in the build`);
  }

  const index = site.files.get('sitemap-index.xml');
  if (index === undefined) return result('A15', problems);

  /** @type {Set<string>} */
  const listed = new Set();
  for (const address of locations(index)) {
    const url = URL.canParse(address) ? new URL(address) : undefined;
    const sitemap = url === undefined || url.origin !== site.origin ? undefined : site.files.get(url.pathname.slice(1));
    if (sitemap === undefined) {
      problems.push(`sitemap-index.xml: lists ${address}, which is not a file in the build`);
      continue;
    }
    const file = /** @type {URL} */ (url).pathname.slice(1);
    for (const page of locations(sitemap)) {
      const target = URL.canParse(page) ? new URL(page) : undefined;
      if (target === undefined || target.origin !== site.origin) problems.push(`${file}: lists ${page}, which is not on ${site.origin}`);
      else if (target.pathname === '/404.html') problems.push(`${file}: lists ${page}, which is the 404 page`);
      else if (!site.pages.some((candidate) => candidate.route === target.pathname)) problems.push(`${file}: lists ${page}, which is not a page in the build`);
      else listed.add(target.pathname);
    }
  }

  for (const page of site.pages) {
    if (page.file !== '404.html' && !listed.has(page.route)) problems.push(`${page.file}: is not in the sitemap`);
  }
  return result('A15', problems);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Run the checks on the real site**

The folder holds the fixture build, so A13 must fail on it: that is what the check is for. A14 and A15 must pass.

Run: `node --input-type=module -e "import { loadSite } from './site/scripts/audit/site.mjs'; import * as f from './site/scripts/audit/checks-files.mjs'; const site = loadSite('site/dist'); const leak = f.checkNoFixtureLeakage(site); console.log(leak.id, leak.ok, leak.problems.length > 10); console.log(JSON.stringify(f.checkXmlWellFormed(site))); console.log(JSON.stringify(f.checkCrawlFiles(site)));"`
Expected: PASS — `A13 false true`, `{"id":"A14","ok":true,"problems":[]}` and `{"id":"A15","ok":true,"problems":[]}`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add site/scripts site/test/audit.test.ts
git commit -m "feat(site): audit fixture leakage, XML files and the crawl files" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 66: The audit command

**Files:**
- Create: `site/scripts/audit/checks.mjs`, `site/scripts/audit/report.mjs`, `site/scripts/audit.mjs`, `site/test/support/small-site.ts`
- Modify: `package.json` (the `audit` and `audit:prod` scripts)
- Test: `site/test/audit-run.test.ts`, `site/test/audit-report.test.ts`, `site/test/audit-cli.test.ts`

The checks of the last four tasks become a command.

- `checks.mjs` lists them in order (`CHECKS`, A1 to A15, each with the sentence the report shows for it) and runs them (`runChecks(site, { tokensCss, prod })`). A13, the fixture check, runs only for a production build. The tests build a small site that passes everything (`test/support/small-site.ts`), break one thing at a time, and check that exactly the checks the breakage belongs to fail.
- `report.mjs` writes the text: one line per check, `ok` or `FAIL`, the problems indented under a failed check (the first 25, then a count of the rest), and a last line that says `Passed` or `FAILED` with the number of problems.
- `audit.mjs` is the command. It reads `site/dist` (or the folder given with `--dir`), runs the checks with `site/src/styles/tokens.css` as the token source, prints the report, and exits 0 if every check passed, 1 if any found a problem, and 2 if it could not run (unknown option, missing folder). With `--prod` it also runs A13. The root scripts are `npm run audit` and `npm run audit:prod`.

The audit does not build the site; the CI order of a later task builds first.

- [ ] **Step 1: Write the failing tests for the runner**

**Create `site/test/support/small-site.ts`:**
```ts
// A small site that passes every check of the audit, in the form the audit
// reads it: files as text, keyed by their path inside dist/. The tests of the
// runner and of the command line change it to break one thing at a time.

const ORIGIN = 'https://robywire.example';

/** A page that passes the checks on pages. */
function page(route: string, title: string, body: string, head = ''): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${title}</title>`,
    `<meta name="description" content="About ${title}.">`,
    `<link rel="canonical" href="${ORIGIN}${route}">`,
    '<link rel="stylesheet" href="/_astro/a.css">',
    head,
    '</head><body>',
    '<a class="skip-link" href="#main">Skip</a>',
    `<main id="main"><h1>${title}</h1>${body}</main>`,
    '</body></html>',
  ].join('');
}

export const SMALL_SITE: Readonly<Record<string, string>> = {
  'index.html': page('/', 'Home', '<p><a href="/status/">Status</a></p>'),
  'status/index.html': page('/status/', 'Status', '<p><a href="/">Home</a></p>'),
  '404.html': page('/404.html', 'Not found', '<p><a href="/">Home</a></p>'),
  '_astro/a.css': 'a{color:#14181d;border-bottom:1px solid #e4e7ea}',
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap-index.xml\n`,
  'sitemap-index.xml': `<?xml version="1.0" encoding="UTF-8"?><sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`,
  'sitemap-0.xml': `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/status/</loc></url></urlset>`,
  'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Robywire</title></channel></rss>',
};

/** The small site with `changes` applied. A value of null removes a file. */
export function smallSite(changes: Record<string, string | null> = {}): Record<string, string> {
  const files: Record<string, string> = { ...SMALL_SITE };
  for (const [file, text] of Object.entries(changes)) {
    if (text === null) delete files[file];
    else files[file] = text;
  }
  return files;
}

export { page as smallPage };
```

**Create `site/test/audit-run.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKS, runChecks } from '../scripts/audit/checks.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
import { smallPage, smallSite } from './support/small-site';

const TOKENS_CSS = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const run = (changes: Record<string, string | null> = {}, prod = false) => runChecks(siteFromFiles(smallSite(changes)), { tokensCss: TOKENS_CSS, prod });
const failed = (results: ReturnType<typeof run>) => results.filter((result) => !result.ok).map((result) => result.id);

describe('CHECKS', () => {
  it('lists the checks A1 to A15 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 15 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title.length).toBeGreaterThan(10);
  });

  it('marks only A13, the fixture check, as one that runs for a production build alone', () => {
    expect(CHECKS.filter((check) => check.prodOnly).map((check) => check.id)).toEqual(['A13']);
  });
});

describe('runChecks', () => {
  it('passes the small site with every check except A13, in order, each result carrying its title', () => {
    const results = run();
    expect(results.map((result) => result.id)).toEqual(CHECKS.filter((check) => !check.prodOnly).map((check) => check.id));
    expect(failed(results)).toEqual([]);
    for (const result of results) expect(result.title).toBe(CHECKS.find((check) => check.id === result.id)?.title);
  });

  it('runs A13 as well for a production build, between A12 and A14, and the small site passes it', () => {
    const results = run({}, true);
    expect(results.map((result) => result.id).slice(11, 14)).toEqual(['A12', 'A13', 'A14']);
    expect(failed(results)).toEqual([]);
  });

  it('lets a fixture build through when it is not a production build, and stops it when it is', () => {
    const changes = { 'index.html': smallPage('/', 'Home', '<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div>') };
    expect(failed(run(changes))).toEqual([]);
    expect(failed(run(changes, true))).toEqual(['A13']);
  });

  it('fails the checks that the breakage belongs to, and only those', () => {
    const changes = {
      'index.html': smallPage('/', 'Home', '<p><img src="/a.png" alt="">text <em>x</em></p><a href="/gone/">gone</a>'),
      '_astro/a.css': 'a{color:#ff0000;border:3px solid #e4e7ea}',
    };
    expect(failed(run(changes))).toEqual(['A4', 'A5', 'A7', 'A8', 'A12']);
  });

  it('reports the problems of a check with the file they are in', () => {
    const results = run({ 'status/index.html': smallPage('/status/', 'Status', '<h1>two</h1>') });
    expect(results.find((result) => result.id === 'A2')?.problems).toEqual(['status/index.html: has 2 <h1> elements; a page needs exactly 1']);
  });

  it('needs the text of the tokens file', () => {
    // @ts-expect-error The tokens file is required.
    expect(() => runChecks(siteFromFiles(smallSite()), {})).toThrow('tokensCss');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/audit-run.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/checks.mjs'`.

- [ ] **Step 2: Write the runner**

**Create `site/scripts/audit/checks.mjs`:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';

/**
 * What the checks need besides the site.
 * @typedef {object} AuditOptions
 * @property {string} tokensCss  The text of src/styles/tokens.css.
 * @property {boolean} [prod]  True for a production build, which gets the fixture check too.
 */

/**
 * One check of the audit.
 * @typedef {object} Check
 * @property {string} id
 * @property {string} title  What the check requires, for the report.
 * @property {boolean} [prodOnly]  True if the check runs only for a production build.
 * @property {(site: import('./site.mjs').Site, options: AuditOptions) => import('./result.mjs').CheckResult} run
 */

/** @type {Check[]} */
export const CHECKS = [
  { id: 'A1', title: 'Every page parses as HTML with no errors and no element left open', run: checkHtmlParses },
  { id: 'A2', title: 'Every page has exactly one h1', run: checkOneHeading },
  { id: 'A3', title: 'Every page has a language and a title, and every page but 404 a description', run: checkMetadata },
  { id: 'A4', title: 'No images: no img element and no CSS url()', run: checkNoImages },
  { id: 'A5', title: 'No italics in the HTML or the CSS', run: checkNoItalics },
  { id: 'A6', title: 'No web fonts and no font requests', run: checkNoWebFonts },
  { id: 'A7', title: 'Hairlines only: no border above one pixel and no rounded corner', run: checkHairlines },
  { id: 'A8', title: 'Every internal link, file and #fragment resolves', run: checkInternalLinks },
  { id: 'A9', title: 'Every article links to its receipts and has a canonical link and NewsArticle data', run: checkArticlePages },
  { id: 'A10', title: 'The skip link is the first link on every page', run: checkSkipLink },
  { id: 'A11', title: 'Every claim marker points at its claim on the receipts page', run: checkClaimMarkers },
  { id: 'A12', title: 'Every colour belongs to the design tokens', run: (site, options) => checkColourLaw(site, options.tokensCss) },
  { id: 'A13', title: 'No fixture content in a production build', prodOnly: true, run: checkNoFixtureLeakage },
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
];

/**
 * Run the checks on a site, in order. The fixture check runs only when `options.prod` is true.
 *
 * @param {import('./site.mjs').Site} site
 * @param {AuditOptions} options
 * @returns {(import('./result.mjs').CheckResult & { title: string })[]}
 */
export function runChecks(site, options) {
  if (typeof options?.tokensCss !== 'string') throw new TypeError('runChecks: options.tokensCss, the text of tokens.css, is required');
  return CHECKS.filter((check) => options.prod === true || check.prodOnly !== true).map((check) => ({ ...check.run(site, options), title: check.title }));
}
```

Run: `npm test --workspace @robywire/site -- test/audit-run.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 3: Write the report, test first**

**Create `site/test/audit-report.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { formatReport } from '../scripts/audit/report.mjs';

const INFO = { dir: 'site/dist', pages: 22, files: 31, prod: false };
const pass = (id: string, title: string) => ({ id, title, ok: true, problems: [] as string[] });
const fail = (id: string, title: string, ...problems: string[]) => ({ id, title, ok: false, problems });

describe('formatReport', () => {
  it('lists each check with ok or FAIL, and says that the audit passed', () => {
    expect(formatReport([pass('A1', 'Pages parse'), pass('A2', 'One h1')], INFO)).toBe(
      ['Audit of site/dist: 22 pages, 31 files', '  ok    A1  Pages parse', '  ok    A2  One h1', '', 'Passed: 2 checks.'].join('\n'),
    );
  });

  it('groups the problems under the check they belong to', () => {
    const results = [pass('A1', 'Pages parse'), fail('A4', 'No images', 'index.html: has an <img> element', 'a/index.html: has an <img> element'), pass('A10', 'Skip link')];
    expect(formatReport(results, INFO)).toBe(
      [
        'Audit of site/dist: 22 pages, 31 files',
        '  ok    A1   Pages parse',
        '  FAIL  A4   No images',
        '             - index.html: has an <img> element',
        '             - a/index.html: has an <img> element',
        '  ok    A10  Skip link',
        '',
        'FAILED: 2 problems in 1 of 3 checks.',
      ].join('\n'),
    );
  });

  it('says "1 problem" for one problem', () => {
    expect(formatReport([fail('A2', 'One h1', 'index.html: has 0 <h1> elements')], INFO)).toContain('FAILED: 1 problem in 1 of 1 checks.');
  });

  it('says when it is a production build', () => {
    expect(formatReport([pass('A1', 'Pages parse')], { ...INFO, prod: true }).split('\n')[0]).toBe('Audit of site/dist: 22 pages, 31 files (production build)');
  });

  it('shows the first 25 problems of a check and counts the rest', () => {
    const problems = Array.from({ length: 30 }, (_, index) => `file-${index}.html: bad`);
    const lines = formatReport([fail('A8', 'Links', ...problems)], INFO).split('\n');
    expect(lines.filter((line) => line.includes('- file-'))).toHaveLength(25);
    expect(lines).toContain('            ... and 5 more');
    expect(lines.at(-1)).toBe('FAILED: 30 problems in 1 of 1 checks.');
  });

  it('shows all 25 when there are exactly 25', () => {
    const problems = Array.from({ length: 25 }, (_, index) => `file-${index}.html: bad`);
    expect(formatReport([fail('A8', 'Links', ...problems)], INFO)).not.toContain('more');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/audit-report.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit/report.mjs'`.

**Create `site/scripts/audit/report.mjs`:**
```js
// The text the audit prints: one line for each check, its problems under it,
// and a last line that says whether the site passed.

/** The most problems shown under one check; the rest are counted. */
const MAX_PROBLEMS_SHOWN = 25;

/**
 * @param {(import('./result.mjs').CheckResult & { title: string })[]} results
 * @param {{ dir: string, pages: number, files: number, prod: boolean }} info
 * @returns {string}
 */
export function formatReport(results, info) {
  const width = Math.max(...results.map((item) => item.id.length));
  const lines = [`Audit of ${info.dir}: ${info.pages} pages, ${info.files} files${info.prod ? ' (production build)' : ''}`];
  for (const item of results) {
    lines.push(`  ${item.ok ? 'ok  ' : 'FAIL'}  ${item.id.padEnd(width)}  ${item.title}`);
    for (const problem of item.problems.slice(0, MAX_PROBLEMS_SHOWN)) lines.push(`${' '.repeat(10 + width)}- ${problem}`);
    if (item.problems.length > MAX_PROBLEMS_SHOWN) lines.push(`${' '.repeat(10 + width)}... and ${item.problems.length - MAX_PROBLEMS_SHOWN} more`);
  }
  const failed = results.filter((item) => !item.ok);
  const problems = results.reduce((total, item) => total + item.problems.length, 0);
  lines.push('', failed.length === 0 ? `Passed: ${results.length} checks.` : `FAILED: ${problems} ${problems === 1 ? 'problem' : 'problems'} in ${failed.length} of ${results.length} checks.`);
  return lines.join('\n');
}
```

Run: `npm test --workspace @robywire/site -- test/audit-report.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 4: Write the command, test first**

**Create `site/test/audit-cli.test.ts`:**
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../scripts/audit.mjs';
import { smallPage, smallSite } from './support/small-site';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** Write the small site, with `changes`, into a new folder and return the folder. */
function build(changes: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-cli-'));
  folders.push(dir);
  for (const [file, text] of Object.entries(smallSite(changes))) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** Run the audit and return its exit code and everything it printed. */
function audit(args: string[]): { code: number; output: string } {
  const lines: string[] = [];
  const code = main(args, (text: string) => lines.push(text));
  return { code, output: lines.join('\n') };
}

describe('the audit command', () => {
  it('exits 0 and says it passed for a site that keeps every rule', () => {
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 14 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
  });

  it('runs the fixture check as well with --prod', () => {
    const { code, output } = audit(['--prod', '--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 15 checks.');
  });

  it('exits 1 and prints the problem under its check when a rule is broken', () => {
    const dir = build({ 'index.html': smallPage('/', 'Home', '<p><img src="data:," alt=""></p>') });
    const { code, output } = audit(['--dir', dir]);
    expect(code).toBe(1);
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 14 checks.');
  });

  it('lets fixture content through without --prod and stops it with --prod', () => {
    const dir = build({ 'index.html': smallPage('/', 'Home', '<p>Fixture Robotics</p>') });
    expect(audit(['--dir', dir]).code).toBe(0);
    const { code, output } = audit(['--prod', '--dir', dir]);
    expect(code).toBe(1);
    expect(output).toContain('FAIL  A13');
    expect(output).toContain('- index.html: contains "Fixture Robotics"');
  });

  it('names the folder it checked, as an absolute path when the folder is outside the current one', () => {
    const dir = build();
    expect(audit(['--dir', dir]).output.split('\n')[0]).toBe(`Audit of ${dir}: 3 pages, 8 files`);
  });

  it('exits 2 and shows how to use it for a flag it does not know', () => {
    const { code, output } = audit(['--fast']);
    expect(code).toBe(2);
    expect(output).toContain('Unknown option: --fast');
    expect(output).toContain('Usage: node site/scripts/audit.mjs [--prod] [--dir <folder>]');
  });

  it('exits 2 when --dir has no folder after it', () => {
    const { code, output } = audit(['--dir']);
    expect(code).toBe(2);
    expect(output).toContain('--dir needs a folder');
  });

  it('exits 2 and says to build the site first when the folder is not there', () => {
    const { code, output } = audit(['--dir', path.join(tmpdir(), 'robywire-no-such-folder')]);
    expect(code).toBe(2);
    expect(output).toContain('Build the site first.');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/audit-cli.test.ts`
Expected: FAIL — `Cannot find module '../scripts/audit.mjs'`.

**Create `site/scripts/audit.mjs`:**
```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runChecks } from './audit/checks.mjs';
import { formatReport } from './audit/report.mjs';
import { loadSite } from './audit/site.mjs';

// `npm run audit` checks the built site in site/dist against the rules of the
// design and of the content. `npm run audit:prod` (--prod) also requires that
// the build has no trace of the fixtures. It prints one line for each check and
// exits 1 if any check found a problem. Exit code 2 means it could not run.

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = path.join(SITE_DIR, 'dist');
const TOKENS_FILE = path.join(SITE_DIR, 'src', 'styles', 'tokens.css');
const USAGE = 'Usage: node site/scripts/audit.mjs [--prod] [--dir <folder>]';

/**
 * Run the audit. Returns the exit code.
 * @param {string[]} [argv]
 * @param {(text: string) => void} [print]
 * @returns {number}
 */
export function main(argv = process.argv.slice(2), print = console.log) {
  let prod = false;
  let dir = DEFAULT_DIR;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--prod') prod = true;
    else if (argument === '--dir') {
      const value = argv[++index];
      if (value === undefined) {
        print(`--dir needs a folder.\n${USAGE}`);
        return 2;
      }
      dir = path.resolve(value);
    } else {
      print(`Unknown option: ${argument}\n${USAGE}`);
      return 2;
    }
  }

  let site;
  try {
    site = loadSite(dir);
  } catch (error) {
    print(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const results = runChecks(site, { tokensCss: readFileSync(TOKENS_FILE, 'utf8'), prod });
  // Show the folder relative to where the command was run, unless that would climb out of it.
  const relative = path.relative(process.cwd(), dir);
  const shown = relative === '' ? '.' : relative.startsWith('..') ? dir : relative;
  print(formatReport(results, { dir: shown, pages: site.pages.length, files: site.paths.size, prod }));
  return results.every((item) => item.ok) ? 0 : 1;
}

// Run when started as a script, not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
```

Run: `npm test --workspace @robywire/site -- test/audit-cli.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Add the root scripts**

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
    "build:fixtures": "npm run build:fixtures --workspace @robywire/site",
    "audit": "node site/scripts/audit.mjs",
    "audit:prod": "node site/scripts/audit.mjs --prod"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 6: Audit the fixture build**

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `npm run audit`
Expected: PASS — `ok    A1` to `ok    A15` (without A13), and `Passed: 14 checks.`

A fixture build is not a production build, so `audit:prod` must refuse it.

Run: `npm run audit:prod`
Expected: FAIL — `(production build)`, `FAIL  A13` and `FAILED:`.

- [ ] **Step 7: Audit the production build**

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `npm run audit:prod`
Expected: PASS — `ok    A13` and `Passed: 15 checks.`

- [ ] **Step 8: Prove the audit can fail**

Put an image into a built page, as if a template had been changed.

Run: `sed -i.bak 's#</main>#<img src="data:," alt=""></main>#' site/dist/index.html && rm site/dist/index.html.bak`
Expected: PASS

Run: `npm run audit:prod`
Expected: FAIL — `FAIL  A4`, `index.html: has an <img> element` and `FAILED: 1 problem in 1 of 15 checks.`

Build again to put the page back.

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `npm run audit:prod`
Expected: PASS — `Passed: 15 checks.`

- [ ] **Step 9: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 10: Commit**

```bash
git add package.json site/scripts site/test
git commit -m "feat(site): add the audit command that runs every check on site/dist and fails on any problem" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 67: A static server for the built site

**Files:**
- Create: `site/scripts/serve-dist.mjs`
- Test: `site/test/serve-dist.test.ts`

Lighthouse measures a page it loads over HTTP, so the next task needs the built site served. `serve(dir)` starts a small server on a free port of the local address and returns `{ url, close }`. It behaves like a static host:

- A folder address (`/status/`) is the `index.html` of the folder, and a file is served with the right type: `html`, `css`, `js`, `json`, `svg`, `png`, `xml` and `txt` have their types, anything else is `application/octet-stream`.
- A missing file is a 404 that carries the site's own `404.html`. A folder written without its trailing slash is redirected (308) to the slash, as a static host does.
- Only `GET` and `HEAD` are answered; the others get 405.
- Nothing outside the folder is ever served. `resolveRequestPath(root, requestPath)` maps the raw path of a request to a file inside the folder, or to `undefined`. It decodes the path once, refuses a NUL character, a backslash and a path that is not valid UTF-8 after decoding, and refuses (rather than clamps) a `..` that would climb above the folder, however it is written: plain, percent-encoded (`%2e%2e`), or hidden behind an encoded slash (`..%2f`). The test table of attempts runs against the function and, with a raw HTTP request that does not tidy `..` away, against the running server with a secret file next to the folder.

- [ ] **Step 1: Write the failing test**

**Create `site/test/serve-dist.test.ts`:**
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIME_TYPES, resolveRequestPath, serve } from '../scripts/serve-dist.mjs';

const ROOT = path.join(path.sep, 'srv', 'dist');

describe('resolveRequestPath', () => {
  it.each([
    ['/', ['index.html']],
    ['/status/', ['status', 'index.html']],
    ['/news/a-b/receipts/', ['news', 'a-b', 'receipts', 'index.html']],
    ['/_astro/Base.abc.css', ['_astro', 'Base.abc.css']],
    ['/rss.xml', ['rss.xml']],
    ['/a/./b/../c.txt', ['a', 'c.txt']],
    ['//double//slash.txt', ['double', 'slash.txt']],
    ['/with%20space.txt', ['with space.txt']],
  ])('maps %s to a file inside the folder', (requestPath, parts) => {
    expect(resolveRequestPath(ROOT, requestPath)).toBe(path.join(ROOT, ...parts));
  });

  it.each([
    ['/../secret.txt'],
    ['/a/../../secret.txt'],
    ['/%2e%2e/secret.txt'],
    ['/%2E%2E%2Fsecret.txt'],
    ['/a/%2e%2e/%2e%2e/secret.txt'],
    ['/..%2fsecret.txt'],
    ['/a%00b.txt'],
    ['/%E0%A4%A'],
    ['/..\\secret.txt'],
  ])('refuses %s, which would leave the folder or is not a valid path', (requestPath) => {
    expect(resolveRequestPath(ROOT, requestPath)).toBeUndefined();
  });

  it('refuses a path that starts with a backslash escape, whatever the platform', () => {
    expect(resolveRequestPath(ROOT, '/a\\..\\..\\secret.txt')).toBeUndefined();
  });

  it('stays inside a folder whose name is the start of a sibling name', () => {
    expect(resolveRequestPath(path.join(path.sep, 'srv', 'dist'), '/../dist-other/x.txt')).toBeUndefined();
  });
});

describe('MIME_TYPES', () => {
  it.each([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.xml', 'application/xml; charset=utf-8'],
    ['.txt', 'text/plain; charset=utf-8'],
  ])('serves %s as %s', (extension, type) => {
    expect(MIME_TYPES[extension]).toBe(type);
  });
});

describe('serve', () => {
  let parent: string;
  let dist: string;
  let server: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    parent = mkdtempSync(path.join(tmpdir(), 'robywire-serve-'));
    dist = path.join(parent, 'dist');
    for (const [file, content] of Object.entries({
      'index.html': '<h1>home</h1>',
      'status/index.html': '<h1>status</h1>',
      '404.html': '<h1>missing</h1>',
      '_astro/a.css': 'a{margin:0}',
      'app.js': 'export {};',
      'data.json': '{"a":1}',
      'card.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'rss.xml': '<rss/>',
      'robots.txt': 'User-agent: *',
      'blob.bin': 'x',
    })) {
      mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
      writeFileSync(path.join(dist, file), content);
    }
    writeFileSync(path.join(dist, 'card.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(parent, 'secret.txt'), 'TOP SECRET');
    server = await serve(dist);
  });

  afterAll(async () => {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  });

  it('listens on a local address with a port of its own', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('serves a folder address as its index.html', async () => {
    for (const [route, body] of [['/', '<h1>home</h1>'], ['/status/', '<h1>status</h1>']]) {
      const response = await fetch(server.url + route);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toBe(body);
    }
  });

  it.each([
    ['/_astro/a.css', 'text/css; charset=utf-8'],
    ['/app.js', 'text/javascript; charset=utf-8'],
    ['/data.json', 'application/json; charset=utf-8'],
    ['/card.svg', 'image/svg+xml'],
    ['/card.png', 'image/png'],
    ['/rss.xml', 'application/xml; charset=utf-8'],
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/blob.bin', 'application/octet-stream'],
  ])('serves %s as %s', async (route, type) => {
    const response = await fetch(server.url + route);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(type);
  });

  it('serves the bytes of a file exactly', async () => {
    const bytes = new Uint8Array(await (await fetch(`${server.url}/card.png`)).arrayBuffer());
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('answers 404, with the 404 page, for a file that is not there', async () => {
    const response = await fetch(`${server.url}/nothing/`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe('<h1>missing</h1>');
  });

  it('answers 404 with a plain text message when the site has no 404 page', async () => {
    const bare = path.join(parent, 'bare');
    mkdirSync(bare);
    writeFileSync(path.join(bare, 'index.html'), '<h1>bare</h1>');
    const other = await serve(bare);
    try {
      const response = await fetch(`${other.url}/nothing/`);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe('Not found');
    } finally {
      await other.close();
    }
  });

  it('ignores a query string and a fragment', async () => {
    expect(await (await fetch(`${server.url}/status/?a=1`)).text()).toBe('<h1>status</h1>');
  });

  it('redirects a folder written without its trailing slash, as a static host does', async () => {
    const response = await fetch(`${server.url}/status`, { redirect: 'manual' });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/status/');
  });

  it('answers HEAD without a body, and refuses other methods', async () => {
    const head = await fetch(`${server.url}/`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await head.text()).toBe('');
    expect((await fetch(`${server.url}/`, { method: 'POST' })).status).toBe(405);
  });

  /** A raw request, because fetch tidies `..` out of an address before it is sent. */
  function raw(requestPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const { port } = new URL(server.url);
      const req = request({ host: '127.0.0.1', port, path: requestPath, method: 'GET' }, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it.each(['/../secret.txt', '/%2e%2e/secret.txt', '/a/../../secret.txt', '/..%2fsecret.txt'])('does not serve a file outside the folder: %s', async (requestPath) => {
    const { status, body } = await raw(requestPath);
    expect(status).toBe(404);
    expect(body).not.toContain('TOP SECRET');
  });

  it('stops listening when it is closed', async () => {
    const other = await serve(dist);
    expect((await fetch(`${other.url}/`)).status).toBe(200);
    await other.close();
    await expect(fetch(`${other.url}/`)).rejects.toThrow();
  });

  it('refuses a folder that does not exist', async () => {
    await expect(serve(path.join(parent, 'nope'))).rejects.toThrow('is not a folder');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/serve-dist.test.ts`
Expected: FAIL — `Cannot find module '../scripts/serve-dist.mjs'`.

- [ ] **Step 3: Write the server**

**Create `site/scripts/serve-dist.mjs`:**
```js
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// A small static server for the built site, used by the Lighthouse run. It
// serves a folder the way a static host does: a folder address is its
// index.html, a missing file is a 404 with the site's own 404 page, and nothing
// outside the folder is ever served.

export const MIME_TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

/**
 * The file inside `root` that the path of a request names, or undefined if the path is not valid or would leave `root`.
 * The path is the raw one from the request line, without its query string: it is decoded here, once. A path that ends
 * in a slash names the index.html of that folder. A ".." that would climb above the root is refused, not clamped.
 *
 * @param {string} root
 * @param {string} requestPath
 * @returns {string | undefined}
 */
export function resolveRequestPath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined;

  /** @type {string[]} */
  const segments = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  if (decoded.endsWith('/') || segments.length === 0) segments.push('index.html');
  return path.join(root, ...segments);
}

/**
 * @param {string} root
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
async function handle(root, request, response) {
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': MIME_TYPES['.txt'] });
    response.end(head ? undefined : 'Method not allowed');
    return;
  }

  const target = request.url ?? '/';
  const requestPath = target.split(/[?#]/, 1)[0];
  const file = resolveRequestPath(root, requestPath);
  const info = file === undefined ? undefined : await stat(file).catch(() => undefined);

  if (file !== undefined && info?.isDirectory()) {
    response.writeHead(308, { Location: `${requestPath}/${target.slice(requestPath.length)}` });
    response.end();
    return;
  }
  if (file === undefined || info === undefined || !info.isFile()) {
    const page = await readFile(path.join(root, '404.html')).catch(() => undefined);
    response.writeHead(404, { 'Content-Type': page === undefined ? MIME_TYPES['.txt'] : MIME_TYPES['.html'] });
    response.end(head ? undefined : (page ?? 'Not found'));
    return;
  }

  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size });
  response.end(head ? undefined : await readFile(file));
}

/**
 * Serve the folder `dir` on a free port of the local address.
 *
 * @param {string} dir
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serve(dir) {
  const root = path.resolve(dir);
  const info = await stat(root).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) throw new Error(`${root} is not a folder`);

  const server = createServer((request, response) => {
    handle(root, request, response).catch(() => {
      response.writeHead(500, { 'Content-Type': MIME_TYPES['.txt'] });
      response.end('Server error');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve(undefined) : reject(error)));
        server.closeAllConnections();
      }),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/site -- test/serve-dist.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add site/scripts/serve-dist.mjs site/test/serve-dist.test.ts
git commit -m "feat(site): add a static server for the built site that never serves outside its folder" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 68: Lighthouse on the fixture build

**Files:**
- Modify: `site/package.json`, `package-lock.json` (two dev dependencies), `package.json` (the `lighthouse` script)
- Create: `site/scripts/lighthouse-lib.mjs`, `site/scripts/lighthouse.mjs`
- Test: `site/test/lighthouse-lib.test.ts`, `site/test/lighthouse-cli.test.ts`

The milestone is done only when Lighthouse gives 95 or more in every category on the home page, an article and a receipts page. `npm run lighthouse` measures exactly those three pages of the fixture build, in the four categories (performance, accessibility, best practices, SEO), prints a table, and exits 1 if any score is below 0.95. It builds nothing: the fixture build must already be in `site/dist`.

How it works:

- It reads `site/dist/index.html`. If the folder is missing, or the home page has no fixture ribbon (a production build, which has no article), it stops with a message that says to run `npm run build:fixtures` (exit code 2).
- It serves `site/dist` with the server of the last task, starts Chrome headless with `chrome-launcher`, and runs Lighthouse's Node API on `/`, on the first article the home page links to (the lead piece, which in the fixtures is the golden piece `fixture-robotics-ships-fx-1-to-second-plant`) and on that article's `receipts/` page. Lighthouse's defaults apply: a phone-sized screen and a simulated slow network.
- `chrome-launcher` finds Chrome. The `CHROME_PATH` environment variable comes first; then, on macOS, the standard places in `/Applications`; on Linux, `google-chrome`, `google-chrome-stable`, `chromium-browser` and `chromium` on the path. If it finds none, the command says so and says to set `CHROME_PATH` (exit code 2). `--no-sandbox` is added only when the `CI` environment variable is set, because a container on a CI runner usually cannot give Chrome a sandbox.
- The parts that need no browser are in `lighthouse-lib.mjs` and are tested: which pages to measure, the Chrome flags, the table, and which scores are too low. A missing score counts as a failure. The command takes the measurement as a function, so its tests run the whole flow (serving, exit codes, messages) with a fake measurement and no browser.

**Versions.** `lighthouse` 13.5.0 and `chrome-launcher` 1.2.2. Lighthouse 13 needs Node 22.19 or newer.

The scores are not tuned. Where this was verified (a Mac with Google Chrome), all three pages scored 100 in all four categories on the first run, because the design starts from the things Lighthouse asks for: text contrast above 4.5:1 in both colour schemes (tested in Milestone 2 part A), a skip link and visible focus, labelled landmarks, a title, a description and a canonical link on every page, no web fonts, no images, no scripts (apart from the block of structured data on an article), and pages of under 30 KB before compression. Nothing in the pages or in the threshold was changed to get there.

- [ ] **Step 1: Install**

Run: `npm install --save-exact --save-dev --no-audit --no-fund --workspace @robywire/site lighthouse@13.5.0 chrome-launcher@1.2.2`
Expected: PASS

Run: `grep -n "lighthouse\|chrome-launcher" site/package.json`
Expected: PASS — `"chrome-launcher": "1.2.2"` and `"lighthouse": "13.5.0"`.

- [ ] **Step 2: Write the failing tests for the helpers**

**Create `site/test/lighthouse-lib.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { CATEGORIES, THRESHOLD, chromeFlags, formatScores, isFixtureBuild, lowScores, pagesToTest } from '../scripts/lighthouse-lib.mjs';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const home = (body: string) => `<!doctype html><html lang="en"><head><title>T</title></head><body>${body}</body></html>`;
const RIBBON = '<div class="ribbon" role="note">FIXTURE DATA &mdash; not real reporting</div>';
const LEAD = `<h2><a href="/news/${SLUG}/">Title</a></h2>`;
const row = (url: string, scores: Record<string, number | null>) => ({ url, scores });
const PERFECT = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };

describe('isFixtureBuild', () => {
  it('is true for the home page of a fixture build, which carries the ribbon', () => {
    expect(isFixtureBuild(home(RIBBON + LEAD))).toBe(true);
  });

  it('is false for the home page of a production build', () => {
    expect(isFixtureBuild(home('<p class="empty">No pieces yet.</p>'))).toBe(false);
  });
});

describe('pagesToTest', () => {
  it('is the home page, the lead article and its receipts page', () => {
    expect(pagesToTest(home(RIBBON + LEAD))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('takes the first article link, and skips receipts links and topic links', () => {
    const body = `<a href="/topics/humanoids/">h</a><a href="/news/other/receipts/">r</a>${LEAD}<a href="/news/second/">s</a>`;
    expect(pagesToTest(home(body))[1]).toBe(`/news/${SLUG}/`);
  });

  it('stops with a clear message when the home page links to no article', () => {
    expect(() => pagesToTest(home('<p>No pieces yet.</p>'))).toThrow('links to no article');
  });
});

describe('chromeFlags', () => {
  it('runs Chrome headless', () => {
    expect(chromeFlags({})).toEqual(['--headless']);
  });

  it('adds --no-sandbox only when CI is set', () => {
    expect(chromeFlags({ CI: 'true' })).toEqual(['--headless', '--no-sandbox']);
    expect(chromeFlags({ CI: '1' })).toContain('--no-sandbox');
    expect(chromeFlags({ CI: '' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: 'false' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: '0' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: undefined })).toEqual(['--headless']);
  });
});

describe('lowScores', () => {
  it('has the four categories and a threshold of 0.95', () => {
    expect(CATEGORIES).toEqual(['performance', 'accessibility', 'best-practices', 'seo']);
    expect(THRESHOLD).toBe(0.95);
  });

  it('is empty when every score reaches the threshold, 0.95 included', () => {
    expect(lowScores([row('/', PERFECT), row('/a/', { ...PERFECT, seo: 0.95 })])).toEqual([]);
  });

  it('lists each score below the threshold with its page and category', () => {
    expect(lowScores([row('/', PERFECT), row('/a/', { ...PERFECT, performance: 0.94, seo: 0.5 })])).toEqual([
      { url: '/a/', category: 'performance', score: 0.94 },
      { url: '/a/', category: 'seo', score: 0.5 },
    ]);
  });

  it('counts a category that has no score as a failure', () => {
    expect(lowScores([row('/', { ...PERFECT, accessibility: null })])).toEqual([{ url: '/', category: 'accessibility', score: null }]);
  });

  it('counts a category that is missing altogether as a failure', () => {
    expect(lowScores([row('/', { performance: 1, accessibility: 1, 'best-practices': 1 })])).toEqual([{ url: '/', category: 'seo', score: null }]);
  });
});

describe('formatScores', () => {
  it('writes a table of the four scores for each page, as whole numbers out of 100', () => {
    const table = formatScores([row('/', PERFECT), row('/news/a-long-slug/receipts/', { performance: 0.97, accessibility: 1, 'best-practices': 0.96, seo: 1 })]);
    expect(table).toBe(
      [
        'Page                         Performance  Accessibility  Best practices  SEO',
        '/                                    100            100             100  100',
        '/news/a-long-slug/receipts/           97            100              96  100',
      ].join('\n'),
    );
  });

  it('shows a missing score as two dashes', () => {
    const line = formatScores([row('/', { performance: 1, accessibility: null, 'best-practices': 1, seo: 1 })]).split('\n')[1]!;
    expect(line.split(/\s{2,}/)).toEqual(['/', '100', '--', '100', '100']);
  });
});
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-lib.test.ts`
Expected: FAIL — `Cannot find module '../scripts/lighthouse-lib.mjs'`.

- [ ] **Step 3: Write the helpers**

**Create `site/scripts/lighthouse-lib.mjs`:**
```js
import { attr, elements, parseHtml } from './audit/dom.mjs';

// The parts of the Lighthouse run that do not need a browser, so that they can
// be tested: which pages to measure, how Chrome is started, how the scores are
// shown and which of them are too low.

/** The four Lighthouse categories, in the order they are shown. */
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** The names of the categories as the table shows them. */
const HEADINGS = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO' };

/** The lowest score a page may have in any category. */
export const THRESHOLD = 0.95;

/**
 * True for the home page of a fixture build, which carries the fixture ribbon.
 * @param {string} homeHtml
 * @returns {boolean}
 */
export function isFixtureBuild(homeHtml) {
  return homeHtml.includes('FIXTURE DATA');
}

/**
 * The pages to measure: the home page, the first article the home page links to (its lead piece) and the receipts page of that article.
 * @param {string} homeHtml
 * @returns {string[]}
 */
export function pagesToTest(homeHtml) {
  const { document } = parseHtml(homeHtml);
  const lead = elements(document, 'a')
    .map((link) => attr(link, 'href') ?? '')
    .find((href) => /^\/news\/[^/]+\/$/.test(href));
  if (lead === undefined) throw new Error('The home page links to no article, so there is no article page to measure.');
  return ['/', lead, `${lead}receipts/`];
}

/**
 * The flags Chrome is started with: headless, and without its sandbox when the CI variable is set, because
 * a container on a CI runner usually cannot give Chrome one.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function chromeFlags(env) {
  const inCi = env.CI !== undefined && env.CI !== '' && env.CI !== 'false' && env.CI !== '0';
  return inCi ? ['--headless', '--no-sandbox'] : ['--headless'];
}

/**
 * One page and its scores, each from 0 to 1 or null when Lighthouse gave none.
 * @typedef {{ url: string, scores: Record<string, number | null> }} ScoreRow
 */

/**
 * Every score below `threshold`, and every category with no score at all.
 * @param {ScoreRow[]} rows
 * @param {number} [threshold]
 * @returns {{ url: string, category: string, score: number | null }[]}
 */
export function lowScores(rows, threshold = THRESHOLD) {
  return rows.flatMap((row) =>
    CATEGORIES.flatMap((category) => {
      const score = row.scores[category] ?? null;
      return score === null || score < threshold ? [{ url: row.url, category, score }] : [];
    }),
  );
}

/**
 * A table of the scores, one row for each page, as whole numbers out of 100.
 * @param {ScoreRow[]} rows
 * @returns {string}
 */
export function formatScores(rows) {
  const urlWidth = Math.max('Page'.length, ...rows.map((row) => row.url.length));
  const widths = CATEGORIES.map((category) => HEADINGS[/** @type {keyof typeof HEADINGS} */ (category)].length);
  const line = (/** @type {string} */ first, /** @type {string[]} */ cells) =>
    [first.padEnd(urlWidth), ...cells.map((cell, index) => cell.padStart(widths[index]))].join('  ');
  return [
    line('Page', CATEGORIES.map((category) => HEADINGS[/** @type {keyof typeof HEADINGS} */ (category)])),
    ...rows.map((row) =>
      line(
        row.url,
        CATEGORIES.map((category) => {
          const score = row.scores[category] ?? null;
          return score === null ? '--' : String(Math.round(score * 100));
        }),
      ),
    ),
  ].join('\n');
}
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-lib.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 4: Write the failing tests for the command**

**Create `site/test/lighthouse-cli.test.ts`:**
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../scripts/lighthouse.mjs';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const RIBBON = '<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div>';
const PERFECT = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A small built site with the given home page. */
function dist(homeBody: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-lh-'));
  folders.push(dir);
  const files: Record<string, string> = {
    'index.html': `<!doctype html><html lang="en"><head><title>Home</title></head><body>${homeBody}</body></html>`,
    [`news/${SLUG}/index.html`]: '<!doctype html><title>Article</title>',
    [`news/${SLUG}/receipts/index.html`]: '<!doctype html><title>Receipts</title>',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

type Measure = NonNullable<Parameters<typeof main>[0]>['measure'];

/** Run the command with a measurement that does not start a browser. */
async function run(directory: string, measure: Measure) {
  const lines: string[] = [];
  const code = await main({ dist: directory, print: (text: string) => lines.push(text), measure });
  return { code, output: lines.join('\n') };
}

const goodHome = `${RIBBON}<a href="/news/${SLUG}/">Title</a>`;

describe('the Lighthouse command', () => {
  it('serves the fixture build, measures the home page, the lead article and its receipts, and exits 0 when every score is high', async () => {
    const seen: { routes: string[]; statuses: number[] } = { routes: [], statuses: [] };
    const { code, output } = await run(dist(goodHome), async (baseUrl, routes) => {
      seen.routes = routes;
      seen.statuses = await Promise.all(routes.map(async (route) => (await fetch(baseUrl + route)).status));
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen.routes).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
    expect(seen.statuses).toEqual([200, 200, 200]);
    expect(code).toBe(0);
    expect(output).toContain('Performance  Accessibility  Best practices  SEO');
    expect(output).toContain('All scores are 95 or more.');
  });

  it('exits 1 and names each score below 95', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: url === '/' ? { ...PERFECT, seo: 0.9 } : PERFECT })));
    expect(code).toBe(1);
    expect(output).toContain('Below 95:');
    expect(output).toContain('/ seo 90');
  });

  it('says "no score" for a category that Lighthouse gave no score', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: { ...PERFECT, accessibility: null } })));
    expect(code).toBe(1);
    expect(output).toContain('/ accessibility no score');
  });

  it('exits 2 and says to build the fixtures when the site is a production build', async () => {
    const { code, output } = await run(dist('<p class="empty">No pieces yet.</p>'), async () => {
      throw new Error('must not be measured');
    });
    expect(code).toBe(2);
    expect(output).toContain('is a production build');
    expect(output).toContain('npm run build:fixtures');
  });

  it('exits 2 and says to build the fixtures when there is no built site', async () => {
    const { code, output } = await run(path.join(tmpdir(), 'robywire-no-such-folder'), async () => []);
    expect(code).toBe(2);
    expect(output).toContain('npm run build:fixtures');
  });

  it.each(['ERR_LAUNCHER_PATH_NOT_SET', 'ERR_LAUNCHER_NOT_INSTALLED'])('exits 2 and says how to find Chrome when chrome-launcher reports %s', async (errorCode) => {
    const { code, output } = await run(dist(goodHome), async () => {
      throw Object.assign(new Error('No Chrome installations found.'), { code: errorCode });
    });
    expect(code).toBe(2);
    expect(output).toContain('Chrome was not found');
    expect(output).toContain('CHROME_PATH');
  });

  it('exits 2 with the message of any other failure of the measurement', async () => {
    const { code, output } = await run(dist(goodHome), async () => {
      throw new Error('the page did not load');
    });
    expect(code).toBe(2);
    expect(output).toContain('Lighthouse failed: the page did not load');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-cli.test.ts`
Expected: FAIL — `Cannot find module '../scripts/lighthouse.mjs'`.

- [ ] **Step 5: Write the command**

**Create `site/scripts/lighthouse.mjs`:**
```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES, THRESHOLD, chromeFlags, formatScores, isFixtureBuild, lowScores, pagesToTest } from './lighthouse-lib.mjs';
import { serve } from './serve-dist.mjs';

// `npm run lighthouse` measures the built fixture site with Lighthouse: the
// home page, the lead article and its receipts page, in all four categories.
// It builds nothing. It exits 0 if every score is 95 or more, 1 if any is
// lower, and 2 if it could not measure (no fixture build, no Chrome).

const DEFAULT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/**
 * Measure the pages at `baseUrl` with Lighthouse in a headless Chrome. Chrome is found by chrome-launcher, which
 * uses the CHROME_PATH environment variable first. Lighthouse's own defaults apply: a phone-sized screen and
 * simulated slow network.
 *
 * @param {string} baseUrl
 * @param {string[]} routes
 * @returns {Promise<import('./lighthouse-lib.mjs').ScoreRow[]>}
 */
async function measureWithChrome(baseUrl, routes) {
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  const chrome = await launch({ chromeFlags: chromeFlags(process.env) });
  try {
    /** @type {import('./lighthouse-lib.mjs').ScoreRow[]} */
    const rows = [];
    for (const route of routes) {
      const result = await lighthouse(baseUrl + route, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: CATEGORIES });
      const categories = result?.lhr.categories ?? {};
      rows.push({ url: route, scores: Object.fromEntries(CATEGORIES.map((category) => [category, categories[category]?.score ?? null])) });
    }
    return rows;
  } finally {
    chrome.kill();
  }
}

/**
 * Run the measurement. Returns the exit code.
 *
 * @param {{ dist?: string, print?: (text: string) => void, measure?: typeof measureWithChrome }} [options]
 * @returns {Promise<number>}
 */
export async function main({ dist = DEFAULT_DIST, print = console.log, measure = measureWithChrome } = {}) {
  let home;
  try {
    home = readFileSync(path.join(dist, 'index.html'), 'utf8');
  } catch {
    print(`There is no built site in ${dist}. Run "npm run build:fixtures" first.`);
    return 2;
  }
  if (!isFixtureBuild(home)) {
    print(`${dist} is a production build, which has no article to measure. Run "npm run build:fixtures" first.`);
    return 2;
  }

  const server = await serve(dist);
  try {
    const rows = await measure(server.url, pagesToTest(home));
    print(`Lighthouse, ${rows.length} pages (phone screen, simulated slow network)`);
    print(formatScores(rows));
    const low = lowScores(rows);
    if (low.length === 0) {
      print(`All scores are ${THRESHOLD * 100} or more.`);
      return 0;
    }
    print(`Below ${THRESHOLD * 100}:`);
    for (const item of low) print(`  ${item.url} ${item.category} ${item.score === null ? 'no score' : Math.round(item.score * 100)}`);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /** @type {{ code?: string }} */ (error)?.code;
    if (code === 'ERR_LAUNCHER_PATH_NOT_SET' || code === 'ERR_LAUNCHER_NOT_INSTALLED') print('Chrome was not found. Install Google Chrome, or set CHROME_PATH to the Chrome executable.');
    else print(`Lighthouse failed: ${message}`);
    return 2;
  } finally {
    await server.close();
  }
}

// Run when started as a script, not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-cli.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Add the root script**

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
    "build:fixtures": "npm run build:fixtures --workspace @robywire/site",
    "audit": "node site/scripts/audit.mjs",
    "audit:prod": "node site/scripts/audit.mjs --prod",
    "lighthouse": "node site/scripts/lighthouse.mjs"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 7: Run Lighthouse on the fixture build**

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `npm run lighthouse`
Expected: PASS — a table with the columns `Performance  Accessibility  Best practices  SEO` and a row for `/`, for the golden article and for its `receipts/` page, then `All scores are 95 or more.`

It takes about half a minute. If it says that Chrome was not found, install Google Chrome or set the `CHROME_PATH` environment variable to the Chrome executable, for example `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` on a Mac, and run it again.

- [ ] **Step 8: Prove it can fail, and that it refuses a production build**

Take the description out of the built home page, which costs the page SEO points.

Run: `sed -i.bak 's#<meta name="description"[^>]*>##' site/dist/index.html && rm site/dist/index.html.bak`
Expected: PASS

Run: `npm run lighthouse`
Expected: FAIL — `Below 95:` and `/ seo`.

Build the fixtures again to put the page back.

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

Run: `npm run build`
Expected: PASS — `[build] Complete!`.

Run: `npm run lighthouse`
Expected: FAIL — `is a production build` and `npm run build:fixtures`.

Leave the fixture build in place for the next steps.

Run: `npm run build:fixtures`
Expected: PASS — `[build] Complete!`.

- [ ] **Step 9: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json site/package.json site/scripts site/test
git commit -m "feat(site): add the Lighthouse command that measures the fixture build and fails below 95" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 69: `npm run verify`, CI and the README

**Files:**
- Modify: `package.json` (the `verify` script), `.github/workflows/ci.yml`, `README.md`
- Test: `site/test/verify.test.ts`

One command should say whether the repository is in order, and CI should run exactly the same steps.

- `npm run verify` runs, in this order: typecheck, test, evals:seeded, fixtures:check, build (production), audit:prod, build:fixtures, audit, lighthouse. The production audit comes right after the production build, and the fixture audit and Lighthouse right after the fixture build, because each one reads what `site/dist` holds at that moment.
- `.github/workflows/ci.yml` runs the same steps one by one, each with a name, so that a failure names the step. Chrome is installed on the `ubuntu-latest` runner, and `chrome-launcher` finds it (it looks for `google-chrome` on the path), so `CHROME_PATH` is not set. GitHub sets `CI=true`, so the Lighthouse command starts Chrome without its sandbox.
- You cannot run GitHub Actions on your own machine. What can be checked here is the file itself: the test parses the workflow with a YAML parser and compares its steps with the `verify` script, so that the two lists cannot drift apart.
- The README documents every command, the fixture policy and how to read the scoreboard. The test requires that every root script is named in it, and that it names the Node version Lighthouse needs (22.19) and the fixture flag.

- [ ] **Step 1: Write the failing test**

**Create `site/test/verify.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// `npm run verify` is the one command that says whether the repository is in
// order, and CI runs the same steps one by one. These tests keep the two lists
// identical, and keep the README honest about what the commands are.

const ROOT = new URL('../../', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, ROOT), 'utf8');

const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string>; engines: { node: string } };
const workflow = parse(read('.github/workflows/ci.yml')) as {
  on: { push: { branches: string[] }; pull_request: unknown };
  jobs: Record<string, { 'runs-on': string; steps: { name?: string; uses?: string; with?: Record<string, string>; run?: string }[] }>;
};
const readme = read('README.md');

/** The scripts a command line such as "npm run build && npm test" runs, in order. */
function scriptsOf(commandLine: string): string[] {
  return commandLine.split('&&').map((part) => {
    const match = /^\s*npm (?:run )?([\w:.-]+)\s*$/.exec(part);
    if (match === null) throw new Error(`not an npm script: ${JSON.stringify(part)}`);
    return match[1]!;
  });
}

const EXPECTED_ORDER = ['typecheck', 'test', 'evals:seeded', 'fixtures:check', 'build', 'audit:prod', 'build:fixtures', 'audit', 'lighthouse'];

describe('the verify script', () => {
  it('runs typecheck, tests, seeded evals, fixture drift, the production build and its audit, the fixture build and its audit, then Lighthouse', () => {
    expect(scriptsOf(pkg.scripts.verify!)).toEqual(EXPECTED_ORDER);
  });

  it('runs only scripts that exist', () => {
    for (const name of scriptsOf(pkg.scripts.verify!)) expect(pkg.scripts, name).toHaveProperty(name);
  });
});

describe('the CI workflow', () => {
  const job = Object.values(workflow.jobs)[0]!;
  const runs = job.steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

  it('runs on a push to main and on every pull request', () => {
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on).toHaveProperty('pull_request');
  });

  it('has one job, on Ubuntu, with the Node version of .nvmrc', () => {
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    expect(job['runs-on']).toBe('ubuntu-latest');
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node'));
    expect(setup?.with?.['node-version-file']).toBe('.nvmrc');
  });

  it('installs exactly what the lock file pins, then runs the steps of the verify script in the same order', () => {
    expect(runs[0]).toBe('npm ci');
    expect(runs.slice(1).map((run) => scriptsOf(run)[0])).toEqual(scriptsOf(pkg.scripts.verify!));
  });

  it('runs each step as one npm script, so that a failure names the step', () => {
    for (const run of runs.slice(1)) expect(scriptsOf(run), run).toHaveLength(1);
  });

  it('gives every step a name', () => {
    for (const step of job.steps) expect(step.name, JSON.stringify(step)).toBeTruthy();
  });
});

describe('the README', () => {
  it('names every root script, so that a new command cannot be left undocumented', () => {
    for (const name of Object.keys(pkg.scripts)) {
      const spelled = name === 'test' ? 'npm test' : `npm run ${name}`;
      expect(readme, name).toContain(spelled);
    }
  });

  it('names the Node version Lighthouse needs, and the fixture flag', () => {
    expect(readme).toContain('22.19');
    expect(readme).toContain('ROBYWIRE_FIXTURES=1');
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...readme].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });

  it('is in step with the Node version the package asks for', () => {
    expect(pkg.engines.node).toBe('>=22');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'split')`, because there is no `verify` script yet.

- [ ] **Step 2: Add the verify script**

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
    "build:fixtures": "npm run build:fixtures --workspace @robywire/site",
    "audit": "node site/scripts/audit.mjs",
    "audit:prod": "node site/scripts/audit.mjs --prod",
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 3: Make CI run the same steps**

**Replace `.github/workflows/ci.yml` with:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

# These steps are the steps of `npm run verify`, one by one so that a failure
# names the step. site/test/verify.test.ts keeps the two lists identical.
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the repository
        uses: actions/checkout@v7

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test

      - name: Seeded-defect evals
        run: npm run evals:seeded

      - name: Fixture drift
        run: npm run fixtures:check

      - name: Production build
        run: npm run build

      - name: Audit the production build
        run: npm run audit:prod

      - name: Fixture build
        run: npm run build:fixtures

      - name: Audit the fixture build
        run: npm run audit

      # The ubuntu-latest image has Google Chrome installed, and chrome-launcher
      # finds it (google-chrome on the path). GitHub sets CI=true, so the
      # command starts Chrome without its sandbox, which a runner cannot give it.
      - name: Lighthouse
        run: npm run lighthouse
```

Check that the file is valid YAML and list its steps.

Run: `node -e "const { parse } = require('yaml'); const doc = parse(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8')); console.log(doc.jobs.check.steps.map((step) => step.run ?? step.uses).join(' | '));"`
Expected: PASS — `actions/checkout@v7 | actions/setup-node@v7 | npm ci | npm run typecheck | npm run test | npm run evals:seeded | npm run fixtures:check | npm run build | npm run audit:prod | npm run build:fixtures | npm run audit | npm run lighthouse`.

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `names every root script` and `names the Node version Lighthouse needs`: the README is next.

- [ ] **Step 4: Write the README**

**Replace `README.md` with:**
```markdown
# Robywire

Robywire is a daily robotics news site. The Desk is the pipeline that writes it. A piece publishes without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify is held for the owner.

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).

## Repository layout

| Path | What it is |
|---|---|
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
| `docs/` | Specs and plans. |

The workspace packages export their TypeScript source directly, so there is no build step for them.

## Source registry

`sources.yml` is the tiered registry of where stories come from.

- Tier 1 (primary) sources are what the Desk writes from: a company's own announcement, a paper, a filing, a standard, a results sheet.
- Tier 2 (secondary) sources are what the Desk discovers from: other outlets' feeds that say something happened. They are never the sole source of a claim.

If a story has no reachable tier-1 source, that fact goes in the piece. It is never quietly laundered through a competitor's reporting.

Every `status` starts as `unverified`; the Desk changes it as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Requirements

- Node 22.19 or newer (`.nvmrc` says 22, which installs the latest 22.x; Lighthouse needs 22.19) and npm 10 or newer.
- A POSIX shell: macOS, Linux or WSL. The fixture build sets an environment variable in the usual shell way.
- Google Chrome, for `npm run lighthouse` only. It is found automatically; to use another Chrome or Chromium, set `CHROME_PATH` to its executable.

## Commands

Run everything from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins. |
| `npm run typecheck` | `tsc` in `gate` and `evals`, and `astro check` in `site`. |
| `npm test` | Vitest in every workspace. |
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12, A14 and A15 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article, receipts page) and fail if any score is under 95. |
| `npm run verify` | All of the above in CI order: typecheck, tests, seeded evals, fixture drift, production build, production audit, fixture build, fixture audit, Lighthouse. |

`npm run build` and `npm run build:fixtures` both write `site/dist`, so the second replaces the first. `npm run verify` runs them in the order that each audit needs.

For local work on the pages, run `ROBYWIRE_FIXTURES=1 npm run dev --workspace @robywire/site`.

## Fixtures

Until the Desk has published something there is nothing real to show, so the site is built and tested on made-up pieces. All of it is fictional: the company is Fixture Robotics, the product is the FX-1, and every address is on `*.example`.

- `npm run fixtures:generate --workspace @robywire/site` writes the fixture pieces, their ledgers and a desk state into `site/src/content-fixtures/`. It starts from the golden piece in `gate/src/fixtures/`, makes variants of it, and runs each through the real gate and the real renderer, so the fixtures are what the Desk will produce.
- The generated files are committed. `npm run fixtures:check` fails if they are out of date.
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.

## The audit

`npm run audit` reads the built pages in `site/dist` and checks them against the rules of the design and of the content. The checks are listed, with a sentence for each, in `site/scripts/audit/checks.mjs`; every check has a test that gives it a page it must accept and a page it must reject. They include: every page parses and has one `h1`, a title, a description and a skip link; no images, no italics, no web fonts, no border over one pixel, no rounded corner; every colour is one of the design tokens in `site/src/styles/tokens.css`; every internal link and `#fragment` resolves; every article links to its receipts page and has `NewsArticle` data; every claim marker in an article leads to its claim; and the feed, the sitemap, `robots.txt` and the 404 page are there and agree.

## Reading the scoreboard

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

The site shows the same file on its `/method/` page, under the headline `N of N seeded defects caught`. Each row is one defect:

- `id` names the defect, for example `swapped-number` (a sentence says 83 kg where the cited claim says 38 kg).
- `check` and `code` are the rule and the failure code that should catch it, for example G4 and `G4_NUMBER_UNSUPPORTED`.
- `caught` is `true` when the gate reported that code, and `false` when it did not. A `false` fails the tests, and the page would show it in red as `missed`.
- `baselinePasses` says that the unbroken golden piece publishes, so a catch means the gate saw the defect and did not simply reject everything.

The scoreboard is a floor, not a proof. It says the gate catches the defects that were thought of; it says nothing about the ones nobody seeded. The independent model check and its measured accuracy come later and are not part of the scoreboard.

## CI

`.github/workflows/ci.yml` runs the steps of `npm run verify` one by one on every push to `main` and on every pull request, and `site/test/verify.test.ts` fails if the two lists differ. Chrome is already installed on the `ubuntu-latest` runner.
```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS — `0 errors`.

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add .github README.md package.json site/test/verify.test.ts
git commit -m "feat: add npm run verify, run its steps in CI, and document the commands, the fixtures and the scoreboard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Prove that CI and verify cannot drift**

Take the fixture audit step out of the workflow, as if someone had forgotten it.

Run: `sed -i.bak '/- name: Audit the fixture build/,/run: npm run audit$/d' .github/workflows/ci.yml && rm .github/workflows/ci.yml.bak`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `installs exactly what the lock file pins, then runs the steps of the verify script in the same order`.

Put the workflow back.

Run: `git checkout -- .github/workflows/ci.yml`
Expected: PASS

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

---

### Task 70: Verify Plan 1 from a clean install

This task changes nothing and makes no commit. It is the proof that the three milestones of Plan 1 hold together: everything installed from the lock file alone, and every check passing, in the order CI runs them.

- [ ] **Step 1: Start from nothing**

Delete every installed package, as a fresh clone would have none.

Run: `rm -rf node_modules gate/node_modules evals/node_modules site/node_modules`
Expected: PASS

Run: `npm ci --no-audit --no-fund`
Expected: PASS — `added`, followed by the number of packages.

`npm ci` fails if `package-lock.json` and the `package.json` files disagree, so this also proves the lock file is complete.

- [ ] **Step 2: Run every check**

Run: `npm run verify`
Expected: PASS — it takes a minute or two. In order, you will see: `Result` from `astro check` with `0 errors`; the test summaries of `gate`, `evals` and `site`, none of them failed; `PASS: every seeded defect was caught.`; `Fixtures are up to date.`; the production build, which prints an Astro warning for each page that the collections `news` and `ledger` are empty (that is right: a production build has no pieces yet); `Passed: 15 checks.` from `audit:prod`; the fixture build; `Passed: 14 checks.` from `audit`; and last the Lighthouse table.

The end of the output, as it was when this plan was verified (on another machine a score can be a point or two lower; all must be 95 or more):

```text
> robywire@0.0.0 lighthouse
> node site/scripts/lighthouse.mjs

Lighthouse, 3 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

- [ ] **Step 3: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing.

The checks wrote no file that is not already committed: `evals/scoreboard/seeded.json` is rewritten with the same content, and `site/dist` and `.astro` are ignored by git.

- [ ] **Step 4: Match the milestones to their proof**

Section 14 of the design spec gives each milestone of Plan 1 a "done when" line. Each has a command that shows it.

| Milestone | Done when (spec section 14) | The command that shows it |
|---|---|---|
| 0. Foundations: repo, workspaces, schemas, CI skeleton, `sources.yml` | Typecheck and CI pass | `npm run typecheck` prints `0 errors` for `astro check` and exits 0 for `tsc` in `gate` and `evals`. CI runs the steps of `npm run verify`, and `site/test/verify.test.ts` keeps the two identical. `sources.yml` is validated by `gate/test/sources.test.ts`, which runs in `npm test`. |
| 1. Gate, built test-first against the seeded-defect fixtures | 100% of deterministic defects caught | `npm run evals:seeded` prints `40 of 40 cases caught (100.0%)` and `PASS: every seeded defect was caught.` Every failure code of G1 to G9 is covered, and a test fails if one is not. |
| 2. Site shell and design system, rendered from hand-written fixture pieces | Build, schema, link and Lighthouse checks pass | Build: `npm run build` and `npm run build:fixtures` finish with `[build] Complete!`. Schema: the content collections validate every piece and ledger against the gate's own schemas, and a bad file stops the build. Link: check A8 of `npm run audit` resolves every internal link, file and `#fragment`, and A9 and A11 check the receipts pages and claim markers. Lighthouse: `npm run lighthouse` prints 95 or more in every category for the home page, an article and a receipts page. |

Note: this table is superseded by Task 88, which restates it for the finished plan: the fixture pieces are generated from the golden piece and are not written by hand, and the seeded cases are 54, not 40.

Plan 1 is finished. Plan 2 builds the Desk on top of it: the pipeline stages, the model check G10, the daily run, and the deploy.
