## Plan 2 (part 1) — Patches to the gate and the desk workspace

**Goal:** make the gate say what the pipeline will need it to say, then open the `desk` workspace that the pipeline is built in. Plan 1 left two things that the Desk cannot work around: a claim that only another outlet reports had no honest `basis` (the fifth fixture piece called it a `filing`), and a "What we couldn't verify" sentence could list any number of claims and described a claim that has no number by a name or a date. Tasks 1 and 2 are test-first patches to Plan 1's code. Task 3 creates the `desk` workspace with its configuration, so that every later part has a package to put code in.

| Task | What it does |
|---|---|
| 1 | The basis `reported` for claims that come only from another outlet: a limitation sentence that names the outlet, the G6 codes `G6_TIER2_BASIS` and `G6_TIER1_REPORTED`, and a G8 rule that one sentence names one outlet. Resolves Plan 1's entry-checklist item 4. |
| 2 | Limitation sentences cover at most four claims each (`G8_LIMITATION_GROUP_SIZE`), and a claim with no number value is named by its label alone. Resolves Plan 1's entry-checklist item 9. |
| 3 | The `desk` workspace (`@robywire/desk`): package, TypeScript configuration, a smoke test, `DeskConfig` with `defaultConfig` and `loadConfig`, `.gitignore` for run folders and evidence, a README section. |

Task numbers start at 1 again in Plan 2. "Plan 1's Task 71" means the task of that number in Plan 1.

**Starting state:** Plan 1 is finished and committed: `npm run typecheck`, `npm test`, `npm run evals:seeded` (every seeded defect caught) and `npm run fixtures:check` pass, and `gate/`, `evals/` and `site/` are the workspaces of Plan 1. `gate/src/limitations.ts` renders the limitation sentences, `gate/src/checks/g6-sourcing.ts` and `g8-limitations.ts` are the two checks that Tasks 1 and 2 change, `gate/src/fixtures/tier2.ts` builds the piece that rests on another outlet, and `evals/src/cases/` holds the seeded defects.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts` (or `@robywire/evals`, `@robywire/site`). Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong. The exception is a test that counts or locates something that a task says changes: those tests are edited, and the task shows each edit.
- Source files contain ASCII only. Never type a character outside ASCII into a source file. Code uses `String.fromCharCode` where it needs one.
- **Every new failure code** needs four things, all in the task that adds it: a unit test, a seeded-defect case in `evals/src/cases/`, an entry in the code list of its check (which feeds `ALL_FAILURE_CODES`), and a plain-English label in `site/src/lib/reasons.ts`. Tests fail until each exists: `gate/test/failure-codes.test.ts` for the list, `evals/test/coverage.test.ts` for the seeded case, `site/test/reasons.test.ts` for the label.
- The descriptions of the seeded defects are printed on the `/method` page of the production site, where the audit forbids the name of the fictional company, so a description must not contain it. A description also names no claim of the golden piece and counts none of its sentences; a test checks both.
- Anything the gate's behaviour changes is regenerated, never edited by hand: `npm run evals:seeded` rewrites `evals/scoreboard/seeded.json`, and `npm run fixtures:generate --workspace @robywire/site` rewrites the fixture pieces. Both files are committed with the task that changes them.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** Tasks 1 and 2 add no package. Task 3 adds a workspace that depends on packages Plan 1 already installed, at the versions already pinned in the repository: `zod` 4.6.5, `yaml` 2.9.1, `parse5` 8.0.1 and `fast-xml-parser` 5.11.2.

---

### Task 1: The basis `reported` for claims that come only from another outlet

**Files:**
- Modify: `gate/src/constants.ts` (`BASES` gains `reported`)
- Modify: `gate/src/limitations.ts` (the two `reported` templates, `outletOf`, grouping by outlet)
- Modify: `gate/src/checks/g6-sourcing.ts` (new codes `G6_TIER2_BASIS` and `G6_TIER1_REPORTED`)
- Modify: `gate/src/checks/g8-limitations.ts` (one outlet to a `reported` sentence, code `G8_LIMITATION_GROUP`)
- Modify: `gate/src/fixtures/tier2.ts` (the piece that rests on another outlet uses the basis `reported`)
- Modify: `evals/src/cases/support.ts`, `evals/src/cases/spec.ts`, `evals/src/cases/sourcing-analysis.ts`, `evals/src/cases/limitations-hygiene.ts` (three seeded defects, and the tier-2 defects of Plan 1 written with the new basis), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `site/src/lib/card.ts`, `site/src/lib/reasons.ts`, `site/src/lib/method.ts`, `site/src/pages/method/index.astro` (words for the new basis and codes)
- Modify: `site/src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json` and `site/src/content-fixtures/news/fixture-robotics-ships-fx-5-to-second-plant.mdx` (regenerated)
- Test: `gate/test/constants.test.ts`, `gate/test/limitations.test.ts`, `gate/test/g6-sourcing.test.ts`, `gate/test/g8-limitations.test.ts`, `gate/test/g2-structure.test.ts`, `gate/test/tier2-variant.test.ts`, `gate/test/golden-gate.test.ts`, `evals/test/support.test.ts` (new), `evals/test/seeded.test.ts`, `site/test/card.test.ts`, `site/test/method.test.ts`, `site/test/fixtures.test.ts`

A claim has a `basis`, which says where its figure came from. Plan 1 gave eight values and no honest one for a claim whose only source is another outlet: the fifth fixture piece, which rests on a report by the fictional outlet Mercer Wire, called its investor count a `filing`, which is a safe basis that needs no limitation sentence. The pipeline will meet such claims every time it writes a story from a tier-2 feed, so this task adds the ninth basis. This task resolves Plan 1's entry-checklist item 4, which asked for exactly this decision.

The rules:

1. `BASES` gains `reported`, last. `SAFE_BASES` does not change, so a reported claim always needs a "What we couldn't verify" sentence. Every table that has one entry for each basis gets an entry: the limitation templates, and the words the fact card draws under a figure (`BASIS_WORDS`, where `reported` is "another outlet"). The receipts page prints the basis as it is, so it needs no table; it now prints `reported` for the claim.
2. The limitation templates for `reported` name the outlet. Singular: "The {v}{label} figure is reported by {outlet} and was not checked against a primary source." Plural: "The {items} figures are reported by {outlet} and were not checked against a primary source." The outlet is the `source.outlet` of the claims, taken from the claims themselves: `renderLimitation` and `buildLimitations` get no extra argument that a caller could get wrong. One sentence names one outlet, so for `reported` the group key is the pair (basis, outlet): claims from two outlets make two sentences, the outlet of the lowest claim number first.
3. G6 gains two codes. `G6_TIER2_BASIS`: a tier-2 claim that a sentence cites has a basis other than `reported`. `G6_TIER1_REPORTED`: a tier-1 claim that a sentence cites has the basis `reported`. Each claim is reported once, however many sentences cite it, and a claim that only a limitation sentence cites is read too, because it reaches the ledger. A claim that no sentence cites never reaches the ledger and is not read.
4. G8: a `basis` sentence for `reported` whose claims do not share one outlet fails with the existing code `G8_LIMITATION_GROUP`. G2 needs no new code: a reported claim is not safe, so G2 already asks for a sentence that covers it (`G2_LIMITATION_COVERAGE`).
5. The piece that rests on another outlet (`makeTier2Variant`, the fifth fixture piece) now gives claim c-19 the basis `reported` and writes its limitations again with `buildLimitations`, so the piece has a sentence that names Mercer Wire. The held-then-released fixture still passes every check, and its receipts page now says `reported` where it said `filing`.
6. Plain English: `G6_TIER2_BASIS` and `G6_TIER1_REPORTED` get labels, the G6, G2 and G8 sentences of the `/method` page say what the code now does, and the ledger paragraph of that page names the new basis.

- [ ] **Step 1: Write the failing tests for the basis and its templates**

The vocabulary test now lists nine bases and says that `reported` is never safe. The new blocks in the limitation tests check `outletOf` (the outlet of a claim's source, without the spaces around it, and empty when there is none), and build claims that another outlet reports (tier 2, an outlet, the basis `reported`) to check the two templates, the outlet taken from the claim (a `$` in a name read as a letter), the grouping by outlet and its order, and that no other template has an outlet.

**In `gate/test/constants.test.ts`, replace:**
```ts
  });

  it('names the eight claim bases, four statuses and six claim types', () => {
    expect(BASES).toEqual([
      'datasheet',
```

**with:**
```ts
  });

  it('names the nine claim bases, four statuses and six claim types', () => {
    expect(BASES).toEqual([
      'datasheet',
```

**In `gate/test/constants.test.ts`, replace:**
```ts
      'measured',
      'demo',
    ]);
    expect(STATUSES).toEqual(['demonstrated', 'deployed', 'planned', 'unspecified']);
```

**with:**
```ts
      'measured',
      'demo',
      'reported',
    ]);
    expect(STATUSES).toEqual(['demonstrated', 'deployed', 'planned', 'unspecified']);
```

**In `gate/test/constants.test.ts`, replace:**
```ts
  });

  it('keeps the safe bases a subset of the bases', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
    for (const basis of SAFE_BASES) {
      expect(BASES).toContain(basis);
    }
  });

```

**with:**
```ts
  });

  it('keeps the safe bases a subset of the bases, and never calls what another outlet reported safe', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
    for (const basis of SAFE_BASES) {
      expect(BASES).toContain(basis);
    }
    expect(SAFE_BASES).not.toContain('reported');
  });

```

**In `gate/test/limitations.test.ts`, replace:**
```ts
  needsBasisLimitation,
  needsStatusLimitation,
  renderLimitation,
} from '../src/limitations';
```

**with:**
```ts
  needsBasisLimitation,
  needsStatusLimitation,
  outletOf,
  renderLimitation,
} from '../src/limitations';
```

**In `gate/test/limitations.test.ts`, replace:**
```ts
    expect(buildLimitations([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'measured', status: 'deployed' })])).toEqual([]);
  });
});
```

**with:**
```ts
    expect(buildLimitations([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'measured', status: 'deployed' })])).toEqual([]);
  });
});

describe('outletOf', () => {
  /** A tier-2 claim whose source names `outlet`, or names none when it is undefined. */
  const from = (outlet: string | undefined): Claim => claim({ source: { ...BASE_CLAIM.source, tier: 2, ...(outlet === undefined ? {} : { outlet }) } });

  it('is the outlet the source names, without the spaces around it', () => {
    expect(outletOf(from('Mercer Wire'))).toBe('Mercer Wire');
    expect(outletOf(from('  Mercer Wire \t'))).toBe('Mercer Wire');
  });

  it('is empty when the source names no outlet, or only spaces', () => {
    expect(outletOf(from(undefined))).toBe('');
    expect(outletOf(from('   '))).toBe('');
    expect(outletOf(claim({}))).toBe('');
  });
});

describe('the basis reported', () => {
  /** A claim that only another outlet reports: tier 2, with the outlet named, and the basis `reported`. */
  const reported = (id: string, label: string, outlet: string, raw?: string): Claim =>
    claim({
      id,
      label,
      basis: 'reported',
      source: { ...BASE_CLAIM.source, tier: 2, outlet },
      values: raw === undefined ? [] : [{ kind: 'number', raw, normalised: raw }],
    });

  it('is never a safe basis, so a reported claim always needs a limitation sentence', () => {
    expect(SAFE_BASES).not.toContain('reported');
    expect(needsBasisLimitation(reported('c-1', 'investor count', 'Mercer Wire', '7'))).toBe(true);
  });

  it('is written in the singular with the figure, the label and the outlet', () => {
    expect(renderLimitation([reported('c-19', 'investor count', 'Mercer Wire', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.',
    );
  });

  it('is written in the plural with the figure and label of each claim, and the outlet once', () => {
    const two = [reported('c-19', 'investor count', 'Mercer Wire', '7'), reported('c-20', 'round size', 'Mercer Wire', '$450 million')];
    expect(renderLimitation(two, 'basis')).toBe(
      'The 7 investor count and $450 million round size figures are reported by Mercer Wire and were not checked against a primary source.',
    );
  });

  it('takes the outlet from the claims themselves, without the spaces around it, and reads a "$" in it as a letter', () => {
    expect(renderLimitation([reported('c-1', 'investor count', '  Mercer Wire ', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.',
    );
    expect(renderLimitation([reported('c-1', 'investor count', 'Cash $& Wire', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Cash $& Wire and was not checked against a primary source.',
    );
  });

  it('names the outlet of the first claim, which is why a group never mixes outlets', () => {
    const mixed = [reported('c-1', 'investor count', 'Mercer Wire', '7'), reported('c-2', 'round size', 'Tarn Daily', '5')];
    expect(renderLimitation(mixed, 'basis')).toContain('are reported by Mercer Wire and were');
  });

  it('has an outlet only in its own templates', () => {
    for (const basis of BASES) {
      expect(BASIS_TEMPLATES[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
      expect(BASIS_TEMPLATES_PLURAL[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
    }
    expect(renderLimitation([claim({ source: { ...BASE_CLAIM.source, outlet: 'Mercer Wire' } })], 'basis')).not.toContain('Mercer Wire');
  });

  it('is grouped by outlet, so two outlets make two groups, the outlet of the lowest claim number first, after the other basis groups', () => {
    const groups = limitationGroups([
      reported('c-9', 'a', 'Tarn Daily'),
      reported('c-2', 'b', 'Mercer Wire'),
      reported('c-5', 'c', 'Tarn Daily'),
      reported('c-4', 'd', 'Mercer Wire'),
      claim({ id: 'c-20', basis: 'demo' }),
      claim({ id: 'c-21', basis: 'datasheet', status: 'planned' }),
    ]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-21']],
      ['basis', 'demo', ['c-20']],
      ['basis', 'reported', ['c-2', 'c-4']],
      ['basis', 'reported', ['c-5', 'c-9']],
      ['status', 'planned', ['c-21']],
    ]);
  });

  it('is written as one sentence for each outlet by buildLimitations', () => {
    const claims = [
      reported('c-9', 'investor count', 'Tarn Daily', '7'),
      reported('c-2', 'round size', 'Mercer Wire', '$450 million'),
      reported('c-5', 'valuation', 'Tarn Daily', '$2 billion'),
    ];
    expect(buildLimitations(claims)).toEqual([
      {
        kind: 'limitation',
        text: 'The $450 million round size figure is reported by Mercer Wire and was not checked against a primary source.',
        claimIds: ['c-2'],
        template: 'basis',
      },
      {
        kind: 'limitation',
        text: 'The $2 billion valuation and 7 investor count figures are reported by Tarn Daily and were not checked against a primary source.',
        claimIds: ['c-5', 'c-9'],
        template: 'basis',
      },
    ]);
  });
});
```

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts test/limitations.test.ts`
Expected: FAIL — `names the nine claim bases, four statuses and six claim types` and `the basis reported` and `outletOf is not a function`

- [ ] **Step 2: Add the basis, its templates and the grouping by outlet**

**In `gate/src/constants.ts`, replace:**
```ts
export type Category = (typeof CATEGORY_VOCAB)[number];

/** Where a claim's figure came from. */
export const BASES = [
  'datasheet',
```

**with:**
```ts
export type Category = (typeof CATEGORY_VOCAB)[number];

/**
 * Where a claim's figure came from. `reported` is for a claim whose only source is another outlet
 * (a tier-2 claim): G6 requires it there and refuses it anywhere else.
 */
export const BASES = [
  'datasheet',
```

**In `gate/src/constants.ts`, replace:**
```ts
  'measured',
  'demo',
] as const;
export type Basis = (typeof BASES)[number];
```

**with:**
```ts
  'measured',
  'demo',
  'reported',
] as const;
export type Basis = (typeof BASES)[number];
```

**In `gate/src/constants.ts`, replace:**
```ts
/**
 * Bases that need no "What we couldn't verify" section: the source is a filing,
 * a standard, a paper or a measurement, not a company's own claim.
 */
export const SAFE_BASES = ['filing', 'standard', 'paper', 'measured'] as const satisfies readonly Basis[];
```

**with:**
```ts
/**
 * Bases that need no "What we couldn't verify" section: the source is a filing,
 * a standard, a paper or a measurement, not a company's own claim. `reported` is
 * never safe: what another outlet reports is, by its nature, not checked here.
 */
export const SAFE_BASES = ['filing', 'standard', 'paper', 'measured'] as const satisfies readonly Basis[];
```

`outletOf` is exported because G8 uses it too. Grouping uses a `Set` and `filter`, not `Map.groupBy`, which the project's `ES2023` library setting does not have.

**In `gate/src/limitations.ts`, replace:**
```ts
// each claim) or `{labels}` (the label of each claim) for the templates that do
// not mention a figure. The items are joined "A", "A and B", "A, B and C".

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
```

**with:**
```ts
// each claim) or `{labels}` (the label of each claim) for the templates that do
// not mention a figure. The items are joined "A", "A and B", "A, B and C".
// The templates of the basis `reported` also name the outlet (`{outlet}`), the
// outlet of the claims themselves, which is why a group of reported claims is
// never larger than the claims of one outlet.

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
```

**In `gate/src/limitations.ts`, replace:**
```ts
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
};

```

**with:**
```ts
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
  reported: 'The {v}{label} figure is reported by {outlet} and was not checked against a primary source.',
};

```

**In `gate/src/limitations.ts`, replace:**
```ts
  standard: 'The {labels} requirements come from the published standard.',
  measured: 'The {items} figures were measured by the source and are reported as stated.',
};

```

**with:**
```ts
  standard: 'The {labels} requirements come from the published standard.',
  measured: 'The {items} figures were measured by the source and are reported as stated.',
  reported: 'The {items} figures are reported by {outlet} and were not checked against a primary source.',
};

```

**In `gate/src/limitations.ts`, replace:**
```ts
export const needsStatusLimitation = (claim: Claim): boolean => STATUSES_WITH_SENTENCE.includes(claim.status);

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
```

**with:**
```ts
export const needsStatusLimitation = (claim: Claim): boolean => STATUSES_WITH_SENTENCE.includes(claim.status);

/** The outlet a claim's source names, without the spaces around it; empty when the source names none. */
export const outletOf = (claim: Claim): string => claim.source.outlet?.trim() ?? '';

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
```

**In `gate/src/limitations.ts`, replace:**
```ts
 * Render the limitation sentence for a group of claims through the `basis` or
 * the `status` template. The template is chosen by the first claim's basis (or
 * status); the gate checks that the claims of a group share it. One claim gives
 * the singular sentence, two or more the plural one.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
```

**with:**
```ts
 * Render the limitation sentence for a group of claims through the `basis` or
 * the `status` template. The template is chosen by the first claim's basis (or
 * status), and the outlet of a `reported` sentence is the first claim's outlet;
 * the gate checks that the claims of a group share them. One claim gives the
 * singular sentence, two or more the plural one.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
```

**In `gate/src/limitations.ts`, replace:**
```ts
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label|items|labels)\}/g, (_placeholder, name: string) => {
    if (name === 'items') return items;
    if (name === 'labels') return labels;
    return name === 'v' ? figureOf(first) : first.label;
  });
```

**with:**
```ts
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label|items|labels|outlet)\}/g, (_placeholder, name: string) => {
    if (name === 'items') return items;
    if (name === 'labels') return labels;
    if (name === 'outlet') return outletOf(first);
    return name === 'v' ? figureOf(first) : first.label;
  });
```

**In `gate/src/limitations.ts`, replace:**
```ts
 * The groups of claims that need a limitation sentence. `citedClaims` are the
 * claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; those that are demonstrated or planned are
 * grouped by status, in that order, after the basis groups. A claim that needs
 * both is in a group of each kind. Inside a group the claims are ordered by claim number.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
```

**with:**
```ts
 * The groups of claims that need a limitation sentence. `citedClaims` are the
 * claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; the claims that were `reported` are grouped by
 * outlet as well, so that a sentence names one outlet, the outlet of the lowest
 * claim number first. Those that are demonstrated or planned are grouped by
 * status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
```

**In `gate/src/limitations.ts`, replace:**
```ts
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    if (claims.length > 0) groups.push({ template: 'basis', key: basis, claims });
  }
  for (const status of STATUSES_WITH_SENTENCE) {
```

**with:**
```ts
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    // One sentence names one outlet, so the claims that another outlet reported are grouped by outlet.
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) {
      const group = outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet);
      if (group.length > 0) groups.push({ template: 'basis', key: basis, claims: group });
    }
  }
  for (const status of STATUSES_WITH_SENTENCE) {
```

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts test/limitations.test.ts`
Expected: PASS

- [ ] **Step 3: Write the failing tests for the two G6 codes**

The helpers of the G6 tests that make a claim a tier-2 claim now also give it the basis `reported`, because a tier-2 claim with another basis is exactly what the new code refuses; every older test of this file goes on testing what it tested. The new blocks cover both codes: the message, each of the other eight bases, one report for a claim however often it is cited, a claim that only a limitation sentence cites, a claim that nothing cites, the order of the failures and the hold reason that is held back.

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
import { HOLD_REASONS, checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { claimById, findSentence, mutate } from './helpers';

const OUTLET = 'Mercer Wire';
```

**with:**
```ts
import { HOLD_REASONS, checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { BASES } from '../src/constants';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { allSentences, claimById, findSentence, mutate } from './helpers';

const OUTLET = 'Mercer Wire';
```

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
const sentenceWith = (g: GateInput, text: string) => findSentence(g.draft, (sentence) => sentence.text === text);

/** Make a golden claim a tier-2 claim reported by `outlet`. */
function makeTier2(g: GateInput, id: string, outlet: string = OUTLET): void {
  const { source } = claimById(g.claims, id);
  source.tier = 2;
  source.outlet = outlet;
}

```

**with:**
```ts
const sentenceWith = (g: GateInput, text: string) => findSentence(g.draft, (sentence) => sentence.text === text);

/** Make a golden claim a tier-2 claim reported by `outlet`: another outlet is its only source, so its basis is `reported`. */
function makeTier2(g: GateInput, id: string, outlet: string = OUTLET): void {
  const claim = claimById(g.claims, id);
  claim.source.tier = 2;
  claim.source.outlet = outlet;
  claim.basis = 'reported';
}

```

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
  copy.source.tier = 2;
  copy.source.outlet = OUTLET;
  g.claims.push(copy);
}
```

**with:**
```ts
  copy.source.tier = 2;
  copy.source.outlet = OUTLET;
  copy.basis = 'reported';
  g.claims.push(copy);
}
```

**In `gate/test/g6-sourcing.test.ts`, replace:**
```ts
});

describe('what G6 leaves to other checks', () => {
  it('ignores a claim id that does not exist, which G3 reports', () => {
```

**with:**
```ts
});

describe('G6_TIER2_BASIS', () => {
  const BAD_BASIS = 'comes from a tier-2 outlet but has the basis "filing"; a claim that rests only on another outlet has the basis "reported"';
  /** c-19 as another outlet's claim, properly attributed, but with the basis it had as a filing claim. */
  const filingBasis = (g: GateInput) => {
    makeTier2(g, 'c-19');
    claimById(g.claims, 'c-19').basis = 'filing';
    attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
  };

  it('fails a tier-2 claim that has any basis but reported, and says which claim and what the basis must be', () => {
    const output = run(filingBasis);
    expect(output.failures).toEqual([{ check: 'G6', code: 'G6_TIER2_BASIS', message: `claim c-19 (investor count) ${BAD_BASIS}` }]);
    expect(output.holdReasons).toEqual([]);
  });

  it.each(BASES.filter((basis) => basis !== 'reported'))('fails the basis %s on a tier-2 claim', (basis) => {
    const output = run((g) => {
      filingBasis(g);
      claimById(g.claims, 'c-19').basis = basis;
    });
    expect(messages(output)).toEqual([`claim c-19 (investor count) comes from a tier-2 outlet but has the basis "${basis}"; a claim that rests only on another outlet has the basis "reported"`]);
  });

  it('reports a claim once, however many sentences cite it', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      claimById(g.claims, 'c-17').basis = 'filing';
      for (const located of allSentences(g.draft)) {
        if (located.sentence.claimIds.includes('c-17') && located.sentence.kind === 'fact') {
          located.sentence.attributed = true;
          located.sentence.text = `Mercer Wire reports that ${located.sentence.text}`;
        }
      }
    });
    expect(output.failures.filter((failure) => failure.code === 'G6_TIER2_BASIS')).toHaveLength(1);
  });

  it('reads a claim that only a limitation sentence cites', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      claimById(g.claims, 'c-29').basis = 'filing';
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(codes(output)).toEqual(['G6_TIER2_BASIS']);
  });

  it('does not read a claim that no sentence cites', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      claimById(g.claims, 'c-29').basis = 'filing';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('comes after the failures of the sentences, and keeps the hold reason back', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      claimById(g.claims, 'c-19').basis = 'filing';
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_BASIS']);
    expect(output.holdReasons).toEqual([]);
  });

  it('accepts a tier-2 claim whose basis is reported', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual([]);
  });
});

describe('G6_TIER1_REPORTED', () => {
  it('fails a tier-1 claim that has the basis reported, and says which claim and why', () => {
    const output = run((g) => {
      claimById(g.claims, 'c-19').basis = 'reported';
    });
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER1_REPORTED',
        message:
          'claim c-19 (investor count) comes from a tier-1 source but has the basis "reported"; that basis is for claims that rest only on another outlet, so give it the basis its source supports',
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('reports a claim once, however many sentences cite it', () => {
    const output = run((g) => {
      claimById(g.claims, 'c-17').basis = 'reported';
    });
    expect(codes(output)).toEqual(['G6_TIER1_REPORTED']);
  });

  it('reads a claim that only a limitation sentence cites, and not one that nothing cites', () => {
    const limited = run((g) => {
      const copy = structuredClone(claimById(g.claims, 'c-19'));
      copy.id = 'c-29';
      copy.basis = 'reported';
      g.claims.push(copy);
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(codes(limited)).toEqual(['G6_TIER1_REPORTED']);
    const uncited = run((g) => {
      const copy = structuredClone(claimById(g.claims, 'c-19'));
      copy.id = 'c-29';
      copy.basis = 'reported';
      g.claims.push(copy);
    });
    expect(uncited).toEqual({ failures: [], holdReasons: [] });
  });

  it('tells the two apart: a tier-2 claim with the wrong basis and a tier-1 claim that is reported each fail once, with their own code', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      claimById(g.claims, 'c-19').basis = 'filing';
      claimById(g.claims, 'c-24').basis = 'reported';
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output.failures.map((failure) => [failure.code, failure.message.slice(0, 20)])).toEqual([
      ['G6_TIER2_BASIS', 'claim c-19 (investor'],
      ['G6_TIER1_REPORTED', 'claim c-24 (Ashvale '],
    ]);
  });
});

describe('what G6 leaves to other checks', () => {
  it('ignores a claim id that does not exist, which G3 reports', () => {
```

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts`
Expected: FAIL — `G6_TIER2_BASIS` and `G6_TIER1_REPORTED`

- [ ] **Step 4: Write the two checks in G6**

**In `gate/src/checks/g6-sourcing.ts`, replace:**
```ts

/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS'] as const;

/**
```

**with:**
```ts

/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS', 'G6_TIER2_BASIS', 'G6_TIER1_REPORTED'] as const;

/**
```

**In `gate/src/checks/g6-sourcing.ts`, replace:**
```ts
 * revision first.
 *
 * Limitation sentences are not read: they describe a claim and assert nothing.
 * A claim id that does not exist is G3's to report.
 */
export const checkG6: Check = ({ draft, claims }) => {
```

**with:**
```ts
 * revision first.
 *
 * The basis of a claim says which of the two it is. A claim that rests only on
 * another outlet has the basis `reported`, and no other claim has it: a tier-2
 * claim with any other basis (G6_TIER2_BASIS) would borrow the standing of a
 * filing or a datasheet, and a tier-1 claim with the basis `reported`
 * (G6_TIER1_REPORTED) would hide a primary source behind the label of a secondary
 * one. Each such claim is reported once, wherever a sentence cites it, a
 * limitation sentence included.
 *
 * Limitation sentences are not read for the rules above: they describe a claim
 * and assert nothing. A claim id that does not exist is G3's to report.
 */
export const checkG6: Check = ({ draft, claims }) => {
```

**In `gate/src/checks/g6-sourcing.ts`, replace:**
```ts
  }

  return { failures, holdReasons: failures.length === 0 && tier2Facts > 0 ? [HOLD_TIER2] : [] };
};
```

**with:**
```ts
  }

  const cited = new Set(allSentences(draft).flatMap((located) => located.sentence.claimIds));
  for (const claim of claims) {
    if (!cited.has(claim.id)) continue;
    const label = `claim ${claim.id} (${claim.label})`;
    if (claim.source.tier === 2 && claim.basis !== 'reported') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_BASIS',
        message: `${label} comes from a tier-2 outlet but has the basis "${claim.basis}"; a claim that rests only on another outlet has the basis "reported"`,
      });
    }
    if (claim.source.tier === 1 && claim.basis === 'reported') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER1_REPORTED',
        message: `${label} comes from a tier-1 source but has the basis "reported"; that basis is for claims that rest only on another outlet, so give it the basis its source supports`,
      });
    }
  }

  return { failures, holdReasons: failures.length === 0 && tier2Facts > 0 ? [HOLD_TIER2] : [] };
};
```

Run: `npm test --workspace @robywire/gate -- test/g6-sourcing.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for one outlet to a sentence in G8**

The tests build two filing claims that no limitation sentence covers (c-18 and c-19), make them reported by one outlet or by two, and add a `basis` sentence for them.

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
```

**with:**
```ts
});

describe('G8_LIMITATION_GROUP for claims that another outlet reported', () => {
  /** Make c-18 and c-19 (two filing claims that no limitation sentence covers) claims that `outlets` (one each) report, and add a basis sentence for the two of them. */
  const reportedPair = (g: GateInput, outlets: [string, string], text?: (claims: Parameters<typeof renderLimitation>[0]) => string): LimitationSentence => {
    const pair = [claimById(g.claims, 'c-18'), claimById(g.claims, 'c-19')];
    pair.forEach((claim, at) => {
      claim.source.tier = 2;
      claim.source.outlet = outlets[at]!;
      claim.basis = 'reported';
    });
    const sentence: LimitationSentence = {
      kind: 'limitation',
      template: 'basis',
      claimIds: ['c-18', 'c-19'],
      text: (text ?? ((claims) => renderLimitation(claims, 'basis')))(pair),
    };
    g.draft.limitations.push(sentence);
    return sentence;
  };
  const AT = 'limitations, sentence 6';

  it('accepts a reported sentence whose claims come from one outlet', () => {
    expect(run((g) => reportedPair(g, ['Mercer Wire', 'Mercer Wire']))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails a reported sentence whose claims come from different outlets, and says which', () => {
    const output = run((g) => reportedPair(g, ['Mercer Wire', 'Tarn Daily']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: `the limitation sentence at ${AT} groups claims reported by different outlets (c-18: Mercer Wire, c-19: Tarn Daily): a reported sentence covers claims from one outlet`,
        where: AT,
      },
    ]);
  });

  it('does not also report a mismatch for a group of two outlets', () => {
    expect(codes(run((g) => reportedPair(g, ['Mercer Wire', 'Tarn Daily'], () => 'Anything.')))).toEqual(['G8_LIMITATION_GROUP']);
  });

  it('reads the outlet without the spaces around it, so one outlet written two ways is still one', () => {
    expect(run((g) => reportedPair(g, ['Mercer Wire', '  Mercer Wire ']))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails a reported sentence that names another outlet than the claims do', () => {
    const output = run((g) => reportedPair(g, ['Mercer Wire', 'Mercer Wire'], (claims) => renderLimitation(claims, 'basis').replace('Mercer Wire', 'Tarn Daily')));
    expect(codes(output)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('does not ask a status sentence for one outlet: it groups by status, whoever reported the claims', () => {
    const output = run((g) => {
      const sentence = reportedPair(g, ['Mercer Wire', 'Tarn Daily']);
      for (const id of sentence.claimIds) claimById(g.claims, id).status = 'planned';
      sentence.template = 'status';
      sentence.text = renderLimitation(sentence.claimIds.map((id) => claimById(g.claims, id)), 'status');
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
```

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts`
Expected: FAIL — `fails a reported sentence whose claims come from different outlets, and says which`

- [ ] **Step 6: Write the outlet rule in G8**

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
import type { Check, Failure } from '../gate';
import { claimNumber, joinList, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';
```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { claimNumber, joinList, outletOf, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';
```

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
 *   claim number (G8_LIMITATION_CLAIMS).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status (G8_LIMITATION_GROUP).
 * - Its text is what the template renders for its claims
 *   (G8_LIMITATION_MISMATCH). A sentence whose claims have changed since it
```

**with:**
```ts
 *   claim number (G8_LIMITATION_CLAIMS).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status; a 'basis' sentence for the basis
 *   `reported` names one outlet, so its claims also share their outlet
 *   (G8_LIMITATION_GROUP).
 * - Its text is what the template renders for its claims
 *   (G8_LIMITATION_MISMATCH). A sentence whose claims have changed since it
```

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
    }

    const expected = renderLimitation(group, sentence.template);
    if (sentence.text !== expected) {
```

**with:**
```ts
    }

    const outlets = [...new Set(group.map(outletOf))];
    if (sentence.template === 'basis' && keys[0] === 'reported' && outlets.length > 1) {
      const examples = outlets.map((outlet) => `${(group.find((claim) => outletOf(claim) === outlet) as Claim).id}: ${outlet}`).join(', ');
      fail(
        'G8_LIMITATION_GROUP',
        `the limitation sentence at ${where} groups claims reported by different outlets (${examples}): a reported sentence covers claims from one outlet`,
      );
      continue;
    }

    const expected = renderLimitation(group, sentence.template);
    if (sentence.text !== expected) {
```

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts`
Expected: PASS

- [ ] **Step 7: Write the failing tests for the piece that rests on another outlet**

The variant test now says that c-19 has the basis `reported`, that the limitations are the ones `buildLimitations` writes (one more than the golden piece's five, and one of them names Mercer Wire), and that nothing else outside the limitations differs from the golden piece. The whole-gate test builds its tier-2 piece the same way, and has a defect each for the two new G6 codes. G2's table of bases that need a limitation sentence gains `reported`.

**In `gate/test/tier2-variant.test.ts`, replace:**
```ts
import { TIER2_OUTLET, cloneGolden, makeTier2Variant, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { Claim, Draft } from '../src/schemas';
import { allSentences } from '../src/sentences';
import { claimById, mutate } from './helpers';

```

**with:**
```ts
import { TIER2_OUTLET, cloneGolden, makeTier2Variant, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { buildLimitations } from '../src/limitations';
import { Claim, Draft } from '../src/schemas';
import { allSentences, citedClaims } from '../src/sentences';
import { claimById, mutate } from './helpers';

```

**In `gate/test/tier2-variant.test.ts`, replace:**
```ts
  });

  it('turns the investor count into a tier-2 claim of the outlet, on a .example address with a hash of its own', () => {
    const claim = claimById(variant.claims, 'c-19');
    expect(claim.source.tier).toBe(2);
    expect(claim.source.outlet).toBe('Mercer Wire');
    expect(TIER2_OUTLET).toBe('Mercer Wire');
    expect(new URL(claim.source.url).hostname.endsWith('.example')).toBe(true);
```

**with:**
```ts
  });

  it('turns the investor count into a tier-2 claim of the outlet, with the basis reported, on a .example address with a hash of its own', () => {
    const claim = claimById(variant.claims, 'c-19');
    expect(claim.source.tier).toBe(2);
    expect(claim.source.outlet).toBe('Mercer Wire');
    expect(claim.basis).toBe('reported');
    expect(TIER2_OUTLET).toBe('Mercer Wire');
    expect(new URL(claim.source.url).hostname.endsWith('.example')).toBe(true);
```

**In `gate/test/tier2-variant.test.ts`, replace:**
```ts
  });

  it('changes nothing else: one claim and one sentence differ from the golden piece', () => {
    const golden = cloneGolden();
    expect(variant.claims.filter((claim, at) => JSON.stringify(claim) !== JSON.stringify(golden.claims[at])).map((claim) => claim.id)).toEqual(['c-19']);
    const before = allSentences(golden.draft).map((item) => JSON.stringify(item.sentence));
    const after = allSentences(variant.draft).map((item) => JSON.stringify(item.sentence));
    expect(after.filter((text, at) => text !== before[at])).toHaveLength(1);
  });

```

**with:**
```ts
  });

  it('changes nothing else: one claim and one sentence differ from the golden piece, and the limitations are built again', () => {
    const golden = cloneGolden();
    expect(variant.claims.filter((claim, at) => JSON.stringify(claim) !== JSON.stringify(golden.claims[at])).map((claim) => claim.id)).toEqual(['c-19']);
    const outsideLimitations = (input: ReturnType<typeof cloneGolden>) =>
      allSentences(input.draft)
        .filter((item) => item.section !== 'limitations')
        .map((item) => JSON.stringify(item.sentence));
    const before = outsideLimitations(golden);
    const after = outsideLimitations(variant);
    expect(after).toHaveLength(before.length);
    expect(after.filter((text, at) => text !== before[at])).toHaveLength(1);
    expect(variant.draft.limitations).toEqual(buildLimitations(citedClaims(variant.draft, variant.claims)));
  });

  it('adds the sentence that says another outlet reported the figure, and keeps the others', () => {
    const texts = variant.draft.limitations.map((sentence) => sentence.text);
    expect(texts).toContain('The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.');
    expect(texts).toHaveLength(cloneGolden().draft.limitations.length + 1);
  });

```

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
});

/** Make c-19 (the investor count) a claim reported by an outlet, and leave the sentence that cites it as it was. */
function makeTier2(g: GateInput): void {
  const { source } = claimById(g.claims, 'c-19');
  source.tier = 2;
  source.outlet = 'Mercer Wire';
}

```

**with:**
```ts
});

/**
 * Make c-19 (the investor count) a claim reported by an outlet, and leave the sentence that cites it as it was.
 * The claim has the basis `reported`, which needs a limitation sentence, so the limitations are built again.
 */
function makeTier2(g: GateInput): void {
  const claim = claimById(g.claims, 'c-19');
  claim.source.tier = 2;
  claim.source.outlet = 'Mercer Wire';
  claim.basis = 'reported';
  g.draft.limitations = api.buildLimitations(api.citedClaims(g.draft, g.claims));
}

```

**In `gate/test/golden-gate.test.ts`, replace:**
```ts
    ],
    ['G6', 'G6_TIER2_UNATTRIBUTED', (g) => makeTier2(g)],
    [
      'G7',
```

**with:**
```ts
    ],
    ['G6', 'G6_TIER2_UNATTRIBUTED', (g) => makeTier2(g)],
    ['G6', 'G6_TIER2_BASIS', (g) => (claimById(g.claims, 'c-19').source = { ...claimById(g.claims, 'c-19').source, tier: 2, outlet: 'Mercer Wire' })],
    ['G6', 'G6_TIER1_REPORTED', (g) => (claimById(g.claims, 'c-19').basis = 'reported')],
    [
      'G7',
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  });

  it.each(['datasheet', 'press-release', 'briefing', 'demo'] as const)('treats a %s claim as needing limitations', (basis) => {
    const change = (g: GateInput) => {
      needNothing(g);
```

**with:**
```ts
  });

  it.each(['datasheet', 'press-release', 'briefing', 'demo', 'reported'] as const)('treats a %s claim as needing limitations', (basis) => {
    const change = (g: GateInput) => {
      needNothing(g);
```

Run: `npm test --workspace @robywire/gate -- test/tier2-variant.test.ts`
Expected: FAIL — `with the basis reported`

- [ ] **Step 8: Give the variant its basis and its limitations**

**In `gate/src/fixtures/tier2.ts`, replace:**
```ts
import { createHash } from 'node:crypto';
import type { GateInput } from '../gate';
import { allSentences } from '../sentences';

// A fictional outlet and its page, like every other name and address in the
```

**with:**
```ts
import { createHash } from 'node:crypto';
import type { GateInput } from '../gate';
import { buildLimitations } from '../limitations';
import { allSentences, citedClaims } from '../sentences';

// A fictional outlet and its page, like every other name and address in the
```

**In `gate/src/fixtures/tier2.ts`, replace:**
```ts
 * A copy of `base` (the golden piece, or a variant of it) in which the investor
 * count comes from another outlet instead of from the filing. Claim c-19 is now
 * a tier-2 claim of Mercer Wire, and the sentence that cites it is written the
 * way check G6 requires: it names the outlet and is marked `attributed`.
 *
 * Nothing fails in the gate, but a piece that rests on another outlet is never
```

**with:**
```ts
 * A copy of `base` (the golden piece, or a variant of it) in which the investor
 * count comes from another outlet instead of from the filing. Claim c-19 is now
 * a tier-2 claim of Mercer Wire with the basis `reported`, and the sentence that
 * cites it is written the way check G6 requires: it names the outlet and is
 * marked `attributed`. A reported claim needs a limitation sentence, so the
 * limitations are built again from the claims the piece cites.
 *
 * Nothing fails in the gate, but a piece that rests on another outlet is never
```

**In `gate/src/fixtures/tier2.ts`, replace:**
```ts
    outlet: TIER2_OUTLET,
  };
  claim.span = { start: TIER2_QUOTE_START, end: TIER2_QUOTE_START + TIER2_QUOTE.length, quote: TIER2_QUOTE };

  found.sentence.text = ATTRIBUTED_SENTENCE;
  found.sentence.attributed = true;
  return copy;
}
```

**with:**
```ts
    outlet: TIER2_OUTLET,
  };
  claim.basis = 'reported';
  claim.span = { start: TIER2_QUOTE_START, end: TIER2_QUOTE_START + TIER2_QUOTE.length, quote: TIER2_QUOTE };

  found.sentence.text = ATTRIBUTED_SENTENCE;
  found.sentence.attributed = true;
  copy.draft.limitations = buildLimitations(citedClaims(copy.draft, copy.claims));
  return copy;
}
```

The whole gate package is green again.

Run: `npm test --workspace @robywire/gate`
Expected: PASS

- [ ] **Step 9: Run the tests that tell you what is still missing**

Both new codes need a seeded defect and a label, and two tests say so.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G6_TIER2_BASIS`

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G6_TIER1_REPORTED`

- [ ] **Step 10: Write the failing tests for the seeded-defect helpers and cases**

The seeded cases are written with a few helpers, and a helper that quietly did less than it says would make a case break the piece in some other way than its description says. The new file tests each helper on its own (`reportedBy` and `attributeTo`, and that each stops with a message when the golden piece has no such claim or sentence). The new block in the seeded tests runs the six cases that rewrite what another outlet reports, one at a time, and requires each to break the rule it names and no other.

**Create `evals/test/support.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { buildLimitations, citedClaims } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { attributeTo, claimOf, reportedBy, sentenceWith } from '../src/cases/support';

// The seeded cases are written with a few helpers. A helper that quietly did less than it says would make a case
// break the piece in a different way than its description says, so each is tested on its own.

describe('reportedBy', () => {
  it('makes a claim one that only the outlet reports: a tier-2 source that names it, with the basis reported', () => {
    const input = cloneGolden();
    reportedBy(input, 'c-19', 'Mercer Wire');
    const claim = claimOf(input, 'c-19');
    expect([claim.source.tier, claim.source.outlet, claim.basis]).toEqual([2, 'Mercer Wire', 'reported']);
  });

  it('changes no other claim', () => {
    const input = cloneGolden();
    reportedBy(input, 'c-19', 'Mercer Wire');
    const others = (claims: typeof input.claims) => claims.filter((claim) => claim.id !== 'c-19');
    expect(others(input.claims)).toEqual(others(cloneGolden().claims));
  });

  it('writes the limitation sentences again from the claims the piece cites, so that the reported claim is covered', () => {
    const input = cloneGolden();
    expect(input.draft.limitations.some((sentence) => sentence.claimIds.includes('c-19'))).toBe(false);
    reportedBy(input, 'c-19', 'Mercer Wire');
    expect(input.draft.limitations).toEqual(buildLimitations(citedClaims(input.draft, input.claims)));
    expect(input.draft.limitations.some((sentence) => sentence.claimIds.includes('c-19'))).toBe(true);
  });

  it('stops, saying so, when the golden piece has no such claim', () => {
    expect(() => reportedBy(cloneGolden(), 'c-999', 'Mercer Wire')).toThrow('seeded case: the golden piece has no claim c-999');
  });
});

describe('attributeTo', () => {
  it('writes a fact sentence as an attribution: the new text, marked attributed', () => {
    const input = cloneGolden();
    attributeTo(input, 'It lists 7 investors', 'Mercer Wire reports that 7 investors took part in the round.');
    expect(sentenceWith(input, 'Mercer Wire reports')).toEqual({
      kind: 'fact',
      text: 'Mercer Wire reports that 7 investors took part in the round.',
      claimIds: ['c-19'],
      attributed: true,
    });
  });

  it('marks only a fact sentence: an analysis sentence gets the new text and no flag', () => {
    const input = cloneGolden();
    attributeTo(input, 'The measured rate sits below', 'Mercer Wire reports that the measured rate sits below the maximum.');
    const sentence = sentenceWith(input, 'Mercer Wire reports');
    expect(sentence.kind).toBe('analysis');
    expect(sentence).not.toHaveProperty('attributed');
  });

  it('stops, saying so, when no sentence has the words', () => {
    expect(() => attributeTo(cloneGolden(), 'words that no sentence has', 'Anything.')).toThrow(
      'seeded case: no sentence of the golden piece contains "words that no sentence has"',
    );
  });
});
```

**In `evals/test/seeded.test.ts`, replace:**
```ts
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
```

**with:**
```ts
});

describe('the cases that rewrite what another outlet reports', () => {
  // Each of these changes several sentences and claims at once, so each is run alone and must break the rule it names and no other.
  it.each([
    ['tier2-only-claim', 'G6_TIER2_UNATTRIBUTED'],
    ['tier2-outlet-not-named', 'G6_TIER2_UNATTRIBUTED'],
    ['tier2-in-analysis', 'G6_TIER2_IN_ANALYSIS'],
    ['tier2-claim-wrong-basis', 'G6_TIER2_BASIS'],
    ['primary-claim-called-reported', 'G6_TIER1_REPORTED'],
    ['limitation-two-outlets', 'G8_LIMITATION_GROUP'],
  ])('%s breaks the rule it names and no other', (id, code) => {
    const only = SEEDED_CASES.filter((item) => item.id === id);
    expect(runSeeded(ALL_CHECKS, only).cases.map((item) => item.gotCodes)).toEqual([[code]]);
  });
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
```

Run: `npm test --workspace @robywire/evals -- test/support.test.ts test/seeded.test.ts`
Expected: FAIL — `reportedBy is not a function` and `tier2-claim-wrong-basis breaks the rule it names and no other`

- [ ] **Step 11: Write the helpers and the seeded defects**

Three defects are new. `tier2-claim-wrong-basis` is a claim that only another outlet reports, attributed properly, with the basis of a filing. `primary-claim-called-reported` is a tier-1 claim with the basis `reported`. `limitation-two-outlets` merges the limitation sentences of two outlets into one. Their descriptions say what rule is broken and name no claim.

Plan 1's three tier-2 defects (`tier2-only-claim`, `tier2-outlet-not-named`, `tier2-in-analysis`) made a claim tier 2 and left its basis alone, which the new code now also refuses, and left the piece without the limitation sentence that a reported claim needs. They now use one helper, `reportedBy`, that gives the claim its outlet, the basis `reported` and a fresh set of limitation sentences, so each still breaks exactly the rule that its description names. The helper `attributeTo` writes a sentence as an attribution.

**In `evals/src/cases/support.ts`, replace:**
```ts
import { allSentences } from '@robywire/gate';
import type { Claim, GateInput, Sentence } from '@robywire/gate';

```

**with:**
```ts
import { allSentences, buildLimitations, citedClaims } from '@robywire/gate';
import type { Claim, GateInput, Sentence } from '@robywire/gate';

```

**In `evals/src/cases/support.ts`, replace:**
```ts
  return found.sentence;
}
```

**with:**
```ts
  return found.sentence;
}

/**
 * Make claim `id` one that only `outlet` reports: a tier-2 source with the basis `reported`. A reported claim
 * needs a limitation sentence, so the limitations are written again from the claims the piece cites. Call it
 * after every sentence that should cite the claim does.
 */
export function reportedBy(input: GateInput, id: string, outlet: string): void {
  const claim = claimOf(input, id);
  claim.source.tier = 2;
  claim.source.outlet = outlet;
  claim.basis = 'reported';
  input.draft.limitations = buildLimitations(citedClaims(input.draft, input.claims));
}

/** Write the sentence that contains `fragment` as an attribution to `outlet`: the new text, marked attributed. */
export function attributeTo(input: GateInput, fragment: string, text: string): void {
  const sentence = sentenceWith(input, fragment);
  sentence.text = text;
  if (sentence.kind === 'fact') sentence.attributed = true;
}
```

**In `evals/src/cases/spec.ts`, replace:**
```ts
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

/**
```

**with:**
```ts
import type { SeededCase } from '../seeded';
import { claimOf, reportedBy, sentenceWith } from './support';

/**
```

**In `evals/src/cases/spec.ts`, replace:**
```ts
    description: 'A claim that comes only from another outlet is stated as plain fact, with no attribution.',
    apply: (base) => {
      const { source } = claimOf(base, 'c-18');
      source.tier = 2;
      source.outlet = 'Mercer Wire';
      return base;
    },
```

**with:**
```ts
    description: 'A claim that comes only from another outlet is stated as plain fact, with no attribution.',
    apply: (base) => {
      reportedBy(base, 'c-18', 'Mercer Wire');
      return base;
    },
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
import type { Sentence } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

const OUTLET = 'Mercer Wire';
```

**with:**
```ts
import { buildLimitations, citedClaims } from '@robywire/gate';
import type { Sentence } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { attributeTo, claimOf, reportedBy, sentenceWith } from './support';

const OUTLET = 'Mercer Wire';
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
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
```

**with:**
```ts
    description: 'A sentence is marked attributed to a tier-2 outlet but never says which outlet.',
    apply: (base) => {
      attributeTo(base, 'It lists 7 investors', 'The filing lists 7 investors, according to reports.');
      reportedBy(base, 'c-19', OUTLET);
      return base;
    },
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
      const copy = structuredClone(claimOf(base, 'c-12'));
      copy.id = 'c-29';
      copy.source.tier = 2;
      copy.source.outlet = OUTLET;
      base.claims.push(copy);
      sentenceWith(base, 'The measured rate sits below').claimIds.push('c-29');
      return base;
    },
```

**with:**
```ts
      const copy = structuredClone(claimOf(base, 'c-12'));
      copy.id = 'c-29';
      base.claims.push(copy);
      sentenceWith(base, 'The measured rate sits below').claimIds.push('c-29');
      reportedBy(base, 'c-29', OUTLET);
      return base;
    },
  },
  {
    id: 'tier2-claim-wrong-basis',
    check: 'G6',
    code: 'G6_TIER2_BASIS',
    description: 'A claim that rests only on another outlet is given the basis of a primary source, a filing.',
    apply: (base) => {
      const { source } = claimOf(base, 'c-19');
      source.tier = 2;
      source.outlet = OUTLET;
      attributeTo(base, 'It lists 7 investors', `${OUTLET} reports that 7 investors took part in the round.`);
      return base;
    },
  },
  {
    id: 'primary-claim-called-reported',
    check: 'G6',
    code: 'G6_TIER1_REPORTED',
    description: 'A claim from a primary source is given the basis reported, which is for what another outlet reports.',
    apply: (base) => {
      claimOf(base, 'c-19').basis = 'reported';
      base.draft.limitations = buildLimitations(citedClaims(base.draft, base.claims));
      return base;
    },
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
```

**with:**
```ts
import { renderLimitation } from '@robywire/gate';
import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { attributeTo, claimOf, reportedBy, sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
    },
  },
  {
    id: 'limitation-edited-text',
```

**with:**
```ts
    },
  },
  {
    id: 'limitation-two-outlets',
    check: 'G8',
    code: 'G8_LIMITATION_GROUP',
    description: 'One limitation sentence covers claims that two different outlets reported.',
    apply: (base) => {
      attributeTo(base, 'It lists 7 investors', 'Mercer Wire reports that 7 investors took part in the round.');
      attributeTo(base, 'went live on 18 August 2026', 'Tarn Daily reports that the installation at Ashvale went live on 18 August 2026.');
      reportedBy(base, 'c-19', 'Mercer Wire');
      reportedBy(base, 'c-24', 'Tarn Daily');
      const [one, two] = base.draft.limitations.filter((sentence) => sentence.text.includes('is reported by'));
      one!.claimIds = ['c-19', 'c-24'];
      one!.text = renderLimitation([claimOf(base, 'c-19'), claimOf(base, 'c-24')], 'basis');
      base.draft.limitations.splice(base.draft.limitations.indexOf(two!), 1);
      return base;
    },
  },
  {
    id: 'limitation-edited-text',
```

- [ ] **Step 12: Regenerate the scoreboard and run the evals tests**

Run: `npm run evals:seeded`
Expected: PASS — `every seeded defect was caught` and `tier2-claim-wrong-basis` and `primary-claim-called-reported` and `limitation-two-outlets`

Run: `npm test --workspace @robywire/evals`
Expected: PASS

- [ ] **Step 13: Write the failing tests for the site**

The tests say what the fact card draws for the new basis, what the method page says in G6, G2 and G8, and what the fifth fixture piece now holds. The G6 sentence of the method page stays one sentence, because a test requires one full stop at the end of each rule and none inside.

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('says them as the card shows them: datasheet, press release, briefing, demonstration, filing, paper, standard, measured', () => {
    expect(BASIS_WORDS).toEqual({
      datasheet: 'datasheet',
```

**with:**
```ts
  });

  it('says them as the card shows them: datasheet, press release, briefing, demonstration, filing, paper, standard, measured, another outlet', () => {
    expect(BASIS_WORDS).toEqual({
      datasheet: 'datasheet',
```

**In `site/test/card.test.ts`, replace:**
```ts
      standard: 'standard',
      measured: 'measured',
    });
  });
```

**with:**
```ts
      standard: 'standard',
      measured: 'measured',
      reported: 'another outlet',
    });
  });
```

**In `site/test/method.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, CHECK_IDS, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, BASES, CHECK_IDS, SAFE_BASES, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**In `site/test/method.test.ts`, replace:**
```ts
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
```

**with:**
```ts
  });

  it('says in G6 that a claim from another outlet has the basis "reported" and a primary one never does, and the gate agrees', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('has the basis "reported" (no claim from a primary source has it)');
    expect(BASES).toContain('reported');
    expect(SAFE_BASES).not.toContain('reported');
  });

  it('says in G2 and G8 that what another outlet reported is covered by a limitation sentence that names the outlet', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('briefing or demo, that only another outlet reported, or that was only demonstrated');
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('(and, for claims that another outlet reported, that outlet)');
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';

// The fixture pieces are what the site shows when it is built with
```

**with:**
```ts
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';
import { receiptsView } from '../src/lib/receipts';

// The fixture pieces are what the site shows when it is built with
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
  });

  it('is the only piece with the label: the four others rest on first-hand sources only', () => {
    for (const slug of SLUGS.slice(0, 4)) expect(text(`news/${slug}.mdx`), slug).not.toContain('Unconfirmed');
```

**with:**
```ts
  });

  it('gives the claim the basis reported, and no tier-1 claim of the piece has it', () => {
    expect(ledger.claims.filter((claim) => claim.basis === 'reported').map((claim) => claim.id)).toEqual(['c-19']);
    expect(ledger.claims.filter((claim) => claim.source.tier === 1).every((claim) => claim.basis !== 'reported')).toBe(true);
  });

  it('covers it with a limitation sentence that names the outlet, and its receipt says reported, not filing', () => {
    const sentence = ledger.sentences.find((item) => item.section === 'limitations' && item.claimIds.includes('c-19'));
    expect(sentence?.text).toBe('The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.');
    expect(sentence?.claimIds).toEqual(['c-19']);
    const receipt = receiptsView(ledger).claims.find((claim) => claim.id === 'c-19');
    expect(receipt?.basis).toBe('reported');
    expect(receipt?.basis).not.toBe('filing');
  });

  it('is the only piece with the label: the four others rest on first-hand sources only', () => {
    for (const slug of SLUGS.slice(0, 4)) expect(text(`news/${slug}.mdx`), slug).not.toContain('Unconfirmed');
```

Run: `npm test --workspace @robywire/site -- test/card.test.ts test/method.test.ts test/check-fixtures.test.ts`
Expected: FAIL — `has a plain word or two for each basis a claim can have, and no other key` and `says in G6 that a claim from another outlet has the basis "reported"` and `is ok for the fixtures that are really committed in the repository`

- [ ] **Step 14: Write the words, then regenerate the fixtures**

The labels are short phrases, as every label is, and `G8_LIMITATION_GROUP` now says that outlets are grouped too.

**In `site/src/lib/card.ts`, replace:**
```ts
  standard: 'standard',
  measured: 'measured',
};

```

**with:**
```ts
  standard: 'standard',
  measured: 'measured',
  reported: 'another outlet',
};

```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
  G6_TIER2_IN_ANALYSIS: 'Analysis rested on another outlet',
  G7_ANALYSIS_PLACEMENT: 'Analysis stood where only facts are allowed',
  G7_ANALYSIS_SHARE: 'Too much of the piece was analysis',
```

**with:**
```ts
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
  G6_TIER2_IN_ANALYSIS: 'Analysis rested on another outlet',
  G6_TIER2_BASIS: 'A claim from another outlet was labelled as a primary source',
  G6_TIER1_REPORTED: 'A claim from a primary source was labelled as reported',
  G7_ANALYSIS_PLACEMENT: 'Analysis stood where only facts are allowed',
  G7_ANALYSIS_SHARE: 'Too much of the piece was analysis',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation cited no claim, an unknown claim or claims out of order',
  G8_LIMITATION_GROUP: 'A limitation grouped claims with different bases or statuses',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
```

**with:**
```ts
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation cited no claim, an unknown claim or claims out of order',
  G8_LIMITATION_GROUP: 'A limitation grouped claims with different bases, statuses or outlets',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
```

**with:**
```ts
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, that only another outlet reported, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed.", and a piece that uses one is held for the owner instead of being published.',
    },
    {
```

**with:**
```ts
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet has the basis "reported" (no claim from a primary source has it) and may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed.", and a piece that uses one is held for the owner instead of being published.',
    },
    {
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
```

**with:**
```ts
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status (and, for claims that another outlet reported, that outlet) through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
        Every factual sentence is built from claims. A claim is one atomic statement, such as a number with its unit, a date or a name. It carries the exact passage of the source it rests on (at most
        300 characters, word for word), the address of the source, a hash of the source as it was fetched, and the time it was fetched. It also records the basis of the figure, such as a datasheet, a
        press release, a filing, a paper, a measurement or a demonstration, and its status: demonstrated, deployed, planned or unspecified.
      </p>
      <p>
```

**with:**
```astro
        Every factual sentence is built from claims. A claim is one atomic statement, such as a number with its unit, a date or a name. It carries the exact passage of the source it rests on (at most
        300 characters, word for word), the address of the source, a hash of the source as it was fetched, and the time it was fetched. It also records the basis of the figure, such as a datasheet, a
        press release, a filing, a paper, a measurement or a demonstration, or, for a claim that only another outlet reports, "reported", and its status: demonstrated, deployed, planned or unspecified.
      </p>
      <p>
```

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 11 fixture files`

Only the fifth piece changes: its claim c-19 has the basis `reported`, and its limitations gain the sentence that names Mercer Wire.

Run: `git status --short -- site/src/content-fixtures`
Expected: PASS — `fixture-robotics-ships-fx-5-to-second-plant.json` and `fixture-robotics-ships-fx-5-to-second-plant.mdx`

- [ ] **Step 15: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 16: Commit**

```bash
git add evals/scoreboard/seeded.json evals/src/cases/limitations-hygiene.ts evals/src/cases/sourcing-analysis.ts evals/src/cases/spec.ts evals/src/cases/support.ts gate/src/checks/g6-sourcing.ts gate/src/checks/g8-limitations.ts gate/src/constants.ts gate/src/fixtures/tier2.ts gate/src/limitations.ts gate/test/constants.test.ts gate/test/g2-structure.test.ts gate/test/g6-sourcing.test.ts gate/test/g8-limitations.test.ts gate/test/golden-gate.test.ts gate/test/limitations.test.ts gate/test/tier2-variant.test.ts evals/test/seeded.test.ts evals/test/support.test.ts site/src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json site/src/content-fixtures/news/fixture-robotics-ships-fx-5-to-second-plant.mdx site/src/lib/card.ts site/src/lib/method.ts site/src/lib/reasons.ts site/src/pages/method/index.astro site/test/card.test.ts site/test/fixtures.test.ts site/test/method.test.ts
git commit -m "feat(gate): the basis reported for claims that come only from another outlet: a limitation sentence that names the outlet, two G6 codes that tie the basis to the tier, and a G8 rule that one sentence names one outlet" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Limitation groups capped at four claims, and claims with no number named by their label

**Files:**
- Modify: `gate/src/limitations.ts` (`LIMITATION_MAX_CLAIMS`, groups cut into sentences of at most four claims, the figure of a claim is its first number only)
- Modify: `gate/src/checks/g8-limitations.ts` (new code `G8_LIMITATION_GROUP_SIZE`)
- Modify: `evals/src/cases/support.ts`, `evals/src/cases/frontmatter-structure.ts`, `evals/src/cases/limitations-hygiene.ts` (one new seeded defect, and a helper that finds a limitation sentence by the claim it cites), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `site/src/lib/reasons.ts`, `site/src/lib/method.ts` (the label of the new code, and what the `/method` page says about G8)
- Modify: `site/src/content-fixtures/ledger/*.json` and `site/src/content-fixtures/news/*.mdx` (all five pieces, regenerated)
- Test: `gate/test/limitations.test.ts`, `gate/test/g8-limitations.test.ts`, `gate/test/g2-structure.test.ts`, `gate/test/g7-analysis.test.ts`, `gate/test/golden-draft.test.ts`, `evals/test/support.test.ts`, `evals/test/seeded.test.ts`, `site/test/method.test.ts`, `site/test/fixtures.test.ts`

Plan 1 wrote one "What we couldn't verify" sentence for each group of claims that share a basis, however many claims the group had. The golden piece shows what that does: its twelve press-release claims are one sentence of sixty-two words that begins "The Fixture Robotics Tarnmoor shipment, 1 October 2026 announcement date, FX-1 retrofit mounting" and goes on in the same way for nine more claims, listing claims by a name or a date as though they were figures. A pipeline that cites thirty claims would write a sentence nobody reads. This task resolves Plan 1's entry-checklist item 9 with two rules:

1. **A sentence covers at most four claims.** A group of claims that share a basis (for `reported`, a basis and an outlet) or a status is cut by position, in ascending order of claim number, into consecutive sentences of at most four claims each; the last one holds what is left (nine claims make 4, 4 and 1). Each sentence cites its own claims once, in ascending order, and the wording of a sentence of one to four claims does not change. The cap is the constant `LIMITATION_MAX_CLAIMS`. G8 gets a new code, `G8_LIMITATION_GROUP_SIZE`, for a sentence that cites more than four claims; it is checked after the list of claim ids is known to be usable and before the group and the text, a sentence over the cap is reported for its size alone, and G8 still requires the exact text of every sentence of four claims or fewer. `buildLimitations` writes what G8 accepts for any claims it is given.
2. **The figure of a claim is its first `number` value.** A claim with no number value is described by its label alone: a date or a name is not a figure ("The lead investor figure comes from a regulatory filing", no longer "The Corvane Partners lead investor figure comes from a regulatory filing"). This changes every template that mentions a figure, the singular `{v}` and the plural `{items}`; the templates that name no figure (the demonstration, the standard and the status sentences) already said the label alone.

The golden piece's limitation section was already written by `buildLimitations`, so it needs no edit: it now has nine sentences instead of five (the body grows from 665 to 685 words, inside the 640 to 720 that its tests require), and the five fixture pieces that are generated from it follow. The tests that counted or located something in the golden piece's limitations are edited; each edit is shown.

- [ ] **Step 1: Write the failing tests for the figure and the cap**

Four tests change because a claim that lists only a name no longer shows the name. The new blocks cover every template with a claim that has a name and a date and no number, the cap itself, the cutting (sizes, order by number, each group on its own, outlets, statuses), and that the text of every cut sentence is the text of its own claims.

**In `gate/test/limitations.test.ts`, replace:**
```ts
  BASIS_TEMPLATES,
  BASIS_TEMPLATES_PLURAL,
  STATUS_TEMPLATES,
  STATUS_TEMPLATES_PLURAL,
```

**with:**
```ts
  BASIS_TEMPLATES,
  BASIS_TEMPLATES_PLURAL,
  LIMITATION_MAX_CLAIMS,
  STATUS_TEMPLATES,
  STATUS_TEMPLATES_PLURAL,
```

**In `gate/test/limitations.test.ts`, replace:**
```ts
  it('joins three claims as "A, B and C", with no comma before the "and"', () => {
    expect(renderLimitation([claim({}), REACH, RATING], 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });
```

**with:**
```ts
  it('joins three claims as "A, B and C", with no comma before the "and"', () => {
    expect(renderLimitation([claim({}), REACH, RATING], 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach and ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });
```

**In `gate/test/limitations.test.ts`, replace:**
```ts
    const four = [claim({}), REACH, RATING, claim({ id: 'c-4', label: 'mass', values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }] })];
    expect(renderLimitation(four, 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach, IP54 ingress protection and 38 kg mass figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('writes the figure of each claim by the same rule as for one claim: the first number, else the first value, else nothing', () => {
    const none = claim({ id: 'c-4', label: 'finish', values: [] });
    expect(renderLimitation([none, RATING], 'basis')).toBe(
      "The finish and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });
```

**with:**
```ts
    const four = [claim({}), REACH, RATING, claim({ id: 'c-4', label: 'mass', values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }] })];
    expect(renderLimitation(four, 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach, ingress protection and 38 kg mass figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('writes the figure of each claim by the same rule as for one claim: the first number, else nothing', () => {
    const none = claim({ id: 'c-4', label: 'finish', values: [] });
    expect(renderLimitation([none, RATING], 'basis')).toBe(
      "The finish and ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });
```

**In `gate/test/limitations.test.ts`, replace:**
```ts
  });

  it('falls back to the first value when none is a number', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation([named], 'basis')).toBe('The Corvane Partners lead investor figure comes from a regulatory filing.');
  });

```

**with:**
```ts
  });

  it('names a claim with no number value by its label alone, whatever name or date it lists', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation([named], 'basis')).toBe('The lead investor figure comes from a regulatory filing.');
    const dated = claim({ label: 'announcement date', basis: 'filing', values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-01' }] });
    expect(renderLimitation([dated], 'basis')).toBe('The announcement date figure comes from a regulatory filing.');
    expect(renderLimitation([named, dated], 'basis')).toBe('The lead investor and announcement date figures come from a regulatory filing.');
  });

```

**In `gate/test/limitations.test.ts`, replace:**
```ts

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'name', raw: '{label}', normalised: 'x' }] });
    expect(renderLimitation([odd], 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
```

**with:**
```ts

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'number', raw: '{label}', normalised: '1' }] });
    expect(renderLimitation([odd], 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
```

**In `gate/test/limitations.test.ts`, replace:**
```ts
    ]);
  });
});
```

**with:**
```ts
    ]);
  });
});

describe('a claim with no number value, in every template', () => {
  // A claim that lists a name and a date and no number. Whatever template the sentence uses, it says the label and neither value.
  const WITHOUT_NUMBER: Partial<Claim> = {
    label: 'lead investor',
    values: [
      { kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' },
      { kind: 'date', raw: '29 September 2026', normalised: '2026-09-29' },
    ],
  };
  const other = { ...WITHOUT_NUMBER, id: 'c-2', label: 'closing' };

  it.each(BASES.filter((basis) => basis !== 'reported'))('writes the label and no value in the singular and the plural %s sentence', (basis) => {
    const one = renderLimitation([claim({ ...WITHOUT_NUMBER, basis })], 'basis');
    const two = renderLimitation([claim({ ...WITHOUT_NUMBER, basis }), claim({ ...other, basis })], 'basis');
    for (const text of [one, two]) {
      expect(text).toContain('lead investor');
      expect(text).not.toContain('Corvane');
      expect(text).not.toContain('2026');
    }
    expect(two).toContain('closing');
  });

  it.each(STATUSES)('writes the label and no value in the singular and the plural %s sentence', (status) => {
    const one = renderLimitation([claim({ ...WITHOUT_NUMBER, status })], 'status');
    const two = renderLimitation([claim({ ...WITHOUT_NUMBER, status }), claim({ ...other, status })], 'status');
    for (const text of [one, two]) {
      expect(text).toContain('lead investor');
      expect(text).not.toContain('Corvane');
      expect(text).not.toContain('2026');
    }
  });

  it('writes the reported sentence the same way, with the outlet', () => {
    const source = { ...BASE_CLAIM.source, tier: 2 as const, outlet: 'Mercer Wire' };
    expect(renderLimitation([claim({ ...WITHOUT_NUMBER, basis: 'reported', source })], 'basis')).toBe(
      'The lead investor figure is reported by Mercer Wire and was not checked against a primary source.',
    );
  });

  it('keeps the number of a claim that has one, next to one that has none', () => {
    expect(renderLimitation([claim({}), claim({ ...WITHOUT_NUMBER, id: 'c-2' })], 'basis')).toBe(
      "The 12 kg payload and lead investor figures come from the company's datasheet; no independent measurement was available.",
    );
  });
});

describe('the cap on the claims of one sentence', () => {
  const c = (n: number, basis: Basis = 'datasheet', status: Status = 'unspecified'): Claim => claim({ id: `c-${n}`, basis, status, label: `item ${n}` });
  const ids = (groups: ReturnType<typeof limitationGroups>) => groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)]);

  it('is four claims', () => {
    expect(LIMITATION_MAX_CLAIMS).toBe(4);
  });

  it.each([
    [1, [1]],
    [4, [4]],
    [5, [4, 1]],
    [8, [4, 4]],
    [9, [4, 4, 1]],
  ])('cuts a group of %d claims into sentences of %j claims', (count, sizes) => {
    const claims = Array.from({ length: count }, (_unused, at) => c(at + 1));
    const groups = limitationGroups(claims);
    expect(groups.map((group) => group.claims.length)).toEqual(sizes);
    expect(buildLimitations(claims).map((sentence) => sentence.claimIds.length)).toEqual(sizes);
  });

  it('cuts by position in the order of the claim numbers, so c-10 comes after c-9 and the last sentence holds what is left', () => {
    const groups = limitationGroups([c(12), c(1), c(10), c(2), c(11), c(3)].reverse());
    expect(ids(groups)).toEqual([
      ['basis', 'datasheet', ['c-1', 'c-2', 'c-3', 'c-10']],
      ['basis', 'datasheet', ['c-11', 'c-12']],
    ]);
  });

  it('cuts each group on its own: a basis group, a reported group of one outlet and a status group', () => {
    const source = { ...BASE_CLAIM.source, tier: 2 as const, outlet: 'Mercer Wire' };
    const reportedClaims = [21, 22, 23, 24, 25].map((n) => claim({ id: `c-${n}`, basis: 'reported', source, label: `item ${n}` }));
    const planned = [1, 2, 3, 4, 5].map((n) => c(n, 'datasheet', 'planned'));
    const groups = limitationGroups([...planned, ...reportedClaims]);
    expect(ids(groups)).toEqual([
      ['basis', 'datasheet', ['c-1', 'c-2', 'c-3', 'c-4']],
      ['basis', 'datasheet', ['c-5']],
      ['basis', 'reported', ['c-21', 'c-22', 'c-23', 'c-24']],
      ['basis', 'reported', ['c-25']],
      ['status', 'planned', ['c-1', 'c-2', 'c-3', 'c-4']],
      ['status', 'planned', ['c-5']],
    ]);
  });

  it('writes every cut sentence from its own claims: the wording for one claim, or for two to four, is unchanged', () => {
    const claims = [1, 2, 3, 4, 5].map((n) => c(n));
    const [first, second] = buildLimitations(claims);
    expect(first!.text).toBe(renderLimitation(claims.slice(0, 4), 'basis'));
    expect(first!.text).toBe(
      "The 12 kg item 1, 12 kg item 2, 12 kg item 3 and 12 kg item 4 figures come from the company's datasheet; no independent measurement was available.",
    );
    expect(second!.text).toBe("The 12 kg item 5 figure comes from the company's datasheet; no independent measurement was available.");
    expect(second!.claimIds).toEqual(['c-5']);
  });

  it('cites each claim of a cut group once, in ascending order, across all of its sentences', () => {
    const claims = Array.from({ length: 11 }, (_unused, at) => c(at + 1));
    const cited = buildLimitations(claims).flatMap((sentence) => sentence.claimIds);
    expect(cited).toEqual(claims.map((item) => item.id));
  });
});
```

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts`
Expected: FAIL — `names a claim with no number value by its label alone, whatever name or date it lists` and `cuts a group of 5 claims into sentences of [4,1] claims`

- [ ] **Step 2: Write the cap and the figure rule**

**In `gate/src/limitations.ts`, replace:**
```ts
// The templates of the basis `reported` also name the outlet (`{outlet}`), the
// outlet of the claims themselves, which is why a group of reported claims is
// never larger than the claims of one outlet.

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
```

**with:**
```ts
// The templates of the basis `reported` also name the outlet (`{outlet}`), the
// outlet of the claims themselves, which is why a group of reported claims is
// never larger than the claims of one outlet. A sentence covers at most
// LIMITATION_MAX_CLAIMS claims; a larger group is written as several sentences.

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
```

**In `gate/src/limitations.ts`, replace:**
```ts
export const outletOf = (claim: Claim): string => claim.source.outlet?.trim() ?? '';

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
```

**with:**
```ts
export const outletOf = (claim: Claim): string => claim.source.outlet?.trim() ?? '';

/** The most claims that one limitation sentence may cover. A larger group is split into consecutive sentences. */
export const LIMITATION_MAX_CLAIMS = 4;

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
```

**In `gate/src/limitations.ts`, replace:**
```ts

/**
 * The claim's figure as it is written in the source, followed by a space: the
 * first number value, else the first value of any kind, else nothing.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
  return value === undefined ? '' : `${value.raw} `;
}
```

**with:**
```ts

/**
 * The claim's figure as it is written in the source, followed by a space: its
 * first number value, else nothing. A claim with no number value is described
 * by its label alone: a date or a name is not a figure.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number');
  return value === undefined ? '' : `${value.raw} `;
}
```

**In `gate/src/limitations.ts`, replace:**
```ts
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once. */
  claims: Claim[];
}
```

**with:**
```ts
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once, at most LIMITATION_MAX_CLAIMS. */
  claims: Claim[];
}
```

**In `gate/src/limitations.ts`, replace:**
```ts
 * claim number first. Those that are demonstrated or planned are grouped by
 * status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
```

**with:**
```ts
 * claim number first. Those that are demonstrated or planned are grouped by
 * status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number, and
 * a group of more than LIMITATION_MAX_CLAIMS claims is cut by position into
 * consecutive groups of that size, the last one holding what is left.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  const add = (template: LimitationGroup['template'], key: LimitationGroup['key'], claims: readonly Claim[]) => {
    for (let at = 0; at < claims.length; at += LIMITATION_MAX_CLAIMS) {
      groups.push({ template, key, claims: claims.slice(at, at + LIMITATION_MAX_CLAIMS) });
    }
  };
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
```

**In `gate/src/limitations.ts`, replace:**
```ts
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) {
      const group = outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet);
      if (group.length > 0) groups.push({ template: 'basis', key: basis, claims: group });
    }
  }
  for (const status of STATUSES_WITH_SENTENCE) {
    const claims = unique.filter((claim) => claim.status === status);
    if (claims.length > 0) groups.push({ template: 'status', key: status, claims });
  }
  return groups;
}
```

**with:**
```ts
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) {
      add('basis', basis, outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet));
    }
  }
  for (const status of STATUSES_WITH_SENTENCE) add('status', status, unique.filter((claim) => claim.status === status));
  return groups;
}
```

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts`
Expected: PASS

- [ ] **Step 3: See which tests counted the golden piece's limitations**

The golden piece now has nine limitation sentences, so the tests that said "five", or that knew which sentence covers which claim, fail. Nothing else does.

Run: `npm test --workspace @robywire/gate`
Expected: FAIL — `fails each claim that a missing basis sentence leaves out, and says which and why` and `passes up to the cap and fails just over it, and says the numbers` and `has the sentences buildLimitations writes for the claims the rest of the piece cites: three to six of them`

- [ ] **Step 4: Edit the tests of G2, G7 and the golden piece**

G2 knew that sentence 1 covered eight datasheet claims and sentence 5 the five planned ones, and that the piece had 42 sentences; G7 measured its share of analysis against 40 body sentences, and now there are 44; the golden piece's own test allowed three to six limitation sentences and now allows up to ten.

**In `gate/test/g2-structure.test.ts`, replace:**
```ts

describe('G2_LIMITATION_COVERAGE', () => {
  const droppingSentence = (at: number) => (g: GateInput) => {
    g.draft.limitations.splice(at, 1);
  };

  it('passes the golden piece, whose five sentences cover every claim that needs one', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails each claim that a missing basis sentence leaves out, and says which and why', () => {
    // Sentence 1 covers the eight datasheet claims, c-8 to c-15. Setting the body length keeps G2_BODY_LENGTH out of the way.
    const out = resultAfter((g) => {
      droppingSentence(0)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures).toHaveLength(8);
    expect(out.failures[0]).toEqual({
      check: 'G2',
```

**with:**
```ts

describe('G2_LIMITATION_COVERAGE', () => {
  const droppingSentence = (at: number, count = 1) => (g: GateInput) => {
    g.draft.limitations.splice(at, count);
  };

  it('passes the golden piece, whose nine sentences cover every claim that needs one', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails each claim that a missing basis sentence leaves out, and says which and why', () => {
    // Sentence 1 covers the first four datasheet claims, c-8 to c-11. Setting the body length keeps G2_BODY_LENGTH out of the way.
    const out = resultAfter((g) => {
      droppingSentence(0)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures).toHaveLength(4);
    expect(out.failures[0]).toEqual({
      check: 'G2',
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
      where: 'c-8',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15']);
    expect(new Set(out.failures.map((failure) => failure.code))).toEqual(new Set(['G2_LIMITATION_COVERAGE']));
  });

  it('fails each claim that a missing status sentence leaves out, and says which and why', () => {
    // Sentence 5 covers the five planned claims.
    const out = resultAfter((g) => {
      droppingSentence(4)(g);
      setBodyWords(g, 665);
    });
```

**with:**
```ts
      where: 'c-8',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-8', 'c-9', 'c-10', 'c-11']);
    expect(new Set(out.failures.map((failure) => failure.code))).toEqual(new Set(['G2_LIMITATION_COVERAGE']));
  });

  it('fails each claim that a missing status sentence leaves out, and says which and why', () => {
    // Sentences 8 and 9 cover the five planned claims.
    const out = resultAfter((g) => {
      droppingSentence(7, 2)(g);
      setBodyWords(g, 665);
    });
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  it('fails a claim that is left out of a sentence which is otherwise there', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[0]!.claimIds = g.draft.limitations[0]!.claimIds.filter((id) => id !== 'c-12');
      setBodyWords(g, 665);
    });
```

**with:**
```ts
  it('fails a claim that is left out of a sentence which is otherwise there', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[1]!.claimIds = g.draft.limitations[1]!.claimIds.filter((id) => id !== 'c-12');
      setBodyWords(g, 665);
    });
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts

  it('does not count a sentence of the other template as covering a claim', () => {
    // c-27 and c-28 are covered by sentence 3 (basis) and sentence 4 (status). Make both of them 'basis' sentences.
    const out = resultAfter((g) => {
      g.draft.limitations[3]!.template = 'basis';
      setBodyWords(g, 665);
    });
```

**with:**
```ts

  it('does not count a sentence of the other template as covering a claim', () => {
    // c-27 and c-28 are covered by sentence 6 (basis) and sentence 7 (status). Make both of them 'basis' sentences.
    const out = resultAfter((g) => {
      g.draft.limitations[6]!.template = 'basis';
      setBodyWords(g, 665);
    });
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts

  it('passes every sentence of the golden piece, the title, the description, the opening, the takeaways, the body and the limitations', () => {
    expect(allSentences(golden.draft)).toHaveLength(42);
    expect(codesAfter(() => {})).toEqual([]);
  });
```

**with:**
```ts

  it('passes every sentence of the golden piece, the title, the description, the opening, the takeaways, the body and the limitations', () => {
    expect(allSentences(golden.draft)).toHaveLength(46);
    expect(codesAfter(() => {})).toEqual([]);
  });
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
      lowerAt(indexOfFirst('body'))(g);
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['title', `section "${firstHeading}", sentence 1`, 'limitations, sentence 5']);
  });

```

**with:**
```ts
      lowerAt(indexOfFirst('body'))(g);
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['title', `section "${firstHeading}", sentence 1`, 'limitations, sentence 9']);
  });

```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 40 sentences, three of them analysis: opening 3,
  // takeaways 4, sections 28, limitations 5. Six more analysis sentences make
  // 9 of 46 (19.6%); seven more make 10 of 47 (21.3%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 6))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 7)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 10 of the 47 sentences in the body (21.3%); the cap is 20.0%',
        where: 'body',
      },
```

**with:**
```ts

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 44 sentences, three of them analysis: opening 3,
  // takeaways 4, sections 28, limitations 9. Seven more analysis sentences make
  // 10 of 51 (19.6%); eight more make 11 of 52 (21.2%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 7))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 8)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 11 of the 52 sentences in the body (21.2%); the cap is 20.0%',
        where: 'body',
      },
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.07 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.08 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 3 / 40 } })).toEqual({ failures: [], holdReasons: [] });
  });

```

**with:**
```ts
  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.06 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.07 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 3 / 44 } })).toEqual({ failures: [], holdReasons: [] });
  });

```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
    ],
  ])('counts the sentences of %s among the body sentences', (_name, addThree) => {
    // 10 analysis sentences of 47 is over the cap; three more body sentences make it exactly 10 of 50, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 7);
      addThree(g);
    });
```

**with:**
```ts
    ],
  ])('counts the sentences of %s among the body sentences', (_name, addThree) => {
    // 11 analysis sentences of 52 is over the cap; three more body sentences make it exactly 11 of 55, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 8);
      addThree(g);
    });
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 4 of 41 would be over a cap of 3 in 40; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 3 / 40 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });
```

**with:**
```ts

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 4 of 45 would be over a cap of 3 in 44; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 3 / 44 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });
```

**In `gate/test/golden-draft.test.ts`, replace:**
```ts
  });

  it('has the sentences buildLimitations writes for the claims the rest of the piece cites: three to six of them', () => {
    const { limitations, ...rest } = GOLDEN_DRAFT;
    const cited = citedClaims({ ...rest, limitations: [] }, GOLDEN_CLAIMS);
    expect(GOLDEN_DRAFT.limitations).toEqual(buildLimitations(cited));
    expect(limitations.length).toBeGreaterThanOrEqual(3);
    expect(limitations.length).toBeLessThanOrEqual(6);
  });

```

**with:**
```ts
  });

  it('has the sentences buildLimitations writes for the claims the rest of the piece cites: three to ten of them', () => {
    const { limitations, ...rest } = GOLDEN_DRAFT;
    const cited = citedClaims({ ...rest, limitations: [] }, GOLDEN_CLAIMS);
    expect(GOLDEN_DRAFT.limitations).toEqual(buildLimitations(cited));
    expect(limitations.length).toBeGreaterThanOrEqual(3);
    expect(limitations.length).toBeLessThanOrEqual(10);
  });

```

Run: `npm test --workspace @robywire/gate -- test/g2-structure.test.ts test/g7-analysis.test.ts test/golden-draft.test.ts test/limitations.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for G8_LIMITATION_GROUP_SIZE**

The G8 tests know the golden piece's sentences by position, so their comment, their constants and a few messages and indexes change with it. The new block checks the message, that four claims pass, that a status sentence is counted too, that a sentence over the cap is reported for its size alone, that an unusable list of claims is still G8_LIMITATION_CLAIMS, and that G8 accepts whatever `buildLimitations` writes for claims of one basis, one status or two outlets, however many.

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { renderLimitation } from '../src/limitations';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';
```

**with:**
```ts
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { buildLimitations, renderLimitation } from '../src/limitations';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

// The golden piece has five limitation sentences, one for each group of claims:
//   1  basis    datasheet      c-8 to c-15, eight claims
//   2  basis    press-release  c-1 to c-7 and c-22 to c-26, twelve claims
//   3  basis    demo           c-27 and c-28
//   4  status   demonstrated   c-27 and c-28
//   5  status   planned        c-5, c-6, c-7, c-25 and c-26
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT =
  "The 12 kilograms payload, 1.4 metres reach, 2.3 metres per second top speed, 0.05 mm repeatability, 1.2k pick rate, 38 kg arm mass, 650 W power draw and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';
const FIRST_IDS = ['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15'];

/** Point a limitation sentence at these claim ids. */
```

**with:**
```ts
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

// The golden piece has nine limitation sentences, one for each group of at most four claims:
//   1  basis    datasheet      c-8 to c-11
//   2  basis    datasheet      c-12 to c-15
//   3  basis    press-release  c-1 to c-4
//   4  basis    press-release  c-5, c-6, c-7 and c-22
//   5  basis    press-release  c-23 to c-26
//   6  basis    demo           c-27 and c-28
//   7  status   demonstrated   c-27 and c-28
//   8  status   planned        c-5, c-6, c-7 and c-25
//   9  status   planned        c-26
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT =
  "The 12 kilograms payload, 1.4 metres reach, 2.3 metres per second top speed and 0.05 mm repeatability figures come from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';
const FIRST_IDS = ['c-8', 'c-9', 'c-10', 'c-11'];

/** Point a limitation sentence at these claim ids. */
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
  });

  it('has five limitation sentences, one for each group of claims, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations).toHaveLength(5);
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(limitations[0]?.claimIds).toEqual(FIRST_IDS);
    expect(limitations.map((sentence) => [sentence.template, sentence.claimIds.length])).toEqual([
      ['basis', 8],
      ['basis', 12],
      ['basis', 2],
      ['status', 2],
      ['status', 5],
    ]);
  });
```

**with:**
```ts
  });

  it('has nine limitation sentences, one for each group of at most four claims, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations).toHaveLength(9);
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(limitations[0]?.claimIds).toEqual(FIRST_IDS);
    expect(limitations.map((sentence) => [sentence.template, sentence.claimIds.length])).toEqual([
      ['basis', 4],
      ['basis', 4],
      ['basis', 4],
      ['basis', 4],
      ['basis', 4],
      ['basis', 2],
      ['status', 2],
      ['status', 4],
      ['status', 1],
    ]);
  });
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
});

describe('G8_LIMITATION_GROUP', () => {
  it('fails a basis sentence whose claims do not share one basis, and says which', () => {
```

**with:**
```ts
});

describe('G8_LIMITATION_GROUP_SIZE', () => {
  const SIZE_MESSAGE = (count: number, at: string) =>
    `the limitation sentence at ${at} cites ${count} claims, and a limitation sentence covers at most 4: write one sentence for each 4 claims, in ascending order of claim number`;

  /** Make the first sentence cite `ids`, with the text the template renders for them, so that only its size is wrong. */
  const citingExactly = (g: GateInput, ids: string[]) => {
    cites(first(g), ids);
    first(g).text = renderLimitation(ids.map((id) => claimById(g.claims, id)), 'basis');
  };

  it('fails a sentence that cites more than four claims, even when its text is exactly what the template renders, and says how many', () => {
    const output = run((g) => citingExactly(g, ['c-8', 'c-9', 'c-10', 'c-11', 'c-12']));
    expect(output.failures).toEqual([{ check: 'G8', code: 'G8_LIMITATION_GROUP_SIZE', message: SIZE_MESSAGE(5, FIRST_AT), where: FIRST_AT }]);
  });

  it('accepts a sentence of four claims, the largest the rule allows', () => {
    expect(run((g) => citingExactly(g, ['c-8', 'c-9', 'c-10', 'c-11']))).toEqual({ failures: [], holdReasons: [] });
  });

  it('counts the claims of a status sentence too', () => {
    const output = run((g) => {
      const sentence = g.draft.limitations[7]!;
      cites(sentence, ['c-5', 'c-6', 'c-7', 'c-25', 'c-26']);
      sentence.text = renderLimitation(sentence.claimIds.map((id) => claimById(g.claims, id)), 'status');
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([['G8_LIMITATION_GROUP_SIZE', 'limitations, sentence 8']]);
  });

  it('reports a sentence over the cap for its size alone: not for its group and not for its text', () => {
    const output = run((g) => {
      cites(first(g), ['c-1', 'c-8', 'c-9', 'c-10', 'c-11']);
      first(g).text = 'Anything.';
    });
    expect(codes(output)).toEqual(['G8_LIMITATION_GROUP_SIZE']);
  });

  it('leaves a list of claims that cannot be used to G8_LIMITATION_CLAIMS', () => {
    expect(codes(run((g) => cites(first(g), ['c-8', 'c-9', 'c-10', 'c-11', 'c-999'])))).toEqual(['G8_LIMITATION_CLAIMS']);
    expect(codes(run((g) => cites(first(g), ['c-8', 'c-8', 'c-9', 'c-10', 'c-11'])))).toEqual(['G8_LIMITATION_CLAIMS']);
  });

  it('reports each sentence over the cap', () => {
    const output = run((g) => {
      cites(g.draft.limitations[0]!, ['c-8', 'c-9', 'c-10', 'c-11', 'c-12']);
      cites(g.draft.limitations[1]!, ['c-12', 'c-13', 'c-14', 'c-15', 'c-16']);
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G8_LIMITATION_GROUP_SIZE', 'limitations, sentence 1'],
      ['G8_LIMITATION_GROUP_SIZE', 'limitations, sentence 2'],
    ]);
  });

  // buildLimitations is what the composer stage uses, so whatever claims a piece cites, G8 must accept what it writes.
  it.each([
    ['all the claims of the golden piece with the basis datasheet', (g: GateInput) => g.claims.forEach((claim) => (claim.basis = 'datasheet'))],
    ['all of them planned', (g: GateInput) => g.claims.forEach((claim) => (claim.status = 'planned'))],
    [
      'thirteen claims that two outlets reported',
      (g: GateInput) =>
        g.claims.slice(0, 13).forEach((claim, at) => {
          claim.basis = 'reported';
          claim.source.tier = 2;
          claim.source.outlet = at % 3 === 0 ? 'Tarn Daily' : 'Mercer Wire';
        }),
    ],
  ])('accepts every sentence buildLimitations writes for %s', (_name, change) => {
    const output = run((g) => {
      change(g);
      g.draft.limitations = buildLimitations(g.claims);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_GROUP', () => {
  it('fails a basis sentence whose claims do not share one basis, and says which', () => {
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts

  it('fails a status sentence whose claims do not share one status, and says which', () => {
    const output = run((g) => cites(g.draft.limitations[4]!, ['c-5', 'c-27']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: 'the limitation sentence at limitations, sentence 5 groups claims with different statuses (c-5: planned, c-27: demonstrated): a status sentence covers claims that share one status',
        where: 'limitations, sentence 5',
      },
    ]);
```

**with:**
```ts

  it('fails a status sentence whose claims do not share one status, and says which', () => {
    const output = run((g) => cites(g.draft.limitations[7]!, ['c-5', 'c-27']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: 'the limitation sentence at limitations, sentence 8 groups claims with different statuses (c-5: planned, c-27: demonstrated): a status sentence covers claims that share one status',
        where: 'limitations, sentence 8',
      },
    ]);
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
    return sentence;
  };
  const AT = 'limitations, sentence 6';

  it('accepts a reported sentence whose claims come from one outlet', () => {
```

**with:**
```ts
    return sentence;
  };
  const AT = 'limitations, sentence 10';

  it('accepts a reported sentence whose claims come from one outlet', () => {
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8, c-9, c-10, c-11, c-12, c-13, c-14, c-15; it must read: "${FIRST_TEXT}"`,
        where: FIRST_AT,
      },
```

**with:**
```ts
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8, c-9, c-10, c-11; it must read: "${FIRST_TEXT}"`,
        where: FIRST_AT,
      },
```

**In `gate/test/g8-limitations.test.ts`, replace:**
```ts

  it('fails the right text under the wrong template', () => {
    // The text of sentence 3 (the demo basis) under the status template, over the same two claims.
    const output = run((g) => {
      g.draft.limitations[2]!.template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      'the limitation sentence at limitations, sentence 3 does not match the status template for c-27, c-28; it must read: "The trailer unloading and demo day were demonstrated; the source does not report them in commercial deployment."',
    ]);
  });
```

