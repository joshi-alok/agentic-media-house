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
