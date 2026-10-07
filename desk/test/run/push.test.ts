import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PushFailed, pushLines, pushRun, pushToSideBranch, sideBranchName, sideLines } from '../../src/run/push';
import type { GitRunner, PushOptions, SideOptions } from '../../src/run/push';
import { useScratch } from '../support/context';
import { makeOrigin } from '../support/origin';
import type { Origin } from '../support/origin';
import { git } from '../support/repo';

// What `desk push` does to the commits that a run made, tried in real git repositories with a bare repository in a folder as the remote: nothing is pushed anywhere
// else and no network is touched. The rules are that a push never fails open (any error of git is an error, never "nothing to push"), that a push that is rejected is
// tried again on top of what was pushed in the meantime, and that a run's commits are never lost: when they cannot go to main they go to a branch of their own.

const scratch = useScratch();
const DAY = '2026-10-05';
const RUN = '4711-1';
const RESCUE = 'desk-rescue/2026-10-05-4711-1';

function options(origin: Origin, overrides: Partial<PushOptions> = {}): PushOptions {
  return { git: origin.run, remote: 'origin', branch: 'main', retries: 3, rescuePrefix: 'desk-rescue', runId: RUN, day: DAY, ...overrides };
}

/** A git that lets somebody else push to main of the remote just before each of the first `times` pushes of the run to main, and counts those pushes. */
function racing(origin: Origin, times: number, change: { file: string; text: string } | undefined = undefined): { run: GitRunner; pushes: () => number } {
  let raced = 0;
  let pushes = 0;
  const run: GitRunner = async (args) => {
    if (args[0] === 'push' && args.includes('HEAD:main')) {
      pushes += 1;
      if (raced < times) {
        raced += 1;
        git(origin.other, 'pull', '--quiet', '--ff-only');
        const { file, text } = change ?? { file: `race-${raced}.txt`, text: `${raced}\n` };
        origin.commit(origin.other, file, text, `someone else ${raced}`);
        git(origin.other, 'push', '--quiet', 'origin', 'main');
      }
    }
    return origin.run(args);
  };
  return { run, pushes: () => pushes };
}

/** A git that fails the command whose first word is `word`, as a disk or a remote that has gone wrong would, and does everything else as it is. */
const failing =
  (inner: GitRunner, word: string, said = 'fatal: it went wrong'): GitRunner =>
  async (args) =>
    args[0] === word ? { stdout: '', stderr: said, code: 128 } : inner(args);

const subjects = (dir: string, ref: string): string[] => git(dir, 'log', '--format=%s', ref).split('\n');

describe('pushRun: what is ahead', () => {
  it('has nothing to push, pushes nothing and says so when main is not ahead of origin/main', async () => {
    const origin = makeOrigin(scratch());
    const before = origin.remoteHead();
    const outcome = await pushRun(options(origin));
    expect(outcome).toEqual({ kind: 'nothing', commits: 0 });
    expect(origin.remoteHead()).toBe(before);
    expect(pushLines(outcome)).toEqual(['push: nothing to push: main has no commit that origin/main does not have']);
  });

  it('has nothing to push when main is only behind: the commits of somebody else are not the run\'s', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.other, 'b.txt', 'b\n', 'someone else');
    git(origin.other, 'push', '--quiet', 'origin', 'main');
    const before = origin.remoteHead();
    expect(await pushRun(options(origin))).toEqual({ kind: 'nothing', commits: 0 });
    expect(origin.remoteHead()).toBe(before);
  });

  it('counts after a fetch and against origin/main, never against an upstream: a checkout whose branch follows nothing is counted and pushed', async () => {
    const origin = makeOrigin(scratch());
    git(origin.work, 'branch', '--unset-upstream');
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const outcome = await pushRun(options(origin));
    expect(outcome).toMatchObject({ kind: 'pushed', commits: 1, retries: 0 });
    expect(origin.remoteHead()).toBe(git(origin.work, 'rev-parse', 'HEAD'));
  });

  it('pushes every commit that main is ahead by, to main of the remote, and says how many and where', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    origin.commit(origin.work, 'c.txt', 'c\n', 'desk: c');
    const outcome = await pushRun(options(origin));
    const head = git(origin.work, 'rev-parse', 'HEAD');
    expect(outcome).toEqual({ kind: 'pushed', commits: 2, head, retries: 0 });
    expect(origin.remoteHead()).toBe(head);
    expect(origin.remoteBranches()).toEqual(['main']);
    expect(pushLines(outcome)).toEqual([`push: pushed 2 commits to origin/main (${head.slice(0, 12)})`]);
  });

  it('says "1 commit", and how many times it had to try again', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const raced = racing(origin, 1);
    const outcome = await pushRun(options(origin, { git: raced.run }));
    expect(pushLines(outcome)).toEqual([`push: pushed 1 commit to origin/main (${git(origin.work, 'rev-parse', 'HEAD').slice(0, 12)}), after 1 new try on top of what was pushed in the meantime`]);
  });
});

