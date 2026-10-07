import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { FakeGit } from '../src/run/git';
import { useScratch } from './support/context';
import { makeOrigin } from './support/origin';
import type { Origin } from './support/origin';
import { git } from './support/repo';
import { START, clock } from './support/run';

// `desk push`, the command that the workflow pushes with. The rules of the push itself are in test/run/push.test.ts; here are the words of the command, what it prints, which
// exit code each ending has, and the file that tells the next step of the workflow that something was pushed. The remote is a folder.

const scratch = useScratch();

function setup(origin: Origin, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const cwd = scratch();
  const deps: CliDeps = {
    out: (line) => void out.push(line),
    err: (line) => void err.push(line),
    env: {},
    cwd,
    now: clock(),
    git: new FakeGit(),
    config: { ...defaultConfig(), runDir: path.join(cwd, 'runs'), evidenceDir: path.join(cwd, 'evidence') },
    pushGit: origin.run,
  };
  return { cwd, out, err, code: () => main(argv, deps) };
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

describe('parseArgs: push', () => {
  it('has no arguments of its own and two options, both with a value', () => {
    expect(parsed('push')).toEqual({ command: 'push', runId: undefined, output: undefined });
    expect(parsed('push', '--run-id', '4711-1', '--output', 'out.txt')).toEqual({ command: 'push', runId: '4711-1', output: 'out.txt' });
  });

  it('refuses an argument, an option of another command, an id that cannot be in the name of a branch, and an option without a value', () => {
    expect(refused('push', 'now')).toBe('push takes no arguments, but was given "now"');
    expect(refused('push', '--dry')).toBe('unknown option --dry for push');
    expect(refused('push', '--run-id', 'Run 1')).toBe('--run-id is lowercase letters and digits joined by single hyphens, not "Run 1"');
    expect(refused('push', '--run-id')).toBe('--run-id needs a value');
    expect(refused('push', '--output')).toBe('--output needs a value');
  });

  it('is in the usage, which says that it never fails open', () => {
    expect(USAGE).toContain('  desk push [--run-id <id>] [--output <file>]');
    expect(USAGE).toContain('a push never fails open');
  });
});

describe('main: push', () => {
  it('says that there is nothing to push, exits 0 and writes no output file when the run made no commit', async () => {
    const origin = makeOrigin(scratch());
    const run = setup(origin, ['push', '--output', 'github-output']);
    expect(await run.code()).toBe(0);
    expect(run.out).toEqual(['push: nothing to push: main has no commit that origin/main does not have']);
    expect(run.err).toEqual([]);
    expect(existsSync(path.join(run.cwd, 'github-output'))).toBe(false);
  });

  it('pushes, says so, exits 0, and adds pushed=true to the output file, which the step that deploys reads', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const run = setup(origin, ['push', '--output', 'github-output']);
    expect(await run.code()).toBe(0);
    expect(run.out).toEqual([`push: pushed 1 commit to origin/main (${git(origin.work, 'rev-parse', 'HEAD').slice(0, 12)})`]);
    expect(readFileSync(path.join(run.cwd, 'github-output'), 'utf8')).toBe('pushed=true\n');
    expect(origin.remoteHead()).toBe(git(origin.work, 'rev-parse', 'HEAD'));
  });

  it('does not need an output file', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    expect(await setup(origin, ['push']).code()).toBe(0);
  });

  it('exits 1 and says on the error output where the commits are when they could not go to main; the rescue branch is named from the day, and by default from the time, of the clock', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    git(origin.other, 'pull', '--quiet');
    origin.commit(origin.other, 'desk-state.json', '{"holds": 2}\n', 'someone else');
    git(origin.other, 'push', '--quiet', 'origin', 'main');
    const run = setup(origin, ['push', '--output', 'github-output']);
    expect(await run.code()).toBe(1);
    expect(run.out).toEqual([]);
    expect(run.err[0]).toContain('the 1 commit of this run is on the branch desk-rescue/2026-10-05-043100 of origin');
    expect(run.err[0]).toContain('and main was not changed');
    expect(origin.remoteBranches()).toEqual(['desk-rescue/2026-10-05-043100', 'main']);
    expect(existsSync(path.join(run.cwd, 'github-output'))).toBe(false);
  });

  it('names the rescue branch from --run-id when it is given', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    origin.commit(origin.other, 'desk-state.json', '{"holds": 2}\n', 'someone else');
    git(origin.other, 'push', '--quiet', 'origin', 'main');
    expect(await setup(origin, ['push', '--run-id', '99-2']).code()).toBe(1);
    expect(origin.remoteBranches()).toEqual(['desk-rescue/2026-10-05-99-2', 'main']);
  });

  it('exits 1 with the reason, never 0, for a checkout on no branch', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    git(origin.work, 'checkout', '--quiet', '--detach');
    const run = setup(origin, ['push']);
    expect(await run.code()).toBe(1);
    expect(run.out).toEqual([]);
    expect(run.err).toEqual(['desk: the checkout is on no branch (HEAD is detached), so its commits are not pushed to main: nothing was pushed']);
  });

  it('exits 1 for an error that is not one of the push, and says what it was', async () => {
    const origin = makeOrigin(scratch());
    const run = setup(origin, ['push']);
    const broken: CliDeps['pushGit'] = (async () => undefined) as never;
    expect(await main(['push'], { out: () => undefined, err: (line) => void run.err.push(line), env: {}, cwd: run.cwd, now: () => START, git: new FakeGit(), pushGit: broken })).toBe(1);
    expect(run.err).toHaveLength(1);
    expect(run.err[0]).toMatch(/^the push could not be done: /);
  });

  it('exits 1 and says that the commits were pushed when the output file cannot be written, so that nobody takes the push for lost', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const run = setup(origin, ['push', '--output', 'no-such-folder/github-output']);
    expect(await run.code()).toBe(1);
    expect(run.err).toHaveLength(1);
    expect(run.err[0]).toContain('the commits were pushed, but no-such-folder/github-output could not be written');
    expect(run.err[0]).toContain('deploy by hand');
    expect(origin.remoteHead()).toBe(git(origin.work, 'rev-parse', 'HEAD'));
  });
});
