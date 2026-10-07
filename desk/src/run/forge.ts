import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The forge is where a piece that the Desk held is sent to the owner: a branch is pushed and a draft pull request is opened on GitHub. Everything that goes
// outward goes through `ForgeTarget`, so that the stages can be tested with `FakeForge` and nothing is pushed. `GhForge` is the real one, and it runs `git` and `gh`
// as programs with a list of arguments, never as a line for a shell. That matters because the title and the body of a pull request are made from sentences that
// a model wrote: they are the one place where the words of a model could become a command, and they are never joined into a string. The title is one
// argument, the body is a file, and the branch is held to a shape (`HOLD_BRANCH`) before any program is started.

/** A branch that the Desk pushes: `hold/<day>-<slug>`. Nothing else is ever pushed or named in a pull request. */
export const HOLD_BRANCH = /^hold\/\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,80}$/;

/** The most characters of a slug that the name of a branch has. */
const SLUG_IN_BRANCH = 80;

/** The name of the branch for the piece `slug` that was held on `date` (YYYY-MM-DD). A slug longer than 80 characters is cut. */
export function holdBranchName(date: string, slug: string): string {
  const moment = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(moment.getTime()) || moment.toISOString().slice(0, 10) !== date) {
    throw new Error(`holdBranchName: "${date}" is not a day written YYYY-MM-DD`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`holdBranchName: "${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
  return `hold/${date}-${slug.slice(0, SLUG_IN_BRANCH)}`;
}

/** Why the forge could not do what it was asked. */
export type ForgeFailure =
  | 'bad-input' // the Desk refused to run anything: the branch, the base or the title is not one that it will pass on
  | 'no-remote' // the repository has no remote to push to
  | 'auth' // GitHub or git did not take the credentials, or there are none
  | 'branch-exists' // the branch is already on the remote, with other commits
  | 'pr-exists' // there is already a pull request for the branch
  | 'tool-missing' // git or gh cannot be started
  | 'failed'; // anything else, with what the program said

/** The error of every failure of the forge, with the kind of failure. The message never has a password or a token in it. */
export class ForgeError extends Error {
  readonly kind: ForgeFailure;

  constructor(kind: ForgeFailure, message: string) {
    super(message);
    this.name = 'ForgeError';
    this.kind = kind;
  }
}

/** What the Desk asks of GitHub for a piece that it held: a draft pull request from `branch` into `base`. */
export interface PullRequestRequest {
  branch: string;
  /** One line. Text that came from a model is allowed: it is passed as one argument and never joined into anything. */
  title: string;
  /** Markdown, of any length that GitHub takes. It is passed as a file. */
  body: string;
  base: string;
}

/** A pull request that was opened. */
export interface PullRequest {
  url: string;
  number: number;
}

export interface ForgeTarget {
  /** True when the repository has a remote called `origin`: the branch can be pushed there. */
  hasRemote(): Promise<boolean>;
  /** Push the branch to `origin` and make it follow the remote one. Never forces: a branch that is there with other commits is an error. */
  pushBranch(branch: string): Promise<void>;
  /** Open a draft pull request, and say where it is. Never marks it ready: that is the owner's to do. */
  openDraftPullRequest(request: PullRequestRequest): Promise<PullRequest>;
}

/** The longest title that GitHub takes. */
const MAX_TITLE = 256;

/** A title as GitHub shows it: one line, with every control character and line separator taken for a space and runs of spaces made one, and no space at either end. */
function oneLine(title: string): string {
  return title
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * Check a request before anything is run for it, and give the title as it will be passed. The branch must be a hold branch (`HOLD_BRANCH`), the base a plain
 * branch name that does not start with a hyphen, and the title not empty, no longer than GitHub takes, and not starting with a hyphen, so that no program
 * can take it for an option. Throws a `ForgeError` of the kind `bad-input`.
 */
export function checkPullRequest(request: PullRequestRequest): { title: string } {
  assertHoldBranch(request.branch);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(request.base) || request.base.includes('..')) {
    throw new ForgeError('bad-input', `the base ${JSON.stringify(request.base)} is not a plain branch name, so no pull request is opened`);
  }
  const title = oneLine(request.title);
  if (title === '') throw new ForgeError('bad-input', 'the title of the pull request is empty, so no pull request is opened');
  if (title.length > MAX_TITLE) throw new ForgeError('bad-input', `the title of the pull request is ${title.length} characters, and GitHub takes ${MAX_TITLE}, so no pull request is opened`);
  if (title.startsWith('-')) throw new ForgeError('bad-input', 'the title of the pull request starts with a hyphen, which a program could take for an option, so no pull request is opened');
  return { title };
}

/** Refuse a branch that is not a hold branch, before any program is run for it. */
export function assertHoldBranch(branch: string): void {
  if (!HOLD_BRANCH.test(branch)) throw new ForgeError('bad-input', `${JSON.stringify(branch)} is not a hold branch (hold/<day>-<slug>), and the Desk pushes nothing else`);
}

/** A stand-in for the forge that tests use. */
export type ForgeCall =
  | { method: 'hasRemote' }
  | { method: 'pushBranch'; branch: string }
  | { method: 'openDraftPullRequest'; request: PullRequestRequest };

/**
 * A forge that does nothing but record what it was asked, and fail when a test says so. It holds a branch and a request to the same rules as `GhForge`
 * (a call that the real forge would refuse before running anything is refused here, and not recorded), and numbers its pull requests from 1.
 */
export class FakeForge implements ForgeTarget {
  /** Every call that was accepted, in order. */
  readonly calls: ForgeCall[] = [];
  /** What `hasRemote` answers. */
  remote = true;
  private readonly failures = new Map<ForgeCall['method'], Error>();
  private opened = 0;

  /** The next call of `method` fails with `error`; the call after it does not. A failing call is recorded like any other. */
  fail(method: ForgeCall['method'], error: Error): void {
    this.failures.set(method, error);
  }

  private maybeFail(method: ForgeCall['method']): void {
    const error = this.failures.get(method);
    if (error === undefined) return;
    this.failures.delete(method);
    throw error;
  }

  async hasRemote(): Promise<boolean> {
    this.calls.push({ method: 'hasRemote' });
    this.maybeFail('hasRemote');
    return this.remote;
  }

  async pushBranch(branch: string): Promise<void> {
    assertHoldBranch(branch);
    this.calls.push({ method: 'pushBranch', branch });
    this.maybeFail('pushBranch');
  }

  async openDraftPullRequest(request: PullRequestRequest): Promise<PullRequest> {
    checkPullRequest(request);
    this.calls.push({ method: 'openDraftPullRequest', request: { ...request } });
    this.maybeFail('openDraftPullRequest');
    this.opened += 1;
    return { url: `https://github.example/agentic-media-house/pull/${this.opened}`, number: this.opened };
  }
}