**with:**
```ts

  it('fails the right text under the wrong template', () => {
    // The text of sentence 6 (the demo basis) under the status template, over the same two claims.
    const output = run((g) => {
      g.draft.limitations[5]!.template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      'the limitation sentence at limitations, sentence 6 does not match the status template for c-27, c-28; it must read: "The trailer unloading and demo day were demonstrated; the source does not report them in commercial deployment."',
    ]);
  });
```

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts`
Expected: FAIL — `fails a sentence that cites more than four claims, even when its text is exactly what the template renders, and says how many`

- [ ] **Step 6: Write the size rule in G8**

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
import type { Check, Failure } from '../gate';
import { claimNumber, joinList, outletOf, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = ['G8_LIMITATION_PLACEMENT', 'G8_LIMITATION_CLAIMS', 'G8_LIMITATION_GROUP', 'G8_LIMITATION_MISMATCH'] as const;

/**
```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { LIMITATION_MAX_CLAIMS, claimNumber, joinList, outletOf, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = [
  'G8_LIMITATION_PLACEMENT',
  'G8_LIMITATION_CLAIMS',
  'G8_LIMITATION_GROUP_SIZE',
  'G8_LIMITATION_GROUP',
  'G8_LIMITATION_MISMATCH',
] as const;

/**
```

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
 * - It cites at least one claim of the piece, each once, in ascending order of
 *   claim number (G8_LIMITATION_CLAIMS).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status; a 'basis' sentence for the basis
```

**with:**
```ts
 * - It cites at least one claim of the piece, each once, in ascending order of
 *   claim number (G8_LIMITATION_CLAIMS).
 * - It cites at most LIMITATION_MAX_CLAIMS claims; a larger group is written as
 *   several sentences (G8_LIMITATION_GROUP_SIZE).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status; a 'basis' sentence for the basis
```

**In `gate/src/checks/g8-limitations.ts`, replace:**
```ts
    }

    const group = ids.map((id) => byId.get(id) as Claim);
    const keyOf = (claim: Claim) => (sentence.template === 'basis' ? claim.basis : claim.status);
```

**with:**
```ts
    }

    if (ids.length > LIMITATION_MAX_CLAIMS) {
      fail(
        'G8_LIMITATION_GROUP_SIZE',
        `the limitation sentence at ${where} cites ${ids.length} claims, and a limitation sentence covers at most ${LIMITATION_MAX_CLAIMS}: write one sentence for each ${LIMITATION_MAX_CLAIMS} claims, in ascending order of claim number`,
      );
      continue;
    }

    const group = ids.map((id) => byId.get(id) as Claim);
    const keyOf = (claim: Claim) => (sentence.template === 'basis' ? claim.basis : claim.status);
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS

- [ ] **Step 7: Run the tests that tell you what is still missing**

The new code needs a seeded defect and a label. A third test shows that a seeded defect of Plan 1 (`limitation-uncovered-claim`) assumed that claim c-12 sits in the first limitation sentence, which is no longer so, and now changes nothing.

Run: `npm test --workspace @robywire/evals`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `limitation-uncovered-claim changes the input it is given`

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G8_LIMITATION_GROUP_SIZE`

- [ ] **Step 8: Write the failing tests for the helper and the case**

The helper `limitationCiting` finds a limitation sentence by a claim it cites, so that no seeded case depends on the order of the sentences: its tests say that it finds the sentence, that the sentence is the live one, that it gives the first when two cite the claim, and that it stops with a message when none does. The seeded tests gain the new defect in the list of cases that must break the rule they name and no other, and a test that `limitation-uncovered-claim` takes c-12 out of its sentence and changes nothing else.

**In `evals/test/support.test.ts`, replace:**
```ts
import { buildLimitations, citedClaims } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { attributeTo, claimOf, reportedBy, sentenceWith } from '../src/cases/support';

// The seeded cases are written with a few helpers. A helper that quietly did less than it says would make a case
```

**with:**
```ts
import { buildLimitations, citedClaims } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { attributeTo, claimOf, limitationCiting, reportedBy, sentenceWith } from '../src/cases/support';

// The seeded cases are written with a few helpers. A helper that quietly did less than it says would make a case
```

**In `evals/test/support.test.ts`, replace:**
```ts
    );
  });
});
```

**with:**
```ts
    );
  });
});

describe('limitationCiting', () => {
  it('finds the limitation sentence that cites the claim', () => {
    expect(limitationCiting(cloneGolden(), 'c-12').claimIds).toEqual(['c-12', 'c-13', 'c-14', 'c-15']);
  });

  it('gives the live sentence, so that a case can change it', () => {
    const input = cloneGolden();
    limitationCiting(input, 'c-12').claimIds = [];
    expect(input.draft.limitations.filter((sentence) => sentence.claimIds.length === 0)).toHaveLength(1);
  });

  it('gives the first sentence when two cite the claim', () => {
    expect(limitationCiting(cloneGolden(), 'c-27').template).toBe('basis');
  });

  it('stops, saying so, when no limitation sentence cites the claim', () => {
    expect(() => limitationCiting(cloneGolden(), 'c-99')).toThrow('seeded case: no limitation sentence of the golden piece cites c-99');
  });
});
```

**In `evals/test/seeded.test.ts`, replace:**
```ts
});

describe('the cases that rewrite what another outlet reports', () => {
  // Each of these changes several sentences and claims at once, so each is run alone and must break the rule it names and no other.
  it.each([
```

**with:**
```ts
});

describe('the cases that rewrite sources and limitation sentences', () => {
  // Each of these changes several sentences and claims at once, so each is run alone and must break the rule it names and no other.
  it.each([
```

**In `evals/test/seeded.test.ts`, replace:**
```ts
    ['primary-claim-called-reported', 'G6_TIER1_REPORTED'],
    ['limitation-two-outlets', 'G8_LIMITATION_GROUP'],
  ])('%s breaks the rule it names and no other', (id, code) => {
    const only = SEEDED_CASES.filter((item) => item.id === id);
    expect(runSeeded(ALL_CHECKS, only).cases.map((item) => item.gotCodes)).toEqual([[code]]);
  });
});

```

**with:**
```ts
    ['primary-claim-called-reported', 'G6_TIER1_REPORTED'],
    ['limitation-two-outlets', 'G8_LIMITATION_GROUP'],
    ['limitation-group-too-large', 'G8_LIMITATION_GROUP_SIZE'],
  ])('%s breaks the rule it names and no other', (id, code) => {
    const only = SEEDED_CASES.filter((item) => item.id === id);
    expect(runSeeded(ALL_CHECKS, only).cases.map((item) => item.gotCodes)).toEqual([[code]]);
  });

  it('limitation-uncovered-claim takes c-12 out of the sentence that cites it and changes nothing else', () => {
    const item = SEEDED_CASES.find((candidate) => candidate.id === 'limitation-uncovered-claim')!;
    const before = cloneGolden();
    const after = item.apply(cloneGolden());
    const without = (input: typeof before) => ({ ...input, draft: { ...input.draft, limitations: [] } });
    expect(without(after)).toEqual(without(before));
    const changed = after.draft.limitations.filter((sentence, at) => JSON.stringify(sentence) !== JSON.stringify(before.draft.limitations[at]));
    expect(changed.map((sentence) => sentence.claimIds)).toEqual([['c-13', 'c-14', 'c-15']]);
  });
});

```

Run: `npm test --workspace @robywire/evals -- test/support.test.ts test/seeded.test.ts`
Expected: FAIL — `limitationCiting is not a function` and `limitation-group-too-large breaks the rule it names and no other`

- [ ] **Step 9: Write the seeded defect and repair the old one**

The new defect, `limitation-group-too-large`, merges the sentences for two groups of datasheet claims into one whose text is exactly what the template renders, so only its size is wrong. The helper `limitationCiting` is used by this case and by `limitation-uncovered-claim`.

**In `evals/src/cases/support.ts`, replace:**
```ts
import { allSentences, buildLimitations, citedClaims } from '@robywire/gate';
import type { Claim, GateInput, Sentence } from '@robywire/gate';

// Small helpers for writing seeded cases. They throw when they find nothing,
```

**with:**
```ts
import { allSentences, buildLimitations, citedClaims } from '@robywire/gate';
import type { Claim, GateInput, LimitationSentence, Sentence } from '@robywire/gate';

// Small helpers for writing seeded cases. They throw when they find nothing,
```

**In `evals/src/cases/support.ts`, replace:**
```ts
}

/** The first sentence of the draft, in document order, whose text contains `fragment`. It is the live sentence, so a case can change it. */
export function sentenceWith(input: GateInput, fragment: string): Sentence {
```

**with:**
```ts
}

/** The limitation sentence of `input` that cites claim `id`. It is the live sentence, so a case can change it. */
export function limitationCiting(input: GateInput, id: string): LimitationSentence {
  const found = input.draft.limitations.find((sentence) => sentence.claimIds.includes(id));
  if (found === undefined) throw new Error(`seeded case: no limitation sentence of the golden piece cites ${id}`);
  return found;
}

/** The first sentence of the draft, in document order, whose text contains `fragment`. It is the live sentence, so a case can change it. */
export function sentenceWith(input: GateInput, fragment: string): Sentence {
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the frontmatter (G1) and in the shape of the piece (G2). */
```

**with:**
```ts
import type { SeededCase } from '../seeded';
import { limitationCiting, sentenceWith } from './support';

/** Defects in the frontmatter (G1) and in the shape of the piece (G2). */
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    description: 'A claim that needs a limitation is left out of the limitation sentence that describes its group.',
    apply: (base) => {
      const [datasheet] = base.draft.limitations;
      datasheet!.claimIds = datasheet!.claimIds.filter((id) => id !== 'c-12');
      return base;
    },
```

**with:**
```ts
    description: 'A claim that needs a limitation is left out of the limitation sentence that describes its group.',
    apply: (base) => {
      const datasheet = limitationCiting(base, 'c-12');
      datasheet.claimIds = datasheet.claimIds.filter((id) => id !== 'c-12');
      return base;
    },
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { attributeTo, claimOf, reportedBy, sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
```

**with:**
```ts
import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { attributeTo, claimOf, limitationCiting, reportedBy, sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
    },
  },
  {
    id: 'limitation-two-outlets',
```

**with:**
```ts
    },
  },
  {
    id: 'limitation-group-too-large',
    check: 'G8',
    code: 'G8_LIMITATION_GROUP_SIZE',
    description: 'One limitation sentence covers more claims than the rule allows, though its wording is the template wording.',
    apply: (base) => {
      const one = limitationCiting(base, 'c-8');
      const two = limitationCiting(base, 'c-12');
      one.claimIds = [...one.claimIds, ...two.claimIds];
      one.text = renderLimitation(one.claimIds.map((id) => claimOf(base, id)), 'basis');
      base.draft.limitations.splice(base.draft.limitations.indexOf(two), 1);
      return base;
    },
  },
  {
    id: 'limitation-two-outlets',
```

Run: `npm run evals:seeded`
Expected: PASS — `every seeded defect was caught` and `limitation-group-too-large`

Run: `npm test --workspace @robywire/evals`
Expected: PASS

- [ ] **Step 10: Write the failing tests for the site**

The `/method` page says in G8 that a sentence covers at most four claims. The fixture tests say that every fixture piece has at least nine limitation sentences of at most four claims each, and that a claim without a number is named by its label.

**In `site/test/method.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, BASES, CHECK_IDS, SAFE_BASES, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, BASES, CHECK_IDS, LIMITATION_MAX_CLAIMS, SAFE_BASES, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**In `site/test/method.test.ts`, replace:**
```ts
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
```

**with:**
```ts
  });

  it('says in G8 that a limitation sentence covers at most four claims, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('through a fixed template, covers at most four claims, cites each claim once');
    expect(LIMITATION_MAX_CLAIMS).toBe(4);
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';
```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState, LIMITATION_MAX_CLAIMS, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
});

describe('fixtureFiles: how each piece was released', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
```

**with:**
```ts
});

describe('fixtureFiles: the limitation sentences', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));

  it.each(SLUGS)('cover at most four claims each in %s', (slug) => {
    const sentences = ledgerOf(slug).sentences.filter((sentence) => sentence.section === 'limitations');
    expect(sentences.length).toBeGreaterThanOrEqual(9);
    for (const sentence of sentences) expect(sentence.claimIds.length, sentence.text).toBeLessThanOrEqual(LIMITATION_MAX_CLAIMS);
  });

  it('name a claim that has no number by its label alone, not by the name or the date it lists', () => {
    const texts = ledgerOf(GOLDEN_SLUG).sentences.filter((sentence) => sentence.section === 'limitations').map((sentence) => sentence.text);
    expect(texts).toContain(
      'The Tarnmoor shipment, announcement date, retrofit mounting and $38,000 list price figures come from a company press release; no independent measurement was available.',
    );
    expect(texts.join(' ')).not.toContain('1 October 2026');
  });
});

describe('fixtureFiles: how each piece was released', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
```

Run: `npm test --workspace @robywire/site -- test/method.test.ts test/check-fixtures.test.ts`
Expected: FAIL — `says in G8 that a limitation sentence covers at most four claims, and the code agrees` and `is ok for the fixtures that are really committed in the repository`

- [ ] **Step 11: Write the label and the sentence, then regenerate the fixtures**

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation cited no claim, an unknown claim or claims out of order',
  G8_LIMITATION_GROUP: 'A limitation grouped claims with different bases, statuses or outlets',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
```

**with:**
```ts
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation cited no claim, an unknown claim or claims out of order',
  G8_LIMITATION_GROUP_SIZE: 'A limitation covered more claims than the rule allows',
  G8_LIMITATION_GROUP: 'A limitation grouped claims with different bases, statuses or outlets',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status (and, for claims that another outlet reported, that outlet) through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
```

**with:**
```ts
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status (and, for claims that another outlet reported, that outlet) through a fixed template, covers at most four claims, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
```

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 11 fixture files`

All five pieces change: each has nine or ten limitation sentences, and the claims that list a date or a name are named by their labels.

Run: `git status --short -- site/src/content-fixtures`
Expected: PASS — `fixture-robotics-ships-fx-1-to-second-plant.json` and `fixture-robotics-ships-fx-5-to-second-plant.mdx`

- [ ] **Step 12: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 13: Commit**

```bash
git add evals/scoreboard/seeded.json evals/src/cases/frontmatter-structure.ts evals/src/cases/limitations-hygiene.ts evals/src/cases/support.ts gate/src/checks/g8-limitations.ts gate/src/limitations.ts gate/test/g2-structure.test.ts gate/test/g7-analysis.test.ts gate/test/g8-limitations.test.ts gate/test/golden-draft.test.ts gate/test/limitations.test.ts evals/test/seeded.test.ts evals/test/support.test.ts site/src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json site/src/content-fixtures/ledger/fixture-robotics-ships-fx-2-to-second-plant.json site/src/content-fixtures/ledger/fixture-robotics-ships-fx-3-to-second-plant.json site/src/content-fixtures/ledger/fixture-robotics-ships-fx-4-to-second-plant.json site/src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json site/src/content-fixtures/news/fixture-robotics-ships-fx-1-to-second-plant.mdx site/src/content-fixtures/news/fixture-robotics-ships-fx-2-to-second-plant.mdx site/src/content-fixtures/news/fixture-robotics-ships-fx-3-to-second-plant.mdx site/src/content-fixtures/news/fixture-robotics-ships-fx-4-to-second-plant.mdx site/src/content-fixtures/news/fixture-robotics-ships-fx-5-to-second-plant.mdx site/src/lib/method.ts site/src/lib/reasons.ts site/test/fixtures.test.ts site/test/method.test.ts
git commit -m "feat(gate): a limitation sentence covers at most four claims, and a claim with no number is named by its label alone" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The `desk` workspace

**Files:**
- Create: `desk/package.json`, `desk/tsconfig.json`, `desk/src/index.ts`
- Create: `desk/src/config.ts` (`DeskConfig`, `defaultConfig`, `loadConfig`)
- Modify: `package.json` (the `workspaces` array gains `desk`), `package-lock.json` (rewritten by `npm install`)
- Modify: `.gitignore` (`runs/` and `evidence/`), `README.md` (a row in the layout table and a short section)
- Test: `desk/test/smoke.test.ts`, `desk/test/config.test.ts`

This task opens the fourth npm workspace, `@robywire/desk`, which holds the pipeline that the rest of Plan 2 builds. It is a TypeScript package like `gate`: ESM, strict, no build step, with `exports` pointing at its source. It depends on the gate (`@robywire/gate`, the workspace itself), and on four packages that Plan 1 already installed, at the versions already pinned in the repository: `zod` 4.6.5 and `yaml` 2.9.1 (used now, by the configuration) and `parse5` 8.0.1 and `fast-xml-parser` 5.11.2 (used by the fetch stage, a later task). Nothing new is downloaded, and the root `typecheck` and `test` scripts already fan out to every workspace, so the CI workflow needs no change.

The task also gives the Desk its configuration, because every later stage reads it. `DeskConfig` is a Zod schema that refuses any key it does not know. `defaultConfig()` is a fresh copy of the defaults every time. `loadConfig(path?)` returns the defaults, or, given the path of a YAML file, the defaults with that file laid over them; the `budget` and the `models` are merged one setting at a time, so a file may change one model or one limit. A file that cannot be read, is not YAML, names a setting that does not exist or gives a value that is not allowed is refused with an error that starts `desk config <path>:` and names the setting. The settings and their defaults:

| Setting | Default | Meaning |
|---|---|---|
| `recencyHours` | 72 | a candidate older than this is not considered |
| `shortlistMax` | 15 | the most candidates sent to the selecting model |
| `minClaims` | 3 | fewer surviving claims than this ends the run with no story |
| `maxRevisionRounds` | 2 | times a draft goes back to the composer before it is held |
| `userAgent` | `RobywireDesk/0.1 (+https://robywire.example/method)` | what the fetcher calls itself; it must contain the address of a `/method` page |
| `requestIntervalMs` | 1000 | the least pause between two requests to one host |
| `maxBytes` | 2000000 | the most bytes read from one page |
| `budget` | `maxCalls` 24, `maxInputTokens` 400000, `maxOutputTokens` 60000 | what a run may spend |
| `models` | `select` `claude-haiku-4-5-20251001`; `extract`, `compose` and `verify` `claude-sonnet-5-5` | the model for each role |
| `runDir`, `evidenceDir` | `runs`, `evidence` | where artifacts and snapshots of sources are written; both are kept out of git |

The model names are written in `desk/src/config.ts` and nowhere else; a test fails if another file of the package spells one.

- [ ] **Step 1: Create the package, add it to the workspaces and install**

**Create `desk/package.json`:**
```json
{
  "name": "@robywire/desk",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "The Desk: the pipeline that will write Robywire, built and tested offline.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@robywire/gate": "0.0.0",
    "fast-xml-parser": "5.11.2",
    "parse5": "8.0.1",
    "yaml": "2.9.1",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "typescript": "7.0.2"
  }
}
```

**Create `desk/tsconfig.json`:**
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test"]
}
```

The entry point starts empty, so the smoke test below has something to fail against.

**Create `desk/src/index.ts`:**
```ts
export {};
```

**In `package.json`, replace:**
```json
    "gate",
    "evals",
    "site"
  ],
  "scripts": {
```

**with:**
```json
    "gate",
    "evals",
    "site",
    "desk"
  ],
  "scripts": {
```

Run: `npm install`
Expected: PASS

`npm install` links the workspace and rewrites `package-lock.json`. It adds a copy of TypeScript 7.0.2 inside `desk/`, because the root has 6.0.3 and `gate` and `evals` have 7.0.2 of their own, and it stops marking `parse5` as a development dependency, because the Desk now needs it to run.

Run: `npm ls @robywire/desk`
Expected: PASS — `@robywire/desk@0.0.0 -> ./desk`

- [ ] **Step 2: Write the failing smoke test**

The test checks the entry point three ways: by relative path, by package name through the workspace link (which proves that `npm install` linked the package), and that the gate is reachable from the Desk.

**Create `desk/test/smoke.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { GATE_PACKAGE } from '@robywire/gate';
import * as entry from '../src/index';

describe('@robywire/desk entry point', () => {
  it('exports its own package name', () => {
    expect(entry.DESK_PACKAGE).toBe('@robywire/desk');
  });

  it('resolves through the workspace link by package name', async () => {
    const linked = await import('@robywire/desk');
    expect(linked.DESK_PACKAGE).toBe('@robywire/desk');
  });

  it('reaches the gate through its workspace dependency', () => {
    expect(GATE_PACKAGE).toBe('@robywire/gate');
  });
});
```

Run: `npm test --workspace @robywire/desk`
Expected: FAIL — `expected undefined to be '@robywire/desk'`

- [ ] **Step 3: Write the entry point**

**Replace `desk/src/index.ts` with:**
```ts
export const DESK_PACKAGE = '@robywire/desk';
```

Run: `npm test --workspace @robywire/desk`
Expected: PASS

- [ ] **Step 4: Write the failing tests for the configuration**

The tests cover the defaults (their values, their validity, a fresh object each call, the user agent, and the rule that no other file spells a model name), loading with no file and with a file (merging, one setting of a nested block at a time, an empty file, the edges of what is allowed), and every kind of mistake, each with the exact message: a negative budget, a setting that does not exist (top level and nested), a number that is not whole, a zero where a positive number is needed, a user agent without a `/method` link, an empty name, several problems at once, a file that is not a mapping, not YAML, with a repeated key, or missing. The last block says that git ignores the two folders the configuration names.

**Create `desk/test/config.test.ts`:**
```ts
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DeskConfig, defaultConfig, loadConfig } from '../src/config';

