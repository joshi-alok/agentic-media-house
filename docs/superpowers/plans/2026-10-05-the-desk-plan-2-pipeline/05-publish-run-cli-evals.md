## Plan 2 (part 5) — Publish or hold, the run, the CLI, the evals

**Goal:** finish the Desk. After this part the pipeline runs end to end, from the stories of the day to a piece on the site, a hold, no story or a failure, as one command (`desk run`), and everything that decides what reaches the site is checked by code and proven by tests that run with no network and no key. A piece that the gate and the verifier cleared is written into the site exactly as the renderer gives it and committed; a draft that cannot be published by itself is held with its reasons and nothing of it reaches the pages; a run is locked, is made once for each day, ends in one of four outcomes with a record of how and why, and makes one commit; a run can be replayed from what it kept; a made-up world and a scripted story let the whole thing be shown and tested; an adversarial matrix runs bad scripts through the whole pipeline and none is published; and a labelled set of sixty sentences and a harness measure a verifier. Then the whole of Plan 2 is verified from a clean install, and the entry checklist for Plan 2b is written.

| Task | What it does |
|---|---|
| 29 | The desk-state writer: a hold added, the record of the last run replaced, nothing ever removed, a file that cannot be read left as it is. |
| 30 | The git adapter: commit exactly the named files with the trailer of the project, refuse when anything else is staged, never push; a fake for the tests of the stages. |
| 31 | The Publish stage and the targets: a piece that the gate and the verifier cleared is written as the renderer gives it into the site and committed with the record of the run, or, in a dry run, written nowhere. |
| 32 | The Hold stage: the held draft kept for the owner, the hold and its reasons added to the desk state, nothing on the pages of the site; the reasons of the model check join the codes of the gate, with a label on the holds page. |
| 33 | The made-up world and its story: the fixture sources as a world with no network, and a scripted model that tells a clean story that every stage lets through. |
| 34 | The orchestrator: one run under a lock, once for each day, ending in published, held, no-story or failed, with one commit and a record. |
| 35 | Replay: Extract, Compose and Verify run again from the pages in the evidence store and the recorded replies of the model, and every artifact compared with the stored one. |
| 36 | The command line: `desk run`, `desk replay` and `desk status`, with exit codes, and the scripted story and the made-up world allowed only in dry runs. |
| 37 | The adversarial matrix: fifteen scripted-bad scenarios through the whole pipeline, each held for the reason that the gate or the verifier gives, none published. |
| 38 | The verifier evals: sixty labelled sentences, and a harness that scores any model client through the real prompt and the real reading of the reply. |
| 39 | The demo: the made-up story run through the whole pipeline in a dry run and replayed, as a step of `npm run verify` and of CI; the README says what the Desk is and what is not built. |
| 40 | Clean-install verification of the whole plan, what each part proved and with which command, and the checklist with which Plan 2b starts. |

**Starting state:** part 4 is finished. `desk/` has its configuration, the model layer, the run folder and its artifacts (`01-discover.json` to `06-verify.json`), fetching, the evidence store, the source helpers and the six stages up to Verify, `runVerify` handing on `{ outcome, draft, gate, verifier, rounds, history }`. `npm run typecheck`, `npm test`, `npm run evals:seeded` and `npm run fixtures:check` pass.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/desk -- test/<folder>/<name>.test.ts`. Everything after the `--` goes to Vitest. Tests in the other workspaces are run with `--workspace @robywire/gate` or `--workspace @robywire/site`.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything. A few steps say `Expected: PASS` straight after a test is written: they are guards for something that is already true (the entry point exports nothing it should not), and they say so.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, the README or the labelled set; where a test needs one, it uses `String.fromCharCode`.
- **No network, no key, no real site.** Every page the tests read is a made-up file in `desk/test/fixtures/` or a string in the test, and the company is Fixture Robotics. No test opens a connection. The tests of git run the real `git`, in a repository that the test makes in a temporary folder, with the settings of the machine kept out; nothing is ever pushed. The tests of the command line give it a transport that cannot reach anything.
- **No model names in `desk/src` or `desk/evals`.** Do not write the text `claude-` in any file there except `desk/src/config.ts`. Tests use made-up names such as `model-a`.
- **No tools.** Every call goes through `ModelClient`, which has no way to offer a tool.
- **Text from the web is data.** It reaches a model only through `wrapSource`, inside a prompt whose system text begins with `UNTRUSTED_PREAMBLE`. Nothing in this part changes that.
- **Fail closed.** A stage that throws ends the run as `failed` and nothing is published. A run that cannot be started (the lock, the day, the checkout) is refused and records nothing. A file the Desk cannot read is left as it is.
- **Where files import from.** The lower layers of the Desk (the desk state, git, the targets, the lock, the artifacts) are exported by `desk/src/index.ts`. The stages, the orchestrator, replay, the command line, the demo and the evals are the top of the package: they import the lower layers from `'../index'` (or `'../src/index'` from `desk/evals`) and the gate from `'@robywire/gate'`, they import each other by path, and **none of them is exported by the entry point**; `desk/test/fetch/exports.test.ts` lists their names as names that must not be exported.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown, except Task 40, which changes nothing.

**Versions:** this part adds no package. The programs (`desk`, `desk:demo`, `evals:verifier`) are run by `tsx`, which the repository already has.

---

### Task 29: The desk-state writer

**Files:**
- Create: `desk/src/run/desk-state.ts` (`LastRun`, `Hold`, `recordRun`, `addHold`, `readDeskState`, `writeDeskState`, `updateDeskState`)
- Modify: `desk/src/index.ts` (export it)
- Modify: `desk/test/fetch/exports.test.ts`
- Test: `desk/test/run/desk-state.test.ts`

The desk state, `site/src/data/desk-state.json`, is what the site shows of the Desk: the last run and what it did, the drafts that were held, and the corrections. From now on the Desk changes it. This task is the one place that does, and it is built to be hard to misuse. The file is read and written through the gate's own `DeskState` schema, which is the schema the site checks it against, so a state the Desk writes is a state the site builds.

**What may change.** `recordRun(state, run)` replaces the record of the last run (only the last run is kept). `addHold(state, hold)` adds a hold after the ones that are there. Both return a new state and leave the one they are given alone. **Nothing is ever removed or rewritten**: a hold and a correction are public. `updateDeskState(file, change)` reads the file, applies a change and writes the result, and refuses a change after which the holds or the corrections of the old state are not the first ones of the new state, item for item and in the same order.

**A file that cannot be read is left exactly as it is.** A file that is missing (a run started in the wrong folder; the Desk does not create state somewhere else), is not JSON, does not fit the schema, or has a field the schema does not define is an error that names the file. The last is refused because the schema would drop the field when the state is written again, and a Desk that drops what it does not understand deletes. `updateDeskState` reads first, so the change is never called, and nothing is written, when the file is bad.

**The file.** It is written as JSON with two-space indents, the fields in the order of the schema (`lastRun`, `holds`, `corrections`) and a final newline, in one step with `writeFileAtomic` of part 2, so the site never reads half a file. The committed file is one line, `{"lastRun":null,"holds":[],"corrections":[]}`; the first write after it changes the layout and not the content, and a test reads the committed file to show it is a state the writer accepts.

- [ ] **Step 1: Write the failing test**

**Create `desk/test/run/desk-state.test.ts`:**
```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';

// The desk state is the one file of the site that the Desk changes after the first build: what the last run did, the drafts that were
// held, and the corrections. The Desk may add to it and may replace the record of the last run; it may never remove anything. A file it
// cannot read is left exactly as it is, because the next run must not start from a guess.

const scratch = useScratch();

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const RUN: LastRun = { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'fixture-robotics-ships-fx-1' };
const HOLD: Hold = { at: '2026-10-05T04:32:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'] };
const CORRECTION: DeskState['corrections'][number] = { at: '2026-10-06T09:00:00.000Z', slug: 'fixture-robotics-ships-fx-1', kind: 'correction', note: 'A figure was wrong.' };

/** A file in a new folder, holding `text`. */
function fileWith(text: string): string {
  const file = path.join(scratch(), 'desk-state.json');
  writeFileSync(file, text);
  return file;
}

const textOf = (file: string): string => readFileSync(file, 'utf8');

describe('recordRun', () => {
  it('sets the last run and leaves everything else as it was', () => {
    const state: DeskState = { lastRun: null, holds: [HOLD], corrections: [CORRECTION] };
    expect(recordRun(state, RUN)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('replaces the run that was recorded before: only the last one is kept', () => {
    const earlier: LastRun = { ...RUN, outcome: 'no-story', runId: 'earlier', slug: null };
    expect(recordRun(recordRun(EMPTY, earlier), RUN).lastRun).toEqual(RUN);
  });

  it('does not change the state it is given, nor share its arrays with the new one', () => {
    const state: DeskState = { lastRun: null, holds: [HOLD], corrections: [] };
    const next = recordRun(state, RUN);
    expect(state.lastRun).toBeNull();
    next.holds.push({ ...HOLD, reasons: ['G4_NUMBER_UNSUPPORTED'] });
    expect(state.holds).toEqual([HOLD]);
  });
});

describe('addHold', () => {
  it('adds the hold after the holds that are there, in the order they were added', () => {
    const second: Hold = { ...HOLD, at: '2026-10-06T04:32:00.000Z', reasons: ['G4_NUMBER_UNSUPPORTED', 'G2_BODY_LENGTH'] };
    const third: Hold = { ...HOLD, at: '2026-10-07T04:32:00.000Z', categories: ['humanoids', 'funding'], reasons: ['VERIFIER_NOT_ENTAILED'] };
    const state = addHold(addHold(addHold(EMPTY, HOLD), second), third);
    expect(state.holds).toEqual([HOLD, second, third]);
  });

  it('leaves the last run and the corrections as they were', () => {
    const state: DeskState = { lastRun: RUN, holds: [], corrections: [CORRECTION] };
    expect(addHold(state, HOLD)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('does not change the state it is given', () => {
    addHold(EMPTY, HOLD);
    expect(EMPTY.holds).toEqual([]);
  });
});

describe('readDeskState', () => {
  it('reads a state that is valid', async () => {
    const file = fileWith(JSON.stringify({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] }));
    expect(await readDeskState(file)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('reads the file that the site is committed with, which says that nothing has happened yet', async () => {
    const committed = new URL('../../../site/src/data/desk-state.json', import.meta.url);
    expect(await readDeskState(committed.pathname)).toEqual(EMPTY);
  });

  it('refuses a file that is not there, and says which', async () => {
    const file = path.join(scratch(), 'missing.json');
    await expect(readDeskState(file)).rejects.toThrow(`the desk state ${file} does not exist`);
  });

  it('refuses a file that is not JSON, and says which', async () => {
    const file = fileWith('{"lastRun": null, ');
    await expect(readDeskState(file)).rejects.toThrow(`the desk state ${file} is not valid JSON`);
  });

  it('refuses a file that does not fit the schema, and says what is wrong', async () => {
    const file = fileWith(JSON.stringify({ lastRun: { ...RUN, outcome: 'finished' }, holds: [], corrections: [] }));
    await expect(readDeskState(file)).rejects.toThrow(/the desk state .* is not valid: lastRun\.outcome/);
  });

  it('refuses a file that has a field the desk state does not have, because writing it again would drop the field', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [], corrections: [], note: 'by hand' }));
    await expect(readDeskState(file)).rejects.toThrow('has fields that the desk state does not define');
  });
});

describe('writeDeskState', () => {
  it('writes the state as JSON with two-space indents, the fields in the order of the schema, and a final newline', async () => {
    const file = path.join(scratch(), 'desk-state.json');
    await writeDeskState(file, { corrections: [], holds: [HOLD], lastRun: RUN });
    expect(textOf(file)).toBe(`${JSON.stringify({ lastRun: RUN, holds: [HOLD], corrections: [] }, null, 2)}\n`);
    expect(textOf(file).startsWith('{\n  "lastRun": {')).toBe(true);
  });

  it('refuses a state that is not valid, and leaves the file as it was', async () => {
    const file = fileWith('before');
    await expect(writeDeskState(file, { lastRun: { ...RUN, at: 'yesterday' }, holds: [], corrections: [] })).rejects.toThrow('is not valid');
    expect(textOf(file)).toBe('before');
  });

  it('writes what readDeskState reads back', async () => {
    const file = path.join(scratch(), 'desk-state.json');
    const state: DeskState = { lastRun: RUN, holds: [HOLD, { ...HOLD, prUrl: 'https://github.example/robywire/pull/3' }], corrections: [CORRECTION] };
    await writeDeskState(file, state);
    expect(await readDeskState(file)).toEqual(state);
  });
});

describe('updateDeskState', () => {
  it('reads the file, applies the change and writes the result', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    const result = await updateDeskState(file, (state) => addHold(recordRun(state, { ...RUN, outcome: 'held' }), HOLD));
    expect(result).toEqual({ lastRun: { ...RUN, outcome: 'held' }, holds: [HOLD], corrections: [] });
    expect(await readDeskState(file)).toEqual(result);
  });

  it('keeps the holds in the order of the updates, however many runs there are', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    for (const code of ['G2_BODY_LENGTH', 'G4_NUMBER_UNSUPPORTED', 'TIER2_ATTRIBUTION']) {
      await updateDeskState(file, (state) => addHold(state, { ...HOLD, reasons: [code] }));
    }
    expect((await readDeskState(file)).holds.map((hold) => hold.reasons)).toEqual([['G2_BODY_LENGTH'], ['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
  });

  it('refuses a change that removes a hold, and leaves the file as it was', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [HOLD], corrections: [] }));
    const before = textOf(file);
    await expect(updateDeskState(file, (state) => ({ ...state, holds: [] }))).rejects.toThrow('the desk state never loses a hold or a correction');
    expect(textOf(file)).toBe(before);
  });

  it('refuses a change that rewrites a hold or a correction, and one that puts a hold before the ones that were there', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [HOLD], corrections: [CORRECTION] }));
    const before = textOf(file);
    await expect(updateDeskState(file, (state) => ({ ...state, corrections: [{ ...CORRECTION, note: 'Changed.' }] }))).rejects.toThrow('never loses');
    await expect(updateDeskState(file, (state) => ({ ...state, holds: [{ ...HOLD, reasons: ['G9_SLUG_TAKEN'] }, ...state.holds] }))).rejects.toThrow('never loses');
    expect(textOf(file)).toBe(before);
  });

  it('fails closed on a file that is corrupt: the change is not run, and the file is untouched', async () => {
    const file = fileWith('{"lastRun": nul');
    let ran = false;
    await expect(
      updateDeskState(file, (state) => {
        ran = true;
        return state;
      }),
    ).rejects.toThrow('is not valid JSON');
    expect(ran).toBe(false);
    expect(textOf(file)).toBe('{"lastRun": nul');
  });

  it('writes nothing when the change throws', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    const before = textOf(file);
    await expect(
      updateDeskState(file, () => {
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(textOf(file)).toBe(before);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/desk-state.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/desk-state'`

- [ ] **Step 2: Write the module**

**Create `desk/src/run/desk-state.ts`:**
```ts
import { readFile } from 'node:fs/promises';
import { DeskState } from '@robywire/gate';
import { describeIssues } from '../issues';
import { canonicalJson } from '../model/types';
import { writeFileAtomic } from './atomic';

// The desk state is what the Desk says about itself on the site: the last run and what it did, the drafts it held, and the
// corrections. It is one JSON file in the site (`site/src/data/desk-state.json`) and the site checks it against the gate's
// `DeskState` schema, so that is the schema used here. The Desk may add a hold and may replace the record of the last run. It
// never removes or rewrites anything else (a correction is public, and so is a hold), and a file it cannot read is left exactly
// as it is: a run that starts from a guess could erase the record of what the Desk did.

/** The record of a run, as the state keeps it. */
export type LastRun = NonNullable<DeskState['lastRun']>;

/** A draft the gate held back: when, its categories, why (the codes of the failures and hold reasons), and the pull request when there is one. */
export type Hold = DeskState['holds'][number];

/** The state with `run` as its last run. A new state: the one given is not changed, and the two share nothing. */
export function recordRun(state: DeskState, run: LastRun): DeskState {
  return structuredClone({ ...state, lastRun: run });
}

/** The state with `hold` after the holds that are there. A new state: the one given is not changed, and the two share nothing. */
export function addHold(state: DeskState, hold: Hold): DeskState {
  return structuredClone({ ...state, holds: [...state.holds, hold] });
}

/**
 * Read and check the desk state in `file`. A file that is missing (a run in the wrong folder), is not JSON, does not fit the
 * schema, or has a field the schema does not define is an error that names the file. The last is refused because the schema
 * would drop the field when the state is written again, and the Desk does not delete.
 */
export async function readDeskState(file: string): Promise<DeskState> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the desk state ${file} does not exist`);
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error(`the desk state ${file} is not valid JSON`);
  }
  const parsed = DeskState.safeParse(data);
  if (!parsed.success) throw new Error(`the desk state ${file} is not valid: ${describeIssues(parsed.error)}`);
  if (canonicalJson(parsed.data) !== canonicalJson(data)) {
    throw new Error(`the desk state ${file} has fields that the desk state does not define, so the Desk does not rewrite it`);
  }
  return parsed.data;
}

/**
 * Check `state` and write it to `file`: JSON with two-space indents, the fields in the order of the schema and a final newline, written in
 * one step (see `writeFileAtomic`). A state that is not valid is not written.
 */
export async function writeDeskState(file: string, state: DeskState): Promise<void> {
  const parsed = DeskState.safeParse(state);
  if (!parsed.success) throw new Error(`the desk state to write to ${file} is not valid: ${describeIssues(parsed.error)}`);
  await writeFileAtomic(file, `${JSON.stringify(parsed.data, null, 2)}\n`);
}

/** Whether `before` is the first items of `after`, item for item. */
const isPrefix = (before: readonly unknown[], after: readonly unknown[]): boolean =>
  before.length <= after.length && before.every((item, at) => canonicalJson(item) === canonicalJson(after[at]));

/**
 * Read the state in `file`, apply `change` to it and write the result; returns the result. The state that is read is checked first,
 * so a corrupt file ends the update before `change` is called. A change that loses a hold or a correction (one removed, one rewritten, or
 * the order of them changed) is refused: the holds and the corrections of the state that was read must be the first of the new one, in
 * the same order. In every case where there is an error, the file is not touched.
 */
export async function updateDeskState(file: string, change: (state: DeskState) => DeskState): Promise<DeskState> {
  const before = await readDeskState(file);
  const after = change(structuredClone(before));
  if (!isPrefix(before.holds, after.holds) || !isPrefix(before.corrections, after.corrections)) {
    throw new Error(`the desk state never loses a hold or a correction: the change to ${file} would remove or rewrite one`);
  }
  await writeDeskState(file, after);
  return after;
}
```

Run: `npm test --workspace @robywire/desk -- test/run/desk-state.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing test of the entry point**

The stages of the next tasks import the desk-state writer from the package entry point, like every other layer below them.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  GateReport,
  HttpFetcherOptions,
  Newsroom,
  PageLink,
```

**with:**
```ts
  GateReport,
  HttpFetcherOptions,
  Hold,
  LastRun,
  Newsroom,
  PageLink,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'sourceKind',
  'isTier1',
];

```

**with:**
```ts
  'sourceKind',
  'isTier1',
  'recordRun',
  'addHold',
  'readDeskState',
  'writeDeskState',
  'updateDeskState',
];

```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      Tier2Feed,
      SourceKind,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      Tier2Feed,
      SourceKind,
      LastRun,
      Hold,
    ];
    const nothing: Exported | undefined = undefined;
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: FAIL — `to have property "recordRun"`

- [ ] **Step 4: Export the module**

**In `desk/src/index.ts`, replace:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './sources';
```

**with:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './run/desk-state';
export * from './sources';
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 6: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 7: Commit**

```bash
git add desk/src/run/desk-state.ts desk/src/index.ts desk/test/run/desk-state.test.ts desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the desk-state writer: a hold added, the record of the last run replaced, nothing ever removed, and a file that cannot be read left as it is" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 30: The git adapter

**Files:**
- Create: `desk/src/run/git.ts` (`COMMIT_TRAILER`, `GitTarget`, `GitCliOptions`, `GitCli`, `FakeCommit`, `FakeGit`)
- Modify: `desk/src/index.ts` (export it)
- Modify: `desk/test/fetch/exports.test.ts`
- Test: `desk/test/run/git.test.ts`

The Publish stage commits what it writes, and so do the runs that end in a hold, in no story or in a failure (they commit the desk state). This task is the part of git that they use. It is small on purpose: `isClean(paths)` and `commit(paths, message)`. There is no push, no branch, no reset and no way to ask git for anything else, so the Desk cannot do more with the repository than these two things, whatever a later change tries.

**What `commit` does, and refuses.** It takes the files by name, relative to the repository or absolute, and refuses a path outside the repository, the repository itself (`.`) and no path at all. It refuses when the index already holds anything staged, because git would commit that with the Desk's files; the Desk never commits something it did not write. It then runs `git add` for the named files and `git commit -m <message> -m <trailer> -- <files>`: the **two `-m` form of this project** (the subject, then a trailer paragraph, so that `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` is a real git trailer), with the files named again so that git commits those files and nothing else. A commit with nothing to commit fails: the Desk never makes an empty commit. It returns the 40-character id of the commit. Git runs with `GIT_LITERAL_PATHSPECS=1`, so a file called `*.txt` is a file and not a pattern, with no terminal prompts and in one language, whatever the machine is set to.

**`isClean(paths)`** is true when none of the paths has an uncommitted change: nothing modified, staged, deleted, or new and not tracked (a folder is looked into). The stages ask it before they write anything, and refuse to start when it is false.

**The tests run the real `git`**, in a repository that each test makes for itself in a temporary folder with `git init`, with its own committer and with signing off, and with the settings of the machine kept out (`GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` point at `/dev/null`), so the tests give the same result on any machine and touch no other repository. Nothing is ever pushed, and nothing uses a network. `FakeGit` is the stand-in for the tests of the stages: it records each commit, says a path is dirty when a test tells it so, and can be made to fail the next commit.

- [ ] **Step 1: Write the failing test**

**Create `desk/test/run/git.test.ts`:**
```ts
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { useScratch } from '../support/context';

// The Desk commits only what it wrote, only the files it names, and only into a repository that has nothing else of the Desk's in the way.
// The tests of `GitCli` run the real `git` in a repository that each test makes for itself in a temporary folder: nothing leaves the
// machine, and nothing is ever pushed.

const scratch = useScratch();

/** The settings of the machine that runs the tests (who signs, which hooks) must not reach these repositories. */
const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();

const cliFor = (dir: string): GitCli => new GitCli(dir, { env: ISOLATED });

/** The files that have a change that is not committed, as `git status` says them, in order. */
const changesIn = (dir: string): string[] =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } })
    .split('\n')
    .filter((line) => line !== '')
    .sort();

function write(dir: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}

/** A repository with one commit: a README, the desk state and a piece. Its own settings say who commits and that nothing is signed. */
function makeRepo(): string {
  const dir = scratch();
  git(dir, 'init', '--quiet', '-b', 'main');
  git(dir, 'config', 'user.name', 'Test Committer');
  git(dir, 'config', 'user.email', 'committer@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  write(dir, 'README.md', 'readme\n');
  write(dir, 'site/src/data/desk-state.json', '{}\n');
  write(dir, 'site/src/content/news/older.mdx', 'older\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '--quiet', '-m', 'start');
  return dir;
}

const NEWS = 'site/src/content/news/new-piece.mdx';
const LEDGER = 'site/src/content/ledger/new-piece.json';
const STATE = 'site/src/data/desk-state.json';

/** The three files of a publish, written into `dir`: two new ones and a change to the state. */
function writePiece(dir: string): void {
  write(dir, NEWS, 'news\n');
  write(dir, LEDGER, '{}\n');
  write(dir, STATE, '{"changed":true}\n');
}

const filesOf = (dir: string, rev: string): string[] => git(dir, 'show', '--name-only', '--format=', rev).split('\n').sort();

describe('GitCli.commit', () => {
  it('commits exactly the files it is given and returns the id of the commit', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const id = await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(id).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS, STATE]);
    expect(changesIn(dir)).toEqual([]);
  });

  it('writes the message as the subject and the trailer of the project as a trailer, with the two -m options', async () => {
    const dir = makeRepo();
    writePiece(dir);
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('desk: publish new-piece');
    expect(git(dir, 'log', '-1', '--format=%B')).toBe(`desk: publish new-piece\n\n${COMMIT_TRAILER}`);
    expect(COMMIT_TRAILER).toBe('Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
    const message = git(dir, 'log', '-1', '--format=%B');
    const parsed = execFileSync('git', ['interpret-trailers', '--parse'], { cwd: dir, input: message, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();
    expect(parsed).toBe(COMMIT_TRAILER);
  });

  it('leaves every other change where it was: an untracked file stays untracked, a modified file stays modified', async () => {
    const dir = makeRepo();
    writePiece(dir);
    write(dir, 'notes.txt', 'mine\n');
    write(dir, 'README.md', 'changed readme\n');
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(changesIn(dir)).toEqual([' M README.md', '?? notes.txt']);
  });

  it('refuses when something else is already staged, because it would be committed with the Desk\'s files; nothing is committed', async () => {
    const dir = makeRepo();
    writePiece(dir);
    write(dir, 'README.md', 'staged by someone\n');
    git(dir, 'add', 'README.md');
    const head = git(dir, 'rev-parse', 'HEAD');
    await expect(cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece')).rejects.toThrow('README.md');
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'diff', '--cached', '--name-only')).toBe('README.md');
  });

  it('reads a path as a path and never as a pattern: a file called *.txt is committed alone', async () => {
    const dir = makeRepo();
    write(dir, 'a.txt', 'a\n');
    write(dir, '*.txt', 'star\n');
    const id = await cliFor(dir).commit(['*.txt'], 'desk: a literal path');
    expect(filesOf(dir, id)).toEqual(['*.txt']);
    expect(changesIn(dir)).toEqual(['?? a.txt']);
  });

  it('takes a path relative to the repository or an absolute one', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const id = await cliFor(dir).commit([NEWS, path.join(dir, LEDGER), STATE], 'desk: publish new-piece');
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS, STATE]);
  });

  it('refuses a path outside the repository, the repository itself, and no path at all', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const cli = cliFor(dir);
    await expect(cli.commit(['../outside.txt'], 'x')).rejects.toThrow('is not inside the repository');
    await expect(cli.commit([path.join(path.dirname(dir), 'outside.txt')], 'x')).rejects.toThrow('is not inside the repository');
    await expect(cli.commit(['.'], 'x')).rejects.toThrow('the whole repository');
    await expect(cli.commit([], 'x')).rejects.toThrow('needs at least one path');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });

  it('refuses a message that says nothing', async () => {
    const dir = makeRepo();
    writePiece(dir);
    await expect(cliFor(dir).commit([NEWS], '   ')).rejects.toThrow('needs a message');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });

  it('refuses to make an empty commit: the files it is given have no change', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).commit([STATE], 'desk: record the run')).rejects.toThrow('git commit failed');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });

  it('runs git with the environment it needs, which a hook of git can show: paths are literal, nothing asks for a password, and messages are in one language', async () => {
    const dir = makeRepo();
    const hook = path.join(dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nenv | grep -E "^(GIT_LITERAL_PATHSPECS|GIT_TERMINAL_PROMPT|LC_ALL)=" | sort > .git/seen-env\n');
    chmodSync(hook, 0o755);
    writePiece(dir);
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(readFileSync(path.join(dir, '.git/seen-env'), 'utf8').split('\n').filter((line) => line !== '')).toEqual(['GIT_LITERAL_PATHSPECS=1', 'GIT_TERMINAL_PROMPT=0', 'LC_ALL=C']);
  });

  it('says what git said without the line ending that git adds', async () => {
    const dir = scratch();
    write(dir, 'a.txt', 'a\n');
    const cli = new GitCli(dir, { env: { ...ISOLATED, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    const error = (await cli.commit(['a.txt'], 'x').catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/^git status failed: fatal: not a git repository/);
    expect(error.message.endsWith('\n')).toBe(false);
  });

  it('fails with what git said when git cannot run in the folder', async () => {
    const dir = scratch();
    write(dir, 'a.txt', 'a\n');
    const cli = new GitCli(dir, { env: { ...ISOLATED, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    await expect(cli.commit(['a.txt'], 'x')).rejects.toThrow(/git status failed: .*not a git repository/);
  });
});

describe('GitCli.isClean', () => {
  it('is true when none of the paths has a change', async () => {
    const dir = makeRepo();
    expect(await cliFor(dir).isClean([NEWS, LEDGER, STATE])).toBe(true);
  });

  it('is false for a tracked file that was modified, a new file that is not tracked, and a file that is staged', async () => {
    const dir = makeRepo();
    const cli = cliFor(dir);
    write(dir, STATE, '{"changed":true}\n');
    expect(await cli.isClean([STATE])).toBe(false);
    git(dir, 'checkout', '--quiet', STATE);
    write(dir, LEDGER, '{}\n');
    expect(await cli.isClean([LEDGER])).toBe(false);
    git(dir, 'add', LEDGER);
    expect(await cli.isClean([LEDGER])).toBe(false);
  });

  it('looks inside a folder it is given, and only at the paths it is given', async () => {
    const dir = makeRepo();
    const cli = cliFor(dir);
    write(dir, 'site/src/content/ledger/other.json', '{}\n');
    expect(await cli.isClean(['site/src/content/ledger'])).toBe(false);
    expect(await cli.isClean(['site/src/content/news', STATE])).toBe(true);
  });

  it('is false for a file that was deleted and not committed', async () => {
    const dir = makeRepo();
    rmSync(path.join(dir, 'site/src/content/news/older.mdx'));
    expect(await cliFor(dir).isClean(['site/src/content/news'])).toBe(false);
  });

  it('refuses the same paths that commit refuses', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).isClean(['../outside'])).rejects.toThrow('is not inside the repository');
    await expect(cliFor(dir).isClean([])).rejects.toThrow('needs at least one path');
  });
});

describe('FakeGit', () => {
  it('records each commit with its paths and its message, and gives each an id of its own', async () => {
    const fake = new FakeGit();
    const first = await fake.commit(['a', 'b'], 'first');
    const second = await fake.commit(['c'], 'second');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(fake.commits).toEqual([
      { id: first, paths: ['a', 'b'], message: 'first' },
      { id: second, paths: ['c'], message: 'second' },
    ]);
  });

  it('is clean until a path that overlaps one of those it is told are dirty', async () => {
    const fake = new FakeGit();
    expect(await fake.isClean(['site/src/content/news'])).toBe(true);
    fake.dirty.add('site/src/content/news/old.mdx');
    expect(await fake.isClean(['site/src/content/news'])).toBe(false);
    expect(await fake.isClean(['site/src/content/news/old.mdx'])).toBe(false);
    expect(await fake.isClean(['site/src/content/ledger'])).toBe(true);
    expect(await fake.isClean(['site'])).toBe(false);
  });

  it('is dirty for a path inside a folder that is dirty, and for a folder that holds a path that is dirty, whichever of several it overlaps', async () => {
    const fake = new FakeGit();
    fake.dirty.add('site/src/content');
    fake.dirty.add('site/src/data/desk-state.json');
    expect(await fake.isClean(['site/src/content/news/old.mdx'])).toBe(false);
    expect(await fake.isClean(['site/src/data'])).toBe(false);
    expect(await fake.isClean(['site/src/other', 'site/src/content/ledger'])).toBe(false);
    expect(await fake.isClean(['site/src/other', 'README.md'])).toBe(true);
    expect(await fake.isClean(['site/src/content-fixtures'])).toBe(true);
  });

  it('fails the next commit with the error it is given, and records nothing', async () => {
    const fake = new FakeGit();
    fake.failNextCommit = new Error('no space left');
    await expect(fake.commit(['a'], 'x')).rejects.toThrow('no space left');
    expect(fake.commits).toEqual([]);
    await expect(fake.commit(['a'], 'x')).resolves.toMatch(/^[0-9a-f]{40}$/);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/git.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/git'`

- [ ] **Step 2: Write the adapter**

**Create `desk/src/run/git.ts`:**
```ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { sha256Hex } from '../model/types';

// How the Desk commits. The Publish stage and the runs that end in a hold write a few files and commit exactly those, and the rest of the
// repository is none of their business: they name each file, they refuse to start when something else of the Desk's is in the way, and they
// never push (that is for the daily workflow of a later plan). A `GitTarget` is the part of git they use, so that a stage can be tested with a
// `FakeGit` and the real thing, `GitCli`, is tested once, in a repository that a test makes in a temporary folder.

/** The trailer that ends every commit of this project, the Desk's own included: it records which model wrote what. */
export const COMMIT_TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';

export interface GitTarget {
  /** True when none of `paths` (files or folders) has a change that is not committed: nothing modified, staged, deleted or new and not tracked. */
  isClean(paths: readonly string[]): Promise<boolean>;
  /**
   * Commit exactly the files in `paths` with `message` as the subject and `COMMIT_TRAILER` as the trailer, and return the id of the commit.
   * Throws, and commits nothing, when anything else is already staged or when the files have no change.
   */
  commit(paths: readonly string[], message: string): Promise<string>;
}

const run = promisify(execFile);

export interface GitCliOptions {
  /** Variables of the environment for git, laid over those of this process. A test uses it to keep the settings of the machine out. */
  env?: Readonly<Record<string, string>>;
}

/** Git, run as a program in the folder of a repository. Only `isClean` and `commit` are done: there is no way to push, branch or reset. */
export class GitCli implements GitTarget {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly dir: string,
    options: GitCliOptions = {},
  ) {
    // A path is a path and never a pattern; nothing may ask for a password; the messages of git are in the same language everywhere.
    this.env = { ...process.env, ...options.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  }

  /** Run git with these arguments and return what it printed; a failure says which command failed and what git said. */
  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd: this.dir, env: this.env, maxBuffer: 16 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      const failure = error as { stderr?: string; message: string };
      throw new Error(`git ${args[0]} failed: ${(failure.stderr ?? failure.message).trim()}`);
    }
  }

  /** The paths as git wants them: relative to the repository, with forward slashes. A path outside the repository, or the repository itself, is refused. */
  private relative(paths: readonly string[]): string[] {
    if (paths.length === 0) throw new Error('git needs at least one path: the Desk names the files it commits');
    return paths.map((given) => {
      const relative = path.relative(this.dir, path.resolve(this.dir, given));
      if (relative === '') throw new Error(`"${given}" is the whole repository, and the Desk commits only the files it names`);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`"${given}" is not inside the repository ${this.dir}`);
      return relative.split(path.sep).join('/');
    });
  }

  async isClean(paths: readonly string[]): Promise<boolean> {
    const status = await this.git(['status', '--porcelain', '--untracked-files=all', '--', ...this.relative(paths)]);
    return status.trim() === '';
  }

  async commit(paths: readonly string[], message: string): Promise<string> {
    const files = this.relative(paths);
    if (message.trim() === '') throw new Error('a commit needs a message');
    // In the short form of `status`, the first of the two letters before a file is its state in the index: a space for a file that is not staged.
    const staged = (await this.git(['status', '--porcelain', '--untracked-files=no']))
      .split('\n')
      .filter((line) => line !== '' && line[0] !== ' ')
      .map((line) => line.slice(3));
    if (staged.length > 0) throw new Error(`the repository already has changes staged that are not the Desk's (${staged.join(', ')}), so the Desk does not commit`);
    await this.git(['add', '--', ...files]);
    // With the files named after the options, git commits those files and nothing else in the index.
    await this.git(['commit', '-m', message, '-m', COMMIT_TRAILER, '--', ...files]);
    return (await this.git(['rev-parse', 'HEAD'])).trim();
  }
}

/** A commit that `FakeGit` was asked to make. */
export interface FakeCommit {
  id: string;
  paths: string[];
  message: string;
}

/** A stand-in for git that tests use: it records the commits it is asked for, and says paths are dirty when a test tells it so. */
export class FakeGit implements GitTarget {
  /** Every commit, in order. */
  readonly commits: FakeCommit[] = [];
  /** The paths that have an uncommitted change. A folder is dirty when a path inside it is, and a path is dirty when a folder that holds it is. */
  readonly dirty = new Set<string>();
  /** When set, the next commit fails with this error (and it is cleared). */
  failNextCommit: Error | undefined;

  async isClean(paths: readonly string[]): Promise<boolean> {
    const overlaps = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
    return !paths.some((given) => [...this.dirty].some((dirty) => overlaps(given, dirty)));
  }

  async commit(paths: readonly string[], message: string): Promise<string> {
    if (this.failNextCommit !== undefined) {
      const error = this.failNextCommit;
      this.failNextCommit = undefined;
      throw error;
    }
    const id = sha256Hex(`fake commit ${this.commits.length + 1}`).slice(0, 40);
    this.commits.push({ id, paths: [...paths], message });
    return id;
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/run/git.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing test of the entry point**

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  ExtractArtifact,
  ExtractedPage,
  FeedErrorKind,
  FeedItem,
```

**with:**
```ts
  ExtractArtifact,
  ExtractedPage,
  FakeCommit,
  FeedErrorKind,
  FeedItem,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  FixtureEntry,
  GateReport,
  HttpFetcherOptions,
  Hold,
```

**with:**
```ts
  FixtureEntry,
  GateReport,
  GitCliOptions,
  GitTarget,
  HttpFetcherOptions,
  Hold,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'writeDeskState',
  'updateDeskState',
];

```

**with:**
```ts
  'writeDeskState',
  'updateDeskState',
  'COMMIT_TRAILER',
  'GitCli',
  'FakeGit',
];

```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      LastRun,
      Hold,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      LastRun,
      Hold,
      GitTarget,
      GitCliOptions,
      FakeCommit,
    ];
    const nothing: Exported | undefined = undefined;
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: FAIL — `to have property "COMMIT_TRAILER"`

- [ ] **Step 4: Export the adapter**

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/evidence';
export * from './run/desk-state';
export * from './sources';
```

**with:**
```ts
export * from './run/evidence';
export * from './run/desk-state';
export * from './run/git';
export * from './sources';
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 6: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 7: Commit**

```bash
git add desk/src/run/git.ts desk/src/index.ts desk/test/run/git.test.ts desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the git adapter: commit exactly the named files with the project's trailer, refuse when anything else is staged, never push, and a fake for the tests of the stages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 31: The Publish stage

**Files:**
- Create: `desk/src/run/target.ts` (`SitePaths`, `sitePaths`, `PieceFiles`, `TargetChange`, `TargetResult`, `PublishTarget`, `SiteTarget`, `DryTarget`)
- Create: `desk/src/stages/publish.ts` (`PublishRun`, `PublishResult`, `runPublish`)
- Modify: `desk/src/run/desk-state.ts` (`assertNothingLost`, used by `updateDeskState` and by the targets)
- Modify: `desk/src/index.ts` (export the target)
- Create: `desk/test/support/site.ts` (a made-up checkout of the site)
- Modify: `desk/test/run/desk-state.test.ts`, `desk/test/fetch/exports.test.ts`
- Test: `desk/test/run/target.test.ts`, `desk/test/stages/publish.test.ts`

The seventh stage puts a piece that the gate and the verifier cleared on the site. **Nothing the Desk writes into a piece is text of its own**: the two files of a piece, the `.mdx` and the ledger, are exactly what `renderDraft` of the gate package gives (the same renderer whose output the site refuses to build if it is changed by hand), with `release: 'auto'` (the gate cleared it and nobody was asked), the run's id and the verdict of the model check in the ledger, and no `updatedAt` (it has never been corrected). The stage writes them byte for byte, records the run in the desk state (`recordRun`, Task 29), and commits the three files in one commit with git (Task 30): `desk: publish <slug>`. Nothing is pushed; that is the daily workflow's job in a later plan.

**One run, one commit.** From now on every run that is not a dry run ends in exactly one commit. A run that publishes commits the piece, its ledger and the desk state. A run that ends in a hold, in no story or in a failure commits the desk state alone (Tasks 32 and 33). A checkout that is clean before a run is clean after it, so the next run can start, and a checkout that is not clean is refused before anything is written.

**A target is where a run puts what it made.** `PublishTarget.apply({ piece?, state, message })` writes the piece (when there is one), changes the desk state and commits it all, and refuses **before it writes anything**: a slug that is not a plain slug (a slug is a file name, so `../x` is refused), a slug that is taken (`<slug>.mdx` or `<slug>.json` already there: the Desk never overwrites a piece), a place where it would write that has changes that are not committed (the state file, and the two content folders when there is a piece; it asks git first), a desk state that cannot be read, and a change that would lose a hold or a correction. If the commit fails after the files are written, the new files are removed and the desk state is put back byte for byte, so a failure leaves the checkout as it was found. `SiteTarget(repoDir, git)` does this in the checkout of the site; `DryTarget(repoDir)` goes through the checks that need no git and writes nothing, and says which files it would have written, which is what `desk run --dry` uses. `sitePaths()` is the one place that says where the folders and the desk state are (`site/src/content/news`, `site/src/content/ledger`, `site/src/data/desk-state.json`).

**What the stage refuses.** `runPublish` does not take the word of the stage before it: it refuses unless the outcome is `publish` **and** the gate's route for the draft is `publish` **and** the model check passed. A piece that cites another outlet, which the gate holds (`TIER2_ATTRIBUTION`), cannot get through with a wrong label. A piece the renderer cannot write (a sentence cites a claim that was not given) writes nothing. The ledger is checked against the schema that the site uses before anything is written.

**The tests** use a made-up checkout of the site in a temporary folder (`makeSite`), the golden piece of the gate (which every check clears), and a `FakeGit`; one group of tests in `target.test.ts` uses the real `git` in a repository of its own. One test imports `matchPieces`, the function that the site's build uses to join a piece with its ledger, from the site, and runs it on what the stage wrote: the front matter must be valid and the body, the title and the description must be what the ledger renders. If the Desk and the site ever disagreed about what a piece is, that test fails.

- [ ] **Step 1: Write the failing test of `assertNothingLost`**

The check that a change loses nothing, which `updateDeskState` makes, is needed by the targets too, so it becomes a function of its own.

**In `desk/test/run/desk-state.test.ts`, replace:**
```ts
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';
```

**with:**
```ts
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, assertNothingLost, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';
```

**In `desk/test/run/desk-state.test.ts`, replace:**
```ts
    expect(textOf(file)).toBe(before);
  });
});
```

**with:**
```ts
    expect(textOf(file)).toBe(before);
  });
});

describe('assertNothingLost', () => {
  const before: DeskState = { lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] };

  it('accepts a state that has the same holds and corrections and more after them, and any last run', () => {
    const after: DeskState = { lastRun: null, holds: [HOLD, { ...HOLD, reasons: ['G2_BODY_LENGTH'] }], corrections: [CORRECTION, { ...CORRECTION, kind: 'retraction' }] };
    expect(() => assertNothingLost(before, after, 'desk-state.json')).not.toThrow();
    expect(() => assertNothingLost(before, before, 'desk-state.json')).not.toThrow();
  });

  it('refuses a state with a hold or a correction fewer, one rewritten, or the order changed, and names the file', () => {
    const second: Hold = { ...HOLD, reasons: ['G2_BODY_LENGTH'] };
    expect(() => assertNothingLost(before, { ...before, holds: [] }, 'desk-state.json')).toThrow('the change to desk-state.json would remove or rewrite one');
    expect(() => assertNothingLost(before, { ...before, corrections: [] }, 'desk-state.json')).toThrow('never loses');
    expect(() => assertNothingLost(before, { ...before, holds: [second] }, 'desk-state.json')).toThrow('never loses');
    expect(() => assertNothingLost({ ...before, holds: [HOLD, second] }, { ...before, holds: [second, HOLD] }, 'desk-state.json')).toThrow('never loses');
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/desk-state.test.ts`
Expected: FAIL — `is not a function`

- [ ] **Step 2: Make the check a function of its own**

**In `desk/src/run/desk-state.ts`, replace:**
```ts
  before.length <= after.length && before.every((item, at) => canonicalJson(item) === canonicalJson(after[at]));

/**
 * Read the state in `file`, apply `change` to it and write the result; returns the result. The state that is read is checked first,
 * so a corrupt file ends the update before `change` is called. A change that loses a hold or a correction (one removed, one rewritten, or
 * the order of them changed) is refused: the holds and the corrections of the state that was read must be the first of the new one, in
 * the same order. In every case where there is an error, the file is not touched.
 */
export async function updateDeskState(file: string, change: (state: DeskState) => DeskState): Promise<DeskState> {
  const before = await readDeskState(file);
  const after = change(structuredClone(before));
  if (!isPrefix(before.holds, after.holds) || !isPrefix(before.corrections, after.corrections)) {
    throw new Error(`the desk state never loses a hold or a correction: the change to ${file} would remove or rewrite one`);
  }
  await writeDeskState(file, after);
  return after;
```

**with:**
```ts
  before.length <= after.length && before.every((item, at) => canonicalJson(item) === canonicalJson(after[at]));

/**
 * Refuse a change that loses a hold or a correction: the holds and the corrections of `before` must be the first ones of `after`, item for item and in
 * the same order, so that nothing was removed, rewritten or moved. `file` is named in the error.
 */
export function assertNothingLost(before: DeskState, after: DeskState, file: string): void {
  if (!isPrefix(before.holds, after.holds) || !isPrefix(before.corrections, after.corrections)) {
    throw new Error(`the desk state never loses a hold or a correction: the change to ${file} would remove or rewrite one`);
  }
}

/**
 * Read the state in `file`, apply `change` to it and write the result; returns the result. The state that is read is checked first,
 * so a corrupt file ends the update before `change` is called. A change that loses a hold or a correction (see `assertNothingLost`) is
 * refused. In every case where there is an error, the file is not touched.
 */
export async function updateDeskState(file: string, change: (state: DeskState) => DeskState): Promise<DeskState> {
  const before = await readDeskState(file);
  const after = change(structuredClone(before));
  assertNothingLost(before, after, file);
  await writeDeskState(file, after);
  return after;
```

Run: `npm test --workspace @robywire/desk -- test/run/desk-state.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing test of the targets**

The test of the targets uses a made-up checkout of the site, which later tests use too.

**Create `desk/test/support/site.ts`:**
```ts
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A made-up checkout of the site for the tests that publish: the folders where the pieces and the ledgers go, and the desk state as it is
// committed (one line, nothing has happened yet). The tests of Publish and of the runs put it in a temporary folder, so the real site is never touched.

/** The desk state as `site/src/data/desk-state.json` is committed. */
export const COMMITTED_STATE = '{"lastRun":null,"holds":[],"corrections":[]}\n';

/** Make the folders of a site in the folder `repoDir`, and return it. The two content folders hold a `.gitkeep`, as the real ones do. */
export function makeSite(repoDir: string): string {
  for (const folder of ['site/src/content/news', 'site/src/content/ledger']) {
    mkdirSync(path.join(repoDir, folder), { recursive: true });
    writeFileSync(path.join(repoDir, folder, '.gitkeep'), '');
  }
  mkdirSync(path.join(repoDir, 'site/src/data'), { recursive: true });
  writeFileSync(path.join(repoDir, 'site/src/data/desk-state.json'), COMMITTED_STATE);
  return repoDir;
}

/** Every file below `dir`, as paths relative to it with forward slashes, in order. */
export function filesBelow(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => statSync(path.join(dir, entry)).isFile())
    .map((entry) => entry.split(path.sep).join('/'))
    .sort();
}
```

**Create `desk/test/run/target.test.ts`:**
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, readDeskState, recordRun } from '../../src/run/desk-state';
import type { LastRun } from '../../src/run/desk-state';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import type { TargetChange } from '../../src/run/target';
import { useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// A target is where a run puts what it made: the files of a piece and the desk state, in the checkout of the site, committed in one
// commit. `SiteTarget` does it; `DryTarget` goes through the same checks and writes nothing. Both refuse before they write, and the first,
// if the commit fails, puts everything back.

const scratch = useScratch();

const NEWS = 'site/src/content/news/fixture-piece.mdx';
const LEDGER = 'site/src/content/ledger/fixture-piece.json';
const STATE = 'site/src/data/desk-state.json';

const RUN: LastRun = { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'fixture-piece' };
const PIECE = { slug: 'fixture-piece', mdx: '---\ntitle: "A piece"\n---\n\nThe body.\n', ledger: '{\n  "slug": "fixture-piece"\n}\n' };

/** A change that publishes `PIECE` and records the run. */
const publishing = (overrides: Partial<TargetChange> = {}): TargetChange => ({ piece: PIECE, state: (state) => recordRun(state, RUN), message: 'desk: publish fixture-piece', ...overrides });

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** A site in a new folder, and a fake git for it. */
function setup() {
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { repoDir, git, target: new SiteTarget(repoDir, git) };
}

describe('sitePaths', () => {
  it('names the folders and the file of the site, below the folder of the site', () => {
    const paths = sitePaths();
    expect(paths.newsDir).toBe('site/src/content/news');
    expect(paths.ledgerDir).toBe('site/src/content/ledger');
    expect(paths.stateFile).toBe(STATE);
    expect(paths.newsFile('fixture-piece')).toBe(NEWS);
    expect(paths.ledgerFile('fixture-piece')).toBe(LEDGER);
    expect(sitePaths('web').stateFile).toBe('web/src/data/desk-state.json');
  });
});

describe('SiteTarget.apply', () => {
  it('writes the piece and the ledger exactly as given, changes the desk state, and commits the three files with the message', async () => {
    const { repoDir, git, target } = setup();
    const result = await target.apply(publishing());
    expect(read(repoDir, NEWS)).toBe(PIECE.mdx);
    expect(read(repoDir, LEDGER)).toBe(PIECE.ledger);
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun).toEqual(RUN);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0]).toEqual({ id: result.commit, paths: [NEWS, LEDGER, STATE], message: 'desk: publish fixture-piece' });
    expect(result).toEqual({ commit: git.commits[0]?.id, files: [NEWS, LEDGER, STATE] });
    expect(target.dry).toBe(false);
  });

  it('with no piece, changes only the desk state and commits only it', async () => {
    const { repoDir, git, target } = setup();
    const before = filesBelow(repoDir);
    const result = await target.apply({ state: (state) => recordRun(state, { ...RUN, outcome: 'no-story', slug: null }), message: 'desk: no story' });
    expect(filesBelow(repoDir)).toEqual(before);
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun?.outcome).toBe('no-story');
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(result.files).toEqual([STATE]);
  });

  it('asks git whether the state and the two content folders are clean before it writes anything, and refuses when they are not', async () => {
    for (const dirty of [STATE, 'site/src/content/news/older.mdx', 'site/src/content/ledger/older.json']) {
      const { repoDir, git, target } = setup();
      git.dirty.add(dirty);
      await expect(target.apply(publishing())).rejects.toThrow(`has changes that are not committed (${sitePaths().stateFile}, ${sitePaths().newsDir}, ${sitePaths().ledgerDir})`);
      expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
      expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
      expect(git.commits).toEqual([]);
    }
  });

  it('with no piece, asks about the state file alone: a stray piece of an earlier run does not stop a record of a run', async () => {
    const { git, target } = setup();
    git.dirty.add('site/src/content/news/older.mdx');
    await expect(target.apply({ state: (state) => recordRun(state, RUN), message: 'desk: record' })).resolves.toMatchObject({ files: [STATE] });
    git.dirty.add(STATE);
    await expect(target.apply({ state: (state) => recordRun(state, RUN), message: 'desk: record' })).rejects.toThrow(`has changes that are not committed (${STATE})`);
  });

  it('never overwrites a piece or a ledger that is there: the slug is taken, and nothing is changed', async () => {
    for (const taken of [NEWS, LEDGER]) {
      const { repoDir, git, target } = setup();
      writeFileSync(path.join(repoDir, taken), 'already published\n');
      await expect(target.apply(publishing())).rejects.toThrow(`${taken} is already there, so the slug "fixture-piece" is taken`);
      expect(read(repoDir, taken)).toBe('already published\n');
      expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
      expect(git.commits).toEqual([]);
    }
  });

  it('refuses a slug that is not a plain slug, because the slug is a file name', async () => {
    for (const slug of ['../outside', 'Upper-Case', 'two words', 'a/b', '', '-leading', 'double--hyphen']) {
      const { git, target } = setup();
      await expect(target.apply(publishing({ piece: { ...PIECE, slug } }))).rejects.toThrow('is not a plain slug');
      expect(git.commits).toEqual([]);
    }
  });

  it('fails closed on a desk state that cannot be read: nothing is written', async () => {
    const { repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    await expect(target.apply(publishing())).rejects.toThrow('is not valid JSON');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe('{"lastRun": ');
    expect(git.commits).toEqual([]);
  });

  it('refuses a change of the state that would lose a hold: nothing is written', async () => {
    const { repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify({ lastRun: null, holds: [{ at: '2026-10-04T04:30:00.000Z', categories: [], reasons: ['G2_BODY_LENGTH'] }], corrections: [] })}\n`);
    const before = read(repoDir, STATE);
    await expect(target.apply(publishing({ state: (state: DeskState) => ({ ...state, holds: [] }) }))).rejects.toThrow('never loses a hold');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(read(repoDir, STATE)).toBe(before);
    expect(git.commits).toEqual([]);
  });

  it('puts everything back when the commit fails: the new files are removed and the desk state is what it was, byte for byte', async () => {
    const { repoDir, git, target } = setup();
    git.failNextCommit = new Error('git commit failed: disk full');
    await expect(target.apply(publishing())).rejects.toThrow('disk full');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    // And the next try is not in the way of itself.
    await expect(target.apply(publishing())).resolves.toMatchObject({ files: [NEWS, LEDGER, STATE] });
  });

  it('keeps the holds that are there when it records a hold', async () => {
    const { repoDir, target } = setup();
    const hold = { at: '2026-10-05T04:32:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'] };
    await target.apply({ state: (state) => addHold(state, hold), message: 'desk: hold 1' });
    await target.apply({ state: (state) => addHold(state, { ...hold, reasons: ['G4_NUMBER_UNSUPPORTED'] }), message: 'desk: hold 2' });
    expect((await readDeskState(path.join(repoDir, STATE))).holds.map((item) => item.reasons)).toEqual([['TIER2_ATTRIBUTION'], ['G4_NUMBER_UNSUPPORTED']]);
  });
});

describe('SiteTarget.apply with the real git', () => {
  const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();

  function repo(): string {
    const dir = makeSite(scratch());
    git(dir, 'init', '--quiet', '-b', 'main');
    git(dir, 'config', 'user.name', 'Test Committer');
    git(dir, 'config', 'user.email', 'committer@example.com');
    git(dir, 'config', 'commit.gpgsign', 'false');
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'start');
    return dir;
  }

  it('makes one commit with the three files and the trailer, and leaves the checkout clean', async () => {
    const dir = repo();
    const result = await new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing());
    expect(result.commit).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([LEDGER, NEWS, STATE]);
    expect(git(dir, 'log', '-1', '--format=%B')).toBe(`desk: publish fixture-piece\n\n${COMMIT_TRAILER}`);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('refuses when the desk state has a change that is not committed, and changes nothing', async () => {
    const dir = repo();
    writeFileSync(path.join(dir, STATE), '{"lastRun":null,"holds":[],"corrections":[]} \n');
    await expect(new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing())).rejects.toThrow('has changes that are not committed');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
    expect(existsSync(path.join(dir, NEWS))).toBe(false);
  });

  it('puts the checkout back when git refuses the commit (something else is staged)', async () => {
    const dir = repo();
    writeFileSync(path.join(dir, 'elsewhere.txt'), 'staged\n');
    git(dir, 'add', 'elsewhere.txt');
    await expect(new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing())).rejects.toThrow('elsewhere.txt');
    expect(existsSync(path.join(dir, NEWS))).toBe(false);
    expect(read(dir, STATE)).toBe(COMMITTED_STATE);
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });
});

describe('DryTarget.apply', () => {
  it('writes nothing: the folders and the desk state are as they were', async () => {
    const repoDir = makeSite(scratch());
    const before = filesBelow(repoDir);
    const target = new DryTarget(repoDir);
    const result = await target.apply(publishing());
    expect(filesBelow(repoDir)).toEqual(before);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(target.dry).toBe(true);
    expect(result).toEqual({ commit: null, files: [NEWS, LEDGER, STATE] });
  });

  it('says which files it would have written, as the site target does, with no piece too', async () => {
    const repoDir = makeSite(scratch());
    expect((await new DryTarget(repoDir).apply({ state: (state) => state, message: 'x' })).files).toEqual([STATE]);
  });

  it('refuses what the site target refuses before it writes: a slug that is taken, a slug that is not plain, a desk state that cannot be read, a change that loses a hold', async () => {
    const repoDir = makeSite(scratch());
    const target = new DryTarget(repoDir);
    await expect(target.apply(publishing({ piece: { ...PIECE, slug: '../x' } }))).rejects.toThrow('is not a plain slug');
    writeFileSync(path.join(repoDir, LEDGER), 'taken\n');
    await expect(target.apply(publishing())).rejects.toThrow('is already there');
    rmSync(path.join(repoDir, LEDGER));
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify({ lastRun: null, holds: [{ at: '2026-10-04T04:30:00.000Z', categories: [], reasons: ['x'] }], corrections: [] })}\n`);
    await expect(target.apply(publishing({ state: (state: DeskState) => ({ ...state, holds: [] }) }))).rejects.toThrow('never loses a hold');
    writeFileSync(path.join(repoDir, STATE), 'nonsense');
    await expect(target.apply(publishing())).rejects.toThrow('is not valid JSON');
  });

  it('needs the folders of a site: in a folder that is not one it fails, as a run in the wrong place should', async () => {
    const empty = scratch();
    mkdirSync(path.join(empty, 'site'), { recursive: true });
    await expect(new DryTarget(empty).apply(publishing())).rejects.toThrow('does not exist');
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/target.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/target'`

- [ ] **Step 4: Write the targets**

**Create `desk/src/run/target.ts`:**
```ts
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { writeFileAtomic } from './atomic';
import { assertNothingLost, readDeskState, updateDeskState } from './desk-state';
import type { GitTarget } from './git';

// Where a run puts what it made. A run changes the site in one way: it may add a piece (an `.mdx` file and a ledger `.json` file with the
// same slug) and it changes the desk state, and all of that goes into one commit. A `PublishTarget` is that, so that the stages do not know
// whether they are writing to the real checkout of the site or only going through the motions. `SiteTarget` writes and commits; `DryTarget`
// runs the same checks and writes nothing (a dry run, `desk run --dry`).

/** The folders and the files of the site that the Desk uses, as paths below the repository (the folder of the site is `site`). */
export interface SitePaths {
  newsDir: string;
  ledgerDir: string;
  stateFile: string;
  newsFile(slug: string): string;
  ledgerFile(slug: string): string;
}

export function sitePaths(siteDir = 'site'): SitePaths {
  const newsDir = `${siteDir}/src/content/news`;
  const ledgerDir = `${siteDir}/src/content/ledger`;
  return {
    newsDir,
    ledgerDir,
    stateFile: `${siteDir}/src/data/desk-state.json`,
    newsFile: (slug) => `${newsDir}/${slug}.mdx`,
    ledgerFile: (slug) => `${ledgerDir}/${slug}.json`,
  };
}

/** The two files of a piece: the text of the `.mdx` file and the text of the ledger, as they are written, byte for byte. */
export interface PieceFiles {
  slug: string;
  mdx: string;
  ledger: string;
}

/** What a run changes: a piece, when it published one; the change of the desk state; and the subject of the commit. */
export interface TargetChange {
  piece?: PieceFiles;
  state: (state: DeskState) => DeskState;
  message: string;
}

/** What was done: the id of the commit (null when nothing was written) and the files the change covers, as paths below the repository. */
export interface TargetResult {
  commit: string | null;
  files: string[];
}

export interface PublishTarget {
  /** True for a target that writes nothing. */
  readonly dry: boolean;
  /**
   * Write the piece (if there is one), change the desk state and commit it all. Refuses, before anything is written, when the slug is taken,
   * when the places it writes to have changes that are not committed, or when the desk state cannot be read or the change would lose a hold or a
   * correction.
   */
  apply(change: TargetChange): Promise<TargetResult>;
}

/** A slug is a file name, so it is held to the shape that the renderer and the gate give every slug: nothing that could name another folder. */
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * What both targets check before anything is written, and what the change covers: the slug is plain and not taken, the desk state can be read, and the
 * change does not lose anything from it. Returns the files of the change, as paths below the repository, the piece first.
 */
async function check(repoDir: string, paths: SitePaths, change: TargetChange): Promise<string[]> {
  const files: string[] = [];
  if (change.piece !== undefined) {
    const { slug } = change.piece;
    if (!PLAIN_SLUG.test(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    for (const file of [paths.newsFile(slug), paths.ledgerFile(slug)]) {
      if (await exists(path.join(repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
      files.push(file);
    }
  }
  const before = await readDeskState(path.join(repoDir, paths.stateFile));
  assertNothingLost(before, change.state(structuredClone(before)), paths.stateFile);
  files.push(paths.stateFile);
  return files;
}

/** Writes into a checkout of the site and commits with git. */
export class SiteTarget implements PublishTarget {
  readonly dry = false;
  private readonly paths: SitePaths;

  constructor(
    private readonly repoDir: string,
    private readonly git: GitTarget,
    siteDir = 'site',
  ) {
    this.paths = sitePaths(siteDir);
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    const files = await check(this.repoDir, this.paths, change);

    // What the run is about to change must have nothing else of anyone's in it: git is asked before anything is written.
    const watched = change.piece === undefined ? [this.paths.stateFile] : [this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir];
    if (!(await this.git.isClean(watched))) {
      throw new Error(`the site has changes that are not committed (${watched.join(', ')}), so the Desk does not write there: commit or discard them first`);
    }

    const stateFile = path.join(this.repoDir, this.paths.stateFile);
    const original = await readFile(stateFile, 'utf8');
    const written: string[] = [];
    try {
      await updateDeskState(stateFile, change.state);
      if (change.piece !== undefined) {
        const { slug, mdx, ledger } = change.piece;
        for (const [file, text] of [
          [this.paths.newsFile(slug), mdx],
          [this.paths.ledgerFile(slug), ledger],
        ] as const) {
          await writeFileAtomic(path.join(this.repoDir, file), text);
          written.push(file);
        }
      }
      return { commit: await this.git.commit(files, change.message), files };
    } catch (error) {
      // A commit that fails leaves the checkout as it was found: the new files are removed and the desk state is put back.
      for (const file of written) await rm(path.join(this.repoDir, file), { force: true });
      await writeFileAtomic(stateFile, original);
      throw error;
    }
  }
}

/** Goes through the checks of `SiteTarget` that need no git and writes nothing, so that a dry run says what a real run would have done. */
export class DryTarget implements PublishTarget {
  readonly dry = true;
  private readonly paths: SitePaths;

  constructor(
    private readonly repoDir: string,
    siteDir = 'site',
  ) {
    this.paths = sitePaths(siteDir);
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/run/target.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the failing test of the stage**

**Create `desk/test/stages/publish.test.ts`:**
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEntry, NewsFrontmatter, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { Claim, DeskState } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runPublish } from '../../src/stages/publish';
import type { VerifyResult } from '../../src/stages/verify';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { stageContext, useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// Publish is the last step of a piece that the gate and the verifier cleared. It writes what the renderer gives and nothing else: the
// two files of the piece, written byte for byte, the record of the run in the desk state, and one commit. These tests start from the golden
// piece of the gate, which every check clears, and from a target in a made-up checkout of the site.

const scratch = useScratch();
const RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };
const SLUG = GOLDEN_DRAFT.slug;
const NEWS = sitePaths().newsFile(SLUG);
const LEDGER = sitePaths().ledgerFile(SLUG);
const STATE = sitePaths().stateFile;

const VERIFIER = { model: 'model-a', passed: true, notes: ['Judged every fact sentence and every heading; every one was supported.'] };

/** What Verify hands on for the golden piece: cleared by the gate and by the model check. */
function cleared(): VerifyResult {
  const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
  expect(gate.route).toBe('publish');
  return { outcome: 'publish', draft: GOLDEN_DRAFT, gate, verifier: VERIFIER, rounds: 0, history: [] };
}

function setup() {
  const made = stageContext(scratch);
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, target: new SiteTarget(repoDir, git) };
}

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** What the renderer gives for the cleared piece. */
function rendered(verified: VerifyResult = cleared()) {
  return renderDraft(verified.draft, GOLDEN_CLAIMS, { runId: RUN.runId, gate: verified.gate, verifier: verified.verifier, release: 'auto' });
}

describe('runPublish', () => {
  it('writes the piece and its ledger exactly as the renderer gives them, with the ledger as JSON with two-space indents and a final newline', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const expected = rendered();
    expect(read(repoDir, NEWS)).toBe(expected.mdx);
    expect(read(repoDir, LEDGER)).toBe(`${JSON.stringify(expected.ledger, null, 2)}\n`);
  });

  it('writes a ledger that the site accepts and that says how the piece came out: released by the gate, the run, and the verdict of the model check', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const ledger = LedgerEntry.parse(JSON.parse(read(repoDir, LEDGER)));
    expect(ledger.release).toBe('auto');
    expect(ledger.runId).toBe(RUN.runId);
    expect(ledger.verifier).toEqual(VERIFIER);
    expect(ledger.gate.route).toBe('publish');
    expect(read(repoDir, NEWS)).not.toContain('updatedAt');
  });

  it('writes a piece that the build of the site accepts: the front matter is valid, and the body, the title and the description are what the ledger renders', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const mdx = read(repoDir, NEWS);
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(mdx);
    if (match === null) throw new Error('the piece has no front matter');
    const data = NewsFrontmatter.parse(parse(match[1] as string));
    const ledger = LedgerEntry.parse(JSON.parse(read(repoDir, LEDGER)));
    const state = await readDeskState(path.join(repoDir, STATE));
    const matched = matchPieces([{ id: SLUG, data, body: match[2] as string }], [{ id: SLUG, data: ledger }], state.corrections);
    expect(matched.map((piece) => piece.slug)).toEqual([SLUG]);
  });

  it('records the run in the desk state and keeps what was there', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const state: DeskState = await readDeskState(path.join(repoDir, STATE));
    expect(state).toEqual({ lastRun: { at: RUN.at, outcome: 'published', runId: RUN.runId, slug: SLUG }, holds: [], corrections: [] });
  });

  it('commits the piece, the ledger and the desk state in one commit, and returns its id with the files', async () => {
    const { ctx, git, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(git.commits).toEqual([{ id: result.commit, paths: [NEWS, LEDGER, STATE], message: `desk: publish ${SLUG}` }]);
    expect(result.slug).toBe(SLUG);
    expect(result.files).toEqual([NEWS, LEDGER, STATE]);
    expect(result.mdx).toBe(rendered().mdx);
    expect(result.ledger).toEqual(rendered().ledger);
  });

  it('logs what it did', async () => {
    const { ctx, logs, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(logs).toEqual([`publish: ${SLUG} written and committed as ${(result.commit as string).slice(0, 7)}`]);
  });

  it('refuses a slug that is taken, and changes nothing', async () => {
    const { ctx, repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, NEWS), 'an older piece\n');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('is already there');
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });

  it('refuses a checkout that has uncommitted changes where it would write, and changes nothing', async () => {
    const { ctx, repoDir, git, target } = setup();
    git.dirty.add(STATE);
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('has changes that are not committed');
    expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });

  it('puts everything back when the commit fails', async () => {
    const { ctx, repoDir, git, target } = setup();
    git.failNextCommit = new Error('git commit failed: the index is locked');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('the index is locked');
    expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
  });

  it('writes nothing for a dry run, and says so: no commit, the files it would have written, and a line in the log', async () => {
    const { ctx, logs, repoDir } = setup();
    const before = filesBelow(repoDir);
    const result = await runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN);
    expect(filesBelow(repoDir)).toEqual(before);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(result.commit).toBeNull();
    expect(result.files).toEqual([NEWS, LEDGER, STATE]);
    expect(result.mdx).toBe(rendered().mdx);
    expect(logs).toEqual([`publish: ${SLUG} would be written (dry run: nothing was written)`]);
  });

  it('a dry run is refused for the reasons a real run is: the slug is taken', async () => {
    const { ctx, repoDir } = setup();
    writeFileSync(path.join(repoDir, LEDGER), '{}\n');
    await expect(runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('is already there');
  });

  it('does not publish a verdict that says hold', async () => {
    const { ctx, repoDir, git, target } = setup();
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), outcome: 'hold' }, RUN)).rejects.toThrow('runPublish needs a piece that Verify cleared');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });

  it('does not trust the word publish: a gate that did not clear the piece, or a model check that did not pass, stops it', async () => {
    const { ctx, git, target } = setup();
    const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'hold', holdReasons: ['TIER2_ATTRIBUTION'] } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'revise' } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), verifier: { ...VERIFIER, passed: false } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(git.commits).toEqual([]);
  });

  it('does not publish a piece that cites another outlet: the gate holds it, and so do both a verdict of hold and one that wrongly says publish', async () => {
    const { ctx, repoDir, git, target } = setup();
    const variant = makeTier2Variant({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
    const gate = runGate(variant, defaultContext());
    expect(gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    const held: VerifyResult = { outcome: 'hold', draft: variant.draft, gate, verifier: VERIFIER, rounds: 0, history: [] };
    await expect(runPublish(ctx, target, variant.claims, held, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, variant.claims, { ...held, outcome: 'publish' }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });

  it('writes nothing when the piece cannot be rendered: a sentence cites a claim that was not given', async () => {
    const { ctx, repoDir, git, target } = setup();
    const claims: Claim[] = GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-1');
    await expect(runPublish(ctx, target, claims, cleared(), RUN)).rejects.toThrow('a sentence cites c-1, but no claim has that id');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/stages/publish.test.ts`
Expected: FAIL — `Cannot find module '../../src/stages/publish'`

- [ ] **Step 6: Write the stage**

**Create `desk/src/stages/publish.ts`:**
```ts
import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { recordRun } from '../index';
import type { PublishTarget } from '../index';
import type { StageContext } from './context';
import type { VerifyResult } from './verify';

// Stage 7, Publish: put a piece that the gate and the verifier cleared on the site. Everything that reaches the site passes through
// `renderDraft` of the gate package: the Desk writes no text of its own into a piece. The stage writes the two files that the renderer gives,
// byte for byte, records the run in the desk state, and commits the three files in one commit; where they are written is the target's business
// (`SiteTarget` writes and commits, `DryTarget` writes nothing). Nothing is pushed: that is for the daily workflow of a later plan.

/** The run that is publishing: its id, and the moment it is recording, as an ISO time. */
export interface PublishRun {
  runId: string;
  at: string;
}

export interface PublishResult {
  slug: string;
  /** The text of the `.mdx` file, as written (or as it would have been written). */
  mdx: string;
  ledger: LedgerEntry;
  /** The id of the commit; null for a dry run. */
  commit: string | null;
  /** The files of the commit, as paths below the repository. */
  files: string[];
}

/**
 * Publish the piece that `verified` says is clear, written from `claims`.
 *
 * The stage does not take Verify's word alone: it refuses unless the outcome is `publish` and the gate's route is `publish` and the model check passed,
 * so a piece that cites another outlet (the gate holds it) or one that was not cleared cannot get here by a wrong label. The piece is rendered with
 * `release: 'auto'` (nobody released it: the gate cleared it) and no `updatedAt` (it has never been corrected). The ledger is checked against the schema
 * that the site uses before anything is written, because the site refuses to build a piece with a ledger it cannot read.
 *
 * The target refuses, before it writes, a slug that is taken and a checkout with uncommitted changes where the files go; and puts everything back
 * if the commit fails. Whatever it throws ends the run.
 */
export async function runPublish(ctx: Pick<StageContext, 'log'>, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: PublishRun): Promise<PublishResult> {
  if (verified.outcome !== 'publish' || verified.gate.route !== 'publish' || !verified.verifier.passed) {
    throw new Error('runPublish needs a piece that Verify cleared: the outcome and the route of the gate must be publish, and the model check must have passed');
  }
  const { mdx, ledger } = renderDraft(verified.draft, claims, { runId: run.runId, gate: verified.gate, verifier: verified.verifier, release: 'auto' });
  const checked = LedgerEntry.safeParse(ledger);
  if (!checked.success) throw new Error(`runPublish: the ledger of the piece is not one the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  const slug = verified.draft.slug;

  const result = await target.apply({
    piece: { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` },
    state: (state) => recordRun(state, { at: run.at, outcome: 'published', runId: run.runId, slug }),
    message: `desk: publish ${slug}`,
  });
  ctx.log(result.commit === null ? `publish: ${slug} would be written (dry run: nothing was written)` : `publish: ${slug} written and committed as ${result.commit.slice(0, 7)}`);
  return { slug, mdx, ledger, commit: result.commit, files: result.files };
}
```

Run: `npm test --workspace @robywire/desk -- test/stages/publish.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 7: Write the failing test of the entry point**

The targets are a layer below the stages, so they are exported by the entry point. The stage is not.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  ParsedFeed,
  ParsedRobots,
  RateLimiterOptions,
  RobotsGroup,
  RobotsRule,
  SelectArtifact,
  SourceKind,
  Tier2Feed,
  Transport,
```

**with:**
```ts
  ParsedFeed,
  ParsedRobots,
  PieceFiles,
  PublishTarget,
  RateLimiterOptions,
  RobotsGroup,
  RobotsRule,
  SelectArtifact,
  SitePaths,
  SourceKind,
  TargetChange,
  TargetResult,
  Tier2Feed,
  Transport,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'GitCli',
  'FakeGit',
];

```

**with:**
```ts
  'GitCli',
  'FakeGit',
  'assertNothingLost',
  'sitePaths',
  'SiteTarget',
  'DryTarget',
];

```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      GitCliOptions,
      FakeCommit,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      GitCliOptions,
      FakeCommit,
      SitePaths,
      PieceFiles,
      TargetChange,
      TargetResult,
      PublishTarget,
    ];
    const nothing: Exported | undefined = undefined;
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision]) {
      expect(entry).not.toHaveProperty(name);
    }
```

**with:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication]) {
      expect(entry).not.toHaveProperty(name);
    }
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: FAIL — `to have property "sitePaths"`

- [ ] **Step 8: Export the targets**

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/desk-state';
export * from './run/git';
export * from './sources';
```

**with:**
```ts
export * from './run/desk-state';
export * from './run/git';
export * from './run/target';
export * from './sources';
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 10: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add desk/src/run/desk-state.ts desk/src/run/target.ts desk/src/stages/publish.ts desk/src/index.ts desk/test/run/desk-state.test.ts desk/test/run/target.test.ts desk/test/stages/publish.test.ts desk/test/support/site.ts desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the Publish stage: a piece that the gate and the verifier cleared, written as the renderer gives it into the site and committed with the record of the run, or, in a dry run, written nowhere" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 32: The Hold stage

**Files:**
- Create: `desk/src/stages/hold.ts` (`HoldRun`, `HoldResult`, `holdReasonsOf`, `runHold`)
- Modify: `desk/src/run/artifacts.ts` (`HeldArtifact`, and `writeJsonFile`, which `writeArtifact` now uses)
- Modify: `desk/src/run/target.ts` (`isPlainSlug`)
- Modify: `gate/src/constants.ts` (`VERIFIER_REASONS`)
- Modify: `site/src/lib/reasons.ts` (a label for each reason of the model check)
- Modify: `gate/test/constants.test.ts`, `site/test/reasons.test.ts`, `desk/test/run/artifacts.test.ts`, `desk/test/run/target.test.ts`, `desk/test/fetch/exports.test.ts`
- Test: `desk/test/stages/hold.test.ts`

The other way out of Verify. A draft that cannot be published by itself is held: the gate sends back a check that is still failing after the rounds of revision, or the piece cites another outlet (`TIER2_ATTRIBUTION`), or the model check does not clear it. A hold is the Desk saying *not by myself*, and it has three parts.

1. **The draft is kept for the owner.** `held/<slug>.json` in the folder of the run holds the last draft, the claims it cites, what the gate and the model check said of it, every pass that led there and the reasons (`HeldArtifact`, checked against its schema as every artifact is). It has what the owner needs to read the piece and, in a later plan, to release it. It is written first and is kept even if the desk state then cannot be changed, because a refusal must never lose a draft. A dry run writes it too, like every other artifact of a run.
2. **The desk state says that a draft was held**, with its categories and its reasons as codes, and records the run as held; the one commit of the run holds that file alone (the target of Task 31 does it). The site's page of holds shows each code with a plain-English label, and never the held text.
3. **Nothing reaches the pages of the site.** No piece, no ledger. The tests check the folders.

**The reasons are real codes** (`holdReasonsOf`): the codes of the failures of the gate on the last draft, in the order the gate found them; then the gate's hold reasons; then what the model check said of the last draft, each failure under one of four reasons, each once. The reasons of the model check are new: `G10_NOT_ENTAILED` (the passages do not entail a sentence or a heading), `G10_AMBIGUOUS` (the verifier could not tell), `G10_LABEL_UNSUPPORTED` (the basis or the status of a claim is not supported by its passage) and `G10_NOT_JUDGED` (the verifier gave no verdict). They live in the gate package next to the other codes (`VERIFIER_REASONS`), so that the site and the Desk read one list, and the site's `reasons.test.ts` fails when a reason has no label, as it does for every code of the gate. An earlier draft, which the composer rewrote, is not why the last one is held. A hold with no reason is refused: the owner could not read what it says.

**What the stage refuses:** a piece that Verify did not hold, a slug that is not a plain slug (the slug is a file name; `isPlainSlug` is the same test the target of Task 31 makes), and a hold with no reason. **The tests get their verdicts from the real stages.** A composer and a verifier that go wrong in each way that a hold is for are scripted into a `FakeClient`, and Compose and Verify turn the scripts into the verdicts that `runHold` is given: a piece that cites another outlet, a number that is never mended, a verifier that says ambiguous, a label that is not supported, and a verdict that is missing.

- [ ] **Step 1: Write the failing test of the reasons of the model check**

**In `gate/test/constants.test.ts`, replace:**
```ts
  SAFE_BASES,
  STATUSES,
} from '../src/constants';

describe('closed vocabularies', () => {
```

**with:**
```ts
  SAFE_BASES,
  STATUSES,
  VERIFIER_REASONS,
} from '../src/constants';
import { ALL_FAILURE_CODES, HOLD_REASONS } from '../src/checks';

describe('closed vocabularies', () => {
```

**In `gate/test/constants.test.ts`, replace:**
```ts
  });

  it('names the two ways a piece comes to be published', () => {
    expect(RELEASES).toEqual(['auto', 'owner']);
```

**with:**
```ts
  });

  it('names the four reasons the model check gives for a hold, each a G10 code of its own and none a code of G1 to G9 or a hold reason of the gate', () => {
    expect(VERIFIER_REASONS).toEqual(['G10_NOT_ENTAILED', 'G10_AMBIGUOUS', 'G10_LABEL_UNSUPPORTED', 'G10_NOT_JUDGED']);
    for (const reason of VERIFIER_REASONS) {
      expect(reason).toMatch(/^G10_[A-Z_]+$/);
      expect(ALL_FAILURE_CODES).not.toContain(reason);
      expect(HOLD_REASONS as readonly string[]).not.toContain(reason);
    }
  });

  it('names the two ways a piece comes to be published', () => {
    expect(RELEASES).toEqual(['auto', 'owner']);
```

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts`
Expected: FAIL — `expected undefined to deeply equal`

- [ ] **Step 2: Add the reasons to the gate package**

**In `gate/src/constants.ts`, replace:**
```ts
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const CORRECTION_KINDS = ['correction', 'retraction'] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];
```

**with:**
```ts
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/**
 * Why the model check (G10, which the Desk runs and the gate does not) held a piece, as the Desk records it in a hold, beside the failure
 * codes and the hold reasons of the gate: a sentence or a heading the passages do not entail, one the verifier could not judge, a claim whose basis
 * or status its passage does not support, and an item the verifier gave no verdict on. The site gives each a label, and a test there fails if one has none.
 */
export const VERIFIER_REASONS = ['G10_NOT_ENTAILED', 'G10_AMBIGUOUS', 'G10_LABEL_UNSUPPORTED', 'G10_NOT_JUDGED'] as const;
export type VerifierReason = (typeof VERIFIER_REASONS)[number];

export const CORRECTION_KINDS = ['correction', 'retraction'] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];
```

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing test of the labels**

**In `site/test/reasons.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, HOLD_REASONS } from '@robywire/gate';
import { REASON_LABELS, reasonLabel } from '../src/lib/reasons';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS } from '@robywire/gate';
import { REASON_LABELS, reasonLabel } from '../src/lib/reasons';

```

**In `site/test/reasons.test.ts`, replace:**
```ts
  });

  it('has no label for a code that does not exist, so a removed code does not leave a stale label', () => {
    const known = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS]);
    const stale = Object.keys(REASON_LABELS).filter((code) => !known.has(code));
    expect(stale).toEqual([]);
```

**with:**
```ts
  });

  it('has a label for every reason the model check can give for a hold', () => {
    const missing = VERIFIER_REASONS.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has no label for a code that does not exist, so a removed code does not leave a stale label', () => {
    const known = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS, ...VERIFIER_REASONS]);
    const stale = Object.keys(REASON_LABELS).filter((code) => !known.has(code));
    expect(stale).toEqual([]);
```

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every reason the model check can give for a hold`

- [ ] **Step 4: Write the labels**

Each label is a short plain phrase, as the test of the labels requires: it starts with a capital letter, does not end in a full stop, is at most 70 characters and does not repeat the code.

**In `site/src/lib/reasons.ts`, replace:**
```ts
// Plain words for the codes the gate reports. The holds page shows a label
// beside each code. site/test/reasons.test.ts fails when the gate gains a
// failure code or a hold reason that has no label here.

export const REASON_LABELS: Readonly<Record<string, string>> = {
```

**with:**
```ts
// Plain words for the codes the gate reports, and for the reasons the model
// check gives (VERIFIER_REASONS of the gate package). The holds page shows a
// label beside each code. site/test/reasons.test.ts fails when the gate gains a
// failure code or a hold reason, or the model check a reason, that has no label here.

export const REASON_LABELS: Readonly<Record<string, string>> = {
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G9_BANNED_PHRASE: 'A banned filler phrase was used',
  TIER2_ATTRIBUTION: "Rests on another outlet's reporting",
};

```

**with:**
```ts
  G9_BANNED_PHRASE: 'A banned filler phrase was used',
  TIER2_ATTRIBUTION: "Rests on another outlet's reporting",
  G10_NOT_ENTAILED: 'A sentence said more than its sources say',
  G10_AMBIGUOUS: 'The model check could not tell if a sentence was supported',
  G10_LABEL_UNSUPPORTED: 'A claim carried a basis or status its source does not support',
  G10_NOT_JUDGED: 'The model check gave no verdict on a sentence',
};

```

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the failing tests of the held artifact, of the slug test and of the entry point**

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, SelectArtifact, VerifyArtifact, candidateId, readArtifact, runPath, writeArtifact } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { RUN_DATE, candidate } from '../support/candidates';
```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, SelectArtifact, VerifyArtifact, candidateId, readArtifact, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { RUN_DATE, candidate } from '../support/candidates';
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
});

/** What parsing `value` with `schema` reports, or '' if it is valid. */
const problem = (schema: z.ZodType, value: unknown): string => {
```

**with:**
```ts
});

const heldArtifact = (): HeldArtifact => {
  const { date, rounds, gate, verifier, history } = verifyArtifact();
  return { date, slug: GOLDEN_DRAFT.slug, runId: '2026-10-05-043100', reasons: ['G4_NUMBER_UNSUPPORTED'], draft: structuredClone(GOLDEN_DRAFT), claims: structuredClone(GOLDEN_CLAIMS.slice(0, 3)), rounds, gate, verifier, history };
};

/** What parsing `value` with `schema` reports, or '' if it is valid. */
const problem = (schema: z.ZodType, value: unknown): string => {
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
});

describe('writeArtifact', () => {
  it('writes the artifact as JSON with two-space indents, sorted keys and a final newline', async () => {
```

**with:**
```ts
});

describe('HeldArtifact', () => {
  it('accepts a held draft with the reasons for the hold, the claims it cites and every pass that led there', () => {
    expect(problem(HeldArtifact, heldArtifact())).toBe('');
    expect(problem(HeldArtifact, { ...heldArtifact(), reasons: ['TIER2_ATTRIBUTION', 'G10_NOT_ENTAILED'], claims: [] })).toBe('');
  });

  it('accepts a draft that was held at once, with one pass and no revision', () => {
    const { history, ...rest } = heldArtifact();
    expect(problem(HeldArtifact, { ...rest, rounds: 0, history: [{ ...history[1], round: 0 }] })).toBe('');
  });

  it('refuses a hold with no reason, or with an empty one', () => {
    expect(problem(HeldArtifact, { ...heldArtifact(), reasons: [] })).not.toBe('');
    expect(problem(HeldArtifact, { ...heldArtifact(), reasons: [''] })).toContain('reasons.0:');
  });

  it('refuses a history that does not fit the rounds, or is not numbered in order, as the record of the verification does', () => {
    expect(problem(HeldArtifact, { ...heldArtifact(), rounds: 3 })).toBe('history: there must be one pass for the draft of the composer and one for each revision round');
    expect(problem(HeldArtifact, { ...heldArtifact(), history: [...heldArtifact().history].reverse() })).toBe('history: the passes must be numbered 0, 1, 2 and so on, in order');
  });

  it('refuses a draft or a claim that is not valid, an empty slug or run id, and a field it does not know', () => {
    expect(problem(HeldArtifact, { ...heldArtifact(), draft: { ...structuredClone(GOLDEN_DRAFT), slug: 'Not A Slug' } })).toBe('draft.slug: slug must be lowercase kebab-case');
    expect(problem(HeldArtifact, { ...heldArtifact(), claims: [{ id: 'c-1' }] })).toContain('claims.0.');
    expect(problem(HeldArtifact, { ...heldArtifact(), slug: '' })).toContain('slug:');
    expect(problem(HeldArtifact, { ...heldArtifact(), runId: '' })).toContain('runId:');
    expect(problem(HeldArtifact, { ...heldArtifact(), note: 'x' })).toBe(': Unrecognized key: "note"');
  });
});

describe('writeJsonFile', () => {
  it('writes a value to the file it is given in the form of an artifact: sorted keys, two-space indents, a final newline', async () => {
    const file = path.join(freshDir(), 'held', 'a-piece.json');
    await writeJsonFile(file, 'the held draft', { b: 1, a: { d: 2, c: 3 } }, z.object({ a: z.object({ c: z.number(), d: z.number() }), b: z.number() }));
    expect(readFileSync(file, 'utf8')).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });

  it('writes nothing for a value that does not match, and names the file in the error', async () => {
    const file = path.join(freshDir(), 'held', 'a-piece.json');
    await expect(writeJsonFile(file, 'the held draft a-piece.json', { a: 'x' }, z.object({ a: z.number() }))).rejects.toThrow('the held draft a-piece.json does not match its schema: a:');
    expect(existsSync(path.dirname(file))).toBe(false);
  });
});

describe('writeArtifact', () => {
  it('writes the artifact as JSON with two-space indents, sorted keys and a final newline', async () => {
```

**In `desk/test/run/target.test.ts`, replace:**
```ts
import type { LastRun } from '../../src/run/desk-state';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import type { TargetChange } from '../../src/run/target';
import { useScratch } from '../support/context';
```

**with:**
```ts
import type { LastRun } from '../../src/run/desk-state';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { DryTarget, SiteTarget, isPlainSlug, sitePaths } from '../../src/run/target';
import type { TargetChange } from '../../src/run/target';
import { useScratch } from '../support/context';
```

**In `desk/test/run/target.test.ts`, replace:**
```ts
});

describe('SiteTarget.apply', () => {
  it('writes the piece and the ledger exactly as given, changes the desk state, and commits the three files with the message', async () => {
```

**with:**
```ts
});

describe('isPlainSlug', () => {
  it('accepts lowercase letters and digits joined by single hyphens', () => {
    for (const slug of ['a', '7', 'fx-1', 'fixture-robotics-ships-fx-1-to-second-plant', '2026-10-05']) expect(isPlainSlug(slug), slug).toBe(true);
  });

  it('refuses anything else: capitals, spaces, dots, slashes, a hyphen at either end or twice, and nothing', () => {
    for (const slug of ['', 'A', 'a b', 'a.b', 'a/b', '../a', '-a', 'a-', 'a--b', 'a_b', `caf${String.fromCharCode(0xe9)}`]) expect(isPlainSlug(slug), slug).toBe(false);
  });
});

describe('SiteTarget.apply', () => {
  it('writes the piece and the ledger exactly as given, changes the desk state, and commits the three files with the message', async () => {
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  GitCliOptions,
  GitTarget,
  HttpFetcherOptions,
  Hold,
```

**with:**
```ts
  GitCliOptions,
  GitTarget,
  HeldArtifact,
  HttpFetcherOptions,
  Hold,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'ComposeArtifact',
  'VerifyArtifact',
  'runPath',
  'writeArtifact',
```

**with:**
```ts
  'ComposeArtifact',
  'VerifyArtifact',
  'HeldArtifact',
  'writeJsonFile',
  'runPath',
  'writeArtifact',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'SiteTarget',
  'DryTarget',
];

```

**with:**
```ts
  'SiteTarget',
  'DryTarget',
  'isPlainSlug',
];

```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      ComposeArtifact,
      VerifyArtifact,
      ParsedRobots,
      RobotsRule,
```

**with:**
```ts
      ComposeArtifact,
      VerifyArtifact,
      HeldArtifact,
      ParsedRobots,
      RobotsRule,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication]) {
      expect(entry).not.toHaveProperty(name);
```

**with:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication]) {
      expect(entry).not.toHaveProperty(name);
```

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts test/run/target.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `to have property "HeldArtifact"`

- [ ] **Step 6: Write the held artifact and the slug test**

`writeArtifact` keeps its behaviour and its messages; the part that checks a value and writes it is now `writeJsonFile`, because the held draft is a file of the same form that is not named like a stage. The check that a record of a verification has one pass for the first draft and one for each round, in order, is shared by `VerifyArtifact` and `HeldArtifact`.

**In `desk/src/run/artifacts.ts`, replace:**
```ts
});

/**
 * What the Verify stage decided: `publish` only when the gate cleared the last draft and the model check passed, otherwise `hold`; how many
```

**with:**
```ts
});

/** The two facts about the passes that every record of a verification must have: one for the draft of the composer and one for each revision round, numbered in order. */
function checkHistory(record: { rounds: number; history: readonly { round: number }[] }, context: z.RefinementCtx): void {
  if (record.history.length !== record.rounds + 1) {
    context.addIssue({ code: 'custom', path: ['history'], message: 'there must be one pass for the draft of the composer and one for each revision round' });
  }
  if (record.history.some((pass, at) => pass.round !== at)) {
    context.addIssue({ code: 'custom', path: ['history'], message: 'the passes must be numbered 0, 1, 2 and so on, in order' });
  }
}

/**
 * What the Verify stage decided: `publish` only when the gate cleared the last draft and the model check passed, otherwise `hold`; how many
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
  })
  .superRefine((artifact, context) => {
    if (artifact.history.length !== artifact.rounds + 1) {
      context.addIssue({ code: 'custom', path: ['history'], message: 'there must be one pass for the draft of the composer and one for each revision round' });
    }
    if (artifact.history.some((pass, at) => pass.round !== at)) {
      context.addIssue({ code: 'custom', path: ['history'], message: 'the passes must be numbered 0, 1, 2 and so on, in order' });
    }
    if (artifact.outcome === 'publish' && !(artifact.gate.route === 'publish' && artifact.verifier.passed)) {
      context.addIssue({ code: 'custom', path: ['outcome'], message: 'a piece is published only when the gate says publish and the model check passed' });
```

**with:**
```ts
  })
  .superRefine((artifact, context) => {
    checkHistory(artifact, context);
    if (artifact.outcome === 'publish' && !(artifact.gate.route === 'publish' && artifact.verifier.passed)) {
      context.addIssue({ code: 'custom', path: ['outcome'], message: 'a piece is published only when the gate says publish and the model check passed' });
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
export type VerifyArtifact = z.infer<typeof VerifyArtifact>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
```

**with:**
```ts
export type VerifyArtifact = z.infer<typeof VerifyArtifact>;

/**
 * A draft that was held: what the owner needs to see why, and to release it later without the Desk's help. It is the last draft, the claims
 * it cites, what the gate and the model check said of it and every pass that led there, and the reasons the hold records in the desk state (the codes
 * of the gate's failures, the gate's hold reasons and the reasons of the model check). It is written to `held/<slug>.json` in the folder of the run.
 */
export const HeldArtifact = z
  .strictObject({
    date: isoDate,
    slug: text,
    runId: text,
    reasons: z.array(text).min(1),
    draft: Draft,
    claims: z.array(Claim),
    rounds: z.number().int().nonnegative(),
    gate: GateReport,
    verifier: VerifierRecord,
    history: z.array(VerifyRound).min(1),
  })
  .superRefine(checkHistory);
export type HeldArtifact = z.infer<typeof HeldArtifact>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts

/**
 * Check `value` against `schema` and write it to `<dir>/<name>.json`: JSON with two-space indents, the keys of every
 * object in sorted order (so the same artifact is the same bytes on every run) and a final newline. The write is
 * atomic, and an artifact that does not match its schema is not written at all. Returns the path of the file.
 */
export async function writeArtifact<T>(dir: string, name: string, value: unknown, schema: z.ZodType<T>): Promise<string> {
  const file = fileOf(dir, name);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`the artifact ${name}.json does not match its schema: ${describeIssues(parsed.error)}`);
  // canonicalJson sorts the keys; reading it back and writing it again with indents keeps that order.
  const body = JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2);
  await writeFileAtomic(file, `${body}\n`);
  return file;
}
```

**with:**
```ts

/**
 * Check `value` against `schema` and write it to `file`: JSON with two-space indents, the keys of every object in sorted order (so the same
 * record is the same bytes on every run) and a final newline. The write is atomic, and a value that does not match its schema is not written at all.
 * `label` names the file in the error.
 */
export async function writeJsonFile<T>(file: string, label: string, value: unknown, schema: z.ZodType<T>): Promise<void> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${label} does not match its schema: ${describeIssues(parsed.error)}`);
  // canonicalJson sorts the keys; reading it back and writing it again with indents keeps that order.
  const body = JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2);
  await writeFileAtomic(file, `${body}\n`);
}

/**
 * Write an artifact to `<dir>/<name>.json` (see `writeJsonFile`) and return the path of the file. An artifact that does not match its
 * schema is not written at all, and neither is its folder.
 */
export async function writeArtifact<T>(dir: string, name: string, value: unknown, schema: z.ZodType<T>): Promise<string> {
  const file = fileOf(dir, name);
  await writeJsonFile(file, `the artifact ${name}.json`, value, schema);
  return file;
}
```

**In `desk/src/run/target.ts`, replace:**
```ts
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function exists(file: string): Promise<boolean> {
  try {
```

**with:**
```ts
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `slug` is lowercase letters and digits joined by single hyphens, which is the only kind of slug that is safe as a file name. */
export function isPlainSlug(slug: string): boolean {
  return PLAIN_SLUG.test(slug);
}

async function exists(file: string): Promise<boolean> {
  try {
```

**In `desk/src/run/target.ts`, replace:**
```ts
  if (change.piece !== undefined) {
    const { slug } = change.piece;
    if (!PLAIN_SLUG.test(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    for (const file of [paths.newsFile(slug), paths.ledgerFile(slug)]) {
      if (await exists(path.join(repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
```

**with:**
```ts
  if (change.piece !== undefined) {
    const { slug } = change.piece;
    if (!isPlainSlug(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    for (const file of [paths.newsFile(slug), paths.ledgerFile(slug)]) {
      if (await exists(path.join(repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
```

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts test/run/target.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  3 passed (3)`

- [ ] **Step 7: Write the failing test of the stage**

**Create `desk/test/stages/hold.test.ts`:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS, citedClaims } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import { HeldArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runCompose } from '../../src/stages/compose';
import { holdReasonsOf, runHold } from '../../src/stages/hold';
import { runVerify } from '../../src/stages/verify';
import type { VerifyResult } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { replyFromDraft } from '../support/script';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { verifierReply } from '../support/verifier';

// A hold is the Desk saying "not by myself": the draft, why, and everything the owner needs to look at it later are kept in the folder of the run,
// the desk state says that a draft was held and for which reasons, and nothing reaches the pages of the site. These tests get the verdicts that
// they hold from the real Compose and Verify stages, run on scripts of a composer and a verifier that go wrong in each of the ways that a hold is for.

const scratch = useScratch();
const RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };
const STATE = sitePaths().stateFile;

const INVENTED = (kilograms: number) => ({ kind: 'fact' as const, text: `The datasheet lists a ${kilograms} kg rated payload and a 1.4 m maximum reach.`, claimIds: ['c-8', 'c-9'] });

type Reply = ReturnType<typeof replyFromDraft>;

/**
 * The verdict of Verify on a piece, made by the stages: the composer says `reply` first and then each of `revisions`, and the verifier gives the replies
 * that `verifier` makes from the plan of the first draft (one for each pass that the gate clears; the draft does not change in the tests that script more than one).
 */
async function verdictOn(options: { reply?: Reply; claims?: Claim[]; revisions?: unknown[]; verifier?: (plan: ReturnType<typeof verifyPlanOf>) => unknown[] }) {
  const made = stageContext(scratch);
  const claims = options.claims ?? GOLDEN_CLAIMS;
  made.fake.script('compose', options.reply ?? replyFromDraft(), ...(options.revisions ?? []));
  const composed = await runCompose(made.ctx, claims);
  for (const reply of options.verifier?.(verifyPlanOf(composed.draft, claims)) ?? []) made.fake.script('verify', reply);
  const verified = await runVerify(made.ctx, claims, composed);
  return { ...made, claims, verified };
}

function setup() {
  const made = stageContext(scratch);
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, target: new SiteTarget(repoDir, git) };
}

const heldFile = (runDir: string, slug: string): string => path.join(runDir, 'held', `${slug}.json`);

/** A piece that cites another outlet: the gate holds it for the owner, and the verifier clears it. */
async function tier2() {
  const variant = makeTier2Variant(cloneGolden());
  return verdictOn({ reply: replyFromDraft(variant.draft), claims: variant.claims, verifier: (plan) => [verifierReply(plan)] });
}

describe('holdReasonsOf', () => {
  it('is the codes of the gate failures, then the hold reasons of the gate, then the reasons of the model check, each once and in order', async () => {
    const { verified } = await tier2();
    const base: Pick<VerifyResult, 'gate' | 'verifier' | 'history'> = { gate: verified.gate, verifier: verified.verifier, history: verified.history };
    const failure = (code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing') => ({ id: 's1', kind: 'sentence' as const, code, reason: 'x' });
    const gate = {
      ...base.gate,
      failures: [
        { check: 'G4' as const, code: 'G4_NUMBER_UNSUPPORTED', message: 'm', where: 'w' },
        { check: 'G2' as const, code: 'G2_BODY_LENGTH', message: 'm' },
        { check: 'G4' as const, code: 'G4_NUMBER_UNSUPPORTED', message: 'again', where: 'x' },
      ],
    };
    const history = [{ ...(base.history[0] as VerifyResult['history'][number]), verifierFailures: [failure('ambiguous'), failure('not_entailed'), failure('ambiguous')] }];
    expect(holdReasonsOf({ ...base, gate, history })).toEqual(['G4_NUMBER_UNSUPPORTED', 'G2_BODY_LENGTH', 'TIER2_ATTRIBUTION', 'G10_AMBIGUOUS', 'G10_NOT_ENTAILED']);
  });

  it('names each failure of the model check by one of the reasons of the gate package: not entailed, ambiguous, a label that is not supported, and no verdict', () => {
    const { verifier } = { verifier: { model: 'm', passed: false, notes: ['n'] } };
    const gate = { route: 'publish' as const, failures: [], holdReasons: [], checks: {} as VerifyResult['gate']['checks'] };
    const pass = (code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing') => [{ round: 0, gate, verifier, verifierFailures: [{ id: 'c-1', kind: 'label' as const, code, reason: 'x' }], sent: [] }];
    expect(holdReasonsOf({ gate, verifier, history: pass('not_entailed') })).toEqual(['G10_NOT_ENTAILED']);
    expect(holdReasonsOf({ gate, verifier, history: pass('ambiguous') })).toEqual(['G10_AMBIGUOUS']);
    expect(holdReasonsOf({ gate, verifier, history: pass('unsupported') })).toEqual(['G10_LABEL_UNSUPPORTED']);
    expect(holdReasonsOf({ gate, verifier, history: pass('missing') })).toEqual(['G10_NOT_JUDGED']);
  });

  it('reads only the last pass: what the model check said of an earlier draft is not why the last one is held', async () => {
    const { verified } = await tier2();
    const earlier = { round: 0, gate: verified.gate, verifier: verified.verifier, verifierFailures: [{ id: 's1', kind: 'sentence' as const, code: 'not_entailed' as const, reason: 'x' }], sent: ['s1'] };
    const last = { ...earlier, round: 1, verifierFailures: [], sent: [] };
    expect(holdReasonsOf({ gate: verified.gate, verifier: verified.verifier, history: [earlier, last] })).toEqual(['TIER2_ATTRIBUTION']);
  });

  it('has a reason for a hold made of gate failures alone, and is empty only for a piece that nothing holds', async () => {
    const { verified } = await verdictOn({ reply: { ...replyFromDraft(), takeaways: [INVENTED(15), ...replyFromDraft().takeaways.slice(1)] }, revisions: [{ replacements: [] }, { replacements: [] }] });
    expect(holdReasonsOf(verified)).toEqual(['G4_NUMBER_UNSUPPORTED']);
    const clean = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    expect(holdReasonsOf(clean.verified)).toEqual([]);
  });
});

describe('every reason of a hold is a real code, and the holds page of the site can explain it', () => {
  it('has the codes of the gate, the hold reasons of the gate and the reasons of the model check, and a label on the site for each', () => {
    const real = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS, ...VERIFIER_REASONS]);
    expect(real.has('G4_NUMBER_UNSUPPORTED') && real.has('TIER2_ATTRIBUTION') && real.has('G10_NOT_ENTAILED')).toBe(true);
    for (const code of real) expect(Object.hasOwn(REASON_LABELS, code), code).toBe(true);
  });
});

describe('runHold: a piece that cites another outlet', () => {
  it('writes the held draft into the folder of the run, whole enough for the owner to read it and to release it', async () => {
    const { ctx, claims, verified } = await tier2();
    const { target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.file).toBe(heldFile(ctx.runDir, verified.draft.slug));
    const held = HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
    expect(held).toEqual({
      date: ctx.date,
      slug: verified.draft.slug,
      runId: RUN.runId,
      reasons: ['TIER2_ATTRIBUTION'],
      draft: verified.draft,
      claims: citedClaims(verified.draft, claims),
      rounds: 0,
      gate: verified.gate,
      verifier: verified.verifier,
      history: verified.history,
    });
    expect(held.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });

  it('adds the hold to the desk state with the reasons and the categories of the piece, and records the run as held', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: RUN.at, outcome: 'held', runId: RUN.runId, slug: verified.draft.slug },
      holds: [{ at: RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'] }],
      corrections: [],
    });
  });

  it('keeps the holds of earlier runs, and adds this one after them', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, target } = setup();
    await runHold(ctx, target, claims, verified, RUN);
    await runHold(ctx, target, claims, verified, { runId: 'second', at: '2026-10-06T04:31:00.000Z' });
    const holds = (await readDeskState(path.join(repoDir, STATE))).holds;
    expect(holds.map((hold) => hold.at)).toEqual([RUN.at, '2026-10-06T04:31:00.000Z']);
  });

  it('lets nothing reach the pages of the site: no piece, no ledger, and one commit that holds the desk state alone', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, git, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
    expect(git.commits).toEqual([{ id: result.commit, paths: [STATE], message: `desk: hold ${verified.draft.slug}` }]);
    expect(result.files).toEqual([STATE]);
  });

  it('logs the hold with its reasons', async () => {
    const { ctx, logs, claims, verified } = await tier2();
    const { target } = setup();
    await runHold(ctx, target, claims, verified, RUN);
    expect(logs.at(-1)).toMatch(new RegExp(`^hold: ${verified.draft.slug} is held for TIER2_ATTRIBUTION, written to .*held`));
  });
});

describe('runHold: a draft that the gate or the model check did not clear', () => {
  it('records the codes of the failures that were never mended, and the held file has every pass', async () => {
    const reply = replyFromDraft();
    reply.takeaways[1] = INVENTED(15);
    const { ctx, claims, verified } = await verdictOn({ reply, revisions: [{ replacements: [] }, { replacements: [] }] });
    expect(verified.outcome).toBe('hold');
    expect(verified.rounds).toBe(2);
    const { repoDir, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['G4_NUMBER_UNSUPPORTED']);
    const held = HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
    expect(held.history.map((pass) => pass.round)).toEqual([0, 1, 2]);
    expect(held.rounds).toBe(2);
    expect((await readDeskState(path.join(repoDir, STATE))).holds[0]?.reasons).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('records the verdicts of the model check as reasons of the gate package', async () => {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const sentence = plan.sentences[3]?.id as string;
    const claim = plan.claims[0]?.id as string;
    const { ctx, claims, verified } = await verdictOn({
      revisions: [{ replacements: [] }, { replacements: [] }],
      verifier: () => [0, 1, 2].map(() => verifierReply(plan, { verdicts: { [sentence]: 'ambiguous' }, unsupported: [claim], omit: [plan.sentences[5]?.id as string] })),
    });
    const { target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED']);
  });
});

describe('runHold: a dry run', () => {
  it('writes the held draft, which is part of the record of the run, and nothing in the site', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir } = setup();
    const before = filesBelow(repoDir);
    const result = await runHold(ctx, new DryTarget(repoDir), claims, verified, RUN);
    expect(existsSync(result.file)).toBe(true);
    expect(filesBelow(repoDir)).toEqual(before);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(result.commit).toBeNull();
  });
});

describe('runHold: what it refuses', () => {
  it('does not hold a piece that Verify cleared', async () => {
    const { ctx, claims, verified } = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    expect(verified.outcome).toBe('publish');
    const { target } = setup();
    await expect(runHold(ctx, target, claims, verified, RUN)).rejects.toThrow('runHold needs a piece that Verify held');
    expect(existsSync(path.join(ctx.runDir, 'held'))).toBe(false);
  });

  it('does not hold a piece for no reason: a hold that says nothing is not one the owner can read', async () => {
    const { ctx, claims, verified } = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    const { target, git } = setup();
    await expect(runHold(ctx, target, claims, { ...verified, outcome: 'hold' }, RUN)).rejects.toThrow('has no reason');
    expect(git.commits).toEqual([]);
  });

  it('does not write the held draft under a slug that is not a plain slug, because the slug is a file name', async () => {
    const { ctx, claims, verified } = await tier2();
    const { target } = setup();
    const odd = { ...verified, draft: { ...verified.draft, slug: '../outside' } };
    await expect(runHold(ctx, target, claims, odd, RUN)).rejects.toThrow('"../outside" is not a plain slug');
    expect(existsSync(path.join(ctx.runDir, 'outside.json'))).toBe(false);
  });

  it('keeps the held draft even when the desk state cannot be changed: the draft is never lost to a refusal', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, git, target } = setup();
    git.dirty.add(STATE);
    await expect(runHold(ctx, target, claims, verified, RUN)).rejects.toThrow('has changes that are not committed');
    expect(existsSync(heldFile(ctx.runDir, verified.draft.slug))).toBe(true);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/stages/hold.test.ts`
Expected: FAIL — `Cannot find module '../../src/stages/hold'`

- [ ] **Step 8: Write the stage**

**Create `desk/src/stages/hold.ts`:**
```ts
import path from 'node:path';
import { citedClaims } from '@robywire/gate';
import type { Claim, VerifierReason } from '@robywire/gate';
import { HeldArtifact, addHold, isPlainSlug, recordRun, writeJsonFile } from '../index';
import type { PublishTarget } from '../index';
import type { StageContext } from './context';
import type { VerifyResult } from './verify';
import type { VerifierFailure } from './verify-model';

// Stage 7, the other way: a draft that cannot be published by itself is held. The gate holds it (a check still fails after the rounds of revision, or
// the piece cites another outlet) or the model check does not clear it. A hold is the Desk saying "not by myself", and it has three parts. The draft,
// the claims it cites and what every check said of it are written in the folder of the run, where the owner can read them and, later, release the
// piece. The desk state gets a record that a draft was held, with the reasons as codes, which the site's page of holds shows with a label for each.
// And nothing reaches the pages of the site: no piece and no ledger. The held text itself is never shown on the site.

/** The run that is holding: its id, and the moment it is recording, as an ISO time. */
export interface HoldRun {
  runId: string;
  at: string;
}

export interface HoldResult {
  slug: string;
  /** The held draft, as a path: `<folder of the run>/held/<slug>.json`. */
  file: string;
  /** Why, as codes (see `holdReasonsOf`). */
  reasons: string[];
  /** The id of the commit of the desk state; null for a dry run. */
  commit: string | null;
  files: string[];
}

/** The reason that each way the model check can fail goes by, in the vocabulary of the gate package (`VERIFIER_REASONS`). */
const REASON_OF: Readonly<Record<VerifierFailure['code'], VerifierReason>> = {
  not_entailed: 'G10_NOT_ENTAILED',
  ambiguous: 'G10_AMBIGUOUS',
  unsupported: 'G10_LABEL_UNSUPPORTED',
  missing: 'G10_NOT_JUDGED',
};

/**
 * Why a piece was held, as codes, each once: the codes of the failures of the gate on the last draft, in the order the gate found them, then the gate's
 * hold reasons (`TIER2_ATTRIBUTION`), then what the model check said of the last draft (one reason for each way it failed). The model check says nothing of a draft
 * that the gate sent back, so a hold is made of the codes of the gate alone then. An earlier draft, which the composer rewrote, is not why the last one is held.
 */
export function holdReasonsOf(verified: Pick<VerifyResult, 'gate' | 'verifier' | 'history'>): string[] {
  const last = verified.history.at(-1);
  const codes = [
    ...verified.gate.failures.map((failure) => failure.code),
    ...verified.gate.holdReasons,
    ...(last?.verifierFailures ?? []).map((failure) => REASON_OF[failure.code]),
  ];
  return [...new Set(codes)];
}

/**
 * Hold the piece that `verified` says is not clear: write `held/<slug>.json` in the folder of the run, add a hold to the desk state with its reasons and
 * the categories of the piece, record the run as held, and commit the desk state. The held draft is written first and is kept even if the desk
 * state cannot be changed, because a refusal must never lose a draft.
 *
 * Refuses a piece that Verify did not hold, a hold with no reason (the owner could not read what it says), and a slug that is not a plain slug (it is a file name).
 * A dry run writes the held draft all the same, as it writes every other artifact, and changes nothing in the site.
 */
export async function runHold(ctx: StageContext, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: HoldRun): Promise<HoldResult> {
  if (verified.outcome !== 'hold') throw new Error('runHold needs a piece that Verify held');
  const { draft } = verified;
  const reasons = holdReasonsOf(verified);
  if (reasons.length === 0) throw new Error(`runHold: the piece "${draft.slug}" is held but has no reason: neither the gate nor the model check failed it`);
  if (!isPlainSlug(draft.slug)) throw new Error(`runHold: "${draft.slug}" is not a plain slug, and a slug is a file name`);

  const file = path.join(ctx.runDir, 'held', `${draft.slug}.json`);
  const held: HeldArtifact = {
    date: ctx.date,
    slug: draft.slug,
    runId: run.runId,
    reasons,
    draft,
    claims: citedClaims(draft, claims),
    rounds: verified.rounds,
    gate: verified.gate,
    verifier: verified.verifier,
    history: verified.history,
  };
  await writeJsonFile(file, `the held draft ${draft.slug}.json`, held, HeldArtifact);

  const result = await target.apply({
    state: (state) => recordRun(addHold(state, { at: run.at, categories: draft.categories, reasons }), { at: run.at, outcome: 'held', runId: run.runId, slug: draft.slug }),
    message: `desk: hold ${draft.slug}`,
  });
  ctx.log(`hold: ${draft.slug} is held for ${reasons.join(', ')}, written to ${file}`);
  return { slug: draft.slug, file, reasons, commit: result.commit, files: result.files };
}
```

Run: `npm test --workspace @robywire/desk -- test/stages/hold.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 10: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add desk/src/run/artifacts.ts desk/src/run/target.ts desk/src/stages/hold.ts desk/test/fetch/exports.test.ts desk/test/run/artifacts.test.ts desk/test/run/target.test.ts desk/test/stages/hold.test.ts gate/src/constants.ts gate/test/constants.test.ts site/src/lib/reasons.ts site/test/reasons.test.ts
git commit -m "feat(desk): the Hold stage: the held draft and everything the owner needs written in the run, the hold and its reasons added to the desk state, and nothing reaching the pages of the site; the reasons of the model check join the codes of the gate, with labels on the holds page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 33: The made-up world and its story

**Files:**
- Create: `desk/src/demo/world.ts` (`DEMO_DATE`, `DEMO_URLS`, `DEMO_FIXTURE_DIR`, `demoWorldMap`, `demoFetcher`, `DEMO_REGISTRY_YAML`, `demoRegistry`)
- Create: `desk/src/demo/story.ts` (`DEMO_CLAIMS`, `DEMO_REPLY`, `clearingVerifier`, `DEMO_SELECT_REASON`, `demoClient`)
- Modify: `desk/test/fetch/exports.test.ts`
- Test: `desk/test/demo/world.test.ts`

The next four tasks run the whole pipeline, from Discover to the end, and they need a world to run it in and a model to tell a story. This task makes both, once, so that the orchestrator (Task 34), replay (Task 35), the command line (Task 36), the adversarial matrix (Task 37) and the demo (Task 39) all use the same ones.

**The world** is the one that the tests of the stages have used since part 3: one company's newsroom (Fixture Robotics), two outlets' feeds (Mercer Wire and Gantry Daily), the company's release about its second plant, and Mercer Wire's report of the same news, as the files in `desk/test/fixtures/`, on addresses ending in `.example`, with a small source registry. It moves into `desk/src/demo/world.ts` because `desk run --sources fixtures` will need it at run time, and the tests of the stages are unchanged (a test here says that the world is still the same one). It is current on **5 October 2026**, the day after its newest feed item. Everything in it is invented, and nothing in it may be published: Task 36 makes the command line refuse to put it anywhere but in a dry run.

**The story** is what a scripted model says in that world, one reply for each of the four calls of a clean run: Select chooses Mercer Wire's report, Extract proposes the seven claims of the release, Compose writes the piece, and Verify clears it. The claims are the first seven of the golden piece of the gate, which the release says word for word. The piece is written from those claims alone and says only what they say: four sections, 640 words of body, three sentences of analysis, and every claim from a primary source (so nothing is attributed to another outlet, and the gate clears it). The verifier, `clearingVerifier`, reads from the blocks of the message which sentences, headings and claims it is shown and clears all of them, so it clears any piece; the tests of Task 37 turn it into a verifier that finds fault. It is a script, written by hand: no model wrote it, and it shows that the stages let a clean story through, not that a real model would write one.

**The tests** say what is in the world and that it is still the world of the stages; that the seven claims are the golden claims and the piece is one the gate clears, with the slug, the date, the author and the limitations written by code; that the scripted verifier clears what it is shown; and, in one test, that the six stages run on the world and the scripted model end in `publish` with four calls.

- [ ] **Step 1: Write the failing test**

**Create `desk/test/demo/world.test.ts`:**
```ts
import { allSentences, defaultContext, runGate } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, DEMO_SELECT_REASON, clearingVerifier, demoClient } from '../../src/demo/story';
import { DEMO_DATE, DEMO_FIXTURE_DIR, DEMO_URLS, demoFetcher, demoRegistry, demoWorldMap } from '../../src/demo/world';
import { FetchError } from '../../src/fetch/http';
import { sourceKind } from '../../src/sources';
import { buildVerifyUser } from '../../src/prompts/verify';
import { runCompose } from '../../src/stages/compose';
import { runDiscover } from '../../src/stages/discover';
import { assembleDraft, ComposeReply } from '../../src/stages/draft-assembly';
import { runExtract } from '../../src/stages/extract';
import { runFetch } from '../../src/stages/fetch';
import { runSelect } from '../../src/stages/select';
import { runVerify } from '../../src/stages/verify';
import { VerifyReply, aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { FETCHED_AT, URLS, stageContext, useScratch, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { smallRegistry } from '../support/registry';

// The made-up world is what the pipeline is shown in when there is no network and no key: the tests of the whole run use it, and so does the
// dry-run demo. These tests say what is in it, that it is the world that the tests of the stages have always used, and that its scripted story is
// one that every stage of the pipeline lets through.

const scratch = useScratch();

describe('the made-up world', () => {
  it('is the world that the tests of the stages use: the same addresses, the same files for them, the same sources, the same folder', () => {
    expect(DEMO_URLS).toEqual(URLS);
    expect(demoWorldMap()).toEqual(worldMap());
    expect(demoRegistry()).toEqual(smallRegistry());
    expect(DEMO_FIXTURE_DIR).toBe(FIXTURE_DIR);
  });

  it('is current on the 5th of October 2026, the day after its newest feed item', () => {
    expect(DEMO_DATE).toBe('2026-10-05');
  });

  it('has only addresses on .example, which can never be a real site', () => {
    for (const url of Object.values(DEMO_URLS)) expect(new URL(url).hostname.endsWith('.example'), url).toBe(true);
    expect(Object.keys(demoWorldMap()).every((url) => new URL(url).hostname.endsWith('.example'))).toBe(true);
  });

  it('serves each of its pages, stamped with the time that the clock gives', async () => {
    const fetcher = demoFetcher(() => FETCHED_AT);
    for (const url of Object.values(DEMO_URLS)) {
      const page = await fetcher.get(url);
      expect(page.status, url).toBe(200);
      expect(page.retrievedAt).toBe(FETCHED_AT.toISOString());
      expect(page.body.length, url).toBeGreaterThan(100);
    }
    expect(fetcher.requests).toEqual(Object.values(DEMO_URLS));
  });

  it('fails like a site that cannot be reached for an address it does not have', async () => {
    await expect(demoFetcher(() => FETCHED_AT).get('https://elsewhere.example/page')).rejects.toBeInstanceOf(FetchError);
  });

  it('says what each of its addresses is: the company newsroom and its release are primary, the outlet is not', () => {
    const registry = demoRegistry();
    expect(sourceKind(DEMO_URLS.newsroom, registry)).toBe('company-newsroom');
    expect(sourceKind(DEMO_URLS.release, registry)).toBe('company-newsroom');
    expect(sourceKind(DEMO_URLS.mercerArticle, registry)).toBe('tier2');
    expect(sourceKind(DEMO_URLS.mercerFeed, registry)).toBe('tier2');
  });
});

describe('the story of the made-up world', () => {
  it('has the claims of the golden piece that its release says, as the model proposes them: seven, from page 1', () => {
    const golden = GOLDEN_CLAIMS.slice(0, 7).map((claim) => ({ text: claim.text, label: claim.label, type: claim.type, quote: claim.span.quote, values: claim.values, basis: claim.basis, status: claim.status, source: 1 }));
    expect(DEMO_CLAIMS).toEqual(golden);
  });

  it('has a reply that the schema accepts, that cites only those seven claims, and that has no limitation sentence, which only code writes', () => {
    expect(ComposeReply.safeParse(DEMO_REPLY).success).toBe(true);
    const draft = assembleDraft(DEMO_REPLY, GOLDEN_CLAIMS.slice(0, 7), { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
    const cited = new Set(allSentences(draft).flatMap((item) => item.sentence.claimIds));
    expect([...cited].sort()).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7']);
    expect(allSentences(draft).filter((item) => item.section !== 'limitations' && item.sentence.kind === 'limitation')).toEqual([]);
  });

  it('is a piece that the gate clears, with code writing everything but the sentences', () => {
    const claims = GOLDEN_CLAIMS.slice(0, 7);
    const draft = assembleDraft(DEMO_REPLY, claims, { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
    const gate = runGate({ draft, claims }, defaultContext());
    expect(gate.failures).toEqual([]);
    expect(gate.route).toBe('publish');
    expect(draft.slug).toBe('fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant');
    expect(draft.limitations.length).toBeGreaterThan(0);
  });

  it('is plain ASCII, like all the source of the Desk', () => {
    expect([...JSON.stringify([DEMO_REPLY, DEMO_CLAIMS, DEMO_SELECT_REASON])].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('the scripted verifier', () => {
  it('clears every sentence, every heading and every claim in a message, reading them from the blocks of the message', () => {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const request = { user: buildVerifyUser(plan) } as Parameters<typeof clearingVerifier>[0];
    const reply = clearingVerifier(request);
    expect(VerifyReply.safeParse(reply).success).toBe(true);
    expect(reply.verdicts.map((verdict) => verdict.id)).toEqual([...plan.sentences, ...plan.headings].map((item) => item.id));
    expect(reply.labels.map((label) => label.id)).toEqual(plan.claims.map((claim) => claim.id));
    expect(aggregateVerdicts('model-a', plan, reply).verifier.passed).toBe(true);
  });
});

describe('the scripted model', () => {
  it('tells the story through every stage of the pipeline: Discover, Select, Fetch, Extract, Compose and Verify end in publish, with four calls to the model', async () => {
    const client = demoClient();
    const { ctx } = stageContext(scratch, { fetcher: demoFetcher(() => FETCHED_AT), sources: demoRegistry(), client });
    const discovered = await runDiscover(ctx);
    const selected = await runSelect(ctx, discovered);
    expect(selected.chosen?.url).toBe(DEMO_URLS.mercerArticle);
    expect(selected.tier1Url).toBe(DEMO_URLS.release);
    const fetched = await runFetch(ctx, selected);
    if (!fetched.ok) throw new Error(fetched.reason);
    expect(fetched.snapshots.map((snapshot) => snapshot.tier)).toEqual([1, 2]);
    const extracted = await runExtract(ctx, fetched.snapshots, selected);
    if (!extracted.ok) throw new Error(extracted.reason);
    expect(extracted.artifact.claims).toHaveLength(7);
    expect(extracted.artifact.dropped).toEqual([]);
    const composed = await runCompose(ctx, extracted.artifact.claims);
    expect(composed.gate.route).toBe('publish');
    const verified = await runVerify(ctx, extracted.artifact.claims, composed);
    expect(verified.outcome).toBe('publish');
    expect(verified.rounds).toBe(0);
    expect(client.calls.map((call) => call.role)).toEqual(['select', 'extract', 'compose', 'verify']);
    for (const role of ['select', 'extract', 'compose', 'verify'] as const) expect(client.pending(role)).toBe(0);
  });

  it('has one reply for each of the four roles, and no more: a fifth call would find nothing scripted', () => {
    const client = demoClient();
    expect(['select', 'extract', 'compose', 'verify'].map((role) => client.pending(role as 'select'))).toEqual([1, 1, 1, 1]);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/demo/world.test.ts`
Expected: FAIL — `Cannot find module '../../src/demo/story'`

- [ ] **Step 2: Write the world**

**Create `desk/src/demo/world.ts`:**
```ts
import { fileURLToPath } from 'node:url';
import { parseSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { FixtureFetcher } from '../index';
import type { FixtureEntry } from '../index';

// The made-up world that the Desk can be shown in with no network: a few sources on `.example` addresses, whose pages are the files of
// `desk/test/fixtures/`. The tests of the pipeline run in it, and so does `desk run --sources fixtures` (a dry run: nothing in it is real, and
// nothing in it may ever be published). Every company, outlet and address in it is invented.

/** The day on which the made-up world is current: its feed items are dated the days before it. */
export const DEMO_DATE = '2026-10-05';

/** The addresses of the made-up world. */
export const DEMO_URLS = {
  mercerFeed: 'https://mercer-wire.example/feed.xml',
  gantryFeed: 'https://gantry-daily.example/atom.xml',
  newsroom: 'https://fixture-robotics.example/news',
  release: 'https://fixture-robotics.example/news/fx-1-second-plant',
  mercerArticle: 'https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant',
} as const;

/** The folder of the fixture files, as a path. */
export const DEMO_FIXTURE_DIR = fileURLToPath(new URL('../../test/fixtures/', import.meta.url));

/** Which fixture file answers which address: the two feeds, the newsroom, the release, and the article that cites the release. */
export function demoWorldMap(): Record<string, FixtureEntry> {
  return {
    [DEMO_URLS.mercerFeed]: 'feeds/mercer-wire.rss.xml',
    [DEMO_URLS.gantryFeed]: 'feeds/gantry-daily.atom.xml',
    [DEMO_URLS.newsroom]: 'pages/fixture-robotics-news.html',
    [DEMO_URLS.release]: 'pages/fixture-robotics-fx-1-second-plant.html',
    [DEMO_URLS.mercerArticle]: 'pages/mercer-wire-fx-1-second-plant.html',
  };
}

/** The fetcher of the made-up world: it serves the fixture files, and fails like a site that cannot be reached for any other address. */
export function demoFetcher(now: () => Date): FixtureFetcher {
  return new FixtureFetcher(DEMO_FIXTURE_DIR, demoWorldMap(), now);
}

/** The source registry of the made-up world, in the format of `sources.yml`: one company's newsroom and two outlets' feeds. */
export const DEMO_REGISTRY_YAML = `
primary:
  companies:
    humanoids:
      - { name: Fixture Robotics, url: "https://fixture-robotics.example/news", status: unverified }
  research: []
  standards:
    - { name: Safety Standards Board, url: "https://standards.example/robotics", status: unverified }
  funding:
    - { name: Company announcement, url: "(the round is always announced on the company's own site first)", status: n/a }
  events:
    - { name: Automation Expo, url: "https://expo.example/", status: unverified }
secondary:
  - name: Mercer Wire
    feed: "https://mercer-wire.example/feed.xml"
    status: unverified
    beats: [humanoids, funding]
  - name: Gantry Daily
    feed: "https://gantry-daily.example/atom.xml"
    status: unverified
    beats: [industrial-warehouse]
    note: A made-up outlet.
bar:
  publish_if_any:
    - A product shipped, was priced, or reached a customer site.
    - A funding round with a named amount.
  do_not_publish:
    - A demo video with no specification behind it.
    - A restatement of another outlet's story with nothing added.
  quiet_day_fallback:
    - A follow-up on a launch covered six months ago.
`;

/** A fresh copy of the registry of the made-up world, so that a caller can change it. */
export function demoRegistry(): SourcesRegistry {
  return parseSources(DEMO_REGISTRY_YAML);
}
```

- [ ] **Step 3: Write the story**

**Create `desk/src/demo/story.ts`:**
```ts
import { FakeClient, candidateId } from '../index';
import type { ModelRequest } from '../index';
import type { ComposeReply } from '../stages/draft-assembly';
import type { VerifyReply } from '../stages/verify-model';
import { DEMO_URLS } from './world';

// The story that the made-up world tells, as a scripted model would tell it: which story Select chooses, the claims that Extract proposes
// from the release of Fixture Robotics, the piece that Compose writes from them, and a verifier that clears it. It is a story of a company's own
// announcement, so every claim is from a primary source and nothing is attributed to another outlet. Every claim is word for word in the page of
// the release, and every sentence says only what the claims it cites say, so each stage of the pipeline passes it. It is a script for tests and for
// the dry-run demo; no real model wrote it, and nothing in it is real.

/** A claim as the extract model proposes it. `source` is the number of the page: the release of Fixture Robotics is page 1. */
export const DEMO_CLAIMS = [
  {
    text: 'Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.',
    label: 'Tarnmoor shipment',
    type: 'event',
    quote: 'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
      { kind: 'name', raw: 'Brindle Logistics', normalised: 'brindle logistics' },
      { kind: 'name', raw: 'Tarnmoor', normalised: 'tarnmoor' },
    ],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Fixture Robotics announced the shipments on 1 October 2026.',
    label: 'announcement date',
    type: 'date',
    quote: 'Tarnmoor, 1 October 2026: Fixture Robotics announced that deliveries have started.',
    values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-01' }],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'The FX-1 mounts on existing conveyor frames without a new safety cage.',
    label: 'retrofit mounting',
    type: 'spec',
    quote: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.',
    values: [{ kind: 'name', raw: 'FX-1', normalised: 'fx-1' }],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 12 weeks of an order.',
    label: 'list price',
    type: 'number',
    quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.',
    values: [
      { kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' },
      { kind: 'number', raw: '12', normalised: '12' },
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
    ],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    label: 'Tarnmoor delivery schedule',
    type: 'event',
    quote: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    values: [
      { kind: 'name', raw: 'Tarnmoor', normalised: 'tarnmoor' },
      { kind: 'number', raw: '60', normalised: '60' },
      { kind: 'date', raw: '30 November 2026', normalised: '2026-11-30' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
  {
    text: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    label: 'production plan',
    type: 'event',
    quote: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
      { kind: 'number', raw: '500', normalised: '500' },
      { kind: 'date', raw: '2027', normalised: '2027' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
  {
    text: 'Fixture Robotics will use the funds to expand FX-1 production.',
    label: 'use of funds',
    type: 'event',
    quote: 'Fixture Robotics said it will use the funds to expand FX-1 production.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
];

const fact = (text: string, ...claimIds: string[]) => ({ kind: 'fact' as const, text, claimIds });
const analysis = (text: string, ...claimIds: string[]) => ({ kind: 'analysis' as const, text, claimIds });

/**
 * The piece that the composer writes from the seven claims: sentences that cite them, and nothing else (the slug, the date, the author and the
 * limitation sentences are written by code). It is 640 words of body in four sections, with three sentences of analysis, and the gate clears it.
 */
export const DEMO_REPLY: ComposeReply = {
  categories: ['humanoids'],
  title: fact('Fixture Robotics begins FX-1 deliveries to a second Brindle Logistics plant', 'c-1'),
  description: fact('Fixture Robotics has started shipping FX-1 arms to Brindle Logistics for its second plant, at Tarnmoor, and lists the arm from $38,000.', 'c-1', 'c-4'),
  opening: [
    fact('Fixture Robotics has begun shipping FX-1 warehouse arms to Brindle Logistics for its second plant, at Tarnmoor.', 'c-1'),
    fact('The company announced on 1 October 2026 that deliveries have started.', 'c-2'),
    fact('It lists the arm from $38,000, with delivery within 12 weeks of an order, and says it needs no new safety cage.', 'c-4', 'c-3'),
  ],
  takeaways: [
    fact('Fixture Robotics has begun shipping FX-1 arms to a second Brindle Logistics plant, at Tarnmoor.', 'c-1'),
    fact('The company says the FX-1 mounts on existing conveyor frames and needs no new safety cage.', 'c-3'),
    fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
    fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6'),
  ],
  sections: [
    {
      heading: 'What was announced',
      paragraphs: [
        [
          fact('Fixture Robotics announced on 1 October 2026 that deliveries of its FX-1 warehouse arm have started.', 'c-2', 'c-1'),
          fact('The arms are built for tote picking and trailer unloading, and they are going to Brindle Logistics for its second plant, at Tarnmoor.', 'c-1'),
          fact('The announcement is datelined Tarnmoor, which is also where the arms are being delivered.', 'c-2', 'c-1'),
          fact('Deliveries to the second plant have begun, according to the company.', 'c-1', 'c-2'),
          fact('Brindle Logistics is the customer that the company names for the second plant.', 'c-1'),
        ],
        [
          fact('The company said that the FX-1 mounts on existing conveyor frames and needs no new safety cage.', 'c-3'),
          fact('A customer with conveyor frames in place can therefore fit the arm to them, as the company describes it.', 'c-3'),
          analysis('The announcement gives a price and a delivery time but no measurement of how the arm performs.', 'c-3', 'c-4'),
        ],
      ],
    },
    {
      heading: 'What it costs',
      paragraphs: [
        [
          fact('Fixture Robotics lists the FX-1 from $38,000 per arm.', 'c-4'),
          fact('It says delivery takes place within 12 weeks of an order.', 'c-4'),
          fact('The company gives the price per arm, so a buyer of one arm sees the figure that the company lists.', 'c-4'),
          analysis('A list price and a lead time are the terms a buyer needs first, though neither says what the arm achieves.', 'c-4'),
        ],
        [
          fact('The FX-1 needs no new safety cage, the company said, and it mounts on existing conveyor frames.', 'c-3'),
          fact('Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.', 'c-4'),
        ],
      ],
    },
    {
      heading: 'What comes next',
      paragraphs: [
        [
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
          fact('The delivery to Tarnmoor is therefore a schedule that the company has set, with 30 November 2026 as its end.', 'c-5'),
          fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6'),
          fact('The company expects the 2027 build to reach 500 arms.', 'c-6'),
        ],
        [
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('The expansion of FX-1 production is what the company says the funds are for.', 'c-7'),
          analysis('A plan to build more arms and a schedule of deliveries are both statements of intent, and neither is a delivered result.', 'c-5', 'c-6', 'c-7'),
        ],
      ],
    },
    {
      heading: 'What the announcement leaves open',
      paragraphs: [
        [
          fact('Fixture Robotics has begun shipping FX-1 arms to Brindle Logistics, and the company says that deliveries to its second plant, at Tarnmoor, have started.', 'c-1', 'c-2'),
          fact('The company lists the arm from $38,000 per arm and gives 12 weeks as the delivery time after an order.', 'c-4'),
          analysis('Every figure in this piece comes from the announcement of the company, so none of them is a measurement made by anyone else.', 'c-4'),
        ],
        [
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026, and the company expects to build 500 FX-1 arms in 2027.', 'c-5', 'c-6'),
          fact('The company said it will use the funds to expand FX-1 production, and it expects to build 500 FX-1 arms in 2027.', 'c-7', 'c-6'),
          analysis('The delivery schedule and the production plan are both plans, so they say what the company intends and not what it has delivered.', 'c-5', 'c-6'),
        ],
      ],
    },
  ],
};

/** The ids of the blocks of a message, in order. */
const blockIds = (message: string): string[] => [...message.matchAll(/<source id="([^"]+)">/g)].map((match) => match[1] as string);

/**
 * The reply of a verifier that clears everything it is shown: every sentence and every heading (the blocks whose id is `s` or `h` and a number)
 * is entailed, and the basis and the status of every claim (the blocks whose id is `c-` and a number) are supported. It reads what to clear
 * from the message, so it clears any piece. It is the scripted stand-in for a model that finds nothing wrong, for tests and for the demo.
 */
export function clearingVerifier(request: ModelRequest<unknown>): VerifyReply {
  const ids = blockIds(request.user);
  return {
    verdicts: ids.filter((id) => /^[sh]\d+$/.test(id)).map((id) => ({ id, verdict: 'entailed' as const, reason: 'The passages say it.' })),
    labels: ids.filter((id) => /^c-\d+$/.test(id)).map((id) => ({ id, basisSupported: true, statusSupported: true, reason: 'The passage supports the label.' })),
  };
}

/** The reason that the scripted select model gives for its choice. */
export const DEMO_SELECT_REASON = 'A product reached a customer site.';

/**
 * A fake model that tells the story, one reply for each of the four calls of a clean run: Select chooses the report of Mercer Wire on the second
 * plant, Extract proposes the seven claims of the release, Compose writes the piece, and Verify clears it.
 */
export function demoClient(): FakeClient {
  return new FakeClient()
    .script('select', { chosenId: candidateId(DEMO_URLS.mercerArticle), reasons: [DEMO_SELECT_REASON] })
    .script('extract', { claims: DEMO_CLAIMS })
    .script('compose', DEMO_REPLY)
    .script('verify', clearingVerifier);
}
```

Run: `npm test --workspace @robywire/desk -- test/demo/world.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 4: Keep the demo out of the entry point**

The world and the story are the top of the package, like the stages: nothing below them may depend on them, so the entry point does not export them. This test passes at once; it is there so that it keeps passing.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication]) {
      expect(entry).not.toHaveProperty(name);
    }
```

**with:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...demo]) {
      expect(entry).not.toHaveProperty(name);
    }
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 6: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 7: Commit**

```bash
git add desk/src/demo desk/test/demo desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the made-up world and its story: the fixture sources and pages as a world with no network, and a scripted model that tells a clean story that every stage of the pipeline lets through" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 34: The orchestrator

**Files:**
- Create: `desk/src/run/orchestrate.ts` (`Stages`, `DEFAULT_STAGES`, `RunDeskOptions`, `RunResult`, `runDesk`)
- Create: `desk/src/run/lock.ts` (`RefusalKind`, `RunRefused`, `LOCK_FILE`, `STALE_LOCK_MS`, `takeRunLock`)
- Modify: `desk/src/run/artifacts.ts` (`RunRecord`, `readJsonFile`, which `readArtifact` now uses)
- Modify: `desk/src/run/target.ts` (`preflight` on every target)
- Modify: `desk/src/index.ts` (export the lock)
- Create: `desk/test/support/run.ts` (a run in the made-up world, shared by the tests of whole runs)
- Modify: `desk/test/run/artifacts.test.ts`, `desk/test/run/target.test.ts`, `desk/test/fetch/exports.test.ts`
- Test: `desk/test/run/lock.test.ts`, `desk/test/run/orchestrate.test.ts`

`runDesk` is one run of the Desk. It gives every stage the same context, hands each stage what the one before it made, and ends in one of four outcomes: **published**, **held**, **no-story** or **failed**. It is the only place that knows the order of the stages.

**The order, and what ends a run early.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. A story that is not there ends the run as `no-story`: Select chooses none, Fetch gets no page, or Extract keeps fewer than `minClaims` claims. Verify's verdict ends it as `published` (the Publish stage of Task 31) or `held` (the Hold stage of Task 32). **Anything a stage throws ends the run as `failed`**, with the message and the name of the stage that threw: a model reply that does not fit its schema, a refused request, a spent budget (the budget is the budgeted client of part 2, and the call that would go over it throws), a source registry with nothing in it, a site that refuses the piece. Nothing is published on the strength of a stage that failed.

**Every outcome is recorded.** The desk state is updated for every outcome: by Publish and by Hold for those two, by the orchestrator for `no-story` and `failed` (`lastRun` only, with no slug), and each of these is one commit that holds the desk state alone, so **every run that is not dry makes exactly one commit**, and a dry run makes none. If the desk state cannot be recorded (the commit fails, the checkout is not in order), the run still ends as it ended; the reason says that the record could not be made, and the checkout is as it was. Last, the orchestrator writes **`run.json`** in the folder of the run, checked against `RunRecord`: the outcome and the stage that ended the run, the reason, the slug and the commit, the times it started and ended, whether it was dry, the models, the budget and what was spent, the files the run left (the artifacts and any held draft, not the record itself and not the cassettes of Task 35), and every line that the stages logged. The schema holds the rules of what an outcome has: a published run has a slug and no reason, a held run has both, a run with no story or a failure has a reason and no slug, a dry run has no commit and a run that published for real has one.

**A run is refused, not failed, before it starts**, when it should not start at all. A refusal is a `RunRefused` error with a kind, and nothing is recorded because nothing ran.
- **`locked` and `stale-lock`:** the run takes a lock first, `<runs folder>/.lock`, a file made so that it fails if it is already there, naming the run and the time. It is removed when the run ends, however it ends. When it is there the run does not start. A lock that is **more than a day old is reported, with its age in hours, and is not removed**: it may belong to a run that is still going, or to one that died, and only the owner knows. A lock that cannot be read is treated as held.
- **`date-done`:** the folder of the day already holds a `run.json`. A second run for the same day is refused unless `forceNew` is set, and then the old folder is moved aside to `<day>.old-1` (or the first number that is free), whole, so the folder of a run never holds the artifacts of two runs and nothing is removed. A folder that has artifacts but no record is a run that never ended; it is moved aside as well.
- **`target`:** the site has changes that are not committed where the Desk writes, or the desk state cannot be read. Every target now has a `preflight()`, called before any stage runs, so that a run does not spend a model call on a run that cannot end: the site target asks git and reads the state, the dry target only reads the state.

**The tests** run the real stages in the made-up world of Task 33 with a scripted model, in new folders under the temporary directory and with a fake git. They cover each outcome, each stage throwing (a stage of the test's own takes its place), a model reply that is not what was asked, the budget running out, the lock, the day, the checkout, and that one run makes one commit. They read the artifacts and the record back from the disk.

- [ ] **Step 1: Write the failing test of the lock**

**Create `desk/test/run/lock.test.ts`:**
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCK_FILE, RunRefused, STALE_LOCK_MS, takeRunLock } from '../../src/run/lock';
import { useScratch } from '../support/context';

// Two runs of the Desk at once would write the same folders and could commit over each other, so a run takes a lock first. The lock is a file made
// in a way that fails if it is already there; it is removed when the run ends, however it ends. A lock that is a day old is not removed by the next
// run: that run says so, and the owner decides, because a lock that is old may belong to a run that is still going.

const scratch = useScratch();
const NOW = new Date('2026-10-05T04:31:00.000Z');

const lockFileOf = (runsDir: string): string => path.join(runsDir, LOCK_FILE);

describe('takeRunLock', () => {
  it('makes the lock file, and creates the folder of the runs when it is not there', async () => {
    const runsDir = path.join(scratch(), 'runs');
    await takeRunLock(runsDir, NOW, '2026-10-05-043100');
    expect(existsSync(lockFileOf(runsDir))).toBe(true);
  });

  it('names the file .lock, writes who holds it and since when, and no more', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, NOW, '2026-10-05-043100');
    expect(LOCK_FILE).toBe('.lock');
    expect(JSON.parse(readFileSync(lockFileOf(runsDir), 'utf8'))).toEqual({ pid: process.pid, runId: '2026-10-05-043100', startedAt: '2026-10-05T04:31:00.000Z' });
  });

  it('gives back a function that removes the lock, and removing it twice does no harm', async () => {
    const runsDir = scratch();
    const release = await takeRunLock(runsDir, NOW, 'a');
    await release();
    expect(existsSync(lockFileOf(runsDir))).toBe(false);
    await expect(release()).resolves.toBeUndefined();
  });

  it('can be taken again once it was released', async () => {
    const runsDir = scratch();
    await (await takeRunLock(runsDir, NOW, 'a'))();
    await expect(takeRunLock(runsDir, NOW, 'b')).resolves.toBeTypeOf('function');
  });

  it('refuses while another run holds it, says who and since when, and leaves the lock as it is', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, NOW, 'first');
    const before = readFileSync(lockFileOf(runsDir), 'utf8');
    const later = new Date(NOW.getTime() + 60_000);
    const error = await takeRunLock(runsDir, later, 'second').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RunRefused);
    expect((error as RunRefused).kind).toBe('locked');
    expect((error as RunRefused).message).toContain(`another run holds the lock ${lockFileOf(runsDir)}`);
    expect((error as RunRefused).message).toContain('run first');
    expect((error as RunRefused).message).toContain('2026-10-05T04:31:00.000Z');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe(before);
  });

  it('only one of two runs that start together gets the lock', async () => {
    const runsDir = scratch();
    const results = await Promise.allSettled([takeRunLock(runsDir, NOW, 'a'), takeRunLock(runsDir, NOW, 'b')]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('reports a lock that is more than a day old as stale, with its age in hours, and does not remove it', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, new Date(NOW.getTime() - STALE_LOCK_MS - 3 * 3_600_000 - 5 * 60_000), 'crashed');
    const before = readFileSync(lockFileOf(runsDir), 'utf8');
    const error = await takeRunLock(runsDir, NOW, 'next').catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('stale-lock');
    expect((error as RunRefused).message).toContain('was taken 27 hours ago');
    expect((error as RunRefused).message).toContain('run crashed');
    expect((error as RunRefused).message).toContain('delete the file');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe(before);
  });

  it('counts a lock as stale only after a whole day: a lock of exactly 24 hours is not, and one a minute older is', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, new Date(NOW.getTime() - STALE_LOCK_MS), 'x');
    expect(((await takeRunLock(runsDir, NOW, 'y').catch((caught: unknown) => caught)) as RunRefused).kind).toBe('locked');
    const other = scratch();
    await takeRunLock(other, new Date(NOW.getTime() - STALE_LOCK_MS - 60_000), 'x');
    expect(((await takeRunLock(other, NOW, 'y').catch((caught: unknown) => caught)) as RunRefused).kind).toBe('stale-lock');
  });

  it('treats a lock that it cannot read as held, and says it cannot read it', async () => {
    const runsDir = scratch();
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(lockFileOf(runsDir), 'not json');
    const error = await takeRunLock(runsDir, NOW, 'a').catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('locked');
    expect((error as RunRefused).message).toContain('cannot be read');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe('not json');
  });

  it('treats a lock that lacks the run, or the start time, or has either of the wrong kind, the same way', async () => {
    const holders = [{ pid: 1 }, { runId: 'x' }, { runId: 'x', startedAt: 'a day ago' }, { startedAt: '2026-10-05T04:31:00.000Z' }, { runId: 5, startedAt: '2026-10-05T04:31:00.000Z' }, { runId: 'x', startedAt: 20261005 }];
    for (const holder of holders) {
      const runsDir = scratch();
      writeFileSync(lockFileOf(runsDir), JSON.stringify(holder));
      const error = await takeRunLock(runsDir, NOW, 'a').catch((caught: unknown) => caught);
      expect((error as RunRefused).kind, JSON.stringify(holder)).toBe('locked');
      expect((error as RunRefused).message, JSON.stringify(holder)).toContain('cannot be read');
    }
  });
});

describe('RunRefused', () => {
  it('is an error with a kind, and a name that says what it is', () => {
    const error = new RunRefused('date-done', 'the run is done');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RunRefused');
    expect(error.kind).toBe('date-done');
    expect(error.message).toBe('the run is done');
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/lock.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/lock'`

- [ ] **Step 2: Write the lock**

**Create `desk/src/run/lock.ts`:**
```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A run of the Desk writes the folders of its day, the evidence, the site and git, and two runs at once would write over each other. So a run
// takes a lock first: a file that is made in a way that fails if it is already there. The lock is removed when the run ends, however it ends. When the
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: the lock is held, the lock is old, the day has been run, or the place it writes to is not in order. */
export type RefusalKind = 'locked' | 'stale-lock' | 'date-done' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
export class RunRefused extends Error {
  readonly kind: RefusalKind;

  constructor(kind: RefusalKind, message: string) {
    super(message);
    this.name = 'RunRefused';
    this.kind = kind;
  }
}

/** The name of the lock file, in the folder of the runs. */
export const LOCK_FILE = '.lock';

/** A lock older than this is reported as stale: its run may have stopped halfway. It is never removed by a run. */
export const STALE_LOCK_MS = 24 * 3_600_000;

/** The error for a lock that is there: who holds it and since when, and whether it is old enough to be a run that never finished. */
async function refusalFor(file: string, now: Date): Promise<RunRefused> {
  let held: { runId: string; startedAt: Date } | undefined;
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as { runId?: unknown; startedAt?: unknown };
    const startedAt = typeof data.startedAt === 'string' ? new Date(data.startedAt) : undefined;
    if (typeof data.runId === 'string' && startedAt !== undefined && !Number.isNaN(startedAt.getTime())) held = { runId: data.runId, startedAt };
  } catch {
    // A lock that cannot be read is treated as held: the Desk does not guess that it is old.
  }
  if (held === undefined) return new RunRefused('locked', `another run may hold the lock ${file}, which cannot be read, so the Desk does not start`);
  const age = now.getTime() - held.startedAt.getTime();
  if (age > STALE_LOCK_MS) {
    const hours = Math.floor(age / 3_600_000);
    return new RunRefused(
      'stale-lock',
      `the lock ${file} was taken ${hours} hours ago (run ${held.runId}) and was never released: that run may have stopped halfway. If no run is going, delete the file and run again; the Desk does not remove it itself`,
    );
  }
  return new RunRefused('locked', `another run holds the lock ${file} (run ${held.runId}, taken ${held.startedAt.toISOString()}): the Desk does not run twice at once`);
}

/**
 * Take the lock of the runs in `runsDir`, which is created if it is not there. The lock file is made with the exclusive flag, so of two runs that
 * start together only one gets it; it says which run holds it and since when. Resolves to the function that releases the lock (it may be called
 * twice). Throws `RunRefused` when the lock is there, and leaves it as it is.
 */
export async function takeRunLock(runsDir: string, now: Date, runId: string): Promise<() => Promise<void>> {
  const file = path.join(runsDir, LOCK_FILE);
  await mkdir(runsDir, { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify({ pid: process.pid, runId, startedAt: now.toISOString() })}\n`, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw await refusalFor(file, now);
  }
  return () => rm(file, { force: true });
}
```

Run: `npm test --workspace @robywire/desk -- test/run/lock.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing tests of the record of a run**

`RunRecord` is the schema of `run.json`. `readJsonFile` is the part of `readArtifact` that reads a file and checks it, so that the record, which is not named like a stage, is read in the same way and gives the same kind of message.

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, SelectArtifact, VerifyArtifact, candidateId, readArtifact, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { RUN_DATE, candidate } from '../support/candidates';

```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, RunRecord, SelectArtifact, VerifyArtifact, candidateId, readArtifact, readJsonFile, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { defaultConfig } from '../../src/config';
import { RUN_DATE, candidate } from '../support/candidates';

```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
};

/** What parsing `value` with `schema` reports, or '' if it is valid. */
const problem = (schema: z.ZodType, value: unknown): string => {
```

**with:**
```ts
};

const COMMIT = 'a'.repeat(40);
const runRecord = (): RunRecord => ({
  runId: '2026-10-05-043100',
  date: RUN_DATE,
  startedAt: '2026-10-05T04:31:00.000Z',
  finishedAt: '2026-10-05T04:33:10.000Z',
  outcome: 'published',
  stage: 'publish',
  reason: null,
  slug: 'fixture-robotics-ships-fx-1',
  commit: COMMIT,
  dry: false,
  models: defaultConfig().models,
  budget: { limit: defaultConfig().budget, spent: { calls: 4, inputTokens: 21_000, outputTokens: 3_200 } },
  artifacts: ['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json'],
  log: ['select: one story was chosen'],
});

/** What parsing `value` with `schema` reports, or '' if it is valid. */
const problem = (schema: z.ZodType, value: unknown): string => {
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
});

describe('writeJsonFile', () => {
  it('writes a value to the file it is given in the form of an artifact: sorted keys, two-space indents, a final newline', async () => {
```

**with:**
```ts
});

describe('RunRecord', () => {
  it('accepts a run that published, and the same run as a dry run with no commit', () => {
    expect(problem(RunRecord, runRecord())).toBe('');
    expect(problem(RunRecord, { ...runRecord(), dry: true, commit: null })).toBe('');
  });

  it('accepts a commit of 40 hex characters of every digit, which includes zeros', () => {
    expect(problem(RunRecord, { ...runRecord(), commit: HASH.slice(0, 40) })).toBe('');
  });

  it('accepts a hold, with its slug and reason, a run with no story, and a failure, each with a reason and no slug', () => {
    expect(problem(RunRecord, { ...runRecord(), outcome: 'held', stage: 'hold', reason: 'held for TIER2_ATTRIBUTION' })).toBe('');
    expect(problem(RunRecord, { ...runRecord(), outcome: 'no-story', stage: 'select', reason: 'No candidate passed the filters.', slug: null })).toBe('');
    expect(problem(RunRecord, { ...runRecord(), outcome: 'failed', stage: 'compose', reason: 'budget spent: 24 of 24 model calls', slug: null, commit: null })).toBe('');
  });

  it('accepts a run that made no commit because the desk state could not be changed', () => {
    expect(problem(RunRecord, { ...runRecord(), outcome: 'no-story', stage: 'extract', reason: 'too few claims', slug: null, commit: null })).toBe('');
  });

  it('refuses a published run with no slug, or with a reason', () => {
    expect(problem(RunRecord, { ...runRecord(), slug: null })).toBe('outcome: a published run has a slug and no reason');
    expect(problem(RunRecord, { ...runRecord(), reason: 'why' })).toBe('outcome: a published run has a slug and no reason');
  });

  it('refuses a hold with no slug or no reason', () => {
    const held = { ...runRecord(), outcome: 'held', stage: 'hold', reason: 'held for G4_NUMBER_UNSUPPORTED' };
    expect(problem(RunRecord, { ...held, slug: null })).toBe('outcome: a held run has a slug and a reason');
    expect(problem(RunRecord, { ...held, reason: null })).toBe('outcome: a held run has a slug and a reason');
  });

  it('refuses a run with no story or a failure that has no reason, or that has a slug', () => {
    for (const outcome of ['no-story', 'failed']) {
      const record = { ...runRecord(), outcome, stage: 'select', reason: 'why', slug: null, commit: null };
      expect(problem(RunRecord, { ...record, reason: null })).toBe(`outcome: a run that ended in ${outcome} has a reason and no slug`);
      expect(problem(RunRecord, { ...record, slug: 'a-piece' })).toBe(`outcome: a run that ended in ${outcome} has a reason and no slug`);
    }
  });

  it('refuses a dry run with a commit, and a run that published for real with none', () => {
    expect(problem(RunRecord, { ...runRecord(), dry: true })).toBe('commit: a dry run makes no commit');
    expect(problem(RunRecord, { ...runRecord(), commit: null })).toBe('commit: a run that published for real made a commit');
  });

  it('refuses a run that ends before it starts, and accepts one that ends the moment it starts', () => {
    expect(problem(RunRecord, { ...runRecord(), finishedAt: '2026-10-05T04:30:59.999Z' })).toBe('finishedAt: a run cannot end before it starts');
    expect(problem(RunRecord, { ...runRecord(), finishedAt: '2026-10-05T04:31:00.000Z' })).toBe('');
  });

  it('refuses a commit that is not 40 hex characters, a model or a budget that is not the configuration\'s, a negative count, and a field it does not know', () => {
    expect(problem(RunRecord, { ...runRecord(), commit: 'abc123' })).toContain('commit:');
    expect(problem(RunRecord, { ...runRecord(), models: { ...defaultConfig().models, review: 'model-a' } })).toContain('models');
    expect(problem(RunRecord, { ...runRecord(), budget: { ...runRecord().budget, spent: { calls: -1, inputTokens: 0, outputTokens: 0 } } })).toContain('budget.spent.calls:');
    expect(problem(RunRecord, { ...runRecord(), budget: { limit: { maxCalls: 0, maxInputTokens: 1, maxOutputTokens: 1 }, spent: runRecord().budget.spent } })).toContain('budget.limit.maxCalls:');
    expect(problem(RunRecord, { ...runRecord(), note: 'x' })).toBe(': Unrecognized key: "note"');
  });

  it('refuses a date that is not a day, a time that is not a time, an empty run id or stage, and an outcome that is not one of the four', () => {
    expect(problem(RunRecord, { ...runRecord(), date: 'yesterday' })).toContain('date:');
    expect(problem(RunRecord, { ...runRecord(), startedAt: '2026-10-05' })).toContain('startedAt:');
    expect(problem(RunRecord, { ...runRecord(), runId: '' })).toContain('runId:');
    expect(problem(RunRecord, { ...runRecord(), stage: '' })).toContain('stage:');
    expect(problem(RunRecord, { ...runRecord(), outcome: 'done' })).toContain('outcome:');
  });
});

describe('readJsonFile', () => {
  it('reads a file that matches the schema', async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify(runRecord()));
    expect(await readJsonFile(path.join(dir, 'run.json'), 'the run record run.json', RunRecord)).toEqual(runRecord());
  });

  it('says what is missing and where, what is not JSON, and which field does not match, naming the file as it is told to', async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'run.json');
    await expect(readJsonFile(file, 'the run record run.json', RunRecord)).rejects.toThrow(`the run record run.json is not in ${dir}`);
    writeFileSync(file, '{"runId": ');
    await expect(readJsonFile(file, 'the run record run.json', RunRecord)).rejects.toThrow('the run record run.json is not valid JSON');
    writeFileSync(file, JSON.stringify({ ...runRecord(), date: 'yesterday' }));
    await expect(readJsonFile(file, 'the run record run.json', RunRecord)).rejects.toThrow('the run record run.json does not match its schema: date:');
  });
});

describe('writeJsonFile', () => {
  it('writes a value to the file it is given in the form of an artifact: sorted keys, two-space indents, a final newline', async () => {
```

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts`
Expected: FAIL — `readJsonFile is not a function`

- [ ] **Step 4: Write the record of a run**

**In `desk/src/run/artifacts.ts`, replace:**
```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHECK_IDS, CHECK_RESULTS, Claim, Draft, ROUTES } from '@robywire/gate';
import { z } from 'zod';
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
```

**with:**
```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHECK_IDS, CHECK_RESULTS, Claim, Draft, ROUTES, RUN_OUTCOMES } from '@robywire/gate';
import { z } from 'zod';
import { DeskConfig } from '../config';
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
export type HeldArtifact = z.infer<typeof HeldArtifact>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
```

**with:**
```ts
export type HeldArtifact = z.infer<typeof HeldArtifact>;

const count = z.number().int().nonnegative();

/**
 * The record of one run, written when it ends (`run.json` in the folder of the run; a folder that has none is a run that did not end). It says how
 * the run ended and why, which stage ended it, when, whether it was a dry run, which piece and which commit it made, which models it used, what it
 * spent against its budget, which artifacts it left, and what the stages logged. The rules of how a run can end are in the schema, so that a record
 * that says otherwise cannot be written: a published piece has a slug and no reason; a hold has a slug and a reason; a run with no story or a failure
 * has a reason and no slug; a dry run has no commit, and a run that published for real has one.
 */
export const RunRecord = z
  .strictObject({
    runId: text,
    date: isoDate,
    startedAt: isoDateTime,
    finishedAt: isoDateTime,
    outcome: z.enum(RUN_OUTCOMES),
    /** The stage that ended the run: the last that ran (`publish` or `hold` for a run that got to the end, the one that found no story or failed otherwise). */
    stage: text,
    reason: text.nullable(),
    slug: text.nullable(),
    /** The id of the commit that the run made (one commit for each run that is not dry), or null when it made none. */
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'commit must be 40 lowercase hex characters').nullable(),
    dry: z.boolean(),
    models: DeskConfig.shape.models,
    budget: z.strictObject({
      limit: DeskConfig.shape.budget,
      spent: z.strictObject({ calls: count, inputTokens: count, outputTokens: count }),
    }),
    /** The files the run left in its folder, as paths below it, in order: the artifacts of the stages and the held drafts, not the record itself. */
    artifacts: z.array(text),
    log: z.array(z.string()),
  })
  .superRefine((record, context) => {
    const problem = (path: string, message: string): void => context.addIssue({ code: 'custom', path: [path], message });
    if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) problem('finishedAt', 'a run cannot end before it starts');
    if (record.outcome === 'published' && (record.slug === null || record.reason !== null)) problem('outcome', 'a published run has a slug and no reason');
    if (record.outcome === 'held' && (record.slug === null || record.reason === null)) problem('outcome', 'a held run has a slug and a reason');
    if ((record.outcome === 'no-story' || record.outcome === 'failed') && (record.slug !== null || record.reason === null)) {
      problem('outcome', `a run that ended in ${record.outcome} has a reason and no slug`);
    }
    if (record.dry && record.commit !== null) problem('commit', 'a dry run makes no commit');
    if (record.outcome === 'published' && !record.dry && record.commit === null) problem('commit', 'a run that published for real made a commit');
  });
export type RunRecord = z.infer<typeof RunRecord>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
}

/** Read `<dir>/<name>.json` and check it against `schema`. A file that is missing, is not JSON or does not match is an error that says which. */
export async function readArtifact<T>(dir: string, name: string, schema: z.ZodType<T>): Promise<T> {
  const file = fileOf(dir, name);
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the artifact ${name}.json is not in ${dir}`);
    throw error;
  }
```

**with:**
```ts
}

/**
 * Read `file` and check it against `schema`. A file that is missing, is not JSON or does not match is an error that says which, naming it by `label`
 * (`the artifact 02-select.json`) and, for a file that is missing, the folder it is not in.
 */
export async function readJsonFile<T>(file: string, label: string, schema: z.ZodType<T>): Promise<T> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${label} is not in ${path.dirname(file)}`);
    throw error;
  }
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`the artifact ${name}.json is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`the artifact ${name}.json does not match its schema: ${describeIssues(parsed.error)}`);
  return parsed.data;
}
```

**with:**
```ts
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`${label} does not match its schema: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

/** Read `<dir>/<name>.json` and check it against `schema` (see `readJsonFile`). */
export async function readArtifact<T>(dir: string, name: string, schema: z.ZodType<T>): Promise<T> {
  return readJsonFile(fileOf(dir, name), `the artifact ${name}.json`, schema);
}
```

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the failing tests of the preflight**

**In `desk/test/run/target.test.ts`, replace:**
```ts
});

describe('SiteTarget.apply with the real git', () => {
  const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
```

**with:**
```ts
});

describe('SiteTarget.preflight', () => {
  it('passes when the desk state can be read and the state and the two content folders are clean', async () => {
    const { target } = setup();
    await expect(target.preflight()).resolves.toBeUndefined();
  });

  it('refuses, naming the three places, when any of them has a change that is not committed', async () => {
    for (const dirty of [STATE, 'site/src/content/news/older.mdx', 'site/src/content/ledger/older.json']) {
      const { git, target } = setup();
      git.dirty.add(dirty);
      await expect(target.preflight()).rejects.toThrow(`has changes that are not committed (${STATE}, site/src/content/news, site/src/content/ledger)`);
    }
  });

  it('refuses a desk state that cannot be read, before it asks git', async () => {
    const { repoDir, target } = setup();
    writeFileSync(path.join(repoDir, STATE), 'nonsense');
    await expect(target.preflight()).rejects.toThrow('is not valid JSON');
  });

  it('writes nothing and commits nothing', async () => {
    const { repoDir, git, target } = setup();
    const before = filesBelow(repoDir);
    await target.preflight();
    expect(filesBelow(repoDir)).toEqual(before);
    expect(git.commits).toEqual([]);
  });
});

describe('SiteTarget.apply with the real git', () => {
  const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
```

**In `desk/test/run/target.test.ts`, replace:**
```ts
});

describe('DryTarget.apply', () => {
  it('writes nothing: the folders and the desk state are as they were', async () => {
```

**with:**
```ts
});

describe('DryTarget.preflight', () => {
  it('passes when the desk state can be read, and does not ask git, so a dirty checkout does not stop a dry run', async () => {
    const repoDir = makeSite(scratch());
    await expect(new DryTarget(repoDir).preflight()).resolves.toBeUndefined();
  });

  it('refuses a desk state that cannot be read, or that is not there', async () => {
    const repoDir = makeSite(scratch());
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    await expect(new DryTarget(repoDir).preflight()).rejects.toThrow('is not valid JSON');
    rmSync(path.join(repoDir, STATE));
    await expect(new DryTarget(repoDir).preflight()).rejects.toThrow('does not exist');
  });
});

describe('DryTarget.apply', () => {
  it('writes nothing: the folders and the desk state are as they were', async () => {
```

Run: `npm test --workspace @robywire/desk -- test/run/target.test.ts`
Expected: FAIL — `preflight is not a function`

- [ ] **Step 6: Write the preflight**

**In `desk/src/run/target.ts`, replace:**
```ts
  /** True for a target that writes nothing. */
  readonly dry: boolean;
  /**
   * Write the piece (if there is one), change the desk state and commit it all. Refuses, before anything is written, when the slug is taken,
```

**with:**
```ts
  /** True for a target that writes nothing. */
  readonly dry: boolean;
  /**
   * Check, before a run spends anything, that the places it writes to are in order: the desk state can be read and, for a target that writes, nothing
   * in them has a change that is not committed. Throws when they are not.
   */
  preflight(): Promise<void>;
  /**
   * Write the piece (if there is one), change the desk state and commit it all. Refuses, before anything is written, when the slug is taken,
```

**In `desk/src/run/target.ts`, replace:**
```ts
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    const files = await check(this.repoDir, this.paths, change);

    // What the run is about to change must have nothing else of anyone's in it: git is asked before anything is written.
    const watched = change.piece === undefined ? [this.paths.stateFile] : [this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir];
    if (!(await this.git.isClean(watched))) {
      throw new Error(`the site has changes that are not committed (${watched.join(', ')}), so the Desk does not write there: commit or discard them first`);
    }

    const stateFile = path.join(this.repoDir, this.paths.stateFile);
```

**with:**
```ts
  }

  /** Refuse when any of `watched` has a change that is not committed. */
  private async assertClean(watched: string[]): Promise<void> {
    if (!(await this.git.isClean(watched))) {
      throw new Error(`the site has changes that are not committed (${watched.join(', ')}), so the Desk does not write there: commit or discard them first`);
    }
  }

  async preflight(): Promise<void> {
    await readDeskState(path.join(this.repoDir, this.paths.stateFile));
    await this.assertClean([this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir]);
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    const files = await check(this.repoDir, this.paths, change);

    // What the run is about to change must have nothing else of anyone's in it: git is asked before anything is written.
    await this.assertClean(change.piece === undefined ? [this.paths.stateFile] : [this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir]);

    const stateFile = path.join(this.repoDir, this.paths.stateFile);
```

**In `desk/src/run/target.ts`, replace:**
```ts
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
```

**with:**
```ts
  }

  async preflight(): Promise<void> {
    await readDeskState(path.join(this.repoDir, this.paths.stateFile));
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
```

Run: `npm test --workspace @robywire/desk -- test/run/target.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 7: Write the failing test of the entry point, and export the lock**

The lock and the record are a layer below the orchestrator, so the entry point exports them. The orchestrator itself is not exported.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  PublishTarget,
  RateLimiterOptions,
  RobotsGroup,
  RobotsRule,
  SelectArtifact,
  SitePaths,
```

**with:**
```ts
  PublishTarget,
  RateLimiterOptions,
  RefusalKind,
  RobotsGroup,
  RobotsRule,
  RunRecord,
  SelectArtifact,
  SitePaths,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'VerifyArtifact',
  'HeldArtifact',
  'writeJsonFile',
  'runPath',
  'writeArtifact',
```

**with:**
```ts
  'VerifyArtifact',
  'HeldArtifact',
  'RunRecord',
  'writeJsonFile',
  'readJsonFile',
  'runPath',
  'writeArtifact',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'DryTarget',
  'isPlainSlug',
];

```

**with:**
```ts
  'DryTarget',
  'isPlainSlug',
  'RunRefused',
  'takeRunLock',
  'LOCK_FILE',
  'STALE_LOCK_MS',
];

```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      VerifyArtifact,
      HeldArtifact,
      ParsedRobots,
      RobotsRule,
```

**with:**
```ts
      VerifyArtifact,
      HeldArtifact,
      RunRecord,
      RefusalKind,
      ParsedRobots,
      RobotsRule,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...demo]) {
      expect(entry).not.toHaveProperty(name);
    }
```

**with:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...demo]) {
      expect(entry).not.toHaveProperty(name);
    }
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: FAIL — `to have property "RunRefused"`

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/git';
export * from './run/target';
export * from './sources';
```

**with:**
```ts
export * from './run/git';
export * from './run/target';
export * from './run/lock';
export * from './sources';
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 8: Write the failing test of the orchestrator**

The setup of a whole run (a checkout of the site, the folders of the run, the made-up world, a scripted model, a fake git) is the same in every test of this task and of the next ones, so it is a support file of its own.

**Create `desk/test/support/run.ts`:**
```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_CLAIMS, DEMO_REPLY, DEMO_SELECT_REASON, clearingVerifier, demoClient } from '../../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoFetcher, demoRegistry } from '../../src/demo/world';
import { defaultConfig } from '../../src/config';
import type { DeskConfig } from '../../src/config';
import { FakeClient } from '../../src/model/fake';
import { clientFromConfig } from '../../src/model/factory';
import { RunRecord, candidateId } from '../../src/run/artifacts';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { FakeGit } from '../../src/run/git';
import { runDesk } from '../../src/run/orchestrate';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { FETCHED_AT } from './context';
import { filesBelow, makeSite } from './site';

// What the tests of whole runs share: a made-up checkout of the site, a run in the made-up world with a scripted model, and the few ways of reading
// what a run left. Every run is in new folders under the temporary directory with a fake git, so nothing of the real repository is touched.

/** When the runs of the tests start. */
export const START = new Date('2026-10-05T04:31:00.000Z');

/** The desk state, below the checkout of the site. */
export const STATE = sitePaths().stateFile;

/** A clock that gives the start of the run first and a second later each time after, so the record has a start and an end. */
export const clock = (): (() => Date) => {
  let ticks = 0;
  return () => new Date(START.getTime() + 1000 * ticks++);
};

/** The reply of the select model that chooses the report of Mercer Wire on the second plant. */
export const SELECT = { chosenId: candidateId(DEMO_URLS.mercerArticle), reasons: [DEMO_SELECT_REASON] };

export interface RunSetup {
  /** The scripted model; the model that tells the made-up story when none is given. */
  fake?: FakeClient;
  config?: Partial<DeskConfig>;
  /** A dry run: the target writes nothing. */
  dry?: boolean;
  stages?: Partial<Stages>;
  fetcher?: RunDeskOptions['fetcher'];
  forceNew?: boolean;
}

/**
 * A run of the Desk in the made-up world: `run()` runs it, and `run({ ... })` runs it with some of its options replaced. The checkout, the folder of the
 * runs and the folder of the evidence are new, and `git` is the fake that the site target commits with.
 */
export function setupRun(scratch: () => string, options: RunSetup = {}) {
  const root = scratch();
  const repoDir = makeSite(path.join(root, 'repo'));
  const config: DeskConfig = { ...defaultConfig(), runDir: path.join(root, 'runs'), evidenceDir: path.join(root, 'evidence'), ...options.config };
  const git = new FakeGit();
  const fake = options.fake ?? demoClient();
  const logs: string[] = [];
  const base: RunDeskOptions = {
    date: DEMO_DATE,
    config,
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    model: clientFromConfig(config, { kind: 'fake', fake }, {}),
    evidence: new LocalEvidenceStore(config.evidenceDir),
    target: options.dry === true ? new DryTarget(repoDir) : new SiteTarget(repoDir, git),
    ledgerDir: path.join(repoDir, sitePaths().ledgerDir),
    now: clock(),
    log: (line) => void logs.push(line),
    ...(options.stages === undefined ? {} : { stages: options.stages }),
    ...(options.forceNew === undefined ? {} : { forceNew: options.forceNew }),
  };
  const dir = path.join(config.runDir, DEMO_DATE);
  return { base, repoDir, config, git, fake, logs, dir, run: (overrides: Partial<RunDeskOptions> = {}) => runDesk({ ...base, ...overrides }) };
}

/** The record of the run in the folder `dir`. */
export const recordOf = (dir: string): RunRecord => RunRecord.parse(JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8')));

/** What is in the content folders of the site: the pieces and the ledgers. */
export const contentOf = (repoDir: string): string[] => filesBelow(path.join(repoDir, 'site/src/content'));

/** The content folders of a site that has no piece. */
export const EMPTY_CONTENT = ['ledger/.gitkeep', 'news/.gitkeep'];

/** A model that says the story but whose verifier finds the title not entailed in every pass, so that the piece is revised twice and held. */
export function unentailed(): FakeClient {
  const rejecting = (request: Parameters<typeof clearingVerifier>[0]) => {
    const reply = clearingVerifier(request);
    return { ...reply, verdicts: reply.verdicts.map((verdict, at) => (at === 0 ? { ...verdict, verdict: 'not_entailed' as const } : verdict)) };
  };
  return new FakeClient()
    .script('select', SELECT)
    .script('extract', { claims: DEMO_CLAIMS })
    .script('compose', DEMO_REPLY, { replacements: [] }, { replacements: [] })
    .script('verify', rejecting, rejecting, rejecting);
}
```

**Create `desk/test/run/orchestrate.test.ts`:**
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, demoClient } from '../../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoFetcher, demoRegistry } from '../../src/demo/world';
import type { DeskConfig } from '../../src/config';
import { FetchError } from '../../src/fetch/http';
import { FakeClient } from '../../src/model/fake';
import { clientFromConfig } from '../../src/model/factory';
import { VerifyArtifact, readArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { Stages } from '../../src/run/orchestrate';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
import { FETCHED_AT, useScratch, withPages } from '../support/context';
import { EMPTY_CONTENT, SELECT, START, STATE, clock, contentOf, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE, filesBelow } from '../support/site';

// One run of the Desk, from end to end. Most of these tests run the real stages in the made-up world with a scripted model, so that the whole
// pipeline is under test; a few put a stage of their own in the place of a stage, to make it throw. Every run is in new folders under the temporary
// directory, with a fake git, so that nothing of the real repository is touched.

const scratch = useScratch();
const setup = (options: RunSetup = {}) => setupRun(scratch, options);

describe('runDesk: a clean story', () => {
  it('ends published, with the slug of the piece and the commit that holds it', async () => {
    const { run, git } = setup();
    const result = await run();
    expect(result.outcome).toBe('published');
    expect(result.slug).toBe('fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant');
    expect(result.stage).toBe('publish');
    expect(result.reason).toBeNull();
    expect(result.dry).toBe(false);
    expect(git.commits).toHaveLength(1);
    expect(result.commit).toBe(git.commits[0]?.id);
  });

  it('writes the piece and its ledger into the site, and records the run in the desk state, in one commit of the three files', async () => {
    const { run, repoDir, git } = setup();
    const result = await run();
    const slug = result.slug as string;
    expect(contentOf(repoDir)).toEqual(['ledger/.gitkeep', `ledger/${slug}.json`, 'news/.gitkeep', `news/${slug}.mdx`]);
    expect(git.commits[0]?.paths).toEqual([sitePaths().newsFile(slug), sitePaths().ledgerFile(slug), STATE]);
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun).toEqual({ at: START.toISOString(), outcome: 'published', runId: '2026-10-05-043100', slug });
    expect(result.files).toEqual(git.commits[0]?.paths);
  });

  it('leaves one artifact for each stage in the folder of the run, and the record', async () => {
    const { run, dir } = setup();
    const result = await run();
    expect(result.dir).toBe(dir);
    expect(filesBelow(dir)).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'run.json']);
    expect((await readArtifact(dir, '06-verify', VerifyArtifact)).outcome).toBe('publish');
  });

  it('writes a record that says how the run went: when, how, which models, what it spent, which artifacts, and what the stages logged', async () => {
    const { run, dir, config, logs } = setup();
    const result = await run();
    const record = recordOf(dir);
    expect(record).toEqual({
      runId: '2026-10-05-043100',
      date: DEMO_DATE,
      startedAt: '2026-10-05T04:31:00.000Z',
      finishedAt: '2026-10-05T04:31:01.000Z',
      outcome: 'published',
      stage: 'publish',
      reason: null,
      slug: result.slug,
      commit: result.commit,
      dry: false,
      models: config.models,
      budget: { limit: config.budget, spent: record.budget.spent },
      artifacts: ['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json'],
      log: logs,
    });
    expect(record.budget.spent.calls).toBe(4);
    expect(record.budget.spent.inputTokens).toBeGreaterThan(0);
    expect(logs.some((line) => line.startsWith('extract: 7 claims proposed, 7 kept, 0 dropped'))).toBe(true);
  });

  it('gives each stage the same date and folder, and reads the published pieces from the ledger folder: a story that is already published is not on the shortlist', async () => {
    const first = setup();
    await first.run();
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] });
    const second = await first.run({ model: clientFromConfig(first.config, { kind: 'fake', fake }, {}), forceNew: true, now: clock() });
    expect(second.outcome).toBe('no-story');
    expect(fake.calls[0]?.user).not.toContain('FX-1 deliveries to Brindle');
    expect(fake.calls[0]?.user).toContain('Northwind Handling');
  });
});

describe('runDesk: a dry run', () => {
  it('ends published and makes no commit, and writes nothing into the site or the desk state', async () => {
    const { run, repoDir } = setup({ dry: true });
    const result = await run();
    expect(result.outcome).toBe('published');
    expect(result.dry).toBe(true);
    expect(result.commit).toBeNull();
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });

  it('leaves the artifacts and a record that says dry, and says which files it would have written', async () => {
    const { run, dir } = setup({ dry: true });
    const result = await run();
    expect(filesBelow(dir)).toContain('06-verify.json');
    const record = recordOf(dir);
    expect(record.dry).toBe(true);
    expect(record.commit).toBeNull();
    expect(result.files).toHaveLength(3);
  });
});

describe('runDesk: a piece that is held', () => {
  it('ends held, with the reasons, and writes the held draft into the run and nothing into the pages of the site', async () => {
    const { run, repoDir, dir, git } = setup({ fake: unentailed() });
    const result = await run();
    expect(result.outcome).toBe('held');
    expect(result.stage).toBe('hold');
    expect(result.reason).toBe('held for G10_NOT_ENTAILED');
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(existsSync(path.join(dir, 'held', `${result.slug}.json`))).toBe(true);
    expect(recordOf(dir).artifacts).toContain(`held/${result.slug}.json`);
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
  });

  it('adds the hold to the desk state and records the run as held', async () => {
    const { run, repoDir } = setup({ fake: unentailed() });
    const result = await run();
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.lastRun).toEqual({ at: START.toISOString(), outcome: 'held', runId: result.runId, slug: result.slug });
    expect(state.holds).toEqual([{ at: START.toISOString(), categories: ['humanoids'], reasons: ['G10_NOT_ENTAILED'] }]);
  });
});

describe('runDesk: no story', () => {
  it('ends no-story at Select when the model chooses none, with its reasons', async () => {
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.', 'The tariff story is old.'] });
    const { run, dir, repoDir, git } = setup({ fake });
    const result = await run();
    expect(result.outcome).toBe('no-story');
    expect(result.stage).toBe('select');
    expect(result.reason).toBe('Nothing new today. The tariff story is old.');
    expect(result.slug).toBeNull();
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(recordOf(dir)).toMatchObject({ outcome: 'no-story', stage: 'select', slug: null });
  });

  it('records the run in the desk state, with no slug, and leaves the holds as they were', async () => {
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] });
    const { run, repoDir } = setup({ fake });
    const result = await run();
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: START.toISOString(), outcome: 'no-story', runId: result.runId, slug: null },
      holds: [],
      corrections: [],
    });
  });

  it('ends no-story at Fetch when no page of the story can be had', async () => {
    const fetcher = withPages(demoFetcher(() => FETCHED_AT), { [DEMO_URLS.mercerArticle]: new FetchError('robots', DEMO_URLS.mercerArticle, 'robots.txt does not allow it') });
    const fake = new FakeClient().script('select', SELECT);
    const { run } = setup({ fake, fetcher });
    const result = await run();
    expect(result.outcome).toBe('no-story');
    expect(result.stage).toBe('fetch');
    expect(result.reason).toContain('none of the pages of the story could be fetched');
  });

  it('ends no-story at Extract when too few claims survive the checks', async () => {
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS.slice(0, 2) });
    const { run } = setup({ fake });
    const result = await run();
    expect(result.outcome).toBe('no-story');
    expect(result.stage).toBe('extract');
    expect(result.reason).toContain('at least 3 are needed to write a piece');
  });
});

describe('runDesk: a run that fails', () => {
  const boom = (): Partial<Stages> => ({
    compose: async () => {
      throw new Error('the composer fell over');
    },
  });

  it('ends failed when a stage throws, with the message and the name of the stage, and publishes nothing', async () => {
    const { run, repoDir, dir } = setup({ stages: boom() });
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('compose');
    expect(result.reason).toBe('the composer fell over');
    expect(result.slug).toBeNull();
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(recordOf(dir)).toMatchObject({ outcome: 'failed', stage: 'compose', reason: 'the composer fell over' });
  });

  it('records the failure in the desk state and in one commit of the desk state alone', async () => {
    const { run, repoDir, git } = setup({ stages: boom() });
    const result = await run();
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun).toEqual({ at: START.toISOString(), outcome: 'failed', runId: result.runId, slug: null });
    expect(git.commits.map((commit) => [commit.paths, commit.message])).toEqual([[[STATE], 'desk: the run of 2026-10-05 failed']]);
  });

  it('names the stage that threw, whichever it is', async () => {
    for (const name of ['discover', 'select', 'fetch', 'extract', 'compose', 'verify'] as const) {
      const thrower = async () => {
        throw new Error(`${name} threw`);
      };
      const { run } = setup({ stages: { [name]: thrower } as Partial<Stages> });
      const result = await run();
      expect([result.outcome, result.stage, result.reason]).toEqual(['failed', name, `${name} threw`]);
    }
  });

  it('ends failed at Publish when the stage throws, and at Hold when that does', async () => {
    const publishing = setup({
      stages: {
        publish: async () => {
          throw new Error('the site refused');
        },
      },
    });
    expect([(await publishing.run()).stage, (await publishing.run({ forceNew: true, model: clientFromConfig(publishing.config, { kind: 'fake', fake: demoClient() }, {}), now: clock() })).reason]).toEqual(['publish', 'the site refused']);
    const holding = setup({
      fake: unentailed(),
      stages: {
        hold: async () => {
          throw new Error('no place to hold it');
        },
      },
    });
    expect((await holding.run()).stage).toBe('hold');
  });

  it('ends failed when the model answers with something that is not what was asked for, with nothing published', async () => {
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: [{ text: 'x' }] });
    const { run, repoDir } = setup({ fake });
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('extract');
    expect(result.reason).toContain('does not match its schema');
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
  });

  it('ends failed when the budget of the run is spent, at the call that would go over it, with nothing published', async () => {
    const config = { budget: { maxCalls: 2, maxInputTokens: 400_000, maxOutputTokens: 60_000 } };
    const { run, repoDir, dir } = setup({ config });
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('compose');
    expect(result.reason).toBe('budget spent: 2 of 2 model calls');
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(recordOf(dir).budget.spent.calls).toBe(2);
    expect(recordOf(dir).budget.limit.maxCalls).toBe(2);
  });

  it('ends failed at Discover when the registry has nothing to read, and at the start when the ledgers cannot be read', async () => {
    const empty = setup();
    const registry = demoRegistry();
    registry.primary.companies = {};
    registry.secondary = [];
    const none = await empty.run({ sources: registry });
    expect([none.outcome, none.stage]).toEqual(['failed', 'discover']);
    const unreadable = setup();
    const result = await unreadable.run({ ledgerDir: path.join(unreadable.repoDir, 'no-such-folder') });
    expect([result.outcome, result.stage]).toEqual(['failed', 'start']);
    expect(result.reason).toContain('does not exist');
  });

  it('says in the reason when the desk state could not be recorded, still ends failed, and puts the checkout back', async () => {
    const { run, repoDir, git, dir } = setup({ stages: { discover: async () => { throw new Error('the feeds are down'); } } });
    git.failNextCommit = new Error('git commit failed: disk full');
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('the feeds are down (the desk state could not be updated: git commit failed: disk full)');
    expect(result.commit).toBeNull();
    expect(result.files).toEqual([]);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(recordOf(dir).reason).toBe(result.reason);
  });
});

describe('runDesk: the lock', () => {
  it('holds the lock while the run is going and removes it when the run ends', async () => {
    const lockFile = (config: DeskConfig): string => path.join(config.runDir, LOCK_FILE);
    let seen: boolean | undefined;
    const holder = setup();
    const result = await holder.run({
      stages: {
        discover: async (ctx) => {
          seen = existsSync(lockFile(holder.config));
          return runDiscover(ctx);
        },
      },
    });
    expect(result.outcome).toBe('published');
    expect(seen).toBe(true);
    expect(existsSync(lockFile(holder.config))).toBe(false);
  });

  it('removes the lock when the run fails, when it ends with no story and when it is held', async () => {
    for (const options of [
      { stages: { compose: async () => { throw new Error('x'); } } },
      { fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) },
      { fake: unentailed() },
    ] as RunSetup[]) {
      const made = setup(options);
      await made.run();
      expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
    }
  });

  it('refuses to start while another run holds the lock, runs no stage and records nothing, and leaves the lock', async () => {
    const { run, config, repoDir, fake, git } = setup();
    mkdirSync(config.runDir, { recursive: true });
    const lock = path.join(config.runDir, LOCK_FILE);
    writeFileSync(lock, `${JSON.stringify({ pid: 1, runId: 'other', startedAt: START.toISOString() })}\n`);
    const error = await run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RunRefused);
    expect((error as RunRefused).kind).toBe('locked');
    expect(fake.calls).toEqual([]);
    expect(git.commits).toEqual([]);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(path.join(config.runDir, DEMO_DATE))).toBe(false);
  });

  it('reports a lock that is more than a day old, and does not remove it', async () => {
    const { run, config } = setup();
    mkdirSync(config.runDir, { recursive: true });
    const lock = path.join(config.runDir, LOCK_FILE);
    writeFileSync(lock, `${JSON.stringify({ pid: 1, runId: 'crashed', startedAt: '2026-10-03T04:31:00.000Z' })}\n`);
    const error = await run().catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('stale-lock');
    expect((error as RunRefused).message).toContain('was taken 48 hours ago');
    expect(existsSync(lock)).toBe(true);
  });
});

describe('runDesk: the day of the run', () => {
  it('refuses a day that already has a run that ended, runs no stage, leaves the old run as it was, and removes the lock', async () => {
    const made = setup();
    await made.run();
    const before = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    const fake = demoClient();
    const error = await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), now: clock() }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RunRefused);
    expect((error as RunRefused).kind).toBe('date-done');
    expect((error as RunRefused).message).toContain('run it again with --force-new');
    expect(fake.calls).toEqual([]);
    expect(readFileSync(path.join(made.dir, 'run.json'), 'utf8')).toBe(before);
    expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
  });

  it('with forceNew, moves the old run aside, keeps it whole, and runs again; the next time it moves that aside too', async () => {
    const made = setup();
    await made.run();
    const firstRecord = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    for (const number of [1, 2]) {
      const fake = new FakeClient().script('select', { chosenId: null, reasons: ['none'] });
      const result = await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), forceNew: true, now: clock() });
      expect(result.outcome).toBe('no-story');
      expect(existsSync(`${made.dir}.old-${number}`)).toBe(true);
    }
    expect(readFileSync(path.join(`${made.dir}.old-1`, 'run.json'), 'utf8')).toBe(firstRecord);
    expect(filesBelow(made.dir)).toEqual(['01-discover.json', '02-select.json', 'run.json']);
    expect(recordOf(`${made.dir}.old-2`).outcome).toBe('no-story');
  });

  it('does not take the artifacts of an old run for the new one: the folder starts empty', async () => {
    const made = setup();
    await made.run();
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['none'] });
    await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), forceNew: true, now: clock() });
    expect(existsSync(path.join(made.dir, '06-verify.json'))).toBe(false);
  });

  it('starts again in a folder that has artifacts but no record, which is a run that never ended, and moves that folder aside too', async () => {
    const made = setup();
    mkdirSync(made.dir, { recursive: true });
    writeFileSync(path.join(made.dir, '01-discover.json'), '{}');
    const result = await made.run();
    expect(result.outcome).toBe('published');
    expect(readFileSync(path.join(`${made.dir}.old-1`, '01-discover.json'), 'utf8')).toBe('{}');
  });

  it('refuses a date that is not a day, before it takes the lock', async () => {
    const made = setup();
    await expect(made.run({ date: '2026-02-30' })).rejects.toThrow('is not a date');
    expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
  });
});

describe('runDesk: the place it writes to', () => {
  it('refuses to start when the site has changes that are not committed, before any call to the model, and records nothing', async () => {
    const { run, git, fake, config } = setup();
    git.dirty.add(STATE);
    const error = await run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RunRefused);
    expect((error as RunRefused).kind).toBe('target');
    expect((error as RunRefused).message).toContain('has changes that are not committed');
    expect(fake.calls).toEqual([]);
    expect(git.commits).toEqual([]);
    expect(existsSync(path.join(config.runDir, LOCK_FILE))).toBe(false);
  });

  it('refuses to start when the desk state cannot be read', async () => {
    const { run, repoDir } = setup();
    writeFileSync(path.join(repoDir, STATE), 'nonsense');
    const error = await run().catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('target');
    expect((error as RunRefused).message).toContain('is not valid JSON');
  });
});

describe('runDesk: one run, one commit', () => {
  it('makes exactly one commit for a run that is not dry, whatever the outcome, and none for a dry run', async () => {
    const outcomes = new Map<string, number>();
    for (const [name, options] of Object.entries({
      published: {},
      held: { fake: unentailed() },
      'no-story': { fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) },
      failed: { stages: { compose: async () => { throw new Error('x'); } } },
      dry: { dry: true },
    }) as [string, RunSetup][]) {
      const made = setup(options);
      const result = await made.run();
      outcomes.set(name, made.git.commits.length);
      expect(result.dry).toBe(name === 'dry');
    }
    expect([...outcomes]).toEqual([['published', 1], ['held', 1], ['no-story', 1], ['failed', 1], ['dry', 0]]);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/orchestrate.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/orchestrate'`

- [ ] **Step 9: Write the orchestrator**

**Create `desk/src/run/orchestrate.ts`:**
```ts
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, DeskConfig, EvidenceStore, Fetcher, PublishTarget } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
import type { StageContext } from '../stages/context';
import { runDiscover } from '../stages/discover';
import { runExtract } from '../stages/extract';
import { runFetch } from '../stages/fetch';
import { runHold } from '../stages/hold';
import { runPublish } from '../stages/publish';
import { runSelect } from '../stages/select';
import { runVerify } from '../stages/verify';

// The orchestrator: one run of the Desk, from the stories of the day to a piece on the site, a hold, no story, or a failure. It gives every stage the same
// context, passes each stage what the one before it made, and ends in one of four outcomes. It never lets anything half done stand: a stage that throws
// ends the run as `failed` with the reason and the name of the stage, and nothing is published on the strength of it. Every run that is not dry ends with
// one commit and a record, `run.json`, in the folder of its day.

/** The stages, as functions, so that a test can put one of its own in the place of a stage. The defaults are the stages of the Desk. */
export interface Stages {
  discover: typeof runDiscover;
  select: typeof runSelect;
  fetch: typeof runFetch;
  extract: typeof runExtract;
  compose: typeof runCompose;
  verify: typeof runVerify;
  publish: typeof runPublish;
  hold: typeof runHold;
}

export const DEFAULT_STAGES: Stages = {
  discover: runDiscover,
  select: runSelect,
  fetch: runFetch,
  extract: runExtract,
  compose: runCompose,
  verify: runVerify,
  publish: runPublish,
  hold: runHold,
};

export interface RunDeskOptions {
  /** The day of the run, YYYY-MM-DD. */
  date: string;
  config: DeskConfig;
  sources: SourcesRegistry;
  fetcher: Fetcher;
  /** The model client of the run, inside its budget, and what it has spent: what `clientFromConfig` makes. */
  model: BuiltClient;
  evidence: EvidenceStore;
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
  target: PublishTarget;
  /** The folder of the ledgers of the published pieces, which says what has been published. */
  ledgerDir: string;
  /** The clock. It is read for the time of the run and nowhere else; the stages never read it. */
  now: () => Date;
  /** Run again for a day that already has a run: the folder of the old run is moved aside, not removed. */
  forceNew?: boolean;
  /** A line for the log of the run, as it happens. Every line is also kept in the record. */
  log?: (line: string) => void;
  stages?: Partial<Stages>;
}

export interface RunResult {
  outcome: RunOutcome;
  runId: string;
  /** The stage that ended the run (see `RunRecord`). */
  stage: string;
  /** Why, for a hold, no story or a failure; null for a piece that was published. */
  reason: string | null;
  slug: string | null;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
  dry: boolean;
  /** The folder of the run. */
  dir: string;
  /** The files that the commit of the run covers (or would have covered, in a dry run). */
  files: string[];
}

/** The id of a run: its day and the time it started, to the second, in UTC (`2026-10-05-043100`). */
function runIdOf(date: string, start: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${date}-${two(start.getUTCHours())}${two(start.getUTCMinutes())}${two(start.getUTCSeconds())}`;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Every file in the folder of a run, below it, in order: the artifacts and the held drafts, but not the cassettes (the record is written after this is read). */
async function artifactsIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((name) => !name.startsWith('cassettes/'))
    .sort();
}

/**
 * Make the folder of the run ready. A folder that holds a record of a run that ended is refused, unless `forceNew` says to run again. A folder that is
 * there for any other reason (a run that never ended, or `forceNew`) is moved aside to `<folder>.old-1`, or the first number that is free, so that the
 * folder of a run never holds the artifacts of two runs, and nothing is removed.
 */
async function prepareFolder(dir: string, date: string, forceNew: boolean): Promise<void> {
  if (!(await exists(dir))) return;
  if (!forceNew && (await exists(path.join(dir, 'run.json')))) {
    throw new RunRefused('date-done', `the run of ${date} is already done (${path.join(dir, 'run.json')} is there): run it again with --force-new, which keeps the old run beside the new one`);
  }
  for (let number = 1; ; number++) {
    const aside = `${dir}.old-${number}`;
    if (await exists(aside)) continue;
    await rename(dir, aside);
    return;
  }
}

/** How the pipeline ended, before the run is recorded. */
type Ending =
  | { outcome: 'no-story'; stage: string; reason: string }
  | { outcome: 'published'; stage: 'publish'; slug: string; commit: string | null; files: string[] }
  | { outcome: 'held'; stage: 'hold'; slug: string; reason: string; commit: string | null; files: string[] }
  | { outcome: 'failed'; stage: string; reason: string };

/**
 * Run the Desk for one day.
 *
 * Before anything else the run takes the lock (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends),
 * and is refused when the lock is held, when the day already has a run (unless `forceNew`), or when the site has changes that are not committed where
 * the Desk writes. A refusal is a `RunRefused` error: nothing ran, so nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage) or `held` (the
 * Hold stage). Anything a stage throws, a model error and a spent budget included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
export async function runDesk(options: RunDeskOptions): Promise<RunResult> {
  const { date, config, target } = options;
  const dir = runPath(config.runDir, date);
  const startedAt = options.now();
  const runId = runIdOf(date, startedAt);
  const stages: Stages = { ...DEFAULT_STAGES, ...options.stages };

  const release = await takeRunLock(config.runDir, startedAt, runId);
  try {
    await prepareFolder(dir, date, options.forceNew === true);
    try {
      await target.preflight();
    } catch (error) {
      throw new RunRefused('target', describeError(error));
    }
    await mkdir(dir, { recursive: true });

    const lines: string[] = [];
    const log = (line: string): void => {
      lines.push(line);
      options.log?.(line);
    };
    const run = { runId, at: startedAt.toISOString() };
    let stage = 'start';

    const pipeline = async (): Promise<Ending> => {
      const ctx: StageContext = {
        date,
        config,
        sources: options.sources,
        fetcher: options.fetcher,
        client: options.model.client,
        evidence: options.evidence,
        runDir: dir,
        published: await loadPublishedIndex(options.ledgerDir),
        log,
      };
      stage = 'discover';
      const discovered = await stages.discover(ctx);
      stage = 'select';
      const selected = await stages.select(ctx, discovered);
      if (selected.chosen === null) return { outcome: 'no-story', stage, reason: selected.reasons.join(' ') };
      stage = 'fetch';
      const fetched = await stages.fetch(ctx, selected);
      if (!fetched.ok) return { outcome: 'no-story', stage, reason: fetched.reason };
      stage = 'extract';
      const extracted = await stages.extract(ctx, fetched.snapshots, selected);
      if (!extracted.ok) return { outcome: 'no-story', stage, reason: extracted.reason };
      const claims: Claim[] = extracted.artifact.claims;
      stage = 'compose';
      const composed = await stages.compose(ctx, claims);
      stage = 'verify';
      const verified = await stages.verify(ctx, claims, composed);
      if (verified.outcome === 'publish') {
        stage = 'publish';
        const published = await stages.publish(ctx, target, claims, verified, run);
        return { outcome: 'published', stage: 'publish', slug: published.slug, commit: published.commit, files: published.files };
      }
      stage = 'hold';
      const held = await stages.hold(ctx, target, claims, verified, run);
      return { outcome: 'held', stage: 'hold', slug: held.slug, reason: `held for ${held.reasons.join(', ')}`, commit: held.commit, files: held.files };
    };

    let ending: Ending;
    try {
      ending = await pipeline();
    } catch (error) {
      ending = { outcome: 'failed', stage, reason: describeError(error) };
    }

    // A run that published or held has recorded itself in the desk state; the other two outcomes are recorded here. A record that cannot be made is said in
    // the reason, and does not change how the run ended.
    let commit: string | null = ending.outcome === 'published' || ending.outcome === 'held' ? ending.commit : null;
    let files: string[] = ending.outcome === 'published' || ending.outcome === 'held' ? ending.files : [];
    if (ending.outcome === 'no-story' || ending.outcome === 'failed') {
      const { outcome } = ending;
      try {
        const result = await target.apply({
          state: (state) => recordRun(state, { at: run.at, outcome, runId, slug: null }),
          message: outcome === 'failed' ? `desk: the run of ${date} failed` : `desk: no story on ${date}`,
        });
        commit = result.commit;
        files = result.files;
      } catch (error) {
        ending = { ...ending, reason: `${ending.reason} (the desk state could not be updated: ${describeError(error)})` };
      }
    }

    const slug = ending.outcome === 'published' || ending.outcome === 'held' ? ending.slug : null;
    const reason = ending.outcome === 'published' ? null : ending.reason;
    const record: RunRecord = {
      runId,
      date,
      startedAt: startedAt.toISOString(),
      finishedAt: options.now().toISOString(),
      outcome: ending.outcome,
      stage: ending.stage,
      reason,
      slug,
      commit,
      dry: target.dry,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
      artifacts: await artifactsIn(dir),
      log: lines,
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, commit, dry: target.dry, dir, files };
  } finally {
    await release();
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/run/orchestrate.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 11: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 12: Commit**

```bash
git add desk/src/run/lock.ts desk/src/run/orchestrate.ts desk/src/run/artifacts.ts desk/src/run/target.ts desk/src/index.ts desk/test/run/lock.test.ts desk/test/run/orchestrate.test.ts desk/test/support/run.ts desk/test/run/artifacts.test.ts desk/test/run/target.test.ts desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the orchestrator: one run from the stories of the day to a piece, a hold, no story or a failure, under a lock, once for each day, with every error ended as a failed run that names its stage, one commit and a record" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 35: Replay

**Files:**
- Create: `desk/src/run/replay.ts` (`REPLAYED`, `ReplayOptions`, `ReplayedArtifact`, `ReplayReport`, `replayRun`)
- Modify: `desk/src/model/factory.ts` (a folder to record the replies in)
- Modify: `desk/src/stages/context.ts` (`loadPublishedIndex` takes a filter)
- Modify: `desk/test/support/run.ts` (a run that records its replies)
- Modify: `desk/test/model/factory.test.ts`, `desk/test/stages/context.test.ts`, `desk/test/fetch/exports.test.ts`
- Test: `desk/test/run/replay.test.ts`

`replayRun(runDir, options)` runs the stages that read a model, Extract, Compose and Verify, **again, from what the run itself kept**, with no network and no model, and says whether each artifact it makes is the one the run stored. It is how a change to the code, to a prompt or to the evidence shows itself: the result differs, or the replay says that a reply it needs was never recorded.

**What a run keeps.** The pages it read are in the evidence store, named by the hash that `03-fetch.json` lists; the story that Select chose is in `02-select.json`. The replies of the model are kept as **cassettes** (the `RecordingClient` of part 2), and this task lets the factory do it: `clientFromConfig(config, choice, env, retry, record)` keeps a cassette of every call that the chosen client answers in the folder `record`, as the innermost layer (a call that fails is not recorded; a retry that succeeds is, once, and every try counts against the budget). The cassettes of a run are in `cassettes` in its folder, which the record of the run (Task 34) leaves out of its list of artifacts. A cassette holds the hashes of the prompts and not their text, and no key.

**What a replay does.** It reads `run.json`, `02-select.json` and `03-fetch.json` (without them there is nothing to start from, and it throws), rebuilds the pages from the evidence store (which refuses a page whose text no longer matches its hash), and runs Extract, then Compose, then Verify with a `RecordedClient` over the cassettes. The stages write their artifacts in a **folder of the replay's own**, which is removed at the end, so a replay never writes into the folder of the run. Then it compares each artifact with the stored one: `equal`, `different` (the report names the first place, such as `claims[0].label`, with both values), `missing` (the run has it and the replay did not get to make it) or `unexpected` (the replay made one that the run does not have). `equal` is true only when the replay ran to the end, there was at least one artifact and every one is equal. A replay that stops early (a reply that was never recorded, evidence that is gone or has changed) says why in `error`.

**The published pieces are those there were when the run began.** The slug of a piece depends on what is published, and so does the check for a title that is too close to a recent one, so a replay of a run after it published would see its own piece and come out different. `loadPublishedIndex` therefore takes a filter (`keep`), and the replay counts a ledger only when it was published on an earlier day, or on the same day by an earlier run (run ids sort by time), so a piece written by the run itself, or by a later run, is left out.

**No network.** `fetcher` is an option, and by default it refuses every request; the stages that a replay runs do not fetch, and a test hands in a fetcher that counts and shows that it is never called.

- [ ] **Step 1: Write the failing test of recording**

**In `desk/test/model/factory.test.ts`, replace:**
```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
```

**with:**
```ts
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
```

**In `desk/test/model/factory.test.ts`, replace:**
```ts
});

describe('clientFromConfig with recorded responses', () => {
  it('replays the cassettes in the folder it was given', async () => {
```

**with:**
```ts
});

describe('clientFromConfig with a folder to record in', () => {
  it('keeps a cassette of every call the chosen client answers, which a recorded client then replays', async () => {
    const dir = path.join(scratch, 'recording');
    const fake = new FakeClient().script('select', { answer: 'one' }, { answer: 'two' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait, dir);
    await built.client.json(request());
    await built.client.json(request({ user: 'Say goodbye.' }));
    expect(readdirSync(dir)).toHaveLength(2);
    const replay = clientFromConfig(defaultConfig(), { kind: 'recorded', cassetteDir: dir }, {});
    expect((await replay.client.json(request())).value).toEqual({ answer: 'one' });
    expect((await replay.client.json(request({ user: 'Say goodbye.' }))).value).toEqual({ answer: 'two' });
  });

  it('records nothing for a call that fails, and creates no folder when there is no call', async () => {
    const dir = path.join(scratch, 'failing');
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient() }, {}, noWait, dir);
    expect(existsSync(dir)).toBe(false);
    await expect(built.client.json(request())).rejects.toThrow('no scripted reply left');
    expect(existsSync(dir)).toBe(false);
  });

  it('records a call that succeeds after a retry, once, and counts every try against the budget', async () => {
    const dir = path.join(scratch, 'retrying');
    const flaky = new FakeClient().script('select', overloaded(), { answer: 'second try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: flaky }, {}, noWait, dir);
    await built.client.json(request());
    expect(readdirSync(dir)).toHaveLength(1);
    expect(built.spent().calls).toBe(2);
  });

  it('records nothing when it is not given a folder', async () => {
    const before = readdirSync(scratch).length;
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient().script('select', { answer: 'x' }) }, {});
    await built.client.json(request());
    expect(readdirSync(scratch)).toHaveLength(before);
  });
});

describe('clientFromConfig with recorded responses', () => {
  it('replays the cassettes in the folder it was given', async () => {
```

Run: `npm test --workspace @robywire/desk -- test/model/factory.test.ts`
Expected: FAIL — `no such file or directory, scandir`

- [ ] **Step 2: Record the replies in a folder when the factory is told to**

**In `desk/src/model/factory.ts`, replace:**
```ts
import type { Spent } from './budgeted';
import type { FakeClient } from './fake';
import { RecordedClient } from './recorded';
import { RetryClient } from './retry';
import type { RetryOptions } from './retry';
```

**with:**
```ts
import type { Spent } from './budgeted';
import type { FakeClient } from './fake';
import { RecordedClient, RecordingClient } from './recorded';
import { RetryClient } from './retry';
import type { RetryOptions } from './retry';
```

**In `desk/src/model/factory.ts`, replace:**
```ts
 * and a missing or blank key is refused before anything is built. `retry` changes how retrying
 * waits, which a test needs.
 */
export function clientFromConfig(config: DeskConfig, choice: ClientChoice, env: Environment, retry: RetryOptions = {}): BuiltClient {
  const budgeted = new BudgetedClient(chosenClient(choice, env), config.budget);
  return { client: new RetryClient(budgeted, retry), spent: () => budgeted.spent() };
}
```

**with:**
```ts
 * and a missing or blank key is refused before anything is built. `retry` changes how retrying
 * waits, which a test needs.
 *
 * With `record`, a folder, every call that the chosen client answers is kept in it as a cassette
 * (see `RecordingClient`), so that the run can be replayed later with no model and no network.
 * Recording is the innermost layer: a call that fails is not recorded, and a retry that succeeds is.
 */
export function clientFromConfig(config: DeskConfig, choice: ClientChoice, env: Environment, retry: RetryOptions = {}, record?: string): BuiltClient {
  const chosen = chosenClient(choice, env);
  const budgeted = new BudgetedClient(record === undefined ? chosen : new RecordingClient(chosen, record), config.budget);
  return { client: new RetryClient(budgeted, retry), spent: () => budgeted.spent() };
}
```

Run: `npm test --workspace @robywire/desk -- test/model/factory.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the failing test of the filter of the published pieces**

**In `desk/test/stages/context.test.ts`, replace:**
```ts
  });

  it('does not create the folder it is asked about', async () => {
    const dir = scratch();
```

**with:**
```ts
  });

  it('counts only the ledgers that `keep` says yes to, and still refuses one that is not valid', async () => {
    const all = await loadPublishedIndex(FIXTURE_LEDGERS);
    const first = all.slugs[0] as string;
    const kept = await loadPublishedIndex(FIXTURE_LEDGERS, (entry) => entry.slug !== first);
    expect(kept.slugs).toEqual(all.slugs.slice(1));
    expect(kept.titles).toEqual(all.titles.slice(1));
    expect(await loadPublishedIndex(FIXTURE_LEDGERS, () => false)).toEqual(emptyPublished());
    const dir = scratch();
    writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ slug: 'x' }));
    await expect(loadPublishedIndex(dir, () => false)).rejects.toThrow('the ledger broken.json is not valid: ');
  });

  it('gives `keep` the whole ledger entry, so that it can read its run and its day', async () => {
    const seen: string[] = [];
    await loadPublishedIndex(FIXTURE_LEDGERS, (entry) => {
      seen.push(`${entry.runId} ${entry.publishedAt}`);
      return true;
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((line) => /^\S+ \d{4}-\d{2}-\d{2}$/.test(line))).toBe(true);
  });

  it('does not create the folder it is asked about', async () => {
    const dir = scratch();
```

Run: `npm test --workspace @robywire/desk -- test/stages/context.test.ts`
Expected: FAIL — `to deeply equal`

- [ ] **Step 4: Write the filter**

**In `desk/src/stages/context.ts`, replace:**
```ts
 * `site/src/content/ledger`; today it holds none). Other files in the folder are ignored. A folder that does not
 * exist, or a ledger that is not valid, is an error and stops the run: with a wrong list of what is published, the
 * Desk could write a story twice.
 */
export async function loadPublishedIndex(ledgerDir: string): Promise<PublishedIndex> {
  let names: string[];
  try {
```

**with:**
```ts
 * `site/src/content/ledger`; today it holds none). Other files in the folder are ignored. A folder that does not
 * exist, or a ledger that is not valid, is an error and stops the run: with a wrong list of what is published, the
 * Desk could write a story twice. With `keep`, only the ledgers for which it says true are counted, which is how a replay
 * sees the pieces that there were when its run began and not the one that run made.
 */
export async function loadPublishedIndex(ledgerDir: string, keep: (entry: LedgerEntry) => boolean = () => true): Promise<PublishedIndex> {
  let names: string[];
  try {
```

**In `desk/src/stages/context.ts`, replace:**
```ts
    const entry = LedgerEntry.safeParse(data);
    if (!entry.success) throw new Error(`the ledger ${name} is not valid: ${describeIssues(entry.error)}`);
    index.slugs.push(entry.data.slug);
    index.titles.push({ title: entry.data.title, publishedAt: entry.data.publishedAt });
```

**with:**
```ts
    const entry = LedgerEntry.safeParse(data);
    if (!entry.success) throw new Error(`the ledger ${name} is not valid: ${describeIssues(entry.error)}`);
    if (!keep(entry.data)) continue;
    index.slugs.push(entry.data.slug);
    index.titles.push({ title: entry.data.title, publishedAt: entry.data.publishedAt });
```

Run: `npm test --workspace @robywire/desk -- test/stages/context.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the failing test of replay**

The support file of the runs learns to record the replies of its model in the folder of the run.

**In `desk/test/support/run.ts`, replace:**
```ts
  fetcher?: RunDeskOptions['fetcher'];
  forceNew?: boolean;
}

```

**with:**
```ts
  fetcher?: RunDeskOptions['fetcher'];
  forceNew?: boolean;
  /** Keep a cassette of every model call in `cassettes`, in the folder of the run, so that the run can be replayed. */
  record?: boolean;
}

```

**In `desk/test/support/run.ts`, replace:**
```ts
  const fake = options.fake ?? demoClient();
  const logs: string[] = [];
  const base: RunDeskOptions = {
    date: DEMO_DATE,
```

**with:**
```ts
  const fake = options.fake ?? demoClient();
  const logs: string[] = [];
  const dir = path.join(config.runDir, DEMO_DATE);
  const base: RunDeskOptions = {
    date: DEMO_DATE,
```

**In `desk/test/support/run.ts`, replace:**
```ts
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    model: clientFromConfig(config, { kind: 'fake', fake }, {}),
    evidence: new LocalEvidenceStore(config.evidenceDir),
    target: options.dry === true ? new DryTarget(repoDir) : new SiteTarget(repoDir, git),
```

**with:**
```ts
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    model: clientFromConfig(config, { kind: 'fake', fake }, {}, {}, options.record === true ? path.join(dir, 'cassettes') : undefined),
    evidence: new LocalEvidenceStore(config.evidenceDir),
    target: options.dry === true ? new DryTarget(repoDir) : new SiteTarget(repoDir, git),
```

**In `desk/test/support/run.ts`, replace:**
```ts
    ...(options.forceNew === undefined ? {} : { forceNew: options.forceNew }),
  };
  const dir = path.join(config.runDir, DEMO_DATE);
  return { base, repoDir, config, git, fake, logs, dir, run: (overrides: Partial<RunDeskOptions> = {}) => runDesk({ ...base, ...overrides }) };
}
```

**with:**
```ts
    ...(options.forceNew === undefined ? {} : { forceNew: options.forceNew }),
  };
  return { base, repoDir, config, git, fake, logs, dir, run: (overrides: Partial<RunDeskOptions> = {}) => runDesk({ ...base, ...overrides }) };
}
```

**Create `desk/test/run/replay.test.ts`:**
```ts
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS } from '../../src/demo/story';
import { DEMO_DATE, demoRegistry } from '../../src/demo/world';
import { FetchError } from '../../src/fetch/http';
import { FakeClient } from '../../src/model/fake';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { REPLAYED, refusingFetcher, replayRun } from '../../src/run/replay';
import type { ReplayOptions } from '../../src/run/replay';
import { SELECT, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { useScratch } from '../support/context';
import { filesBelow } from '../support/site';

// A replay runs Extract, Compose and Verify again from what a run kept: the pages in the evidence store, the replies of the model in the cassettes, and
// the artifacts of the run. These tests make runs in the made-up world that record their cassettes, and replay them.

const scratch = useScratch();

/** A run that records its cassettes, run, and what a replay of it needs. */
async function recordedRun(options: RunSetup = {}) {
  const made = setupRun(scratch, { record: true, ...options });
  const result = await made.run();
  const replay: ReplayOptions = { config: made.config, sources: demoRegistry(), evidence: new LocalEvidenceStore(made.config.evidenceDir), ledgerDir: made.base.ledgerDir };
  return { ...made, result, replay };
}

const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const write = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

describe('replayRun: a run that is replayed as it was', () => {
  it('finds every artifact that it makes again equal to the one the run stored', async () => {
    const { dir, replay, result } = await recordedRun();
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(true);
    expect(report.error).toBeNull();
    expect(report.runId).toBe(result.runId);
    expect(report.artifacts).toEqual(REPLAYED.map((name) => ({ name, status: 'equal', detail: null })));
    expect(REPLAYED).toEqual(['04-extract', '05-compose', '06-verify']);
  });

  it('replays a piece that was revised and held, with the replies of the revisions that were recorded', async () => {
    const { dir, replay, result } = await recordedRun({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts.map((artifact) => artifact.status)).toEqual(['equal', 'equal', 'equal']);
    expect(report.equal).toBe(true);
  });

  it('replays a run that stopped at Extract, which has the artifact of that stage and no more', async () => {
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS.slice(0, 2) });
    const { dir, replay, result } = await recordedRun({ fake });
    expect(result.outcome).toBe('no-story');
    const report = await replayRun(dir, replay);
    expect(report.artifacts).toEqual([{ name: '04-extract', status: 'equal', detail: null }]);
    expect(report.equal).toBe(true);
  });

  it('does not list the cassettes of a run among its artifacts, though they are in its folder', async () => {
    const { dir } = await recordedRun();
    expect(filesBelow(dir).filter((name) => name.startsWith('cassettes/'))).toHaveLength(4);
    expect(recordOf(dir).artifacts).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json']);
  });

  it('logs what the stages logged, as the run did', async () => {
    const { dir, replay } = await recordedRun();
    const report = await replayRun(dir, replay);
    expect(report.log).toContain('extract: 7 claims proposed, 7 kept, 0 dropped');
    expect(report.log.some((line) => line.startsWith('verify: round 0'))).toBe(true);
  });

  it('makes no call to the fetcher, and refuses one by default: a replay does not use the network', async () => {
    const { dir, replay } = await recordedRun();
    const requests: string[] = [];
    const counting = {
      async get(url: string): Promise<never> {
        requests.push(url);
        throw new FetchError('network', url, 'no network in a replay');
      },
    };
    const report = await replayRun(dir, { ...replay, fetcher: counting });
    expect(report.equal).toBe(true);
    expect(requests).toEqual([]);
    expect((await replayRun(dir, replay)).equal).toBe(true);
  });

  it('writes nothing into the folder of the run, and leaves no folder of its own behind', async () => {
    const { dir, replay } = await recordedRun();
    const before = filesBelow(dir);
    const workDir = scratch();
    await replayRun(dir, { ...replay, workDir });
    expect(filesBelow(dir)).toEqual(before);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('makes its folder in the folder it is told to, and removes it when the replay fails, too', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    const workDir = scratch();
    const report = await replayRun(dir, { ...replay, workDir });
    expect(report.error).not.toBeNull();
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('has a fetcher of its own that refuses every request, for a replay that is not given one', async () => {
    await expect(refusingFetcher.get('https://fixture-robotics.example/news')).rejects.toThrow('https://fixture-robotics.example/news: a replay does not use the network');
  });

  it('takes the cassettes from the folder it is given, when that is not the one in the run', async () => {
    const { dir, replay } = await recordedRun();
    const elsewhere = scratch();
    for (const name of readdirSync(path.join(dir, 'cassettes'))) writeFileSync(path.join(elsewhere, name), readFileSync(path.join(dir, 'cassettes', name)));
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    expect((await replayRun(dir, { ...replay, cassetteDir: elsewhere })).equal).toBe(true);
  });
});

describe('replayRun: what it finds that is not as the run left it', () => {
  it('detects an artifact that was changed, and says where', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const stored = read(file) as { claims: { label: string }[] };
    (stored.claims[0] as { label: string }).label = 'a label that the run never wrote';
    write(file, stored);
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.name === '04-extract')).toEqual({
      name: '04-extract',
      status: 'different',
      detail: 'claims[0].label: stored "a label that the run never wrote", replayed "Tarnmoor shipment"',
    });
    expect(report.artifacts.filter((artifact) => artifact.status === 'equal').map((artifact) => artifact.name)).toEqual(['05-compose', '06-verify']);
  });

  it('detects a verdict that was changed', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '06-verify.json');
    write(file, { ...(read(file) as object), rounds: 0, outcome: 'hold' });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.name === '06-verify')?.detail).toBe('outcome: stored "hold", replayed "publish"');
  });

  it('says that something was not stored, or not replayed, when an item or a field is missing', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as { claims: unknown[]; dropped: unknown[] };
    const detailOf = async (change: (copy: Record<string, unknown>) => void): Promise<string | null> => {
      const copy = structuredClone(original) as unknown as Record<string, unknown>;
      change(copy);
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    expect(await detailOf((copy) => (copy.claims as unknown[]).pop())).toBe('claims[6] was not stored');
    expect(await detailOf((copy) => (copy.claims as unknown[]).push((copy.claims as unknown[])[0]))).toBe('claims[7] was not replayed');
    expect(await detailOf((copy) => delete copy.dropped)).toBe('dropped was not stored');
    expect(await detailOf((copy) => (copy.extra = 1))).toBe('extra was not replayed');
  });

  it('shows each value in full up to 60 characters, and cuts a longer one to 57 and three dots', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as { claims: { label: string }[] };
    const detailOf = async (label: string): Promise<string | null> => {
      const copy = structuredClone(original);
      (copy.claims[0] as { label: string }).label = label;
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    // The text of a value is its JSON, with the quotes: 58 characters make 60, which is shown in full; 59 make 61, which is cut.
    expect(await detailOf('a'.repeat(58))).toBe(`claims[0].label: stored "${'a'.repeat(58)}", replayed "Tarnmoor shipment"`);
    expect(await detailOf('a'.repeat(59))).toBe(`claims[0].label: stored ${JSON.stringify('a'.repeat(59)).slice(0, 57)}..., replayed "Tarnmoor shipment"`);
  });

  it('says what differs when a value is not of the kind the replay made: a list for an object, an object for a list, an object for a text', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as Record<string, unknown>;
    const detailOf = async (change: (copy: Record<string, unknown>) => void): Promise<string | null> => {
      const copy = structuredClone(original);
      change(copy);
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    expect(await detailOf((copy) => (copy.dropped = { none: true }))).toBe('dropped: stored {"none":true}, replayed []');
    expect(await detailOf((copy) => (copy.claims = {}))).toMatch(/^claims: stored \{\}, replayed \[\{"basis"/);
    expect(await detailOf((copy) => (copy.date = { day: 5 }))).toBe('date: stored {"day":5}, replayed "2026-10-05"');
    expect(await detailOf((copy) => (copy.date = ['2026-10-05']))).toBe('date: stored ["2026-10-05"], replayed "2026-10-05"');
  });

  it('reports the differences in the order of the names of the fields, which is not the order of the files', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const copy = read(file) as Record<string, unknown>;
    delete copy.dropped;
    copy.extra = 1;
    write(file, copy);
    expect((await replayRun(dir, replay)).artifacts[0]?.detail).toBe('dropped was not stored');
  });

  it('says that the files differ when only their layout does: the same data, written another way', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    writeFileSync(file, JSON.stringify(read(file)));
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts[0]).toEqual({ name: '04-extract', status: 'different', detail: 'the files differ' });
  });

  it('says unexpected for an artifact that the run does not have and the replay makes', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, '05-compose.json'));
    rmSync(path.join(dir, '06-verify.json'));
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'equal'], ['05-compose', 'unexpected'], ['06-verify', 'unexpected']]);
  });

  it('reports a reply that was never recorded, and the artifacts it did not get to as missing', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this extract request');
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'missing'], ['05-compose', 'missing'], ['06-verify', 'missing']]);
  });

  it('reports a request that is not the one that was recorded, which is what a changed prompt or model looks like', async () => {
    const { dir, replay } = await recordedRun();
    const report = await replayRun(dir, { ...replay, config: { ...replay.config, models: { ...replay.config.models, extract: 'model-b' } } });
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this extract request');
  });

  it('reports evidence that has been changed since the run, and evidence that is gone', async () => {
    const { dir, replay, config } = await recordedRun();
    const names = readdirSync(config.evidenceDir).filter((name) => name.endsWith('.txt'));
    expect(names.length).toBe(2);
    const file = path.join(config.evidenceDir, names[0] as string);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, `${text} changed`);
    expect((await replayRun(dir, replay)).error).toContain('has been changed');
    rmSync(file);
    expect((await replayRun(dir, replay)).error).toContain('no evidence is stored for');
  });

  it('does not see a piece that was published after the run began: not a later run of the same day, and not one of a later day', async () => {
    const { dir, replay, result } = await recordedRun();
    const own = read(path.join(replay.ledgerDir, `${result.slug}.json`)) as { runId: string; publishedAt: string };
    expect(own.runId).toBe('2026-10-05-043100');
    write(path.join(replay.ledgerDir, 'later.json'), { ...own, runId: '2026-10-05-050000' });
    write(path.join(replay.ledgerDir, 'tomorrow.json'), { ...own, runId: '2026-10-06-040000', publishedAt: '2026-10-06' });
    expect((await replayRun(dir, replay)).equal).toBe(true);
  });

  it('does see a piece that was published before the run began, earlier that day or before: its title is a duplicate, so the draft goes back, and the revision was never recorded', async () => {
    const { dir, replay, result } = await recordedRun();
    const own = read(path.join(replay.ledgerDir, `${result.slug}.json`)) as { runId: string; publishedAt: string };
    rmSync(path.join(replay.ledgerDir, `${result.slug}.json`));
    write(path.join(replay.ledgerDir, 'earlier.json'), { ...own, runId: '2026-10-05-000000' });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this compose request');
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'equal'], ['05-compose', 'missing'], ['06-verify', 'missing']]);
  });
});

describe('replayRun: a folder that cannot be replayed', () => {
  it('throws for a folder that has no record of a run', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'run.json'));
    await expect(replayRun(dir, replay)).rejects.toThrow(`the run record run.json is not in ${dir}`);
  });

  it('throws for a run that stopped before Fetch, which has nothing to start from', async () => {
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] });
    const { dir, replay } = await recordedRun({ fake });
    await expect(replayRun(dir, replay)).rejects.toThrow('the artifact 03-fetch.json is not in');
  });

  it('reports a run whose pages were never fetched as an error of the replay, because Extract needs a page', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '03-fetch.json');
    write(file, { ...(read(file) as object), documents: [] });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('runExtract needs at least one page');
  });

  it('is for the day of the run: it reads the date from the record', async () => {
    const { dir } = await recordedRun();
    expect(recordOf(dir).date).toBe(DEMO_DATE);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/replay.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/replay'`

- [ ] **Step 6: Write replay**

**Create `desk/src/run/replay.ts`:**
```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourcesRegistry } from '@robywire/gate';
import { FetchArtifact, FetchError, RecordedClient, RunRecord, SelectArtifact, readArtifact, readJsonFile } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
import type { StageContext } from '../stages/context';
import { runExtract } from '../stages/extract';
import type { Snapshot } from '../stages/fetch';
import { runVerify } from '../stages/verify';

// Replay: run the stages that read a model again, from what the run itself kept, and see whether the result is what the run wrote. A run keeps
// the pages it read (in the evidence store, named by their hash), the story that Select chose, and, when it is recorded, the replies of the model
// (cassettes). With those, Extract, Compose and Verify can be run again with no network and no model, and if the code, the prompts or the
// evidence have changed since the run, the result will differ, or the replay will say that a reply it needs was never recorded. A replay never writes
// into the folder of the run: it makes its artifacts in a folder of its own, compares them with the stored ones and removes it.

/** The artifacts that a replay makes again, in the order of the stages. */
export const REPLAYED = ['04-extract', '05-compose', '06-verify'] as const;

export interface ReplayOptions {
  config: DeskConfig;
  /** The source registry that the run used (Extract reads the kind of each page from it). */
  sources: SourcesRegistry;
  evidence: EvidenceStore;
  /** The folder of the ledgers of the published pieces. The pieces that there were when the run began are what the replay sees. */
  ledgerDir: string;
  /** Where the replies of the model are kept. By default `cassettes` in the folder of the run. */
  cassetteDir?: string;
  /** The folder in which the replay makes its own folder for the artifacts it writes. By default the temporary directory of the machine. */
  workDir?: string;
  /** The fetcher that the stages are given. A replay has no use for it, so by default it refuses every request; a test hands in one that counts. */
  fetcher?: Fetcher;
}

/**
 * How one artifact came out: `equal`; `different` (with the first place where it differs); `missing` (the run has it and the replay did not make it); or `unexpected`
 * (the replay made it and the run does not have it).
 */
export interface ReplayedArtifact {
  name: string;
  status: 'equal' | 'different' | 'missing' | 'unexpected';
  detail: string | null;
}

export interface ReplayReport {
  runId: string;
  /** True only when the replay ran to the end and every artifact it made is the one the run stored, and there is at least one. */
  equal: boolean;
  artifacts: ReplayedArtifact[];
  /** Why the replay stopped before the end (a reply that was never recorded, evidence that is missing or has changed); null when it did not. */
  error: string | null;
  /** What the stages logged. */
  log: string[];
}

/** The fetcher of a replay unless it is given another: it refuses every request. */
export const refusingFetcher: Fetcher = {
  async get(url: string) {
    throw new FetchError('network', url, 'a replay does not use the network');
  },
};

/** The text of a file, or null when it is not there. */
async function textOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const show = (value: unknown): string => {
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

/** The first place where two parsed JSON values differ, as a path (`claims[0].label`) and the two values; undefined when they are the same. */
function firstDifference(stored: unknown, replayed: unknown, where: string): string | undefined {
  if (Array.isArray(stored) && Array.isArray(replayed)) {
    for (let at = 0; at < Math.max(stored.length, replayed.length); at++) {
      if (at >= stored.length) return `${where}[${at}] was not stored`;
      if (at >= replayed.length) return `${where}[${at}] was not replayed`;
      const found = firstDifference(stored[at], replayed[at], `${where}[${at}]`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isObject(stored) && isObject(replayed)) {
    for (const key of [...new Set([...Object.keys(stored), ...Object.keys(replayed)])].sort()) {
      const here = where === '' ? key : `${where}.${key}`;
      if (!(key in stored)) return `${here} was not stored`;
      if (!(key in replayed)) return `${here} was not replayed`;
      const found = firstDifference(stored[key], replayed[key], here);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return stored === replayed ? undefined : `${where}: stored ${show(stored)}, replayed ${show(replayed)}`;
}

function compare(name: string, stored: string | null, replayed: string | null): ReplayedArtifact | undefined {
  if (stored === null && replayed === null) return undefined;
  if (stored === null) return { name, status: 'unexpected', detail: 'the replay made it and the run did not' };
  if (replayed === null) return { name, status: 'missing', detail: 'the run has it and the replay did not make it' };
  if (stored === replayed) return { name, status: 'equal', detail: null };
  return { name, status: 'different', detail: firstDifference(JSON.parse(stored), JSON.parse(replayed), '') ?? 'the files differ' };
}

/**
 * Replay the run in `runDir`: rebuild the pages it read from the evidence store (by the hashes in `03-fetch.json`), run Extract, Compose and Verify again
 * with the replies in the cassettes, and compare each artifact with the one the run stored. The run folder must have the record `run.json`, `02-select.json` and
 * `03-fetch.json`, which are what a replay starts from; without them there is nothing to replay and it throws. Anything that goes wrong after that, a reply that was
 * never recorded or evidence that is gone or has been changed, ends the replay early and is reported, with the artifacts it did not get to as `missing`.
 *
 * The published pieces that the stages see are those that there were when the run began: a ledger written by the run itself or later is left out, so that the slug of
 * the piece, which depends on what is published, comes out as it did. The replay uses no network (`fetcher` refuses every request) and writes nothing into the folder of the run.
 */
export async function replayRun(runDir: string, options: ReplayOptions): Promise<ReplayReport> {
  const record = await readJsonFile(path.join(runDir, 'run.json'), 'the run record run.json', RunRecord);
  const selected = await readArtifact(runDir, '02-select', SelectArtifact);
  const fetched = await readArtifact(runDir, '03-fetch', FetchArtifact);

  const folder = await mkdtemp(path.join(options.workDir ?? tmpdir(), 'desk-replay-'));
  const log: string[] = [];
  let error: string | null = null;
  try {
    try {
      const snapshots: Snapshot[] = [];
      for (const document of fetched.documents) snapshots.push({ ...document, text: (await options.evidence.get(document.hash)).text });
      const published = await loadPublishedIndex(options.ledgerDir, (entry) => entry.publishedAt < record.date || (entry.publishedAt === record.date && entry.runId < record.runId));
      const ctx: StageContext = {
        date: record.date,
        config: options.config,
        sources: options.sources,
        fetcher: options.fetcher ?? refusingFetcher,
        client: new RecordedClient(options.cassetteDir ?? path.join(runDir, 'cassettes')),
        evidence: options.evidence,
        runDir: folder,
        published,
        log: (line) => void log.push(line),
      };
      const extracted = await runExtract(ctx, snapshots, selected);
      if (extracted.ok) {
        const claims = extracted.artifact.claims;
        await runVerify(ctx, claims, await runCompose(ctx, claims));
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message || caught.name : String(caught);
    }

    const artifacts: ReplayedArtifact[] = [];
    for (const name of REPLAYED) {
      const found = compare(name, await textOrNull(path.join(runDir, `${name}.json`)), await textOrNull(path.join(folder, `${name}.json`)));
      if (found !== undefined) artifacts.push(found);
    }
    return { runId: record.runId, equal: error === null && artifacts.length > 0 && artifacts.every((artifact) => artifact.status === 'equal'), artifacts, error, log };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/run/replay.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 7: Keep replay out of the entry point**

Replay is the top of the package, like the orchestrator. This test passes at once; it is there so that it keeps passing.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...demo]) {
```

**with:**
```ts
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...demo]) {
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 9: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 10: Commit**

```bash
git add desk/src/model/factory.ts desk/src/stages/context.ts desk/src/run/replay.ts desk/test/fetch/exports.test.ts desk/test/model/factory.test.ts desk/test/stages/context.test.ts desk/test/support/run.ts desk/test/run/replay.test.ts
git commit -m "feat(desk): replay: Extract, Compose and Verify run again from the pages in the evidence store and the recorded replies of the model, with no network, and every artifact compared with the one the run stored" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 36: The command line

**Files:**
- Create: `desk/src/cli.ts` (`ClientKind`, `SourcesKind`, `Parsed`, `ParseResult`, `USAGE`, `parseArgs`, `CliDeps`, `main`)
- Create: `desk/src/bin.ts` (the program)
- Modify: `package.json` (the script `desk`)
- Modify: `README.md` (the commands)
- Modify: `desk/test/fetch/exports.test.ts`
- Test: `desk/test/cli.test.ts`

`desk` is the command line of the Desk: `desk run`, `desk replay <folder of a run>` and `desk status`. The arguments are read by hand, with no library. Everything `main(argv, deps)` needs from outside, the clock, the environment, git, the folder it is in and where to print, is in `deps`, so a test calls `main` with fakes, and the program `desk/src/bin.ts` is a few lines that call it with the real ones and set the exit code. The root script `desk` is `tsx desk/src/bin.ts`; run `npm run desk -- <command>` from the root of the repository.

**Commands and options.**
- `run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>]`. The defaults are those of a real run: the `api` client, the `live` sources and today in UTC (a run on the fixtures takes the day of the made-up world, 5 October 2026, so that its feed items are recent). `--dry` writes the artifacts of the run and never touches `site/` or git. `--force-new` runs again for a day that already has a run (Task 34). `--client recorded` replays the replies in `--cassettes`.
- `replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>]` runs Task 35's replay and prints each artifact's result.
- `status` prints the last run and the number of holds from the desk state: `last run: none yet` and `holds: 0` on the committed state.

**What the command line refuses, before it writes anything** (exit code 2, the message and the usage on the error output): a command or an option it does not know (an option that belongs to another command, or written `--dry=true`), an option given twice, an option with no value or whose value is another option, a value that is not one of the choices, a date that is not a real day, an argument that the command does not take or a missing folder for `replay`. Three more are refused because of what they would put where it does not belong. **`--client fake` and `--sources fixtures` need `--dry`**: the scripted story and the made-up world are for dry runs, because the piece they make is about a company that does not exist and must never reach `site/src/content` or a commit. `--client recorded` needs `--cassettes`, and `--cassettes` belongs to that client alone (the other clients record their replies in the folder of the run, in `cassettes`, through the factory of Task 35, so that `replay` can run the run again). **`--client api` without `ANTHROPIC_API_KEY` in the environment it was given is refused** with exit code 2 and the message of the factory; the key is read from `deps.env` only, and no line the command prints ever holds it.

**Exit codes.** 0 for a run that published, held or found no story and for a replay that came out equal; 1 for a run that failed, one that was refused (the lock, the day, the checkout: a `RunRefused` of Task 34) or could not start (the sources cannot be read), a replay that differs or cannot run, and a state that cannot be read; 2 for a usage error. `main` never exits the process and never throws.

**What it prints.** The stages' log lines as they happen; then `outcome: published|held|no-story|failed`, the run id, the folder, the piece, the reason, the stage that ended a run with no story or a failure, and either the commit or `dry run: nothing was written to the site or to git (N files would have been)`.

**The tests** call `main` and `parseArgs` with every flag and every refusal in a table; run the made-up story in a dry run and read back what it left (nothing in the site or in git; the artifacts, the record and four cassettes in the folder of the day); refuse a second run for the day and allow it with `--force-new`; run with `--client recorded` on the cassettes of an earlier run; run with the api client and live sources and **no network** (a transport that cannot reach anything, so the run fails at Discover before any model is asked) to show the key is read from the environment it is given and is never printed; replay a run, and replay one that was changed; and print `status` on the committed state and on others. Nothing in these tests can reach a network or a model.

- [ ] **Step 1: Write the failing test**

**Create `desk/test/cli.test.ts`:**
```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { DEMO_DATE } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
import { FakeGit } from '../src/run/git';
import { sitePaths } from '../src/run/target';
import { useScratch } from './support/context';
import { clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';

// The command line, called as a function: `main(argv, deps)` with a clock, an environment, a git and a place to print that the test hands in. Nothing
// is run as a program, nothing real is touched, and no command in these tests can reach a network or a model.

const scratch = useScratch();
const STATE = sitePaths().stateFile;
const REAL_SOURCES = fileURLToPath(new URL('../../sources.yml', import.meta.url));
const DRY_DEMO = ['run', '--dry', '--client', 'fake', '--sources', 'fixtures'];

/** A transport that cannot reach anything, as a machine with no network. */
const offline: Transport = async (url) => {
  throw new FetchError('network', url, 'there is no network');
};

/** A repository in a new folder, a fake git for it, and everything that `main` is given and prints. */
function setup(overrides: Partial<CliDeps> = {}) {
  const cwd = makeSite(scratch());
  copyFileSync(REAL_SOURCES, path.join(cwd, 'sources.yml'));
  const out: string[] = [];
  const err: string[] = [];
  const git = new FakeGit();
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git, transport: offline, ...overrides };
  return { cwd, out, err, git, deps, call: (...argv: string[]) => main(argv, deps) };
}

const parsed = (...argv: string[]): Parsed => {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`not parsed: ${result.message}`);
  return result.args;
};
const refused = (...argv: string[]): string => {
  const result = parseArgs(argv);
  if (result.ok) throw new Error(`parsed: ${JSON.stringify(result.args)}`);
  return result.message;
};

describe('parseArgs: run', () => {
  it('has the defaults of a real run: the api, the live sources, today, not dry', () => {
    expect(parsed('run')).toEqual({ command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, cassettes: undefined });
  });

  it('reads --date', () => {
    expect(parsed('run', '--date', '2026-10-05')).toMatchObject({ date: '2026-10-05' });
  });

  it('reads --dry and --force-new, which take no value, in any order', () => {
    expect(parsed('run', '--dry', '--force-new')).toMatchObject({ dry: true, forceNew: true });
    expect(parsed('run', '--force-new', '--dry')).toMatchObject({ dry: true, forceNew: true });
    expect(parsed('run', '--dry')).toMatchObject({ dry: true, forceNew: false });
    expect(parsed('run', '--force-new')).toMatchObject({ dry: false, forceNew: true });
  });

  it('reads --client and --sources', () => {
    expect(parsed('run', '--dry', '--client', 'fake')).toMatchObject({ client: 'fake' });
    expect(parsed('run', '--client', 'api')).toMatchObject({ client: 'api' });
    expect(parsed('run', '--client', 'recorded', '--cassettes', 'runs/x/cassettes')).toMatchObject({ client: 'recorded', cassettes: 'runs/x/cassettes' });
    expect(parsed('run', '--dry', '--sources', 'fixtures')).toMatchObject({ sources: 'fixtures' });
    expect(parsed('run', '--sources', 'live')).toMatchObject({ sources: 'live' });
  });

  it('reads every option together, with the options before and after each other', () => {
    expect(parsed('run', '--sources', 'fixtures', '--date', '2026-10-05', '--client', 'fake', '--dry', '--force-new')).toEqual({
      command: 'run',
      date: '2026-10-05',
      dry: true,
      client: 'fake',
      sources: 'fixtures',
      forceNew: true,
      cassettes: undefined,
    });
  });

  it('refuses a value that is not one of the choices, with the choices in the message', () => {
    expect(refused('run', '--client', 'gpt')).toBe('--client is fake, recorded or api, not "gpt"');
    expect(refused('run', '--sources', 'files')).toBe('--sources is fixtures or live, not "files"');
  });

  it('refuses a date that is not a day: a wrong shape, a month or a day that does not exist, and a day that is not in that month', () => {
    for (const date of ['5 October', '2026-10-5', '20261005', '2026-13-01', '2026-02-30', '2026-00-10', '']) {
      expect(refused('run', '--date', date), date).toBe(`--date is a day written YYYY-MM-DD, not "${date}"`);
    }
    expect(parsed('run', '--date', '2028-02-29')).toMatchObject({ date: '2028-02-29' });
  });

  it('refuses an option that has no value, whether it is the last word or another option follows', () => {
    for (const option of ['--date', '--client', '--sources', '--cassettes']) {
      expect(refused('run', option), option).toBe(`${option} needs a value`);
      expect(refused('run', option, '--dry'), option).toBe(`${option} needs a value`);
    }
  });

  it('refuses an option it does not know, written with a space or with an equals sign, and one that belongs to another command', () => {
    expect(refused('run', '--verbose')).toBe('unknown option --verbose for run');
    expect(refused('run', '--dry=true')).toBe('unknown option --dry=true for run');
    expect(refused('run', '--date=2026-10-05')).toBe('unknown option --date=2026-10-05 for run');
    expect(refused('run', '-d')).toContain('run takes no arguments');
  });

  it('refuses an option given twice', () => {
    expect(refused('run', '--dry', '--dry')).toBe('--dry is given twice');
    expect(refused('run', '--date', '2026-10-05', '--date', '2026-10-06')).toBe('--date is given twice');
  });

  it('refuses an argument that is not an option, because run takes none', () => {
    expect(refused('run', 'today')).toBe('run takes no arguments, but was given "today"');
  });

  it('refuses the scripted client and the made-up world unless the run is dry, because nothing in them may be published', () => {
    expect(refused('run', '--client', 'fake')).toBe('--client fake is a scripted story for dry runs: add --dry');
    expect(refused('run', '--sources', 'fixtures')).toContain('add --dry, because nothing in it may be published');
    expect(refused('run', '--client', 'fake', '--sources', 'fixtures')).toContain('--client fake');
  });

  it('refuses the recorded client without its cassettes, and cassettes for any other client', () => {
    expect(refused('run', '--client', 'recorded')).toBe('--client recorded needs --cassettes, the folder of the recorded replies');
    expect(refused('run', '--cassettes', 'x')).toContain('--cassettes is for --client recorded');
    expect(refused('run', '--dry', '--client', 'fake', '--cassettes', 'x')).toContain('--cassettes is for --client recorded');
  });
});

describe('parseArgs: replay, status and the rest', () => {
  it('reads replay with the folder of a run, and the options of replay', () => {
    expect(parsed('replay', 'runs/2026-10-05')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'live', cassettes: undefined });
    expect(parsed('replay', 'runs/2026-10-05', '--sources', 'fixtures', '--cassettes', 'elsewhere')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'fixtures', cassettes: 'elsewhere' });
    expect(parsed('replay', '--sources', 'fixtures', 'runs/x')).toMatchObject({ runDir: 'runs/x', sources: 'fixtures' });
  });

  it('refuses replay with no folder, with two, with an option of run, and with a value that is wrong', () => {
    expect(refused('replay')).toBe('replay needs the folder of a run');
    expect(refused('replay', 'a', 'b')).toBe('replay takes one folder, but was given "a" and "b"');
    expect(refused('replay', 'a', '--dry')).toBe('unknown option --dry for replay');
    expect(refused('replay', 'a', '--date', '2026-10-05')).toBe('unknown option --date for replay');
    expect(refused('replay', 'a', '--sources', 'files')).toBe('--sources is fixtures or live, not "files"');
    expect(refused('replay', 'a', '--cassettes')).toBe('--cassettes needs a value');
  });

  it('reads status, which takes nothing', () => {
    expect(parsed('status')).toEqual({ command: 'status' });
    expect(refused('status', '--json')).toBe('status takes no arguments, but was given "--json"');
    expect(refused('status', 'now')).toBe('status takes no arguments, but was given "now"');
  });

  it('reads help in three ways', () => {
    for (const word of ['help', '--help', '-h']) expect(parsed(word)).toEqual({ command: 'help' });
  });

  it('refuses no command and a command it does not know', () => {
    expect(refused()).toBe('no command given');
    expect(refused('publish')).toBe('unknown command "publish"');
    expect(refused('--dry')).toBe('unknown command "--dry"');
  });
});

describe('main: usage errors', () => {
  it('prints the message and the usage on the error output, exits with 2 and writes nothing', async () => {
    const { call, out, err, cwd } = setup();
    const before = filesBelow(cwd);
    expect(await call('run', '--bogus')).toBe(2);
    expect(out).toEqual([]);
    expect(err).toEqual(['desk: unknown option --bogus for run', USAGE]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('does the same for no command at all', async () => {
    const { call, err } = setup();
    expect(await call()).toBe(2);
    expect(err[0]).toBe('desk: no command given');
  });

  it('prints the usage on the output for help, and exits with 0', async () => {
    const { call, out, err } = setup();
    expect(await call('--help')).toBe(0);
    expect(out).toEqual([USAGE]);
    expect(err).toEqual([]);
    expect(USAGE).toContain('desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new]');
    expect(USAGE).toContain('desk replay');
    expect(USAGE).toContain('desk status');
  });
});

describe('main: run --dry --client fake --sources fixtures', () => {
  it('runs the made-up story and ends published, in a dry run, with exit code 0', async () => {
    const { call, out, err } = setup();
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toContain('outcome: published');
    expect(out.some((line) => line.startsWith('stage:'))).toBe(false);
    expect(out).toContain('run: 2026-10-05-043100');
    expect(out.some((line) => line.startsWith('piece: fixture-robotics-begins-fx-1-deliveries'))).toBe(true);
    expect(out.some((line) => line.startsWith('dry run: nothing was written to the site or to git'))).toBe(true);
    expect(out.some((line) => line.startsWith('commit:'))).toBe(false);
  });

  it('writes nothing into the site and nothing to git: the desk state is as it was, the content folders are empty, and no commit is made', async () => {
    const { call, cwd, git } = setup();
    await call(...DRY_DEMO);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(filesBelow(path.join(cwd, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
    expect(git.commits).toEqual([]);
  });

  it('writes the artifacts, the record and the cassettes of the run in the folder of the day, below the folder it was started in', async () => {
    const { call, cwd } = setup();
    await call(...DRY_DEMO);
    const dir = path.join(cwd, 'runs', DEMO_DATE);
    expect(readdirSync(dir).sort()).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'cassettes', 'run.json']);
    expect(readdirSync(path.join(dir, 'cassettes'))).toHaveLength(4);
    expect(readdirSync(path.join(cwd, 'evidence')).filter((name) => name.endsWith('.txt'))).toHaveLength(2);
  });

  it('prints what the stages logged, before the outcome', async () => {
    const { call, out } = setup();
    await call(...DRY_DEMO);
    expect(out.findIndex((line) => line.startsWith('extract: 7 claims proposed'))).toBeGreaterThanOrEqual(0);
    expect(out.findIndex((line) => line.startsWith('extract:'))).toBeLessThan(out.indexOf('outcome: published'));
  });

  it('takes the day of the made-up world when it is not told one, and the day it is told when it is', async () => {
    const first = setup();
    await first.call(...DRY_DEMO);
    expect(existsSync(path.join(first.cwd, 'runs', '2026-10-05'))).toBe(true);
    const second = setup();
    expect(await second.call(...DRY_DEMO, '--date', '2026-10-06')).toBe(0);
    expect(second.out).toContain('run: 2026-10-06-043100');
    expect(existsSync(path.join(second.cwd, 'runs', '2026-10-06'))).toBe(true);
    expect(existsSync(path.join(second.cwd, 'runs', '2026-10-05'))).toBe(false);
  });

  it('refuses a second run for the day, with exit code 1 and the way out, and runs it again with --force-new', async () => {
    const { call, err, out, cwd } = setup();
    await call(...DRY_DEMO);
    expect(await call(...DRY_DEMO)).toBe(1);
    expect(err.join('\n')).toContain('the run was refused: the run of 2026-10-05 is already done');
    expect(err.join('\n')).toContain('--force-new');
    expect(await call(...DRY_DEMO, '--force-new')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05.old-1'))).toBe(true);
  });
});

describe('main: the other clients and sources', () => {
  it('refuses to run a story that is not dry with the scripted client or the made-up world, before anything is written', async () => {
    const { call, err, cwd } = setup();
    expect(await call('run', '--client', 'fake', '--sources', 'fixtures')).toBe(2);
    expect(err[0]).toContain('add --dry');
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('refuses --client api when there is no key in the environment it was given, exits with 2, and writes nothing', async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '   ' }]) {
      const { call, err, cwd, git } = setup({ env });
      expect(await call('run', '--dry', '--sources', 'fixtures', '--client', 'api')).toBe(2);
      expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
      expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
      expect(git.commits).toEqual([]);
    }
  });

  it('builds the api client from the key it is given, never prints the key, and never reaches a network: with live sources and no network the run fails at Discover', async () => {
    const key = 'a-key-for-the-test-only';
    const { call, out, err, git, cwd } = setup({ env: { ANTHROPIC_API_KEY: key } });
    expect(await call('run', '--date', '2026-10-05')).toBe(1);
    expect(out).toContain('outcome: failed');
    expect(out).toContain('stage: discover');
    expect(out.filter((line) => /^commit: [0-9a-f]{40}$/.test(line))).toEqual([`commit: ${git.commits[0]?.id}`]);
    expect([...out, ...err].join('\n')).not.toContain(key);
    // The run was not dry, so it recorded itself: one commit of the desk state, which says that the run failed.
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(JSON.parse(readFileSync(path.join(cwd, STATE), 'utf8')).lastRun.outcome).toBe('failed');
  });

  it('takes the day from the clock when it is not told one, for live sources', async () => {
    const { call, out, cwd } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    await call('run');
    // The clock is read once for the day, then once for the start of the run, a second later.
    expect(out).toContain('run: 2026-10-05-043101');
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05'))).toBe(true);
  });

  it('says that sources.yml cannot be read when it cannot, and exits with 1', async () => {
    const { call, err, cwd } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    writeFileSync(path.join(cwd, 'sources.yml'), 'primary: nonsense');
    expect(await call('run')).toBe(1);
    expect(err[0]).toContain('the sources cannot be read');
  });

  it('replays the recorded replies of an earlier run with --client recorded, and ends published again', async () => {
    const first = setup();
    await first.call(...DRY_DEMO);
    const cassettes = path.join(first.cwd, 'cassettes-kept');
    mkdirSync(cassettes);
    for (const name of readdirSync(path.join(first.cwd, 'runs', DEMO_DATE, 'cassettes'))) copyFileSync(path.join(first.cwd, 'runs', DEMO_DATE, 'cassettes', name), path.join(cassettes, name));
    expect(await first.call('run', '--dry', '--client', 'recorded', '--sources', 'fixtures', '--cassettes', 'cassettes-kept', '--force-new')).toBe(0);
    expect(first.out.filter((line) => line === 'outcome: published')).toHaveLength(2);
  });

  it('ends failed with exit code 1 when a recorded reply is missing, and says which stage', async () => {
    const { call, out, cwd } = setup();
    mkdirSync(path.join(cwd, 'no-cassettes'));
    expect(await call('run', '--dry', '--client', 'recorded', '--sources', 'fixtures', '--cassettes', 'no-cassettes')).toBe(1);
    expect(out).toContain('outcome: failed');
    expect(out).toContain('stage: select');
    expect(out.some((line) => line.startsWith('reason: no recorded response for this select request'))).toBe(true);
  });
});

describe('main: replay', () => {
  it('replays a run that recorded its replies and says that it is equal, exit code 0', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    expect(await call('replay', path.join('runs', DEMO_DATE), '--sources', 'fixtures')).toBe(0);
    expect(out).toEqual(['run: 2026-10-05-043100', '04-extract: equal', '05-compose: equal', '06-verify: equal', 'replay: equal']);
    expect(cwd).toBeTruthy();
  });

  it('says what differs and exits with 1 when an artifact was changed', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    const file = path.join(cwd, 'runs', DEMO_DATE, '06-verify.json');
    const stored = JSON.parse(readFileSync(file, 'utf8')) as { rounds: number };
    writeFileSync(file, `${JSON.stringify({ ...stored, rounds: 1 }, null, 2)}\n`);
    out.length = 0;
    expect(await call('replay', path.join('runs', DEMO_DATE), '--sources', 'fixtures')).toBe(1);
    expect(out).toContain('06-verify: different (rounds: stored 1, replayed 0)');
    expect(out.at(-1)).toBe('replay: not equal');
  });

  it('says why a replay stopped, with the recorded reply that is missing', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    mkdirSync(path.join(cwd, 'empty'));
    expect(await call('replay', path.join('runs', DEMO_DATE), '--sources', 'fixtures', '--cassettes', 'empty')).toBe(1);
    expect(out.some((line) => line.startsWith('the replay stopped: no recorded response for this extract request'))).toBe(true);
    expect(out).toContain('04-extract: missing (the run has it and the replay did not make it)');
  });

  it('says that a folder that is not a run cannot be replayed, and exits with 1', async () => {
    const { call, err, cwd } = setup();
    mkdirSync(path.join(cwd, 'nothing'));
    expect(await call('replay', 'nothing', '--sources', 'fixtures')).toBe(1);
    expect(err[0]).toContain('the run cannot be replayed: the run record run.json is not in');
  });
});

describe('main: status', () => {
  it('says that nothing has happened yet, and that there are no holds, for the desk state that the site starts with', async () => {
    const { call, out } = setup();
    expect(await call('status')).toBe(0);
    expect(out).toEqual(['last run: none yet', 'holds: 0']);
  });

  it('says what the last run did, which piece it made when it made one, and how many drafts are held', async () => {
    const { call, out, cwd } = setup();
    const hold = { at: '2026-10-04T04:31:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'] };
    writeFileSync(path.join(cwd, STATE), JSON.stringify({ lastRun: { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'a-piece' }, holds: [hold, hold], corrections: [] }));
    expect(await call('status')).toBe(0);
    expect(out).toEqual(['last run: published at 2026-10-05T04:31:00.000Z (run 2026-10-05-043100, piece a-piece)', 'holds: 2']);
  });

  it('leaves out the piece for a run that made none', async () => {
    const { call, out, cwd } = setup();
    writeFileSync(path.join(cwd, STATE), JSON.stringify({ lastRun: { at: '2026-10-05T04:31:00.000Z', outcome: 'no-story', runId: 'r', slug: null }, holds: [], corrections: [] }));
    await call('status');
    expect(out[0]).toBe('last run: no-story at 2026-10-05T04:31:00.000Z (run r)');
  });

  it('exits with 1 and says why when the desk state cannot be read', async () => {
    const { call, out, err, cwd } = setup();
    writeFileSync(path.join(cwd, STATE), '{"lastRun":');
    expect(await call('status')).toBe(1);
    expect(out).toEqual([]);
    expect(err[0]).toContain('is not valid JSON');
  });

  it('reads the state of the folder it was started in, and exits with 1 in a folder that is not a checkout', async () => {
    const { deps, err } = setup();
    expect(await main(['status'], { ...deps, cwd: path.join(deps.cwd, 'nowhere') })).toBe(1);
    expect(err[0]).toContain('does not exist');
    expect(await main(['status'], deps)).toBe(0);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts`
Expected: FAIL — `Cannot find module '../src/cli'`

- [ ] **Step 2: Write the command line**

**Create `desk/src/cli.ts`:**
```ts
import path from 'node:path';
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { HttpFetcher, LocalEvidenceStore, RunRefused, clientFromConfig, defaultConfig, readDeskState, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, DeskConfig, Environment, Fetcher, GitTarget, RetryOptions, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>` and `desk status`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story and for a replay that came out equal, 1 for a run that failed, was refused or could not start, and a replay that
// differs, and 2 for a usage error.

export type ClientKind = 'fake' | 'recorded' | 'api';
export type SourcesKind = 'fixtures' | 'live';

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind; cassettes: string | undefined }
  | { command: 'status' }
  | { command: 'help' };

/** What the arguments mean, or why they do not. */
export type ParseResult = { ok: true; args: Parsed } | { ok: false; message: string };

export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>]',
  '  desk status',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run is refused unless --force-new is given.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same.',
  'status  print the last run and the number of holds, from the desk state.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes'] },
  replay: { flags: [], valued: ['--sources', '--cassettes'] },
};

const CLIENTS: readonly string[] = ['fake', 'recorded', 'api'];
const SOURCES: readonly string[] = ['fixtures', 'live'];

/** Is `text` a day, YYYY-MM-DD, that exists? */
function isDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * Read the arguments (without the program and the script). A command, then its options in any order. A flag is given once, a valued option has
 * a value that does not start with `--`, and every value is checked; an option of another command, an unknown option, an argument the command does not take
 * and a missing one are refused, each with a message that names it. Two combinations are refused because they would put made-up content, or an unrecorded
 * model, where it does not belong: `--client fake` and `--sources fixtures` only with `--dry`, and `--client recorded` only with `--cassettes` (which is
 * for `recorded` alone when running).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const fail = (message: string): ParseResult => ({ ok: false, message });
  const [command, ...rest] = argv;
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
  const positional: string[] = [];
  if (command === 'status') {
    if (rest.length > 0) return fail(`status takes no arguments, but was given "${rest[0]}"`);
    return { ok: true, args: { command: 'status' } };
  }
  const allowed = OPTIONS[command];
  for (let at = 0; at < rest.length; at++) {
    const word = rest[at] as string;
    if (!word.startsWith('--')) {
      positional.push(word);
      continue;
    }
    if (given.has(word)) return fail(`${word} is given twice`);
    if (allowed.flags.includes(word)) {
      given.set(word, true);
    } else if (allowed.valued.includes(word)) {
      const value = rest[at + 1];
      if (value === undefined || value.startsWith('--')) return fail(`${word} needs a value`);
      given.set(word, value);
      at++;
    } else {
      return fail(`unknown option ${word} for ${command}`);
    }
  }

  const value = (name: string): string | undefined => {
    const found = given.get(name);
    return typeof found === 'string' ? found : undefined;
  };
  const sources = value('--sources') ?? 'live';
  if (!SOURCES.includes(sources)) return fail(`--sources is fixtures or live, not "${sources}"`);

  if (command === 'replay') {
    if (positional.length === 0) return fail('replay needs the folder of a run');
    if (positional.length > 1) return fail(`replay takes one folder, but was given "${positional.join('" and "')}"`);
    return { ok: true, args: { command: 'replay', runDir: positional[0] as string, sources: sources as SourcesKind, cassettes: value('--cassettes') } };
  }

  if (positional.length > 0) return fail(`run takes no arguments, but was given "${positional[0]}"`);
  const client = value('--client') ?? 'api';
  if (!CLIENTS.includes(client)) return fail(`--client is fake, recorded or api, not "${client}"`);
  const date = value('--date');
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
  const dry = given.has('--dry');
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), cassettes } };
}

/** What `main` needs from outside. */
export interface CliDeps {
  /** One line of output, and one line of error output. */
  out(line: string): void;
  err(line: string): void;
  /** The environment: where `ANTHROPIC_API_KEY` is read from, and nothing else. */
  env: Environment;
  /** The root of the repository: `sources.yml`, `site/`, `runs/` and `evidence/` are below it. */
  cwd: string;
  now: () => Date;
  /** What commits for a run that is not dry. */
  git: GitTarget;
  /** The settings of the run. By default `defaultConfig()` with the folders of the runs and of the evidence below `cwd`. */
  config?: DeskConfig;
  /** How live sources are fetched; the default is the global `fetch`. */
  transport?: Transport;
  /** How the api client waits between tries. */
  retry?: RetryOptions;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/** The settings of a run: those given, or the defaults with their folders below `cwd`. */
function configOf(deps: CliDeps): DeskConfig {
  if (deps.config !== undefined) return deps.config;
  return { ...defaultConfig(), runDir: path.join(deps.cwd, 'runs'), evidenceDir: path.join(deps.cwd, 'evidence') };
}

/** The registry and the fetcher of the sources that were asked for. */
function sourcesOf(kind: SourcesKind, deps: CliDeps, config: DeskConfig): { sources: SourcesRegistry; fetcher: Fetcher } {
  if (kind === 'fixtures') return { sources: demoRegistry(), fetcher: demoFetcher(deps.now) };
  const fetcher = new HttpFetcher({ userAgent: config.userAgent, maxBytes: config.maxBytes, requestIntervalMs: config.requestIntervalMs, ...(deps.transport === undefined ? {} : { transport: deps.transport }) });
  return { sources: loadSources(path.join(deps.cwd, 'sources.yml')), fetcher };
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const config = configOf(deps);
  const date = args.date ?? (args.sources === 'fixtures' ? DEMO_DATE : deps.now().toISOString().slice(0, 10));
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf(args.sources, deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }

  let choice: ClientChoice;
  if (args.client === 'fake') choice = { kind: 'fake', fake: demoClient() };
  else if (args.client === 'recorded') choice = { kind: 'recorded', cassetteDir: path.resolve(deps.cwd, args.cassettes as string) };
  else choice = { kind: 'api' };
  let model: BuiltClient;
  try {
    // A run records the replies of the model beside its artifacts, so that `desk replay` can run it again; a run that replays recorded replies has no need.
    model = clientFromConfig(config, choice, deps.env, deps.retry ?? {}, args.client === 'recorded' ? undefined : path.join(runPath(config.runDir, date), 'cassettes'));
  } catch (error) {
    deps.err(describeError(error));
    return 2;
  }

  try {
    const result = await runDesk({
      date,
      config,
      sources: world.sources,
      fetcher: world.fetcher,
      model,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    deps.out(`outcome: ${result.outcome}`);
    deps.out(`run: ${result.runId}`);
    deps.out(`folder: ${result.dir}`);
    if (result.slug !== null) deps.out(`piece: ${result.slug}`);
    if (result.reason !== null) deps.out(`reason: ${result.reason}`);
    if (result.outcome === 'no-story' || result.outcome === 'failed') deps.out(`stage: ${result.stage}`);
    if (result.dry) deps.out(`dry run: nothing was written to the site or to git (${result.files.length} files would have been)`);
    else if (result.commit !== null) deps.out(`commit: ${result.commit}`);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    deps.err(error instanceof RunRefused ? `the run was refused: ${error.message}` : `the run could not start: ${describeError(error)}`);
    return 1;
  }
}

async function replayCommand(args: Extract<Parsed, { command: 'replay' }>, deps: CliDeps): Promise<number> {
  const config = configOf(deps);
  try {
    const report = await replayRun(path.resolve(deps.cwd, args.runDir), {
      config,
      sources: sourcesOf(args.sources, deps, config).sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      ...(args.cassettes === undefined ? {} : { cassetteDir: path.resolve(deps.cwd, args.cassettes) }),
    });
    deps.out(`run: ${report.runId}`);
    for (const artifact of report.artifacts) deps.out(`${artifact.name}: ${artifact.status}${artifact.detail === null ? '' : ` (${artifact.detail})`}`);
    if (report.error !== null) deps.out(`the replay stopped: ${report.error}`);
    deps.out(report.equal ? 'replay: equal' : 'replay: not equal');
    return report.equal ? 0 : 1;
  } catch (error) {
    deps.err(`the run cannot be replayed: ${describeError(error)}`);
    return 1;
  }
}

async function statusCommand(deps: CliDeps): Promise<number> {
  try {
    const state = await readDeskState(path.join(deps.cwd, sitePaths().stateFile));
    const { lastRun } = state;
    deps.out(lastRun === null ? 'last run: none yet' : `last run: ${lastRun.outcome} at ${lastRun.at} (run ${lastRun.runId}${lastRun.slug === null ? '' : `, piece ${lastRun.slug}`})`);
    deps.out(`holds: ${state.holds.length}`);
    return 0;
  } catch (error) {
    deps.err(describeError(error));
    return 1;
  }
}

/** Run the command in `argv` (without the program and the script) and return the exit code. Never exits the process and never throws. */
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.err(`desk: ${parsed.message}`);
    deps.err(USAGE);
    return 2;
  }
  switch (parsed.args.command) {
    case 'help':
      deps.out(USAGE);
      return 0;
    case 'run':
      return runCommand(parsed.args, deps);
    case 'replay':
      return replayCommand(parsed.args, deps);
    case 'status':
      return statusCommand(deps);
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the program, and the script that starts it**

**Create `desk/src/bin.ts`:**
```ts
import { GitCli } from './index';
import { main } from './cli';

// The program: `npm run desk -- run --dry --client fake --sources fixtures`. It runs `main` with the real clock, environment and git, in the folder it is
// started from, which must be the root of the repository, and sets the exit code.

const cwd = process.cwd();
process.exitCode = await main(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
  cwd,
  now: () => new Date(),
  git: new GitCli(cwd),
});
```

**In `package.json`, replace:**
```json
    "audit:prod": "node site/scripts/audit.mjs --prod",
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
```

**with:**
```json
    "audit:prod": "node site/scripts/audit.mjs --prod",
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "desk": "tsx desk/src/bin.ts",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
```

The README must name every root script (`site/test/verify.test.ts` checks it), so the new script fails that test until the README says what it does.

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `to contain 'npm run desk'`

- [ ] **Step 4: Document the commands**

**In `README.md`, replace:**
```markdown
`desk/` (`@robywire/desk`) is where the pipeline is being built, and so far it is a start: it holds the configuration and nothing that reads a source, calls a model or publishes. `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` reads an optional YAML file over the defaults and refuses a setting it does not know or a value that is not allowed. Git ignores `runs/` and `evidence/`: run artifacts and private snapshots of sources never go into the repository. The rest of this section is written when the pipeline is.

## Requirements

```

**with:**
```markdown
`desk/` (`@robywire/desk`) is where the pipeline is being built, and so far it is a start: it holds the configuration and nothing that reads a source, calls a model or publishes. `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` reads an optional YAML file over the defaults and refuses a setting it does not know or a value that is not allowed. Git ignores `runs/` and `evidence/`: run artifacts and private snapshots of sources never go into the repository. The rest of this section is written when the pipeline is.

## The desk command

`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that already has a run is refused unless `--force-new` is given.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same.
- `npm run desk -- status` prints the last run and the number of holds, from the desk state.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

## Requirements

```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Keep the command line out of the entry point**

The command line is the top of the package, like the stages. This test passes at once; it is there so that it keeps passing.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...demo]) {
      expect(entry).not.toHaveProperty(name);
    }
```

**with:**
```ts
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...program, ...demo]) {
      expect(entry).not.toHaveProperty(name);
    }
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 6: Run the program**

Start it as a program, as the owner will. A usage error exits with 2, `status` reads the desk state, and the made-up story runs in a dry run and is replayed from what it kept. The run writes `runs/` and `evidence/` at the root, which git ignores and which the last line removes.

Run: `npm run --silent desk -- run --bogus`
Expected: FAIL — `unknown option --bogus for run`

Run: `npm run --silent desk -- status`
Expected: PASS — `last run: none yet`

Run:

```bash
npm run --silent desk -- run --dry --client fake --sources fixtures
npm run --silent desk -- replay runs/2026-10-05 --sources fixtures
rm -rf runs evidence
git status --short -- site
```
Expected: PASS — `outcome: published` and `dry run: nothing was written to the site or to git` and `replay: equal`

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 8: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 9: Commit**

```bash
git add README.md package.json desk/src/bin.ts desk/src/cli.ts desk/test/cli.test.ts desk/test/fetch/exports.test.ts
git commit -m "feat(desk): the command line: run, replay and status, with the scripted story and the made-up world allowed only in dry runs, exit codes that say what happened, and a root script to start it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 37: The adversarial matrix

**Files:**
- Test: `desk/test/adversarial.test.ts`

This task adds no code. It is the proof that the Desk is built the way the design says it is: *models propose and code disposes*, and **nothing a model gets wrong reaches the site**. Every scenario is the clean story of Task 33 with one thing made bad, run through the whole pipeline, Discover to the end, with the real stages, the made-up world and a scripted model. Each has the result that it must end in and, where the gate is what catches it, the code of the failure that the gate reports. A table at the end says what each scenario ended in, and that **none of them ended published**.

**The scenarios** are the proposals of a model that goes wrong, and each is stopped by a check that code makes:

| Scenario | What the model does | What stops it |
|---|---|---|
| an invented number | writes 900 where the claim says 500 | `G4_NUMBER_UNSUPPORTED` |
| a swapped figure | writes $83,000 for $38,000 | `G4_NUMBER_UNSUPPORTED` |
| an invented quotation | quotes words the source never says | `G5_QUOTE_NOT_VERBATIM` |
| an invented name at the start of a sentence | opens a sentence with a company that is not in the claims | `G4_INITIAL_WORD_UNSUPPORTED` |
| a lowercase opening | starts the opening with a small letter, to hide a name from the first-word rule | `G2_SENTENCE_START` |
| a wrong number written out in words | writes fourteen where the claim says 12 | `G4_NUMBER_UNSUPPORTED` |
| a heading that asserts a figure | puts a number in a heading | `G4_HEADING_NUMBER` |
| a claim of another outlet stated as fact | cites a `reported` claim in a sentence that does not attribute it | `G6_TIER2_UNATTRIBUTED` |
| a claim of another outlet, attributed and verified | does everything right with a claim from another outlet | the gate's hold, `TIER2_ATTRIBUTION`: a piece that cites another outlet is never published by itself |
| a claim whose quotation is not in the source | proposes a claim with a made-up quotation, and the piece cites it | Extract drops it (`quote-not-found`), and the sentence cites a claim that does not exist (`G3_UNKNOWN_CLAIM`) |
| a claim whose label carries a name that is not in its quotation | proposes a label that names a company that is not there | Extract drops it (`label-not-in-quote`), and the piece's citation of it fails (`G3_UNKNOWN_CLAIM`) |
| a sentence that the verifier rejects although the gate passes it | says that a planned delivery has been made, with every figure and name correct | the verifier, `G10_NOT_ENTAILED`: the gate cannot read meaning, and this is the layer that can |
| a composer that never fixes its draft | is sent back twice and writes another wrong number each time | `G4_NUMBER_UNSUPPORTED` after the last round, and the draft is held |
| a verifier that finds the basis of a claim not supported | marks a basis as not supported | `G10_LABEL_UNSUPPORTED`: a label can never be revised, so it holds at once |
| a verifier that gives no verdict on a sentence | says nothing of one sentence | `G10_NOT_JUDGED`: silence is not approval |

Every one of them ends **held**, with the reasons in the desk state, the held draft in the folder of the run, **no piece and no ledger on the site**, and one commit that holds the desk state alone. Beside them run the clean story, which ends published; a composer that fixes its draft when it is sent back once, which ends published, so that the scenarios above are known to be held for what is wrong in them and not because the revision loop refuses everything; and a story with no source that can be read (the pages are behind `robots.txt`), which ends in no story.

**The tests prove that they can fail.** A matrix that only ever passes shows nothing. After it passes, Step 3 breaks the Verify stage on purpose, so that it publishes whatever it is given, and the matrix must fail, in dozens of places.

- [ ] **Step 1: Write the matrix**

**Create `desk/test/adversarial.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
import { GOLDEN_CLAIMS } from '@robywire/gate/fixtures';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, clearingVerifier } from '../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoFetcher } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import { FakeClient } from '../src/model/fake';
import { ExtractArtifact, VerifyArtifact, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import type { RunResult } from '../src/run/orchestrate';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { EMPTY_CONTENT, SELECT, STATE, contentOf, setupRun } from './support/run';

// The adversarial matrix. Models propose and code disposes, and these are the proposals of a model that goes wrong: every scenario is the clean story with
// one thing made bad, run through the whole pipeline (Discover to the end, the real stages, the made-up world) with a scripted model. Each has the
// result that it must end in and, where the gate is what catches it, the code of the failure that the gate reports. None of them may end published, and
// a table at the end says so. The clean story and the two other ways a run can end well or end with no story are run beside them, so that the
// scenarios are known to be bad because of what was changed, and not because the pipeline refuses everything.

const scratch = useScratch();
const claims7 = GOLDEN_CLAIMS.slice(0, 7);

const fact = (text: string, ...claimIds: string[]) => ({ kind: 'fact' as const, text, claimIds });

/** The clean piece of the made-up story, with `change` made to it. */
function reply(change: (copy: ComposeReply) => void): ComposeReply {
  const copy = structuredClone(DEMO_REPLY);
  change(copy);
  return copy;
}

/** The number of the sentence of `piece` that says `text`, as the gate numbers sentences and as Verify names them. */
function idOf(piece: ComposeReply, text: string): string {
  const draft = assembleDraft(piece, claims7, { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
  const found = allSentences(draft).find((item) => item.sentence.text === text);
  if (found === undefined) throw new Error(`no sentence "${text}"`);
  return `s${found.index}`;
}

/** A claim of the outlet that reports the news, from the second page. It is the only way that something from another outlet gets into a piece. */
const REPORTED = {
  text: 'The arm is priced from $38,000.',
  label: 'list price',
  type: 'number',
  quote: 'The arm is priced from $38,000, the outlet reported.',
  values: [{ kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' }],
  basis: 'reported',
  status: 'unspecified',
  source: 2,
};

/** A claim with a quotation that is not on the page of the release: the model made it up. */
const NOT_ON_THE_PAGE = {
  text: 'The FX-1 weighs 38 kg.',
  label: 'arm mass',
  type: 'spec',
  quote: 'Arm mass: 38 kg.',
  values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }],
  basis: 'datasheet',
  status: 'unspecified',
  source: 1,
};

/** A claim whose quotation is on the page and whose label names a company that is not there. */
const MADE_UP_NAME = { ...DEMO_CLAIMS[3], label: 'Harlow list price' };

/** Two rounds of revision in which the composer sends back nothing: it does not fix what it was asked to. */
const NEVER_FIXES = [{ replacements: [] }, { replacements: [] }];

/** A verifier that clears everything except what `change` does to its reply. */
const verifier = (change: (reply: ReturnType<typeof clearingVerifier>) => void) => (request: Parameters<typeof clearingVerifier>[0]) => {
  const copy = clearingVerifier(request);
  change(copy);
  return copy;
};

/** A model that says what it is told: the selection, the claims, the piece and what comes after, and a verifier reply for each pass that the gate clears. */
function told(options: { claims?: object[]; piece?: ComposeReply; revisions?: unknown[]; verify?: unknown[] }): FakeClient {
  return new FakeClient()
    .script('select', SELECT)
    .script('extract', { claims: options.claims ?? DEMO_CLAIMS })
    .script('compose', options.piece ?? DEMO_REPLY, ...(options.revisions ?? NEVER_FIXES))
    .script('verify', ...(options.verify ?? []));
}

interface Scenario {
  name: string;
  script: () => FakeClient;
  /** The code of the failure that the gate reports for the piece, when the gate is what catches it. */
  gate?: string;
  /** The reasons of the hold, in the desk state. */
  reasons: string[];
  /** The revision rounds that were used. */
  rounds: number;
  /** What else the scenario says about the run. */
  check?: (made: { dir: string }) => Promise<void>;
}

const BAD: Scenario[] = [
  {
    name: 'an invented number',
    script: () => told({ piece: reply((copy) => { copy.takeaways[3] = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a swapped figure',
    script: () => told({ piece: reply((copy) => { copy.takeaways[0] = fact('Fixture Robotics lists the FX-1 from $83,000 per arm.', 'c-4'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'an invented quotation',
    script: () => told({ piece: reply((copy) => { copy.opening[1] = fact('The company said, "this arm will change every warehouse", on 1 October 2026.', 'c-2'); }) }),
    gate: 'G5_QUOTE_NOT_VERBATIM',
    reasons: ['G5_QUOTE_NOT_VERBATIM'],
    rounds: 2,
  },
  {
    name: 'an invented name at the start of a sentence',
    script: () => told({ piece: reply((copy) => { copy.opening[1] = fact('Harlow Dynamics announced on 1 October 2026 that deliveries have started.', 'c-2'); }) }),
    gate: 'G4_INITIAL_WORD_UNSUPPORTED',
    reasons: ['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a lowercase opening',
    script: () => told({ piece: reply((copy) => { copy.opening[0] = fact('fixture Robotics has begun shipping FX-1 warehouse arms to Brindle Logistics for its second plant, at Tarnmoor.', 'c-1'); }) }),
    gate: 'G2_SENTENCE_START',
    reasons: ['G2_SENTENCE_START'],
    rounds: 2,
  },
  {
    name: 'a wrong number written out in words',
    script: () => told({ piece: reply((copy) => { copy.takeaways[1] = fact('Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within fourteen weeks of an order.', 'c-4'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a heading that asserts a figure',
    script: () => told({ piece: reply((copy) => { (copy.sections[1] as { heading: string }).heading = 'What 12 weeks of delivery means'; }) }),
    gate: 'G4_HEADING_NUMBER',
    reasons: ['G4_HEADING_NUMBER'],
    rounds: 2,
  },
  {
    name: 'a claim of another outlet stated as fact',
    script: () => told({ claims: [...DEMO_CLAIMS, REPORTED], piece: reply((copy) => { copy.takeaways[3] = fact('The arm is priced from $38,000.', 'c-8'); }) }),
    gate: 'G6_TIER2_UNATTRIBUTED',
    reasons: ['G6_TIER2_UNATTRIBUTED'],
    rounds: 2,
  },
  {
    name: 'a claim of another outlet that is attributed and verified, which still goes to the owner',
    script: () =>
      told({
        claims: [...DEMO_CLAIMS, REPORTED],
        piece: reply((copy) => { copy.takeaways[3] = { kind: 'fact', text: 'Mercer Wire reports that the arm is priced from $38,000.', claimIds: ['c-8'], attributed: true }; }),
        verify: [clearingVerifier],
      }),
    reasons: ['TIER2_ATTRIBUTION'],
    rounds: 0,
  },
  {
    name: 'a claim whose quotation is not in the source, which the piece then cites',
    script: () => told({ claims: [...DEMO_CLAIMS, NOT_ON_THE_PAGE], piece: reply((copy) => { copy.takeaways[3] = fact('The FX-1 weighs 38 kg.', 'c-8'); }) }),
    gate: 'G3_UNKNOWN_CLAIM',
    reasons: ['G3_UNKNOWN_CLAIM', 'G4_NUMBER_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
    check: async ({ dir }) => {
      const extracted = await readArtifact(dir, '04-extract', ExtractArtifact);
      expect(extracted.claims).toHaveLength(7);
      expect(extracted.dropped.map((claim) => [claim.index, claim.reasons.map((reason) => reason.code)])).toEqual([[7, ['quote-not-found']]]);
    },
  },
  {
    name: 'a claim whose label carries a name that is not in its quotation, which the piece then cites',
    script: () => told({ claims: [...DEMO_CLAIMS, MADE_UP_NAME], piece: reply((copy) => { copy.takeaways[3] = fact('Fixture Robotics lists the FX-1 from $38,000 per arm.', 'c-8'); }) }),
    gate: 'G3_UNKNOWN_CLAIM',
    reasons: ['G3_UNKNOWN_CLAIM', 'G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
    check: async ({ dir }) => {
      const extracted = await readArtifact(dir, '04-extract', ExtractArtifact);
      expect(extracted.dropped.map((claim) => claim.reasons.map((reason) => reason.code))).toEqual([['label-not-in-quote']]);
    },
  },
  (() => {
    // A sentence that says that a planned delivery has been made: every figure and name in it is in the claim, so the gate passes it, and only the verifier can tell.
    const distorted = fact('Tarnmoor has received 60 arms by 30 November 2026.', 'c-5');
    const piece = reply((copy) => { copy.takeaways[2] = distorted; });
    const id = idOf(piece, distorted.text);
    const rejecting = verifier((copy) => { copy.verdicts = copy.verdicts.map((verdict) => (verdict.id === id ? { ...verdict, verdict: 'not_entailed' as const } : verdict)); });
    return {
      name: 'a sentence that the verifier rejects although the gate passes it',
      script: () => told({ piece, verify: [rejecting, rejecting, rejecting] }),
      reasons: ['G10_NOT_ENTAILED'],
      rounds: 2,
      check: async ({ dir }: { dir: string }) => {
        const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
        expect(verified.history.map((pass) => pass.gate.route)).toEqual(['publish', 'publish', 'publish']);
        expect(verified.history.map((pass) => pass.verifierFailures.map((failure) => failure.id))).toEqual([[id], [id], [id]]);
      },
    };
  })(),
  (() => {
    // A composer that is sent back twice and each time writes another wrong number.
    const wrong = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6');
    const piece = reply((copy) => { copy.takeaways[3] = wrong; });
    const id = idOf(piece, wrong.text);
    const again = (kilograms: number) => ({ replacements: [{ id, sentence: fact(`Fixture Robotics expects to build ${kilograms} FX-1 arms in 2027.`, 'c-6') }] });
    return {
      name: 'a composer that never fixes its draft',
      script: () => told({ piece, revisions: [again(800), again(700)] }),
      gate: 'G4_NUMBER_UNSUPPORTED',
      reasons: ['G4_NUMBER_UNSUPPORTED'],
      rounds: 2,
      check: async ({ dir }: { dir: string }) => {
        const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
        expect(verified.history.map((pass) => pass.sent)).toEqual([[id], [id], []]);
        expect(verified.history.every((pass) => pass.verifier === null)).toBe(true);
      },
    };
  })(),
  {
    name: 'a verifier that finds the basis of a claim not supported',
    script: () => told({ verify: [verifier((copy) => { copy.labels = copy.labels.map((label) => (label.id === 'c-4' ? { ...label, basisSupported: false } : label)); })] }),
    reasons: ['G10_LABEL_UNSUPPORTED'],
    rounds: 0,
  },
  (() => {
    // A verifier that leaves a sentence without a verdict: the Desk does not take silence for approval.
    const silent = verifier((copy) => { copy.verdicts = copy.verdicts.filter((verdict) => verdict.id !== 's3'); });
    return {
      name: 'a verifier that gives no verdict on a sentence',
      script: () => told({ verify: [silent, silent, silent] }),
      reasons: ['G10_NOT_JUDGED'],
      rounds: 2,
    } satisfies Scenario;
  })(),
];

/** What a scenario left: the result of the run and where it went. */
const results = new Map<string, { result: RunResult; repoDir: string; git: ReturnType<typeof setupRun>['git']; fake: FakeClient }>();

beforeAll(async () => {
  for (const scenario of BAD) {
    const made = setupRun(scratch, { fake: scenario.script() });
    results.set(scenario.name, { result: await made.run(), repoDir: made.repoDir, git: made.git, fake: made.fake });
  }
});

describe.each(BAD.map((scenario) => [scenario.name, scenario] as const))('the adversarial matrix: %s', (_name, scenario) => {
  const got = () => results.get(scenario.name) as NonNullable<ReturnType<typeof results.get>>;

  it('ends held, and not published', () => {
    expect(got().result.outcome).toBe('held');
    expect(got().result.stage).toBe('hold');
  });

  it('puts nothing into the pages of the site: no piece and no ledger', () => {
    expect(contentOf(got().repoDir)).toEqual(EMPTY_CONTENT);
  });

  it('makes one commit, of the desk state alone', () => {
    expect(got().git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
  });

  it('records a hold in the desk state with the reasons, and the run as held', async () => {
    const state = await readDeskState(path.join(got().repoDir, STATE));
    expect(state.holds.map((hold) => hold.reasons)).toEqual([scenario.reasons]);
    expect(state.lastRun?.outcome).toBe('held');
  });

  it('is stopped by the check that it should be: the gate reports the code, in every pass, or the model check does', async () => {
    const dir = path.join(got().result.dir);
    const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
    expect(verified.outcome).toBe('hold');
    expect(verified.rounds).toBe(scenario.rounds);
    if (scenario.gate !== undefined) {
      for (const pass of verified.history) expect(pass.gate.failures.map((failure) => failure.code)).toContain(scenario.gate);
    }
    await scenario.check?.({ dir });
  });

  it('keeps the held draft in the folder of the run', () => {
    const held = JSON.parse(readFileSync(path.join(got().result.dir, 'held', `${got().result.slug}.json`), 'utf8')) as { reasons: string[] };
    expect(held.reasons).toEqual(scenario.reasons);
  });
});

describe('the adversarial matrix: the table', () => {
  it('has at least twelve scenarios, each with its own name', () => {
    expect(BAD.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BAD.map((scenario) => scenario.name)).size).toBe(BAD.length);
  });

  it('says what each scenario ended in, and none of them ended published', () => {
    const table = BAD.map((scenario) => [scenario.name, (results.get(scenario.name) as { result: RunResult }).result.outcome]);
    expect(table).toEqual(BAD.map((scenario) => [scenario.name, 'held']));
    expect(table.filter(([, outcome]) => outcome === 'published')).toEqual([]);
  });

  it('catches every one of the checks of the gate that the scenarios are about, by the code that the gate gives it', () => {
    expect([...new Set(BAD.flatMap((scenario) => (scenario.gate === undefined ? [] : [scenario.gate])))].sort()).toEqual([
      'G2_SENTENCE_START',
      'G3_UNKNOWN_CLAIM',
      'G4_HEADING_NUMBER',
      'G4_INITIAL_WORD_UNSUPPORTED',
      'G4_NUMBER_UNSUPPORTED',
      'G5_QUOTE_NOT_VERBATIM',
      'G6_TIER2_UNATTRIBUTED',
    ]);
  });
});

describe('the adversarial matrix: the ways to end that are not bad', () => {
  it('ends the clean story published, with a piece and a ledger on the site and one commit', async () => {
    const made = setupRun(scratch, { fake: told({ verify: [clearingVerifier], revisions: [] }) });
    const result = await made.run();
    expect(result.outcome).toBe('published');
    expect(contentOf(made.repoDir)).toHaveLength(4);
    expect(made.git.commits).toHaveLength(1);
  });

  it('ends published a composer that fixes its draft when it is sent back once, so the scenarios above are held for what is wrong in them and not for the revision', async () => {
    const wrong = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6');
    const piece = reply((copy) => { copy.takeaways[3] = wrong; });
    const fixed = { replacements: [{ id: idOf(piece, wrong.text), sentence: fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6') }] };
    const made = setupRun(scratch, { fake: told({ piece, revisions: [fixed], verify: [clearingVerifier] }) });
    const result = await made.run();
    expect(result.outcome).toBe('published');
    const verified = await readArtifact(result.dir, '06-verify', VerifyArtifact);
    expect(verified.rounds).toBe(1);
    expect(verified.history[0]?.gate.failures.map((failure) => failure.code)).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('ends no-story when the story has no source that can be read: the pages of the story are behind robots.txt', async () => {
    const blocked = (url: string) => new FetchError('robots', url, 'robots.txt does not allow it');
    const fetcher = withPages(demoFetcher(() => FETCHED_AT), { [DEMO_URLS.mercerArticle]: blocked(DEMO_URLS.mercerArticle), [DEMO_URLS.release]: blocked(DEMO_URLS.release) });
    const made = setupRun(scratch, { fake: new FakeClient().script('select', SELECT), fetcher });
    const result = await made.run();
    expect(result.outcome).toBe('no-story');
    expect(result.stage).toBe('fetch');
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.fake.calls.map((call) => call.role)).toEqual(['select']);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 3: Break the Verify stage on purpose, and watch the matrix fail**

The one line of `verify.ts` that decides between publishing and holding is replaced by a Verify that says `publish` to everything.

**In `desk/src/stages/verify.ts`, replace:**
```ts
  const outcome = gate.route === 'publish' && last.passed ? 'publish' : 'hold';
```

**with:**
```ts
  const outcome = 'publish';
```

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts`
Expected: FAIL — `ends held, and not published`

Put it back:

Run: `git checkout -- desk/src/stages/verify.ts`
Expected: PASS

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 4: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Commit**

```bash
git add desk/test/adversarial.test.ts
git commit -m "test(desk): the adversarial matrix: fifteen scripted-bad scenarios run through the whole pipeline, each held for the reason the gate or the verifier gives, none published, beside the clean story that is" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 38: The verifier evals

**Files:**
- Create: `desk/evals/verifier-set.json` (the labelled set: sixty sentences)
- Create: `desk/evals/run-verifier.ts` (`Passage`, `EvalItem`, `EvalSet`, `loadVerifierSet`, `planOf`, `evaluateVerifier`, `scoreOf`, `floorFailures`, `formatReport`, `main`)
- Create: `desk/evals/scripted.ts` (`scriptedVerifier`, `perfectVerifier`, `lazyVerifier`, `strictVerifier`)
- Modify: `desk/src/stages/verify-model.ts` (`judgePlan`, which `runVerifier` now uses)
- Modify: `desk/tsconfig.json` (the typecheck covers `evals`)
- Modify: `package.json` (the script `evals:verifier`), `README.md`
- Modify: `desk/test/stages/verify-model.test.ts`, `desk/test/fetch/exports.test.ts`
- Test: `desk/test/evals/verifier-set.test.ts`, `desk/test/evals/run-verifier.test.ts`

G10, the model check, is a model that judges whether the passages of a source entail a sentence. A verifier that is lazy would let a wrong sentence through, and one that is too strict would hold every piece, so the verifier has to be **measured**. This task builds the means to measure it: a labelled set of sixty sentences, and a harness that runs any `ModelClient` over the set and reports precision and recall. **Plan 2 verifies the harness, and measures no model**: the tests give it scripted verifiers whose scores are known exactly, and no floor is frozen here (what a verifier must score is decided in milestone 5, once real models have been measured).

**The set.** `desk/evals/verifier-set.json` has twenty sets of passages, each with three sentences: one that the passages **support**, one that is **unsupported** (it says something the passages do not say: an added figure, an added comparison, an added cause), and one that is **distorted** (it changes what the passages say in a small way: a number, a unit, a date, a plan turned into something done, one party for another, `up to` made `at least`, a comparison turned round, a scope widened). That is 20, 20 and 20, in the order supported, unsupported, distorted, repeated, so that any ten in a row mix the labels. Each passage has the basis and the status that a claim would give it, and a passage that another outlet reported has an outlet. A sentence that is not supported has a `flaw`, one sentence for the reader of the set that says what is wrong with it; the verifier never sees it, nor the label. Everything is made up (the companies, the people, the products), plain ASCII, with no address in it.

**The harness** runs the set through `judgePlan`, the function that the Verify stage's `runVerifier` now calls, so the prompt (`verifySystem`, `buildVerifyUser`) and the reading of the reply (`aggregateVerdicts`) are the pipeline's own, not a copy. The items go in batches of ten by default (about the size of a piece), each batch one call, each sentence `s0`, `s1` and so on, citing the claims of its passages, numbered from `c-1` over the batch. **An item is cleared when the reading of the reply finds no failure of its sentence and none of the labels of the passages it cites**, which is when the Desk would let it through. The scores:
- for each label, how many items had it and how many the verifier got right (a supported sentence cleared; an unsupported or distorted one not cleared), and the recall;
- for the sentences it **cleared**: the precision (how many are supported) and the recall (how many of the supported ones it cleared);
- for the sentences it **flagged**: the precision (how many are not supported) and the recall (how many of the unsupported and distorted ones it caught);
- the accuracy over all sixty.
A score that has nothing to divide by (a verifier that cleared nothing has no precision for what it cleared) is `n/a`, not a made-up number.

**The floors** are options: `--min-recall` applies to the recall of each label, so a verifier cannot make up for missing distortions by clearing every supported sentence, and `--min-precision` to the precision of what it cleared and what it flagged. With no floor, or 0, the command exits 0; below a floor it exits 1 and says which score; a score that does not exist is below any floor above 0.

**The scripted verifiers** (`scripted.ts`) read the sentences from the blocks of the real message, find them in the set and answer in the real shape: **perfect** (clears the supported and no others), **lazy** (clears everything) and **strict** (clears nothing); and one that catches the unsupported and is fooled by the distorted. Their scores are exact: the lazy verifier has recall 1 for supported and 0 for the other two, precision 20/60 for what it cleared, and flags nothing, so it has no precision for what it flagged.

`npm run evals:verifier` runs the harness with the perfect verifier, which proves the wiring and measures no model. `--client api --model <name>` asks a real model (it needs `ANTHROPIC_API_KEY`, and runs inside the budget of a run); the first real measurement is for Plan 2b.

- [ ] **Step 1: Write the failing test of `judgePlan`**

**In `desk/test/stages/verify-model.test.ts`, replace:**
```ts
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { ModelError } from '../../src/model/types';
import { buildVerifyUser, verifySystem } from '../../src/prompts/verify';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { VERIFY_MAX_OUTPUT_TOKENS, VerifyReply, aggregateVerdicts, runVerifier, verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { blocksOf, outsideBlocks } from '../support/prompts';
```

**with:**
```ts
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../../src/model/fake';
import { ModelError } from '../../src/model/types';
import { buildVerifyUser, verifySystem } from '../../src/prompts/verify';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { VERIFY_MAX_OUTPUT_TOKENS, VerifyReply, aggregateVerdicts, judgePlan, runVerifier, verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { blocksOf, outsideBlocks } from '../support/prompts';
```

**In `desk/test/stages/verify-model.test.ts`, replace:**
```ts
});

describe('runVerifier', () => {
  /** A stage whose model will say `reply` for the verify role, and the outcome of the check on the golden draft. */
```

**with:**
```ts
});

describe('judgePlan', () => {
  it('makes one call in the role verify, with the model it is given, the prompt of the verifier and the reply schema, and returns the outcome and the cost', async () => {
    const fake = new FakeClient().script('verify', verifierReply(PLAN));
    const { outcome, usage } = await judgePlan(fake, 'model-w', PLAN);
    expect(fake.calls).toHaveLength(1);
    const [request] = fake.calls;
    expect(request?.role).toBe('verify');
    expect(request?.model).toBe('model-w');
    expect(request?.system).toBe(verifySystem());
    expect(request?.user).toBe(buildVerifyUser({ claims: PLAN.claims, sentences: PLAN.sentences, headings: PLAN.headings }));
    expect(request?.maxOutputTokens).toBe(VERIFY_MAX_OUTPUT_TOKENS);
    expect(outcome.verifier.model).toBe('model-w');
    expect(outcome.verifier.passed).toBe(true);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it('reads the reply as runVerifier does: what is not entailed fails, and a verdict for what was not asked is a schema error', async () => {
    const id = PLAN.sentences[2]?.id as string;
    const failing = await judgePlan(new FakeClient().script('verify', verifierReply(PLAN, { verdicts: { [id]: 'not_entailed' } })), MODEL, PLAN);
    expect(failing.outcome.failures.map((failure) => failure.id)).toEqual([id]);
    const unknown = new FakeClient().script('verify', verifierReply(PLAN, { extra: { verdicts: [{ id: 's999', verdict: 'entailed', reason: 'x' }] } }));
    await expect(judgePlan(unknown, MODEL, PLAN)).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
  });

  it('refuses a plan that has nothing to judge, because the message would be empty', async () => {
    await expect(judgePlan(new FakeClient(), MODEL, { sentences: [], headings: [], claims: [] })).rejects.toThrow('buildVerifyUser needs at least one sentence or heading to judge');
  });
});

describe('runVerifier', () => {
  /** A stage whose model will say `reply` for the verify role, and the outcome of the check on the golden draft. */
```

Run: `npm test --workspace @robywire/desk -- test/stages/verify-model.test.ts`
Expected: FAIL — `judgePlan is not a function`

- [ ] **Step 2: Make the call of the verifier a function that the evals can use**

**In `desk/src/stages/verify-model.ts`, replace:**
```ts
import { z } from 'zod';
import { ModelError } from '../index';
import { buildVerifyUser, verifySystem } from '../prompts/verify';
import type { StageContext } from './context';
```

**with:**
```ts
import { z } from 'zod';
import { ModelError } from '../index';
import type { ModelClient, ModelUsage } from '../index';
import { buildVerifyUser, verifySystem } from '../prompts/verify';
import type { StageContext } from './context';
```

**In `desk/src/stages/verify-model.ts`, replace:**
```ts

/**
 * Ask the verifier model about `draft` and say what it means: one call, in the role `verify`, with the model that the configuration names for
 * it. A reply that does not match `VerifyReply`, or that judges what was not asked, is a `schema` error that ends the run.
 */
export async function runVerifier(ctx: StageContext, draft: Draft, claims: Claim[]): Promise<VerifierOutcome> {
  const plan = verifyPlanOf(draft, claims);
  if (plan.sentences.length + plan.headings.length === 0) throw new Error('runVerifier needs a draft with at least one fact sentence or heading to judge');
  const reply = await ctx.client.json({
    role: 'verify',
    model: ctx.config.models.verify,
    system: verifySystem(),
    user: buildVerifyUser({ claims: plan.claims, sentences: plan.sentences, headings: plan.headings }),
```

**with:**
```ts

/**
 * Ask a verifier model about `plan` and say what it means: one call, in the role `verify`, with the model `model`, whose reply is checked against `VerifyReply`
 * and read by `aggregateVerdicts`. A reply that does not match, or that judges what was not asked, is a `schema` error. It is what `runVerifier` does for a
 * draft, and what the evals do for the sentences of the labelled set, so that both measure the same prompt and the same reading of the reply. Returns what
 * the call cost along with the outcome.
 */
export async function judgePlan(client: ModelClient, model: string, plan: VerifyPlan): Promise<{ outcome: VerifierOutcome; usage: ModelUsage }> {
  const reply = await client.json({
    role: 'verify',
    model,
    system: verifySystem(),
    user: buildVerifyUser({ claims: plan.claims, sentences: plan.sentences, headings: plan.headings }),
```

**In `desk/src/stages/verify-model.ts`, replace:**
```ts
    maxOutputTokens: VERIFY_MAX_OUTPUT_TOKENS,
  });
  const outcome = aggregateVerdicts(ctx.config.models.verify, plan, reply.value);
  ctx.log(`verify: the model check ${outcome.verifier.passed ? 'passed' : `failed ${outcome.failures.length} times`}`);
  return outcome;
```

**with:**
```ts
    maxOutputTokens: VERIFY_MAX_OUTPUT_TOKENS,
  });
  return { outcome: aggregateVerdicts(model, plan, reply.value), usage: reply.usage };
}

/**
 * Ask the verifier model about `draft` and say what it means (see `judgePlan`), with the model that the configuration names for the role. A reply that does
 * not match `VerifyReply`, or that judges what was not asked, is a `schema` error that ends the run.
 */
export async function runVerifier(ctx: StageContext, draft: Draft, claims: Claim[]): Promise<VerifierOutcome> {
  const plan = verifyPlanOf(draft, claims);
  if (plan.sentences.length + plan.headings.length === 0) throw new Error('runVerifier needs a draft with at least one fact sentence or heading to judge');
  const { outcome } = await judgePlan(ctx.client, ctx.config.models.verify, plan);
  ctx.log(`verify: the model check ${outcome.verifier.passed ? 'passed' : `failed ${outcome.failures.length} times`}`);
  return outcome;
```

Run: `npm test --workspace @robywire/desk -- test/stages/verify-model.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the labelled set**

The set is data, and these are all sixty items. The tests of the next step say what it must be.

**Create `desk/evals/verifier-set.json`:**
```json
{
  "about": "Sixty sentences for measuring the verifier of the Desk: for each of twenty sets of passages, one sentence that the passages support, one that says something they do not say, and one that changes what they say in a small way. Everything in it is made up.",
  "items": [
    {
      "id": "e-01",
      "label": "supported",
      "sentence": "Fixture Robotics has begun shipping FX-1 arms to a second Brindle Logistics plant, at Tarnmoor.",
      "passages": [
        { "quote": "Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-02",
      "label": "unsupported",
      "sentence": "Fixture Robotics has begun shipping FX-1 arms to Brindle Logistics, which is its largest customer.",
      "passages": [
        { "quote": "Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage does not say that Brindle Logistics is the largest customer of Fixture Robotics."
    },
    {
      "id": "e-03",
      "label": "distorted",
      "sentence": "Fixture Robotics has begun shipping FX-1 arms to the first Brindle Logistics plant, at Tarnmoor.",
      "passages": [
        { "quote": "Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The second plant has become the first plant."
    },
    {
      "id": "e-04",
      "label": "supported",
      "sentence": "Fixture Robotics lists the FX-1 from $38,000 per arm.",
      "passages": [
        { "quote": "Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-05",
      "label": "unsupported",
      "sentence": "Fixture Robotics has cut the price of the FX-1 to $38,000 per arm.",
      "passages": [
        { "quote": "Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage gives a list price and says nothing of a price cut."
    },
    {
      "id": "e-06",
      "label": "distorted",
      "sentence": "Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 days of an order.",
      "passages": [
        { "quote": "Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The delivery time of 12 weeks has become 12 days."
    },
    {
      "id": "e-07",
      "label": "supported",
      "sentence": "Tarnmoor is due to receive 60 arms by 30 November 2026.",
      "passages": [
        { "quote": "Tarnmoor is due to receive 60 arms by 30 November 2026.", "basis": "press-release", "status": "planned" }
      ]
    },
    {
      "id": "e-08",
      "label": "unsupported",
      "sentence": "Tarnmoor will use the 60 arms for inbound trailer unloading.",
      "passages": [
        { "quote": "Tarnmoor is due to receive 60 arms by 30 November 2026.", "basis": "press-release", "status": "planned" }
      ],
      "flaw": "The passage does not say what the arms will be used for."
    },
    {
      "id": "e-09",
      "label": "distorted",
      "sentence": "Tarnmoor has received 60 arms by 30 November 2026.",
      "passages": [
        { "quote": "Tarnmoor is due to receive 60 arms by 30 November 2026.", "basis": "press-release", "status": "planned" }
      ],
      "flaw": "A delivery that is due has become a delivery that was made."
    },
    {
      "id": "e-10",
      "label": "supported",
      "sentence": "Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells at Ashvale.",
      "passages": [
        { "quote": "At Ashvale, Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells, comparing the four weeks before and after the FX-1 arms went live.", "basis": "measured", "status": "deployed" }
      ]
    },
    {
      "id": "e-11",
      "label": "unsupported",
      "sentence": "The 18 per cent cut in cycle time saved Brindle Logistics $2 million in a year.",
      "passages": [
        { "quote": "At Ashvale, Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells, comparing the four weeks before and after the FX-1 arms went live.", "basis": "measured", "status": "deployed" }
      ],
      "flaw": "The passage gives no saving in money."
    },
    {
      "id": "e-12",
      "label": "distorted",
      "sentence": "Brindle Logistics measured an 18 per cent cut in cycle time across all of its plants.",
      "passages": [
        { "quote": "At Ashvale, Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells, comparing the four weeks before and after the FX-1 arms went live.", "basis": "measured", "status": "deployed" }
      ],
      "flaw": "A result at one site, on tote-picking cells, has become a result for every plant."
    },
    {
      "id": "e-13",
      "label": "supported",
      "sentence": "The FX-1 is rated for a payload of 12 kg at full reach and a maximum reach of 1.4 m.",
      "passages": [
        { "quote": "Rated payload: 12 kilograms at full reach.", "basis": "datasheet", "status": "unspecified" },
        { "quote": "Maximum reach: 1.4 metres from the base.", "basis": "datasheet", "status": "unspecified" }
      ]
    },
    {
      "id": "e-14",
      "label": "unsupported",
      "sentence": "The FX-1 is rated for a payload of 12 kg at full reach, the highest in its class.",
      "passages": [
        { "quote": "Rated payload: 12 kilograms at full reach.", "basis": "datasheet", "status": "unspecified" },
        { "quote": "Maximum reach: 1.4 metres from the base.", "basis": "datasheet", "status": "unspecified" }
      ],
      "flaw": "The passages do not compare the arm with any other."
    },
    {
      "id": "e-15",
      "label": "distorted",
      "sentence": "The FX-1 is rated for a payload of 12 kg at full reach and a maximum reach of 1.6 m.",
      "passages": [
        { "quote": "Rated payload: 12 kilograms at full reach.", "basis": "datasheet", "status": "unspecified" },
        { "quote": "Maximum reach: 1.4 metres from the base.", "basis": "datasheet", "status": "unspecified" }
      ],
      "flaw": "The maximum reach of 1.4 m has become 1.6 m."
    },
    {
      "id": "e-16",
      "label": "supported",
      "sentence": "The datasheet lists a throughput of up to 1,200 picks an hour.",
      "passages": [
        { "quote": "Throughput: up to 1.2k picks an hour.", "basis": "datasheet", "status": "unspecified" }
      ]
    },
    {
      "id": "e-17",
      "label": "unsupported",
      "sentence": "The datasheet lists a throughput of up to 1,200 picks an hour for mixed cartons.",
      "passages": [
        { "quote": "Throughput: up to 1.2k picks an hour.", "basis": "datasheet", "status": "unspecified" }
      ],
      "flaw": "The passage does not say what is picked."
    },
    {
      "id": "e-18",
      "label": "distorted",
      "sentence": "The datasheet lists a typical throughput of 1,200 picks an hour.",
      "passages": [
        { "quote": "Throughput: up to 1.2k picks an hour.", "basis": "datasheet", "status": "unspecified" }
      ],
      "flaw": "A figure given as an upper limit has become a typical figure."
    },
    {
      "id": "e-19",
      "label": "supported",
      "sentence": "The offering raised USD 450 million and was led by Corvane Partners.",
      "passages": [
        { "quote": "Total amount sold: USD 450 million", "basis": "filing", "status": "unspecified" },
        { "quote": "Lead investor: Corvane Partners", "basis": "filing", "status": "unspecified" }
      ]
    },
    {
      "id": "e-20",
      "label": "unsupported",
      "sentence": "The offering raised USD 450 million and valued Fixture Robotics at $3 billion.",
      "passages": [
        { "quote": "Total amount sold: USD 450 million", "basis": "filing", "status": "unspecified" },
        { "quote": "Lead investor: Corvane Partners", "basis": "filing", "status": "unspecified" }
      ],
      "flaw": "The passages give no valuation."
    },
    {
      "id": "e-21",
      "label": "distorted",
      "sentence": "The offering raised USD 450 million and was led by Brindle Logistics.",
      "passages": [
        { "quote": "Total amount sold: USD 450 million", "basis": "filing", "status": "unspecified" },
        { "quote": "Lead investor: Corvane Partners", "basis": "filing", "status": "unspecified" }
      ],
      "flaw": "The lead investor has become another company."
    },
    {
      "id": "e-22",
      "label": "supported",
      "sentence": "Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer at its demo day.",
      "passages": [
        { "quote": "At its demo day, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.", "basis": "demo", "status": "demonstrated" }
      ]
    },
    {
      "id": "e-23",
      "label": "unsupported",
      "sentence": "Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer faster than a person can.",
      "passages": [
        { "quote": "At its demo day, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.", "basis": "demo", "status": "demonstrated" }
      ],
      "flaw": "The passage makes no comparison with a person."
    },
    {
      "id": "e-24",
      "label": "distorted",
      "sentence": "Fixture Robotics has deployed FX-1 arms to unload mixed cartons from trailers.",
      "passages": [
        { "quote": "At its demo day, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.", "basis": "demo", "status": "demonstrated" }
      ],
      "flaw": "A demonstration has become a deployment."
    },
    {
      "id": "e-25",
      "label": "supported",
      "sentence": "Dana Whitcombe, chief operating officer of Brindle Logistics, said that the company went from pilot to production in nine weeks.",
      "passages": [
        { "quote": "\"We went from pilot to production in nine weeks,\" said Dana Whitcombe, chief operating officer of Brindle Logistics.", "basis": "press-release", "status": "deployed" }
      ]
    },
    {
      "id": "e-26",
      "label": "unsupported",
      "sentence": "Dana Whitcombe, chief operating officer of Brindle Logistics, said that the company went from pilot to production in nine weeks and plans to double its fleet.",
      "passages": [
        { "quote": "\"We went from pilot to production in nine weeks,\" said Dana Whitcombe, chief operating officer of Brindle Logistics.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The passage says nothing of doubling a fleet."
    },
    {
      "id": "e-27",
      "label": "distorted",
      "sentence": "Dana Whitcombe, chief operating officer of Fixture Robotics, said that the company went from pilot to production in nine weeks.",
      "passages": [
        { "quote": "\"We went from pilot to production in nine weeks,\" said Dana Whitcombe, chief operating officer of Brindle Logistics.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The speaker has been moved to another company."
    },
    {
      "id": "e-28",
      "label": "supported",
      "sentence": "Northwind Machines said in a briefing that the Pallet Pilot moves pallets of up to 800 kg.",
      "passages": [
        { "quote": "Northwind Machines said in a briefing that its Pallet Pilot robot moves pallets of up to 800 kilograms.", "basis": "briefing", "status": "unspecified" }
      ]
    },
    {
      "id": "e-29",
      "label": "unsupported",
      "sentence": "Northwind Machines said in a briefing that the Pallet Pilot is already used by three retailers.",
      "passages": [
        { "quote": "Northwind Machines said in a briefing that its Pallet Pilot robot moves pallets of up to 800 kilograms.", "basis": "briefing", "status": "unspecified" }
      ],
      "flaw": "The passage does not say who uses the robot."
    },
    {
      "id": "e-30",
      "label": "distorted",
      "sentence": "Northwind Machines said in a briefing that the Pallet Pilot moves pallets of at least 800 kg.",
      "passages": [
        { "quote": "Northwind Machines said in a briefing that its Pallet Pilot robot moves pallets of up to 800 kilograms.", "basis": "briefing", "status": "unspecified" }
      ],
      "flaw": "An upper limit has become a lower limit."
    },
    {
      "id": "e-31",
      "label": "supported",
      "sentence": "Hollis Dynamics released version 4.2 of Hollis Nav on 14 September 2026.",
      "passages": [
        { "quote": "Hollis Dynamics released version 4.2 of its Hollis Nav software on 14 September 2026; the release adds support for two lidar models.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-32",
      "label": "unsupported",
      "sentence": "Hollis Dynamics released version 4.2 of Hollis Nav, which halves the time it takes to map a site.",
      "passages": [
        { "quote": "Hollis Dynamics released version 4.2 of its Hollis Nav software on 14 September 2026; the release adds support for two lidar models.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage does not say that mapping is faster."
    },
    {
      "id": "e-33",
      "label": "distorted",
      "sentence": "Hollis Dynamics released version 4.2 of Hollis Nav on 14 October 2026.",
      "passages": [
        { "quote": "Hollis Dynamics released version 4.2 of its Hollis Nav software on 14 September 2026; the release adds support for two lidar models.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The month of the release has changed."
    },
    {
      "id": "e-34",
      "label": "supported",
      "sentence": "Standard LSB-7 requires a safety-rated stop within 0.5 seconds for mobile robots over 50 kg.",
      "passages": [
        { "quote": "Standard LSB-7 of the Lowmoor Safety Board requires a safety-rated stop within 0.5 seconds for mobile robots over 50 kilograms.", "basis": "standard", "status": "unspecified" }
      ]
    },
    {
      "id": "e-35",
      "label": "unsupported",
      "sentence": "Standard LSB-7 also requires an annual audit of every robot fleet.",
      "passages": [
        { "quote": "Standard LSB-7 of the Lowmoor Safety Board requires a safety-rated stop within 0.5 seconds for mobile robots over 50 kilograms.", "basis": "standard", "status": "unspecified" }
      ],
      "flaw": "The passage mentions no audit."
    },
    {
      "id": "e-36",
      "label": "distorted",
      "sentence": "Standard LSB-7 requires a safety-rated stop within 0.5 seconds for all mobile robots.",
      "passages": [
        { "quote": "Standard LSB-7 of the Lowmoor Safety Board requires a safety-rated stop within 0.5 seconds for mobile robots over 50 kilograms.", "basis": "standard", "status": "unspecified" }
      ],
      "flaw": "A requirement for robots over 50 kg has become a requirement for all of them."
    },
    {
      "id": "e-37",
      "label": "supported",
      "sentence": "Quarry Robotics said that its Q-Haul truck is rated to haul 40 tonnes per trip.",
      "passages": [
        { "quote": "Quarry Robotics said its Q-Haul truck is rated to haul 40 tonnes per trip.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-38",
      "label": "unsupported",
      "sentence": "Quarry Robotics said that its Q-Haul truck is rated to haul 40 tonnes per trip, more than any other truck in its class.",
      "passages": [
        { "quote": "Quarry Robotics said its Q-Haul truck is rated to haul 40 tonnes per trip.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage makes no comparison with other trucks."
    },
    {
      "id": "e-39",
      "label": "distorted",
      "sentence": "Quarry Robotics said that its Q-Haul truck is rated to haul 40 tonnes per hour.",
      "passages": [
        { "quote": "Quarry Robotics said its Q-Haul truck is rated to haul 40 tonnes per trip.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "A load per trip has become a load per hour."
    },
    {
      "id": "e-40",
      "label": "supported",
      "sentence": "Gantry Daily reports that Tarn Mobility plans to open a plant in Brindle by 2028.",
      "passages": [
        { "quote": "Tarn Mobility plans to open a plant in Brindle by 2028, Gantry Daily reported, citing two people familiar with the plan.", "basis": "reported", "status": "planned", "outlet": "Gantry Daily" }
      ]
    },
    {
      "id": "e-41",
      "label": "unsupported",
      "sentence": "Gantry Daily reports that Tarn Mobility has chosen Brindle for a plant and will hire 400 people.",
      "passages": [
        { "quote": "Tarn Mobility plans to open a plant in Brindle by 2028, Gantry Daily reported, citing two people familiar with the plan.", "basis": "reported", "status": "planned", "outlet": "Gantry Daily" }
      ],
      "flaw": "The passage names no choice of site and no hiring."
    },
    {
      "id": "e-42",
      "label": "distorted",
      "sentence": "Gantry Daily reports that Tarn Mobility has opened a plant in Brindle.",
      "passages": [
        { "quote": "Tarn Mobility plans to open a plant in Brindle by 2028, Gantry Daily reported, citing two people familiar with the plan.", "basis": "reported", "status": "planned", "outlet": "Gantry Daily" }
      ],
      "flaw": "A plan has become a plant that is open."
    },
    {
      "id": "e-43",
      "label": "supported",
      "sentence": "Ashvale Foods installed 12 Pallet Pilot robots at its Marlow depot.",
      "passages": [
        { "quote": "Ashvale Foods installed 12 Pallet Pilot robots at its Marlow depot and plans to add 8 more by March 2027.", "basis": "press-release", "status": "deployed" }
      ]
    },
    {
      "id": "e-44",
      "label": "unsupported",
      "sentence": "Ashvale Foods installed 12 Pallet Pilot robots at its Marlow depot, replacing its forklifts.",
      "passages": [
        { "quote": "Ashvale Foods installed 12 Pallet Pilot robots at its Marlow depot and plans to add 8 more by March 2027.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The passage says nothing of forklifts."
    },
    {
      "id": "e-45",
      "label": "distorted",
      "sentence": "Ashvale Foods installed 20 Pallet Pilot robots at its Marlow depot.",
      "passages": [
        { "quote": "Ashvale Foods installed 12 Pallet Pilot robots at its Marlow depot and plans to add 8 more by March 2027.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The 8 robots that are planned have been counted as installed."
    },
    {
      "id": "e-46",
      "label": "supported",
      "sentence": "Fixture Robotics said that the FX-1 repeats a position more closely than its previous arm, within 0.05 mm against 0.1 mm.",
      "passages": [
        { "quote": "Fixture Robotics said the FX-1 repeats a position to within 0.05 mm, against 0.1 mm for its previous arm.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-47",
      "label": "unsupported",
      "sentence": "Fixture Robotics said that the FX-1 repeats a position within 0.05 mm, more closely than any other arm on the market.",
      "passages": [
        { "quote": "Fixture Robotics said the FX-1 repeats a position to within 0.05 mm, against 0.1 mm for its previous arm.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage compares the arm only with its predecessor."
    },
    {
      "id": "e-48",
      "label": "distorted",
      "sentence": "Fixture Robotics said that the FX-1 repeats a position to within 0.1 mm, against 0.05 mm for its previous arm.",
      "passages": [
        { "quote": "Fixture Robotics said the FX-1 repeats a position to within 0.05 mm, against 0.1 mm for its previous arm.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The comparison has been turned round."
    },
    {
      "id": "e-49",
      "label": "supported",
      "sentence": "The Brindle Logistics installation at Ashvale went live on 18 August 2026.",
      "passages": [
        { "quote": "The Brindle Logistics installation at Ashvale went live on 18 August 2026.", "basis": "press-release", "status": "deployed" }
      ]
    },
    {
      "id": "e-50",
      "label": "unsupported",
      "sentence": "The Brindle Logistics installation at Ashvale went live ahead of plan.",
      "passages": [
        { "quote": "The Brindle Logistics installation at Ashvale went live on 18 August 2026.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The passage does not say what the plan was."
    },
    {
      "id": "e-51",
      "label": "distorted",
      "sentence": "The Brindle Logistics installation at Ashvale went live on 18 August 2025.",
      "passages": [
        { "quote": "The Brindle Logistics installation at Ashvale went live on 18 August 2026.", "basis": "press-release", "status": "deployed" }
      ],
      "flaw": "The year of the go-live has changed."
    },
    {
      "id": "e-52",
      "label": "supported",
      "sentence": "The filing records that seven investors took part in the offering.",
      "passages": [
        { "quote": "Total number of investors in the offering: 7", "basis": "filing", "status": "unspecified" }
      ]
    },
    {
      "id": "e-53",
      "label": "unsupported",
      "sentence": "The filing records that seven investors took part in the offering, two of them existing shareholders.",
      "passages": [
        { "quote": "Total number of investors in the offering: 7", "basis": "filing", "status": "unspecified" }
      ],
      "flaw": "The passage does not say who the investors are."
    },
    {
      "id": "e-54",
      "label": "distorted",
      "sentence": "The filing records that seven investors led the offering.",
      "passages": [
        { "quote": "Total number of investors in the offering: 7", "basis": "filing", "status": "unspecified" }
      ],
      "flaw": "Taking part has become leading."
    },
    {
      "id": "e-55",
      "label": "supported",
      "sentence": "The company said that the FX-1 mounts on existing conveyor frames without a new safety cage.",
      "passages": [
        { "quote": "The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.", "basis": "press-release", "status": "unspecified" }
      ]
    },
    {
      "id": "e-56",
      "label": "unsupported",
      "sentence": "The company said that the FX-1 mounts on existing conveyor frames in under an hour.",
      "passages": [
        { "quote": "The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "The passage gives no time for the mounting."
    },
    {
      "id": "e-57",
      "label": "distorted",
      "sentence": "The FX-1 mounts on existing conveyor frames and needs no safety cage.",
      "passages": [
        { "quote": "The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.", "basis": "press-release", "status": "unspecified" }
      ],
      "flaw": "No new cage has become no cage, and the company is no longer named as the source."
    },
    {
      "id": "e-58",
      "label": "supported",
      "sentence": "Fixture Robotics expects to build 500 FX-1 arms in 2027.",
      "passages": [
        { "quote": "Fixture Robotics expects to build 500 FX-1 arms in 2027.", "basis": "press-release", "status": "planned" }
      ]
    },
    {
      "id": "e-59",
      "label": "unsupported",
      "sentence": "Fixture Robotics expects to build 500 FX-1 arms in 2027, which would make it the largest arm maker in the region.",
      "passages": [
        { "quote": "Fixture Robotics expects to build 500 FX-1 arms in 2027.", "basis": "press-release", "status": "planned" }
      ],
      "flaw": "The passage makes no comparison with other makers."
    },
    {
      "id": "e-60",
      "label": "distorted",
      "sentence": "Fixture Robotics expects to build 500 FX-1 arms by 2027.",
      "passages": [
        { "quote": "Fixture Robotics expects to build 500 FX-1 arms in 2027.", "basis": "press-release", "status": "planned" }
      ],
      "flaw": "A plan for the year 2027 has become a plan for the time up to it."
    }
  ]
}
```

- [ ] **Step 4: Write the failing tests of the set and of the harness**

**Create `desk/test/evals/verifier-set.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Claim } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { EvalItem, EvalSet, LABELS, Passage, VERIFIER_SET_FILE, loadVerifierSet, planOf } from '../../evals/run-verifier';
import { useScratch } from '../support/context';
import { writeFileSync } from 'node:fs';

// The labelled set that the verifier is measured on: sixty sentences, each with the passages it is judged against, twenty that the passages support, twenty that
// say something they do not say and twenty that change what they say in a small way. These tests say that the set is what it claims to be, and that the schema that
// guards it refuses what a hand-edited set could get wrong.

const scratch = useScratch();
const SET = loadVerifierSet();
const problem = (schema: { safeParse(value: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): string => {
  const result = schema.safeParse(value);
  return result.success ? '' : (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
};

const ITEM: EvalItem = {
  id: 'e-01',
  label: 'supported',
  sentence: 'Fixture Robotics lists the FX-1 from $38,000 per arm.',
  passages: [{ quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm.', basis: 'press-release', status: 'unspecified' }],
};

describe('the committed set', () => {
  it('has sixty sentences, twenty of each label: supported, unsupported and distorted', () => {
    expect(SET.items).toHaveLength(60);
    for (const label of LABELS) expect(SET.items.filter((item) => item.label === label), label).toHaveLength(20);
    expect(LABELS).toEqual(['supported', 'unsupported', 'distorted']);
  });

  it('numbers its items e-01 to e-60, in order, and has no sentence twice', () => {
    expect(SET.items.map((item) => item.id)).toEqual(Array.from({ length: 60 }, (_, at) => `e-${String(at + 1).padStart(2, '0')}`));
    expect(new Set(SET.items.map((item) => item.sentence)).size).toBe(60);
  });

  it('is made of twenty sets of passages, each with a supported sentence, an unsupported one and a distorted one, in that order, so that any ten items in a row mix the labels', () => {
    for (let at = 0; at < 60; at += 3) {
      const triple = SET.items.slice(at, at + 3);
      expect(triple.map((item) => item.label)).toEqual(['supported', 'unsupported', 'distorted']);
      expect(triple[1]?.passages).toEqual(triple[0]?.passages);
      expect(triple[2]?.passages).toEqual(triple[0]?.passages);
    }
  });

  it('gives a flaw for every sentence that is not supported, and for no other, and a different flaw each time', () => {
    for (const item of SET.items) expect(item.flaw === undefined, item.id).toBe(item.label === 'supported');
    const flaws = SET.items.flatMap((item) => (item.flaw === undefined ? [] : [item.flaw]));
    expect(flaws).toHaveLength(40);
    expect(new Set(flaws).size).toBe(40);
  });

  it('cites one or two passages for each sentence, of at most 300 characters, as a claim may quote', () => {
    for (const item of SET.items) {
      expect(item.passages.length, item.id).toBeGreaterThanOrEqual(1);
      expect(item.passages.length, item.id).toBeLessThanOrEqual(2);
      for (const passage of item.passages) expect(passage.quote.length, item.id).toBeLessThanOrEqual(300);
    }
  });

  it('has passages of several bases and statuses, and gives an outlet to the passages that another outlet reported, and to no other', () => {
    const passages = SET.items.flatMap((item) => item.passages);
    expect(new Set(passages.map((passage) => passage.basis)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(passages.map((passage) => passage.status))).toEqual(new Set(['unspecified', 'planned', 'deployed', 'demonstrated']));
    const reported = passages.filter((passage) => passage.basis === 'reported');
    expect(reported.length).toBeGreaterThan(0);
    for (const passage of passages) expect(passage.outlet !== undefined, passage.quote).toBe(passage.basis === 'reported');
  });

  it('is made up: plain ASCII, no address and no real name, only the companies and the people of the made-up world', () => {
    const text = readFileSync(VERIFIER_SET_FILE, 'utf8');
    expect([...text].every((character) => character.charCodeAt(0) < 128)).toBe(true);
    expect(text).not.toMatch(/https?:|www\./);
    const names = new Set(text.match(/\b(?:[A-Z][a-z]+ (?:Robotics|Logistics|Machines|Dynamics|Mobility|Foods|Partners|Daily|Wire|Safety Board)|Dana Whitcombe|Hollis Nav|Pallet Pilot|Q-Haul)\b/g));
    expect([...names].sort()).toEqual(
      ['Ashvale Foods', 'Brindle Logistics', 'Corvane Partners', 'Dana Whitcombe', 'Fixture Robotics', 'Gantry Daily', 'Hollis Dynamics', 'Hollis Nav', 'Lowmoor Safety Board', 'Northwind Machines', 'Pallet Pilot', 'Quarry Robotics', 'Q-Haul', 'Tarn Mobility'].sort(),
    );
  });

  it('keeps the answer away from the sentence: no sentence says that it is supported, unsupported or distorted, or repeats its flaw', () => {
    for (const item of SET.items) {
      expect(item.sentence, item.id).not.toMatch(/\b(unsupported|distorted|not supported)\b/i);
      if (item.flaw !== undefined) expect(item.sentence).not.toContain(item.flaw);
    }
  });

  it('is the file that loadVerifierSet reads by default, and it is valid against the schema', () => {
    expect(path.basename(VERIFIER_SET_FILE)).toBe('verifier-set.json');
    expect(EvalSet.safeParse(JSON.parse(readFileSync(VERIFIER_SET_FILE, 'utf8'))).success).toBe(true);
  });
});

describe('the schema of an item', () => {
  it('accepts a supported sentence with no flaw, and one that is not with a flaw', () => {
    expect(problem(EvalItem, ITEM)).toBe('');
    expect(problem(EvalItem, { ...ITEM, label: 'distorted', flaw: 'The price has changed.' })).toBe('');
  });

  it('refuses a flaw on a supported sentence, and no flaw on one that is not', () => {
    expect(problem(EvalItem, { ...ITEM, flaw: 'x' })).toBe('flaw: a flaw is given for a sentence that is not supported, and for no other');
    expect(problem(EvalItem, { ...ITEM, label: 'unsupported' })).toBe('flaw: a flaw is given for a sentence that is not supported, and for no other');
  });

  it('refuses an id of the wrong shape, a label that is not one of the three, and an empty sentence', () => {
    expect(problem(EvalItem, { ...ITEM, id: 'e-1' })).toContain('id:');
    expect(problem(EvalItem, { ...ITEM, id: 'item-01' })).toContain('id:');
    expect(problem(EvalItem, { ...ITEM, label: 'unclear' })).toContain('label:');
    expect(problem(EvalItem, { ...ITEM, sentence: '' })).toContain('sentence:');
    expect(problem(EvalItem, { ...ITEM, sentence: 'x'.repeat(301) })).toContain('sentence:');
  });

  it('refuses no passage, more than three, a quote that is empty or over 300 characters, and a basis or status that does not exist', () => {
    const passage = ITEM.passages[0] as Passage;
    expect(problem(EvalItem, { ...ITEM, passages: [] })).toContain('passages:');
    expect(problem(EvalItem, { ...ITEM, passages: [passage, passage, passage, passage] })).toContain('passages:');
    expect(problem(EvalItem, { ...ITEM, passages: [passage, passage, passage] })).toBe('');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: '' }] })).toContain('passages.0.quote:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: 'x'.repeat(301) }] })).toContain('passages.0.quote:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: 'x'.repeat(300) }] })).toBe('');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'rumour' }] })).toContain('passages.0.basis:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, status: 'done' }] })).toContain('passages.0.status:');
  });

  it('refuses an outlet on a passage that is not reported, and a reported passage with no outlet', () => {
    const passage = ITEM.passages[0] as Passage;
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, outlet: 'Gantry Daily' }] })).toBe('passages.0.outlet: a passage has an outlet when its basis is reported, and not otherwise');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'reported' }] })).toBe('passages.0.outlet: a passage has an outlet when its basis is reported, and not otherwise');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'reported', outlet: 'Gantry Daily' }] })).toBe('');
  });

  it('refuses a field it does not know', () => {
    expect(problem(EvalItem, { ...ITEM, note: 'x' })).toContain('Unrecognized key');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...(ITEM.passages[0] as Passage), url: 'https://a.example/' }] })).toContain('Unrecognized key');
  });
});

describe('the schema of a set, and loading it', () => {
  it('refuses two items with the same id, or the same sentence, and names it', () => {
    expect(problem(EvalSet, { about: 'x', items: [ITEM, ITEM] })).toContain('two items have the same id: "e-01"');
    expect(problem(EvalSet, { about: 'x', items: [ITEM, { ...ITEM, id: 'e-02' }] })).toContain('two items have the same sentence');
    expect(problem(EvalSet, { about: 'x', items: [ITEM, { ...ITEM, id: 'e-02', sentence: 'Another sentence.' }] })).toBe('');
  });

  it('refuses a set with no description, and a field it does not know', () => {
    expect(problem(EvalSet, { about: '', items: [] })).toContain('about:');
    expect(problem(EvalSet, { about: 'x', items: [], extra: 1 })).toContain('Unrecognized key');
  });

  it('says that a file that is not there, is not JSON or is not a set cannot be used, and names it', () => {
    const dir = scratch();
    const file = path.join(dir, 'set.json');
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} cannot be read`);
    writeFileSync(file, '{"about": ');
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} cannot be read`);
    writeFileSync(file, JSON.stringify({ about: 'x', items: [{ ...ITEM, flaw: 'x' }] }));
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} is not valid: items.0.flaw:`);
  });
});

describe('planOf', () => {
  const batch = SET.items.slice(12, 15);
  const plan = planOf(batch);

  it('has a sentence for each item, numbered s0, s1 and so on, with the text of the item and no more', () => {
    expect(plan.sentences.map((sentence) => [sentence.id, sentence.text, sentence.section])).toEqual(batch.map((item, at) => [`s${at}`, item.sentence, 'body']));
    expect(plan.headings).toEqual([]);
  });

  it('says where each sentence stands in the batch, counting from 1, for the notes that name it', () => {
    expect(plan.sentences.map((sentence) => sentence.where)).toEqual(['sentence 1 of the batch', 'sentence 2 of the batch', 'sentence 3 of the batch']);
  });

  it('has a claim for each passage, numbered from c-1 over the whole batch, and each sentence cites the claims of its own passages', () => {
    const passages = batch.flatMap((item) => item.passages);
    expect(plan.claims.map((claim) => claim.id)).toEqual(passages.map((_, at) => `c-${at + 1}`));
    expect(plan.claims.map((claim) => claim.span.quote)).toEqual(passages.map((passage) => passage.quote));
    let next = 1;
    batch.forEach((item, at) => {
      expect(plan.sentences[at]?.claimIds).toEqual(item.passages.map(() => `c-${next++}`));
    });
  });

  it('makes claims that the gate accepts, with the basis and the status of the passage, and the outlet of one that was reported', () => {
    for (const claim of plan.claims) expect(Claim.safeParse(claim).success, claim.id).toBe(true);
    const reported = SET.items.find((item) => item.passages.some((passage) => passage.basis === 'reported')) as EvalItem;
    const claim = planOf([reported]).claims[0] as Claim;
    expect([claim.basis, claim.status, claim.source.tier, claim.source.outlet]).toEqual(['reported', 'planned', 2, 'Gantry Daily']);
    const ordinary = planOf([ITEM]).claims[0] as Claim;
    expect([ordinary.basis, ordinary.status, ordinary.source.tier, ordinary.source.outlet]).toEqual(['press-release', 'unspecified', 1, undefined]);
    expect(ordinary.span).toEqual({ start: 0, end: ITEM.passages[0]?.quote.length, quote: ITEM.passages[0]?.quote });
  });

  it('does not say which sentence is supported: the label and the flaw are nowhere in the plan', () => {
    const everything = JSON.stringify(planOf(SET.items));
    for (const item of SET.items) if (item.flaw !== undefined) expect(everything).not.toContain(item.flaw);
    expect(everything).not.toMatch(/"label":"(supported|unsupported|distorted)"/);
  });
});
```

**Create `desk/test/evals/run-verifier.test.ts`:**
```ts
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SIZE, evaluateVerifier, floorFailures, formatReport, loadVerifierSet, main, scoreOf } from '../../evals/run-verifier';
import type { EvalReport, ItemResult } from '../../evals/run-verifier';
import { lazyVerifier, perfectVerifier, scriptedVerifier, strictVerifier } from '../../evals/scripted';
import { ModelError } from '../../src/model/types';
import type { ModelClient, ModelRequest } from '../../src/model/types';
import { verifySystem } from '../../src/prompts/verify';
import { VERIFY_MAX_OUTPUT_TOKENS } from '../../src/stages/verify-model';
import { useScratch } from '../support/context';
import { blocksOf } from '../support/prompts';

// The harness that measures a verifier. Plan 2 verifies the harness and not a model, so these tests give it scripted verifiers whose scores are known exactly: one
// that knows the answers, one that clears everything, one that clears nothing, and one that catches what the passages do not say and misses what they change.

const SET = loadVerifierSet();
const MODEL = 'model-v';
const scratch = useScratch();

/** A client that is asked, and remembers every request. */
function spy(inner: ModelClient): { client: ModelClient; requests: ModelRequest<unknown>[] } {
  const requests: ModelRequest<unknown>[] = [];
  return {
    requests,
    client: {
      async json(request) {
        requests.push(request);
        return inner.json(request);
      },
    },
  };
}

describe('evaluateVerifier: a verifier that knows the answers', () => {
  it('scores 1 everywhere: every label right, precision and recall of both, and the accuracy', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    expect(report.items).toBe(60);
    expect(report.perLabel).toEqual({
      supported: { items: 20, correct: 20, recall: 1 },
      unsupported: { items: 20, correct: 20, recall: 1 },
      distorted: { items: 20, correct: 20, recall: 1 },
    });
    expect(report.cleared).toEqual({ precision: 1, recall: 1 });
    expect(report.flagged).toEqual({ precision: 1, recall: 1 });
    expect(report.accuracy).toBe(1);
    expect(report.results.every((result) => result.cleared === (result.label === 'supported'))).toBe(true);
  });
});

describe('evaluateVerifier: a lazy verifier that clears every sentence', () => {
  it('clears every supported sentence and none of the others are caught: recall 1 for supported and 0 for the rest, and nothing flagged', async () => {
    const report = await evaluateVerifier(lazyVerifier(SET), SET, { model: MODEL });
    expect(report.perLabel).toEqual({
      supported: { items: 20, correct: 20, recall: 1 },
      unsupported: { items: 20, correct: 0, recall: 0 },
      distorted: { items: 20, correct: 0, recall: 0 },
    });
    expect(report.cleared).toEqual({ precision: 20 / 60, recall: 1 });
    expect(report.flagged).toEqual({ precision: null, recall: 0 });
    expect(report.accuracy).toBe(20 / 60);
  });
});

describe('evaluateVerifier: a verifier that is too strict and clears no sentence', () => {
  it('catches every sentence that is not supported and clears no supported one: recall 0 for supported, nothing cleared', async () => {
    const report = await evaluateVerifier(strictVerifier(SET), SET, { model: MODEL });
    expect(report.perLabel).toEqual({
      supported: { items: 20, correct: 0, recall: 0 },
      unsupported: { items: 20, correct: 20, recall: 1 },
      distorted: { items: 20, correct: 20, recall: 1 },
    });
    expect(report.cleared).toEqual({ precision: null, recall: 0 });
    expect(report.flagged).toEqual({ precision: 40 / 60, recall: 1 });
    expect(report.accuracy).toBe(40 / 60);
  });
});

describe('evaluateVerifier: a verifier that is half right', () => {
  it('catches what the passages do not say and is fooled by what they change: recall 1, 1 and 0, precision 0.5 for what it cleared and 1 for what it flagged, recall 0.5 for the flagged', async () => {
    const fooledByDistortions = scriptedVerifier(SET, (item) => (item.label === 'unsupported' ? 'not_entailed' : 'entailed'));
    const report = await evaluateVerifier(fooledByDistortions, SET, { model: MODEL });
    expect(report.perLabel.supported.recall).toBe(1);
    expect(report.perLabel.unsupported.recall).toBe(1);
    expect(report.perLabel.distorted.recall).toBe(0);
    expect(report.cleared).toEqual({ precision: 0.5, recall: 1 });
    expect(report.flagged).toEqual({ precision: 1, recall: 0.5 });
    expect(report.accuracy).toBe(40 / 60);
  });

  it('counts an ambiguous verdict as not clearing, as the Desk does', async () => {
    const hesitant = scriptedVerifier(SET, (item) => (item.label === 'supported' ? 'ambiguous' : 'not_entailed'));
    const report = await evaluateVerifier(hesitant, SET, { model: MODEL });
    expect(report.perLabel.supported.correct).toBe(0);
    expect(report.cleared.recall).toBe(0);
  });

  it('counts a label that is not supported as the item not cleared, because the Desk would hold the piece for it', async () => {
    const perfect = perfectVerifier(SET);
    const doubting: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        const value = reply.value as { labels: { id: string; basisSupported: boolean }[] };
        if (value.labels[0] !== undefined) value.labels[0].basisSupported = false;
        return reply;
      },
    };
    const report = await evaluateVerifier(doubting, SET, { model: MODEL, batchSize: 1 });
    expect(report.items).toBe(60);
    expect(report.perLabel.supported.correct).toBe(0);
    expect(report.perLabel.unsupported.correct).toBe(20);
  });
});

describe('evaluateVerifier: what it asks, and how', () => {
  it('counts a label that is not supported against the item whose passage it is, and no other item of the batch', async () => {
    const perfect = perfectVerifier(SET);
    const doubtingTheFirstPassage: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        (reply.value as { labels: { id: string; statusSupported: boolean }[] }).labels.find((label) => label.id === 'c-1')!.statusSupported = false;
        return reply;
      },
    };
    const report = await evaluateVerifier(doubtingTheFirstPassage, SET, { model: MODEL, batchSize: 60 });
    expect(report.results.filter((result) => !result.cleared === (result.label === 'supported'))).toEqual([{ id: 'e-01', label: 'supported', cleared: false }]);
    expect(report.perLabel.supported.correct).toBe(19);
  });

  it('adds up what each call cost, token for token', async () => {
    const perfect = perfectVerifier(SET);
    const costing: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        return { ...reply, usage: { inputTokens: 100, outputTokens: 7 } };
      },
    };
    expect((await evaluateVerifier(costing, SET, { model: MODEL })).usage).toEqual({ inputTokens: 600, outputTokens: 42 });
    expect((await evaluateVerifier(costing, SET, { model: MODEL, batchSize: 1 })).usage).toEqual({ inputTokens: 6000, outputTokens: 420 });
  });

  it('asks the verifier with the real prompt: the role, the model it was given, the system text of the verifier, and the limit of the reply', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    await evaluateVerifier(client, SET, { model: MODEL });
    expect(requests).toHaveLength(6);
    for (const request of requests) {
      expect(request.role).toBe('verify');
      expect(request.model).toBe(MODEL);
      expect(request.system).toBe(verifySystem());
      expect(request.maxOutputTokens).toBe(VERIFY_MAX_OUTPUT_TOKENS);
      expect(Object.keys(request).sort()).toEqual(['maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    }
  });

  it('puts ten sentences in each call by default, in the order of the set, each sentence once, with the claims of its passages numbered from c-1', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    const report = await evaluateVerifier(client, SET, { model: MODEL });
    expect(DEFAULT_BATCH_SIZE).toBe(10);
    expect(report.calls).toBe(6);
    const seen: string[] = [];
    for (const request of requests) {
      const blocks = blocksOf(request.user);
      const sentences = blocks.filter((block) => block.id.startsWith('s'));
      expect(sentences.map((block) => block.id)).toEqual(Array.from({ length: 10 }, (_, at) => `s${at}`));
      expect(blocks.filter((block) => block.id.startsWith('c-'))[0]?.id).toBe('c-1');
      seen.push(...sentences.map((block) => block.text));
    }
    expect(seen).toEqual(SET.items.map((item) => item.sentence));
  });

  it('takes the size of a batch from the options: 7 gives nine calls, the last with 4 sentences, and 60 gives one call', async () => {
    const seven = spy(perfectVerifier(SET));
    expect((await evaluateVerifier(seven.client, SET, { model: MODEL, batchSize: 7 })).calls).toBe(9);
    expect(seven.requests.map((request) => blocksOf(request.user).filter((block) => block.id.startsWith('s')).length)).toEqual([7, 7, 7, 7, 7, 7, 7, 7, 4]);
    const all = spy(perfectVerifier(SET));
    expect((await evaluateVerifier(all.client, SET, { model: MODEL, batchSize: 60 })).calls).toBe(1);
  });

  it('accepts a batch of one sentence, which is a call for each of the sixty', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    const report = await evaluateVerifier(client, SET, { model: MODEL, batchSize: 1 });
    expect(report.calls).toBe(60);
    expect(requests).toHaveLength(60);
  });

  it('scores the same whatever the size of the batch', async () => {
    const one = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize: 1 });
    const many = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize: 60 });
    expect({ ...one, calls: 0, usage: many.usage }).toEqual({ ...many, calls: 0 });
  });

  it('never shows the verifier the label or the flaw of a sentence', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    await evaluateVerifier(client, SET, { model: MODEL });
    const everything = requests.map((request) => request.user).join('\n');
    for (const item of SET.items) if (item.flaw !== undefined) expect(everything).not.toContain(item.flaw);
    expect(everything).not.toMatch(/\b(unsupported|distorted)\b/);
  });

  it('adds up what the calls cost', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    expect(report.usage.inputTokens).toBeGreaterThan(6 * 500);
    expect(report.usage.outputTokens).toBeGreaterThan(0);
  });

  it('refuses a batch size that is not a whole number of at least 1', async () => {
    for (const batchSize of [0, -3, 2.5, Number.NaN]) {
      await expect(evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize })).rejects.toThrow('the batch size must be a whole number of at least 1');
    }
  });

  it('ends with the error of the client when a call fails, and when the verifier judges what it was not asked', async () => {
    const failing: ModelClient = {
      async json() {
        throw new ModelError('transport', 'the provider is down');
      },
    };
    await expect(evaluateVerifier(failing, SET, { model: MODEL })).rejects.toThrow('the provider is down');
    const perfect = perfectVerifier(SET);
    const confused: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        (reply.value as { verdicts: { id: string }[] }).verdicts[0]!.id = 's99';
        return reply;
      },
    };
    await expect(evaluateVerifier(confused, SET, { model: MODEL })).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
  });

  it('measures the same set again with the same result: it keeps no state', async () => {
    const client = perfectVerifier(SET);
    expect(await evaluateVerifier(client, SET, { model: MODEL })).toEqual(await evaluateVerifier(client, SET, { model: MODEL }));
  });
});

describe('scoreOf', () => {
  const result = (label: ItemResult['label'], cleared: boolean): ItemResult => ({ id: 'e-00', label, cleared });
  const none = { inputTokens: 0, outputTokens: 0 };

  it('has no score for what it has no items for: the empty list gives nothing', () => {
    const report = scoreOf([], 0, none);
    expect(report.accuracy).toBeNull();
    expect(report.cleared).toEqual({ precision: null, recall: null });
    expect(report.flagged).toEqual({ precision: null, recall: null });
    expect(report.perLabel.supported).toEqual({ items: 0, correct: 0, recall: null });
  });

  it('works out each score from the counts: three supported (two cleared), two unsupported (one caught) and one distorted (missed)', () => {
    const report = scoreOf([result('supported', true), result('supported', true), result('supported', false), result('unsupported', false), result('unsupported', true), result('distorted', true)], 1, none);
    expect(report.perLabel).toEqual({ supported: { items: 3, correct: 2, recall: 2 / 3 }, unsupported: { items: 2, correct: 1, recall: 0.5 }, distorted: { items: 1, correct: 0, recall: 0 } });
    // Cleared: 4 (two supported, one unsupported, one distorted). Flagged: 2 (one supported, one unsupported).
    expect(report.cleared).toEqual({ precision: 2 / 4, recall: 2 / 3 });
    expect(report.flagged).toEqual({ precision: 1 / 2, recall: 1 / 3 });
    expect(report.accuracy).toBe(3 / 6);
    expect(report.results).toHaveLength(6);
  });
});

describe('floorFailures', () => {
  const perfect = scoreOf(SET.items.map((item) => ({ id: item.id, label: item.label, cleared: item.label === 'supported' })), 6, { inputTokens: 0, outputTokens: 0 });
  const lazy = scoreOf(SET.items.map((item) => ({ id: item.id, label: item.label, cleared: true })), 6, { inputTokens: 0, outputTokens: 0 });

  it('finds nothing wrong with no floor, with a floor of 0, and with a perfect report under the highest floor', () => {
    expect(floorFailures(lazy, {})).toEqual([]);
    expect(floorFailures(lazy, { precision: 0, recall: 0 })).toEqual([]);
    expect(floorFailures(perfect, { precision: 1, recall: 1 })).toEqual([]);
  });

  it('names each recall that is below the recall floor, label by label', () => {
    expect(floorFailures(lazy, { recall: 0.9 })).toEqual([
      'the recall for unsupported sentences is 0.00, below the floor of 0.90',
      'the recall for distorted sentences is 0.00, below the floor of 0.90',
    ]);
  });

  it('names a precision that is below the precision floor, and a precision that does not exist as below it', () => {
    expect(floorFailures(lazy, { precision: 0.9 })).toEqual([
      'the precision of the sentences it cleared is 0.33, below the floor of 0.90',
      'the precision of the sentences it flagged is n/a, below the floor of 0.90',
    ]);
  });

  it('accepts a score that is exactly the floor', () => {
    expect(floorFailures(lazy, { precision: 20 / 60 }).filter((line) => line.includes('cleared'))).toEqual([]);
    expect(floorFailures(lazy, { recall: 1 / 3 }).filter((line) => line.includes('for supported'))).toEqual([]);
  });
});

describe('formatReport', () => {
  it('prints a table by label, the scores of the two classes, the accuracy and the cost', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    const lines = formatReport({ ...report, usage: { inputTokens: 1200, outputTokens: 340 } }, MODEL);
    expect(lines).toEqual([
      'verifier evaluation: 60 sentences in 6 calls, model model-v',
      'label        items correct  recall',
      'supported       20      20    1.00',
      'unsupported     20      20    1.00',
      'distorted       20      20    1.00',
      'cleared (supported):          precision 1.00, recall 1.00',
      'flagged (not supported):      precision 1.00, recall 1.00',
      'accuracy 1.00',
      'tokens: 1200 in, 340 out',
    ]);
  });

  it('prints n/a for a score that does not exist', async () => {
    const report: EvalReport = await evaluateVerifier(lazyVerifier(SET), SET, { model: MODEL });
    expect(formatReport(report, MODEL)).toContain('flagged (not supported):      precision n/a, recall 0.00');
    expect(formatReport(report, MODEL)).toContain('cleared (supported):          precision 0.33, recall 1.00');
  });
});

describe('main', () => {
  function run(argv: string[], overrides: { client?: ModelClient; env?: Record<string, string> } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const deps = { out: (line: string) => void out.push(line), err: (line: string) => void err.push(line), env: overrides.env ?? {}, ...(overrides.client === undefined ? {} : { client: overrides.client }) };
    return main(argv, deps).then((code) => ({ code, out, err }));
  }

  it('proves the wiring with the fake verifier that knows the answers: exit 0 and a perfect report', async () => {
    const { code, out, err } = await run([]);
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toMatch(/^verifier evaluation: 60 sentences in 6 calls, model \S+$/);
    expect(out).toContain('accuracy 1.00');
    expect(out.some((line) => line.startsWith('below the floor'))).toBe(false);
  });

  it('uses the model that it is given, and the batch size that it is given', async () => {
    const { out } = await run(['--client', 'fake', '--model', 'model-z', '--batch', '12']);
    expect(out[0]).toBe('verifier evaluation: 60 sentences in 5 calls, model model-z');
  });

  it('exits with 0 for a lazy verifier when no floor is set, because no floor is frozen', async () => {
    const { code, out } = await run([], { client: lazyVerifier(SET) });
    expect(code).toBe(0);
    expect(out).toContain('accuracy 0.33');
  });

  it('exits with 1 and says which score is below the floor when a floor is set', async () => {
    const { code, out } = await run(['--min-recall', '0.9'], { client: lazyVerifier(SET) });
    expect(code).toBe(1);
    expect(out).toContain('below the floor: the recall for unsupported sentences is 0.00, below the floor of 0.90');
    expect(out).toContain('below the floor: the recall for distorted sentences is 0.00, below the floor of 0.90');
    const precision = await run(['--min-precision', '0.5', '--min-recall', '0.2'], { client: strictVerifier(SET) });
    expect(precision.code).toBe(1);
    expect(precision.out).toContain('below the floor: the recall for supported sentences is 0.00, below the floor of 0.20');
    expect(precision.out).toContain('below the floor: the precision of the sentences it cleared is n/a, below the floor of 0.50');
  });

  it('exits with 0 for the verifier that knows the answers under the highest floors', async () => {
    expect((await run(['--min-precision', '1', '--min-recall', '1'])).code).toBe(0);
  });

  it('refuses --client api without a key in the environment it was given, with exit 2 and no call', async () => {
    for (const env of [{} as Record<string, string>, { ANTHROPIC_API_KEY: ' ' }]) {
      const { code, out, err } = await run(['--client', 'api'], { env });
      expect(code).toBe(2);
      expect(out).toEqual([]);
      expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
    }
  });

  it('refuses mistakes in the arguments with exit 2, the message and the usage, and runs nothing', async () => {
    const cases: [string[], string][] = [
      [['--verbose', 'x'], 'unknown option --verbose'],
      [['--client'], '--client needs a value'],
      [['--client', '--model'], '--client needs a value'],
      [['--client', 'gpt'], '--client is fake or api, not "gpt"'],
      [['--batch', '0'], '--batch is a whole number of at least 1, not "0"'],
      [['--batch', '2.5'], '--batch is a whole number of at least 1, not "2.5"'],
      [['--batch', 'ten'], '--batch is a whole number of at least 1, not "ten"'],
      [['--min-recall', '1.5'], '--min-recall is a number from 0 to 1, not "1.5"'],
      [['--min-precision', '-0.1'], '--min-precision is a number from 0 to 1, not "-0.1"'],
      [['--min-precision', 'high'], '--min-precision is a number from 0 to 1, not "high"'],
      [['--min-recall', ''], '--min-recall is a number from 0 to 1, not ""'],
      [['--min-recall', ' '], '--min-recall is a number from 0 to 1, not " "'],
      [['--batch', '5', '--batch', '6'], '--batch is given twice'],
    ];
    for (const [argv, message] of cases) {
      const { code, out, err } = await run(argv);
      expect(code, argv.join(' ')).toBe(2);
      expect(out).toEqual([]);
      expect(err[0]).toBe(`evals:verifier: ${message}`);
      expect(err[1]).toContain('Usage: evals:verifier');
    }
  });

  it('accepts a batch of 1, the least there is', async () => {
    const { code, out } = await run(['--batch', '1']);
    expect(code).toBe(0);
    expect(out[0]).toBe(`verifier evaluation: 60 sentences in 60 calls, model ${out[0]?.split('model ')[1]}`);
  });

  it('exits with 1 and says so when the labelled set cannot be used, before any call', async () => {
    const file = path.join(scratch(), 'set.json');
    writeFileSync(file, '{"about": ');
    const out: string[] = [];
    const err: string[] = [];
    const calls: string[] = [];
    const client: ModelClient = {
      async json(request) {
        calls.push(request.role);
        return perfectVerifier(SET).json(request);
      },
    };
    const code = await main([], { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, client, setFile: file });
    expect(code).toBe(1);
    expect(err[0]).toContain(`the verifier set ${file} cannot be read`);
    expect(out).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('accepts floors of 0 and 1, which are the ends of the range', async () => {
    expect((await run(['--min-recall', '0', '--min-precision', '1'], { client: perfectVerifier(SET) })).code).toBe(0);
  });

  it('exits with 1 and says so when the evaluation fails', async () => {
    const failing: ModelClient = {
      async json() {
        throw new ModelError('refused', 'the model declined');
      },
    };
    const { code, err } = await run([], { client: failing });
    expect(code).toBe(1);
    expect(err).toEqual(['the evaluation failed: the model declined']);
  });
});

describe('the scripted verifiers', () => {
  it('refuse a sentence that is not in the set, because they find the answer by the sentence', async () => {
    const client = perfectVerifier(SET);
    await expect(
      client.json({ role: 'verify', model: MODEL, system: 's', user: '<source id="s0">\nA sentence that no item has.\n</source>', schema: (await import('../../src/stages/verify-model')).VerifyReply, maxOutputTokens: 100 }),
    ).rejects.toThrow('the scripted verifier was asked about a sentence that is not in the set');
  });
});

describe('the program', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('runs when it is started as a program, prints the report of the verifier that knows the answers and exits with 0', () => {
    const run = spawnSync('npx', ['tsx', 'desk/evals/run-verifier.ts', '--batch', '30'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('verifier evaluation: 60 sentences in 2 calls');
    expect(run.stdout).toContain('accuracy 1.00');
  }, 60_000);

  it('exits with 2 for a mistake in the arguments, as `main` does', () => {
    const run = spawnSync('npx', ['tsx', 'desk/evals/run-verifier.ts', '--batch', '0'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--batch is a whole number of at least 1, not "0"');
  }, 60_000);

  it('does nothing when it is only imported: importing it printed no report', () => {
    const run = spawnSync('npx', ['tsx', '--eval', "import('./desk/evals/run-verifier.ts').then((module) => console.log(typeof module.main))"], { cwd: root, encoding: 'utf8' });
    expect(run.stdout.trim()).toBe('function');
  }, 60_000);
});
```

Run: `npm test --workspace @robywire/desk -- test/evals`
Expected: FAIL — `Cannot find module '../../evals/run-verifier'`

- [ ] **Step 5: Write the scripted verifiers and the harness**

The typecheck of the desk workspace now covers the `evals` folder too.

**Create `desk/evals/scripted.ts`:**
```ts
import { ModelError } from '../src/index';
import type { ModelClient, ModelRequest, ModelResponse } from '../src/index';
import type { EvalItem, EvalSet } from './run-verifier';

// Verifiers that are scripted, for testing the harness and for proving its wiring with no model: one that knows the answers, one that clears everything (lazy),
// and one that clears nothing (too strict). They read the sentences from the blocks of the message that the real prompt builds, find them in the set, and
// reply in the shape that the real verifier must, so the harness cannot tell them from a model except by what they say.

export type Verdict = 'entailed' | 'not_entailed' | 'ambiguous';

/** The blocks of a message: the id and the text of each. */
function blocksOf(message: string): { id: string; text: string }[] {
  return [...message.matchAll(/<source id="([^"]+)">\n([\s\S]*?)\n<\/source>/g)].map((match) => ({ id: match[1] as string, text: match[2] as string }));
}

/**
 * A verifier that gives `decide(item)` as the verdict on each sentence it is shown and judges every claim's basis and status supported. It finds an item
 * by its sentence, which is why the sentences of a set are all different, and fails if it is asked about one that the set does not have.
 */
export function scriptedVerifier(set: EvalSet, decide: (item: EvalItem) => Verdict): ModelClient {
  return {
    async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
      const blocks = blocksOf(request.user);
      const verdicts = blocks
        .filter((block) => /^s\d+$/.test(block.id))
        .map((block) => {
          const item = set.items.find((candidate) => candidate.sentence === block.text);
          if (item === undefined) throw new Error(`the scripted verifier was asked about a sentence that is not in the set: ${JSON.stringify(block.text)}`);
          return { id: block.id, verdict: decide(item), reason: 'Scripted.' };
        });
      const labels = blocks.filter((block) => /^c-\d+$/.test(block.id)).map((block) => ({ id: block.id, basisSupported: true, statusSupported: true, reason: 'Scripted.' }));
      const parsed = request.schema.safeParse({ verdicts, labels });
      if (!parsed.success) throw new ModelError('schema', 'the scripted reply does not match the schema of the request');
      return { value: parsed.data, usage: { inputTokens: Math.ceil(request.user.length / 4), outputTokens: 20 * (verdicts.length + labels.length) } };
    },
  };
}

/** A verifier that knows the answers: it clears the sentences that are supported and no others. */
export const perfectVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, (item) => (item.label === 'supported' ? 'entailed' : 'not_entailed'));

/** A lazy verifier: it clears every sentence. */
export const lazyVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, () => 'entailed');

/** A verifier that is too strict: it clears no sentence. */
export const strictVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, () => 'not_entailed');
```

**Create `desk/evals/run-verifier.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASES, Claim, STATUSES } from '@robywire/gate';
import { z } from 'zod';
import { clientFromConfig, defaultConfig, describeIssues, sha256Hex } from '../src/index';
import type { Environment, ModelClient, ModelUsage } from '../src/index';
import { judgePlan } from '../src/stages/verify-model';
import type { SentenceItem, VerifyPlan } from '../src/stages/verify-model';
import { perfectVerifier } from './scripted';

// The evals of the verifier. G10 is a model that judges whether the passages of a source entail a sentence, and a model that is lazy, or too strict,
// would either let a wrong sentence through or hold every piece. So the verifier is measured: a labelled set of sixty sentences with the passages they cite,
// twenty that the passages support, twenty that say something they do not say, and twenty that change what they say in a small way. This harness runs any
// `ModelClient` over the set through the real prompt of the verifier and the real reading of its reply (the same `judgePlan` the Verify stage uses), and
// reports precision and recall. Plan 2 builds and tests the harness, with scripted clients; it does not say how well any model does, and it freezes no floor.

export const LABELS = ['supported', 'unsupported', 'distorted'] as const;
export type Label = (typeof LABELS)[number];

const text = z.string().min(1);

/** One passage of a source, as a claim would quote it: the words, and the basis and the status that go with it (an outlet when the basis is `reported`). */
export const Passage = z
  .strictObject({ quote: text.max(300), basis: z.enum(BASES), status: z.enum(STATUSES), outlet: text.optional() })
  .refine((passage) => (passage.basis === 'reported') === (passage.outlet !== undefined), { message: 'a passage has an outlet when its basis is reported, and not otherwise', path: ['outlet'] });
export type Passage = z.infer<typeof Passage>;

/** A sentence, the passages it is judged against, and whether it is supported; a sentence that is not has a `flaw`, which says what is wrong, for the reader of the set and never for the verifier. */
export const EvalItem = z
  .strictObject({
    id: z.string().regex(/^e-\d{2}$/, 'an id looks like e-07'),
    label: z.enum(LABELS),
    sentence: text.max(300),
    passages: z.array(Passage).min(1).max(3),
    flaw: text.optional(),
  })
  .refine((item) => (item.label === 'supported') === (item.flaw === undefined), { message: 'a flaw is given for a sentence that is not supported, and for no other', path: ['flaw'] });
export type EvalItem = z.infer<typeof EvalItem>;

export const EvalSet = z.strictObject({
  about: text,
  items: z.array(EvalItem).superRefine((items, context) => {
    const seen = (key: (item: EvalItem) => string, what: string): void => {
      const found = new Set<string>();
      items.forEach((item, at) => {
        if (found.has(key(item))) context.addIssue({ code: 'custom', path: [at], message: `two items have the same ${what}: ${JSON.stringify(key(item))}` });
        found.add(key(item));
      });
    };
    seen((item) => item.id, 'id');
    seen((item) => item.sentence, 'sentence');
  }),
});
export type EvalSet = z.infer<typeof EvalSet>;

/** Where the committed set is. */
export const VERIFIER_SET_FILE = fileURLToPath(new URL('./verifier-set.json', import.meta.url));

/** Read the set in `file` and check it. A file that cannot be read, is not JSON or is not a valid set is an error that names the file. */
export function loadVerifierSet(file: string = VERIFIER_SET_FILE): EvalSet {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`the verifier set ${file} cannot be read: ${(error as Error).message}`);
  }
  const parsed = EvalSet.safeParse(data);
  if (!parsed.success) throw new Error(`the verifier set ${file} is not valid: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

/** The claim that a passage stands for: one that the prompt of the verifier shows as a passage, with its basis, its status and where it is from. */
function claimOf(id: string, passage: Passage): Claim {
  return Claim.parse({
    id,
    text: passage.quote,
    label: 'passage',
    type: 'event',
    source: {
      url: `https://evals.example/passages/${id}`,
      tier: passage.outlet === undefined ? 1 : 2,
      snapshotHash: sha256Hex(passage.quote),
      retrievedAt: '2026-10-05T00:00:00.000Z',
      ...(passage.outlet === undefined ? {} : { outlet: passage.outlet }),
    },
    span: { start: 0, end: passage.quote.length, quote: passage.quote },
    basis: passage.basis,
    status: passage.status,
    values: [],
  });
}

/**
 * What the verifier is asked about a batch of items: a sentence for each item (`s0`, `s1` and so on) citing the claims of its passages, and a claim for
 * each passage, numbered from `c-1` over the whole batch. The label and the flaw of an item are not in it: the verifier never sees the answer.
 */
export function planOf(items: readonly EvalItem[]): VerifyPlan {
  const claims: Claim[] = [];
  const sentences: SentenceItem[] = items.map((item, at) => {
    const claimIds = item.passages.map((passage) => {
      const claim = claimOf(`c-${claims.length + 1}`, passage);
      claims.push(claim);
      return claim.id;
    });
    return { id: `s${at}`, section: 'body', where: `sentence ${at + 1} of the batch`, text: item.sentence, claimIds };
  });
  return { sentences, headings: [], claims };
}

/** How many sentences go to the verifier in one call, about as many as the sentences of a piece. */
export const DEFAULT_BATCH_SIZE = 10;

/** What became of one item: whether the verifier cleared it (the real reading of its reply found no failure of the sentence and none of the labels of its passages). */
export interface ItemResult {
  id: string;
  label: Label;
  cleared: boolean;
}

export interface Rate {
  /** Null when there is nothing to divide by: a verifier that cleared nothing has no precision for what it cleared. */
  precision: number | null;
  recall: number | null;
}

export interface EvalReport {
  items: number;
  /** How many calls were made. */
  calls: number;
  usage: ModelUsage;
  /** For each label, how many items had it and how many the verifier got right: a supported sentence cleared, a sentence that is not supported not cleared. */
  perLabel: Record<Label, { items: number; correct: number; recall: number | null }>;
  /** The sentences the verifier cleared: how many of them are supported (precision) and how many of the supported ones it cleared (recall). */
  cleared: Rate;
  /** The sentences the verifier did not clear: how many of them are not supported (precision) and how many of the unsupported and distorted ones it caught (recall). */
  flagged: Rate;
  /** The share of all items that it got right. */
  accuracy: number | null;
  results: ItemResult[];
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

/** The scores of a list of results. Pure. */
export function scoreOf(results: readonly ItemResult[], calls: number, usage: ModelUsage): EvalReport {
  const count = (test: (result: ItemResult) => boolean): number => results.filter(test).length;
  const perLabel = Object.fromEntries(
    LABELS.map((label) => {
      const items = count((result) => result.label === label);
      const correct = count((result) => result.label === label && result.cleared === (label === 'supported'));
      return [label, { items, correct, recall: ratio(correct, items) }];
    }),
  ) as EvalReport['perLabel'];
  const clearedSupported = count((result) => result.cleared && result.label === 'supported');
  const clearedAll = count((result) => result.cleared);
  const supported = count((result) => result.label === 'supported');
  const flaggedBad = count((result) => !result.cleared && result.label !== 'supported');
  const flaggedAll = count((result) => !result.cleared);
  const bad = count((result) => result.label !== 'supported');
  return {
    items: results.length,
    calls,
    usage,
    perLabel,
    cleared: { precision: ratio(clearedSupported, clearedAll), recall: ratio(clearedSupported, supported) },
    flagged: { precision: ratio(flaggedBad, flaggedAll), recall: ratio(flaggedBad, bad) },
    accuracy: ratio(clearedSupported + flaggedBad, results.length),
    results: [...results],
  };
}

export interface EvalOptions {
  /** The model that the client is asked for: it is in the request, and a recorded or a real client may care. */
  model: string;
  batchSize?: number;
}

/**
 * Run `client` over the set and score it. The items go to the verifier in batches of `batchSize` (10 by default), in the order of the set, each batch in one
 * call made by `judgePlan`, the very function the Verify stage uses, so the prompt and the reading of the reply are the pipeline's. An item is cleared when the
 * reading of the reply finds no failure of its sentence and none of the labels of the passages it cites. A reply that judges what it was not asked is a
 * `schema` error, and it ends the evaluation.
 */
export async function evaluateVerifier(client: ModelClient, set: EvalSet, options: EvalOptions): Promise<EvalReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error(`the batch size must be a whole number of at least 1, not ${batchSize}`);
  const results: ItemResult[] = [];
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let calls = 0;
  for (let from = 0; from < set.items.length; from += batchSize) {
    const batch = set.items.slice(from, from + batchSize);
    const plan = planOf(batch);
    const judged = await judgePlan(client, options.model, plan);
    calls += 1;
    usage.inputTokens += judged.usage.inputTokens;
    usage.outputTokens += judged.usage.outputTokens;
    batch.forEach((item, at) => {
      const sentence = plan.sentences[at] as SentenceItem;
      const failed = judged.outcome.failures.some((failure) => failure.id === sentence.id || (failure.kind === 'label' && sentence.claimIds.includes(failure.id)));
      results.push({ id: item.id, label: item.label, cleared: !failed });
    });
  }
  return scoreOf(results, calls, usage);
}

/** The lowest scores that are accepted. A floor of 0, or none, accepts everything: no floor is frozen in Plan 2. */
export interface Floors {
  precision?: number;
  recall?: number;
}

const show = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(2));

/**
 * What is below a floor, as sentences; none when nothing is. The recall floor applies to the recall of each label, so that a verifier cannot make up for
 * missing distortions by clearing every supported sentence, and the precision floor to the precision of what it cleared and of what it flagged. A score that does not exist
 * (a verifier that cleared nothing has no precision for what it cleared) is below any floor above 0.
 */
export function floorFailures(report: EvalReport, floors: Floors): string[] {
  const failures: string[] = [];
  const check = (what: string, value: number | null, floor: number | undefined): void => {
    if (floor === undefined || floor <= 0) return;
    if (value === null || value < floor) failures.push(`${what} is ${show(value)}, below the floor of ${floor.toFixed(2)}`);
  };
  for (const label of LABELS) check(`the recall for ${label} sentences`, report.perLabel[label].recall, floors.recall);
  check('the precision of the sentences it cleared', report.cleared.precision, floors.precision);
  check('the precision of the sentences it flagged', report.flagged.precision, floors.precision);
  return failures;
}

/** The report as lines to print. */
export function formatReport(report: EvalReport, model: string): string[] {
  const row = (label: string, items: number, correct: number, recall: number | null): string => `${label.padEnd(12)} ${String(items).padStart(5)} ${String(correct).padStart(7)} ${show(recall).padStart(7)}`;
  return [
    `verifier evaluation: ${report.items} sentences in ${report.calls} calls, model ${model}`,
    `${'label'.padEnd(12)} ${'items'.padStart(5)} ${'correct'.padStart(7)} ${'recall'.padStart(7)}`,
    ...LABELS.map((label) => row(label, report.perLabel[label].items, report.perLabel[label].correct, report.perLabel[label].recall)),
    `cleared (supported):          precision ${show(report.cleared.precision)}, recall ${show(report.cleared.recall)}`,
    `flagged (not supported):      precision ${show(report.flagged.precision)}, recall ${show(report.flagged.recall)}`,
    `accuracy ${show(report.accuracy)}`,
    `tokens: ${report.usage.inputTokens} in, ${report.usage.outputTokens} out`,
  ];
}

/** What `main` needs from outside. */
export interface EvalDeps {
  out(line: string): void;
  err(line: string): void;
  env: Environment;
  /** The client to measure, instead of the one that the arguments choose. A test hands in a scripted one. */
  client?: ModelClient;
  /** The labelled set to use, instead of the committed one. A test hands in a file that is wrong. */
  setFile?: string;
}

const USAGE = 'Usage: evals:verifier [--client fake|api] [--model <name>] [--batch <number>] [--min-precision <0 to 1>] [--min-recall <0 to 1>]';

/** A number from 0 to 1, or undefined for anything else. */
function fraction(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 1 ? number : undefined;
}

/**
 * Run the evals from the command line and return the exit code: 0 when every floor is met (and there is none by default), 1 when a score is below a floor or the
 * evaluation fails, 2 for a mistake in the arguments. `--client fake` (the default) is a scripted verifier that knows the answers: it proves the wiring and measures
 * no model. `--client api` asks the model that `--model` names (by default the verify model of the configuration), inside the budget of a run, and needs
 * `ANTHROPIC_API_KEY` in the environment.
 */
export async function main(argv: readonly string[], deps: EvalDeps): Promise<number> {
  const usage = (message: string): number => {
    deps.err(`evals:verifier: ${message}`);
    deps.err(USAGE);
    return 2;
  };
  const values = new Map<string, string>();
  for (let at = 0; at < argv.length; at += 2) {
    const name = argv[at] as string;
    if (!['--client', '--model', '--batch', '--min-precision', '--min-recall'].includes(name)) return usage(`unknown option ${name}`);
    if (values.has(name)) return usage(`${name} is given twice`);
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('--')) return usage(`${name} needs a value`);
    values.set(name, value);
  }
  const clientKind = values.get('--client') ?? 'fake';
  if (clientKind !== 'fake' && clientKind !== 'api') return usage(`--client is fake or api, not "${clientKind}"`);
  const batch = values.has('--batch') ? Number(values.get('--batch')) : undefined;
  if (batch !== undefined && (!Number.isInteger(batch) || batch < 1)) return usage(`--batch is a whole number of at least 1, not "${values.get('--batch')}"`);
  const floors: Floors = {};
  for (const [name, key] of [['--min-precision', 'precision'], ['--min-recall', 'recall']] as const) {
    const given = values.get(name);
    if (given === undefined) continue;
    const parsed = fraction(given);
    if (parsed === undefined) return usage(`${name} is a number from 0 to 1, not "${given}"`);
    floors[key] = parsed;
  }

  const config = defaultConfig();
  const model = values.get('--model') ?? config.models.verify;
  let set: EvalSet;
  try {
    set = loadVerifierSet(deps.setFile);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  let client: ModelClient;
  if (deps.client !== undefined) {
    client = deps.client;
  } else if (clientKind === 'fake') {
    client = perfectVerifier(set);
  } else {
    try {
      client = clientFromConfig(config, { kind: 'api' }, deps.env).client;
    } catch (error) {
      deps.err(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  try {
    const report = await evaluateVerifier(client, set, { model, ...(batch === undefined ? {} : { batchSize: batch }) });
    for (const line of formatReport(report, model)) deps.out(line);
    const failures = floorFailures(report, floors);
    for (const failure of failures) deps.out(`below the floor: ${failure}`);
    return failures.length === 0 ? 0 : 1;
  } catch (error) {
    deps.err(`the evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// Run as a program, `tsx desk/evals/run-verifier.ts`: but not when this file is imported, as the tests do.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), { out: (line) => console.log(line), err: (line) => console.error(line), env: process.env });
}
```

**In `desk/tsconfig.json`, replace:**
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test"]
}
```

**with:**
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test", "evals"]
}
```

Run: `npm test --workspace @robywire/desk -- test/evals`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace @robywire/desk`
Expected: PASS — `tsc -p tsconfig.json`

- [ ] **Step 7: Add the script and document it**

The README must name every root script (`site/test/verify.test.ts` checks it), so the new script fails that test until the README says what it does.

**In `package.json`, replace:**
```json
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "desk": "tsx desk/src/bin.ts",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
```

**with:**
```json
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "desk": "tsx desk/src/bin.ts",
    "evals:verifier": "tsx desk/evals/run-verifier.ts",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `to contain 'npm run evals:verifier'`

**In `README.md`, replace:**
```markdown
The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

## Requirements

```

**with:**
```markdown
The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

## The verifier evals

`npm run evals:verifier` measures a verifier. `desk/evals/verifier-set.json` holds sixty sentences, each with the passages that it is judged against: for each of twenty sets of passages, one sentence that they support, one that says something they do not say, and one that changes what they say in a small way. `desk/evals/run-verifier.ts` runs a model client over the set through the verifier's own prompt and the reading of its reply that the Verify stage uses, and prints precision and recall by label and overall. With no arguments it runs a scripted verifier that knows the answers, which proves the wiring and measures no model. `--client api --model <name>` asks a real model (it needs `ANTHROPIC_API_KEY`), `--batch <n>` sets how many sentences go in one call, and `--min-precision` and `--min-recall` (numbers from 0 to 1) make the command exit with 1 when a score is below them. No floor is set: what a verifier must score is decided when real models have been measured.

## Requirements

```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 8: Run the harness**

With no arguments it runs the perfect scripted verifier, to show that the set, the prompt, the reading of the reply and the report are joined up. Nothing here uses a network or a key.

Run: `npm run --silent evals:verifier`
Expected: PASS — `verifier evaluation: 60 sentences in 6 calls` and `accuracy 1.00`

Run: `npm run --silent evals:verifier -- --min-recall 2`
Expected: FAIL — `--min-recall is a number from 0 to 1, not "2"`

- [ ] **Step 9: Keep the call of the verifier out of the entry point**

`judgePlan` is stage-level, like the stage it serves. This test passes at once; it is there so that it keeps passing.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const assembly = ['slugFromTitle', 'ComposeReply', 'ReplySentence', 'assembleDraft', 'finishDraft'];
    const composition = ['runCompose', 'gateContextOf', 'composeSystem', 'buildComposeUser', 'provenance', 'PLACE'];
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
```

**with:**
```ts
    const assembly = ['slugFromTitle', 'ComposeReply', 'ReplySentence', 'assembleDraft', 'finishDraft'];
    const composition = ['runCompose', 'gateContextOf', 'composeSystem', 'buildComposeUser', 'provenance', 'PLACE'];
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'judgePlan', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
```

Run: `npm test --workspace @robywire/desk -- test/fetch/exports.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 10: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add README.md package.json desk/evals desk/src/stages/verify-model.ts desk/test/evals desk/test/fetch/exports.test.ts desk/test/stages/verify-model.test.ts desk/tsconfig.json
git commit -m "feat(desk): the verifier evals: sixty labelled sentences with the passages they cite, a harness that runs any model client over them through the real prompt and the real reading of the reply and scores precision and recall, and scripted verifiers that prove it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 39: The demo, and the demo in `verify`

**Files:**
- Create: `desk/src/demo/run.ts` (`DemoDeps`, `runDemo`, and the program of `npm run desk:demo`)
- Modify: `package.json` (the script `desk:demo`, and a step of `verify`)
- Modify: `.github/workflows/ci.yml` (the same step)
- Modify: `site/test/verify.test.ts` (the order of the steps)
- Modify: `README.md` (what the Desk is, what it does offline and what is not built)
- Test: `desk/test/demo/run.test.ts`

Every part of the Desk has its own tests, and the adversarial matrix runs the pipeline as a whole against bad scripts. What nothing yet does is run **the whole pipeline as the owner will, as one command**, every time the repository is checked. `npm run desk:demo` does. It runs `desk run --dry --client fake --sources fixtures` (Task 36): Discover to the end, in the made-up world, with the scripted model of Task 33, and then `desk replay` on the run it made. It exits 0 **only if** all of these hold:
- the run ended `published`, and said that it was a dry run;
- **nothing was written**: the content folders and the desk state of the site, read before and after, are byte for byte the same (by hash), and the fake git that the command was given was never asked to commit;
- the command printed nothing on its error output;
- the replay ended with every artifact equal.
Anything else exits 1 with what was wrong, and the whole output of the run is printed either way. The run's own folders (`runs/` and `evidence/`) are made in a temporary folder of their own and removed at the end, so the demo can be run again and again, and leaves nothing in the repository.

**It is a step of `npm run verify` and of CI.** It sits after the checks that are quick and before the build: `typecheck`, `test`, `evals:seeded`, `fixtures:check`, **`desk:demo`**, `build`, `audit:prod`, `build:fixtures`, `audit`, `lighthouse`. `site/test/verify.test.ts` keeps `verify` and the CI workflow in the same order, and keeps the README honest about every root script, so a step added to one and not the others fails there first.

**The README** stops saying that the Desk is not built. It now says what the Desk is, what it does with no network and no key, what a run leaves behind, and, in one paragraph, what is **not** built (the daily workflow, the deploy, the hold pull request, the correction and retraction command, the private evidence bucket, the live flags and the copy that goes with them, prompts tried on a real model, a measured verifier, a subscription client).

**The tests** run the demo in a made-up checkout of the site, and replace the command line that it runs with ones that go wrong in each way the demo must notice: a run that does not end published, a command that exits with a code that is not 0, a run that makes git commit, one that changes a new piece or the desk state, a replay that is not equal or is silent, a complaint on the error output, and a command that throws, which must still remove the demo's folder.

- [ ] **Step 1: Write the failing test**

**Create `desk/test/demo/run.test.ts`:**
```ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CliDeps } from '../../src/cli';
import { main } from '../../src/cli';
import { runDemo, snapshot } from '../../src/demo/run';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { clock } from '../support/run';
import { useScratch } from '../support/context';

// The demo is the whole pipeline run as one command, in a dry run, and replayed. These tests run it in a made-up checkout of the site, and replace the command that
// it runs with ones that go wrong in each way it must notice, to show that it exits 1 for each.

const scratch = useScratch();

function setup() {
  const cwd = makeSite(scratch());
  const out: string[] = [];
  const err: string[] = [];
  const workDir = scratch();
  return { cwd, out, err, workDir, deps: { out: (line: string) => void out.push(line), err: (line: string) => void err.push(line), cwd, now: clock(), workDir } };
}

const STATE = 'site/src/data/desk-state.json';

describe('runDemo', () => {
  it('runs the made-up story in a dry run, replays it, and exits 0 with a line that says what it showed', async () => {
    const { deps, out, err } = setup();
    expect(await runDemo(deps)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toContain('outcome: published');
    expect(out.some((line) => line.startsWith('dry run: nothing was written to the site or to git'))).toBe(true);
    expect(out).toContain('replay: equal');
    expect(out.at(-1)).toBe('desk demo: ok: the made-up story was published in a dry run, nothing was written, and the run replays equal');
  });

  it('writes nothing into the site and removes its own folder when it is done', async () => {
    const { deps, cwd, workDir } = setup();
    const before = filesBelow(cwd);
    await runDemo(deps);
    expect(filesBelow(cwd)).toEqual(before);
    expect(readdirSync(workDir)).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('can be run again at once, since it keeps nothing: the day of the made-up world is not taken', async () => {
    const { deps } = setup();
    expect(await runDemo(deps)).toBe(0);
    expect(await runDemo({ ...deps, now: clock() })).toBe(0);
  });

  it('makes its own folder in the folder it is told to, and not elsewhere', async () => {
    const { deps, workDir } = setup();
    const seen: string[][] = [];
    await runDemo(deps, async (argv, cliDeps) => {
      seen.push(readdirSync(workDir));
      return main(argv, cliDeps);
    });
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]?.[0]).toMatch(/^desk-demo-/);
  });

  it('does not mind the order of the lines of the run: the line that says it was a dry run may come first', async () => {
    const { deps, out, err } = setup();
    const dryFirst = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        cliDeps.out('outcome: published');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, dryFirst)).toBe(0);
    expect(err).toEqual([]);
    expect(out.at(-1)).toContain('desk demo: ok');
  });

  it('exits 1 and says so when the run does not end published', async () => {
    const { deps, err } = setup();
    const held = async (_argv: readonly string[], cliDeps: CliDeps) => {
      cliDeps.out('outcome: held');
      return 0;
    };
    expect(await runDemo(deps, held)).toBe(1);
    expect(err).toContain('desk demo: the run did not end published');
    expect(err).toContain('desk demo: the run was not a dry run');
  });

  it('exits 1 when the command exits with a code that is not 0, and does not replay', async () => {
    const { deps, err, out } = setup();
    const calls: string[] = [];
    const failing = async (argv: readonly string[]) => {
      calls.push(argv[0] as string);
      return 1;
    };
    expect(await runDemo(deps, failing)).toBe(1);
    expect(calls).toEqual(['run']);
    expect(err).toContain('desk demo: the run exited with 1');
    expect(out).toEqual([]);
  });

  it('exits 1 when git is asked to commit, and when the run does not say that it was dry', async () => {
    const { deps, err } = setup();
    const committing = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('commit: abc');
        await cliDeps.git.commit([STATE], 'x');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, committing)).toBe(1);
    expect(err).toEqual(['desk demo: the run was not a dry run', 'desk demo: git was asked to commit 1 time(s)']);
  });

  it('exits 1 when anything in the site is changed, a new piece or the desk state', async () => {
    for (const change of [(cwd: string) => writeFileSync(path.join(cwd, 'site/src/content/news/a-piece.mdx'), 'x'), (cwd: string) => writeFileSync(path.join(cwd, STATE), `${COMMITTED_STATE} `)]) {
      const { deps, err, cwd } = setup();
      const writing = async (_argv: readonly string[], cliDeps: CliDeps) => {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        change(cwd);
        return 0;
      };
      expect(await runDemo(deps, writing)).toBe(1);
      expect(err).toContain('desk demo: the site was changed: the content or the desk state is not as it was');
    }
  });

  it('exits 1 when the replay does not find every artifact equal, or exits with a code that is not 0', async () => {
    const { deps, err } = setup();
    const differing = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        return 0;
      }
      cliDeps.out('replay: not equal');
      return 1;
    };
    expect(await runDemo(deps, differing)).toBe(1);
    expect(err).toContain('desk demo: the replay of the run did not find every artifact equal');
    const silent = setup();
    const quiet = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
      }
      return 0;
    };
    expect(await runDemo(silent.deps, quiet)).toBe(1);
    expect(silent.err).toContain('desk demo: the replay of the run did not find every artifact equal');
  });

  it('exits 1 when the command printed anything on the error output, because that is where its complaints go', async () => {
    const { deps, err } = setup();
    const complaining = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        cliDeps.err('a warning');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, complaining)).toBe(1);
    expect(err).toEqual(['desk demo: error output: a warning']);
  });

  it('removes its folder when the command throws, and lets the error out', async () => {
    const { deps, workDir } = setup();
    await expect(
      runDemo(deps, async () => {
        throw new Error('the command broke');
      }),
    ).rejects.toThrow('the command broke');
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('runs the same command as the one the owner types: the real command line, with the made-up world and the scripted story, dry', async () => {
    const seen: (readonly string[])[] = [];
    const { deps } = setup();
    await runDemo(deps, async (argv, cliDeps) => {
      seen.push(argv);
      return main(argv, cliDeps);
    });
    expect(seen[0]).toEqual(['run', '--dry', '--client', 'fake', '--sources', 'fixtures']);
    expect(seen[1]?.[0]).toBe('replay');
    expect(seen[1]?.slice(2)).toEqual(['--sources', 'fixtures']);
  });
});

describe('snapshot', () => {
  it('lists every file below a folder, with a hash of what is in it, in order, whatever order the files were made in', async () => {
    const dir = scratch();
    mkdirSync(path.join(dir, 'b'));
    writeFileSync(path.join(dir, 'b', 'two.txt'), 'two');
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
    expect(await snapshot(dir)).toEqual([`a.txt ${hash('one')}`, `${path.join('b', 'two.txt')} ${hash('two')}`]);
  });

  it('changes when a file is changed, added or removed, and not otherwise', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    const before = await snapshot(dir);
    expect(await snapshot(dir)).toEqual(before);
    writeFileSync(path.join(dir, 'a.txt'), 'two');
    expect(await snapshot(dir)).not.toEqual(before);
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    writeFileSync(path.join(dir, 'b.txt'), 'x');
    expect((await snapshot(dir)).length).toBe(2);
  });

  it('has nothing for a folder that is not there, and fails for any other trouble with a folder', async () => {
    expect(await snapshot(path.join(scratch(), 'nowhere'))).toEqual([]);
    const file = path.join(scratch(), 'file.txt');
    writeFileSync(file, 'x');
    await expect(snapshot(file)).rejects.toThrow();
  });
});

describe('the program', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('runs when it is started as a program, with the real repository as its folder, and exits with 0 after printing that it is ok', () => {
    const run = spawnSync('npx', ['tsx', 'desk/src/demo/run.ts'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('outcome: published');
    expect(run.stdout).toContain('desk demo: ok');
    expect(run.stderr).toBe('');
  }, 60_000);

  it('does nothing when it is only imported', () => {
    const run = spawnSync('npx', ['tsx', '--eval', "import('./desk/src/demo/run.ts').then((module) => console.log(typeof module.runDemo))"], { cwd: root, encoding: 'utf8' });
    expect(run.stdout.trim()).toBe('function');
  }, 60_000);
});
```

Run: `npm test --workspace @robywire/desk -- test/demo/run.test.ts`
Expected: FAIL — `Cannot find module '../../src/demo/run'`

- [ ] **Step 2: Write the demo**

**Create `desk/src/demo/run.ts`:**
```ts
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FakeGit, defaultConfig } from '../index';
import { main } from '../cli';
import type { CliDeps } from '../cli';
import { DEMO_DATE } from './world';

// The demo: `npm run desk:demo`. It runs the command `desk run --dry --client fake --sources fixtures`, the whole pipeline from Discover to the end, in the
// made-up world with a scripted model, and then replays the run from what it kept. It succeeds, with exit code 0, only if the run ended published, in a dry run,
// with nothing written: the site is exactly as it was and git was not asked to commit, and only if the replay finds every artifact equal. It is part of
// `npm run verify`, so that a change that breaks the pipeline as a whole, and not any one test of it, stops the check.

export interface DemoDeps {
  out(line: string): void;
  err(line: string): void;
  /** The root of the repository, which the demo reads (the desk state) and never changes. */
  cwd: string;
  now: () => Date;
  /** The folder in which the demo makes its own folder for the run and the evidence. By default the temporary directory of the machine. */
  workDir?: string;
}

/** Every file below `dir` with a hash of what is in it, as lines in order; a folder that is not there has none. */
export async function snapshot(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const lines: string[] = [];
  for (const entry of entries.filter((item) => item.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    lines.push(`${path.relative(dir, file)} ${createHash('sha256').update(await readFile(file)).digest('hex')}`);
  }
  return lines.sort();
}

/**
 * Run the demo and return the exit code: 0 when the run ended published in a dry run, wrote nothing into the site, asked git for nothing and replays equal;
 * 1 otherwise, with what went wrong on the error output. Everything the run printed is printed. The run's own folders are made in `workDir` and removed at the end.
 * `cli` is the command line that is run, which a test replaces to show that the demo notices each way it can go wrong.
 */
export async function runDemo(deps: DemoDeps, cli: (argv: readonly string[], deps: CliDeps) => Promise<number> = main): Promise<number> {
  const watched = [path.join(deps.cwd, 'site/src/content'), path.join(deps.cwd, 'site/src/data')];
  const before = await Promise.all(watched.map(snapshot));
  const work = await mkdtemp(path.join(deps.workDir ?? tmpdir(), 'desk-demo-'));
  try {
    const out: string[] = [];
    const err: string[] = [];
    const git = new FakeGit();
    const cliDeps: CliDeps = {
      out: (line) => void out.push(line),
      err: (line) => void err.push(line),
      env: {},
      cwd: deps.cwd,
      now: deps.now,
      git,
      config: { ...defaultConfig(), runDir: path.join(work, 'runs'), evidenceDir: path.join(work, 'evidence') },
    };
    const code = await cli(['run', '--dry', '--client', 'fake', '--sources', 'fixtures'], cliDeps);
    const run = out.length;
    const replayCode = code === 0 ? await cli(['replay', path.join(work, 'runs', DEMO_DATE), '--sources', 'fixtures'], cliDeps) : 1;
    for (const line of out) deps.out(line);

    const problems: string[] = [];
    if (code !== 0) problems.push(`the run exited with ${code}`);
    if (!out.slice(0, run).includes('outcome: published')) problems.push('the run did not end published');
    if (!out.slice(0, run).some((line) => line.startsWith('dry run: nothing was written'))) problems.push('the run was not a dry run');
    if (git.commits.length > 0) problems.push(`git was asked to commit ${git.commits.length} time(s)`);
    const after = await Promise.all(watched.map(snapshot));
    if (JSON.stringify(after) !== JSON.stringify(before)) problems.push('the site was changed: the content or the desk state is not as it was');
    if (code === 0 && (replayCode !== 0 || !out.slice(run).includes('replay: equal'))) problems.push('the replay of the run did not find every artifact equal');
    for (const line of err) problems.push(`error output: ${line}`);

    if (problems.length > 0) {
      for (const problem of problems) deps.err(`desk demo: ${problem}`);
      return 1;
    }
    deps.out('desk demo: ok: the made-up story was published in a dry run, nothing was written, and the run replays equal');
    return 0;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Run as a program, `tsx desk/src/demo/run.ts`: but not when this file is imported, as the tests do.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDemo({ out: (line) => console.log(line), err: (line) => console.error(line), cwd: process.cwd(), now: () => new Date() });
}
```

Run: `npm test --workspace @robywire/desk -- test/demo/run.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Put the demo in the order of the steps of `verify`**

`site/test/verify.test.ts` says what the steps are and in which order. It changes first, and fails.

**In `site/test/verify.test.ts`, replace:**
```ts
}

const EXPECTED_ORDER = ['typecheck', 'test', 'evals:seeded', 'fixtures:check', 'build', 'audit:prod', 'build:fixtures', 'audit', 'lighthouse'];

describe('the verify script', () => {
  it('runs typecheck, tests, seeded evals, fixture drift, the production build and its audit, the fixture build and its audit, then Lighthouse', () => {
    expect(scriptsOf(pkg.scripts.verify!)).toEqual(EXPECTED_ORDER);
  });
```

**with:**
```ts
}

const EXPECTED_ORDER = ['typecheck', 'test', 'evals:seeded', 'fixtures:check', 'desk:demo', 'build', 'audit:prod', 'build:fixtures', 'audit', 'lighthouse'];

describe('the verify script', () => {
  it('runs typecheck, tests, seeded evals, fixture drift, the Desk demo, the production build and its audit, the fixture build and its audit, then Lighthouse', () => {
    expect(scriptsOf(pkg.scripts.verify!)).toEqual(EXPECTED_ORDER);
  });
```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `to deeply equal`

- [ ] **Step 4: Add the script, and the step of `verify` and of CI**

**In `package.json`, replace:**
```json
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "desk": "tsx desk/src/bin.ts",
    "evals:verifier": "tsx desk/evals/run-verifier.ts",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
  "devDependencies": {
```

**with:**
```json
    "lighthouse": "node site/scripts/lighthouse.mjs",
    "desk": "tsx desk/src/bin.ts",
    "desk:demo": "tsx desk/src/demo/run.ts",
    "evals:verifier": "tsx desk/evals/run-verifier.ts",
    "verify": "npm run typecheck && npm run test && npm run evals:seeded && npm run fixtures:check && npm run desk:demo && npm run build && npm run audit:prod && npm run build:fixtures && npm run audit && npm run lighthouse"
  },
  "devDependencies": {
```

**In `.github/workflows/ci.yml`, replace:**
```yaml
        run: npm run fixtures:check

      - name: Production build
        run: npm run build
```

**with:**
```yaml
        run: npm run fixtures:check

      - name: Desk demo
        run: npm run desk:demo

      - name: Production build
        run: npm run build
```

The README must name every root script, so the test still fails until it names this one.

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: FAIL — `to contain 'npm run desk:demo'`

- [ ] **Step 5: Write the README**

**In `README.md`, replace:**
```markdown
# Robywire

Robywire is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer and the site; the Desk itself is not built yet (see Which parts are live).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**with:**
```markdown
# Robywire

Robywire is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer, the site and the Desk itself. The Desk is built and tested offline, with scripted models; it has not yet run against live sources or a live model, and nothing it writes has been published (see Which parts are live and The desk workspace).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**In `README.md`, replace:**
```markdown
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `desk/` | `@robywire/desk`: the Desk pipeline, built and tested offline. So far it holds the configuration only. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
```

**with:**
```markdown
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `desk/` | `@robywire/desk`: the Desk pipeline, built and tested offline: the model layer, the seven stages, the orchestrator, replay, the command line and the verifier evals. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
```

**In `README.md`, replace:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that Plan 1 does not build: the evidence store, the independent model check, the daily schedule and the pipeline that writes and publishes. Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace

`desk/` (`@robywire/desk`) is where the pipeline is being built, and so far it is a start: it holds the configuration and nothing that reads a source, calls a model or publishes. `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` reads an optional YAML file over the defaults and refuses a setting it does not know or a value that is not allowed. Git ignores `runs/` and `evidence/`: run artifacts and private snapshots of sources never go into the repository. The rest of this section is written when the pipeline is.

## The desk command
```

**with:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk; the bucket is not built), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (not built) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace

`desk/` (`@robywire/desk`) is the pipeline that will write the site. It is built and tested with no network and no API key: every test runs on made-up pages and a scripted model, and a test fails if anything reaches for a network.

- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json`, and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock, a day is run once unless `--force-new` says otherwise, and every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, the pull request that carries a hold to the owner, the command that records a correction or a retraction, the private evidence bucket, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown
The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

## The verifier evals

```

**with:**
```markdown
The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`.

## The verifier evals

```

**In `README.md`, replace:**
```markdown
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins. |
| `npm run typecheck` | `tsc` in `gate` and `evals`, and `astro check` in `site`. |
| `npm test` | Vitest in every workspace. |
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
```

**with:**
```markdown
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins. |
| `npm run typecheck` | `tsc` in `gate`, `evals` and `desk`, and `astro check` in `site`. |
| `npm test` | Vitest in every workspace. |
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run desk -- <command>` | The command line of the Desk: `run`, `replay` and `status` (see The desk command). |
| `npm run desk:demo` | Run the made-up story through the whole pipeline in a dry run, replay it, and fail unless it was published, nothing was written and the replay is equal. |
| `npm run evals:verifier` | Run the labelled set of sixty sentences through a verifier and print precision and recall (see The verifier evals). |
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
```

**In `README.md`, replace:**
```markdown
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
| `npm run verify` | All of the above in CI order: typecheck, tests, seeded evals, fixture drift, production build, production audit, fixture build, fixture audit, Lighthouse. |

`npm run build` and `npm run build:fixtures` both write `site/dist`, so the second replaces the first. `npm run verify` runs them in the order that each audit needs.
```

**with:**
```markdown
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
| `npm run verify` | The checks in CI order: typecheck, tests, seeded evals, fixture drift, the Desk demo, production build, production audit, fixture build, fixture audit, Lighthouse. |

`npm run build` and `npm run build:fixtures` both write `site/dist`, so the second replaces the first. `npm run verify` runs them in the order that each audit needs.
```

Run: `npm test --workspace @robywire/site -- test/verify.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 6: Run the demo**

The whole pipeline, as one command. It prints what the stages logged, then the outcome of the run, then the replay.

Run: `npm run --silent desk:demo`
Expected: PASS — `outcome: published` and `dry run: nothing was written to the site or to git` and `replay: equal` and `desk demo: ok`

- [ ] **Step 7: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml README.md package.json site/test/verify.test.ts desk/src/demo/run.ts desk/test/demo/run.test.ts
git commit -m "feat: the Desk demo: the made-up story run through the whole pipeline in a dry run and replayed, as a step of npm run verify and of CI, and a README that says what the Desk is, what it does offline and what is not built" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 40: Verify Plan 2 from a clean install, and hand over to Plan 2b

This task changes nothing and makes no commit. It is the proof that the five parts of Plan 2 hold together: everything installed from the lock file alone, and every check passing, in the order CI runs them, with the new step that runs the whole pipeline as one command. It then restates what each part was to prove and with which command, and writes the checklist with which Plan 2b starts.

- [ ] **Step 1: Start from nothing**

Delete every installed package, as a fresh clone would have none.

Run: `rm -rf node_modules gate/node_modules evals/node_modules site/node_modules desk/node_modules`
Expected: PASS

Run: `npm ci --no-audit --no-fund`
Expected: PASS — `added`, followed by the number of packages.

`npm ci` fails if `package-lock.json` and the `package.json` files disagree, so this also proves the lock file is complete. Plan 2 installed one package, `@anthropic-ai/sdk` (part 2, Task 10), at an exact version.

- [ ] **Step 2: Run every check**

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok`, `Passed: 17 checks.`, `Passed: 16 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. In order, you will see: `Result` from `astro check` with `0 errors`; the test summaries of `gate`, `evals`, `site` and `desk`, none of them failed; the table of the seeded defects, ending with `PASS: every seeded defect was caught.`; `Fixtures are up to date.`; **the demo of the Desk** (Task 39): the lines that the stages log, `outcome: published`, `dry run: nothing was written to the site or to git`, the three artifacts of the replay, `replay: equal` and `desk demo: ok`; the production build, which prints an Astro warning for each collection that is empty (that is right: a production build has no pieces yet); the audit of the production build; the fixture build and its audit; and last the Lighthouse table.

The lines of the output that matter, in the order they appear, as they were when this plan was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the finished Plan 2 and change when a test is added; the rest of the output is build and test noise:

```text
Result (99 files):
- 0 errors

Test Files  35 passed (35)
Tests  2137 passed (2137)
Test Files  6 passed (6)
Tests  244 passed (244)
Test Files  36 passed (36)
Tests  1224 passed (1224)
Test Files  54 passed (54)
Tests  1992 passed (1992)

58 of 58 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

extract: 7 claims proposed, 7 kept, 0 dropped
compose: the gate says publish (0 failures, 0 hold reasons)
verify: round 0: the gate says publish, the model check passed
outcome: published
dry run: nothing was written to the site or to git (3 files would have been)
04-extract: equal
05-compose: equal
06-verify: equal
replay: equal
desk demo: ok: the made-up story was published in a dry run, nothing was written, and the run replays equal

Passed: 17 checks.   (audit:prod)
Passed: 16 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

What Plan 2 added to the totals of Plan 1, which ended with 35 test files and 2065 tests in `gate`, 5 and 213 in `evals`, 36 and 1212 in `site`, 54 seeded defects and 44 failure codes: the `desk` workspace, which did not exist, has 54 test files and 1992 tests; `gate` has 35 test files and 2137 tests (the basis `reported`, the size of a group of limitations, and the reasons of the model check); `evals` has 6 files and 244 tests; `site` has 36 files and 1224 tests (the labels of the new reasons, and the Desk demo in the order of `verify`); the seeded defects are 58 and the failure codes of the gate 47. The audit has 16 checks (17 for the production build, which adds the check that it has no trace of the fixtures), and the Lighthouse table has five pages, as before.

- [ ] **Step 3: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing.

The checks wrote no file that is not already committed: `evals/scoreboard/seeded.json` is rewritten with the same content, `site/dist` and `.astro` are ignored by git, and the demo of the Desk makes its run folder in the temporary directory and removes it, so there is no `runs/` and no `evidence/` in the repository.

- [ ] **Step 4: Match the parts to their proof**

Plan 2 is milestone 3 of the design: the pipeline, built and verified offline. Section 14 of the design spec gives it one line, "a full dry run on real sources; baseline verifier numbers recorded", but the pipeline design (sections 1 and 8) says that Plan 2 is built and verified with no key and no network and that it verifies the harness and not a model's score, so the dry run on real sources and the baseline numbers of a real verifier move to Plan 2b. What Plan 2 proves is that everything is built and verified offline. Each part has a command that shows what it proved.

| Part | Tasks | What it proved | The command that shows it |
|---|---|---|---|
| 1. Patches to the gate, and the `desk` workspace | 1 to 3 | A claim that only another outlet reports has an honest basis (`reported`, never safe, one outlet to a limitation sentence); a limitation sentence covers at most four claims and a claim with no number is named by its label; the `desk` workspace and its configuration exist and refuse a setting they do not know | `npm run evals:seeded` prints `PASS: every seeded defect was caught.` for every code of G1 to G9, and `npm test --workspace @robywire/desk -- test/config.test.ts` |
| 2. The model layer | 4 to 11 | One interface that cannot express a tool; a scripted fake, recorded replies and a recording client; a budget and bounded retries; text from the web inside blocks it cannot close early under a system prompt that says it is data; the Anthropic client against a stand-in for the network | `npm test --workspace @robywire/desk -- test/model test/prompts/untrusted.test.ts` (it includes `no-tools.test.ts`, which fails if any client sends a tool) |
| 3. Fetching, discovery and selection | 12 to 22 | Polite fetching (robots.txt never worked around, a rate limit, a byte cap, bounded retries), text extraction, feed parsing, an evidence store that refuses a snapshot that has changed, and the first three stages: Discover, Select and Fetch | `npm test --workspace @robywire/desk -- test/fetch test/stages/discover.test.ts test/stages/select.test.ts test/stages/fetch.test.ts test/run/evidence.test.ts` |
| 4. Extract, compose and verify | 23 to 28 | Code finds every quotation and checks every claim's text, label and values against it; the composer is told the gate's rules in the gate's own numbers and its reply is gated; the verifier judges every fact sentence, every heading and every label; only the sentences that fail go back, at most twice | `npm test --workspace @robywire/desk -- test/stages/claim-grounding.test.ts test/stages/extract.test.ts test/stages/compose.test.ts test/stages/verify-model.test.ts test/stages/verify.test.ts` |
| 5. Publish or hold, the run, the CLI, the evals | 29 to 40 | A cleared piece is written as the renderer gives it and committed; a hold keeps the draft and writes nothing on the pages; a run is locked, once for each day, ends in one of four outcomes with one commit and a record, and can be replayed; the command line; fifteen bad scenarios through the whole pipeline and none published; the verifier is measured by a labelled set; and the whole pipeline runs as one command in `verify` | `npm run desk:demo` prints `desk demo: ok`; `npm test --workspace @robywire/desk -- test/adversarial.test.ts` (the table of scenarios, all held); `npm run evals:verifier` prints `accuracy 1.00` for the scripted verifier that knows the answers |

What Plan 2 does not prove, and says so: it does not prove that a real model writes a piece that passes, that the prompts work on a real model, that the verifier is any good (the harness is tested with scripted verifiers whose scores are exact, and no real model has been measured), or that the pipeline copes with the pages of real sites. Every test of a model uses a scripted one. Those are the first things Plan 2b does.

- [ ] **Step 5: Write the entry checklist for Plan 2b**

Plan 2 is finished. These are the things Plan 2b must do or decide before, or as, it connects the Desk to the world. None of them is a reason to doubt the work of Plan 2, and each is something that the code, the tests or the pages say they are not yet doing. Plan 2b starts from this list.

1. **The repository goes to GitHub, public, and the first run of CI is green** (item 1 of Plan 1's checklist, still open). `site/test/verify.test.ts` proves that `.github/workflows/ci.yml` runs the steps of `npm run verify` in the same order, now including `npm run desk:demo`, and this task proves that they pass on a clean local install; but CI has never run, Lighthouse on `ubuntu-latest` has never been measured, and the demo has never run anywhere but here. Do not connect the Desk to a schedule before the first run is green.
2. **An API key with a spend cap, and the loop that tunes the prompts on a real model.** Nothing in `desk/src/prompts` has been tried on a real model; every test uses a scripted one. Record real replies with the recording client (`clientFromConfig` with its `record` argument keeps a cassette in the folder of the run, and `desk replay` runs the stages again from them), look at what the extractor, the composer and the verifier get wrong, change the prompts and replay. The questions that only a real model answers: how many claims survive the checks of the extract stage on a real page (the rule that a claim's text and label may not name anything its quotation lacks is strict on purpose); whether a composer meets the length of the gate (the revision loop sends back a sentence or a heading, and holds a piece whose body is too short or too long, or whose takeaways or sections are the wrong number, without using its rounds, so it may need a round that writes the piece again); and whether the budget of 24 calls and 400,000 input tokens per run is right. Then **run `npm run evals:verifier -- --client api --model <name>`** against the model that will be the verifier, read the recall for the unsupported and the distorted sentences and the precision of what it clears, decide the floors (`--min-recall`, `--min-precision`), write them down and freeze them in milestone 5. If a verifier on the model of the composer is not enough, change `config.models.verify` (the design allows a stronger model) and say so on the method page.
3. **The Claude Max client, if the owner wants it.** The design leaves it out of Plan 2: the output of the `claude -p` command with `--tools ""`, `--json-schema` and `--output-format json` has not been observed on this machine. After the owner runs one such command in a terminal and shares what it prints, a fifth `ModelClient` is a small task. Until then the API key is the only way.
4. **The daily workflow.** A GitHub Actions cron (04:30 UTC) that runs `npm run desk -- run`, with a concurrency group, the key as a secret, the committer set, and the push of the commit that every run makes (a piece, or the desk state alone: a run that holds, finds no story or fails commits only `site/src/data/desk-state.json`, so that `/status` and `/holds` show it). Decide whether a hold also needs its own branch (item 6), and whether a failed run notifies someone.
5. **The Cloudflare deploy.** Pages on every push to `main`, the domain, and a build that fails stops the publish (the design says a failed build opens a pull request instead).
6. **The hold pull-request flow, and `release: 'owner'`.** A held draft goes to the owner as a draft pull request that carries the gate report; the held file `runs/<date>/held/<slug>.json` already has the draft, the cited claims, both reports and the reasons, which is what the flow needs to render the piece with `renderDraft` and `release: 'owner'` when the owner decides to publish it. The desk state's `holds` have an optional `prUrl` for it.
7. **The retract command and corrections.** `desk retract <slug> --reason` keeps the page up with a notice, records the correction in the desk state, and sets `updatedAt` through `renderDraft`; the site refuses to build a piece whose `updatedAt` disagrees with the corrections. `updateDeskState` never loses a correction, and Plan 2 writes no code that adds one.
8. **The private evidence store (R2).** `LocalEvidenceStore` keeps snapshots in a folder; the design keeps them in a private bucket, indefinitely for a published piece and 90 days for a held draft, and a run fails closed when the store cannot be reached. A second `EvidenceStore` implementation, and `evidence/` out of the working copy.
9. **Turn on the flags of `site/src/lib/live.ts`, and rewrite the present-tense copy that goes with them.** All four are `false`, and the site says what is not running in the future tense. Each flag turns on when its part really runs (the evidence store, the verifier, the schedule, and publishing), `site/test/copy.test.ts` names every sentence that changes, and a few present-tense sentences are still outside `copy.ts` (the list is in item 6 of Plan 1's checklist). Also edit the design documents: the stage list in section 6 of the pipeline design (items 4 to 7) does not yet say that pages of an unknown kind of source are not read, that G10 runs only on a draft that the gate has cleared, that a basis of `measured` is never allowed from a source, that a failure no sentence can mend is held without using the rounds, that `05-compose.json` is written by Verify, that every run that is not dry makes one commit, or that the reasons of the model check are the `G10_` codes of the gate package.
10. **The owner's placeholders.** The byline wording (`DESK_BYLINE_LABEL`, "automated, with sources linked"), the publication name and the domain (`https://robywire.example`, `SITE_URL`) are placeholders, as in Plan 1; the user agent of the fetcher links to `https://robywire.example/method`, so the domain must be real before the fetcher goes onto the web.
11. **Known limits that remain.** Newsroom scraping is generic: a company whose stories are not below its newsroom's own path gives no candidates, and a per-site adapter is the remedy. Select and Extract have been tried only on fixture pages. A tier-2 page is read for its outlet's claims although nothing checks that the page belongs to the outlet whose feed named it. `desk replay` needs the same `--sources` as the run (the run does not record which it used). The Lighthouse scores come from one machine with simulated throttling. Extract does not compare the `normalised` text of a value with its `raw` text, a revision replaces a sentence and cannot add or delete one, two sections with one heading send both sentences of a failure back, and the evidence store, the lock and the run folders assume one machine and one run at a time.

Plan 2 is finished. Plan 2b connects the Desk to the world: the key, the prompts, the schedule, the deploy, the holds and the corrections.
