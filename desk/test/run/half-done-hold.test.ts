import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_DATE } from '../../src/demo/world';
import { clientFromConfig } from '../../src/model/factory';
import { holdBranchName } from '../../src/run/branches';
import { readDeskState } from '../../src/run/desk-state';
import { GhForge, nodeExec } from '../../src/run/forge';
import type { Exec, ExecResult } from '../../src/run/forge';
import type { RunDeskOptions } from '../../src/run/orchestrate';
import { SiteTarget } from '../../src/run/target';
import { useScratch } from '../support/context';
import type { ExecCall } from '../support/exec';
import { ISOLATED, branchesIn, git, initRepo } from '../support/repo';
import { STATE, clock, setupRun, unentailed } from '../support/run';

// A hold that is half done: the branch of the piece was pushed, and the pull request could not be opened. The try that follows has to be able to send the piece. These tests run whole
// days in the made-up world, in a real repository whose `origin` is a bare repository in a folder, with `GhForge` over a program runner that runs the real `git` (so a push is a real
// push and can really be rejected as one that is not a fast-forward) and a script in the place of `gh`, which cannot be run here.

const scratch = useScratch();
const PR = 'https://github.example/agentic-media-house/agentic-media-house/pull/7';

interface GhReply {
  code: number;
  stdout?: string;
  stderr?: string;
}

/** An `Exec` that runs `git` for real and answers `gh` from the script, one reply for each call of `gh`, and keeps every call. */
function hybrid(...gh: GhReply[]): { exec: Exec; calls: ExecCall[] } {
  const real = nodeExec(ISOLATED);
  const calls: ExecCall[] = [];
  let next = 0;
  const exec: Exec = async (file, args, options) => {
    calls.push({ file, args: [...args], cwd: options.cwd });
    if (file === 'git') return real(file, args, options);
    const reply = gh[next++];
    if (reply === undefined) throw new Error(`no reply is scripted for gh call ${next}: ${args.join(' ')}`);
    return { stdout: reply.stdout ?? '', stderr: reply.stderr ?? '', code: reply.code } satisfies ExecResult;
  };
  return { exec, calls };
}

