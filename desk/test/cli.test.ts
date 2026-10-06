import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
import { FakeGit } from '../src/run/git';
import { sitePaths } from '../src/run/target';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';

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
const TEST_AGENT = 'RobywireDesk/0.1 (+https://robywire.test/method)';

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
    expect(parsed('run')).toEqual({ command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, cassettes: undefined, config: undefined });
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
    expect(parsed('replay', 'runs/2026-10-05')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'live', cassettes: undefined, config: undefined });
    expect(parsed('replay', 'runs/2026-10-05', '--sources', 'fixtures', '--cassettes', 'elsewhere')).toEqual({ command: 'replay', runDir: 'runs/2026-10-05', sources: 'fixtures', cassettes: 'elsewhere', config: undefined });
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
    expect(USAGE).toContain('desk replay');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
    expect(USAGE.split('\n').filter((line) => line.startsWith('  desk ')).every((line) => line.includes('[--config <path>]'))).toBe(true);
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

describe('main: --config, the file of settings', () => {
  const FILE = [
    'minClaims: 99',
    'runDir: out/runs',
    'evidenceDir: out/evidence',
    'userAgent: "RobywireDesk/0.1 (+https://robywire.test/method)"',
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
    expect(out).toEqual(['last run: none yet', 'holds: 0']);
  });
});

describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
  // links to robywire.example, an address that does not exist, so a live run that has not been given a real one is refused before it asks a site.
  const PLACEHOLDER = 'RobywireDesk/0.1 (+https://robywire.example/method)';

  it('refuses a live run with the default user agent, with exit code 2 and the way out, and writes nothing and asks nobody', async () => {
    const { call, err, out, cwd, git } = setup({ config: undefined, env: { ANTHROPIC_API_KEY: 'k' } });
    const before = filesBelow(cwd);
    expect(await call('run')).toBe(2);
    expect(out).toEqual([]);
    expect(err).toEqual([
      `desk: the user agent "${PLACEHOLDER}" links to robywire.example, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
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
