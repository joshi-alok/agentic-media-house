import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs, resultLines, skippedLines } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { refuseApiOnFixtures } from '../src/run/spending';
import { demoWorldMap } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
import { FakeForge } from '../src/run/forge';
import { FakeGit } from '../src/run/git';
import type { RunResult, Stages } from '../src/run/orchestrate';
import { MAX_REASON_LENGTH } from '../src/run/retract';
import { sitePaths } from '../src/run/target';
import { runVerify } from '../src/stages/verify';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { placePiece } from './support/pieces';
import { PUBLISHED_SLUG, publishedPiece } from './support/published';
import { FAKE_BUCKET, FAKE_ENDPOINT, FAKE_KEY_ID, FAKE_SECRET, makeBucket } from './support/bucket';
import { START, clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
import { fileReply, scriptedTransport } from './support/transport';

// The command line, called as a function: `main(argv, deps)` with a clock, an environment, a git and a place to print that the test hands in. Nothing
// is run as a program, nothing real is touched, and no command in these tests can reach a network or a model.

const scratch = useScratch();
const STATE = sitePaths().stateFile;
const DRY_DEMO = ['run', '--dry', '--client', 'fake', '--sources', 'fixtures'];

/** A transport that cannot reach anything, as a machine with no network. */
const offline: Transport = async (url) => {
  throw new FetchError('network', url, 'there is no network');
};

/** The user agent of the tests: it links to an address that is not a placeholder, which a live run requires, and no site is ever asked. */
const TEST_AGENT = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)';

/**
 * A repository in a new folder, a fake git for it, and everything that `main` is given and prints. Its sources.yml is the registry of the made-up world, whose
 * hosts are all on `.example` addresses, so no name of a real company is in a test or in what it prints. Its settings are the defaults with the folders below
 * the repository and a user agent that is not a placeholder; a test that wants the defaults as they are passes `config: undefined`.
 */
