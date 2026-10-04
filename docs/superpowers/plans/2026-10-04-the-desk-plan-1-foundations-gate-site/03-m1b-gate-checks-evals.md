## Milestone 1 (part B) — Checks G6–G9 and the seeded-defect evals

**Goal:** finish the gate and prove it works. This part adds the four remaining deterministic checks (G6 sourcing, G7 analysis rules, G8 limitations, G9 hygiene) and the slug helper, registers all nine checks so that `runGate` runs them together, and then builds the seeded-defect evals: a harness that takes the golden piece, breaks it in a known way for every failure code the gate can report, and fails if the gate misses even one. The result is written to a committed scoreboard file that the site shows later. Everything here is deterministic. Nothing touches the network, a clock, a random number or a model.

**Starting state:** Part A (Milestone 1 part A) is finished and committed. `npm run typecheck` and `npm test` pass. `gate/src/checks/` holds `g1-frontmatter.ts` to `g5-quotes.ts` and `index.ts`, where `ALL_CHECKS` lists five checks. `gate/src/fixtures/` holds the golden piece (`cloneGolden()`), and `gate/test/helpers.ts` holds the test helpers `mutate`, `findSentence` and `claimById`. `evals/` is an empty package: `evals/src/index.ts` exports nothing and there are no tests. No package is downloaded in this part; Task 27 only links the `gate` workspace into `evals`.

**What you need to know about the gate (a reminder from part A).** A *draft* is made of *sentences* of kind `fact`, `analysis` or `limitation`; a sentence cites *claims* by id; a *check* is a pure function `(input, ctx) => { failures, holdReasons }`; `runGate` runs the checks and chooses a route: any failure means `revise`, otherwise any hold reason means `hold`, otherwise `publish`. `allSentences(draft)` lists every sentence in document order with its section, and `describeLocation(item)` turns one into text such as `opening, sentence 2` or `section "What shipped", sentence 4`; every failure puts that text in its `where`. The golden piece passes every check. Tests start from `cloneGolden()`, change one thing with `mutate(base, change)`, and expect exactly the matching failure.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one gate test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts`. For the evals package use `npm test --workspace @robywire/evals -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. A character outside ASCII is written as a `\uXXXX` escape (for example `'\u201C'` is a curly opening quote). Type the escapes exactly as shown; never paste the character itself.
- Code style matches the earlier milestones: two-space indentation, single quotes, semicolons, trailing commas, `import type` for imports that are only types.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

---

### Task 19: Failure code lists and `ALL_FAILURE_CODES`

**Files:**
- Modify: `gate/src/checks/g1-frontmatter.ts`, `gate/src/checks/g2-structure.ts`, `gate/src/checks/g3-coverage.ts`, `gate/src/checks/g4-values.ts`, `gate/src/checks/g5-quotes.ts` (each exports the list of its own failure codes)
- Modify: `gate/src/checks/index.ts` (export the lists and build `ALL_FAILURE_CODES`)
- Test: `gate/test/failure-codes.test.ts`

Every failure a check reports has a stable code such as `G4_NUMBER_UNSUPPORTED`. The seeded-defect evals at the end of this milestone must prove that the gate catches every code, so there has to be one list of all the codes that nobody can forget to update. Each check file now exports the list of its own codes (`G1_CODES`, `G2_CODES`, up to `G9_CODES` once all nine exist), and `ALL_FAILURE_CODES` is the lists joined in order. The new test does four things:

- it checks that `ALL_FAILURE_CODES` is exactly the lists joined, with no duplicates, and that each code starts with its check's id;
- it reads the source file of each check and finds every code written as a quoted string such as `'G4_NAME_UNSUPPORTED'`; the codes found must be exactly the codes in that check's list;
- it requires each code to appear at least twice in its file: once in the list and at least once where it is reported, so a code that is listed but never reported is caught;
- it requires one list for every `gNN-*.ts` file in `gate/src/checks/`, so a new check cannot be added without a list.

This test is extended in each of the next check tasks, which add one entry to its table of lists.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/failure-codes.test.ts`:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
// lists. The seeded-defect evals read it to prove that every code is caught,
// so a code that is missing here would silently escape the proof.
const LISTS: Record<string, readonly string[]> = {
  G1: G1_CODES,
  G2: G2_CODES,
  G3: G3_CODES,
  G4: G4_CODES,
  G5: G5_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
const checkFiles = readdirSync(CHECKS_DIR).filter((file) => /^g\d-.*\.ts$/.test(file));

/** The code literals ('G4_NAME_UNSUPPORTED') that a source text contains, with how often each appears. */
function literalsIn(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of source.matchAll(/'(G\d_[A-Z0-9_]+)'/g)) {
    const code = match[1]!;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

describe('ALL_FAILURE_CODES', () => {
  it('lists the codes of every registered check, in order', () => {
    expect(ALL_FAILURE_CODES).toEqual(Object.values(LISTS).flat());
  });

  it('lists no code twice', () => {
    expect(new Set(ALL_FAILURE_CODES).size).toBe(ALL_FAILURE_CODES.length);
  });

  it.each(Object.entries(LISTS))('has only codes that start with the id of %s', (id, codes) => {
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(code).toMatch(new RegExp(`^${id}_[A-Z0-9_]+$`));
    }
  });
});

describe('the check source files', () => {
  it('has one file for each check that has a list, and no other', () => {
    expect(checkFiles.map((file) => `G${file[1]}`)).toEqual(Object.keys(LISTS));
  });

  it.each(checkFiles)('%s reports exactly the codes in its list, and reports each of them', (file) => {
    const id = `G${file[1]}`;
    const found = literalsIn(readFileSync(new URL(file, CHECKS_DIR), 'utf8'));
    // A code appears once in the list and at least once more where it is reported.
    expect([...found.keys()].sort()).toEqual([...LISTS[id]!].sort());
    for (const [code, count] of found) {
      expect(count, `${code} is listed but never reported`).toBeGreaterThanOrEqual(2);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/failure-codes.test.ts`
Expected: FAIL — `lists the codes of every registered check, in order`.

- [ ] **Step 3: Write the implementation**

Add the list of codes to each of the five check files.

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
import { parseDateToken } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

const MIN_CATEGORIES = 1;
const MAX_CATEGORIES = 3;

```

**with:**
```ts
import { parseDateToken } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

/** Every failure code G1 can report. */
export const G1_CODES = [
  'G1_TITLE_EMPTY',
  'G1_DESCRIPTION_TOO_LONG',
  'G1_BAD_DATE',
  'G1_SLUG_FORMAT',
  'G1_CATEGORY_COUNT',
  'G1_CATEGORY_UNKNOWN',
  'G1_CATEGORY_NO_BEAT',
  'G1_AUTHOR_MISSING',
] as const;

const MIN_CATEGORIES = 1;
const MAX_CATEGORIES = 3;

```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
import { allSentences } from '../sentences';
import { countWords } from '../text';

const MIN_SECTIONS = 2;

const isSafeBasis = (basis: string) => (SAFE_BASES as readonly string[]).includes(basis);
```

**with:**
```ts
import { allSentences } from '../sentences';
import { countWords } from '../text';

/** Every failure code G2 can report. */
export const G2_CODES = [
  'G2_OPENING_LENGTH',
  'G2_TAKEAWAYS_COUNT',
  'G2_BODY_LENGTH',
  'G2_SECTIONS_MIN',
  'G2_HEADING_QUESTION',
  'G2_LIMITATIONS_MISSING',
] as const;

const MIN_SECTIONS = 2;

const isSafeBasis = (basis: string) => (SAFE_BASES as readonly string[]).includes(basis);
```

**In `gate/src/checks/g3-coverage.ts`, replace:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';

/**
 * G3, coverage: every fact sentence cites at least one claim, and every claim
 * any sentence cites exists. It looks at every sentence of the piece: title,
```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G3 can report. */
export const G3_CODES = ['G3_NO_CLAIM', 'G3_UNKNOWN_CLAIM'] as const;

/**
 * G3, coverage: every fact sentence cites at least one claim, and every claim
 * any sentence cites exists. It looks at every sentence of the piece: title,
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
import { normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf } from '../tokens';

/**
 * A number value of a claim in canonical form. The raw text is the authority:
 * it is parsed with the same function as the sentence, so "1.2k" and "1,200"
```

**with:**
```ts
import { normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf } from '../tokens';

/** Every failure code G4 can report. */
export const G4_CODES = [
  'G4_NUMBER_UNSUPPORTED',
  'G4_DATE_UNSUPPORTED',
  'G4_NAME_UNSUPPORTED',
  'G4_VALUE_NOT_IN_SPAN',
] as const;

/**
 * A number value of a claim in canonical form. The raw text is the authority:
 * it is parsed with the same function as the sentence, so "1.2k" and "1,200"
```

**In `gate/src/checks/g5-quotes.ts`, replace:**
```ts
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes, quotedSegments } from '../text';

/**
 * G5, quotes: every passage in double quotation marks in the title, the
 * description or a fact or analysis sentence is word for word inside the
```

**with:**
```ts
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes, quotedSegments } from '../text';

/** Every failure code G5 can report. */
export const G5_CODES = ['G5_QUOTE_NOT_VERBATIM'] as const;

/**
 * G5, quotes: every passage in double quotation marks in the title, the
 * description or a fact or analysis sentence is word for word inside the
```

Then export the lists and build `ALL_FAILURE_CODES`.

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';

export { checkG1, checkG2, checkG3, checkG4, checkG5 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [...G1_CODES, ...G2_CODES, ...G3_CODES, ...G4_CODES, ...G5_CODES];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/failure-codes.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g1-frontmatter.ts gate/src/checks/g2-structure.ts gate/src/checks/g3-coverage.ts gate/src/checks/g4-values.ts gate/src/checks/g5-quotes.ts gate/src/checks/index.ts gate/test/failure-codes.test.ts
git commit -m "feat(gate): list every failure code of G1 to G5 and expose them as ALL_FAILURE_CODES" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Check G6, sourcing

**Files:**
- Create: `gate/src/checks/g6-sourcing.ts`
- Modify: `gate/src/checks/index.ts` (register the check and its codes)
- Modify: `gate/test/failure-codes.test.ts` (add G6 to the table)
- Test: `gate/test/g6-sourcing.test.ts`

G6 is about where a claim comes from. A claim's `source.tier` is 1 (the company, the paper, the filing: the primary source) or 2 (another outlet reporting it). A tier-2 claim may be used only as an attribution: the sentence says who reported it ("Mercer Wire reports that 7 investors took part in the round.") and is marked `attributed: true`. A piece that rests on a tier-2 claim can never publish by itself; the owner decides.

| Code | When |
|---|---|
| `G6_TIER2_UNATTRIBUTED` | a `fact` sentence cites a tier-2 claim and is not marked `attributed: true`, or its text does not contain the claim's `source.outlet` (compared without regard to case, quote shapes or spacing). If it cites several tier-2 claims, every outlet must be named. One failure per sentence. |
| `G6_TIER2_IN_ANALYSIS` | an `analysis` sentence cites a tier-2 claim. Analysis may rest only on tier-1 claims. |

If there are no G6 failures and at least one fact sentence cites a tier-2 claim, the check passes but returns the hold reason `TIER2_ATTRIBUTION`, once for the whole piece however many sentences cite tier-2 claims. While there is still a G6 failure the hold reason is withheld, because the piece goes back for revision first. Limitation sentences are not read (they describe a claim and assert nothing), and a claim id that does not exist is G3's to report.

The tests build tier-2 claims by changing a golden claim: set `source.tier` to `2` and `source.outlet` to a name (the schema requires an outlet for tier 2). They use `c-19` (the investor count) and `c-24` (the Ashvale go-live date), each cited by exactly one golden sentence.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g6-sourcing.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { claimById, findSentence, mutate } from './helpers';

const OUTLET = 'Mercer Wire';
const OTHER_OUTLET = 'Tarn Daily';

// Two golden sentences that each cite exactly one claim, and that no other
// sentence cites: c-19 (the investor count) and c-24 (the Ashvale go-live date).
const INVESTORS = 'It lists 7 investors in the round.';
const INVESTORS_AT = 'section "What the filing shows", sentence 3';
const GO_LIVE = 'The installation at Ashvale went live on 18 August 2026, according to Brindle Logistics.';
const GO_LIVE_AT = 'section "What the customer reports", sentence 3';

const sentenceWith = (g: GateInput, text: string) => findSentence(g.draft, (sentence) => sentence.text === text);

/** Make a golden claim a tier-2 claim reported by `outlet`. */
function makeTier2(g: GateInput, id: string, outlet: string = OUTLET): void {
  const { source } = claimById(g.claims, id);
  source.tier = 2;
  source.outlet = outlet;
}

/** Add a copy of claim `from` as the tier-2 claim c-29, which no sentence cites yet. */
function addTier2Copy(g: GateInput, from: string): void {
  const copy = structuredClone(claimById(g.claims, from));
  copy.id = 'c-29';
  copy.source.tier = 2;
  copy.source.outlet = OUTLET;
  g.claims.push(copy);
}

/** Rewrite the sentence `current` the way a tier-2 claim must be written: with the outlet's name, marked attributed. */
function attribute(g: GateInput, current: string, text: string): void {
  const sentence = sentenceWith(g, current);
  sentence.text = text;
  if (sentence.kind === 'fact') sentence.attributed = true;
}

const run = (change: (copy: GateInput) => void): CheckOutput => checkG6(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);
const messages = (output: CheckOutput) => output.failures.map((failure) => failure.message);

describe('G6: the golden piece', () => {
  it('passes with no failures and no hold reasons, because every claim is tier 1', () => {
    expect(checkG6(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the sixth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[5]).toBe(checkG6);
  });

  it('does not change its input', () => {
    const input = mutate(cloneGolden(), (g) => makeTier2(g, 'c-19'));
    const before = structuredClone(input);
    checkG6(input, defaultContext());
    expect(input).toEqual(before);
  });

  it('does not ask for attribution on a tier-1 sentence that happens to be marked attributed', () => {
    const output = run((g) => {
      const sentence = sentenceWith(g, INVESTORS);
      if (sentence.kind === 'fact') sentence.attributed = true;
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G6_TIER2_UNATTRIBUTED', () => {
  it('fails a fact sentence that cites a tier-2 claim and is not marked attributed, and says where and why', () => {
    const output = run((g) => makeTier2(g, 'c-19'));
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER2_UNATTRIBUTED',
        message: `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it is not marked attributed and it does not name "Mercer Wire"; write "<outlet> reports ..." and mark the sentence attributed`,
        where: INVESTORS_AT,
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('fails a sentence that is marked attributed but does not name the outlet', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'The filing lists 7 investors, according to reports.');
    });
    expect(messages(output)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it does not name "Mercer Wire"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('fails a sentence that names the outlet but is not marked attributed', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      sentenceWith(g, INVESTORS).text = 'Mercer Wire reports that 7 investors took part in the round.';
    });
    expect(messages(output)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it is not marked attributed; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('fails a sentence that is marked attributed: false', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      const sentence = sentenceWith(g, INVESTORS);
      sentence.text = 'Mercer Wire reports that 7 investors took part in the round.';
      if (sentence.kind === 'fact') sentence.attributed = false;
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('fails a sentence that cites a tier-2 claim with no outlet recorded, because it can never be named', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      delete claimById(g.claims, 'c-19').source.outlet;
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('needs every tier-2 outlet a sentence cites to be named, not only one of them', () => {
    const atInvestors = (text: string) =>
      run((g) => {
        makeTier2(g, 'c-19');
        makeTier2(g, 'c-24', OTHER_OUTLET);
        attribute(g, INVESTORS, text);
        sentenceWith(g, text).claimIds = ['c-19', 'c-24'];
      }).failures.filter((failure) => failure.where === INVESTORS_AT);

    expect(atInvestors('Mercer Wire and Tarn Daily report that 7 investors took part.')).toEqual([]);
    expect(atInvestors('Mercer Wire reports that 7 investors took part.').map((failure) => failure.message)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claims c-19, c-24 but it does not name "Tarn Daily"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('lists every outlet the sentence leaves out', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24', OTHER_OUTLET);
      attribute(g, INVESTORS, 'Two outlets report that 7 investors took part.');
      sentenceWith(g, 'Two outlets report that 7 investors took part.').claimIds = ['c-19', 'c-24'];
    });
    expect(output.failures.filter((failure) => failure.where === INVESTORS_AT).map((failure) => failure.message)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claims c-19, c-24 but it does not name "Mercer Wire" or "Tarn Daily"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('names an outlet once when two of the claims a sentence cites come from it', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      makeTier2(g, 'c-18');
    });
    const opening = output.failures.find((failure) => failure.where === 'opening, sentence 3');
    expect(opening?.message).toContain('but it is not marked attributed and it does not name "Mercer Wire"; write');
  });

  it('names a claim once in the message when the sentence cites it twice', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      sentenceWith(g, INVESTORS).claimIds = ['c-19', 'c-19'];
    });
    expect(messages(output)[0]).toContain('tier-2 claim c-19 but');
  });

  it('does not take a blank outlet for a name that every sentence contains', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', '   ');
      attribute(g, INVESTORS, 'Reports say that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('ignores spaces around the outlet as recorded', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', '  Mercer Wire ');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it('reports a sentence once, however many tier-2 claims it cites', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      makeTier2(g, 'c-18');
    });
    expect(output.failures.filter((failure) => failure.where === 'opening, sentence 3')).toHaveLength(1);
  });

  it('reports each unattributed sentence separately, in document order', () => {
    const output = run((g) => makeTier2(g, 'c-18'));
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G6_TIER2_UNATTRIBUTED', 'opening, sentence 3'],
      ['G6_TIER2_UNATTRIBUTED', 'section "What the filing shows", sentence 1'],
    ]);
  });

  it('matches the outlet whatever its case, and ignores the shape of apostrophes and spacing', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', "O'Neill  Wire");
      attribute(g, INVESTORS, 'O\u2019NEILL wire reports that 7 investors took part.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[0]!.paragraphs[1]![2]!, 'section "What shipped", sentence 7'],
  ])('reads %s', (_name, pick, where) => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      pick(g).claimIds = ['c-19'];
    });
    expect(output.failures.filter((failure) => failure.where === where).map((failure) => failure.code)).toEqual([
      'G6_TIER2_UNATTRIBUTED',
    ]);
  });
});

