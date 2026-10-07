import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { nodeExec } from '../../src/run/forge';
import { gitRunner } from '../../src/run/push';
import type { GitRunner } from '../../src/run/push';
import { ISOLATED, git } from './repo';

// A made-up GitHub for the tests of what is pushed: a bare repository in a folder as `origin` (no network is ever touched), the checkout that a run works in
// (`work`, on main and following origin/main, as the checkout of the workflow is), and a second checkout (`other`) for whoever else pushes to main while a run is
// working. The two files that matter to a push are there: `desk-state.json`, which every run of the Desk changes, and `a.txt`, which nothing changes.
// Making the three repositories takes a dozen programs, so it is done once for a test file, and each test gets a copy of the folder.

/** The text of the desk state in the made-up repository: one line, so that two changes to it at once cannot be merged. */
export const STATE_START = '{"holds": 0}\n';

export interface Origin {
  /** The bare repository that stands for GitHub. */
  remote: string;
  /** The checkout of the run: on main, following origin/main. */
  work: string;
  /** Another checkout of the same remote, for the push of somebody else. */
  other: string;
  /** Write `text` to `file` in `dir`, and commit it as `message`. */
  commit(dir: string, file: string, text: string, message: string): void;
  /** What a push does: git in `work`, as `pushRun` is given it. */
  run: GitRunner;
  /** The commit that main of the remote is at. */
  remoteHead(): string;
  /** The names of the branches of the remote, in order. */
  remoteBranches(): string[];
}

const who = (name: string): string[] => ['-c', `user.name=${name}`, '-c', `user.email=${name.toLowerCase()}@example.com`, '-c', 'commit.gpgsign=false'];

/** The three repositories, made in `root` with their addresses in it: a remote with one commit on main, and two checkouts of it. */
function build(root: string): void {
  const remote = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  mkdirSync(remote);
  mkdirSync(seed);
  git(remote, 'init', '--quiet', '--bare', '-b', 'main');
  git(seed, 'init', '--quiet', '-b', 'main');
  writeFileSync(path.join(seed, 'a.txt'), 'a\n');
  writeFileSync(path.join(seed, 'desk-state.json'), STATE_START);
  git(seed, 'add', '.');
  git(seed, ...who('Seed'), 'commit', '--quiet', '-m', 'start');
  git(seed, 'push', '--quiet', remote, 'main');
  for (const dir of ['work', 'other']) git(root, 'clone', '--quiet', remote, dir);
}

let template: string | undefined;

function made(root: string): void {
  if (template === undefined) {
    template = mkdtempSync(path.join(tmpdir(), 'desk-origin-'));
    build(template);
    afterAll(() => rmSync(template as string, { recursive: true, force: true }));
  }
  cpSync(template, root, { recursive: true });
  // A checkout names its remote by an address, and the copy has to name its own.
  for (const dir of ['work', 'other']) {
    const config = path.join(root, dir, '.git', 'config');
    writeFileSync(config, readFileSync(config, 'utf8').split(template).join(root));
  }
}

/**
 * A remote with one commit on main, and two checkouts of it. With `{ empty: true }` the remote has nothing in it (a repository that was just made, with no main yet) and
 * `work` has one commit of its own that follows nothing.
 */
export function makeOrigin(root: string, options: { empty?: boolean } = {}): Origin {
  const remote = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  const other = path.join(root, 'other');
  const commit = (dir: string, file: string, text: string, message: string): void => {
    writeFileSync(path.join(dir, file), text);
    git(dir, 'add', file);
    git(dir, ...who(dir === other ? 'Someone' : 'Run'), 'commit', '--quiet', '-m', message);
  };
  if (options.empty === true) {
    mkdirSync(remote);
    mkdirSync(work);
    git(remote, 'init', '--quiet', '--bare', '-b', 'main');
    git(work, 'init', '--quiet', '-b', 'main');
    git(work, 'remote', 'add', 'origin', remote);
    commit(work, 'a.txt', 'a\n', 'start');
  } else {
    made(root);
  }
  return {
    remote,
    work,
    other,
    commit,
    run: gitRunner(nodeExec({ ...ISOLATED, GIT_AUTHOR_NAME: 'Run', GIT_AUTHOR_EMAIL: 'run@example.com', GIT_COMMITTER_NAME: 'Run', GIT_COMMITTER_EMAIL: 'run@example.com' }), work),
    remoteHead: () => git(remote, 'rev-parse', 'main'),
    remoteBranches: () => git(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter((name) => name !== '').sort(),
  };
}