function setup(overrides: Partial<CliDeps> = {}) {
  const cwd = makeSite(scratch());
  writeFileSync(path.join(cwd, 'sources.yml'), DEMO_REGISTRY_YAML);
  const out: string[] = [];
  const err: string[] = [];
  const git = new FakeGit();
  const config = { ...defaultConfig(), runDir: path.join(cwd, 'runs'), evidenceDir: path.join(cwd, 'evidence'), userAgent: TEST_AGENT };
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git, transport: offline, lookup: publicLookup, config, ...overrides };
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
    expect(parsed('run')).toEqual({ command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, skipIfDone: false, cassettes: undefined, config: undefined });
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

  it('reads --skip-if-done, which takes no value, in any order with the other options, and is off unless it is given', () => {
    expect(parsed('run', '--skip-if-done')).toMatchObject({ skipIfDone: true, forceNew: false, dry: false });
    expect(parsed('run', '--dry', '--skip-if-done', '--config', 'desk.config.yml')).toMatchObject({ skipIfDone: true, dry: true, config: 'desk.config.yml' });
    expect(parsed('run', '--config', 'desk.config.yml', '--skip-if-done')).toMatchObject({ skipIfDone: true });
    expect(parsed('run', '--dry')).toMatchObject({ skipIfDone: false });
  });

  it('refuses --skip-if-done together with --force-new, which say opposite things about a day that is done, and --skip-if-done given twice', () => {
    expect(refused('run', '--skip-if-done', '--force-new')).toBe('--skip-if-done and --force-new contradict each other: the first leaves a day that is done alone and the second runs it again');
    expect(refused('run', '--force-new', '--skip-if-done')).toContain('contradict each other');
    expect(refused('run', '--skip-if-done', '--skip-if-done')).toBe('--skip-if-done is given twice');
  });

  it('does not give --skip-if-done to the other commands', () => {
    expect(refused('replay', 'runs/2026-10-05', '--skip-if-done')).toBe('unknown option --skip-if-done for replay');
    expect(refused('status', '--skip-if-done')).toBe('unknown option --skip-if-done for status');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--skip-if-done')).toBe('unknown option --skip-if-done for retract');
  });

  it('reads --client and --sources', () => {
    expect(parsed('run', '--dry', '--client', 'fake')).toMatchObject({ client: 'fake' });
    expect(parsed('run', '--client', 'api')).toMatchObject({ client: 'api' });
    expect(parsed('run', '--client', 'recorded', '--cassettes', 'runs/x/cassettes')).toMatchObject({ client: 'recorded', cassettes: 'runs/x/cassettes' });
    expect(parsed('run', '--dry', '--client', 'fake', '--sources', 'fixtures')).toMatchObject({ sources: 'fixtures' });
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
      skipIfDone: false,
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
    expect(refused('run', '--cassettes', 'x')).toContain('--cassettes is for --client recorded');
    expect(refused('run', '--dry', '--client', 'fake', '--cassettes', 'x')).toContain('--cassettes is for --client recorded');
  });
});

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
    expect(refused('replay', 'a', 'b')).toBe('replay takes one folder, but was given "a" and "b"');
    expect(refused('replay', 'a', '--dry')).toBe('unknown option --dry for replay');
    expect(refused('replay', 'a', '--date', '2026-10-05')).toBe('unknown option --date for replay');
    expect(refused('replay', 'a', '--sources', 'files')).toBe('--sources is fixtures or live, not "files"');
    expect(refused('replay', 'a', '--cassettes')).toBe('--cassettes needs a value');
  });

  it('reads status, which takes no argument and one option, --config', () => {
    expect(parsed('status')).toEqual({ command: 'status', config: undefined });
    expect(parsed('status', '--config', 'desk.yml')).toEqual({ command: 'status', config: 'desk.yml' });
    expect(refused('status', '--json')).toBe('unknown option --json for status');
    expect(refused('status', '--dry')).toBe('unknown option --dry for status');
    expect(refused('status', 'now')).toBe('status takes no arguments, but was given "now"');
    expect(refused('status', '--config')).toBe('--config needs a value');
    expect(refused('status', '--config', 'a', '--config', 'b')).toBe('--config is given twice');
  });

  it('reads --config, the path of a file of settings, for run and for replay', () => {
    expect(parsed('run', '--config', 'desk.yml')).toMatchObject({ command: 'run', config: 'desk.yml' });
    expect(parsed('run', '--dry', '--config', 'conf/desk.yml', '--sources', 'fixtures', '--client', 'fake')).toMatchObject({ config: 'conf/desk.yml' });
    expect(parsed('replay', 'runs/x', '--config', 'desk.yml')).toMatchObject({ command: 'replay', runDir: 'runs/x', config: 'desk.yml' });
    expect(refused('run', '--config')).toBe('--config needs a value');
    expect(refused('run', '--config', '--dry')).toBe('--config needs a value');
    expect(refused('replay', 'runs/x', '--config', 'a', '--config', 'b')).toBe('--config is given twice');
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
    expect(USAGE).toContain('desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>]');
    expect(USAGE).toContain('The record of the run says');
    expect(USAGE).toContain('a day whose run failed is run');
    expect(USAGE).toContain('maxAttemptsPerDay');
    expect(USAGE).toContain('--client api is refused with --sources fixtures');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]');
    expect(USAGE).toContain('A piece that is held is sent to the owner as a draft pull request when the run is not dry');
    expect(USAGE).toContain('if that fails the run ends failed at the stage hold');
    expect(USAGE).toContain('(the branch hold/<day>-<slug> is pushed with git and gh, and the');
    expect(USAGE).toContain('[--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]');
    expect(USAGE).toContain('--skip-if-done is for a schedule that starts the command more than once a day');
    expect(USAGE).toContain('"outcome: refused-already-done", exits 0 and runs nothing');
    expect(USAGE).toContain('Every other refusal is still an exit code 1, and it cannot be given with --force-new.');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract`, `push` and `pack-artifact` do not read them.
    expect(USAGE.split('\n').filter((line) => line.startsWith('  desk ') && !line.startsWith('  desk retract') && !line.startsWith('  desk push') && !line.startsWith('  desk pack-artifact')).every((line) => line.includes('[--config <path>]'))).toBe(true);
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

describe('main: --skip-if-done, a day that is done is left alone', () => {
  const DAY = '2026-10-05';
  const run = (outcome: string, runId = `${DAY}-043100`) => ({ at: `${DAY}T04:31:20.000Z`, outcome, runId, slug: outcome === 'published' ? 'a-piece' : null });
  const stateOf = (cwd: string, lastRun: unknown): void => writeFileSync(path.join(cwd, STATE), JSON.stringify({ lastRun, holds: [], corrections: [] }));
  const SKIPPED = (why: string): string[] => ['outcome: refused-already-done', `day: ${DAY}`, `reason: ${why}`, 'nothing was run: no model was asked, no page was fetched and nothing was written'];

  it.each(['published', 'held', 'no-story'])('says so, exits 0 and does nothing when the desk state says that the last run was of the day and ended %s, with no key and no bucket in the environment', async (outcome) => {
    const { call, out, err, cwd, git } = setup();
    stateOf(cwd, run(outcome));
    const before = filesBelow(cwd);
    // The client is the api, which needs a key, and the settings may ask for a bucket: neither is looked at for a day that is done.
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(0);
    expect(out).toEqual(SKIPPED(`the desk state says that the run ${DAY}-043100 ended ${outcome} at ${DAY}T04:31:20.000Z`));
    expect(err).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(git.commits).toEqual([]);
  });

  it('does not ask the evidence store or the model, even when the settings say r2 and there is no variable for it', async () => {
    const { call, out, cwd } = setup({ config: { ...defaultConfig(), runDir: 'runs', evidence: { kind: 'r2' }, userAgent: TEST_AGENT } });
    stateOf(cwd, run('published'));
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(0);
    expect(out[0]).toBe('outcome: refused-already-done');
  });

  it('takes the day from the clock when it is not told one, as a run does', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, run('published'));
    expect(await call('run', '--skip-if-done')).toBe(0);
    expect(out[0]).toBe('outcome: refused-already-done');
    expect(out[1]).toBe(`day: ${DAY}`);
  });

  it('runs the day when the last run of the desk state failed, or was of another day, or the state has no run at all', async () => {
    for (const lastRun of [run('failed'), run('published', '2026-10-04-043100'), null]) {
      const { call, out, cwd } = setup();
      stateOf(cwd, lastRun);
      expect(await call(...DRY_DEMO, '--skip-if-done'), JSON.stringify(lastRun)).toBe(0);
      expect(out).toContain('outcome: published');
      expect(out).not.toContain('outcome: refused-already-done');
      expect(existsSync(path.join(cwd, 'runs', DAY))).toBe(true);
    }
  });

  it('reads the run id and not the time of the record: a run id that does not start with a day is not a run of the day', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, run('published', 'r'));
    expect(await call(...DRY_DEMO, '--skip-if-done')).toBe(0);
    expect(out).toContain('outcome: published');
  });

  it('says so when the folder of the runs has a record of a run of the day that did not fail, which is what a dry run leaves, and writes nothing', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    const before = filesBelow(cwd);
    expect(await call(...DRY_DEMO, '--skip-if-done')).toBe(0);
    expect(out).toEqual(SKIPPED(`the run of ${DAY} is already done: runs/${DAY}/run.json is there`));
    expect(filesBelow(cwd)).toEqual(before);
  });

  it('runs a day that the folder of the runs says failed, as it does with no flag', async () => {
    const { call, out, cwd } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await call('run', '--date', DAY)).toBe(1);
    out.length = 0;
    // The record of the failed run is there, and the state says failed: the next try is made.
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(1);
    expect(out).toContain('outcome: failed');
    expect(out).toContain('attempt: 2');
    expect(existsSync(path.join(cwd, 'runs', `${DAY}.failed-1`))).toBe(true);
  });

  it('is not a way past a settings mistake: a placeholder user agent is refused first, with exit code 2, and so is a file of settings that cannot be read', async () => {
    const placeholder = setup({ config: undefined });
    stateOf(placeholder.cwd, run('published'));
    expect(await placeholder.call('run', '--date', DAY, '--skip-if-done')).toBe(2);
    expect(placeholder.err.join('\n')).toContain('placeholder address');
    expect(placeholder.out).toEqual([]);
    const missing = setup();
    stateOf(missing.cwd, run('published'));
    expect(await missing.call('run', '--date', DAY, '--skip-if-done', '--config', 'nope.yml')).toBe(2);
    expect(missing.err.join('\n')).toContain('cannot read the file');
  });

  it('leaves a desk state that cannot be read to the run, which says so', async () => {
    const { call, out, err, cwd } = setup();
    writeFileSync(path.join(cwd, STATE), '{ not json');
    expect(await call(...DRY_DEMO, '--skip-if-done')).not.toBe(0);
    expect(out).not.toContain('outcome: refused-already-done');
    expect([...out, ...err].join('\n')).toContain('desk-state.json');
  });
});

describe('skippedLines', () => {
  it('says the outcome, the day, why, and that nothing was run, one to a line', () => {
    expect(skippedLines('2026-10-05', 'the desk state says so')).toEqual([
      'outcome: refused-already-done',
      'day: 2026-10-05',
      'reason: the desk state says so',
      'nothing was run: no model was asked, no page was fetched and nothing was written',
    ]);
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

describe('main: --config, the file of settings', () => {
  const FILE = [
    'minClaims: 99',
    'runDir: out/runs',
    'evidenceDir: out/evidence',
    'userAgent: "AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)"',
    '',
  ].join('\n');

  /** The same settings with the least number of claims left as it is, so that the story of the made-up world is published. */
  const FILE_OK = FILE.replace('minClaims: 99\n', '');

  /** A repository that has the given file of settings, and the settings of the tests taken away, so that the file is all there is. */
  function withFile(yaml: string) {
    const made = setup({ config: undefined });
    writeFileSync(path.join(made.cwd, 'desk.yml'), yaml);
    return made;
  }

  it('takes the settings from the file, laid over the defaults: the folders and the least number of claims show it', async () => {
    const { call, out, cwd } = withFile(FILE);
    expect(await call(...DRY_DEMO, '--config', 'desk.yml')).toBe(0);
    // minClaims 99 is more than the seven claims of the story: the run ends with no story, at Extract, and says how many were needed.
    expect(out).toContain('outcome: no-story');
    expect(out).toContain('stage: extract');
    expect(out.find((line) => line.startsWith('reason:'))).toContain('at least 99 are needed');
    expect(existsSync(path.join(cwd, 'out', 'runs', DEMO_DATE, '04-extract.json'))).toBe(true);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('resolves a relative folder of the file against the folder it was started in, and an absolute one as it is', async () => {
    const { call, cwd, out } = withFile(FILE_OK);
    expect(await call(...DRY_DEMO, '--config', 'desk.yml')).toBe(0);
    expect(out).toContain('outcome: published');
    expect(existsSync(path.join(cwd, 'out', 'runs', DEMO_DATE, '06-verify.json'))).toBe(true);
    const elsewhere = setup({ config: undefined });
    writeFileSync(path.join(elsewhere.cwd, 'desk.yml'), `runDir: ${path.join(cwd, 'moved-runs')}\nevidenceDir: ${path.join(cwd, 'moved-evidence')}\n`);
    expect(await elsewhere.call(...DRY_DEMO, '--config', 'desk.yml')).toBe(0);
    expect(existsSync(path.join(cwd, 'moved-runs', DEMO_DATE))).toBe(true);
    expect(existsSync(path.join(elsewhere.cwd, 'runs'))).toBe(false);
  });

  it('takes a path that is relative to the folder it was started in, and one that is absolute', async () => {
    const { call, cwd, out } = withFile(FILE_OK);
    mkdirSync(path.join(cwd, 'conf'));
    writeFileSync(path.join(cwd, 'conf', 'desk.yml'), FILE_OK);
    expect(await call(...DRY_DEMO, '--config', 'conf/desk.yml')).toBe(0);
    expect(await call(...DRY_DEMO, '--config', path.join(cwd, 'desk.yml'), '--force-new')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
  });

  it('replays a run with the same file, which says where the pages of the run were kept', async () => {
    const { call, out, cwd } = withFile(FILE_OK);
    expect(await call(...DRY_DEMO, '--config', 'desk.yml')).toBe(0);
    expect(await call('replay', path.join('out', 'runs', DEMO_DATE), '--sources', 'fixtures', '--config', 'desk.yml')).toBe(0);
    expect(out).toContain('replay: equal');
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it.each([
    ['a file that is not there', 'missing.yml', 'cannot read the file (ENOENT)'],
    ['a setting that does not exist', 'bad.yml', 'recencyHour'],
    ['a value that is not allowed', 'worse.yml', 'shortlistMax'],
  ])('refuses %s with exit code 2, names the file and writes nothing', async (_what, name, fragment) => {
    const { call, err, out, cwd, git } = setup({ config: undefined });
    writeFileSync(path.join(cwd, 'bad.yml'), 'recencyHour: 3\n');
    writeFileSync(path.join(cwd, 'worse.yml'), 'shortlistMax: -1\n');
    const before = filesBelow(cwd);
    for (const argv of [[...DRY_DEMO, '--config', name], ['replay', 'runs/x', '--config', name], ['status', '--config', name]]) {
      err.length = 0;
      expect(await call(...argv), argv.join(' ')).toBe(2);
      expect(err[0], argv.join(' ')).toContain(`desk config ${path.join(cwd, name)}`);
      expect(err[0], argv.join(' ')).toContain(fragment);
    }
    expect(out).toEqual([]);
    expect(git.commits).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
  });

  it('lets status read a file of settings, which it has no use for but refuses when it is wrong', async () => {
    const { call, out } = withFile(FILE);
    expect(await call('status', '--config', 'desk.yml')).toBe(0);
    expect(out).toEqual(['last run: none yet', 'holds: 0', 'corrections: 0', 'retractions: 0']);
  });
});

describe('main: the evidence store', () => {
  // The setting evidence.kind of a file of settings says whether the snapshots of a run are kept in a folder or in a private bucket. The bucket is described by the environment
  // alone: these runs are given a made-up bucket (a function with the shape of fetch) and the made-up world as live sources, served by a made-up transport.
  const R2_FILE = ['evidence:', '  kind: r2', 'requestIntervalMs: 0', `userAgent: "${TEST_AGENT}"`, ''].join('\n');
  const R2_ENV = { R2_ENDPOINT: FAKE_ENDPOINT, R2_BUCKET: FAKE_BUCKET, R2_ACCESS_KEY_ID: FAKE_KEY_ID, R2_SECRET_ACCESS_KEY: FAKE_SECRET };

  /** The pages of the made-up world as live sites answer for them: the files of the fixtures, and no robots.txt. */
  const madeUpSites = () =>
    scriptedTransport({
      ...Object.fromEntries(Object.entries(demoWorldMap()).map(([url, file]) => [url, fileReply(file as string)])),
      ...Object.fromEntries(['fixture-robotics', 'mercer-wire', 'gantry-daily'].map((host) => [`https://${host}.example/robots.txt`, { status: 404, type: 'text/plain', body: '' }])),
    });

  /** A repository with a file of settings that asks for the bucket, and a made-up bucket. */
  function withBucket(overrides: Partial<CliDeps> = {}) {
    const bucket = makeBucket(() => START);
    const sites = madeUpSites();
    const made = setup({ config: undefined, env: R2_ENV, transport: sites.transport, evidenceTransport: bucket.transport, ...overrides });
    writeFileSync(path.join(made.cwd, 'desk.yml'), R2_FILE);
    return { ...made, bucket, sites };
  }

  it('is not chosen with a flag: --evidence is an option that run and replay do not have', () => {
    expect(refused('run', '--evidence', 'r2')).toBe('unknown option --evidence for run');
    expect(refused('replay', 'runs/x', '--evidence', 'local')).toBe('unknown option --evidence for replay');
    expect(USAGE).not.toContain('--evidence ');
  });

  it('says in the usage which store the settings choose, and where the bucket is described', () => {
    expect(USAGE).toContain('the setting evidence.kind of a file of settings (--config) chooses: local, a folder');
    expect(USAGE).toContain('R2_ENDPOINT, R2_BUCKET,');
    expect(USAGE).toContain('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY) and never from a file');
  });

  it('refuses a bucket that the environment does not describe, with exit code 2 and the names of the variables, and runs nothing and writes nothing', async () => {
    const { call, err, out, cwd, git, bucket } = withBucket({ env: { R2_BUCKET: FAKE_BUCKET } });
    const before = filesBelow(cwd);
    expect(await call('run', '--dry', '--client', 'fake', '--config', 'desk.yml')).toBe(2);
    expect(err).toEqual(['desk: the setting evidence.kind is r2, which needs R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the environment (they are not set, and a file of settings cannot have them)']);
    expect(out).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
    expect(git.commits).toEqual([]);
    expect(bucket.calls).toEqual([]);
  });

  it('refuses a bucket that the environment describes wrongly, and does not say what the value was', async () => {
    const { call, err } = withBucket({ env: { ...R2_ENV, R2_ENDPOINT: 'http://fake-account.r2.example', R2_SECRET_ACCESS_KEY: FAKE_SECRET } });
    expect(await call('run', '--dry', '--client', 'fake', '--config', 'desk.yml')).toBe(2);
    expect(err).toEqual(['desk: the setting evidence.kind is r2, and what the environment has for it cannot be used: the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com']);
  });

  it('refuses the made-up world for a bucket, for a run and for a replay, because nothing made up may be put in it', async () => {
    const { call, err, cwd, bucket } = withBucket();
    expect(await call(...DRY_DEMO, '--config', 'desk.yml')).toBe(2);
    expect(err[0]).toBe(
      'desk: --sources fixtures is a made-up world and is refused when the setting evidence.kind is r2: nothing made up may be put in the bucket, which a published piece cites its evidence from',
    );
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
    // A run of the made-up world, made with the folder, is not replayed from the bucket either.
    const folder = setup();
    expect(await folder.call(...DRY_DEMO)).toBe(0);
    writeFileSync(path.join(folder.cwd, 'desk.yml'), R2_FILE);
    folder.err.length = 0;
    expect(await folder.call('replay', path.join('runs', DEMO_DATE), '--config', 'desk.yml')).toBe(2);
    expect(folder.err[0]).toContain('is a made-up world and is refused when the setting evidence.kind is r2');
    expect(bucket.calls).toEqual([]);
  });

  it('keeps the pages that a published piece cites in published/, for a run that is not dry: the made-up story, replayed from the replies that a dry run recorded, over the made-up sites', async () => {
    const { call, out, err, cwd, bucket, git } = withBucket();
    expect(await call('run', '--dry', '--client', 'fake', '--date', DEMO_DATE, '--config', 'desk.yml')).toBe(0);
    mkdirSync(path.join(cwd, 'cassettes-kept'));
    for (const name of readdirSync(path.join(cwd, 'runs', DEMO_DATE, 'cassettes'))) copyFileSync(path.join(cwd, 'runs', DEMO_DATE, 'cassettes', name), path.join(cwd, 'cassettes-kept', name));
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/'))).toEqual([]);
    expect(await call('run', '--client', 'recorded', '--cassettes', 'cassettes-kept', '--date', DEMO_DATE, '--force-new', '--config', 'desk.yml')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
    expect(git.commits).toHaveLength(1);
    const ledger = JSON.parse(readFileSync(path.join(cwd, sitePaths().ledgerFile(out.find((line) => line.startsWith('piece: '))?.slice(7) as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/')).sort()).toEqual(ledger.sources.map((source) => `published/${source.snapshotHash}`).sort());
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('pending/'))).toHaveLength(2);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_SECRET);
  });

  it('keeps the pages of a run in the bucket that the environment describes, and not in the folder: two objects in pending/, nothing in published/ for a dry run, and no key anywhere that is printed', async () => {
    const { call, out, err, cwd, bucket, sites } = withBucket();
    expect(await call('run', '--dry', '--client', 'fake', '--date', DEMO_DATE, '--config', 'desk.yml')).toBe(0);
    expect(out).toContain('outcome: published');
    expect(sites.sent.length).toBeGreaterThan(0);
    const keys = [...bucket.objects.keys()].sort();
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => /^pending\/[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(existsSync(path.join(cwd, 'evidence'))).toBe(false);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_SECRET);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_KEY_ID);
  });
});

describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
  // links to agenticmediahouse.example, an address that does not exist, so a live run that has not been given a real one is refused before it asks a site.
  const PLACEHOLDER = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';

  it('refuses a live run with the default user agent, with exit code 2 and the way out, and writes nothing and asks nobody', async () => {
    const { call, err, out, cwd, git } = setup({ config: undefined, env: { ANTHROPIC_API_KEY: 'k' } });
    const before = filesBelow(cwd);
    expect(await call('run')).toBe(2);
    expect(out).toEqual([]);
    expect(err).toEqual([
      `desk: the user agent "${PLACEHOLDER}" links to agenticmediahouse.example, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
    ]);
    expect(git.commits).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('refuses it for a dry live run too, and for a user agent given in a file of settings', async () => {
    const { call, err, cwd } = setup({ config: undefined, env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await call('run', '--dry')).toBe(2);
    writeFileSync(path.join(cwd, 'desk.yml'), 'userAgent: "Desk/1 (+https://Desk.Example/method)"\n');
    expect(await call('run', '--config', 'desk.yml')).toBe(2);
    expect(err[1]).toContain('links to desk.example, which is a placeholder address');
  });

  it('does not refuse a user agent that links to another address, or a run that asks no site', async () => {
    const { call, out } = setup({ config: undefined, env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(out).toContain('outcome: published');
    const live = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await live.call('run', '--date', '2026-10-05')).toBe(1);
    expect(live.out).toContain('stage: discover');
  });

  it('does not refuse a replay, which asks no site', async () => {
    const { call, out } = setup({ config: undefined });
    await call(...DRY_DEMO);
    expect(await call('replay', path.join('runs', DEMO_DATE), '--sources', 'fixtures')).toBe(0);
    expect(out).toContain('replay: equal');
  });
});

describe('main: the other clients and sources', () => {
  it('refuses to run a story that is not dry with the scripted client or the made-up world, before anything is written', async () => {
    const { call, err, cwd } = setup();
    expect(await call('run', '--client', 'fake', '--sources', 'fixtures')).toBe(2);
    expect(err[0]).toContain('add --dry');
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
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

  it('fetches live sources through the transport and the lookup that it is given, and asks them for the hosts of the registry and for nobody else', async () => {
    const urls: string[] = [];
    const hosts: string[] = [];
    const transport: Transport = async (url) => {
      urls.push(url);
      throw new FetchError('network', url, 'there is no network');
    };
    const lookup = async (host: string) => {
      hosts.push(host);
      return ['1.2.3.4'];
    };
    const { call } = setup({ env: { ANTHROPIC_API_KEY: 'k' }, transport, lookup });
    expect(await call('run', '--date', '2026-10-05')).toBe(1);
    expect([...new Set(hosts)].sort()).toEqual(['fixture-robotics.example', 'gantry-daily.example', 'mercer-wire.example']);
    expect(urls.every((url) => url.endsWith('/robots.txt'))).toBe(true);
    expect(new Set(urls).size).toBe(3);
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

describe('resultLines', () => {
  const RESULT: RunResult = {
    outcome: 'held',
    runId: '2026-10-05-043100',
    stage: 'hold',
    reason: 'held for TIER2_ATTRIBUTION; draft pull request https://github.example/agentic-media-house/pull/7',
    slug: 'a-piece',
    attempt: 2,
    pullRequest: 'https://github.example/agentic-media-house/pull/7',
    commit: 'abc123',
    dry: false,
    dir: '/runs/2026-10-05',
    files: ['x'],
  };

  it('prints the outcome, the run, the try, the folder, the piece, the pull request, the reason and the commit, in that order, for a piece that is held and sent', () => {
    expect(resultLines(RESULT)).toEqual([
      'outcome: held',
      'run: 2026-10-05-043100',
      'attempt: 2',
      'folder: /runs/2026-10-05',
      'piece: a-piece',
      'pull request: https://github.example/agentic-media-house/pull/7',
      'reason: held for TIER2_ATTRIBUTION; draft pull request https://github.example/agentic-media-house/pull/7',
      'commit: abc123',
    ]);
  });

  it('has no line for what a run does not have: no piece, no pull request, no reason, no commit', () => {
    expect(resultLines({ ...RESULT, outcome: 'published', stage: 'publish', reason: null, pullRequest: null, commit: null })).toEqual(['outcome: published', 'run: 2026-10-05-043100', 'attempt: 2', 'folder: /runs/2026-10-05', 'piece: a-piece']);
  });

  it('says the stage for a run that ended with no piece, and what a dry run would have written', () => {
    expect(resultLines({ ...RESULT, outcome: 'no-story', stage: 'select', reason: 'nothing', slug: null, pullRequest: null, commit: null, dry: true, files: ['a', 'b'] })).toEqual([
      'outcome: no-story',
      'run: 2026-10-05-043100',
      'attempt: 2',
      'folder: /runs/2026-10-05',
      'reason: nothing',
      'stage: select',
      'dry run: nothing was written to the site or to git (2 files would have been)',
    ]);
    expect(resultLines({ ...RESULT, outcome: 'failed', stage: 'hold', reason: 'boom', slug: null, pullRequest: null, commit: 'abc' })).toContain('stage: hold');
  });
});

describe('desk run: a held piece that was sent to the owner', () => {
  it('gives the forge to the run, and prints where the pull request is', async () => {
    const forge = new FakeForge();
    let given: unknown;
    const stages: Partial<Stages> = {
      verify: async (...args) => ({ ...(await runVerify(...args)), outcome: 'hold' as const }),
      hold: async (_ctx, _target, _claims, verified, _run, forgeGiven) => {
        given = forgeGiven;
        return {
          slug: verified.draft.slug,
          file: '/runs/held.json',
          reasons: ['TIER2_ATTRIBUTION'],
          commit: null,
          files: [],
          pullRequest: { url: 'https://github.example/agentic-media-house/pull/7', number: 7, branch: 'hold/2026-10-05-x', commit: 'c'.repeat(40) },
          note: null,
        };
      },
    };
    const { call, out } = setup({ forge, stages });
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(given).toBe(forge);
    expect(out).toContain('outcome: held');
    expect(out).toContain('pull request: https://github.example/agentic-media-house/pull/7');
  });

  it('gives no forge to a run when there is none', async () => {
    let given: unknown = 'not called';
    const stages: Partial<Stages> = {
      verify: async (...args) => ({ ...(await runVerify(...args)), outcome: 'hold' as const }),
      hold: async (_ctx, _target, _claims, verified, _run, forgeGiven) => {
        given = forgeGiven;
        return { slug: verified.draft.slug, file: '/runs/held.json', reasons: ['TIER2_ATTRIBUTION'], commit: null, files: [], pullRequest: null, note: null };
      },
    };
    const { call, out } = setup({ stages });
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(given).toBeUndefined();
    expect(out.some((line) => line.startsWith('pull request:'))).toBe(false);
  });
});

describe('parseArgs: retract', () => {
  it('reads the slug, the reason and the kind, which is a correction unless it says retraction', () => {
    expect(parsed('retract', 'a-piece', '--reason', 'The payload was 38 kg.')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'The payload was 38 kg.', kind: 'correction', dry: false });
    expect(parsed('retract', 'a-piece', '--reason', 'Withdrawn.', '--kind', 'retraction', '--dry')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'Withdrawn.', kind: 'retraction', dry: true });
    expect(parsed('retract', '--dry', '--kind', 'correction', '--reason', 'x', 'a-piece')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'x', kind: 'correction', dry: true });
  });

  it('gives the reason as it was typed: the command that records it makes it one line', () => {
    expect(parsed('retract', 'a-piece', '--reason', '  two\nlines  ')).toMatchObject({ reason: '  two\nlines  ' });
  });

  it('refuses a mistake in the arguments, and says which', () => {
    expect(refused('retract')).toBe('retract needs the slug of a piece');
    expect(refused('retract', 'a', 'b', '--reason', 'x')).toBe('retract takes one slug, but was given "a" and "b"');
    expect(refused('retract', 'A Piece', '--reason', 'x')).toBe('"A Piece" is not a plain slug (lowercase letters and digits joined by single hyphens)');
    expect(refused('retract', '../x', '--reason', 'x')).toContain('is not a plain slug');
    expect(refused('retract', 'a-piece')).toBe('retract needs --reason <text>: why the piece is corrected or retracted');
    expect(refused('retract', 'a-piece', '--reason')).toBe('--reason needs a value');
    expect(refused('retract', 'a-piece', '--reason', '   ')).toBe('the reason is empty: say why the piece is corrected or retracted');
    expect(refused('retract', 'a-piece', '--reason', 'x'.repeat(MAX_REASON_LENGTH + 1))).toContain('the reason is 501 characters');
    expect(parsed('retract', 'a-piece', '--reason', 'x'.repeat(MAX_REASON_LENGTH))).toMatchObject({ command: 'retract' });
    expect(refused('retract', 'a-piece', '--reason', 'a\u0007b')).toBe('the reason has a control character in it');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--kind', 'deletion')).toBe('--kind is correction or retraction, not "deletion"');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--dry', '--dry')).toBe('--dry is given twice');
  });

  it('has the options of retract and no others', () => {
    for (const option of ['--config', '--client', '--sources', '--date', '--force-new', '--cassettes']) expect(refused('retract', 'a-piece', '--reason', 'x', option, 'y'), option).toBe(`unknown option ${option} for retract`);
    expect(refused('run', '--reason', 'x')).toBe('unknown option --reason for run');
    expect(refused('status', '--kind', 'correction')).toBe('unknown option --kind for status');
  });
});

describe('main: retract', () => {
  /** The checkout of the site with the golden piece published in it, and what a person types to correct it. */
  function withPiece() {
    const made = setup();
    placePiece(made.cwd, publishedPiece());
    return { ...made, correct: (...more: string[]) => made.call('retract', PUBLISHED_SLUG, '--reason', 'The payload is 38 kg, not 83 kg.', ...more) };
  }

  it('records the correction, sets updatedAt of the piece and commits the two files, and says so', async () => {
    const { correct, out, err, git, cwd } = withPiece();
    expect(await correct()).toBe(0);
    expect(err).toEqual([]);
    const at = '2026-10-05T04:31:00.000Z';
    expect(out).toEqual([`piece: ${PUBLISHED_SLUG}`, 'kind: correction', `recorded: ${at}`, 'updatedAt: 2026-10-05', `commit: ${git.commits[0]?.id}`]);
    expect(git.commits).toEqual([{ id: git.commits[0]?.id, paths: [sitePaths().newsFile(PUBLISHED_SLUG), STATE], message: `desk: correct ${PUBLISHED_SLUG}` }]);
    expect(readFileSync(path.join(cwd, sitePaths().newsFile(PUBLISHED_SLUG)), 'utf8')).toBe(publishedPiece('2026-10-05').mdx);
    expect(JSON.parse(readFileSync(path.join(cwd, STATE), 'utf8')).corrections).toEqual([{ at, slug: PUBLISHED_SLUG, kind: 'correction', note: 'The payload is 38 kg, not 83 kg.' }]);
  });

  it('makes a retraction when it is asked to', async () => {
    const { correct, git, out } = withPiece();
    expect(await correct('--kind', 'retraction')).toBe(0);
    expect(out[1]).toBe('kind: retraction');
    expect(git.commits[0]?.message).toBe(`desk: retract ${PUBLISHED_SLUG}`);
  });

  it('with --dry says what it would do and writes and commits nothing', async () => {
    const { correct, out, git, cwd } = withPiece();
    expect(await correct('--dry')).toBe(0);
    expect(out.at(-1)).toBe(`dry run: nothing was written or committed (${sitePaths().newsFile(PUBLISHED_SLUG)}, ${STATE} would have been)`);
    expect(git.commits).toEqual([]);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });

  it('exits 1 and says why when the correction is refused: a piece that is not on the site, a file with a change that is not committed', async () => {
    const { call, err, git } = withPiece();
    expect(await call('retract', 'no-such-piece', '--reason', 'x')).toBe(1);
    expect(err).toEqual(['the correction was refused: there is no piece "no-such-piece" in site/src/content/news. A piece that was held is on its pull request until the owner merges it, and cannot be corrected before it is published']);
    git.dirty.add(STATE);
    err.length = 0;
    expect(await call('retract', PUBLISHED_SLUG, '--reason', 'x')).toBe(1);
    expect(err[0]).toContain('the correction was refused: the files that this changes have changes that are not committed');
    expect(git.commits).toEqual([]);
  });

  it('exits 1 and puts the files back when git cannot commit', async () => {
    const { correct, err, git, cwd } = withPiece();
    git.failNextCommit = new Error('no space left');
    expect(await correct()).toBe(1);
    expect(err).toEqual(['the correction failed: no space left']);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(readFileSync(path.join(cwd, sitePaths().newsFile(PUBLISHED_SLUG)), 'utf8')).toBe(publishedPiece().mdx);
  });

  it('exits 2 with the usage for a mistake in the arguments, and writes nothing', async () => {
    const { call, err, git, cwd } = withPiece();
    expect(await call('retract', PUBLISHED_SLUG)).toBe(2);
    expect(err).toEqual(['desk: retract needs --reason <text>: why the piece is corrected or retracted', USAGE]);
    expect(git.commits).toEqual([]);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });
});