describe('the hold reason', () => {
  it('passes a properly attributed tier-2 citation but asks for a hold', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it('asks for the hold once for the whole piece, however many sentences cite tier-2 claims', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
      attribute(g, GO_LIVE, 'Mercer Wire reports that the installation at Ashvale went live on 18 August 2026.');
    });
    expect(output.failures).toEqual([]);
    expect(output.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });

  it('is withheld while there is still a G6 failure, because the piece is going back for revision anyway', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output.failures.map((failure) => failure.where)).toEqual([GO_LIVE_AT]);
    expect(output.holdReasons).toEqual([]);
  });

  it('is not asked for when no sentence cites the tier-2 claim', () => {
    expect(run((g) => addTier2Copy(g, 'c-19'))).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G6_TIER2_IN_ANALYSIS', () => {
  const analysisAt = 'section "What the customer reports", sentence 6';
  const analysis = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');

  it('fails an analysis sentence that cites a tier-2 claim', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-12');
      analysis(g).claimIds.push('c-29');
    });
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER2_IN_ANALYSIS',
        message: `the analysis sentence at ${analysisAt} cites c-29, which comes from a tier-2 outlet; analysis may rest only on tier-1 claims`,
        where: analysisAt,
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('fails even when an attributed fact sentence cites the same claim properly', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
      analysis(g).claimIds.push('c-19');
    });
    expect(codes(output)).toEqual(['G6_TIER2_IN_ANALYSIS']);
    expect(output.holdReasons).toEqual([]);
  });
});

describe('what G6 leaves to other checks', () => {
  it('ignores a claim id that does not exist, which G3 reports', () => {
    const output = run((g) => {
      sentenceWith(g, INVESTORS).claimIds = ['c-999'];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not read limitation sentences, which describe a claim and assert nothing', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g6-sourcing'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g6-sourcing.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';

/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS'] as const;

/** Why a piece that cites a tier-2 claim, even a properly attributed one, can never publish by itself. */
const HOLD_TIER2 = 'TIER2_ATTRIBUTION';

/**
 * G6, sourcing: a claim from a tier-2 outlet (another publication's reporting)
 * may be used only as an attribution. A fact sentence that cites one must be
 * marked `attributed` and must name the outlet ("Mercer Wire reports that ...").
 * An analysis sentence may not cite one at all.
 *
 * A piece whose tier-2 citations are all properly attributed passes this
 * check but asks for a hold, once: the owner decides. The hold reason is
 * withheld while G6 still has a failure, because the piece goes back for
 * revision first.
 *
 * Limitation sentences are not read: they describe a claim and assert nothing.
 * A claim id that does not exist is G3's to report.
 */
export const checkG6: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];
  let tier2Facts = 0;

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind === 'limitation') continue;
    const tier2 = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []).filter((claim) => claim.source.tier === 2);
    if (tier2.length === 0) continue;

    const where = describeLocation(located);
    const ids = tier2.map((claim) => claim.id).join(', ');

    if (sentence.kind === 'analysis') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_IN_ANALYSIS',
        message: `the analysis sentence at ${where} cites ${ids}, which comes from a tier-2 outlet; analysis may rest only on tier-1 claims`,
        where,
      });
      continue;
    }

    tier2Facts++;
    const text = normaliseQuotes(sentence.text).toLowerCase();
    const outlets = [...new Set(tier2.map((claim) => claim.source.outlet?.trim() ?? ''))];
    const unnamed = outlets.filter((outlet) => outlet === '' || !text.includes(normaliseQuotes(outlet).toLowerCase()));

    const problems: string[] = [];
    if (sentence.attributed !== true) problems.push('it is not marked attributed');
    if (unnamed.length > 0) problems.push(`it does not name ${unnamed.map((outlet) => `"${outlet}"`).join(' or ')}`);
    if (problems.length > 0) {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_UNATTRIBUTED',
        message: `the fact sentence at ${where} rests on tier-2 ${tier2.length === 1 ? 'claim' : 'claims'} ${ids} but ${problems.join(' and ')}; write "<outlet> reports ..." and mark the sentence attributed`,
        where,
      });
    }
  }

  return { failures, holdReasons: failures.length === 0 && tier2Facts > 0 ? [HOLD_TIER2] : [] };
};
```

Register the check and its codes.

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
];
```

Add G6 to the table in the failure-codes test.

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**with:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
  G3: G3_CODES,
  G4: G4_CODES,
  G5: G5_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

**with:**
```ts
  G3: G3_CODES,
  G4: G4_CODES,
  G5: G5_CODES,
  G6: G6_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts test/failure-codes.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g6-sourcing.ts gate/src/checks/index.ts gate/test/g6-sourcing.test.ts gate/test/failure-codes.test.ts
git commit -m "feat(gate): add check G6 for tier-2 attribution and the tier-2 hold" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 21: G4 accepts the outlet of a cited claim as a name

**Files:**
- Modify: `gate/src/checks/g4-values.ts` (the outlet's words count as supported names)
- Test: `gate/test/g4-values.test.ts`

G6 makes an attributed sentence name its outlet ("Mercer Wire reports that 7 investors took part in the round."). G4 reads every capitalised word after the first as a name that a cited claim must list. Without a change, G4 would reject the words `Wire` in that sentence, and the outlet cannot be listed as a name value on the claim, because G4 also requires every value to appear in the claim's quoted span and the outlet is not in the span. An attributed tier-2 sentence could then never pass the whole gate. So G4 now also accepts the words of `source.outlet` of every claim the sentence cites. The outlet is recorded by the pipeline, not written by the composer, so this does not let an invented name through. A claim the sentence does not cite contributes nothing, and no other capitalised word becomes acceptable.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block after the existing names tests, at the end of the `G4 names` block.

**In `gate/test/g4-values.test.ts`, replace:**
```ts
  });
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('Jane said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
```

**with:**
```ts
  });
});

describe('G4 names: the outlet of a tier-2 claim', () => {
  const fromOutlet = (id: string, outlet: string) =>
    claimOf([num('7', '7')], { id, source: { ...claimOf([]).source, tier: 2, outlet } });

  it('is a name the sentence may use, because an attribution has to say who reported it', () => {
    const claim = fromOutlet('c-1', 'The Robot Report');
    expect(codes(mini('Sales rose to 7, The Robot Report says.', [claim]))).toEqual([]);
  });

  it('is accepted word by word, in any case', () => {
    expect(codes(mini('Sales rose to 7, says MERCER wire.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([]);
  });

  it('is not accepted from a claim the sentence does not cite', () => {
    const claim = fromOutlet('c-2', 'Mercer Wire');
    expect(codes(mini('Sales rose to 7, says Mercer Wire.', [claim], ['c-2']))).toEqual([]);
    expect(codes(mini('Sales rose to 7, says Mercer Wire.', [claim, claimOf([num('7', '7')], { id: 'c-1' })], ['c-1']))).toEqual([
      'G4_NAME_UNSUPPORTED',
      'G4_NAME_UNSUPPORTED',
    ]);
  });

  it('does not make any other capitalised word acceptable', () => {
    expect(codes(mini('Sales rose to 7, says Mercer Wire in Harlow.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([
      'G4_NAME_UNSUPPORTED',
    ]);
  });

  it('lets the golden piece name the outlet of an attributed tier-2 sentence', () => {
    const failures = goldenCodes((g) => {
      const claim = g.claims.find((item) => item.id === 'c-19')!;
      claim.source.tier = 2;
      claim.source.outlet = 'Mercer Wire';
      findSentence(g.draft, (sentence) => sentence.text === 'It lists 7 investors in the round.').text =
        'The Mercer Wire reports that 7 investors took part in the round.';
    });
    expect(failures).toEqual([]);
  });
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('Jane said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts`
Expected: FAIL — `G4 names: the outlet of a tier-2 claim`.

- [ ] **Step 3: Write the implementation**

Update the comment that describes how names match.

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A date matches a claim date at the
 * precision the sentence uses. A name matches when each of its words is a word
 * of a cited claim's name value or is on the allow-list. Name detection is
 * deliberately strict (see `extractTokens`): a false positive only costs a
 * revision round, a false negative would let an invented name through.
 *
```

**with:**
```ts
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A date matches a claim date at the
 * precision the sentence uses. A name matches when each of its words is a word
 * of a cited claim's name value or outlet, or is on the allow-list. Name detection is
 * deliberately strict (see `extractTokens`): a false positive only costs a
 * revision round, a false negative would let an invented name through.
 *
```

Then make the outlet's words part of the supported names.

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
    const values = cited.flatMap((claim) => claim.values);
    const supportedNumbers = values.filter((value) => value.kind === 'number').map(claimNumber);
    const supportedDates = values.filter((value) => value.kind === 'date').map(claimDate);
    const supportedNames = new Set(values.filter((value) => value.kind === 'name').flatMap((value) => nameTokensOf(value.raw)));

    const tokens = extractTokens(sentence.text);
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });
```

**with:**
```ts
    const values = cited.flatMap((claim) => claim.values);
    const supportedNumbers = values.filter((value) => value.kind === 'number').map(claimNumber);
    const supportedDates = values.filter((value) => value.kind === 'date').map(claimDate);
    // The outlet of a cited claim counts as a name too: a tier-2 claim can only
    // be used as an attribution ("Mercer Wire reports ..."), and G6 requires the
    // sentence to say so. The outlet is recorded by the pipeline, not written by the composer.
    const supportedNames = new Set([
      ...values.filter((value) => value.kind === 'name').flatMap((value) => nameTokensOf(value.raw)),
      ...cited.flatMap((claim) => nameTokensOf(claim.source.outlet ?? '')),
    ]);

    const tokens = extractTokens(sentence.text);
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g4-values.ts gate/test/g4-values.test.ts
git commit -m "feat(gate): let G4 accept the outlet of a cited claim as a name, so tier-2 attributions can pass" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Check G7, analysis rules

**Files:**
- Create: `gate/src/checks/g7-analysis.ts`
- Modify: `gate/src/checks/index.ts` (register the check and its codes)
- Modify: `gate/test/failure-codes.test.ts` (add G7 to the table)
- Test: `gate/test/g7-analysis.test.ts`

An `analysis` sentence is the Desk's own reading of the facts, labelled "Analysis" on the page. It is kept on a short lead by three rules:

| Code | When |
|---|---|
| `G7_ANALYSIS_PLACEMENT` | an analysis sentence is in the title, the description, the opening or the takeaways. It belongs in the sections of the body. One failure per sentence. |
| `G7_ANALYSIS_SHARE` | analysis sentences are more than `ctx.config.analysisShareCap` (default 0.2) of the body's sentences. The body here is the opening, the takeaways, every section paragraph and the limitations; the title and description are not counted. `where` is `body`. |
| `G7_ANALYSIS_NEW_VALUE` | an analysis sentence contains a number, date or name that no fact sentence of the piece contains. |

How "contains" is decided, using `extractTokens` (from part A) on every fact sentence and every analysis sentence:

- A number matches a fact number with the same value, and with the same unit when the analysis gives one (so `12` matches `12 kg`, and `12 lb` does not).
- A date matches a fact date at the precision the analysis uses (so `August 2026` matches `18 August 2026`, but `18 August 2026` does not match a fact that says only `August 2026`).
- A name is a lowercased capitalised word; the first word of a sentence is never a name, and words on `ctx.nameAllowList` are ignored. A name that a fact sentence has only as its first word does not count as stated: say it in the middle of a fact sentence.
- Only fact sentences supply the facts. Another analysis sentence, or a limitation, does not license a new value.
- Quoted text is not read (G5 checks quotes). Each new value is reported once per sentence.

The share is computed by dividing, never by multiplying the cap: 12 analysis sentences of 60 is exactly 0.2 and passes, because `12 / 60` and `0.2` are the same double, while `0.2 * 60` need not be exactly 12.

The golden piece has 47 body sentences, one of them analysis (opening 3, takeaways 4, sections 25, limitations 15). Ten more analysis sentences make 11 of 57 (19.3%) and pass; eleven more make 12 of 58 (20.7%) and fail. The tests rely on those numbers.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g7-analysis.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG7 } from '../src/checks/g7-analysis';
import { defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import type { Sentence } from '../src/schemas';
import { findSentence, mutate } from './helpers';

const twoFacts: Sentence[] = [
  { kind: 'fact', text: 'Another plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'One more plain fact.', claimIds: ['c-1'] },
];

// The golden piece has exactly one analysis sentence. It contains no number,
// date or name, so it adds nothing the facts do not already say.
const ANALYSIS_AT = 'section "What the customer reports", sentence 6';
const analysisSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');

const run = (change: (copy: GateInput) => void, overrides?: ContextOverrides): CheckOutput =>
  checkG7(mutate(cloneGolden(), change), defaultContext(overrides));
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

/** Make a fact sentence into an analysis sentence with the same words and claims. */
const asAnalysis = (sentence: Sentence): Sentence => ({ kind: 'analysis', text: sentence.text, claimIds: sentence.claimIds });

/** Say `text` in the golden piece's one analysis sentence. */
const saying = (text: string) => (g: GateInput) => {
  analysisSentence(g).text = text;
};

/** Add `count` analysis sentences with no number, date or name to the last paragraph of the piece. */
function addAnalysis(g: GateInput, count: number): void {
  const last = g.draft.sections.at(-1)!.paragraphs.at(-1)!;
  for (let i = 0; i < count; i++) last.push({ kind: 'analysis', text: 'That is a plain reading of the figures.', claimIds: [] });
}

describe('G7: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG7(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('really contains the one analysis sentence the other tests build on', () => {
    expect(analysisSentence(cloneGolden()).text).toBe(
      'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
    );
  });

  it('is the seventh check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[6]).toBe(checkG7);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG7(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G7_ANALYSIS_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = asAnalysis(g.draft.title)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = asAnalysis(g.draft.description)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = asAnalysis(g.draft.opening[1]!)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[3] = asAnalysis(g.draft.takeaways[3]!)), 'takeaways, sentence 4'],
  ])('fails an analysis sentence in %s', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_PLACEMENT',
        message: `the analysis sentence at ${where} is not allowed there: analysis belongs in the sections of the body`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = asAnalysis(g.draft.title);
      g.draft.opening[0] = asAnalysis(g.draft.opening[0]!);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'opening, sentence 1']);
  });

  it('allows analysis in the sections of the body', () => {
    expect(run((g) => (g.draft.sections[2]!.paragraphs[1]![0] = asAnalysis(g.draft.sections[2]!.paragraphs[1]![0]!)))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });
});

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 47 sentences, one of them analysis: opening 3,
  // takeaways 4, sections 25, limitations 15. Ten more analysis sentences make
  // 11 of 57 (19.3%); eleven more make 12 of 58 (20.7%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 10))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 11)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 12 of the 58 sentences in the body (20.7%); the cap is 20.0%',
        where: 'body',
      },
    ]);
  });

  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.02 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.03 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 1 / 47 } })).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['the opening', (g: GateInput) => g.draft.opening.push(...twoFacts)],
    ['the takeaways', (g: GateInput) => g.draft.takeaways.push(...twoFacts)],
    ['a section', (g: GateInput) => g.draft.sections[0]!.paragraphs[0]!.push(...twoFacts)],
    ['the limitations', (g: GateInput) => g.draft.limitations.push(structuredClone(g.draft.limitations[0]!), structuredClone(g.draft.limitations[1]!))],
  ])('counts the sentences of %s among the body sentences', (_name, addTwo) => {
    // 12 analysis sentences of 58 is over the cap; two more body sentences make it exactly 12 of 60, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 11);
      addTwo(g);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 2 of 47 would be over a cap of 1 in 47; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 1 / 47 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });

  it('has no share to measure in a piece with no body sentences', () => {
    const output = run((g) => {
      g.draft.opening = [];
      g.draft.takeaways = [];
      g.draft.sections = [];
      g.draft.limitations = [];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G7_ANALYSIS_NEW_VALUE: numbers', () => {
  const NEW_NUMBER = 'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';

  it('fails an analysis sentence that brings in a number no fact sentence contains, and says which', () => {
    expect(run(saying(NEW_NUMBER)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number "22%", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a number the facts state', 'The measured 940 picks an hour is below the maximum.'],
    ['the same number written differently', 'The measured rate is below the 1.2k maximum, and a 12 kg payload is rated.'],
    ['a number whose unit the facts also use', 'The 38 kg arm and its 650 W draw are modest.'],
    ['a number without a unit that the facts give a unit', 'The 38 figure is a mass.'],
    ['a currency amount the facts state', 'The $450 million round is large.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails the same number with a different unit', () => {
    expect(codes(run(saying('The 12 lb payload is modest.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('reports a new number once, however often the sentence repeats it', () => {
    expect(codes(run(saying('Up 22% and then 22% again, and 31%.')))).toEqual(['G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_VALUE']);
  });

  it('takes the facts to be the fact sentences only: not another analysis sentence, not a limitation', () => {
    const second = run((g) => {
      saying('The gap is 22% in this case.')(g);
      addAnalysis(g, 1);
      findSentence(g.draft, (sentence) => sentence.text === 'That is a plain reading of the figures.').text = 'It is also 22% in the other case.';
    });
    expect(codes(second)).toEqual(['G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_VALUE']);

    const limitation = run((g) => {
      g.draft.limitations[0]!.text = 'The 77 kg figure comes from somewhere.';
      saying('The 77 kg figure is an outlier.')(g);
    });
    expect(codes(limitation)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('takes a number from any fact sentence: the title, the description, the takeaways and the sections', () => {
    expect(run(saying('The 1.4 m reach and the 40 arms are modest.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reads an analysis sentence in the wrong place for new values as well as for placement', () => {
    const output = run((g) => {
      g.draft.opening[1] = { kind: 'analysis', text: 'That is 22% more than before.', claimIds: [] };
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_NEW_VALUE']);
  });
});

describe('G7_ANALYSIS_NEW_VALUE: dates', () => {
  it('fails a date no fact sentence contains, and says which', () => {
    const output = run(saying('The gap has narrowed since 5 August 2026.'));
    expect(output.failures.map((failure) => [failure.code, failure.message])).toEqual([
      ['G7_ANALYSIS_NEW_VALUE', `the analysis sentence at ${ANALYSIS_AT} introduces the date "5 August 2026", which no fact sentence contains`],
    ]);
  });

  it.each([
    ['a date the facts state', 'The gap has narrowed since 18 August 2026.'],
    ['the same date written another way', 'The gap has narrowed since 2026-08-18.'],
    ['a month that a stated date falls in', 'The gap has narrowed since August 2026.'],
    ['a year that a stated date falls in', 'The gap has narrowed since 2026.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports a new date once, however often the sentence repeats it', () => {
    expect(codes(run(saying('Narrower since 5 August 2026, and again since 5 August 2026.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a year the facts do not mention', () => {
    expect(codes(run(saying('The gap may narrow by 2029.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a day when the facts give only the month', () => {
    const output = run((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The installation at Ashvale went live')).text =
        'The installation at Ashvale went live in August 2026, according to Brindle Logistics.';
      saying('The gap has narrowed since 18 August 2026.')(g);
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });
});

describe('G7_ANALYSIS_NEW_VALUE: names', () => {
  it('fails a name no fact sentence contains, and says which', () => {
    const output = run(saying('The rate sits below the maximum, a gap that Harlow Logistics also reported.'));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the name "harlow", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it('allows names the fact sentences use', () => {
    expect(run(saying('The pattern at Ashvale suggests Tarnmoor will follow, as Brindle Logistics hopes.'))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });

  it('exempts the first word of the sentence, as the name check for facts does', () => {
    expect(run(saying('Harlow reported something similar.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('ignores names on the allow-list, and takes the allow-list from the context', () => {
    expect(run(saying('The rate sits below the maximum, as it did on Monday.'))).toEqual({ failures: [], holdReasons: [] });
    const text = 'The rate sits below the maximum, a gap that Harlow also reported.';
    expect(codes(run(saying(text)))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
    expect(run(saying(text), { nameAllowList: ['harlow'] })).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not read quoted words, which G5 checks', () => {
    expect(run(saying('The rate sits below the maximum, a gap that the "Harlow" report calls normal.'))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });

  it('reports each new name once, and several names separately', () => {
    const output = run(saying('The rate sits below the maximum, as Harlow and Harlow and Quillon also found.'));
    expect(output.failures.map((failure) => failure.message.match(/name "([^"]+)"/)?.[1])).toEqual(['harlow', 'quillon']);
  });

  it('does not read fact sentences, which G4 checks', () => {
    const output = run((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The arm itself weighs')).text =
        'The arm itself weighs 83 kg and draws 650 W in typical use, said Harlow.';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g7-analysis.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g7-analysis'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g7-analysis.ts`:**
```ts
import type { LedgerSection } from '../constants';
import type { Check, Failure } from '../gate';
import { dateMatches } from '../normalise';
import type { DateToken, NumberToken } from '../tokens';
import { extractTokens } from '../tokens';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G7 can report. */
export const G7_CODES = ['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_SHARE', 'G7_ANALYSIS_NEW_VALUE'] as const;

/** Parts of the piece where analysis is not allowed: the parts a reader takes as plain fact. */
const NO_ANALYSIS: readonly LedgerSection[] = ['title', 'description', 'opening', 'takeaways'];

/** The sentences the share is measured over: everything below the title and the description. */
const BODY: readonly LedgerSection[] = ['opening', 'takeaways', 'body', 'limitations'];

/**
 * G7, analysis rules. Analysis is the Desk's own reading of the facts, and it
 * is kept on a short lead.
 *
 * - It may appear only in the sections of the body (G7_ANALYSIS_PLACEMENT).
 * - It may be at most `analysisShareCap` of the body's sentences
 *   (G7_ANALYSIS_SHARE). The body here is the opening, the takeaways, the
 *   sections and the limitations.
 * - It may not introduce a number, date or name that no fact sentence of the
 *   piece contains (G7_ANALYSIS_NEW_VALUE). Numbers match by value, and by unit
 *   when the analysis gives one; a date matches a fact date at the precision the
 *   analysis uses; names are the capitalised words `extractTokens` finds,
 *   except the first word of a sentence and the words on the allow-list.
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 */
export const checkG7: Check = ({ draft }, ctx) => {
  const sentences = allSentences(draft);
  const failures: Failure[] = [];
  const analysis = sentences.filter((item) => item.sentence.kind === 'analysis');

  for (const item of analysis.filter((located) => NO_ANALYSIS.includes(located.section))) {
    const where = describeLocation(item);
    failures.push({
      check: 'G7',
      code: 'G7_ANALYSIS_PLACEMENT',
      message: `the analysis sentence at ${where} is not allowed there: analysis belongs in the sections of the body`,
      where,
    });
  }

  const body = sentences.filter((item) => BODY.includes(item.section));
  const inBody = analysis.filter((item) => BODY.includes(item.section)).length;
  // Divide, do not multiply the cap: 12 / 60 is exactly the double 0.2, while 0.2 * 60 may not be exactly 12.
  if (body.length > 0 && inBody / body.length > ctx.config.analysisShareCap) {
    const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
    failures.push({
      check: 'G7',
      code: 'G7_ANALYSIS_SHARE',
      message: `analysis sentences are ${inBody} of the ${body.length} sentences in the body (${percent(inBody / body.length)}); the cap is ${percent(ctx.config.analysisShareCap)}`,
      where: 'body',
    });
  }

  // What the fact sentences state.
  const numbers: NumberToken[] = [];
  const dates: DateToken[] = [];
  const names = new Set<string>();
  for (const item of sentences.filter((located) => located.sentence.kind === 'fact')) {
    const tokens = extractTokens(item.sentence.text);
    numbers.push(...tokens.numbers);
    dates.push(...tokens.dates);
    for (const name of tokens.names) names.add(name);
  }

  for (const item of analysis) {
    const where = describeLocation(item);
    const tokens = extractTokens(item.sentence.text);
    const fail = (what: string) =>
      failures.push({
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${where} introduces the ${what}, which no fact sentence contains`,
        where,
      });

    for (const token of new Map(tokens.numbers.map((number) => [number.raw, number])).values()) {
      if (!numbers.some((fact) => fact.value === token.value && (token.unit === undefined || fact.unit === token.unit))) {
        fail(`number "${token.raw}"`);
      }
    }
    for (const token of new Map(tokens.dates.map((date) => [date.raw, date])).values()) {
      if (!dates.some((fact) => dateMatches(token, fact.iso))) {
        fail(`date "${token.raw}"`);
      }
    }
    for (const name of tokens.names) {
      if (!names.has(name) && !ctx.nameAllowList.has(name)) {
        fail(`name "${name}"`);
      }
    }
  }

  return { failures, holdReasons: [] };
};
```

Register the check and its codes.

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
  ...G7_CODES,
];
```

Add G7 to the table in the failure-codes test.

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**with:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
  G4: G4_CODES,
  G5: G5_CODES,
  G6: G6_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

**with:**
```ts
  G4: G4_CODES,
  G5: G5_CODES,
  G6: G6_CODES,
  G7: G7_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g7-analysis.test.ts test/failure-codes.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g7-analysis.ts gate/src/checks/index.ts gate/test/g7-analysis.test.ts gate/test/failure-codes.test.ts
git commit -m "feat(gate): add check G7 for where analysis may appear, how much, and what it may introduce" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Check G8, limitations

**Files:**
- Create: `gate/src/checks/g8-limitations.ts`
- Modify: `gate/src/checks/index.ts` (register the check and its codes)
- Modify: `gate/test/failure-codes.test.ts` (add G8 to the table)
- Test: `gate/test/g8-limitations.test.ts`

The "What we couldn't verify" sentences are never freely written: each one is rendered from the metadata of exactly one claim through a fixed template (`renderLimitation`, from part A). So G8 can render the sentence again and compare it with the text in the draft. The comparison is exact: one changed word, an extra space or a missing full stop fails.

| Code | When |
|---|---|
| `G8_LIMITATION_PLACEMENT` | a `limitation` sentence is found anywhere except `draft.limitations` (the title, description, opening, takeaways or a section). |
| `G8_LIMITATION_CLAIMS` | a limitation sentence does not cite exactly one claim of this piece: the id is unknown, or it cites none or several. |
| `G8_LIMITATION_MISMATCH` | `sentence.text` is not what `renderLimitation(claim, sentence.template)` renders. The failure message includes the text it must read. This also catches a claim whose `basis`, `status`, label or figure was changed after the sentence was written. |

A misplaced sentence is checked for its claim and its text as well, so it can fail more than once. When the claim is unknown there is nothing to render, so no mismatch is reported. G8 does not ask whether a limitation exists at all; that is G2's question.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g8-limitations.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG8 } from '../src/checks/g8-limitations';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';

const run = (change: (copy: GateInput) => void): CheckOutput => checkG8(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

/** The first golden limitation sentence: the datasheet note for c-8, the payload. */
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT = "The 12 kilograms payload figure comes from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';

/** Point a limitation sentence at these claim ids, whatever the type says about how many there may be. */
const cites = (sentence: LimitationSentence, ids: string[]) => {
  (sentence as { claimIds: string[] }).claimIds = ids;
};

describe('G8: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG8(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('has limitation sentences for the check to read, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(new Set(limitations.map((sentence) => sentence.template))).toEqual(new Set(['basis', 'status']));
  });

  it('is the eighth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[7]).toBe(checkG8);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG8(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });

  it('passes a piece with no limitation sentences, which G2 reports when one is needed', () => {
    expect(run((g) => (g.draft.limitations = []))).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = first(g)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = first(g)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = first(g)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[2] = first(g)), 'takeaways, sentence 3'],
    ['a section', (g: GateInput) => (g.draft.sections[1]!.paragraphs[2]![0] = first(g)), 'section "What the customer reports", sentence 8'],
  ])('fails a limitation sentence in %s, even if its text is right', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_PLACEMENT',
        message: `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = first(g);
      g.draft.takeaways[0] = first(g);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'takeaways, sentence 1']);
  });
});

