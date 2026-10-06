import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { sha256Hex } from '../model/types';

// How the Desk commits. The Publish stage and the runs that end in a hold write a few files and commit exactly those, and the rest of the
// repository is none of their business: they name each file, they refuse to start when something else of the Desk's is in the way, and they
// never push (that is for the daily workflow of a later plan). A `GitTarget` is the part of git they use, so that a stage can be tested with a
// `FakeGit` and the real thing, `GitCli`, is tested once, in a repository that a test makes in a temporary folder.

/** The trailer that ends every commit of this project, the Desk's own included: it records which model wrote what. */
export const COMMIT_TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';

export interface GitTarget {
  /** True when none of `paths` (files or folders) has a change that is not committed: nothing modified, staged, deleted or new and not tracked. */
  isClean(paths: readonly string[]): Promise<boolean>;
  /**
   * Commit exactly the files in `paths` with `message` as the subject and `COMMIT_TRAILER` as the trailer, and return the id of the commit.
   * Throws, and commits nothing, when anything else is already staged or when the files have no change.
   */
  commit(paths: readonly string[], message: string): Promise<string>;
}

const run = promisify(execFile);

export interface GitCliOptions {
  /** Variables of the environment for git, laid over those of this process. A test uses it to keep the settings of the machine out. */
  env?: Readonly<Record<string, string>>;
}

/** Git, run as a program in the folder of a repository. Only `isClean` and `commit` are done: there is no way to push, branch or reset. */
export class GitCli implements GitTarget {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly dir: string,
    options: GitCliOptions = {},
  ) {
    // A path is a path and never a pattern; nothing may ask for a password; the messages of git are in the same language everywhere.
    this.env = { ...process.env, ...options.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  }

  /** Run git with these arguments and return what it printed; a failure says which command failed and what git said. */
  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd: this.dir, env: this.env, maxBuffer: 16 * 1024 * 1024 });
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
    // With the files named after the options, git commits those files and nothing else in the index.
    await this.git(['commit', '-m', message, '-m', COMMIT_TRAILER, '--', ...files]);
    return (await this.git(['rev-parse', 'HEAD'])).trim();
  }
}

/** A commit that `FakeGit` was asked to make. */
export interface FakeCommit {
  id: string;
  paths: string[];
  message: string;
}

/** A stand-in for git that tests use: it records the commits it is asked for, and says paths are dirty when a test tells it so. */
export class FakeGit implements GitTarget {
  /** Every commit, in order. */
  readonly commits: FakeCommit[] = [];
  /** The paths that have an uncommitted change. A folder is dirty when a path inside it is, and a path is dirty when a folder that holds it is. */
  readonly dirty = new Set<string>();
  /** When set, the next commit fails with this error (and it is cleared). */
  failNextCommit: Error | undefined;

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
}
