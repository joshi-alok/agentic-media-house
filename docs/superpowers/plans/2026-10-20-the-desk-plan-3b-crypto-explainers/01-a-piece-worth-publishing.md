## Plan 3b (part 1) — A piece worth publishing

**Goal:** fix what the diagnosis run showed before any new domain work. After this part the "What we couldn't verify" notes are sentences a reader can read; the model check cannot say "entailed" over its own list of what is missing; a model-check rejection found in the last round still gets an answer; the model check reads analysis too; and the public ledger says "notes".

| Task | What it does |
|---|---|
| 1 | Limitation notes in words: no label, no figure, no cap on a group; `LIMITATION_MAX_CLAIMS` and `G8_LIMITATION_GROUP_SIZE` are deleted; the golden piece goes from nine limitation sentences to five. |
| 2 | The model check writes its reason, then what no passage states (`missing`), then its verdict; code refuses a verdict that contradicts the list. |
| 3 | `modelCheckRevisions`: a rejection by the model check in the last round gets one more revision round. |
| 4 | The model check judges analysis sentences too ("adds no entity, event, figure or claim the passages do not support"). |
| 5 | The ledger field `gate.warnings` becomes `gate.notes`. |

**Starting state:** branch `plan-3b-crypto-explainers` cut from `plan-3-blog-first` (see the index, "Before you start"); `npm run verify` green.

**Rules for every task in this part** (the rules of Plan 3 stand; the ones that matter here):
- Run every command from the repository root. To run one test file: `npm test --workspace @robywire/<gate|desk|site|evals> -- test/<name>.test.ts`.
- A step that says `Expected: FAIL` means the command must exit non-zero and show the quoted fragment. Do not continue until you have seen it.
- Do not weaken a test that guards a blocker. Source files contain ASCII only; a test that needs another character uses `String.fromCharCode`.
- Whatever the gate's output changes is regenerated, never edited by hand: `npm run fixtures:generate --workspace @robywire/site` and `npm run evals:seeded`. Commit both with the task that changes them.
- **After every task the whole suite is green:** `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`. If a failing test is neither listed in the task nor covered by its rule, stop and say so.
- One commit per task, the message as written, the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` as the second `-m`.

---

### Task 1: Limitation notes in words

The diagnosis showed that the notes under "What we couldn't verify" are built from fragments (`The 12 kilograms payload, 1.4 metres reach, ... figures come from the company's datasheet`) and read as noise, and that a cap of four claims splits one fact (this group rests on the datasheet) into several sentences. The page already writes a numbered marker after every sentence for each claim it cites, so the sentence does not have to repeat the claim: it says how far to trust what the markers point at.

**Files:**
- Modify: `gate/src/limitations.ts` (rewrite), `gate/src/checks/g8-limitations.ts`, `site/src/lib/reasons.ts`, `site/src/lib/method.ts:77`, `evals/src/cases/limitations-hygiene.ts`
- Modify (tests): `gate/test/limitations.test.ts` (rewrite), `gate/test/g8-limitations.test.ts`, `gate/test/golden-gate.test.ts`, `gate/test/golden-draft.test.ts`, `gate/test/schemas.test.ts`, `gate/test/tier2-variant.test.ts`, `desk/test/stages/draft-assembly.test.ts`, `evals/test/seeded.test.ts`, `site/test/fixtures.test.ts`, `site/test/method.test.ts`
- Regenerate: `site/src/content-fixtures/**`, `evals/scoreboard/seeded.json`

The new sentences (the wording is yours to change; the code does not depend on it):

| Basis | Sentence |
|---|---|
| `datasheet` | What is cited here comes from the company's datasheet; no independent measurement was available. |
| `press-release` | What is cited here comes from a company press release; no independent measurement was available. |
| `briefing` | What is cited here was given in a company briefing; no independent measurement was available. |
| `demo` | What is cited here was shown in a demonstration; the source does not describe independent testing. |
| `paper` | What is cited here is reported in the authors' paper; it has not been independently reproduced. |
| `filing` | What is cited here comes from a regulatory filing. |
| `standard` | What is cited here comes from the published standard. |
| `measured` | What is cited here was measured by the source and is reported as stated. |
| `reported` | What is cited here is reported by {outlet}; it was not checked against a primary source. |

| Status | Sentence |
|---|---|
| `demonstrated` | What is cited here was demonstrated; the source does not report it in commercial deployment. |
| `deployed` | The company states that what is cited here is deployed; no independent confirmation was available. |
| `planned` | What is cited here is planned, not delivered. |
| `unspecified` | The source does not say whether what is cited here has been demonstrated or deployed. |

One sentence per group; a group is the claims that share a basis (for `reported`, a basis and an outlet) or a status, in ascending order of claim number, with no limit on its size. The golden piece goes from nine limitation sentences to five: datasheet c-8 to c-15 (8 claims), press-release c-1 to c-7 and c-22 to c-26 (12), demo c-27 and c-28 (2), status demonstrated c-27 and c-28 (2), status planned c-5, c-6, c-7, c-25 and c-26 (5).

- [ ] **Step 1: Write the failing tests**

