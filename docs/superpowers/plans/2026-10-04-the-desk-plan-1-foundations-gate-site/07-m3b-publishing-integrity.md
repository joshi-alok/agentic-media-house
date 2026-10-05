## Milestone 3 (part B) — Publishing integrity

**Goal:** make sure that what a reader sees on the site is what the gate cleared, and that the page says so when it is not the whole story. Part A of this milestone hardened the gate. This part hardens the path from a cleared draft to a published page, where the review of Plan 1 found four holes: a held piece that the owner decides to publish would carry no visible sign that it rests on another outlet; a correction could not change the page's updated date; the article text and its ledger were two copies that nothing compared; and the ledger said nothing about whether a human had released the piece. Each task is a test-first patch to code that already exists: a failing test, a minimal change, regenerated derived files and a commit.

| Task | What it closes |
|---|---|
| 77 | A sentence that only attributes a fact to another outlet is labelled `Unconfirmed.` in the article, flagged in the ledger and marked on the receipts page, and a new audit check (A16) fails any article that cites such a claim without the label. |
| 78 | A correction sets `updatedAt`. The frontmatter schema and the renderer accept it, the byline shows it, the structured data uses it as `dateModified`, and the build stops when a piece and the corrections in the desk state disagree. |
| 79 | The article body is written from the ledger by one function (`renderBody`), and the build stops, naming the first line that differs, when a piece's body is not exactly what its ledger renders. |
| 80 | The ledger records how a piece got out (`release`: `auto` or `owner`), the receipts page says it in words and no longer shows a bare route, the method page says it in one sentence, and a fifth fixture piece is a draft that the gate held and the owner released. |

**Starting state:** Tasks 1 to 76 are finished and committed. `npm run typecheck`, `npm test`, `npm run evals:seeded` (53 of 53 cases caught), `npm run fixtures:check`, `npm run build`, `npm run build:fixtures` and `npm run audit` pass. The golden piece has 28 claims and a body of 657 words; the site builds four fixture pieces from it (`fx-1` to `fx-4`), each with a ledger, and one correction in the desk state, which belongs to the `fx-2` piece. `gate/` exports the renderer (`renderDraft`, `NewsFrontmatter`, `escapeMdx`) and `site/` joins every piece with its ledger in `site/src/lib/match-pieces.ts`.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts` (or `@robywire/evals`, `@robywire/site`). Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything. A few tests guard a rule that already holds; the step says so and shows how to make the test fail on purpose.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong. The one exception is a test that counts or locates something that a task says changes: those numbers are edited, and the task shows each edit.
- No package is installed or changed in this milestone. The toolchain is the one of Milestones 0 to 2.
- Source files contain ASCII only. Never type a character outside ASCII into a source file. Code uses `String.fromCharCode` where it needs one. A few lines that already exist in the tests contain an escape written with six ASCII characters (a backslash, `u`, and four hexadecimal digits, such as the one for a curly apostrophe); where an edit below shows one, type those six characters exactly. If your tool turns one into the character itself, undo that, because the tests would then contain a character outside ASCII.
- Anything that the gate's behaviour changes is regenerated, never edited by hand: `npm run evals:seeded` rewrites `evals/scoreboard/seeded.json`, and `npm run fixtures:generate --workspace @robywire/site` rewrites the fixture pieces, their ledgers and the desk state. The files are committed with the task that changes them.
- A new check of the audit (`site/scripts/audit/`) needs a test in `site/test/audit.test.ts` that gives it pages it must accept and pages it must reject, and a place in the list `CHECKS` in `site/scripts/audit/checks.mjs`.
- The fixtures are fictional. Every name in a new fixture is made up, and every address is on `*.example`. The production build must contain none of it: `npm run audit:prod` (check A13) fails if it does.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** none are added. This milestone was verified with the versions of Milestones 0 to 2 (Node 22, TypeScript 6.0.3 in the repository root and `site` and 7.0.2 in `gate` and `evals`, Astro 7.3.5, Zod 4.6.5, Vitest 5.0.3).

---

### Task 77: A sentence that rests on another outlet is labelled "Unconfirmed."

**Files:**
- Create: `gate/src/fixtures/tier2.ts` (a variant of a piece in which one fact comes from another outlet)
- Modify: `gate/src/fixtures/index.ts` (export it)
- Modify: `gate/src/schemas.ts` (`LedgerSentence` gains the optional `attributed`)
- Modify: `gate/src/render/render.ts` (the label in the article, the flag in the ledger)
- Modify: `site/src/lib/receipts.ts`, `site/src/pages/news/[slug]/receipts/index.astro` (an `Unconfirmed` chip, and the hold reason in words)
- Modify: `site/scripts/audit/checks-links.mjs`, `site/scripts/audit/checks.mjs` (new audit check A16)
- Modify: `README.md` (the audit line)
- Test: `gate/test/tier2-variant.test.ts` (new), `gate/test/render.test.ts`, `gate/test/schemas.test.ts`, `site/test/receipts.test.ts`, `site/test/contrast.test.ts`, `site/test/audit.test.ts`, `site/test/audit-run.test.ts`, `site/test/audit-cli.test.ts`

Check G6 lets the Desk use another outlet's reporting (a tier-2 source) only as an attribution: the sentence names the outlet ("Mercer Wire reports that 7 investors took part") and the composer marks it `attributed: true`. Such a piece can never publish by itself; the gate asks for a hold, and the owner decides. But once the owner publishes a held piece, nothing on the page said so. The renderer ignored `attributed`, the ledger did not record it, and the receipts page showed only a "Tier 2 source" chip. A reader could not tell a sentence that the Desk traced to a primary source from one that repeats another outlet.

This task labels it, in the same plain form as the label of analysis.

1. The renderer puts the bold label `Unconfirmed.` before a fact sentence that has `attributed: true`, just as it puts `Analysis.` before an analysis sentence. A sentence never has both: analysis is the Desk's own reading and cites no tier-2 claim at all (G6), and `attributed` is read on fact sentences only.
2. The ledger sentence records `attributed: true` for such a sentence, and has no `attributed` key for any other.
3. The receipts page shows an `Unconfirmed` chip next to the tier chip of every claim from a tier-2 source, and writes each hold reason in words, with its code after it.
4. A new audit check, **A16**, reads the built site: an article whose receipts page lists a claim from a tier-2 source must contain the label `Unconfirmed.` as bold text. This closes the loop from the other side: if the renderer or the template ever stops writing the label, the audit fails. The test for the label is a function of its own, `hasUnconfirmedLabel(document)`, because Task 80 needs it again.
5. The label has no style of its own. The browser draws `<strong>` in bold, which is how `Analysis.` looks, and the design allows no italics and no new colours. A test keeps it that way.

The fifth fixture piece, which Task 80 adds, is the first to contain such a sentence. Until then the gate's own tier-2 variant, `makeTier2Variant`, stands in for one: it is the golden piece (or a variant of it) in which the investor count comes from a made-up outlet, "Mercer Wire", at an address on `*.example`, written the way G6 demands.

- [ ] **Step 1: Write the failing test for the tier-2 variant**

The variant is test data that later tasks use again, so it has tests of its own: it passes every check and asks for a hold, it changes one claim and one sentence, and it does not change the piece it is given.

**Create `gate/test/tier2-variant.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { defaultContext } from '../src/config';
import { TIER2_OUTLET, cloneGolden, makeTier2Variant, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { Claim, Draft } from '../src/schemas';
import { allSentences } from '../src/sentences';
import { claimById, mutate } from './helpers';

// The tier-2 variant is the golden piece with one fact that another outlet
// reported, written the way check G6 demands. The gate does not publish such a
// piece by itself; it holds it for the owner. The site's fifth fixture piece
// is made from it, and the renderer tests use it.

const attributedSentence = (input: ReturnType<typeof cloneGolden>) =>
  allSentences(input.draft).find((item) => item.sentence.kind === 'fact' && item.sentence.text.startsWith(TIER2_OUTLET))?.sentence;

describe('makeTier2Variant', () => {
  const variant = makeTier2Variant(cloneGolden());

  it('passes every check and asks for a hold, because it rests on another outlet', () => {
    const result = runGate(variant, defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(result.route).toBe('hold');
  });

  it('turns the investor count into a tier-2 claim of the outlet, on a .example address with a hash of its own', () => {
    const claim = claimById(variant.claims, 'c-19');
    expect(claim.source.tier).toBe(2);
    expect(claim.source.outlet).toBe('Mercer Wire');
    expect(TIER2_OUTLET).toBe('Mercer Wire');
    expect(new URL(claim.source.url).hostname.endsWith('.example')).toBe(true);
    expect(claim.source.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const others = variant.claims.filter((item) => item.id !== 'c-19').map((item) => item.source.snapshotHash);
    expect(others).not.toContain(claim.source.snapshotHash);
    expect(claim.span.end - claim.span.start).toBe(claim.span.quote.length);
    expect(claim.span.quote).toContain('7');
  });

  it('writes the sentence that cites it as an attribution, marked attributed', () => {
    const sentence = attributedSentence(variant);
    expect(sentence).toEqual({ kind: 'fact', text: 'Mercer Wire reports that 7 investors took part in the round.', claimIds: ['c-19'], attributed: true });
  });

  it('changes nothing else: one claim and one sentence differ from the golden piece', () => {
    const golden = cloneGolden();
    expect(variant.claims.filter((claim, at) => JSON.stringify(claim) !== JSON.stringify(golden.claims[at])).map((claim) => claim.id)).toEqual(['c-19']);
    const before = allSentences(golden.draft).map((item) => JSON.stringify(item.sentence));
    const after = allSentences(variant.draft).map((item) => JSON.stringify(item.sentence));
    expect(after.filter((text, at) => text !== before[at])).toHaveLength(1);
  });

  it('keeps the claims and the draft valid against the schemas', () => {
    expect(() => Draft.parse(variant.draft)).not.toThrow();
    for (const claim of variant.claims) expect(() => Claim.parse(claim)).not.toThrow();
  });

  it('does not change the piece it is given', () => {
    const base = cloneGolden();
    makeTier2Variant(base);
    expect(base).toEqual(cloneGolden());
  });

  it('works on a variant of the golden piece too, and keeps the date of its retrieval', () => {
    const second = makeVariant(cloneGolden(), {
      slug: 'fixture-robotics-ships-fx-5-to-second-plant',
      publishedAt: '2026-09-30',
      categories: ['policy-standards', 'funding'],
      replace: [
        ['FX-1', 'FX-5'],
        ['fx-1', 'fx-5'],
        ['2026-10-04T04:30:00Z', '2026-09-30T04:30:00Z'],
      ],
    });
    const result = makeTier2Variant(second);
    expect(runGate(result, defaultContext()).route).toBe('hold');
    expect(claimById(result.claims, 'c-19').source.retrievedAt).toBe('2026-09-30T04:30:00Z');
  });

  it('stops, saying what is missing, when the piece has no investor-count claim or no sentence that cites it', () => {
    const noClaim = mutate(cloneGolden(), (g) => {
      g.claims = g.claims.filter((claim) => claim.id !== 'c-19');
    });
    expect(() => makeTier2Variant(noClaim)).toThrow('makeTier2Variant: the piece has no claim c-19');
    const noSentence = mutate(cloneGolden(), (g) => {
      for (const item of allSentences(g.draft)) if (item.sentence.text === 'It lists 7 investors in the round.') item.sentence.text = 'Seven investors took part.';
    });
    expect(() => makeTier2Variant(noSentence)).toThrow('makeTier2Variant: the piece has no sentence "It lists 7 investors in the round."');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/tier2-variant.test.ts`
Expected: FAIL — `makeTier2Variant is not a function`

- [ ] **Step 3: Write the variant**

**Create `gate/src/fixtures/tier2.ts`:**
```ts
import { createHash } from 'node:crypto';
import type { GateInput } from '../gate';
import { allSentences } from '../sentences';

// A fictional outlet and its page, like every other name and address in the
// fixtures: nothing here is a real publication.
export const TIER2_OUTLET = 'Mercer Wire';
const TIER2_URL = 'https://mercer-wire.example/robotics/fixture-robotics-offering';
const TIER2_QUOTE = 'The offering drew 7 investors, according to people familiar with the filing.';
const TIER2_QUOTE_START = 96;

const CLAIM_ID = 'c-19';
const PLAIN_SENTENCE = 'It lists 7 investors in the round.';
const ATTRIBUTED_SENTENCE = `${TIER2_OUTLET} reports that 7 investors took part in the round.`;

/**
 * A copy of `base` (the golden piece, or a variant of it) in which the investor
 * count comes from another outlet instead of from the filing. Claim c-19 is now
 * a tier-2 claim of Mercer Wire, and the sentence that cites it is written the
 * way check G6 requires: it names the outlet and is marked `attributed`.
 *
 * Nothing fails in the gate, but a piece that rests on another outlet is never
 * published by itself: the gate asks for a hold (TIER2_ATTRIBUTION) and the
 * owner decides. `base` is never changed.
 */
export function makeTier2Variant(base: GateInput): GateInput {
  const copy = structuredClone(base);

  const claim = copy.claims.find((item) => item.id === CLAIM_ID);
  if (claim === undefined) throw new Error(`makeTier2Variant: the piece has no claim ${CLAIM_ID}`);
  const found = allSentences(copy.draft).find((item) => item.sentence.kind === 'fact' && item.sentence.text === PLAIN_SENTENCE);
  if (found === undefined || found.sentence.kind !== 'fact') {
    throw new Error(`makeTier2Variant: the piece has no sentence "${PLAIN_SENTENCE}"`);
  }

  claim.source = {
    url: TIER2_URL,
    tier: 2,
    // As in the golden piece: the SHA-256 of the address followed by the quote, which is not the hash of a real page.
    snapshotHash: createHash('sha256')
      .update(TIER2_URL + TIER2_QUOTE)
      .digest('hex'),
    retrievedAt: claim.source.retrievedAt,
    outlet: TIER2_OUTLET,
  };
  claim.span = { start: TIER2_QUOTE_START, end: TIER2_QUOTE_START + TIER2_QUOTE.length, quote: TIER2_QUOTE };

  found.sentence.text = ATTRIBUTED_SENTENCE;
  found.sentence.attributed = true;
  return copy;
}
```

**In `gate/src/fixtures/index.ts`, replace:**
```ts
export * from './golden';
export * from './variant';
```

**with:**
```ts
export * from './golden';
export * from './variant';
export * from './tier2';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/tier2-variant.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Write the failing renderer tests**

The renderer tests render the variant and check the label, the ledger flag and the cases that must stay as they are: a piece with no attributed sentence has no label and no key, `attributed: false` writes nothing, a takeaway bullet carries the label after its dash, and a sentence is never given both labels. Another test sees to it that a ledger sentence has a `heading` key only in the body.

**In `gate/test/render.test.ts`, replace:**
```ts
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput, GateResult } from '../src/gate';
```

**with:**
```ts
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden, makeTier2Variant } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput, GateResult } from '../src/gate';
```

**In `gate/test/render.test.ts`, replace:**
```ts
    expect(last.section).toBe('limitations');
    expect(last.kind).toBe('limitation');
  });

```

**with:**
```ts
    expect(last.section).toBe('limitations');
    expect(last.kind).toBe('limitation');
    expect(ledger.sentences.filter((s) => 'heading' in s).every((s) => s.section === 'body')).toBe(true);
  });

```

**In `gate/test/render.test.ts`, replace:**
```ts
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
```

**with:**
```ts
});

describe('renderDraft: sentences that rest on another outlet', () => {
  const tier2 = makeTier2Variant(cloneGolden());
  const { mdx, ledger } = render(tier2);
  const attributed = 'Mercer Wire reports that 7 investors took part in the round.';

  it('puts the label Unconfirmed. before an attributed fact sentence, in the same form as the Analysis. label', () => {
    const marker = ledger.order.indexOf('c-19') + 1;
    expect(mdx).toContain(`**Unconfirmed.** ${attributed}[${marker}](${RECEIPTS}#c-19)`);
    expect(mdx).toContain(`) **Unconfirmed.** ${attributed}`);
    expect(mdx.split('**Unconfirmed.** ')).toHaveLength(2);
    expect(mdx.split('**Analysis.** ')).toHaveLength(4);
  });

  it('records attributed: true on that ledger sentence and on no other', () => {
    const flagged = ledger.sentences.filter((sentence) => 'attributed' in sentence);
    expect(flagged).toEqual([expect.objectContaining({ text: attributed, kind: 'fact', attributed: true, claimIds: ['c-19'] })]);
  });

  it('leaves a piece with no attributed sentence without the label and without the key', () => {
    const plain = render(cloneGolden());
    expect(plain.mdx).not.toContain('Unconfirmed');
    expect(plain.ledger.sentences.some((sentence) => 'attributed' in sentence)).toBe(false);
  });

  it('writes no label and no key for a sentence marked attributed: false', () => {
    const input = mutate(cloneGolden(), (g) => {
      const sentence = findSentence(g.draft, (item) => item.text === 'It lists 7 investors in the round.');
      if (sentence.kind === 'fact') sentence.attributed = false;
    });
    const result = render(input);
    expect(result.mdx).not.toContain('Unconfirmed');
    expect(result.ledger.sentences.some((sentence) => 'attributed' in sentence)).toBe(false);
  });

  it('puts the label inside a takeaway bullet, after the dash', () => {
    const input = mutate(tier2, (g) => {
      const sentence = g.draft.takeaways[0]!;
      if (sentence.kind === 'fact') sentence.attributed = true;
    });
    const bullet = blocks(render(input).mdx)[2]!.split('\n')[0]!;
    expect(bullet.startsWith('- **Unconfirmed.** Tarnmoor is the second')).toBe(true);
  });

  it('never gives a sentence both labels: an analysis sentence gets Analysis. only, and no key', () => {
    const input = mutate(tier2, (g) => {
      const sentence = findSentence(g.draft, (item) => item.kind === 'analysis');
      Object.assign(sentence, { attributed: true });
    });
    const result = render(input);
    expect(result.mdx).toContain('**Analysis.** The measured rate sits below');
    expect(result.mdx).toContain(') **Analysis.** The measured rate sits below');
    expect(result.mdx.split('**Unconfirmed.** ')).toHaveLength(2);
    expect(result.ledger.sentences.filter((sentence) => 'attributed' in sentence)).toHaveLength(1);
  });

  it('keeps the ledger valid against the LedgerEntry schema', () => {
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
```

The ledger schema must accept the flag, as `true` or `false`, and nothing else.

**In `gate/test/schemas.test.ts`, replace:**
```ts
  });

  it('rejects a verifier result that lacks a model', () => {
    const bad = patch(VALID_LEDGER, 'verifier', { passed: true, notes: [] });
```

**with:**
```ts
  });

  it('accepts attributed on a ledger sentence, as true or false, and refuses anything else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', true));
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', false));
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', 'yes'))).toEqual(['sentences.0.attributed']);
  });

  it('rejects a verifier result that lacks a model', () => {
    const bad = patch(VALID_LEDGER, 'verifier', { passed: true, notes: [] });
```

Run: `npm test --workspace @robywire/gate -- test/render.test.ts test/schemas.test.ts`
Expected: FAIL — `puts the label Unconfirmed. before an attributed fact sentence` and `records attributed: true on that ledger sentence and on no other`.

- [ ] **Step 6: Write the label and the flag**

The schema first.

**In `gate/src/schemas.ts`, replace:**
```ts
  text: z.string(),
  claimIds: z.array(z.string()),
});
export type LedgerSentence = z.infer<typeof LedgerSentence>;
```

**with:**
```ts
  text: z.string(),
  claimIds: z.array(z.string()),
  // Present, and true, only on a fact sentence that the composer marked as an
  // attribution to another outlet (check G6). The page labels it "Unconfirmed."
  attributed: z.boolean().optional(),
});
export type LedgerSentence = z.infer<typeof LedgerSentence>;
```

Then the renderer. It builds the label in one place, and records the flag with the other fields of the ledger sentence. The key is added only when it is true, so a ledger that has no attributed sentence is the same file as before.

**In `gate/src/render/render.ts`, replace:**
```ts
  const marker = (id: string) => `[${markerOf.get(id)}](${receipts}#${id})`;
  const sentence = (item: Sentence): string => {
    const label = item.kind === 'analysis' ? '**Analysis.** ' : '';
    const markers = [...new Set(item.claimIds)].map(marker).join('');
    return `${label}${escapeMdx(item.text)}${markers}`;
```

**with:**
```ts
  const marker = (id: string) => `[${markerOf.get(id)}](${receipts}#${id})`;
  const sentence = (item: Sentence): string => {
    // A sentence has at most one label: analysis is the Desk's reading, "Unconfirmed." marks a fact it only attributes.
    const label = item.kind === 'analysis' ? '**Analysis.** ' : item.kind === 'fact' && item.attributed === true ? '**Unconfirmed.** ' : '';
    const markers = [...new Set(item.claimIds)].map(marker).join('');
    return `${label}${escapeMdx(item.text)}${markers}`;
```

**In `gate/src/render/render.ts`, replace:**
```ts

  const sentences: LedgerSentence[] = located.map((item) => {
    const entry: LedgerSentence = { index: item.index, section: item.section, kind: item.sentence.kind, text: item.sentence.text, claimIds: [...item.sentence.claimIds] };
    return item.heading === undefined ? entry : { ...entry, heading: item.heading };
  });

```

**with:**
```ts

  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = { index: item.index, section: item.section, kind: written.kind, text: written.text, claimIds: [...written.claimIds] };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
    return entry;
  });

```

- [ ] **Step 7: Run the gate tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  34 passed (34)`.

- [ ] **Step 8: Write the failing site tests**

The receipts view gains `unconfirmed` for each claim, and a hold reason becomes a code with a label. A reason that has no label is shown by its code, so that nothing is hidden.

**In `site/test/receipts.test.ts`, replace:**
```ts
  });

  it('includes the outlet only for a source that has one', () => {
    expect('outlet' in view.claims[0]!.source).toBe(false);
```

**with:**
```ts
  });

  it('marks a claim from a tier-2 source as unconfirmed, and a tier-1 claim as not', () => {
    expect(view.claims.every((claim) => claim.unconfirmed === false)).toBe(true);
    const outlet = structuredClone(golden);
    outlet.claims[0]!.source = { ...outlet.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    const claims = receiptsView(outlet).claims;
    expect(claims.map((claim) => claim.unconfirmed)).toEqual([true, ...claims.slice(1).map(() => false)]);
  });

  it('includes the outlet only for a source that has one', () => {
    expect('outlet' in view.claims[0]!.source).toBe(false);
```

**In `site/test/receipts.test.ts`, replace:**
```ts
  });

  it('carries the route and the hold reasons', () => {
    expect(view.gate.route).toBe('publish');
    expect(view.gate.holdReasons).toEqual([]);
```

**with:**
```ts
  });

  it('carries the route, and each hold reason with its code and its words', () => {
    expect(view.gate.route).toBe('publish');
    expect(view.gate.holdReasons).toEqual([]);
```

**In `site/test/receipts.test.ts`, replace:**
```ts
    const heldView = receiptsView(held);
    expect(heldView.gate.route).toBe('hold');
    expect(heldView.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(heldView.gate.checks.find((check) => check.id === 'G6')).toEqual({ id: 'G6', result: 'fail' });
  });

  it('has no verifier row when the ledger has no verifier', () => {
    expect(view.verifier).toBeUndefined();
```

**with:**
```ts
    const heldView = receiptsView(held);
    expect(heldView.gate.route).toBe('hold');
    expect(heldView.gate.holdReasons).toEqual([{ code: 'TIER2_ATTRIBUTION', label: "Rests on another outlet's reporting" }]);
    expect(heldView.gate.checks.find((check) => check.id === 'G6')).toEqual({ id: 'G6', result: 'fail' });
  });

  it('shows a hold reason that has no label by its code, so that nothing is hidden', () => {
    const odd = structuredClone(golden);
    odd.gate.holdReasons = ['SOMETHING_NEW'];
    expect(receiptsView(odd).gate.holdReasons).toEqual([{ code: 'SOMETHING_NEW', label: 'SOMETHING_NEW' }]);
  });

  it('has no verifier row when the ledger has no verifier', () => {
    expect(view.verifier).toBeUndefined();
```

**In `site/test/receipts.test.ts`, replace:**
```ts
    copy.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['one'] };
    const result = receiptsView(copy);
    result.gate.holdReasons.push('x');
    result.verifier!.notes.push('x');
    expect(copy.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
```

**with:**
```ts
    copy.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['one'] };
    const result = receiptsView(copy);
    result.gate.holdReasons.push({ code: 'x', label: 'x' });
    result.verifier!.notes.push('x');
    expect(copy.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
```

A16 has pages it must accept and pages it must reject. It must not take the word in running text for the label, or the label of analysis, it accepts the label with space around its text inside the element, and it leaves a missing receipts page to A9, which reports it.

**In `site/test/audit.test.ts`, replace:**
```ts
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**with:**
```ts
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**In `site/test/audit.test.ts`, replace:**
```ts
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
```

**with:**
```ts
});

describe('A16 checkUnconfirmedLabel', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const TIER1 = '<span class="chip chip--tier1">Tier 1 source</span>';
  const TIER2 = '<span class="chip chip--tier2">Tier 2 source</span><span class="chip">Unconfirmed</span>';
  const receipts = (...chips: string[]) => page(`<h1>r</h1>${chips.map((chip, at) => `<article class="receipt" id="c-${at + 1}"><p class="receipt__chips">${chip}</p></article>`).join('')}`);
  const article = (sentence: string) => page(`<h1>x</h1><div class="prose"><p>${sentence}</p></div>`);
  const files = (sentence: string, ...chips: string[]) => ({ [ARTICLE]: article(sentence), [RECEIPTS]: receipts(...chips) });

  it('accepts an article that labels its sentences when its receipts page lists a tier-2 claim', () => {
    expect(checkUnconfirmedLabel(site(files('<strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part.', TIER1, TIER2)))).toEqual(ok('A16'));
  });

  it('accepts the label with space or a line break around its text, as formatted HTML may have it', () => {
    expect(checkUnconfirmedLabel(site(files('<strong>\n  Unconfirmed. </strong> Mercer Wire reports it.', TIER2)))).toEqual(ok('A16'));
  });

  it('accepts an article with only tier-1 claims, with or without the label', () => {
    expect(checkUnconfirmedLabel(site(files('A plain sentence.', TIER1, TIER1)))).toEqual(ok('A16'));
    expect(checkUnconfirmedLabel(site(files('<strong>Unconfirmed.</strong> A sentence.', TIER1)))).toEqual(ok('A16'));
  });

  it('accepts a site with no article', () => {
    expect(checkUnconfirmedLabel(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A16'));
  });

  it('rejects an article that cites a tier-2 claim and has no Unconfirmed. label, naming the article and the number of claims', () => {
    expect(checkUnconfirmedLabel(site(files('Mercer Wire reports that 7 investors took part.', TIER1, TIER2)))).toEqual({
      id: 'A16',
      ok: false,
      problems: [`${ARTICLE}: its receipts page lists 1 claim from a tier-2 source, but the article has no "Unconfirmed." label`],
    });
    expect(checkUnconfirmedLabel(site(files('Plain.', TIER2, TIER2))).problems).toEqual([
      `${ARTICLE}: its receipts page lists 2 claims from a tier-2 source, but the article has no "Unconfirmed." label`,
    ]);
  });

  it('does not take the word in running text for the label: it must be the bold label at the start of a sentence', () => {
    expect(checkUnconfirmedLabel(site(files('The claim is Unconfirmed. Really.', TIER2))).problems).toHaveLength(1);
    expect(checkUnconfirmedLabel(site(files('<strong>Analysis.</strong> Not that label.', TIER2))).problems).toHaveLength(1);
  });

  it('leaves a missing receipts page to A9', () => {
    expect(checkUnconfirmedLabel(site({ [ARTICLE]: article('Plain.') }))).toEqual(ok('A16'));
  });
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
```

The audit now has sixteen checks, so the two tests that count them change.

**In `site/test/audit-run.test.ts`, replace:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A15 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 15 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**with:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A16 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 16 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 14 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**with:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 15 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 15 checks.');
  });