/** What a program printed and how it ended. A program that ends with a code other than 0 is a result, not an error. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ExecOptions {
  /** The folder to run in: the root of the repository. */
  cwd?: string;
}

/**
 * Run a program: `file` and a list of arguments, never a line for a shell. It resolves with the result whatever the exit code is, and rejects only when the
 * program could not be started (the error has the code `ENOENT` when it is not there) or was stopped.
 */
export type Exec = (file: string, args: readonly string[], options: ExecOptions) => Promise<ExecResult>;

/** The longest that `git` or `gh` may run before it is stopped, and the most output that is kept. */
const EXEC_TIMEOUT_MS = 120_000;
const EXEC_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * The real `Exec`: `execFile`, which starts the program itself with the arguments as they are and never goes through a shell. The program is kept from asking
 * anything of a person (`git` for a password, `gh` for a choice), from colouring its output and from translating it, so that a run in a workflow cannot wait
 * for an answer and what it prints can be read. `environment` is laid over the environment of this process.
 */
export function nodeExec(environment: Readonly<Record<string, string>> = {}): Exec {
  const env: NodeJS.ProcessEnv = { ...process.env, ...environment, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', LC_ALL: 'C' };
  return (file, args, options) =>
    new Promise((resolve, reject) => {
      execFile(file, [...args], { cwd: options.cwd, env, maxBuffer: EXEC_MAX_BUFFER, timeout: EXEC_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error === null) resolve({ stdout, stderr, code: 0 });
        else if (typeof (error as { code?: unknown }).code === 'number') resolve({ stdout, stderr, code: (error as { code: number }).code });
        else reject(error);
      });
    });
}

/** What a program said, to put in a message: the first three non-empty lines, one after the other, with the password or token of an address taken out. */
export function said(stderr: string): string {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 3)
    .join(' ')
    .replace(/(https?:\/\/)[^\s/@']+@/g, '$1***@');
}

const NEEDS_LOGIN = /gh auth login|Bad credentials|HTTP 401|HTTP 403|not logged in|Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey\)|Permission to .* denied|error: 403|error: 401/i;
const NO_REMOTE = /does not appear to be a git repository|No configured push destination|No such remote|none of the git remotes|no git remotes found/i;
const BRANCH_THERE = /\[rejected\]|non-fast-forward|fetch first/i;
const PULL_REQUEST_THERE = /already exists/i;

/** Which failure the complaint of `git push` is. Login is looked for first, because a refused login also says that the remote could not be read. */
function classifyPush(stderr: string): 'auth' | 'no-remote' | 'branch-exists' | 'failed' {
  if (NEEDS_LOGIN.test(stderr)) return 'auth';
  if (NO_REMOTE.test(stderr)) return 'no-remote';
  if (BRANCH_THERE.test(stderr)) return 'branch-exists';
  return 'failed';
}

