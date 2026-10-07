## Plan 2b (part 2) — Run mechanics

**Goal:** the Desk will run by itself, three times a day, with no one to type the flags and no one to look at the folders. That asks four things of the code that already exists. A record of a run must say how the run was made, so that it can be replayed with no flag (Task 5). A day whose run failed must be tried again, with no flag, but only so many times, and the failed run must be kept for whoever has to find out why (Task 6). A paid model must never be asked about a made-up world (Task 7). And the one check that trusts a model's word for what a figure means, the normalised form of a value, must hold it to the text of the page (Task 8). Task 9 makes `desk status` say more, and Task 10 makes the states that a day can be in a table that runs. Each task is a test-first patch to code that already exists: the tests that pin the old behaviour are changed first and shown failing, the change is the smallest that makes them pass, and there is one commit.

| Task | What it does |
|---|---|
| 5 | The record `run.json` says `client` (`fake`, `recorded` or `api`), `sources` (`fixtures` or `live`) and `attempt`; `desk replay` reads them from it, needs no flag, refuses a flag that contradicts the record, and still reads a record from before. |
| 6 | A day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3); the earlier run is kept as `runs/<date>.failed-<n>/` (or `.replaced-<n>/` with `--force-new`, or `.old-<n>/` when it never ended); the run after the limit is refused with nothing run. |
| 7 | `refuseApiOnFixtures(client, sources)`: `--client api` with `--sources fixtures` is refused, dry or not, by the command line (exit 2) and by the orchestrator. |
| 8 | Extract holds the `normalised` form and the `unit` of every value to its `raw` text, with the gate's own readers, and drops a claim that says otherwise with the new reason `value-normalised-mismatch`. |
| 9 | `desk status` prints the last run with its day and try, the holds, the corrections and the retractions. |
| 10 | The states of a day and what `desk run` does in each, as a table, and a test that runs every row; the whole check. |

**Starting state:** Plans 1 and 2 are built (Tasks 1 to 88 of Plan 1 and 1 to 50 of Plan 2), and so is part 1 of this plan (Tasks 1 to 4, the new name). `npm run typecheck`, `npm test`, `npm run evals:seeded` (61 of 61 cases caught), `npm run fixtures:check` and `npm run verify` pass. Today `run.json` has no `client`, `sources` or `attempt`, `desk replay` defaults to `--sources live`, a day with a record of any outcome is refused, `--client api --sources fixtures --dry` is allowed, a claim's `normalised` form is not compared with its `raw` text, and `desk status` prints two lines.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/desk -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, the README or a fixture; where a test needs one, it uses `String.fromCharCode`.
- **No network, no key, no real site.** Nothing in this part opens a connection or reads an API key. Every test gives the code its own stand-in for the web and for the model: the made-up world of Fixture Robotics (`*.example`) and a scripted model, and the tests that use a key use a made-up one such as `k`. `--client api` is only ever run with live sources and no network, where it fails at Discover, which is what makes a failed day in the tests of the command line.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** this part adds no package.

---

### Task 5: The record of a run says how it was made

**Files:**
- Modify: `desk/src/run/artifacts.ts` (`RunRecord` gains `client`, `sources` and `attempt`; new `CLIENT_KINDS`, `SOURCES_KINDS`, `LegacyRunRecord`, `StoredRunRecord`, `readRunRecord`), `desk/src/run/orchestrate.ts` (writes them), `desk/src/run/replay.ts` (reads the record with `readRunRecord`), `desk/src/cli.ts` (replay reads the record, takes `--client` as a check), `desk/src/demo/run.ts` (the demo replays with no flag)
- Modify: `README.md` (what the record says, and what replay takes from it)
- Test: `desk/test/run/artifacts.test.ts`, `desk/test/run/orchestrate.test.ts`, `desk/test/run/replay.test.ts`, `desk/test/cli.test.ts`, `desk/test/demo/run.test.ts`, `desk/test/readme.test.ts`, `desk/test/support/run.ts`

Today `run.json` says how a run ended but not how it was made. `desk replay <folder>` has to be told again `--sources fixtures` or `--sources live`, and when it is told the wrong one it does not refuse: it reads the other registry and reports artifacts that differ, which looks like a change of code. When the Desk runs by itself every day, nobody types the flags, so the record must carry them. This task adds three fields to the record of every run, makes `desk replay` read them, and keeps every record that was written before.

**The three fields.**

| Field | Values | Meaning |
|---|---|---|
| `client` | `fake`, `recorded`, `api` | who answered the model calls: a script, recorded replies, or the Anthropic API |
| `sources` | `fixtures`, `live` | where the stories came from: the made-up world, or the web as `sources.yml` lists it |
| `attempt` | a whole number from 1 | which try of its day the run was: 1 for the first. This task always writes 1; Task 6 makes a second try of a failed day number 2 |

The schema `RunRecord` requires all three, so no record without them can be written. A second schema, `LegacyRunRecord`, is the same record without them, and the new function `readRunRecord(file)` reads a record as either: the one with the three fields, or the one from before, which comes back without them. A record that has only some of the three, or is wrong in any other way, is refused with the error of the new schema, which names the field. The orchestrator is told which client and which sources it was given by two new required options, `clientKind` and `sourcesKind` (the existing option `sources` is the registry, so the name is taken).

**What replay does with them.** The record says what the run used; a flag can only agree with it. There is no way to override the record: a replay that reads another registry than the run did, or takes another run's replies, would differ for that reason alone and say nothing about the code, so a flag that contradicts the record is refused with exit code 2 and a message that names both values. `--client` is new for `replay`, and it is only that check: replay never calls a model, it reads recorded replies.

| The record of the run says | The flags say | `desk replay` does |
|---|---|---|
| `sources: S`, `client: C` | nothing | replays with the registry of `S`; for `C` = `recorded` it needs `--cassettes` (see below) |
| `sources: S`, `client: C` | `--sources S` and/or `--client C` | the same |
| `sources: S`, `client: C` | `--sources` other than `S`, or `--client` other than `C` | refused, exit 2, nothing replayed |
| `client: recorded` | no `--cassettes` | refused, exit 2: a run made with the recorded client read its replies from a folder that the record does not name, and kept none of its own |
| none of the three (a record from before) | `--sources S` | replays with the registry of `S`, as it always did |
| none of the three | no `--sources` | refused, exit 2, with a message that says the record is from before records said how a run was made, and that the replay needs the flags |

- [ ] **Step 1: Write the tests**

The record. `runRecord()` of the test file is a record that the schema must accept, so it gets the three fields. The new tests say what each field may be, that a record written today has all three, and what `readRunRecord` does with a record that has them, one that has none, one that has some, and a file that is missing or is not JSON.

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, RunRecord, SelectArtifact, VerifyArtifact, candidateId, readArtifact, readJsonFile, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { defaultConfig } from '../../src/config';
```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CLIENT_KINDS, Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, LegacyRunRecord, RunRecord, SOURCES_KINDS, SelectArtifact, VerifyArtifact, candidateId, readArtifact, readJsonFile, readRunRecord, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { defaultConfig } from '../../src/config';
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
  commit: COMMIT,
  dry: false,
  models: defaultConfig().models,
  budget: { limit: defaultConfig().budget, spent: { calls: 4, inputTokens: 21_000, outputTokens: 3_200 } },
```

**with:**
```ts
  commit: COMMIT,
  dry: false,
  client: 'fake',
  sources: 'fixtures',
  attempt: 1,
  models: defaultConfig().models,
  budget: { limit: defaultConfig().budget, spent: { calls: 4, inputTokens: 21_000, outputTokens: 3_200 } },
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
});

describe('readJsonFile', () => {
  it('reads a file that matches the schema', async () => {
```

**with:**
```ts
});

describe('RunRecord: how the run was made', () => {
  it('names the client and the sources of the run, and which try of the day it was', () => {
    expect(CLIENT_KINDS).toEqual(['fake', 'recorded', 'api']);
    expect(SOURCES_KINDS).toEqual(['fixtures', 'live']);
    for (const client of CLIENT_KINDS) expect(problem(RunRecord, { ...runRecord(), client })).toBe('');
    for (const sources of SOURCES_KINDS) expect(problem(RunRecord, { ...runRecord(), sources })).toBe('');
    expect(problem(RunRecord, { ...runRecord(), attempt: 3 })).toBe('');
  });

  it('refuses a client or sources that are not one of the choices, and an attempt that is not a whole number from 1', () => {
    expect(problem(RunRecord, { ...runRecord(), client: 'gpt' })).toContain('client:');
    expect(problem(RunRecord, { ...runRecord(), sources: 'files' })).toContain('sources:');
    for (const attempt of [0, -1, 1.5, '1', null]) expect(problem(RunRecord, { ...runRecord(), attempt }), String(attempt)).toContain('attempt:');
  });

  it('refuses a record that does not say how the run was made: the three fields are required of every record that is written', () => {
    for (const key of ['client', 'sources', 'attempt'] as const) {
      const { [key]: _left, ...rest } = runRecord();
      expect(problem(RunRecord, rest), key).toContain(`${key}:`);
    }
  });
});

describe('readRunRecord', () => {
  const written = (record: unknown): string => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify(record));
    return path.join(dir, 'run.json');
  };
  const { client: _client, sources: _sources, attempt: _attempt, ...BEFORE } = runRecord();

  it('reads a record that says how the run was made, with those fields', async () => {
    expect(await readRunRecord(written(runRecord()))).toEqual(runRecord());
  });

  it('reads a record from before runs said how they were made, which has none of the three fields, and gives it none', async () => {
    const record = await readRunRecord(written(BEFORE));
    expect(record).toEqual(BEFORE);
    expect(record.client).toBeUndefined();
    expect(record.sources).toBeUndefined();
    expect(record.attempt).toBeUndefined();
    expect(problem(LegacyRunRecord, BEFORE)).toBe('');
  });

  it('does not take a record that has only some of the three fields, for either kind of record', async () => {
    await expect(readRunRecord(written({ ...BEFORE, client: 'fake' }))).rejects.toThrow('the run record run.json does not match its schema: sources:');
    await expect(readRunRecord(written({ ...BEFORE, attempt: 1, sources: 'live' }))).rejects.toThrow('does not match its schema: client:');
  });

  it('still refuses what is wrong with the rest of the record, naming the fields of the new kind of record', async () => {
    await expect(readRunRecord(written({ ...runRecord(), date: 'yesterday' }))).rejects.toThrow('the run record run.json does not match its schema: date:');
    await expect(readRunRecord(written({ ...BEFORE, date: 'yesterday' }))).rejects.toThrow('does not match its schema: date:');
    await expect(readRunRecord(written({ ...runRecord(), note: 'x' }))).rejects.toThrow('Unrecognized key: "note"');
  });

  it('says what is missing and what is not JSON, as every reader of a run file does', async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    await expect(readRunRecord(path.join(dir, 'run.json'))).rejects.toThrow(`the run record run.json is not in ${dir}`);
    writeFileSync(path.join(dir, 'run.json'), '{"runId": ');
    await expect(readRunRecord(path.join(dir, 'run.json'))).rejects.toThrow('the run record run.json is not valid JSON');
  });
});

describe('readJsonFile', () => {
  it('reads a file that matches the schema', async () => {
```

The orchestrator. The helper that every test of a whole run uses gives the run the made-up world and the scripted client, which are also what it says in the record.

**In `desk/test/support/run.ts`, replace:**
```ts
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    model: clientFromConfig(config, { kind: 'fake', fake }, {}, {}, options.record === true ? path.join(dir, 'cassettes') : undefined),
    evidence: new LocalEvidenceStore(config.evidenceDir),
```

**with:**
```ts
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    clientKind: 'fake',
    sourcesKind: 'fixtures',
    model: clientFromConfig(config, { kind: 'fake', fake }, {}, {}, options.record === true ? path.join(dir, 'cassettes') : undefined),
    evidence: new LocalEvidenceStore(config.evidenceDir),
```

The record that the existing test spells out in full has the three fields, and new tests say that the orchestrator writes whatever it was told, for every outcome and for a dry run.

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
      commit: result.commit,
      dry: false,
      models: config.models,
      budget: { limit: config.budget, spent: record.budget.spent },
```

**with:**
```ts
      commit: result.commit,
      dry: false,
      client: 'fake',
      sources: 'fixtures',
      attempt: 1,
      models: config.models,
      budget: { limit: config.budget, spent: record.budget.spent },
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
});