describe('G8_LIMITATION_CLAIMS', () => {
  it('fails a limitation sentence that cites a claim which does not exist', () => {
    const output = run((g) => cites(first(g), ['c-999']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} cites c-999, which is not one of this piece's claims`,
        where: FIRST_AT,
      },
    ]);
  });

  it.each([
    ['no claim', [] as string[], 'none'],
    ['two claims', ['c-8', 'c-9'], '2'],
  ])('fails a limitation sentence that cites %s', (_name, ids, count) => {
    const output = run((g) => cites(first(g), ids));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} must cite exactly one claim; it cites ${count}`,
        where: FIRST_AT,
      },
    ]);
  });

  it('does not also report a mismatch when there is no claim to render the template from', () => {
    expect(codes(run((g) => cites(first(g), ['c-999'])))).toEqual(['G8_LIMITATION_CLAIMS']);
  });

  it('also reads a limitation sentence in the wrong place', () => {
    const output = run((g) => {
      cites(first(g), ['c-999']);
      g.draft.opening[0] = first(g);
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G8_LIMITATION_PLACEMENT', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', FIRST_AT],
    ]);
  });
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
    const output = run((g) => {
      first(g).text = 'The payload figure is exact.';
    });
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8; it must read: "${FIRST_TEXT}"`,
        where: FIRST_AT,
      },
    ]);
  });

  it('compares the text exactly: one changed word, an extra space or a missing full stop fails', () => {
    for (const text of [
      FIRST_TEXT.replace('available', 'obtainable'),
      FIRST_TEXT.replace('payload', 'payload  '),
      FIRST_TEXT.replace(/\.$/, ''),
      `${FIRST_TEXT} `,
      FIRST_TEXT.toLowerCase(),
    ]) {
      expect(codes(run((g) => (first(g).text = text))), text).toEqual(['G8_LIMITATION_MISMATCH']);
    }
  });

  it('fails the right text under the wrong template', () => {
    // The text is the basis sentence for c-8; the status template renders something else.
    const output = run((g) => {
      first(g).template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} does not match the status template for c-8; it must read: "The source does not say whether the payload has been demonstrated or deployed."`,
    ]);
  });

  it('fails the right text under the wrong claim', () => {
    expect(codes(run((g) => cites(first(g), ['c-9'])))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it.each([
    ['c-8', 'basis', 'briefing'],
    ['c-8', 'basis', 'filing'],
    ['c-5', 'status', 'deployed'],
    ['c-27', 'status', 'planned'],
  ])('fails when the metadata of %s is changed after the sentence was written: %s becomes %s', (id, field, value) => {
    const output = run((g) => {
      Object.assign(claimById(g.claims, id), { [field]: value });
    });
    expect(output.failures.map((failure) => failure.code)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails when the claim\'s label or figure is changed', () => {
    expect(codes(run((g) => (claimById(g.claims, 'c-8').label = 'rated load')))).toEqual(['G8_LIMITATION_MISMATCH']);
    expect(codes(run((g) => (claimById(g.claims, 'c-8').values[0]!.raw = '14 kilograms')))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('reports each mismatched sentence', () => {
    const output = run((g) => {
      g.draft.limitations[0]!.text = 'Wrong.';
      g.draft.limitations[3]!.text = 'Also wrong.';
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['limitations, sentence 1', 'limitations, sentence 4']);
  });
});

describe('what G8 does not read', () => {
  it('ignores fact and analysis sentences, even ones that read like a limitation', () => {
    const output = run((g) => {
      g.draft.opening[0] = { kind: 'fact', text: FIRST_TEXT, claimIds: ['c-8'] };
      g.draft.takeaways[0] = { kind: 'analysis', text: 'The note is not a template sentence.', claimIds: [] };
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g8-limitations'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g8-limitations.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { renderLimitation } from '../limitations';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = ['G8_LIMITATION_PLACEMENT', 'G8_LIMITATION_CLAIMS', 'G8_LIMITATION_MISMATCH'] as const;

/**
 * G8, limitations: the "What we couldn't verify" sentences are never freely
 * written. Each one describes the metadata of exactly one claim through one
 * of the fixed templates in `limitations.ts`, so this check can render the
 * sentence again and compare. The comparison is exact.
 *
 * - A limitation sentence may sit only in `draft.limitations`
 *   (G8_LIMITATION_PLACEMENT), wherever else it is found.
 * - It cites exactly one claim of the piece (G8_LIMITATION_CLAIMS).
 * - Its text is what the template for its claim renders (G8_LIMITATION_MISMATCH).
 *   A sentence whose claim has changed since it was written fails here too.
 *
 * Whether a limitation is present at all is G2's question.
 */
export const checkG8: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'limitation') continue;
    const where = describeLocation(located);

    if (located.section !== 'limitations') {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_PLACEMENT',
        message: `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
        where,
      });
    }

    const ids = sentence.claimIds;
    const claim = ids.length === 1 ? byId.get(ids[0]) : undefined;
    if (claim === undefined) {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message:
          ids.length === 1
            ? `the limitation sentence at ${where} cites ${ids[0]}, which is not one of this piece's claims`
            : `the limitation sentence at ${where} must cite exactly one claim; it cites ${ids.length === 0 ? 'none' : ids.length}`,
        where,
      });
      continue;
    }

    const expected = renderLimitation(claim, sentence.template);
    if (sentence.text !== expected) {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${where} does not match the ${sentence.template} template for ${claim.id}; it must read: "${expected}"`,
        where,
      });
    }
  }

  return { failures, holdReasons: [] };
};
```

Register the check and its codes.

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';
import { G8_CODES, checkG8 } from './g8-limitations';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
  ...G7_CODES,
  ...G8_CODES,
];
```

Add G8 to the table in the failure-codes test.

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**with:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
  G5: G5_CODES,
  G6: G6_CODES,
  G7: G7_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

**with:**
```ts
  G5: G5_CODES,
  G6: G6_CODES,
  G7: G7_CODES,
  G8: G8_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts test/failure-codes.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g8-limitations.ts gate/src/checks/index.ts gate/test/g8-limitations.test.ts gate/test/failure-codes.test.ts
git commit -m "feat(gate): add check G8 for limitation sentences against their templates" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Slug disambiguation

**Files:**
- Create: `gate/src/slug.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/slug.test.ts`

The content contract (section 7) says a daily site will want the same slug twice, for example `figure-raises-series-c`. On a collision the year is appended, then the month. `disambiguateSlug(slug, publishedAt, existing)` returns the first free one of `slug`, `slug-YYYY`, `slug-YYYY-MM`, `slug-YYYY-MM-DD`, where the date is the piece's own `publishedAt` (never the clock). The day form is a last resort that the contract does not list. If all four are taken it throws an `Error` that names the slug and every candidate, so the run fails closed instead of overwriting a published page. It also throws if `publishedAt` is not a real `YYYY-MM-DD` date, even when the plain slug is free, so a bad date is never hidden. The pipeline (Plan 2) calls it before composing; G9 in the next task is the guard that catches a collision that slipped through.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/slug.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { disambiguateSlug } from '../src/slug';
import { SLUG_PATTERN } from '../src/schemas';

// Content contract section 7: a daily site will want the same slug twice. On a
// collision the year is appended, then the month; this gate adds the day as a
// last resort, and refuses to publish if even that is taken.
const SLUG = 'figure-raises-series-c';