/** Which failure the complaint of `gh pr create` is. */
function classifyCreate(stderr: string): 'auth' | 'no-remote' | 'pr-exists' | 'failed' {
  if (PULL_REQUEST_THERE.test(stderr)) return 'pr-exists';
  if (NEEDS_LOGIN.test(stderr)) return 'auth';
  if (NO_REMOTE.test(stderr)) return 'no-remote';
  return 'failed';
}

/** Whether `error` says that a program is not there. */
const isMissing = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT';

export interface GhForgeOptions {
  /** The root of the repository, where `git` and `gh` are run. */
  cwd?: string;
  /** Where the file with the body of a pull request is made for the time `gh` reads it. The system's folder for temporary files by default. */
  tempDir?: string;
}

/** The address that `gh pr create` prints when it has made the pull request, as the last line of what it prints. */
const PULL_REQUEST_ADDRESS = /^(https:\/\/[^\s/]+\/[^\s]+\/pull\/(\d+))$/;

/**
 * The forge of GitHub, through the `git` and `gh` programs. Every command is one program with a list of arguments (see `Exec`): `git remote get-url origin`,
 * `git push -u origin <branch>` and `gh pr create --draft --base <base> --head <branch> --title <title> --body-file <file>`. The body goes through a file in a folder
 * that is made for the one call and removed after it, and the branch, the base and the title are checked first (`checkPullRequest`). Which failure is which is read
 * from what the program said; a failure that is not one of the known kinds is `failed`, with the first lines of what was said.
 */
export class GhForge implements ForgeTarget {
  constructor(
    private readonly exec: Exec,
    private readonly options: GhForgeOptions = {},
  ) {}

  /** Run a program, and turn a program that cannot be started into the error of the forge. */
  private async run(file: 'git' | 'gh', args: string[]): Promise<ExecResult> {
    try {
      return await this.exec(file, args, this.options.cwd === undefined ? {} : { cwd: this.options.cwd });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      throw new ForgeError(isMissing(error) ? 'tool-missing' : 'failed', `${file} cannot be started: ${why}`);
    }
  }

  async hasRemote(): Promise<boolean> {
    const result = await this.run('git', ['remote', 'get-url', 'origin']);
    if (result.code === 0) return true;
    // `git remote get-url` ends with 2 for a remote that does not exist. Any other failure (not a repository, a broken configuration) is not an answer.
    if (result.code === 2) return false;
    throw new ForgeError('failed', `git remote get-url origin failed (exit code ${result.code}): ${said(result.stderr)}`);
  }

  async pushBranch(branch: string): Promise<void> {
    assertHoldBranch(branch);
    const result = await this.run('git', ['push', '-u', 'origin', branch]);
    if (result.code === 0) return;
    const kind = classifyPush(result.stderr);
    const what = {
      auth: `GitHub did not take the credentials, so ${branch} was not pushed`,
      'no-remote': `the repository has no remote called origin, so ${branch} was not pushed`,
      'branch-exists': `${branch} is already on the remote with other commits, so it was not pushed (the Desk never forces a push)`,
      failed: `git push of ${branch} failed (exit code ${result.code})`,
    }[kind];
    throw new ForgeError(kind, `${what}: ${said(result.stderr)}`);
  }

  async openDraftPullRequest(request: PullRequestRequest): Promise<PullRequest> {
    const { title } = checkPullRequest(request);
    const folder = await mkdtemp(path.join(this.options.tempDir ?? os.tmpdir(), 'desk-pr-'));
    try {
      const bodyFile = path.join(folder, 'body.md');
      await writeFile(bodyFile, request.body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      const result = await this.run('gh', ['pr', 'create', '--draft', '--base', request.base, '--head', request.branch, '--title', title, '--body-file', bodyFile]);
      if (result.code !== 0) {
        const kind = classifyCreate(result.stderr);
        const there = /https:\/\/\S+\/pull\/\d+/.exec(result.stderr)?.[0];
        const what = {
          auth: `GitHub did not take the credentials, so no pull request was opened for ${request.branch}`,
          'no-remote': `gh finds no GitHub remote, so no pull request was opened for ${request.branch}`,
          'pr-exists': `there is already a pull request for ${request.branch}${there === undefined ? '' : ` (${there})`}`,
          failed: `gh pr create for ${request.branch} failed (exit code ${result.code})`,
        }[kind];
        throw new ForgeError(kind, `${what}: ${said(result.stderr)}`);
      }
      const last = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .at(-1);
      const match = last === undefined ? null : PULL_REQUEST_ADDRESS.exec(last);
      if (match === null) throw new ForgeError('failed', `gh did not print the address of the pull request for ${request.branch}, so the Desk does not know where it is: ${said(result.stdout) || 'it printed nothing'}`);
      return { url: match[1] as string, number: Number(match[2]) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}