```

**with:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 16 checks.');
  });

```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 14 checks.');
  });

```

**with:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 15 checks.');
  });

```

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts`
Expected: FAIL — `A16 checkUnconfirmedLabel`, `marks a claim from a tier-2 source as unconfirmed` and `lists the checks A1 to A16 in order`.

- [ ] **Step 9: Write the receipts view, the page and the audit check**

The receipts view says which claims are unconfirmed and turns each hold reason into its code and its label (the labels are the ones the holds page already uses).

**In `site/src/lib/receipts.ts`, replace:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Route, Status } from '@robywire/gate';

// The receipts page, as data. The page only lays this out, so what it says can
```

**with:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Route, Status } from '@robywire/gate';
import { reasonLabel } from './reasons';

// The receipts page, as data. The page only lays this out, so what it says can
```

**In `site/src/lib/receipts.ts`, replace:**
```ts
  /** The 0-based indexes, in the ledger's sentence list, of the sentences that cite this claim. */
  citedBy: number[];
}

```

**with:**
```ts
  /** The 0-based indexes, in the ledger's sentence list, of the sentences that cite this claim. */
  citedBy: number[];
  /** True for a claim from a tier-2 source (another outlet's reporting): the article labels the sentences that cite it "Unconfirmed.". */
  unconfirmed: boolean;
}

/** A reason the gate asked for a hold: its code, and the same in plain English. */
export interface HoldReason {
  code: string;
  label: string;
}

```

**In `site/src/lib/receipts.ts`, replace:**
```ts
  route: Route;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: string[];
}

```

**with:**
```ts
  route: Route;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: HoldReason[];
}

```

**In `site/src/lib/receipts.ts`, replace:**
```ts
      status: claim.status,
      citedBy: ledger.sentences.filter((sentence) => sentence.claimIds.includes(id)).map((sentence) => sentence.index),
    };
  });
```

**with:**
```ts
      status: claim.status,
      citedBy: ledger.sentences.filter((sentence) => sentence.claimIds.includes(id)).map((sentence) => sentence.index),
      unconfirmed: tier === 2,
    };
  });
```

**In `site/src/lib/receipts.ts`, replace:**
```ts
      route: ledger.gate.route,
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: [...ledger.gate.holdReasons],
    },
  };
```

**with:**
```ts
      route: ledger.gate.route,
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: ledger.gate.holdReasons.map((code) => ({ code, label: reasonLabel(code) })),
    },
  };
```

The receipts page shows the chip and writes the hold reasons in words.

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
const sources = new Set(view.claims.map((claim) => claim.source.url)).size;
const resultChip = (passes: boolean) => (passes ? 'chip chip--pass' : 'chip chip--fail');
---

```

**with:**
```astro
const sources = new Set(view.claims.map((claim) => claim.source.url)).size;
const resultChip = (passes: boolean) => (passes ? 'chip chip--pass' : 'chip chip--fail');
// Each hold reason in plain English, with its code after it for anyone who wants to look it up.
const holdText = view.gate.holdReasons.length === 0 ? 'none' : view.gate.holdReasons.map((reason) => `${reason.label} (${reason.code})`).join('; ');
---

```

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
      </ul>
      <p class="gate-notes">
        Hold reasons: {view.gate.holdReasons.length === 0 ? 'none' : view.gate.holdReasons.join(', ')}. What each check looks at is on the <a href="/method/">method page</a>.
      </p>
      {
```

**with:**
```astro
      </ul>
      <p class="gate-notes">
        Hold reasons: {holdText}. What each check looks at is on the <a href="/method/">method page</a>.
      </p>
      {
```

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
            <p class="receipt__chips">
              <span class={claim.source.tier === 1 ? 'chip chip--tier1' : 'chip chip--tier2'}>{claim.source.tier === 1 ? 'Tier 1 source' : 'Tier 2 source'}</span>
              <span class="chip">{claim.basis}</span>
              <span class="chip">{claim.status}</span>
```

**with:**
```astro
            <p class="receipt__chips">
              <span class={claim.source.tier === 1 ? 'chip chip--tier1' : 'chip chip--tier2'}>{claim.source.tier === 1 ? 'Tier 1 source' : 'Tier 2 source'}</span>
              {claim.unconfirmed && <span class="chip">Unconfirmed</span>}
              <span class="chip">{claim.basis}</span>
              <span class="chip">{claim.status}</span>
```

A16 reads the receipts page of every article for the tier-2 chip, and the article for the label.

**In `site/scripts/audit/checks-links.mjs`, replace:**
```js
  return result('A11', problems);
}
```

**with:**
```js
  return result('A11', problems);
}

/**
 * True when the page has the bold label "Unconfirmed." that the renderer writes before a sentence that rests on another outlet.
 * Space around the text inside the element does not matter.
 * @param {import('./dom.mjs').Node} document
 * @returns {boolean}
 */
export function hasUnconfirmedLabel(document) {
  return elements(document, 'strong').some((label) => textOf(label).trim() === 'Unconfirmed.');
}

/**
 * A16: an article whose receipts page lists a claim from a tier-2 source (the "Tier 2 source" chip) labels what rests on it: the article has the bold label "Unconfirmed." that the renderer writes before an attributed sentence.
 * @param {import('./site.mjs').Site} site
 */
export function checkUnconfirmedLabel(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    // A missing receipts page is A9's to report.
    if (receipts === undefined) continue;
    const tier2 = elements(receipts.document, 'span').filter((chip) => (attr(chip, 'class') ?? '').split(/\s+/).includes('chip--tier2')).length;
    if (tier2 === 0) continue;
    if (!hasUnconfirmedLabel(page.document)) {
      problems.push(`${page.file}: its receipts page lists ${tier2} ${tier2 === 1 ? 'claim' : 'claims'} from a tier-2 source, but the article has no "Unconfirmed." label`);
    }
  }
  return result('A16', problems);
}
```

**In `site/scripts/audit/checks.mjs`, replace:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';
```

**with:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';
```

**In `site/scripts/audit/checks.mjs`, replace:**
```js
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
];

```

**with:**
```js
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
];

```

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts`
Expected: PASS — `Test Files  4 passed (4)`.

- [ ] **Step 10: Add the test that keeps the label plain, and see it fail on purpose**

**In `site/test/contrast.test.ts`, replace:**
```ts
    expect(lawViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
```

**with:**
```ts
    expect(lawViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});

describe('the labels at the start of a sentence', () => {
  // "Analysis." and "Unconfirmed." are both written as bold text (a <strong> element). They share
  // one look, the browser's own, because no stylesheet says anything about <strong>: a rule that gave
  // one of them a colour or a style would have to give it to both, and the design allows neither.
  const css = sourceFiles(SRC)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');

  it('are left to the browser: no stylesheet has a rule for <strong>', () => {
    expect(css).toMatch(/body/);
    expect(css).not.toMatch(/(^|[^\w-])strong(?![\w-])/);
  });
});
```

This test guards a rule that already holds, so it passes as soon as it is written: no stylesheet says anything about `<strong>`.

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Make it fail by giving `<strong>` a style of its own, as a later change might.

Run: `printf '\nstrong {\n  font-weight: 400;\n}\n' >> site/src/styles/pages.css`

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: FAIL — `are left to the browser: no stylesheet has a rule for <strong>`

Put the stylesheet back.

Run: `git checkout -- site/src/styles/pages.css`

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 11: Update the README**

**In `README.md`, replace:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12, A14 and A15 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article, receipts page) and fail if any score is under 95. |
```

**with:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A16 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article, receipts page) and fail if any score is under 95. |
```

- [ ] **Step 12: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 13: Run the audit on the fixture site**

No fixture piece rests on another outlet yet, so A16 has nothing to find; it must pass, and it is listed.

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Run: `npm run audit`
Expected: PASS — `ok    A16` and `Passed: 15 checks.`

- [ ] **Step 14: Commit**

```bash
git add README.md gate/src gate/test site/scripts site/src site/test
git commit -m "feat: label attributed sentences Unconfirmed in the article, mark them in the ledger and the receipts, and audit it (A16)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 78: A correction sets `updatedAt`, and the page shows it

**Files:**
- Modify: `gate/src/render/frontmatter.ts` (`NewsFrontmatter` accepts `updatedAt`)
- Modify: `gate/src/render/render.ts` (`RenderMeta.updatedAt`, written to the frontmatter)
- Modify: `site/src/lib/desk-state.ts` (`correctionDay`, `latestCorrectionDay`)
- Modify: `site/src/lib/jsonld.ts` (`dateModified`)
- Modify: `site/src/lib/match-pieces.ts` (the build refuses a piece that disagrees with its corrections), `site/src/lib/pieces.ts` (passes the corrections in)
- Modify: `site/src/lib/desk-pages.ts` (new `CORRECTIONS_TEXT`), `site/src/pages/corrections/index.astro`, `site/src/pages/method/index.astro` (both use it)
- Modify: `site/src/pages/news/[slug]/index.astro` (the byline)
- Modify: `site/scripts/generate-fixtures.ts` (a piece with a correction gets `updatedAt`), `site/src/content-fixtures/news/fixture-robotics-ships-fx-2-to-second-plant.mdx` (regenerated)
- Test: `gate/test/render.test.ts`, `site/test/desk-state.test.ts`, `site/test/jsonld.test.ts`, `site/test/match-pieces.test.ts`, `site/test/desk-pages.test.ts`, `site/test/fixtures.test.ts`

The content contract gives a news piece an optional `updatedAt`, and two pages of the site said what a correction does with it: the corrections page said that "its updated date changes" and the method page that "the page's updated date is set". Plan 1 did neither. `NewsFrontmatter` is a strict object without the key, so a piece with `updatedAt` would have failed the build as an unknown key; the renderer never wrote it; the article page showed no updated date; and only the structured data moved when a correction was recorded. This task builds what the two pages promised.

1. `NewsFrontmatter` accepts `updatedAt` (`YYYY-MM-DD`, a real date, never before `publishedAt`), and the renderer writes it, from a new optional `RenderMeta.updatedAt`, between `publishedAt` and `categories`: the order of the contract is title, description, publishedAt, updatedAt, categories, format, featured, author.
2. The article byline reads `Updated <date>` when the piece has `updatedAt`. In the structured data, `dateModified` is `updatedAt` when there is one, otherwise the time of the latest correction or retraction recorded for the piece, otherwise `publishedAt`.
3. The build refuses a piece and a desk state that disagree. A correction or a retraction is recorded in `desk-state.json` with a time; its day (in UTC) is what `updatedAt` must be. `matchPieces` now takes the corrections and fails with a message that names the piece when the desk state has a correction for it and the piece has no `updatedAt`, or one that is not the day of the latest correction, and also when a piece says it was updated and nothing is recorded: the site promises that nothing changes without a record.
4. The generator of the fixture pieces reads the desk state, so the piece that has a correction (`fx-2`) is written with the matching `updatedAt`.
5. The corrections page and the method page say the same thing, from one constant, and say only what the site now does. They say nothing about who records an entry: the command that writes one is not built yet.

- [ ] **Step 1: Write the failing gate tests**

The tests cover the frontmatter that the renderer writes (with and without the date, with a date that is not real and one before publication), and the schema.

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('parses as YAML and satisfies NewsFrontmatter', () => {
    const data = parseYaml(splitMdx(mdx).frontmatter) as unknown;
```

**with:**
```ts
  });

  it('writes updatedAt between publishedAt and categories when the meta has one, and nowhere else', () => {
    const updated = render(golden, { updatedAt: '2026-10-05' });
    expect(splitMdx(updated.mdx).frontmatter.split('\n')).toEqual([
      'title: "Fixture Robotics ships its FX-1 warehouse arm to a second plant"',
      'description: "Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor."',
      'publishedAt: "2026-10-04"',
      'updatedAt: "2026-10-05"',
      'categories: [industrial-warehouse, funding]',
      'format: news',
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
    expect(splitMdx(updated.mdx).body).toBe(splitMdx(mdx).body);
    expect(updated.ledger).toEqual(ledger);
    expect(mdx).not.toContain('updatedAt');
  });

  it('accepts an update on the day of publication, and refuses one that is not a real date or comes before it', () => {
    expect(splitMdx(render(golden, { updatedAt: '2026-10-04' }).mdx).frontmatter).toContain('updatedAt: "2026-10-04"');
    expect(() => render(golden, { updatedAt: '2026-02-30' })).toThrow('renderDraft: updatedAt "2026-02-30" is not a real date in the form YYYY-MM-DD');
    expect(() => render(golden, { updatedAt: '5 Oct 2026' })).toThrow('renderDraft: updatedAt "5 Oct 2026" is not a real date');
    expect(() => render(golden, { updatedAt: '2026-10-03' })).toThrow('renderDraft: updatedAt "2026-10-03" is before publishedAt "2026-10-04"');
  });

  it('parses as YAML and satisfies NewsFrontmatter', () => {
    const data = parseYaml(splitMdx(mdx).frontmatter) as unknown;
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('accepts a title and a description of one character', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, title: 'A', description: 'D' }).success).toBe(true);
```

**with:**
```ts
  });

  it('accepts an updatedAt on the day of publication or after it, and a block without one', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt: '2026-10-04' }).success).toBe(true);
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt: '2026-11-01' }).success).toBe(true);
    expect(NewsFrontmatter.parse(valid)).not.toHaveProperty('updatedAt');
  });

  it.each([
    ['an updatedAt before the publication date', '2026-10-03'],
    ['an updatedAt that is not a calendar date', '2026-02-30'],
    ['an updatedAt written as words', '5 October 2026'],
    ['an updatedAt with a time', '2026-10-05T10:00:00Z'],
  ])('rejects %s', (_label, updatedAt) => {
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt }).success).toBe(false);
  });

  it('accepts a title and a description of one character', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, title: 'A', description: 'D' }).success).toBe(true);