describe('pushRun: a push that is rejected', () => {
  it('fetches, puts the commits on top of what somebody else pushed, and pushes again', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const raced = racing(origin, 1);
    const outcome = await pushRun(options(origin, { git: raced.run }));
    expect(outcome).toMatchObject({ kind: 'pushed', commits: 1, retries: 1 });
    expect(raced.pushes()).toBe(2);
    // main of the remote has both, in a line (no merge), and the checkout is at the same commit.
    expect(subjects(origin.remote, 'main')).toEqual(['desk: b', 'someone else 1', 'start']);
    expect(origin.remoteHead()).toBe(git(origin.work, 'rev-parse', 'HEAD'));
    expect(git(origin.work, 'status', '--porcelain')).toBe('');
  });

  it('is behind before it starts, which is the same thing: the first push is rejected, the second is not', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.other, 'b.txt', 'b\n', 'someone else');
    git(origin.other, 'push', '--quiet', 'origin', 'main');
    origin.commit(origin.work, 'c.txt', 'c\n', 'desk: c');
    expect(await pushRun(options(origin))).toMatchObject({ kind: 'pushed', commits: 1, retries: 1 });
    expect(subjects(origin.remote, 'main')).toEqual(['desk: c', 'someone else', 'start']);
  });

  it('tries at most `retries` more times, and when every push is rejected sends the commits to the rescue branch and leaves main alone', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const raced = racing(origin, 99);
    const outcome = await pushRun(options(origin, { git: raced.run }));
    expect(raced.pushes()).toBe(4);
    expect(outcome).toMatchObject({ kind: 'rescued', branch: RESCUE, commits: 1 });
    expect((outcome as { why: string }).why).toContain('was rejected 4 times');
    expect(origin.remoteBranches()).toEqual(['desk-rescue/2026-10-05-4711-1', 'main']);
    expect(subjects(origin.remote, RESCUE)[0]).toBe('desk: b');
    // Main of the remote is what somebody else left there: no commit of the run is on it.
    expect(subjects(origin.remote, 'main')).not.toContain('desk: b');
  });

  it('does not try again when `retries` is 0', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const raced = racing(origin, 99);
    const outcome = await pushRun(options(origin, { git: raced.run, retries: 0 }));
    expect(raced.pushes()).toBe(1);
    expect(outcome.kind).toBe('rescued');
    expect((outcome as { why: string }).why).toContain('was rejected 1 time,');
  });

  it('takes the most tries that it allows, 10, and no more', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    expect(await pushRun(options(origin, { retries: 10 }))).toMatchObject({ kind: 'pushed', commits: 1, retries: 0 });
    await expect(pushRun(options(origin, { retries: 11 }))).rejects.toBeInstanceOf(PushFailed);
  });

  it('succeeds on the last try that it has', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const raced = racing(origin, 3);
    expect(await pushRun(options(origin, { git: raced.run }))).toMatchObject({ kind: 'pushed', retries: 3 });
    expect(raced.pushes()).toBe(4);
    expect(origin.remoteBranches()).toEqual(['main']);
  });

  it('does not put its commits on top when the desk state was changed in the meantime in a way that conflicts: the rebase is undone, the commits go to the rescue branch, and the checkout is as it was', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    const mine = git(origin.work, 'rev-parse', 'HEAD');
    const raced = racing(origin, 1, { file: 'desk-state.json', text: '{"holds": 2}\n' });
    const outcome = await pushRun(options(origin, { git: raced.run }));
    expect(outcome).toMatchObject({ kind: 'rescued', branch: RESCUE, commits: 1, head: mine });
    expect(git(origin.remote, 'rev-parse', RESCUE)).toBe(mine);
    expect(subjects(origin.remote, 'main')[0]).toBe('someone else 1');
    expect(git(origin.work, 'rev-parse', 'HEAD')).toBe(mine);
    expect(git(origin.work, 'branch', '--show-current')).toBe('main');
    expect(git(origin.work, 'status', '--porcelain')).toBe('');
    expect(existsSync(path.join(origin.work, '.git', 'rebase-merge'))).toBe(false);
    expect(existsSync(path.join(origin.work, '.git', 'rebase-apply'))).toBe(false);
  });

  it('says where the commits are, that main was not changed, and why', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    const outcome = await pushRun(options(origin, { git: racing(origin, 1, { file: 'desk-state.json', text: '{"holds": 2}\n' }).run }));
    const lines = pushLines(outcome);
    expect(lines.join('\n')).toContain(`the 1 commit of this run is on the branch ${RESCUE} of origin`);
    expect(lines.join('\n')).toContain('main was not changed');
    expect(lines.join('\n')).toContain('could not be put on top of origin/main');
  });
});