/** A repository whose origin is a bare repository that has main, and a run of the made-up day in it that is held. */
function setup(...gh: GhReply[]) {
  const made = setupRun(scratch, { fake: unentailed() });
  const cli = initRepo(made.repoDir);
  const remote = path.join(scratch(), 'origin.git');
  mkdirSync(remote);
  git(remote, 'init', '--quiet', '--bare', '-b', 'main');
  git(made.repoDir, 'remote', 'add', 'origin', remote);
  git(made.repoDir, 'push', '--quiet', 'origin', 'main');
  const { exec, calls } = hybrid(...gh);
  const forge = new GhForge(exec, { cwd: made.repoDir, tempDir: scratch() });
  const target = new SiteTarget(made.repoDir, cli);
  const remoteBranches = (): string[] => git(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').sort();
  const run = (overrides: Partial<RunDeskOptions> = {}) => made.run({ target, forge, ...overrides });
  const again = (overrides: Partial<RunDeskOptions> = {}) => run({ model: clientFromConfig(made.config, { kind: 'fake', fake: unentailed() }, {}), now: clock(), ...overrides });
  return { ...made, remote, remoteBranches, forge, calls, run, again };
}

describe('a hold that is half done: the branch is pushed and the pull request is not opened', () => {
  it('ends the run failed, says that the branch is left on the remote and how to get rid of it, and leaves no branch in the checkout', async () => {
    const { run, remoteBranches, repoDir } = setup({ code: 1, stderr: 'GraphQL: Something went wrong' });
    const first = await run();
    const branch = holdBranchName(DEMO_DATE, `${'fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant'}`);
    expect(first.outcome).toBe('failed');
    expect(first.stage).toBe('hold');
    expect(first.reason).toContain(`the branch ${branch} was pushed and no pull request was opened, so it is left on the remote`);
    expect(first.reason).toContain(`git push origin --delete ${branch}`);
    expect(first.reason).toContain('the next try of the day uses another name');
    expect(remoteBranches()).toEqual([branch, 'main']);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('is tried again the same day, and the second try pushes a branch of its own, which the remote takes, and opens the pull request', async () => {
    const { again, run, remoteBranches, repoDir } = setup({ code: 1, stderr: 'GraphQL: Something went wrong' }, { code: 0, stdout: `${PR}\n` });
    const first = await run();
    expect(first.outcome).toBe('failed');
    const second = await again();
    expect(second.outcome).toBe('held');
    expect(second.attempt).toBe(2);
    expect(second.pullRequest).toBe(PR);
    const branch = `hold/${DEMO_DATE}-${second.slug}-t2`;
    // Both branches are on the remote: the one that the first try left, and the one of the second, which was not rejected as a push that is not a fast-forward.
    expect(remoteBranches()).toEqual([`hold/${DEMO_DATE}-${second.slug}`, branch, 'main'].sort());
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
    expect((await readDeskState(path.join(repoDir, STATE))).holds).toEqual([expect.objectContaining({ prUrl: PR, slug: second.slug })]);
  });

  it('is tried again from a fresh checkout, which has no record of the first try and is the first try as far as it knows: the remote has the branch, so the name of the next try is used', async () => {
    const { again, run, remoteBranches, config } = setup({ code: 1, stderr: 'GraphQL: Something went wrong' }, { code: 0, stdout: `${PR}\n` });
    const first = await run();
    expect(first.outcome).toBe('failed');
    // A job that starts from a fresh checkout has no folder of runs: the earlier try is not there to be counted.
    rmSync(config.runDir, { recursive: true, force: true });
    const second = await again();
    expect(second.outcome).toBe('held');
    expect(second.attempt).toBe(1);
    expect(second.pullRequest).toBe(PR);
    expect(remoteBranches()).toEqual([`hold/${DEMO_DATE}-${second.slug}`, `hold/${DEMO_DATE}-${second.slug}-t2`, 'main'].sort());
  });

  it('asks the remote for the names before it makes the branch, with the real git: exit code 2 of `git ls-remote --exit-code` is a branch that is not there', async () => {
    const { again, run, calls } = setup({ code: 1, stderr: 'GraphQL: Something went wrong' }, { code: 0, stdout: `${PR}\n` });
    await run();
    await again();
    const asked = calls.filter((call) => call.file === 'git' && call.args[0] === 'ls-remote').map((call) => call.args.at(-1));
    expect(asked).toHaveLength(2);
    expect(asked[0]).toMatch(/^refs\/heads\/hold\/2026-10-05-.+[^2]$/);
    expect(asked[1]).toMatch(/-t2$/);
    expect(calls.filter((call) => call.file === 'git' && call.args[0] === 'ls-remote').every((call) => call.args.slice(0, 4).join(' ') === 'ls-remote --exit-code --heads origin')).toBe(true);
  });
});

describe('a hold whose push fails', () => {
  it('leaves nothing on the remote and no branch in the checkout, and the next try of the day sends the piece under its own name', async () => {
    const { again, run, remoteBranches, repoDir } = setup({ code: 0, stdout: `${PR}\n` });
    // The remote refuses the branch: a hook that does not take any branch of a hold, for the first try.
    const hook = path.join(git(repoDir, 'remote', 'get-url', 'origin'), 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "no holds today" >&2\nexit 1\n', { mode: 0o755 });
    const first = await run();
    expect(first.outcome).toBe('failed');
    expect(first.stage).toBe('hold');
    expect(first.reason).toContain('no holds today');
    expect(first.reason).not.toContain('was pushed and no pull request was opened');
    expect(remoteBranches()).toEqual(['main']);
    expect(branchesIn(repoDir)).toEqual(['main']);
    rmSync(hook);
    const second = await again();
    expect(second.outcome).toBe('held');
    expect(remoteBranches()).toEqual([`hold/${DEMO_DATE}-${second.slug}-t2`, 'main'].sort());
  });
});
