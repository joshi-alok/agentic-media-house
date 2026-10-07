import { execFileSync } from 'node:child_process';
import { GitCli } from '../../src/run/git';

// A real git repository for the tests that need one: the checkout of the site that `makeSite` made, committed once, with no remote, so that nothing can be pushed.
// The settings of the machine that runs the tests (who signs, which hooks) are kept out of it.

/** Keeps the settings of the machine out of every git command of these tests. */
export const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

/** Run git in `dir` and return what it printed, without the line ending at the end. */
export const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();

/** The text of a file at a revision, exactly as it is stored: `show(dir, 'main:README.md')`. */
export const show = (dir: string, spec: string): string => execFileSync('git', ['show', spec], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } });

/** Make `dir` a repository on `main` that has everything in it committed, as one commit called `start`, and return the `GitCli` that the Desk commits with there. */
export function initRepo(dir: string): GitCli {
  git(dir, 'init', '--quiet', '-b', 'main');
  git(dir, 'config', 'user.name', 'Test Committer');
  git(dir, 'config', 'user.email', 'committer@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '.');
  git(dir, 'commit', '--quiet', '-m', 'start');
  return new GitCli(dir, { env: ISOLATED });
}

/** The names of the branches, in order. */
export const branchesIn = (dir: string): string[] => git(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').sort();

/** The files that have a change that is not committed, as `git status` says them (the first two characters of a line are the state, so the lines are not trimmed), in order. */
export const changesIn = (dir: string): string[] =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } })
    .split('\n')
    .filter((line) => line !== '')
    .sort();

/** The subjects of the commits that lead to `ref`, newest first. */
export const subjectsOf = (dir: string, ref = 'main'): string[] => git(dir, 'log', '--format=%s', ref).split('\n');
