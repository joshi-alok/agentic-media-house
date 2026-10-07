import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sha256Hex } from '../model/types';
import { isHoldBranch } from './branches';

// How the Desk commits. The Publish stage and the runs that end in a hold write a few files and commit exactly those, and the rest of the
// repository is none of their business: they name each file, they refuse to start when something else of the Desk's is in the way, and they
// never push (that is for `ForgeTarget`, which pushes only the branch of a held piece). A `GitTarget` is the part of git they use, so that a stage can be tested with a
// `FakeGit` and the real thing, `GitCli`, is tested once, in a repository that a test makes in a temporary folder.
//
// The one thing that is not a commit on the branch of the checkout is the branch of a held piece, which carries the piece to the owner as a pull request. It is made
// beside the checkout: a commit is built from the commit that the checkout is on and the files of the piece, and a new branch is made to point at it. The working tree,
// the index and the branch that the checkout is on are not touched, so there is no branch to switch back from, and whatever goes wrong, the checkout is as it was.

/** The trailer that ends every commit of this project, the Desk's own included: it records which model wrote what. */
export const COMMIT_TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';

/** The branch that the Desk's commits go on, and that the pull requests of held pieces are opened into. */
export const MAIN_BRANCH = 'main';

/** A file to put on a branch: its path in the repository, and its text as it is written, byte for byte. */
export interface BranchFile {
  path: string;
  text: string;
}

export interface GitTarget {
  /** True when none of `paths` (files or folders) has a change that is not committed: nothing modified, staged, deleted or new and not tracked. */
  isClean(paths: readonly string[]): Promise<boolean>;
  /**
   * Commit exactly the files in `paths` with `message` as the subject and `COMMIT_TRAILER` as the trailer, and return the id of the commit.
   * Throws, and commits nothing, when anything else is already staged or when the files have no change.
   */
  commit(paths: readonly string[], message: string): Promise<string>;
  /** The name of the branch that the checkout is on, or undefined when it is on no branch (HEAD is detached). */
  currentBranch(): Promise<string | undefined>;
  /**
   * Make the branch `branch` from the commit that the checkout is on, with one commit on it, `message` and `COMMIT_TRAILER`, that adds `files`, and return the id of the
   * commit. The working tree, the index and the branch that the checkout is on are not changed. Throws, and makes nothing, when the branch already exists.
   */
  commitToNewBranch(branch: string, files: readonly BranchFile[], message: string): Promise<string>;
  /** Remove a branch, with the settings that follow it. The branch that the checkout is on is not removed, and a branch that is not there is an error. */
  deleteBranch(branch: string): Promise<void>;
}

const run = promisify(execFile);

export interface GitCliOptions {
  /** Variables of the environment for git, laid over those of this process. A test uses it to keep the settings of the machine out. */
  env?: Readonly<Record<string, string>>;
  /** Where the index file for a commit on a new branch is made, for the time the commit takes. The system's folder for temporary files by default. */
  tempDir?: string;
}

/** The names of branches that `GitCli` makes and removes are the names of the branches that `GhForge` pushes (`isHoldBranch`, in `branches.ts`): one pattern for both. No name can start like an option or make a path that goes up. */

/** The id that stands for a reference that is not there yet: `update-ref` with it makes a branch only if there is none. */
const NOT_THERE = '0'.repeat(40);

function assertBranchName(branch: string): void {
  if (!isHoldBranch(branch)) throw new Error(`${JSON.stringify(branch)} is not a branch name that the Desk makes (hold/<day>-<slug>: lowercase letters and digits joined by single hyphens)`);
}

/**
 * Git, run as a program in the folder of a repository. It commits the files it is told to and makes the branch of a held piece beside the checkout; there is no way
 * to push, to switch branches or to reset.
 */
export class GitCli implements GitTarget {
  private readonly env: NodeJS.ProcessEnv;
  private readonly tempDir: string | undefined;