describe('runDesk: a dry run', () => {
  it('ends published and makes no commit, and writes nothing into the site or the desk state', async () => {
```

**with:**
```ts
});

describe('runDesk: how the run was made', () => {
  it('records the client and the sources that it is told it was made with, whichever the outcome, and that it is the first try of the day', async () => {
    for (const [client, sources] of [['fake', 'fixtures'], ['recorded', 'fixtures'], ['api', 'live']] as const) {
      const made = setup();
      await made.run({ clientKind: client, sourcesKind: sources });
      expect(recordOf(made.dir)).toMatchObject({ outcome: 'published', client, sources, attempt: 1 });
    }
    for (const options of [{ fake: unentailed() }, { fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) }, { stages: { compose: async () => { throw new Error('x'); } } }] as RunSetup[]) {
      const made = setup(options);
      await made.run({ clientKind: 'api', sourcesKind: 'live' });
      expect(recordOf(made.dir)).toMatchObject({ client: 'api', sources: 'live', attempt: 1 });
    }
  });

  it('records them for a dry run as well', async () => {
    const made = setup({ dry: true });
    await made.run();
    expect(recordOf(made.dir)).toMatchObject({ dry: true, client: 'fake', sources: 'fixtures', attempt: 1 });
  });
});

describe('runDesk: a dry run', () => {
  it('ends published and makes no commit, and writes nothing into the site or the desk state', async () => {
```

Replay of a record from before. `replayRun` reads the record itself, so it too must accept one without the fields.

**In `desk/test/run/replay.test.ts`, replace:**
```ts
  });

  it('takes the cassettes from the folder it is given, when that is not the one in the run', async () => {
    const { dir, replay } = await recordedRun();
```

**with:**
```ts
  });

  it('replays a run whose record is from before records said how a run was made, which has no client, sources or attempt', async () => {
    const { dir, replay } = await recordedRun();
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = read(path.join(dir, 'run.json')) as Record<string, unknown>;
    write(path.join(dir, 'run.json'), before);
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
  });

  it('takes the cassettes from the folder it is given, when that is not the one in the run', async () => {
    const { dir, replay } = await recordedRun();
```

The command line. `replay` has no default for `--sources` any more, it takes `--client`, and the tests of the whole command run a made-up day, read its record, and replay it with no flag, with flags that agree, with flags that contradict the record, with a record from before, and with a record of a run that used the recorded client.

**In `desk/test/cli.test.ts`, replace:**
```ts
describe('parseArgs: replay, status and the rest', () => {
  it('reads replay with the folder of a run, and the options of replay', () => {
    expect(parsed('replay', 'runs/2026-10-05')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'live', cassettes: undefined, config: undefined });
    expect(parsed('replay', 'runs/2026-10-05', '--sources', 'fixtures', '--cassettes', 'elsewhere')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'fixtures', cassettes: 'elsewhere', config: undefined });
    expect(parsed('replay', '--sources', 'fixtures', 'runs/x')).toMatchObject({ runDir: 'runs/x', sources: 'fixtures' });
  });

  it('refuses replay with no folder, with two, with an option of run, and with a value that is wrong', () => {
    expect(refused('replay')).toBe('replay needs the folder of a run');
```

**with:**
```ts
describe('parseArgs: replay, status and the rest', () => {
  it('reads replay with the folder of a run, and the options of replay', () => {
    expect(parsed('replay', 'runs/2026-10-05')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: undefined, client: undefined, cassettes: undefined, config: undefined });
    expect(parsed('replay', 'runs/2026-10-05', '--sources', 'fixtures', '--cassettes', 'elsewhere')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'fixtures', client: undefined, cassettes: 'elsewhere', config: undefined });
    expect(parsed('replay', '--sources', 'fixtures', 'runs/x')).toMatchObject({ runDir: 'runs/x', sources: 'fixtures' });
  });

  it('reads --client for replay, which says how the run was made and is only checked against the record of the run', () => {
    expect(parsed('replay', 'runs/x', '--client', 'recorded')).toMatchObject({ command: 'replay', client: 'recorded' });
    expect(refused('replay', 'runs/x', '--client', 'gpt')).toBe('--client is fake, recorded or api, not "gpt"');
    expect(refused('replay', 'runs/x', '--client')).toBe('--client needs a value');
  });

  it('refuses replay with no folder, with two, with an option of run, and with a value that is wrong', () => {
    expect(refused('replay')).toBe('replay needs the folder of a run');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(err).toEqual([]);
    expect(USAGE).toContain('desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new]');
    expect(USAGE).toContain('desk replay');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**with:**
```ts
    expect(err).toEqual([]);
    expect(USAGE).toContain('desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new]');
    expect(USAGE).toContain('desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>]');
    expect(USAGE).toContain('The record of the run says');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
});

describe('main: replay', () => {
  it('replays a run that recorded its replies and says that it is equal, exit code 0', async () => {
```

**with:**
```ts
});

describe('main: the record says how the run was made', () => {
  /** The record of the run of the made-up day, as the file has it. */
  const recordIn = (cwd: string, ...below: string[]): Record<string, unknown> => JSON.parse(readFileSync(path.join(cwd, ...below, 'runs', DEMO_DATE, 'run.json'), 'utf8')) as Record<string, unknown>;
  const writeRecord = (cwd: string, record: Record<string, unknown>): void => writeFileSync(path.join(cwd, 'runs', DEMO_DATE, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
  const RUN_DIR = path.join('runs', DEMO_DATE);

  it('writes the client and the sources of a run into its record, and that it was the first try', async () => {
    const { call, cwd } = setup();
    await call(...DRY_DEMO);
    expect(recordIn(cwd)).toMatchObject({ client: 'fake', sources: 'fixtures', attempt: 1 });
  });

  it('writes the api client and the live sources for a run that asks for them, which fails here because there is no network', async () => {
    const { call, cwd } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    await call('run', '--dry', '--date', '2026-10-05');
    expect(recordIn(cwd)).toMatchObject({ outcome: 'failed', client: 'api', sources: 'live', attempt: 1 });
  });

  it('writes the recorded client for a run that replays recorded replies', async () => {
    const first = setup();
    await first.call(...DRY_DEMO);
    mkdirSync(path.join(first.cwd, 'kept'));
    for (const name of readdirSync(path.join(first.cwd, RUN_DIR, 'cassettes'))) copyFileSync(path.join(first.cwd, RUN_DIR, 'cassettes', name), path.join(first.cwd, 'kept', name));
    await first.call('run', '--dry', '--client', 'recorded', '--sources', 'fixtures', '--cassettes', 'kept', '--force-new');
    expect(recordIn(first.cwd)).toMatchObject({ client: 'recorded', sources: 'fixtures' });
  });

  it('replays a run with no flags at all, reading from the record that it was made in the made-up world', async () => {
    const { call, out, err } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    expect(await call('replay', RUN_DIR)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toEqual(['run: 2026-10-05-043100', '04-extract: equal', '05-compose: equal', '06-verify: equal', 'replay: equal']);
  });

  it('takes the flags that agree with the record', async () => {
    const { call, out } = setup();
    await call(...DRY_DEMO);
    expect(await call('replay', RUN_DIR, '--sources', 'fixtures', '--client', 'fake')).toBe(0);
    expect(out.at(-1)).toBe('replay: equal');
  });

  it('refuses --sources or --client that contradict the record, with exit code 2, the two values in the message, and nothing replayed', async () => {
    const { call, out, err } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    expect(await call('replay', RUN_DIR, '--sources', 'live')).toBe(2);
    expect(err).toEqual(['desk: the run 2026-10-05-043100 was made with --sources fixtures, so it cannot be replayed with --sources live: the pages and the registry of a replay must be the ones the run had, and the record of the run says which']);
    err.length = 0;
    expect(await call('replay', RUN_DIR, '--client', 'api')).toBe(2);
    expect(err).toEqual(['desk: the run 2026-10-05-043100 was made with --client fake, so it cannot be replayed with --client api: the replies of a replay are the ones the run recorded, and the record of the run says who gave them']);
    expect(out).toEqual([]);
  });

  it('reads a record from before records said how a run was made, and says that the replay needs the flags, with exit code 2', async () => {
    const { call, out, err, cwd } = setup();
    await call(...DRY_DEMO);
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = recordIn(cwd);
    writeRecord(cwd, before);
    out.length = 0;
    expect(await call('replay', RUN_DIR)).toBe(2);
    expect(err).toEqual(['desk: the record of the run 2026-10-05-043100 does not say how it was made (it was written before records did), so the replay needs the flags: --sources fixtures|live, and --cassettes <folder> if the run used --client recorded']);
    expect(out).toEqual([]);
  });

  it('replays a record from before with the flag, as replay always did', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = recordIn(cwd);
    writeRecord(cwd, before);
    out.length = 0;
    expect(await call('replay', RUN_DIR, '--sources', 'fixtures')).toBe(0);
    expect(out.at(-1)).toBe('replay: equal');
  });

  it('takes the flags for a record from before as they come: there is nothing in it to contradict, and --client only matters when it says recorded', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = recordIn(cwd);
    writeRecord(cwd, before);
    out.length = 0;
    expect(await call('replay', RUN_DIR, '--sources', 'fixtures', '--client', 'fake')).toBe(0);
    expect(out.at(-1)).toBe('replay: equal');
  });

  it('needs --cassettes for a run made with the recorded client, whose replies are not in its own folder, and says so with exit code 2', async () => {
    const first = setup();
    await first.call(...DRY_DEMO);
    mkdirSync(path.join(first.cwd, 'kept'));
    for (const name of readdirSync(path.join(first.cwd, RUN_DIR, 'cassettes'))) copyFileSync(path.join(first.cwd, RUN_DIR, 'cassettes', name), path.join(first.cwd, 'kept', name));
    await first.call('run', '--dry', '--client', 'recorded', '--sources', 'fixtures', '--cassettes', 'kept', '--force-new');
    first.out.length = 0;
    expect(await first.call('replay', RUN_DIR)).toBe(2);
    expect(first.err.at(-1)).toMatch(/^desk: the run 2026-10-05-\d{6} was made with --client recorded, so its replies are not in its own folder: replay it with --cassettes <the folder of the recorded replies>$/);
    expect(await first.call('replay', RUN_DIR, '--cassettes', 'kept')).toBe(0);
    expect(first.out.at(-1)).toBe('replay: equal');
  });
});

describe('main: replay', () => {
  it('replays a run that recorded its replies and says that it is equal, exit code 0', async () => {
```

The demo replays the run it has made with no flag, so that it shows that the record is enough.

**In `desk/test/demo/run.test.ts`, replace:**
```ts
    expect(seen[0]).toEqual(['run', '--dry', '--client', 'fake', '--sources', 'fixtures']);
    expect(seen[1]?.[0]).toBe('replay');
    expect(seen[1]?.slice(2)).toEqual(['--sources', 'fixtures']);
  });
});
```

**with:**
```ts
    expect(seen[0]).toEqual(['run', '--dry', '--client', 'fake', '--sources', 'fixtures']);
    expect(seen[1]?.[0]).toBe('replay');
    expect(seen[1]?.slice(2)).toEqual([]);
  });
});
```

The README says what the record holds and what a replay takes from it, and a test keeps that sentence true.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: how a replay knows how the run was made', () => {
  it('says that the record of a run says how it was made, that a replay needs no flag for it, and that a flag that contradicts the record is refused', () => {
    const command = section('The desk command');
    expect(section('The desk workspace')).toContain('which client answered the model, where the stories came from, and which try of its day it was');
    expect(command).toContain('The record of the run says which client and which sources it used, so a replay needs no flag for them');
    expect(command).toContain('one that contradicts the record is refused with exit code 2');
    expect(command).toContain('A record from before records said how a run was made has no such information and needs `--sources`');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts test/run/orchestrate.test.ts test/run/replay.test.ts test/cli.test.ts test/demo/run.test.ts test/readme.test.ts`
Expected: FAIL — `readRunRecord is not a function` and `Unrecognized keys: "client", "sources", "attempt"` and `unknown option --client for replay`

- [ ] **Step 3: Write the record, and make the orchestrator write it**

The kinds, the three fields, the schema of a record from before, and `readRunRecord`. The fields that every record has are written once, in `RECORD_FIELDS`, and the rules of how a run can end once, in `checkRunRecord`, so that the two schemas cannot drift apart.

**In `desk/src/run/artifacts.ts`, replace:**
```ts
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

**with:**
```ts
const count = z.number().int().nonnegative();

/** Who answers the model calls of a run: a script (`fake`), recorded replies (`recorded`) or the Anthropic API (`api`). */
export const CLIENT_KINDS = ['fake', 'recorded', 'api'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Where the stories of a run come from: the made-up world (`fixtures`) or the sources of `sources.yml` on the web (`live`). */
export const SOURCES_KINDS = ['fixtures', 'live'] as const;
export type SourcesKind = (typeof SOURCES_KINDS)[number];

/** The fields that every record has, whatever version of the Desk wrote it. */
const RECORD_FIELDS = {
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
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/, 'commit must be 40 lowercase hex characters')
    .nullable(),
  dry: z.boolean(),
  models: DeskConfig.shape.models,
  budget: z.strictObject({
    limit: DeskConfig.shape.budget,
    spent: z.strictObject({ calls: count, inputTokens: count, outputTokens: count }),
  }),
  /** The files the run left in its folder, as paths below it, in order: the artifacts of the stages and the held drafts, not the record itself. */
  artifacts: z.array(text),
  log: z.array(z.string()),
};

/** The rules of how a run can end, which hold for every record. */
function checkRunRecord(record: { outcome: string; startedAt: string; finishedAt: string; slug: string | null; reason: string | null; dry: boolean; commit: string | null }, context: z.RefinementCtx): void {
  const problem = (path: string, message: string): void => context.addIssue({ code: 'custom', path: [path], message });
  if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) problem('finishedAt', 'a run cannot end before it starts');
  if (record.outcome === 'published' && (record.slug === null || record.reason !== null)) problem('outcome', 'a published run has a slug and no reason');
  if (record.outcome === 'held' && (record.slug === null || record.reason === null)) problem('outcome', 'a held run has a slug and a reason');
  if ((record.outcome === 'no-story' || record.outcome === 'failed') && (record.slug !== null || record.reason === null)) {
    problem('outcome', `a run that ended in ${record.outcome} has a reason and no slug`);
  }
  if (record.dry && record.commit !== null) problem('commit', 'a dry run makes no commit');
  if (record.outcome === 'published' && !record.dry && record.commit === null) problem('commit', 'a run that published for real made a commit');
}

/**
 * The record of one run, written when it ends (`run.json` in the folder of the run; a folder that has none is a run that did not end). It says how
 * the run ended and why, which stage ended it, when, whether it was a dry run, how it was made (which client answered the model calls, where the stories
 * came from, and which try of its day it was: 1 for the first, 2 for the second, and so on), which piece and which commit it made, which models it used, what it
 * spent against its budget, which artifacts it left, and what the stages logged. The rules of how a run can end are in the schema, so that a record
 * that says otherwise cannot be written: a published piece has a slug and no reason; a hold has a slug and a reason; a run with no story or a failure
 * has a reason and no slug; a dry run has no commit, and a run that published for real has one. Every record that is written has the three fields that say
 * how the run was made; `readRunRecord` also reads a record from before they existed.
 */
export const RunRecord = z
  .strictObject({
    ...RECORD_FIELDS,
    client: z.enum(CLIENT_KINDS),
    sources: z.enum(SOURCES_KINDS),
    attempt: z.number().int().positive(),
  })
  .superRefine(checkRunRecord);
export type RunRecord = z.infer<typeof RunRecord>;

/** A record as it was written before records said how the run was made: the same fields without `client`, `sources` and `attempt`. It is never written, only read. */
export const LegacyRunRecord = z.strictObject(RECORD_FIELDS).superRefine(checkRunRecord);
export type LegacyRunRecord = z.infer<typeof LegacyRunRecord>;

/** A record as `readRunRecord` gives it: the fields of every record, and the three that say how the run was made when the record has them. */
export type StoredRunRecord = LegacyRunRecord & Partial<Pick<RunRecord, 'client' | 'sources' | 'attempt'>>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
  return readJsonFile(fileOf(dir, name), `the artifact ${name}.json`, schema);
}
```

**with:**
```ts
  return readJsonFile(fileOf(dir, name), `the artifact ${name}.json`, schema);
}

/**
 * Read the record of a run, `run.json` at `file`. A record that says how the run was made is read as `RunRecord`; one from before that (none of the three fields) is
 * read as `LegacyRunRecord`, and has no `client`, `sources` or `attempt`. A record that fits neither is an error that names the fields of the new kind of record, as
 * every file of a run is checked, and so is a file that is missing or is not JSON.
 */
export async function readRunRecord(file: string): Promise<StoredRunRecord> {
  const label = 'the run record run.json';
  const data = await readJsonFile(file, label, z.unknown());
  const current = RunRecord.safeParse(data);
  if (current.success) return current.data;
  const legacy = LegacyRunRecord.safeParse(data);
  if (legacy.success) return legacy.data;
  throw new Error(`${label} does not match its schema: ${describeIssues(current.error)}`);
}
```

The orchestrator is told the two kinds and writes them, with the number of the try, which for now is always 1.

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, DeskConfig, EvidenceStore, Fetcher, PublishTarget } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
```

**with:**
```ts
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  /** The model client of the run, inside its budget, and what it has spent: what `clientFromConfig` makes. */
  model: BuiltClient;
  evidence: EvidenceStore;
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
```

**with:**
```ts
  /** The model client of the run, inside its budget, and what it has spent: what `clientFromConfig` makes. */
  model: BuiltClient;
  /** Which client `model` is, and where the stories of the run come from. The record of the run says both, so that `desk replay` needs no flag for them. */
  clientKind: ClientKind;
  sourcesKind: SourcesKind;
  evidence: EvidenceStore;
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
      commit,
      dry: target.dry,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
```

**with:**
```ts
      commit,
      dry: target.dry,
      client: options.clientKind,
      sources: options.sourcesKind,
      attempt: 1,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
```

`replayRun` reads the record with the new function.

**In `desk/src/run/replay.ts`, replace:**
```ts
import path from 'node:path';
import type { SourcesRegistry } from '@robywire/gate';
import { FetchArtifact, FetchError, RecordedClient, RunRecord, SelectArtifact, readArtifact, readJsonFile } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher } from '../index';
import { runCompose } from '../stages/compose';
```

**with:**
```ts
import path from 'node:path';
import type { SourcesRegistry } from '@robywire/gate';
import { FetchArtifact, FetchError, RecordedClient, SelectArtifact, readArtifact, readRunRecord } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher } from '../index';
import { runCompose } from '../stages/compose';
```

**In `desk/src/run/replay.ts`, replace:**
```ts
 */
export async function replayRun(runDir: string, options: ReplayOptions): Promise<ReplayReport> {
  const record = await readJsonFile(path.join(runDir, 'run.json'), 'the run record run.json', RunRecord);
  const selected = await readArtifact(runDir, '02-select', SelectArtifact);
  const fetched = await readArtifact(runDir, '03-fetch', FetchArtifact);
```

**with:**
```ts
 */
export async function replayRun(runDir: string, options: ReplayOptions): Promise<ReplayReport> {
  const record = await readRunRecord(path.join(runDir, 'run.json'));
  const selected = await readArtifact(runDir, '02-select', SelectArtifact);
  const fetched = await readArtifact(runDir, '03-fetch', FetchArtifact);
```

- [ ] **Step 4: Make `desk replay` use the record**

`ClientKind` and `SourcesKind` now come from the record's module. `replay` takes `--client`, and has no default for `--sources`. `howToReplay` is the table above as code: it answers with the sources to use or with the reason the run cannot be replayed with what it was given. `desk run` tells the orchestrator what it chose.

**In `desk/src/cli.ts`, replace:**
```ts
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { HttpFetcher, LocalEvidenceStore, RunRefused, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, DeskConfig, Environment, Fetcher, GitTarget, Lookup, RetryOptions, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**with:**
```ts
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**In `desk/src/cli.ts`, replace:**
```ts
// differs, and 2 for a usage error.

export type ClientKind = 'fake' | 'recorded' | 'api';
export type SourcesKind = 'fixtures' | 'live';

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'help' };
```

**with:**
```ts
// differs, and 2 for a usage error.

export type { ClientKind, SourcesKind };

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'help' };
```

**In `desk/src/cli.ts`, replace:**
```ts
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '',
```

**with:**
```ts
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '',
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run is refused unless --force-new is given.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same.',
  'status  print the last run and the number of holds, from the desk state.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
```

**with:**
```ts
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run is refused unless --force-new is given.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
  '        contradicts it is refused. A run made with --client recorded has no replies of its own: replay it with --cassettes. A record from before records',
  '        said how a run was made needs --sources.',
  'status  print the last run and the number of holds, from the desk state.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
```

**In `desk/src/cli.ts`, replace:**
```ts
const OPTIONS: Readonly<Record<'run' | 'replay' | 'status', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
};

const CLIENTS: readonly string[] = ['fake', 'recorded', 'api'];
const SOURCES: readonly string[] = ['fixtures', 'live'];

/** Is `text` a day, YYYY-MM-DD, that exists? */
```

**with:**
```ts
const OPTIONS: Readonly<Record<'run' | 'replay' | 'status', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
};

const CLIENTS: readonly string[] = CLIENT_KINDS;
const SOURCES: readonly string[] = SOURCES_KINDS;

/** Is `text` a day, YYYY-MM-DD, that exists? */
```

**In `desk/src/cli.ts`, replace:**
```ts
    return { ok: true, args: { command: 'status', config: value('--config') } };
  }
  const sources = value('--sources') ?? 'live';
  if (!SOURCES.includes(sources)) return fail(`--sources is fixtures or live, not "${sources}"`);

  if (command === 'replay') {
    if (positional.length === 0) return fail('replay needs the folder of a run');
    if (positional.length > 1) return fail(`replay takes one folder, but was given "${positional.join('" and "')}"`);
    return { ok: true, args: { command: 'replay', runDir: positional[0] as string, sources: sources as SourcesKind, cassettes: value('--cassettes'), config: value('--config') } };
  }

  if (positional.length > 0) return fail(`run takes no arguments, but was given "${positional[0]}"`);
  const client = value('--client') ?? 'api';
  if (!CLIENTS.includes(client)) return fail(`--client is fake, recorded or api, not "${client}"`);
  const date = value('--date');
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
```

**with:**
```ts
    return { ok: true, args: { command: 'status', config: value('--config') } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
  const clientGiven = value('--client');
  if (clientGiven !== undefined && !CLIENTS.includes(clientGiven)) return fail(`--client is fake, recorded or api, not "${clientGiven}"`);

  if (command === 'replay') {
    if (positional.length === 0) return fail('replay needs the folder of a run');
    if (positional.length > 1) return fail(`replay takes one folder, but was given "${positional.join('" and "')}"`);
    return {
      ok: true,
      args: { command: 'replay', runDir: positional[0] as string, sources: sourcesGiven as SourcesKind | undefined, client: clientGiven as ClientKind | undefined, cassettes: value('--cassettes'), config: value('--config') },
    };
  }

  if (positional.length > 0) return fail(`run takes no arguments, but was given "${positional[0]}"`);
  const sources = sourcesGiven ?? 'live';
  const client = clientGiven ?? 'api';
  const date = value('--date');
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
```

**In `desk/src/cli.ts`, replace:**
```ts
      fetcher: world.fetcher,
      model,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
```

**with:**
```ts
      fetcher: world.fetcher,
      model,
      clientKind: args.client,
      sourcesKind: args.sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
```

**In `desk/src/cli.ts`, replace:**
```ts
}

async function replayCommand(args: Extract<Parsed, { command: 'replay' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  try {
    const report = await replayRun(path.resolve(deps.cwd, args.runDir), {
      config,
      sources: sourcesOf(args.sources, deps, config).sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
```

**with:**
```ts
}

/**
 * What a replay takes from the record of the run and from its flags: the sources to read the registry from, or why the run cannot be replayed with what it was given.
 * The record says which client and which sources the run used. A flag is only a check on it: one that says the other thing is refused, because a replay with another
 * registry, or from another run's replies, would differ for that reason alone and look like a change of code, and no flag overrides the record. A record from before
 * records said how a run was made has nothing to check against, so it needs `--sources`. A run made with the recorded client read its replies from a folder that the
 * record does not name, so a replay of it needs `--cassettes`.
 */
function howToReplay(record: StoredRunRecord, args: Extract<Parsed, { command: 'replay' }>): { sources: SourcesKind } | { message: string } {
  if (record.sources !== undefined && args.sources !== undefined && args.sources !== record.sources) {
    return {
      message: `the run ${record.runId} was made with --sources ${record.sources}, so it cannot be replayed with --sources ${args.sources}: the pages and the registry of a replay must be the ones the run had, and the record of the run says which`,
    };
  }
  if (record.client !== undefined && args.client !== undefined && args.client !== record.client) {
    return {
      message: `the run ${record.runId} was made with --client ${record.client}, so it cannot be replayed with --client ${args.client}: the replies of a replay are the ones the run recorded, and the record of the run says who gave them`,
    };
  }
  const sources = record.sources ?? args.sources;
  if (sources === undefined) {
    return {
      message: `the record of the run ${record.runId} does not say how it was made (it was written before records did), so the replay needs the flags: --sources fixtures|live, and --cassettes <folder> if the run used --client recorded`,
    };
  }
  if ((record.client ?? args.client) === 'recorded' && args.cassettes === undefined) {
    return { message: `the run ${record.runId} was made with --client recorded, so its replies are not in its own folder: replay it with --cassettes <the folder of the recorded replies>` };
  }
  return { sources };
}

async function replayCommand(args: Extract<Parsed, { command: 'replay' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const runDir = path.resolve(deps.cwd, args.runDir);
  try {
    const how = howToReplay(await readRunRecord(path.join(runDir, 'run.json')), args);
    if ('message' in how) {
      deps.err(`desk: ${how.message}`);
      return 2;
    }
    const report = await replayRun(runDir, {
      config,
      sources: sourcesOf(how.sources, deps, config).sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
```

The demo replays with no flag, and says so.

**In `desk/src/demo/run.ts`, replace:**
```ts
// The demo: `npm run desk:demo`. It runs the command `desk run --dry --client fake --sources fixtures`, the whole pipeline from Discover to the end, in the
// made-up world with a scripted model, and then replays the run from what it kept. It succeeds, with exit code 0, only if the run ended published, in a dry run,
// with nothing written: the site is exactly as it was and git was not asked to commit, and only if the replay finds every artifact equal. It is part of
// `npm run verify`, so that a change that breaks the pipeline as a whole, and not any one test of it, stops the check.

```

**with:**
```ts
// The demo: `npm run desk:demo`. It runs the command `desk run --dry --client fake --sources fixtures`, the whole pipeline from Discover to the end, in the
// made-up world with a scripted model, and then replays the run from what it kept. It succeeds, with exit code 0, only if the run ended published, in a dry run,
// with nothing written: the site is exactly as it was and git was not asked to commit, and only if the replay finds every artifact equal. The replay is given no flag:
// it reads from the record of the run that the run was made in the made-up world, which is also what the demo shows. It is part of
// `npm run verify`, so that a change that breaks the pipeline as a whole, and not any one test of it, stops the check.

```

**In `desk/src/demo/run.ts`, replace:**
```ts
    const code = await cli(['run', '--dry', '--client', 'fake', '--sources', 'fixtures'], cliDeps);
    const run = out.length;
    const replayCode = code === 0 ? await cli(['replay', path.join(work, 'runs', DEMO_DATE), '--sources', 'fixtures'], cliDeps) : 1;
    for (const line of out) deps.out(line);

```

**with:**
```ts
    const code = await cli(['run', '--dry', '--client', 'fake', '--sources', 'fixtures'], cliDeps);
    const run = out.length;
    const replayCode = code === 0 ? await cli(['replay', path.join(work, 'runs', DEMO_DATE)], cliDeps) : 1;
    for (const line of out) deps.out(line);

```

The README.

**In `README.md`, replace:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json`, and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock, a day is run once unless `--force-new` says otherwise, and every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

```

**with:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock, a day is run once unless `--force-new` says otherwise, and every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

```

**In `README.md`, replace:**
```markdown

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that already has a run is refused unless `--force-new` is given.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

```

**with:**
```markdown

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that already has a run is refused unless `--force-new` is given.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

```

- [ ] **Step 5: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/run/artifacts.test.ts test/run/orchestrate.test.ts test/run/replay.test.ts test/cli.test.ts test/demo/run.test.ts test/readme.test.ts`
Expected: PASS — `Test Files  6 passed (6)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Run the demo, which now replays from the record alone**

Run: `npm run desk:demo`
Expected: PASS — `replay: equal` and `desk demo: ok: completed as published`

- [ ] **Step 7: Commit**

```bash
git add README.md desk/src/cli.ts desk/src/demo/run.ts desk/src/run/artifacts.ts desk/src/run/orchestrate.ts desk/src/run/replay.ts desk/test/cli.test.ts desk/test/demo/run.test.ts desk/test/readme.test.ts desk/test/run/artifacts.test.ts desk/test/run/orchestrate.test.ts desk/test/run/replay.test.ts desk/test/support/run.ts
git commit -m "feat(desk): the record of a run says how it was made: the client, the sources and which try of its day it was, and replay reads them from the record, needs no flag for them, refuses a flag that contradicts the record, and still reads a record from before" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: A failed day can be tried again

**Files:**
- Modify: `desk/src/config.ts` (new setting `maxAttemptsPerDay`), `desk/src/run/lock.ts` (new refusal kind `attempts`), `desk/src/run/orchestrate.ts` (the day is planned before anything is moved; `RunResult.attempt`; the record says which try it was), `desk/src/cli.ts` (prints the try, the usage says the rule)
- Modify: `README.md`
- Test: `desk/test/config.test.ts`, `desk/test/run/orchestrate.test.ts`, `desk/test/cli.test.ts`, `desk/test/readme.test.ts`

Today a day is run once. When `runs/<date>/run.json` is there, the next `desk run` for that date is refused, and that includes a run that ended `failed`, for instance because a website was down for a minute. The Desk will run three times a day by itself (the limit below is what makes that safe), so a failed day must not block its date, and a day must not be tried without end either. This task makes both true.

**The rule.** A day's folder is `runs/<date>/`. The folders of earlier tries of the day are kept beside it and never removed or written over: `runs/<date>.failed-<n>/` for a try that failed, `runs/<date>.replaced-<n>/` for a try that ended (published, held or no story) and was run again with `--force-new`, and `runs/<date>.old-<n>/` for a folder that has no `run.json` (a run that never ended, which the earlier plan already moved aside as `.old-<n>`). The number `n` is the number of the try that the folder holds, and it is **one more than the highest number of any kind that is kept**, so a folder that is there is never written over, whatever its kind. The record of the new run says `attempt`: the try of the day it is, which is the number of the folder it moves aside, plus one. When the day has no folder, the run is the try after the highest number that is kept (the first try when none is).

The order of the checks matters, because a refused start must change nothing:

1. The lock is taken (unchanged: a lock that is held refuses the run).
2. A folder whose record ended `published`, `held` or `no-story` refuses the run (`date-done`) unless `--force-new` is given. A record that cannot be read counts as ended, so it is never run over by mistake. A record of `failed` does not refuse, and neither does a folder with no record.
3. When the day has already had `maxAttemptsPerDay` tries (the folder that is there counts as one, and so does every number that is kept) the run is refused (`attempts`), whether or not `--force-new` is given, and nothing is moved. The limit is a setting, default 3, a whole number from 1; the message says which setting to raise.
4. The place the run writes to is checked (`preflight`, unchanged), so a day that cannot start because the site has changes that are not committed costs no try.
5. Only then is the folder of the day moved aside, and the run starts in a new empty folder.

| What `runs/<date>/` holds | `desk run` | The old folder becomes | The new run |
|---|---|---|---|
| nothing | runs | | try 1 (or the next number after the folders that are kept) |
| a record that failed | runs, no flag needed | `<date>.failed-<n>` | try `n`+1 |
| a record that published, was held or found no story | refused (`date-done`), exit 1 | | |
| the same, with `--force-new` | runs | `<date>.replaced-<n>` | try `n`+1 |
| a record that cannot be read | refused like a record that ended; `--force-new` moves it as `.replaced-<n>` | | |
| no record (a run that never ended) | runs | `<date>.old-<n>` | try `n`+1 |
| any of these, when the day has had `maxAttemptsPerDay` tries | refused (`attempts`), exit 1, nothing moved | | |

- [ ] **Step 1: Write the tests**

The setting. The defaults list gains `maxAttemptsPerDay: 3`; the file may set it; zero, a negative number and a fraction are refused.

**In `desk/test/config.test.ts`, replace:**
```ts
      minClaims: 3,
      maxRevisionRounds: 2,
      userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
      requestIntervalMs: 1000,
```

**with:**
```ts
      minClaims: 3,
      maxRevisionRounds: 2,
      maxAttemptsPerDay: 3,
      userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
      requestIntervalMs: 1000,
```

**In `desk/test/config.test.ts`, replace:**
```ts

  it('accepts a setting at the edge of what is allowed', () => {
    const config = loadConfig(configFile('maxRevisionRounds: 0\nrequestIntervalMs: 0\nminClaims: 1\nrunDir: r\n'));
    expect([config.maxRevisionRounds, config.requestIntervalMs, config.minClaims, config.runDir]).toEqual([0, 0, 1, 'r']);
  });

```

**with:**
```ts

  it('accepts a setting at the edge of what is allowed', () => {
    const config = loadConfig(configFile('maxRevisionRounds: 0\nrequestIntervalMs: 0\nminClaims: 1\nmaxAttemptsPerDay: 1\nrunDir: r\n'));
    expect([config.maxRevisionRounds, config.requestIntervalMs, config.minClaims, config.maxAttemptsPerDay, config.runDir]).toEqual([0, 0, 1, 1, 'r']);
  });

  it('takes the number of tries that a day may have from the file', () => {
    expect(loadConfig(configFile('maxAttemptsPerDay: 5\n')).maxAttemptsPerDay).toBe(5);
  });

```

**In `desk/test/config.test.ts`, replace:**
```ts
  });

  it.each(['recencyHours', 'shortlistMax', 'minClaims', 'maxBytes', 'budget:\n  maxInputTokens', 'budget:\n  maxOutputTokens'])('%s of zero', (key) => {
    expect(failure(`${key}: 0\n`)).toContain('Too small: expected number to be >0');
  });

  it('a negative number of revision rounds, or a negative pause between requests', () => {
    expect(failure('maxRevisionRounds: -1\n')).toBe('desk config <file>: maxRevisionRounds: Too small: expected number to be >=0');
```

**with:**
```ts
  });

  it.each(['recencyHours', 'shortlistMax', 'minClaims', 'maxAttemptsPerDay', 'maxBytes', 'budget:\n  maxInputTokens', 'budget:\n  maxOutputTokens'])('%s of zero', (key) => {
    expect(failure(`${key}: 0\n`)).toContain('Too small: expected number to be >0');
  });

  it('a number of tries a day that is not a whole number of at least 1', () => {
    expect(failure('maxAttemptsPerDay: -1\n')).toBe('desk config <file>: maxAttemptsPerDay: Too small: expected number to be >0');
    expect(failure('maxAttemptsPerDay: 2.5\n')).toBe('desk config <file>: maxAttemptsPerDay: Invalid input: expected int, received number');
  });

  it('a negative number of revision rounds, or a negative pause between requests', () => {
    expect(failure('maxRevisionRounds: -1\n')).toBe('desk config <file>: maxRevisionRounds: Too small: expected number to be >=0');
```

The orchestrator. The first group is the two tests of the day that this task changes (the names of the folders and the try), then the new group, which has a test for each row of the table and for the order of the checks: a day that fails three times is refused the fourth try with nothing run and nothing moved; a day that published, was held or found no story is refused; `--force-new` is counted against the limit; a folder is never written over, whatever number the kept folders have; the folders of other days and names that only look like a folder of the day are not counted; a refused start costs no try. `composeFails()` is a stage that throws, so a run ends `failed` at Compose, and `again()` runs the same day again with a new scripted model and a clock that starts again.

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
```

**with:**
```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
import { readDeskState } from '../../src/run/desk-state';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { Stages } from '../../src/run/orchestrate';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
```

**with:**
```ts
import { readDeskState } from '../../src/run/desk-state';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
const setup = (options: RunSetup = {}) => setupRun(scratch, options);

describe('runDesk: a clean story', () => {
  it('ends published, with the slug of the piece and the commit that holds it', async () => {
```

**with:**
```ts
const setup = (options: RunSetup = {}) => setupRun(scratch, options);

/** Stages in which the composer falls over, so that a run ends failed at Compose. */
const composeFails = (): Partial<Stages> => ({
  compose: async () => {
    throw new Error('the composer fell over');
  },
});

/** The run of a day that is run again: a new scripted model (the made-up story unless one is given) and a clock that starts again, with the options of the made run. */
const again = (made: ReturnType<typeof setup>, overrides: Partial<RunDeskOptions> = {}, fake: FakeClient = demoClient()) =>
  made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), now: clock(), ...overrides });

/** The names in the folder of the runs, the lock excepted, in order. */
const foldersOf = (config: DeskConfig): string[] => readdirSync(config.runDir).filter((name) => name !== LOCK_FILE).sort();

/** The error that a run that was refused throws. */
const refusal = async (run: Promise<unknown>): Promise<RunRefused> => {
  const error = await run.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RunRefused);
  return error as RunRefused;
};

describe('runDesk: a clean story', () => {
  it('ends published, with the slug of the piece and the commit that holds it', async () => {
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
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

```

**with:**
```ts
  });

  it('with forceNew, moves the old run aside as replaced-1, keeps it whole, and runs again as the second try; the next time it moves that aside as replaced-2', async () => {
    const made = setup();
    await made.run();
    const firstRecord = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    for (const number of [1, 2]) {
      const result = await again(made, { forceNew: true }, new FakeClient().script('select', { chosenId: null, reasons: ['none'] }));
      expect([result.outcome, result.attempt]).toEqual(['no-story', number + 1]);
      expect(existsSync(`${made.dir}.replaced-${number}`)).toBe(true);
    }
    expect(readFileSync(path.join(`${made.dir}.replaced-1`, 'run.json'), 'utf8')).toBe(firstRecord);
    expect(filesBelow(made.dir)).toEqual(['01-discover.json', '02-select.json', 'run.json']);
    expect(recordOf(`${made.dir}.replaced-2`)).toMatchObject({ outcome: 'no-story', attempt: 2 });
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.replaced-1`, `${DEMO_DATE}.replaced-2`]);
  });

```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
  });

  it('starts again in a folder that has artifacts but no record, which is a run that never ended, and moves that folder aside too', async () => {
    const made = setup();
    mkdirSync(made.dir, { recursive: true });
    writeFileSync(path.join(made.dir, '01-discover.json'), '{}');
    const result = await made.run();
    expect(result.outcome).toBe('published');
    expect(readFileSync(path.join(`${made.dir}.old-1`, '01-discover.json'), 'utf8')).toBe('{}');
  });
```

**with:**
```ts
  });

  it('starts again in a folder that has artifacts but no record, which is a run that never ended, moves that folder aside as old-1, and counts it as a try', async () => {
    const made = setup();
    mkdirSync(made.dir, { recursive: true });
    writeFileSync(path.join(made.dir, '01-discover.json'), '{}');
    const result = await made.run();
    expect([result.outcome, result.attempt]).toEqual(['published', 2]);
    expect(readFileSync(path.join(`${made.dir}.old-1`, '01-discover.json'), 'utf8')).toBe('{}');
  });
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
});

describe('runDesk: the place it writes to', () => {
  it('refuses to start when the site has changes that are not committed, before any call to the model, and records nothing', async () => {
```

**with:**
```ts
});

describe('runDesk: a day whose run failed is tried again', () => {
  it('runs a failed day again with no --force-new: the failed run is kept beside the new one as failed-1, and the new run is the second try', async () => {
    const made = setup({ stages: composeFails() });
    const first = await made.run();
    expect([first.outcome, first.attempt]).toEqual(['failed', 1]);
    const failedRecord = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    const second = await again(made, { stages: {} });
    expect([second.outcome, second.attempt]).toEqual(['published', 2]);
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'published', attempt: 2 });
    expect(readFileSync(path.join(`${made.dir}.failed-1`, 'run.json'), 'utf8')).toBe(failedRecord);
    expect(recordOf(`${made.dir}.failed-1`)).toMatchObject({ outcome: 'failed', stage: 'compose', attempt: 1 });
    expect(existsSync(path.join(`${made.dir}.failed-1`, '06-verify.json'))).toBe(false);
    expect(existsSync(path.join(made.dir, '06-verify.json'))).toBe(true);
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.failed-1`]);
    expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
  });

  it('counts every try: two failures and then a piece is the third try, with the failed runs in failed-1 and failed-2', async () => {
    const made = setup({ stages: composeFails() });
    expect((await made.run()).attempt).toBe(1);
    expect((await again(made)).attempt).toBe(2);
    const third = await again(made, { stages: {} });
    expect([third.outcome, third.attempt]).toEqual(['published', 3]);
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.failed-1`, `${DEMO_DATE}.failed-2`]);
    expect([recordOf(`${made.dir}.failed-1`).attempt, recordOf(`${made.dir}.failed-2`).attempt]).toEqual([1, 2]);
  });

  it('refuses the fourth try of a day that failed three times: nothing runs, nothing is moved, nothing is committed, and the message says what to change', async () => {
    const made = setup({ stages: composeFails() });
    const tries = [await made.run(), await again(made), await again(made)];
    expect(tries.map((result) => [result.outcome, result.attempt])).toEqual([['failed', 1], ['failed', 2], ['failed', 3]]);
    const before = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    const fake = demoClient();
    const error = await refusal(again(made, {}, fake));
    expect(error.kind).toBe('attempts');
    expect(error.message).toBe(
      `the run of ${DEMO_DATE} has already been tried 3 times and maxAttemptsPerDay is 3: nothing was run. Raise maxAttemptsPerDay in a file of settings (--config) to allow another try`,
    );
    expect(fake.calls).toEqual([]);
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.failed-1`, `${DEMO_DATE}.failed-2`]);
    expect(readFileSync(path.join(made.dir, 'run.json'), 'utf8')).toBe(before);
    expect(made.git.commits).toHaveLength(3);
    expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
  });

  it('takes the number of tries from the settings: one try means that a failed day is not run again', async () => {
    const made = setup({ stages: composeFails(), config: { maxAttemptsPerDay: 1 } });
    await made.run();
    const error = await refusal(again(made));
    expect(error.kind).toBe('attempts');
    expect(error.message).toContain('has already been tried 1 time and maxAttemptsPerDay is 1');
    expect(foldersOf(made.config)).toEqual([DEMO_DATE]);
    const two = setup({ stages: composeFails(), config: { maxAttemptsPerDay: 2 } });
    await two.run();
    expect((await again(two)).attempt).toBe(2);
    expect((await refusal(again(two))).kind).toBe('attempts');
  });

  it('applies the limit to --force-new as well: the fourth try is refused whatever the first three were', async () => {
    const made = setup();
    await made.run();
    const quiet = () => new FakeClient().script('select', { chosenId: null, reasons: ['none'] });
    expect((await again(made, { forceNew: true }, quiet())).attempt).toBe(2);
    expect((await again(made, { forceNew: true }, quiet())).attempt).toBe(3);
    const error = await refusal(again(made, { forceNew: true }, quiet()));
    expect(error.kind).toBe('attempts');
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.replaced-1`, `${DEMO_DATE}.replaced-2`]);
  });

  it('refuses a day whose tries are kept even when the folder of the day is not there', async () => {
    const made = setup();
    for (const number of [1, 2, 3]) mkdirSync(`${made.dir}.failed-${number}`, { recursive: true });
    const error = await refusal(again(made));
    expect(error.kind).toBe('attempts');
    expect(error.message).toContain('has already been tried 3 times');
    expect(foldersOf(made.config)).toEqual([`${DEMO_DATE}.failed-1`, `${DEMO_DATE}.failed-2`, `${DEMO_DATE}.failed-3`]);
  });

  it.each([
    ['held', { fake: unentailed() }],
    ['no-story', { fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) }],
    ['published', {}],
  ] as [string, RunSetup][])('does not run a day again whose run ended %s: it is refused and nothing is moved', async (outcome, options) => {
    const made = setup(options);
    expect((await made.run()).outcome).toBe(outcome);
    const before = readFileSync(path.join(made.dir, 'run.json'), 'utf8');
    const error = await refusal(again(made));
    expect(error.kind).toBe('date-done');
    expect(error.message).toContain('run it again with --force-new');
    expect(foldersOf(made.config)).toEqual([DEMO_DATE]);
    expect(readFileSync(path.join(made.dir, 'run.json'), 'utf8')).toBe(before);
  });

  it('moves a held run aside as replaced with --force-new, and a failed run as failed whether or not --force-new is given', async () => {
    const held = setup({ fake: unentailed() });
    await held.run();
    expect((await again(held, { forceNew: true })).attempt).toBe(2);
    expect(foldersOf(held.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.replaced-1`]);
    const failed = setup({ stages: composeFails() });
    await failed.run();
    expect((await again(failed, { forceNew: true, stages: {} })).attempt).toBe(2);
    expect(foldersOf(failed.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.failed-1`]);
  });

  it('does not move a failed run aside when the site is not in order, so that a start that is refused costs no try', async () => {
    const made = setup({ stages: composeFails() });
    await made.run();
    made.git.dirty.add(STATE);
    const error = await refusal(again(made, { stages: {} }));
    expect(error.kind).toBe('target');
    expect(foldersOf(made.config)).toEqual([DEMO_DATE]);
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'failed', attempt: 1 });
    made.git.dirty.clear();
    expect((await again(made, { stages: {} })).attempt).toBe(2);
  });

  it('does not take a record that cannot be read for a failed run: the day is treated as done, and --force-new moves it aside', async () => {
    const made = setup();
    mkdirSync(made.dir, { recursive: true });
    writeFileSync(path.join(made.dir, 'run.json'), '{"outcome": "failed"');
    expect((await refusal(again(made))).kind).toBe('date-done');
    expect((await again(made, { forceNew: true })).attempt).toBe(2);
    expect(readFileSync(path.join(`${made.dir}.replaced-1`, 'run.json'), 'utf8')).toBe('{"outcome": "failed"');
  });

  it('reads a failed record from before records said how a run was made: the day is tried again', async () => {
    const made = setup({ stages: composeFails() });
    await made.run();
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = recordOf(made.dir);
    writeFileSync(path.join(made.dir, 'run.json'), `${JSON.stringify(before, null, 2)}\n`);
    expect((await again(made, { stages: {} })).attempt).toBe(2);
    expect(existsSync(path.join(`${made.dir}.failed-1`, 'run.json'))).toBe(true);
  });

  it('never writes over a folder that is there: the number of a moved folder is one more than the highest of any kind', async () => {
    const made = setup({ stages: composeFails(), config: { maxAttemptsPerDay: 20 } });
    for (const name of ['failed-1', 'replaced-5', 'old-2']) {
      mkdirSync(`${made.dir}.${name}`, { recursive: true });
      writeFileSync(path.join(`${made.dir}.${name}`, 'keep.txt'), name);
    }
    expect((await made.run()).attempt).toBe(6);
    expect((await again(made)).attempt).toBe(7);
    expect(foldersOf(made.config)).toEqual([DEMO_DATE, `${DEMO_DATE}.failed-1`, `${DEMO_DATE}.failed-6`, `${DEMO_DATE}.old-2`, `${DEMO_DATE}.replaced-5`]);
    for (const name of ['failed-1', 'replaced-5', 'old-2']) expect(readFileSync(path.join(`${made.dir}.${name}`, 'keep.txt'), 'utf8')).toBe(name);
    expect(recordOf(`${made.dir}.failed-6`).attempt).toBe(6);
  });

  it('does not count the folders of other days, or names that only look like the folders of a day', async () => {
    const made = setup({ stages: composeFails() });
    for (const name of ['2026-10-04.failed-1', '2026-10-04.failed-2', '2026-10-04.failed-3', `${DEMO_DATE}.failed-x`, `${DEMO_DATE}.failed-`, `${DEMO_DATE}.kept-9`, `${DEMO_DATE}x.failed-9`, `${DEMO_DATE}.failed-1.bak`, `x${DEMO_DATE}.failed-9`]) {
      mkdirSync(path.join(made.config.runDir, name), { recursive: true });
    }
    expect((await made.run()).attempt).toBe(1);
    expect((await again(made)).attempt).toBe(2);
  });
});

describe('runDesk: the place it writes to', () => {
  it('refuses to start when the site has changes that are not committed, before any call to the model, and records nothing', async () => {
```

The command line. The output has a line `attempt: <n>` after the id of the run, a failed day is run again with the same command, and the refusal of the fourth try exits with 1 and prints the message. A live run with no network fails at Discover, which makes a failed day without any scripted stage.

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(USAGE).toContain('desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>]');
    expect(USAGE).toContain('The record of the run says');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**with:**
```ts
    expect(USAGE).toContain('desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>]');
    expect(USAGE).toContain('The record of the run says');
    expect(USAGE).toContain('a day whose run failed is run');
    expect(USAGE).toContain('maxAttemptsPerDay');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(await call(...DRY_DEMO, '--force-new')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05.old-1'))).toBe(true);
  });
});
```

**with:**
```ts
    expect(await call(...DRY_DEMO, '--force-new')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05.replaced-1'))).toBe(true);
  });

  it('says which try of its day the run was, on a line of its own after the run id', async () => {
    const { call, out } = setup();
    await call(...DRY_DEMO);
    expect(out.slice(out.indexOf('run: 2026-10-05-043100'))).toEqual([
      'run: 2026-10-05-043100',
      'attempt: 1',
      expect.stringMatching(/^folder: /),
      expect.stringMatching(/^piece: /),
      expect.stringMatching(/^dry run: /),
    ]);
    out.length = 0;
    await call(...DRY_DEMO, '--force-new');
    expect(out).toContain('attempt: 2');
  });
});

describe('main: a day that failed is tried again', () => {
  // A live run with no network fails at Discover, which makes a failed day without any stage of a test: the same command is the next try of the day.
  it('runs a failed day again with the same command, up to three tries, and refuses the fourth with exit code 1 and nothing run', async () => {
    const { call, out, err, cwd, git } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    for (const attempt of [1, 2, 3]) {
      out.length = 0;
      expect(await call('run', '--date', '2026-10-05'), `try ${attempt}`).toBe(1);
      expect(out).toContain('outcome: failed');
      expect(out).toContain(`attempt: ${attempt}`);
    }
    const commits = git.commits.length;
    out.length = 0;
    expect(await call('run', '--date', '2026-10-05')).toBe(1);
    expect(out).toEqual([]);
    expect(err.at(-1)).toBe(
      'the run was refused: the run of 2026-10-05 has already been tried 3 times and maxAttemptsPerDay is 3: nothing was run. Raise maxAttemptsPerDay in a file of settings (--config) to allow another try',
    );
    expect(git.commits).toHaveLength(commits);
    expect(readdirSync(path.join(cwd, 'runs')).sort()).toEqual(['2026-10-05', '2026-10-05.failed-1', '2026-10-05.failed-2']);
  });

  it('takes the number of tries from a file of settings', async () => {
    const made = setup({ config: undefined, env: { ANTHROPIC_API_KEY: 'k' } });
    writeFileSync(path.join(made.cwd, 'desk.yml'), 'maxAttemptsPerDay: 1\nuserAgent: "AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)"\n');
    expect(await made.call('run', '--date', '2026-10-05', '--config', 'desk.yml')).toBe(1);
    expect(await made.call('run', '--date', '2026-10-05', '--config', 'desk.yml')).toBe(1);
    expect(made.err.at(-1)).toContain('has already been tried 1 time and maxAttemptsPerDay is 1');
  });

  it('still refuses a day whose run published, with the way out', async () => {
    const { call, err } = setup();
    await call(...DRY_DEMO);
    expect(await call(...DRY_DEMO)).toBe(1);
    expect(err.at(-1)).toContain('the run was refused: the run of 2026-10-05 is already done');
  });
});
```

The README says the rule, and a test keeps the sentences true.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: a day whose run failed', () => {
  it('says that a failed day is run again with no flag, how many runs a day may have, where the earlier run is kept, and what --force-new is for', () => {
    const workspace = section('The desk workspace');
    const command = section('The desk command');
    expect(workspace).toContain('a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise');
    expect(workspace).toContain('`runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed');
    expect(workspace).toContain('A day that published, was held or found no story is not run again unless `--force-new` says so');
    expect(command).toContain('the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run)');
    expect(command).toContain('how many runs one day may have (`maxAttemptsPerDay`)');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/config.test.ts test/run/orchestrate.test.ts test/cli.test.ts test/readme.test.ts`
Expected: FAIL — `Unrecognized key: "maxAttemptsPerDay"` and `expected undefined to be an instance of RunRefused` and `expected [ 'published', undefined ] to deeply equal [ 'published', 2 ]`

- [ ] **Step 3: Add the setting and the refusal**

**In `desk/src/config.ts`, replace:**
```ts
  /** Verify: how many times a draft goes back to the composer before it is held. */
  maxRevisionRounds: z.number().int().nonnegative(),
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
```

**with:**
```ts
  /** Verify: how many times a draft goes back to the composer before it is held. */
  maxRevisionRounds: z.number().int().nonnegative(),
  /** Run: how many runs one day may have, the first and every one after it (a day that failed is run again, and `--force-new` runs a day again). The run after the last is refused. */
  maxAttemptsPerDay: count,
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
```

**In `desk/src/config.ts`, replace:**
```ts
    minClaims: 3,
    maxRevisionRounds: 2,
    userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
    requestIntervalMs: 1000,
```

**with:**
```ts
    minClaims: 3,
    maxRevisionRounds: 2,
    maxAttemptsPerDay: 3,
    userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
    requestIntervalMs: 1000,
```

**In `desk/src/run/lock.ts`, replace:**
```ts
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: the lock is held, the lock is old, the day has been run, or the place it writes to is not in order. */
export type RefusalKind = 'locked' | 'stale-lock' | 'date-done' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
```

**with:**
```ts
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: the lock is held, the lock is old, the day has been run, the day has used all its tries, or the place it writes to is not in order. */
export type RefusalKind = 'locked' | 'stale-lock' | 'date-done' | 'attempts' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
```

- [ ] **Step 4: Plan the day before anything is moved**

`planDay` replaces `prepareFolder`. It reads the folder names, the record of the folder of the day if there is one, and the limit, and it decides without changing anything; the move is a function that the orchestrator calls after `preflight`. `RunResult` says which try the run was.

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
```

**with:**
```ts
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, readRunRecord, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
// context, passes each stage what the one before it made, and ends in one of four outcomes. It never lets anything half done stand: a stage that throws
// ends the run as `failed` with the reason and the name of the stage, and nothing is published on the strength of it. Every run that is not dry ends with
// one commit and a record, `run.json`, in the folder of its day.

/** The stages, as functions, so that a test can put one of its own in the place of a stage. The defaults are the stages of the Desk. */
```

**with:**
```ts
// context, passes each stage what the one before it made, and ends in one of four outcomes. It never lets anything half done stand: a stage that throws
// ends the run as `failed` with the reason and the name of the stage, and nothing is published on the strength of it. Every run that is not dry ends with
// one commit and a record, `run.json`, in the folder of its day. A day whose run failed is run again (up to `maxAttemptsPerDay` runs a day), and the folder
// of the earlier run is kept beside the new one.

/** The stages, as functions, so that a test can put one of its own in the place of a stage. The defaults are the stages of the Desk. */
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  /** The clock. It is read for the time of the run and nowhere else; the stages never read it. */
  now: () => Date;
  /** Run again for a day that already has a run: the folder of the old run is moved aside, not removed. */
  forceNew?: boolean;
  /** A line for the log of the run, as it happens. Every line is also kept in the record. */
```

**with:**
```ts
  /** The clock. It is read for the time of the run and nowhere else; the stages never read it. */
  now: () => Date;
  /** Run again for a day whose run did not fail: the folder of the old run is moved aside (as `<day>.replaced-<n>`), not removed. A day whose run failed is run again without it. */
  forceNew?: boolean;
  /** A line for the log of the run, as it happens. Every line is also kept in the record. */
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  reason: string | null;
  slug: string | null;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
```

**with:**
```ts
  reason: string | null;
  slug: string | null;
  /** Which try of its day the run was: 1 for the first. */
  attempt: number;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
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

```

**with:**
```ts
}

/** The kinds of folder that an earlier try of a day is moved to: `<day>.failed-<n>`, `<day>.replaced-<n>` and `<day>.old-<n>`. */
const ASIDE = /^(failed|replaced|old)-(\d+)$/;

/** The highest number among the folders that earlier tries of `date` were moved to in `runsDir`, whatever their kind; 0 when there are none. */
async function highestAside(runsDir: string, date: string): Promise<number> {
  let highest = 0;
  for (const name of await readdir(runsDir)) {
    if (!name.startsWith(`${date}.`)) continue;
    const match = ASIDE.exec(name.slice(date.length + 1));
    if (match !== null) highest = Math.max(highest, Number(match[2]));
  }
  return highest;
}

/** What the folder of a day that is there holds: a run that never ended (no record), a run that failed, or a run that ended any other way (a record that cannot be read counts as that, so that it is never run over). */
async function whatIsIn(dir: string): Promise<'unended' | 'failed' | 'done'> {
  const record = path.join(dir, 'run.json');
  if (!(await exists(record))) return 'unended';
  try {
    return (await readRunRecord(record)).outcome === 'failed' ? 'failed' : 'done';
  } catch {
    return 'done';
  }
}

/** The day of a run, as `planDay` decides it: which try the run is, and how to put the folder of an earlier try away (nothing to do when the day has none). */
interface DayPlan {
  attempt: number;
  moveAside(): Promise<void>;
}

/**
 * Decide whether the day may be run, and which try the run is, without changing anything.
 *
 * The folders of earlier tries are `<day>.failed-<n>`, `<day>.replaced-<n>` and `<day>.old-<n>`, and `n` counts the tries of the day, whatever became of them, so the folder
 * of the day, when it is there, is the try after the highest `n` that is kept. A day whose folder holds a record of a run that ended any way but `failed` is refused
 * (`date-done`) unless `forceNew` says to run it again. A day that has had `maxAttemptsPerDay` tries is refused (`attempts`), `forceNew` or not. Otherwise the run is
 * the next try, and `moveAside` puts the folder of the day that is there to the name `<day>.failed-<n>` for a run that failed, `<day>.replaced-<n>` for one that ended
 * and is run again with `forceNew`, and `<day>.old-<n>` for one that never ended, so that the folder of a run never holds the artifacts of two runs and nothing is removed.
 * The number is one more than the highest that is kept, so a folder that is there is never written over.
 */
async function planDay(config: DeskConfig, date: string, forceNew: boolean): Promise<DayPlan> {
  const dir = runPath(config.runDir, date);
  const kept = await highestAside(config.runDir, date);
  const here = (await exists(dir)) ? await whatIsIn(dir) : undefined;
  if (here === 'done' && !forceNew) {
    throw new RunRefused('date-done', `the run of ${date} is already done (${path.join(dir, 'run.json')} is there): run it again with --force-new, which keeps the old run beside the new one`);
  }
  const tried = kept + (here === undefined ? 0 : 1);
  if (tried >= config.maxAttemptsPerDay) {
    throw new RunRefused(
      'attempts',
      `the run of ${date} has already been tried ${tried} ${tried === 1 ? 'time' : 'times'} and maxAttemptsPerDay is ${config.maxAttemptsPerDay}: nothing was run. Raise maxAttemptsPerDay in a file of settings (--config) to allow another try`,
    );
  }
  const kind = here === 'failed' ? 'failed' : here === 'done' ? 'replaced' : 'old';
  return { attempt: tried + 1, moveAside: here === undefined ? async () => undefined : () => rename(dir, `${dir}.${kind}-${kept + 1}`) };
}

```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
 *
 * Before anything else the run takes the lock (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends),
 * and is refused when the lock is held, when the day already has a run (unless `forceNew`), or when the site has changes that are not committed where
 * the Desk writes. A refusal is a `RunRefused` error: nothing ran, so nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
```

**with:**
```ts
 *
 * Before anything else the run takes the lock (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends),
 * and is refused when the lock is held, when the day already has a run that did not fail (unless `forceNew`), when the day has had `maxAttemptsPerDay` tries
 * (see `planDay`), or when the site has changes that are not committed where the Desk writes. A refusal is a `RunRefused` error: nothing ran, nothing was
 * moved and nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  const release = await takeRunLock(config.runDir, startedAt, runId);
  try {
    await prepareFolder(dir, date, options.forceNew === true);
    try {
      await target.preflight();
```

**with:**
```ts
  const release = await takeRunLock(config.runDir, startedAt, runId);
  try {
    const day = await planDay(config, date, options.forceNew === true);
    try {
      await target.preflight();
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
      throw new RunRefused('target', describeError(error));
    }
    await mkdir(dir, { recursive: true });

```

**with:**
```ts
      throw new RunRefused('target', describeError(error));
    }
    await day.moveAside();
    await mkdir(dir, { recursive: true });

```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
      client: options.clientKind,
      sources: options.sourcesKind,
      attempt: 1,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
```

**with:**
```ts
      client: options.clientKind,
      sources: options.sourcesKind,
      attempt: day.attempt,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, commit, dry: target.dry, dir, files };
  } finally {
    await release();
```

**with:**
```ts
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, attempt: day.attempt, commit, dry: target.dry, dir, files };
  } finally {
    await release();
```

The command line prints the try, and the usage says the rule.

**In `desk/src/cli.ts`, replace:**
```ts
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run is refused unless --force-new is given.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

**with:**
```ts
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

**In `desk/src/cli.ts`, replace:**
```ts
    deps.out(`outcome: ${result.outcome}`);
    deps.out(`run: ${result.runId}`);
    deps.out(`folder: ${result.dir}`);
    if (result.slug !== null) deps.out(`piece: ${result.slug}`);
```

**with:**
```ts
    deps.out(`outcome: ${result.outcome}`);
    deps.out(`run: ${result.runId}`);
    deps.out(`attempt: ${result.attempt}`);
    deps.out(`folder: ${result.dir}`);
    if (result.slug !== null) deps.out(`piece: ${result.slug}`);
```

The README.

**In `README.md`, replace:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock, a day is run once unless `--force-new` says otherwise, and every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

```

**with:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

```

**In `README.md`, replace:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that already has a run is refused unless `--force-new` is given.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.
```

**with:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.
```

- [ ] **Step 5: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/config.test.ts test/run/orchestrate.test.ts test/cli.test.ts test/readme.test.ts`
Expected: PASS — `Test Files  4 passed (4)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Commit**

```bash
git add README.md desk/src/cli.ts desk/src/config.ts desk/src/run/lock.ts desk/src/run/orchestrate.ts desk/test/cli.test.ts desk/test/config.test.ts desk/test/readme.test.ts desk/test/run/orchestrate.test.ts
git commit -m "feat(desk): a day whose run failed is run again with no flag, up to maxAttemptsPerDay runs a day (3), the failed run is kept beside the new one as <date>.failed-<n>, a run that is run again with --force-new is kept as <date>.replaced-<n>, the run after the limit is refused with nothing run, and the record and the output say which try it was" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: No spending on a made-up world

**Files:**
- Create: `desk/src/run/spending.ts` (`refuseApiOnFixtures`), `desk/test/run/spending.test.ts`
- Modify: `desk/src/index.ts` (exports it), `desk/src/run/lock.ts` (new refusal kind `spending`), `desk/src/run/orchestrate.ts` (refuses before the lock), `desk/src/cli.ts` (refuses when it reads the arguments, and the usage says so), `desk/src/demo/world.ts` (a comment)
- Modify: `README.md`
- Test: `desk/test/cli.test.ts`, `desk/test/run/orchestrate.test.ts`, `desk/test/readme.test.ts`

The Anthropic API is paid for by the call. The made-up world (`--sources fixtures`: Fixture Robotics, pages on `.example` addresses) is fiction, so whatever a paid model says about it is worth nothing, and there is no case in which anyone wants it. Today `desk run --dry --client api --sources fixtures` is allowed, and so is `desk run --sources fixtures`, whose `--client` is `api` unless it says otherwise. This task refuses the pair, dry or not, in one function that every command asks: the command line when it reads its arguments, the orchestrator before it takes the lock, and the tuning command of a later part, which picks a client and pages in the same way.

`refuseApiOnFixtures(client, sources)` returns the sentence that says why the pair is refused and what to use instead, or `undefined` when it is allowed. Only the Anthropic API on the made-up world is refused: the scripted client (`fake`) and the recorded client cost nothing, and live sources are real pages. On the command line the refusal is a mistake in the arguments, exit code 2, printed with the usage like every other refusal of `parseArgs`, and it comes before every other check of the combination, so that it is the sentence that a person who typed `--sources fixtures` and left `--client` out reads. It is made before the key is read, so a key in the environment changes nothing. The orchestrator refuses with the new kind `spending`, so that a caller that does not go through the command line (the demo, a workflow, a test) cannot do it either.

- [ ] **Step 1: Write the tests**

The function, with every pair of a client and a world.

**Create `desk/test/run/spending.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { CLIENT_KINDS, SOURCES_KINDS } from '../../src/run/artifacts';
import { refuseApiOnFixtures } from '../../src/run/spending';

// The model of the Anthropic API costs money for every call, and the pages of the made-up world are fictional: a paid answer about them is worth nothing,
// and there is no case in which it is wanted. `refuseApiOnFixtures` is the one place that says so, for every command that picks a client and a world.

const MESSAGE =
  '--client api with --sources fixtures would spend money on the answers of a model about made-up pages, which are worth nothing: use --client fake for the scripted story or --client recorded with --cassettes, or use --sources live for real pages';

describe('refuseApiOnFixtures', () => {
  it('refuses the api client on the made-up world, and says why and what to use instead', () => {
    expect(refuseApiOnFixtures('api', 'fixtures')).toBe(MESSAGE);
  });

  it('refuses nothing else: every other pair of a client and a world is allowed', () => {
    const allowed = CLIENT_KINDS.flatMap((client) => SOURCES_KINDS.map((sources) => [client, sources] as const)).filter(([client, sources]) => !(client === 'api' && sources === 'fixtures'));
    expect(allowed).toHaveLength(5);
    for (const [client, sources] of allowed) expect(refuseApiOnFixtures(client, sources), `${client} on ${sources}`).toBeUndefined();
  });
});
```

The command line. The tests that used the made-up world with the api client by accident (one that read `--sources fixtures` and left the client to default) now say which client they mean, and the test of the missing key uses live sources, because the key is not read when the pair is refused.

**In `desk/test/cli.test.ts`, replace:**
```ts
import { defaultConfig } from '../src/config';
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
```

**with:**
```ts
import { defaultConfig } from '../src/config';
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { refuseApiOnFixtures } from '../src/run/spending';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(parsed('run', '--client', 'api')).toMatchObject({ client: 'api' });
    expect(parsed('run', '--client', 'recorded', '--cassettes', 'runs/x/cassettes')).toMatchObject({ client: 'recorded', cassettes: 'runs/x/cassettes' });
    expect(parsed('run', '--dry', '--sources', 'fixtures')).toMatchObject({ sources: 'fixtures' });
    expect(parsed('run', '--sources', 'live')).toMatchObject({ sources: 'live' });
  });
```

**with:**
```ts
    expect(parsed('run', '--client', 'api')).toMatchObject({ client: 'api' });
    expect(parsed('run', '--client', 'recorded', '--cassettes', 'runs/x/cassettes')).toMatchObject({ client: 'recorded', cassettes: 'runs/x/cassettes' });
    expect(parsed('run', '--dry', '--client', 'fake', '--sources', 'fixtures')).toMatchObject({ sources: 'fixtures' });
    expect(parsed('run', '--sources', 'live')).toMatchObject({ sources: 'live' });
  });
```

**In `desk/test/cli.test.ts`, replace:**
```ts
  it('refuses the scripted client and the made-up world unless the run is dry, because nothing in them may be published', () => {
    expect(refused('run', '--client', 'fake')).toBe('--client fake is a scripted story for dry runs: add --dry');
    expect(refused('run', '--sources', 'fixtures')).toContain('add --dry, because nothing in it may be published');
    expect(refused('run', '--client', 'fake', '--sources', 'fixtures')).toContain('--client fake');
  });

  it('refuses the recorded client without its cassettes, and cassettes for any other client', () => {
    expect(refused('run', '--client', 'recorded')).toBe('--client recorded needs --cassettes, the folder of the recorded replies');
```

**with:**
```ts
  it('refuses the scripted client and the made-up world unless the run is dry, because nothing in them may be published', () => {
    expect(refused('run', '--client', 'fake')).toBe('--client fake is a scripted story for dry runs: add --dry');
    expect(refused('run', '--client', 'recorded', '--cassettes', 'x', '--sources', 'fixtures')).toContain('add --dry, because nothing in it may be published');
    expect(refused('run', '--client', 'fake', '--sources', 'fixtures')).toContain('--client fake');
  });

  it('refuses the api client on the made-up world, dry or not, and whether the client is given or is the default, because it would spend money on made-up pages', () => {
    const message = refuseApiOnFixtures('api', 'fixtures') as string;
    expect(message).toContain('would spend money');
    for (const argv of [
      ['run', '--client', 'api', '--sources', 'fixtures'],
      ['run', '--dry', '--client', 'api', '--sources', 'fixtures'],
      ['run', '--sources', 'fixtures'],
      ['run', '--dry', '--sources', 'fixtures'],
    ]) {
      expect(refused(...argv), argv.join(' ')).toBe(message);
    }
  });

  it('still takes the api client on live sources, and every other client on the made-up world in a dry run', () => {
    expect(parsed('run', '--client', 'api', '--sources', 'live')).toMatchObject({ client: 'api', sources: 'live' });
    expect(parsed('run', '--dry', '--client', 'fake', '--sources', 'fixtures')).toMatchObject({ client: 'fake', sources: 'fixtures' });
    expect(parsed('run', '--dry', '--client', 'recorded', '--cassettes', 'x', '--sources', 'fixtures')).toMatchObject({ client: 'recorded', sources: 'fixtures' });
  });

  it('refuses the recorded client without its cassettes, and cassettes for any other client', () => {
    expect(refused('run', '--client', 'recorded')).toBe('--client recorded needs --cassettes, the folder of the recorded replies');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(USAGE).toContain('a day whose run failed is run');
    expect(USAGE).toContain('maxAttemptsPerDay');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**with:**
```ts
    expect(USAGE).toContain('a day whose run failed is run');
    expect(USAGE).toContain('maxAttemptsPerDay');
    expect(USAGE).toContain('--client api is refused with --sources fixtures');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
  });

  it('refuses --client api when there is no key in the environment it was given, exits with 2, and writes nothing', async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '   ' }]) {
      const { call, err, cwd, git } = setup({ env });
      expect(await call('run', '--dry', '--sources', 'fixtures', '--client', 'api')).toBe(2);
      expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
      expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
```

**with:**
```ts
  });

  it('refuses --client api on the made-up world with exit code 2 and the reason, before it reads the key or writes anything, even when there is a key', async () => {
    const { call, out, err, cwd, git } = setup({ env: { ANTHROPIC_API_KEY: 'a-key-for-the-test-only' } });
    for (const argv of [['run', '--dry', '--client', 'api', '--sources', 'fixtures'], ['run', '--dry', '--sources', 'fixtures'], ['run', '--client', 'api', '--sources', 'fixtures']]) {
      err.length = 0;
      expect(await call(...argv), argv.join(' ')).toBe(2);
      expect(err).toEqual([`desk: ${refuseApiOnFixtures('api', 'fixtures')}`, USAGE]);
    }
    expect(out).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
    expect(existsSync(path.join(cwd, 'evidence'))).toBe(false);
    expect(git.commits).toEqual([]);
  });

  it('refuses --client api when there is no key in the environment it was given, exits with 2, and writes nothing', async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '   ' }]) {
      const { call, err, cwd, git } = setup({ env });
      expect(await call('run', '--dry', '--client', 'api')).toBe(2);
      expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
      expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
```

The orchestrator.

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
```

**with:**
```ts
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { refuseApiOnFixtures } from '../../src/run/spending';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
});

describe('runDesk: the place it writes to', () => {
  it('refuses to start when the site has changes that are not committed, before any call to the model, and records nothing', async () => {
```

**with:**
```ts
});

describe('runDesk: money is not spent on a made-up world', () => {
  it('refuses the api client on the sources of the fixtures before it takes the lock, with nothing run, nothing written and no model called', async () => {
    const made = setup();
    const fake = demoClient();
    const error = await refusal(made.run({ clientKind: 'api', sourcesKind: 'fixtures', model: clientFromConfig(made.config, { kind: 'fake', fake }, {}) }));
    expect(error.kind).toBe('spending');
    expect(error.message).toBe(refuseApiOnFixtures('api', 'fixtures'));
    expect(fake.calls).toEqual([]);
    expect(existsSync(made.config.runDir)).toBe(false);
    expect(made.git.commits).toEqual([]);
  });

  it('runs the api client on live sources, and the scripted and the recorded client on the fixtures', async () => {
    for (const [client, sources] of [['api', 'live'], ['fake', 'fixtures'], ['recorded', 'fixtures']] as const) {
      expect((await setup().run({ clientKind: client, sourcesKind: sources })).outcome, `${client} on ${sources}`).toBe('published');
    }
  });
});

describe('runDesk: the place it writes to', () => {
  it('refuses to start when the site has changes that are not committed, before any call to the model, and records nothing', async () => {
```

The README.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: money is not spent on a made-up world', () => {
  it('says that --client api with --sources fixtures is refused, and why', () => {
    const command = section('The desk command');
    expect(command).toContain('`--client api` with `--sources fixtures` is refused with exit code 2');
    expect(command).toContain('it would spend money on the answers of a model about pages that are made up');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/spending.test.ts test/cli.test.ts test/run/orchestrate.test.ts test/readme.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/spending'`

- [ ] **Step 3: Write the function**

**Create `desk/src/run/spending.ts`:**
```ts
import type { ClientKind, SourcesKind } from './artifacts';

// What the Desk will not do with money. The model of the Anthropic API is paid for by the call, and the pages of the made-up world (`--sources fixtures`) are
// fictional: whatever a model said about them would be worth nothing, and there is no case in which it is wanted. So the pair is refused in one place, which every
// command that picks a client and a world asks (the command line when it reads its arguments, the orchestrator before it takes the lock, and the tuning command
// that comes later).

/**
 * Why the client `client` may not be used on the sources `sources`, as a sentence that names the two flags and says what to use instead; `undefined` when the
 * pair is allowed. Only the Anthropic API on the made-up world is refused. The scripted client and the recorded client cost nothing, and live sources are real pages.
 */
export function refuseApiOnFixtures(client: ClientKind, sources: SourcesKind): string | undefined {
  if (client !== 'api' || sources !== 'fixtures') return undefined;
  return '--client api with --sources fixtures would spend money on the answers of a model about made-up pages, which are worth nothing: use --client fake for the scripted story or --client recorded with --cassettes, or use --sources live for real pages';
}
```

It is exported with the rest of the package, and a refusal has a kind of its own.

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/target';
export * from './run/lock';
export * from './sources';
```

**with:**
```ts
export * from './run/target';
export * from './run/lock';
export * from './run/spending';
export * from './sources';
```

**In `desk/src/run/lock.ts`, replace:**
```ts
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: the lock is held, the lock is old, the day has been run, the day has used all its tries, or the place it writes to is not in order. */
export type RefusalKind = 'locked' | 'stale-lock' | 'date-done' | 'attempts' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
```

**with:**
```ts
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: it would spend money on a made-up world, the lock is held, the lock is old, the day has been run, the day has used all its tries, or the place it writes to is not in order. */
export type RefusalKind = 'spending' | 'locked' | 'stale-lock' | 'date-done' | 'attempts' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
```

- [ ] **Step 4: Use it**

The orchestrator asks first, before the lock, so that a refused run leaves no folder and no lock.

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, readRunRecord, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
```

**with:**
```ts
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, readRunRecord, recordRun, refuseApiOnFixtures, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
 * Run the Desk for one day.
 *
 * Before anything else the run takes the lock (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends),
 * and is refused when the lock is held, when the day already has a run that did not fail (unless `forceNew`), when the day has had `maxAttemptsPerDay` tries
 * (see `planDay`), or when the site has changes that are not committed where the Desk writes. A refusal is a `RunRefused` error: nothing ran, nothing was
 * moved and nothing is recorded.
```

**with:**
```ts
 * Run the Desk for one day.
 *
 * Before anything else the run is refused when it would spend money on a made-up world (`refuseApiOnFixtures`), then it takes the lock
 * (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends), and is refused when the lock is held, when the day already has a run that did not fail (unless `forceNew`), when the day has had `maxAttemptsPerDay` tries
 * (see `planDay`), or when the site has changes that are not committed where the Desk writes. A refusal is a `RunRefused` error: nothing ran, nothing was
 * moved and nothing is recorded.
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
export async function runDesk(options: RunDeskOptions): Promise<RunResult> {
  const { date, config, target } = options;
  const dir = runPath(config.runDir, date);
  const startedAt = options.now();
```

**with:**
```ts
export async function runDesk(options: RunDeskOptions): Promise<RunResult> {
  const { date, config, target } = options;
  const spending = refuseApiOnFixtures(options.clientKind, options.sourcesKind);
  if (spending !== undefined) throw new RunRefused('spending', spending);
  const dir = runPath(config.runDir, date);
  const startedAt = options.now();
```

The command line asks when it has read `--client`, `--sources` and `--dry`, and before it asks whether the scripted client or the made-up world is allowed without `--dry`.

**In `desk/src/cli.ts`, replace:**
```ts
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
```

**with:**
```ts
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, refuseApiOnFixtures, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
```

**with:**
```ts
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        --client api is refused with --sources fixtures, dry or not: it would spend money on made-up pages (use --client fake or --client recorded).',
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
```

**In `desk/src/cli.ts`, replace:**
```ts
 * Read the arguments (without the program and the script). A command, then its options in any order. A flag is given once, a valued option has
 * a value that does not start with `--`, and every value is checked; an option of another command, an unknown option, an argument the command does not take
 * and a missing one are refused, each with a message that names it. Two combinations are refused because they would put made-up content, or an unrecorded
 * model, where it does not belong: `--client fake` and `--sources fixtures` only with `--dry`, and `--client recorded` only with `--cassettes` (which is
 * for `recorded` alone when running).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
```

**with:**
```ts
 * Read the arguments (without the program and the script). A command, then its options in any order. A flag is given once, a valued option has
 * a value that does not start with `--`, and every value is checked; an option of another command, an unknown option, an argument the command does not take
 * and a missing one are refused, each with a message that names it. Some combinations are refused because they would spend money on made-up pages (`--client api`
 * with `--sources fixtures`, whether or not the run is dry, see `refuseApiOnFixtures`) or put made-up content, or an unrecorded model, where it does not belong:
 * `--client fake` and `--sources fixtures` only with `--dry`, and `--client recorded` only with `--cassettes` (which is for `recorded` alone when running).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
```

**In `desk/src/cli.ts`, replace:**
```ts
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
  const dry = given.has('--dry');
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
```

**with:**
```ts
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
  const dry = given.has('--dry');
  const spending = refuseApiOnFixtures(client as ClientKind, sources as SourcesKind);
  if (spending !== undefined) return fail(spending);
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
```

**In `desk/src/demo/world.ts`, replace:**
```ts

// The made-up world that the Desk can be shown in with no network: a few sources on `.example` addresses, whose pages are the files of
// `desk/test/fixtures/`. The tests of the pipeline run in it, and so does `desk run --sources fixtures` (a dry run: nothing in it is real, and
// nothing in it may ever be published). Every company, outlet and address in it is invented.

/** The day on which the made-up world is current: its feed items are dated the days before it. */
```

**with:**
```ts

// The made-up world that the Desk can be shown in with no network: a few sources on `.example` addresses, whose pages are the files of
// `desk/test/fixtures/`. The tests of the pipeline run in it, and so does `desk run --dry --client fake --sources fixtures` (a dry run: nothing in it is real, and
// nothing in it may ever be published, and no paid model is asked about it). Every company, outlet and address in it is invented.

/** The day on which the made-up world is current: its feed items are dated the days before it. */
```

The README.

**In `README.md`, replace:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.
```

**with:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. `--client api` with `--sources fixtures` is refused with exit code 2, dry or not: it would spend money on the answers of a model about pages that are made up, which are worth nothing (use `--client fake` for the scripted story, or `--sources live`). A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.
```

- [ ] **Step 5: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/run/spending.test.ts test/cli.test.ts test/run/orchestrate.test.ts test/readme.test.ts`
Expected: PASS — `Test Files  4 passed (4)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: See the refusal as a person sees it**

The command line is run as a program, with no key and no network. The refusal comes first, so none is needed, and nothing is written.

Run: `npm run desk -- run --dry --client api --sources fixtures`
Expected: FAIL — `desk: --client api with --sources fixtures would spend money on the answers of a model about made-up pages`

Run: `git status --short -- runs evidence`
Expected: PASS — prints nothing

- [ ] **Step 7: Commit**

```bash
git add README.md desk/src/cli.ts desk/src/demo/world.ts desk/src/index.ts desk/src/run/lock.ts desk/src/run/orchestrate.ts desk/src/run/spending.ts desk/test/cli.test.ts desk/test/readme.test.ts desk/test/run/orchestrate.test.ts desk/test/run/spending.test.ts
git commit -m "feat(desk): the api client is never used on the made-up world, dry or not: refuseApiOnFixtures says why, the command line refuses the pair with exit code 2 before it reads the key, and the orchestrator refuses it before it takes the lock" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A value says what its raw text says

**Files:**
- Modify: `desk/src/stages/claim-grounding.ts` (new `normalisedMismatch`, new problem code `value-normalised-mismatch`, one more check in `claimProblems`), `desk/src/run/artifacts.ts` (the reason code of a dropped claim is one of `CLAIM_PROBLEM_CODES`), `desk/src/prompts/extract.ts` (the rules for the fields of a value)
- Modify: `README.md`
- Test: `desk/test/stages/claim-grounding.test.ts`, `desk/test/stages/extract.test.ts`, `desk/test/run/artifacts.test.ts`, `desk/test/prompts/extract.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/readme.test.ts`

A claim that a model proposes lists values: `{ kind, raw, normalised, unit? }`. `raw` is the text as the quotation has it, and Extract already checks that it is there, as a whole token. `normalised` and `unit` are what the model says it means, and nothing has checked them against `raw`. The gate does not check them either: for a number it reads `raw` with its own reader (`parseNumberToken`, so `1.2k` and `1,200` meet), and uses the model's `normalised` and `unit` **only when `raw` is not a number token**, and number words are not (`twelve` is not a digit token). So a claim with `raw: "twelve"`, `normalised: "15"`, whose quotation says `twelve kg`, would license a sentence that says 15 kg. A reviewer found this by trying it. The same holds for a date whose `raw` the gate cannot read.

This task closes it where claims are made. Every value of a claim is held to its `raw` text by one function, `normalisedMismatch(value)`, which returns a sentence that says what is wrong, or `undefined`. The reader of the gate is used, not a copy of it:

| Kind | `raw` is read as | The claim must give |
|---|---|---|
| `number` | a digit token (`parseNumberToken`: `12`, `12 kg`, `1,200`, `1.2k`, `3 million`, `$38,000`, `3 percent`), or else number words (`readNumberWords`: `twelve`, `twenty-five thousand`, `twelve kilograms`) | `normalised` as the plain decimal string that the gate reads from it (`normalised` itself is read with `parseNumberToken`, as the gate does, so `1,200` is `1200`), and `unit` in its canonical spelling (`kilograms` is `kg`), which must be absent when `raw` has no unit. A bare `12` with `unit: "kg"` is refused: the gate would read the claim as `12` with no unit, and a sentence that says 12 kg could not cite it |
| `date` | a date token that the gate reads (`parseDateToken`) | `normalised` equal to its ISO form at the precision it is written: `YYYY-MM-DD` for a day, `YYYY-MM` for a month, `YYYY` for a year |
| `name` | any text | `normalised` equal to `raw` in lowercase with every run of white space made one space |

A `raw` text that the gate cannot read as a number or a date (a vague amount, `half`, a lone `one`, number words that are not a number, a date in another shape, `31 February 2026`) is **not compared**: it is not a figure to the gate either, and `value-not-in-quote` still says whether it is in the quotation. The README says so in its list of what the Desk does not check.

A claim with a value that is not consistent is **dropped**, with the new reason code `value-normalised-mismatch`. The check is made with the other checks of a claim whose quotation is on the page, after the reasons that a value is not in the quotation, and before the reasons of the text and the label; a claim whose quotation is not on the page has only that reason, as before. The reason codes were free text in the artifact `04-extract.json`; they are now one of `CLAIM_PROBLEM_CODES`, so a code that no check gives cannot be recorded, and the new one is recorded like the others. There is no other list of these codes in the code: the log prints counts only (`extract: 8 claims proposed, 7 kept, 1 dropped`).

The prompt says the rules, because a model that knows them wastes fewer claims: a number's `raw` carries its unit when the quotation does, `unit` is left out when `raw` has none (the unit of the words around it is not the unit of the figure), and each kind of `normalised` is spelled as the table says.

- [ ] **Step 1: Write the tests**

The function, with a table of values it accepts, a table of values it refuses and the sentence it says for each, a table of values it does not compare, and the length of what it shows. Then `claimProblems`: the probe of the review, a date, a name and a number in digits, the order of the reasons, and a claim whose quotation is not on the page. One existing test used a made-up `normalised` for a name (`x`) that the new rule refuses; it says what the name is.

**In `desk/test/stages/claim-grounding.test.ts`, replace:**
```ts
import { extractPage } from '../../src/fetch/extract-text';
import type { SourceKind } from '../../src/sources';
import { ALLOWED_BASES, CLAIM_PROBLEM_CODES, COMMON_WORDS, MAX_LABEL_WORDS, MAX_QUOTE_LENGTH, claimProblems, locateQuote } from '../../src/stages/claim-grounding';
import type { ClaimCandidate } from '../../src/stages/claim-grounding';
import { URLS } from '../support/context';
```

**with:**
```ts
import { extractPage } from '../../src/fetch/extract-text';
import type { SourceKind } from '../../src/sources';
import { ALLOWED_BASES, CLAIM_PROBLEM_CODES, COMMON_WORDS, MAX_LABEL_WORDS, MAX_QUOTE_LENGTH, claimProblems, locateQuote, normalisedMismatch } from '../../src/stages/claim-grounding';
import type { ClaimCandidate } from '../../src/stages/claim-grounding';
import { URLS } from '../support/context';
```

**In `desk/test/stages/claim-grounding.test.ts`, replace:**
```ts
});

describe('claimProblems: the values', () => {
  it('drops a claim that lists a number that the quotation does not contain', () => {
```

**with:**
```ts
});

describe('normalisedMismatch: what a value says about itself and what its raw text says', () => {
  const date = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
  const named = (raw: string, normalised: string): ClaimValue => ({ kind: 'name', raw, normalised });

  it.each([
    ['a plain number', number('12', '12')],
    ['a number with a unit written as the table has it', number('12 kg', '12', 'kg')],
    ['a unit that is another spelling of the canonical one, in the raw text and in the unit field', number('12 kilograms', '12', 'kilograms')],
    ['a number with a thousands comma, normalised as a plain decimal', number('1,200', '1200')],
    ['a number with a magnitude letter', number('1.2k', '1200')],
    ['a number with a magnitude word', number('3 million', '3000000')],
    ['a decimal', number('2.30', '2.3')],
    ['a sum of money, whose unit is its currency', number('$38,000', '38000', 'USD')],
    ['a sum of money with a magnitude', number('$1.5 billion', '1500000000', 'USD')],
    ['a percentage', number('3 percent', '3', '%')],
    ['a number in words', number('twelve', '12')],
    ['a number in words with a unit', number('twelve kilograms', '12', 'kg')],
    ['a number in words with a hyphen and a scale', number('twenty-five thousand', '25000')],
    ['a normalised form that has a comma, which the gate reads as the number it is', number('1200', '1,200')],
    ['a day', date('1 October 2026', '2026-10-01')],
    ['a day in the other order, and in ISO form', date('October 1, 2026', '2026-10-01')],
    ['a date that is an ISO date already', date('2026-10-01', '2026-10-01')],
    ['a month', date('October 2026', '2026-10')],
    ['a year', date('2027', '2027')],
    ['a name', named('Brindle Logistics', 'brindle logistics')],
    ['a name with a hyphen and a digit', named('FX-1', 'fx-1')],
    ['a name with a run of white space, folded to one space', named('Brindle  \n Logistics', 'brindle logistics')],
    ['a name with white space at its edges, which is no part of it', named(' Brindle Logistics\n', 'brindle logistics')],
  ] as [string, ClaimValue][])('finds nothing wrong with %s', (_what, value) => {
    expect(normalisedMismatch(value)).toBeUndefined();
  });

  it.each([
    ['the probe of the review: the raw text is twelve, the claim says 15', number('twelve', '15'), 'the number "twelve" reads as 12, but the claim gives 15'],
    ['a number in digits', number('12', '15'), 'the number "12" reads as 12, but the claim gives 15'],
    ['a number that is off by a power of ten', number('1.2k', '12000'), 'the number "1.2k" reads as 1200, but the claim gives 12000'],
    ['a number with a comma that is read as a decimal point', number('1,200', '1.2'), 'the number "1,200" reads as 1200, but the claim gives 1.2'],
    ['a number whose normalised form is not a number', number('12', 'twelve'), 'the number "12" reads as 12, but the claim gives twelve'],
    ['a number whose unit is another', number('12 kg', '12', 'g'), 'the number "12 kg" reads as 12 kg, but the claim gives 12 g'],
    ['a number whose unit is left out', number('12 kg', '12'), 'the number "12 kg" reads as 12 kg, but the claim gives 12'],
    ['a number that is given a unit that its raw text does not have', number('12', '12', 'kg'), 'the number "12" reads as 12, but the claim gives 12 kg'],
    ['a sum of money with another currency', number('$38,000', '38000', 'EUR'), 'the number "$38,000" reads as 38000 USD, but the claim gives 38000 EUR'],
    ['a number in words with a wrong unit', number('twelve kilograms', '12', 'lb'), 'the number "twelve kilograms" reads as 12 kg, but the claim gives 12 lb'],
    ['a day that is another day', date('1 October 2026', '2026-10-02'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02'],
    ['a day written as the day first, when the month is what the model wrote', date('1 October 2026', '2026-10'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10'],
    ['a month given with a day', date('October 2026', '2026-10-01'), 'the date "October 2026" reads as 2026-10, but the claim gives 2026-10-01'],
    ['a year given with a month', date('2027', '2027-01'), 'the date "2027" reads as 2027, but the claim gives 2027-01'],
    ['a date that is not in the ISO form', date('1 October 2026', '1 October 2026'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 1 October 2026'],
    ['a name that is not in lowercase', named('Brindle Logistics', 'Brindle Logistics'), 'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "Brindle Logistics"'],
    ['a name that is another name', named('Brindle Logistics', 'harlow logistics'), 'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "harlow logistics"'],
    ['a name with a run of white space left in', named('Brindle  Logistics', 'brindle  logistics'), 'the name "Brindle  Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "brindle  logistics"'],
  ] as [string, ClaimValue, string][])('says what is wrong with %s', (_what, value, message) => {
    expect(normalisedMismatch(value)).toBe(message);
  });

  it.each([
    ['a word that states an amount that has no value to compare', number('half', '0.5')],
    ['a lone one, which is a pronoun', number('one', '5')],
    ['number words that are not a number', number('five five', '7')],
    ['a phrase that is more than a number', number('about twelve kilograms', '15')],
    ['a name that has digits', number('FX-1', '3')],
    ['a date in a form that the gate does not read', date('last Tuesday', '2026-10-01')],
    ['a day that does not exist', date('31 February 2026', '2026-02-28')],
    ['a month with no year', date('October', '2026-10')],
  ] as [string, ClaimValue][])('compares nothing when the raw text is not a token that the gate reads: %s', (_what, value) => {
    expect(normalisedMismatch(value)).toBeUndefined();
  });

  it('shows at most 40 characters of a raw text and of a normalised form, with three dots when it cuts', () => {
    const long = `${'a'.repeat(50)} b`;
    expect(normalisedMismatch(named(long, 'x'))).toBe(`the name "${'a'.repeat(40)}..." in lowercase with single spaces is "${'a'.repeat(40)}...", but the claim gives "x"`);
    expect(normalisedMismatch(number('12', 'z'.repeat(41)))).toBe(`the number "12" reads as 12, but the claim gives ${'z'.repeat(40)}...`);
    expect(normalisedMismatch(named('b'.repeat(40), 'b'.repeat(40)))).toBeUndefined();
  });
});

describe('claimProblems: a value that says other than its raw text', () => {
  const page = 'Fixture Robotics says the arm lifts twelve kg. It ships on 1 October 2026 from Brindle Logistics.';
  const quote = (overrides: Partial<ClaimCandidate>): ClaimCandidate =>
    clean({ text: 'The arm lifts twelve kg.', label: 'lifts twelve kg', quote: 'the arm lifts twelve kg.', values: [number('twelve kg', '12', 'kg')], ...overrides });

  it('keeps a claim whose number in words says what its normalised form says', () => {
    expect(codesOf(quote({}), 'company-newsroom', page)).toEqual([]);
  });

  it('drops the probe of the review: twelve that is normalised as 15, which would let a sentence that says 15 kg cite a quotation that says twelve kg', () => {
    const problems = claimProblems(quote({ values: [number('twelve kg', '15', 'kg')] }), page, 'company-newsroom', ALLOW);
    expect(problems).toEqual([{ code: 'value-normalised-mismatch', message: 'the number "twelve kg" reads as 12 kg, but the claim gives 15 kg' }]);
  });

  it('drops a claim for a date, a name and a number in digits that say other than their raw text, once for each value', () => {
    const claim = clean({
      text: 'It ships on 1 October 2026 from Brindle Logistics.',
      label: 'ships on 1 October 2026',
      quote: 'It ships on 1 October 2026 from Brindle Logistics.',
      values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-02' }, name('Brindle Logistics'), { kind: 'name', raw: 'Brindle', normalised: 'Brindle' }, number('1', '2')],
    });
    expect(claimProblems(claim, page, 'company-newsroom', ALLOW)).toEqual([
      { code: 'value-normalised-mismatch', message: 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02' },
      { code: 'value-normalised-mismatch', message: 'the name "Brindle" in lowercase with single spaces is "brindle", but the claim gives "Brindle"' },
      { code: 'value-normalised-mismatch', message: 'the number "1" reads as 1, but the claim gives 2' },
    ]);
  });

  it('gives the reasons that a value is not in the quotation first and the reasons that it says other than its raw text next, then those of the text and the label', () => {
    const claim = quote({ text: 'Harlow lifts twelve kg.', label: 'Harlow lifts', values: [number('7', '8'), number('twelve kg', '15', 'kg'), name('Harlow')] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual(['value-not-in-quote', 'value-not-in-quote', 'value-normalised-mismatch', 'value-normalised-mismatch', 'text-not-in-quote', 'label-not-in-quote']);
  });

  it('does not make the check for a claim whose quotation is not on the page, which has nothing else checked either', () => {
    expect(codesOf(quote({ quote: 'not on the page', values: [number('twelve kg', '15', 'kg')] }), 'company-newsroom', page)).toEqual(['quote-not-found']);
  });
});

describe('claimProblems: the values', () => {
  it('drops a claim that lists a number that the quotation does not contain', () => {
```

**In `desk/test/stages/claim-grounding.test.ts`, replace:**
```ts
  it('reads a value the way the gate does: plain quotation marks, and one space for any white space', () => {
    const page = `Dana said ${String.fromCharCode(0x201c)}we went from pilot\nto production${String.fromCharCode(0x201d)}.`;
    const claim = clean({ text: 'Dana said it went from pilot to production.', label: 'pilot', quote: page, values: [name('Dana'), { kind: 'name', raw: '"we went from pilot to  production"', normalised: 'x' }] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });
```

**with:**
```ts
  it('reads a value the way the gate does: plain quotation marks, and one space for any white space', () => {
    const page = `Dana said ${String.fromCharCode(0x201c)}we went from pilot\nto production${String.fromCharCode(0x201d)}.`;
    const claim = clean({ text: 'Dana said it went from pilot to production.', label: 'pilot', quote: page, values: [name('Dana'), { kind: 'name', raw: '"we went from pilot to  production"', normalised: '"we went from pilot to production"' }] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });
```

**In `desk/test/stages/claim-grounding.test.ts`, replace:**
```ts

  it('knows exactly the codes it can give', () => {
    expect(CLAIM_PROBLEM_CODES).toEqual(['quote-not-found', 'quote-too-long', 'value-not-in-quote', 'text-not-in-quote', 'label-not-in-quote', 'label-too-long', 'basis-not-allowed', 'tier-basis']);
  });

```

**with:**
```ts

  it('knows exactly the codes it can give', () => {
    expect(CLAIM_PROBLEM_CODES).toEqual(['quote-not-found', 'quote-too-long', 'value-not-in-quote', 'value-normalised-mismatch', 'text-not-in-quote', 'label-not-in-quote', 'label-too-long', 'basis-not-allowed', 'tier-basis']);
  });

```

The stage. The probe of the review as the stage meets it: a page with `twelve kg` and a claim that lists it as 15 is dropped, the same claim with 12 is kept, and no claim of the record has a 15 that a sentence could cite. Also a wrong unit, a unit left out, each kind of value, a raw text that is not read, and the claims of the clean story.

**In `desk/test/stages/extract.test.ts`, replace:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GOLDEN_CLAIMS } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { ModelError } from '../../src/model/types';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { buildExtractUser, extractSystem } from '../../src/prompts/extract';
import { ExtractArtifact, readArtifact } from '../../src/run/artifacts';
import { CLAIM_PROBLEM_CODES } from '../../src/stages/claim-grounding';
import { EXTRACT_MAX_OUTPUT_TOKENS, extractReplySchema, kindOfSnapshot, runExtract } from '../../src/stages/extract';
import type { Snapshot } from '../../src/stages/fetch';
```

**with:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ClaimValue } from '@robywire/gate';
import { GOLDEN_CLAIMS } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { DEMO_CLAIMS } from '../../src/demo/story';
import { ModelError } from '../../src/model/types';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { buildExtractUser, extractSystem } from '../../src/prompts/extract';
import { ExtractArtifact, readArtifact } from '../../src/run/artifacts';
import { CLAIM_PROBLEM_CODES, normalisedMismatch } from '../../src/stages/claim-grounding';
import { EXTRACT_MAX_OUTPUT_TOKENS, extractReplySchema, kindOfSnapshot, runExtract } from '../../src/stages/extract';
import type { Snapshot } from '../../src/stages/fetch';
```

**In `desk/test/stages/extract.test.ts`, replace:**
```ts
});

describe('runExtract: too few claims is no story', () => {
  it('ends with no-story when fewer claims than minClaims are kept, and still writes the artifact, with the ones kept and the ones dropped', async () => {
```

**with:**
```ts
});

describe('runExtract: a value that says other than its raw text', () => {
  // The release page with one more sentence, which has a number in words: the case in which the gate trusts the normalised form of a value, because it cannot read the raw text as digits.
  const WITH_TWELVE: Snapshot = { ...RELEASE, text: `${RELEASE.text}\nThe arm lifts twelve kg.` };
  const lifts = (normalised: string, unit = 'kg') => ({
    text: 'The arm lifts twelve kg.',
    label: 'lifts twelve kg',
    type: 'spec',
    quote: 'The arm lifts twelve kg.',
    values: [{ kind: 'number', raw: 'twelve kg', normalised, unit }],
    basis: 'datasheet',
    status: 'unspecified',
    source: 1,
  });

  it('keeps the claim whose number in words says what its normalised form says', async () => {
    const { ctx } = setup([...CLEAN, lifts('12')]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped).toEqual([]);
    expect(result.artifact.claims[7]?.values).toEqual([{ kind: 'number', raw: 'twelve kg', normalised: '12', unit: 'kg' }]);
  });

  it('drops the probe of the review, a claim that lists twelve kg as 15 kg, so that no claim of the record has a 15 that a sentence could cite', async () => {
    const { ctx, logs } = setup([...CLEAN, lifts('15')]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped).toEqual([
      { index: 7, text: 'The arm lifts twelve kg.', reasons: [{ code: 'value-normalised-mismatch', message: 'the number "twelve kg" reads as 12 kg, but the claim gives 15 kg' }] },
    ]);
    expect(result.artifact.claims).toHaveLength(7);
    expect(result.artifact.claims.flatMap((claim) => claim.values).some((value) => value.normalised === '15')).toBe(false);
    expect(logs).toEqual(['extract: 8 claims proposed, 7 kept, 1 dropped']);
  });

  it('drops a claim for a unit that is not the unit of its raw text, and for a unit that is left out', async () => {
    const { ctx } = setup([...CLEAN, lifts('12', 'g'), { ...lifts('12'), values: [{ kind: 'number', raw: 'twelve kg', normalised: '12' }] }]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.message))).toEqual([
      ['the number "twelve kg" reads as 12 kg, but the claim gives 12 g'],
      ['the number "twelve kg" reads as 12 kg, but the claim gives 12'],
    ]);
  });

  it('drops a claim for a number in digits, a date and a name that say other than their raw text, with a reason for each claim and the code that names it', async () => {
    const number = proposed('c-4', { values: [{ kind: 'number', raw: '12', normalised: '15' }] });
    const date = proposed('c-2', { values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-02' }] });
    const named = proposed('c-1', { values: [{ kind: 'name', raw: 'Brindle Logistics', normalised: 'Brindle Logistics' }] });
    const { ctx } = setup([...CLEAN, number, date, named]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => [item.index, item.reasons.map((reason) => reason.code)])).toEqual([
      [7, ['value-normalised-mismatch']],
      [8, ['value-normalised-mismatch']],
      [9, ['value-normalised-mismatch']],
    ]);
    expect(result.artifact.dropped.map((item) => item.reasons[0]?.message)).toEqual([
      'the number "12" reads as 12, but the claim gives 15',
      'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02',
      'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "Brindle Logistics"',
    ]);
    expect(result.artifact.claims).toHaveLength(7);
  });

  it('does not compare a value whose raw text is not a number or a date that the gate reads: the claim is kept, as the gate treats such a value', async () => {
    const { ctx } = setup([...CLEAN.slice(0, 4), proposed('c-5', { values: [{ kind: 'number', raw: 'Tarnmoor', normalised: '99' }, { kind: 'date', raw: 'Tarnmoor', normalised: 'soon' }] }), CLEAN[5], CLEAN[6]]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped).toEqual([]);
    expect(result.artifact.claims).toHaveLength(7);
  });

  it('keeps every claim of the clean story: the values of its claims, and of the golden claims of the gate, all say what their raw texts say', () => {
    for (const claim of [...GOLDEN_CLAIMS, ...DEMO_CLAIMS]) {
      for (const value of claim.values) expect(normalisedMismatch(value as ClaimValue), `${claim.text} / ${value.raw}`).toBeUndefined();
    }
  });
});

describe('runExtract: too few claims is no story', () => {
  it('ends with no-story when fewer claims than minClaims are kept, and still writes the artifact, with the ones kept and the ones dropped', async () => {
```

The artifact: a reason is one of the codes.

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
import { CLIENT_KINDS, Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, LegacyRunRecord, RunRecord, SOURCES_KINDS, SelectArtifact, VerifyArtifact, candidateId, readArtifact, readJsonFile, readRunRecord, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { defaultConfig } from '../../src/config';
import { RUN_DATE, candidate } from '../support/candidates';
```

**with:**
```ts
import { CLIENT_KINDS, Candidate, ComposeArtifact, DiscoverArtifact, ExtractArtifact, FetchArtifact, GateReport, HeldArtifact, LegacyRunRecord, RunRecord, SOURCES_KINDS, SelectArtifact, VerifyArtifact, candidateId, readArtifact, readJsonFile, readRunRecord, runPath, writeArtifact, writeJsonFile } from '../../src/run/artifacts';
import { sha256Hex } from '../../src/model/types';
import { CLAIM_PROBLEM_CODES } from '../../src/stages/claim-grounding';
import { defaultConfig } from '../../src/config';
import { RUN_DATE, candidate } from '../support/candidates';
```

**In `desk/test/run/artifacts.test.ts`, replace:**
```ts
  });

  it('refuses a place in the reply that is not a whole number from 0', () => {
    for (const index of [-1, 0.5]) {
```

**with:**
```ts
  });

  it('accepts every reason that the checks of a claim can give, the new one included, and refuses a code that they cannot give', () => {
    for (const code of CLAIM_PROBLEM_CODES) {
      const artifact = extractArtifact();
      (artifact.dropped[0] as { reasons: unknown[] }).reasons = [{ code, message: 'a reason' }];
      expect(problem(ExtractArtifact, artifact), code).toBe('');
    }
    expect(CLAIM_PROBLEM_CODES).toContain('value-normalised-mismatch');
    const unknown = extractArtifact();
    (unknown.dropped[0] as { reasons: unknown[] }).reasons = [{ code: 'because-i-said-so', message: 'a reason' }];
    expect(problem(ExtractArtifact, unknown)).toContain('dropped.0.reasons.0.code:');
  });

  it('refuses a place in the reply that is not a whole number from 0', () => {
    for (const index of [-1, 0.5]) {
```

The prompt.

**In `desk/test/prompts/extract.test.ts`, replace:**
```ts
  });

  it('says that the text and the label may hold no number, date or capitalised word that the quote lacks, and no word that says how much', () => {
    expect(EXTRACT_INSTRUCTIONS).toContain('may contain only numbers, dates and capitalised words that appear in the quote');
```

**with:**
```ts
  });

  it('says how a value is written, because the Desk reads the raw text itself and drops a claim whose normalised form or unit says something else', () => {
    expect(EXTRACT_INSTRUCTIONS).toContain('"raw" (exactly as the quote writes it, a number with its unit if the quote gives one: "12 kg", "$38,000")');
    expect(EXTRACT_INSTRUCTIONS).toContain('and, for a number with a unit, "unit" (its short form: kg, m, %, USD)');
    expect(EXTRACT_INSTRUCTIONS).toContain('The Desk reads "raw" itself and drops the claim when "normalised" or "unit" says something else.');
    expect(EXTRACT_INSTRUCTIONS).toContain('A number: "normalised" is the plain decimal that "raw" means, with no comma and no magnitude word ("1,200" and "1.2k" are 1200, "3 million" is 3000000, "twelve" is 12)');
    expect(EXTRACT_INSTRUCTIONS).toContain('"unit" is the short unit that "raw" has ("12 kilograms" is kg, "$38,000" is USD, "3 percent" is %) and is left out when "raw" has none');
    expect(EXTRACT_INSTRUCTIONS).toContain('A date: "normalised" is YYYY-MM-DD for a day, YYYY-MM for a month and YYYY for a year, as "raw" gives it ("October 2026" is 2026-10).');
    expect(EXTRACT_INSTRUCTIONS).toContain('A name: "normalised" is "raw" in lowercase with single spaces.');
  });

  it('says that the text and the label may hold no number, date or capitalised word that the quote lacks, and no word that says how much', () => {
    expect(EXTRACT_INSTRUCTIONS).toContain('may contain only numbers, dates and capitalised words that appear in the quote');
```

The adversarial matrix has the scenario, from the page to the held piece: a page that says twelve kilograms, an extractor that lists it as 15 kg, and a composer that writes a sentence that says 15 kg and cites the claim. The claim is dropped by Extract, the sentence cites a claim that does not exist, and the gate holds the piece. The scenario is also added to the list of the kinds of hole that the matrix must cover.

**In `desk/test/adversarial.test.ts`, replace:**
```ts
const HIDDEN_QUOTE = { ...DEMO_CLAIMS[3], text: HIDDEN_SENTENCE, label: 'a guarantee', quote: HIDDEN_SENTENCE, values: [{ kind: 'number', raw: '2', normalised: '2' }] };

/** The release page of the made-up world with `extra` markup added to its article, and its fetcher; the text of the page is the same for a reader. */
const releasePage = (extra: string): string => fixtureText('pages/fixture-robotics-fx-1-second-plant.html').replace('<noscript>', `${extra}<noscript>`);
```

**with:**
```ts
const HIDDEN_QUOTE = { ...DEMO_CLAIMS[3], text: HIDDEN_SENTENCE, label: 'a guarantee', quote: HIDDEN_SENTENCE, values: [{ kind: 'number', raw: '2', normalised: '2' }] };

/**
 * A sentence of the release page that has a number in words, and a claim that lists it as another figure. The gate reads the raw text of a value before its normalised form,
 * but it cannot read number words as digits, so for a value like this one the normalised form is what licenses a sentence: the claim would let a sentence that says 15 kg
 * cite a quotation that says twelve kilograms.
 */
const LIFTS_SENTENCE = 'The arm lifts twelve kilograms.';
const WRONG_NORMALISED = { ...DEMO_CLAIMS[3], text: LIFTS_SENTENCE, label: 'lifts twelve kilograms', quote: LIFTS_SENTENCE, values: [{ kind: 'number', raw: 'twelve kilograms', normalised: '15', unit: 'kg' }] };

/** The release page of the made-up world with `extra` markup added to its article, and its fetcher; the text of the page is the same for a reader. */
const releasePage = (extra: string): string => fixtureText('pages/fixture-robotics-fx-1-second-plant.html').replace('<noscript>', `${extra}<noscript>`);
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
    },
  },
  {
    name: 'a section headed like the notes that the Desk writes itself',
```

**with:**
```ts
    },
  },
  {
    name: 'a number in words whose normalised form is another figure, which a sentence then states and cites',
    fetcher: worldWith({ [DEMO_URLS.release]: releasePage(`<p>${LIFTS_SENTENCE}</p>`) }),
    script: () => told({ claims: [...DEMO_CLAIMS, WRONG_NORMALISED], piece: reply((copy) => { copy.takeaways[3] = fact('The arm lifts 15 kg.', 'c-8'); }) }),
    gate: 'G3_UNKNOWN_CLAIM',
    reasons: ['G3_UNKNOWN_CLAIM', 'G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
    check: async ({ dir }) => {
      const extracted = await readArtifact(dir, '04-extract', ExtractArtifact);
      expect(extracted.claims).toHaveLength(7);
      expect(extracted.claims.flatMap((claim) => claim.values).some((value) => value.normalised === '15')).toBe(false);
      expect(extracted.dropped).toEqual([
        { index: 7, text: LIFTS_SENTENCE, reasons: [{ code: 'value-normalised-mismatch', message: 'the number "twelve kilograms" reads as 12 kg, but the claim gives 15 kg' }] },
      ]);
    },
  },
  {
    name: 'a section headed like the notes that the Desk writes itself',
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
  });

  it('covers every kind of hole that the review of Plan 2 found, one scenario at least for each', () => {
    const names = [...BAD, ...STOPPED].map((scenario) => scenario.name).join(' | ');
    for (const kind of ['part of a longer figure', 'lowercase invented name', 'label has a word', 'sentence that no reader sees', 'undated headline', 'redirects to', 'headed like the notes', 'asserts something and names no figure', 'orders the model to publish']) {
      expect(names, kind).toContain(kind);
    }
```

**with:**
```ts
  });

  it('covers every kind of hole that the reviews found, one scenario at least for each', () => {
    const names = [...BAD, ...STOPPED].map((scenario) => scenario.name).join(' | ');
    for (const kind of ['part of a longer figure', 'lowercase invented name', 'label has a word', 'sentence that no reader sees', 'undated headline', 'redirects to', 'headed like the notes', 'asserts something and names no figure', 'orders the model to publish', 'normalised form is another figure']) {
      expect(names, kind).toContain(kind);
    }
```

The README.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: the normalised form of a value', () => {
  it('says that Extract holds the normalised form of every value to its raw text, and which values are not compared', () => {
    expect(section('The desk workspace')).toContain("and holds every value's normalised form and unit to its raw text");
    expect(section('What the Desk does not check')).toContain('**Values that are not compared.**');
    expect(section('What the Desk does not check')).toContain('not compared with its normalised form');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/stages/claim-grounding.test.ts test/stages/extract.test.ts test/run/artifacts.test.ts test/prompts/extract.test.ts test/readme.test.ts test/adversarial.test.ts`
Expected: FAIL — `normalisedMismatch is not a function`

- [ ] **Step 3: Write the check**

The new code sits in the file of the other checks of a claim. `normalisedMismatch` is exported, so that the tests, and a later stage that needs the same rule, can use it. The imports of the gate's readers are the only new dependencies, and all are already exported by the gate.

**In `desk/src/stages/claim-grounding.ts`, replace:**
```ts
import { dateMatches, defaultConfig as defaultGateConfig, extractTokens, isSentenceStarter, normaliseQuotes, openingWordAccepted, sentenceWords, toNameToken, valueInQuote, wordSet } from '@robywire/gate';
import type { Basis, ClaimValue } from '@robywire/gate';
import type { SourceKind } from '../index';

```

**with:**
```ts
import {
  canonicalUnit,
  dateMatches,
  defaultConfig as defaultGateConfig,
  extractTokens,
  isSentenceStarter,
  normaliseQuotes,
  openingWordAccepted,
  parseDateToken,
  parseNumberToken,
  readNumberWords,
  sentenceWords,
  toNameToken,
  valueInQuote,
  wordSet,
} from '@robywire/gate';
import type { Basis, ClaimValue, ParsedNumber } from '@robywire/gate';
import type { SourceKind } from '../index';

```

**In `desk/src/stages/claim-grounding.ts`, replace:**
```ts
  'quote-too-long',
  'value-not-in-quote',
  'text-not-in-quote',
  'label-not-in-quote',
```

**with:**
```ts
  'quote-too-long',
  'value-not-in-quote',
  'value-normalised-mismatch',
  'text-not-in-quote',
  'label-not-in-quote',
```

**In `desk/src/stages/claim-grounding.ts`, replace:**
```ts
}

/** What goes wrong with the basis of a claim from this kind of page, or undefined when the basis fits. */
function basisProblem(basis: Basis, kind: SourceKind): ClaimProblem | undefined {
```

**with:**
```ts
}

/** A number as the gate reads it from a raw text: a digit token (`parseNumberToken`) or number words (`readNumberWords`), or null when the text is neither. */
function numberOfRaw(raw: string): ParsedNumber | null {
  const token = parseNumberToken(raw);
  if (token !== null) return token;
  const words = readNumberWords(raw);
  return words.kind === 'number' ? { value: words.value, ...(words.unit === undefined ? {} : { unit: words.unit }) } : null;
}

const figure = (value: string, unit: string | undefined): string => (unit === undefined ? value : `${value} ${unit}`);

/**
 * What a value says about itself that its raw text does not: a sentence, or `undefined` when its `normalised` form (and `unit`) say what the raw text says.
 * The gate reads the raw text of a number, and of a date, before it reads the model's `normalised` form, except when the raw text is number words, which it
 * cannot read as a digit token: then the `normalised` form is what licenses a sentence, so a claim that lists `twelve` as `15` would let a sentence that says
 * 15 kg cite a quotation that says twelve kg. This is the one place where the two are held to each other, for every kind of value.
 *
 * - A number: when the raw text is a digit token or number words, its value and unit are those that the gate reads from it (`numberOfRaw`), and the claim must
 *   give the same: `normalised` read as the gate reads it (so "1,200" is 1200), and `unit` in its canonical spelling, which is absent when the raw text has none.
 * - A date: when the raw text is a date that the gate reads, `normalised` is the ISO form of it at the precision it has: YYYY-MM-DD for a day, YYYY-MM for a month, YYYY for a year.
 * - A name: `normalised` is the raw text in lowercase with every run of white space made one space.
 *
 * A raw text that the gate cannot read as a number or a date (a vague amount, "half", a lone "one", a date in another shape) is not compared: it is not a
 * token that G4 reads either. The text of the sentence is shown in part, so that a long answer of a model cannot make a long message.
 */
export function normalisedMismatch(value: ClaimValue): string | undefined {
  const raw = excerpt(value.raw, 40);
  if (value.kind === 'number') {
    const read = numberOfRaw(value.raw);
    if (read === null) return undefined;
    const given = { value: parseNumberToken(value.normalised)?.value ?? value.normalised, unit: value.unit === undefined ? undefined : canonicalUnit(value.unit) };
    if (given.value === read.value && given.unit === read.unit) return undefined;
    return `the number "${raw}" reads as ${figure(read.value, read.unit)}, but the claim gives ${figure(excerpt(given.value, 40), given.unit)}`;
  }
  if (value.kind === 'date') {
    const read = parseDateToken(value.raw);
    if (read === null || value.normalised === read.iso) return undefined;
    return `the date "${raw}" reads as ${read.iso}, but the claim gives ${excerpt(value.normalised, 40)}`;
  }
  const lowercase = value.raw.replace(/\s+/gu, ' ').trim().toLowerCase();
  if (value.normalised === lowercase) return undefined;
  return `the name "${raw}" in lowercase with single spaces is "${excerpt(lowercase, 40)}", but the claim gives "${excerpt(value.normalised, 40)}"`;
}

/** What goes wrong with the basis of a claim from this kind of page, or undefined when the basis fits. */
function basisProblem(basis: Basis, kind: SourceKind): ClaimProblem | undefined {
```

**In `desk/src/stages/claim-grounding.ts`, replace:**
```ts
 *    While the quotation is not on the page the next three checks have nothing to read, so they are not made.
 * 2. Each value the claim lists is inside the quotation as a whole token, compared as the gate compares it (`valueInQuote`, G4_VALUE_NOT_IN_SPAN):
 *    a 2 is not in "12 weeks".
 * 3. The text, and then the label, say nothing that the quotation does not: no number, date, amount in words or capitalised word
 *    that is not in it (see `beyondQuote`). The text and the label are read by no check of the gate. And words: every word of the
```

**with:**
```ts
 *    While the quotation is not on the page the next three checks have nothing to read, so they are not made.
 * 2. Each value the claim lists is inside the quotation as a whole token, compared as the gate compares it (`valueInQuote`, G4_VALUE_NOT_IN_SPAN):
 *    a 2 is not in "12 weeks". Every such value is reported, and then every value whose `normalised` form or unit says other than its raw text (`normalisedMismatch`).
 * 3. The text, and then the label, say nothing that the quotation does not: no number, date, amount in words or capitalised word
 *    that is not in it (see `beyondQuote`). The text and the label are read by no check of the gate. And words: every word of the
```

**In `desk/src/stages/claim-grounding.ts`, replace:**
```ts
      }
    }
    const shown = (items: readonly string[]): string => items.map((item) => `"${excerpt(item, 40)}"`).join(', ');
    const inText = additional(beyondQuote(claim.text, passage, allowList), []);
```

**with:**
```ts
      }
    }
    for (const value of claim.values) {
      const mismatch = normalisedMismatch(value);
      if (mismatch !== undefined) problems.push({ code: 'value-normalised-mismatch', message: mismatch });
    }
    const shown = (items: readonly string[]): string => items.map((item) => `"${excerpt(item, 40)}"`).join(', ');
    const inText = additional(beyondQuote(claim.text, passage, allowList), []);
```

The artifact takes the code from the same list.

**In `desk/src/run/artifacts.ts`, replace:**
```ts
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
import { writeFileAtomic } from './atomic';

```

**with:**
```ts
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
import { CLAIM_PROBLEM_CODES } from '../stages/claim-grounding';
import { writeFileAtomic } from './atomic';

```

**In `desk/src/run/artifacts.ts`, replace:**
```ts
export type FetchArtifact = z.infer<typeof FetchArtifact>;

/** A claim that a model proposed and code dropped: its place in the reply of the model (counting from 0), what it said, and every reason. */
const DroppedClaim = z.strictObject({
  index: z.number().int().nonnegative(),
  text,
  reasons: z.array(z.strictObject({ code: text, message: text })).min(1),
});

```

**with:**
```ts
export type FetchArtifact = z.infer<typeof FetchArtifact>;

/** A claim that a model proposed and code dropped: its place in the reply of the model (counting from 0), what it said, and every reason, each with the code of a check that claims go through (`CLAIM_PROBLEM_CODES`). */
const DroppedClaim = z.strictObject({
  index: z.number().int().nonnegative(),
  text,
  reasons: z.array(z.strictObject({ code: z.enum(CLAIM_PROBLEM_CODES), message: text })).min(1),
});

```

The prompt.

**In `desk/src/prompts/extract.ts`, replace:**
```ts
  '- "type": number, date, name, spec, quote or event.',
  `- "quote": the passage of the source that the claim rests on, copied exactly as the source has it, at most ${MAX_QUOTE_LENGTH} characters.`,
  '- "values": the numbers, dates and names that the claim states. Each has "kind" (number, date or name), "raw" (exactly as the quote writes it), "normalised" (a number as a plain decimal, a date as YYYY-MM-DD, a name in lowercase) and, for a number with a unit, "unit".',
  '- "basis": what the figure rests on. For each source the message lists the bases you may use for claims from it.',
  '- "status": how far the thing has got, as the source says: demonstrated if it says it was shown, deployed if it says a customer uses it, planned if it says it will happen, otherwise unspecified.',
```

**with:**
```ts
  '- "type": number, date, name, spec, quote or event.',
  `- "quote": the passage of the source that the claim rests on, copied exactly as the source has it, at most ${MAX_QUOTE_LENGTH} characters.`,
  '- "values": the numbers, dates and names that the claim states. Each has "kind" (number, date or name), "raw" (exactly as the quote writes it, a number with its unit if the quote gives one: "12 kg", "$38,000"), "normalised" (see the rules below) and, for a number with a unit, "unit" (its short form: kg, m, %, USD).',
  '- "basis": what the figure rests on. For each source the message lists the bases you may use for claims from it.',
  '- "status": how far the thing has got, as the source says: demonstrated if it says it was shown, deployed if it says a customer uses it, planned if it says it will happen, otherwise unspecified.',
```

**In `desk/src/prompts/extract.ts`, replace:**
```ts
  `- Copy the quote exactly. Do not correct it, shorten it from the inside, reorder it, or join two passages. Choose the shortest passage that holds the claim; a passage of more than ${MAX_QUOTE_LENGTH} characters is dropped.`,
  '- Every "raw" of a value must appear in the quote.',
  '- The text and the label may contain only numbers, dates and capitalised words that appear in the quote. Do not write a name in the text that the quote does not contain, even if the page names it somewhere else: write "the arm", not "the FX-1", when the quote only says "the arm". Do not write words that say how much ("twice", "half", "doubled") unless the quote does. Month and weekday names are free.',
  `- Every word of the label must be a word of the quote (the same word and not another form of it: "weeks" is not "week"), or a plain word such as "the", "of", "to" or "per". The label has at most ${MAX_LABEL_WORDS} words.`,
```

**with:**
```ts
  `- Copy the quote exactly. Do not correct it, shorten it from the inside, reorder it, or join two passages. Choose the shortest passage that holds the claim; a passage of more than ${MAX_QUOTE_LENGTH} characters is dropped.`,
  '- Every "raw" of a value must appear in the quote.',
  '- The Desk reads "raw" itself and drops the claim when "normalised" or "unit" says something else. A number: "normalised" is the plain decimal that "raw" means, with no comma and no magnitude word ("1,200" and "1.2k" are 1200, "3 million" is 3000000, "twelve" is 12), and "unit" is the short unit that "raw" has ("12 kilograms" is kg, "$38,000" is USD, "3 percent" is %) and is left out when "raw" has none: never add the unit of the words around it. A date: "normalised" is YYYY-MM-DD for a day, YYYY-MM for a month and YYYY for a year, as "raw" gives it ("October 2026" is 2026-10). A name: "normalised" is "raw" in lowercase with single spaces. A "raw" that is not a number or a date that the Desk can read is not compared.',
  '- The text and the label may contain only numbers, dates and capitalised words that appear in the quote. Do not write a name in the text that the quote does not contain, even if the page names it somewhere else: write "the arm", not "the FX-1", when the quote only says "the arm". Do not write words that say how much ("twice", "half", "doubled") unless the quote does. Month and weekday names are free.',
  `- Every word of the label must be a word of the quote (the same word and not another form of it: "weeks" is not "week"), or a plain word such as "the", "of", "to" or "per". The label has at most ${MAX_LABEL_WORDS} words.`,
```

The README.

**In `README.md`, replace:**
```markdown
- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.
```

**with:**
```markdown
- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, and holds every value's normalised form and unit to its raw text, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.
```

**In `README.md`, replace:**
```markdown
- **Which addresses the fetcher goes to.** `HttpFetcher` looks a host up before the first request and before every hop of a redirect, and refuses (the error kind `address`) a name that has any address that is not public (loopback, private, link-local, the metadata service of a cloud, shared, documentation, multicast), a host written as a number, `localhost` and an address with a user name in it. The name is looked up by this check and again by the transport, so a name server that answers differently the second time (DNS rebinding) is not stopped; closing that needs the transport to connect to the address that was checked. `FixtureFetcher` serves files and is not checked.
- **Analysis sentences.** Up to a fifth of the sentences of a piece may be the Desk's own analysis, which the page labels Analysis. The gate reads them for where they stand, how many there are, how they begin and the numbers, dates and names they bring in (G7), and the model check (G10) is never asked about them: it judges fact sentences and headings. Nothing reads what else an analysis sentence says, so a wrong analysis can be published. The share cap is what limits the exposure; it does not remove it.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

**with:**
```markdown
- **Which addresses the fetcher goes to.** `HttpFetcher` looks a host up before the first request and before every hop of a redirect, and refuses (the error kind `address`) a name that has any address that is not public (loopback, private, link-local, the metadata service of a cloud, shared, documentation, multicast), a host written as a number, `localhost` and an address with a user name in it. The name is looked up by this check and again by the transport, so a name server that answers differently the second time (DNS rebinding) is not stopped; closing that needs the transport to connect to the address that was checked. `FixtureFetcher` serves files and is not checked.
- **Analysis sentences.** Up to a fifth of the sentences of a piece may be the Desk's own analysis, which the page labels Analysis. The gate reads them for where they stand, how many there are, how they begin and the numbers, dates and names they bring in (G7), and the model check (G10) is never asked about them: it judges fact sentences and headings. Nothing reads what else an analysis sentence says, so a wrong analysis can be published. The share cap is what limits the exposure; it does not remove it.
- **Values that are not compared.** Extract holds the `normalised` form and the `unit` of every value of a claim to its `raw` text, and drops the claim (the reason `value-normalised-mismatch`) when they say something else: a number is read as the gate reads it (digits or number words, with the unit table of the gate), a date as ISO at the precision it is written, a name as lowercase with single spaces. A value whose `raw` text is not a number token, number words or a date that the gate reads (a vague amount such as "half", a lone "one", a date in another shape) is not compared with its normalised form, because the gate does not read it as a figure either. The check is made on claims, which are all that Extract makes; the gate itself still takes the `normalised` form on trust for a number in words.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/stages/claim-grounding.test.ts test/stages/extract.test.ts test/run/artifacts.test.ts test/prompts/extract.test.ts test/readme.test.ts test/adversarial.test.ts`
Expected: PASS — `Test Files  6 passed (6)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: The clean story still goes through**

The made-up story has seven claims, with numbers, dates and names. All must still be extracted: the demo runs the whole pipeline and says so.

Run: `npm run desk:demo`
Expected: PASS — `extract: 7 claims proposed, 7 kept, 0 dropped` and `desk demo: ok: completed as published`

- [ ] **Step 6: Commit**

```bash
git add README.md desk/src/prompts/extract.ts desk/src/run/artifacts.ts desk/src/stages/claim-grounding.ts desk/test/adversarial.test.ts desk/test/prompts/extract.test.ts desk/test/readme.test.ts desk/test/run/artifacts.test.ts desk/test/stages/claim-grounding.test.ts desk/test/stages/extract.test.ts
git commit -m "feat(desk): Extract holds the normalised form and the unit of every value to its raw text: a number is read as the gate reads it, in digits or in words, a date as ISO at the precision it is written and a name as lowercase with single spaces, and a claim that says another is dropped with the reason value-normalised-mismatch, so a twelve that is normalised as 15 cannot license a sentence that says 15" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `desk status` says more

**Files:**
- Modify: `desk/src/cli.ts` (`statusCommand`, two helpers, the usage)
- Modify: `README.md`
- Test: `desk/test/cli.test.ts`, `desk/test/readme.test.ts`

`desk status` prints the last run and the number of holds, from the desk state. Now that a day can be tried again (Task 6) and a run can end in a correction or a retraction (a later part), the owner who looks at it needs three more things: which try of its day the last run was, and how many corrections and how many retractions the desk state holds. Nothing else about it changes, and the two lines that it printed before are printed as they were.

```text
last run: published at 2026-10-05T04:31:00.000Z (run 2026-10-05-043100, piece a-piece)     as before
last run day: 2026-10-05, attempt 2                                                       new
holds: 2                                                                                  as before
corrections: 1                                                                            new
retractions: 0                                                                            new
```

**Where the try comes from.** The desk state (`site/src/data/desk-state.json`) is public and the site reads it with the gate's `DeskState` schema; it holds the id of the last run, whose first ten characters are the day, but not which try of the day it was. Changing that schema would change the gate, the site, the Publish and Hold stages and every test that spells out `lastRun`, for a number that only the owner wants. The try is in the record of the run instead (`attempt` in `runs/<date>/run.json`, Task 5), and `status` reads it there. That folder is not in git, so it is only on the machine that made the run, and `status` says what it could not find, and never guesses:

| What `status` finds | The line says |
|---|---|
| a record whose run id is that of the last run, with an `attempt` | `last run day: 2026-10-05, attempt 2` |
| no `runs/<date>/run.json` | `last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json is not here)` |
| a record of another run (a later run of the day, a dry one for instance, has taken the folder) | `last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json is the record of the run 2026-10-05-050000)` |
| a record from before records said which try a run was | `last run day: 2026-10-05, attempt not known (its record is from before records said which try it was)` |
| a record that cannot be read | `last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json cannot be read)` |
| a run id that does not start with a day | `last run day: unknown` |
| no last run at all | `last run: none yet`, and no line for the day |

- [ ] **Step 1: Write the tests**

The tests that spelled out what `status` prints take the new lines. The new ones: the counts of corrections and retractions, the try for each try of a day that fails (a live run with no network fails at Discover, which makes a failed day), and each row of the table above. The README says what `status` prints, and a test keeps the sentence true.

**In `desk/test/cli.test.ts`, replace:**
```ts
    const { call, out } = withFile(FILE);
    expect(await call('status', '--config', 'desk.yml')).toBe(0);
    expect(out).toEqual(['last run: none yet', 'holds: 0']);
  });
});
```

**with:**
```ts
    const { call, out } = withFile(FILE);
    expect(await call('status', '--config', 'desk.yml')).toBe(0);
    expect(out).toEqual(['last run: none yet', 'holds: 0', 'corrections: 0', 'retractions: 0']);
  });
});
```

**In `desk/test/cli.test.ts`, replace:**
```ts

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
```

**with:**
```ts

describe('main: status', () => {
  const NONE = ['last run: none yet', 'holds: 0', 'corrections: 0', 'retractions: 0'];
  const LAST = { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'a-piece' };
  const correction = (kind: 'correction' | 'retraction') => ({ at: '2026-10-06T09:00:00.000Z', slug: 'a-piece', kind, note: 'A note.' });
  const stateOf = (cwd: string, state: unknown): void => writeFileSync(path.join(cwd, STATE), JSON.stringify(state));

  it('says that nothing has happened yet, and that there are no holds, corrections or retractions, for the desk state that the site starts with', async () => {
    const { call, out } = setup();
    expect(await call('status')).toBe(0);
    expect(out).toEqual(NONE);
  });

  it('says what the last run did, which piece it made when it made one, which day and try it was, and how many drafts are held', async () => {
    const { call, out, cwd } = setup();
    const hold = { at: '2026-10-04T04:31:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'] };
    stateOf(cwd, { lastRun: LAST, holds: [hold, hold], corrections: [] });
    expect(await call('status')).toBe(0);
    expect(out).toEqual([
      'last run: published at 2026-10-05T04:31:00.000Z (run 2026-10-05-043100, piece a-piece)',
      'last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json is not here)',
      'holds: 2',
      'corrections: 0',
      'retractions: 0',
    ]);
  });

  it('counts the corrections and the retractions of the desk state apart', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, { lastRun: null, holds: [], corrections: [correction('correction'), correction('retraction'), correction('correction'), correction('correction')] });
    expect(await call('status')).toBe(0);
    expect(out).toEqual(['last run: none yet', 'holds: 0', 'corrections: 3', 'retractions: 1']);
    out.length = 0;
    stateOf(cwd, { lastRun: null, holds: [], corrections: [correction('retraction'), correction('retraction')] });
    await call('status');
    expect(out.slice(2)).toEqual(['corrections: 0', 'retractions: 2']);
  });

  it('leaves out the piece for a run that made none', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, { lastRun: { at: '2026-10-05T04:31:00.000Z', outcome: 'no-story', runId: 'r', slug: null }, holds: [], corrections: [] });
    await call('status');
    expect(out[0]).toBe('last run: no-story at 2026-10-05T04:31:00.000Z (run r)');
  });

  it('says which try of its day the last run was, from the record of the run in the folder of the runs, for each try of a day that fails', async () => {
    const { call, out } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    for (const attempt of [1, 2]) {
      await call('run', '--date', '2026-10-05');
      out.length = 0;
      expect(await call('status')).toBe(0);
      expect(out[0]).toMatch(/^last run: failed at 2026-10-05T04:31:\d\d\.\d{3}Z \(run 2026-10-05-0431\d\d\)$/);
      expect(out[1]).toBe(`last run day: 2026-10-05, attempt ${attempt}`);
    }
  });

  it('does not say a try that it does not know: the record is of another run, is from before records said which try it was, cannot be read, or the run id does not start with a day', async () => {
    const { call, out, cwd } = setup();
    mkdirSync(path.join(cwd, 'runs', '2026-10-05'), { recursive: true });
    const record = path.join(cwd, 'runs', '2026-10-05', 'run.json');
    stateOf(cwd, { lastRun: LAST, holds: [], corrections: [] });
    await call(...DRY_DEMO);
    out.length = 0;
    const made = JSON.parse(readFileSync(record, 'utf8')) as Record<string, unknown>;
    writeFileSync(record, JSON.stringify({ ...made, runId: '2026-10-05-050000' }));
    await call('status');
    expect(out[1]).toBe('last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json is the record of the run 2026-10-05-050000)');
    out.length = 0;
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = { ...made, runId: LAST.runId } as Record<string, unknown>;
    writeFileSync(record, JSON.stringify(before));
    await call('status');
    expect(out[1]).toBe('last run day: 2026-10-05, attempt not known (its record is from before records said which try it was)');
    out.length = 0;
    writeFileSync(record, '{"runId": ');
    await call('status');
    expect(out[1]).toBe('last run day: 2026-10-05, attempt not known (runs/2026-10-05/run.json cannot be read)');
    out.length = 0;
    // A run id starts with a day that exists and a hyphen: anything else does not say a day.
    for (const runId of ['r', '2026-10-05', '2026-13-45-043100', 'abcdefghij-043100', '2026-10-5-0431']) {
      out.length = 0;
      stateOf(cwd, { lastRun: { ...LAST, runId }, holds: [], corrections: [] });
      await call('status');
      expect(out[1], runId).toBe('last run day: unknown');
    }
  });

  it('exits with 1 and says why when the desk state cannot be read', async () => {
    const { call, out, err, cwd } = setup();
```

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: what status says', () => {
  it('says what status prints: the last run with its day and try, the holds, the corrections and the retractions, and where the try comes from', () => {
    const command = section('The desk command');
    expect(command).toContain('`npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state.');
    expect(command).toContain('The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts test/readme.test.ts`
Expected: FAIL — `expected [ 'last run: none yet', 'holds: 0' ] to deeply equal`

- [ ] **Step 3: Write it**

`dayOfRun` takes the day from a run id, `describeAttempt` reads the record and says what it found, and `statusCommand` prints. The command reads the file of settings anyway, as it did to refuse a wrong one, and now uses `runDir` from it.

**In `desk/src/cli.ts`, replace:**
```ts
import path from 'node:path';
import { loadSources } from '@robywire/gate';
```

**with:**
```ts
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadSources } from '@robywire/gate';
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        contradicts it is refused. A run made with --client recorded has no replies of its own: replay it with --cassettes. A record from before records',
  '        said how a run was made needs --sources.',
  'status  print the last run and the number of holds, from the desk state.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
```

**with:**
```ts
  '        contradicts it is refused. A run made with --client recorded has no replies of its own: replay it with --cassettes. A record from before records',
  '        said how a run was made needs --sources.',
  'status  print the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions.',
  '        The desk state has all but the try, which is read from the record of the run in the folder of the runs, if it is there.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
```

**In `desk/src/cli.ts`, replace:**
```ts
}

async function statusCommand(args: Extract<Parsed, { command: 'status' }>, deps: CliDeps): Promise<number> {
  // Status reads the desk state alone and has no use for the settings, but a file of settings that is wrong is refused here as everywhere.
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
```

**with:**
```ts
}

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
  const day = runId.slice(0, 10);
  return runId.charAt(10) === '-' && isDay(day) ? day : undefined;
}

/**
 * Which try of its day the run `runId` was, as the words that say it: from `run.json` in the folder of its day, which is there only on the machine that made the run (the
 * desk state does not hold it). When the record is not there, is of another run (a later run of the day has taken the folder), is from before records said which try
 * a run was, or cannot be read, the words say that the try is not known, and why, and never guess.
 */
async function describeAttempt(config: DeskConfig, cwd: string, day: string, runId: string): Promise<string> {
  const file = path.join(config.runDir, day, 'run.json');
  const shown = path.relative(cwd, file).split(path.sep).join('/');
  if (!(await stat(file).then(() => true, () => false))) return `attempt not known (${shown} is not here)`;
  let record: StoredRunRecord;
  try {
    record = await readRunRecord(file);
  } catch {
    return `attempt not known (${shown} cannot be read)`;
  }
  if (record.runId !== runId) return `attempt not known (${shown} is the record of the run ${record.runId})`;
  if (record.attempt === undefined) return 'attempt not known (its record is from before records said which try it was)';
  return `attempt ${record.attempt}`;
}

async function statusCommand(args: Extract<Parsed, { command: 'status' }>, deps: CliDeps): Promise<number> {
  // Status reads the desk state, and the folder of the runs for the try of the last run, so a file of settings that is wrong is refused here as everywhere.
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
```

**In `desk/src/cli.ts`, replace:**
```ts
    const { lastRun } = state;
    deps.out(lastRun === null ? 'last run: none yet' : `last run: ${lastRun.outcome} at ${lastRun.at} (run ${lastRun.runId}${lastRun.slug === null ? '' : `, piece ${lastRun.slug}`})`);
    deps.out(`holds: ${state.holds.length}`);
    return 0;
  } catch (error) {
```

**with:**
```ts
    const { lastRun } = state;
    deps.out(lastRun === null ? 'last run: none yet' : `last run: ${lastRun.outcome} at ${lastRun.at} (run ${lastRun.runId}${lastRun.slug === null ? '' : `, piece ${lastRun.slug}`})`);
    if (lastRun !== null) {
      const day = dayOfRun(lastRun.runId);
      deps.out(day === undefined ? 'last run day: unknown' : `last run day: ${day}, ${await describeAttempt(settings.config, deps.cwd, day, lastRun.runId)}`);
    }
    deps.out(`holds: ${state.holds.length}`);
    deps.out(`corrections: ${state.corrections.filter((entry) => entry.kind === 'correction').length}`);
    deps.out(`retractions: ${state.corrections.filter((entry) => entry.kind === 'retraction').length}`);
    return 0;
  } catch (error) {
```

**In `README.md`, replace:**
```markdown
- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. `--client api` with `--sources fixtures` is refused with exit code 2, dry or not: it would spend money on the answers of a model about pages that are made up, which are worth nothing (use `--client fake` for the scripted story, or `--sources live`). A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.
```

**with:**
```markdown
- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. `--client api` with `--sources fixtures` is refused with exit code 2, dry or not: it would spend money on the answers of a model about pages that are made up, which are worth nothing (use `--client fake` for the scripted story, or `--sources live`). A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state. The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has: when the record is not there, or is of another run, status says that the try is not known and why.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts test/readme.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: See it as a person sees it**

Run: `npm run desk -- status`
Expected: PASS — `last run: none yet` and `holds: 0` and `corrections: 0` and `retractions: 0`

- [ ] **Step 6: Commit**

```bash
git add README.md desk/src/cli.ts desk/test/cli.test.ts desk/test/readme.test.ts
git commit -m "feat(desk): status prints the last run with its day and which try of the day it was (read from the record of the run, and said not to be known when the record is not there), the number of holds, and the number of corrections and of retractions in the desk state" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The states of a day, as a table that runs

**Files:**
- Create: `desk/test/run-states.test.ts`

Tasks 5 to 9 changed what `desk run` does with a day, and the rules are spread over six places: the record, the lock, the folder of the day, the limit, the arguments, the README. A person who has to decide what to type, or an agent that has to decide what a refusal means, needs them in one place. This task writes them once, as the table below, and then makes the table a test: every row is made with real runs in the made-up world (a model that fails, holds or finds no story where the row needs it), and the command that the owner types, `desk run --dry --client fake --sources fixtures`, is run in the same checkout and the same folder of runs. The test checks the exit code, the line that the command prints, the try that the new run is, which folders are in `runs/` afterwards, and, for a refusal, that nothing was printed but the reason and that no file of `runs/` changed. A dry run applies the same rules to the folder of the day as a run that is not dry, so the table holds for both.

**The rules, in order.** A new `desk run` for a day checks, in this order, and stops at the first that refuses:

1. The arguments (`--client api` with `--sources fixtures` is a mistake in the arguments, exit 2, nothing looked at).
2. The lock: `runs/.lock` is there, so another run may be going (exit 1; a lock more than a day old is reported as one that may never have been released, and is never removed by a run).
3. The folder of the day: a record that ended `published`, `held` or `no-story`, or a record that cannot be read, refuses the run unless `--force-new` is given (exit 1).
4. The number of tries: when the day has had `maxAttemptsPerDay` tries, `--force-new` or not (exit 1, nothing moved).
5. The place it writes to is in order (the checkout has no changes that are not committed where the Desk writes).
6. Only then is the folder of the day moved aside, as `<date>.failed-<n>` for a run that failed, `<date>.replaced-<n>` for a run that ended and is run again with `--force-new`, and `<date>.old-<n>` for a folder with no record, and the run starts in a new empty `runs/<date>/`. `n` is one more than the highest number of any kind that is kept, so nothing is written over, and the new run is the try `n` plus one.

**The table.** `<date>` is the day, `D` for short. "Folders" are the entries of `runs/` for the day after the command, the lock excepted.

| State of the day before the command | What `desk run` does | Exit | Folders | Try |
|---|---|---|---|---|
| Nothing has run on `D` | runs | 0, or 1 if the run fails | `D` | 1 |
| `D` published, was held, or had no story | refused: `the run of D is already done`, which says to run it again with `--force-new` | 1 | `D` | none |
| `D` failed once | runs, with no flag; the failed run is kept | 0 | `D`, `D.failed-1` | 2 |
| `D` failed twice | runs | 0 | `D`, `D.failed-1`, `D.failed-2` | 3 |
| `D` failed three times | refused: `the run of D has already been tried 3 times and maxAttemptsPerDay is 3: nothing was run`, which says to raise `maxAttemptsPerDay` in a file of settings | 1 | `D`, `D.failed-1`, `D.failed-2` | none |
| `D` published, was held or had no story, and `--force-new` is given | runs; the old run is kept | 0 | `D`, `D.replaced-1` | 2 |
| `D` failed once, and `--force-new` is given | runs, and keeps the old run as a failed one, as without the flag | 0 | `D`, `D.failed-1` | 2 |
| `D` has had three tries, and `--force-new` is given | refused as above: the limit holds for `--force-new` too | 1 | unchanged | none |
| The folder of `D` has artifacts and no `run.json` (a run that never ended) | runs; the old folder is kept and counts as a try | 0 | `D`, `D.old-1` | 2 |
| `run.json` of `D` cannot be read | refused like a day that ended; `--force-new` keeps it as `D.replaced-<n>` | 1 | `D` | none |
| `runs/.lock` is there | refused: `another run holds the lock` | 1 | unchanged | none |
| `runs/.lock` was taken more than a day ago | refused: the lock `was never released`, and says to delete the file if no run is going | 1 | unchanged | none |
| any day, with `--client api --sources fixtures` | refused as a mistake in the arguments: `would spend money` | 2 | no `runs/` folder is made | none |

A run that starts and then fails ends the day as `failed` (exit 1), which makes the next `desk run` the next try, until the limit.

**What the table does not say, and the next parts must.** The rules above read `runs/<date>/run.json`, which is in `.gitignore` and is only on the machine that made the run. A fresh checkout, such as each run of a scheduled workflow, has no `runs/` folder, so it does not see the day's earlier runs, and `desk run` there is always the first try of a day that has no record. What a fresh checkout does have is the desk state (`site/src/data/desk-state.json`), which is committed after every run that is not dry and whose `lastRun` holds the id of the last run (its first ten characters are the day) and how it ended. A workflow that must not run a day again when the day published, was held or had no story has to ask the desk state, and so does the limit of tries if it is to count across workflow runs. Nothing in this part does that; Tasks 5 to 9 make the rules hold wherever `runs/` is kept.

**The names that later parts use.** `RunRecord` (`client`, `sources`, `attempt`), `LegacyRunRecord`, `StoredRunRecord`, `readRunRecord(file)`, `CLIENT_KINDS`, `SOURCES_KINDS`, `ClientKind` and `SourcesKind` (all in `desk/src/run/artifacts.ts`); the options `clientKind` and `sourcesKind` of `runDesk` and the field `attempt` of its result; the setting `maxAttemptsPerDay`; the refusal kinds `spending` and `attempts` of `RunRefused`; `refuseApiOnFixtures(client, sources)` in `desk/src/run/spending.ts`, which returns the sentence that says why or `undefined`; `normalisedMismatch(value)` and the reason code `value-normalised-mismatch` in `desk/src/stages/claim-grounding.ts`.

- [ ] **Step 1: Write the test**

The states are made with the helpers that the tests of whole runs share (`setupRun`, `unentailed`, the made-up checkout), and the command is `main`, the function that the program calls, with a clock and a fake git. The last two tests are not rows: no run of the table touches the site or git, and the refusal of the arguments comes before the day is looked at.

**Create `desk/test/run-states.test.ts`:**
```ts
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli';
import type { CliDeps } from '../src/cli';
import { demoClient } from '../src/demo/story';
import { DEMO_DATE } from '../src/demo/world';
import { FakeClient } from '../src/model/fake';
import { clientFromConfig } from '../src/model/factory';
import { LOCK_FILE } from '../src/run/lock';
import type { Stages } from '../src/run/orchestrate';
import { useScratch } from './support/context';
import { START, clock, setupRun, unentailed } from './support/run';
import type { RunSetup } from './support/run';
import { filesBelow } from './support/site';

// The states that a day can be in when `desk run` is asked to run it, and what the command does in each, as a table. The README says the rules; this is the
// proof that the table in the plan is the behaviour. Every state is made by real runs in the made-up world (with a model that fails, holds or finds no story where
// the state needs it), and then the command that the owner types, `desk run --dry --client fake --sources fixtures`, is run in the same checkout and the same folder
// of runs. A dry run keeps the checkout as it is, and applies the same rules to the folder of the day as a run that is not dry does.

const scratch = useScratch();
const COMMAND = ['run', '--dry', '--client', 'fake', '--sources', 'fixtures'];

/** Stages in which the composer falls over, so that a run ends failed at Compose. */
const composeFails = (): Partial<Stages> => ({
  compose: async () => {
    throw new Error('the composer fell over');
  },
});

/** A day: the checkout and the folder of the runs that the states are made in, and the command run in them. */
function aDay(options: RunSetup = {}) {
  const made = setupRun(scratch, { dry: true, ...options });
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd: made.repoDir, now: clock(), git: made.git, config: made.config };
  /** Another run of the day, made with a model that tells the made-up story, until it is told otherwise. */
  const again = (overrides = {}) => made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake: demoClient() }, {}), now: clock(), ...overrides });
  const folders = (): string[] => readdirSync(made.config.runDir).filter((name) => name !== LOCK_FILE).sort();
  return { made, out, err, again, folders, command: (...extra: string[]) => main([...COMMAND, ...extra], deps) };
}
type Day = ReturnType<typeof aDay>;

const kept = (...names: string[]): string[] => [DEMO_DATE, ...names.map((name) => `${DEMO_DATE}.${name}`)];

/** A day whose run failed `times` times. */
async function failedDay(times: number): Promise<Day> {
  const day = aDay({ stages: composeFails() });
  await day.made.run();
  for (let again = 1; again < times; again++) await day.again();
  return day;
}

/** A day whose run ended `held`, or `no-story`, or `published`. */
async function endedDay(options: RunSetup): Promise<Day> {
  const day = aDay(options);
  await day.made.run();
  return day;
}

interface Row {
  state: string;
  /** Makes the day in this state. */
  make: () => Promise<Day>;
  /** The options after the command. */
  extra?: string[];
  /** The exit code of the command. */
  exit: number;
  /** What the command prints: a line of its output (when it ran) or of its error output (when it did not). */
  says: string;
  /** The folders of the runs after the command. */
  folders: string[];
  /** The try that the new run was, when it ran. */
  attempt?: number;
}

const ROWS: Row[] = [
  { state: 'nothing has run on the day', make: async () => aDay(), exit: 0, says: 'outcome: published', folders: kept(), attempt: 1 },
  { state: 'the day published', make: () => endedDay({}), exit: 1, says: `the run was refused: the run of ${DEMO_DATE} is already done`, folders: kept() },
  { state: 'the day was held', make: () => endedDay({ fake: unentailed() }), exit: 1, says: `the run was refused: the run of ${DEMO_DATE} is already done`, folders: kept() },
  { state: 'the day had no story', make: () => endedDay({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) }), exit: 1, says: `the run was refused: the run of ${DEMO_DATE} is already done`, folders: kept() },
  { state: 'the day failed once', make: () => failedDay(1), exit: 0, says: 'outcome: published', folders: kept('failed-1'), attempt: 2 },
  { state: 'the day failed twice', make: () => failedDay(2), exit: 0, says: 'outcome: published', folders: kept('failed-1', 'failed-2'), attempt: 3 },
  { state: 'the day failed three times', make: () => failedDay(3), exit: 1, says: `the run was refused: the run of ${DEMO_DATE} has already been tried 3 times and maxAttemptsPerDay is 3: nothing was run`, folders: kept('failed-1', 'failed-2') },
  { state: 'the day published and --force-new is given', make: () => endedDay({}), extra: ['--force-new'], exit: 0, says: 'outcome: published', folders: kept('replaced-1'), attempt: 2 },
  { state: 'the day was held and --force-new is given', make: () => endedDay({ fake: unentailed() }), extra: ['--force-new'], exit: 0, says: 'outcome: published', folders: kept('replaced-1'), attempt: 2 },
  { state: 'the day failed once and --force-new is given', make: () => failedDay(1), extra: ['--force-new'], exit: 0, says: 'outcome: published', folders: kept('failed-1'), attempt: 2 },
  { state: 'the day failed three times and --force-new is given', make: () => failedDay(3), extra: ['--force-new'], exit: 1, says: 'has already been tried 3 times and maxAttemptsPerDay is 3', folders: kept('failed-1', 'failed-2') },
  {
    state: 'the day was run again twice with --force-new, and --force-new is given again',
    make: async () => {
      const day = await endedDay({});
      const quiet = () => new FakeClient().script('select', { chosenId: null, reasons: ['none'] });
      await day.again({ forceNew: true, model: clientFromConfig(day.made.config, { kind: 'fake', fake: quiet() }, {}) });
      await day.again({ forceNew: true, model: clientFromConfig(day.made.config, { kind: 'fake', fake: quiet() }, {}) });
      return day;
    },
    extra: ['--force-new'],
    exit: 1,
    says: 'has already been tried 3 times and maxAttemptsPerDay is 3',
    folders: kept('replaced-1', 'replaced-2'),
  },
  {
    state: 'the folder of the day has artifacts and no record: a run that never ended',
    make: async () => {
      const day = aDay();
      mkdirSync(path.join(day.made.config.runDir, DEMO_DATE), { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, DEMO_DATE, '01-discover.json'), '{}');
      return day;
    },
    exit: 0,
    says: 'outcome: published',
    folders: kept('old-1'),
    attempt: 2,
  },
  {
    state: 'the record of the day cannot be read',
    make: async () => {
      const day = aDay();
      mkdirSync(path.join(day.made.config.runDir, DEMO_DATE), { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, DEMO_DATE, 'run.json'), '{"outcome": "failed"');
      return day;
    },
    exit: 1,
    says: `the run was refused: the run of ${DEMO_DATE} is already done`,
    folders: kept(),
  },
  {
    state: 'another run holds the lock',
    make: async () => {
      const day = aDay();
      mkdirSync(day.made.config.runDir, { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, LOCK_FILE), `${JSON.stringify({ pid: 1, runId: 'other', startedAt: START.toISOString() })}\n`);
      return day;
    },
    exit: 1,
    says: 'the run was refused: another run holds the lock',
    folders: [],
  },
  {
    state: 'a lock more than a day old is there',
    make: async () => {
      const day = aDay();
      mkdirSync(day.made.config.runDir, { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, LOCK_FILE), `${JSON.stringify({ pid: 1, runId: 'crashed', startedAt: '2026-10-03T04:31:00.000Z' })}\n`);
      return day;
    },
    exit: 1,
    says: 'was never released',
    folders: [],
  },
];

describe('the states of a day, and what `desk run` does in each', () => {
  it.each(ROWS)('$state', async (row) => {
    const day = await row.make();
    const { runDir } = day.made.config;
    const before = row.exit === 0 ? [] : filesBelow(runDir);
    expect(await day.command(...(row.extra ?? []))).toBe(row.exit);
    // What it says: the line of its output that tells the outcome when it ran, and the last line of its error output when it did not.
    expect((row.exit === 0 ? day.out : day.err).some((line) => line.includes(row.says)), row.says).toBe(true);
    if (row.attempt !== undefined) expect(day.out).toContain(`attempt: ${row.attempt}`);
    expect(day.folders()).toEqual(row.folders);
    if (row.exit !== 0) {
      // A run that is refused prints nothing but the reason, and changes nothing: not a file of the runs, and not the lock that refused it.
      expect(day.out).toEqual([]);
      expect(filesBelow(runDir)).toEqual(before);
    }
  });

  it('is not a way to publish the made-up story: the runs of the table are dry, and none touched the site or asked git for a commit', async () => {
    const day = await failedDay(2);
    expect(await day.command()).toBe(0);
    expect(day.made.git.commits).toEqual([]);
  });

  it('refuses the api client on the made-up world before it looks at the day: a mistake in the arguments, exit code 2, and no folder', async () => {
    const day = aDay();
    expect(await main(['run', '--dry', '--client', 'api', '--sources', 'fixtures'], { out: (line) => void day.out.push(line), err: (line) => void day.err.push(line), env: { ANTHROPIC_API_KEY: 'k' }, cwd: day.made.repoDir, now: clock(), git: day.made.git, config: day.made.config })).toBe(2);
    expect(day.err[0]).toContain('would spend money');
    expect(readdirSync(path.dirname(day.made.config.runDir)).includes('runs')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test**

This test describes what Tasks 5 to 9 built, so it passes the first time. Step 3 shows that it can fail.

Run: `npm test --workspace @robywire/desk -- test/run-states.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Show that it can fail**

The limit of tries is one comparison, in `planDay`. Make it one too many, and the rows that depend on it must fail.

Run: `node -e "const fs=require('fs');const f='desk/src/run/orchestrate.ts';const t=fs.readFileSync(f,'utf8');if(!t.includes('if (tried >= config.maxAttemptsPerDay) {'))throw new Error('not found');fs.writeFileSync(f,t.replace('if (tried >= config.maxAttemptsPerDay) {','if (tried > config.maxAttemptsPerDay) {'))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/run-states.test.ts`
Expected: FAIL — `the day failed three times` and `expected +0 to be 1`

Put it back.

Run: `git checkout -- desk/src/run/orchestrate.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

- [ ] **Step 4: Run the whole check, and the demo**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Run everything that the repository checks**

This part changed the Desk, the README and nothing in the site, so the builds and the audits are as they were; they run all the same, because `npm run verify` is the one command that says that the repository as a whole is in order.

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. The lines of the output that matter, in the order they appear, as they were when this part was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the repository after this task and change when a test is added:

```text
Result (101 files):
- 0 errors

Test Files  35 passed (35)
Tests  2221 passed (2221)
Test Files  6 passed (6)
Tests  253 passed (253)
Test Files  38 passed (38)
Tests  1271 passed (1271)
Test Files  62 passed (62)
Tests  2581 passed (2581)

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

- [ ] **Step 6: Commit**

```bash
git add desk/test/run-states.test.ts
git commit -m "test(desk): the states that a day can be in when desk run is asked to run it, as a table that real runs make and the command answers: nothing run, published, held, no story, failed once, twice and three times, run again with --force-new, never ended, a record that cannot be read, a lock, and the api client on the made-up world" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing
