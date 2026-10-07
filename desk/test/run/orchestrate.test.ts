import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
import { EvidenceError, LocalEvidenceStore } from '../../src/run/evidence';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import { R2EvidenceStore } from '../../src/run/r2-evidence';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { refuseApiOnFixtures } from '../../src/run/spending';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
import { runFetch } from '../../src/stages/fetch';
import { FETCHED_AT, useScratch, withPages } from '../support/context';
import { EMPTY_CONTENT, SELECT, START, STATE, clock, contentOf, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE, filesBelow } from '../support/site';
import { watched } from '../support/store';
import { FAKE_R2, makeBucket } from '../support/bucket';

// One run of the Desk, from end to end. Most of these tests run the real stages in the made-up world with a scripted model, so that the whole
// pipeline is under test; a few put a stage of their own in the place of a stage, to make it throw. Every run is in new folders under the temporary
// directory, with a fake git, so that nothing of the real repository is touched.

const scratch = useScratch();
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
      client: 'fake',
      sources: 'fixtures',
      attempt: 1,
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
    // It remembers the piece and the address of the story that was chosen, so that the next run does not choose the story again while the hold is open.
    expect(state.holds).toEqual([{ at: START.toISOString(), categories: ['humanoids'], reasons: ['G10_NOT_ENTAILED'], slug: result.slug, sourceUrl: DEMO_URLS.mercerArticle }]);
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

  it('does not take the artifacts of an old run for the new one: the folder starts empty', async () => {
    const made = setup();
    await made.run();
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['none'] });
    await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), forceNew: true, now: clock() });
    expect(existsSync(path.join(made.dir, '06-verify.json'))).toBe(false);
  });

  it('starts again in a folder that has artifacts but no record, which is a run that never ended, moves that folder aside as old-1, and counts it as a try', async () => {
    const made = setup();
    mkdirSync(made.dir, { recursive: true });
    writeFileSync(path.join(made.dir, '01-discover.json'), '{}');
    const result = await made.run();
    expect([result.outcome, result.attempt]).toEqual(['published', 2]);
    expect(readFileSync(path.join(`${made.dir}.old-1`, '01-discover.json'), 'utf8')).toBe('{}');
  });

  it('refuses a date that is not a day, before it takes the lock', async () => {
    const made = setup();
    await expect(made.run({ date: '2026-02-30' })).rejects.toThrow('is not a date');
    expect(existsSync(path.join(made.config.runDir, LOCK_FILE))).toBe(false);
  });
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

describe('runDesk: the evidence store', () => {
  // A run puts the pages that it fetched in the evidence store, reads each back before it takes a word from it, and, for a piece that it publishes, keeps the snapshots that the piece cites
  // before the piece is written. A store that cannot do any of the three ends the run as failed, at the stage where it happened, with nothing published. These runs are given a store
  // that watches the folder, so that they say what was asked of it, and a store that fails when it is told to.
  const down = (what: string) => new EvidenceError('unreachable', `the evidence store could not be reached (${what}): connect ECONNREFUSED`);

  function watchedRun(options: RunSetup = {}) {
    const made = setup(options);
    const store = watched(new LocalEvidenceStore(made.config.evidenceDir));
    return { ...made, store, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ evidence: store, ...overrides }) };
  }
  const methods = (store: ReturnType<typeof watched>): string[] => store.calls.map((call) => call.method);

  it('puts both pages, reads both back, and keeps the snapshots that the piece cites, in that order, for a piece that it publishes', async () => {
    const made = watchedRun();
    const result = await made.run();
    expect(result.outcome).toBe('published');
    const ledger = JSON.parse(readFileSync(path.join(made.repoDir, sitePaths().ledgerFile(result.slug as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
    const fetched = made.store.calls.filter((call) => call.method === 'put').map((call) => call.hash);
    expect(fetched).toHaveLength(2);
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get', ...ledger.sources.map(() => 'keep')]);
    expect(made.store.calls.filter((call) => call.method === 'get').map((call) => call.hash)).toEqual(fetched);
    const kept = made.store.calls.filter((call) => call.method === 'keep').map((call) => call.hash);
    expect(kept).toEqual(ledger.sources.map((source) => source.snapshotHash));
    expect(kept.length).toBeGreaterThanOrEqual(1);
    for (const hash of kept) expect(fetched).toContain(hash);
    expect(existsSync(path.join(made.config.evidenceDir, 'published', `${kept[0]}.txt`))).toBe(true);
  });

  it('keeps the snapshots before the piece is committed, and reads them back before Extract is asked anything', async () => {
    const made = watchedRun();
    const seen: string[] = [];
    made.store.onCall = (call) => void seen.push(`${call.method} with ${made.git.commits.length} commits and ${made.fake.calls.map((request) => request.role).join(',')}`);
    await made.run();
    expect(seen.filter((line) => line.startsWith('keep'))).toEqual(seen.filter((line) => line.startsWith('keep')).map(() => 'keep with 0 commits and select,extract,compose,verify'));
    expect(seen.filter((line) => line.startsWith('get'))).toEqual(['get with 0 commits and select', 'get with 0 commits and select']);
  });

  it('says in the log of the run what it read back and what it kept', async () => {
    const made = watchedRun();
    await made.run();
    expect(made.logs).toContain('evidence: read back 2 snapshots from the evidence store, each as it was fetched');
    expect(made.logs.some((line) => /^publish: kept \d+ snapshots? that the piece cites$/.test(line))).toBe(true);
  });

  it('does not keep anything for a piece that is held: its snapshots stay as they were put', async () => {
    const made = watchedRun({ fake: unentailed() });
    expect((await made.run()).outcome).toBe('held');
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
    expect(existsSync(path.join(made.config.evidenceDir, 'published'))).toBe(false);
  });

  it('does not keep anything for a day with no story: not when Select chooses none, which asks the store nothing, and not when Extract keeps too few claims', async () => {
    const none = watchedRun({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) });
    expect((await none.run()).outcome).toBe('no-story');
    expect(none.store.calls).toEqual([]);
    const few = watchedRun({ config: { minClaims: 99 } });
    const result = await few.run();
    expect([result.outcome, result.stage]).toEqual(['no-story', 'extract']);
    expect(methods(few.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('does not keep anything for a run that fails after Fetch', async () => {
    const made = watchedRun({ stages: composeFails() });
    expect((await made.run()).outcome).toBe('failed');
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('puts and reads back in a dry run, so that the run can be replayed, and never keeps: nothing is published', async () => {
    const made = watchedRun({ dry: true });
    const result = await made.run();
    expect([result.outcome, result.dry]).toEqual(['published', true]);
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('ends failed at the stage fetch when the store cannot take the first page, with nothing asked of the model after Select and nothing published', async () => {
    const made = watchedRun();
    made.store.fail('put', down('PUT pending/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage, result.slug]).toEqual(['failed', 'fetch', null]);
    expect(result.reason).toBe('the evidence store could not be reached (PUT pending/abc): connect ECONNREFUSED');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(methods(made.store)).toEqual(['put']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect((await readDeskState(path.join(made.repoDir, STATE))).lastRun).toMatchObject({ outcome: 'failed', slug: null });
  });

  it('ends failed at the stage evidence when the store cannot give a page back, before Extract is asked anything', async () => {
    const made = watchedRun();
    made.store.fail('get', down('GET pending/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
    expect(result.reason).toBe('the evidence store could not be reached (GET pending/abc): connect ECONNREFUSED');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(methods(made.store)).toEqual(['put', 'put', 'get']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'failed', stage: 'evidence' });
  });

  it('ends failed at the stage evidence when the store gives back another text than the one that was fetched, even if it does not notice', async () => {
    const made = watchedRun();
    made.store.lie('the text of another page');
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
    expect(result.reason).toContain('is not the text that was fetched: the store gave back another text');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
  });

  it('ends failed at the stage publish when the store cannot keep a snapshot, and publishes nothing: no piece, no ledger, one commit that says that the run failed', async () => {
    const made = watchedRun();
    made.store.fail('keep', down('HEAD published/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage, result.slug]).toEqual(['failed', 'publish', null]);
    expect(result.reason).toBe('the snapshots that the piece cites could not be kept, so the piece is not published: the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED');
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(made.git.commits[0]?.message).toBe(`desk: the run of ${DEMO_DATE} failed`);
    const state = await readDeskState(path.join(made.repoDir, STATE));
    expect(state.lastRun).toMatchObject({ outcome: 'failed', slug: null });
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'failed', stage: 'publish', slug: null, commit: result.commit });
  });

  it('is tried again the next time, and publishes when the store is well: a day that failed because of the store is not lost', async () => {
    const made = watchedRun();
    made.store.fail('keep', down('HEAD published/abc'));
    expect((await made.run()).outcome).toBe('failed');
    const second = await again(made, { evidence: made.store });
    expect([second.outcome, second.attempt]).toEqual(['published', 2]);
    expect(contentOf(made.repoDir)).toHaveLength(4);
  });

  it('ends failed at the first call when the store is down all along, and asks it no more than it must', async () => {
    const made = watchedRun();
    made.store.fail('put', down('PUT pending/abc'), 100);
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'fetch']);
    expect(made.store.calls).toHaveLength(1);
  });

  describe('with a bucket', () => {
    // The same runs with the store of the bucket, over a bucket made of memory that checks the signature of every request.
    function bucketRun(options: RunSetup = {}) {
      const made = setup(options);
      const bucket = makeBucket(() => START);
      const store = new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START });
      return { ...made, bucket, store, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ evidence: store, ...overrides }) };
    }
    const keysOf = (bucket: ReturnType<typeof makeBucket>, prefix: string): string[] => [...bucket.objects.keys()].filter((key) => key.startsWith(prefix)).sort();

    it('keeps both pages in pending/ and the pages that the piece cites in published/, for a piece that is published', async () => {
      const made = bucketRun();
      const result = await made.run();
      expect(result.outcome).toBe('published');
      const ledger = JSON.parse(readFileSync(path.join(made.repoDir, sitePaths().ledgerFile(result.slug as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
      expect(keysOf(made.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(made.bucket, 'published/')).toEqual(ledger.sources.map((source) => `published/${source.snapshotHash}`).sort());
      expect(made.bucket.calls.every((call) => call.status === 200 || call.status === 404)).toBe(true);
      expect(existsSync(made.config.evidenceDir)).toBe(false);
    });

    it('keeps only what was put in pending/ for a piece that is held, and keeps nothing for a dry run', async () => {
      const held = bucketRun({ fake: unentailed() });
      expect((await held.run()).outcome).toBe('held');
      expect(keysOf(held.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(held.bucket, 'published/')).toEqual([]);
      const dry = bucketRun({ dry: true });
      expect((await dry.run()).outcome).toBe('published');
      expect(keysOf(dry.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(dry.bucket, 'published/')).toEqual([]);
    });

    it('ends failed at the stage fetch, naming the bucket as unreachable, when the bucket is down, and at the stage publish when it goes down after the pages were read back', async () => {
      const first = bucketRun();
      first.bucket.fail({ status: 503, body: '<Error><Code>ServiceUnavailable</Code></Error>' }, { method: 'PUT' });
      const result = await first.run();
      expect([result.outcome, result.stage]).toEqual(['failed', 'fetch']);
      expect(result.reason).toMatch(/^the evidence store answered PUT pending\/[0-9a-f]{64} with 503: <Error><Code>ServiceUnavailable<\/Code><\/Error>$/);
      const later = bucketRun();
      later.bucket.fail({ status: 503 }, { method: 'PUT', key: 'published/' });
      const kept = await later.run();
      expect([kept.outcome, kept.stage]).toEqual(['failed', 'publish']);
      expect(kept.reason).toContain('could not be kept, so the piece is not published: the evidence store answered PUT published/');
      expect(keysOf(later.bucket, 'published/')).toEqual([]);
      expect(contentOf(later.repoDir)).toEqual(EMPTY_CONTENT);
    });

    it('ends failed at the stage evidence when the bucket changes a page that was put: the text no longer matches its hash', async () => {
      const made = bucketRun({ stages: {} });
      const fetchThenChange: Stages['fetch'] = async (ctx, selected) => {
        const fetched = await runFetch(ctx, selected);
        for (const key of keysOf(made.bucket, 'pending/')) (made.bucket.objects.get(key) as { body: string }).body += ' ';
        return fetched;
      };
      const result = await made.run({ stages: { fetch: fetchThenChange } });
      expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
      expect(result.reason).toMatch(/^the evidence [0-9a-f]{64} has been changed: its text no longer matches its hash$/);
      expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    });
  });
});