Replace the whole of `gate/test/limitations.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import * as limitations from '../src/limitations';
import {
  BASIS_NOTES,
  STATUS_NOTES,
  buildLimitations,
  claimNumber,
  joinList,
  limitationGroups,
  needsBasisLimitation,
  needsStatusLimitation,
  outletOf,
  renderLimitation,
} from '../src/limitations';
import type { Claim } from '../src/schemas';

const BASE_CLAIM: Claim = {
  id: 'c-1',
  text: 'The FX-1 arm is rated for a 12 kg payload.',
  label: 'payload',
  type: 'spec',
  source: {
    url: 'https://fixture-robotics.example/products/fx-1/datasheet',
    tier: 1,
    snapshotHash: 'a'.repeat(64),
    retrievedAt: '2026-10-04T04:30:00Z',
  },
  span: { start: 0, end: 20, quote: 'Rated payload: 12 kg' },
  basis: 'datasheet',
  status: 'unspecified',
  values: [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }],
};

const claim = (overrides: Partial<Claim>): Claim => ({ ...BASE_CLAIM, ...overrides });

/** Claim number `n`, with a basis, a status and, for another outlet's claim, an outlet. */
const c = (n: number, basis: Basis = 'datasheet', status: Status = 'unspecified', outlet?: string): Claim =>
  claim({ id: `c-${n}`, basis, status, source: outlet === undefined ? BASE_CLAIM.source : { ...BASE_CLAIM.source, tier: 2, outlet } });

const idsOf = (groups: ReturnType<typeof limitationGroups>) => groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)]);

describe('the notes', () => {
  it('has a note for every basis and every status, and no others', () => {
    expect(Object.keys(BASIS_NOTES).sort()).toEqual([...BASES].sort());
    expect(Object.keys(STATUS_NOTES).sort()).toEqual([...STATUSES].sort());
  });

  it('has one placeholder, {outlet}, and only the note for reported claims has it', () => {
    for (const basis of BASES) expect(BASIS_NOTES[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
    for (const status of STATUSES) expect(STATUS_NOTES[status], status).not.toContain('{');
  });

  it('is a sentence in each case: a capital at the start and a full stop at the end', () => {
    for (const text of [...Object.values(BASIS_NOTES), ...Object.values(STATUS_NOTES)]) expect(text).toMatch(/^[A-Z].*\.$/);
  });

  it('no longer has a cap on the size of a group, or a plural form', () => {
    expect('LIMITATION_MAX_CLAIMS' in limitations).toBe(false);
    expect('BASIS_TEMPLATES' in limitations).toBe(false);
    expect('STATUS_TEMPLATES_PLURAL' in limitations).toBe(false);
  });
});

describe('renderLimitation', () => {
  it.each<[Basis, string]>([
    ['datasheet', "What is cited here comes from the company's datasheet; no independent measurement was available."],
    ['press-release', 'What is cited here comes from a company press release; no independent measurement was available.'],
    ['briefing', 'What is cited here was given in a company briefing; no independent measurement was available.'],
    ['demo', 'What is cited here was shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "What is cited here is reported in the authors' paper; it has not been independently reproduced."],
    ['filing', 'What is cited here comes from a regulatory filing.'],
    ['standard', 'What is cited here comes from the published standard.'],
    ['measured', 'What is cited here was measured by the source and is reported as stated.'],
  ])('writes the %s note', (basis, expected) => {
    expect(renderLimitation([claim({ basis })], 'basis')).toBe(expected);
  });

  it.each<[Status, string]>([
    ['demonstrated', 'What is cited here was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states that what is cited here is deployed; no independent confirmation was available.'],
    ['planned', 'What is cited here is planned, not delivered.'],
    ['unspecified', 'The source does not say whether what is cited here has been demonstrated or deployed.'],
  ])('writes the %s note', (status, expected) => {
    expect(renderLimitation([claim({ status })], 'status')).toBe(expected);
  });

  it('writes the same sentence for one claim and for many that share the basis', () => {
    const one = renderLimitation([c(1)], 'basis');
    expect(renderLimitation([c(1), c(2), c(3), c(4), c(5), c(6)], 'basis')).toBe(one);
  });

  it('says nothing of the label or the figure of a claim', () => {
    const text = renderLimitation([claim({ label: 'payload', basis: 'press-release' })], 'basis');
    expect(text).not.toContain('payload');
    expect(text).not.toContain('12');
  });

  it('names the outlet of a reported claim, without the spaces around it, and reads a "$" in the name as text', () => {
    const reported = (outlet: string) => claim({ basis: 'reported', source: { ...BASE_CLAIM.source, tier: 2, outlet } });
    expect(renderLimitation([reported('  Mercer Wire ')], 'basis')).toBe('What is cited here is reported by Mercer Wire; it was not checked against a primary source.');
    expect(renderLimitation([reported('Cash $& Wire')], 'basis')).toContain('reported by Cash $& Wire;');
  });

  it('is the same for the same claims and does not change them', () => {
    const input = [c(1), c(2)];
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });

  it('refuses an empty group', () => {
    expect(() => renderLimitation([], 'basis')).toThrow('renderLimitation: a limitation sentence needs at least one claim');
  });
});

describe('needsBasisLimitation and needsStatusLimitation', () => {
  it('asks for a basis sentence unless the figure comes from a filing, a standard, a paper or a measurement', () => {
    expect(BASES.filter((basis) => !needsBasisLimitation(claim({ basis })))).toEqual(['paper', 'filing', 'standard', 'measured']);
  });

  it('asks for a status sentence when the capability was only demonstrated or is only planned', () => {
    expect(STATUSES.filter((status) => needsStatusLimitation(claim({ status })))).toEqual(['demonstrated', 'planned']);
  });
});

describe('limitationGroups', () => {
  it('makes one group for each basis in the order of BASES, then one for each status, whatever the order of the claims', () => {
    const groups = limitationGroups([c(12, 'demo'), c(3, 'press-release'), c(10, 'datasheet'), c(2, 'datasheet'), c(5, 'press-release'), c(1, 'briefing')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'datasheet', ['c-2', 'c-10']],
      ['basis', 'press-release', ['c-3', 'c-5']],
      ['basis', 'briefing', ['c-1']],
      ['basis', 'demo', ['c-12']],
    ]);
  });

  it('does not cut a group, however many claims it has', () => {
    const many = Array.from({ length: 11 }, (_, at) => c(at + 1));
    expect(idsOf(limitationGroups(many.reverse()))).toEqual([['basis', 'datasheet', many.map((item) => item.id).sort((a, b) => claimNumber(a) - claimNumber(b))]]);
  });

  it('orders by claim number, not as text', () => {
    const groups = limitationGroups([c(10), c(9), c(100), c(2)]);
    expect(groups[0]?.claims.map((item) => item.id)).toEqual(['c-2', 'c-9', 'c-10', 'c-100']);
  });

  it('makes no group for a safe basis', () => {
    expect(limitationGroups([c(1, 'filing'), c(2, 'standard'), c(3, 'paper'), c(4, 'measured')])).toEqual([]);
  });

  it('puts a claim that needs both a basis sentence and a status sentence in a group of each kind, the status groups last', () => {
    const groups = limitationGroups([c(4, 'filing', 'planned'), c(2, 'filing', 'demonstrated'), c(1, 'datasheet', 'planned'), c(3, 'filing', 'deployed')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'datasheet', ['c-1']],
      ['status', 'demonstrated', ['c-2']],
      ['status', 'planned', ['c-1', 'c-4']],
    ]);
  });

  it('groups the claims that another outlet reported by outlet, the outlet of the lowest claim first, one group each', () => {
    const groups = limitationGroups([c(5, 'reported', 'unspecified', 'Tarn Daily'), c(2, 'reported', 'unspecified', 'Mercer Wire'), c(7, 'reported', 'unspecified', 'Tarn Daily')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'reported', ['c-2']],
      ['basis', 'reported', ['c-5', 'c-7']],
    ]);
  });

  it('counts a claim once however many times it is given, and gives nothing for nothing', () => {
    expect(idsOf(limitationGroups([c(1), c(1), c(2)]))).toEqual([['basis', 'datasheet', ['c-1', 'c-2']]]);
    expect(limitationGroups([])).toEqual([]);
  });

  it('does not change what it is given', () => {
    const input = [c(3), c(1)];
    const before = structuredClone(input);
    limitationGroups(input);
    expect(input).toEqual(before);
  });
});

describe('buildLimitations', () => {
  it('makes a sentence for each group, with its text, its claims in order and its template', () => {
    const built = buildLimitations([c(2, 'press-release', 'planned'), c(1, 'press-release')]);
    expect(built).toEqual([
      { kind: 'limitation', text: BASIS_NOTES['press-release'], claimIds: ['c-1', 'c-2'], template: 'basis' },
      { kind: 'limitation', text: STATUS_NOTES.planned, claimIds: ['c-2'], template: 'status' },
    ]);
  });

  it('says the outlet in the sentence of a reported group', () => {
    const [sentence] = buildLimitations([c(1, 'reported', 'unspecified', 'Mercer Wire')]);
    expect(sentence?.text).toBe('What is cited here is reported by Mercer Wire; it was not checked against a primary source.');
  });
});

describe('claimNumber, joinList and outletOf', () => {
  it('reads the number of a claim id and nothing else', () => {
    expect(claimNumber('c-12')).toBe(12);
    expect(Number.isNaN(claimNumber('x-12'))).toBe(true);
  });

  it('joins "A", "A and B", "A, B and C"', () => {
    expect([joinList([]), joinList(['a']), joinList(['a', 'b']), joinList(['a', 'b', 'c'])]).toEqual(['', 'a', 'a and b', 'a, b and c']);
  });

  it('trims the outlet and says nothing when the source names none', () => {
    expect(outletOf(c(1, 'reported', 'unspecified', ' Mercer Wire '))).toBe('Mercer Wire');
    expect(outletOf(c(1))).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts`
Expected: FAIL with `BASIS_NOTES` (or `STATUS_NOTES`) not exported / `undefined`.

- [ ] **Step 3: Rewrite `gate/src/limitations.ts`**

```ts
import { BASES, SAFE_BASES } from './constants';
import type { Basis, Status } from './constants';
import type { Claim, LimitationSentence } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. Each says, in words, how far to trust a group of claims, and the gate checks it by
// rendering the same sentence and comparing. A sentence does not repeat what the piece says: it has no figure and no label of a claim, because the page
// writes a numbered marker after it for each claim it cites, and the marker leads to the passage. A group is the claims that share a basis (for a 'basis'
// sentence) or a status (for a 'status' sentence), in ascending order of claim number, and it has no limit on its size. The note of the basis `reported`
// also names the outlet (`{outlet}`), the outlet of the claims themselves, so a group of reported claims is never larger than the claims of one outlet.

/** What a claim's `basis` tells the reader about where it came from. */
export const BASIS_NOTES: Readonly<Record<Basis, string>> = {
  datasheet: "What is cited here comes from the company's datasheet; no independent measurement was available.",
  'press-release': 'What is cited here comes from a company press release; no independent measurement was available.',
  briefing: 'What is cited here was given in a company briefing; no independent measurement was available.',
  demo: 'What is cited here was shown in a demonstration; the source does not describe independent testing.',
  paper: "What is cited here is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'What is cited here comes from a regulatory filing.',
  standard: 'What is cited here comes from the published standard.',
  measured: 'What is cited here was measured by the source and is reported as stated.',
  reported: 'What is cited here is reported by {outlet}; it was not checked against a primary source.',
};

/** What a claim's `status` tells the reader about how far the capability has got. */
export const STATUS_NOTES: Readonly<Record<Status, string>> = {
  demonstrated: 'What is cited here was demonstrated; the source does not report it in commercial deployment.',
  deployed: 'The company states that what is cited here is deployed; no independent confirmation was available.',
  planned: 'What is cited here is planned, not delivered.',
  unspecified: 'The source does not say whether what is cited here has been demonstrated or deployed.',
};

/** The statuses that need a sentence of their own: the capability has been shown or promised, not delivered. */
const STATUSES_WITH_SENTENCE: readonly Status[] = ['demonstrated', 'planned'];

/** Does this claim need a 'basis' sentence? Yes unless it comes from a filing, a standard, a paper or a measurement. */
export const needsBasisLimitation = (claim: Claim): boolean => !(SAFE_BASES as readonly string[]).includes(claim.basis);

/** Does this claim need a 'status' sentence? Yes when the capability was only demonstrated or is only planned. */
export const needsStatusLimitation = (claim: Claim): boolean => STATUSES_WITH_SENTENCE.includes(claim.status);

/** The outlet a claim's source names, without the spaces around it; empty when the source names none. */
export const outletOf = (claim: Claim): string => claim.source.outlet?.trim() ?? '';

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
  const match = /^c-(\d+)$/.exec(id);
  return match === null ? NaN : Number(match[1]);
}

/** "A", "A and B", "A, B and C". */
export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Render the limitation sentence for a group of claims through the `basis` or the `status` note. The note is chosen by the first claim's basis (or
 * status), and the outlet of a `reported` sentence is the first claim's outlet; the gate checks that the claims of a group share them. The sentence is
 * the same for one claim and for many.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
  const first = claims[0];
  if (first === undefined) throw new Error('renderLimitation: a limitation sentence needs at least one claim');
  const text = template === 'basis' ? BASIS_NOTES[first.basis] : STATUS_NOTES[first.status];
  // One pass with a function, so a "$" in an outlet is never read as a replacement pattern.
  return text.replace(/\{outlet\}/g, () => outletOf(first));
}

/** A set of claims that one limitation sentence covers: they share the basis (or the status) `key`. */
export interface LimitationGroup {
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once. */
  claims: Claim[];
}

/**
 * The groups of claims that need a limitation sentence. `citedClaims` are the claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; the claims that were `reported` are grouped by outlet as well, so that a sentence names one outlet, the outlet of the lowest
 * claim number first. Those that are demonstrated or planned are grouped by status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number. A group is never cut.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  const add = (template: LimitationGroup['template'], key: LimitationGroup['key'], claims: Claim[]) => {
    if (claims.length > 0) groups.push({ template, key, claims });
  };
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    // One sentence names one outlet, so the claims that another outlet reported are grouped by outlet.
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) add('basis', basis, outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet));
  }
  for (const status of STATUSES_WITH_SENTENCE) add('status', status, unique.filter((claim) => claim.status === status));
  return groups;
}

/** The limitation sentences for the claims a piece cites: one for each group, rendered from its note. */
export function buildLimitations(citedClaims: readonly Claim[]): LimitationSentence[] {
  return limitationGroups(citedClaims).map(({ template, claims }): LimitationSentence => ({
    kind: 'limitation',
    text: renderLimitation(claims, template),
    claimIds: claims.map((claim) => claim.id),
    template,
  }));
}
```

- [ ] **Step 4: Edit G8 and the places that name the deleted code**

`gate/src/checks/g8-limitations.ts`: remove `'G8_LIMITATION_GROUP_SIZE'` from `G8_CODES`; change the import to `import { claimNumber, joinList, outletOf, renderLimitation } from '../limitations';`; delete the whole `if (ids.length > LIMITATION_MAX_CLAIMS) { ... continue; }` block; delete the two lines of the doc comment that mention the cap (`It cites at most LIMITATION_MAX_CLAIMS ...` and its continuation) and change "the fixed templates" to "the fixed notes".

`site/src/lib/reasons.ts`: delete the line `G8_LIMITATION_GROUP_SIZE: 'A limitation covered more claims than the rule allows',`.

`site/src/lib/method.ts:77`: delete the words `covers at most four claims, ` so the sentence reads `... through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`

`evals/src/cases/limitations-hygiene.ts`: delete the whole case with `id: 'limitation-group-too-large'` (the object from `{` to its closing `},`). The imports `renderLimitation` stay (other cases use it).

- [ ] **Step 5: Apply Rule R2 to the tests that name the deleted things**

**Rule R2.** Nothing else about a limitation sentence changes: its template, its claims, its order, the code of each failure. What changes is (a) its words, (b) how many sentences a piece has, (c) that there is no group-size failure.
- `gate/test/g8-limitations.test.ts`: delete `describe('G8_LIMITATION_GROUP_SIZE', ...)`; replace the comment above `first` and the constants `FIRST_TEXT`, `FIRST_IDS` with the five-sentence layout above (`FIRST_TEXT = BASIS_NOTES.datasheet`, `FIRST_IDS` = c-8 to c-15); the test "has nine limitation sentences ..." becomes "has five limitation sentences, one for each group, in both templates" with `[['basis', 8], ['basis', 12], ['basis', 2], ['status', 2], ['status', 5]]`; any test that expects a text with figures expects what `renderLimitation` returns (import and use it; never write the sentence out again in a test that is not about the wording); a test that picks claims from the second datasheet sentence (`c-12` to `c-15`) now picks them from the first. Keep a test that a sentence for ten claims passes.
- `gate/test/golden-gate.test.ts`: in the list of exported names replace `'BASIS_TEMPLATES'`, `'STATUS_TEMPLATES'` by `'BASIS_NOTES'`, `'STATUS_NOTES'`.
- `gate/test/golden-draft.test.ts`, `gate/test/schemas.test.ts`, `gate/test/tier2-variant.test.ts`, `desk/test/stages/draft-assembly.test.ts`: find them with `grep -n "independent measurement\|independently reproduced\|against a primary source\|limitations).toHaveLength\|limitations\[" <file>`; texts become the new sentences (or a call of `renderLimitation`), counts become the five-sentence counts, and the tier-2 variant's reported sentence reads `What is cited here is reported by <outlet>; it was not checked against a primary source.`
- `evals/test/seeded.test.ts`: delete the tuple `['limitation-group-too-large', 'G8_LIMITATION_GROUP_SIZE']`.
- `site/test/fixtures.test.ts`: replace the test `cover at most four claims each in %s` by one that says the limitation sentences of each fixture are the five of the golden piece for the golden slug (`expect(sentences).toHaveLength(5)`) and that no two of them have the same text; delete the test `name a claim that has no number by its label alone ...` (the sentence no longer names a claim) and the import of `LIMITATION_MAX_CLAIMS`.
- `site/test/method.test.ts`: change the test `says in G8 that a limitation sentence covers at most four claims, and the code agrees` to `says in G8 that a limitation sentence cites each claim once in ascending order` (`toContain('through a fixed template, cites each claim once')`), and delete the `LIMITATION_MAX_CLAIMS` import and expectation.
- Anything else that fails: `grep -rn "LIMITATION_MAX_CLAIMS\|G8_LIMITATION_GROUP_SIZE\|BASIS_TEMPLATES\|STATUS_TEMPLATES" --include='*.ts' --include='*.astro' gate desk site evals` must print nothing outside `docs/` when you are done.

- [ ] **Step 5b: Restore the body of the golden piece (found when the task was executed)**

The golden piece (`gate/src/fixtures/golden.ts`) is the base of hundreds of tests, and its limitation notes were 192 words in nine sentences. The five new notes are 68 words, so the body falls from 692 words and 44 sentences to 568 words and 40, below the 600 to 850 of the default range (a `G2_BODY_LENGTH` note on the golden piece) and with a higher share of analysis (3 of 40 instead of 3 of 44). The fixture changes, not the range and not the tests: add four fact sentences to the body so that the golden piece again has 44 body sentences and 640 to 720 words (the band `golden-draft.test.ts` asserts). Cite only claims the body already cites (so the five limitation groups do not move), never `c-19`, and for a capitalised name the claim that lists it; add no paragraph and no section; every sentence is true to the quoted passage of its claim and uses only the values the claim lists. Adapt the tests that locate a sentence by number if one moves. Then the seeded case `long-body` is caught again.

- [ ] **Step 6: Regenerate and run everything**

```bash
npm run fixtures:generate --workspace @robywire/site
npm run evals:seeded
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
```