```

Run: `npm test --workspace @robywire/gate -- test/render.test.ts`
Expected: FAIL — `writes updatedAt between publishedAt and categories when the meta has one` and `accepts an updatedAt on the day of publication or after it`.

- [ ] **Step 2: Write the schema and the renderer**

`NewsFrontmatter` stays one exported schema. The object is now called `Block`, and the export adds the rule that compares the two dates.

**In `gate/src/render/frontmatter.ts`, replace:**
```ts
 * categories are one to three different slugs from the vocabulary, and the
 * funding tag comes with a beat; the author is the Desk.
 */
export const NewsFrontmatter = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).max(155),
  publishedAt: z.iso.date(),
  categories: z
    .array(z.enum(CATEGORY_VOCAB))
```

**with:**
```ts
 * categories are one to three different slugs from the vocabulary, and the
 * funding tag comes with a beat; the author is the Desk.
 *
 * `updatedAt` is the day a correction or a retraction was recorded for the
 * piece. It is optional and never before `publishedAt`. The site also checks
 * that it agrees with the corrections in the desk state.
 */
const Block = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).max(155),
  publishedAt: z.iso.date(),
  updatedAt: z.iso.date().optional(),
  categories: z
    .array(z.enum(CATEGORY_VOCAB))
```

**In `gate/src/render/frontmatter.ts`, replace:**
```ts
  author: z.strictObject({ name: z.literal(DESK_AUTHOR_NAME) }),
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
```

**with:**
```ts
  author: z.strictObject({ name: z.literal(DESK_AUTHOR_NAME) }),
});

export const NewsFrontmatter = Block.refine((block) => block.updatedAt === undefined || block.updatedAt >= block.publishedAt, {
  message: 'updatedAt is before publishedAt',
  path: ['updatedAt'],
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
```

**In `gate/src/render/render.ts`, replace:**
```ts
import type { GateResult } from '../gate';
import type { Claim, Draft, LedgerEntry, LedgerSentence, Sentence } from '../schemas';
import { allSentences } from '../sentences';
```

**with:**
```ts
import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Claim, Draft, LedgerEntry, LedgerSentence, Sentence } from '../schemas';
import { allSentences } from '../sentences';
```

**In `gate/src/render/render.ts`, replace:**
```ts
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
}

```

**with:**
```ts
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
  /**
   * The day (YYYY-MM-DD) a correction or a retraction was recorded for the piece. It is written to
   * the frontmatter as `updatedAt`; a piece that was never corrected has none.
   */
  updatedAt?: string;
}

```

**In `gate/src/render/render.ts`, replace:**
```ts
    if (!PLAIN_SLUG.test(category)) throw new Error(`renderDraft: the category "${category}" is not a plain slug`);
  }
  const frontmatter = [
    '---',
```

**with:**
```ts
    if (!PLAIN_SLUG.test(category)) throw new Error(`renderDraft: the category "${category}" is not a plain slug`);
  }
  const { updatedAt } = meta;
  if (updatedAt !== undefined) {
    const day = dayNumber(updatedAt);
    if (day === undefined) throw new Error(`renderDraft: updatedAt "${updatedAt}" is not a real date in the form YYYY-MM-DD`);
    if (day < (dayNumber(draft.publishedAt) ?? NaN)) throw new Error(`renderDraft: updatedAt "${updatedAt}" is before publishedAt "${draft.publishedAt}"`);
  }
  const frontmatter = [
    '---',
```

**In `gate/src/render/render.ts`, replace:**
```ts
    `description: ${JSON.stringify(draft.description.text)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    `categories: [${draft.categories.join(', ')}]`,
    'format: news',
```

**with:**
```ts
    `description: ${JSON.stringify(draft.description.text)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    ...(updatedAt === undefined ? [] : [`updatedAt: ${JSON.stringify(updatedAt)}`]),
    `categories: [${draft.categories.join(', ')}]`,
    'format: news',
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  34 passed (34)`.

- [ ] **Step 3: Write the failing site tests**

The day of a correction is the UTC day of its time, and the latest correction is the latest moment, not the last line of the file.

**In `site/test/desk-state.test.ts`, replace:**
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionsFor, getDeskState, newestFirst, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
```

**with:**
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionDay, correctionsFor, getDeskState, latestCorrectionDay, newestFirst, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
```

**In `site/test/desk-state.test.ts`, replace:**
```ts
    expect(items.map((item) => item.at)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
  });
});
```

**with:**
```ts
    expect(items.map((item) => item.at)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
  });
});

describe('correctionDay', () => {
  it('is the UTC day of the moment', () => {
    expect(correctionDay('2026-10-03T09:12:00Z')).toBe('2026-10-03');
    expect(correctionDay('2026-10-03T23:59:59Z')).toBe('2026-10-03');
    expect(correctionDay('2026-10-04T00:00:00Z')).toBe('2026-10-04');
  });

  it('converts a time with an offset to UTC first: 01:30 at +05:30 is the day before', () => {
    expect(correctionDay('2026-10-04T01:30:00+05:30')).toBe('2026-10-03');
    expect(correctionDay('2026-10-03T22:30:00-05:00')).toBe('2026-10-04');
  });
});

describe('latestCorrectionDay', () => {
  const corrections = [
    correction('2026-10-02T08:00:00Z', FX2),
    correction('2026-10-04T10:00:00Z', FX2, 'retraction'),
    correction('2026-10-06T00:00:00Z', 'other-piece'),
    correction('2026-10-03T09:12:00Z', FX2),
  ];

  it('is the day of the latest correction or retraction of the piece, whatever their order', () => {
    expect(latestCorrectionDay(corrections, FX2)).toBe('2026-10-04');
    expect(latestCorrectionDay([...corrections].reverse(), FX2)).toBe('2026-10-04');
  });

  it('is undefined for a piece with no entry', () => {
    expect(latestCorrectionDay(corrections, 'no-such-piece')).toBeUndefined();
    expect(latestCorrectionDay([], FX2)).toBeUndefined();
  });

  it('compares moments, not text: the later moment wins even when its text sorts first', () => {
    const mixed = [correction('2026-10-04T01:30:00+05:30', FX2), correction('2026-10-03T21:00:00Z', FX2)];
    expect(latestCorrectionDay(mixed, FX2)).toBe('2026-10-03');
  });
});
```

**In `site/test/jsonld.test.ts`, replace:**
```ts
  });

  it('ignores corrections of other pieces', () => {
    expect(newsArticleJsonLd(piece, [correction('2026-10-05T00:00:00Z', 'another-piece')], SITE).dateModified).toBe('2026-10-03');
```

**with:**
```ts
  });

  it('is updatedAt when the piece has one, even when a correction was recorded at another moment', () => {
    const updated = { ...piece, updatedAt: '2026-10-05' };
    expect(newsArticleJsonLd(updated, [], SITE).dateModified).toBe('2026-10-05');
    expect(newsArticleJsonLd(updated, [correction('2026-10-04T10:00:00Z')], SITE).dateModified).toBe('2026-10-05');
  });

  it('still names the publication date as datePublished when the piece was updated', () => {
    expect(newsArticleJsonLd({ ...piece, updatedAt: '2026-10-05' }, [], SITE).datePublished).toBe('2026-10-03');
  });

  it('ignores corrections of other pieces', () => {
    expect(newsArticleJsonLd(piece, [correction('2026-10-05T00:00:00Z', 'another-piece')], SITE).dateModified).toBe('2026-10-03');
```

`matchPieces` gets a third argument. Every existing call passes `[]`, and a new group of tests covers the rules above.

**In `site/test/match-pieces.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import type { NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from '../src/lib/match-pieces';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from '../src/lib/match-pieces';

```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
}

const matched = (...pairs: ReturnType<typeof pair>[]) => matchPieces(pairs.map((p) => p.news), pairs.map((p) => p.ledger));

describe('matchPieces: joining', () => {
  it('returns an empty list when there is no content', () => {
    expect(matchPieces([], [])).toEqual([]);
  });

```

**with:**
```ts
}

const matched = (...pairs: ReturnType<typeof pair>[]) => matchPieces(pairs.map((p) => p.news), pairs.map((p) => p.ledger), []);

describe('matchPieces: joining', () => {
  it('returns an empty list when there is no content', () => {
    expect(matchPieces([], [], [])).toEqual([]);
  });

```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    const result = matchPieces([a.news, b.news], [b.ledger, a.ledger]);
    expect(result.map((piece) => [piece.slug, piece.ledger.id])).toEqual([
      ['a-piece', 'a-piece'],
```

**with:**
```ts
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    const result = matchPieces([a.news, b.news], [b.ledger, a.ledger], []);
    expect(result.map((piece) => [piece.slug, piece.ledger.id])).toEqual([
      ['a-piece', 'a-piece'],
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
    const b = pair('b-piece', '2026-10-04');
    const news = [a.news, b.news];
    matchPieces(news, [a.ledger, b.ledger]);
    expect(news.map((entry) => entry.id)).toEqual(['a-piece', 'b-piece']);
  });
```

**with:**
```ts
    const b = pair('b-piece', '2026-10-04');
    const news = [a.news, b.news];
    matchPieces(news, [a.ledger, b.ledger], []);
    expect(news.map((entry) => entry.id)).toEqual(['a-piece', 'b-piece']);
  });
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
  it('names a piece that has no ledger entry', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([a.news], [])).toThrow('the piece "a-piece" has no ledger file');
  });

  it('names a ledger entry that has no piece', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([], [a.ledger])).toThrow('the ledger entry "a-piece" has no piece');
  });

```

**with:**
```ts
  it('names a piece that has no ledger entry', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([a.news], [], [])).toThrow('the piece "a-piece" has no ledger file');
  });

  it('names a ledger entry that has no piece', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([], [a.ledger], [])).toThrow('the ledger entry "a-piece" has no piece');
  });

```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [b.ledger])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has no ledger file\n- the ledger entry "b-piece" has no piece',
    );
  });
});
```

**with:**
```ts
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [b.ledger], [])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has no ledger file\n- the ledger entry "b-piece" has no piece',
    );
  });
});

describe('matchPieces: corrections and the updated date', () => {
  const correction = (at: string, slug: string, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: 'A note.' });
  const withUpdate = (updatedAt: string | undefined) => {
    const a = pair('a-piece', '2026-10-01');
    if (updatedAt !== undefined) a.news.data.updatedAt = updatedAt;
    return a;
  };
  const run = (updatedAt: string | undefined, corrections: DeskState['corrections']) => {
    const a = withUpdate(updatedAt);
    return () => matchPieces([a.news], [a.ledger], corrections);
  };

  it('accepts a piece whose updatedAt is the day of its latest correction', () => {
    expect(run('2026-10-03', [correction('2026-10-03T09:12:00Z', 'a-piece')])()).toHaveLength(1);
  });

  it('accepts a piece with no correction and no updatedAt, and corrections of pieces the site does not have', () => {
    expect(run(undefined, [])()).toHaveLength(1);
    expect(run(undefined, [correction('2026-10-03T09:12:00Z', 'another-piece')])()).toHaveLength(1);
  });

  it('uses the latest of several corrections, a retraction included, whatever their order', () => {
    const corrections = [correction('2026-10-04T10:00:00Z', 'a-piece', 'retraction'), correction('2026-10-03T09:12:00Z', 'a-piece')];
    expect(run('2026-10-04', corrections)()).toHaveLength(1);
    expect(run('2026-10-04', [...corrections].reverse())()).toHaveLength(1);
    expect(run('2026-10-03', corrections)).toThrow('says updatedAt is 2026-10-03, but its latest correction or retraction was recorded on 2026-10-04');
  });

  it('stops the build, saying what to add, when a correction is recorded and the piece has no updatedAt', () => {
    expect(run(undefined, [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter',
    );
  });

  it('stops the build when updatedAt is not the day of the latest correction', () => {
    expect(run('2026-10-02', [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'the piece "a-piece" says updatedAt is 2026-10-02, but its latest correction or retraction was recorded on 2026-10-03',
    );
  });

  it('stops the build when a piece says it was updated and no correction or retraction is recorded for it', () => {
    expect(run('2026-10-03', [])).toThrow('the piece "a-piece" has updatedAt 2026-10-03, but no correction or retraction is recorded for it');
    expect(run('2026-10-03', [correction('2026-10-03T09:12:00Z', 'another-piece')])).toThrow('no correction or retraction is recorded for it');
  });

  it('reads the day of a correction in UTC', () => {
    expect(run('2026-10-03', [correction('2026-10-04T01:30:00+05:30', 'a-piece')])()).toHaveLength(1);
  });

  it('reports this problem together with the others, under the one heading', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news, b.news], [a.ledger], [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter\n- the piece "b-piece" has no ledger file',
    );
  });
});
```

The shared text of the two pages is a constant, and a test fixes what it says.

**In `site/test/desk-pages.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionRows, holdRows, statusView } from '../src/lib/desk-pages';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { CORRECTIONS_TEXT, correctionRows, holdRows, statusView } from '../src/lib/desk-pages';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
```

**In `site/test/desk-pages.test.ts`, replace:**
```ts
    expect(rows.map((row) => row.title)).toEqual([undefined, 'A title']);
  });
});
```

**with:**
```ts
    expect(rows.map((row) => row.title)).toEqual([undefined, 'A title']);
  });
});

describe('CORRECTIONS_TEXT', () => {
  it('says what the site does when a correction is recorded: a notice at the top, an updated date in the byline, a build that refuses a mismatch', () => {
    expect(CORRECTIONS_TEXT).toContain('a notice at the top that says what changed and when');
    expect(CORRECTIONS_TEXT).toContain('its byline shows the date it was updated');
    expect(CORRECTIONS_TEXT).toContain('refuses to build if the piece and the record disagree');
  });

  it('keeps the retraction promise: the page stays up with its notice and the receipts stay public', () => {
    expect(CORRECTIONS_TEXT).toContain('A retraction withdraws a piece: the page stays up with its notice, and its receipts stay public.');
  });

  it('speaks of what the site shows, not of an updated date that "is set"', () => {
    expect(CORRECTIONS_TEXT).not.toMatch(/\bis set\b/);
  });
});
```

Run: `npm test --workspace @robywire/site -- test/desk-state.test.ts test/jsonld.test.ts test/match-pieces.test.ts test/desk-pages.test.ts`
Expected: FAIL — `latestCorrectionDay`, `is updatedAt when the piece has one` and `matchPieces: corrections and the updated date`.

- [ ] **Step 4: Write the site code**

**In `site/src/lib/desk-state.ts`, replace:**
```ts
  return newestFirst(state.corrections.filter((entry) => entry.slug === slug));
}
```

**with:**
```ts
  return newestFirst(state.corrections.filter((entry) => entry.slug === slug));
}

/** The UTC day (YYYY-MM-DD) of the moment `at`, which may be written with any UTC offset. */
export function correctionDay(at: string): string {
  return new Date(Date.parse(at)).toISOString().slice(0, 10);
}

/**
 * The day of the latest correction or retraction recorded for the piece `slug`, or undefined if there is none.
 * A piece that has one must say so in its frontmatter: `updatedAt` is this day (see match-pieces.ts).
 */
export function latestCorrectionDay(corrections: DeskState['corrections'], slug: string): string | undefined {
  const latest = newestFirst(corrections.filter((entry) => entry.slug === slug))[0];
  return latest === undefined ? undefined : correctionDay(latest.at);
}
```

**In `site/src/lib/jsonld.ts`, replace:**
```ts
  /** YYYY-MM-DD */
  publishedAt: string;
}

/**
 * The NewsArticle data for a piece. `dateModified` is the time of the latest
 * correction or retraction recorded for the piece, or the publication date if
 * there is none. `siteUrl` is the site's address, such as "https://robywire.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
```

**with:**
```ts
  /** YYYY-MM-DD */
  publishedAt: string;
  /** YYYY-MM-DD, present when a correction or a retraction has been recorded for the piece. */
  updatedAt?: string;
}

/**
 * The NewsArticle data for a piece. `dateModified` is the piece's `updatedAt`
 * when it has one; otherwise the time of the latest correction or retraction
 * recorded for it; otherwise the publication date. `siteUrl` is the site's
 * address, such as "https://robywire.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
```

**In `site/src/lib/jsonld.ts`, replace:**
```ts
    description: piece.description,
    datePublished: piece.publishedAt,
    dateModified: latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
```

**with:**
```ts
    description: piece.description,
    datePublished: piece.publishedAt,
    dateModified: piece.updatedAt ?? latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';

// A piece is two files with the same name: the MDX the reader sees and the
```

**with:**
```ts
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';

// A piece is two files with the same name: the MDX the reader sees and the
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
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
```

**with:**
```ts
 * the same day stay in slug order, because the lists are sorted by id first and
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, title, date or categories disagree with its piece, and a piece whose
 * `updatedAt` does not agree with the corrections recorded for it: a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
 * one, and a piece that says it was updated needs a record that explains it.
 */
export function matchPieces<N extends Keyed<NewsFrontmatter>, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
  corrections: DeskState['corrections'],
): Matched<N, L>[] {
  const ledgerById = new Map(ledgers.map((entry) => [entry.id, entry]));
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });
  }
  for (const ledger of [...ledgers].sort(byId)) {
```

**with:**
```ts
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });

    const recorded = latestCorrectionDay(corrections, piece.id);
    const { updatedAt } = piece.data;
    if (recorded !== undefined && updatedAt === undefined) {
      problems.push(`the piece "${piece.id}" has a correction or retraction recorded on ${recorded} but no updatedAt; add updatedAt: "${recorded}" to its frontmatter`);
    } else if (recorded !== undefined && updatedAt !== recorded) {
      problems.push(`the piece "${piece.id}" says updatedAt is ${updatedAt}, but its latest correction or retraction was recorded on ${recorded}`);
    } else if (recorded === undefined && updatedAt !== undefined) {
      problems.push(`the piece "${piece.id}" has updatedAt ${updatedAt}, but no correction or retraction is recorded for it`);
    }
  }
  for (const ledger of [...ledgers].sort(byId)) {
```

**In `site/src/lib/desk-pages.ts`, replace:**
```ts
// state. The pages only lay these rows out.

export interface StatusView {
  lastRun: { when: string; outcome: string; runId: string; slug: string | null } | null;
```

