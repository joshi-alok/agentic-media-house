import { said } from './forge';
import type { Exec, ExecResult } from './forge';

// How what a run committed gets to GitHub. A run that is not dry makes one commit on main (the piece and the desk state, or the desk state alone), and the workflow has
// to push it. That push must do two things that a bare `git push` does not. It must never fail open: a command that cannot say what is ahead of the remote (no upstream, a
// detached checkout, a remote with no main) is an error, and an error is never "nothing to push", because the record of the run would be lost with the machine. And it
// must never lose the commits: the owner may push to main while a run is working, and then the push is rejected. The commits are put on top of what was pushed in the
// meantime and pushed again, a few times; when that cannot be done (the desk state is the usual cause: the owner changed it in the same lines) or the remote does not let
// anything onto main, the commits are pushed to a branch of their own, with a name that no earlier run has, and the command ends in an error that says where they are.

/** Git in the folder of a repository: the arguments, and what git said. A command that ends with a code other than 0 is a result, not an error. */
export type GitRunner = (args: readonly string[]) => Promise<ExecResult>;

/** `git` as a program, run by `exec` in the folder `cwd`. */
export function gitRunner(exec: Exec, cwd: string): GitRunner {
  return (args) => exec('git', args, { cwd });
}

/** Why the commits of a run could not be pushed, or why it could not be found out whether there are any. The message says what to do; it never has a password in it. */
export class PushFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushFailed';
  }
}

export interface PushOptions {
  git: GitRunner;
  /** The remote that the commits go to, `origin`. */
  remote: string;
  /** The branch of the remote that they go to, and the only branch of the checkout that is pushed: `main`. */
  branch: string;
  /** How many more times a push that was rejected is tried, after the first: the commits are put on top of what was pushed in the meantime each time. */
  retries: number;
  /** The folder of branch names that the commits go to when they cannot go to `branch`: `desk-rescue`, so that the branch is `desk-rescue/<day>-<run id>`. */
  rescuePrefix: string;
  /** What tells this run from every other: lowercase letters and digits joined by hyphens. */
  runId: string;
  /** The day, YYYY-MM-DD. */
  day: string;
}

export type PushOutcome =
  /** The checkout has no commit that the remote does not have. */
  | { kind: 'nothing'; commits: 0 }
  /** The commits are on the branch of the remote; `retries` is how many times the push was rejected and made again. */
  | { kind: 'pushed'; commits: number; head: string; retries: number }
  /** The commits are on a branch of their own, `branch`, and the branch of the remote was not changed; `why` says why they could not go to it. */
  | { kind: 'rescued'; branch: string; commits: number; head: string; why: string };

/** What a rejection by a race looks like: somebody else pushed, so the commits can be put on top of theirs and pushed again. Any other refusal will not be mended by trying again. */
const RACE = /non-fast-forward|fetch first|\(already exists\)|stale info/i;

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;
const BRANCH_ON_REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

/** Whether `text` is a day that exists, written YYYY-MM-DD. */
function isDay(text: string): boolean {
  const date = new Date(`${text}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** The name of a branch for the commits that a run could not put where they belong: `<folder>/<day>-<run id>`. Refuses a part that could make another kind of name. */
export function sideBranchName(folder: string, day: string, runId: string): string {
  if (!SAFE_NAME.test(folder)) throw new PushFailed(`${JSON.stringify(folder)} is not a name for a folder of branches (lowercase letters and digits joined by single hyphens)`);
  if (!isDay(day)) throw new PushFailed(`${JSON.stringify(day)} is not a day written YYYY-MM-DD`);
  if (!SAFE_NAME.test(runId)) throw new PushFailed(`${JSON.stringify(runId)} is not an id of a run (lowercase letters and digits joined by single hyphens)`);
  return `${folder}/${day}-${runId}`;
}

function check(options: PushOptions): void {
  if (!REMOTE_NAME.test(options.remote)) throw new PushFailed(`${JSON.stringify(options.remote)} is not the name of a remote`);
  if (!BRANCH_ON_REMOTE.test(options.branch) || options.branch.includes('..')) throw new PushFailed(`${JSON.stringify(options.branch)} is not a plain branch name`);
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 10) throw new PushFailed(`retries is a whole number from 0 to 10, not ${options.retries}`);
  sideBranchName(options.rescuePrefix, options.day, options.runId);
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Git as `pushRun` and `pushToSideBranch` use it: `attempt` gives what git ended with whatever the code, and `must` what it printed, and is an error for any code but 0. */
interface Session {
  attempt(args: readonly string[]): Promise<ExecResult>;
  must(args: readonly string[]): Promise<string>;
}

function sessionOf(git: GitRunner): Session {
  /** Run git and give what it ended with, whatever the code; git that cannot be started is a `PushFailed`. */
  const attempt = async (args: readonly string[]): Promise<ExecResult> => {
    try {
      return await git(args);
    } catch (error) {
      throw new PushFailed(`git cannot be started: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  /** Run git and give what it printed; an error of git is a `PushFailed` that says which command. */
  const must = async (args: readonly string[]): Promise<string> => {
    const result = await attempt(args);
    if (result.code !== 0) throw new PushFailed(`git ${args[0]} failed (exit code ${result.code}): ${said(result.stderr) || 'it said nothing'}`);
    return result.stdout;
  };
  return { attempt, must };
}

/**
 * How many commits this checkout has that `<remote>/<branch>` has not, after a fetch. The checkout must be on `branch` (not on another, not on none), the remote must be there and
 * must have `branch`, and git must be able to count: each of those that is not so is a `PushFailed`, never a count of 0.
 */
async function commitsAhead(session: Session, remote: string, branch: string): Promise<number> {
  const here = (await session.must(['branch', '--show-current'])).trim();
  if (here === '') throw new PushFailed(`the checkout is on no branch (HEAD is detached), so its commits are not pushed to ${branch}: nothing was pushed`);
  if (here !== branch) throw new PushFailed(`the checkout is on ${here}, not on ${branch}: only the commits of ${branch} are pushed to ${branch}, so nothing was pushed`);
  const url = await session.attempt(['remote', 'get-url', remote]);
  if (url.code !== 0) throw new PushFailed(`the repository has no remote called ${remote}, so nothing was pushed`);
  await session.must(['fetch', remote, branch]);
  const counted = (await session.must(['rev-list', '--count', `${remote}/${branch}..HEAD`])).trim();
  if (!/^\d+$/.test(counted)) throw new PushFailed(`git did not count the commits that are ahead of ${remote}/${branch}: it said ${JSON.stringify(counted.slice(0, 40))}`);
  return Number(counted);
}

/** Push HEAD to a branch of its own, `name`, or to `name-2` or `name-3` when the name is taken. The branch that it went to, or what the remote said when it took none. */
async function pushSide(session: Session, remote: string, name: string): Promise<{ branch: string } | { said: string }> {
  let last = '';
  for (const suffix of ['', '-2', '-3']) {
    const result = await session.attempt(['push', remote, `HEAD:refs/heads/${name}${suffix}`]);
    if (result.code === 0) return { branch: `${name}${suffix}` };
    last = said(result.stderr) || 'it said nothing';
    // A name that is taken is not a reason to give up; any other refusal is.
    if (!RACE.test(result.stderr)) break;
  }
  return { said: last };
}

/**
 * Push the commits that this checkout has and `<remote>/<branch>` has not, to the branch of the remote. Fetches first and counts with `git rev-list --count <remote>/<branch>..HEAD`
 * (never from an upstream, which a checkout may not have). Nothing ahead is `nothing`; ahead is pushed with `git push <remote> HEAD:<branch>`. A push that is rejected because somebody
 * else pushed is made again, up to `retries` more times, after a fetch and a `git rebase <remote>/<branch>`; a rebase that cannot be done is undone (`git rebase --abort`), and so is every
 * rejection that is not a race. Then the commits are pushed to the rescue branch and the outcome is `rescued`: the caller reports that as a failure and says where the commits are. A
 * checkout on no branch, on another branch than `branch`, a missing remote, a remote with no `branch`, and any other error of git are `PushFailed`, and nothing is pushed on their account.
 */
export async function pushRun(options: PushOptions): Promise<PushOutcome> {
  check(options);
  const { remote, branch } = options;
  const there = `${remote}/${branch}`;
  const session = sessionOf(options.git);
  const { attempt, must } = session;

  const commits = await commitsAhead(session, remote, branch);
  if (commits === 0) return { kind: 'nothing', commits: 0 };

  let retried = 0;
  let why: string;
  for (;;) {
    const pushed = await attempt(['push', remote, `HEAD:${branch}`]);
    if (pushed.code === 0) return { kind: 'pushed', commits, head: (await must(['rev-parse', 'HEAD'])).trim(), retries: retried };
    const told = said(pushed.stderr) || 'it said nothing';
    if (!RACE.test(pushed.stderr)) {
      why = `${remote} did not take the push to ${branch}: ${told}`;
      break;
    }
    if (retried >= options.retries) {
      why = `the push to ${branch} was rejected ${plural(retried + 1, 'time', 'times')}, because others pushed to it in the meantime: ${told}`;
      break;
    }
    retried += 1;
    await must(['fetch', remote, branch]);
    const rebased = await attempt(['rebase', there]);
    if (rebased.code !== 0) {
      // A rebase that stopped leaves the checkout in the middle of it: put it back first, and push nothing from there.
      await attempt(['rebase', '--abort']);
      if ((await must(['branch', '--show-current'])).trim() !== branch) {
        throw new PushFailed(`the checkout is in the middle of a rebase that could not be undone (${said(rebased.stderr) || 'git said nothing'}): nothing was pushed, and the commits of the run are in this checkout`);
      }
      why = `the commits could not be put on top of ${there}, which others changed in the meantime (the desk state is the usual cause): ${said(rebased.stderr) || 'git said nothing'}`;
      break;
    }
  }

  const head = (await must(['rev-parse', 'HEAD'])).trim();
  const pushed = await pushSide(session, remote, sideBranchName(options.rescuePrefix, options.day, options.runId));
  if ('branch' in pushed) return { kind: 'rescued', branch: pushed.branch, commits, head, why };
  throw new PushFailed(`${why}; and the commits could not be pushed to a branch of their own either (${pushed.said}): they are only in this checkout, at ${head.slice(0, 12)}`);
}

export interface SideOptions {
  git: GitRunner;
  remote: string;
  /** The branch that the commits are counted against, and that the checkout must be on: `main`. They are not pushed to it. */
  branch: string;
  /** The folder of branch names that the commits go to: `desk-build-failed`, so that the branch is `desk-build-failed/<day>-<run id>`. */
  folder: string;
  runId: string;
  day: string;
}

export type SideOutcome =
  /** The checkout has no commit that the remote does not have, so there is nothing to put on a branch. */
  | { kind: 'nothing'; commits: 0 }
  /** The commits are on the branch `branch` of the remote, and the branch of the remote that they were counted against was not changed. */
  | { kind: 'branch'; branch: string; commits: number; head: string };

/**
 * Put the commits that this checkout has and `<remote>/<branch>` has not on a branch of their own, `<folder>/<day>-<run id>`, and leave `<branch>` of the remote alone: what a run does
 * when what it committed must not reach `main` (the site does not build with it). Counts as `pushRun` does, after a fetch, and fails as it does: any error of git, a checkout that is on no
 * branch or on another than `branch`, a missing remote and a remote that does not take the branch are a `PushFailed`.
 */
export async function pushToSideBranch(options: SideOptions): Promise<SideOutcome> {
  check({ ...options, retries: 0, rescuePrefix: options.folder });
  const session = sessionOf(options.git);
  const commits = await commitsAhead(session, options.remote, options.branch);
  if (commits === 0) return { kind: 'nothing', commits: 0 };
  const head = (await session.must(['rev-parse', 'HEAD'])).trim();
  const pushed = await pushSide(session, options.remote, sideBranchName(options.folder, options.day, options.runId));
  if ('said' in pushed) throw new PushFailed(`${options.remote} did not take the commits on a branch of their own (${pushed.said}): they are only in this checkout, at ${head.slice(0, 12)}`);
  return { kind: 'branch', branch: pushed.branch, commits, head };
}

/** What `desk push` prints, one line each. */
export function pushLines(outcome: PushOutcome): string[] {
  if (outcome.kind === 'nothing') return ['push: nothing to push: main has no commit that origin/main does not have'];
  if (outcome.kind === 'pushed') {
    const again = outcome.retries === 0 ? '' : `, after ${plural(outcome.retries, 'new try', 'new tries')} on top of what was pushed in the meantime`;
    return [`push: pushed ${plural(outcome.commits, 'commit', 'commits')} to origin/main (${outcome.head.slice(0, 12)})${again}`];
  }
  return [
    `push: the ${outcome.commits} ${outcome.commits === 1 ? 'commit' : 'commits'} of this run ${outcome.commits === 1 ? 'is' : 'are'} on the branch ${outcome.branch} of origin (${outcome.head.slice(0, 12)}), and main was not changed`,
    `push: why: ${outcome.why}`,
    'push: open a pull request from that branch into main, or put the commits on main by hand',
  ];
}

/** What `desk push --branch-only` prints about the branch, one line each. */
export function sideLines(outcome: SideOutcome): string[] {
  if (outcome.kind === 'nothing') return ['push: nothing to put on a branch: main has no commit that origin/main does not have'];
  return [`push: the ${plural(outcome.commits, 'commit', 'commits')} of this run ${outcome.commits === 1 ? 'is' : 'are'} on the branch ${outcome.branch} of origin (${outcome.head.slice(0, 12)}), and main was not changed`];
}
