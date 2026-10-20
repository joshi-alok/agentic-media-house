## Plan 3 (part 1) — Blockers and notes

**Goal:** the gate separates what must stop a piece from what is only worth saying about it. After this part a draft with a wrong number, date or quote, an uncited fact, a duplicate or a broken structure is still sent back; a draft that is merely short, long, oddly headed, full of capitalised words or fond of a filler phrase is **published with the finding recorded**; and a claim that rests on another outlet no longer forces a hold. The model check (G10) runs on every draft that has no blocker.

| Task | What it does |
|---|---|
| 1 | `NOTE_CODES` and `severityOf`; `runGateWith` splits what the checks report into `failures` (blockers) and `warnings` (notes); the stored gate report accepts `warnings`; the seeded harness counts a note as caught. Nothing is a note yet. |
| 2 | Length and shape become notes: the opening, the takeaways, the body, a question or a long heading, the share of analysis. |
| 3 | Capitalised names, amounts without a figure and filler phrases become notes; the code `G7_ANALYSIS_NEW_NAME` is split off `G7_ANALYSIS_NEW_VALUE`. |
| 4 | The two first-word rules (`G2_SENTENCE_START`, `G4_INITIAL_WORD_UNSUPPORTED`, and the opening-word clause of G7) are deleted with their tests, cases and labels. |
| 5 | G6 stops asking for a hold (`TIER2_ATTRIBUTION` becomes a retired reason); analysis may stand in the opening and the takeaways; the owner-released fixture is built the way the hold flow builds it. |
| 6 | The ledger records the notes (`gate.warnings`), the renderer writes them, the fixtures are regenerated. |
| 7 | The receipts page lists the notes in words. |
| 8 | The seeded evals prove, for every note code, that it is reported as a note and never as a blocker, and for every blocker code that it sends the draft back. |
| 9 | The desk logs notes, and a draft with notes alone goes to the model check and is sent back for nothing. |

**Starting state:** `main` at the design spec commit; `npm run verify` green; 61 of 61 seeded defects caught.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file: `npm test --workspace @robywire/gate -- test/<name>.test.ts` (Vitest arguments follow the `--`). The other workspaces are `@robywire/desk`, `@robywire/site` and `@robywire/evals`.
- A step that says `Expected: FAIL` means the command must exit non-zero and show the quoted fragment. Do not continue until you have seen it. A test that has never failed has not been shown to test anything.
- Do not weaken a test that guards a blocker. A test that guards a rule that has become a note changes as the task says: it asserts the note, not the failure.
- Source files contain ASCII only. Where a test needs another character it uses `String.fromCharCode`.
- Whatever the gate's behaviour changes is regenerated, never edited by hand: `npm run fixtures:generate --workspace @robywire/site` rewrites the site fixtures and `npm run evals:seeded` rewrites `evals/scoreboard/seeded.json`. Both are committed with the task that changes them.
- **After every task the whole suite is green:** `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`. When a task changes a file that is neither listed nor covered by its rule, stop and say so.
- Each task ends with one commit, the message as written and the trailer as the second `-m`.

**Rule R1 (used by Tasks 2, 3 and 5).** A test that sends a defect through `runGate`, a stage or the desk and expects the route `revise` because of a code that has become a note is changed in one of two ways. If it is about the note, it asserts the code is in `gate.warnings`, is not in `gate.failures`, and that the route is not `revise` because of it. If it only needs *some* failure (for example to exercise the revision loop), give it a blocker instead: `G2_SECTIONS_MIN` (`draft.sections = draft.sections.slice(0, 1)`) or `G1_CATEGORY_COUNT` (`draft.categories = []`). A test that calls one check directly (`checkG2(...)`, `checkG4(...)`) is not affected: a check still reports every code it has.

---

### Task 1: The severity of a code, and `warnings`

**Files:**
- Create: `gate/src/severity.ts`, `gate/test/severity.test.ts`, `desk/test/run/gate-report.test.ts`
- Modify: `gate/src/gate.ts`, `gate/src/index.ts`, `gate/test/gate.test.ts`, `gate/test/golden-gate.test.ts` (the list of exported names), `evals/src/run.ts`, `desk/src/run/artifacts.ts`

Nothing changes for any piece in this task: `NOTE_CODES` is empty, so every code is a blocker. The task builds the mechanism and proves it with codes passed in by the test.

- [ ] **Step 1: Write the failing tests**

`gate/test/severity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES } from '../src/checks';
import { NOTE_CODES, SEVERITIES, severityOf } from '../src/severity';

describe('severityOf', () => {
  it('has two severities, blocker and note', () => {
    expect(SEVERITIES).toEqual(['blocker', 'note']);
  });

  it('calls a code on the list of notes a note', () => {
    expect(severityOf('G2_BODY_LENGTH', ['G2_BODY_LENGTH'])).toBe('note');
  });

  it('calls every other code a blocker', () => {
    expect(severityOf('G3_NO_CLAIM', ['G2_BODY_LENGTH'])).toBe('blocker');
  });

  it('calls a code that nothing knows a blocker, so a new check cannot publish a piece by being left out of a table', () => {
    expect(severityOf('G9_SOMETHING_NEW')).toBe('blocker');
  });
});

describe('NOTE_CODES', () => {
  it('lists only codes that a check can report', () => {
    expect(NOTE_CODES.filter((code) => !ALL_FAILURE_CODES.includes(code))).toEqual([]);
  });

  it('lists no code twice', () => {
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
  });
});
```

Append to `gate/test/gate.test.ts` (the stubs `passes`, `fails`, `holds`, `failure` and `INPUT` are already at the top of the file):

```ts
describe('runGateWith: blockers and notes', () => {
  const NOTES = ['G2_BODY_LENGTH', 'G9_BANNED_PHRASE'];
  const runWithNotes = (checks: Check[]) => runGateWith(checks, INPUT, defaultContext(), NOTES);

  it('publishes a draft whose only findings are notes, and lists them as warnings', () => {
    const result = runWithNotes([fails('G2', 'G2_BODY_LENGTH'), passes]);
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([failure('G2', 'G2_BODY_LENGTH')]);
  });

  it('keeps blockers in failures and notes in warnings, each in the order the checks found them', () => {
    const result = runWithNotes([fails('G2', 'G2_BODY_LENGTH'), fails('G3', 'G3_NO_CLAIM'), fails('G9', 'G9_BANNED_PHRASE')]);
    expect(result.failures.map((item) => item.code)).toEqual(['G3_NO_CLAIM']);
    expect(result.warnings.map((item) => item.code)).toEqual(['G2_BODY_LENGTH', 'G9_BANNED_PHRASE']);
    expect(result.route).toBe('revise');
  });

  it('marks a check as fail only when it found a blocker', () => {
    const { checks } = runWithNotes([fails('G2', 'G2_BODY_LENGTH'), fails('G3', 'G3_NO_CLAIM')]);
    expect(checks.G2).toBe('pass');
    expect(checks.G3).toBe('fail');
  });

  it('still holds a draft that has a hold reason and only notes', () => {
    const result = runWithNotes([fails('G2', 'G2_BODY_LENGTH'), holds('a reason')]);
    expect(result.route).toBe('hold');
    expect(result.warnings).toHaveLength(1);
  });

  it('treats a code it is not told is a note as a blocker', () => {
    const result = runGateWith([fails('G2', 'G2_BODY_LENGTH')], INPUT, defaultContext(), []);
    expect(result.route).toBe('revise');
    expect(result.warnings).toEqual([]);
  });

  it('has no notes by default: every code a check reports is still a blocker', () => {
    const result = run([fails('G2', 'G2_BODY_LENGTH')]);
    expect(result.route).toBe('revise');
    expect(result.warnings).toEqual([]);
  });
});
```