describe('pushRun: a push that is refused for another reason', () => {
  it('goes to the rescue branch at once when the remote does not let anything onto main (a protected branch), with no new try', async () => {
    const origin = makeOrigin(scratch());
    const hook = path.join(origin.remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = refs/heads/main ]; then echo "protected branch" >&2; exit 1; fi\ndone\n', { mode: 0o755 });
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const counted = racing(origin, 0);
    const outcome = await pushRun(options(origin, { git: counted.run }));
    expect(counted.pushes()).toBe(1);
    expect(outcome).toMatchObject({ kind: 'rescued', branch: RESCUE, commits: 1 });
    expect(pushLines(outcome).join('\n')).toContain('protected branch');
    expect(origin.remoteBranches()).toEqual([RESCUE, 'main']);
  });

  it('goes to another name when the rescue branch is already there, and never changes the one that is', async () => {
    const origin = makeOrigin(scratch());
    git(origin.other, 'checkout', '--quiet', '-b', 'theirs');
    origin.commit(origin.other, 'theirs.txt', 'theirs\n', 'an earlier rescue');
    git(origin.other, 'push', '--quiet', 'origin', `theirs:refs/heads/${RESCUE}`);
    git(origin.other, 'checkout', '--quiet', 'main');
    const theirs = git(origin.remote, 'rev-parse', RESCUE);
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    const outcome = await pushRun(options(origin, { git: racing(origin, 1, { file: 'desk-state.json', text: '{"holds": 2}\n' }).run }));
    expect(outcome).toMatchObject({ kind: 'rescued', branch: `${RESCUE}-2` });
    expect(git(origin.remote, 'rev-parse', RESCUE)).toBe(theirs);
  });

  it('is an error, and says that the commits are only in this checkout, when not even the rescue branch can be pushed', async () => {
    const origin = makeOrigin(scratch());
    writeFileSync(path.join(origin.remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "no pushes today" >&2\nexit 1\n', { mode: 0o755 });
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const failure = await pushRun(options(origin)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushFailed);
    expect((failure as Error).message).toContain('only in this checkout');
    expect((failure as Error).message).toContain(git(origin.work, 'rev-parse', 'HEAD').slice(0, 12));
    expect((failure as Error).message).toContain('no pushes today');
  });
});

describe('pushRun: every error is an error', () => {
  const failure = async (run: () => Promise<unknown>): Promise<string> => {
    const error = await run().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PushFailed);
    return (error as Error).message;
  };

  it('refuses a checkout on no branch (HEAD detached), and pushes nothing', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    git(origin.work, 'checkout', '--quiet', '--detach');
    const before = origin.remoteHead();
    expect(await failure(() => pushRun(options(origin)))).toContain('is on no branch');
    expect(origin.remoteHead()).toBe(before);
  });

  it('refuses a checkout that is on another branch than main, whose commits are not the run\'s to put on main', async () => {
    const origin = makeOrigin(scratch());
    git(origin.work, 'checkout', '--quiet', '-b', 'something-else');
    origin.commit(origin.work, 'b.txt', 'b\n', 'not the desk');
    const before = origin.remoteHead();
    expect(await failure(() => pushRun(options(origin)))).toContain('is on something-else, not on main');
    expect(origin.remoteHead()).toBe(before);
  });

  it('refuses a repository that has no remote of that name', async () => {
    const origin = makeOrigin(scratch());
    git(origin.work, 'remote', 'remove', 'origin');
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    expect(await failure(() => pushRun(options(origin)))).toContain('no remote called origin');
  });

  it('refuses a remote that has no main, and says so: it is not "nothing to push"', async () => {
    const origin = makeOrigin(scratch(), { empty: true });
    const message = await failure(() => pushRun(options(origin)));
    expect(message).toContain('git fetch failed');
    expect(message).toContain('main');
    expect(origin.remoteBranches()).toEqual([]);
  });

  it('is an error when git cannot count the commits, which is not "nothing to push"', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const before = origin.remoteHead();
    expect(await failure(() => pushRun(options(origin, { git: failing(origin.run, 'rev-list', 'fatal: bad revision') })))).toContain('git rev-list failed (exit code 128): fatal: bad revision');
    expect(origin.remoteHead()).toBe(before);
  });

  it('is an error when the count is not a number', async () => {
    const origin = makeOrigin(scratch());
    const lying: GitRunner = async (args) => (args[0] === 'rev-list' ? { stdout: 'many\n', stderr: '', code: 0 } : origin.run(args));
    expect(await failure(() => pushRun(options(origin, { git: lying })))).toContain('did not count the commits');
  });

  it('is an error when git cannot be started at all', async () => {
    const origin = makeOrigin(scratch());
    const missing: GitRunner = async () => {
      throw new Error('spawn git ENOENT');
    };
    expect(await failure(() => pushRun(options(origin, { git: missing })))).toContain('git cannot be started: spawn git ENOENT');
  });

  it('is an error when it cannot say which branch the checkout is on', async () => {
    const origin = makeOrigin(scratch());
    expect(await failure(() => pushRun(options(origin, { git: failing(origin.run, 'branch') })))).toContain('git branch failed');
  });

  it('is an error when the checkout is left in the middle of a rebase that cannot be undone, and the commits are not pushed from there', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', 'desk: held a piece');
    const raced = racing(origin, 1, { file: 'desk-state.json', text: '{"holds": 2}\n' });
    const noAbort: GitRunner = async (args) => (args[0] === 'rebase' && args[1] === '--abort' ? { stdout: '', stderr: 'fatal: no way', code: 128 } : raced.run(args));
    expect(await failure(() => pushRun(options(origin, { git: noAbort })))).toContain('in the middle of a rebase');
    expect(origin.remoteBranches()).toEqual(['main']);
  });

  it('never has a credential in what it says: an address in what git said loses its password', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const said = "fatal: unable to access 'https://x-access-token:MADE-UP-PASSWORD@github.example/owner/repo.git/': The requested URL returned error: 403";
    const refusing: GitRunner = async (args) => (args[0] === 'push' ? { stdout: '', stderr: said, code: 128 } : origin.run(args));
    const message = await failure(() => pushRun(options(origin, { git: refusing })));
    expect(message).toContain('returned error: 403');
    expect(message).not.toContain('MADE-UP-PASSWORD');
  });
});