  constructor(
    private readonly dir: string,
    options: GitCliOptions = {},
  ) {
    // A path is a path and never a pattern; nothing may ask for a password; the messages of git are in the same language everywhere.
    this.env = { ...process.env, ...options.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
    this.tempDir = options.tempDir;
  }

  /** Run git with these arguments (and `input` on its standard input, and `env` laid over the environment) and return what it printed; a failure says which command failed and what git said. */
  private async git(args: string[], options: { input?: string; env?: Readonly<Record<string, string>> } = {}): Promise<string> {
    try {
      const pending = run('git', args, { cwd: this.dir, env: options.env === undefined ? this.env : { ...this.env, ...options.env }, maxBuffer: 16 * 1024 * 1024 });
      if (options.input !== undefined) pending.child.stdin?.end(options.input);
      const { stdout } = await pending;
      return stdout;
    } catch (error) {
      const failure = error as { stderr?: string; message: string };
      throw new Error(`git ${args[0]} failed: ${(failure.stderr ?? failure.message).trim()}`);
    }
  }

  /** The paths as git wants them: relative to the repository, with forward slashes. A path outside the repository, or the repository itself, is refused. */
  private relative(paths: readonly string[]): string[] {
    if (paths.length === 0) throw new Error('git needs at least one path: the Desk names the files it commits');
    return paths.map((given) => {
      const relative = path.relative(this.dir, path.resolve(this.dir, given));
      if (relative === '') throw new Error(`"${given}" is the whole repository, and the Desk commits only the files it names`);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`"${given}" is not inside the repository ${this.dir}`);
      return relative.split(path.sep).join('/');
    });
  }

  async isClean(paths: readonly string[]): Promise<boolean> {
    const status = await this.git(['status', '--porcelain', '--untracked-files=all', '--', ...this.relative(paths)]);
    return status.trim() === '';
  }

  async commit(paths: readonly string[], message: string): Promise<string> {
    const files = this.relative(paths);
    if (message.trim() === '') throw new Error('a commit needs a message');
    // In the short form of `status`, the first of the two letters before a file is its state in the index: a space for a file that is not staged.
    const staged = (await this.git(['status', '--porcelain', '--untracked-files=no']))
      .split('\n')
      .filter((line) => line !== '' && line[0] !== ' ')
      .map((line) => line.slice(3));
    if (staged.length > 0) throw new Error(`the repository already has changes staged that are not the Desk's (${staged.join(', ')}), so the Desk does not commit`);
    await this.git(['add', '--', ...files]);
    try {
      // With the files named after the options, git commits those files and nothing else in the index.
      await this.git(['commit', '-m', message, '-m', COMMIT_TRAILER, '--', ...files]);
    } catch (error) {
      // A commit that fails (a hook that refuses it, a disk that is full) leaves the files staged, and the next commit of the Desk would refuse because something is staged
      // that is not its own. The index is put back for these files, and only these; nothing is changed in the files themselves.
      await this.git(['reset', '--quiet', '--', ...files]).catch(() => undefined);
      throw error;
    }
    return (await this.git(['rev-parse', 'HEAD'])).trim();
  }

  async currentBranch(): Promise<string | undefined> {
    return (await this.git(['branch', '--show-current'])).trim() || undefined;
  }