**with:**
```ts
// state. The pages only lay these rows out.

/**
 * What the site does when a correction or a retraction is recorded, for the
 * corrections page and the method page. It describes the site, and says nothing
 * about who records the entry: the command that writes one is not built yet.
 */
export const CORRECTIONS_TEXT =
  'Nothing on this site is changed or removed without a record. When a correction or a retraction is recorded for a piece, the article shows a notice at the top that says what changed and when, and its byline shows the date it was updated; the site refuses to build if the piece and the record disagree. A correction fixes a factual error. A retraction withdraws a piece: the page stays up with its notice, and its receipts stay public.';

export interface StatusView {
  lastRun: { when: string; outcome: string; runId: string; slug: string | null } | null;
```

Run: `npm test --workspace @robywire/site -- test/desk-state.test.ts test/jsonld.test.ts test/match-pieces.test.ts test/desk-pages.test.ts`
Expected: PASS — `Test Files  4 passed (4)`.

- [ ] **Step 5: Use it in the pages**

`getPieces` reads the desk state and passes its corrections to `matchPieces`, so every page of the site is built from pieces that agree with it.

**In `site/src/lib/pieces.ts`, replace:**
```ts
import type { CollectionEntry } from 'astro:content';
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from './match-pieces';

```

**with:**
```ts
import type { CollectionEntry } from 'astro:content';
import type { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { getDeskState } from './desk-state';
import { matchPieces } from './match-pieces';

```

**In `site/src/lib/pieces.ts`, replace:**
```ts
}

/** Every piece, newest first. Throws if a piece and its ledger do not belong together. */
export async function getPieces(): Promise<Piece[]> {
  const [news, ledgers] = await Promise.all([getCollection('news'), getCollection('ledger')]);
  return matchPieces(news, ledgers).map(({ slug, news: entry, ledger }) => ({ slug, data: entry.data, ledger: ledger.data, entry }));
}
```

**with:**
```ts
}

/** Every piece, newest first. Throws if a piece and its ledger, or its updatedAt and the desk state, do not belong together. */
export async function getPieces(): Promise<Piece[]> {
  const [news, ledgers, state] = await Promise.all([getCollection('news'), getCollection('ledger'), getDeskState()]);
  return matchPieces(news, ledgers, state.corrections).map(({ slug, news: entry, ledger }) => ({ slug, data: entry.data, ledger: ledger.data, entry }));
}
```

The article page shows the date in the byline.

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
      <h1>{piece.data.title}</h1>
      <p class="dek">{piece.data.description}</p>
      <p class="byline"><a href="/method/">{DESK_AUTHOR_NAME} &middot; {DESK_BYLINE_LABEL}</a> &middot; <time datetime={piece.data.publishedAt}>{formatDate(piece.data.publishedAt)}</time></p>
    </header>
    <CorrectionNotice corrections={corrections} />
```

**with:**
```astro
      <h1>{piece.data.title}</h1>
      <p class="dek">{piece.data.description}</p>
      <p class="byline">
        <a href="/method/">{DESK_AUTHOR_NAME} &middot; {DESK_BYLINE_LABEL}</a> &middot; <time datetime={piece.data.publishedAt}>{formatDate(piece.data.publishedAt)}</time>
        {piece.data.updatedAt !== undefined && <> &middot; Updated <time datetime={piece.data.updatedAt}>{formatDate(piece.data.updatedAt)}</time></>}
      </p>
    </header>
    <CorrectionNotice corrections={corrections} />
```

The corrections page and the method page take their text from the constant.

**In `site/src/pages/corrections/index.astro`, replace:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { correctionRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
import { articlePath } from '../../lib/paths';
```

**with:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { CORRECTIONS_TEXT, correctionRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
import { articlePath } from '../../lib/paths';
```

**In `site/src/pages/corrections/index.astro`, replace:**
```astro
    </header>
    <div class="page-text">
      <p>
        Nothing on this site is changed or removed without a record. A correction fixes a factual error: the article gets a notice at the top and its updated date changes. A retraction withdraws a
        piece: the page stays up with a notice, and its receipts stay public. Both are listed here.
      </p>
    </div>
    {
```

**with:**
```astro
    </header>
    <div class="page-text">
      <p>{CORRECTIONS_TEXT} Both are listed here.</p>
    </div>
    {
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';
```

**with:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

      <h2 id="corrections">Corrections and retractions</h2>
      <p>
        Nothing is edited or removed in silence. A correction fixes a factual error: the article gets a notice at the top that says what changed and when, the page's updated date is set, and the
        correction is listed on the <a href="/corrections/">corrections page</a>. A retraction withdraws a piece: the page stays up with a visible notice, and its receipts stay public.
      </p>

      <h2 id="disclosure">Disclosure</h2>
```

**with:**
```astro

      <h2 id="corrections">Corrections and retractions</h2>
      <p>{CORRECTIONS_TEXT} Every entry is listed on the <a href="/corrections/">corrections page</a>.</p>

      <h2 id="disclosure">Disclosure</h2>
```

Run: `npm run typecheck`
Expected: PASS — `0 errors`

- [ ] **Step 6: See the build refuse the fixtures as they are**

The desk state of the fixtures has a correction for the `fx-2` piece, and the committed `fx-2` piece has no `updatedAt`. The build now says so, and names the piece and the date to add.

Run: `npm run build:fixtures`
Expected: FAIL — `The site content does not fit together` and `has a correction or retraction recorded on 2026-10-03 but no updatedAt`.

- [ ] **Step 7: Write the failing fixture test, and teach the generator**

**In `site/test/fixtures.test.ts`, replace:**
```ts
  });

  it('names a different product in each piece', () => {
    const titles = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).title);
```

**with:**
```ts
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
```

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: FAIL — `gives the corrected piece an updatedAt on the day of its correction, and no other piece one`

The generator reads the corrections from the desk state it is about to write, and gives each piece the day of its latest one.

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeVariant } from '@robywire/gate/fixtures';

// Writes the fixture content the site shows when it is built with
```

**with:**
```ts
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeVariant } from '@robywire/gate/fixtures';
import { latestCorrectionDay } from '../src/lib/desk-state';

// Writes the fixture content the site shows when it is built with
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
 * content, in sorted order. A piece that does not pass the whole gate stops
 * the generator: a fixture must be something the real site could publish.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
  const files = new Map<string, string>();
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
```

**with:**
```ts
 * content, in sorted order. A piece that does not pass the whole gate stops
 * the generator: a fixture must be something the real site could publish.
 * A piece that has a correction in the desk state gets `updatedAt`, the day
 * of its latest one, as the site requires.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
  const files = new Map<string, string>();
  const state = deskState(all);
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
      throw new Error(`generate-fixtures: the fixture ${piece.slug} does not publish (route ${result.route}: ${codes})`);
    }
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, { runId: piece.runId, gate: result });
    files.set(`news/${piece.slug}.mdx`, mdx);
    files.set(`ledger/${piece.slug}.json`, json(ledger));
  }
  files.set('desk-state.json', json(deskState(all)));
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
```

**with:**
```ts
      throw new Error(`generate-fixtures: the fixture ${piece.slug} does not publish (route ${result.route}: ${codes})`);
    }
    const updatedAt = latestCorrectionDay(state.corrections, piece.slug);
    const meta = { runId: piece.runId, gate: result, ...(updatedAt === undefined ? {} : { updatedAt }) };
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, meta);
    files.set(`news/${piece.slug}.mdx`, mdx);
    files.set(`ledger/${piece.slug}.json`, json(ledger));
  }
  files.set('desk-state.json', json(state));
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
```

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 8: Show that the committed fixtures are out of date, and regenerate them**

Run: `npm run fixtures:check`
Expected: FAIL — `+updatedAt: "2026-10-03"` and `Fixtures are out of date`.

Run: `npm run fixtures:generate --workspace @robywire/site`

Run: `git status --short`
Expected: PASS — ` M site/src/content-fixtures/news/fixture-robotics-ships-fx-2-to-second-plant.mdx`

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 9: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 10: Look at the byline and the structured data in the built pages**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

The corrected piece shows its update date after the publication date. The other pieces show none.

Run: `grep -o 'Updated <time datetime="[^"]*">[^<]*' site/dist/news/fixture-robotics-ships-fx-2-to-second-plant/index.html`
Expected: PASS — `Updated <time datetime="2026-10-03">3 Oct 2026`

Run: `grep -c 'Updated <time' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: FAIL — `0`

Run: `grep -o '"dateModified":"[^"]*"' site/dist/news/fixture-robotics-ships-fx-2-to-second-plant/index.html`
Expected: PASS — `"dateModified":"2026-10-03"`

- [ ] **Step 11: Commit**

```bash
git add gate/src gate/test site/scripts site/src site/test
git commit -m "feat: a correction sets updatedAt, the article byline shows it, and the build refuses a piece that disagrees with its corrections" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 79: The article and its ledger cannot drift apart

**Files:**
- Create: `gate/src/render/body.ts` (`renderBody`, and the two fixed headings)
- Modify: `gate/src/render/index.ts` (export it), `gate/src/render/render.ts` (the body of the MDX is `renderBody(ledger)`)
- Modify: `gate/src/sentences.ts` (each located sentence has its `paragraph`), `gate/src/schemas.ts` (`LedgerSentence.paragraph`)
- Modify: `site/src/lib/match-pieces.ts` (the build refuses a body that is not what the ledger renders)
- Modify: `site/src/content-fixtures/ledger/*.json` (regenerated: each ledger sentence has its paragraph)
- Modify: `README.md` (what the site refuses to build)
- Test: `gate/test/sentences.test.ts`, `gate/test/render.test.ts`, `gate/test/schemas.test.ts`, `site/test/match-pieces.test.ts`

A published piece is two files: the MDX that readers see and the ledger JSON behind its receipts. The renderer wrote both from one draft, and nothing afterwards compared them. Someone could fix a typo in the MDX, or in the ledger, and the receipts page would then show a sentence that the article no longer says. Nothing in the build would notice. The promise of the site is that each sentence on the page is the sentence that was traced to its claims, so the two files must not be able to differ.

The way to make that impossible is to have one author. The ledger already holds every sentence of the article, in order, with its section, its heading, its kind and its claims. What it lacked was the paragraph a sentence belongs to. This task adds that, and one function that writes the article body from the ledger and from nothing else.

1. `LocatedSentence` (what `allSentences` returns) and `LedgerSentence` gain `paragraph`, counted from 0 within the section or list: the opening and the limitations are one paragraph each, so 0; each key takeaway is a bullet of its own, so its index; the paragraphs of a body section count from 0 under their heading. Neighbouring sections that share a heading are one section on the page, so they go on counting; an empty paragraph is not counted.
2. `renderBody(ledger)` writes the MDX below the frontmatter: the opening paragraph, the takeaways, each body section under its heading, the limitations, with the labels (`Analysis.`, `Unconfirmed.`) and the numbered claim markers. `renderDraft` builds the ledger first and then writes the body with this function. It has no second way to write the article, so the body of a rendered piece is `renderBody(ledger)` by construction.
3. `matchPieces` calls `renderBody` for every piece. If the body of the MDX file is not exactly what the ledger renders, the build stops, with a message that names the piece and the first line and column that differ. If the ledger itself cannot be written as a body (a sentence cites a claim that the ledger's `order` does not list, or a body sentence has no heading), `renderBody` throws, and the build stops with a message that names the piece.
4. Because `paragraph` is required in the ledger, the committed fixture ledgers must be regenerated.

- [ ] **Step 1: Write the failing gate tests**

`allSentences` numbers the paragraphs, including the cases where two sections share a heading, a heading comes back after another one, and a paragraph or a whole section is empty.

**In `gate/test/sentences.test.ts`, replace:**
```ts
  });

  it('handles a draft with nothing but a title and a description', () => {
    const bare: Draft = {
```

**with:**
```ts
  });

  it('numbers the paragraph of each sentence from 0 within its section or list: the opening and the limitations are one paragraph, each takeaway is its own', () => {
    const paragraphs = (section: string) => located.filter((item) => item.section === section).map((item) => item.paragraph);
    expect(paragraphs('title')).toEqual([0]);
    expect(paragraphs('description')).toEqual([0]);
    expect(located.filter((item) => item.section === 'description').map((item) => item.position)).toEqual([1]);
    expect(new Set(paragraphs('opening'))).toEqual(new Set([0]));
    expect(paragraphs('takeaways')).toEqual(GOLDEN_DRAFT.takeaways.map((_item, at) => at));
    expect(new Set(paragraphs('limitations'))).toEqual(new Set([0]));
  });

  it('numbers the paragraphs of a body section from 0 under its heading, a paragraph holding all its sentences', () => {
    for (const section of GOLDEN_DRAFT.sections) {
      const inSection = located.filter((item) => item.heading === section.heading);
      expect(inSection.map((item) => item.paragraph)).toEqual(section.paragraphs.flatMap((paragraph, at) => paragraph.map(() => at)));
    }
  });

  describe('when headings repeat or sections are empty', () => {
    const sentence = (text: string): Draft['opening'][number] => ({ kind: 'fact', text, claimIds: ['c-1'] });
    const draftWith = (sections: Draft['sections']): Draft => ({ ...GOLDEN_DRAFT, opening: [], takeaways: [], limitations: [], sections });
    const body = (draft: Draft) => allSentences(draft).filter((item) => item.section === 'body').map((item) => [item.sentence.text, item.paragraph]);

    it('goes on counting across neighbouring sections that share a heading, as the page shows them as one section', () => {
      const draft = draftWith([
        { heading: 'Same', paragraphs: [[sentence('a')], [sentence('b')]] },
        { heading: 'Same', paragraphs: [[sentence('c')]] },
        { heading: 'Other', paragraphs: [[sentence('d')]] },
      ]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
    });

    it('starts again from 0 when the same heading comes back after another one', () => {
      const draft = draftWith([
        { heading: 'Same', paragraphs: [[sentence('a')], [sentence('b')]] },
        { heading: 'Other', paragraphs: [[sentence('c')]] },
        { heading: 'Same', paragraphs: [[sentence('d')]] },
      ]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1], ['c', 0], ['d', 0]]);
    });

    it('does not count an empty paragraph', () => {
      const draft = draftWith([{ heading: 'Same', paragraphs: [[sentence('a')], [], [sentence('b')]] }]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1]]);
    });

    it('lists nothing for a section with no sentence in it', () => {
      const draft = draftWith([{ heading: 'Empty', paragraphs: [[]] }, { heading: 'Full', paragraphs: [[sentence('a')]] }]);
      expect(body(draft)).toEqual([['a', 0]]);
    });
  });

  it('handles a draft with nothing but a title and a description', () => {
    const bare: Draft = {
```

The schema requires the paragraph.

**In `gate/test/schemas.test.ts`, replace:**
```ts
  order: ['c-1'],
  sentences: [
    { index: 0, section: 'title', kind: 'fact', text: 'Fixture Robotics ships the FX-1 arm.', claimIds: ['c-1'] },
    {
      index: 1,
      section: 'body',
      heading: 'What shipped',
      kind: 'fact',
```

**with:**
```ts
  order: ['c-1'],
  sentences: [
    { index: 0, section: 'title', paragraph: 0, kind: 'fact', text: 'Fixture Robotics ships the FX-1 arm.', claimIds: ['c-1'] },
    {
      index: 1,
      section: 'body',
      paragraph: 0,
      heading: 'What shipped',
      kind: 'fact',
```

**In `gate/test/schemas.test.ts`, replace:**
```ts
  });

  it('accepts attributed on a ledger sentence, as true or false, and refuses anything else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', true));
```

**with:**
```ts
  });

  it('requires the paragraph of a ledger sentence, a whole number from 0', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', undefined))).toEqual(['sentences.1.paragraph']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', -1))).toEqual(['sentences.1.paragraph']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', 1.5))).toEqual(['sentences.1.paragraph']);
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', 3));
  });

  it('accepts attributed on a ledger sentence, as true or false, and refuses anything else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', true));
```

The renderer tests state the main property: the body of the MDX that `renderDraft` writes is exactly `renderBody` of its ledger, for the golden piece and for the piece that rests on another outlet, and `renderBody` needs nothing but the ledger (a ledger read back from its JSON gives the same body). The other tests change one thing in the ledger and see the body follow it.

**In `gate/test/render.test.ts`, replace:**
```ts
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**with:**
```ts
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import type { Draft } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderBody, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**In `gate/test/render.test.ts`, replace:**
```ts
    expect(ledger.sentences).toHaveLength(located.length);
    expect(ledger.sentences.map((s) => s.index)).toEqual(located.map((_s, at) => at));
    expect(ledger.sentences[0]).toEqual({ index: 0, section: 'title', kind: 'fact', text: golden.draft.title.text, claimIds: ['c-1'] });
    expect(ledger.sentences[1]!.section).toBe('description');
    const body = ledger.sentences.find((s) => s.section === 'body')!;
```

**with:**
```ts
    expect(ledger.sentences).toHaveLength(located.length);
    expect(ledger.sentences.map((s) => s.index)).toEqual(located.map((_s, at) => at));
    expect(ledger.sentences[0]).toEqual({ index: 0, section: 'title', paragraph: 0, kind: 'fact', text: golden.draft.title.text, claimIds: ['c-1'] });
    expect(ledger.sentences[1]!.section).toBe('description');
    const body = ledger.sentences.find((s) => s.section === 'body')!;
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('orders the claims by first appearance in the body, then claims only the title or description cite', () => {
    expect(ledger.order.slice(0, 6)).toEqual(['c-1', 'c-23', 'c-26', 'c-17', 'c-18', 'c-8']);
```

**with:**
```ts
  });

  it('numbers the paragraph of each sentence: the opening and the limitations are paragraph 0, each takeaway has its own, a section counts its paragraphs from 0', () => {
    const paragraphs = (section: string, heading?: string) =>
      ledger.sentences.filter((s) => s.section === section && (heading === undefined || s.heading === heading)).map((s) => s.paragraph);
    expect(new Set(paragraphs('opening'))).toEqual(new Set([0]));
    expect(paragraphs('takeaways')).toEqual([0, 1, 2, 3]);
    expect(new Set(paragraphs('limitations'))).toEqual(new Set([0]));
    expect(new Set(paragraphs('body', 'What shipped'))).toEqual(new Set([0, 1, 2]));
    expect(new Set(paragraphs('body', 'What the filing shows'))).toEqual(new Set([0, 1]));
    expect(paragraphs('title')).toEqual([0]);
  });

  it('orders the claims by first appearance in the body, then claims only the title or description cite', () => {
    expect(ledger.order.slice(0, 6)).toEqual(['c-1', 'c-23', 'c-26', 'c-17', 'c-18', 'c-8']);
```

**In `gate/test/render.test.ts`, replace:**
```ts
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
```

**with:**
```ts
});

describe('renderBody: the body is a function of the ledger', () => {
  const golden = cloneGolden();
  const { mdx, ledger } = render(golden);
  const bodyOf = (text: string) => splitMdx(text).body;

  it('is exactly the body renderDraft writes, so the page and the ledger cannot say different things', () => {
    expect(renderBody(ledger)).toBe(bodyOf(mdx));
    expect(mdx.endsWith(`\n---\n\n${renderBody(ledger)}`)).toBe(true);
  });

  it('is exactly the body for the piece that rests on another outlet as well', () => {
    const tier2 = render(makeTier2Variant(cloneGolden()));
    expect(renderBody(tier2.ledger)).toBe(bodyOf(tier2.mdx));
    expect(renderBody(tier2.ledger)).toContain('**Unconfirmed.** Mercer Wire reports');
  });

  it('needs nothing but the ledger: a ledger read back from its JSON gives the same body', () => {
    const readBack = LedgerEntry.parse(JSON.parse(JSON.stringify(ledger)));
    expect(renderBody(readBack)).toBe(renderBody(ledger));
  });

  it('ends with one newline and starts with the opening paragraph, with no frontmatter', () => {
    const body = renderBody(ledger);
    expect(body.endsWith('\n')).toBe(true);
    expect(body.endsWith('\n\n')).toBe(false);
    expect(body.startsWith('Fixture Robotics has begun shipping its FX-1 warehouse arm')).toBe(true);
    expect(body).not.toContain('---');
  });

  it('follows the ledger: a sentence changed in the ledger is changed in the body', () => {
    const edited = structuredClone(ledger);
    edited.sentences.find((sentence) => sentence.text === 'It lists 7 investors in the round.')!.text = 'It lists 8 investors in the round.';
    expect(renderBody(edited)).toContain('It lists 8 investors in the round.');
    expect(renderBody(edited)).not.toBe(renderBody(ledger));
  });

  it('follows the paragraph numbers: moving a sentence to the next paragraph moves it in the body', () => {
    const edited = structuredClone(ledger);
    const first = edited.sentences.find((sentence) => sentence.section === 'body')!;
    edited.sentences.filter((sentence) => sentence.heading === first.heading && sentence.paragraph === 1).forEach((sentence) => (sentence.paragraph = 0));
    const count = (body: string) => body.trimEnd().split('\n\n').length;
    expect(count(renderBody(edited))).toBe(count(renderBody(ledger)) - 1);
  });

  it('numbers markers by the order of the ledger, so reordering the claims renumbers them', () => {
    const edited = structuredClone(ledger);
    edited.order = [...edited.order.slice(1), edited.order[0]!];
    expect(renderBody(edited)).toContain(`Tarnmoor.[${edited.order.length}](${RECEIPTS}#c-1) The first site`);
  });

  it('throws, naming the claim, when a sentence cites a claim that the order does not list', () => {
    const edited = structuredClone(ledger);
    edited.order = edited.order.filter((id) => id !== 'c-19');
    expect(() => renderBody(edited)).toThrow('renderBody: a sentence cites c-19, but the order of the ledger does not list it');
  });

  it('writes nothing for a part with no sentence, and no heading for a section with none', () => {
    const edited = structuredClone(ledger);
    edited.sentences = edited.sentences.filter((sentence) => sentence.section !== 'takeaways' && sentence.section !== 'limitations' && sentence.heading !== 'What shipped');
    const body = renderBody(edited);
    expect(body).not.toContain('Key takeaways');
    expect(body).not.toContain("couldn't verify");
    expect(body).not.toContain('What shipped');
    expect(body).toContain('## What the customer reports');
  });

  it('writes the takeaways heading and a bullet for a single takeaway', () => {
    const edited = structuredClone(ledger);
    const first = edited.sentences.find((sentence) => sentence.section === 'takeaways')!;
    edited.sentences = edited.sentences.filter((sentence) => sentence.section !== 'takeaways' || sentence === first);
    const lines = renderBody(edited).split('\n');
    expect(lines[lines.indexOf('## Key takeaways') + 2]!.startsWith(`- ${first.text}`)).toBe(true);
    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(1);
  });

  it('throws, naming the sentence, when a body sentence has no heading', () => {
    const edited = structuredClone(ledger);
    const body = edited.sentences.find((sentence) => sentence.section === 'body')!;
    delete body.heading;
    expect(() => renderBody(edited)).toThrow(`renderBody: the body sentence ${body.index} has no heading`);
  });
});

describe('renderDraft: a draft the ledger cannot tell apart', () => {
  const sentence = (text: string): Draft['opening'][number] => ({ kind: 'fact', text, claimIds: ['c-1'] });
  const withSections = (sections: Draft['sections']) =>
    mutate(cloneGolden(), (g) => {
      g.draft.sections = sections;
    });

  it('writes neighbouring sections that share a heading as one section, because the ledger holds them as one', () => {
    const { mdx, ledger } = render(
      withSections([
        { heading: 'Same', paragraphs: [[sentence('First.')]] },
        { heading: 'Same', paragraphs: [[sentence('Second.')]] },
        { heading: 'Other', paragraphs: [[sentence('Third.')]] },
      ]),
    );
    expect(splitMdx(mdx).body.split('\n').filter((line) => line.startsWith('## '))).toContain('## Same');
    expect(splitMdx(mdx).body.split('\n').filter((line) => line === '## Same')).toHaveLength(1);
    expect(ledger.sentences.filter((s) => s.heading === 'Same').map((s) => [s.text, s.paragraph])).toEqual([['First.', 0], ['Second.', 1]]);
    expect(renderBody(ledger)).toBe(splitMdx(mdx).body);
  });

  it('keeps two sections that share a heading apart when another section stands between them', () => {
    const { mdx } = render(
      withSections([
        { heading: 'Same', paragraphs: [[sentence('First.')]] },
        { heading: 'Other', paragraphs: [[sentence('Second.')]] },
        { heading: 'Same', paragraphs: [[sentence('Third.')]] },
      ]),
    );
    expect(splitMdx(mdx).body.split('\n').filter((line) => line === '## Same')).toHaveLength(2);
  });

  it('leaves out a section that has no sentence, heading and all', () => {
    const { mdx } = render(withSections([{ heading: 'Nothing here', paragraphs: [[]] }, { heading: 'Something', paragraphs: [[sentence('Text.')]] }]));
    expect(mdx).not.toContain('Nothing here');
    expect(mdx).toContain('## Something');
  });
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
```

Run: `npm test --workspace @robywire/gate -- test/sentences.test.ts test/schemas.test.ts test/render.test.ts`
Expected: FAIL — `numbers the paragraph of each sentence from 0 within its section or list`, `requires the paragraph of a ledger sentence` and `renderBody`.

- [ ] **Step 2: Write the implementation**

`allSentences` numbers the paragraphs.

**In `gate/src/sentences.ts`, replace:**
```ts
  /** 1-based position within its section. For a body section, paragraphs count as one run. */
  position: number;
  sentence: Sentence;
}
```

**with:**
```ts
  /** 1-based position within its section. For a body section, paragraphs count as one run. */
  position: number;
  /**
   * 0-based number of the paragraph it belongs to, within its section or list. The opening and the
   * limitations are one paragraph each, so 0; each key takeaway is a bullet of its own, so its
   * position minus 1; the paragraphs of a body section count from 0 under their heading, and neighbouring
   * sections with the same heading count on from each other, because the page shows them as one section.
   * An empty paragraph is not counted. The title and the description are 0.
   */
  paragraph: number;
  sentence: Sentence;
}
```

**In `gate/src/sentences.ts`, replace:**
```ts
export function allSentences(draft: Draft): LocatedSentence[] {
  const located: LocatedSentence[] = [];
  const add = (section: LedgerSection, sentence: Sentence, position: number, heading?: string) => {
    const item: LocatedSentence = { section, index: located.length, position, sentence };
    if (heading !== undefined) item.heading = heading;
    located.push(item);
  };

  add('title', draft.title, 1);
  add('description', draft.description, 1);
  draft.opening.forEach((sentence, at) => add('opening', sentence, at + 1));
  draft.takeaways.forEach((sentence, at) => add('takeaways', sentence, at + 1));
  for (const section of draft.sections) {
    section.paragraphs.flat().forEach((sentence, at) => add('body', sentence, at + 1, section.heading));
  }
  draft.limitations.forEach((sentence, at) => add('limitations', sentence, at + 1));
  return located;
}
```

**with:**
```ts
export function allSentences(draft: Draft): LocatedSentence[] {
  const located: LocatedSentence[] = [];
  const add = (section: LedgerSection, sentence: Sentence, position: number, paragraph: number, heading?: string) => {
    const item: LocatedSentence = { section, index: located.length, position, paragraph, sentence };
    if (heading !== undefined) item.heading = heading;
    located.push(item);
  };

  add('title', draft.title, 1, 0);
  add('description', draft.description, 1, 0);
  draft.opening.forEach((sentence, at) => add('opening', sentence, at + 1, 0));
  draft.takeaways.forEach((sentence, at) => add('takeaways', sentence, at + 1, at));
  let previousHeading: string | undefined;
  let paragraph = 0;
  for (const section of draft.sections) {
    if (section.heading !== previousHeading) paragraph = 0;
    previousHeading = section.heading;
    let position = 0;
    for (const sentences of section.paragraphs) {
      if (sentences.length === 0) continue;
      for (const sentence of sentences) add('body', sentence, ++position, paragraph, section.heading);
      paragraph++;
    }
  }
  draft.limitations.forEach((sentence, at) => add('limitations', sentence, at + 1, 0));
  return located;
}
```

The schema.

**In `gate/src/schemas.ts`, replace:**
```ts
  index: z.number().int().nonnegative(),
  section: z.enum(LEDGER_SECTIONS),
  heading: z.string().optional(),
  kind: z.enum(SENTENCE_KINDS),