In `gate/test/golden-gate.test.ts`, add `'NOTE_CODES'`, `'SEVERITIES'` and `'severityOf'` to the list of names the public API must contain (the `it.each` array that holds `'runGate'`, `'runGateWith'` and the other names, under a new comment line `// severity`).

`desk/test/run/gate-report.test.ts`:

```ts
import { CHECK_IDS } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { GateReport } from '../../src/run/artifacts';

const ALL_PASS = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass']));

describe('GateReport', () => {
  it('accepts a report with notes', () => {
    const report = { route: 'publish', failures: [], warnings: [{ check: 'G2', code: 'G2_BODY_LENGTH', message: 'the body is 300 words' }], holdReasons: [], checks: ALL_PASS };
    expect(GateReport.parse(report)).toEqual(report);
  });

  it('accepts a report written before notes existed', () => {
    const report = { route: 'publish', failures: [], holdReasons: [], checks: ALL_PASS };
    expect(GateReport.parse(report)).toEqual(report);
  });

  it('refuses a note that is not a finding', () => {
    expect(GateReport.safeParse({ route: 'publish', failures: [], warnings: [{ code: 'G2_BODY_LENGTH' }], holdReasons: [], checks: ALL_PASS }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test --workspace @robywire/gate -- test/severity.test.ts test/gate.test.ts`
Expected: FAIL, `Failed to resolve import "../src/severity"` for the first file and `expected undefined to equal` (the missing `warnings`) for the second.

Run: `npm test --workspace @robywire/desk -- test/run/gate-report.test.ts`
Expected: FAIL on the first test (the strict schema refuses the key `warnings`).

- [ ] **Step 3: Write `gate/src/severity.ts`**

```ts
/** How a finding of the gate counts: a blocker sends a draft back, a note is recorded and shown and never blocks. */
export const SEVERITIES = ['blocker', 'note'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * The codes that never block a piece. A check still reports them, and they are listed in the ledger and on the receipts page, so what a soft rule
 * would have cost is public. Every other code is a blocker, and so is a code that is not known at all: a check that gains a code and is left out of
 * this list cannot publish a piece by being left out.
 *
 * A note is a rule about the shape or the style of a piece, or about a word the model check judges better than a word list can. A blocker is a rule
 * about a figure, a quotation, a citation, a duplicate or the structure that the renderer needs.
 */
export const NOTE_CODES: readonly string[] = [];

/** `note` for a code on the list of notes, `blocker` for every other code. */
export function severityOf(code: string, notes: readonly string[] = NOTE_CODES): Severity {
  return notes.includes(code) ? 'note' : 'blocker';
}
```

- [ ] **Step 4: Split the result in `gate/src/gate.ts`**

Replace the import block's last line and the `GateResult`, `runGateWith` and `runGate` parts. After the change the file reads:

```ts
import { ALL_CHECKS } from './checks';
import { CHECK_IDS } from './constants';
import type { CheckId, CheckResult, Route } from './constants';
import type { GateContext } from './config';
import type { Claim, Draft } from './schemas';
import { NOTE_CODES, severityOf } from './severity';

export type { CheckId } from './constants';
export { defaultContext } from './config';
export type { GateConfig, GateContext } from './config';

/** What the gate looks at: a draft and every claim it may cite. */
export interface GateInput {
  draft: Draft;
  claims: Claim[];
}

/** One thing a check found wrong. `code` is stable, `message` is for the composer, `where` locates it. */
export interface Failure {
  check: CheckId;
  code: string;
  message: string;
  where?: string;
}

/**
 * What a check returns. `failures` are everything the check found: the gate decides which of them block (see `severityOf`).
 * `holdReasons` do not send a draft back: they say the draft may be fine but needs the owner.
 */
export interface CheckOutput {
  failures: Failure[];
  holdReasons: string[];
}

/** A check is a pure function of the draft, the claims and the context. */
export type Check = (input: GateInput, ctx: GateContext) => CheckOutput;

export interface GateResult {
  route: Route;
  /** The blockers: what the draft is sent back for. */
  failures: Failure[];
  /** The notes: what was found and does not block (see `NOTE_CODES`). They are recorded in the ledger and never go back to the composer. */
  warnings: Failure[];
  holdReasons: string[];
  /** All nine ids are always present. A check is 'fail' when it produced a blocker. */
  checks: Record<CheckId, CheckResult>;
}

/**
 * Run `checks`, split what they report into blockers and notes by the severity of each code, and decide the route: any blocker means 'revise';
 * otherwise any hold reason means 'hold'; otherwise 'publish'. Every check runs, so one revision round gets every blocker at once. An error
 * thrown by a check is not caught: the run fails and nothing publishes. `notes` is the list of codes that do not block; the default is the
 * gate's own list, and a test may pass another.
 */
export function runGateWith(checks: readonly Check[], input: GateInput, ctx: GateContext, notes: readonly string[] = NOTE_CODES): GateResult {
  const outputs = checks.map((check) => check(input, ctx));
  const found = outputs.flatMap((output) => output.failures);
  const failures = found.filter((item) => severityOf(item.code, notes) === 'blocker');
  const warnings = found.filter((item) => severityOf(item.code, notes) === 'note');
  const holdReasons = outputs.flatMap((output) => output.holdReasons);

  const summary = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as Record<CheckId, CheckResult>;
  for (const item of failures) {
    summary[item.check] = 'fail';
  }

  const route: Route = failures.length > 0 ? 'revise' : holdReasons.length > 0 ? 'hold' : 'publish';
  return { route, failures, warnings, holdReasons, checks: summary };
}

/** Run every check in `ALL_CHECKS`. */
export function runGate(input: GateInput, ctx: GateContext): GateResult {
  return runGateWith(ALL_CHECKS, input, ctx);
}
```

In `gate/src/index.ts` add, after `export * from './sentences';`:

```ts
export * from './severity';
```

- [ ] **Step 5: The stored gate report and the seeded harness**

In `desk/src/run/artifacts.ts` replace the `GateReport` definition (the comment above it stays) with:

```ts
/** One finding of the gate as the record keeps it: the check, the code, the message for the composer and where it was found. */
const GateFinding = z.strictObject({ check: z.enum(CHECK_IDS), code: text, message: text, where: z.string().optional() });

export const GateReport = z.strictObject({
  route: z.enum(ROUTES),
  failures: z.array(GateFinding),
  /** The notes: findings that did not block the draft. Absent in a record made before notes existed. */
  warnings: z.array(GateFinding).optional(),
  holdReasons: z.array(text),
  checks: z.record(z.enum(CHECK_IDS), z.enum(CHECK_RESULTS)),
});
export type GateReport = z.infer<typeof GateReport>;
```

In `evals/src/run.ts` replace the body of the `cases.map` callback and the doc comment of `caught`:

```ts
  /** True when the gate reported a finding from `check` with `code`, as a blocker or as a note. */
  caught: boolean;
  /** Every distinct code the gate reported for the broken piece, in order, blockers and notes alike. */
  gotCodes: string[];
```

```ts
  const results = cases.map((item): CaseResult => {
    const result = runGateWith(checks, item.apply(cloneGolden()), seededContext());
    const reported = [...result.failures, ...result.warnings];
    return {
      id: item.id,
      check: item.check,
      code: item.code,
      caught: reported.some((finding) => finding.check === item.check && finding.code === item.code),
      gotCodes: [...new Set(reported.map((finding) => finding.code))],
    };
  });
```

