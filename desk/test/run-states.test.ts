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