```

**with:**
```ts
  index: z.number().int().nonnegative(),
  section: z.enum(LEDGER_SECTIONS),
  // The paragraph the sentence is in, counted from 0 within its section (see LocatedSentence in sentences.ts).
  // With the text, the claims and the order of the ledger it is all that renderBody needs to write the article's body.
  paragraph: z.number().int().nonnegative(),
  heading: z.string().optional(),
  kind: z.enum(SENTENCE_KINDS),
```

The new module. Its two headings used to be constants inside the renderer.

**Create `gate/src/render/body.ts`:**
```ts
import type { LedgerEntry, LedgerSentence } from '../schemas';
import { escapeMdx } from './escape';

export const TAKEAWAYS_HEADING = 'Key takeaways';
export const LIMITATIONS_HEADING = "What we couldn't verify";

/** Consecutive items that have the same key, in order. */
function runs<T>(items: readonly T[], keyOf: (item: T) => string | number): T[][] {
  const found: T[][] = [];
  for (const item of items) {
    const last = found.at(-1);
    if (last !== undefined && keyOf(last[0] as T) === keyOf(item)) last.push(item);
    else found.push([item]);
  }
  return found;
}

/**
 * The body of the article, as MDX, written from its ledger alone: the text under the frontmatter,
 * ending with one newline. `renderDraft` writes the article body with this function and no other,
 * and the site builds a piece only if the body of its MDX file is exactly this, so the article and
 * its ledger cannot say different things.
 *
 * What it uses from each ledger sentence: its section, paragraph and heading (they say where the
 * sentence goes), its kind and `attributed` (they say which label it carries), its text and the
 * claims it cites; the markers are numbered by the order of the ledger. A sentence that cites a claim
 * the order does not list is an error, and so is a body sentence with no heading. Text is escaped as
 * `renderDraft` escapes it.
 */
export function renderBody(ledger: LedgerEntry): string {
  const markerOf = new Map(ledger.order.map((id, at) => [id, at + 1]));
  const receipts = `/news/${ledger.slug}/receipts/`;
  const marker = (id: string): string => {
    const number = markerOf.get(id);
    if (number === undefined) throw new Error(`renderBody: a sentence cites ${id}, but the order of the ledger does not list it`);
    return `[${number}](${receipts}#${id})`;
  };
  const sentence = (item: LedgerSentence): string => {
    // A sentence has at most one label: analysis is the Desk's reading, "Unconfirmed." marks a fact it only attributes.
    const label = item.kind === 'analysis' ? '**Analysis.** ' : item.kind === 'fact' && item.attributed === true ? '**Unconfirmed.** ' : '';
    return `${label}${escapeMdx(item.text)}${[...new Set(item.claimIds)].map(marker).join('')}`;
  };
  const headingOf = (item: LedgerSentence): string => {
    if (item.heading === undefined) throw new Error(`renderBody: the body sentence ${item.index} has no heading`);
    return item.heading;
  };
  const paragraphs = (items: readonly LedgerSentence[]): LedgerSentence[][] => runs(items, (item) => item.paragraph);
  const paragraph = (items: readonly LedgerSentence[]): string => items.map(sentence).join(' ');
  const sentencesOf = (section: LedgerSentence['section']): LedgerSentence[] => ledger.sentences.filter((item) => item.section === section);

  const blocks: string[] = [];
  for (const items of paragraphs(sentencesOf('opening'))) blocks.push(paragraph(items));

  const takeaways = paragraphs(sentencesOf('takeaways'));
  if (takeaways.length > 0) {
    blocks.push(`## ${TAKEAWAYS_HEADING}`);
    blocks.push(takeaways.map((items) => `- ${paragraph(items)}`).join('\n'));
  }

  for (const section of runs(sentencesOf('body'), headingOf)) {
    blocks.push(`## ${escapeMdx(headingOf(section[0] as LedgerSentence))}`);
    for (const items of paragraphs(section)) blocks.push(paragraph(items));
  }

  const limitations = paragraphs(sentencesOf('limitations'));
  if (limitations.length > 0) {
    blocks.push(`## ${LIMITATIONS_HEADING}`);
    for (const items of limitations) blocks.push(paragraph(items));
  }
  return `${blocks.join('\n\n')}\n`;
}
```

**In `gate/src/render/index.ts`, replace:**
```ts
export * from './escape';
export * from './frontmatter';
```

**with:**
```ts
export * from './body';
export * from './escape';
export * from './frontmatter';
```

The renderer builds the ledger and then the body. The code that wrote the body from the draft is gone.

**In `gate/src/render/render.ts`, replace:**
```ts
import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Claim, Draft, LedgerEntry, LedgerSentence, Sentence } from '../schemas';
import { allSentences } from '../sentences';
import type { LocatedSentence } from '../sentences';
import { escapeMdx } from './escape';

/** What the renderer needs besides the draft and the claims. */
```

**with:**
```ts
import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Claim, Draft, LedgerEntry, LedgerSentence } from '../schemas';
import { allSentences } from '../sentences';
import type { LocatedSentence } from '../sentences';
import { renderBody } from './body';

/** What the renderer needs besides the draft and the claims. */
```

**In `gate/src/render/render.ts`, replace:**
```ts
}

const TAKEAWAYS_HEADING = 'Key takeaways';
const LIMITATIONS_HEADING = "What we couldn't verify";
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

```

**with:**
```ts
}

const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

```

**In `gate/src/render/render.ts`, replace:**
```ts
 * function of the arguments: no clock, no randomness, newline line endings.
 * No text from the draft reaches the MDX unescaped.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
```

**with:**
```ts
 * function of the arguments: no clock, no randomness, newline line endings.
 * No text from the draft reaches the MDX unescaped.
 *
 * The body of the MDX is `renderBody(ledger)`: the ledger is built first and
 * the body is written from it, not from the draft. A section with no sentence
 * has nothing in the ledger, so the page has no heading for it, and neighbouring
 * sections with the same heading come out as one.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
```

**In `gate/src/render/render.ts`, replace:**
```ts
    if (!claimsById.has(id)) throw new Error(`renderDraft: a sentence cites ${id}, but no claim has that id`);
  }
  const markerOf = new Map(order.map((id, at) => [id, at + 1]));

  const receipts = `/news/${draft.slug}/receipts/`;
  const marker = (id: string) => `[${markerOf.get(id)}](${receipts}#${id})`;
  const sentence = (item: Sentence): string => {
    // A sentence has at most one label: analysis is the Desk's reading, "Unconfirmed." marks a fact it only attributes.
    const label = item.kind === 'analysis' ? '**Analysis.** ' : item.kind === 'fact' && item.attributed === true ? '**Unconfirmed.** ' : '';
    const markers = [...new Set(item.claimIds)].map(marker).join('');
    return `${label}${escapeMdx(item.text)}${markers}`;
  };
  const paragraph = (items: readonly Sentence[]): string => items.map(sentence).join(' ');

  for (const category of draft.categories) {
```

**with:**
```ts
    if (!claimsById.has(id)) throw new Error(`renderDraft: a sentence cites ${id}, but no claim has that id`);
  }

  for (const category of draft.categories) {
```

**In `gate/src/render/render.ts`, replace:**
```ts
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
```

**with:**
```ts
  ].join('\n');

  const cited = order.map((id) => claimsById.get(id) as Claim);
  const sources = new Map<string, LedgerEntry['sources'][number]>();
```

**In `gate/src/render/render.ts`, replace:**
```ts
  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = { index: item.index, section: item.section, kind: written.kind, text: written.text, claimIds: [...written.claimIds] };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
```

**with:**
```ts
  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = {
      index: item.index,
      section: item.section,
      paragraph: item.paragraph,
      kind: written.kind,
      text: written.text,
      claimIds: [...written.claimIds],
    };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
```

**In `gate/src/render/render.ts`, replace:**
```ts
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
  };
  return { mdx, ledger };
}
```

**with:**
```ts
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
  };
  return { mdx: `${frontmatter}\n\n${renderBody(ledger)}`, ledger };
}
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  34 passed (34)`.

- [ ] **Step 3: See what else the required paragraph breaks**

The committed ledgers of the fixture pieces have no `paragraph`, so the site cannot read them, and the generator would write different files from the committed ones.

Run: `npm run fixtures:check`
Expected: FAIL — `+      "paragraph": 0,` and `Fixtures are out of date`.

Run: `npm test --workspace @robywire/site`
Expected: FAIL — `paragraph`

- [ ] **Step 4: Regenerate the fixtures**

Run: `npm run fixtures:generate --workspace @robywire/site`

Run: `git status --short`
Expected: PASS — ` M site/src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json` and ` M site/src/content-fixtures/ledger/fixture-robotics-ships-fx-4-to-second-plant.json`

The MDX files of the pieces are not in the list: the body that the new code writes is the body the old code wrote.

Run: `npm test --workspace @robywire/site && npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 5: Write the failing site tests**

The tests give `matchPieces` a piece whose body is what the ledger renders (as Astro hands it over, without the blank lines around it), and then pieces whose body was edited by hand, cut short, or extended, and a ledger that was edited while the body was not. `firstDifference` is the function that finds the line and the column, and shows the stretch of each line around it.

**In `site/test/match-pieces.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { matchPieces } from '../src/lib/match-pieces';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry, renderBody } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { firstDifference, matchPieces } from '../src/lib/match-pieces';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
    author: { name: 'Robywire Desk' },
  };
  return { news: { id: slug, data }, ledger: { id: slug, data: ledger } };
}

```

**with:**
```ts
    author: { name: 'Robywire Desk' },
  };
  // The body of a piece as Astro hands it over: the text under the frontmatter, without its outer blank lines.
  return { news: { id: slug, data, body: renderBody(ledger).trim() }, ledger: { id: slug, data: ledger } };
}

```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
      'The site content does not fit together:\n- the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter\n- the piece "b-piece" has no ledger file',
    );
  });
});
```

**with:**
```ts
      'The site content does not fit together:\n- the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter\n- the piece "b-piece" has no ledger file',
    );
  });
});

describe('matchPieces: the body of the piece and its ledger', () => {
  const one = (body: string | undefined) => {
    const a = pair('a-piece', '2026-10-01');
    const news = body === undefined ? { id: a.news.id, data: a.news.data } : { ...a.news, body };
    return () => matchPieces([news], [a.ledger], []);
  };
  const body = pair('a-piece', '2026-10-01').news.body;
  const lines = body.split('\n');

  it('accepts a body that is what the ledger renders, with or without the blank lines around it', () => {
    expect(one(body)()).toHaveLength(1);
    expect(one(`\n\n${body}\n\n`)()).toHaveLength(1);
  });

  it('stops the build when a sentence of the body was edited by hand, naming the piece, the line, the column and both texts', () => {
    const edited = body.replace('now runs 40 of the arms', 'now runs 400 of the arms');
    const column = body.indexOf('now runs 40') + 'now runs 40'.length + 1;
    expect(one(edited)).toThrow(`the body of the piece "a-piece" differs from its ledger at line 1, column ${column}: the file has "...`);
    expect(one(edited)).toThrow('now runs 400 of the arms');
    expect(one(edited)).toThrow('but the ledger gives "...');
    expect(one(edited)).toThrow('now runs 40 of the arms');
  });

  it('names the first line that differs, counting from the first line of the body', () => {
    const changed = [...lines];
    changed[2] = 'A line that nobody generated.';
    expect(one(changed.join('\n'))).toThrow('differs from its ledger at line 3, column 1: the file has "A line that nobody generated." but the ledger gives "');
  });

  it('stops the build when the body ends early, or goes on after the end of the ledger', () => {
    expect(one(lines.slice(0, 5).join('\n'))).toThrow('at line 6: the file ends before this line, where the ledger gives "- The datasheet lists');
    expect(one(`${body}\nAn extra paragraph.`)).toThrow(`at line ${lines.length + 1}: the file has "An extra paragraph." where the ledger has nothing`);
  });

  it('stops the build when the ledger was edited and the body was not', () => {
    const a = pair('a-piece', '2026-10-01');
    a.ledger.data.sentences = a.ledger.data.sentences.map((sentence) => (sentence.text === 'It lists 7 investors in the round.' ? { ...sentence, text: 'It lists 8 investors in the round.' } : sentence));
    expect(() => matchPieces([a.news], [a.ledger], [])).toThrow('differs from its ledger');
  });

  it('names the piece when its ledger cannot be written as a body at all, instead of failing with no name', () => {
    const a = pair('a-piece', '2026-10-01');
    a.ledger.data = { ...a.ledger.data, order: a.ledger.data.order.filter((id) => id !== 'c-19') };
    expect(() => matchPieces([a.news], [a.ledger], [])).toThrow(
      'the ledger entry "a-piece" cannot be written as a body: renderBody: a sentence cites c-19, but the order of the ledger does not list it',
    );
    const b = pair('b-piece', '2026-10-02');
    const copy = structuredClone(b.ledger.data);
    delete copy.sentences.find((sentence) => sentence.section === 'body')!.heading;
    b.ledger.data = copy;
    expect(() => matchPieces([b.news], [b.ledger], [])).toThrow('the ledger entry "b-piece" cannot be written as a body: renderBody: the body sentence');
  });

  it('treats a piece with no body text as a body that ends before its first line', () => {
    expect(one(undefined)).toThrow('differs from its ledger at line 1, column 1: the file has "" but the ledger gives "Fixture Robotics has begun');
  });

  it('reports this problem together with the others, under the one heading', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([{ ...a.news, body: 'Changed.' }, b.news], [a.ledger], [])).toThrow(
      /^The site content does not fit together:\n- the body of the piece "a-piece" differs from its ledger at line 1, column 1: [^\n]*\n- the piece "b-piece" has no ledger file$/,
    );
  });
});

describe('firstDifference', () => {
  it('is undefined for equal texts', () => {
    expect(firstDifference('a\nb', 'a\nb')).toBeUndefined();
  });

  it('names the first line and column that differ, from 1, with both lines', () => {
    expect(firstDifference('a\nx\nc', 'a\nb\nc')).toBe('line 2, column 1: the file has "x" but the ledger gives "b"');
    expect(firstDifference('ax', 'ab')).toBe('line 1, column 2: the file has "ax" but the ledger gives "ab"');
  });

  it('says so when the file ends first or goes on', () => {
    expect(firstDifference('a', 'a\nb')).toBe('line 2: the file ends before this line, where the ledger gives "b"');
    expect(firstDifference('a\nb', 'a')).toBe('line 2: the file has "b" where the ledger has nothing');
  });

  it('treats a line that is the start of the other as differing where the shorter one ends', () => {
    expect(firstDifference('abc', 'abcd')).toBe('line 1, column 4: the file has "abc" but the ledger gives "abcd"');
  });

  it('shows the stretch around the difference when the line is long: 30 characters before it and up to 70 in all, with ... where it is cut', () => {
    const before = 'a'.repeat(100);
    const after = 'b'.repeat(100);
    const message = firstDifference(`${before}X${after}`, `${before}Y${after}`)!;
    const shown = (mark: string) => `...${'a'.repeat(30)}${mark}${'b'.repeat(39)}...`;
    expect(message).toBe(`line 1, column 101: the file has "${shown('X')}" but the ledger gives "${shown('Y')}"`);
  });

  it('puts ... before the stretch only when the line is cut at its start: the 31st character still shows the whole line, the 32nd does not', () => {
    const thirty = 'a'.repeat(30);
    expect(firstDifference(`${thirty}X`, `${thirty}Y`)).toBe(`line 1, column 31: the file has "${thirty}X" but the ledger gives "${thirty}Y"`);
    expect(firstDifference(`a${thirty}X`, `a${thirty}Y`)).toBe(`line 1, column 32: the file has "...${thirty}X" but the ledger gives "...${thirty}Y"`);
  });

  it('starts at the beginning of the line when the difference is near it, and ends without ... when the line ends in the window', () => {
    expect(firstDifference(`${'a'.repeat(20)}X${'b'.repeat(10)}`, `${'a'.repeat(20)}Y${'b'.repeat(10)}`)).toBe(
      `line 1, column 21: the file has "${'a'.repeat(20)}X${'b'.repeat(10)}" but the ledger gives "${'a'.repeat(20)}Y${'b'.repeat(10)}"`,
    );
    expect(firstDifference('x'.repeat(70), 'y'.repeat(70))).toBe(`line 1, column 1: the file has "${'x'.repeat(70)}" but the ledger gives "${'y'.repeat(70)}"`);
    expect(firstDifference('x'.repeat(71), 'y')).toBe(`line 1, column 1: the file has "${'x'.repeat(70)}..." but the ledger gives "y"`);
  });
});
```

Run: `npm test --workspace @robywire/site -- test/match-pieces.test.ts`
Expected: FAIL — `the body of the piece and its ledger` and `firstDifference`.

- [ ] **Step 6: Make the build refuse a body that is not the ledger's**

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';
```

**with:**
```ts
import { renderBody } from '@robywire/gate';
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
}

export interface Matched<N, L> {
  slug: string;
```

**with:**
```ts
}

/** A piece: its frontmatter, and the text of the file below the frontmatter, which Astro keeps as `body`. */
export interface KeyedPiece extends Keyed<NewsFrontmatter> {
  body?: string;
}

export interface Matched<N, L> {
  slug: string;
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
```

**with:**
```ts
const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The most characters of a line that a message shows, and how many of them come before the first difference. */
const WINDOW = 70;
const LEAD = 30;

/** `line` from character `from`, at most 70 characters, with "..." where it is cut. */
const excerpt = (line: string, from: number): string =>
  `${from > 0 ? '...' : ''}${line.slice(from, from + WINDOW)}${line.length > from + WINDOW ? '...' : ''}`;

/**
 * Where two texts first differ, as a short description, or undefined if they are equal. Lines are
 * counted from 1, and so are the columns. `actual` is the text of the file and `expected` what the
 * ledger renders. A paragraph is one long line, so the message shows the stretch of each line around
 * the first character that differs, not the start of it.
 */
export function firstDifference(actual: string, expected: string): string | undefined {
  const have = actual.split('\n');
  const want = expected.split('\n');
  for (let at = 0; at < Math.max(have.length, want.length); at++) {
    const [now, then] = [have[at], want[at]];
    if (now === then) continue;
    if (now === undefined) return `line ${at + 1}: the file ends before this line, where the ledger gives "${excerpt(then as string, 0)}"`;
    if (then === undefined) return `line ${at + 1}: the file has "${excerpt(now, 0)}" where the ledger has nothing`;
    let column = 0;
    while (now[column] === then[column]) column++;
    const from = Math.max(0, column - LEAD);
    return `line ${at + 1}, column ${column + 1}: the file has "${excerpt(now, from)}" but the ledger gives "${excerpt(then, from)}"`;
  }
  return undefined;
}

/**
 * What is wrong with the body of a piece, or undefined when it is exactly what its ledger renders. A ledger
 * that `renderBody` cannot write (a sentence cites a claim the order lacks, a body sentence has no heading)
 * is a problem of its own, named by the piece.
 */
function bodyProblem(id: string, body: string | undefined, ledger: LedgerEntry): string | undefined {
  let expected: string;
  try {
    expected = renderBody(ledger);
  } catch (error) {
    return `the ledger entry "${id}" cannot be written as a body: ${error instanceof Error ? error.message : String(error)}`;
  }
  // Astro keeps the body without the blank lines around it, so both sides are trimmed.
  const difference = firstDifference((body ?? '').trim(), expected.trim());
  return difference === undefined ? undefined : `the body of the piece "${id}" differs from its ledger at ${difference}`;
}

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, title, date or categories disagree with its piece, and a piece whose
 * `updatedAt` does not agree with the corrections recorded for it: a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
 * one, and a piece that says it was updated needs a record that explains it.
 */
export function matchPieces<N extends Keyed<NewsFrontmatter>, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
```

**with:**
```ts
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, title, date or categories disagree with its piece, and a piece whose
 * `updatedAt` does not agree with the corrections recorded for it (a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
 * one, and a piece that says it was updated needs a record that explains it),
 * and a piece whose body is not what `renderBody` writes from its ledger, so
 * that the article and its receipts cannot drift apart.
 */
export function matchPieces<N extends KeyedPiece, L extends Keyed<LedgerEntry>>(
  news: readonly N[],
  ledgers: readonly L[],
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
    matched.push({ slug: piece.id, news: piece, ledger });

    const recorded = latestCorrectionDay(corrections, piece.id);
    const { updatedAt } = piece.data;
```

**with:**
```ts
    matched.push({ slug: piece.id, news: piece, ledger });

    const bodyIssue = bodyProblem(piece.id, piece.body, ledger.data);
    if (bodyIssue !== undefined) problems.push(bodyIssue);

    const recorded = latestCorrectionDay(corrections, piece.id);
    const { updatedAt } = piece.data;
```

Run: `npm test --workspace @robywire/site -- test/match-pieces.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 8: Edit an article by hand and watch the build refuse it**

First the build as it is. It reads the real pieces through Astro, which hands `matchPieces` the body of each file, so this also shows that Astro's idea of the body is what the code compares.

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Now change one number in the text of the `fx-1` article, as a hurried editor might.

Run: `sed -i.bak 's/now runs 40 of the arms/now runs 400 of the arms/' site/src/content-fixtures/news/fixture-robotics-ships-fx-1-to-second-plant.mdx && rm site/src/content-fixtures/news/fixture-robotics-ships-fx-1-to-second-plant.mdx.bak`

Run: `npm run build:fixtures`
Expected: FAIL — `the body of the piece "fixture-robotics-ships-fx-1-to-second-plant" differs from its ledger at line 1, column` and `now runs 400 of the arms`.

The generated file is the one that is right. Regenerating puts it back.

Run: `npm run fixtures:generate --workspace @robywire/site`

Run: `git status --short`
Expected: PASS — ` M site/src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json`

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

- [ ] **Step 9: Update the README**

**In `README.md`, replace:**
```markdown
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.

## The audit

```

**with:**
```markdown
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.

## What the site refuses to build

A piece is two files: the MDX that readers see and the ledger JSON behind its receipts. `site/src/lib/match-pieces.ts` joins them and stops the build, with a message that names the piece, when they do not belong together:

- the ledger has no piece, or the piece has no ledger, or their slug, title, date or categories differ;
- the body of the MDX is not exactly what `renderBody` (in `gate/src/render/body.ts`) writes from the ledger, so a hand edit of the article, or of the ledger, is caught on the first build;
- a correction or retraction is recorded in the desk state for the piece and its `updatedAt` is not the day of the latest one, or it has an `updatedAt` and nothing is recorded.

## The audit

```

- [ ] **Step 10: Commit**

```bash
git add README.md gate/src gate/test site/src site/test
git commit -m "feat: write the article body from the ledger, and stop the build when a piece's body differs from it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 80: The ledger records how a piece was released, and a fifth fixture piece was held and then released

**Files:**
- Modify: `gate/src/constants.ts` (`RELEASES`, `Release`), `gate/src/schemas.ts` (`LedgerEntry.release`), `gate/src/render/render.ts` (`RenderMeta.release`)
- Modify: `site/src/lib/receipts.ts`, `site/src/pages/news/[slug]/receipts/index.astro` (the release line, and no bare route)
- Modify: `site/src/lib/method.ts`, `site/src/pages/method/index.astro` (one sentence about owner-released pieces)
- Modify: `site/src/lib/stats.ts` (a claim from another outlet is not counted as verified)
- Modify: `site/scripts/generate-fixtures.ts` (the fifth piece), `site/src/content-fixtures/` (regenerated: one new piece and ledger, and `release` in the four ledgers)
- Modify: `site/scripts/lighthouse-lib.mjs`, `site/scripts/lighthouse.mjs` (measure the piece that carries the label)
- Modify: `README.md` (the fixtures, Lighthouse)
- Test: `gate/test/constants.test.ts`, `gate/test/schemas.test.ts`, `gate/test/render.test.ts`, `site/test/receipts.test.ts`, `site/test/method.test.ts`, `site/test/fixtures.test.ts`, `site/test/stats.test.ts`, `site/test/lighthouse-lib.test.ts`, `site/test/lighthouse-cli.test.ts`

Once the Desk is live a piece will reach the site in one of two ways. The gate clears it and nobody is asked, or the gate holds it (G6 does, for any piece that uses another outlet's reporting) and the owner decides to publish it anyway. The ledger recorded neither, and the receipts page printed `Route: hold` for a piece that is on the site, which reads like a mistake. A reader should be told, in words, which of the two happened, and a piece that went out after a hold should be visibly different from one that did not: Task 77 gave it the label, this task gives it the record.

1. **`release`.** `LedgerEntry` gains the optional `release`: `auto` or `owner` (the constant `RELEASES`, the type `Release`). The Desk's publish flow will set it in Plan 2; the renderer writes whatever `RenderMeta.release` says. Both the renderer and the ledger schema refuse a release that the route of the gate contradicts: `auto` needs the route `publish`, and `owner` is for a piece the gate did not clear. The page would otherwise print something false.
2. **The receipts page** says what the gate did in a sentence instead of printing a route chip: `routeText`. Under it, `releaseNote` says how the piece got out: `owner` gives "Held by the gate, then released by the owner.", `auto` gives "Published by the gate without a human.", and a ledger without a release gives nothing.
3. **The method page** gets one sentence about owner-released pieces, built from the same words, so that the two cannot drift apart.
4. **The fifth fixture piece** (FX-5) is the golden story about a fifth product, dated 29 September 2026, the day of the `TIER2_ATTRIBUTION` hold that the desk state of the fixtures already records. It is built with `makeTier2Variant`: one sentence of its "What the filing shows" section is attributed to the made-up outlet "Mercer Wire". The gate holds it. The fixture stands for the draft after the owner released it, so its ledger says `release: owner` and the other four say `release: auto`. The generator now states what the gate must decide for each fixture, and stops if the gate decides otherwise.
5. **"Claims verified"** on the home page and the status page added up every claim of every piece. A claim from another outlet is reported, not traced to a primary source, so it is no longer counted.
6. **Lighthouse** measures the first other article that carries the `Unconfirmed.` label (it asks A16's `hasUnconfirmedLabel`), and its receipts page, as well as the lead article and its receipts page, because those pages have markup that the others do not.

- [ ] **Step 1: Write the failing gate tests**

**In `gate/test/constants.test.ts`, replace:**
```ts
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  SAFE_BASES,
  STATUSES,
```

**with:**
```ts
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  RELEASES,
  SAFE_BASES,
  STATUSES,
```

**In `gate/test/constants.test.ts`, replace:**
```ts
  });

  it('keeps the safe bases a subset of the bases', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
```

**with:**
```ts
  });

  it('names the two ways a piece comes to be published', () => {
    expect(RELEASES).toEqual(['auto', 'owner']);
  });

  it('keeps the safe bases a subset of the bases', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
```

The ledger accepts `auto`, `owner` or nothing, and refuses a release that its route contradicts.

**In `gate/test/schemas.test.ts`, replace:**
```ts
  });

  it('requires the paragraph of a ledger sentence, a whole number from 0', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', undefined))).toEqual(['sentences.1.paragraph']);
```

**with:**
```ts
  });

  it('accepts release as auto or owner, or none, and nothing else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'release', 'auto'));
    expectValid(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'hold'), 'release', 'owner'));
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'release', 'editor'))).toEqual(['release']);
  });

  it('refuses a release that the route of the gate contradicts: auto needs publish, owner needs a piece the gate did not clear', () => {
    expect(failedPaths(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'hold'), 'release', 'auto'))).toEqual(['release']);
    expect(failedPaths(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'revise'), 'release', 'auto'))).toEqual(['release']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'release', 'owner'))).toEqual(['release']);
    expectValid(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'revise'), 'release', 'owner'));
  });

  it('requires the paragraph of a ledger sentence, a whole number from 0', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', undefined))).toEqual(['sentences.1.paragraph']);
```

The renderer records the release it is given, and refuses the same contradictions.

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('passes a verifier through', () => {
    const verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['all sentences entailed'] };
```

**with:**
```ts
  });

  it('has no release unless the meta gives one, and records the one it gives', () => {
    expect('release' in ledger).toBe(false);
    expect(render(golden, { release: 'auto' }).ledger.release).toBe('auto');
    const tier2 = makeTier2Variant(cloneGolden());
    expect(render(tier2, { release: 'owner' }).ledger.release).toBe('owner');
    expect(LedgerEntry.parse(render(tier2, { release: 'owner' }).ledger).release).toBe('owner');
  });

  it('refuses a release the route of the gate contradicts: the page would say something false', () => {
    const tier2 = makeTier2Variant(cloneGolden());
    expect(() => render(tier2, { release: 'auto' })).toThrow('renderDraft: release "auto" needs a gate route of publish, but the route is hold');
    expect(() => render(golden, { release: 'owner' })).toThrow('renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish');
  });

  it('passes a verifier through', () => {
    const verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['all sentences entailed'] };
```

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts test/schemas.test.ts test/render.test.ts`
Expected: FAIL — `names the two ways a piece comes to be published`, `accepts release as auto or owner, or none, and nothing else` and `has no release unless the meta gives one`.

- [ ] **Step 2: Write the release**

**In `gate/src/constants.ts`, replace:**
```ts
export type Route = (typeof ROUTES)[number];

export const RUN_OUTCOMES = ['published', 'no-story', 'held', 'failed'] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];
```

**with:**
```ts
export type Route = (typeof ROUTES)[number];

/**
 * How a published piece got out: `auto` when the gate cleared it and nobody was asked,
 * `owner` when the gate did not clear it (a hold) and the owner released it. The pipeline sets it.
 */
export const RELEASES = ['auto', 'owner'] as const;
export type Release = (typeof RELEASES)[number];

export const RUN_OUTCOMES = ['published', 'no-story', 'held', 'failed'] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];
```

**In `gate/src/schemas.ts`, replace:**
```ts
  CORRECTION_KINDS,
  LEDGER_SECTIONS,
  ROUTES,
  RUN_OUTCOMES,
```

**with:**
```ts
  CORRECTION_KINDS,
  LEDGER_SECTIONS,
  RELEASES,
  ROUTES,
  RUN_OUTCOMES,
```

**In `gate/src/schemas.ts`, replace:**
```ts
    holdReasons: z.array(z.string()),
  }),
  // Filled in by the desk when the model verifier (G10) has run.
  verifier: z
```

**with:**
```ts
    holdReasons: z.array(z.string()),
  }),
  // How the piece came to be published; set by the pipeline. The receipts page says it in words.
  release: z.enum(RELEASES).optional(),
  // Filled in by the desk when the model verifier (G10) has run.
  verifier: z
```

**In `gate/src/schemas.ts`, replace:**
```ts
    .optional(),
  sources: z.array(ClaimSource),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
```

**with:**
```ts
    .optional(),
  sources: z.array(ClaimSource),
}).superRefine((entry, context) => {
  // The receipts page prints the release in words, so it must not contradict what the gate decided.
  if (entry.release === 'auto' && entry.gate.route !== 'publish') {
    context.addIssue({ code: 'custom', path: ['release'], message: 'a piece published by the gate without a human needs a gate route of publish' });
  }
  if (entry.release === 'owner' && entry.gate.route === 'publish') {
    context.addIssue({ code: 'custom', path: ['release'], message: 'a piece released by the owner is one the gate did not clear, so its route is not publish' });
  }
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
```

**In `gate/src/render/render.ts`, replace:**
```ts
import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Claim, Draft, LedgerEntry, LedgerSentence } from '../schemas';
import { allSentences } from '../sentences';
```

**with:**
```ts
import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Release } from '../constants';
import type { Claim, Draft, LedgerEntry, LedgerSentence } from '../schemas';
import { allSentences } from '../sentences';
```

**In `gate/src/render/render.ts`, replace:**
```ts
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
  /**
   * The day (YYYY-MM-DD) a correction or a retraction was recorded for the piece. It is written to
```

**with:**
```ts
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
  /** How the piece came to be published, for the ledger: `auto` for a piece the gate cleared, `owner` for a hold the owner released. */
  release?: Release;
  /**
   * The day (YYYY-MM-DD) a correction or a retraction was recorded for the piece. It is written to
```

**In `gate/src/render/render.ts`, replace:**
```ts
    if (day < (dayNumber(draft.publishedAt) ?? NaN)) throw new Error(`renderDraft: updatedAt "${updatedAt}" is before publishedAt "${draft.publishedAt}"`);
  }
  const frontmatter = [
    '---',
```

**with:**
```ts
    if (day < (dayNumber(draft.publishedAt) ?? NaN)) throw new Error(`renderDraft: updatedAt "${updatedAt}" is before publishedAt "${draft.publishedAt}"`);
  }
  const { release } = meta;
  if (release === 'auto' && meta.gate.route !== 'publish') {
    throw new Error(`renderDraft: release "auto" needs a gate route of publish, but the route is ${meta.gate.route}`);
  }
  if (release === 'owner' && meta.gate.route === 'publish') {
    throw new Error(`renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish`);
  }
  const frontmatter = [
    '---',
```

**In `gate/src/render/render.ts`, replace:**
```ts
    sentences,
    gate: { route: meta.gate.route, checks: { ...meta.gate.checks }, holdReasons: [...meta.gate.holdReasons] },
    ...(meta.verifier === undefined ? {} : { verifier: structuredClone(meta.verifier) }),
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
```

**with:**
```ts
    sentences,
    gate: { route: meta.gate.route, checks: { ...meta.gate.checks }, holdReasons: [...meta.gate.holdReasons] },
    ...(release === undefined ? {} : { release }),
    ...(meta.verifier === undefined ? {} : { verifier: structuredClone(meta.verifier) }),
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  34 passed (34)`.

- [ ] **Step 3: Write the failing tests of the receipts page and the method page**

**In `site/test/receipts.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, LedgerEntry } from '@robywire/gate';
import { receiptsView } from '../src/lib/receipts';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, LedgerEntry } from '@robywire/gate';
import { receiptsView, releaseNote, routeText } from '../src/lib/receipts';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
```

**In `site/test/receipts.test.ts`, replace:**
```ts
});

describe('receiptsView: the page header', () => {
  it('carries the slug and the title', () => {
```

**with:**
```ts
});

describe('routeText', () => {
  it('says in words what the gate did, so that a route is never shown on its own', () => {
    expect(routeText('publish')).toBe('The gate cleared this piece.');
    expect(routeText('hold')).toBe('The gate held this draft for the owner.');
    expect(routeText('revise')).toBe('The gate sent this draft back for revision.');
  });

  it('is part of the gate summary', () => {
    expect(view.gate.routeText).toBe(routeText(view.gate.route));
    const held = structuredClone(golden);
    held.gate = { route: 'hold', checks: held.gate.checks, holdReasons: ['TIER2_ATTRIBUTION'] };
    delete held.release;
    expect(receiptsView(held).gate.routeText).toBe('The gate held this draft for the owner.');
  });
});

describe('releaseNote', () => {
  it('says that the gate published the piece without a human, for auto', () => {
    expect(releaseNote('auto')).toBe('Published by the gate without a human.');
  });

  it('says that the gate held the piece and the owner released it, for owner', () => {
    expect(releaseNote('owner')).toBe('Held by the gate, then released by the owner.');
  });

  it('says nothing when the ledger does not say', () => {
    expect(releaseNote(undefined)).toBeUndefined();
  });
});

describe('receiptsView: how the piece was released', () => {
  const without = (() => {
    const copy = structuredClone(golden);
    delete copy.release;
    return copy;
  })();

  it('has no note when the ledger has no release, and no key either', () => {
    expect(receiptsView(without).releaseNote).toBeUndefined();
    expect('releaseNote' in receiptsView(without)).toBe(false);
  });

  it('has the note for auto', () => {
    expect(receiptsView({ ...without, release: 'auto' }).releaseNote).toBe('Published by the gate without a human.');
  });

  it('has the note for owner', () => {
    const held = structuredClone(without);
    held.gate = { route: 'hold', checks: held.gate.checks, holdReasons: ['TIER2_ATTRIBUTION'] };
    expect(receiptsView({ ...held, release: 'owner' }).releaseNote).toBe('Held by the gate, then released by the owner.');
  });
});

describe('receiptsView: the page header', () => {
  it('carries the slug and the title', () => {
```

**In `site/test/method.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig } from '@robywire/gate';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig } from '@robywire/gate';
import { releaseNote } from '../src/lib/receipts';
import { OWNER_RELEASE_TEXT, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
```

**In `site/test/method.test.ts`, replace:**
```ts
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

**with:**
```ts
});

describe('OWNER_RELEASE_TEXT', () => {
  it('is one sentence', () => {
    expect(OWNER_RELEASE_TEXT).toMatch(/^[A-Z]/);
    expect(OWNER_RELEASE_TEXT.endsWith('.')).toBe(true);
    expect(OWNER_RELEASE_TEXT.slice(0, -1).replaceAll(/"[^"]*"/g, '')).not.toMatch(/[.!?](\s|$)/);
  });

  it('says that a held draft is published only if the owner decides to release it', () => {
    expect(OWNER_RELEASE_TEXT).toContain('A held draft is published only if the owner decides to release it');
  });

  it('quotes what the receipts page of an owner-released piece says, so the two cannot drift apart', () => {
    expect(OWNER_RELEASE_TEXT).toContain(`"${releaseNote('owner')}"`);
  });

  it('says that a sentence resting on another outlet is labelled Unconfirmed. in the article', () => {
    expect(OWNER_RELEASE_TEXT).toContain('each sentence that rests on another outlet is labelled "Unconfirmed." in the article');
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts test/method.test.ts`
Expected: FAIL — `routeText`, `releaseNote` and `OWNER_RELEASE_TEXT`.

- [ ] **Step 4: Write the release line and the sentence**

**In `site/src/lib/receipts.ts`, replace:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Route, Status } from '@robywire/gate';
import { reasonLabel } from './reasons';

```

**with:**
```ts
import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Release, Route, Status } from '@robywire/gate';
import { reasonLabel } from './reasons';

```

**In `site/src/lib/receipts.ts`, replace:**
```ts
export interface GateSummary {
  route: Route;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: HoldReason[];
}

export interface ReceiptsView {
  slug: string;
  title: string;
  claims: ReceiptClaim[];
  gate: GateSummary;
  verifier?: { model: string; passed: boolean; notes: string[] };
```

**with:**
```ts
export interface GateSummary {
  route: Route;
  /** What the route means, in a sentence. The page never shows a route on its own. */
  routeText: string;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: HoldReason[];
}

const ROUTE_TEXT: Record<Route, string> = {
  publish: 'The gate cleared this piece.',
  hold: 'The gate held this draft for the owner.',
  revise: 'The gate sent this draft back for revision.',
};

/** What a route of the gate means, in a sentence. */
export const routeText = (route: Route): string => ROUTE_TEXT[route];

/**
 * How the piece came to be published, in a sentence, or undefined when the ledger does not say:
 * an older piece, or one the pipeline wrote before it recorded the release.
 */
export function releaseNote(release: Release | undefined): string | undefined {
  if (release === 'auto') return 'Published by the gate without a human.';
  if (release === 'owner') return 'Held by the gate, then released by the owner.';
  return undefined;
}

export interface ReceiptsView {
  slug: string;
  title: string;
  claims: ReceiptClaim[];
  /** How the piece came to be published; absent when the ledger does not say. */
  releaseNote?: string;
  gate: GateSummary;
  verifier?: { model: string; passed: boolean; notes: string[] };
```

**In `site/src/lib/receipts.ts`, replace:**
```ts
    gate: {
      route: ledger.gate.route,
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: ledger.gate.holdReasons.map((code) => ({ code, label: reasonLabel(code) })),
    },
  };
  if (ledger.verifier !== undefined) view.verifier = { ...ledger.verifier, notes: [...ledger.verifier.notes] };
  return view;
```

**with:**
```ts
    gate: {
      route: ledger.gate.route,
      routeText: routeText(ledger.gate.route),
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: ledger.gate.holdReasons.map((code) => ({ code, label: reasonLabel(code) })),
    },
  };
  const note = releaseNote(ledger.release);
  if (note !== undefined) view.releaseNote = note;
  if (ledger.verifier !== undefined) view.verifier = { ...ledger.verifier, notes: [...ledger.verifier.notes] };
  return view;
```

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
    <section aria-labelledby="gate-heading">
      <h2 id="gate-heading">Gate result</h2>
      <p>{passed} of {view.gate.checks.length} checks passed. Route: <span class="chip">{view.gate.route}</span></p>
      <ul class="checks">
        {
```

**with:**
```astro
    <section aria-labelledby="gate-heading">
      <h2 id="gate-heading">Gate result</h2>
      <p>{passed} of {view.gate.checks.length} checks passed. {view.gate.routeText}</p>
      {view.releaseNote !== undefined && <p>{view.releaseNote}</p>}
      <ul class="checks">
        {
```

**In `site/src/lib/method.ts`, replace:**
```ts
import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
```

**with:**
```ts
import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';
import { releaseNote } from './receipts';

// The words of the method page that a test needs to reach: the nine rules of
```

**In `site/src/lib/method.ts`, replace:**
```ts
}

export interface PipelineStage {
  name: string;
```

**with:**
```ts
}

/** What the site shows for a held draft that the owner decides to publish. The words quoted are the ones the receipts page uses. */
export const OWNER_RELEASE_TEXT = `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${releaseNote('owner')}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`;

export interface PipelineStage {
  name: string;
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
import Base from '../../layouts/Base.astro';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

```

**with:**
```astro
import Base from '../../layouts/Base.astro';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { OWNER_RELEASE_TEXT, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

```

**In `site/src/pages/method/index.astro`, replace:**
```astro
        wrong one.
      </p>

      <h2 id="corrections">Corrections and retractions</h2>
```

**with:**
```astro
        wrong one.
      </p>
      <p>{OWNER_RELEASE_TEXT}</p>

      <h2 id="corrections">Corrections and retractions</h2>
```

Run: `npm test --workspace @robywire/site -- test/receipts.test.ts test/method.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Write the failing fixture tests**

The tests name five pieces, say how each was released, and describe the fifth: one claim from a made-up outlet on a `*.example` address, the label in its article, the flag in its ledger, a retrieval dated on the day of the piece. The generator must also stop when the piece that should be held is cleared, or fails. The new groups read the fifth piece when the file loads, so the whole file fails until the generator makes it.

**In `site/test/fixtures.test.ts`, replace:**
```ts
  'fixture-robotics-ships-fx-3-to-second-plant',
  'fixture-robotics-ships-fx-4-to-second-plant',
];

const scratch: string[] = [];
```

**with:**
```ts
  'fixture-robotics-ships-fx-3-to-second-plant',
  'fixture-robotics-ships-fx-4-to-second-plant',
  'fixture-robotics-ships-fx-5-to-second-plant',
];
// The fifth piece rests on another outlet's reporting. The gate holds it, and the owner released it.
const HELD_SLUG = SLUGS[4]!;

const scratch: string[] = [];
```

**In `site/test/fixtures.test.ts`, replace:**
```ts

describe('fixtureFiles: what is generated', () => {
  it('has a piece and a ledger for each of the four slugs, and the desk state', () => {
    expect([...files.keys()].sort()).toEqual(
      [...SLUGS.flatMap((slug) => [`news/${slug}.mdx`, `ledger/${slug}.json`]), 'desk-state.json'].sort(),
```

**with:**
```ts

describe('fixtureFiles: what is generated', () => {
  it('has a piece and a ledger for each of the five slugs, and the desk state', () => {
    expect([...files.keys()].sort()).toEqual(
      [...SLUGS.flatMap((slug) => [`news/${slug}.mdx`, `ledger/${slug}.json`]), 'desk-state.json'].sort(),
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
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

```

**with:**
```ts
    );
  });

  it('stops when the piece that should be held is cleared by the gate, or fails it', () => {
    const cleared = fixturePieces();
    cleared[4] = { ...cleared[0]!, slug: HELD_SLUG, runId: 'fixture-run-5', route: 'hold' };
    expect(() => fixtureFiles(cleared)).toThrow(`generate-fixtures: the fixture ${HELD_SLUG} does not hold (route publish: none)`);
    const failing = fixturePieces();
    failing[4]!.input.draft.opening = [];
    expect(() => fixtureFiles(failing)).toThrow(`generate-fixtures: the fixture ${HELD_SLUG} does not hold (route revise: G2_OPENING_LENGTH`);
  });
});

describe('fixtureFiles: the pieces', () => {
  it('dates the golden piece 4 Oct 2026 and the variants one day earlier each, the last one two', () => {
    const dates = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).publishedAt);
    expect(dates).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01', '2026-09-29']);
  });

  it('files the golden piece under industrial-warehouse and funding, and gives the others other beats', () => {
    const categories = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).categories);
    expect(categories).toEqual([
      ['industrial-warehouse', 'funding'],
      ['humanoids'],
      ['policy-standards'],
      ['home-consumer', 'field-mobility'],
      ['policy-standards', 'funding'],
    ]);
  });

  it.each(SLUGS.map((slug, at) => [slug, at + 1, at === 4 ? 'hold' : 'publish'] as const))('%s: ledger and MDX agree and the gate said %s', (slug, run, route) => {
    const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
    expect(ledger.slug).toBe(slug);
    expect(ledger.runId).toBe(`fixture-run-${run}`);
    expect(ledger.gate.route).toBe(route);
    expect(Object.values(ledger.gate.checks).every((result) => result === 'pass')).toBe(true);

```

**In `site/test/fixtures.test.ts`, replace:**
```ts
  it('names a different product in each piece', () => {
    const titles = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).title);
    expect(titles.map((title) => /FX-(\d)/.exec(title)![1])).toEqual(['1', '2', '3', '4']);
  });

```

**with:**
```ts
  it('names a different product in each piece', () => {
    const titles = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).title);
    expect(titles.map((title) => /FX-(\d)/.exec(title)![1])).toEqual(['1', '2', '3', '4', '5']);
  });

```

**In `site/test/fixtures.test.ts`, replace:**
```ts
});

describe('fixtureFiles: the desk state', () => {
  const state = DeskState.parse(JSON.parse(text('desk-state.json')));
```

**with:**
```ts
});

describe('fixtureFiles: how each piece was released', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));

  it('says the gate published the four ordinary pieces without a human', () => {
    expect(SLUGS.slice(0, 4).map((slug) => ledgerOf(slug).release)).toEqual(['auto', 'auto', 'auto', 'auto']);
  });

  it('says the owner released the fifth, which the gate held for resting on another outlet', () => {
    const ledger = ledgerOf(HELD_SLUG);
    expect(ledger.release).toBe('owner');
    expect(ledger.gate.route).toBe('hold');
    expect(ledger.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });
});

describe('fixtureFiles: the piece that rests on another outlet', () => {
  const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${HELD_SLUG}.json`)));
  const mdx = text(`news/${HELD_SLUG}.mdx`);

  it('cites one tier-2 claim, from a fictional outlet on a .example address, and no other claim of tier 2', () => {
    const tier2 = ledger.claims.filter((claim) => claim.source.tier === 2);
    expect(tier2.map((claim) => [claim.id, claim.source.outlet])).toEqual([['c-19', 'Mercer Wire']]);
    expect(new URL(tier2[0]!.source.url).hostname).toBe('mercer-wire.example');
    expect(ledger.sources.filter((source) => source.tier === 2)).toHaveLength(1);
  });

  it('writes the sentence that rests on it as an attribution with the label Unconfirmed., and marks it in the ledger', () => {
    const marker = ledger.order.indexOf('c-19') + 1;
    expect(mdx).toContain(`**Unconfirmed.** Mercer Wire reports that 7 investors took part in the round.[${marker}](/news/${HELD_SLUG}/receipts/#c-19)`);
    expect(ledger.sentences.filter((sentence) => sentence.attributed === true).map((sentence) => sentence.claimIds)).toEqual([['c-19']]);
  });

  it('is the only piece with the label: the four others rest on first-hand sources only', () => {
    for (const slug of SLUGS.slice(0, 4)) expect(text(`news/${slug}.mdx`), slug).not.toContain('Unconfirmed');
  });

  it('dates its retrieval on the day of the piece', () => {
    expect(ledger.sources.every((source) => source.retrievedAt === '2026-09-29T04:30:00Z')).toBe(true);
  });
});

describe('fixtureFiles: the desk state', () => {
  const state = DeskState.parse(JSON.parse(text('desk-state.json')));
```

**In `site/test/fixtures.test.ts`, replace:**
```ts
  });

  it('records two holds, with a gate code and the tier-2 reason, on days with no piece', () => {
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
```

**with:**
```ts
  });

  it('records two holds, with a gate code and the tier-2 reason: the first on a day with no piece, the second released by the owner the same day', () => {
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
```

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: FAIL — `no fixture file ledger/fixture-robotics-ships-fx-5-to-second-plant.json`

- [ ] **Step 6: Make the fifth piece**

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
import { DeskState, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeVariant } from '@robywire/gate/fixtures';
import { latestCorrectionDay } from '../src/lib/desk-state';

// Writes the fixture content the site shows when it is built with
// ROBYWIRE_FIXTURES=1: four news pieces with their ledgers, and a desk state.
// Everything is fictional (Fixture Robotics, the FX-1 family, *.example
// domains) and generated from the golden piece by the same renderer the real
```

**with:**
```ts
import { DeskState, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeTier2Variant, makeVariant } from '@robywire/gate/fixtures';
import { latestCorrectionDay } from '../src/lib/desk-state';

// Writes the fixture content the site shows when it is built with
// ROBYWIRE_FIXTURES=1: five news pieces with their ledgers, and a desk state.
// Everything is fictional (Fixture Robotics, the FX-1 family, *.example
// domains) and generated from the golden piece by the same renderer the real
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
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
```

**with:**
```ts
  runId: string;
  input: GateInput;
  /**
   * What the gate must decide for the fixture. `publish` is an ordinary piece. `hold` is a piece that
   * rests on another outlet: the gate holds it, and the fixture stands for one that the owner released.
   */
  route: 'publish' | 'hold';
}

// Each variant is the golden story about the next product, one day earlier. The last one is written the way
// a piece that rests on another outlet must be (see makeTier2Variant), so the gate holds it, and it is
// dated the day of the 'TIER2_ATTRIBUTION' hold in the desk state: the owner released that draft.
const VARIANTS = [
  { n: 2, publishedAt: '2026-10-03', categories: ['humanoids'], tier2: false },
  { n: 3, publishedAt: '2026-10-02', categories: ['policy-standards'], tier2: false },
  { n: 4, publishedAt: '2026-10-01', categories: ['home-consumer', 'field-mobility'], tier2: false },
  { n: 5, publishedAt: '2026-09-29', categories: ['policy-standards', 'funding'], tier2: true },
];

const GOLDEN_RETRIEVED_AT = '2026-10-04T04:30:00Z';

/** The five fixture pieces as gate input: the golden piece and four variants of it. */
export function fixturePieces(): FixturePiece[] {
  const golden: FixturePiece = { slug: GOLDEN_DRAFT.slug, runId: 'fixture-run-1', input: cloneGolden(), route: 'publish' };
  const variants = VARIANTS.map(({ n, publishedAt, categories, tier2 }, at): FixturePiece => {
    const slug = GOLDEN_DRAFT.slug.replace('fx-1', `fx-${n}`);
    const input = makeVariant(cloneGolden(), {
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
      ],
    });
    return { slug, runId: `fixture-run-${at + 2}`, input };
  });
  return [golden, ...variants];
```

**with:**
```ts
      ],
    });
    return { slug, runId: `fixture-run-${at + 2}`, input: tier2 ? makeTier2Variant(input) : input, route: tier2 ? 'hold' : 'publish' };
  });
  return [golden, ...variants];
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
/**
 * Every fixture file as a map from its path under the fixtures folder to its
 * content, in sorted order. A piece that does not pass the whole gate stops
 * the generator: a fixture must be something the real site could publish.
 * A piece that has a correction in the desk state gets `updatedAt`, the day
 * of its latest one, as the site requires.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
```

**with:**
```ts
/**
 * Every fixture file as a map from its path under the fixtures folder to its
 * content, in sorted order. A piece for which the gate decides anything but
 * what the fixture stands for stops the generator: a fixture must be something
 * the real pipeline could publish, by itself or, for a hold, with the owner's
 * release (the ledger says which). A piece that has a correction in the desk
 * state gets `updatedAt`, the day of its latest one, as the site requires.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
```

**In `site/scripts/generate-fixtures.ts`, replace:**
```ts
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
    if (result.route !== 'publish') {
      const codes = result.failures.map((failure) => failure.code).join(', ');
      throw new Error(`generate-fixtures: the fixture ${piece.slug} does not publish (route ${result.route}: ${codes})`);
    }
    const updatedAt = latestCorrectionDay(state.corrections, piece.slug);
    const meta = { runId: piece.runId, gate: result, ...(updatedAt === undefined ? {} : { updatedAt }) };
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, meta);
    files.set(`news/${piece.slug}.mdx`, mdx);
```

**with:**
```ts
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
    if (result.route !== piece.route) {
      const codes = [...result.failures.map((failure) => failure.code), ...result.holdReasons].join(', ');
      throw new Error(`generate-fixtures: the fixture ${piece.slug} does not ${piece.route} (route ${result.route}: ${codes === '' ? 'none' : codes})`);
    }
    const updatedAt = latestCorrectionDay(state.corrections, piece.slug);
    const release = piece.route === 'publish' ? 'auto' : 'owner';
    const meta = { runId: piece.runId, gate: result, release, ...(updatedAt === undefined ? {} : { updatedAt }) } as const;
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, meta);
    files.set(`news/${piece.slug}.mdx`, mdx);
```

Run: `npm test --workspace @robywire/site -- test/fixtures.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 7: Show that the committed fixtures are out of date, and regenerate them**

Run: `npm run fixtures:check`
Expected: FAIL — `+  "release": "auto",`, `+  "release": "owner",` and `Fixtures are out of date`.

Run: `npm run fixtures:generate --workspace @robywire/site`

Run: `git status --short`
Expected: PASS — `?? site/src/content-fixtures/news/fixture-robotics-ships-fx-5-to-second-plant.mdx` and `?? site/src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json`

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 8: Write the failing tests of the counts**

The strip of the home page counted five pieces and 140 claims once the fifth piece existed. The tests say 139: one of the claims of the fifth piece comes from another outlet.

**In `site/test/stats.test.ts`, replace:**
```ts
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
```

**with:**
```ts
  it('counts the pieces, adds up the claims they cite, counts the holds and passes the last run through', () => {
    const stats = ledgerStats(ledgers, fixtureState);
    expect(stats.pieces).toBe(5);
    expect(stats.claims).toBe(ledgers.reduce((total, entry) => total + entry.claims.filter((claim) => claim.source.tier === 1).length, 0));
    expect(stats.claims).toBe(5 * 28 - 1);
    expect(stats.held).toBe(2);
    expect(stats.lastRun).toEqual(fixtureState.lastRun);
  });

  it('does not count a claim that comes from another outlet as verified: it is reported, not traced to a primary source', () => {
    const first = structuredClone(ledgers[0]!);
    const before = ledgerStats([first], EMPTY).claims;
    first.claims[0]!.source = { ...first.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    expect(ledgerStats([first], EMPTY).claims).toBe(before - 1);
    expect(ledgerStats([first], EMPTY).pieces).toBe(1);
  });

  it('counts holds from the desk state, not from the pieces', () => {
    expect(ledgerStats(ledgers, EMPTY).held).toBe(0);
```

**In `site/test/stats.test.ts`, replace:**
```ts
  it('shows the figures, and the date, time and outcome of the last run', () => {
    expect(stripItems(ledgerStats(ledgers, fixtureState))).toEqual([
      { label: 'Pieces published', value: '4' },
      { label: 'Claims verified', value: '112' },
      { label: 'Drafts held', value: '2' },
      { label: 'Last run', value: '4 Oct 2026', note: '04:41 UTC, published' },
```

**with:**
```ts
  it('shows the figures, and the date, time and outcome of the last run', () => {
    expect(stripItems(ledgerStats(ledgers, fixtureState))).toEqual([
      { label: 'Pieces published', value: '5' },
      { label: 'Claims verified', value: '139' },
      { label: 'Drafts held', value: '2' },
      { label: 'Last run', value: '4 Oct 2026', note: '04:41 UTC, published' },
```

Run: `npm test --workspace @robywire/site -- test/stats.test.ts`
Expected: FAIL — `does not count a claim that comes from another outlet as verified`

**In `site/src/lib/stats.ts`, replace:**
```ts
  /** Pieces published. */
  pieces: number;
  /** Claims cited by those pieces, added up. */
  claims: number;
  /** Drafts the gate held for the owner. */
```

**with:**
```ts
  /** Pieces published. */
  pieces: number;
  /**
   * Claims cited by those pieces that come from a primary source (tier 1), added up. A claim from
   * another outlet is reported, not traced to a primary source, so it is not counted as verified.
   */
  claims: number;
  /** Drafts the gate held for the owner. */
```

**In `site/src/lib/stats.ts`, replace:**
```ts
  return {
    pieces: entries.length,
    claims: entries.reduce((total, entry) => total + entry.claims.length, 0),
    held: state.holds.length,
    lastRun: state.lastRun,
```

**with:**
```ts
  return {
    pieces: entries.length,
    claims: entries.reduce((total, entry) => total + entry.claims.filter((claim) => claim.source.tier === 1).length, 0),
    held: state.holds.length,
    lastRun: state.lastRun,
```

Run: `npm test --workspace @robywire/site -- test/stats.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 9: Write the failing Lighthouse tests, and the code**

The page list is now computed from the home page and from the article pages: a function reads an article when it needs to know whether it carries the label.

**In `site/test/lighthouse-lib.test.ts`, replace:**
```ts
});

describe('chromeFlags', () => {
  it('runs Chrome headless', () => {
```

**with:**
```ts
});

describe('pagesToTest: an article that rests on another outlet', () => {
  const HELD = 'fixture-robotics-ships-fx-5-to-second-plant';
  const links = `${LEAD}<h2><a href="/news/fixture-robotics-ships-fx-2-to-second-plant/">Second</a></h2><h2><a href="/news/${HELD}/">Held</a></h2>`;
  const label = '<p><strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part.</p>';
  const articles = (pages: Record<string, string>) => (route: string) => pages[route];

  it('adds the first article with the Unconfirmed. label, and its receipts page, after the lead article and its receipts', () => {
    const read = articles({ [`/news/${SLUG}/`]: '<p>plain</p>', '/news/fixture-robotics-ships-fx-2-to-second-plant/': '<p>plain</p>', [`/news/${HELD}/`]: label });
    expect(pagesToTest(home(RIBBON + links), read)).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${HELD}/`, `/news/${HELD}/receipts/`]);
  });

  it('measures the lead once when the lead is the article that carries the label', () => {
    expect(pagesToTest(home(RIBBON + links), articles({ [`/news/${SLUG}/`]: label, [`/news/${HELD}/`]: label }))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${HELD}/`, `/news/${HELD}/receipts/`]);
    expect(pagesToTest(home(RIBBON + LEAD), articles({ [`/news/${SLUG}/`]: label }))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('takes the first of several articles with the label', () => {
    const read = articles({ '/news/fixture-robotics-ships-fx-2-to-second-plant/': label, [`/news/${HELD}/`]: label });
    expect(pagesToTest(home(RIBBON + links), read)[3]).toBe('/news/fixture-robotics-ships-fx-2-to-second-plant/');
  });

  it('adds nothing when no article has the label, or when an article cannot be read', () => {
    expect(pagesToTest(home(RIBBON + links), articles({}))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('does not take the word in running text, or another bold label, for the label', () => {
    const read = articles({ [`/news/${HELD}/`]: '<p>It is Unconfirmed. <strong>Analysis.</strong> Not that.</p>' });
    expect(pagesToTest(home(RIBBON + links), read)).toHaveLength(3);
  });
});

describe('chromeFlags', () => {
  it('runs Chrome headless', () => {
```

**In `site/test/lighthouse-cli.test.ts`, replace:**
```ts
});

/** A small built site with the given home page. */
function dist(homeBody: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-lh-'));
  folders.push(dir);
```

**with:**
```ts
});

/** A small built site with the given home page, and any files in `more` (by path inside the build). */
function dist(homeBody: string, more: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-lh-'));
  folders.push(dir);
```

**In `site/test/lighthouse-cli.test.ts`, replace:**
```ts
    [`news/${SLUG}/index.html`]: '<!doctype html><title>Article</title>',
    [`news/${SLUG}/receipts/index.html`]: '<!doctype html><title>Receipts</title>',
  };
  for (const [file, text] of Object.entries(files)) {
```

**with:**
```ts
    [`news/${SLUG}/index.html`]: '<!doctype html><title>Article</title>',
    [`news/${SLUG}/receipts/index.html`]: '<!doctype html><title>Receipts</title>',
    ...more,
  };
  for (const [file, text] of Object.entries(files)) {
```

**In `site/test/lighthouse-cli.test.ts`, replace:**
```ts
  });

  it('exits 1 and names each score below 95', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: url === '/' ? { ...PERFECT, seo: 0.9 } : PERFECT })));
```

**with:**
```ts
  });

  it('measures an article that carries the Unconfirmed. label and its receipts page as well, when the build has one', async () => {
    const held = 'fixture-robotics-ships-fx-5-to-second-plant';
    const site = dist(`${RIBBON}<a href="/news/${SLUG}/">Title</a><a href="/news/${held}/">Held</a>`, {
      [`news/${held}/index.html`]: '<!doctype html><title>Held</title><p><strong>Unconfirmed.</strong> Mercer Wire reports it.</p>',
      [`news/${held}/receipts/index.html`]: '<!doctype html><title>Held receipts</title>',
    });
    const seen: { routes: string[]; statuses: number[] } = { routes: [], statuses: [] };
    const { code } = await run(site, async (baseUrl, routes) => {
      seen.routes = routes;
      seen.statuses = await Promise.all(routes.map(async (route) => (await fetch(baseUrl + route)).status));
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen.routes).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${held}/`, `/news/${held}/receipts/`]);
    expect(seen.statuses).toEqual([200, 200, 200, 200, 200]);
    expect(code).toBe(0);
  });

  it('measures the usual three pages when the home page links to an article that has no file in the build', async () => {
    const site = dist(`${RIBBON}<a href="/news/${SLUG}/">Title</a><a href="/news/not-built/">Missing</a>`);
    let seen: string[] = [];
    const { code } = await run(site, async (_baseUrl, routes) => {
      seen = routes;
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
    expect(code).toBe(0);
  });

  it('exits 1 and names each score below 95', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: url === '/' ? { ...PERFECT, seo: 0.9 } : PERFECT })));
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-lib.test.ts test/lighthouse-cli.test.ts`
Expected: FAIL — `an article that rests on another outlet` and `measures an article that carries the Unconfirmed. label`.

**In `site/scripts/lighthouse-lib.mjs`, replace:**
```js
import { attr, elements, parseHtml } from './audit/dom.mjs';

```

**with:**
```js
import { hasUnconfirmedLabel } from './audit/checks-links.mjs';
import { attr, elements, parseHtml } from './audit/dom.mjs';

```

**In `site/scripts/lighthouse-lib.mjs`, replace:**
```js

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

```

**with:**
```js

/**
 * The pages to measure: the home page, the first article the home page links to (its lead piece) and the receipts page of that
 * article; and, when the build has one, the first other article that carries the "Unconfirmed." label (a piece that rests on
 * another outlet) and its receipts page, because those pages have markup the others do not.
 *
 * @param {string} homeHtml
 * @param {(route: string) => string | undefined} [readArticle]  The HTML of the article page at a route, or undefined if it cannot be read.
 * @returns {string[]}
 */
export function pagesToTest(homeHtml, readArticle = () => undefined) {
  const { document } = parseHtml(homeHtml);
  const routes = [
    ...new Set(
      elements(document, 'a')
        .map((link) => attr(link, 'href') ?? '')
        .filter((href) => /^\/news\/[^/]+\/$/.test(href)),
    ),
  ];
  const [lead, ...others] = routes;
  if (lead === undefined) throw new Error('The home page links to no article, so there is no article page to measure.');
  const pages = ['/', lead, `${lead}receipts/`];
  const unconfirmed = others.find((route) => {
    const html = readArticle(route);
    return html !== undefined && hasUnconfirmedLabel(parseHtml(html).document);
  });
  return unconfirmed === undefined ? pages : [...pages, unconfirmed, `${unconfirmed}receipts/`];
}

```

**In `site/scripts/lighthouse.mjs`, replace:**
```js

// `npm run lighthouse` measures the built fixture site with Lighthouse: the
// home page, the lead article and its receipts page, in all four categories.
// It builds nothing. It exits 0 if every score is 95 or more, 1 if any is
// lower, and 2 if it could not measure (no fixture build, no Chrome).
```

**with:**
```js

// `npm run lighthouse` measures the built fixture site with Lighthouse: the
// home page, the lead article and its receipts page, and an article that rests
// on another outlet with its receipts page, in all four categories.
// It builds nothing. It exits 0 if every score is 95 or more, 1 if any is
// lower, and 2 if it could not measure (no fixture build, no Chrome).
```

**In `site/scripts/lighthouse.mjs`, replace:**
```js
}

/**
 * Run the measurement. Returns the exit code.
```

**with:**
```js
}

/**
 * The HTML of the page at `route` in the build, or undefined when there is no such file.
 *
 * @param {string} dist
 * @param {string} route
 * @returns {string | undefined}
 */
function readPage(dist, route) {
  try {
    return readFileSync(path.join(dist, route, 'index.html'), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Run the measurement. Returns the exit code.
```

**In `site/scripts/lighthouse.mjs`, replace:**
```js
  const server = await serve(dist);
  try {
    const rows = await measure(server.url, pagesToTest(home));
    print(`Lighthouse, ${rows.length} pages (phone screen, simulated slow network)`);
    print(formatScores(rows));
```

**with:**
```js
  const server = await serve(dist);
  try {
    const rows = await measure(server.url, pagesToTest(home, (route) => readPage(dist, route)));
    print(`Lighthouse, ${rows.length} pages (phone screen, simulated slow network)`);
    print(formatScores(rows));
```

Run: `npm test --workspace @robywire/site -- test/lighthouse-lib.test.ts test/lighthouse-cli.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 10: Update the README**

**In `README.md`, replace:**
```markdown
| `npm run audit` | Run the checks A1 to A12 and A14 to A16 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article, receipts page) and fail if any score is under 95. |
| `npm run verify` | All of the above in CI order: typecheck, tests, seeded evals, fixture drift, production build, production audit, fixture build, fixture audit, Lighthouse. |

```

**with:**
```markdown
| `npm run audit` | Run the checks A1 to A12 and A14 to A16 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
| `npm run verify` | All of the above in CI order: typecheck, tests, seeded evals, fixture drift, production build, production audit, fixture build, fixture audit, Lighthouse. |

```

**In `README.md`, replace:**
```markdown
## Fixtures

Until the Desk has published something there is nothing real to show, so the site is built and tested on made-up pieces. All of it is fictional: the company is Fixture Robotics, the product is the FX-1, and every address is on `*.example`.

- `npm run fixtures:generate --workspace @robywire/site` writes the fixture pieces, their ledgers and a desk state into `site/src/content-fixtures/`. It starts from the golden piece in `gate/src/fixtures/`, makes variants of it, and runs each through the real gate and the real renderer, so the fixtures are what the Desk will produce.
- The generated files are committed. `npm run fixtures:check` fails if they are out of date.
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.
```

**with:**
```markdown
## Fixtures

Until the Desk has published something there is nothing real to show, so the site is built and tested on made-up pieces. All of it is fictional: the company is Fixture Robotics, the product is the FX-1, and every address is on `*.example`. The outlet that one piece cites, Mercer Wire, is made up too.

- `npm run fixtures:generate --workspace @robywire/site` writes the fixture pieces, their ledgers and a desk state into `site/src/content-fixtures/`. It starts from the golden piece in `gate/src/fixtures/`, makes variants of it, and runs each through the real gate and the real renderer, so the fixtures are what the Desk will produce.
- Five pieces are made. Four are ordinary: the gate clears them and their ledgers say `release: auto`. The fifth (FX-5) rests on one sentence that Mercer Wire reported, so the gate holds it (`TIER2_ATTRIBUTION`). It stands for a draft that the owner then released: its ledger says `release: owner`, its article carries the Unconfirmed. label, and its receipts page says who released it.
- The generated files are committed. `npm run fixtures:check` fails if they are out of date.
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.
```

- [ ] **Step 11: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 12: The production build is still clean**

The fifth piece is a fixture like the others: it must not reach the production build.

Run: `npm run build`
Expected: PASS — `Complete!`

Run: `npm run audit:prod`
Expected: PASS — `ok    A13` and `Passed: 16 checks.`

- [ ] **Step 13: Look at the fixture site**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

The home page lists the fifth piece.

Run: `grep -o 'href="/news/fixture-robotics-ships-fx-5-to-second-plant/"' site/dist/index.html`
Expected: PASS — `href="/news/fixture-robotics-ships-fx-5-to-second-plant/"`

Its article carries the label, in front of the sentence that rests on the other outlet.

Run: `grep -o '<strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part in the round.' site/dist/news/fixture-robotics-ships-fx-5-to-second-plant/index.html`
Expected: PASS — `<strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part in the round.`

Its receipts page says what the gate did and who released the piece, and shows no bare route. The other pieces say they were published without a human.

Run: `grep -o 'The gate held this draft for the owner.' site/dist/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/index.html`
Expected: PASS — `The gate held this draft for the owner.`

Run: `grep -o 'Held by the gate, then released by the owner.' site/dist/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/index.html`
Expected: PASS — `Held by the gate, then released by the owner.`

Run: `grep -o 'Published by the gate without a human.' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/index.html`
Expected: PASS — `Published by the gate without a human.`

Run: `grep -c 'Route:' site/dist/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/index.html`
Expected: FAIL — `0`

The method page has its sentence.

Run: `grep -o 'A held draft is published only if the owner decides to release it' site/dist/method/index.html`
Expected: PASS — `A held draft is published only if the owner decides to release it`

- [ ] **Step 14: Audit the fixture site, and see A16 fail without the label**

With a piece that has the label, A16 has something to read for the first time.

Run: `npm run audit`
Expected: PASS — `ok    A16` and `Passed: 15 checks.`

Take a copy of the build, cut the label out of the article of the fifth piece, and audit the copy.

Run:

```bash
copy=$(mktemp -d)
cp -R site/dist/. "$copy"
sed -i.bak 's#<strong>Unconfirmed.</strong>##' "$copy/news/fixture-robotics-ships-fx-5-to-second-plant/index.html"
node site/scripts/audit.mjs --dir "$copy"
status=$?
rm -rf "$copy"
exit $status
```
Expected: FAIL — `FAIL  A16` and `its receipts page lists 1 claim from a tier-2 source, but the article has no "Unconfirmed." label`.

- [ ] **Step 15: Measure the fixture site**

Run: `npm run lighthouse`
Expected: PASS — `Lighthouse, 5 pages` and `fixture-robotics-ships-fx-5-to-second-plant/receipts/` and `All scores are 95 or more.`

- [ ] **Step 16: Commit**

```bash
git add README.md gate/src gate/test site/scripts site/src site/test
git commit -m "feat: record how a piece was released, show it on the receipts page, and add a fifth fixture piece that was held and then released by the owner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