- [ ] **Step 6: Run the new tests, then the whole suite**

Run: `npm test --workspace @robywire/gate -- test/severity.test.ts test/gate.test.ts test/golden-gate.test.ts` then `npm test --workspace @robywire/desk -- test/run/gate-report.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: every command exits 0, `61 of 61` in the seeded output. If the typecheck names a place that builds a `GateResult` by hand (a stub in a test, `renderHeldPiece`), add `warnings: []` there (in `desk/src/stages/hold-pr.ts` use `warnings: held.gate.warnings ?? []`); that is the whole fallout.

- [ ] **Step 7: Commit**

```bash
git add gate desk evals
git commit -m "feat(gate): a finding is a blocker unless its code is a note, and a result keeps the notes in warnings, so a rule about shape or style can stop blocking without being deleted" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Length and shape become notes

**Files:**
- Modify: `gate/src/severity.ts`, `gate/test/severity.test.ts`, `gate/test/golden-gate.test.ts`, `gate/test/gate.test.ts`, `desk/test/stages/compose.test.ts`, `desk/test/stages/verify.test.ts`, `site/test/fixtures.test.ts`, `evals/test/scoreboard.test.ts`

The six codes: `G2_OPENING_LENGTH`, `G2_TAKEAWAYS_COUNT`, `G2_BODY_LENGTH`, `G2_HEADING_QUESTION`, `G2_HEADING_TOO_LONG`, `G7_ANALYSIS_SHARE`. A press release leaves 3 to 8 claims; a rule that demands 600 words of them made every real trial fail.

- [ ] **Step 1: Write the failing tests**

In `gate/test/severity.test.ts` add inside `describe('NOTE_CODES', ...)`:

```ts
  it('holds the length and the shape of a piece as notes', () => {
    expect([...NOTE_CODES]).toEqual([
      'G2_OPENING_LENGTH',
      'G2_TAKEAWAYS_COUNT',
      'G2_BODY_LENGTH',
      'G2_HEADING_QUESTION',
      'G2_HEADING_TOO_LONG',
      'G7_ANALYSIS_SHARE',
    ]);
  });
```

Append to `gate/test/golden-gate.test.ts`:

```ts
describe('runGate: length and shape are notes', () => {
  it('publishes a piece whose body is outside the range, and lists the length as a note', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(['G2_BODY_LENGTH']);
    expect(result.checks.G2).toBe('pass');
  });

  it('publishes a piece whose heading is a question, and lists the heading as a note', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.sections[0]!.heading = 'What shipped?';
      }),
      api.defaultContext(),
    );
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(['G2_HEADING_QUESTION']);
  });

  it('still sends a piece back for a broken structure: a piece with one section is a blocker', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.sections = g.draft.sections.slice(0, 1);
      }),
      api.defaultContext(),
    );
    expect(result.failures.map((item) => item.code)).toContain('G2_SECTIONS_MIN');
    expect(result.route).toBe('revise');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test --workspace @robywire/gate -- test/severity.test.ts test/golden-gate.test.ts`
Expected: FAIL: the list of notes is `[]`, and the golden piece with a 5000-word range has the route `revise`.

- [ ] **Step 3: Implement**

In `gate/src/severity.ts` replace the empty list:

```ts
export const NOTE_CODES: readonly string[] = [
  'G2_OPENING_LENGTH',
  'G2_TAKEAWAYS_COUNT',
  'G2_BODY_LENGTH',
  'G2_HEADING_QUESTION',
  'G2_HEADING_TOO_LONG',
  'G7_ANALYSIS_SHARE',
];
```

- [ ] **Step 4: Fix what fails (rule R1)**

Run: `npm test`. The failures, and only these, are expected; apply R1 to each:

- `gate/test/gate.test.ts`, "marks only the checks that produced a failure as fail": the stub `fails('G2', 'G2_BODY_LENGTH')` becomes `fails('G2', 'G2_SECTIONS_MIN')`. In the section about the default list, nothing else changes. The test added in Task 1, "has no notes by default: every code a check reports is still a blocker", now fails by design: change it to "has the notes of the gate by default", with `fails('G2', 'G2_BODY_LENGTH')` expected to give the route `publish` and one warning, and add a second case with `fails('G2', 'G2_SECTIONS_MIN')` expecting `revise`.
- `gate/test/golden-gate.test.ts`: delete the row `['G2', 'G2_HEADING_QUESTION', ...]` from the `defects` table (the new test above covers it); in the test "revises, and still lists the hold reason, when a properly attributed piece also has a failure elsewhere" change the heading mutation from `'What shipped?'` to `''` (a blocker, `G2_HEADING_EMPTY`).
- `desk/test/stages/compose.test.ts`: the table `ROWS` of "a script that breaks a rule is caught": move the six rows whose code is now a note (`G2_HEADING_QUESTION`, `G2_HEADING_TOO_LONG`, `G7_ANALYSIS_SHARE`, `G2_OPENING_LENGTH`, `G2_TAKEAWAYS_COUNT`, `G2_BODY_LENGTH`) into a second table `NOTE_ROWS` with this test, and add `notes` to the result of the helper `verdictOn` (`notes: [...new Set(result.gate.warnings.map((finding) => finding.code))]`):

  ```ts
  it.each(NOTE_ROWS)('notes, and does not block, a script that breaks the rule: %s', async (_rule, change, code) => {
    expect(ALL_FAILURE_CODES).toContain(code);
    const verdict = await verdictOn(change);
    expect(verdict.notes).toContain(code);
    expect(verdict.codes).not.toContain(code);
    expect(verdict.route).toBe('publish');
  });
  ```
- `desk/test/stages/verify.test.ts`: the tests that use `G2_TAKEAWAYS_COUNT` (about lines 329 to 345), `G2_OPENING_LENGTH` (about 651), `G2_BODY_LENGTH` and `G7_ANALYSIS_SHARE` (about 686 to 693) as the example of "a failure that no sentence can mend" take a blocker of the same kind instead: `G2_SECTIONS_MIN` for the first group, and for the table of unattached problems the rows `G2_SECTIONS_MIN` (`draft.sections = draft.sections.slice(0, 1)`) and `G1_CATEGORY_COUNT` (`draft.categories = []`) in place of the three rows.
- `site/test/fixtures.test.ts` (about lines 72 and 82): the tests make a fixture fail by shortening its opening, which no longer fails. Make them fail with `g.draft.takeaways[0]!.claimIds = []` (`G3_NO_CLAIM`) and expect `route revise: G3_NO_CLAIM` in the message.
- `evals/test/scoreboard.test.ts`: if a line names a note code as "caught by a failure", read the file: the harness now counts a note as caught (Task 1), so only a literal `failures` expectation changes.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add gate desk site evals
git commit -m "feat(gate): the length and the shape of a piece are notes, because a press release leaves too few claims to fill 600 words and every real trial failed on it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Names, amounts without a figure and filler become notes

**Files:**
- Modify: `gate/src/severity.ts`, `gate/src/checks/g7-analysis.ts`, `desk/src/stages/verify.ts`, `site/src/lib/reasons.ts`, `evals/src/cases/sourcing-analysis.ts`, `gate/test/severity.test.ts`, `gate/test/golden-gate.test.ts`, `gate/test/g7-analysis.test.ts`, `desk/test/stages/compose.test.ts`, `desk/test/stages/verify.test.ts`, `desk/test/adversarial.test.ts`