describe('disambiguateSlug', () => {
  it('keeps a slug that is free', () => {
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set())).toBe(SLUG);
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set(['another-slug']))).toBe(SLUG);
  });

  it('appends the year when the slug is taken', () => {
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set([SLUG]))).toBe('figure-raises-series-c-2027');
  });

  it('appends the month when the year is taken as well, as in the contract example', () => {
    const taken = new Set([SLUG, 'figure-raises-series-c-2027']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe('figure-raises-series-c-2027-03');
  });

  it('appends the day when the month is taken too', () => {
    const taken = new Set([SLUG, 'figure-raises-series-c-2027', 'figure-raises-series-c-2027-03']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe('figure-raises-series-c-2027-03-15');
  });

  it('throws, naming the slug and every candidate it tried, when all four are taken', () => {
    const taken = new Set([
      SLUG,
      'figure-raises-series-c-2027',
      'figure-raises-series-c-2027-03',
      'figure-raises-series-c-2027-03-15',
    ]);
    expect(() => disambiguateSlug(SLUG, '2027-03-15', taken)).toThrow(
      'every candidate for the slug "figure-raises-series-c" is already published: figure-raises-series-c, figure-raises-series-c-2027, figure-raises-series-c-2027-03, figure-raises-series-c-2027-03-15',
    );
  });

  it('takes the first candidate that is free, whatever else is taken', () => {
    // The plain slug is free, so it wins even though every longer form is taken.
    const taken = new Set(['figure-raises-series-c-2027', 'figure-raises-series-c-2027-03', 'figure-raises-series-c-2027-03-15']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe(SLUG);
    // The year is free, so it wins even though the month and day forms are taken.
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set([SLUG, 'figure-raises-series-c-2027-03']))).toBe('figure-raises-series-c-2027');
  });

  it('builds the suffix from publishedAt, not from the clock', () => {
    expect(disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG]))).toBe('figure-raises-series-c-2031');
    expect(disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG, 'figure-raises-series-c-2031']))).toBe('figure-raises-series-c-2031-12');
    expect(
      disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG, 'figure-raises-series-c-2031', 'figure-raises-series-c-2031-12'])),
    ).toBe('figure-raises-series-c-2031-12-09');
  });

  it('does not change the set it is given', () => {
    const taken = new Set([SLUG]);
    disambiguateSlug(SLUG, '2027-03-15', taken);
    expect([...taken]).toEqual([SLUG]);
  });

  it('returns a valid slug whenever it is given one', () => {
    for (const taken of [new Set<string>(), new Set([SLUG]), new Set([SLUG, `${SLUG}-2027`]), new Set([SLUG, `${SLUG}-2027`, `${SLUG}-2027-03`])]) {
      expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toMatch(SLUG_PATTERN);
    }
  });

  it.each(['', '2027', '2027-03', '2027-3-5', '2027-13-01', '2027-02-30', 'March 15, 2027', '2027-03-15T04:30:00Z'])(
    'refuses a publishedAt that is not a real YYYY-MM-DD date: "%s"',
    (publishedAt) => {
      expect(() => disambiguateSlug(SLUG, publishedAt, new Set())).toThrow(`publishedAt "${publishedAt}" is not a real date in the form YYYY-MM-DD`);
    },
  );

  it('refuses a bad date even when the plain slug is free, so a bad date is never hidden', () => {
    expect(() => disambiguateSlug(SLUG, 'soon', new Set())).toThrow('is not a real date');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/slug.test.ts`
Expected: FAIL — `Cannot find module '../src/slug'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/slug.ts`:**
```ts
import { parseDateToken } from './normalise';

/**
 * Pick a slug that is not published yet. The content contract (section 7)
 * lets a recurring story reuse a slug by adding the year, then the month; this
 * adds the day as a last resort. The candidates, in order:
 *
 *   slug, slug-YYYY, slug-YYYY-MM, slug-YYYY-MM-DD
 *
 * The date is the piece's `publishedAt`, never the clock. The first candidate
 * that is not in `existing` is returned. If all four are taken it throws, and
 * the run fails closed instead of overwriting a published page.
 */
export function disambiguateSlug(slug: string, publishedAt: string, existing: ReadonlySet<string>): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || parseDateToken(publishedAt)?.precision !== 'day') {
    throw new Error(`disambiguateSlug: publishedAt "${publishedAt}" is not a real date in the form YYYY-MM-DD`);
  }
  const candidates = [slug, `${slug}-${publishedAt.slice(0, 4)}`, `${slug}-${publishedAt.slice(0, 7)}`, `${slug}-${publishedAt}`];
  const free = candidates.find((candidate) => !existing.has(candidate));
  if (free === undefined) {
    throw new Error(`disambiguateSlug: every candidate for the slug "${slug}" is already published: ${candidates.join(', ')}`);
  }
  return free;
}
```

Export it from the package entry point.

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './checks';
export * from './config';
export * from './constants';
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './schemas';
export * from './sentences';
export * from './slug';
export * from './sources';
export * from './text';
export * from './tokens';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/slug.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/slug.ts gate/src/index.ts gate/test/slug.test.ts
git commit -m "feat(gate): add disambiguateSlug for recurring stories" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Check G9, hygiene

**Files:**
- Create: `gate/src/checks/g9-hygiene.ts`
- Modify: `gate/src/checks/index.ts` (register the check and its codes)
- Modify: `gate/test/failure-codes.test.ts` (add G9 to the table)
- Test: `gate/test/g9-hygiene.test.ts`

G9 keeps a piece from repeating what the site already has, and from sounding like filler.

| Code | When |
|---|---|
| `G9_SLUG_COLLISION` | `ctx.publishedSlugs` contains `draft.slug`. `where` is `slug`. |
| `G9_TITLE_DUPLICATE` | the title's word overlap with a title in `ctx.recentTitles` reaches `ctx.config.titleSimilarityThreshold`. One failure, naming the closest recent title; of two equally close titles the first is named. `where` is `title`. |
| `G9_BANNED_PHRASE` | a phrase of `ctx.config.bannedPhrases` appears in the title, the description, the opening, the takeaways, a section heading or paragraph, or a limitation. `where` is the phrase itself; the message says where it appears. |

**Word overlap.** `titleTokens(title)` lowercases the title, splits it at everything that is not a letter or a digit (so `FX-1` becomes `fx` and `1`), and drops the words in the exported list `TITLE_STOP_WORDS` (`a an the and or of to in on at for with by from as its is are`: function words only; words that carry the story such as `new`, `raises` or `first` must stay). The overlap is `jaccard` (from part A) of the two token sets: shared words over all words.

**Calibrating the threshold.** The spec requires the default 0.6 to be checked against real pairs rather than assumed. The test file holds six pairs that are duplicates and six that are different stories, with the exact score of each. The duplicates score from 0.70 (`7/10`) up to 1.00, and the different stories score from 0.00 up to 0.56 (`5/9`, for "ships FX-1 to second plant" against "ships FX-2 to third plant"). So 0.6 sits in the gap with room on both sides, and **the default stays at 0.6; `config.ts` does not change.** One pair is a known limit: a rewording that changes most of the words ("delivers FX-1 arms to Brindle Logistics second plant" against the golden title) scores only 0.46 and is not caught. That is accepted: the Select stage in Plan 2 is what keeps a repeat story from being chosen, and G9 is the backstop for near-copies. The test also pins the margins (0.04 below, 0.09 above), so a change to the stop words or to the tokenising that eats the margin fails the test and sends you back to this table.

**Banned phrases.** Case, the shape of quote marks and apostrophes, dashes and spacing are ignored on both sides, so `GAME-CHANGER` matches `game-changer`, and a curly apostrophe in `It's worth noting` matches the plain one in the configured phrase. The match is on any part of the text, so `delve` also catches `delves`. Quoted passages are read too: if a source's own hype word is inside a quotation, cut the quotation or paraphrase it. An empty phrase in the configuration is ignored, because it would match every sentence.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g9-hygiene.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { TITLE_STOP_WORDS, checkG9, titleTokens } from '../src/checks/g9-hygiene';
import { DEFAULT_BANNED_PHRASES, defaultConfig, defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { jaccard } from '../src/text';
import { findSentence, mutate } from './helpers';

const run = (change: (copy: GateInput) => void, overrides?: ContextOverrides): CheckOutput =>
  checkG9(mutate(cloneGolden(), change), defaultContext(overrides));
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);
const GOLDEN_TITLE = 'Fixture Robotics ships its FX-1 warehouse arm to a second plant';
const GOLDEN_SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';

describe('G9: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG9(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('passes when other pieces are published and recent, as long as they are different', () => {
    const ctx = defaultContext({
      publishedSlugs: ['northgate-unveils-atlas-9', `${GOLDEN_SLUG}-2025`],
      recentTitles: ['Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', 'Standards body publishes new safety rules for warehouse robots'],
    });
    expect(checkG9(cloneGolden(), ctx)).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the ninth and last check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[8]).toBe(checkG9);
    expect(ALL_CHECKS).toHaveLength(9);
  });

  it('does not change its input or its context', () => {
    const input = cloneGolden();
    const ctx = defaultContext({ publishedSlugs: [GOLDEN_SLUG], recentTitles: [GOLDEN_TITLE] });
    checkG9(input, ctx);
    expect(input).toEqual(cloneGolden());
    expect([...ctx.publishedSlugs]).toEqual([GOLDEN_SLUG]);
    expect(ctx.recentTitles).toEqual([GOLDEN_TITLE]);
  });
});

describe('G9_SLUG_COLLISION', () => {
  it('fails a slug that is already published, and says which', () => {
    const output = checkG9(cloneGolden(), defaultContext({ publishedSlugs: ['an-older-piece', GOLDEN_SLUG] }));
    expect(output.failures).toEqual([
      {
        check: 'G9',
        code: 'G9_SLUG_COLLISION',
        message: `the slug "${GOLDEN_SLUG}" is already published`,
        where: 'slug',
      },
    ]);
  });

  it('compares the whole slug: a longer or shorter published slug is not a collision', () => {
    expect(checkG9(cloneGolden(), defaultContext({ publishedSlugs: [`${GOLDEN_SLUG}-2025`, 'fixture-robotics'] })).failures).toEqual([]);
  });

  it('is decided by the context, not by the draft', () => {
    expect(codes(run((g) => (g.draft.slug = 'something-else'), { publishedSlugs: [GOLDEN_SLUG] }))).toEqual([]);
    expect(codes(run((g) => (g.draft.slug = 'something-else'), { publishedSlugs: ['something-else'] }))).toEqual(['G9_SLUG_COLLISION']);
  });
});