  async commitToNewBranch(branch: string, files: readonly BranchFile[], message: string): Promise<string> {
    assertBranchName(branch);
    if (files.length === 0) throw new Error('a commit on a branch needs at least one file');
    if (message.trim() === '') throw new Error('a commit needs a message');
    const paths = this.relative(files.map((file) => file.path));
    if (new Set(paths).size !== paths.length) throw new Error('a commit on a branch is given the same file twice');
    const there = (await this.git(['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`])).split('\n');
    if (there.includes(`refs/heads/${branch}`)) throw new Error(`the branch ${branch} already exists, so the Desk does not make it again`);
    const parent = (await this.git(['rev-parse', '--verify', 'HEAD'])).trim();
    // The tree of the new commit is made in an index file of its own, in a folder that is removed after, so that the index of the checkout is never read or written.
    const folder = await mkdtemp(path.join(this.tempDir ?? os.tmpdir(), 'desk-index-'));
    try {
      const env = { GIT_INDEX_FILE: path.join(folder, 'index') };
      await this.git(['read-tree', parent], { env });
      for (const [at, file] of files.entries()) {
        const blob = (await this.git(['hash-object', '-w', '--stdin'], { input: file.text })).trim();
        await this.git(['update-index', '--add', '--cacheinfo', `100644,${blob},${paths[at]}`], { env });
      }
      const tree = (await this.git(['write-tree'], { env })).trim();
      const commit = (await this.git(['commit-tree', tree, '-p', parent, '-m', message, '-m', COMMIT_TRAILER])).trim();
      await this.git(['update-ref', `refs/heads/${branch}`, commit, NOT_THERE]);
      return commit;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  async deleteBranch(branch: string): Promise<void> {
    assertBranchName(branch);
    await this.git(['branch', '-D', branch]);
  }
}

/** A commit that `FakeGit` was asked to make. */
export interface FakeCommit {
  id: string;
  paths: string[];
  message: string;
}

/** A commit on a new branch that `FakeGit` was asked to make. */
export interface FakeBranchCommit {
  id: string;
  branch: string;
  files: BranchFile[];
  message: string;
}

/**
 * A stand-in for git that tests use: it records the commits it is asked for, and says paths are dirty when a test tells it so. It keeps the names of the branches and
 * which one the checkout is on, and nothing of their files: a test that needs the files of a branch makes a repository and uses `GitCli`.
 */
export class FakeGit implements GitTarget {
  /** Every commit, in order. */
  readonly commits: FakeCommit[] = [];
  /** Every commit on a new branch, in order. */
  readonly branchCommits: FakeBranchCommit[] = [];
  /** The branches that exist, and the one that the checkout is on (undefined for a checkout on no branch). */
  readonly branches = new Set<string>([MAIN_BRANCH]);
  branch: string | undefined = MAIN_BRANCH;
  /** The paths that have an uncommitted change. A folder is dirty when a path inside it is, and a path is dirty when a folder that holds it is. */
  readonly dirty = new Set<string>();
  /** When set, the next commit fails with this error (and it is cleared). */
  failNextCommit: Error | undefined;
  /** When set, the next commit on a new branch fails with this error (and it is cleared). */
  failNextBranchCommit: Error | undefined;

  async isClean(paths: readonly string[]): Promise<boolean> {
    const overlaps = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
    return !paths.some((given) => [...this.dirty].some((dirty) => overlaps(given, dirty)));
  }

  async commit(paths: readonly string[], message: string): Promise<string> {
    if (this.failNextCommit !== undefined) {
      const error = this.failNextCommit;
      this.failNextCommit = undefined;
      throw error;
    }
    const id = sha256Hex(`fake commit ${this.commits.length + 1}`).slice(0, 40);
    this.commits.push({ id, paths: [...paths], message });
    return id;
  }

  async currentBranch(): Promise<string | undefined> {
    return this.branch;
  }

  async commitToNewBranch(branch: string, files: readonly BranchFile[], message: string): Promise<string> {
    assertBranchName(branch);
    if (this.failNextBranchCommit !== undefined) {
      const error = this.failNextBranchCommit;
      this.failNextBranchCommit = undefined;
      throw error;
    }
    if (this.branches.has(branch)) throw new Error(`the branch ${branch} already exists, so the Desk does not make it again`);
    const id = sha256Hex(`fake branch commit ${this.branchCommits.length + 1}`).slice(0, 40);
    this.branchCommits.push({ id, branch, files: files.map((file) => ({ ...file })), message });
    this.branches.add(branch);
    return id;
  }

  async deleteBranch(branch: string): Promise<void> {
    assertBranchName(branch);
    if (branch === this.branch) throw new Error(`the branch ${branch} is the one that the checkout is on, so it is not removed`);
    if (!this.branches.delete(branch)) throw new Error(`the branch ${branch} is not there`);
  }
}