`G4_NAME_UNSUPPORTED`, `G4_HEADING_NAME`, `G4_NUMBER_WORD_UNCHECKABLE` and `G9_BANNED_PHRASE` become notes. A capitalised word that no claim lists is something the model check (G10) judges better than a word list; the numbers, dates and values stay blockers. G7 reports names and figures under one code, so the name part is split off as `G7_ANALYSIS_NEW_NAME` (a note); `G7_ANALYSIS_NEW_VALUE` stays a blocker for numbers, dates and amounts.

- [ ] **Step 1: Write the failing tests**

In `gate/test/severity.test.ts` replace the pinned list of the previous task:

```ts
  it('holds the length and the shape of a piece, its capitalised names and its filler as notes', () => {
    expect([...NOTE_CODES]).toEqual([
      'G2_OPENING_LENGTH',
      'G2_TAKEAWAYS_COUNT',
      'G2_BODY_LENGTH',
      'G2_HEADING_QUESTION',
      'G2_HEADING_TOO_LONG',
      'G4_NAME_UNSUPPORTED',
      'G4_HEADING_NAME',
      'G4_NUMBER_WORD_UNCHECKABLE',
      'G7_ANALYSIS_SHARE',
      'G7_ANALYSIS_NEW_NAME',
      'G9_BANNED_PHRASE',
    ]);
  });
```

Append to `gate/test/golden-gate.test.ts`:

```ts
describe('runGate: names and filler are notes, figures are not', () => {
  it('publishes a piece with a name that its claim does not list, and lists the name as a note', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.takeaways[0] = { kind: 'fact', text: 'Tarnmoor is the second Harlow plant to receive FX-1 arms.', claimIds: ['c-1'] };
      }),
      api.defaultContext(),
    );
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toContain('G4_NAME_UNSUPPORTED');
    expect(result.route).toBe('publish');
  });

  it('publishes a piece that uses a banned filler phrase, and lists the phrase as a note', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext({ config: { bannedPhrases: ['begun shipping'] } }));
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toContain('G9_BANNED_PHRASE');
    expect(result.route).toBe('publish');
  });

  it('lists a name that analysis brings in as a note of its own, and still sends back a number that analysis brings in', () => {
    const name = api.runGate(
      mutate(cloneGolden(), (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('The measured rate sits below')).text =
          'The measured rate sits below the datasheet maximum, a gap that Harlow Logistics also reported.';
      }),
      api.defaultContext(),
    );
    expect(name.failures).toEqual([]);
    expect(name.warnings.map((item) => item.code)).toEqual(['G7_ANALYSIS_NEW_NAME']);

    const number = api.runGate(
      mutate(cloneGolden(), (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('The measured rate sits below')).text =
          'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      }),
      api.defaultContext(),
    );
    expect(number.failures.map((item) => item.code)).toContain('G7_ANALYSIS_NEW_VALUE');
    expect(number.route).toBe('revise');
  });
});
```

In `gate/test/g7-analysis.test.ts` the three tests that assert a message `introduces the name "harlow", which no fact sentence contains` (about lines 306, 321 and 341) now expect the code `G7_ANALYSIS_NEW_NAME` instead of `G7_ANALYSIS_NEW_VALUE`; the messages stay exactly as they are.

- [ ] **Step 2: Run to see them fail**

Run: `npm test --workspace @robywire/gate -- test/severity.test.ts test/golden-gate.test.ts test/g7-analysis.test.ts`
Expected: FAIL: the pinned list differs, the route for the invented name is `revise`, and `G7_ANALYSIS_NEW_NAME` is not a code.

- [ ] **Step 3: Implement**

`gate/src/severity.ts`: the list becomes the one pinned above, in that order.

`gate/src/checks/g7-analysis.ts`: add the code to the list and report names under it. Replace the list:

```ts
export const G7_CODES = ['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_SHARE', 'G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_NAME'] as const;
```

and replace the loop over `tokens.names` with:

```ts
    for (const name of tokens.names) {
      if (!names.has(name) && !ctx.nameAllowList.has(name)) {
        failures.push({
          check: 'G7',
          code: 'G7_ANALYSIS_NEW_NAME',
          message: `the analysis sentence at ${where} introduces the name "${name}", which no fact sentence contains`,
          where,
        });
      }
    }
```

In the doc comment of `checkG7`, after the sentence that ends "...is always new.", add: `A new name is a note (G7_ANALYSIS_NEW_NAME), not a blocker: the model check judges meaning, and a word list cannot tell a name from an ordinary capitalised word.`

`desk/src/stages/verify.ts`: a banned phrase is a note now, so it is never sent back. In `problemsOf` delete the line that handles it in `idsOf`:

```ts
    if (failure.code === 'G9_BANNED_PHRASE') return [...sentenceIds((item) => fold(item.sentence.text).includes(fold(where))), ...headingIds((heading) => fold(heading).includes(fold(where)))];
```

and replace the `reason` constant in the loop with `const reason = `${failure.code}: ${failure.message}`;`. If the typecheck now reports `fold` or the `normaliseQuotes` import as unused, delete them. Update the doc comment of `problemsOf` by removing the clause "and, for a banned phrase, at every sentence and heading that has the phrase".

`site/src/lib/reasons.ts`: add, after `G7_ANALYSIS_NEW_VALUE`:

```ts
  G7_ANALYSIS_NEW_NAME: 'Analysis named something no fact names',
```

`evals/src/cases/sourcing-analysis.ts`: the case `analysis-new-name` gets `code: 'G7_ANALYSIS_NEW_NAME'`. (The case `analysis-invented-initial-word` is deleted in Task 4.)

- [ ] **Step 4: Fix what fails (rule R1)**

Run: `npm test`. Apply R1 to:

- `desk/test/stages/compose.test.ts`: the rows `G4_NAME_UNSUPPORTED`, `G4_HEADING_NAME` (two rows), `G4_NUMBER_WORD_UNCHECKABLE` and `G9_BANNED_PHRASE` move to `NOTE_ROWS`. Their expected route is `publish`.
- `desk/test/stages/verify.test.ts`: the test about `G9_BANNED_PHRASE` problems (about lines 672 to 674) is deleted: a banned phrase is no longer sent back. The test that composes a draft with a banned phrase and expects it to go back is deleted with it.
- `desk/test/adversarial.test.ts`: a row that expects a name defect to end in `revise` or `hold` *because of the word list* now ends differently: the draft clears the word list and reaches the model check. Move each such row to the group of the matrix whose verifier is scripted to say `not_entailed` for the sentence, and expect the hold reason `G10_NOT_ENTAILED`. A row that also has a number defect keeps its number code and drops the name code from its list of reasons. The rule of the matrix is unchanged: nothing ends in `publish` unless the script is clean.
- `site/test/desk-pages.test.ts` and `desk/test/run/tune.test.ts` use `G9_BANNED_PHRASE` as sample data only; they do not change.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0; the seeded count is still `61 of 61`.

- [ ] **Step 5: Commit**

```bash
git add gate desk site evals
git commit -m "feat(gate): capitalised names, amounts without a figure and filler phrases are notes, and a name that analysis brings in is a code of its own, because the model check judges meaning and a word list cannot tell a name from a capital" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The first-word rules are deleted

**Files:**
- Modify: `gate/src/checks/g2-structure.ts`, `gate/src/checks/g4-values.ts`, `gate/src/checks/g7-analysis.ts`, `site/src/lib/reasons.ts`, `site/src/lib/method.ts`, `evals/src/cases/claims.ts`, `evals/src/cases/frontmatter-structure.ts`, `evals/src/cases/sourcing-analysis.ts`
- Modify (tests): `gate/test/g2-structure.test.ts`, `gate/test/g4-values.test.ts`, `gate/test/g7-analysis.test.ts`, `evals/test/seeded.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/stages/compose.test.ts`, `desk/test/stages/verify.test.ts`, `site/test/known-limits.test.ts`, `site/test/method.test.ts`

Three rules read the first word of a sentence: `G2_SENTENCE_START` (it exists only so that the other two can read a capital letter), `G4_INITIAL_WORD_UNSUPPORTED` and the opening-word clause of G7. They make a model rewrite a good sentence because it opens with an ordinary capitalised noun. The model check judges a name at the start of a sentence like any other. The rule for the first word of a **heading** (`G4_HEADING_NAME`, a note) stays.

- [ ] **Step 1: Write the failing tests**

Append to `gate/test/golden-gate.test.ts`:

```ts
describe('runGate: the first word of a sentence', () => {
  it('does not read a capitalised noun at the start of a sentence as a name', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.takeaways[0] = { kind: 'fact', text: 'Output at Tarnmoor rose to 40 arms in the second plant.', claimIds: ['c-1'] };
      }),
      api.defaultContext(),
    );
    expect(result.warnings.map((item) => item.code)).not.toContain('G4_INITIAL_WORD_UNSUPPORTED');
    expect(result.failures.map((item) => item.code)).not.toContain('G4_INITIAL_WORD_UNSUPPORTED');
  });

  it('has no rule about the first letter of a sentence', () => {
    expect(api.ALL_FAILURE_CODES).not.toContain('G2_SENTENCE_START');
    expect(api.ALL_FAILURE_CODES).not.toContain('G4_INITIAL_WORD_UNSUPPORTED');
  });
});
```

(The first test is about the absence of a code; the second fails now because both codes exist. The number `40` may itself be reported as unsupported: the test checks only the two removed codes.)

- [ ] **Step 2: Run to see it fail**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: FAIL on "has no rule about the first letter of a sentence" (`expected [...] not to contain 'G2_SENTENCE_START'`).

- [ ] **Step 3: Delete the rules**

`gate/src/checks/g2-structure.ts`:
- delete `'G2_SENTENCE_START',` from `G2_CODES`;
- delete the constant `MAX_FIRST_WORD` and its comment;
- delete the final `for (const located of sentences) { ... }` block (the one that calls `startsWithCapitalOrDigit`) and keep `return { failures, holdReasons: [] };`;
- delete the paragraph of the doc comment that begins "Every sentence of the piece (the title, the description" and ends "would not be read by it.";
- the imports become `import { countWords, normaliseQuotes } from '../text';` and `import { allSentences, citedClaims } from '../sentences';`.

`gate/src/checks/g4-values.ts`:
- delete `'G4_INITIAL_WORD_UNSUPPORTED',` from `G4_CODES`;
- delete the block `if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, claimWords(cited), ctx.nameAllowList)) { fail('G4_INITIAL_WORD_UNSUPPORTED', ...); }` in the loop over sentences (the use of `openingWordAccepted` and `claimWords` in the heading part stays);
- in the doc comment replace the paragraph "The first word of a sentence is not a name token ... would only have its second word checked." with: `The first word of a sentence is not read as a name, because every sentence starts with a capital letter; the model check judges a name that opens a sentence like any other.`

`gate/src/checks/g7-analysis.ts`:
- delete the `if (tokens.initialWord !== undefined && !openingWordAccepted(...)) { fail(...) }` clause, the line `const cited = ...`, the line `const byId = ...`, the import `import { claimWords, openingWordAccepted } from '../grounding';`, and `claims` from the parameter (`({ draft }, ctx)`);
- delete from the doc comment the sentences "The first word of an analysis sentence has its own rule: ... and the label of a claim, ground nothing: they are what a model wrote."

`site/src/lib/reasons.ts`: delete the lines `G2_SENTENCE_START: ...` and `G4_INITIAL_WORD_UNSUPPORTED: ...`.

`evals`: delete the two cases with `code: 'G4_INITIAL_WORD_UNSUPPORTED'` in `evals/src/cases/claims.ts`, the case with `code: 'G2_SENTENCE_START'` (`lowercase-sentence-start`) in `evals/src/cases/frontmatter-structure.ts`, and the case `analysis-invented-initial-word` in `evals/src/cases/sourcing-analysis.ts`. In `evals/test/seeded.test.ts` delete the row for `lowercase-sentence-start` in the expected list (about line 195).

`site/src/lib/method.ts` (the minimal change that keeps the page true; Task 14 rewrites the rest):
- in the G2 text delete `every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and `;
- in the G4 text delete the clause `a sentence may open with a capitalised word only if it is an ordinary function word or a word of the quoted passage, the names or the outlet of a claim the sentence cites (the text and the label of a claim are written by a model and count for nothing); `;
- in the G7 text delete `, and must open with an ordinary function word or a word of the quoted passage, the names or the outlet of a claim it cites` and the `and` before it so the sentence still reads;
- in `KNOWN_LIMITS` delete the `strict` entry that begins "A sentence cannot open with a name that starts with a lowercase letter", and change the `strict` entry that begins "The only evidence for a capitalised word that opens a sentence or a heading" to begin "The only evidence for a capitalised word that opens a section heading" (the rest of the sentence is unchanged).

- [ ] **Step 4: Fix what fails**

Run: `npm test`. Expected failures, and the change for each:

- `gate/test/g2-structure.test.ts`: delete `describe('G2_SENTENCE_START', ...)` (about lines 484 to 620) and the mention of the code in the comment of the helper at line 13; every other test in the file that passes a draft with a lowercase start expecting the code is deleted with it.
- `gate/test/g4-values.test.ts`: delete the tests that expect `G4_INITIAL_WORD_UNSUPPORTED` (about lines 430 to 580 and 994) and the helper that filters for it. A test that mixes the code with another (`['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']`) keeps only the other code.
- `gate/test/g7-analysis.test.ts`: delete the tests about the opening word of an analysis sentence (`grep -n "opening word\|initial" gate/test/g7-analysis.test.ts` finds them).
- `desk/test/adversarial.test.ts`: remove `'G4_INITIAL_WORD_UNSUPPORTED'` and `'G2_SENTENCE_START'` from every list of reasons (about lines 186 to 194, 245, 299, 311, 326, 349, 643 to 647); a row whose only defect was one of them is deleted, because its defect is judged by the model check now (the rows moved in Task 3 cover that).
- `desk/test/stages/compose.test.ts`: delete the rows for `G4_INITIAL_WORD_UNSUPPORTED` and `G2_SENTENCE_START`.
- `desk/test/stages/verify.test.ts` (about line 645): the test that sends back a sentence for `G2_SENTENCE_START` is deleted.
- `site/test/known-limits.test.ts`: change the counts in the first test (`strict` 3 to 2, the whole list 15 to 14), delete the test "is true of the strict limit about a sentence that opens with a lowercase name", and in the test about the evidence for an opening word change `'The only evidence for a capitalised word that opens a sentence or a heading'` to `'The only evidence for a capitalised word that opens a section heading'`. Remove `checkG2`, `startsWithCapitalOrDigit` from the imports if they are unused.
- `site/test/method.test.ts`: delete the two tests "names the rules for the first word of a sentence and for headings" (keep its second expectation, `a section heading has no number, date or quotation`, in a test of its own), "says in G2 that every sentence starts with a capital letter or a digit", and the expectation in "says in G7 ..." about opening with an ordinary function word.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0; the seeded count is now `57 of 57` (four cases deleted: two G4, one G2, one G7).

- [ ] **Step 5: Commit**

```bash
git add gate desk site evals
git commit -m "refactor(gate): the first word of a sentence is no longer read as a name by three rules, because they made a model rewrite good sentences for opening with a capitalised noun and the model check judges a name that opens a sentence like any other" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Another outlet no longer forces a hold; analysis may stand in the opening

**Files:**
- Modify: `gate/src/checks/g6-sourcing.ts`, `gate/src/checks/g7-analysis.ts`, `gate/src/fixtures/tier2.ts` (a comment), `site/scripts/generate-fixtures.ts`, `gate/test/g6-sourcing.test.ts`, `gate/test/golden-gate.test.ts`, `gate/test/tier2-variant.test.ts`, `gate/test/g7-analysis.test.ts`, `desk/test/stages/verify.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/stages/compose.test.ts`, `site/test/fixtures.test.ts`
- Regenerate: `site/src/content-fixtures/` (`npm run fixtures:generate --workspace @robywire/site`)

A claim from another outlet is still written as an attribution that names the outlet (a blocker, G6) and still never stands in analysis. It no longer sends the piece to the owner. `TIER2_ATTRIBUTION` stays in `HOLD_REASONS` as a **retired** reason, so a hold recorded before today still has its label. Analysis was barred from the opening and the takeaways to keep them plain fact; a blog needs a voice there, and the Desk labels every analysis sentence on the page, so only the title and the description (which are fact by contract) stay closed.

- [ ] **Step 1: Write the failing tests**

In `gate/test/golden-gate.test.ts` replace the whole `describe('runGate when the piece rests on a tier-2 claim', ...)` block with:

```ts
describe('runGate when the piece rests on a tier-2 claim', () => {
  it('publishes a properly attributed piece: another outlet no longer forces a hold', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        makeTier2(g);
        attribute(g);
      }),
      api.defaultContext(),
    );
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
  });

  it('sends an unattributed piece back for revision: that is still a blocker', () => {
    const result = api.runGate(mutate(cloneGolden(), makeTier2), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks.G6).toBe('fail');
  });

  it('keeps the retired hold reason in the list, so an old hold still has its label', () => {
    expect(api.HOLD_REASONS).toEqual(['TIER2_ATTRIBUTION']);
  });
});

describe('runGate: where analysis may stand', () => {
  it('lets analysis stand in the takeaways', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        const takeaway = g.draft.takeaways[0]!;
        g.draft.takeaways[0] = { kind: 'analysis', text: takeaway.text, claimIds: takeaway.claimIds };
      }),
      api.defaultContext(),
    );
    expect(result.failures.map((item) => item.code)).not.toContain('G7_ANALYSIS_PLACEMENT');
  });

  it('still keeps analysis out of the title and the description', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.title = { kind: 'analysis', text: g.draft.title.text, claimIds: g.draft.title.claimIds };
      }),
      api.defaultContext(),
    );
    expect(result.failures.map((item) => item.code)).toContain('G7_ANALYSIS_PLACEMENT');
  });
});
```

(`makeTier2` and `attribute` are the helpers the file already has.)

- [ ] **Step 2: Run to see them fail**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: FAIL: the attributed piece has the route `hold`, and analysis in a takeaway is a `G7_ANALYSIS_PLACEMENT` failure.

- [ ] **Step 3: Implement**

`gate/src/checks/g6-sourcing.ts`:
- replace the declaration of `HOLD_REASONS` and the constant after it with:

  ```ts
  /**
   * Every reason a check can ask for a hold, as opposed to a failure. A piece with a hold reason and no failure goes to the owner instead of being
   * revised. The site gives each reason a label, and a test there fails if one has none.
   *
   * TIER2_ATTRIBUTION is retired: no check asks for it any more, because a claim of another outlet that is written as an attribution publishes (the
   * piece says whose reporting it is). It stays in the list so that a hold recorded before 2026-10-20 still has its label on the holds page.
   */
  export const HOLD_REASONS = ['TIER2_ATTRIBUTION'] as const;
  ```
- delete `let tier2Facts = 0;` and `tier2Facts++;`;
- the last line becomes `return { failures, holdReasons: [] };`;
- in the doc comment replace the paragraph "A piece whose tier-2 citations are all properly attributed passes this check but asks for a hold, once: the owner decides. The hold reason is withheld while G6 still has a failure, because the piece goes back for revision first." with: `A piece whose tier-2 citations are all properly attributed passes this check; the article labels each such sentence, and the piece publishes.`

`gate/src/checks/g7-analysis.ts`: `const NO_ANALYSIS: readonly LedgerSection[] = ['title', 'description'];`, its comment becomes `/** Parts of the piece where analysis is not allowed: the title and the description, which are fact by contract. */`, the message of `G7_ANALYSIS_PLACEMENT` becomes ``the analysis sentence at ${where} is not allowed there: the title and the description state facts only``, and the first bullet of the doc comment becomes `It may not appear in the title or the description (G7_ANALYSIS_PLACEMENT).`

`gate/src/fixtures/tier2.ts`: in the comment at line 26 replace "the gate asks for a hold (TIER2_ATTRIBUTION) and the" by "the gate publishes it, and the fixture generator stands it for a held draft that the owner released, with a hold of the model check, and the".

`site/scripts/generate-fixtures.ts`: the fixture that stands for a released hold is still `route: 'hold'`, but the gate now clears it, so the hold is built the way the hold flow builds it (`renderHeldPiece` in `desk/src/stages/hold-pr.ts`). Make these changes:
- the comment above `VARIANTS`: replace "so the gate holds it, and it is dated the day of the 'TIER2_ATTRIBUTION' hold in the desk state: the owner released that draft." with "so the gate clears it, and it is dated the day of the 'G10_AMBIGUOUS' hold in the desk state: the model check could not tell, and the owner released that draft.";
- the comment of `FixturePiece.route`: `hold` is "a piece that the owner released after a hold: the gate clears it and the ledger says it was held";
- in `deskState` change `reasons: ['TIER2_ATTRIBUTION']` to `reasons: ['G10_AMBIGUOUS']`;
- add above `fixtureFiles`: `/** The reason that the hold of the fixture released by the owner goes by: the model check could not tell if a sentence was supported. */ const OWNER_HOLD_REASON = 'G10_AMBIGUOUS';`
- in `fixtureFiles` replace the check and the `meta` with:

  ```ts
      const result = runGate(piece.input, defaultContext());
      if (result.route !== 'publish') {
        const codes = [...result.failures.map((failure) => failure.code), ...result.holdReasons].join(', ');
        throw new Error(`generate-fixtures: the fixture ${piece.slug} is not cleared by the gate (route ${result.route}: ${codes === '' ? 'none' : codes})`);
      }
      // A draft that the owner released was held: its ledger says route hold and gives the reasons of the hold, as the hold flow writes it.
      const gate = piece.route === 'hold' ? { ...result, route: 'hold' as const, holdReasons: [OWNER_HOLD_REASON] } : result;
      const updatedAt = latestCorrectionDay(state.corrections, piece.slug);
      const release = piece.route === 'publish' ? 'auto' : 'owner';
      const meta = { runId: piece.runId, gate, release, ...(updatedAt === undefined ? {} : { updatedAt }) } as const;
  ```
  and update the doc comment of `fixtureFiles`: "A piece that the gate does not clear stops the generator".

- [ ] **Step 4: Fix what fails (rule R1, and the rule below)**

Run: `npm test`. Expected failures, and the change for each:

- `gate/test/g6-sourcing.test.ts` (about lines 186, 210, 236, 247): the four expectations of `holdReasons: ['TIER2_ATTRIBUTION']` become `holdReasons: []`, and their test names say "publishes" instead of "asks for a hold". The test of `HOLD_REASONS` (about line 269) stays.
- `gate/test/tier2-variant.test.ts` (about lines 24, 25 and 90): `holdReasons` is `[]` and the route is `publish`.
- `gate/test/g7-analysis.test.ts`: the tests that expect `G7_ANALYSIS_PLACEMENT` for the opening and for the takeaways are changed to expect no such failure; the tests for the title and the description stay.
- `desk/test/stages/verify.test.ts` (about lines 360 to 375): "a draft that cites another outlet is held even though it is clean" becomes "is published when it is clean": the outcome is `publish`, `gate.holdReasons` is `[]`.
- `desk/test/adversarial.test.ts` (about line 226): the row that expects `TIER2_ATTRIBUTION` leaves the matrix of drafts that must never publish and becomes a test of its own: a properly attributed piece with a clean script publishes. A row about the *unattributed* piece stays.
- `desk/test/stages/compose.test.ts`: the row "analysis is never in the opening" is deleted (the title row stays).
- `site/test/fixtures.test.ts`: the strings of the messages become `is not cleared by the gate (route revise: G3_NO_CLAIM)`; the expectation that fixture 5's ledger has `holdReasons: ['TIER2_ATTRIBUTION']` becomes `['G10_AMBIGUOUS']`. `site/test/receipts.test.ts` and `site/test/desk-pages.test.ts` follow the same rule where they read fixture 5.

Regenerate and check the fixtures:

Run: `npm run fixtures:generate --workspace @robywire/site && git diff --stat site/src/content-fixtures`
Expected: only the ledger of fixture 5 and `desk-state.json` change (the reason code of the hold).

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add gate desk site evals
git commit -m "feat(gate): a claim from another outlet that is written as an attribution publishes instead of being held, TIER2_ATTRIBUTION is a retired reason, and analysis may stand in the opening and the takeaways, because only fact stays closed to the title and the description" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The ledger records the notes

**Files:**
- Create: `gate/test/ledger-notes.test.ts`
- Modify: `gate/src/schemas.ts`, `gate/src/render/render.ts`, `desk/src/stages/hold-pr.ts`
- Regenerate: `site/src/content-fixtures/` (every ledger gains `"warnings": []`)

- [ ] **Step 1: Write the failing test**

`gate/test/ledger-notes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LedgerEntry, defaultContext, renderDraft, runGate } from '../src';
import { cloneGolden } from '../src/fixtures';

describe('the ledger records the notes of the gate', () => {
  it('lists the code and the place of each note, and nothing else', () => {
    const piece = cloneGolden();
    const gate = runGate(piece, defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
    expect(gate.route).toBe('publish');
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate });
    expect(ledger.gate.warnings).toEqual([{ code: 'G2_BODY_LENGTH', where: 'body' }]);
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });

  it('lists no notes for a piece that has none', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(ledger.gate.warnings).toEqual([]);
  });

  it('reads a ledger written before notes existed as one with no notes', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    const { warnings: _warnings, ...gateWithout } = ledger.gate;
    expect(LedgerEntry.parse({ ...ledger, gate: gateWithout }).gate.warnings).toEqual([]);
  });

  it('refuses a note that has no code', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(LedgerEntry.safeParse({ ...ledger, gate: { ...ledger.gate, warnings: [{ code: '' }] } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test --workspace @robywire/gate -- test/ledger-notes.test.ts`
Expected: FAIL: `expected undefined to equal [ { code: 'G2_BODY_LENGTH', where: 'body' } ]`.

- [ ] **Step 3: Implement**

`gate/src/schemas.ts`, in `LedgerEntry`, the `gate` object gains `warnings` after `holdReasons`:

```ts
    holdReasons: z.array(z.string()),
    // The notes of the gate: findings that did not block the piece, by code and place. The receipts page lists them in words.
    // A ledger written before notes existed has none.
    warnings: z.array(z.object({ code: z.string().min(1), where: z.string().optional() })).default([]),
```

`gate/src/render/render.ts`, the `gate` line of the ledger becomes:

```ts
    gate: {
      route: meta.gate.route,
      checks: { ...meta.gate.checks },
      holdReasons: [...meta.gate.holdReasons],
      warnings: meta.gate.warnings.map(({ code, where }) => (where === undefined ? { code } : { code, where })),
    },
```

`desk/src/stages/hold-pr.ts`, in `renderHeldPiece` the `gate` argument becomes `gate: { ...held.gate, warnings: held.gate.warnings ?? [], route: 'hold', holdReasons: [...held.reasons] },` (if Task 1 already made this edit, nothing changes).

- [ ] **Step 4: Run, regenerate, run everything**

Run: `npm test --workspace @robywire/gate -- test/ledger-notes.test.ts`
Expected: PASS.

Run: `npm run fixtures:generate --workspace @robywire/site && git diff --stat site/src/content-fixtures`
Expected: the five ledgers change by one line each (`"warnings": []`).

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add gate desk site
git commit -m "feat(gate): the ledger of a piece lists the notes of the gate by code and place, so what a soft rule let through is public" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The receipts page lists the notes

**Files:**
- Create: `site/test/receipts-notes.test.ts`
- Modify: `site/src/lib/receipts.ts`, `site/src/pages/news/[slug]/receipts/index.astro`

- [ ] **Step 1: Write the failing test**

`site/test/receipts-notes.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { LedgerEntry } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { receiptsView } from '../src/lib/receipts';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const ledgerOf = (): LedgerEntry =>
  LedgerEntry.parse(JSON.parse(readFileSync(new URL(`../src/content-fixtures/ledger/${SLUG}.json`, import.meta.url), 'utf8')));

describe('receiptsView: the notes', () => {
  it('has no notes for a piece that has none', () => {
    expect(receiptsView(ledgerOf()).gate.notes).toEqual([]);
  });

  it('turns each note into its code, its words and its place', () => {
    const ledger = ledgerOf();
    ledger.gate.warnings = [{ code: 'G2_BODY_LENGTH', where: 'body' }];
    expect(receiptsView(ledger).gate.notes).toEqual([{ code: 'G2_BODY_LENGTH', label: 'The piece was too short or too long', where: 'body' }]);
  });

  it('leaves out the place of a note that has none, and shows a code it has no words for as it is', () => {
    const ledger = ledgerOf();
    ledger.gate.warnings = [{ code: 'G9_SOMETHING_NEW' }];
    expect(receiptsView(ledger).gate.notes).toEqual([{ code: 'G9_SOMETHING_NEW', label: 'G9_SOMETHING_NEW' }]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test --workspace @robywire/site -- test/receipts-notes.test.ts`
Expected: FAIL: `Cannot read properties of undefined` (no `notes` in the gate summary).

- [ ] **Step 3: Implement**

`site/src/lib/receipts.ts`: add the type, the field and its value.

```ts
/** A finding of the gate that did not block the piece: its code, the same in plain English, and where it was found. */
export interface GateNote {
  code: string;
  label: string;
  where?: string;
}
```

In `GateSummary` add `notes: GateNote[];` after `holdReasons`, and in `receiptsView` add to the `gate` object:

```ts
      notes: ledger.gate.warnings.map(({ code, where }) => (where === undefined ? { code, label: reasonLabel(code) } : { code, label: reasonLabel(code), where })),
```

`site/src/pages/news/[slug]/receipts/index.astro`: after the paragraph that starts `Hold reasons:` add