describe('titleTokens and TITLE_STOP_WORDS', () => {
  it('lowercases, splits at everything that is not a letter or digit, and drops stop words', () => {
    expect([...titleTokens('Fixture Robotics ships the FX-1 to a second plant')]).toEqual([
      'fixture',
      'robotics',
      'ships',
      'fx',
      '1',
      'second',
      'plant',
    ]);
  });

  it('returns each word once and ignores quote shapes, dashes and spacing', () => {
    expect([...titleTokens("Robot's  robot \u2019s ROBOT \u2014 robot")]).toEqual(['robot', 's']);
  });

  it('keeps figures, which tell two stories apart', () => {
    expect([...titleTokens('Brindle adds 40 arms, 18% faster, $450 million')]).toEqual(['brindle', 'adds', '40', 'arms', '18', 'faster', '450', 'million']);
  });

  it('has nothing left when a title is all stop words or empty', () => {
    expect(titleTokens('The a an of to').size).toBe(0);
    expect(titleTokens('').size).toBe(0);
  });

  it('is a small list of lowercase function words', () => {
    expect(TITLE_STOP_WORDS.size).toBeGreaterThan(5);
    expect(TITLE_STOP_WORDS.size).toBeLessThan(30);
    for (const word of TITLE_STOP_WORDS) expect(word).toMatch(/^[a-z]+$/);
    for (const word of ['a', 'an', 'the', 'to', 'of', 'in']) expect(TITLE_STOP_WORDS.has(word)).toBe(true);
    // Words that carry the story must never be stop words.
    for (const word of ['new', 'raises', 'ships', 'robot', 'first', 'second']) expect(TITLE_STOP_WORDS.has(word)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Calibration of titleSimilarityThreshold (default 0.6).
//
// Each row is a pair of titles and the overlap score G9 gives it: shared words
// over all words, after the stop words are dropped. The default threshold has
// to sit between the highest score of a pair that is a different story and the
// lowest score of a pair that is a duplicate. It does, so it stays at 0.6.
// ---------------------------------------------------------------------------

type Pair = { a: string; b: string; shared: number; all: number };

const DUPLICATES: Pair[] = [
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships the FX-1 to a second plant', shared: 7, all: 7 },
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 to a second plant in Tarnmoor', shared: 7, all: 8 },
  { a: 'Brindle Logistics adds 40 FX-1 arms at Ashvale', b: 'Brindle Logistics adds 40 FX-1 arms to Ashvale plant', shared: 8, all: 9 },
  {
    a: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
    b: 'Fixture Robotics begins shipping FX-1 warehouse arm to second plant',
    shared: 8,
    all: 11,
  },
  {
    a: 'Corvane Partners leads $450 million round in Fixture Robotics',
    b: 'Fixture Robotics raises $450 million in round led by Corvane Partners',
    shared: 7,
    all: 10,
  },
  // Same shape, one word changed. Different story, but two titles this close are confusing in a feed, so it goes back.
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 to third plant', shared: 6, all: 8 },
];

const DIFFERENT: Pair[] = [
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-2 to third plant', shared: 5, all: 9 },
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 spare parts to Brindle Logistics', shared: 5, all: 11 },
  { a: GOLDEN_TITLE, b: 'Fixture Robotics raises $450 million for FX-1 production', shared: 4, all: 13 },
  {
    a: 'Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection',
    b: 'Northgate Dynamics raises $120 million for Atlas-9 production',
    shared: 4,
    all: 12,
  },
  { a: 'Standards body publishes new safety rules for warehouse robots', b: GOLDEN_TITLE, shared: 1, all: 16 },
  { a: 'Brindle Logistics adds 40 FX-1 arms at Ashvale', b: 'Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', shared: 0, all: 16 },
];

const score = (pair: Pair) => jaccard(titleTokens(pair.a), titleTokens(pair.b));
const duplicateOf = (title: string, recent: string, overrides?: ContextOverrides) =>
  codes(run((g) => (g.draft.title.text = title), { recentTitles: [recent], ...overrides })).includes('G9_TITLE_DUPLICATE');

describe('G9_TITLE_DUPLICATE: calibrating the 0.6 threshold', () => {
  it('starts at 0.6', () => {
    expect(defaultConfig().titleSimilarityThreshold).toBe(0.6);
  });

  it.each(DUPLICATES.map((pair) => [`${pair.shared}/${pair.all}`, pair] as const))('scores the duplicate pair at %s as caught', (_ratio, pair) => {
    expect(score(pair)).toBeCloseTo(pair.shared / pair.all, 10);
    expect(duplicateOf(pair.a, pair.b)).toBe(true);
    expect(duplicateOf(pair.b, pair.a)).toBe(true);
  });

  it.each(DIFFERENT.map((pair) => [`${pair.shared}/${pair.all}`, pair] as const))('scores the different pair at %s as not caught', (_ratio, pair) => {
    expect(score(pair)).toBeCloseTo(pair.shared / pair.all, 10);
    expect(duplicateOf(pair.a, pair.b)).toBe(false);
    expect(duplicateOf(pair.b, pair.a)).toBe(false);
  });

  it('puts the default in the gap between the two groups, with room on both sides', () => {
    const lowestDuplicate = Math.min(...DUPLICATES.map(score));
    const highestDifferent = Math.max(...DIFFERENT.map(score));
    expect(highestDifferent).toBeLessThan(0.6);
    expect(lowestDuplicate).toBeGreaterThanOrEqual(0.6);
    expect(0.6 - highestDifferent).toBeGreaterThan(0.04);
    expect(lowestDuplicate - 0.6).toBeGreaterThan(0.09);
  });

  it('does not catch a duplicate that is reworded in most of its words: Select, not the gate, handles those', () => {
    const reworded = {
      a: 'Fixture Robotics delivers FX-1 arms to Brindle Logistics second plant',
      b: GOLDEN_TITLE,
    };
    expect(jaccard(titleTokens(reworded.a), titleTokens(reworded.b))).toBeCloseTo(6 / 13, 10);
    expect(duplicateOf(reworded.a, reworded.b)).toBe(false);
  });

  it('reads the threshold from the context', () => {
    const [a, b] = [DUPLICATES[3]!.a, DUPLICATES[3]!.b]; // scores 8/11, about 0.73
    expect(duplicateOf(a, b, { config: { titleSimilarityThreshold: 0.7 } })).toBe(true);
    expect(duplicateOf(a, b, { config: { titleSimilarityThreshold: 0.8 } })).toBe(false);
    const different = DIFFERENT[0]!; // scores 5/9, about 0.56
    expect(duplicateOf(different.a, different.b, { config: { titleSimilarityThreshold: 0.5 } })).toBe(true);
  });

  it('catches a score exactly at the threshold', () => {
    expect(duplicateOf(DUPLICATES[0]!.a, DUPLICATES[0]!.b, { config: { titleSimilarityThreshold: 1 } })).toBe(true);
  });
});

describe('G9_TITLE_DUPLICATE', () => {
  it('fails a title that repeats a recent title, and says which and how close', () => {
    const output = run(() => undefined, {
      recentTitles: ['Fixture Robotics begins shipping FX-1 warehouse arm to second plant'],
    });
    expect(output.failures).toEqual([
      {
        check: 'G9',
        code: 'G9_TITLE_DUPLICATE',
        message:
          'the title is too close to the recent title "Fixture Robotics begins shipping FX-1 warehouse arm to second plant": 0.73 word overlap, and 0.60 is the limit',
        where: 'title',
      },
    ]);
  });

  it('reports one failure, naming the closest of several recent titles', () => {
    const output = run(() => undefined, {
      recentTitles: [
        'Fixture Robotics begins shipping FX-1 warehouse arm to second plant', // 8/11
        GOLDEN_TITLE, // identical
        'Fixture Robotics ships FX-1 warehouse arm to third plant', // 8/10
      ],
    });
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]!.message).toContain(`recent title "${GOLDEN_TITLE}": 1.00 word overlap`);
  });

  it('names the first of two recent titles that are equally close', () => {
    const output = run(() => undefined, {
      recentTitles: ['Fixture Robotics ships FX-1 warehouse arm to second plant', GOLDEN_TITLE],
    });
    expect(output.failures[0]!.message).toContain('recent title "Fixture Robotics ships FX-1 warehouse arm to second plant"');
  });

  it('ignores a recent title that is not close, and an empty list of recent titles', () => {
    expect(run(() => undefined, { recentTitles: [] }).failures).toEqual([]);
    expect(run(() => undefined, { recentTitles: ['Northgate Dynamics unveils Atlas-9'] }).failures).toEqual([]);
  });

  it('ignores case, punctuation and stop words in both titles', () => {
    expect(duplicateOf('FIXTURE ROBOTICS: SHIPS ITS FX-1 WAREHOUSE ARM TO A SECOND PLANT!', GOLDEN_TITLE)).toBe(true);
    expect(duplicateOf(GOLDEN_TITLE, "the fixture robotics' ships, its fx-1 warehouse arm, to the second plant")).toBe(true);
  });

  it('does not call a title with no words a duplicate of anything', () => {
    expect(duplicateOf('The of', 'The of')).toBe(false);
  });
});

describe('G9_BANNED_PHRASE', () => {
  const at = (change: (g: GateInput) => void, overrides?: ContextOverrides) => run(change, overrides).failures;

  it('fails a banned phrase, naming the phrase in `where` and the place in the message', () => {
    const failures = at((g) => {
      g.draft.takeaways[1]!.text = 'The datasheet lists a 12 kg rated payload, a game-changer for the site.';
    });
    expect(failures).toEqual([
      {
        check: 'G9',
        code: 'G9_BANNED_PHRASE',
        message: 'the banned phrase "game-changer" appears at takeaways, sentence 2',
        where: 'game-changer',
      },
    ]);
  });

  it.each(DEFAULT_BANNED_PHRASES.map((phrase) => [phrase] as const))('catches the default phrase "%s"', (phrase) => {
    const failures = at((g) => {
      g.draft.opening[0]!.text = `Fixture Robotics has begun shipping its arm, and ${phrase} follows.`;
    });
    expect(failures.map((failure) => [failure.code, failure.where])).toEqual([['G9_BANNED_PHRASE', phrase]]);
  });

  it.each([
    ['the title', (g: GateInput) => (g.draft.title.text = 'A game-changer ships'), 'title'],
    ['the description', (g: GateInput) => (g.draft.description.text = 'A game-changer ships'), 'description'],
    ['an opening sentence', (g: GateInput) => (g.draft.opening[2]!.text = 'A game-changer ships'), 'opening, sentence 3'],
    ['a takeaway', (g: GateInput) => (g.draft.takeaways[3]!.text = 'A game-changer ships'), 'takeaways, sentence 4'],
    ['a section sentence', (g: GateInput) => (g.draft.sections[2]!.paragraphs[1]![1]!.text = 'A game-changer ships'), 'section "What the filing shows", sentence 5'],
    ['an analysis sentence', (g: GateInput) => (findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'A game-changer ships'), 'section "What the customer reports", sentence 6'],
    ['a limitation sentence', (g: GateInput) => (g.draft.limitations[4]!.text = 'A game-changer ships'), 'limitations, sentence 5'],
  ])('reads %s', (_name, change, where) => {
    expect(at(change).map((failure) => failure.message)).toEqual([`the banned phrase "game-changer" appears at ${where}`]);
  });

  it('reads a section heading', () => {
    const failures = at((g) => (g.draft.sections[1]!.heading = 'A revolutionary customer'));
    expect(failures).toEqual([
      {
        check: 'G9',
        code: 'G9_BANNED_PHRASE',
        message: 'the banned phrase "revolutionary" appears at heading "A revolutionary customer"',
        where: 'revolutionary',
      },
    ]);
  });

  it('ignores case, the shape of quote marks and dashes, and spacing', () => {
    for (const text of [
      'A GAME-CHANGER ships',
      'A game\u2013changer ships',
      'A game\u2014changer ships',
      'A  game-changer ships',
      'It\u2019s worth noting that the arm ships',
      "IT'S WORTH NOTING that the arm ships",
      'In Today\u2019s Fast-Moving World Of Robotics, an arm ships',
    ]) {
      expect(at((g) => (g.draft.opening[0]!.text = text)), text).toHaveLength(1);
    }
  });

  it('matches inside a longer word, so that "delves" and "unprecedentedly" are caught too', () => {
    expect(at((g) => (g.draft.opening[0]!.text = 'The report delves into the arm.'))).toHaveLength(1);
    expect(at((g) => (g.draft.opening[0]!.text = 'The arm is unprecedentedly light.'))).toHaveLength(1);
  });

  it('does not match a phrase that is only similar', () => {
    expect(at((g) => (g.draft.opening[0]!.text = 'The game changed hands, and the arm ships.'))).toEqual([]);
    expect(at((g) => (g.draft.opening[0]!.text = 'The arm is evolving and cutting edges.'))).toEqual([]);
  });

  it('reads quoted passages too: a source\'s own hype is still not the Desk\'s voice', () => {
    const failures = at((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('"We went from pilot')).text =
        '"This is a game-changer," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G9_BANNED_PHRASE']);
  });

  it('reports a phrase at every place it appears, and each phrase separately', () => {
    const failures = at((g) => {
      g.draft.opening[0]!.text = 'A game-changer and a revolutionary arm ships.';
      g.draft.takeaways[0]!.text = 'Another game-changer.';
    });
    expect(failures.map((failure) => [failure.where, failure.message.split(' appears at ')[1]])).toEqual([
      ['game-changer', 'opening, sentence 1'],
      ['revolutionary', 'opening, sentence 1'],
      ['game-changer', 'takeaways, sentence 1'],
    ]);
  });

  it('uses the phrases in the context, not only the defaults', () => {
    const text = 'The arm is best-in-class.';
    expect(at((g) => (g.draft.opening[0]!.text = text))).toEqual([]);
    const failures = at((g) => (g.draft.opening[0]!.text = text), { config: { bannedPhrases: ['best-in-class'] } });
    expect(failures.map((failure) => failure.where)).toEqual(['best-in-class']);
    expect(at((g) => (g.draft.opening[0]!.text = 'A game-changer ships.'), { config: { bannedPhrases: ['best-in-class'] } })).toEqual([]);
  });

  it('folds a phrase in the context the way it folds the text, so capitals and curly apostrophes there do not matter', () => {
    const config = { bannedPhrases: ['Best-In-Class', 'It\u2019s Worth Noting'] };
    const failures = at((g) => (g.draft.opening[0]!.text = "A best-in-class arm. It's worth noting this."), { config });
    expect(failures.map((failure) => failure.where)).toEqual(['Best-In-Class', 'It\u2019s Worth Noting']);
  });

  it('ignores an empty phrase, which would otherwise match every sentence', () => {
    expect(at(() => undefined, { config: { bannedPhrases: ['', '  '] } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g9-hygiene.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g9-hygiene'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g9-hygiene.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { jaccard, normaliseQuotes } from '../text';

/** Every failure code G9 can report. */
export const G9_CODES = ['G9_SLUG_COLLISION', 'G9_TITLE_DUPLICATE', 'G9_BANNED_PHRASE'] as const;

/**
 * Words that say nothing about which story a title is. They are left out when
 * two titles are compared, so "ships the FX-1 to a second plant" and "ships
 * FX-1 to second plant" count as the same words. Keep the list to function
 * words: a word that carries the story ("new", "raises", "first") must stay in.
 */
export const TITLE_STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'from',
  'as',
  'its',
  'is',
  'are',
]);

/**
 * The set of words a title is compared by: lowercase letters and digits, split
 * at everything else (so "FX-1" is "fx" and "1"), without the stop words.
 */
export function titleTokens(title: string): Set<string> {
  const words = normaliseQuotes(title)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !TITLE_STOP_WORDS.has(word));
  return new Set(words);
}

/**
 * G9, hygiene.
 *
 * - The slug is not already published (G9_SLUG_COLLISION). The pipeline picks
 *   a free slug with `disambiguateSlug` before it composes; this is the guard.
 * - The title is not a near-duplicate of a recent title (G9_TITLE_DUPLICATE):
 *   the overlap of their word sets, shared words over all words, reaches
 *   `titleSimilarityThreshold`. Only the closest recent title is reported.
 *   The default 0.6 was calibrated on the pairs in `g9-hygiene.test.ts`.
 *   A rewording that changes most of the words is not caught here; choosing a
 *   story that is not a repeat is the Select stage's job.
 * - None of the banned filler phrases appears (G9_BANNED_PHRASE), in the
 *   title, description, opening, takeaways, section headings and paragraphs, or
 *   limitations. Case, quote shapes, dashes and spacing are ignored. The
 *   match is on any part of the text, so "delve" catches "delves". Quoted
 *   passages are read too: if a source's own hype is inside a quotation,
 *   cut the quotation or paraphrase it. `where` is the phrase.
 */
export const checkG9: Check = ({ draft }, ctx) => {
  const failures: Failure[] = [];

  if (ctx.publishedSlugs.has(draft.slug)) {
    failures.push({
      check: 'G9',
      code: 'G9_SLUG_COLLISION',
      message: `the slug "${draft.slug}" is already published`,
      where: 'slug',
    });
  }

  const mine = titleTokens(draft.title.text);
  let closest: { title: string; score: number } | undefined;
  for (const recent of ctx.recentTitles) {
    const score = jaccard(mine, titleTokens(recent));
    if (score >= ctx.config.titleSimilarityThreshold && (closest === undefined || score > closest.score)) {
      closest = { title: recent, score };
    }
  }
  if (closest !== undefined) {
    failures.push({
      check: 'G9',
      code: 'G9_TITLE_DUPLICATE',
      message: `the title is too close to the recent title "${closest.title}": ${closest.score.toFixed(2)} word overlap, and ${ctx.config.titleSimilarityThreshold.toFixed(2)} is the limit`,
      where: 'title',
    });
  }

  const phrases = ctx.config.bannedPhrases
    .map((phrase) => ({ phrase, folded: normaliseQuotes(phrase).toLowerCase() }))
    .filter((item) => item.folded !== '');
  const places = [
    ...allSentences(draft).map((item) => ({ where: describeLocation(item), text: item.sentence.text })),
    ...draft.sections.map((section) => ({ where: `heading "${section.heading}"`, text: section.heading })),
  ];
  for (const place of places) {
    const text = normaliseQuotes(place.text).toLowerCase();
    for (const { phrase, folded } of phrases) {
      if (text.includes(folded)) {
        failures.push({
          check: 'G9',
          code: 'G9_BANNED_PHRASE',
          message: `the banned phrase "${phrase}" appears at ${place.where}`,
          where: phrase,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
```

Register the check and its codes.

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';
import { G8_CODES, checkG8 } from './g8-limitations';
import { G9_CODES, checkG9 } from './g9-hygiene';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
  ...G7_CODES,
  ...G8_CODES,
  ...G9_CODES,
];
```

Add G9 to the table in the failure-codes test.

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**with:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
```

**In `gate/test/failure-codes.test.ts`, replace:**
```ts
  G6: G6_CODES,
  G7: G7_CODES,
  G8: G8_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

**with:**
```ts
  G6: G6_CODES,
  G7: G7_CODES,
  G8: G8_CODES,
  G9: G9_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g9-hygiene.test.ts test/failure-codes.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/g9-hygiene.ts gate/src/checks/index.ts gate/test/g9-hygiene.test.ts gate/test/failure-codes.test.ts
git commit -m "feat(gate): add check G9 for slug collisions, near-duplicate titles and banned phrases" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 26: The full gate on the golden piece

**Files:**
- Modify: `gate/src/checks/index.ts` (export the title helpers and tidy the comment)
- Test: `gate/test/golden-gate.test.ts`

All nine checks are registered now. This task extends the public-API test to the whole gate. Through the package name, it checks that: the nine checks are exported and run in order; the golden piece goes through `runGate` with route `publish`, no failures, no hold reasons and every check `pass`; one deliberate defect per check, G1 to G9, sends the draft back with route `revise` and that check marked `fail`; a properly attributed tier-2 piece gets route `hold` with the reason `TIER2_ATTRIBUTION` and no failures; an unattributed tier-2 piece is `revise`, not `hold` (a failure beats a hold); and a piece that is attributed but also has a failure elsewhere is `revise` while still listing the hold reason. The G9 defect needs a context with a published slug, so the defects table takes an optional fourth entry, context overrides.

The test first fails because `titleTokens` and `TITLE_STOP_WORDS` are not exported from the package yet; everything else already passes, because the checks were registered one by one in the earlier tasks.

- [ ] **Step 1: Write the failing test**

Import the `ContextOverrides` type.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import * as api from '@robywire/gate';
import type { CheckId, GateInput } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '@robywire/gate/fixtures';
import { claimById, findSentence, mutate } from './helpers';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import * as api from '@robywire/gate';
import type { CheckId, ContextOverrides, GateInput } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '@robywire/gate/fixtures';
import { claimById, findSentence, mutate } from './helpers';

```

Add the new names to the API list.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
    'checkG3',
    'checkG4',
    'checkG5',
    // text, normalisers, tokens, limitations, sentences
    'countWords',
    'normaliseQuotes',
```

**with:**
```ts
    'checkG3',
    'checkG4',
    'checkG5',
    'checkG6',
    'checkG7',
    'checkG8',
    'checkG9',
    'ALL_FAILURE_CODES',
    // slugs and titles
    'disambiguateSlug',
    'titleTokens',
    'TITLE_STOP_WORDS',
    // text, normalisers, tokens, limitations, sentences
    'countWords',
    'normaliseQuotes',
```

Replace the check-order test, add a test for the failure codes, and make the golden test cover all nine checks.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
    }
  });

  it('lists the checks in order, starting with G1 to G5', () => {
    expect(api.ALL_CHECKS.slice(0, 5)).toEqual([api.checkG1, api.checkG2, api.checkG3, api.checkG4, api.checkG5]);
  });
});

describe('runGate on the golden piece', () => {
  it('publishes it: no failures, no hold reasons, and G1 to G5 all pass', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5'] as const) {
      expect(result.checks[id], id).toBe('pass');
    }
  });

  it('gives the same answer every time', () => {
```

**with:**
```ts
    }
  });

  it('lists the nine checks in order, G1 to G9', () => {
    expect(api.ALL_CHECKS).toEqual([
      api.checkG1,
      api.checkG2,
      api.checkG3,
      api.checkG4,
      api.checkG5,
      api.checkG6,
      api.checkG7,
      api.checkG8,
      api.checkG9,
    ]);
    expect(api.ALL_CHECKS).toHaveLength(api.CHECK_IDS.length);
  });

  it('lists the failure codes of all nine checks, each starting with the id of its check', () => {
    for (const id of api.CHECK_IDS) {
      expect(api.ALL_FAILURE_CODES.some((code) => code.startsWith(`${id}_`)), id).toBe(true);
    }
    expect(api.ALL_FAILURE_CODES.every((code) => /^G[1-9]_/.test(code))).toBe(true);
  });
});

describe('runGate on the golden piece', () => {
  it('publishes it: no failures, no hold reasons, and all nine checks pass', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });

  it('gives the same answer every time', () => {
```

Add the helpers for tier-2 pieces, and give the defects table room for a context.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
  });
});

describe('runGate on the golden piece with one thing wrong', () => {
  const defects: [CheckId, string, (copy: GateInput) => void][] = [
    ['G1', 'G1_TITLE_EMPTY', (g) => (g.draft.title.text = '')],
    ['G2', 'G2_HEADING_QUESTION', (g) => (g.draft.sections[0]!.heading = 'What shipped?')],
    ['G3', 'G3_NO_CLAIM', (g) => (g.draft.takeaways[0]!.claimIds = [])],
```

**with:**
```ts
  });
});

/** Make c-19 (the investor count) a claim reported by an outlet, and leave the sentence that cites it as it was. */
function makeTier2(g: GateInput): void {
  const { source } = claimById(g.claims, 'c-19');
  source.tier = 2;
  source.outlet = 'Mercer Wire';
}

/** Then write that sentence the way a tier-2 claim must be written. */
function attribute(g: GateInput): void {
  const sentence = findSentence(g.draft, (item) => item.text === 'It lists 7 investors in the round.');
  sentence.text = 'Mercer Wire reports that 7 investors took part in the round.';
  if (sentence.kind === 'fact') sentence.attributed = true;
}

describe('runGate on the golden piece with one thing wrong', () => {
  const defects: [CheckId, string, (copy: GateInput) => void, ContextOverrides?][] = [
    ['G1', 'G1_TITLE_EMPTY', (g) => (g.draft.title.text = '')],
    ['G2', 'G2_HEADING_QUESTION', (g) => (g.draft.sections[0]!.heading = 'What shipped?')],
    ['G3', 'G3_NO_CLAIM', (g) => (g.draft.takeaways[0]!.claimIds = [])],
```

Add the G6 to G9 defects to the table and let it pass a context.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
          '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      },
    ],
  ];

  it.each(defects)('sends the draft back for revision when %s finds %s', (id, code, change) => {
    const result = api.runGate(mutate(cloneGolden(), change), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks[id]).toBe('fail');
    expect(result.failures.some((failure) => failure.check === id && failure.code === code)).toBe(true);
```

**with:**
```ts
          '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      },
    ],
    ['G6', 'G6_TIER2_UNATTRIBUTED', (g) => makeTier2(g)],
    [
      'G7',
      'G7_ANALYSIS_NEW_VALUE',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'The measured rate is 22% below the datasheet maximum.';
      },
    ],
    ['G8', 'G8_LIMITATION_MISMATCH', (g) => (g.draft.limitations[0]!.text = 'The payload figure is exact.')],
    ['G9', 'G9_SLUG_COLLISION', () => undefined, { publishedSlugs: ['fixture-robotics-ships-fx-1-to-second-plant'] }],
  ];

  it.each(defects)('sends the draft back for revision when %s finds %s', (id, code, change, overrides) => {
    const result = api.runGate(mutate(cloneGolden(), change), api.defaultContext(overrides));
    expect(result.route).toBe('revise');
    expect(result.checks[id]).toBe('fail');
    expect(result.failures.some((failure) => failure.check === id && failure.code === code)).toBe(true);
```

Finally add the tier-2 tests at the end of the file.

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'fail', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });
});
```

**with:**
```ts
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'fail', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });
});

describe('runGate when the piece rests on a tier-2 claim', () => {
  it('holds a properly attributed piece: nothing failed, but it may not publish by itself', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        makeTier2(g);
        attribute(g);
      }),
      api.defaultContext(),
    );
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(result.route).toBe('hold');
    expect(Object.values(result.checks).every((value) => value === 'pass')).toBe(true);
  });

  it('sends an unattributed piece back for revision instead: a failure beats a hold', () => {
    const result = api.runGate(mutate(cloneGolden(), makeTier2), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks.G6).toBe('fail');
    expect(result.holdReasons).toEqual([]);
  });

  it('revises, and still lists the hold reason, when a properly attributed piece also has a failure elsewhere', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        makeTier2(g);
        attribute(g);
        g.draft.sections[0]!.heading = 'What shipped?';
      }),
      api.defaultContext(),
    );
    expect(result.route).toBe('revise');
    expect(result.checks.G2).toBe('fail');
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: FAIL — `to include 'titleTokens'`.

- [ ] **Step 3: Write the implementation**

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
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
 * Every check that `runGate` runs, in order: G1 to G9. A check that is not in
 * this list is not run, and `runGate` reports it as 'pass', so a new check
 * must be added here.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
  ...G7_CODES,
  ...G8_CODES,
  ...G9_CODES,
];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/index.ts gate/test/golden-gate.test.ts
git commit -m "feat(gate): run all nine checks and prove the golden piece publishes, holds and revises as designed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 27: The seeded-defect runner

**Files:**
- Modify: `evals/package.json`, `package-lock.json` (npm links the `gate` workspace; no download)
- Create: `evals/src/cases/support.ts`, `evals/src/cases/spec.ts`, `evals/src/seeded.ts`, `evals/src/run.ts`
- Modify: `evals/src/index.ts` (export the new modules)
- Test: `evals/test/seeded.test.ts`

The gate is only trustworthy if it is *shown* to catch what it should. The seeded-defect evals do that: take the golden piece, break it in one known way, and check that the gate says so. A *seeded case* is `{ id, check, code, description, apply }`: `apply` receives a deep copy of the golden piece and returns it broken. The case is *caught* when the gate's result has a failure with `check` equal to the case's check and `code` equal to its code. `runSeeded()` runs every case, with the baseline (the unbroken golden piece), and reports `{ total, caught, rate, baselinePasses, cases }`. The cases run in a fixed context (`seededContext()`) that has one published slug and one recent title, so the hygiene cases of Task 28 have something to collide with; the golden piece itself publishes under it.

`runSeeded(checks, cases)` takes optional arguments that default to the real ones. They exist so that the tests can show the harness is able to fail: with a check removed, its cases are missed and the rate drops below 1. With no cases the rate is 0, never `0 / 0`, so an empty run can never look like a pass.