Expected: all green; `evals/scoreboard/seeded.json` lists one case fewer than before (59 of 59 if Plan 3's count was 60 of 60).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(gate): the notes under \"What we couldn't verify\" are sentences: no label, no figure, one for each group with no cap, and the group-size code is gone" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The model check gives its reason before its verdict

The diagnosis found a verifier whose verdict contradicted its own reason ("not_entailed" over a reason that said the passage states it). The cause is the order of the fields: the verdict was written first and the reason defended it. Now the model writes the reason, then lists what no passage states, and only then the verdict; and code treats a verdict that disagrees with the list as a failure.

**Files:**
- Modify: `desk/src/stages/verify-model.ts`, `desk/src/prompts/verify.ts`, `desk/src/demo/story.ts:210`
- Modify (tests and helpers): `desk/test/support/verifier.ts`, `desk/test/support/run.ts`, `desk/test/stages/verify-model.test.ts`, `desk/test/stages/verify.test.ts`, `desk/test/tune.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/prompts/verify.test.ts`, `desk/evals/scripted.ts`
- Create: `desk/test/stages/verify-contradiction.test.ts`

- [ ] **Step 1: Write the failing tests**

`desk/test/stages/verify-contradiction.test.ts`:

```ts
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { VerifyReply, aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { verifierReply } from '../support/verifier';

// The verdict must follow from what the verifier has just said. `missing` is what the item says that no passage states.

const PLAN = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
const ID = PLAN.sentences[2]!.id;
const MODEL = 'model-v';

/** A reply that clears everything, but gives item `ID` this entry. */
const withEntry = (entry: { reason: string; missing: string[]; verdict: 'entailed' | 'not_entailed' | 'ambiguous' }) => {
  const reply = verifierReply(PLAN);
  reply.verdicts = reply.verdicts.map((item) => (item.id === ID ? { id: ID, ...entry } : item));
  return reply;
};

describe('VerifyReply', () => {
  it('writes the reason first, then what is missing, then the verdict', () => {
    const shape = VerifyReply.shape.verdicts.element.shape;
    expect(Object.keys(shape)).toEqual(['id', 'reason', 'missing', 'verdict']);
  });

  it('refuses a verdict that has no list of what is missing', () => {
    const parsed = VerifyReply.safeParse({ verdicts: [{ id: 's0', reason: 'It says it.', verdict: 'entailed' }], labels: [] });
    expect(parsed.success).toBe(false);
  });

  it('refuses more than eight things missing in one item, and an empty one', () => {
    const entry = (missing: string[]) => ({ verdicts: [{ id: 's0', reason: 'r', missing, verdict: 'not_entailed' }], labels: [] });
    expect(VerifyReply.safeParse(entry(Array.from({ length: 9 }, () => 'x'))).success).toBe(false);
    expect(VerifyReply.safeParse(entry(['']))).toHaveProperty('success', false);
    expect(VerifyReply.safeParse(entry(['a date'])).success).toBe(true);
  });
});

describe('aggregateVerdicts: a verdict that has to follow the list', () => {
  it('clears an item that is entailed with nothing missing', () => {
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'The passage says it.', missing: [], verdict: 'entailed' })).failures).toEqual([]);
  });

  it('fails an item that is entailed over a list of what no passage states, as not_entailed, and says what the list was', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Close enough.', missing: ['the date', 'the amount'], verdict: 'entailed' }));
    expect(outcome.verifier.passed).toBe(false);
    expect(outcome.failures).toEqual([
      { id: ID, kind: 'sentence', code: 'not_entailed', reason: 'the verifier said entailed, but its own list of what the passages do not state is not empty: the date; the amount' },
    ]);
  });

  it('fails an item that is not_entailed with the list added to the reason, so that the revision is told what to cut', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'The passage gives another date.', missing: ['18 August'], verdict: 'not_entailed' }));
    expect(outcome.failures).toEqual([{ id: ID, kind: 'sentence', code: 'not_entailed', reason: 'The passage gives another date. Not stated: 18 August' }]);
  });

  it('calls an item ambiguous, not not_entailed, when it is not_entailed and names nothing that is missing', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Something is off.', missing: [], verdict: 'not_entailed' }));
    expect(outcome.failures).toEqual([
      { id: ID, kind: 'sentence', code: 'ambiguous', reason: 'the verifier said not entailed but named nothing that the passages do not state (Something is off.)' },
    ]);
  });

  it('keeps an ambiguous verdict as it is, with the list when there is one', () => {
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Cannot tell.', missing: [], verdict: 'ambiguous' })).failures[0]).toMatchObject({ code: 'ambiguous', reason: 'Cannot tell.' });
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Cannot tell.', missing: ['the unit'], verdict: 'ambiguous' })).failures[0]).toMatchObject({ code: 'ambiguous', reason: 'Cannot tell. Not stated: the unit' });
  });

  it('puts the failure in the notes in words', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Close enough.', missing: ['the date'], verdict: 'entailed' }));
    expect(outcome.verifier.notes).toEqual([expect.stringContaining('was judged not entailed: the verifier said entailed, but its own list')]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/desk -- test/stages/verify-contradiction.test.ts`
Expected: FAIL (`missing` is not a field of the reply; TypeScript or Zod errors on `missing`).

- [ ] **Step 3: Change the reply, the reading of it and the prompt**

`desk/src/stages/verify-model.ts`: replace

```ts
const reason = z.string().min(1).max(400);
```
by
```ts
const reason = z.string().min(1).max(400);
/** One thing an item says that no passage states, in a few words. */
const unstated = z.string().min(1).max(200);
```

and the schema `VerifyReply` by

```ts
export const VerifyReply = z.strictObject({
  verdicts: z
    .array(
      // The order of these fields is the order in which the model writes them: its reason first, then what no passage states, and the verdict last, so that the
      // verdict follows from what the model has just said. `aggregateVerdicts` refuses a verdict that does not.
      z.strictObject({ id: z.string().min(1), reason, missing: z.array(unstated).max(8), verdict: z.enum(['entailed', 'not_entailed', 'ambiguous']) }),
    )
    .max(500),
  labels: z.array(z.strictObject({ id: z.string().min(1), basisSupported: z.boolean(), statusSupported: z.boolean(), reason })).max(100),
});
```

and in `aggregateVerdicts` replace the loop over `items` (the part that starts `for (const { item, kind } of items) {` and ends before `for (const claim of plan.claims)`) with:

```ts
  for (const { item, kind } of items) {
    const verdict = verdicts.get(item.id);
    if (verdict === undefined) {
      failures.push({ id: item.id, kind, code: 'missing', reason: 'the verifier gave no verdict' });
      continue;
    }
    const stated = verdict.missing.join('; ');
    const withList = stated === '' ? verdict.reason : `${verdict.reason} Not stated: ${stated}`;
    if (verdict.verdict === 'entailed') {
      // The verdict must follow the list: an item that the verifier itself found things missing from is not entailed, whatever it went on to say.
      if (stated !== '') failures.push({ id: item.id, kind, code: 'not_entailed', reason: `the verifier said entailed, but its own list of what the passages do not state is not empty: ${stated}` });
    } else if (verdict.verdict === 'not_entailed' && stated === '') {
      failures.push({ id: item.id, kind, code: 'ambiguous', reason: `the verifier said not entailed but named nothing that the passages do not state (${verdict.reason})` });
    } else {
      failures.push({ id: item.id, kind, code: verdict.verdict, reason: withList });
    }
  }
```

Also change the doc comment of `aggregateVerdicts` ("A sentence or a heading is cleared only by the verdict `entailed`") to add: "and only when its list of what the passages do not state is empty".

`desk/src/prompts/verify.ts`: replace the two lines of `VERIFY_INSTRUCTIONS` that start `'- "verdicts": a list with one entry for every item` with

```ts
  '- "verdicts": a list with one entry for every item, no more and no fewer. Write the fields of each entry in this order: "id" (the id of the item, copied exactly); "reason", one or two short sentences that say what the passages state about the item; "missing", a list of the things the item says that no passage states (a figure, a name, a date, a relation, a stronger claim), empty when there is none; and last "verdict".',
  'The verdict follows from what you have just written. It is "entailed" only if "missing" is empty. It is "not_entailed" only if "missing" names something. Use "ambiguous" when you cannot tell, and then say in "reason" what you could not tell.',
```

(the "labels" line stays.)

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npm test --workspace @robywire/desk -- test/stages/verify-contradiction.test.ts`
Expected: PASS (after Step 5, because the helper `verifierReply` must write `missing`; run it again then).

- [ ] **Step 5: Give every scripted reply a list of what is missing**

- `desk/test/support/verifier.ts`: in the `verdicts` map write `missing: verdicts[item.id] === 'not_entailed' ? ['what the passages do not say'] : []` between `reason` and `verdict`'s position (the key order in an object literal is not checked, but write them in the order of the schema).
- `desk/src/demo/story.ts:210`: `({ id, reason: 'The passages say it.', missing: [], verdict: 'entailed' as const })`.
- `desk/evals/scripted.ts`, `desk/test/support/run.ts`, `desk/test/stages/verify.test.ts`, `desk/test/tune.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/stages/verify-model.test.ts`: find the literals with `grep -n "verdict: '" <file>`. **Rule R3:** a literal with `verdict: 'entailed'` gets `missing: []`; with `'not_entailed'` gets `missing: ['<what is missing, a few words>']`; with `'ambiguous'` gets `missing: []`. A test that expects the failure `reason` of a `not_entailed` verdict that came from `verifierReply` now expects `<reason> Not stated: what the passages do not say` (for the `verdicts: { [id]: 'not_entailed' }` option the reason is `The passages do not say it (<id>).`, so the failure reads `The passages do not say it (<id>). Not stated: what the passages do not say`); the tests in `desk/test/stages/verify.test.ts` that quote it (`grep -n "The passages do not say it" desk/test/stages/verify.test.ts desk/test/stages/verify-model.test.ts`) change that way and in no other.
- `desk/test/prompts/verify.test.ts`: the test `says what the reply is ...` keeps its three `toContain`s (the strings still occur: check `"verdicts": a list with one entry for every item, no more and no fewer` is still a substring); add

```ts
  it('says to write the reason, then what is missing, then the verdict, and when each verdict may be given', () => {
    expect(VERIFY_INSTRUCTIONS).toContain('Write the fields of each entry in this order: "id"');
    expect(VERIFY_INSTRUCTIONS).toContain('The verdict follows from what you have just written. It is "entailed" only if "missing" is empty.');
  });
```

- Anything else that fails with a Zod error on `missing`: apply Rule R3 and nothing more.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(desk): the model check writes its reason and what no passage states before its verdict, and an \"entailed\" over a list that is not empty fails" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One more round for a rejection in the last round

With `maxRevisionRounds: 2` a draft is revised twice and judged a third time. If the model check rejects that third draft, the Desk holds it with no way to answer. The diagnosis held two of five pages that way. A rejection by the model check after the rounds are spent now gets `modelCheckRevisions` more rounds (1 by default). A gate blocker after the rounds does not: that draft was unsound in the code's own eyes.

**Files:**
- Modify: `desk/src/config.ts`, `desk/src/stages/verify.ts`
- Modify (tests): `desk/test/stages/verify.test.ts` (new block at the end, and Rule R4), `desk/test/config.test.ts`, `desk/test/support/held.ts`, `desk/test/support/run.ts`, `desk/test/stages/hold-pr.test.ts`
- Modify (docs): `README.md`, `docs/runbook.md` where they list the settings (`grep -n "maxRevisionRounds" README.md docs/runbook.md`)

- [ ] **Step 1: Write the failing tests**

Append this block to the end of `desk/test/stages/verify.test.ts`. It uses the helpers of that file (`start`, `callsOf`, `rewriting`, `idOf`, `CLEARS`, `BAD_TAKEAWAY`, `INVENTED`) and `verifierReply`; every name below is defined there or in `desk/test/support/`.

```ts
describe('runVerify: the extra round for a rejection by the model check', () => {
  const SENTENCE = 'The company says the arm is built for tote picking and trailer unloading.';
  const REWRITTEN = { kind: 'fact' as const, text: 'The company says the arm is built for tote picking and for trailer unloading.', claimIds: ['c-1'] };
  const withRounds = (maxRevisionRounds: number, modelCheckRevisions: number) => ({ config: { ...defaultConfig(), maxRevisionRounds, modelCheckRevisions } });

  it('has one extra round by default', () => {
    expect(defaultConfig().modelCheckRevisions).toBe(1);
  });

  it('revises once more when the model check rejects the draft of the last round, and publishes the draft that it then clears', async () => {
    const { ctx, fake, claims, composed } = await start(undefined, { overrides: withRounds(0, 1) });
    const id = idOf(composed.draft, SENTENCE);
    fake.script('verify', verifierReply(verifyPlanOf(composed.draft, claims), { verdicts: { [id]: 'not_entailed' } }), CLEARS());
    fake.script('compose', rewriting(id, REWRITTEN));
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('publish');
    expect(result.rounds).toBe(1);
    expect(callsOf(fake, 'compose')).toHaveLength(2);
    expect(callsOf(fake, 'verify')).toHaveLength(2);
    expect(result.history.map((pass) => [pass.round, pass.sent])).toEqual([[0, [id]], [1, []]]);
  });

  it('holds when the extra round does not clear it, and asks for no third', async () => {
    const { ctx, fake, claims, composed } = await start(undefined, { overrides: withRounds(0, 1) });
    const id = idOf(composed.draft, SENTENCE);
    const fails = () => verifierReply(verifyPlanOf(composed.draft, claims), { verdicts: { [id]: 'not_entailed' } });
    fake.script('verify', fails(), fails());
    fake.script('compose', rewriting(id, REWRITTEN));
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('hold');
    expect(result.rounds).toBe(1);
    expect(callsOf(fake, 'compose')).toHaveLength(2);
  });

  it('gives the extra round after the ordinary rounds, not instead of them', async () => {
    const { ctx, fake, claims, composed } = await start(undefined, { overrides: withRounds(1, 1) });
    const id = idOf(composed.draft, SENTENCE);
    const fails = () => verifierReply(verifyPlanOf(composed.draft, claims), { verdicts: { [id]: 'not_entailed' } });
    fake.script('verify', fails(), fails(), CLEARS());
    fake.script('compose', rewriting(id, REWRITTEN), rewriting(id, { ...REWRITTEN, text: 'The company says the arm is built for tote picking.' }));
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('publish');
    expect(result.rounds).toBe(2);
  });

  it('does not give it when the setting is 0', async () => {
    const { ctx, fake, claims, composed } = await start(undefined, { overrides: withRounds(0, 0) });
    const id = idOf(composed.draft, SENTENCE);
    fake.script('verify', verifierReply(verifyPlanOf(composed.draft, claims), { verdicts: { [id]: 'not_entailed' } }));
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('hold');
    expect(result.rounds).toBe(0);
    expect(callsOf(fake, 'compose')).toHaveLength(1);
  });

  it('does not give it to a blocker of the gate that still stands in the last round', async () => {
    const { ctx, fake, claims, composed } = await start((reply) => { reply.takeaways[1] = BAD_TAKEAWAY; }, { overrides: withRounds(0, 1) });
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('hold');
    expect(result.rounds).toBe(0);
    expect(callsOf(fake, 'compose')).toHaveLength(1);
    expect(callsOf(fake, 'verify')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/desk -- test/stages/verify.test.ts -t "extra round"`
Expected: FAIL (`modelCheckRevisions` does not exist; TypeScript or the first `toBe(1)`).

- [ ] **Step 3: Add the setting and use it**

`desk/src/config.ts`, in `DeskConfig` after `maxRevisionRounds`:

```ts
  /**
   * Verify: how many more times a draft goes back to the composer when the model check rejects the draft of the last round. The rounds of `maxRevisionRounds`
   * are for any failure; this one is for the model check alone, because the model check is the only layer that reads meaning and a rejection found when the
   * rounds are spent has had no answer. A blocker of the gate that is still standing in the last round does not get it.
   */
  modelCheckRevisions: z.number().int().nonnegative(),
```

and in `defaultConfig()` after `maxRevisionRounds: 2,`: `modelCheckRevisions: 1,`.

`desk/src/stages/verify.ts`: in `runVerify`, replace

```ts
    const send = !clean && round < ctx.config.maxRevisionRounds && problems.length > 0;
```
by
```ts
    // The rounds are for any failure; a rejection by the model check after them gets `modelCheckRevisions` more.
    const rejected = checked !== undefined && !checked.verifier.passed;
    const allowed = round < ctx.config.maxRevisionRounds || (rejected && round < ctx.config.maxRevisionRounds + ctx.config.modelCheckRevisions);
    const send = !clean && allowed && problems.length > 0;
```

and update the doc comment of `runVerify` ("when rounds are left (`config.maxRevisionRounds`)" gains "(and, after them, `config.modelCheckRevisions` more for a draft that only the model check rejects)") and the comment at the top of the file the same way.

- [ ] **Step 4: Run the new test, then fix what the extra round changes in the other tests**

Run: `npm test --workspace @robywire/desk -- test/stages/verify.test.ts -t "extra round"` → PASS.

Run: `npm test --workspace @robywire/desk`. **Rule R4:** a test that holds a piece because the model check rejects every draft now sees one more revision round. The known cases are in `desk/test/stages/verify.test.ts`: `is held after the last round when the verifier keeps failing the same sentence` (script a fourth `verify` reply and a third `compose` reply, expect `rounds` 3 and four `verify` calls and four `compose` calls, `history.map((pass) => pass.sent)` of `[[id], [id], [id], []]`) the held pieces built by `desk/test/support/held.ts` (`const ROUNDS = defaultConfig().maxRevisionRounds;`: the number of rounds of a piece held by the model check is `ROUNDS + defaultConfig().modelCheckRevisions`; script one more compose reply and one more verifier reply for it), and `unentailed()` in `desk/test/support/run.ts` ("revised twice and held": script a third failing verifier reply and a third revision, and every test that uses it expects three rounds). `desk/test/stages/hold-pr.test.ts:205,254` (`Rounds of revision`) expects the rounds that the run did, not the setting. A test that is not about the rounds may instead set `modelCheckRevisions: 0` in its own config. `desk/test/config.test.ts:40` gains `modelCheckRevisions: 1,` in the expected defaults, and a test that `modelCheckRevisions: 0` loads and `modelCheckRevisions: -1` fails as `maxRevisionRounds` does (copy lines 127 and 175 of that file). Any other test that fails: stop and say which.

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): a draft that the model check rejects in the last round gets one more round of revision (modelCheckRevisions)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.

---

### Task 4: The model check reads analysis

No model reads analysis today; the gate keeps analysis strict (no new number, date, amount word or name, a capital or a digit to start, a closed opener list) to make up for it. That kept the page safe and made analysis hard to write. The model check now also judges analysis sentences: "introduces no entity, event, figure or claim that the passages it relies on do not support". The strict gate rules stay as a second line.

**Files:**
- Modify: `desk/src/stages/verify-model.ts`, `desk/src/prompts/verify.ts`, `desk/src/prompts/compose.ts` (one rule), `site/src/lib/method.ts:178`, `site/src/lib/copy.ts` (if it says analysis is read by no model: `grep -n "no model" site/src/lib/*.ts`)
- Modify (tests): `desk/test/stages/verify-model.test.ts`, `desk/test/prompts/verify.test.ts`, `desk/test/stages/verify.test.ts`, `site/test/method.test.ts`
- Create: `desk/test/stages/verify-analysis.test.ts`

- [ ] **Step 1: Write the failing tests**

`desk/test/stages/verify-analysis.test.ts`:

```ts
import { allSentences } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { VERIFY_INSTRUCTIONS, buildVerifyUser } from '../../src/prompts/verify';
import { aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { blocksOf } from '../support/prompts';
import { verifierReply } from '../support/verifier';

const located = allSentences(GOLDEN_DRAFT);
const analysis = located.filter((item) => item.sentence.kind === 'analysis');
const PLAN = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);

describe('verifyPlanOf: analysis', () => {
  it('has an item for every analysis sentence, marked as analysis, and for no limitation', () => {
    expect(analysis.length).toBeGreaterThan(0);
    for (const item of analysis) expect(PLAN.sentences.find((planned) => planned.id === `s${item.index}`)).toMatchObject({ kind: 'analysis', text: item.sentence.text });
    const limitations = located.filter((item) => item.sentence.kind === 'limitation');
    for (const item of limitations) expect(PLAN.sentences.map((planned) => planned.id)).not.toContain(`s${item.index}`);
  });

  it('marks a fact sentence as a fact', () => {
    expect(PLAN.sentences[0]).toMatchObject({ id: 's0', kind: 'fact' });
  });

  it('gives an analysis sentence the claims it cites, and every claim the piece cites when it cites none', () => {
    const draft = structuredClone(GOLDEN_DRAFT);
    const first = allSentences(draft).find((item) => item.sentence.kind === 'analysis')!;
    first.sentence.claimIds = [];
    const plan = verifyPlanOf(draft, GOLDEN_CLAIMS);
    const planned = plan.sentences.find((item) => item.id === `s${first.index}`)!;
    expect(planned.claimIds).toEqual(plan.claims.map((claim) => claim.id));
  });
});

describe('the prompt for an analysis item', () => {
  it('shows it as Analysis, apart from the facts, and still inside a block', () => {
    const user = buildVerifyUser({ claims: PLAN.claims, sentences: PLAN.sentences, headings: PLAN.headings });
    const id = `s${analysis[0]!.index}`;
    expect(user).toContain(`Analysis ${id} (`);
    expect(blocksOf(user).some((block) => block.id === id && block.text === analysis[0]!.sentence.text)).toBe(true);
  });

  it('tells the verifier what entailed means for analysis', () => {
    expect(VERIFY_INSTRUCTIONS).toContain('An item shown as Analysis is the Desk\'s own reading, not a statement of a source.');
    expect(VERIFY_INSTRUCTIONS).toContain('adds no entity, event, figure, date, quotation or claim of fact that the passages it relies on do not support');
  });
});

describe('aggregateVerdicts: analysis', () => {
  it('fails an analysis sentence that is not entailed, like a fact sentence', () => {
    const id = `s${analysis[0]!.index}`;
    const outcome = aggregateVerdicts('m', PLAN, verifierReply(PLAN, { verdicts: { [id]: 'not_entailed' } }));
    expect(outcome.failures).toEqual([expect.objectContaining({ id, kind: 'sentence', code: 'not_entailed' })]);
  });

  it('counts facts, analysis and headings in the note of a pass', () => {
    const facts = PLAN.sentences.filter((item) => item.kind === 'fact').length;
    const reading = PLAN.sentences.length - facts;
    expect(aggregateVerdicts('m', PLAN, verifierReply(PLAN)).verifier.notes).toEqual([
      `Judged ${facts} fact sentences, ${reading} analysis sentences and ${PLAN.headings.length} headings against the passages they rely on, and the basis and the status of ${PLAN.claims.length} claims; every one was supported.`,
    ]);
  });
});
```

(`blocksOf` is the helper of `desk/test/support/prompts.ts`; if it returns another shape than `{id, text}`, match on what it returns: open the file first.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/desk -- test/stages/verify-analysis.test.ts`
Expected: FAIL (no `kind` on a sentence item).

- [ ] **Step 3: Change the plan, the prompt and the note**

`desk/src/stages/verify-model.ts`:

1. `SentenceItem` gains `kind: 'fact' | 'analysis';` (after `id`).
2. In `verifyPlanOf` replace the doc comment's sentence "Analysis is the Desk's reading and is not judged here; the gate limits what it may say: no new number, date or name." by "An analysis sentence is judged too: it may not bring in an entity, event, figure or claim that the passages it relies on do not support (the gate's own limits on analysis stay as well)." and replace the `sentences` constant with

```ts
  const cited = citedClaims(draft, claims).map((claim) => claim.id);
  const sentences = located
    .filter((item) => item.sentence.kind !== 'limitation')
    .map((item): SentenceItem => {
      const own = existing(item.sentence.claimIds, known);
      // An analysis sentence that cites nothing rests on the whole of what the piece cites.
      const kind = item.sentence.kind === 'analysis' ? 'analysis' : 'fact';
      return { id: `s${item.index}`, kind, section: item.section, where: describeLocation(item), text: item.sentence.text, claimIds: kind === 'analysis' && own.length === 0 ? cited : own };
    });
```

3. In `aggregateVerdicts`, replace the `notes` constant's pass text with

```ts
  const facts = plan.sentences.filter((item) => item.kind === 'fact').length;
  const notes =
    failures.length === 0
      ? [`Judged ${facts} fact sentences, ${plan.sentences.length - facts} analysis sentences and ${plan.headings.length} headings against the passages they rely on, and the basis and the status of ${plan.claims.length} claims; every one was supported.`]
      : failures.map((failure) => noteOf(failure, plan));
```

4. `judgePlan` passes `sentences: plan.sentences` to `buildVerifyUser` already; the view type gets the `kind` (next).

`desk/src/prompts/verify.ts`:

1. `VerifySentenceView` gains `kind: 'fact' | 'analysis';`.
2. `describeItem(kind: 'Sentence' | 'Analysis' | 'Heading', ...)`; in `buildVerifyUser` the sentence entries become `describeItem(item.kind === 'analysis' ? 'Analysis' : 'Sentence', item.id, PLACE[item.section], item.claimIds)`.
3. In `VERIFY_INSTRUCTIONS`, after the line that starts `'A sentence that attributes something to another outlet is entailed...` add:

```ts
  'An item shown as Analysis is the Desk\'s own reading, not a statement of a source. It is entailed if it adds no entity, event, figure, date, quotation or claim of fact that the passages it relies on do not support. A judgement, a comparison or a consequence that the passages plainly support is fine. It is not entailed if it brings in a new fact, makes a claim stronger than the passages do, presents a prediction as certain, or tells the reader to buy, sell or hold anything.',
```

and change "each a sentence or a heading of the piece in a block with an id that starts with s or h" to "each a sentence (a statement of fact or Analysis) or a heading of the piece in a block with an id that starts with s or h".

- [ ] **Step 4: Run the new test to verify it passes, then the rest**

Run: `npm test --workspace @robywire/desk -- test/stages/verify-analysis.test.ts` → PASS.

Run: `npm test --workspace @robywire/desk`. **Rule R5:** a test that expects the plan to hold only fact sentences (`verifyPlanOf ... has an item for every fact sentence, ... and for no other sentence`, in `desk/test/stages/verify-model.test.ts`) expects fact and analysis sentences and no limitation; its name changes to say so. A test that scripts a verifier reply by literal ids has to include the ids of the analysis sentences too: build the reply with `verifierReply(verifyPlanOf(...))` instead of a literal list. The expected note text of a pass changes to the new text. A test that counts the items sent to the verifier counts analysis too.

`desk/src/prompts/compose.ts`: the rule about the names in analysis ends with the sentence `No model reads analysis, so the Desk checks it by code.` It is no longer true. Replace that sentence with `The Desk checks it by code, and a second model reads every analysis sentence beside the passages of the claims it cites and rejects one that adds an entity, an event, a figure or a claim of fact that they do not support.` and change the assertions of `desk/test/prompts/compose.test.ts` that quote the old sentence (`grep -n "No model reads analysis" desk/test`).

- [ ] **Step 5: Say it on the site**

`site/src/lib/method.ts:178` reads "...are checked by code for where they stand and for the numbers, dates and names they bring in, and by no model: whatever else an analysis sentence says passes, and the page labels it Analysis." Replace it with: `Analysis sentences, which are a fifth of the sentences of the body or fewer by default (a piece above that is noted, not stopped), are checked by code for where they stand and for the numbers, dates and names they bring in, and then by the model check, which refuses one that adds an entity, an event, a figure or a claim of fact that the passages it relies on do not support. The page labels it Analysis.` Update the assertions in `site/test/method.test.ts` and `site/test/known-limits.test.ts` that quote the old sentence (`grep -n "by no model" site/test/*.ts`), and the line 148/163/168/183 limits that say "the model check is the only reader" only if they are now wrong: a capitalised word that opens an analysis sentence is read by the model check as well; leave the rest.

- [ ] **Step 6: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): the model check also judges analysis sentences, which may not add an entity, an event, a figure or a claim the passages do not support" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.

---

### Task 5: The ledger says "notes"

The notes of the gate are called notes everywhere a reader sees them (the receipts page, the method page, the runbook). The ledger field that carries them is still `gate.warnings`, a name from before the split. Nothing is published yet, so the rename costs nothing now and would cost a migration later.

**Files:**
- Modify: `gate/src/schemas.ts` (the `LedgerEntry.gate` object), `gate/src/render/render.ts`, `site/src/lib/receipts.ts`, `desk/src/run/artifacts.ts` (only where it names the ledger field, not `GateResult.warnings`)
- Modify (tests): `gate/test/ledger-notes.test.ts`, `gate/test/render.test.ts`, `gate/test/frontmatter-consistency.test.ts`, `site/test/receipts-notes.test.ts`, `site/test/receipts.test.ts`, `desk/test/support/published.ts`, `desk/test/run/gate-report.test.ts`
- Regenerate: `site/src/content-fixtures/ledger/*.json`

`GateResult.warnings` (what `runGate` returns) keeps its name: it is the code's own word for a finding that did not block, and only the ledger is public. `render.ts` is the one place that turns one into the other.

- [ ] **Step 1: Write the failing test**

Append to `gate/test/ledger-notes.test.ts` (look at the file first: it already builds a ledger from the golden piece with a note in it; use the same helper):

```ts
describe('the ledger field for the notes of the gate', () => {
  it('is called notes, and a ledger that still says warnings is refused', () => {
    const entry = ledgerWithNotes();
    expect(LedgerEntry.parse(entry).gate.notes).toEqual(entry.gate.notes);
    const old = structuredClone(entry) as Record<string, any>;
    old.gate.warnings = old.gate.notes;
    delete old.gate.notes;
    expect(LedgerEntry.safeParse(old).success).toBe(false);
  });

  it('is empty, not missing, for a ledger written without notes', () => {
    const entry = structuredClone(ledgerWithNotes()) as Record<string, any>;
    delete entry.gate.notes;
    expect(LedgerEntry.parse(entry).gate.notes).toEqual([]);
  });
});
```

where `ledgerWithNotes()` is the helper that file already uses (name it as it is named there). The `LedgerEntry` `gate` object is not strict today (`z.object`): the first test needs `warnings` to be refused, so Step 3 makes it `z.strictObject`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/gate -- test/ledger-notes.test.ts`
Expected: FAIL (`gate.notes` is undefined).

- [ ] **Step 3: Rename the field**

`gate/src/schemas.ts`: in `LedgerEntry`, change `gate: z.object({` to `gate: z.strictObject({`, rename the key `warnings:` to `notes:` and change its comment to "The notes of the gate: findings that did not block the piece, by code and place. The receipts page lists them in words. ... A ledger written before notes existed has none." (keep `.default([])`).

`gate/src/render/render.ts`: where the ledger is built from the `GateResult` (`grep -n "warnings" gate/src/render/render.ts`), write `notes: gate.warnings.map(...)` (the mapping stays, the key changes) with the comment `// GateResult.warnings is the gate's word; the ledger, which readers see, says notes.`

`site/src/lib/receipts.ts` and `desk/src/run/artifacts.ts`: `grep -n "gate.warnings\|\.warnings" <file>`; change reads of the **ledger** field only.

- [ ] **Step 4: Apply Rule R6 to the tests, regenerate, run**

**Rule R6:** a test that builds or reads a ledger's `gate.warnings` uses `gate.notes`; a test that reads a `GateResult` keeps `warnings`. `grep -rn "gate: {" --include='*.ts' gate/test site/test desk/test | grep -n "warnings"` finds the literals.

```bash
npm run fixtures:generate --workspace @robywire/site
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
```

Expected: green; `git diff --stat site/src/content-fixtures` shows only the five ledger files (key rename) and the MDX bodies unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(gate): the ledger field for the notes of the gate is called notes, as the pages that show it are" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