describe('pushRun: its names', () => {
  it.each([
    ['a run id with capitals', { runId: 'Run-1' }],
    ['a run id with a space', { runId: 'run 1' }],
    ['a run id that starts with a hyphen', { runId: '-run' }],
    ['an empty run id', { runId: '' }],
    ['a day that is not a day', { day: '2026-13-45' }],
    ['a prefix with a slash at the end', { rescuePrefix: 'desk-rescue/' }],
    ['a prefix that goes up', { rescuePrefix: '..' }],
    ['a remote that is an option', { remote: '--upload-pack=evil' }],
    ['a branch that is an option', { branch: '--force' }],
    ['a branch that goes up', { branch: 'a/../b' }],
    ['a number of tries below 0', { retries: -1 }],
    ['a number of tries above 10', { retries: 11 }],
    ['a number of tries that is not whole', { retries: 1.5 }],
  ] as const)('refuses %s before it runs any command', async (_what, overrides) => {
    const calls: string[][] = [];
    const watching: GitRunner = async (args) => {
      calls.push([...args]);
      return { stdout: '', stderr: '', code: 0 };
    };
    const asked: PushOptions = { git: watching, remote: 'origin', branch: 'main', retries: 3, rescuePrefix: 'desk-rescue', runId: RUN, day: DAY, ...overrides };
    await expect(pushRun(asked)).rejects.toBeInstanceOf(PushFailed);
    expect(calls).toEqual([]);
  });

  it('makes the name of a rescue branch from the folder, the day and the run', () => {
    expect(sideBranchName('desk-rescue', DAY, RUN)).toBe(RESCUE);
  });
});