This task writes the harness and the four cases that the design spec names by id: `swapped-number` (G4), `invented-quote` (G5), `tier2-only-claim` (G6) and `unsupported-sentence` (G3). Those ids are public (the site's /method page will list them), so they never change. Task 28 adds the rest.

**Versions.** No package is downloaded. Step 1 links the `gate` workspace into `evals`, which adds `"dependencies": { "@robywire/gate": "0.0.0" }` to `evals/package.json` and updates `package-lock.json`. `@robywire/gate/fixtures` (the golden piece) is available to `evals` through that link. `tsx`, which runs the command line tool in Task 30, is already a root dev dependency.

- [ ] **Step 1: Link the gate workspace into evals**

Run: `npm install --save-exact --no-audit --no-fund --workspace @robywire/evals @robywire/gate@0.0.0`
Expected: PASS — `up to date`.

Run: `git diff --stat`
Expected: PASS — shows `evals/package.json` and `package-lock.json` changed and nothing else.

- [ ] **Step 2: Write the failing test**

**Create `evals/test/seeded.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS, checkG3, checkG4, runGateWith } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { sentenceWith } from '../src/cases/support';
import { runSeeded } from '../src/run';
import { SEEDED_CASES, SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_TITLE, seededContext } from '../src/seeded';
import type { SeededCase } from '../src/seeded';

// The seeded-defect evals: take the golden piece, break it in one known way,
// and check that the gate says so. Every case names the check and the failure
// code that must catch it. A defect that gets through is a hole in the gate.

/** The ids the design spec names. They are public: the /method page lists them. */
const SPEC_IDS = {
  'swapped-number': ['G4', 'G4_NUMBER_UNSUPPORTED'],
  'invented-quote': ['G5', 'G5_QUOTE_NOT_VERBATIM'],
  'tier2-only-claim': ['G6', 'G6_TIER2_UNATTRIBUTED'],
  'unsupported-sentence': ['G3', 'G3_NO_CLAIM'],
} as const;

describe('the baseline', () => {
  it('is the golden piece, which publishes under the context the cases run in', () => {
    const result = runGateWith(ALL_CHECKS, cloneGolden(), seededContext());
    expect(result.failures).toEqual([]);
    expect(result.route).toBe('publish');
  });

  it('runs under a context with a published slug and a recent title, so the hygiene cases have something to collide with', () => {
    const ctx = seededContext();
    expect([...ctx.publishedSlugs]).toEqual([SEEDED_PUBLISHED_SLUG]);
    expect(ctx.recentTitles).toEqual([SEEDED_RECENT_TITLE]);
    expect(cloneGolden().draft.slug).not.toBe(SEEDED_PUBLISHED_SLUG);
    expect(cloneGolden().draft.title.text).not.toBe(SEEDED_RECENT_TITLE);
  });

  it('gives each caller a fresh context', () => {
    expect(seededContext()).not.toBe(seededContext());
    expect(seededContext().publishedSlugs).not.toBe(seededContext().publishedSlugs);
  });
});

describe('the cases', () => {
  it('have unique, kebab-case ids and a description', () => {
    const ids = SEEDED_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SEEDED_CASES) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(item.description.length, item.id).toBeGreaterThan(15);
    }
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s names a check and a failure code that exist', (_id, item) => {
    expect(CHECK_IDS).toContain(item.check);
    expect(ALL_FAILURE_CODES).toContain(item.code);
    expect(item.code.startsWith(`${item.check}_`)).toBe(true);
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s changes the input it is given', (_id, item) => {
    const changed = item.apply(cloneGolden());
    expect(changed).not.toEqual(cloneGolden());
  });

  it('include the four defects the design spec names, under their names', () => {
    for (const [id, [check, code]] of Object.entries(SPEC_IDS)) {
      const found = SEEDED_CASES.find((item) => item.id === id);
      expect(found, id).toBeDefined();
      expect([found?.check, found?.code], id).toEqual([check, code]);
    }
  });
});

describe('runSeeded', () => {
  it('catches every case and reports the baseline as publishing', () => {
    const result = runSeeded();
    const missed = result.cases.filter((item) => !item.caught).map((item) => `${item.id} (${item.code}; got ${item.gotCodes.join(', ') || 'nothing'})`);
    expect(missed).toEqual([]);
    expect(result.baselinePasses).toBe(true);
    expect(result.total).toBe(SEEDED_CASES.length);
    expect(result.caught).toBe(result.total);
    expect(result.rate).toBe(1);
  });

  it('reports each case in order, with the codes the gate gave', () => {
    const result = runSeeded();
    expect(result.cases.map((item) => item.id)).toEqual(SEEDED_CASES.map((item) => item.id));
    const swapped = result.cases.find((item) => item.id === 'swapped-number')!;
    expect(swapped).toEqual({
      id: 'swapped-number',
      check: 'G4',
      code: 'G4_NUMBER_UNSUPPORTED',
      caught: true,
      gotCodes: ['G4_NUMBER_UNSUPPORTED'],
    });
  });

  it('gives the same answer every time, so a case cannot leak into the next one', () => {
    expect(runSeeded()).toEqual(runSeeded());
  });

  it('counts a case as caught only when the right check reports the right code', () => {
    // Without G4 the swapped number slips through: no G4 failure at all.
    const result = runSeeded(ALL_CHECKS.filter((check) => check !== checkG4));
    const swapped = result.cases.find((item) => item.id === 'swapped-number')!;
    expect(swapped.caught).toBe(false);
    expect(swapped.gotCodes).not.toContain('G4_NUMBER_UNSUPPORTED');
  });

  it('can fail: with one check switched off, its cases are missed and the rate drops below 1', () => {
    const result = runSeeded(ALL_CHECKS.filter((check) => check !== checkG3));
    expect(result.baselinePasses).toBe(true);
    expect(result.rate).toBeLessThan(1);
    const missed = result.cases.filter((item) => !item.caught);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((item) => item.check === 'G3')).toBe(true);
    expect(result.caught + missed.length).toBe(result.total);
  });

  it('catches nothing when no check runs', () => {
    const result = runSeeded([]);
    expect(result.caught).toBe(0);
    expect(result.rate).toBe(0);
    expect(result.baselinePasses).toBe(true);
  });

  it('never reports a rate of 1 for a run of no cases, which would otherwise be 0 divided by 0', () => {
    const result = runSeeded(ALL_CHECKS, []);
    expect(result).toEqual({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] });
  });

  it('reports a baseline that does not publish', () => {
    const failing = () => ({ failures: [{ check: 'G1' as const, code: 'G1_TITLE_EMPTY', message: 'always' }], holdReasons: [] });
    expect(runSeeded([failing]).baselinePasses).toBe(false);
  });
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
  const twoWrongNumbers: Omit<SeededCase, 'check' | 'code'> = {
    id: 'two-wrong-numbers',
    description: 'Two figures in one sentence do not match their claims.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 651 W in typical use.';
      return base;
    },
  };

  it('lists each code the gate gave once, however often it gave it', () => {
    const [result] = runSeeded(ALL_CHECKS, [{ ...twoWrongNumbers, check: 'G4', code: 'G4_NUMBER_UNSUPPORTED' }]).cases;
    expect(result).toEqual({
      id: 'two-wrong-numbers',
      check: 'G4',
      code: 'G4_NUMBER_UNSUPPORTED',
      caught: true,
      gotCodes: ['G4_NUMBER_UNSUPPORTED'],
    });
  });

  it('does not count a case as caught when the check fails with some other code', () => {
    const [result] = runSeeded(ALL_CHECKS, [{ ...twoWrongNumbers, check: 'G4', code: 'G4_DATE_UNSUPPORTED' }]).cases;
    expect(result?.caught).toBe(false);
    expect(result?.gotCodes).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: FAIL — `Cannot find module '../src/cases/support'`.

- [ ] **Step 4: Write the implementation**

First two small helpers for writing cases. They throw when they find nothing, so a case that points at a sentence the golden piece no longer has fails loudly instead of quietly changing nothing.

**Create `evals/src/cases/support.ts`:**
```ts
import { allSentences } from '@robywire/gate';
import type { Claim, GateInput, Sentence } from '@robywire/gate';

// Small helpers for writing seeded cases. They throw when they find nothing,
// so a case that points at a sentence the golden piece no longer has fails
// loudly instead of quietly changing nothing.

/** The claim with this id in `input`. */
export function claimOf(input: GateInput, id: string): Claim {
  const found = input.claims.find((claim) => claim.id === id);
  if (found === undefined) throw new Error(`seeded case: the golden piece has no claim ${id}`);
  return found;
}

/** The first sentence of the draft, in document order, whose text contains `fragment`. It is the live sentence, so a case can change it. */
export function sentenceWith(input: GateInput, fragment: string): Sentence {
  const found = allSentences(input.draft).find((item) => item.sentence.text.includes(fragment));
  if (found === undefined) throw new Error(`seeded case: no sentence of the golden piece contains "${fragment}"`);
  return found.sentence;
}
```

The four cases the spec names.

**Create `evals/src/cases/spec.ts`:**
```ts
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

/**
 * The four defects the design spec names, under the names the spec gives
 * them. The ids are public: the /method page lists them, so do not rename one.
 */
export const SPEC_CASES: SeededCase[] = [
  {
    id: 'swapped-number',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence says the arm weighs 83 kg; the claim it cites says 38 kg.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
      return base;
    },
  },
  {
    id: 'invented-quote',
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: 'A sentence puts words in quotation marks that the cited source never said.',
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
        '"We have never seen an arm this reliable," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      return base;
    },
  },
  {
    id: 'tier2-only-claim',
    check: 'G6',
    code: 'G6_TIER2_UNATTRIBUTED',
    description: 'A claim that comes only from another outlet is stated as plain fact, with no attribution.',
    apply: (base) => {
      const { source } = claimOf(base, 'c-18');
      source.tier = 2;
      source.outlet = 'Mercer Wire';
      return base;
    },
  },
  {
    id: 'unsupported-sentence',
    check: 'G3',
    code: 'G3_NO_CLAIM',
    description: 'A fact sentence is added that cites no claim at all.',
    apply: (base) => {
      base.draft.sections[0]!.paragraphs[0]!.push({
        kind: 'fact',
        text: 'The arm is also certified for use in cold storage.',
        claimIds: [],
      });
      return base;
    },
  },
];
```

The case type, the context and the list of cases.

**Create `evals/src/seeded.ts`:**
```ts
import { defaultContext } from '@robywire/gate';
import type { CheckId, GateContext, GateInput } from '@robywire/gate';
import { SPEC_CASES } from './cases/spec';

/**
 * One known defect. `apply` receives a deep copy of the golden piece and
 * returns it broken in exactly one way. The case is caught when the gate
 * reports a failure from `check` with `code`.
 */
export type SeededCase = {
  /** Stable, kebab-case, unique. The scoreboard is keyed by it. */
  id: string;
  check: CheckId;
  code: string;
  /** One plain sentence saying what is wrong with the piece. */
  description: string;
  apply: (base: GateInput) => GateInput;
};

// The hygiene check compares a piece with what is already published, so the
// cases run in a context that has something published. The golden piece has
// neither of these, so it still publishes; the hygiene cases copy them.
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({ publishedSlugs: [SEEDED_PUBLISHED_SLUG], recentTitles: [SEEDED_RECENT_TITLE] });
}

export const SEEDED_CASES: SeededCase[] = [...SPEC_CASES];
```

The runner.

**Create `evals/src/run.ts`:**
```ts
import { ALL_CHECKS, runGateWith } from '@robywire/gate';
import type { Check, CheckId } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { SEEDED_CASES, seededContext } from './seeded';
import type { SeededCase } from './seeded';

export interface CaseResult {
  id: string;
  check: CheckId;
  code: string;
  /** True when the gate reported a failure from `check` with `code`. */
  caught: boolean;
  /** Every distinct failure code the gate reported for the broken piece, in order. */
  gotCodes: string[];
}

export interface SeededResult {
  total: number;
  caught: number;
  /** caught / total. 0, never 1, when there are no cases. */
  rate: number;
  /** True when the unbroken golden piece gets route 'publish'. */
  baselinePasses: boolean;
  cases: CaseResult[];
}

/**
 * Break the golden piece once for each case and ask the gate. Every case gets
 * its own deep copy, so one case cannot leak into the next. `checks` and
 * `cases` default to the real ones; passing others is how the tests show that
 * a gate with a check missing is caught out.
 */
export function runSeeded(checks: readonly Check[] = ALL_CHECKS, cases: readonly SeededCase[] = SEEDED_CASES): SeededResult {
  const baselinePasses = runGateWith(checks, cloneGolden(), seededContext()).route === 'publish';

  const results = cases.map((item): CaseResult => {
    const { failures } = runGateWith(checks, item.apply(cloneGolden()), seededContext());
    return {
      id: item.id,
      check: item.check,
      code: item.code,
      caught: failures.some((failure) => failure.check === item.check && failure.code === item.code),
      gotCodes: [...new Set(failures.map((failure) => failure.code))],
    };
  });

  const caught = results.filter((item) => item.caught).length;
  return { total: results.length, caught, rate: results.length === 0 ? 0 : caught / results.length, baselinePasses, cases: results };
}
```

And the package entry point.

**Replace `evals/src/index.ts` with:**
```ts
export * from './run';
export * from './seeded';
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json evals/package.json evals/src evals/test/seeded.test.ts
git commit -m "feat(evals): add the seeded-defect runner with the four defects the spec names" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 28: A seeded case for every failure code

**Files:**
- Create: `evals/src/context.ts`, `evals/src/cases/index.ts`, `evals/src/cases/frontmatter-structure.ts`, `evals/src/cases/claims.ts`, `evals/src/cases/sourcing-analysis.ts`, `evals/src/cases/limitations-hygiene.ts`
- Modify: `evals/src/seeded.ts` (the context and the list of cases move out)
- Test: `evals/test/coverage.test.ts`

The proof is only as wide as its cases. This task adds the test that makes the width a rule, then writes the cases until it passes. `coverage.test.ts` reads `ALL_FAILURE_CODES` (Task 19) and fails, naming the codes, if some failure code has no *caught* seeded case. So adding a failure code to any check without a case for it fails this test. It also checks that every check G1 to G9 has a case, that no case names a code the gate does not have, and, for each check in turn, that with that check switched off exactly its own cases are missed and no others. That last test is a standing proof that the harness can fail, and that every case is caught by the check it claims to test and by no other.

The cases are grouped in files by the checks they exercise: `frontmatter-structure.ts` (G1 and G2), `claims.ts` (G3 to G5, besides the spec's four), `sourcing-analysis.ts` (G6 and G7) and `limitations-hygiene.ts` (G8 and G9). They all follow the pattern of `spec.ts`: change the copy of the golden piece in the smallest way that breaks one thing, and say in one plain sentence what is wrong. Some checks have more than one case because they have more than one way to fail (G2's body length too short and too long, G7's new number and new name). First the context and the list of cases move into their own files, so that the case files can use the context without importing a file that imports them.

- [ ] **Step 1: Write the failing test**

**Create `evals/test/coverage.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS } from '@robywire/gate';
import { runSeeded } from '../src/run';

// The proof is only as wide as its cases. If a check gains a failure code and
// nobody writes a seeded case for it, this test fails and names the code.

describe('coverage of the gate by the seeded cases', () => {
  const result = runSeeded();
  const caughtCodes = new Set(result.cases.filter((item) => item.caught).map((item) => item.code));

  it('catches at least one case for every failure code any check can report', () => {
    const uncovered = ALL_FAILURE_CODES.filter((code) => !caughtCodes.has(code));
    expect(uncovered).toEqual([]);
  });

  it('has a case for every check from G1 to G9', () => {
    const checks = new Set(result.cases.map((item) => item.check));
    expect([...CHECK_IDS].filter((id) => !checks.has(id))).toEqual([]);
  });

  it('has no case whose code is not a code the gate can report', () => {
    const unknown = result.cases.filter((item) => !ALL_FAILURE_CODES.includes(item.code)).map((item) => item.id);
    expect(unknown).toEqual([]);
  });
});

describe('the proof can fail, check by check', () => {
  // ALL_CHECKS is in the order of CHECK_IDS. Switch one check off: exactly the
  // cases written for that check must slip through, and no others.
  it.each(CHECK_IDS.map((id, index) => [id, index] as const))('with %s switched off, its cases are missed and no others', (id, index) => {
    const result = runSeeded(ALL_CHECKS.filter((_check, at) => at !== index));
    const missed = result.cases.filter((item) => !item.caught).map((item) => item.id);
    const written = runSeeded().cases.filter((item) => item.check === id).map((item) => item.id);
    expect(written.length).toBeGreaterThan(0);
    expect(missed).toEqual(written);
    expect(result.rate).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `G1_TITLE_EMPTY`.

The failure lists every code that has no case yet, starting with `G1_TITLE_EMPTY`, and the checks that have no case (G1, G2, G7, G8, G9). Four codes are already covered by the spec's cases.

- [ ] **Step 3: Move the context and the list of cases into their own files**

This is a refactor with the tests green. The context moves to `evals/src/context.ts`.

**Create `evals/src/context.ts`:**
```ts
import { defaultContext } from '@robywire/gate';
import type { GateContext } from '@robywire/gate';

// The hygiene check compares a piece with what is already published, so the
// cases run in a context that has something published. The golden piece has
// neither of these, so it still publishes; the hygiene cases copy them.
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({ publishedSlugs: [SEEDED_PUBLISHED_SLUG], recentTitles: [SEEDED_RECENT_TITLE] });
}
```

`seeded.ts` keeps the case type and re-exports the context and the list, so nothing that imports from it changes.

**Replace `evals/src/seeded.ts` with:**
```ts
import type { CheckId, GateInput } from '@robywire/gate';

export { SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_TITLE, seededContext } from './context';
export { SEEDED_CASES } from './cases';

/**
 * One known defect. `apply` receives a deep copy of the golden piece and
 * returns it broken in exactly one way. The case is caught when the gate
 * reports a failure from `check` with `code`.
 */
export type SeededCase = {
  /** Stable, kebab-case, unique. The scoreboard is keyed by it. */
  id: string;
  check: CheckId;
  code: string;
  /** One plain sentence saying what is wrong with the piece. */
  description: string;
  apply: (base: GateInput) => GateInput;
};
```

The list of cases gets a file of its own, for now with the four spec cases only.

**Create `evals/src/cases/index.ts`:**
```ts
import type { SeededCase } from '../seeded';
import { SPEC_CASES } from './spec';

/** Every seeded case, in the order the scoreboard lists them. */
export const SEEDED_CASES: SeededCase[] = [...SPEC_CASES];
```

- [ ] **Step 4: Run the harness tests and confirm they still pass**

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Add the G1 and G2 cases**

**Create `evals/src/cases/frontmatter-structure.ts`:**
```ts
import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the frontmatter (G1) and in the shape of the piece (G2). */
export const FRONTMATTER_STRUCTURE_CASES: SeededCase[] = [
  {
    id: 'empty-title',
    check: 'G1',
    code: 'G1_TITLE_EMPTY',
    description: 'The title is empty.',
    apply: (base) => {
      base.draft.title.text = '';
      return base;
    },
  },
  {
    id: 'long-description',
    check: 'G1',
    code: 'G1_DESCRIPTION_TOO_LONG',
    description: 'The description is longer than the 155 characters a search result shows.',
    apply: (base) => {
      const { text } = base.draft.description;
      base.draft.description.text = `${text.slice(0, -1)}, and the plant, the arm, the customer and the funding round are described at some length.`;
      return base;
    },
  },
  {
    id: 'impossible-date',
    check: 'G1',
    code: 'G1_BAD_DATE',
    description: 'The publication date is 30 February.',
    apply: (base) => {
      base.draft.publishedAt = '2026-02-30';
      return base;
    },
  },
  {
    id: 'bad-slug',
    check: 'G1',
    code: 'G1_SLUG_FORMAT',
    description: 'The slug has capital letters and spaces.',
    apply: (base) => {
      base.draft.slug = 'Fixture Robotics Ships FX-1';
      return base;
    },
  },
  {
    id: 'no-categories',
    check: 'G1',
    code: 'G1_CATEGORY_COUNT',
    description: 'The piece has no category.',
    apply: (base) => {
      base.draft.categories = [];
      return base;
    },
  },
  {
    id: 'repeated-category',
    check: 'G1',
    code: 'G1_CATEGORY_COUNT',
    description: 'The same category is listed twice.',
    apply: (base) => {
      base.draft.categories = ['industrial-warehouse', 'industrial-warehouse'];
      return base;
    },
  },
  {
    id: 'unknown-category',
    check: 'G1',
    code: 'G1_CATEGORY_UNKNOWN',
    description: 'A category is not in the closed vocabulary.',
    apply: (base) => {
      base.draft.categories = ['industrial-warehouse', 'quantum-robots'];
      return base;
    },
  },
  {
    id: 'funding-without-beat',
    check: 'G1',
    code: 'G1_CATEGORY_NO_BEAT',
    description: 'The piece is tagged funding but has no beat.',
    apply: (base) => {
      base.draft.categories = ['funding'];
      return base;
    },
  },
  {
    id: 'blank-author',
    check: 'G1',
    code: 'G1_AUTHOR_MISSING',
    description: 'The author name is blank.',
    apply: (base) => {
      base.draft.author.name = '  ';
      return base;
    },
  },
  {
    id: 'short-opening',
    check: 'G2',
    code: 'G2_OPENING_LENGTH',
    description: 'The opening paragraph is one sentence, far under 40 words.',
    apply: (base) => {
      base.draft.opening = base.draft.opening.slice(0, 1);
      return base;
    },
  },
  {
    id: 'two-takeaways',
    check: 'G2',
    code: 'G2_TAKEAWAYS_COUNT',
    description: 'There are two key takeaways, not three to five.',
    apply: (base) => {
      base.draft.takeaways = base.draft.takeaways.slice(0, 2);
      return base;
    },
  },
  {
    id: 'short-body',
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'Half the limitations are cut, which leaves the piece under 600 words.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 7);
      return base;
    },
  },
  {
    id: 'long-body',
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'A sentence is padded until the piece is over 850 words.',
    apply: (base) => {
      const sentence = sentenceWith(base, 'The arm itself weighs');
      sentence.text = `${sentence.text.slice(0, -1)}${' and the arm keeps working as described'.repeat(30)}.`;
      return base;
    },
  },
  {
    id: 'one-section',
    check: 'G2',
    code: 'G2_SECTIONS_MIN',
    description: 'All the paragraphs sit under one heading.',
    apply: (base) => {
      const [first] = base.draft.sections;
      base.draft.sections = [{ heading: first!.heading, paragraphs: base.draft.sections.flatMap((section) => section.paragraphs) }];
      return base;
    },
  },
  {
    id: 'question-heading',
    check: 'G2',
    code: 'G2_HEADING_QUESTION',
    description: 'A section heading ends in a question mark.',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'What shipped?';
      return base;
    },
  },
  {
    id: 'no-limitations',
    check: 'G2',
    code: 'G2_LIMITATIONS_MISSING',
    description: "The piece rests on datasheet and press-release claims but has no 'What we couldn't verify' section.",
    apply: (base) => {
      base.draft.limitations = [];
      return base;
    },
  },
];
```

**Replace `evals/src/cases/index.ts` with:**
```ts
import type { SeededCase } from '../seeded';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { SPEC_CASES } from './spec';

/** Every seeded case, in the order the scoreboard lists them. */
export const SEEDED_CASES: SeededCase[] = [...SPEC_CASES, ...FRONTMATTER_STRUCTURE_CASES];
```

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `G3_UNKNOWN_CLAIM`.

The G1 and G2 codes are gone from the list of uncovered codes; it now starts with `G3_UNKNOWN_CLAIM`.

- [ ] **Step 6: Add the G3 to G5 cases**

**Create `evals/src/cases/claims.ts`:**
```ts
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

/**
 * Defects in how sentences use claims: an unknown claim (G3, besides the spec's
 * unsupported sentence), figures, dates and names that do not match (G4,
 * besides the spec's swapped number), and an altered quotation (G5, besides
 * the spec's invented one).
 */
export const CLAIMS_CASES: SeededCase[] = [
  {
    id: 'unknown-claim',
    check: 'G3',
    code: 'G3_UNKNOWN_CLAIM',
    description: 'A sentence cites a claim, c-99, that is not in the piece.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').claimIds = ['c-99'];
      return base;
    },
  },
  {
    id: 'swapped-unit',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the payload as 12 lb; the claim it cites says 12 kg.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 lb rated payload and a 1.4 m maximum reach.';
      return base;
    },
  },
  {
    id: 'swapped-date',
    check: 'G4',
    code: 'G4_DATE_UNSUPPORTED',
    description: 'A sentence gives the first sale as 29 October 2026; the filing says 29 September 2026.',
    apply: (base) => {
      sentenceWith(base, 'The filing dates the first sale').text =
        'The filing dates the first sale of the $450 million round to 29 October 2026.';
      return base;
    },
  },
  {
    id: 'invented-name',
    check: 'G4',
    code: 'G4_NAME_UNSUPPORTED',
    description: 'A sentence names Harlow Capital as lead investor; the filing names Corvane Partners.',
    apply: (base) => {
      sentenceWith(base, 'The round, led by').text = 'The round, led by Harlow Capital, totals $450 million, according to a regulatory filing.';
      return base;
    },
  },
  {
    id: 'value-outside-span',
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description: 'A claim lists a value, 38 kg, that is not in the quotation it says it was taken from.',
    apply: (base) => {
      claimOf(base, 'c-13').span.quote = 'Arm mass: 39 kg.';
      return base;
    },
  },
  {
    id: 'altered-quote',
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: "A quotation changes one word of the source's: ten weeks, not nine.",
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
        '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      return base;
    },
  },
];
```

**Replace `evals/src/cases/index.ts` with:**
```ts
import type { SeededCase } from '../seeded';
import { CLAIMS_CASES } from './claims';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { SPEC_CASES } from './spec';

/** Every seeded case, in the order the scoreboard lists them. */
export const SEEDED_CASES: SeededCase[] = [...SPEC_CASES, ...FRONTMATTER_STRUCTURE_CASES, ...CLAIMS_CASES];
```

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `G6_TIER2_IN_ANALYSIS`.

- [ ] **Step 7: Add the G6 and G7 cases**

**Create `evals/src/cases/sourcing-analysis.ts`:**
```ts
import type { Sentence } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

const OUTLET = 'Mercer Wire';

/** The same words and claims as an analysis sentence. */
const toAnalysis = (sentence: Sentence): Sentence => ({ kind: 'analysis', text: sentence.text, claimIds: sentence.claimIds });

/**
 * Defects in sourcing (G6, besides the spec's tier-2-only claim) and in the
 * rules for analysis sentences (G7).
 */
export const SOURCING_ANALYSIS_CASES: SeededCase[] = [
  {
    id: 'tier2-outlet-not-named',
    check: 'G6',
    code: 'G6_TIER2_UNATTRIBUTED',
    description: 'A sentence is marked attributed to a tier-2 outlet but never says which outlet.',
    apply: (base) => {
      const { source } = claimOf(base, 'c-19');
      source.tier = 2;
      source.outlet = OUTLET;
      const sentence = sentenceWith(base, 'It lists 7 investors');
      sentence.text = 'The filing lists 7 investors, according to reports.';
      if (sentence.kind === 'fact') sentence.attributed = true;
      return base;
    },
  },
  {
    id: 'tier2-in-analysis',
    check: 'G6',
    code: 'G6_TIER2_IN_ANALYSIS',
    description: "An analysis sentence rests on another outlet's reporting.",
    apply: (base) => {
      const copy = structuredClone(claimOf(base, 'c-12'));
      copy.id = 'c-29';
      copy.source.tier = 2;
      copy.source.outlet = OUTLET;
      base.claims.push(copy);
      sentenceWith(base, 'The measured rate sits below').claimIds.push('c-29');
      return base;
    },
  },
  {
    id: 'analysis-in-opening',
    check: 'G7',
    code: 'G7_ANALYSIS_PLACEMENT',
    description: "A sentence of the opening paragraph is the Desk's own analysis.",
    apply: (base) => {
      base.draft.opening[1] = toAnalysis(base.draft.opening[1]!);
      return base;
    },
  },
  {
    id: 'analysis-flood',
    check: 'G7',
    code: 'G7_ANALYSIS_SHARE',
    description: 'Eleven analysis sentences are added, which takes analysis over 20% of the body.',
    apply: (base) => {
      const last = base.draft.sections.at(-1)!.paragraphs.at(-1)!;
      for (let i = 0; i < 11; i++) last.push({ kind: 'analysis', text: 'That is a plain reading of the figures.', claimIds: [] });
      return base;
    },
  },
  {
    id: 'analysis-new-number',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence works out a percentage, 22%, that no fact sentence states.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-new-name',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence brings in a company, Harlow Logistics, that no fact sentence mentions.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate sits below the datasheet maximum, a gap that Harlow Logistics also reported.';
      return base;
    },
  },
];
```

**Replace `evals/src/cases/index.ts` with:**
```ts
import type { SeededCase } from '../seeded';
import { CLAIMS_CASES } from './claims';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { SOURCING_ANALYSIS_CASES } from './sourcing-analysis';
import { SPEC_CASES } from './spec';

/** Every seeded case, in the order the scoreboard lists them. */
export const SEEDED_CASES: SeededCase[] = [
  ...SPEC_CASES,
  ...FRONTMATTER_STRUCTURE_CASES,
  ...CLAIMS_CASES,
  ...SOURCING_ANALYSIS_CASES,
];
```

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `G8_LIMITATION_PLACEMENT`.

- [ ] **Step 8: Add the G8 and G9 cases**

The hygiene cases copy the published slug and the recent title that `seededContext()` provides: `slug-collision` sets the draft's slug to `SEEDED_PUBLISHED_SLUG`, and `duplicate-title` rewrites the title to the recent title with one stop word changed.

**Create `evals/src/cases/limitations-hygiene.ts`:**
```ts
import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
export const LIMITATIONS_HYGIENE_CASES: SeededCase[] = [
  {
    id: 'limitation-in-body',
    check: 'G8',
    code: 'G8_LIMITATION_PLACEMENT',
    description: "A limitation sentence is placed in a body paragraph instead of 'What we couldn't verify'.",
    apply: (base) => {
      base.draft.sections[0]!.paragraphs[0]!.push(structuredClone(base.draft.limitations[0]!));
      return base;
    },
  },
  {
    id: 'limitation-unknown-claim',
    check: 'G8',
    code: 'G8_LIMITATION_CLAIMS',
    description: 'A limitation sentence cites a claim, c-99, that is not in the piece.',
    apply: (base) => {
      base.draft.limitations[0]!.claimIds = ['c-99'];
      return base;
    },
  },
  {
    id: 'limitation-edited-text',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the datasheet figure was independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The 12 kilograms payload figure has been confirmed independently.';
      return base;
    },
  },
  {
    id: 'limitation-wrong-template',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence keeps its text but is labelled with the wrong template.',
    apply: (base) => {
      base.draft.limitations[0]!.template = 'status';
      return base;
    },
  },
  {
    id: 'slug-collision',
    check: 'G9',
    code: 'G9_SLUG_COLLISION',
    description: 'The slug is the slug of a piece that is already published.',
    apply: (base) => {
      base.draft.slug = SEEDED_PUBLISHED_SLUG;
      return base;
    },
  },
  {
    id: 'duplicate-title',
    check: 'G9',
    code: 'G9_TITLE_DUPLICATE',
    description: 'The title repeats a recent title with only a stop word changed.',
    apply: (base) => {
      base.draft.title.text = 'Brindle Logistics adds 40 FX-1 arms to Ashvale';
      base.draft.title.claimIds = ['c-23'];
      return base;
    },
  },
  {
    id: 'banned-phrase',
    check: 'G9',
    code: 'G9_BANNED_PHRASE',
    description: "A takeaway calls the shipment a 'game-changer'.",
    apply: (base) => {
      sentenceWith(base, 'Tarnmoor is the second').text = 'Tarnmoor is the second Brindle Logistics plant to receive FX-1 arms, a game-changer for the site.';
      return base;
    },
  },
  {
    id: 'banned-phrase-in-heading',
    check: 'G9',
    code: 'G9_BANNED_PHRASE',
    description: "A section heading says 'revolutionary'.",
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What the revolutionary customer reports';
      return base;
    },
  },
];
```

**Replace `evals/src/cases/index.ts` with:**
```ts
import type { SeededCase } from '../seeded';
import { CLAIMS_CASES } from './claims';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { LIMITATIONS_HYGIENE_CASES } from './limitations-hygiene';
import { SOURCING_ANALYSIS_CASES } from './sourcing-analysis';
import { SPEC_CASES } from './spec';

/** Every seeded case, in the order the scoreboard lists them. */
export const SEEDED_CASES: SeededCase[] = [
  ...SPEC_CASES,
  ...FRONTMATTER_STRUCTURE_CASES,
  ...CLAIMS_CASES,
  ...SOURCING_ANALYSIS_CASES,
  ...LIMITATIONS_HYGIENE_CASES,
];
```

- [ ] **Step 9: Run the evals tests and confirm they pass**

Run: `npm test --workspace @robywire/evals`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 10: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 11: Commit**

```bash
git add evals/src evals/test/coverage.test.ts
git commit -m "feat(evals): seed a defect for every failure code of G1 to G9 and prove each check's cases are missed without it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 29: The scoreboard

**Files:**
- Create: `evals/src/scoreboard.ts`
- Modify: `evals/src/index.ts` (export the new module)
- Test: `evals/test/scoreboard.test.ts`

The result of a run has two public forms. The *scoreboard* is a JSON file that is committed (`evals/scoreboard/seeded.json`, written in Task 30) and that the site's /method page will show: the totals and, for every case, its id, check, code, description and whether it was caught. It has a fixed order of keys and no timestamp, path or machine detail, so the same gate always writes the same file, and it leaves out the codes the gate actually reported, which are for debugging. The *table* is the readable text the command prints. `buildScoreboard(result, cases)` joins each result with its case's description (and throws if a result has no case, rather than writing a scoreboard with a hole), `renderScoreboardJson` gives the text of the file (two-space indent, one trailing newline), and `renderTable` gives the terminal table, where a missed case says what the gate reported instead.

The tests use small made-up results, so they check formatting alone.

- [ ] **Step 1: Write the failing test**

**Create `evals/test/scoreboard.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { buildScoreboard, renderScoreboardJson, renderTable } from '../src/scoreboard';
import type { CaseResult, SeededResult } from '../src/run';
import type { SeededCase } from '../src/seeded';

// These tests use small made-up results, so they check the formatting alone.
// The committed scoreboard file is checked against the real gate in scoreboard-file.test.ts.

const noop: SeededCase['apply'] = (base) => base;
const CASES: SeededCase[] = [
  { id: 'empty-title', check: 'G1', code: 'G1_TITLE_EMPTY', description: 'The title is empty.', apply: noop },
  { id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', description: 'A figure is swapped.', apply: noop },
  { id: 'analysis-flood', check: 'G7', code: 'G7_ANALYSIS_SHARE', description: 'Too much analysis.', apply: noop },
];

const row = (id: string, caught: boolean, gotCodes: string[]): CaseResult => {
  const item = CASES.find((candidate) => candidate.id === id)!;
  return { id, check: item.check, code: item.code, caught, gotCodes };
};

const ALL_CAUGHT: SeededResult = {
  total: 3,
  caught: 3,
  rate: 1,
  baselinePasses: true,
  cases: [
    row('empty-title', true, ['G1_TITLE_EMPTY']),
    row('swapped-number', true, ['G4_NUMBER_UNSUPPORTED']),
    row('analysis-flood', true, ['G7_ANALYSIS_SHARE']),
  ],
};

const ONE_MISSED: SeededResult = {
  total: 3,
  caught: 2,
  rate: 2 / 3,
  baselinePasses: true,
  cases: [
    row('empty-title', true, ['G1_TITLE_EMPTY']),
    row('swapped-number', false, ['G4_DATE_UNSUPPORTED', 'G4_NAME_UNSUPPORTED']),
    row('analysis-flood', false, []),
  ],
};

describe('buildScoreboard', () => {
  it('lists the summary and then every case with its description, keys in a fixed order', () => {
    const board = buildScoreboard(ALL_CAUGHT, CASES);
    expect(Object.keys(board)).toEqual(['total', 'caught', 'rate', 'baselinePasses', 'cases']);
    expect(board).toEqual({
      total: 3,
      caught: 3,
      rate: 1,
      baselinePasses: true,
      cases: [
        { id: 'empty-title', check: 'G1', code: 'G1_TITLE_EMPTY', description: 'The title is empty.', caught: true },
        { id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', description: 'A figure is swapped.', caught: true },
        { id: 'analysis-flood', check: 'G7', code: 'G7_ANALYSIS_SHARE', description: 'Too much analysis.', caught: true },
      ],
    });
    expect(Object.keys(board.cases[0]!)).toEqual(['id', 'check', 'code', 'description', 'caught']);
  });

  it('records a missed case as caught: false, and leaves out the codes the gate gave, which are for debugging', () => {
    const board = buildScoreboard(ONE_MISSED, CASES);
    expect(board.cases.map((item) => item.caught)).toEqual([true, false, false]);
    expect(JSON.stringify(board)).not.toContain('G4_DATE_UNSUPPORTED');
    expect(board.rate).toBeCloseTo(2 / 3, 10);
  });

  it('throws for a result whose case is not in the list of cases, rather than writing a scoreboard with a hole', () => {
    expect(() => buildScoreboard(ALL_CAUGHT, CASES.slice(1))).toThrow('no seeded case with the id "empty-title"');
  });

  it('has no timestamp or machine detail, so the same gate always gives the same scoreboard', () => {
    expect(buildScoreboard(ALL_CAUGHT, CASES)).toEqual(buildScoreboard(ALL_CAUGHT, CASES));
    expect(JSON.stringify(buildScoreboard(ALL_CAUGHT, CASES))).not.toMatch(/20\d\d-\d\d-\d\d|\/Users\/|\/home\//);
  });
});

describe('renderScoreboardJson', () => {
  it('writes two-space-indented JSON that ends with a newline and reads back as the scoreboard', () => {
    const board = buildScoreboard(ALL_CAUGHT, CASES);
    const text = renderScoreboardJson(board);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text.startsWith('{\n  "total": 3,\n  "caught": 3,\n  "rate": 1,\n  "baselinePasses": true,\n  "cases": [\n    {\n      "id": "empty-title",')).toBe(true);
    expect(JSON.parse(text)).toEqual(board);
  });
});

describe('renderTable', () => {
  it('shows the count, the percentage, the baseline and one line per case', () => {
    const lines = renderTable(ALL_CAUGHT).split('\n');
    expect(lines[0]).toBe('Seeded-defect evals');
    expect(lines).toContain('  3 of 3 cases caught (100.0%)');
    expect(lines).toContain('  baseline (the unbroken golden piece): publishes');
    const rows = lines.filter((line) => /^ {2}(caught|MISSED) /.test(line));
    expect(rows).toEqual([
      '  caught  G1     G1_TITLE_EMPTY         empty-title',
      '  caught  G4     G4_NUMBER_UNSUPPORTED  swapped-number',
      '  caught  G7     G7_ANALYSIS_SHARE      analysis-flood',
    ]);
  });

  it('marks a missed case, says what the gate reported instead, and shows the lower percentage', () => {
    const lines = renderTable(ONE_MISSED).split('\n');
    expect(lines).toContain('  2 of 3 cases caught (66.7%)');
    expect(lines).toContain('  MISSED  G4     G4_NUMBER_UNSUPPORTED  swapped-number  (the gate reported: G4_DATE_UNSUPPORTED, G4_NAME_UNSUPPORTED)');
    expect(lines).toContain('  MISSED  G7     G7_ANALYSIS_SHARE      analysis-flood  (the gate reported: nothing)');
  });

  it('says so when the baseline does not publish', () => {
    expect(renderTable({ ...ALL_CAUGHT, baselinePasses: false })).toContain('  baseline (the unbroken golden piece): does NOT publish');
  });

  it('does not print a percentage of 0 divided by 0', () => {
    const lines = renderTable({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] }).split('\n');
    expect(lines).toContain('  0 of 0 cases caught (0.0%)');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/evals -- test/scoreboard.test.ts`
Expected: FAIL — `Cannot find module '../src/scoreboard'`.

- [ ] **Step 3: Write the implementation**

**Create `evals/src/scoreboard.ts`:**
```ts
import type { CheckId } from '@robywire/gate';
import type { SeededResult } from './run';
import { SEEDED_CASES } from './seeded';
import type { SeededCase } from './seeded';

/**
 * The public result of the seeded-defect evals. It is committed as
 * `evals/scoreboard/seeded.json` and shown on the site's /method page. It has
 * no timestamp, no path and no machine detail, so the same gate always writes
 * the same file.
 */
export interface Scoreboard {
  total: number;
  caught: number;
  rate: number;
  baselinePasses: boolean;
  cases: { id: string; check: CheckId; code: string; description: string; caught: boolean }[];
}

/** The scoreboard for `result`, with each case's description taken from `cases`. Keys are created in a fixed order. */
export function buildScoreboard(result: SeededResult, cases: readonly SeededCase[] = SEEDED_CASES): Scoreboard {
  return {
    total: result.total,
    caught: result.caught,
    rate: result.rate,
    baselinePasses: result.baselinePasses,
    cases: result.cases.map((item) => {
      const seeded = cases.find((candidate) => candidate.id === item.id);
      if (seeded === undefined) throw new Error(`buildScoreboard: there is no seeded case with the id "${item.id}"`);
      return { id: item.id, check: item.check, code: item.code, description: seeded.description, caught: item.caught };
    }),
  };
}

/** The scoreboard as the text of the committed file: two-space JSON and one trailing newline. */
export function renderScoreboardJson(board: Scoreboard): string {
  return `${JSON.stringify(board, null, 2)}\n`;
}

/** A table for a person reading the terminal. Missed cases say what the gate reported instead. */
export function renderTable(result: SeededResult): string {
  const codeWidth = Math.max('code'.length, ...result.cases.map((item) => item.code.length));
  const line = (status: string, check: string, code: string, rest: string) =>
    `  ${status}  ${check.padEnd('check'.length)}  ${code.padEnd(codeWidth)}  ${rest}`;

  return [
    'Seeded-defect evals',
    `  ${result.caught} of ${result.total} cases caught (${(result.rate * 100).toFixed(1)}%)`,
    `  baseline (the unbroken golden piece): ${result.baselinePasses ? 'publishes' : 'does NOT publish'}`,
    '',
    line('result', 'check', 'code', 'case'),
    ...result.cases.map((item) =>
      line(
        item.caught ? 'caught' : 'MISSED',
        item.check,
        item.code,
        item.caught ? item.id : `${item.id}  (the gate reported: ${item.gotCodes.join(', ') || 'nothing'})`,
      ),
    ),
  ].join('\n');
}
```

**Replace `evals/src/index.ts` with:**
```ts
export * from './run';
export * from './scoreboard';
export * from './seeded';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/evals -- test/scoreboard.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add evals/src/scoreboard.ts evals/src/index.ts evals/test/scoreboard.test.ts
git commit -m "feat(evals): build the scoreboard and render it as JSON and as a terminal table" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 30: The `evals:seeded` command, the committed scoreboard, and proof that the proof can fail

**Files:**
- Create: `evals/src/cli.ts`, `evals/scoreboard/seeded.json` (generated by the command)
- Modify: `evals/package.json` (the `seeded` script and the `./scoreboard` export), `package.json` (the `evals:seeded` script), `evals/src/cases/index.ts` (order the cases by check), `.github/workflows/ci.yml` (run it in CI), `README.md`
- Test: `evals/test/cli.test.ts`, `evals/test/scoreboard-file.test.ts`, `evals/test/seeded.test.ts` (one more test)

`npm run evals:seeded` is the milestone's proof. It runs `runSeeded()`, writes `evals/scoreboard/seeded.json`, prints the table, and exits 0 only if every case was caught, the baseline publishes, and there was at least one case; otherwise it exits 1. It writes the scoreboard even when a case is missed, because the file must show what happened. `exitCodeFor(result)` is the rule; `main(file, print, run)` does the work and is a function so that tests can call it without starting a process (the script runs `main` only when it is the program being run, not when a test imports it).

The scoreboard is committed, and a test fails if the committed file differs from what the gate gives today, so the proof cannot go stale: after any change to the gate, run the command and commit the file. `evals/package.json` also exports the file as `@robywire/evals/scoreboard`, which is how the site will import it. The cases are sorted by check (G1 to G9, stable within a check) so that the scoreboard reads in order. CI runs the command after the tests.

- [ ] **Step 1: Write the failing tests**

**Create `evals/test/cli.test.ts`:**
```ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exitCodeFor, main } from '../src/cli';
import type { SeededResult } from '../src/run';
import { runSeeded } from '../src/run';
import { buildScoreboard, renderScoreboardJson, renderTable } from '../src/scoreboard';

const RESULT: SeededResult = { total: 4, caught: 4, rate: 1, baselinePasses: true, cases: [] };

describe('exitCodeFor', () => {
  it('is 0 only when every case is caught and the baseline publishes', () => {
    expect(exitCodeFor(RESULT)).toBe(0);
  });

  it('is 1 when one case is missed', () => {
    expect(exitCodeFor({ ...RESULT, caught: 3, rate: 0.75 })).toBe(1);
  });

  it('is 1 when the baseline does not publish, even though every case is caught', () => {
    expect(exitCodeFor({ ...RESULT, baselinePasses: false })).toBe(1);
  });

  it('is 1 when there are no cases at all', () => {
    expect(exitCodeFor({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] })).toBe(1);
  });
});

describe('main', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'robywire-seeded-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the scoreboard, prints the table and the verdict, and returns 0 for the real gate', () => {
    const file = pathToFileURL(join(dir, 'nested', 'seeded.json'));
    const printed: string[] = [];
    const code = main(file, (text) => printed.push(text));

    const result = runSeeded();
    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(renderScoreboardJson(buildScoreboard(result)));
    expect(printed.join('\n')).toContain(renderTable(result));
    expect(printed.join('\n')).toContain('PASS: every seeded defect was caught');
  });

  it('returns 1, says FAIL and still writes the scoreboard, with the miss in it, when a case gets through', () => {
    const missed: SeededResult = {
      total: 1,
      caught: 0,
      rate: 0,
      baselinePasses: true,
      cases: [{ id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', caught: false, gotCodes: [] }],
    };
    const file = pathToFileURL(join(dir, 'seeded.json'));
    const printed: string[] = [];
    const code = main(file, (text) => printed.push(text), () => missed);

    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('MISSED  G4     G4_NUMBER_UNSUPPORTED  swapped-number');
    expect(printed.join('\n')).toContain('FAIL: the gate missed a seeded defect');
    expect(JSON.parse(readFileSync(file, 'utf8')).cases[0].caught).toBe(false);
  });
});
```

**Create `evals/test/scoreboard-file.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSeeded } from '../src/run';
import { buildScoreboard, renderScoreboardJson } from '../src/scoreboard';

// The scoreboard is the public proof: the site's /method page shows it. It is
// committed, so it must be exactly what the gate gives today.

const FILE = new URL('../scoreboard/seeded.json', import.meta.url);

describe('the committed scoreboard', () => {
  it('is exactly what the gate gives today; if this fails, run `npm run evals:seeded` and commit the file', () => {
    expect(readFileSync(FILE, 'utf8')).toBe(renderScoreboardJson(buildScoreboard(runSeeded())));
  });

  it('shows every case caught and a baseline that publishes', () => {
    const board = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof buildScoreboard>;
    expect(board.rate).toBe(1);
    expect(board.baselinePasses).toBe(true);
    expect(board.caught).toBe(board.total);
    expect(board.cases.every((item) => item.caught)).toBe(true);
  });

  it('can be imported by the package name, which is how the site will read it', async () => {
    const imported = (await import('@robywire/evals/scoreboard')) as { default: ReturnType<typeof buildScoreboard> };
    expect(imported.default).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
  });
});
```

One more test in the harness file: the cases are listed in the order of the checks.

**In `evals/test/seeded.test.ts`, replace:**
```ts
    }
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s names a check and a failure code that exist', (_id, item) => {
    expect(CHECK_IDS).toContain(item.check);
    expect(ALL_FAILURE_CODES).toContain(item.code);
```

**with:**
```ts
    }
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s names a check and a failure code that exist', (_id, item) => {
    expect(CHECK_IDS).toContain(item.check);
    expect(ALL_FAILURE_CODES).toContain(item.code);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/evals -- test/cli.test.ts test/scoreboard-file.test.ts test/seeded.test.ts`
Expected: FAIL — `Cannot find module '../src/cli'`.

The same run also fails with `"./scoreboard" is not exported under the conditions` (the export does not exist yet) and with `are listed in the order of the checks`.

- [ ] **Step 3: Write the implementation**

Order the cases by check.

**Replace `evals/src/cases/index.ts` with:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { CLAIMS_CASES } from './claims';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { LIMITATIONS_HYGIENE_CASES } from './limitations-hygiene';
import { SOURCING_ANALYSIS_CASES } from './sourcing-analysis';
import { SPEC_CASES } from './spec';

/**
 * Every seeded case, in the order of the checks (G1 to G9), which is the order
 * the scoreboard lists them. Within a check the order is the order they are
 * written in; the sort is stable.
 */
export const SEEDED_CASES: SeededCase[] = [
  ...SPEC_CASES,
  ...FRONTMATTER_STRUCTURE_CASES,
  ...CLAIMS_CASES,
  ...SOURCING_ANALYSIS_CASES,
  ...LIMITATIONS_HYGIENE_CASES,
].sort((a, b) => CHECK_IDS.indexOf(a.check) - CHECK_IDS.indexOf(b.check));
```

The command line program.

**Create `evals/src/cli.ts`:**
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSeeded } from './run';
import type { SeededResult } from './run';
import { buildScoreboard, renderScoreboardJson, renderTable } from './scoreboard';

/** Where the public scoreboard is written. The file is committed. */
const SCOREBOARD_FILE = new URL('../scoreboard/seeded.json', import.meta.url);

/** 0 when every seeded defect was caught and the unbroken piece publishes; 1 otherwise, including when there are no cases. */
export function exitCodeFor(result: SeededResult): number {
  return result.rate < 1 || !result.baselinePasses ? 1 : 0;
}

/**
 * Run the seeded-defect evals, write the scoreboard, print the table, and
 * return the exit code. The scoreboard is written even when a case is missed,
 * because it must show what happened.
 */
export function main(
  file: URL = SCOREBOARD_FILE,
  print: (text: string) => void = console.log,
  run: () => SeededResult = runSeeded,
): number {
  const result = run();
  const path = fileURLToPath(file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderScoreboardJson(buildScoreboard(result)));

  print(renderTable(result));
  const code = exitCodeFor(result);
  print(
    code === 0
      ? '\nPASS: every seeded defect was caught.'
      : '\nFAIL: the gate missed a seeded defect, or the unbroken piece does not publish. Fix the gate, not the cases.',
  );
  return code;
}

// Run when started as a script (tsx src/cli.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
```

The package scripts and the export.

**Replace `evals/package.json` with:**
```json
{
  "name": "@robywire/evals",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Seeded-defect harness that proves the gate catches what it should.",
  "exports": {
    ".": "./src/index.ts",
    "./scoreboard": "./scoreboard/seeded.json"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run --passWithNoTests",
    "seeded": "tsx src/cli.ts"
  },
  "dependencies": {
    "@robywire/gate": "0.0.0"
  }
}
```

And the root script.

**In `package.json`, replace:**
```json
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
```

**with:**
```json
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "evals:seeded": "npm run seeded --workspace @robywire/evals"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
```

- [ ] **Step 4: Run the tests**

Run: `npm test --workspace @robywire/evals -- test/cli.test.ts test/seeded.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

Run: `npm test --workspace @robywire/evals -- test/scoreboard-file.test.ts`
Expected: FAIL — `ENOENT`.

The scoreboard file does not exist yet.

- [ ] **Step 5: Run the command that writes the scoreboard**

Run: `npm run evals:seeded`
Expected: PASS — prints `Seeded-defect evals`, a line saying every case was caught (`(100.0%)`), `baseline (the unbroken golden piece): publishes`, a table with one `caught` line for each case, and `PASS: every seeded defect was caught.`

Run: `npm test --workspace @robywire/evals`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Run it in CI and document it**

**In `.github/workflows/ci.yml`, replace:**
```text

      - name: Test
        run: npm test
```

**with:**
```text

      - name: Test
        run: npm test

      - name: Seeded-defect evals
        run: npm run evals:seeded
```

**In `README.md`, replace:**
````markdown
npm ci               # install exactly what package-lock.json pins
npm run typecheck    # tsc in every workspace that has a typecheck script
npm test             # Vitest in every workspace that has a test script
```

`npm run verify` runs every check in CI order: typecheck, tests, seeded-defect evals, fixture drift, production build and audit, fixture build and audit, then Lighthouse. It arrives with the site milestone. Until then `typecheck` and `test` are the checks that exist.
````

**with:**
````markdown
npm ci               # install exactly what package-lock.json pins
npm run typecheck    # tsc in every workspace that has a typecheck script
npm test             # Vitest in every workspace that has a test script
npm run evals:seeded # break the golden piece in known ways and check the gate catches each one
```

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed and which the site's /method page will show; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

`npm run verify` runs every check in CI order: typecheck, tests, seeded-defect evals, fixture drift, production build and audit, fixture build and audit, then Lighthouse. It arrives with the site milestone. Until then `typecheck`, `test` and `evals:seeded` are the checks that exist.
````

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml README.md package.json evals/package.json evals/scoreboard evals/src/cases/index.ts evals/src/cli.ts evals/test/cli.test.ts evals/test/scoreboard-file.test.ts evals/test/seeded.test.ts
git commit -m "feat(evals): add the evals:seeded command, commit the scoreboard and run it in CI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Prove the proof can fail**

A proof that cannot fail proves nothing. Make the G7 check do nothing, run the command, and watch it fail. In `gate/src/checks/g7-analysis.ts`, change the last line of the check so that it returns no failures.

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
  return { failures, holdReasons: [] };
```

**with:**
```ts
  return { failures: [], holdReasons: [] };
```

Run: `npm run evals:seeded`
Expected: FAIL — prints `(90.0%)`, four `MISSED  G7` lines (`analysis-in-opening`, `analysis-flood`, `analysis-new-number` and `analysis-new-name`, each with `(the gate reported: nothing)`), and `FAIL: the gate missed a seeded defect`. The command exits 1, and every other case is still caught.

Now put both files back. The failed run also rewrote the scoreboard with the misses, so restore it too.

Run: `git checkout -- gate/src/checks/g7-analysis.ts evals/scoreboard/seeded.json`
Expected: prints nothing.

Run: `git status --porcelain`
Expected: prints nothing (everything is committed and restored).

Run: `npm run evals:seeded`
Expected: PASS — `PASS: every seeded defect was caught.`

Run: `git status --porcelain`
Expected: prints nothing (the command wrote exactly the committed scoreboard).

- [ ] **Step 10: Run the milestone's done-when checks**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

Run: `npx tsx -e "import { runGate, defaultContext } from '@robywire/gate'; import { cloneGolden } from '@robywire/gate/fixtures'; const result = runGate(cloneGolden(), defaultContext()); console.log(result.route, JSON.stringify(result.checks))"`
Expected: PASS — prints `publish {"G1":"pass","G2":"pass","G3":"pass","G4":"pass","G5":"pass","G6":"pass","G7":"pass","G8":"pass","G9":"pass"}`, and this time all nine checks really ran.

Run: `git status --porcelain`
Expected: prints nothing (everything is committed).

Run: `git log --oneline`
Expected: PASS — the log, newest first, starts with `feat(evals): add the evals:seeded command, commit the scoreboard and run it in CI` and further down contains `feat(gate): list every failure code of G1 to G5 and expose them as ALL_FAILURE_CODES` just above `feat(gate): export the checks and prove the golden piece passes G1 to G5 through runGate`.