```astro
      {
        view.gate.notes.length > 0 && (
          <div class="gate-notes">
            <p>Notes. The gate found these and they did not stop the piece:</p>
            <ul>
              {view.gate.notes.map((note) => (
                <li>
                  {note.label} <span class="mono">({note.code})</span>
                </li>
              ))}
            </ul>
          </div>
        )
      }
```

- [ ] **Step 4: Run, then everything**

Run: `npm test --workspace @robywire/site -- test/receipts-notes.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check && npm run build:fixtures && npm run audit`
Expected: all exit 0 (the fixture pieces have no notes, so the built pages are unchanged; the audit confirms it).

- [ ] **Step 5: Commit**

```bash
git add site
git commit -m "feat(site): the receipts page lists the notes of the gate in plain words, with their codes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The seeded evals prove that notes never block

**Files:**
- Create: `evals/test/notes.test.ts`

- [ ] **Step 1: Write the test**

`evals/test/notes.test.ts`:

```ts
import { ALL_CHECKS, NOTE_CODES, runGateWith, severityOf } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { SEEDED_CASES, seededContext } from '../src/seeded';

// A rule that has become a note must be proven to be one: the broken piece is reported under the code, as a note, and the code never sends it back.
// A rule that is a blocker must be proven to be one: the broken piece is sent back for the code.

const noteCases = SEEDED_CASES.filter((item) => severityOf(item.code) === 'note');
const blockerCases = SEEDED_CASES.filter((item) => severityOf(item.code) === 'blocker');
const run = (apply: (base: ReturnType<typeof cloneGolden>) => ReturnType<typeof cloneGolden>) => runGateWith(ALL_CHECKS, apply(cloneGolden()), seededContext());

describe('the seeded defects whose code is a note', () => {
  it('has a seeded defect for every note', () => {
    expect(new Set(noteCases.map((item) => item.code))).toEqual(new Set(NOTE_CODES));
  });

  it.each(noteCases.map((item) => [item.id, item] as const))('%s is reported as a note and never as a blocker', (_id, item) => {
    const result = run(item.apply);
    expect(result.warnings.some((finding) => finding.check === item.check && finding.code === item.code)).toBe(true);
    expect(result.failures.some((finding) => finding.code === item.code)).toBe(false);
  });
});

describe('the seeded defects whose code is a blocker', () => {
  it.each(blockerCases.map((item) => [item.id, item] as const))('%s sends the draft back', (_id, item) => {
    const result = run(item.apply);
    expect(result.failures.some((finding) => finding.check === item.check && finding.code === item.code)).toBe(true);
    expect(result.route).toBe('revise');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test --workspace @robywire/evals -- test/notes.test.ts`
Expected: PASS (the mechanism exists since Task 1 and the notes since Tasks 2 and 3). If a note case fails because its break also trips a *blocker* with another code, that is fine for the first group (it asserts only about its own code); if a blocker case does not give the route `revise`, read the case: it is a bug of the case, not of the gate.

To prove that the test can fail, temporarily remove `'G2_BODY_LENGTH'` from `NOTE_CODES` and run it again.
Expected: FAIL on "has a seeded defect for every note" and on the `G2_BODY_LENGTH` case; restore the list.

- [ ] **Step 3: Run everything and commit**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0.

```bash
git add evals
git commit -m "test(evals): every note is proven to be reported as a note and never as a blocker, and every blocker is proven to send the draft back" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The desk logs notes and sends none back

**Files:**
- Modify: `desk/src/stages/compose.ts`, `desk/src/stages/verify.ts`, `desk/test/stages/compose.test.ts`, `desk/test/stages/verify.test.ts`

Nothing in the revision loop needs a change to ignore notes: `runVerify` asks the model check when `gate.failures` is empty, and `problemsOf` reads `gate.failures` only. This task proves it, and makes a note visible in the log of a run.

- [ ] **Step 1: Write the failing tests**

In `desk/test/stages/compose.test.ts` change the expected log line of "logs what the gate said" to `'compose: the gate says publish (0 failures, 0 notes, 0 hold reasons)'`.

Append to `desk/test/stages/verify.test.ts` (the helpers `start`, `CLEARS`, `callsOf` and the type `Reply` are in the file):

```ts
describe('runVerify: a draft with notes and no blocker', () => {
  const askedQuestion = (reply: Reply) => {
    (reply.sections[0] as Reply['sections'][number]).heading = 'What shipped?';
  };

  it('is shown to the verifier and published, and the note stays in the record', async () => {
    const { ctx, fake, claims, composed } = await start(askedQuestion);
    expect(composed.gate.failures).toEqual([]);
    expect(composed.gate.warnings.map((note) => note.code)).toEqual(['G2_HEADING_QUESTION']);
    fake.script('verify', CLEARS());
    const result = await runVerify(ctx, claims, composed);
    expect(result.outcome).toBe('publish');
    expect(result.rounds).toBe(0);
    expect(callsOf(fake, 'verify')).toHaveLength(1);
    expect(callsOf(fake, 'compose')).toHaveLength(1);
    expect(result.gate.warnings.map((note) => note.code)).toEqual(['G2_HEADING_QUESTION']);
  });

  it('has nothing to send back for a note', async () => {
    const { composed } = await start(askedQuestion);
    expect(problemsOf(composed.draft, composed.gate, [])).toEqual({ problems: [], unattached: [] });
  });

  it('says in the log how many notes the gate found', async () => {
    const { ctx, fake, claims, composed, logs } = await start(askedQuestion);
    fake.script('verify', CLEARS());
    await runVerify(ctx, claims, composed);
    expect(logs).toContain('verify: round 0: the gate says publish, 1 note, the model check passed');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test --workspace @robywire/desk -- test/stages/compose.test.ts test/stages/verify.test.ts`
Expected: FAIL: the compose log has no `notes`, and the verify log line is `verify: round 0: the gate says publish, the model check passed`.

- [ ] **Step 3: Implement**

`desk/src/stages/compose.ts`, the log line:

```ts
  ctx.log(`compose: the gate says ${gate.route} (${gate.failures.length} failures, ${gate.warnings.length} notes, ${gate.holdReasons.length} hold reasons)`);
```

`desk/src/stages/verify.ts`, in `runVerify` replace the `ctx.log` call of the loop with:

```ts
    const noteWords = gate.warnings.length === 0 ? '' : `, ${gate.warnings.length} ${gate.warnings.length === 1 ? 'note' : 'notes'}`;
    ctx.log(
      `verify: round ${round}: the gate says ${gate.route}${noteWords}, the model check ${checked === undefined ? 'was not asked' : checked.verifier.passed ? 'passed' : 'failed'}` +
        (send ? `; sent back: ${ids.join(' ')}` : unattached.length > 0 ? `; problems that no sentence can mend: ${unattached.length}` : ''),
    );
```

Update the doc comment of `runVerify`: after "the gate's verdict on the draft" add "(its notes never block, never go back to the composer and never keep the model check from running)", and delete the sentence "A draft that cites another outlet is routed to `hold` by the gate (TIER2_ATTRIBUTION), so it is held even though it is clean: it is never published by itself." (Task 5 removed the behaviour) and the same clause in the header comment of the file ("unless it cites another outlet, in which case it is `hold` however clean it is,").

- [ ] **Step 4: Run, then everything**

Run: `npm test --workspace @robywire/desk -- test/stages/compose.test.ts test/stages/verify.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add desk
git commit -m "feat(desk): a draft with notes and no blocker goes to the model check and is sent back for nothing, and the log of a run says how many notes the gate found" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