describe('pushToSideBranch: commits that must not reach main', () => {
  const BUILD_FAILED = 'desk-build-failed/2026-10-05-4711-1';
  const side = (origin: Origin, overrides: Partial<SideOptions> = {}): SideOptions => ({ git: origin.run, remote: 'origin', branch: 'main', folder: 'desk-build-failed', runId: RUN, day: DAY, ...overrides });

  it('puts the commits on a branch of their own, says how many and where, and leaves main of the remote exactly as it is', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    origin.commit(origin.work, 'c.txt', 'c\n', 'desk: c');
    const before = origin.remoteHead();
    const head = git(origin.work, 'rev-parse', 'HEAD');
    const outcome = await pushToSideBranch(side(origin));
    expect(outcome).toEqual({ kind: 'branch', branch: BUILD_FAILED, commits: 2, head });
    expect(origin.remoteHead()).toBe(before);
    expect(git(origin.remote, 'rev-parse', BUILD_FAILED)).toBe(head);
    expect(origin.remoteBranches()).toEqual([BUILD_FAILED, 'main']);
    expect(sideLines(outcome)).toEqual([`push: the 2 commits of this run are on the branch ${BUILD_FAILED} of origin (${head.slice(0, 12)}), and main was not changed`]);
  });

  it('says "1 commit ... is", and does not rebase, fetch into the checkout or push anything but the branch when main of the remote has moved on', async () => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    origin.commit(origin.other, 'c.txt', 'c\n', 'someone else');
    git(origin.other, 'push', '--quiet', 'origin', 'main');
    const mine = git(origin.work, 'rev-parse', 'HEAD');
    const outcome = await pushToSideBranch(side(origin));
    expect(sideLines(outcome)[0]).toContain('the 1 commit of this run is on the branch');
    expect(git(origin.work, 'rev-parse', 'HEAD')).toBe(mine);
    expect(subjects(origin.remote, 'main')[0]).toBe('someone else');
    expect(subjects(origin.remote, BUILD_FAILED)).toEqual(['desk: b', 'start']);
  });

  it('has nothing to put on a branch when main has no commit that origin/main does not have', async () => {
    const origin = makeOrigin(scratch());
    const outcome = await pushToSideBranch(side(origin));
    expect(outcome).toEqual({ kind: 'nothing', commits: 0 });
    expect(sideLines(outcome)).toEqual(['push: nothing to put on a branch: main has no commit that origin/main does not have']);
    expect(origin.remoteBranches()).toEqual(['main']);
  });

  it('goes to another name when the branch is already there, and never changes the one that is', async () => {
    const origin = makeOrigin(scratch());
    git(origin.other, 'checkout', '--quiet', '-b', 'theirs');
    origin.commit(origin.other, 'theirs.txt', 'theirs\n', 'an earlier branch');
    git(origin.other, 'push', '--quiet', 'origin', `theirs:refs/heads/${BUILD_FAILED}`);
    const theirs = git(origin.remote, 'rev-parse', BUILD_FAILED);
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    expect(await pushToSideBranch(side(origin))).toMatchObject({ kind: 'branch', branch: `${BUILD_FAILED}-2` });
    expect(git(origin.remote, 'rev-parse', BUILD_FAILED)).toBe(theirs);
  });

  it('is an error, and says that the commits are only in this checkout, when the remote takes no branch', async () => {
    const origin = makeOrigin(scratch());
    writeFileSync(path.join(origin.remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "no pushes today" >&2\nexit 1\n', { mode: 0o755 });
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    const failure = await pushToSideBranch(side(origin)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushFailed);
    expect((failure as Error).message).toContain('only in this checkout');
    expect((failure as Error).message).toContain('no pushes today');
  });

  it.each([
    ['a checkout on no branch', (origin: Origin) => git(origin.work, 'checkout', '--quiet', '--detach'), 'is on no branch'],
    ['a checkout on another branch than main', (origin: Origin) => git(origin.work, 'checkout', '--quiet', '-b', 'else'), 'is on else, not on main'],
    ['a repository with no remote', (origin: Origin) => git(origin.work, 'remote', 'remove', 'origin'), 'no remote called origin'],
  ])('refuses %s, as pushRun does, and pushes nothing', async (_what, spoil, message) => {
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    spoil(origin);
    await expect(pushToSideBranch(side(origin))).rejects.toThrow(message);
    expect(origin.remoteBranches()).toEqual(['main']);
  });

  it('refuses a remote that has no main, and an error of git when it counts', async () => {
    const empty = makeOrigin(scratch(), { empty: true });
    await expect(pushToSideBranch(side(empty))).rejects.toThrow('git fetch failed');
    const origin = makeOrigin(scratch());
    origin.commit(origin.work, 'b.txt', 'b\n', 'desk: b');
    await expect(pushToSideBranch(side(origin, { git: failing(origin.run, 'rev-list', 'fatal: bad revision') }))).rejects.toThrow('git rev-list failed (exit code 128): fatal: bad revision');
    expect(origin.remoteBranches()).toEqual(['main']);
  });

  it('refuses a folder, a day or a run that could make another kind of name, before it runs any command', async () => {
    const origin = makeOrigin(scratch());
    const calls: string[][] = [];
    const watching: GitRunner = async (args) => {
      calls.push([...args]);
      return origin.run(args);
    };
    for (const overrides of [{ folder: 'desk-build-failed/' }, { runId: 'Run 1' }, { day: 'someday' }, { branch: '--force' }] as const) {
      await expect(pushToSideBranch(side(origin, { git: watching, ...overrides }))).rejects.toBeInstanceOf(PushFailed);
    }
    expect(calls).toEqual([]);
  });
});