// The settings of a run live in one place and are checked when they are read:
// a mistake in a config file stops the run before it starts, with a message that
// names the file and the setting.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-config-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** Write `yaml` to a file of its own and return its path. */
function configFile(yaml: string): string {
  const file = path.join(scratch, `desk-${++counter}.yml`);
  writeFileSync(file, yaml);
  return file;
}

/** The message of the error that loading `yaml` throws. */
function failure(yaml: string): string {
  const file = configFile(yaml);
  try {
    loadConfig(file);
  } catch (error) {
    return (error as Error).message.replace(file, '<file>');
  }
  throw new Error(`loadConfig accepted: ${yaml}`);
}

describe('defaultConfig', () => {
  it('holds the settings of the design', () => {
    expect(defaultConfig()).toEqual({
      recencyHours: 72,
      shortlistMax: 15,
      minClaims: 3,
      maxRevisionRounds: 2,
      userAgent: 'RobywireDesk/0.1 (+https://robywire.example/method)',
      requestIntervalMs: 1000,
      maxBytes: 2_000_000,
      budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
      models: { select: 'claude-haiku-4-5-20251001', extract: 'claude-sonnet-5-5', compose: 'claude-sonnet-5-5', verify: 'claude-sonnet-5-5' },
      runDir: 'runs',
      evidenceDir: 'evidence',
    });
  });

  it('is valid under its own schema', () => {
    expect(DeskConfig.parse(defaultConfig())).toEqual(defaultConfig());
  });

  it('returns a new object each time, so one caller cannot change another caller defaults', () => {
    const first = defaultConfig();
    first.budget.maxCalls = 1;
    first.models.verify = 'changed';
    first.recencyHours = 1;
    expect(defaultConfig().budget.maxCalls).toBe(24);
    expect(defaultConfig().models.verify).toBe('claude-sonnet-5-5');
    expect(defaultConfig().recencyHours).toBe(72);
  });

  it('names the Desk and links to the /method page in the user agent, which the fetcher sends to every site', () => {
    expect(defaultConfig().userAgent).toContain('RobywireDesk');
    expect(defaultConfig().userAgent).toContain('https://robywire.example/method');
  });

  it('keeps the model names in this one place: no other file of the package spells one', () => {
    const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && file !== 'config.ts',
    );
    expect(sources).toContain('index.ts');
    for (const file of sources) expect(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), file).not.toContain('claude-');
  });
});

describe('loadConfig without a file', () => {
  it('gives the defaults', () => {
    expect(loadConfig()).toEqual(defaultConfig());
  });

  it('gives a new object each time', () => {
    expect(loadConfig()).not.toBe(loadConfig());
  });
});

describe('loadConfig with a file', () => {
  it('merges the settings of the file over the defaults', () => {
    const config = loadConfig(configFile('recencyHours: 48\nshortlistMax: 5\nrunDir: out/runs\n'));
    expect(config).toEqual({ ...defaultConfig(), recencyHours: 48, shortlistMax: 5, runDir: 'out/runs' });
  });

  it('merges the budget and the models one setting at a time', () => {
    const config = loadConfig(configFile('budget:\n  maxCalls: 10\nmodels:\n  verify: test-verifier\n'));
    expect(config.budget).toEqual({ maxCalls: 10, maxInputTokens: 400_000, maxOutputTokens: 60_000 });
    expect(config.models).toEqual({ ...defaultConfig().models, verify: 'test-verifier' });
  });

  it('gives the defaults for an empty file and for a file of comments', () => {
    expect(loadConfig(configFile(''))).toEqual(defaultConfig());
    expect(loadConfig(configFile('# nothing to change\n'))).toEqual(defaultConfig());
  });

  it('accepts a setting at the edge of what is allowed', () => {
    const config = loadConfig(configFile('maxRevisionRounds: 0\nrequestIntervalMs: 0\nminClaims: 1\nrunDir: r\n'));
    expect([config.maxRevisionRounds, config.requestIntervalMs, config.minClaims, config.runDir]).toEqual([0, 0, 1, 'r']);
  });

  it('accepts another user agent that still links to a /method page', () => {
    const config = loadConfig(configFile('userAgent: "OtherDesk/2 (+https://example.test/method)"\n'));
    expect(config.userAgent).toBe('OtherDesk/2 (+https://example.test/method)');
  });

  it('does not change the defaults of the next caller', () => {
    loadConfig(configFile('recencyHours: 1\nbudget:\n  maxCalls: 1\n'));
    expect(loadConfig()).toEqual(defaultConfig());
  });
});

describe('loadConfig refuses a mistake, and says where it is', () => {
  it('a negative budget, naming the setting', () => {
    expect(failure('budget:\n  maxCalls: -1\n')).toBe('desk config <file>: budget.maxCalls: Too small: expected number to be >0');
  });

  it('a setting that does not exist, naming it', () => {
    expect(failure('recencyDays: 3\n')).toBe('desk config <file>: Unrecognized key: "recencyDays"');
  });

  it('a setting that does not exist inside the budget or the models, naming where', () => {
    expect(failure('budget:\n  maxCall: 3\n')).toBe('desk config <file>: budget: Unrecognized key: "maxCall"');
    expect(failure('models:\n  summarise: x\n')).toBe('desk config <file>: models: Unrecognized key: "summarise"');
  });

  it('a number that is not a whole number, or not a number', () => {
    expect(failure('recencyHours: 1.5\n')).toBe('desk config <file>: recencyHours: Invalid input: expected int, received number');
    expect(failure('recencyHours: soon\n')).toBe('desk config <file>: recencyHours: Invalid input: expected number, received string');
  });

  it.each(['recencyHours', 'shortlistMax', 'minClaims', 'maxBytes', 'budget:\n  maxInputTokens', 'budget:\n  maxOutputTokens'])('%s of zero', (key) => {
    expect(failure(`${key}: 0\n`)).toContain('Too small: expected number to be >0');
  });

  it('a negative number of revision rounds, or a negative pause between requests', () => {
    expect(failure('maxRevisionRounds: -1\n')).toBe('desk config <file>: maxRevisionRounds: Too small: expected number to be >=0');
    expect(failure('requestIntervalMs: -5\n')).toBe('desk config <file>: requestIntervalMs: Too small: expected number to be >=0');
  });

  it('a user agent that does not link to the /method page', () => {
    expect(failure('userAgent: RobywireDesk\n')).toBe(
      'desk config <file>: userAgent: must include the address of the /method page, such as https://robywire.example/method',
    );
  });

  it('an empty model name or folder name', () => {
    expect(failure('models:\n  select: ""\n')).toContain('models.select: Too small');
    expect(failure('runDir: ""\n')).toContain('runDir: Too small');
    expect(failure('evidenceDir: ""\n')).toContain('evidenceDir: Too small');
  });

  it('every problem at once, separated by semicolons', () => {
    expect(failure('recencyHours: 0\nbudget:\n  maxCalls: -1\n')).toBe(
      'desk config <file>: recencyHours: Too small: expected number to be >0; budget.maxCalls: Too small: expected number to be >0',
    );
  });

  it('a budget or a models entry that is not a mapping', () => {
    expect(failure('budget: 5\n')).toBe('desk config <file>: budget: Invalid input: expected object, received number');
  });

  it('a file that is not a mapping of settings', () => {
    expect(failure('- 72\n- 15\n')).toBe('desk config <file>: Invalid input: expected object, received array');
  });

  it('a file that is not YAML', () => {
    expect(failure('recencyHours: [72\n')).toMatch(/^desk config <file>: not valid YAML \(/);
  });

  it('a file that sets a key twice', () => {
    expect(failure('recencyHours: 1\nrecencyHours: 2\n')).toMatch(/^desk config <file>: not valid YAML \(.*unique/);
  });

  it('a file that is not there, naming it', () => {
    const missing = path.join(scratch, 'missing.yml');
    expect(() => loadConfig(missing)).toThrow(`desk config ${missing}: cannot read the file (ENOENT)`);
  });
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
    const ignored = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split('\n');
    expect(ignored).toContain(`${defaultConfig().runDir}/`);
    expect(ignored).toContain(`${defaultConfig().evidenceDir}/`);
  });
});
```

Run: `npm test --workspace @robywire/desk`
Expected: FAIL — `Cannot find module '../src/config'`

- [ ] **Step 5: Write the configuration**

The schema is built from two nested blocks, `Budget` and `Models`, and a file may override any part of either, which is what `Overrides` says. The user agent is the one setting with a rule of its own: the Desk tells every site who it is and where to read about it, so a user agent without the address of a `/method` page is refused.

**Create `desk/src/config.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

// The settings of a run of the Desk. They live here and nowhere else, and they
// are checked when they are read: a mistake in a config file stops the run before
// it starts. The model names are written only in `defaultConfig`.

const count = z.number().int().positive();
const text = z.string().min(1);

/** What one run may spend. A run that goes over any of these stops and fails. */
const Budget = z.strictObject({
  /** Model calls in one run, all four roles together. */
  maxCalls: count,
  /** Input tokens in one run, summed over its calls. */
  maxInputTokens: count,
  /** Output tokens in one run, summed over its calls. */
  maxOutputTokens: count,
});

/** The model that plays each role. The verify model is a setting because the evals may show that it has to change. */
const Models = z.strictObject({ select: text, extract: text, compose: text, verify: text });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
  recencyHours: count,
  /** Select: the most candidates that are sent to the model. */
  shortlistMax: count,
  /** Extract: fewer surviving claims than this ends the run with no story. */
  minClaims: count,
  /** Verify: how many times a draft goes back to the composer before it is held. */
  maxRevisionRounds: z.number().int().nonnegative(),
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
    message: 'must include the address of the /method page, such as https://robywire.example/method',
  }),
  /** Fetch: the least pause between two requests to one host. */
  requestIntervalMs: z.number().int().nonnegative(),
  /** Fetch: the most bytes read from one page. */
  maxBytes: count,
  budget: Budget,
  models: Models,
  /** Where each run writes its artifacts. Kept out of git. */
  runDir: text,
  /** Where the snapshots of sources are kept. Kept out of git. */
  evidenceDir: text,
});
export type DeskConfig = z.infer<typeof DeskConfig>;

/** What a config file may hold: any setting, and any part of the budget or the models, and nothing else. */
const Overrides = DeskConfig.partial().extend({ budget: Budget.partial().optional(), models: Models.partial().optional() });

/** A fresh copy of the default settings. A new object each time, so no caller can change another's defaults. */
export function defaultConfig(): DeskConfig {
  return {
    recencyHours: 72,
    shortlistMax: 15,
    minClaims: 3,
    maxRevisionRounds: 2,
    userAgent: 'RobywireDesk/0.1 (+https://robywire.example/method)',
    requestIntervalMs: 1000,
    maxBytes: 2_000_000,
    budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
    models: {
      select: 'claude-haiku-4-5-20251001',
      extract: 'claude-sonnet-5-5',
      compose: 'claude-sonnet-5-5',
      verify: 'claude-sonnet-5-5',
    },
    runDir: 'runs',
    evidenceDir: 'evidence',
  };
}

/** The problems of a failed parse, one phrase each: the setting and what is wrong with it. */
const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`)).join('; ');

/**
 * The settings of a run. With no path, the defaults. With the path of a YAML
 * file, the defaults with the file's settings laid over them; the budget and the
 * models are merged one setting at a time. A file that cannot be read, is not
 * YAML, holds a setting that does not exist or a value that is not allowed, is
 * refused with an error that names the file and the setting.
 */
export function loadConfig(path?: string): DeskConfig {
  const defaults = defaultConfig();
  if (path === undefined) return defaults;
  const where = `desk config ${path}`;

  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`${where}: cannot read the file (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`);
  }
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    throw new Error(`${where}: not valid YAML (${(error as Error).message.split('\n')[0]})`);
  }

  // An empty file, or one of comments only, parses to null: nothing to override.
  const parsed = Overrides.safeParse(data ?? {});
  if (!parsed.success) throw new Error(`${where}: ${describeIssues(parsed.error)}`);
  const { budget, models, ...rest } = parsed.data;
  return DeskConfig.parse({ ...defaults, ...rest, budget: { ...defaults.budget, ...budget }, models: { ...defaults.models, ...models } });
}
```

The entry point exports the configuration.

**Replace `desk/src/index.ts` with:**
```ts
export const DESK_PACKAGE = '@robywire/desk';

export * from './config';
```

One test still fails: the one that says git ignores the folders of a run. The next step makes it pass.

Run: `npm test --workspace @robywire/desk`
Expected: FAIL — `are kept out of git: run artifacts and private snapshots of sources never go into the repository`

- [ ] **Step 6: Keep the run folders and the evidence out of git**

**In `.gitignore`, replace:**
```text
evals/out/
.DS_Store
```

**with:**
```text
evals/out/
.DS_Store
# Run artifacts and snapshots of sources (desk/src/config.ts names both folders) are never committed.
runs/
evidence/
```

Run: `npm test --workspace @robywire/desk`
Expected: PASS

- [ ] **Step 7: Describe the workspace in the README**

The README gains a row in its layout table and a short section. The section says only what exists, and the last sentence leaves room for the task that finishes Plan 2.

**In `README.md`, replace:**
```markdown
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
```

**with:**
```markdown
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `desk/` | `@robywire/desk`: the Desk pipeline, built and tested offline. So far it holds the configuration only. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
```

**In `README.md`, replace:**
```markdown
`site/src/lib/live.ts` is the switchboard for the parts of the Desk that Plan 1 does not build: the evidence store, the independent model check, the daily schedule and the pipeline that writes and publishes. Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## Requirements

```

**with:**
```markdown
`site/src/lib/live.ts` is the switchboard for the parts of the Desk that Plan 1 does not build: the evidence store, the independent model check, the daily schedule and the pipeline that writes and publishes. Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace

`desk/` (`@robywire/desk`) is where the pipeline is being built, and so far it is a start: it holds the configuration and nothing that reads a source, calls a model or publishes. `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` reads an optional YAML file over the defaults and refuses a setting it does not know or a value that is not allowed. Git ignores `runs/` and `evidence/`: run artifacts and private snapshots of sources never go into the repository. The rest of this section is written when the pipeline is.

## Requirements

```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS

- [ ] **Step 8: Confirm that CI needs no change**

The root scripts `typecheck` and `test` run in every workspace that has them, so the new package is already part of `npm run verify`. The workflow file is untouched, and `site/test/verify.test.ts`, which keeps the workflow and the `verify` script identical, passes.

Run: `git status --short -- .github`
Expected: prints nothing.

Run: `npm run typecheck 2>&1 | grep "@robywire/desk@0.0.0 typecheck"`
Expected: PASS — `@robywire/desk@0.0.0 typecheck`

- [ ] **Step 9: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `@robywire/desk@0.0.0 test` and `Fixtures are up to date.`

- [ ] **Step 10: Commit**

```bash
git add .gitignore README.md package-lock.json package.json desk/package.json desk/tsconfig.json desk/src/config.ts desk/src/index.ts desk/test/config.test.ts desk/test/smoke.test.ts
git commit -m "feat(desk): the desk workspace, with its configuration: Zod DeskConfig, defaultConfig and loadConfig" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
