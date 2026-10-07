## Plan 2b (part 3) — Hold pull requests and retraction

**Goal:** a piece that the Desk will not publish by itself must reach the owner, and a piece that is published and turns out to be wrong must be correctable in public. Today a held piece is only a file in the folder of the run and a line in the desk state, and on a machine that starts from a fresh checkout every day (a scheduled workflow) that folder is gone when the run ends. This part makes a hold a **draft pull request**: a branch `hold/<day>-<slug>` that carries the piece exactly as it would have been published, a pull request text that says why it was held, and nothing on `main` but the record of the hold. The owner publishes the piece by marking the pull request ready and merging it, and discards it by closing it. The second half of the part is the way back: `desk retract <slug> --reason <text>` records a correction or a retraction in the desk state and in the piece, and never deletes anything.

| Task | What it does |
|---|---|
| 11 | `ForgeTarget`: the one interface that the Desk uses to reach GitHub (push a branch, open a draft pull request, say whether there is a remote), `FakeForge` for tests, and `GhForge`, which runs `git` and `gh` as programs with a list of arguments, so that no sentence of a model can become a command. |
| 12 | `renderHeldPiece` writes a held draft as the two files of a piece, with `release: 'owner'`, so that merging it publishes a piece that the site accepts; `holdPrTitle` and `holdPrBody` write the text of the pull request, with everything a model wrote in a fenced block. |
| 13 | The hold flow: a held run that is not dry and has a forge commits the piece to a new branch without touching the checkout, pushes it, opens the draft pull request, and records the hold in the desk state with the address of the pull request. A failed forge step ends the run as `failed` at the stage `hold` and leaves `main` as it was. |
| 14 | `desk retract <slug> --reason <text> [--kind correction\|retraction] [--dry]`: the correction goes into the desk state and `updatedAt` into the frontmatter of the piece, in one commit. |
| 15 | The usage text, the README, and two more scenarios of the adversarial matrix: a title with shell characters that reaches `GhForge`, and a held run when the forge is down. |
| 16 | What each outcome (published, held, no story, failed) commits and where, as a table that real runs make and a test checks, and the whole check. |

**Starting state:** Plans 1 and 2 are built, and so are parts 1 and 2 of this plan (Tasks 1 to 10). `npm run typecheck`, `npm test`, `npm run evals:seeded` (61 of 61 cases caught), `npm run fixtures:check` and `npm run verify` pass. Today a held run commits the desk state alone, `desk run` never pushes or opens anything, `GitTarget` can only say whether paths are clean and commit them, and nothing can record a correction.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/desk -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, the README or a fixture; where a test needs one, it uses `String.fromCharCode`. After you create a file, `LC_ALL=C grep -n '[^[:print:][:space:]]' <file>` must print nothing.
- **No network, no key, no GitHub.** Nothing in this part pushes, opens a pull request or reads a credential. Every test gives the code a stand-in for GitHub (`FakeForge`, or `GhForge` over a scripted `Exec` that starts no program) and, where a test needs git, a repository that the test makes for itself in a temporary folder with no remote.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** this part adds no package.

---

### Task 11: ForgeTarget, the way to GitHub

**Files:**
- Create: `desk/src/run/forge.ts` (`ForgeTarget`, `FakeForge`, `GhForge`, `nodeExec`, `ForgeError`, `HOLD_BRANCH`, `holdBranchName`, `assertHoldBranch`, `checkPullRequest`)
- Create: `desk/test/run/forge.test.ts`, `desk/test/support/exec.ts` (a stand-in for running programs)
- Modify: `desk/src/index.ts` (exports it)
- Test: `desk/test/fetch/exports.test.ts`

A held piece has to reach the owner, and the way it does is a **pull request**: the piece is put on a branch of its own, the branch is pushed to the remote (`origin`, which is the repository on GitHub) and a draft pull request is opened from it into `main`. The owner reads it, and either marks it ready and merges it (the piece is published) or closes it (it is discarded). This task builds only the way to GitHub, and no stage uses it yet.

Everything that goes outward goes through one interface, `ForgeTarget`, with three methods: `hasRemote()`, `pushBranch(branch)` and `openDraftPullRequest({ branch, title, body, base })`, which resolves to the address and the number of the pull request. `FakeForge` is the stand-in that the tests of the Desk use: it records what it was asked and fails when a test says so, and it holds every branch and request to the same rules as the real one. `GhForge` is the real one. It runs the programs `git` and `gh` (the command line of GitHub) and it is given the function that runs a program, `Exec`, so that a test can give it a script instead and no program is started. Three commands are all it ever runs:

- `git remote get-url origin` (is there a remote? exit code 0 means yes, 2 means there is none)
- `git push -u origin <branch>`
- `gh pr create --draft --base <base> --head <branch> --title <title> --body-file <file>`

The title and the body of a pull request are made from sentences that a model wrote, so they are the place where the words of a model could become a command. Three rules keep them from it. A program is started with a **list of arguments**, never with a line for a shell, so `$(...)`, quotes, semicolons and backticks in a title are only letters. The body is written to a file that is made for the one call and removed after it, and `gh` is told to read the file, so the body is in no argument at all. And the branch, the base and the title are **checked before any program is started**: a branch must be `hold/<day>-<slug>` (`HOLD_BRANCH`, the only kind of branch the Desk ever pushes), a base must be a plain branch name, and a title is made one line and refused when it is empty, longer than the 256 characters that GitHub takes, or starts with a hyphen (which a program could take for an option).

A failure is a `ForgeError` with a `kind` that says what is wrong, read from what the program printed: `no-remote`, `auth` (not logged in, or the credentials were refused), `branch-exists` (the branch is on the remote with other commits; the Desk never forces a push), `pr-exists` (and the message says where it is), `tool-missing` (`git` or `gh` cannot be started), `bad-input` (refused before anything was run) or `failed` (anything else, with the first lines of what the program said, and with the password or token of an address taken out). Three of the messages that the tests give the forge were printed by `git` 2.50 and `gh` 2.87 when the plan was verified (git pushing with no remote, `git remote get-url` for a remote that is not there, and `gh` not logged in); the others are the messages that those programs are known to print for the case. A message that is not recognised is not a danger: the failure is then `failed`, with the first lines of what the program said, and the first real run of the Desk is what shows which messages GitHub really sends.

- [ ] **Step 1: Write the tests**

The stand-in for running programs. It answers each call with the reply that a test scripted, in order, and keeps the calls, so that a test can say exactly which program was run with which arguments.

**Create `desk/test/support/exec.ts`:**
```ts
import type { Exec } from '../../src/run/forge';

// A stand-in for running a program, for the tests of the code that runs `git` and `gh`. It answers each call with the reply that the test scripted for
// it, in order, and keeps every call, so that a test can say exactly which program was run with which arguments. No program is ever started.

/** One call of the program: what was run, with which arguments, in which folder. */
export interface ExecCall {
  file: string;
  args: string[];
  cwd: string | undefined;
}

/** What a call answers: the exit code and what the program printed, or a failure to start it at all (an `Error`), or a function that makes either from the call. */
export type ExecReply = { code: number; stdout?: string; stderr?: string } | Error;
export type ScriptedReply = ExecReply | ((call: ExecCall) => ExecReply | Promise<ExecReply>);

/** The `Exec` that gives `replies` in order, and the list of the calls it has had. A call with no reply left throws, and says which call it was. */
export function scriptedExec(...replies: ScriptedReply[]): { exec: Exec; calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  let next = 0;
  const exec: Exec = async (file, args, options) => {
    const call: ExecCall = { file, args: [...args], cwd: options.cwd };
    calls.push(call);
    const scripted = replies[next++];
    if (scripted === undefined) throw new Error(`scriptedExec: there is no reply for call ${next}: ${file} ${args.join(' ')}`);
    const reply = typeof scripted === 'function' ? await scripted(call) : scripted;
    if (reply instanceof Error) throw reply;
    return { stdout: reply.stdout ?? '', stderr: reply.stderr ?? '', code: reply.code };
  };
  return { exec, calls };
}
```

The tests of the forge. Read the hostile texts at the top: every one of them is run through the title and through the body.

**Create `desk/test/run/forge.test.ts`:**
```ts
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeForge, ForgeError, GhForge, HOLD_BRANCH, holdBranchName, nodeExec } from '../../src/run/forge';
import type { ForgeTarget } from '../../src/run/forge';
import { useScratch } from '../support/context';
import { scriptedExec } from '../support/exec';

// The forge is where a held piece is sent to the owner: a branch is pushed and a draft pull request is opened. Everything outward goes through `ForgeTarget`, so
// the tests of the Desk use `FakeForge`, and `GhForge`, which runs `git` and `gh`, is tested here with a stand-in for running programs: no program is started
// and nothing is pushed. What these tests pin down is the exact list of arguments of every command, because that list is all that stands between a sentence
// that a model wrote and a program that is run.

const scratch = useScratch();
const BRANCH = 'hold/2026-10-05-fixture-robotics-second-plant';
const URL = 'https://github.com/example/agentic-media-house/pull/12';
const CWD = '/repository';

/** The messages that git and gh print, as they were printed by git 2.50 and gh 2.87 when the thing happened. */
const GIT_NO_REMOTE = "fatal: 'origin' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n";
const GIT_NO_SUCH_REMOTE = "error: No such remote 'origin'\n";
const GH_NO_LOGIN = 'To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.\n';

/** Texts that a model could write, and that a shell, a markdown reader or a command line would each take for something else. */
const HOSTILE = [
  'Robot "FX-1" opens it\'s second plant',
  'first line\nsecond line\r\nthird line',
  'a `backtick` and ``two`` and ```three```',
  '$(touch /tmp/pwned) and ${HOME} and $HOME and `id`',
  '; rm -rf / && echo pwned | cat > /tmp/x # trailing',
  '@everyone see #1 and [a link](http://evil.example/x)',
  'back\\slash and %s and %n and {{ template }} and <b>tags</b>',
];

/** What a title becomes: one line, with no control character and no space at either end or twice in a row. */
const oneLine = (title: string): string => title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/ +/g, ' ').trim();

describe('the branch of a hold', () => {
  it('is hold/<day>-<slug>: the only kind of branch the Desk pushes', () => {
    expect(holdBranchName('2026-10-05', 'fixture-robotics-second-plant')).toBe(BRANCH);
    expect(HOLD_BRANCH.test(BRANCH)).toBe(true);
    expect(HOLD_BRANCH.source).toBe('^hold\\/\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]{1,80}$');
  });

  it('is cut at 80 characters of the slug, so that a long title still has a branch', () => {
    const branch = holdBranchName('2026-10-05', `${'a'.repeat(60)}-${'b'.repeat(60)}`);
    expect(branch).toBe(`hold/2026-10-05-${'a'.repeat(60)}-${'b'.repeat(19)}`);
    expect(HOLD_BRANCH.test(branch)).toBe(true);
  });

  it('is not made from a day that is not a day or a slug that is not a plain slug, because both end up as the name of a branch', () => {
    expect(() => holdBranchName('2026-13-45', 'slug')).toThrow('"2026-13-45" is not a day');
    expect(() => holdBranchName('5 Oct 2026', 'slug')).toThrow('is not a day');
    expect(() => holdBranchName('2026-10-05', 'Not Plain')).toThrow('"Not Plain" is not a plain slug');
    expect(() => holdBranchName('2026-10-05', '../main')).toThrow('is not a plain slug');
    expect(() => holdBranchName('2026-10-05', '')).toThrow('is not a plain slug');
  });

  it.each([
    'main',
    'hold/2026-10-05-',
    'hold/2026-10-05-UPPER',
    'hold/2026-10-05-a b',
    'hold/2026-10-05-a;b',
    'hold/2026-10-05-a\nb',
    'hold/2026-10-05-a/../b',
    'hold/2026-10-05-a.lock',
    'hold/26-10-05-slug',
    'refs/heads/hold/2026-10-05-slug',
    ' hold/2026-10-05-slug',
    '--hold/2026-10-05-slug',
    `hold/2026-10-05-${'a'.repeat(81)}`,
  ])('is not %j', (branch) => {
    expect(HOLD_BRANCH.test(branch)).toBe(false);
  });
});

describe('GhForge.hasRemote', () => {
  it('asks git for the address of origin, as a list of arguments, in the folder of the repository, and is true when git knows it', async () => {
    const { exec, calls } = scriptedExec({ code: 0, stdout: 'https://github.com/example/agentic-media-house.git\n' });
    expect(await new GhForge(exec, { cwd: CWD }).hasRemote()).toBe(true);
    expect(calls).toEqual([{ file: 'git', args: ['remote', 'get-url', 'origin'], cwd: CWD }]);
  });

  it('is false when git says there is no such remote (exit code 2), which is not an error', async () => {
    const { exec } = scriptedExec({ code: 2, stderr: GIT_NO_SUCH_REMOTE });
    expect(await new GhForge(exec).hasRemote()).toBe(false);
  });

  it('is an error when git cannot be run at all, or fails in another way: the Desk does not guess that there is no remote', async () => {
    const missing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    await expect(new GhForge(scriptedExec(missing).exec).hasRemote()).rejects.toMatchObject({ name: 'ForgeError', kind: 'tool-missing' });
    await expect(new GhForge(scriptedExec({ code: 128, stderr: 'fatal: not a git repository (or any of the parent directories): .git\n' }).exec).hasRemote()).rejects.toMatchObject({ kind: 'failed' });
  });
});

describe('GhForge.pushBranch', () => {
  it('runs git push -u origin <branch>, as a list of arguments, and nothing else', async () => {
    const { exec, calls } = scriptedExec({ code: 0, stderr: `branch '${BRANCH}' set up to track 'origin/${BRANCH}'.\n` });
    await new GhForge(exec, { cwd: CWD }).pushBranch(BRANCH);
    expect(calls).toEqual([{ file: 'git', args: ['push', '-u', 'origin', BRANCH], cwd: CWD }]);
  });

  it.each([
    ['there is no remote', { code: 128, stderr: GIT_NO_REMOTE }, 'no-remote'],
    ['git has nowhere to push to', { code: 128, stderr: 'fatal: No configured push destination.\n' }, 'no-remote'],
    ['GitHub does not take the credentials', { code: 128, stderr: "remote: Permission to example/agentic-media-house.git denied to someone.\nfatal: unable to access 'https://github.com/example/agentic-media-house.git/': The requested URL returned error: 403\n" }, 'auth'],
    ['git is not allowed to ask for a password', { code: 128, stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled\n" }, 'auth'],
    ['the branch is already there with other commits', { code: 1, stderr: ` ! [rejected]        ${BRANCH} -> ${BRANCH} (non-fast-forward)\nerror: failed to push some refs to 'https://github.com/example/agentic-media-house.git'\n` }, 'branch-exists'],
    ['something else goes wrong', { code: 1, stderr: 'fatal: the remote end hung up unexpectedly\n' }, 'failed'],
  ] as const)('says what is wrong when %s', async (_what, reply, kind) => {
    const { exec } = scriptedExec(reply);
    const error = await new GhForge(exec).pushBranch(BRANCH).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForgeError);
    expect((error as ForgeError).kind).toBe(kind);
    expect((error as ForgeError).message).toContain(BRANCH);
  });

  it('puts what git said, cut to its first lines, in the message of an error it does not know, and never an address with a password in it', async () => {
    const stderr = "fatal: unable to access 'https://someone:secret-token@github.com/example/agentic-media-house.git/': Could not resolve host\nline two\nline three\nline four\nline five\n";
    const error = (await new GhForge(scriptedExec({ code: 128, stderr }).exec).pushBranch(BRANCH).catch((caught: unknown) => caught)) as ForgeError;
    expect(error.kind).toBe('failed');
    expect(error.message).toContain('exit code 128');
    expect(error.message).toContain('Could not resolve host');
    expect(error.message).toContain("'https://***@github.com/example/agentic-media-house.git/'");
    expect(error.message).not.toContain('secret-token');
    expect(error.message).not.toContain('someone');
    expect(error.message).not.toContain('line four');
  });

  it('puts what git said on one line, without the white space at the ends of its lines and without the empty lines between them', async () => {
    const error = (await new GhForge(scriptedExec({ code: 128, stderr: '  fatal: first   \n\n      second\t\n' }).exec).pushBranch(BRANCH).catch((caught: unknown) => caught)) as ForgeError;
    expect(error.message).toBe(`git push of ${BRANCH} failed (exit code 128): fatal: first second`);
  });

  it('is an error when git cannot be started', async () => {
    const missing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    await expect(new GhForge(scriptedExec(missing).exec).pushBranch(BRANCH)).rejects.toThrow('git cannot be started');
  });

  it('says what a hold branch is when it refuses a branch', async () => {
    await expect(new GhForge(scriptedExec().exec).pushBranch('main')).rejects.toThrow('"main" is not a hold branch (hold/<day>-<slug>), and the Desk pushes nothing else');
  });

  it.each(['main', 'hold/2026-10-05-UPPER', `${BRANCH}; rm -rf /`, '--force', '$(id)', `${BRANCH}\n`])('runs nothing for the branch %j', async (branch) => {
    const { exec, calls } = scriptedExec({ code: 0 });
    await expect(new GhForge(exec).pushBranch(branch)).rejects.toMatchObject({ name: 'ForgeError', kind: 'bad-input' });
    expect(calls).toEqual([]);
  });
});

describe('GhForge.openDraftPullRequest', () => {
  const request = { branch: BRANCH, title: 'Held: Fixture Robotics opens a second plant', body: '# Held\n\nWhy it was held.\n', base: 'main' };

  it('runs gh pr create --draft with the base, the head, the title and the body in a file, as a list of arguments, and reads the address from what gh prints', async () => {
    const tempDir = scratch();
    let bodyFile = '';
    const { exec, calls } = scriptedExec((call) => {
      bodyFile = call.args[call.args.indexOf('--body-file') + 1] as string;
      // While gh runs, the body is in the file that it is told to read.
      expect(readFileSync(bodyFile, 'utf8')).toBe(request.body);
      return { code: 0, stdout: `${URL}\n`, stderr: 'Creating draft pull request for hold/2026-10-05-fixture-robotics-second-plant into main in example/agentic-media-house\n' };
    });
    const pr = await new GhForge(exec, { cwd: CWD, tempDir }).openDraftPullRequest(request);
    expect(pr).toEqual({ url: URL, number: 12 });
    expect(calls).toEqual([
      { file: 'gh', args: ['pr', 'create', '--draft', '--base', 'main', '--head', BRANCH, '--title', request.title, '--body-file', bodyFile], cwd: CWD },
    ]);
    expect(path.dirname(bodyFile).startsWith(tempDir)).toBe(true);
    // Nothing is left behind: the file and its folder are gone.
    expect(existsSync(bodyFile)).toBe(false);
    expect(existsSync(path.dirname(bodyFile))).toBe(false);
  });

  it('takes the address from the last line gh prints, when it printed other lines first', async () => {
    const { exec } = scriptedExec({ code: 0, stdout: `Warning: 1 uncommitted change\n\n${URL}\n\n` });
    expect(await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest(request)).toEqual({ url: URL, number: 12 });
  });

  it.each([
    ['prints nothing', ''],
    ['prints a line that is not an address', 'Created it!\n'],
    ['prints an address that is not of a pull request', 'https://github.com/example/agentic-media-house/issues/12\n'],
    ['prints an address that is not https', 'http://github.com/example/agentic-media-house/pull/12\n'],
    ['prints an address with more after it', `${URL} and more\n`],
  ])('is an error when gh %s, because the Desk records the address of a pull request and would otherwise record a guess', async (_what, stdout) => {
    const { exec } = scriptedExec({ code: 0, stdout });
    await expect(new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest(request)).rejects.toMatchObject({ kind: 'failed', message: expect.stringContaining('address of the pull request') });
  });

  it.each([
    ['gh is not logged in', { code: 4, stderr: GH_NO_LOGIN }, 'auth'],
    ['GitHub says the credentials are bad', { code: 1, stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)\n' }, 'auth'],
    ['the repository has no remote that gh knows', { code: 1, stderr: 'none of the git remotes configured for this repository point to a known GitHub host\n' }, 'no-remote'],
    ['there is already a pull request for the branch', { code: 1, stderr: `a pull request for branch "${BRANCH}" into branch "main" already exists:\n${URL}\n` }, 'pr-exists'],
    ['something else goes wrong', { code: 1, stderr: 'GraphQL: Something went wrong while executing your query.\n' }, 'failed'],
  ] as const)('says what is wrong when %s', async (_what, reply, kind) => {
    const { exec } = scriptedExec(reply);
    const error = await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForgeError);
    expect((error as ForgeError).kind).toBe(kind);
    expect((error as ForgeError).message).toContain(BRANCH);
  });

  it('says where the pull request that is already there is, when gh says it, and says nothing of a place when it does not', async () => {
    const said = `a pull request for branch "${BRANCH}" into branch "main" already exists:\n${URL}\n`;
    const error = (await new GhForge(scriptedExec({ code: 1, stderr: said }).exec, { tempDir: scratch() }).openDraftPullRequest(request).catch((caught: unknown) => caught)) as ForgeError;
    expect(error.message).toBe(`there is already a pull request for ${BRANCH} (${URL}): a pull request for branch "${BRANCH}" into branch "main" already exists: ${URL}`);
    const nowhere = (await new GhForge(scriptedExec({ code: 1, stderr: 'a pull request already exists\n' }).exec, { tempDir: scratch() }).openDraftPullRequest(request).catch((caught: unknown) => caught)) as ForgeError;
    expect(nowhere.kind).toBe('pr-exists');
    expect(nowhere.message).toBe(`there is already a pull request for ${BRANCH}: a pull request already exists`);
  });

  it('reads the address from a line of what gh printed that has white space at its ends', async () => {
    const { exec } = scriptedExec({ code: 0, stdout: `  \n   ${URL}   \n\t\n` });
    expect(await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest(request)).toEqual({ url: URL, number: 12 });
  });

  it('says what gh printed when it did not print an address, or that it printed nothing', async () => {
    const said = (await new GhForge(scriptedExec({ code: 0, stdout: 'Created it!\n' }).exec, { tempDir: scratch() }).openDraftPullRequest(request).catch((caught: unknown) => caught)) as ForgeError;
    expect(said.message).toBe(`gh did not print the address of the pull request for ${BRANCH}, so the Desk does not know where it is: Created it!`);
    const nothing = (await new GhForge(scriptedExec({ code: 0, stdout: '' }).exec, { tempDir: scratch() }).openDraftPullRequest(request).catch((caught: unknown) => caught)) as ForgeError;
    expect(nothing.message).toBe(`gh did not print the address of the pull request for ${BRANCH}, so the Desk does not know where it is: it printed nothing`);
  });

  it('does not fail because the folder of the body is already gone when it comes to remove it', async () => {
    const { exec } = scriptedExec((call) => {
      rmSync(path.dirname(call.args[call.args.indexOf('--body-file') + 1] as string), { recursive: true });
      return { code: 0, stdout: `${URL}\n` };
    });
    await expect(new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest(request)).resolves.toEqual({ url: URL, number: 12 });
  });

  it('takes a title of 256 characters and a base of one character or of a hundred, and refuses a base of a hundred and one', async () => {
    const { exec, calls } = scriptedExec({ code: 0, stdout: `${URL}\n` }, { code: 0, stdout: `${URL}\n` }, { code: 0, stdout: `${URL}\n` });
    const forge = new GhForge(exec, { tempDir: scratch() });
    await forge.openDraftPullRequest({ ...request, title: 'x'.repeat(256) });
    await forge.openDraftPullRequest({ ...request, base: 'x' });
    await forge.openDraftPullRequest({ ...request, base: `b${'x'.repeat(99)}` });
    expect(calls).toHaveLength(3);
    await expect(forge.openDraftPullRequest({ ...request, base: `b${'x'.repeat(100)}` })).rejects.toMatchObject({ kind: 'bad-input' });
    expect(calls).toHaveLength(3);
  });

  it('removes the file of the body when gh fails, and when gh cannot be started', async () => {
    const tempDir = scratch();
    const seen: string[] = [];
    const remember = (call: { args: string[] }) => {
      seen.push(call.args[call.args.indexOf('--body-file') + 1] as string);
    };
    const failing = scriptedExec((call) => {
      remember(call);
      return { code: 1, stderr: 'boom\n' };
    });
    await expect(new GhForge(failing.exec, { tempDir }).openDraftPullRequest(request)).rejects.toBeInstanceOf(ForgeError);
    const missing = scriptedExec((call) => {
      remember(call);
      return Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    });
    await expect(new GhForge(missing.exec, { tempDir }).openDraftPullRequest(request)).rejects.toMatchObject({ kind: 'tool-missing' });
    expect(seen).toHaveLength(2);
    for (const file of seen) expect(existsSync(path.dirname(file))).toBe(false);
  });

  it.each(HOSTILE)('puts a title that a model wrote into one argument, as it is, and runs no shell: %j', async (hostile) => {
    const title = `Held: ${hostile}`;
    const { exec, calls } = scriptedExec({ code: 0, stdout: `${URL}\n` });
    await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest({ ...request, title });
    const [call] = calls;
    expect(calls).toHaveLength(1);
    expect(call?.file).toBe('gh');
    // The list is the same as for a harmless title, except for the one argument that holds the title, and the title is that argument alone.
    expect(call?.args).toHaveLength(11);
    expect(call?.args.slice(0, 8)).toEqual(['pr', 'create', '--draft', '--base', 'main', '--head', BRANCH, '--title']);
    expect(call?.args[8]).toBe(oneLine(title));
    expect(call?.args[9]).toBe('--body-file');
    expect(call?.args.filter((argument) => argument.includes(hostile.slice(0, 6)) && argument !== call.args[8])).toEqual([]);
  });

  it.each(HOSTILE)('puts a body that a model wrote in a file, byte for byte, and in no argument: %j', async (hostile) => {
    const body = `Why:\n\n${hostile}\n`;
    let written = '';
    const { exec, calls } = scriptedExec((call) => {
      written = readFileSync(call.args[call.args.indexOf('--body-file') + 1] as string, 'utf8');
      return { code: 0, stdout: `${URL}\n` };
    });
    await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest({ ...request, body });
    expect(written).toBe(body);
    expect(calls[0]?.args.some((argument) => argument.includes(hostile.slice(0, 6)))).toBe(false);
  });

  it('makes a title one line: control characters, line separators and runs of spaces become one space', async () => {
    const { exec, calls } = scriptedExec({ code: 0, stdout: `${URL}\n` });
    const separator = String.fromCharCode(0x2028);
    await new GhForge(exec, { tempDir: scratch() }).openDraftPullRequest({ ...request, title: `  a\tb\n\nc   d\u007fe${separator}f  ` });
    expect(calls[0]?.args[8]).toBe('a b c d e f');
  });

  it.each([
    ['a branch that is not a hold branch', { branch: 'main' }, 'hold branch'],
    ['a branch with a command in it', { branch: `${BRANCH}; id` }, 'hold branch'],
    ['a base with a command in it', { base: 'main; id' }, 'base'],
    ['a base that is an option', { base: '--web' }, 'base'],
    ['an empty title', { title: ' \n ' }, 'title'],
    ['a title that starts like an option', { title: '--web' }, 'title'],
    ['a title that starts like a short option', { title: '-R other/repository' }, 'title'],
    ['a title of more than 256 characters', { title: 'x'.repeat(257) }, 'title'],
  ] as const)('runs nothing for %s', async (_what, change, word) => {
    const tempDir = scratch();
    const { exec, calls } = scriptedExec({ code: 0, stdout: `${URL}\n` });
    const error = await new GhForge(exec, { tempDir }).openDraftPullRequest({ ...request, ...change }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'ForgeError', kind: 'bad-input' });
    expect((error as ForgeError).message).toContain(word);
    expect(calls).toEqual([]);
  });
});

describe('nodeExec', () => {
  const node = process.execPath;
  const show = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';

  it('runs a program with the arguments it is given, each as one argument, with no shell between', async () => {
    const hostile = ['$(echo pwned)', '`echo pwned`', 'a "quoted" word', 'line one\nline two', '; echo pwned', '*', '~'];
    const result = await nodeExec()(node, ['-e', show, '--', ...hostile], {});
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(hostile);
  });

  it('gives the exit code and both outputs of a program that fails, as a result and not as an error', async () => {
    const result = await nodeExec()(node, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'], {});
    expect(result).toEqual({ code: 3, stdout: 'out', stderr: 'err' });
  });

  it('runs the program in the folder it is given', async () => {
    const dir = scratch();
    const result = await nodeExec()(node, ['-e', 'process.stdout.write(process.cwd())'], { cwd: dir });
    expect(path.basename(result.stdout)).toBe(path.basename(dir));
  });

  it('keeps git and gh from asking anything: no prompt for a password, no colour, the same language everywhere', async () => {
    const result = await nodeExec()(node, ['-e', 'process.stdout.write(JSON.stringify([process.env.GIT_TERMINAL_PROMPT, process.env.GH_PROMPT_DISABLED, process.env.GH_NO_UPDATE_NOTIFIER, process.env.NO_COLOR, process.env.LC_ALL]))'], {});
    expect(JSON.parse(result.stdout)).toEqual(['0', '1', '1', '1', 'C']);
  });

  it('lays the variables it is given over those of this process', async () => {
    const result = await nodeExec({ GH_TOKEN: 'a-token-for-the-test-only' })(node, ['-e', 'process.stdout.write(process.env.GH_TOKEN ?? "")'], {});
    expect(result.stdout).toBe('a-token-for-the-test-only');
  });

  it('rejects when the program cannot be started, with the error of the system, which the forge reads as a program that is not there', async () => {
    await expect(nodeExec()('a-program-that-does-not-exist-anywhere', [], {})).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('FakeForge', () => {
  it('has a remote, and records every call with what it was given', async () => {
    const forge: ForgeTarget = new FakeForge();
    expect(await forge.hasRemote()).toBe(true);
    await forge.pushBranch(BRANCH);
    const pr = await forge.openDraftPullRequest({ branch: BRANCH, title: 'Held: a piece', body: 'Why.', base: 'main' });
    expect(pr).toEqual({ url: 'https://github.example/agentic-media-house/pull/1', number: 1 });
    expect((forge as FakeForge).calls).toEqual([
      { method: 'hasRemote' },
      { method: 'pushBranch', branch: BRANCH },
      { method: 'openDraftPullRequest', request: { branch: BRANCH, title: 'Held: a piece', body: 'Why.', base: 'main' } },
    ]);
  });

  it('numbers its pull requests one after the other', async () => {
    const forge = new FakeForge();
    const first = await forge.openDraftPullRequest({ branch: BRANCH, title: 'a', body: 'b', base: 'main' });
    const second = await forge.openDraftPullRequest({ branch: 'hold/2026-10-06-another', title: 'a', body: 'b', base: 'main' });
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(second.url).toBe('https://github.example/agentic-media-house/pull/2');
  });

  it('can have no remote', async () => {
    const forge = new FakeForge();
    forge.remote = false;
    expect(await forge.hasRemote()).toBe(false);
  });

  it('fails the next call of a method when a test says so, once, and records the call', async () => {
    const forge = new FakeForge();
    forge.fail('pushBranch', new ForgeError('auth', 'no credentials'));
    await expect(forge.pushBranch(BRANCH)).rejects.toThrow('no credentials');
    await expect(forge.pushBranch(BRANCH)).resolves.toBeUndefined();
    expect(forge.calls.map((call) => call.method)).toEqual(['pushBranch', 'pushBranch']);
    forge.fail('openDraftPullRequest', new ForgeError('pr-exists', 'it is there'));
    await expect(forge.openDraftPullRequest({ branch: BRANCH, title: 'a', body: 'b', base: 'main' })).rejects.toMatchObject({ kind: 'pr-exists' });
    forge.fail('hasRemote', new ForgeError('tool-missing', 'git cannot be started'));
    await expect(forge.hasRemote()).rejects.toMatchObject({ kind: 'tool-missing' });
  });

  it('holds a branch to the same rules as the real forge, so that a test cannot pass with a branch that the real one would refuse', async () => {
    const forge = new FakeForge();
    await expect(forge.pushBranch('main')).rejects.toMatchObject({ kind: 'bad-input' });
    await expect(forge.openDraftPullRequest({ branch: 'hold/x', title: 'a', body: 'b', base: 'main' })).rejects.toMatchObject({ kind: 'bad-input' });
    await expect(forge.openDraftPullRequest({ branch: BRANCH, title: '', body: 'b', base: 'main' })).rejects.toMatchObject({ kind: 'bad-input' });
    expect(forge.calls).toEqual([]);
  });
});
```

The package entry point lists what it exports, and the forge is part of it.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  ExtractArtifact,
  ExtractedPage,
  FakeCommit,
  FeedErrorKind,
```

**with:**
```ts
  ExtractArtifact,
  ExtractedPage,
  ExecResult,
  FakeCommit,
  FeedErrorKind,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  Fetcher,
  FixtureEntry,
  GateReport,
  GitCliOptions,
```

**with:**
```ts
  Fetcher,
  FixtureEntry,
  ForgeFailure,
  ForgeTarget,
  GateReport,
  GitCliOptions,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  PieceFiles,
  PublishTarget,
  RateLimiterOptions,
  RefusalKind,
```

**with:**
```ts
  PieceFiles,
  PublishTarget,
  PullRequest,
  RateLimiterOptions,
  RefusalKind,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'GitCli',
  'FakeGit',
  'assertNothingLost',
  'sitePaths',
```

**with:**
```ts
  'GitCli',
  'FakeGit',
  'HOLD_BRANCH',
  'holdBranchName',
  'assertHoldBranch',
  'checkPullRequest',
  'ForgeError',
  'FakeForge',
  'GhForge',
  'nodeExec',
  'assertNothingLost',
  'sitePaths',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      TargetResult,
      PublishTarget,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      TargetResult,
      PublishTarget,
      ForgeTarget,
      ForgeFailure,
      PullRequest,
      ExecResult,
    ];
    const nothing: Exported | undefined = undefined;
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/forge.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/forge'` and `exports GhForge`

- [ ] **Step 3: Write the forge**

**Create `desk/src/run/forge.ts`:**
```ts
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
function said(stderr: string): string {
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
```

It is exported with the rest of the package.

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/desk-state';
export * from './run/git';
export * from './run/target';
export * from './run/lock';
```

**with:**
```ts
export * from './run/desk-state';
export * from './run/git';
export * from './run/forge';
export * from './run/target';
export * from './run/lock';
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/run/forge.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/run/forge.ts desk/test/run/forge.test.ts desk/test/support/exec.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Check the flags against the real program**

The tests prove that the Desk asks for the right words; they cannot prove that `gh` knows them. If `gh` is installed on this machine, ask it. The command reads the help text of the program and does not touch GitHub. Without `gh` it says so and there is nothing to check.

Run: `if command -v gh >/dev/null; then gh pr create --help | grep -o -e '--draft' -e '--body-file' -e '--head' -e '--base' -e '--title' | sort -u; else echo "gh is not installed: nothing to check"; fi`
Expected: PASS — `--base`, `--body-file`, `--draft`, `--head` and `--title` are each listed once

- [ ] **Step 6: Commit**

```bash
git add desk/src/index.ts desk/src/run/forge.ts desk/test/fetch/exports.test.ts desk/test/run/forge.test.ts desk/test/support/exec.ts
git commit -m "feat(desk): ForgeTarget, the part of GitHub that the Desk uses to send a held piece to the owner (the branch is pushed and a draft pull request is opened), with FakeForge for tests and GhForge for git and gh, run as programs with a list of arguments, the body of a pull request in a file and every title, base and branch checked before anything is run" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: A held piece, written for the owner

**Files:**
- Create: `desk/src/stages/hold-pr.ts` (`renderHeldPiece`, `heldPieceFiles`, `holdPrTitle`, `holdPrBody`)
- Create: `desk/test/stages/hold-pr.test.ts`, `desk/test/support/held.ts` (the verdicts and the held drafts that the tests of a hold share), `desk/test/support/pieces.ts` (putting a piece into a checkout and reading it back as the site does)
- Modify: `desk/test/stages/hold.test.ts` (uses the shared verdicts), `desk/test/fetch/exports.test.ts` (says the new functions are not exported)

A held piece goes to the owner as a draft pull request, and there are two things to write for it: **the piece** that goes on the branch, and **the text** of the pull request. This task writes both as pure functions, and no stage calls them yet (Task 13 does).

**The piece.** `renderHeldPiece(held)` takes the draft that the Hold stage keeps (`held/<slug>.json`, a `HeldArtifact`) and writes it with `renderDraft` of the gate package, the same function that Publish uses, so the article and its ledger are what the site would show had the piece been published. The only difference is who released it: the ledger says `release: 'owner'`, which the receipts page prints as "Held by the gate, then released by the owner." The ledger schema allows that only when the gate route is not `publish`, and that is not always true of a held draft: when the gate cleared the draft and the **model check** did not, the stored route is still `publish`. So the ledger of a held piece always has the route `hold`, and its `holdReasons` are the reasons of the hold (the codes the desk state records), so that the receipts page can say why. The checks and the verdict of the model check are the stored ones. `heldPieceFiles` is the same as the two files of a piece, checked as Publish checks them.

**The text.** `holdPrTitle(held)` is `Held: ` and the headline, on one line and at most 100 characters. `holdPrBody(held)` is markdown: why it was held (each reason with its words), the piece, what the gate and the model check said, how to publish it (open **Files changed**, mark the pull request **Ready for review**, merge) and how to discard it (close it). The words for a reason code are those of the holds page of the site, `REASON_LABELS` in `site/src/lib/reasons.ts`, which the Desk reads from there, so there is one table; a code that has no words says so.

Most of what a pull request says was written by a model: the headline, the messages of the gate's failures (they quote sentences), the notes and the reasons of the model check. GitHub turns `@name` into a notification, `#12` into a link, `[text](address)` into a link and an image into a request to a stranger's server, so none of it is put in the text as it is. It goes in a **fenced block**, where none of that happens, and the fence is made of more backticks than the longest run of backticks in the text (and at least three), so that the text cannot close it and go on as markdown. A code span is made the same way, and a block is cut at 4,000 characters with a line that says how much was left out, so that the text never goes over what GitHub takes. What is not in a block is the Desk's own: the slug, the day, the categories, the id of the run, the name of the model, the codes, the counts and the words of the holds page.

**The check that matters most:** the tests put the piece into a checkout and give it to `matchPieces`, the function of the site that stops a build when a piece and its ledger do not belong together (its title, its description and its whole body must be what the ledger renders). A held piece that passes it is one that the site builds when the owner merges it.

- [ ] **Step 1: Share what the tests of a hold use**

The tests of Hold make the verdicts that they hold with the real Compose and Verify stages, on a composer and a verifier that go wrong in the ways that a hold is for. The tests of this task need the same verdicts, so they move to a file that both read. The file also has `heldOf`, which makes the held draft that the Hold stage keeps from a verdict and which the tests of step 2 use. Moving the verdicts changes no behaviour: the test of Hold must pass before and after.

**Create `desk/test/support/held.ts`:**
```ts
import { readFileSync } from 'node:fs';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { HeldArtifact } from '../../src/run/artifacts';
import { DryTarget } from '../../src/run/target';
import { runCompose } from '../../src/stages/compose';
import { runHold } from '../../src/stages/hold';
import { runVerify } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext } from './context';
import { replyFromDraft } from './script';
import { makeSite } from './site';
import { verifierReply } from './verifier';

// What the tests of a held piece share: the verdicts that the real Compose and Verify stages give on scripts of a composer and a verifier that go wrong in each
// of the ways that a hold is for, and the held draft that the real Hold stage writes from each. Nothing here is written by hand that a stage writes.

/** The run that holds in these tests. */
export const HOLD_RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };

/** A fact that cites two claims and says a payload that the claims do not say: the gate cannot match its number to them. */
export const INVENTED = (kilograms: number) => ({ kind: 'fact' as const, text: `The datasheet lists a ${kilograms} kg rated payload and a 1.4 m maximum reach.`, claimIds: ['c-8', 'c-9'] });

export type Reply = ReturnType<typeof replyFromDraft>;

/** The verdicts of the stages, in folders that `scratch` makes. */
export function verdicts(scratch: () => string) {
  /**
   * The verdict of Verify on a piece, made by the stages: the composer says `reply` first and then each of `revisions`, and the verifier gives the replies
   * that `verifier` makes from the plan of the first draft (one for each pass that the gate clears; the draft does not change in the tests that script more than one).
   */
  async function verdictOn(options: { reply?: Reply; claims?: Claim[]; revisions?: unknown[]; verifier?: (plan: ReturnType<typeof verifyPlanOf>) => unknown[] }) {
    const made = stageContext(scratch);
    const claims = options.claims ?? GOLDEN_CLAIMS;
    made.fake.script('compose', options.reply ?? replyFromDraft(), ...(options.revisions ?? []));
    const composed = await runCompose(made.ctx, claims);
    for (const reply of options.verifier?.(verifyPlanOf(composed.draft, claims)) ?? []) made.fake.script('verify', reply);
    const verified = await runVerify(made.ctx, claims, composed);
    return { ...made, claims, verified };
  }

  /** A piece that cites another outlet: the gate holds it for the owner, and the verifier clears it. */
  async function tier2() {
    const variant = makeTier2Variant(cloneGolden());
    return verdictOn({ reply: replyFromDraft(variant.draft), claims: variant.claims, verifier: (plan) => [verifierReply(plan)] });
  }

  /** A piece with a number that its claims do not say, which the composer does not mend in two rounds: the gate holds it with a failure of G4. */
  async function gateFailure() {
    const reply = replyFromDraft();
    reply.takeaways[1] = INVENTED(15);
    return verdictOn({ reply, revisions: [{ replacements: [] }, { replacements: [] }] });
  }

  /** A piece that the gate clears and the model check does not: the verifier finds a sentence ambiguous and a claim's label not supported, in every pass. */
  async function modelCheck() {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const sentence = plan.sentences[3]?.id as string;
    const claim = plan.claims[0]?.id as string;
    return verdictOn({
      revisions: [{ replacements: [] }, { replacements: [] }],
      verifier: () => [0, 1, 2].map(() => verifierReply(plan, { verdicts: { [sentence]: 'ambiguous' }, unsupported: [claim], omit: [plan.sentences[5]?.id as string] })),
    });
  }

  return { verdictOn, tier2, gateFailure, modelCheck };
}

/** What a verdict is made of, as `verdicts` gives it. */
export type Verdict = Awaited<ReturnType<ReturnType<typeof verdicts>['tier2']>>;

/**
 * The draft that the Hold stage keeps of a verdict: the stage is run on a site that it only goes through the motions for (a dry run), and what it wrote
 * to the folder of the run is read back and checked against the schema, so the held draft is exactly what a run leaves.
 */
export async function heldOf(scratch: () => string, verdict: Verdict): Promise<HeldArtifact> {
  const result = await runHold(verdict.ctx, new DryTarget(makeSite(scratch())), verdict.claims, verdict.verified, HOLD_RUN);
  return HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
}
```

**In `desk/test/stages/hold.test.ts`, replace:**
```ts
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS, citedClaims } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
```

**with:**
```ts
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS, citedClaims } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
```

**In `desk/test/stages/hold.test.ts`, replace:**
```ts
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runCompose } from '../../src/stages/compose';
import { holdReasonsOf, runHold } from '../../src/stages/hold';
import { runVerify } from '../../src/stages/verify';
import type { VerifyResult } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { replyFromDraft } from '../support/script';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
```

**with:**
```ts
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { holdReasonsOf, runHold } from '../../src/stages/hold';
import type { VerifyResult } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { INVENTED, verdicts } from '../support/held';
import { replyFromDraft } from '../support/script';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
```

**In `desk/test/stages/hold.test.ts`, replace:**
```ts
const STATE = sitePaths().stateFile;

const INVENTED = (kilograms: number) => ({ kind: 'fact' as const, text: `The datasheet lists a ${kilograms} kg rated payload and a 1.4 m maximum reach.`, claimIds: ['c-8', 'c-9'] });

type Reply = ReturnType<typeof replyFromDraft>;

/**
 * The verdict of Verify on a piece, made by the stages: the composer says `reply` first and then each of `revisions`, and the verifier gives the replies
 * that `verifier` makes from the plan of the first draft (one for each pass that the gate clears; the draft does not change in the tests that script more than one).
 */
async function verdictOn(options: { reply?: Reply; claims?: Claim[]; revisions?: unknown[]; verifier?: (plan: ReturnType<typeof verifyPlanOf>) => unknown[] }) {
  const made = stageContext(scratch);
  const claims = options.claims ?? GOLDEN_CLAIMS;
  made.fake.script('compose', options.reply ?? replyFromDraft(), ...(options.revisions ?? []));
  const composed = await runCompose(made.ctx, claims);
  for (const reply of options.verifier?.(verifyPlanOf(composed.draft, claims)) ?? []) made.fake.script('verify', reply);
  const verified = await runVerify(made.ctx, claims, composed);
  return { ...made, claims, verified };
}

function setup() {
```

**with:**
```ts
const STATE = sitePaths().stateFile;

const { verdictOn, tier2 } = verdicts(scratch);

function setup() {
```

**In `desk/test/stages/hold.test.ts`, replace:**
```ts
const heldFile = (runDir: string, slug: string): string => path.join(runDir, 'held', `${slug}.json`);

/** A piece that cites another outlet: the gate holds it for the owner, and the verifier clears it. */
async function tier2() {
  const variant = makeTier2Variant(cloneGolden());
  return verdictOn({ reply: replyFromDraft(variant.draft), claims: variant.claims, verifier: (plan) => [verifierReply(plan)] });
}

describe('holdReasonsOf', () => {
  it('is the codes of the gate failures, then the hold reasons of the gate, then the reasons of the model check, each once and in order', async () => {
```

**with:**
```ts
const heldFile = (runDir: string, slug: string): string => path.join(runDir, 'held', `${slug}.json`);

describe('holdReasonsOf', () => {
  it('is the codes of the gate failures, then the hold reasons of the gate, then the reasons of the model check, each once and in order', async () => {
```

Run: `npm test --workspace @robywire/desk -- test/stages/hold.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 2: Write the tests**

Putting a piece into a checkout and reading it back the way the site does: the frontmatter checked against the schema of the site, the body below it, and the ledger checked against its schema.

**Create `desk/test/support/pieces.ts`:**
```ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { parse } from 'yaml';
import { sitePaths } from '../../src/run/target';
import type { PieceFiles } from '../../src/run/target';

// What the tests of pieces share: putting the two files of a piece into a checkout of the site, and reading the pieces of a checkout back the way that the site
// reads them (the collections of Astro: the frontmatter checked against the schema, the body below it, and the ledger checked against its schema), so that a test can
// hand them to `matchPieces` of the site, which is the check that a piece and its ledger belong together.

/** The text of a piece split into its frontmatter, checked against the schema of the site, and the body below it. */
export function splitPiece(mdx: string): { data: NewsFrontmatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(mdx);
  if (match === null) throw new Error('splitPiece: the text has no frontmatter');
  return { data: NewsFrontmatter.parse(parse(match[1] as string)), body: (match[2] as string).replace(/^\n/, '') };
}

/** Write the two files of a piece into the content folders of the site in `repoDir`. */
export function placePiece(repoDir: string, piece: PieceFiles): void {
  const paths = sitePaths();
  for (const [file, text] of [
    [paths.newsFile(piece.slug), piece.mdx],
    [paths.ledgerFile(piece.slug), piece.ledger],
  ] as const) {
    mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
    writeFileSync(path.join(repoDir, file), text);
  }
}

/** The pieces and the ledgers in the content folders of the site in `repoDir`, as the site hands them to `matchPieces`: each with its id (the slug) and its data. */
export function readPieces(repoDir: string) {
  const paths = sitePaths();
  const news = readdirSync(path.join(repoDir, paths.newsDir))
    .filter((name) => name.endsWith('.mdx'))
    .sort()
    .map((name) => {
      const { data, body } = splitPiece(readFileSync(path.join(repoDir, paths.newsDir, name), 'utf8'));
      return { id: name.slice(0, -'.mdx'.length), data, body };
    });
  const ledgers = readdirSync(path.join(repoDir, paths.ledgerDir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ id: name.slice(0, -'.json'.length), data: LedgerEntry.parse(JSON.parse(readFileSync(path.join(repoDir, paths.ledgerDir, name), 'utf8'))) }));
  return { news, ledgers };
}
```

The tests. Three kinds of hold are made by the real stages: a piece that cites another outlet (the gate routes it to `hold`), a piece with a number that no claim says (the gate routes it to `revise`, and the composer does not mend it in two rounds), and a piece that the gate clears and the model check does not (the stored route is `publish`). Every test of the piece runs on all three. The tests of the text include one made of hostile texts: markdown, html, mentions and runs of backticks put in every place where a model's words reach the pull request.

**Create `desk/test/stages/hold-pr.test.ts`:**
```ts
import { LedgerEntry } from '@robywire/gate';
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import type { HeldArtifact } from '../../src/run/artifacts';
import { heldPieceFiles, holdPrBody, holdPrTitle, renderHeldPiece } from '../../src/stages/hold-pr';
import { useScratch } from '../support/context';
import { heldOf, verdicts } from '../support/held';
import { placePiece, readPieces, splitPiece } from '../support/pieces';
import { makeSite } from '../support/site';

// What a held piece becomes for the owner. Two things must hold. The piece that goes on the branch must be one that the site accepts, so that merging the pull
// request is all it takes: its two files must pass the rules by which the site refuses a piece and a ledger that do not belong together. And the text of the
// pull request is written from what a model wrote, so none of it may become a link, a mention or a heading: it must all be in fenced blocks that it cannot close.

const scratch = useScratch();
const made = verdicts(scratch);

/** The three ways that a piece is held, each as the Hold stage keeps it. */
const KINDS = {
  'cites another outlet': () => made.tier2(),
  'fails a check of the gate': () => made.gateFailure(),
  'fails the model check, which the gate cleared': () => made.modelCheck(),
} as const;
const heldBy = async (kind: keyof typeof KINDS): Promise<HeldArtifact> => heldOf(scratch, await KINDS[kind]());

/** The lines of markdown that are not inside a fenced block, and how many fenced blocks there are (CommonMark: a fence is closed by a fence of the same character that is at least as long). */
function outsideFences(markdown: string): { outside: string[]; blocks: number; closed: boolean } {
  const outside: string[] = [];
  let open: { char: string; length: number } | undefined;
  let blocks = 0;
  for (const line of markdown.split('\n')) {
    if (open === undefined) {
      const start = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
      if (start === null) {
        outside.push(line);
        continue;
      }
      open = { char: (start[1] as string)[0] as string, length: (start[1] as string).length };
      blocks += 1;
      continue;
    }
    const end = /^ {0,3}(`+|~+)\s*$/.exec(line);
    if (end !== null && (end[1] as string)[0] === open.char && (end[1] as string).length >= open.length) open = undefined;
  }
  return { outside, blocks, closed: open === undefined };
}

describe('outsideFences (the check that the tests below rely on)', () => {
  it('leaves out what is in a fenced block, and a block is closed only by a fence that is as long as the one that opened it', () => {
    const text = ['before', '```text', 'in', '```` not a closing fence: it has words', '````', 'after', '````text', 'in again', '```', 'still in', '````', 'end'].join('\n');
    expect(outsideFences(text)).toEqual({ outside: ['before', 'after', 'end'], blocks: 2, closed: true });
  });

  it('says when a block is never closed', () => {
    expect(outsideFences('a\n```text\nb')).toEqual({ outside: ['a'], blocks: 1, closed: false });
  });
});

describe('renderHeldPiece', () => {
  it.each(Object.keys(KINDS) as (keyof typeof KINDS)[])('writes a piece that the owner releases, whatever the way it was held: it %s', async (kind) => {
    const held = await heldBy(kind);
    const { mdx, ledger } = renderHeldPiece(held);
    expect(LedgerEntry.safeParse(ledger).success).toBe(true);
    // The owner released it, so the gate did not: the route is hold even when the gate cleared the draft and the model check did not.
    expect(ledger.release).toBe('owner');
    expect(ledger.gate.route).toBe('hold');
    expect(ledger.gate.holdReasons).toEqual(held.reasons);
    expect(ledger.gate.checks).toEqual(held.gate.checks);
    expect(ledger.verifier).toEqual(held.verifier);
    expect(ledger.runId).toBe(held.runId);
    expect(ledger.slug).toBe(held.draft.slug);
    // The piece has never been corrected, so it has no updatedAt.
    expect(splitPiece(mdx).data.updatedAt).toBeUndefined();
  });

  it.each(Object.keys(KINDS) as (keyof typeof KINDS)[])('writes the two files of a piece that the site accepts, with the rules by which it refuses a piece and a ledger that do not belong together: it %s', async (kind) => {
    const held = await heldBy(kind);
    const repoDir = makeSite(scratch());
    placePiece(repoDir, heldPieceFiles(held));
    const { news, ledgers } = readPieces(repoDir);
    const matched = matchPieces(news, ledgers, []);
    expect(matched.map((piece) => piece.slug)).toEqual([held.draft.slug]);
  });

  it('is the same piece every time', async () => {
    const held = await heldBy('cites another outlet');
    expect(renderHeldPiece(held)).toEqual(renderHeldPiece(held));
    expect(heldPieceFiles(held)).toEqual(heldPieceFiles(held));
  });

  it('gives the ledger as the file the Desk writes: two-space JSON with a final newline', async () => {
    const held = await heldBy('cites another outlet');
    const files = heldPieceFiles(held);
    expect(files.slug).toBe(held.draft.slug);
    expect(files.ledger).toBe(`${JSON.stringify(renderHeldPiece(held).ledger, null, 2)}\n`);
    expect(files.mdx).toBe(renderHeldPiece(held).mdx);
  });

  it('refuses a draft that cannot be written as a piece, as the renderer does, and says why', async () => {
    const held = await heldBy('cites another outlet');
    const broken = structuredClone(held);
    broken.draft.title = { ...broken.draft.title, claimIds: ['c-99'] } as HeldArtifact['draft']['title'];
    expect(() => renderHeldPiece(broken)).toThrow('a sentence cites c-99, but no claim has that id');
    expect(() => heldPieceFiles(broken)).toThrow('c-99');
  });

  it('refuses a slug that is not a plain slug, because the slug is a file name', async () => {
    const held = await heldBy('cites another outlet');
    const odd = structuredClone(held);
    odd.draft.slug = '../outside';
    expect(() => heldPieceFiles(odd)).toThrow('"../outside" is not a plain slug');
  });
});

describe('holdPrTitle', () => {
  it('is Held: and the headline', async () => {
    const held = await heldBy('cites another outlet');
    expect(holdPrTitle(held)).toBe(`Held: ${GOLDEN_DRAFT.title.text}`);
  });

  it('is one line, cut at 100 characters of the headline with three dots, and starts with Held: whatever the headline is', async () => {
    const base = await heldBy('cites another outlet');
    const titled = (text: string): HeldArtifact => {
      const held = structuredClone(base);
      held.draft.title.text = text;
      return held;
    };
    expect(holdPrTitle(titled('a\n\nb\t  c'))).toBe('Held: a b c');
    expect(holdPrTitle(titled('-R other/repository --web'))).toBe('Held: -R other/repository --web');
    expect(holdPrTitle(titled('x'.repeat(100)))).toBe(`Held: ${'x'.repeat(100)}`);
    expect(holdPrTitle(titled('x'.repeat(101)))).toBe(`Held: ${'x'.repeat(97)}...`);
    expect(holdPrTitle(titled('   '))).toBe(`Held: ${base.draft.slug}`);
  });
});

describe('holdPrBody', () => {
  it('says what was held, why, what each check said, and how to publish or discard it: a piece that cites another outlet', async () => {
    const held = await heldBy('cites another outlet');
    const slug = held.draft.slug;
    expect(holdPrBody(held)).toBe(
      [
        `# Held by the Desk: \`${slug}\``,
        '',
        'The Desk did not publish this piece by itself, so it is here for you to decide. It is a draft pull request: nothing on the site changes until you merge it.',
        '',
        '## Why it was held',
        '',
        "- `TIER2_ATTRIBUTION`: Rests on another outlet's reporting",
        '',
        '## The piece',
        '',
        '| | |',
        '|---|---|',
        `| Slug | \`${slug}\` |`,
        '| Day | `2026-10-05` |',
        `| Categories | ${held.draft.categories.map((category) => `\`${category}\``).join(', ')} |`,
        '| Run | `2026-10-05-043100` |',
        '| Rounds of revision | 0 |',
        `| The article | \`site/src/content/news/${slug}.mdx\` |`,
        `| Its ledger | \`site/src/content/ledger/${slug}.json\` |`,
        '',
        'The headline, as the model wrote it. Everything below in a grey box was written by a model and is shown as it is, as data, and nobody has checked it.',
        '',
        '```text',
        GOLDEN_DRAFT.title.text,
        '```',
        '',
        '## What the gate said',
        '',
        '9 of 9 checks passed. It found no failure in the last draft.',
        '',
        '## What the model check said',
        '',
        'The model check (`claude-sonnet-5-5`) passed the last draft.',
        '',
        'Its notes:',
        '',
        '```text',
        ...held.verifier.notes,
        '```',
        '',
        '## To publish it',
        '',
        '1. Open **Files changed** and read the article and its ledger.',
        '2. If you agree with every sentence, click **Ready for review** and merge the pull request. The site is built again and shows the piece, and its receipts page says that the owner released it.',
        '',
        '## To discard it',
        '',
        'Close the pull request without merging it. Nothing is published, and the hold stays on record in the desk state.',
        '',
      ].join('\n'),
    );
  });

  it('gives the failures of the gate, with the checks that failed and the words for the reason: a piece that fails a check', async () => {
    const held = await heldBy('fails a check of the gate');
    const body = holdPrBody(held);
    expect(body).toContain(`- \`G4_NUMBER_UNSUPPORTED\`: ${REASON_LABELS.G4_NUMBER_UNSUPPORTED}`);
    expect(body).toContain('8 of 9 checks passed. Failed: `G4`. It found 1 failure in the last draft.');
    expect(body).toContain('G4_NUMBER_UNSUPPORTED: the number "15 kg"');
    expect(body).toContain('| Rounds of revision | 2 |');
    // The model was not asked about a draft that the gate had sent back, and the text says so.
    expect(body).toContain('was not asked about the last draft: the gate had sent it back');
    expect(body).not.toContain('What it did not clear');
  });

  it('gives what the model check did not clear, one line for each: a piece that the gate cleared and the model check did not', async () => {
    const held = await heldBy('fails the model check, which the gate cleared');
    const body = holdPrBody(held);
    for (const code of ['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED'] as const) expect(body).toContain(`- \`${code}\`: ${REASON_LABELS[code]}`);
    expect(body).toContain('9 of 9 checks passed. It found no failure in the last draft.');
    expect(body).toContain('did not pass the last draft.');
    expect(body).toContain('What it did not clear:');
    expect(body).toContain('s3 (sentence, ambiguous): The passages do not say it (s3).');
    expect(body).toContain('c-1 (label, unsupported)');
  });

  it('says in the Desk\'s own words that it has no words for a code that the holds page does not know, and never repeats the code as if it were an explanation', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.reasons = ['TIER2_ATTRIBUTION', 'G99_NOT_A_CODE'];
    expect(holdPrBody(held)).toContain('- `G99_NOT_A_CODE`: no plain words are written for this code');
    held.reasons = ['constructor'];
    expect(holdPrBody(held)).toContain('- `constructor`: no plain words are written for this code');
  });

  it('is the same text every time', async () => {
    const held = await heldBy('fails a check of the gate');
    expect(holdPrBody(held)).toBe(holdPrBody(held));
  });
});

/** Texts that a model could write that GitHub would turn into a notification, a link, an image, a heading, a table, a list or html, or that would close a fence. */
const HOSTILE = [
  '@everyone please review #123 and https://evil.example/phish',
  '[click here](https://evil.example/login) or ![pixel](https://evil.example/pixel.png)',
  '```\nclosing the fence early\n````\n# A heading\n- a list item',
  '~~~\n| a | table |\n|---|---|\n~~~',
  '<img src=x onerror=alert(1)> <script>alert(1)</script> <!-- a comment -->',
  `${'`'.repeat(7)} seven backticks ${'`'.repeat(3)} and one \` more`,
  'line one\r\nline two\rline three\n\n\n',
  '$(touch /tmp/pwned) ${HOME} \\ %s',
];

/** What the harmless text of the pull request never has in it, and what the hostile texts above all have. */
const MARKERS = ['@everyone', '#123', 'evil.example', '<img', '<script', 'onerror', 'closing the fence early', 'A heading', 'a list item', 'a table', 'seven backticks', 'pwned', 'line two'];

/** `base` with `text` in every place where the text of a pull request has what a model wrote. */
function hostileHeld(base: HeldArtifact, text: string): HeldArtifact {
  const held = structuredClone(base);
  held.draft.title.text = text;
  held.verifier.notes = [text, text];
  held.gate.failures = [
    { check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', message: text, where: text },
    { check: 'G2', code: 'G2_BODY_LENGTH', message: text },
  ];
  const last = held.history.at(-1) as HeldArtifact['history'][number];
  last.verifierFailures = [{ id: 's1', kind: 'sentence', code: 'not_entailed', reason: text }];
  return held;
}

describe('holdPrBody, with text that a model wrote to do harm', () => {
  it.each(HOSTILE)('puts what a model wrote in fenced blocks that it cannot close, and nothing of it outside: %j', async (text) => {
    const body = holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), text));
    const { outside, blocks, closed } = outsideFences(body);
    // The headline, the failures of the gate, the notes and what the model check did not clear: four blocks, all closed, and no text of the model between them.
    expect(blocks).toBe(4);
    expect(closed).toBe(true);
    const visible = outside.join('\n');
    for (const marker of MARKERS) expect(visible).not.toContain(marker);
    // Nothing outside the blocks is anything but the Desk's own: the same lines as for harmless text, except the counts that depend on the failures.
    const harmless = outsideFences(holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), 'harmless text'))).outside;
    expect(outside).toEqual(harmless);
  });

  it('keeps the text, whole, inside its block', async () => {
    const text = '```\nclosing the fence early\n````\n# A heading';
    const body = holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), text));
    // The fence is longer than the longest run of backticks in the text (four), so five, and no longer.
    expect(body).toContain(`\`\`\`\`\`text\n${text}\n\`\`\`\`\``);
    expect(body.split('\n')).toContain('`````text');
    expect(body).not.toContain('``````');
  });

  it('writes a code span that the text cannot close, for a slug, a code or an id with backticks in it, and one that starts or ends with a backtick has a space inside', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.reasons = ['A`B', '`C`', '`start', 'end`', '  spaced \n  code  '];
    held.runId = 'run``id';
    const body = holdPrBody(held);
    expect(body).toContain('- ``A`B``: no plain words are written for this code');
    expect(body).toContain('- `` `C` ``: no plain words are written for this code');
    expect(body).toContain('- `` `start ``: no plain words are written for this code');
    expect(body).toContain('- `` end` ``: no plain words are written for this code');
    expect(body).toContain('- `spaced code`: no plain words are written for this code');
    expect(body).toContain('| Run | ```run``id``` |');
  });

  it('gives each failure of the gate on a line of its own, with the place when the gate said one and without it when it did not', async () => {
    const held = structuredClone(await heldBy('fails a check of the gate'));
    held.gate.failures = [
      { check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', message: 'the number is not in a claim', where: 'takeaways, sentence 2' },
      { check: 'G2', code: 'G2_BODY_LENGTH', message: 'the piece is too short' },
    ];
    const lines = holdPrBody(held).split('\n');
    expect(lines).toContain('G4_NUMBER_UNSUPPORTED: the number is not in a claim (takeaways, sentence 2)');
    expect(lines).toContain('G2_BODY_LENGTH: the piece is too short');
  });

  it('says none for the categories of a piece that has none, and names one that has one', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.draft.categories = [];
    expect(holdPrBody(held)).toContain('| Categories | (none) |');
    held.draft.categories = ['humanoids'];
    expect(holdPrBody(held)).toContain('| Categories | `humanoids` |');
  });

  it('cuts a block at 4000 characters and not before, says how many were left out, and does not cut a pair of characters in two', async () => {
    const base = await heldBy('fails a check of the gate');
    const pair = String.fromCharCode(0xd83d, 0xde00);
    // The text is the one note of the model check, so the block that has it has nothing else.
    const noted = (text: string): string => {
      const held = structuredClone(base);
      held.verifier.notes = [text];
      return holdPrBody(held);
    };
    const exact = noted('x'.repeat(4000));
    expect(exact).toContain(`\n${'x'.repeat(4000)}\n`);
    expect(exact).not.toContain('[cut:');
    const over = noted('x'.repeat(4001));
    expect(over).toContain(`\n${'x'.repeat(4000)}\n[cut: 1 more characters]\n`);
    const split = noted(`${'x'.repeat(3999)}${pair}`);
    expect(split).toContain(`\n${'x'.repeat(3999)}\n[cut: 2 more characters]\n`);
    expect(split).not.toContain(String.fromCharCode(0xd83d));
  });

  it('cuts a block that is too long, and says how much was left out, so that the text never goes over what GitHub takes', async () => {
    const held = hostileHeld(await heldBy('fails a check of the gate'), 'x'.repeat(200_000));
    const body = holdPrBody(held);
    expect(body.length).toBeLessThan(40_000);
    expect(body).toContain('[cut: 196000 more characters]');
    expect(outsideFences(body).blocks).toBe(4);
  });
});
```

The package entry point does not export the stages, and these functions belong to one.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'judgePlan', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
```

**with:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'judgePlan', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf', 'renderHeldPiece', 'heldPieceFiles', 'holdPrTitle', 'holdPrBody'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
```

- [ ] **Step 3: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/stages/hold-pr.test.ts`
Expected: FAIL — `Cannot find module '../../src/stages/hold-pr'`

- [ ] **Step 4: Write the functions**

**Create `desk/src/stages/hold-pr.ts`:**
```ts
import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { RenderedPiece } from '@robywire/gate';
import { isPlainSlug, sitePaths } from '../index';
import type { HeldArtifact, PieceFiles } from '../index';
import { REASON_LABELS } from '../../../site/src/lib/reasons';

// A piece that is held reaches the owner as a draft pull request, and this is what goes into it. The branch of the pull request carries the piece as the
// site would show it if it were published (`renderHeldPiece`), so that merging the pull request is all that it takes to publish it, and the text of the
// pull request (`holdPrTitle` and `holdPrBody`) says what was held, why, what each check said, and what to do. The words of the reasons are those of the holds
// page of the site (`site/src/lib/reasons.ts` is where they are written, and the holds page and this text read the same table).
//
// Most of what is in a pull request was written by a model: the headline, the messages of the failures (they quote sentences), the notes and the reasons of the
// model check. GitHub turns `@name` into a notification, `#12` into a link and `[text](address)` into a link, so none of it is put in the text as it is: it goes
// in a fenced block, where none of that happens, and the fence is longer than any run of backticks in the text, so that the text cannot close it.

/**
 * The two files of the piece that `held` is, written as the site would publish it, and the ledger that goes with it. The release is `owner`: the Desk did not
 * clear it, so the owner releases it by merging. The ledger says that the piece was held, so its gate route is `hold` whatever route the gate gave the last draft
 * (a draft that the gate cleared and the model check did not is held, and a release by the owner needs a route that is not `publish`), and its hold reasons are
 * the reasons of the hold, so that the receipts page says why the piece was held. Throws what the renderer throws for a draft that cannot be written as a
 * piece (a sentence that cites a claim that does not exist, a category that is not a slug).
 */
export function renderHeldPiece(held: HeldArtifact): RenderedPiece {
  return renderDraft(held.draft, held.claims, {
    runId: held.runId,
    gate: { ...held.gate, route: 'hold', holdReasons: [...held.reasons] },
    verifier: held.verifier,
    release: 'owner',
  });
}

/** `renderHeldPiece`, as the files of a piece, checked the way that Publish checks them: the slug is a plain slug and the ledger is one that the site accepts. */
export function heldPieceFiles(held: HeldArtifact): PieceFiles {
  const slug = held.draft.slug;
  if (!isPlainSlug(slug)) throw new Error(`heldPieceFiles: "${slug}" is not a plain slug, and a slug is a file name`);
  const { mdx, ledger } = renderHeldPiece(held);
  const checked = LedgerEntry.safeParse(ledger);
  if (!checked.success) throw new Error(`heldPieceFiles: the ledger of the piece is not one the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  return { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` };
}

/** The most characters of a headline in the title of a pull request. */
const TITLE_MAX = 100;

/** The most characters in one block of the text of a pull request that a model wrote. GitHub takes 65,536 for the whole text. */
const BLOCK_MAX = 4000;

/**
 * The title of the pull request: `Held: ` and the headline of the piece, on one line and cut at 100 characters. It starts with `Held: ` always, so that no program
 * can take it for an option; a piece with no headline is named by its slug.
 */
export function holdPrTitle(held: HeldArtifact): string {
  const headline = held.draft.title.text.replace(/\s+/g, ' ').trim();
  if (headline === '') return `Held: ${held.draft.slug}`;
  const letters = Array.from(headline);
  return `Held: ${letters.length > TITLE_MAX ? `${letters.slice(0, TITLE_MAX - 3).join('')}...` : headline}`;
}

/** `text` as a code span: on one line, with a delimiter longer than any run of backticks in it. */
function inlineCode(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim() || '(empty)';
  const longest = Math.max(0, ...[...line.matchAll(/`+/g)].map((run) => run[0].length));
  const ticks = '`'.repeat(longest + 1);
  const pad = line.startsWith('`') || line.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${line}${pad}${ticks}`;
}

/** `text` cut to `BLOCK_MAX` characters (and not in the middle of a pair), with a line that says how much was left out. */
function clip(text: string): string {
  if (text.length <= BLOCK_MAX) return text;
  const cut = /[\ud800-\udbff]$/.test(text.slice(0, BLOCK_MAX)) ? BLOCK_MAX - 1 : BLOCK_MAX;
  return `${text.slice(0, cut)}\n[cut: ${text.length - cut} more characters]`;
}

/** `text` in a fenced block. The fence is made of more backticks than the longest run in the text (and at least three), so that nothing in the text can close it. */
function fenced(text: string): string {
  const body = clip(text.replace(/\r\n?/g, '\n').replace(/\n+$/, ''));
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${body}\n${fence}`;
}

/** The words for a code: what the holds page of the site says for it, or a line that says there are none, and never the words of anyone else. */
const wordsFor = (code: string): string => (Object.hasOwn(REASON_LABELS, code) ? (REASON_LABELS[code] as string) : 'no plain words are written for this code');

/**
 * The text of the pull request, as markdown: what was held and why (each reason with its words), the piece, what the gate said, what the model check said, and how
 * to publish the piece and how to discard it. A pure function of `held`. Everything that a model wrote (the headline, the messages of the gate's failures, the notes
 * and the reasons of the model check) is in a fenced block. What is not in one is the Desk's own: the slug, the day, the categories, the id of the run, the name of the
 * model, the codes, the counts and the words of the holds page.
 */
export function holdPrBody(held: HeldArtifact): string {
  const slug = held.draft.slug;
  const files = sitePaths();
  const checks = Object.entries(held.gate.checks);
  const failedChecks = checks.filter(([, result]) => result === 'fail').map(([id]) => id);
  const last = held.history.at(-1);
  const modelCheckAsked = last?.verifier !== null;

  const gateLines = held.gate.failures.map((failure) => `${failure.code}: ${failure.message}${failure.where === undefined ? '' : ` (${failure.where})`}`);
  const modelLines = (last?.verifierFailures ?? []).map((failure) => `${failure.id} (${failure.kind}, ${failure.code}): ${failure.reason}`);

  const lines = [
    `# Held by the Desk: ${inlineCode(slug)}`,
    '',
    'The Desk did not publish this piece by itself, so it is here for you to decide. It is a draft pull request: nothing on the site changes until you merge it.',
    '',
    '## Why it was held',
    '',
    ...held.reasons.map((code) => `- ${inlineCode(code)}: ${wordsFor(code)}`),
    '',
    '## The piece',
    '',
    '| | |',
    '|---|---|',
    `| Slug | ${inlineCode(slug)} |`,
    `| Day | ${inlineCode(held.date)} |`,
    `| Categories | ${held.draft.categories.length === 0 ? '(none)' : held.draft.categories.map(inlineCode).join(', ')} |`,
    `| Run | ${inlineCode(held.runId)} |`,
    `| Rounds of revision | ${held.rounds} |`,
    `| The article | ${inlineCode(files.newsFile(slug))} |`,
    `| Its ledger | ${inlineCode(files.ledgerFile(slug))} |`,
    '',
    'The headline, as the model wrote it. Everything below in a grey box was written by a model and is shown as it is, as data, and nobody has checked it.',
    '',
    fenced(held.draft.title.text),
    '',
    '## What the gate said',
    '',
    `${checks.length - failedChecks.length} of ${checks.length} checks passed.${failedChecks.length === 0 ? '' : ` Failed: ${failedChecks.map(inlineCode).join(', ')}.`} It ${held.gate.failures.length === 0 ? 'found no failure' : `found ${held.gate.failures.length} ${held.gate.failures.length === 1 ? 'failure' : 'failures'}`} in the last draft.`,
    ...(gateLines.length === 0 ? [] : ['', fenced(gateLines.join('\n'))]),
    '',
    '## What the model check said',
    '',
    `The model check (${inlineCode(held.verifier.model)}) ${modelCheckAsked ? (held.verifier.passed ? 'passed the last draft.' : 'did not pass the last draft.') : 'was not asked about the last draft: the gate had sent it back, and a draft that the gate has sent back is not shown to the model.'}`,
    ...(held.verifier.notes.length === 0 ? [] : ['', 'Its notes:', '', fenced(held.verifier.notes.join('\n'))]),
    ...(modelLines.length === 0 ? [] : ['', 'What it did not clear:', '', fenced(modelLines.join('\n'))]),
    '',
    '## To publish it',
    '',
    '1. Open **Files changed** and read the article and its ledger.',
    '2. If you agree with every sentence, click **Ready for review** and merge the pull request. The site is built again and shows the piece, and its receipts page says that the owner released it.',
    '',
    '## To discard it',
    '',
    'Close the pull request without merging it. Nothing is published, and the hold stays on record in the desk state.',
    '',
  ];
  return lines.join('\n');
}
```

- [ ] **Step 5: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/stages/hold-pr.test.ts test/stages/hold.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  3 passed (3)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/stages/hold-pr.ts desk/test/stages/hold-pr.test.ts desk/test/support/held.ts desk/test/support/pieces.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Commit**

```bash
git add desk/src/stages/hold-pr.ts desk/test/fetch/exports.test.ts desk/test/stages/hold-pr.test.ts desk/test/stages/hold.test.ts desk/test/support/held.ts desk/test/support/pieces.ts
git commit -m "feat(desk): a held piece is written for the owner as the two files of a piece that the site accepts, with release owner and the reasons of the hold in its ledger, and the title and the text of its pull request say what was held and why, with everything that a model wrote in a fenced block that it cannot close" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Show that the fence is what keeps the text in**

The hostile tests are worth something only if they can fail. The fence of a block is as long as it is because of one expression. Make it a fixed three backticks, and the tests that put a fence of backticks in the model's text must fail.

Run: `node -e "const fs=require('fs');const f='desk/src/stages/hold-pr.ts';const t=fs.readFileSync(f,'utf8');if(!t.includes('Math.max(3, longest + 1)'))throw new Error('not found');fs.writeFileSync(f,t.replace('Math.max(3, longest + 1)','3'))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/stages/hold-pr.test.ts`
Expected: FAIL — `keeps the text, whole, inside its block` and `closing the fence early`

Put it back.

Run: `git checkout -- desk/src/stages/hold-pr.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

---

### Task 13: The hold flow: the piece goes to the owner

**Files:**
- Create: `desk/test/support/repo.ts` (a real git repository for the tests), `desk/test/stages/hold-flow.test.ts`, `desk/test/run/forge-run.test.ts`
- Modify: `desk/src/run/git.ts` (`GitTarget` can make a branch beside the checkout), `desk/src/run/target.ts` (`commitPieceToBranch`, `dropBranch`), `desk/src/stages/hold-pr.ts` (`sendToOwner`), `desk/src/stages/hold.ts` (`runHold` takes a forge), `desk/src/run/orchestrate.ts` (the `forge` option, `pullRequest` in the result), `desk/src/cli.ts` (the forge and the stages in `CliDeps`, `resultLines`), `desk/src/bin.ts` (the real forge), `desk/vitest.config.ts` (a longer limit for a test)
- Test: `desk/test/run/git.test.ts`, `desk/test/run/target.test.ts`, `desk/test/cli.test.ts`, `desk/test/fetch/exports.test.ts`

Tasks 11 and 12 built the parts. This task puts them in order. When a run ends held, is not dry, and has a forge, the Hold stage does this, and stops at the first step that fails:

1. Writes the held draft into the folder of the run, as it always did.
2. Writes the draft as a piece (`heldPieceFiles`). A draft that cannot be written as a piece (a sentence cites a claim that does not exist) is **not sent**: there is nothing for the owner to merge. The hold is recorded without an address, and the reason of the run says why.
3. Checks that the places the Desk writes to are in order (`target.preflight`: the desk state can be read and nothing there has a change that is not committed) and that the repository has a remote.
4. Commits the two files to the branch `hold/<day>-<slug>`, with `commitPieceToBranch`.
5. Pushes the branch and opens the draft pull request into `main`.
6. **Only then** records the hold in the desk state, with the address of the pull request as `prUrl`, and commits the desk state to `main`. The pull request comes first because the record must have its address.

**How the branch is made.** The obvious way is to switch to a new branch, write the files, commit and switch back. That leaves the checkout on the wrong branch, or with files in it, whenever something fails in between, and a run that fails in a workflow must leave the checkout as it found it. So the branch is made **beside the checkout** and the checkout is never changed. `GitCli.commitToNewBranch` builds the commit with the lower-level commands of git: it reads the tree of the commit that the checkout is on into an index file of its own (in a temporary folder, with `GIT_INDEX_FILE`), adds the two files to that index (`hash-object -w`, `update-index --cacheinfo`), writes the tree (`write-tree`), makes the commit (`commit-tree`, with the message and the trailer of the project) and makes the branch point at it (`update-ref`, which refuses when the branch is already there). The working tree, the real index and the branch that the checkout is on are not read or written. It starts from the **commit**, not from the files of the checkout, so a change that is not committed is not on the branch. `GitTarget` also gets `currentBranch()` and `deleteBranch(branch)`, and `FakeGit` keeps the names of the branches.

The branch is refused unless the checkout is on `main` (the pull request is into `main`, and a branch made from another branch would carry that branch's commits), and unless the two files are not there yet.

**What is left when a step fails.** In every case the run ends `failed` at the stage `hold` (the next try of the day is allowed, as for any failure), the held draft is still in the folder of the run, and the desk state has no hold. The only thing that `main` gains is the record that the run failed, which every failed run makes.

| Step that fails | What is left |
|---|---|
| The draft cannot be written as a piece | Nothing fails: the hold is recorded without an address; the reason says `no pull request: ...` |
| The desk state or the content folders have changes that are not committed | Nothing was made; the forge was not asked anything |
| There is no remote | Nothing was made |
| The checkout is not on `main`, the branch is there, the slug is taken | Nothing was made; a branch that was there is left as it was |
| The push fails | The branch is removed |
| The pull request cannot be opened (the branch was pushed) | The local branch is removed; the branch is on the remote, and the error says so, so that the owner can open the pull request by hand |
| The hold cannot be recorded after the pull request was opened | The pull request and the branch stay, and the error says where the pull request is and that the hold is not recorded |

**A bug that the last row found.** `GitCli.commit` runs `git add` and then `git commit`. When the commit fails (a hook refuses it, the disk is full) the files stay **staged**, and the next commit of the Desk then refuses, because something is staged that is not its own. After this task a failed commit puts the index back for the files it staged (`git reset -- <files>`, which does not touch the files themselves).

**The checkout of the tests.** The tests of this task need to see what is left in a repository, so they use a real one: `initRepo` (in `desk/test/support/repo.ts`) commits the made-up site once on `main`, with no remote, and the forge is a `FakeForge`. Git starts many programs, and the whole suite runs many files at once, so the limit of a test in `desk/vitest.config.ts` is 30 seconds instead of 5, and the limit of the set-up that runs before the tests of a file (the adversarial matrix runs all its scenarios there) is a minute instead of 10 seconds: they are there for a test that hangs, not for one that is slow.

**What the command prints.** `desk run` prints a line `pull request: <address>` after `piece:` when the hold was sent; the line that says why the run ended (`reason:`) says it too (`held for G10_NOT_ENTAILED; draft pull request <address>`). The lines are made by `resultLines`, which is exported so that it can be tested. The program, `desk/src/bin.ts`, gives `main` the real forge, `GhForge(nodeExec(), { cwd })`, and a run in a workflow therefore sends the piece without anyone asking for it. `CliDeps` gets `forge` and `stages` (the stages that a test puts in the place of the real ones, as `runDesk` already allows).

- [ ] **Step 1: Write the tests**

A real repository for the tests, and the helpers that read what is left in it.

**Create `desk/test/support/repo.ts`:**
```ts
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
```

The tests of git. `GitCli` now makes a branch beside the checkout, says which branch the checkout is on and removes a branch, and puts the index back when a commit fails; `FakeGit` keeps the branches. The helpers that these tests had of their own are replaced by the shared ones.

**In `desk/test/run/git.test.ts`, replace:**
```ts
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { useScratch } from '../support/context';

// The Desk commits only what it wrote, only the files it names, and only into a repository that has nothing else of the Desk's in the way.
```

**with:**
```ts
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMIT_TRAILER, FakeGit, GitCli, MAIN_BRANCH } from '../../src/run/git';
import { useScratch } from '../support/context';
import { ISOLATED, changesIn, git, show } from '../support/repo';

// The Desk commits only what it wrote, only the files it names, and only into a repository that has nothing else of the Desk's in the way.
```

**In `desk/test/run/git.test.ts`, replace:**
```ts
const scratch = useScratch();

/** The settings of the machine that runs the tests (who signs, which hooks) must not reach these repositories. */
const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();

const cliFor = (dir: string): GitCli => new GitCli(dir, { env: ISOLATED });

/** The files that have a change that is not committed, as `git status` says them, in order. */
const changesIn = (dir: string): string[] =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } })
    .split('\n')
    .filter((line) => line !== '')
    .sort();

function write(dir: string, file: string, text: string): void {
```

**with:**
```ts
const scratch = useScratch();

const cliFor = (dir: string, tempDir?: string): GitCli => new GitCli(dir, { env: ISOLATED, ...(tempDir === undefined ? {} : { tempDir }) });

function write(dir: string, file: string, text: string): void {
```

**In `desk/test/run/git.test.ts`, replace:**
```ts
  });

  it('runs git with the environment it needs, which a hook of git can show: paths are literal, nothing asks for a password, and messages are in one language', async () => {
    const dir = makeRepo();
```

**with:**
```ts
  });

  it('puts the index back when the commit fails, so that the next commit is not refused for what was left staged: the files are as they were, and nothing is staged', async () => {
    const dir = makeRepo();
    const hook = path.join(dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    writePiece(dir);
    await expect(cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece')).rejects.toThrow('git commit failed');
    expect(git(dir, 'diff', '--cached', '--name-only')).toBe('');
    expect(changesIn(dir)).toEqual([` M ${STATE}`, `?? ${LEDGER}`, `?? ${NEWS}`]);
    expect(git(dir, 'log', '--format=%s')).toBe('start');
    rmSync(hook);
    await expect(cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece')).resolves.toMatch(/^[0-9a-f]{40}$/);
  });

  it('runs git with the environment it needs, which a hook of git can show: paths are literal, nothing asks for a password, and messages are in one language', async () => {
    const dir = makeRepo();
```

**In `desk/test/run/git.test.ts`, replace:**
```ts
});

describe('FakeGit', () => {
  it('records each commit with its paths and its message, and gives each an id of its own', async () => {
```

**with:**
```ts
});

const BRANCH = 'hold/2026-10-05-new-piece';

describe('GitCli.currentBranch', () => {
  it('is the name of the branch that the checkout is on', async () => {
    const dir = makeRepo();
    expect(await cliFor(dir).currentBranch()).toBe('main');
    git(dir, 'switch', '--quiet', '-c', 'other');
    expect(await cliFor(dir).currentBranch()).toBe('other');
  });

  it('is undefined when the checkout is on no branch', async () => {
    const dir = makeRepo();
    git(dir, 'checkout', '--quiet', '--detach');
    expect(await cliFor(dir).currentBranch()).toBeUndefined();
  });
});

describe('GitCli.commitToNewBranch', () => {
  const files = [
    { path: NEWS, text: 'news\n' },
    { path: LEDGER, text: '{}\n' },
  ];

  it('makes a branch with one commit that adds the files, on the commit that the checkout is on, and returns the id of the commit', async () => {
    const dir = makeRepo();
    const head = git(dir, 'rev-parse', 'HEAD');
    const id = await cliFor(dir).commitToNewBranch(BRANCH, files, 'desk: held piece new-piece');
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(git(dir, 'rev-parse', BRANCH)).toBe(id);
    expect(git(dir, 'rev-parse', `${BRANCH}^`)).toBe(head);
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS]);
    expect(show(dir, `${BRANCH}:${NEWS}`)).toBe('news\n');
    expect(show(dir, `${BRANCH}:${LEDGER}`)).toBe('{}\n');
    // The files that were there are still there, unchanged.
    expect(git(dir, 'ls-tree', '-r', '--name-only', BRANCH).split('\n')).toEqual(['README.md', LEDGER, 'site/src/content/news/older.mdx', NEWS, STATE].sort());
  });

  it('writes the message as the subject and the trailer of the project as a trailer, as a commit of the Desk does', async () => {
    const dir = makeRepo();
    await cliFor(dir).commitToNewBranch(BRANCH, files, 'desk: held piece new-piece');
    expect(git(dir, 'log', '-1', '--format=%B', BRANCH)).toBe(`desk: held piece new-piece\n\n${COMMIT_TRAILER}`);
  });

  it('does not change the checkout: not the branch it is on, not what it has, not its index, and not the changes that are not committed', async () => {
    const dir = makeRepo();
    write(dir, 'README.md', 'changed, not staged\n');
    write(dir, 'staged.txt', 'staged\n');
    git(dir, 'add', 'staged.txt');
    write(dir, 'notes.txt', 'mine\n');
    const before = { head: git(dir, 'rev-parse', 'HEAD'), changes: changesIn(dir), index: readFileSync(path.join(dir, '.git/index')), branch: git(dir, 'branch', '--show-current') };
    await cliFor(dir).commitToNewBranch(BRANCH, files, 'desk: held piece new-piece');
    expect({ head: git(dir, 'rev-parse', 'HEAD'), changes: changesIn(dir), index: readFileSync(path.join(dir, '.git/index')), branch: git(dir, 'branch', '--show-current') }).toEqual(before);
    expect(existsSync(path.join(dir, NEWS))).toBe(false);
    expect(existsSync(path.join(dir, LEDGER))).toBe(false);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('changed, not staged\n');
  });

  it('starts from the commit and not from the files of the checkout: a change that is not committed is not on the branch', async () => {
    const dir = makeRepo();
    write(dir, STATE, '{"changed":true}\n');
    await cliFor(dir).commitToNewBranch(BRANCH, files, 'desk: held piece new-piece');
    expect(show(dir, `${BRANCH}:${STATE}`)).toBe('{}\n');
    expect(readFileSync(path.join(dir, STATE), 'utf8')).toBe('{"changed":true}\n');
  });

  it('puts the text on the branch as it is, byte for byte: line endings, no final newline, quotes and letters outside ASCII', async () => {
    const dir = makeRepo();
    const odd = `a "quoted" line\r\nand a lone return\rno final newline, and an e with an accent: ${String.fromCharCode(233)}`;
    await cliFor(dir).commitToNewBranch(BRANCH, [{ path: NEWS, text: odd }], 'desk: held piece new-piece');
    expect(show(dir, `${BRANCH}:${NEWS}`)).toBe(odd);
  });

  it('takes a path relative to the repository or an absolute one', async () => {
    const dir = makeRepo();
    const id = await cliFor(dir).commitToNewBranch(BRANCH, [{ path: path.join(dir, NEWS), text: 'a\n' }, { path: LEDGER, text: 'b\n' }], 'x');
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS]);
  });

  it('refuses a branch that is there, says so, and leaves that branch as it was', async () => {
    const dir = makeRepo();
    git(dir, 'branch', BRANCH);
    const tip = git(dir, 'rev-parse', BRANCH);
    await expect(cliFor(dir).commitToNewBranch(BRANCH, files, 'x')).rejects.toThrow(`the branch ${BRANCH} already exists`);
    expect(git(dir, 'rev-parse', BRANCH)).toBe(tip);
  });

  describe.each(['', 'Hold/x', 'hold/x y', '-hold/x', '--force', '../main', 'hold/../main', 'hold//x', 'hold/x/', 'hold/x.lock', 'hold/x;id', 'hold/$(id)', 'hold/x\ny'])('the branch name %j', (name) => {
    it('is refused before anything is run', async () => {
      // A folder that is not a repository: git would fail there, so a refusal that says anything else was made before git was run.
      await expect(cliFor(scratch()).commitToNewBranch(name, files, 'x')).rejects.toThrow('is not a branch name that the Desk makes');
    });
  });

  it('refuses no files, the same file twice, a path outside the repository, the repository itself, and a message that says nothing', async () => {
    const dir = makeRepo();
    const cli = cliFor(dir);
    await expect(cli.commitToNewBranch(BRANCH, [], 'x')).rejects.toThrow('needs at least one file');
    await expect(cli.commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a' }, { path: `./${NEWS}`, text: 'b' }], 'x')).rejects.toThrow('the same file twice');
    await expect(cli.commitToNewBranch(BRANCH, [{ path: '../outside.txt', text: 'a' }], 'x')).rejects.toThrow('is not inside the repository');
    await expect(cli.commitToNewBranch(BRANCH, [{ path: '.', text: 'a' }], 'x')).rejects.toThrow('the whole repository');
    await expect(cli.commitToNewBranch(BRANCH, files, '  ')).rejects.toThrow('needs a message');
    expect(git(dir, 'branch', '--format=%(refname:short)')).toBe('main');
  });

  it('makes nothing when git cannot build the commit, and says what git said: a file that is a folder in the commit that the checkout is on', async () => {
    const dir = makeRepo();
    const error = (await cliFor(dir).commitToNewBranch(BRANCH, [{ path: 'README.md/inside.txt', text: 'a' }], 'x').catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/^git update-index failed: .*README\.md\/inside\.txt/s);
    expect(git(dir, 'branch', '--format=%(refname:short)')).toBe('main');
  });

  it('leaves nothing in the folder for temporary files, whether it made the commit or not', async () => {
    const dir = makeRepo();
    const temporary = scratch();
    await cliFor(dir, temporary).commitToNewBranch(BRANCH, files, 'x');
    await expect(cliFor(dir, temporary).commitToNewBranch('hold/2026-10-06-other', [{ path: 'README.md/inside.txt', text: 'a' }], 'x')).rejects.toThrow();
    expect(readdirSync(temporary)).toEqual([]);
  });

  it('reads its paths as paths and never as patterns, as commit does', async () => {
    const dir = makeRepo();
    const id = await cliFor(dir).commitToNewBranch(BRANCH, [{ path: '*.txt', text: 'star\n' }], 'x');
    expect(filesOf(dir, id)).toEqual(['*.txt']);
  });
});

describe('GitCli.deleteBranch', () => {
  it('removes a branch, and the setting that says what it follows', async () => {
    const dir = makeRepo();
    await cliFor(dir).commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a\n' }], 'x');
    git(dir, 'config', `branch.${BRANCH}.remote`, 'origin');
    await cliFor(dir).deleteBranch(BRANCH);
    expect(git(dir, 'branch', '--format=%(refname:short)')).toBe('main');
    expect(git(dir, 'config', '--list')).not.toContain('branch.hold');
  });

  it('does not remove the branch that the checkout is on, and says so', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).deleteBranch('main')).rejects.toThrow('git branch failed');
    expect(git(dir, 'branch', '--format=%(refname:short)')).toBe('main');
  });

  it('fails for a branch that is not there, and for a name that the Desk does not make', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).deleteBranch(BRANCH)).rejects.toThrow('not found');
    await expect(cliFor(dir).deleteBranch('--all')).rejects.toThrow('is not a branch name that the Desk makes');
  });
});

describe('FakeGit', () => {
  it('records each commit with its paths and its message, and gives each an id of its own', async () => {
```

**In `desk/test/run/git.test.ts`, replace:**
```ts
    await expect(fake.commit(['a'], 'x')).resolves.toMatch(/^[0-9a-f]{40}$/);
  });
});
```

**with:**
```ts
    await expect(fake.commit(['a'], 'x')).resolves.toMatch(/^[0-9a-f]{40}$/);
  });
  it('is on main, which is a branch that exists, and says which branch the checkout is on', async () => {
    const fake = new FakeGit();
    expect(MAIN_BRANCH).toBe('main');
    expect(await fake.currentBranch()).toBe('main');
    expect([...fake.branches]).toEqual(['main']);
    fake.branch = undefined;
    expect(await fake.currentBranch()).toBeUndefined();
  });

  it('makes a branch with the files and the message it is given, and keeps them, apart from the commits on main', async () => {
    const fake = new FakeGit();
    const id = await fake.commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a' }], 'held');
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(fake.branchCommits).toEqual([{ id, branch: BRANCH, files: [{ path: NEWS, text: 'a' }], message: 'held' }]);
    expect(fake.commits).toEqual([]);
    expect([...fake.branches]).toEqual(['main', BRANCH]);
  });

  it('refuses a branch that is there, and a name that the real one refuses, and fails the next branch commit when a test says so', async () => {
    const fake = new FakeGit();
    await fake.commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a' }], 'held');
    await expect(fake.commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a' }], 'held')).rejects.toThrow('already exists');
    await expect(fake.commitToNewBranch('Not A Branch', [], 'held')).rejects.toThrow('is not a branch name');
    fake.failNextBranchCommit = new Error('no space left');
    await expect(fake.commitToNewBranch('hold/2026-10-06-b', [], 'held')).rejects.toThrow('no space left');
    await expect(fake.commitToNewBranch('hold/2026-10-06-b', [], 'held')).resolves.toMatch(/^[0-9a-f]{40}$/);
  });

  it('removes a branch, but not the one that the checkout is on and not one that is not there', async () => {
    const fake = new FakeGit();
    await fake.commitToNewBranch(BRANCH, [{ path: NEWS, text: 'a' }], 'held');
    await fake.deleteBranch(BRANCH);
    expect([...fake.branches]).toEqual(['main']);
    await expect(fake.deleteBranch('main')).rejects.toThrow('the checkout is on');
    await expect(fake.deleteBranch(BRANCH)).rejects.toThrow('is not there');
  });
});
```

The tests of the targets.

**In `desk/test/run/target.test.ts`, replace:**
```ts
    await expect(new DryTarget(empty).apply(publishing())).rejects.toThrow('does not exist');
  });
});
```

**with:**
```ts
    await expect(new DryTarget(empty).apply(publishing())).rejects.toThrow('does not exist');
  });
});

describe('SiteTarget.commitPieceToBranch', () => {
  const BRANCH = 'hold/2026-10-05-fixture-piece';
  const change = { branch: BRANCH, piece: PIECE, message: 'desk: held piece fixture-piece, for the owner to release' };

  it('gives the two files of the piece, as they are, and the message, to git for a new branch, and says which commit it is', async () => {
    const { git, target } = setup();
    const result = await target.commitPieceToBranch(change);
    expect(git.branchCommits).toEqual([
      {
        id: result.commit,
        branch: BRANCH,
        files: [
          { path: NEWS, text: PIECE.mdx },
          { path: LEDGER, text: PIECE.ledger },
        ],
        message: change.message,
      },
    ]);
    expect(result).toEqual({ commit: git.branchCommits[0]?.id, files: [NEWS, LEDGER] });
    expect(git.commits).toEqual([]);
  });

  it('writes nothing into the checkout, and does not move it off the branch that it is on', async () => {
    const { repoDir, git, target } = setup();
    const before = filesBelow(repoDir);
    await target.commitPieceToBranch(change);
    expect(filesBelow(repoDir)).toEqual(before);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(git.branch).toBe('main');
  });

  it('refuses when the checkout is not on main, or on no branch, and makes no branch', async () => {
    const { git, target } = setup();
    git.branch = 'other';
    await expect(target.commitPieceToBranch(change)).rejects.toThrow('from main, but the checkout is on other');
    git.branch = undefined;
    await expect(target.commitPieceToBranch(change)).rejects.toThrow('from main, but the checkout is on no branch');
    expect(git.branchCommits).toEqual([]);
  });

  it('refuses a slug that is not plain, and a piece whose files are already there, and makes no branch', async () => {
    const { repoDir, git, target } = setup();
    await expect(target.commitPieceToBranch({ ...change, piece: { ...PIECE, slug: '../x' } })).rejects.toThrow('is not a plain slug');
    writeFileSync(path.join(repoDir, LEDGER), 'taken\n');
    await expect(target.commitPieceToBranch(change)).rejects.toThrow(`${LEDGER} is already there, so the slug "fixture-piece" is taken`);
    expect(git.branchCommits).toEqual([]);
  });

  it('lets git refuse a branch that is there, and says what git said', async () => {
    const { git, target } = setup();
    await target.commitPieceToBranch(change);
    await expect(target.commitPieceToBranch(change)).rejects.toThrow('already exists');
    expect(git.branchCommits).toHaveLength(1);
  });

  it('does not ask whether the checkout is clean: the branch is made beside it, and a change that is not committed is none of its business', async () => {
    const { git, target } = setup();
    git.dirty.add(STATE);
    await expect(target.commitPieceToBranch(change)).resolves.toMatchObject({ files: [NEWS, LEDGER] });
  });
});

describe('SiteTarget.dropBranch', () => {
  it('removes a branch with git, and fails when git does', async () => {
    const { git, target } = setup();
    await target.commitPieceToBranch({ branch: 'hold/2026-10-05-fixture-piece', piece: PIECE, message: 'x' });
    await target.dropBranch('hold/2026-10-05-fixture-piece');
    expect([...git.branches]).toEqual(['main']);
    await expect(target.dropBranch('hold/2026-10-05-fixture-piece')).rejects.toThrow('is not there');
  });
});

describe('DryTarget: the branch of a held piece', () => {
  it('makes none, and says so: a dry run never reaches the forge, so a call here is a mistake of the Desk', async () => {
    const target = new DryTarget(makeSite(scratch()));
    await expect(target.commitPieceToBranch({ branch: 'hold/2026-10-05-fixture-piece', piece: PIECE, message: 'x' })).rejects.toThrow('a dry run makes no branch');
    await expect(target.dropBranch('hold/2026-10-05-fixture-piece')).rejects.toThrow('a dry run makes no branch');
  });
});

```

The tests of the flow, in a real repository with a `FakeForge`: what is made when it works, and what is left when each step fails.

**Create `desk/test/stages/hold-flow.test.ts`:**
```ts
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { HeldArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { FakeForge, ForgeError, HOLD_BRANCH, holdBranchName } from '../../src/run/forge';
import type { PullRequestRequest } from '../../src/run/forge';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runHold } from '../../src/stages/hold';
import { heldPieceFiles, holdPrBody, holdPrTitle } from '../../src/stages/hold-pr';
import { useScratch } from '../support/context';
import { HOLD_RUN, verdicts } from '../support/held';
import type { Verdict } from '../support/held';
import { placePiece, readPieces } from '../support/pieces';
import { branchesIn, changesIn, git, initRepo, show, subjectsOf } from '../support/repo';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// What a hold does when there is a forge: the piece is committed to a branch of its own, the branch is pushed, the draft pull request is opened, and only then is the hold
// recorded in the desk state, with the address of the pull request. These tests run the real stage in a real git repository (with no remote) and a `FakeForge`, because
// what matters is what is left in the repository, and in particular that the checkout is as it was found whatever goes wrong: no branch that it was not asked for, nothing
// that is not committed, and nothing on `main` but the record.

const scratch = useScratch();
const made = verdicts(scratch);
const STATE = sitePaths().stateFile;

/** A held piece in a checkout that is a real repository, with a forge that does nothing but remember. */
async function setup(verdict?: Verdict) {
  const held = verdict ?? (await made.tier2());
  const repoDir = makeSite(scratch());
  const cli = initRepo(repoDir);
  const forge = new FakeForge();
  const slug = held.verified.draft.slug;
  return { ...held, repoDir, cli, forge, slug, branch: holdBranchName(held.ctx.date, slug), target: new SiteTarget(repoDir, cli) };
}

/** The held draft that the stage wrote, read back. */
const heldIn = (file: string): HeldArtifact => HeldArtifact.parse(JSON.parse(readFileSync(file, 'utf8')));

/** Everything that says the checkout and `main` are as they were found: one commit, no other branch, the state as committed, nothing changed or new. */
function expectUntouched(repoDir: string): void {
  expect(subjectsOf(repoDir)).toEqual(['start']);
  expect(branchesIn(repoDir)).toEqual(['main']);
  expect(git(repoDir, 'branch', '--show-current')).toBe('main');
  expect(changesIn(repoDir)).toEqual([]);
  expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
  expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
}

describe('runHold with a forge: the piece is sent to the owner', () => {
  it('commits the piece to a branch, pushes it, opens a draft pull request into main, and says where it is', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const held = heldIn(result.file);
    expect(branch).toBe(`hold/2026-10-05-${slug}`);
    expect(result.pullRequest).toEqual({ url: 'https://github.example/agentic-media-house/pull/1', number: 1, branch, commit: git(repoDir, 'rev-parse', branch) });
    expect(result.note).toBeNull();
    const request: PullRequestRequest = { branch, title: holdPrTitle(held), body: holdPrBody(held), base: 'main' };
    expect(forge.calls).toEqual([{ method: 'hasRemote' }, { method: 'pushBranch', branch }, { method: 'openDraftPullRequest', request }]);
  });

  it('puts the two files of the piece on the branch, as one commit on top of main, with the message and the trailer of the project', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const files = heldPieceFiles(heldIn(result.file));
    expect(git(repoDir, 'rev-list', '--count', `main..${branch}`)).toBe('1');
    expect(git(repoDir, 'rev-parse', `${branch}^`)).toBe(git(repoDir, 'rev-parse', 'main~1'));
    expect(git(repoDir, 'diff', '--name-status', `${branch}^`, branch).split('\n')).toEqual([`A\tsite/src/content/ledger/${slug}.json`, `A\tsite/src/content/news/${slug}.mdx`]);
    expect(show(repoDir, `${branch}:site/src/content/news/${slug}.mdx`)).toBe(files.mdx);
    // The ledger has the same content as the one that is made again from the draft on disk; the order of the keys of a claim follows the schema there, so the text is compared as data.
    expect(JSON.parse(show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`))).toEqual(JSON.parse(files.ledger));
    expect(git(repoDir, 'log', '-1', '--format=%B', branch)).toBe(`desk: held piece ${slug}, for the owner to release\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
  });

  it('puts on the branch a piece that the site builds: what the site checks of a piece and its ledger passes when the owner merges it', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const merged = makeSite(scratch());
    placePiece(merged, { slug, mdx: show(repoDir, `${branch}:site/src/content/news/${slug}.mdx`), ledger: show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`) });
    const { news, ledgers } = readPieces(merged);
    expect(matchPieces(news, ledgers, []).map((piece) => piece.slug)).toEqual([slug]);
    expect(ledgers[0]?.data.release).toBe('owner');
  });

  it('opens the pull request before the hold is recorded, so that the record has its address, and records the hold on main with it', async () => {
    const { ctx, claims, verified, repoDir, target, slug, branch } = await setup();
    const seen: { stateWhenOpened?: string; subjectsWhenOpened?: string[]; branchWhenPushed?: string } = {};
    class SpyForge extends FakeForge {
      override async pushBranch(name: string): Promise<void> {
        seen.branchWhenPushed = git(repoDir, 'rev-parse', '--verify', name);
        return super.pushBranch(name);
      }
      override async openDraftPullRequest(request: PullRequestRequest) {
        seen.stateWhenOpened = readFileSync(path.join(repoDir, STATE), 'utf8');
        seen.subjectsWhenOpened = subjectsOf(repoDir);
        return super.openDraftPullRequest(request);
      }
    }
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, new SpyForge());
    // The branch was there when it was pushed, and on main the hold was not yet recorded when the pull request was opened.
    expect(seen.branchWhenPushed).toMatch(/^[0-9a-f]{40}$/);
    expect(seen.stateWhenOpened).toBe(COMMITTED_STATE);
    expect(seen.subjectsWhenOpened).toEqual(['start']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect(result.commit).toBe(git(repoDir, 'rev-parse', 'main'));
    expect(result.files).toEqual([STATE]);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: HOLD_RUN.at, outcome: 'held', runId: HOLD_RUN.runId, slug },
      holds: [{ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'], prUrl: result.pullRequest?.url }],
      corrections: [],
    });
    expect(git(repoDir, 'diff', '--name-only', `main~1`, 'main')).toBe(STATE);
    expect(branch).toBe(result.pullRequest?.branch);
  });

  it('leaves the checkout on main with nothing changed and no piece in it: the branch is made beside it', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(git(repoDir, 'branch', '--show-current')).toBe('main');
    expect(changesIn(repoDir)).toEqual([]);
    expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
  });

  it('keeps the held draft in the folder of the run, and logs where the pull request is', async () => {
    const { ctx, logs, claims, verified, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(existsSync(result.file)).toBe(true);
    expect(logs).toContain(`hold: ${slug} is sent to the owner as the draft pull request https://github.example/agentic-media-house/pull/1 (branch ${branch})`);
    expect(logs.at(-1)).toMatch(/^hold: .* is held for TIER2_ATTRIBUTION, written to /);
  });

  it('sends a piece that was held by the model check, which the gate cleared, in the same way', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup(await made.modelCheck());
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.reasons).toEqual(['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED']);
    expect(git(repoDir, 'rev-parse', '--verify', branch)).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.parse(show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`)).gate.route).toBe('hold');
  });

  it('names the branch from the day and the slug, and cuts a long slug so that the branch is still one that the Desk pushes', async () => {
    const verdict = await made.tier2();
    const long = `long-${'x'.repeat(120)}`;
    verdict.verified.draft.slug = long;
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup(verdict);
    expect(branch).toBe(`hold/2026-10-05-${long.slice(0, 80)}`);
    expect(HOLD_BRANCH.test(branch)).toBe(true);
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.pullRequest?.branch).toBe(branch);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
  });
});

describe('runHold with a forge: when a step fails, the run fails and the checkout is as it was', () => {
  it('stops when the push fails, removes the branch, records nothing, and keeps the held draft', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup();
    forge.fail('pushBranch', new ForgeError('auth', 'GitHub did not take the credentials'));
    const error = await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'ForgeError', kind: 'auth', message: 'GitHub did not take the credentials' });
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch']);
    expectUntouched(repoDir);
    expect(existsSync(path.join(ctx.runDir, 'held', `${slug}.json`))).toBe(true);
  });

  it('stops when the pull request cannot be opened, removes the branch, and says that the branch was pushed', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    forge.fail('openDraftPullRequest', new ForgeError('failed', 'GraphQL: Something went wrong'));
    const error = (await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught)) as ForgeError;
    expect(error).toBeInstanceOf(ForgeError);
    expect(error.kind).toBe('failed');
    expect(error.message).toBe(`GraphQL: Something went wrong (the branch ${branch} was pushed and no pull request was opened: open one from it by hand, or delete the branch)`);
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expectUntouched(repoDir);
  });

  it('stops when there is no remote, before anything is made', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    forge.remote = false;
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toMatchObject({ kind: 'no-remote', message: expect.stringContaining('has no remote called origin') });
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expectUntouched(repoDir);
  });

  it('stops when git cannot be asked whether there is a remote', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    forge.fail('hasRemote', new ForgeError('tool-missing', 'git cannot be started'));
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toMatchObject({ kind: 'tool-missing' });
    expectUntouched(repoDir);
  });

  it('refuses when the branch is already there, and leaves that branch exactly as it was', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    git(repoDir, 'branch', branch);
    const tip = git(repoDir, 'rev-parse', branch);
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow(`the branch ${branch} already exists`);
    expect(git(repoDir, 'rev-parse', branch)).toBe(tip);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
    expect(subjectsOf(repoDir)).toEqual(['start']);
  });

  it('refuses when the desk state has a change that is not committed, before it asks the forge anything', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    writeFileSync(path.join(repoDir, STATE), `${COMMITTED_STATE}\n`);
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('has changes that are not committed');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(changesIn(repoDir)).toEqual([' M site/src/data/desk-state.json']);
  });

  it('refuses when there is a file in the folder of the pieces that is not committed', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    writeFileSync(path.join(repoDir, 'site/src/content/news/someone-elses.mdx'), 'not committed\n');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('has changes that are not committed');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('refuses when the checkout is not on main, because the branch would carry the commits of the other branch', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    git(repoDir, 'switch', '--quiet', '-c', 'other');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('but the checkout is on other');
    expect(branchesIn(repoDir)).toEqual(['main', 'other']);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
  });

  it('refuses when the checkout is on no branch', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    git(repoDir, 'checkout', '--quiet', '--detach');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('but the checkout is on no branch');
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('refuses when the slug is taken by a piece that is already on the site', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup();
    writeFileSync(path.join(repoDir, `site/src/content/news/${slug}.mdx`), 'a piece\n');
    git(repoDir, 'add', '.');
    git(repoDir, 'commit', '--quiet', '-m', 'a piece with the same slug');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('so the slug');
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
  });

  it('tells where the pull request is when the hold cannot be recorded after it was opened, and keeps the branch, which the pull request is from', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    // A hook of git that refuses every commit: the branch is made without it, and the commit of the desk state is not.
    const hook = path.join(repoDir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const error = (await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toContain('git commit failed');
    expect(error.message).toContain('the draft pull request https://github.example/agentic-media-house/pull/1 was opened and the hold is not recorded in the desk state');
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(changesIn(repoDir)).toEqual([]);
  });
});

describe('runHold with a forge: what is not sent', () => {
  it('opens no pull request for a draft that cannot be written as a piece, records the hold without an address, and says why', async () => {
    const verdict = await made.tier2();
    verdict.verified.draft.title = { ...verdict.verified.draft.title, claimIds: ['c-99'] } as typeof verdict.verified.draft.title;
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup(verdict);
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toContain('the draft cannot be written as a piece, so there is nothing for the owner to merge');
    expect(result.note).toContain('c-99');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect((await readDeskState(path.join(repoDir, STATE))).holds).toEqual([{ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'] }]);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect(existsSync(result.file)).toBe(true);
  });

  it('never touches the forge in a dry run, and writes nothing', async () => {
    const { ctx, claims, verified, repoDir, forge } = await setup();
    const result = await runHold(ctx, new DryTarget(repoDir), claims, verified, HOLD_RUN, forge);
    expect(forge.calls).toEqual([]);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toBeNull();
    expectUntouched(repoDir);
    expect(existsSync(result.file)).toBe(true);
  });

  it('does what it did before when there is no forge: the hold is recorded without an address, and no branch is made', async () => {
    const { ctx, claims, verified, repoDir, target, slug } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toBeNull();
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect((await readDeskState(path.join(repoDir, STATE))).holds[0]).toEqual({ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'] });
  });
});
```

Whole runs with a forge: only a piece that is held is sent, a forge that fails ends the run `failed` at `hold`, and the next try of the day sends the piece.

**Create `desk/test/run/forge-run.test.ts`:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoClient } from '../../src/demo/story';
import { DEMO_DATE } from '../../src/demo/world';
import { FakeClient } from '../../src/model/fake';
import { clientFromConfig } from '../../src/model/factory';
import { readDeskState } from '../../src/run/desk-state';
import { FakeForge, ForgeError } from '../../src/run/forge';
import type { RunDeskOptions } from '../../src/run/orchestrate';
import { DryTarget, SiteTarget } from '../../src/run/target';
import { useScratch } from '../support/context';
import { branchesIn, changesIn, git, initRepo, subjectsOf } from '../support/repo';
import { SELECT, START, STATE, clock, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE } from '../support/site';

// A whole run with a forge, in the made-up world with a scripted model, in a real git repository that has no remote and with a `FakeForge`. These say what each ending
// of a run does to the repository and to the forge: only a piece that is held is sent to the owner, a forge that fails ends the run as failed at the stage `hold` with
// the repository as it was (but for the record that the run failed), and the next try of the day, with the forge back, sends the piece.

const scratch = useScratch();

/** A run of the made-up day in a repository of its own. `run()` runs it with the forge; any option of the run can be replaced. */
function setup(options: RunSetup = {}) {
  const made = setupRun(scratch, { fake: unentailed(), ...options });
  const cli = initRepo(made.repoDir);
  const forge = new FakeForge();
  const target = new SiteTarget(made.repoDir, cli);
  return { ...made, forge, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ target, forge, ...overrides }) };
}

describe('a run that is held, with a forge', () => {
  it('ends held with the address of the draft pull request, which the output, the record and the desk state all have', async () => {
    const { run, forge, repoDir, dir } = setup();
    const result = await run();
    expect(result.outcome).toBe('held');
    expect(result.stage).toBe('hold');
    expect(result.pullRequest).toBe('https://github.example/agentic-media-house/pull/1');
    expect(result.reason).toBe(`held for G10_NOT_ENTAILED; draft pull request ${result.pullRequest}`);
    expect(recordOf(dir).reason).toBe(result.reason);
    const branch = `hold/${DEMO_DATE}-${result.slug}`;
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: START.toISOString(), outcome: 'held', runId: result.runId, slug: result.slug },
      holds: [{ at: START.toISOString(), categories: expect.any(Array), reasons: ['G10_NOT_ENTAILED'], prUrl: result.pullRequest }],
      corrections: [],
    });
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
  });

  it('commits the piece to the branch and the record of the hold to main, and nothing else anywhere', async () => {
    const { run, repoDir } = setup();
    const result = await run();
    const branch = `hold/${DEMO_DATE}-${result.slug}`;
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${result.slug}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(git(repoDir, 'diff', '--name-only', 'main', branch).split('\n')).toEqual([`site/src/content/ledger/${result.slug}.json`, `site/src/content/news/${result.slug}.mdx`, STATE].sort());
    expect(git(repoDir, 'branch', '--show-current')).toBe('main');
    expect(changesIn(repoDir)).toEqual([]);
    expect(result.commit).toBe(git(repoDir, 'rev-parse', 'main'));
  });

  it('ends failed at the stage hold when the forge fails, with the held draft kept, the hold not recorded, and the repository as it was but for the record that the run failed', async () => {
    const { run, forge, repoDir, dir } = setup();
    forge.fail('pushBranch', new ForgeError('auth', 'GitHub did not take the credentials, so a branch was not pushed'));
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(result.reason).toBe('GitHub did not take the credentials, so a branch was not pushed');
    expect(result.pullRequest).toBeNull();
    expect(result.slug).toBeNull();
    expect(existsSync(path.join(dir, 'held'))).toBe(true);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({ lastRun: { at: START.toISOString(), outcome: 'failed', runId: result.runId, slug: null }, holds: [], corrections: [] });
    expect(subjectsOf(repoDir)).toEqual([`desk: the run of ${DEMO_DATE} failed`, 'start']);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(changesIn(repoDir)).toEqual([]);
    expect(readFileSync(path.join(repoDir, 'site/src/content/news/.gitkeep'), 'utf8')).toBe('');
  });

  it('is tried again the same day when the forge has failed, and the second try sends the piece: the branch of the first try was removed, so the name is free', async () => {
    const made = setup();
    made.forge.fail('openDraftPullRequest', new ForgeError('failed', 'GraphQL: Something went wrong'));
    const first = await made.run();
    expect(first.outcome).toBe('failed');
    expect(first.reason).toContain('the branch');
    expect(first.reason).toContain('was pushed and no pull request was opened');
    expect(branchesIn(made.repoDir)).toEqual(['main']);
    const second = await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake: unentailed() }, {}), now: clock() });
    expect(second.outcome).toBe('held');
    expect(second.attempt).toBe(2);
    expect(second.pullRequest).toBe('https://github.example/agentic-media-house/pull/1');
    expect(branchesIn(made.repoDir)).toEqual([`hold/${DEMO_DATE}-${second.slug}`, 'main'].sort());
    expect(made.forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest', 'hasRemote', 'pushBranch', 'openDraftPullRequest']);
  });

  it('ends failed at the stage hold when the repository has no remote, and sends nothing', async () => {
    const { run, forge, repoDir } = setup();
    forge.remote = false;
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(result.reason).toContain('has no remote called origin');
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('touches nothing of the forge in a dry run, which is the same held piece with no pull request', async () => {
    const { run, forge, repoDir } = setup();
    const result = await run({ target: new DryTarget(repoDir) });
    expect(result.outcome).toBe('held');
    expect(result.dry).toBe(true);
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toBe('held for G10_NOT_ENTAILED');
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual(['start']);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });

  it('holds with no pull request when there is no forge, as before, and says nothing of one', async () => {
    const { run, repoDir } = setup();
    const result = await run({ forge: undefined });
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toBe('held for G10_NOT_ENTAILED');
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${result.slug}`, 'start']);
  });
});

describe('a run that does not end held, with a forge', () => {
  it('publishes without touching the forge: one commit on main with the piece, its ledger and the desk state, and no branch', async () => {
    const { run, forge, repoDir } = setup({ fake: demoClient() });
    const result = await run();
    expect(result.outcome).toBe('published');
    expect(result.pullRequest).toBeNull();
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual([`desk: publish ${result.slug}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main').split('\n')).toEqual([`site/src/content/ledger/${result.slug}.json`, `site/src/content/news/${result.slug}.mdx`, STATE]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('finds no story without touching the forge: one commit on main with the desk state', async () => {
    const { run, forge, repoDir } = setup({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] }) });
    const result = await run();
    expect(result.outcome).toBe('no-story');
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual([`desk: no story on ${DEMO_DATE}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('fails before the hold without touching the forge', async () => {
    const { run, forge, repoDir } = setup({ fake: new FakeClient().script('select', SELECT) });
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).not.toBe('hold');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });
});
```

The command line.

**In `desk/test/cli.test.ts`, replace:**
```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
```

**with:**
```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs, resultLines } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
import { FakeGit } from '../src/run/git';
import { sitePaths } from '../src/run/target';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
```

**with:**
```ts
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
import { FakeForge } from '../src/run/forge';
import { FakeGit } from '../src/run/git';
import type { RunResult, Stages } from '../src/run/orchestrate';
import { sitePaths } from '../src/run/target';
import { runVerify } from '../src/stages/verify';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(await main(['status'], deps)).toBe(0);
  });
});
```

**with:**
```ts
    expect(await main(['status'], deps)).toBe(0);
  });
});

describe('resultLines', () => {
  const RESULT: RunResult = {
    outcome: 'held',
    runId: '2026-10-05-043100',
    stage: 'hold',
    reason: 'held for TIER2_ATTRIBUTION; draft pull request https://github.example/agentic-media-house/pull/7',
    slug: 'a-piece',
    attempt: 2,
    pullRequest: 'https://github.example/agentic-media-house/pull/7',
    commit: 'abc123',
    dry: false,
    dir: '/runs/2026-10-05',
    files: ['x'],
  };

  it('prints the outcome, the run, the try, the folder, the piece, the pull request, the reason and the commit, in that order, for a piece that is held and sent', () => {
    expect(resultLines(RESULT)).toEqual([
      'outcome: held',
      'run: 2026-10-05-043100',
      'attempt: 2',
      'folder: /runs/2026-10-05',
      'piece: a-piece',
      'pull request: https://github.example/agentic-media-house/pull/7',
      'reason: held for TIER2_ATTRIBUTION; draft pull request https://github.example/agentic-media-house/pull/7',
      'commit: abc123',
    ]);
  });

  it('has no line for what a run does not have: no piece, no pull request, no reason, no commit', () => {
    expect(resultLines({ ...RESULT, outcome: 'published', stage: 'publish', reason: null, pullRequest: null, commit: null })).toEqual(['outcome: published', 'run: 2026-10-05-043100', 'attempt: 2', 'folder: /runs/2026-10-05', 'piece: a-piece']);
  });

  it('says the stage for a run that ended with no piece, and what a dry run would have written', () => {
    expect(resultLines({ ...RESULT, outcome: 'no-story', stage: 'select', reason: 'nothing', slug: null, pullRequest: null, commit: null, dry: true, files: ['a', 'b'] })).toEqual([
      'outcome: no-story',
      'run: 2026-10-05-043100',
      'attempt: 2',
      'folder: /runs/2026-10-05',
      'reason: nothing',
      'stage: select',
      'dry run: nothing was written to the site or to git (2 files would have been)',
    ]);
    expect(resultLines({ ...RESULT, outcome: 'failed', stage: 'hold', reason: 'boom', slug: null, pullRequest: null, commit: 'abc' })).toContain('stage: hold');
  });
});

describe('desk run: a held piece that was sent to the owner', () => {
  it('gives the forge to the run, and prints where the pull request is', async () => {
    const forge = new FakeForge();
    let given: unknown;
    const stages: Partial<Stages> = {
      verify: async (...args) => ({ ...(await runVerify(...args)), outcome: 'hold' as const }),
      hold: async (_ctx, _target, _claims, verified, _run, forgeGiven) => {
        given = forgeGiven;
        return {
          slug: verified.draft.slug,
          file: '/runs/held.json',
          reasons: ['TIER2_ATTRIBUTION'],
          commit: null,
          files: [],
          pullRequest: { url: 'https://github.example/agentic-media-house/pull/7', number: 7, branch: 'hold/2026-10-05-x', commit: 'c'.repeat(40) },
          note: null,
        };
      },
    };
    const { call, out } = setup({ forge, stages });
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(given).toBe(forge);
    expect(out).toContain('outcome: held');
    expect(out).toContain('pull request: https://github.example/agentic-media-house/pull/7');
  });

  it('gives no forge to a run when there is none', async () => {
    let given: unknown = 'not called';
    const stages: Partial<Stages> = {
      verify: async (...args) => ({ ...(await runVerify(...args)), outcome: 'hold' as const }),
      hold: async (_ctx, _target, _claims, verified, _run, forgeGiven) => {
        given = forgeGiven;
        return { slug: verified.draft.slug, file: '/runs/held.json', reasons: ['TIER2_ATTRIBUTION'], commit: null, files: [], pullRequest: null, note: null };
      },
    };
    const { call, out } = setup({ stages });
    expect(await call(...DRY_DEMO)).toBe(0);
    expect(given).toBeUndefined();
    expect(out.some((line) => line.startsWith('pull request:'))).toBe(false);
  });
});

```

The package entry point.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
import * as entry from '../../src/index';
import type {
  Candidate,
  ComposeArtifact,
```

**with:**
```ts
import * as entry from '../../src/index';
import type {
  BranchChange,
  BranchFile,
  BranchResult,
  Candidate,
  ComposeArtifact,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  ExtractedPage,
  ExecResult,
  FakeCommit,
  FeedErrorKind,
```

**with:**
```ts
  ExtractedPage,
  ExecResult,
  FakeBranchCommit,
  FakeCommit,
  FeedErrorKind,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'GitCli',
  'FakeGit',
  'HOLD_BRANCH',
  'holdBranchName',
```

**with:**
```ts
  'GitCli',
  'FakeGit',
  'MAIN_BRANCH',
  'HOLD_BRANCH',
  'holdBranchName',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      PullRequest,
      ExecResult,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      PullRequest,
      ExecResult,
      BranchFile,
      BranchChange,
      BranchResult,
      FakeBranchCommit,
    ];
    const nothing: Exported | undefined = undefined;
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'judgePlan', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf', 'renderHeldPiece', 'heldPieceFiles', 'holdPrTitle', 'holdPrBody'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
```

**with:**
```ts
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'judgePlan', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    const publication = ['runPublish', 'runHold', 'holdReasonsOf', 'renderHeldPiece', 'heldPieceFiles', 'holdPrTitle', 'holdPrBody', 'sendToOwner'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/git.test.ts test/run/target.test.ts test/stages/hold-flow.test.ts test/run/forge-run.test.ts test/cli.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `commitToNewBranch is not a function`, `commitPieceToBranch is not a function` and `resultLines is not a function`

- [ ] **Step 3: Make git able to make a branch beside the checkout**

**In `desk/src/run/git.ts`, replace:**
```ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
```

**with:**
```ts
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
```

**In `desk/src/run/git.ts`, replace:**
```ts
// How the Desk commits. The Publish stage and the runs that end in a hold write a few files and commit exactly those, and the rest of the
// repository is none of their business: they name each file, they refuse to start when something else of the Desk's is in the way, and they
// never push (that is for the daily workflow of a later plan). A `GitTarget` is the part of git they use, so that a stage can be tested with a
// `FakeGit` and the real thing, `GitCli`, is tested once, in a repository that a test makes in a temporary folder.

/** The trailer that ends every commit of this project, the Desk's own included: it records which model wrote what. */
export const COMMIT_TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';

export interface GitTarget {
  /** True when none of `paths` (files or folders) has a change that is not committed: nothing modified, staged, deleted or new and not tracked. */
```

**with:**
```ts
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
```

**In `desk/src/run/git.ts`, replace:**
```ts
   */
  commit(paths: readonly string[], message: string): Promise<string>;
}

```

**with:**
```ts
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

```

**In `desk/src/run/git.ts`, replace:**
```ts
  /** Variables of the environment for git, laid over those of this process. A test uses it to keep the settings of the machine out. */
  env?: Readonly<Record<string, string>>;
}

/** Git, run as a program in the folder of a repository. Only `isClean` and `commit` are done: there is no way to push, branch or reset. */
export class GitCli implements GitTarget {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
```

**with:**
```ts
  /** Variables of the environment for git, laid over those of this process. A test uses it to keep the settings of the machine out. */
  env?: Readonly<Record<string, string>>;
  /** Where the index file for a commit on a new branch is made, for the time the commit takes. The system's folder for temporary files by default. */
  tempDir?: string;
}

/** The names of branches that `GitCli` makes and removes: lowercase letters and digits, joined by single hyphens or slashes. No name can start like an option or make a path that goes up. */
const BRANCH_NAME = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/** The id that stands for a reference that is not there yet: `update-ref` with it makes a branch only if there is none. */
const NOT_THERE = '0'.repeat(40);

function assertBranchName(branch: string): void {
  if (!BRANCH_NAME.test(branch)) throw new Error(`${JSON.stringify(branch)} is not a branch name that the Desk makes (lowercase letters and digits joined by single hyphens or slashes)`);
}

/**
 * Git, run as a program in the folder of a repository. It commits the files it is told to and makes the branch of a held piece beside the checkout; there is no way
 * to push, to switch branches or to reset.
 */
export class GitCli implements GitTarget {
  private readonly env: NodeJS.ProcessEnv;
  private readonly tempDir: string | undefined;

  constructor(
```

**In `desk/src/run/git.ts`, replace:**
```ts
    // A path is a path and never a pattern; nothing may ask for a password; the messages of git are in the same language everywhere.
    this.env = { ...process.env, ...options.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  }

  /** Run git with these arguments and return what it printed; a failure says which command failed and what git said. */
  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd: this.dir, env: this.env, maxBuffer: 16 * 1024 * 1024 });
      return stdout;
    } catch (error) {
```

**with:**
```ts
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
```

**In `desk/src/run/git.ts`, replace:**
```ts
    if (staged.length > 0) throw new Error(`the repository already has changes staged that are not the Desk's (${staged.join(', ')}), so the Desk does not commit`);
    await this.git(['add', '--', ...files]);
    // With the files named after the options, git commits those files and nothing else in the index.
    await this.git(['commit', '-m', message, '-m', COMMIT_TRAILER, '--', ...files]);
    return (await this.git(['rev-parse', 'HEAD'])).trim();
  }
}

```

**with:**
```ts
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

```

**In `desk/src/run/git.ts`, replace:**
```ts
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
```

**with:**
```ts
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
```

**In `desk/src/run/git.ts`, replace:**
```ts
    return id;
  }
}
```

**with:**
```ts
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
```

Run: `npm test --workspace @robywire/desk -- test/run/git.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 4: Let the targets put a piece on a branch**

**In `desk/src/run/target.ts`, replace:**
```ts
import { writeFileAtomic } from './atomic';
import { assertNothingLost, readDeskState, updateDeskState } from './desk-state';
import type { GitTarget } from './git';

```

**with:**
```ts
import { writeFileAtomic } from './atomic';
import { assertNothingLost, readDeskState, updateDeskState } from './desk-state';
import { MAIN_BRANCH } from './git';
import type { GitTarget } from './git';

```

**In `desk/src/run/target.ts`, replace:**
```ts
// same slug) and it changes the desk state, and all of that goes into one commit. A `PublishTarget` is that, so that the stages do not know
// whether they are writing to the real checkout of the site or only going through the motions. `SiteTarget` writes and commits; `DryTarget`
// runs the same checks and writes nothing (a dry run, `desk run --dry`).

/** The folders and the files of the site that the Desk uses, as paths below the repository (the folder of the site is `site`). */
```

**with:**
```ts
// same slug) and it changes the desk state, and all of that goes into one commit. A `PublishTarget` is that, so that the stages do not know
// whether they are writing to the real checkout of the site or only going through the motions. `SiteTarget` writes and commits; `DryTarget`
// runs the same checks and writes nothing (a dry run, `desk run --dry`). A held piece is the one thing that is not committed to the checkout: its two files go
// on a branch of their own, made beside the checkout, which is pushed for the owner to merge or close (`commitPieceToBranch`).

/** The folders and the files of the site that the Desk uses, as paths below the repository (the folder of the site is `site`). */
```

**In `desk/src/run/target.ts`, replace:**
```ts
}

export interface PublishTarget {
  /** True for a target that writes nothing. */
```

**with:**
```ts
}

/** A piece to put on a branch of its own: the name of the branch, the two files of the piece, and the subject of the one commit. */
export interface BranchChange {
  branch: string;
  piece: PieceFiles;
  message: string;
}

/** The commit that the piece is in, on its branch, and the files it covers, as paths below the repository. */
export interface BranchResult {
  commit: string;
  files: string[];
}

export interface PublishTarget {
  /** True for a target that writes nothing. */
```

**In `desk/src/run/target.ts`, replace:**
```ts
   */
  apply(change: TargetChange): Promise<TargetResult>;
}

```

**with:**
```ts
   */
  apply(change: TargetChange): Promise<TargetResult>;
  /**
   * Put the two files of a piece on a new branch, in one commit made from the commit that the checkout is on, and say which commit. The checkout is not changed: nothing is
   * written to it, and it stays on the branch it is on. Refuses, before anything is made, when the checkout is not on `main` (the pull request of the branch is into `main`, and
   * a branch made from another would carry that branch's commits), when the slug is not a plain slug, and when the files are already there. A dry target makes no branch.
   */
  commitPieceToBranch(change: BranchChange): Promise<BranchResult>;
  /** Remove a branch that `commitPieceToBranch` made, when what had to follow it failed. */
  dropBranch(branch: string): Promise<void>;
}

```

**In `desk/src/run/target.ts`, replace:**
```ts
    }
  }
}

```

**with:**
```ts
    }
  }

  async commitPieceToBranch(change: BranchChange): Promise<BranchResult> {
    const { slug, mdx, ledger } = change.piece;
    if (!isPlainSlug(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    const on = await this.git.currentBranch();
    if (on !== MAIN_BRANCH) {
      throw new Error(`the Desk makes the branch of a pull request from ${MAIN_BRANCH}, but the checkout is ${on === undefined ? 'on no branch' : `on ${on}`}, so the branch would carry commits that are not the piece's`);
    }
    const files = [this.paths.newsFile(slug), this.paths.ledgerFile(slug)];
    for (const file of files) {
      if (await exists(path.join(this.repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
    }
    const commit = await this.git.commitToNewBranch(
      change.branch,
      [
        { path: files[0] as string, text: mdx },
        { path: files[1] as string, text: ledger },
      ],
      change.message,
    );
    return { commit, files };
  }

  async dropBranch(branch: string): Promise<void> {
    await this.git.deleteBranch(branch);
  }
}

```

**In `desk/src/run/target.ts`, replace:**
```ts
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
  }
}
```

**with:**
```ts
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
  }

  async commitPieceToBranch(_change: BranchChange): Promise<BranchResult> {
    throw new Error('a dry run makes no branch');
  }

  async dropBranch(_branch: string): Promise<void> {
    throw new Error('a dry run makes no branch');
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/run/target.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the flow, and let the Hold stage use it**

`sendToOwner` is the six steps above, up to and including the pull request.

**In `desk/src/stages/hold-pr.ts`, replace:**
```ts
import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { RenderedPiece } from '@robywire/gate';
import { isPlainSlug, sitePaths } from '../index';
import type { HeldArtifact, PieceFiles } from '../index';
import { REASON_LABELS } from '../../../site/src/lib/reasons';

// A piece that is held reaches the owner as a draft pull request, and this is what goes into it. The branch of the pull request carries the piece as the
```

**with:**
```ts
import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { RenderedPiece } from '@robywire/gate';
import { ForgeError, MAIN_BRANCH, holdBranchName, isPlainSlug, sitePaths } from '../index';
import type { ForgeTarget, HeldArtifact, PieceFiles, PublishTarget } from '../index';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import type { StageContext } from './context';

// A piece that is held reaches the owner as a draft pull request, and this is what goes into it. The branch of the pull request carries the piece as the
```

**In `desk/src/stages/hold-pr.ts`, replace:**
```ts
// model check. GitHub turns `@name` into a notification, `#12` into a link and `[text](address)` into a link, so none of it is put in the text as it is: it goes
// in a fenced block, where none of that happens, and the fence is longer than any run of backticks in the text, so that the text cannot close it.

/**
```

**with:**
```ts
// model check. GitHub turns `@name` into a notification, `#12` into a link and `[text](address)` into a link, so none of it is put in the text as it is: it goes
// in a fenced block, where none of that happens, and the fence is longer than any run of backticks in the text, so that the text cannot close it.
//
// `sendToOwner` is the flow itself: the piece is committed to a branch of its own, the branch is pushed, and the draft pull request is opened. It never changes the
// checkout, and whatever goes wrong after the branch is made, the branch is removed again (see `GitTarget.commitToNewBranch`).

/**
```

**In `desk/src/stages/hold-pr.ts`, replace:**
```ts
  return lines.join('\n');
}
```

**with:**
```ts
  return lines.join('\n');
}

/** A pull request that was opened for a held piece: where it is, which branch it is from, and the commit that the branch has. */
export interface HoldPullRequest {
  url: string;
  number: number;
  branch: string;
  commit: string;
}

/** What `sendToOwner` did: the pull request that it opened, or why it opened none (the draft cannot be written as a piece, so there is nothing for the owner to merge). */
export type SentToOwner = { sent: HoldPullRequest } | { notSent: string };

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/**
 * Send the held piece `held` to the owner as a draft pull request, in this order, and stop at the first step that fails:
 *
 * 1. Write the draft as a piece (`heldPieceFiles`). A draft that cannot be written (a sentence cites a claim that does not exist) is not an error of the forge: there
 *    is nothing to merge, so nothing is sent, and the answer says why.
 * 2. Check that the places that the Desk writes to are in order (`target.preflight`): the desk state can be read and nothing there has a change that is not committed.
 * 3. Check that the repository has a remote (`forge.hasRemote`).
 * 4. Commit the two files to the branch `hold/<day>-<slug>`, made from `main` beside the checkout (`target.commitPieceToBranch`).
 * 5. Push the branch, and open the draft pull request into `main`. When either fails the branch is removed again, and when the branch had been pushed the error says so, because
 *    it is then on the remote and the owner can open the pull request from it by hand.
 *
 * Nothing in the checkout changes at any step: the branch is made beside it. Throws what the step threw (a `ForgeError` for a step of the forge).
 */
export async function sendToOwner(ctx: Pick<StageContext, 'log'>, target: PublishTarget, forge: ForgeTarget, held: HeldArtifact): Promise<SentToOwner> {
  let piece: PieceFiles;
  try {
    piece = heldPieceFiles(held);
  } catch (error) {
    return { notSent: `the draft cannot be written as a piece, so there is nothing for the owner to merge (${describeError(error)})` };
  }
  await target.preflight();
  if (!(await forge.hasRemote())) throw new ForgeError('no-remote', 'the repository has no remote called origin, so the held piece cannot be sent to the owner as a pull request');

  const branch = holdBranchName(held.date, piece.slug);
  const { commit } = await target.commitPieceToBranch({ branch, piece, message: `desk: held piece ${piece.slug}, for the owner to release` });
  let pushed = false;
  try {
    await forge.pushBranch(branch);
    pushed = true;
    const opened = await forge.openDraftPullRequest({ branch, title: holdPrTitle(held), body: holdPrBody(held), base: MAIN_BRANCH });
    ctx.log(`hold: ${piece.slug} is sent to the owner as the draft pull request ${opened.url} (branch ${branch})`);
    return { sent: { ...opened, branch, commit } };
  } catch (error) {
    await target.dropBranch(branch).catch(() => undefined);
    const kind = error instanceof ForgeError ? error.kind : 'failed';
    throw new ForgeError(kind, `${describeError(error)}${pushed ? ` (the branch ${branch} was pushed and no pull request was opened: open one from it by hand, or delete the branch)` : ''}`);
  }
}
```

`runHold` takes the forge, sends the piece before it records the hold, and records the address.

**In `desk/src/stages/hold.ts`, replace:**
```ts
import type { Claim, VerifierReason } from '@robywire/gate';
import { HeldArtifact, addHold, isPlainSlug, recordRun, writeJsonFile } from '../index';
import type { PublishTarget } from '../index';
import type { StageContext } from './context';
import type { VerifyResult } from './verify';
import type { VerifierFailure } from './verify-model';
```

**with:**
```ts
import type { Claim, VerifierReason } from '@robywire/gate';
import { HeldArtifact, addHold, isPlainSlug, recordRun, writeJsonFile } from '../index';
import type { ForgeTarget, PublishTarget, TargetResult } from '../index';
import type { StageContext } from './context';
import { sendToOwner } from './hold-pr';
import type { HoldPullRequest } from './hold-pr';
import type { VerifyResult } from './verify';
import type { VerifierFailure } from './verify-model';
```

**In `desk/src/stages/hold.ts`, replace:**
```ts
// piece. The desk state gets a record that a draft was held, with the reasons as codes, which the site's page of holds shows with a label for each.
// And nothing reaches the pages of the site: no piece and no ledger. The held text itself is never shown on the site.

/** The run that is holding: its id, and the moment it is recording, as an ISO time. */
```

**with:**
```ts
// piece. The desk state gets a record that a draft was held, with the reasons as codes, which the site's page of holds shows with a label for each.
// And nothing reaches the pages of the site: no piece and no ledger. The held text itself is never shown on the site.
//
// With a forge (a run that is not dry, on a machine that has a remote) there is a fourth part, and it comes before the record in the desk state: the piece is sent to the
// owner as a draft pull request (`sendToOwner` in `hold-pr.ts`), so that the hold in the desk state has the address of the pull request. The owner publishes the piece by
// merging it and discards it by closing it. When the forge fails, the run fails: the held draft is still in the folder of the run, and the desk state is as it was.

/** The run that is holding: its id, and the moment it is recording, as an ISO time. */
```

**In `desk/src/stages/hold.ts`, replace:**
```ts
  commit: string | null;
  files: string[];
}

```

**with:**
```ts
  commit: string | null;
  files: string[];
  /** The draft pull request that carries the piece to the owner; null when none was opened (a dry run, no forge, or a draft that cannot be written as a piece). */
  pullRequest: HoldPullRequest | null;
  /** Why no pull request was opened, when a forge was there to open one and the draft cannot be written as a piece; null otherwise. */
  note: string | null;
}

```

**In `desk/src/stages/hold.ts`, replace:**
```ts
 * state cannot be changed, because a refusal must never lose a draft.
 *
 * Refuses a piece that Verify did not hold, a hold with no reason (the owner could not read what it says), and a slug that is not a plain slug (it is a file name).
 * A dry run writes the held draft all the same, as it writes every other artifact, and changes nothing in the site.
 */
export async function runHold(ctx: StageContext, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: HoldRun): Promise<HoldResult> {
  if (verified.outcome !== 'hold') throw new Error('runHold needs a piece that Verify held');
  const { draft } = verified;
```

**with:**
```ts
 * state cannot be changed, because a refusal must never lose a draft.
 *
 * With a `forge` and a target that is not dry, the piece is first sent to the owner as a draft pull request (`sendToOwner`), and the hold records its address. A step of the forge
 * that fails ends the stage with its error, after the held draft was written and before the desk state was changed.
 *
 * Refuses a piece that Verify did not hold, a hold with no reason (the owner could not read what it says), and a slug that is not a plain slug (it is a file name).
 * A dry run writes the held draft all the same, as it writes every other artifact, and changes nothing in the site, and never touches the forge.
 */
export async function runHold(ctx: StageContext, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: HoldRun, forge?: ForgeTarget): Promise<HoldResult> {
  if (verified.outcome !== 'hold') throw new Error('runHold needs a piece that Verify held');
  const { draft } = verified;
```

**In `desk/src/stages/hold.ts`, replace:**
```ts
  await writeJsonFile(file, `the held draft ${draft.slug}.json`, held, HeldArtifact);

  const result = await target.apply({
    state: (state) => recordRun(addHold(state, { at: run.at, categories: draft.categories, reasons }), { at: run.at, outcome: 'held', runId: run.runId, slug: draft.slug }),
    message: `desk: hold ${draft.slug}`,
  });
  ctx.log(`hold: ${draft.slug} is held for ${reasons.join(', ')}, written to ${file}`);
  return { slug: draft.slug, file, reasons, commit: result.commit, files: result.files };
}
```

**with:**
```ts
  await writeJsonFile(file, `the held draft ${draft.slug}.json`, held, HeldArtifact);

  const sent = forge === undefined || target.dry ? undefined : await sendToOwner(ctx, target, forge, held);
  const pullRequest = sent !== undefined && 'sent' in sent ? sent.sent : null;
  const note = sent !== undefined && 'notSent' in sent ? sent.notSent : null;

  let result: TargetResult;
  try {
    result = await target.apply({
      state: (state) =>
        recordRun(addHold(state, { at: run.at, categories: draft.categories, reasons, ...(pullRequest === null ? {} : { prUrl: pullRequest.url }) }), { at: run.at, outcome: 'held', runId: run.runId, slug: draft.slug }),
      message: `desk: hold ${draft.slug}`,
    });
  } catch (error) {
    if (pullRequest === null) throw error;
    const why = error instanceof Error ? error.message || error.name : String(error);
    throw new Error(`${why} (the draft pull request ${pullRequest.url} was opened and the hold is not recorded in the desk state: close the pull request, or record the hold by hand)`);
  }
  ctx.log(`hold: ${draft.slug} is held for ${reasons.join(', ')}, written to ${file}`);
  return { slug: draft.slug, file, reasons, commit: result.commit, files: result.files, pullRequest, note };
}
```

Run: `npm test --workspace @robywire/desk -- test/stages/hold-flow.test.ts test/stages/hold.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 6: Give the forge to the run, the command line and the program**

The orchestrator takes the forge and passes it to the Hold stage, and a run that is held says where the pull request is.

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, readRunRecord, recordRun, refuseApiOnFixtures, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
```

**with:**
```ts
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, readRunRecord, recordRun, refuseApiOnFixtures, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, ForgeTarget, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
  target: PublishTarget;
  /** The folder of the ledgers of the published pieces, which says what has been published. */
  ledgerDir: string;
```

**with:**
```ts
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
  target: PublishTarget;
  /**
   * Where a held piece is sent to the owner: a branch is pushed and a draft pull request is opened (`runHold`). Without one a hold is only recorded, in the folder of the run and
   * in the desk state. A dry run never touches it. A step of the forge that fails ends the run as `failed` at the stage `hold`.
   */
  forge?: ForgeTarget;
  /** The folder of the ledgers of the published pieces, which says what has been published. */
  ledgerDir: string;
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  /** Which try of its day the run was: 1 for the first. */
  attempt: number;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
```

**with:**
```ts
  /** Which try of its day the run was: 1 for the first. */
  attempt: number;
  /** The address of the draft pull request that carries a held piece to the owner; null for every other run, and for a hold with no pull request. */
  pullRequest: string | null;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
  | { outcome: 'no-story'; stage: string; reason: string }
  | { outcome: 'published'; stage: 'publish'; slug: string; commit: string | null; files: string[] }
  | { outcome: 'held'; stage: 'hold'; slug: string; reason: string; commit: string | null; files: string[] }
  | { outcome: 'failed'; stage: string; reason: string };

```

**with:**
```ts
  | { outcome: 'no-story'; stage: string; reason: string }
  | { outcome: 'published'; stage: 'publish'; slug: string; commit: string | null; files: string[] }
  | { outcome: 'held'; stage: 'hold'; slug: string; reason: string; pullRequest: string | null; commit: string | null; files: string[] }
  | { outcome: 'failed'; stage: string; reason: string };

```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage) or `held` (the
 * Hold stage). Anything a stage throws, a model error and a spent budget included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
```

**with:**
```ts
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage) or `held` (the
 * Hold stage; with a `forge` the held piece is first sent to the owner as a draft pull request). Anything a stage throws, a model error and a spent budget included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
      }
      stage = 'hold';
      const held = await stages.hold(ctx, target, claims, verified, run);
      return { outcome: 'held', stage: 'hold', slug: held.slug, reason: `held for ${held.reasons.join(', ')}`, commit: held.commit, files: held.files };
    };

```

**with:**
```ts
      }
      stage = 'hold';
      const held = await stages.hold(ctx, target, claims, verified, run, options.forge);
      const where = held.pullRequest !== null ? `; draft pull request ${held.pullRequest.url}` : held.note !== null ? `; no pull request: ${held.note}` : '';
      return { outcome: 'held', stage: 'hold', slug: held.slug, reason: `held for ${held.reasons.join(', ')}${where}`, pullRequest: held.pullRequest?.url ?? null, commit: held.commit, files: held.files };
    };

```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, attempt: day.attempt, commit, dry: target.dry, dir, files };
  } finally {
    await release();
```

**with:**
```ts
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    const pullRequest = ending.outcome === 'held' ? ending.pullRequest : null;
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, attempt: day.attempt, pullRequest, commit, dry: target.dry, dir, files };
  } finally {
    await release();
```

The command line gets the forge and the stages in its dependencies, and the lines that it prints for the end of a run are made by one function.

**In `desk/src/cli.ts`, replace:**
```ts
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, refuseApiOnFixtures, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import { replayRun } from './run/replay';

```

**with:**
```ts
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, refuseApiOnFixtures, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import type { RunResult, Stages } from './run/orchestrate';
import { replayRun } from './run/replay';

```

**In `desk/src/cli.ts`, replace:**
```ts
  /** What commits for a run that is not dry. */
  git: GitTarget;
  /** The settings of the run. By default `defaultConfig()` with the folders of the runs and of the evidence below `cwd`. */
  config?: DeskConfig;
```

**with:**
```ts
  /** What commits for a run that is not dry. */
  git: GitTarget;
  /** Where a held piece is sent to the owner, for a run that is not dry: a branch is pushed and a draft pull request is opened. Without one a hold is only recorded. */
  forge?: ForgeTarget;
  /** Stages that take the place of the real ones, which a test uses to give a run an ending that the scripted story does not reach. */
  stages?: Partial<Stages>;
  /** The settings of the run. By default `defaultConfig()` with the folders of the runs and of the evidence below `cwd`. */
  config?: DeskConfig;
```

**In `desk/src/cli.ts`, replace:**
```ts
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
```

**with:**
```ts
}

/** What `desk run` prints when the run ended, one line each: the outcome, the run, the try, the folder, the piece, the pull request, the reason, the stage that ended a run with no piece, and the commit. */
export function resultLines(result: RunResult): string[] {
  const lines = [`outcome: ${result.outcome}`, `run: ${result.runId}`, `attempt: ${result.attempt}`, `folder: ${result.dir}`];
  if (result.slug !== null) lines.push(`piece: ${result.slug}`);
  if (result.pullRequest !== null) lines.push(`pull request: ${result.pullRequest}`);
  if (result.reason !== null) lines.push(`reason: ${result.reason}`);
  if (result.outcome === 'no-story' || result.outcome === 'failed') lines.push(`stage: ${result.stage}`);
  if (result.dry) lines.push(`dry run: nothing was written to the site or to git (${result.files.length} files would have been)`);
  else if (result.commit !== null) lines.push(`commit: ${result.commit}`);
  return lines;
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
```

**In `desk/src/cli.ts`, replace:**
```ts
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    deps.out(`outcome: ${result.outcome}`);
    deps.out(`run: ${result.runId}`);
    deps.out(`attempt: ${result.attempt}`);
    deps.out(`folder: ${result.dir}`);
    if (result.slug !== null) deps.out(`piece: ${result.slug}`);
    if (result.reason !== null) deps.out(`reason: ${result.reason}`);
    if (result.outcome === 'no-story' || result.outcome === 'failed') deps.out(`stage: ${result.stage}`);
    if (result.dry) deps.out(`dry run: nothing was written to the site or to git (${result.files.length} files would have been)`);
    else if (result.commit !== null) deps.out(`commit: ${result.commit}`);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
```

**with:**
```ts
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      ...(deps.forge === undefined ? {} : { forge: deps.forge }),
      ...(deps.stages === undefined ? {} : { stages: deps.stages }),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    for (const line of resultLines(result)) deps.out(line);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
```

The program gives `main` the real forge.

**In `desk/src/bin.ts`, replace:**
```ts
import { GitCli } from './index';
import { main } from './cli';

// The program: `npm run desk -- run --dry --client fake --sources fixtures`. It runs `main` with the real clock, environment and git, in the folder it is
// started from, which must be the root of the repository, and sets the exit code.

const cwd = process.cwd();
```

**with:**
```ts
import { GhForge, GitCli, nodeExec } from './index';
import { main } from './cli';

// The program: `npm run desk -- run --dry --client fake --sources fixtures`. It runs `main` with the real clock, environment, git and forge (`git` and `gh`, which a
// piece that is held is sent to the owner with), in the folder it is started from, which must be the root of the repository, and sets the exit code.

const cwd = process.cwd();
```

**In `desk/src/bin.ts`, replace:**
```ts
  now: () => new Date(),
  git: new GitCli(cwd),
});
```

**with:**
```ts
  now: () => new Date(),
  git: new GitCli(cwd),
  forge: new GhForge(nodeExec(), { cwd }),
});
```

A test that starts git many times gets thirty seconds.

**In `desk/vitest.config.ts`, replace:**
```ts

// The tests of the Desk run with no network. test/setup/no-network.ts, which runs before every test file, makes fetch and the connections of node throw.
export default defineConfig({
  test: {
    setupFiles: ['./test/setup/no-network.ts'],
  },
});
```

**with:**
```ts

// The tests of the Desk run with no network. test/setup/no-network.ts, which runs before every test file, makes fetch and the connections of node throw.
// A test that runs git starts a dozen programs, and the whole suite runs sixty files at once, so a test gets thirty seconds instead of five, and the set-up that
// runs before the tests of a file a minute instead of ten seconds (the adversarial matrix runs every scenario in one): they are limits on a test that hangs, not on one
// that is slow.
export default defineConfig({
  test: {
    setupFiles: ['./test/setup/no-network.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```

Run: `npm test --workspace @robywire/desk -- test/run/forge-run.test.ts test/cli.test.ts test/run/orchestrate.test.ts`
Expected: PASS — `Test Files  3 passed (3)`

- [ ] **Step 7: Run the whole check**

Run: `! LC_ALL=C grep -rn '[^[:print:][:space:]]' desk/src desk/test`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 8: Commit**

```bash
git add desk/src/bin.ts desk/src/cli.ts desk/src/run/git.ts desk/src/run/orchestrate.ts desk/src/run/target.ts desk/src/stages/hold-pr.ts desk/src/stages/hold.ts desk/test/cli.test.ts desk/test/fetch/exports.test.ts desk/test/run/forge-run.test.ts desk/test/run/git.test.ts desk/test/run/target.test.ts desk/test/stages/hold-flow.test.ts desk/test/support/repo.ts desk/vitest.config.ts
git commit -m "feat(desk): a held run that is not dry and has a forge sends the piece to the owner: the piece is committed to the branch hold/<day>-<slug>, made beside the checkout so that the checkout is never changed, the branch is pushed, a draft pull request is opened into main, and only then is the hold recorded in the desk state with the address of the pull request; a step of the forge that fails ends the run as failed at the stage hold with the branch removed and main as it was" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Look at it from the command line**

The program is run as a person runs it, on the made-up story, which publishes and so never reaches the forge. Nothing is pushed; this shows that the program starts with the forge wired in, and that a dry run does not mention it.

Run: `npm run desk -- run --dry --client fake --sources fixtures`
Expected: PASS — `outcome: published` and `dry run: nothing was written to the site or to git`

Run: `git status --short -- runs evidence site`
Expected: PASS — prints nothing

The run wrote its artifacts into `runs/` and its evidence into `evidence/`, which git ignores. Take them away, so that a later run of the same day is not refused.

Run: `rm -rf runs evidence`
Expected: PASS — prints nothing

---

### Task 14: desk retract

**Files:**
- Create: `desk/src/run/retract.ts` (`retractPiece`, `RetractRefused`, `normaliseReason`, `setUpdatedAt`, `MAX_REASON_LENGTH`)
- Create: `desk/test/run/retract.test.ts`, `desk/test/support/published.ts` (the golden piece, published, in a real repository)
- Modify: `desk/src/run/desk-state.ts` (`addCorrection`), `desk/src/index.ts` (exports), `desk/src/cli.ts` (the command)
- Test: `desk/test/run/desk-state.test.ts`, `desk/test/cli.test.ts`, `desk/test/fetch/exports.test.ts`

A piece that has been published can turn out to be wrong. The Desk never takes a piece away: the page stays up with a notice, and its receipts stay. `desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]` makes the notice. It does three things and commits them in one commit (`desk: correct <slug>`, or `desk: retract <slug>` for a retraction):

1. adds `{ at, slug, kind, note }` to the `corrections` of the desk state (`at` is the moment of the record, from the clock, as an ISO time in UTC; the site shows the notice from this);
2. sets `updatedAt` in the frontmatter of the piece to the **UTC day of `at`**;
3. changes nothing else: the rest of the piece is the same, byte for byte; the ledger is not touched; no other record of the desk state is touched; nothing is deleted.

**Why both.** The site refuses to build a piece whose `updatedAt` is not the day of its latest correction (`matchPieces` in `site/src/lib/match-pieces.ts`), and refuses one that has a record and no `updatedAt`. So the two files must change together, and the tests hand what a retraction leaves to `matchPieces`.

**The edit of the frontmatter is careful.** `setUpdatedAt(mdx, day)` replaces the one line `updatedAt: ...` when the frontmatter has one, and otherwise makes it right after the line of `publishedAt`, which is where the renderer puts it, in the form the renderer writes (`updatedAt: "2026-10-06"`). A test checks that the result is **exactly the file that the renderer writes** for a piece that was corrected that day. It refuses a file that the Desk did not write in this shape (carriage returns, a frontmatter that is not closed, an `updatedAt` twice or one that is not a plain date on one line, no `publishedAt`), and after the edit `retractPiece` reads the new frontmatter as the site reads it and refuses unless it is the old one with `updatedAt` set and nothing else.

**The reason is data.** It is normalised (`normaliseReason`): white space of any kind, a new line included, becomes one space, the ends are trimmed, and a control character, an empty reason or one of more than 500 characters is refused. Then it is the `note` of the record and **goes nowhere else**: not into the piece, not into the ledger, not into the message of the commit. The tests give it quotes, a frontmatter fence with a second `updatedAt` in it, shell syntax, markup and mentions, and check that the piece is what the renderer writes and the message is the same as for any reason.

**What it refuses, before it writes anything** (`RetractRefused`; exit code 1 on the command line): a slug that is not a plain slug; a reason or a kind that is not allowed; a piece that is not in `site/src/content/news`, or that has no ledger; the piece or the desk state having a change that is not committed (the commit would carry it); something else staged (git refuses, and both files are put back); a clock that is before the day the piece was published, or before a record that the desk state already has for this piece (the day of the latest record must be the order of the clock, because the site compares `updatedAt` with the day of the latest). A second correction on the same day changes the desk state alone: `updatedAt` is already that day, so the piece is not written again and there is still one `updatedAt`. A mistake in the arguments is exit code 2, with the usage.

**Two things that the stage asked for and that are different here.** A piece that was held has a pull request, and the pull request is the only place it is until the owner merges it, so it is not in `site/src/content/news`, and "the slug must exist there" already refuses it; the message says so. A look at the desk state for "a pending hold of this slug" is not possible, because the holds of the desk state carry no slug (the gate package's `DeskState` has `at`, `categories`, `reasons` and `prUrl`), and adding one would change the schema that the site reads. And "no unrelated changes" is read as: the two files that the command changes have none, and nothing else is staged. Other changes in the checkout are none of its business, as for every commit that the Desk makes.

- [ ] **Step 1: Write the tests**

A piece that was published, in a repository, for the tests of what happens to it afterwards: the golden piece of the gate package, rendered as Publish renders a piece the gate cleared, committed on `main`.

**Create `desk/test/support/published.ts`:**
```ts
import { CHECK_IDS, renderDraft } from '@robywire/gate';
import type { GateResult } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import type { GitCli } from '../../src/run/git';
import type { PieceFiles } from '../../src/run/target';
import { placePiece } from './pieces';
import { initRepo } from './repo';
import { makeSite } from './site';

// A piece that was published, for the tests of what happens to a piece afterwards. It is the golden piece of the gate package, rendered as Publish renders a piece the gate
// cleared (`release: 'auto'`), and put in a checkout of the site that is a real repository with that one commit.

/** What the gate says of a piece that it clears: every check passed, route publish. */
export const CLEARED: GateResult = { route: 'publish', failures: [], holdReasons: [], checks: Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as GateResult['checks'] };

const META = { runId: '2026-10-04-043100', gate: CLEARED, verifier: { model: 'claude-sonnet-5-5', passed: true, notes: [] }, release: 'auto' as const };

/** The day that the golden piece was published. */
export const PUBLISHED_ON = GOLDEN_DRAFT.publishedAt;

/** The slug of the golden piece. */
export const PUBLISHED_SLUG = GOLDEN_DRAFT.slug;

/** The two files of the golden piece, as Publish writes them. `updatedAt` is for the file that the renderer would have written had the piece been corrected that day. */
export function publishedPiece(updatedAt?: string): PieceFiles {
  const { mdx, ledger } = renderDraft(GOLDEN_DRAFT, GOLDEN_CLAIMS, { ...META, ...(updatedAt === undefined ? {} : { updatedAt }) });
  return { slug: GOLDEN_DRAFT.slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` };
}

/** A checkout of the site in a new folder with the golden piece published in it, committed on `main` as `start`; and the `GitCli` that commits there. */
export function publishedSite(scratch: () => string): { repoDir: string; cli: GitCli; piece: PieceFiles } {
  const repoDir = makeSite(scratch());
  const piece = publishedPiece();
  placePiece(repoDir, piece);
  return { repoDir, cli: initRepo(repoDir), piece };
}
```

The tests of the command itself, which run in that repository with the real git.

**Create `desk/test/run/retract.test.ts`:**
```ts
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { readDeskState } from '../../src/run/desk-state';
import { MAX_REASON_LENGTH, RetractRefused, normaliseReason, retractPiece, setUpdatedAt } from '../../src/run/retract';
import type { RetractOptions } from '../../src/run/retract';
import { sitePaths } from '../../src/run/target';
import { useScratch } from '../support/context';
import { PUBLISHED_ON, PUBLISHED_SLUG, publishedPiece, publishedSite } from '../support/published';
import { readPieces } from '../support/pieces';
import { branchesIn, changesIn, git, subjectsOf } from '../support/repo';

// A piece that was published can be wrong, and the Desk never takes it away: `desk retract` records a correction or a retraction in the desk state, sets `updatedAt` in the
// piece to the day of the record, and commits both. The site refuses to build a piece whose `updatedAt` is not the day of its latest correction, so the tests hand what a
// retraction leaves to `matchPieces`, the function of the site that says so. These run in a real git repository that has the golden piece published in it.

const scratch = useScratch();
const paths = sitePaths();
const STATE = paths.stateFile;
const NEWS = paths.newsFile(PUBLISHED_SLUG);
const LEDGER = paths.ledgerFile(PUBLISHED_SLUG);
const REASON = 'The payload in the second paragraph is 38 kg, not 83 kg.';
const THE_DAY = '2026-10-06';
const at = (iso: string) => () => new Date(iso);

/** A checkout with the golden piece published in it, and `retract` that corrects it at 09:30 on the day after, with the options replaced where a test says so. */
function setup() {
  const site = publishedSite(scratch);
  const retract = (overrides: Partial<RetractOptions> = {}) =>
    retractPiece({ repoDir: site.repoDir, git: site.cli, slug: PUBLISHED_SLUG, reason: REASON, kind: 'correction', now: at(`${THE_DAY}T09:30:00.000Z`), ...overrides });
  return { ...site, retract };
}

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** What the site says of the pieces of the checkout and the corrections in its desk state: `matchPieces` throws a message that lists what does not fit together. */
async function siteAccepts(repoDir: string) {
  const { news, ledgers } = readPieces(repoDir);
  return matchPieces(news, ledgers, (await readDeskState(path.join(repoDir, STATE))).corrections);
}

/** Everything that says nothing was changed: the files of the piece and the state, the history, what git sees. */
function snapshot(repoDir: string) {
  return { news: read(repoDir, NEWS), ledger: read(repoDir, LEDGER), state: read(repoDir, STATE), subjects: subjectsOf(repoDir), changes: changesIn(repoDir), staged: git(repoDir, 'diff', '--cached', '--name-only'), branches: branchesIn(repoDir) };
}

describe('normaliseReason', () => {
  it('trims the reason and makes every run of white space one space, so that a note is one line', () => {
    expect(normaliseReason('  The payload\nwas  38 kg,\r\n\tnot 83 kg.  ')).toEqual({ ok: true, reason: 'The payload was 38 kg, not 83 kg.' });
  });

  it('takes a reason of 500 characters and no more', () => {
    expect(normaliseReason('x'.repeat(MAX_REASON_LENGTH))).toEqual({ ok: true, reason: 'x'.repeat(MAX_REASON_LENGTH) });
    expect(MAX_REASON_LENGTH).toBe(500);
    expect(normaliseReason('x'.repeat(501))).toEqual({ ok: false, message: 'the reason is 501 characters, and at most 500 are recorded: say it shorter' });
    // The length is that of the reason as it is recorded: white space that is cut does not count.
    expect(normaliseReason(`${' '.repeat(100)}${'x'.repeat(500)}\n\n`).ok).toBe(true);
  });

  it('refuses a reason that says nothing', () => {
    for (const reason of ['', '   ', '\n\t\r\n']) expect(normaliseReason(reason)).toEqual({ ok: false, message: 'the reason is empty: say why the piece is corrected or retracted' });
  });

  it('refuses a control character, which is not white space and is not text', () => {
    for (const code of [0, 7, 27, 127, 0x85]) expect(normaliseReason(`a${String.fromCharCode(code)}b`), String(code)).toEqual({ ok: false, message: 'the reason has a control character in it' });
  });

  it('does not change what else is in the reason: quotes, hyphens, markup and mentions are text', () => {
    const text = '"} --- updatedAt: "2099-01-01" $(id) `x` </script> @everyone #1 [a](http://evil.example) \\ %s';
    expect(normaliseReason(text)).toEqual({ ok: true, reason: text });
  });
});

describe('setUpdatedAt', () => {
  const piece = publishedPiece().mdx;

  it('makes the file that the renderer writes for a piece that was corrected on that day: updatedAt is after publishedAt, in the same form', () => {
    expect(setUpdatedAt(piece, THE_DAY)).toBe(publishedPiece(THE_DAY).mdx);
    expect(setUpdatedAt(piece, THE_DAY)).toContain(`publishedAt: "${PUBLISHED_ON}"\nupdatedAt: "${THE_DAY}"\ncategories:`);
  });

  it('changes nothing but that one line: every other line of the file is the same, and so is the body, byte for byte', () => {
    const before = piece.split('\n');
    const after = setUpdatedAt(piece, THE_DAY).split('\n');
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((line) => !before.includes(line))).toEqual([`updatedAt: "${THE_DAY}"`]);
    expect(after.filter((line) => line !== `updatedAt: "${THE_DAY}"`)).toEqual(before);
  });

  it('replaces the updatedAt that is there, in any plain form of a date, and keeps one', () => {
    for (const written of ['updatedAt: "2026-10-05"', "updatedAt: '2026-10-05'", 'updatedAt: 2026-10-05', 'updatedAt: "2026-10-05"  ']) {
      const text = piece.replace(`publishedAt: "${PUBLISHED_ON}"`, `publishedAt: "${PUBLISHED_ON}"\n${written}`);
      expect(setUpdatedAt(text, THE_DAY), written).toBe(publishedPiece(THE_DAY).mdx);
    }
  });

  it('gives the same file when it is done twice for the same day', () => {
    const once = setUpdatedAt(piece, THE_DAY);
    expect(setUpdatedAt(once, THE_DAY)).toBe(once);
  });

  it('leaves a line of the body alone that looks like a key: only the frontmatter is read', () => {
    const text = `${piece}\nupdatedAt: "1999-01-01"\n---\npublishedAt: x\n`;
    const after = setUpdatedAt(text, THE_DAY);
    expect(after.endsWith('\nupdatedAt: "1999-01-01"\n---\npublishedAt: x\n')).toBe(true);
    expect(after.split('\n').filter((line) => line === `updatedAt: "${THE_DAY}"`)).toHaveLength(1);
  });

  it('finds the key on the first line of the frontmatter, and a frontmatter that has nothing in it has no publishedAt to go after', () => {
    const first = piece.replace(`publishedAt: "${PUBLISHED_ON}"\n`, '').replace('---\n', `---\npublishedAt: "${PUBLISHED_ON}"\n`);
    expect(first.split('\n')[1]).toBe(`publishedAt: "${PUBLISHED_ON}"`);
    expect(setUpdatedAt(first, THE_DAY).split('\n').slice(1, 3)).toEqual([`publishedAt: "${PUBLISHED_ON}"`, `updatedAt: "${THE_DAY}"`]);
    expect(() => setUpdatedAt('---\n---\nThe body.\n', THE_DAY)).toThrow('does not have exactly one publishedAt');
  });

  it('shows the line that it refuses whole when it is 60 characters or less, and cut after 60 with three dots when it is longer', () => {
    const line = (length: number): string => `updatedAt: |${'x'.repeat(length - 'updatedAt: |'.length)}`;
    const with_ = (text: string): string => piece.replace('categories:', `${text}\ncategories:`);
    expect(() => setUpdatedAt(with_(line(60)), THE_DAY)).toThrow(`(${JSON.stringify(line(60))})`);
    expect(() => setUpdatedAt(with_(line(61)), THE_DAY)).toThrow(`(${JSON.stringify(`${line(61).slice(0, 60)}...`)})`);
  });

  it.each([
    ['carriage returns', (text: string) => text.replace(/\n/g, '\r\n'), 'carriage returns'],
    ['no frontmatter', (text: string) => text.replace(/^---\n/, ''), 'does not start with a block of frontmatter'],
    ['a frontmatter that is not closed', (text: string) => text.replace(/\n---\n/, '\n'), 'never closed'],
    ['updatedAt twice', (text: string) => text.replace('categories:', 'updatedAt: "2026-10-05"\nupdatedAt: "2026-10-05"\ncategories:'), 'has updatedAt twice'],
    ['an updatedAt that is not a plain date', (text: string) => text.replace('categories:', 'updatedAt: |\n  2026-10-05\ncategories:'), 'is not a plain date on one line'],
    ['an updatedAt with a comment', (text: string) => text.replace('categories:', 'updatedAt: "2026-10-05" # corrected\ncategories:'), 'is not a plain date on one line'],
    ['no publishedAt', (text: string) => text.replace(/publishedAt: .*\n/, ''), 'does not have exactly one publishedAt'],
    ['publishedAt twice', (text: string) => text.replace('categories:', `publishedAt: "${PUBLISHED_ON}"\ncategories:`), 'does not have exactly one publishedAt'],
  ])('refuses a piece with %s', (_what, change, message) => {
    expect(() => setUpdatedAt(change(piece), THE_DAY)).toThrow(RetractRefused);
    expect(() => setUpdatedAt(change(piece), THE_DAY)).toThrow(message);
  });
});

describe('retractPiece: a correction', () => {
  it('records it in the desk state, sets updatedAt in the piece to the day of the record, and commits the two files in one commit', async () => {
    const { repoDir, retract, piece } = setup();
    const result = await retract();
    expect(result).toEqual({ slug: PUBLISHED_SLUG, kind: 'correction', at: `${THE_DAY}T09:30:00.000Z`, updatedAt: THE_DAY, pieceChanged: true, files: [NEWS, STATE], commit: git(repoDir, 'rev-parse', 'HEAD'), dry: false });
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, LEDGER)).toBe(piece.ledger);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toEqual([{ at: `${THE_DAY}T09:30:00.000Z`, slug: PUBLISHED_SLUG, kind: 'correction', note: REASON }]);
    expect(subjectsOf(repoDir)).toEqual([`desk: correct ${PUBLISHED_SLUG}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main').split('\n')).toEqual([NEWS, STATE]);
    expect(git(repoDir, 'log', '-1', '--format=%B')).toBe(`desk: correct ${PUBLISHED_SLUG}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
    expect(changesIn(repoDir)).toEqual([]);
  });

  it('leaves a piece that the site still builds: the piece says updatedAt, the desk state says why, and the two agree', async () => {
    const { repoDir, retract } = setup();
    await retract();
    expect((await siteAccepts(repoDir)).map((piece) => piece.slug)).toEqual([PUBLISHED_SLUG]);
  });

  it('is not enough to do one of the two: the site refuses a piece with updatedAt and no record, and a record and no updatedAt', async () => {
    const { repoDir, retract } = setup();
    await retract();
    const { news, ledgers } = readPieces(repoDir);
    expect(() => matchPieces(news, ledgers, [])).toThrow(`has updatedAt ${THE_DAY}, but no correction or retraction is recorded for it`);
    const state = await readDeskState(path.join(repoDir, STATE));
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx);
    const plain = readPieces(repoDir);
    expect(() => matchPieces(plain.news, plain.ledgers, state.corrections)).toThrow(`has a correction or retraction recorded on ${THE_DAY} but no updatedAt`);
  });

  it('makes a retraction in the same way, with the other word in the commit and the kind in the record', async () => {
    const { repoDir, retract } = setup();
    const result = await retract({ kind: 'retraction' });
    expect(result.kind).toBe('retraction');
    expect(subjectsOf(repoDir)).toEqual([`desk: retract ${PUBLISHED_SLUG}`, 'start']);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections[0]?.kind).toBe('retraction');
    await siteAccepts(repoDir);
  });

  it('records the reason as it is normalised: one line, with the white space of the ends cut', async () => {
    const { repoDir, retract } = setup();
    await retract({ reason: '  The payload\nwas 38 kg,\n\nnot 83 kg.  ' });
    expect((await readDeskState(path.join(repoDir, STATE))).corrections[0]?.note).toBe('The payload was 38 kg, not 83 kg.');
  });

  it('takes the day from the clock in UTC, whatever the offset that the clock is written in and whatever the time zone of the machine', async () => {
    const dayOf = async (moment: string): Promise<string> => {
      const { repoDir, retract } = setup();
      const result = await retract({ now: at(moment) });
      expect(readFileSync(path.join(repoDir, NEWS), 'utf8')).toContain(`\nupdatedAt: "${result.updatedAt}"\n`);
      return result.updatedAt;
    };
    expect(await dayOf('2026-10-06T23:59:59.999Z')).toBe('2026-10-06');
    expect(await dayOf('2026-10-07T00:00:00.000Z')).toBe('2026-10-07');
    expect(await dayOf('2026-10-07T01:30:00+02:00')).toBe('2026-10-06');
    expect(await dayOf(`${PUBLISHED_ON}T00:00:00.000Z`)).toBe(PUBLISHED_ON);
  });

  it('keeps every record that was there, in order, and adds this one after them', async () => {
    const { repoDir, cli, retract } = setup();
    const earlier = { lastRun: { at: '2026-10-05T04:31:00.000Z', outcome: 'held', runId: '2026-10-05-043100', slug: 'a-held-piece' }, holds: [{ at: '2026-10-05T04:31:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'], prUrl: 'https://github.example/agentic-media-house/pull/3' }], corrections: [{ at: '2026-10-05T12:00:00.000Z', slug: 'another-piece', kind: 'correction', note: 'A date.' }] };
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify(earlier, null, 2)}\n`);
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'the desk state before');
    expect(await cli.isClean([STATE])).toBe(true);
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.lastRun).toEqual(earlier.lastRun);
    expect(state.holds).toEqual(earlier.holds);
    expect(state.corrections).toEqual([...earlier.corrections, { at: '2026-10-06T09:30:00.000Z', slug: PUBLISHED_SLUG, kind: 'correction', note: REASON }]);
  });
});

describe('retractPiece: a piece that is corrected again', () => {
  it('replaces updatedAt on a later day, and keeps one of it, which is the day of the latest record', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const second = await retract({ now: at('2026-10-08T10:00:00.000Z'), kind: 'retraction', reason: 'Withdrawn: the source was retracted.' });
    expect(second.pieceChanged).toBe(true);
    const text = read(repoDir, NEWS);
    expect(text).toBe(publishedPiece('2026-10-08').mdx);
    expect(text.split('\n').filter((line) => line.startsWith('updatedAt:'))).toEqual(['updatedAt: "2026-10-08"']);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections.map((entry) => [entry.at, entry.kind])).toEqual([
      ['2026-10-06T09:30:00.000Z', 'correction'],
      ['2026-10-08T10:00:00.000Z', 'retraction'],
    ]);
    expect(subjectsOf(repoDir)).toEqual([`desk: retract ${PUBLISHED_SLUG}`, `desk: correct ${PUBLISHED_SLUG}`, 'start']);
    await siteAccepts(repoDir);
  });

  it('on the same day writes the piece once: the second record changes the desk state alone, and there is still one updatedAt', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const second = await retract({ now: at('2026-10-06T17:45:00.000Z'), reason: 'A second error, in the date.' });
    expect(second).toMatchObject({ pieceChanged: false, files: [STATE], updatedAt: THE_DAY });
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, NEWS).split('\n').filter((line) => line.startsWith('updatedAt:'))).toHaveLength(1);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections.map((entry) => entry.note)).toEqual([REASON, 'A second error, in the date.']);
    await siteAccepts(repoDir);
  });

  it('takes a second record at the very moment of the first: the clock is not behind', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    await expect(retract({ now: at('2026-10-06T09:30:00.000Z'), reason: 'A second note.' })).resolves.toMatchObject({ pieceChanged: false });
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toHaveLength(2);
  });

  it('keeps the day of the latest record, whichever order the clock puts them in: a record earlier than one that is there is refused', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const before = snapshot(repoDir);
    await expect(retract({ now: at('2026-10-06T09:29:59.999Z') })).rejects.toThrow('the desk state already has a record for');
    await expect(retract({ now: at('2026-10-05T09:30:00.000Z') })).rejects.toThrow('the clock of this machine is behind');
    expect(snapshot(repoDir)).toEqual(before);
  });
});

describe('retractPiece: a dry run', () => {
  it('goes through the checks and says what it would do, and writes and commits nothing', async () => {
    const { repoDir, retract } = setup();
    const before = snapshot(repoDir);
    const result = await retract({ dry: true });
    expect(result).toEqual({ slug: PUBLISHED_SLUG, kind: 'correction', at: `${THE_DAY}T09:30:00.000Z`, updatedAt: THE_DAY, pieceChanged: true, files: [NEWS, STATE], commit: null, dry: true });
    expect(snapshot(repoDir)).toEqual(before);
  });

  it('refuses what a real run refuses before it writes, so that a dry run is a real answer', async () => {
    const { repoDir, retract } = setup();
    await expect(retract({ dry: true, slug: 'no-such-piece' })).rejects.toThrow('there is no piece "no-such-piece"');
    await expect(retract({ dry: true, reason: '' })).rejects.toThrow('the reason is empty');
    await expect(retract({ dry: true, now: at('2026-10-03T00:00:00.000Z') })).rejects.toThrow('before the day the piece was published');
    expect(snapshot(repoDir).subjects).toEqual(['start']);
  });
});

describe('retractPiece: what it refuses, with nothing written', () => {
  it.each([
    ['a slug that is not a plain slug', { slug: '../outside' }, 'is not a plain slug'],
    ['a slug with capitals', { slug: 'Some-Piece' }, 'is not a plain slug'],
    ['a kind that is not a kind', { kind: 'deletion' as never }, 'correction or retraction'],
    ['a reason that says nothing', { reason: ' \n ' }, 'the reason is empty'],
    ['a reason of 501 characters', { reason: 'x'.repeat(501) }, 'the reason is 501 characters'],
    ['a reason with a control character', { reason: `a${String.fromCharCode(7)}b` }, 'control character'],
    ['a piece that is not on the site', { slug: 'a-held-piece' }, 'there is no piece "a-held-piece" in site/src/content/news. A piece that was held is on its pull request'],
    ['a clock that is before the day the piece was published', { now: at('2026-10-03T23:59:59.999Z') }, `the day of the record (2026-10-03) is before the day the piece was published (${PUBLISHED_ON})`],
  ] as [string, Partial<RetractOptions>, string][])('refuses %s', async (_what, options, message) => {
    const { repoDir, retract } = setup();
    const before = snapshot(repoDir);
    const error = await retract(options).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetractRefused);
    expect((error as Error).message).toContain(message);
    expect(snapshot(repoDir)).toEqual(before);
  });

  it('refuses a piece that has no ledger', async () => {
    const { repoDir, retract } = setup();
    rmSync(path.join(repoDir, LEDGER));
    await expect(retract()).rejects.toThrow(`the piece "${PUBLISHED_SLUG}" has no ledger`);
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
  });

  it('refuses when the piece or the desk state has a change that is not committed, because the commit would carry it', async () => {
    for (const file of [NEWS, STATE]) {
      const { repoDir, retract } = setup();
      writeFileSync(path.join(repoDir, file), `${read(repoDir, file)}\n`);
      const before = snapshot(repoDir);
      await expect(retract(), file).rejects.toThrow('have changes that are not committed');
      expect(snapshot(repoDir)).toEqual(before);
    }
  });

  it('refuses a desk state that cannot be read, and one that has a field it does not know, and does not touch it', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'broken');
    await expect(retract()).rejects.toThrow('is not valid JSON');
    writeFileSync(path.join(repoDir, STATE), '{"lastRun":null,"holds":[],"corrections":[],"extra":1}\n');
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'extra');
    await expect(retract()).rejects.toThrow('has fields that the desk state does not define');
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
  });

  it('refuses a piece whose frontmatter the Desk cannot edit with care, and says why', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx.replace('categories:', 'updatedAt: |\n  2026-10-05\ncategories:'));
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'edited by hand');
    await expect(retract()).rejects.toThrow(RetractRefused);
  });

  it('refuses a piece that the site would not accept as it is, instead of making it worse', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx.replace('format: news', 'format: blog'));
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'edited by hand');
    await expect(retract()).rejects.toThrow('is not one that the site accepts');
  });
});

describe('retractPiece: a reason that was written to do harm', () => {
  const HOSTILE = [
    '"} ---\nupdatedAt: "2099-01-01"\n--- injected: true',
    '$(touch /tmp/pwned) `touch /tmp/pwned` ; rm -rf / && echo pwned',
    '</script><script>alert(1)</script> <img src=x onerror=alert(1)> <!-- ',
    '@everyone #1 [click](http://evil.example/login) ![x](http://evil.example/p.png)',
    '\\" \\\\ \\u0000 %s %n {{ x }} ${HOME}',
    `line one${String.fromCharCode(0x2028)}line two`,
  ];

  it.each(HOSTILE)('goes into the desk state as data and nowhere else: %j', async (hostile) => {
    const { repoDir, retract, piece } = setup();
    await retract({ reason: hostile });
    const note = normaliseReason(hostile);
    expect(note.ok).toBe(true);
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.corrections).toEqual([{ at: `${THE_DAY}T09:30:00.000Z`, slug: PUBLISHED_SLUG, kind: 'correction', note: note.ok ? note.reason : '' }]);
    // Not in the piece: the file is what the renderer writes for a piece that was corrected that day. Not in the ledger. Not in the message of the commit.
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, LEDGER)).toBe(piece.ledger);
    expect(git(repoDir, 'log', '-1', '--format=%B')).toBe(`desk: correct ${PUBLISHED_SLUG}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
    expect(changesIn(repoDir)).toEqual([]);
    await siteAccepts(repoDir);
  });

  it('is still one correction of one piece, with one updatedAt, whatever the reason says it is', async () => {
    const { repoDir, retract } = setup();
    await retract({ reason: HOSTILE[0] as string });
    expect(read(repoDir, NEWS).split('\n').filter((line) => line.startsWith('updatedAt:'))).toEqual([`updatedAt: "${THE_DAY}"`]);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toHaveLength(1);
  });
});

describe('retractPiece: when git cannot commit', () => {
  it('puts both files back, and leaves nothing staged, when the commit fails', async () => {
    const { repoDir, retract } = setup();
    const hook = path.join(repoDir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const before = snapshot(repoDir);
    await expect(retract()).rejects.toThrow('git commit failed');
    expect(snapshot(repoDir)).toEqual(before);
    expect(before.changes).toEqual([]);
    rmSync(hook);
    await expect(retract()).resolves.toMatchObject({ pieceChanged: true });
  });

  it('refuses, and puts both files back, when something that is not the Desk\'s is staged', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, 'notes.txt'), 'mine\n');
    git(repoDir, 'add', 'notes.txt');
    await expect(retract()).rejects.toThrow('already has changes staged');
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
    expect(read(repoDir, STATE)).toBe('{"lastRun":null,"holds":[],"corrections":[]}\n');
    expect(git(repoDir, 'diff', '--cached', '--name-only')).toBe('notes.txt');
  });
});
```

The desk state gets a function that adds a correction, as it has for a hold.

**In `desk/test/run/desk-state.test.ts`, replace:**
```ts
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, assertNothingLost, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';
```

**with:**
```ts
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addCorrection, addHold, assertNothingLost, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';
```

**In `desk/test/run/desk-state.test.ts`, replace:**
```ts
});

describe('readDeskState', () => {
  it('reads a state that is valid', async () => {
```

**with:**
```ts
});

describe('addCorrection', () => {
  it('adds the correction after the corrections that are there, in the order they were added', () => {
    const second = { ...CORRECTION, at: '2026-10-07T09:00:00.000Z', kind: 'retraction' as const, note: 'Withdrawn.' };
    expect(addCorrection(addCorrection(EMPTY, CORRECTION), second).corrections).toEqual([CORRECTION, second]);
  });

  it('leaves the last run and the holds as they were', () => {
    const state: DeskState = { lastRun: RUN, holds: [HOLD], corrections: [] };
    expect(addCorrection(state, CORRECTION)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('does not change the state it is given, nor share its arrays with the new one', () => {
    const state: DeskState = { lastRun: null, holds: [], corrections: [CORRECTION] };
    const next = addCorrection(state, { ...CORRECTION, note: 'Another.' });
    next.corrections.push({ ...CORRECTION, note: 'A third.' });
    expect(state.corrections).toEqual([CORRECTION]);
  });
});

describe('readDeskState', () => {
  it('reads a state that is valid', async () => {
```

The command line.

**In `desk/test/cli.test.ts`, replace:**
```ts
import { FakeGit } from '../src/run/git';
import type { RunResult, Stages } from '../src/run/orchestrate';
import { sitePaths } from '../src/run/target';
import { runVerify } from '../src/stages/verify';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
```

**with:**
```ts
import { FakeGit } from '../src/run/git';
import type { RunResult, Stages } from '../src/run/orchestrate';
import { MAX_REASON_LENGTH } from '../src/run/retract';
import { sitePaths } from '../src/run/target';
import { runVerify } from '../src/stages/verify';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { placePiece } from './support/pieces';
import { PUBLISHED_SLUG, publishedPiece } from './support/published';
import { clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(USAGE).toContain('--client api is refused with --sources fixtures');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('[--config <path>]');
    expect(USAGE.split('\n').filter((line) => line.startsWith('  desk ')).every((line) => line.includes('[--config <path>]'))).toBe(true);
  });
});
```

**with:**
```ts
    expect(USAGE).toContain('--client api is refused with --sources fixtures');
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract` does not read them.
    expect(USAGE.split('\n').filter((line) => line.startsWith('  desk ') && !line.startsWith('  desk retract')).every((line) => line.includes('[--config <path>]'))).toBe(true);
  });
});
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(out.some((line) => line.startsWith('pull request:'))).toBe(false);
  });
});

```

**with:**
```ts
    expect(out.some((line) => line.startsWith('pull request:'))).toBe(false);
  });
});

describe('parseArgs: retract', () => {
  it('reads the slug, the reason and the kind, which is a correction unless it says retraction', () => {
    expect(parsed('retract', 'a-piece', '--reason', 'The payload was 38 kg.')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'The payload was 38 kg.', kind: 'correction', dry: false });
    expect(parsed('retract', 'a-piece', '--reason', 'Withdrawn.', '--kind', 'retraction', '--dry')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'Withdrawn.', kind: 'retraction', dry: true });
    expect(parsed('retract', '--dry', '--kind', 'correction', '--reason', 'x', 'a-piece')).toEqual({ command: 'retract', slug: 'a-piece', reason: 'x', kind: 'correction', dry: true });
  });

  it('gives the reason as it was typed: the command that records it makes it one line', () => {
    expect(parsed('retract', 'a-piece', '--reason', '  two\nlines  ')).toMatchObject({ reason: '  two\nlines  ' });
  });

  it('refuses a mistake in the arguments, and says which', () => {
    expect(refused('retract')).toBe('retract needs the slug of a piece');
    expect(refused('retract', 'a', 'b', '--reason', 'x')).toBe('retract takes one slug, but was given "a" and "b"');
    expect(refused('retract', 'A Piece', '--reason', 'x')).toBe('"A Piece" is not a plain slug (lowercase letters and digits joined by single hyphens)');
    expect(refused('retract', '../x', '--reason', 'x')).toContain('is not a plain slug');
    expect(refused('retract', 'a-piece')).toBe('retract needs --reason <text>: why the piece is corrected or retracted');
    expect(refused('retract', 'a-piece', '--reason')).toBe('--reason needs a value');
    expect(refused('retract', 'a-piece', '--reason', '   ')).toBe('the reason is empty: say why the piece is corrected or retracted');
    expect(refused('retract', 'a-piece', '--reason', 'x'.repeat(MAX_REASON_LENGTH + 1))).toContain('the reason is 501 characters');
    expect(parsed('retract', 'a-piece', '--reason', 'x'.repeat(MAX_REASON_LENGTH))).toMatchObject({ command: 'retract' });
    expect(refused('retract', 'a-piece', '--reason', 'a\u0007b')).toBe('the reason has a control character in it');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--kind', 'deletion')).toBe('--kind is correction or retraction, not "deletion"');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--dry', '--dry')).toBe('--dry is given twice');
  });

  it('has the options of retract and no others', () => {
    for (const option of ['--config', '--client', '--sources', '--date', '--force-new', '--cassettes']) expect(refused('retract', 'a-piece', '--reason', 'x', option, 'y'), option).toBe(`unknown option ${option} for retract`);
    expect(refused('run', '--reason', 'x')).toBe('unknown option --reason for run');
    expect(refused('status', '--kind', 'correction')).toBe('unknown option --kind for status');
  });
});

describe('main: retract', () => {
  /** The checkout of the site with the golden piece published in it, and what a person types to correct it. */
  function withPiece() {
    const made = setup();
    placePiece(made.cwd, publishedPiece());
    return { ...made, correct: (...more: string[]) => made.call('retract', PUBLISHED_SLUG, '--reason', 'The payload is 38 kg, not 83 kg.', ...more) };
  }

  it('records the correction, sets updatedAt of the piece and commits the two files, and says so', async () => {
    const { correct, out, err, git, cwd } = withPiece();
    expect(await correct()).toBe(0);
    expect(err).toEqual([]);
    const at = '2026-10-05T04:31:00.000Z';
    expect(out).toEqual([`piece: ${PUBLISHED_SLUG}`, 'kind: correction', `recorded: ${at}`, 'updatedAt: 2026-10-05', `commit: ${git.commits[0]?.id}`]);
    expect(git.commits).toEqual([{ id: git.commits[0]?.id, paths: [sitePaths().newsFile(PUBLISHED_SLUG), STATE], message: `desk: correct ${PUBLISHED_SLUG}` }]);
    expect(readFileSync(path.join(cwd, sitePaths().newsFile(PUBLISHED_SLUG)), 'utf8')).toBe(publishedPiece('2026-10-05').mdx);
    expect(JSON.parse(readFileSync(path.join(cwd, STATE), 'utf8')).corrections).toEqual([{ at, slug: PUBLISHED_SLUG, kind: 'correction', note: 'The payload is 38 kg, not 83 kg.' }]);
  });

  it('makes a retraction when it is asked to', async () => {
    const { correct, git, out } = withPiece();
    expect(await correct('--kind', 'retraction')).toBe(0);
    expect(out[1]).toBe('kind: retraction');
    expect(git.commits[0]?.message).toBe(`desk: retract ${PUBLISHED_SLUG}`);
  });

  it('with --dry says what it would do and writes and commits nothing', async () => {
    const { correct, out, git, cwd } = withPiece();
    expect(await correct('--dry')).toBe(0);
    expect(out.at(-1)).toBe(`dry run: nothing was written or committed (${sitePaths().newsFile(PUBLISHED_SLUG)}, ${STATE} would have been)`);
    expect(git.commits).toEqual([]);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });

  it('exits 1 and says why when the correction is refused: a piece that is not on the site, a file with a change that is not committed', async () => {
    const { call, err, git } = withPiece();
    expect(await call('retract', 'no-such-piece', '--reason', 'x')).toBe(1);
    expect(err).toEqual(['the correction was refused: there is no piece "no-such-piece" in site/src/content/news. A piece that was held is on its pull request until the owner merges it, and cannot be corrected before it is published']);
    git.dirty.add(STATE);
    err.length = 0;
    expect(await call('retract', PUBLISHED_SLUG, '--reason', 'x')).toBe(1);
    expect(err[0]).toContain('the correction was refused: the files that this changes have changes that are not committed');
    expect(git.commits).toEqual([]);
  });

  it('exits 1 and puts the files back when git cannot commit', async () => {
    const { correct, err, git, cwd } = withPiece();
    git.failNextCommit = new Error('no space left');
    expect(await correct()).toBe(1);
    expect(err).toEqual(['the correction failed: no space left']);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(readFileSync(path.join(cwd, sitePaths().newsFile(PUBLISHED_SLUG)), 'utf8')).toBe(publishedPiece().mdx);
  });

  it('exits 2 with the usage for a mistake in the arguments, and writes nothing', async () => {
    const { call, err, git, cwd } = withPiece();
    expect(await call('retract', PUBLISHED_SLUG)).toBe(2);
    expect(err).toEqual(['desk: retract needs --reason <text>: why the piece is corrected or retracted', USAGE]);
    expect(git.commits).toEqual([]);
    expect(readFileSync(path.join(cwd, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });
});

```

The package entry point.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  Candidate,
  ComposeArtifact,
  DiscoverArtifact,
  EvidenceMeta,
```

**with:**
```ts
  Candidate,
  ComposeArtifact,
  Correction,
  DiscoverArtifact,
  EvidenceMeta,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  RefusalKind,
  RobotsGroup,
  RobotsRule,
  RunRecord,
```

**with:**
```ts
  RefusalKind,
  RobotsGroup,
  RetractOptions,
  RetractResult,
  RobotsRule,
  RunRecord,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'recordRun',
  'addHold',
  'readDeskState',
  'writeDeskState',
```

**with:**
```ts
  'recordRun',
  'addHold',
  'addCorrection',
  'MAX_REASON_LENGTH',
  'RetractRefused',
  'normaliseReason',
  'setUpdatedAt',
  'retractPiece',
  'readDeskState',
  'writeDeskState',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      BranchResult,
      FakeBranchCommit,
    ];
    const nothing: Exported | undefined = undefined;
```

**with:**
```ts
      BranchResult,
      FakeBranchCommit,
      Correction,
      RetractOptions,
      RetractResult,
    ];
    const nothing: Exported | undefined = undefined;
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/retract.test.ts test/cli.test.ts test/run/desk-state.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/retract'` and `addCorrection is not a function`

- [ ] **Step 3: Write the correction**

The desk state adds a correction as it adds a hold: a new state, with the old one not changed.

**In `desk/src/run/desk-state.ts`, replace:**
```ts
export type Hold = DeskState['holds'][number];

/** The state with `run` as its last run. A new state: the one given is not changed, and the two share nothing. */
export function recordRun(state: DeskState, run: LastRun): DeskState {
```

**with:**
```ts
export type Hold = DeskState['holds'][number];

/** A correction or a retraction of a published piece: when it was recorded, which piece, which of the two it is, and the note that says why. */
export type Correction = DeskState['corrections'][number];

/** The state with `run` as its last run. A new state: the one given is not changed, and the two share nothing. */
export function recordRun(state: DeskState, run: LastRun): DeskState {
```

**In `desk/src/run/desk-state.ts`, replace:**
```ts
}

/**
 * Read and check the desk state in `file`. A file that is missing (a run in the wrong folder), is not JSON, does not fit the
```

**with:**
```ts
}

/** The state with `correction` after the corrections that are there. A new state: the one given is not changed, and the two share nothing. */
export function addCorrection(state: DeskState, correction: Correction): DeskState {
  return structuredClone({ ...state, corrections: [...state.corrections, correction] });
}

/**
 * Read and check the desk state in `file`. A file that is missing (a run in the wrong folder), is not JSON, does not fit the
```

**Create `desk/src/run/retract.ts`:**
```ts
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CORRECTION_KINDS, NewsFrontmatter } from '@robywire/gate';
import type { CorrectionKind } from '@robywire/gate';
import { parse } from 'yaml';
import { writeFileAtomic } from './atomic';
import { addCorrection, assertNothingLost, readDeskState, writeDeskState } from './desk-state';
import type { GitTarget } from './git';
import { isPlainSlug, sitePaths } from './target';

// A piece that has been published can be wrong, and the Desk never takes a piece away: the page stays up with a notice, and the receipts stay. `desk retract` is how the
// notice is made. It records a correction or a retraction in the desk state (the site reads the notice from there) and sets `updatedAt` in the frontmatter of the piece to the
// day of the record (the site refuses to build a piece whose `updatedAt` is not the day of its latest correction), and it commits the two files together. It deletes
// nothing and it changes nothing else: the rest of the file is the same, byte for byte.
//
// The reason that a person types is data. It goes into the desk state as the text of the note, and nowhere else: not into the piece, not into the message of the commit.

/** The most characters of a reason. */
export const MAX_REASON_LENGTH = 500;

/** A correction that the Desk will not make, and why. Nothing was written. */
export class RetractRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetractRefused';
  }
}

/**
 * The reason as it is recorded, or why it is refused: white space of any kind (a new line, a tab, runs of spaces) becomes one space and the ends are trimmed, because a note is one
 * line of the corrections page; any other control character is refused; and what is left must not be empty or longer than 500 characters.
 */
export function normaliseReason(reason: string): { ok: true; reason: string } | { ok: false; message: string } {
  const text = reason.replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false, message: 'the reason is empty: say why the piece is corrected or retracted' };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) return { ok: false, message: 'the reason has a control character in it' };
  if (text.length > MAX_REASON_LENGTH) return { ok: false, message: `the reason is ${text.length} characters, and at most ${MAX_REASON_LENGTH} are recorded: say it shorter` };
  return { ok: true, reason: text };
}

const refuse = (message: string): never => {
  throw new RetractRefused(message);
};

/** A line of a file, as it is shown in a message: cut at 60 characters and quoted. */
const shown = (line: string): string => JSON.stringify(line.length > 60 ? `${line.slice(0, 60)}...` : line);

/** The lines of the frontmatter of a piece and the number of the line that closes it, or a refusal. */
function frontmatterOf(lines: string[]): { end: number } {
  if (lines[0] !== '---') return refuse('the piece does not start with a block of frontmatter (a line of three hyphens)');
  const end = lines.indexOf('---', 1);
  if (end === -1) return refuse('the frontmatter of the piece is never closed (a second line of three hyphens)');
  return { end };
}

/**
 * The text of a piece with `updatedAt` set to `day` (YYYY-MM-DD), and nothing else changed: the line of `updatedAt` is replaced when the frontmatter has one, and made after the
 * line of `publishedAt` (where the renderer puts it) when it has none. Every other line, and everything below the frontmatter, is the same, byte for byte. Refuses a piece that
 * the Desk did not write in this shape: carriage returns, a frontmatter that is not closed, an `updatedAt` that is there twice or is not a plain date on one line, and a
 * frontmatter that does not have exactly one `publishedAt` to go after.
 */
export function setUpdatedAt(mdx: string, day: string): string {
  if (mdx.includes('\r')) refuse('the piece has carriage returns in it, which the Desk does not write, so it is not edited');
  const lines = mdx.split('\n');
  const { end } = frontmatterOf(lines);
  const linesOf = (key: string): number[] => lines.flatMap((line, at) => (at > 0 && at < end && line.startsWith(`${key}:`) ? [at] : []));
  const updated = `updatedAt: ${JSON.stringify(day)}`;
  const there = linesOf('updatedAt');
  if (there.length > 1) refuse('the frontmatter of the piece has updatedAt twice, so the Desk does not know which to change');
  if (there.length === 1) {
    const at = there[0] as number;
    if (!/^updatedAt: (?:"\d{4}-\d{2}-\d{2}"|'\d{4}-\d{2}-\d{2}'|\d{4}-\d{2}-\d{2})\s*$/.test(lines[at] as string)) {
      refuse(`the updatedAt of the piece is not a plain date on one line (${shown(lines[at] as string)}), so the Desk does not change it`);
    }
    lines[at] = updated;
  } else {
    const published = linesOf('publishedAt');
    if (published.length !== 1) refuse('the frontmatter of the piece does not have exactly one publishedAt, so the Desk does not know where updatedAt goes');
    lines.splice((published[0] as number) + 1, 0, updated);
  }
  return lines.join('\n');
}

/** The frontmatter of a piece, read as the site reads it, or a refusal that says what is wrong with it. */
function readFrontmatter(mdx: string, what: string): NewsFrontmatter {
  const lines = mdx.split('\n');
  const { end } = frontmatterOf(lines);
  let data: unknown;
  try {
    data = parse(lines.slice(1, end).join('\n'));
  } catch {
    return refuse(`the frontmatter of ${what} is not valid YAML`);
  }
  const checked = NewsFrontmatter.safeParse(data);
  if (!checked.success) return refuse(`the frontmatter of ${what} is not one that the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  return checked.data;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export interface RetractOptions {
  /** The root of the repository. */
  repoDir: string;
  git: GitTarget;
  /** The slug of the piece, which must be a piece that is on the site. */
  slug: string;
  /** Why, as a person wrote it; see `normaliseReason`. */
  reason: string;
  kind: CorrectionKind;
  /** The clock. It is read once, for the moment of the record. */
  now: () => Date;
  /** Go through every check and say what would be done, and write and commit nothing. */
  dry?: boolean;
}

export interface RetractResult {
  slug: string;
  kind: CorrectionKind;
  /** The moment that the correction is recorded at, as an ISO time in UTC. */
  at: string;
  /** The UTC day of `at`, which `updatedAt` of the piece is now. */
  updatedAt: string;
  /** False when the piece already had this `updatedAt` (a second correction on the same day) and so was not written again. */
  pieceChanged: boolean;
  /** The files that the commit has (or would have had), as paths below the repository. */
  files: string[];
  /** The id of the commit; null for a dry run. */
  commit: string | null;
  dry: boolean;
}

/**
 * Record a correction or a retraction of the published piece `slug`: add `{ at, slug, kind, note }` to the corrections of the desk state, set `updatedAt` in the frontmatter of the
 * piece to the UTC day of `at`, and commit the two files in one commit (`desk: correct <slug>` or `desk: retract <slug>`). The piece, its ledger and every other entry of the desk
 * state stay as they are, and nothing is deleted.
 *
 * Refuses, with a `RetractRefused` and before anything is written: a slug that is not a plain slug; a reason that `normaliseReason` refuses; a piece that is not in
 * `site/src/content/news` or has no ledger (a piece that was held is on its pull request, not on the site, until the owner merges it, so it cannot be corrected before); a
 * file that the correction changes that has a change that is not committed; a clock that is before the day the piece was published or before an earlier correction of the same
 * piece (the site requires `updatedAt` to be the day of the latest correction, so the order of the records must be the order of the clock); and a piece whose frontmatter the
 * Desk cannot edit with care (see `setUpdatedAt`). The new frontmatter is read again, as the site reads it, and refused unless it is the old one with `updatedAt` set and nothing else.
 * When the commit fails both files are put back as they were.
 */
export async function retractPiece(options: RetractOptions): Promise<RetractResult> {
  const { repoDir, git, slug, kind } = options;
  if (!isPlainSlug(slug)) refuse(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
  if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) refuse(`the kind of a correction is correction or retraction, not "${kind}"`);
  const note = normaliseReason(options.reason);
  if (!note.ok) return refuse(note.message);

  const paths = sitePaths();
  const newsFile = paths.newsFile(slug);
  const ledgerFile = paths.ledgerFile(slug);
  if (!(await exists(path.join(repoDir, newsFile)))) {
    refuse(`there is no piece "${slug}" in ${paths.newsDir}. A piece that was held is on its pull request until the owner merges it, and cannot be corrected before it is published`);
  }
  if (!(await exists(path.join(repoDir, ledgerFile)))) refuse(`the piece "${slug}" has no ledger (${ledgerFile}), so it is not a piece that the Desk published`);

  const at = options.now().toISOString();
  const day = at.slice(0, 10);
  const stateFile = path.join(repoDir, paths.stateFile);
  const before = await readDeskState(stateFile);
  const later = before.corrections.find((entry) => entry.slug === slug && Date.parse(entry.at) > Date.parse(at));
  if (later !== undefined) refuse(`the desk state already has a record for "${slug}" made at ${later.at}, which is after now (${at}): the clock of this machine is behind`);

  const old = await readFile(path.join(repoDir, newsFile), 'utf8');
  const oldData = readFrontmatter(old, `the piece "${slug}"`);
  if (day < oldData.publishedAt) refuse(`the day of the record (${day}) is before the day the piece was published (${oldData.publishedAt}): the clock of this machine is behind`);
  const edited = setUpdatedAt(old, day);
  const newData = readFrontmatter(edited, `the piece "${slug}" with its new updatedAt`);
  if (!isDeepStrictEqual(newData, { ...oldData, updatedAt: day })) refuse('the frontmatter would change in more than updatedAt, so the Desk does not write it');

  const pieceChanged = edited !== old;
  const files = pieceChanged ? [newsFile, paths.stateFile] : [paths.stateFile];
  const after = addCorrection(structuredClone(before), { at, slug, kind, note: note.reason });
  assertNothingLost(before, after, paths.stateFile);
  const result: RetractResult = { slug, kind, at, updatedAt: day, pieceChanged, files, commit: null, dry: options.dry === true };
  if (options.dry === true) return result;

  if (!(await git.isClean(files))) refuse(`the files that this changes have changes that are not committed (${files.join(', ')}), so the Desk does not write there: commit or discard them first`);
  const original = await readFile(stateFile, 'utf8');
  try {
    await writeDeskState(stateFile, after);
    if (pieceChanged) await writeFileAtomic(path.join(repoDir, newsFile), edited);
    result.commit = await git.commit(files, `desk: ${kind === 'retraction' ? 'retract' : 'correct'} ${slug}`);
  } catch (error) {
    // A commit that fails leaves the checkout as it was found: both files are put back.
    await writeFileAtomic(stateFile, original);
    if (pieceChanged) await writeFileAtomic(path.join(repoDir, newsFile), old);
    throw error;
  }
  return result;
}
```

It is exported with the rest of the package.

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/git';
export * from './run/forge';
export * from './run/target';
export * from './run/lock';
```

**with:**
```ts
export * from './run/git';
export * from './run/forge';
export * from './run/retract';
export * from './run/target';
export * from './run/lock';
```

Run: `npm test --workspace @robywire/desk -- test/run/retract.test.ts test/run/desk-state.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  3 passed (3)`

- [ ] **Step 4: Add the command**

**In `desk/src/cli.ts`, replace:**
```ts
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { CLIENT_KINDS, HttpFetcher, LocalEvidenceStore, RunRefused, SOURCES_KINDS, clientFromConfig, defaultConfig, loadConfig, placeholderHost, readDeskState, readRunRecord, refuseApiOnFixtures, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
```

**with:**
```ts
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { CORRECTION_KINDS, loadSources } from '@robywire/gate';
import type { CorrectionKind, SourcesRegistry } from '@robywire/gate';
import {
  CLIENT_KINDS,
  HttpFetcher,
  LocalEvidenceStore,
  RetractRefused,
  RunRefused,
  SOURCES_KINDS,
  clientFromConfig,
  defaultConfig,
  isPlainSlug,
  loadConfig,
  normaliseReason,
  placeholderHost,
  readDeskState,
  readRunRecord,
  refuseApiOnFixtures,
  retractPiece,
  runPath,
  sitePaths,
  DryTarget,
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
```

**In `desk/src/cli.ts`, replace:**
```ts
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>` and `desk status`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story and for a replay that came out equal, 1 for a run that failed, was refused or could not start, and a replay that
// differs, and 2 for a usage error.

export type { ClientKind, SourcesKind };
```

**with:**
```ts
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>`, `desk status` and `desk retract <slug>`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed, was refused or could not start, a
// replay that differs and a correction that was refused or failed, and 2 for a usage error.

export type { ClientKind, SourcesKind };
```

**In `desk/src/cli.ts`, replace:**
```ts
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'help' };

```

**with:**
```ts
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'retract'; slug: string; reason: string; kind: CorrectionKind; dry: boolean }
  | { command: 'help' };

```

**In `desk/src/cli.ts`, replace:**
```ts
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
```

**with:**
```ts
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '  desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
```

**In `desk/src/cli.ts`, replace:**
```ts
  'status  print the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions.',
  '        The desk state has all but the try, which is read from the record of the run in the folder of the runs, if it is there.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
};

```

**with:**
```ts
  'status  print the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions.',
  '        The desk state has all but the try, which is read from the record of the run in the folder of the runs, if it is there.',
  'retract record a correction (the default) or a retraction of a piece that is on the site: the note goes into the desk state, updatedAt of the piece is set to today',
  '        (UTC), and the two are committed in one commit. The reason is one line of at most 500 characters. Nothing is deleted: the page stays up with its notice. A piece',
  '        that was held is on its pull request until the owner merges it, and cannot be corrected before. --dry says what would be done and writes nothing.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
  retract: { flags: ['--dry'], valued: ['--reason', '--kind'] },
};

```

**In `desk/src/cli.ts`, replace:**
```ts
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
```

**with:**
```ts
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status' && command !== 'retract') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
```

**In `desk/src/cli.ts`, replace:**
```ts
    return { ok: true, args: { command: 'status', config: value('--config') } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
```

**with:**
```ts
    return { ok: true, args: { command: 'status', config: value('--config') } };
  }
  if (command === 'retract') {
    if (positional.length === 0) return fail('retract needs the slug of a piece');
    if (positional.length > 1) return fail(`retract takes one slug, but was given "${positional.join('" and "')}"`);
    const slug = positional[0] as string;
    if (!isPlainSlug(slug)) return fail(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
    const reason = value('--reason');
    if (reason === undefined) return fail('retract needs --reason <text>: why the piece is corrected or retracted');
    const noted = normaliseReason(reason);
    if (!noted.ok) return fail(noted.message);
    const kind = value('--kind') ?? 'correction';
    if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) return fail(`--kind is correction or retraction, not "${kind}"`);
    return { ok: true, args: { command: 'retract', slug, reason, kind: kind as CorrectionKind, dry: given.has('--dry') } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
```

**In `desk/src/cli.ts`, replace:**
```ts
}

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
```

**with:**
```ts
}

async function retractCommand(args: Extract<Parsed, { command: 'retract' }>, deps: CliDeps): Promise<number> {
  try {
    const result = await retractPiece({ repoDir: deps.cwd, git: deps.git, slug: args.slug, reason: args.reason, kind: args.kind, now: deps.now, dry: args.dry });
    deps.out(`piece: ${result.slug}`);
    deps.out(`kind: ${result.kind}`);
    deps.out(`recorded: ${result.at}`);
    deps.out(`updatedAt: ${result.updatedAt}`);
    deps.out(result.commit === null ? `dry run: nothing was written or committed (${result.files.join(', ')} would have been)` : `commit: ${result.commit}`);
    return 0;
  } catch (error) {
    deps.err(error instanceof RetractRefused ? `the correction was refused: ${error.message}` : `the correction failed: ${describeError(error)}`);
    return 1;
  }
}

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
```

**In `desk/src/cli.ts`, replace:**
```ts
    case 'status':
      return statusCommand(parsed.args, deps);
  }
}
```

**with:**
```ts
    case 'status':
      return statusCommand(parsed.args, deps);
    case 'retract':
      return retractCommand(parsed.args, deps);
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Run the whole check**

Run: `! LC_ALL=C grep -rn '[^[:print:][:space:]]' desk/src desk/test`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Commit**

```bash
git add desk/src/cli.ts desk/src/index.ts desk/src/run/desk-state.ts desk/src/run/retract.ts desk/test/cli.test.ts desk/test/fetch/exports.test.ts desk/test/run/desk-state.test.ts desk/test/run/retract.test.ts desk/test/support/published.ts
git commit -m "feat(desk): desk retract <slug> --reason <text> records a correction or a retraction of a published piece in the desk state and sets updatedAt in the frontmatter of the piece to the day of the record, changing no other byte of the file, and commits the two together; the reason is one line of at most 500 characters and goes nowhere but the desk state, and nothing is ever deleted" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Look at it from the command line**

The program is run as a person runs it. The site has no published piece yet, so the command can only refuse, which is what these two show; nothing is written either way.

Run: `npm run desk -- retract no-such-piece --reason "A figure was wrong."`
Expected: FAIL — `the correction was refused: there is no piece "no-such-piece" in site/src/content/news`

Run: `npm run desk -- retract a-piece`
Expected: FAIL — `desk: retract needs --reason <text>: why the piece is corrected or retracted`

Run: `git status --short`
Expected: PASS — prints nothing

---

### Task 15: The README, the usage, and the adversarial matrix

**Files:**
- Create: `desk/test/support/markdown.ts` (`outsideFences`, which hold-pr.test.ts had of its own)
- Modify: `README.md` (a section `Holds and corrections`, two limits, the commands, the exit codes, the list of what is not built), `desk/src/cli.ts` (a sentence of the usage)
- Test: `desk/test/readme.test.ts`, `desk/test/cli.test.ts`, `desk/test/adversarial.test.ts`, `desk/test/stages/hold-pr.test.ts`

Tasks 11 to 14 built what a hold does and what a correction does. This task says it, and attacks it.

**The README** is read by the owner, who will not read the code, and a sentence that a later change makes untrue must fail a test (`desk/test/readme.test.ts` checks the sections that state what the Desk does). The new section `Holds and corrections` says: what a held run does, step by step, and in which order; how the owner publishes (marks the pull request ready for review and merges it) and discards (closes it); what the program needs (`git` and `gh` on the path, `gh` logged in, a remote called `origin`, the checkout on `main`); what is left when each step fails (the table of Task 13); and what `desk retract` does and does not do. It also says, because it is true and a reader of a README must be able to find out, that **none of it has been run against GitHub**: it is tested with a stand-in and a script. Two limits join the list of what the Desk does not check: the headline is in the **title** of the pull request and not in a fenced block (the title is passed as one argument and never run, but GitHub shows it, and may make a `#12` in it a link), and a branch that was pushed when the pull request could not be opened **stays on the remote**.

**The adversarial matrix** gets two kinds of run, both whole runs of the real pipeline in a real repository with no remote, in which `GhForge` is given a script of what `git` and `gh` answer and keeps what it was asked to start, so that the test says exactly which programs would have been started, with which arguments:

- *A headline with shell characters reaches `GhForge`.* The composer writes a title with `$(touch /tmp/pwned)`, backticks, double quotes, a semicolon, `rm -rf /`, `@everyone` and `#1` in it. The run is held and the piece is sent; the title is **one argument** of `gh pr create` and every other argument of every program has none of those characters; the body is in a file, in a fenced block, and the file is gone when `gh` has read it; nothing was started but `git` and `gh`.
- *A held run when the forge is down*, once for each way it can be down: the network is down at the push, GitHub refuses the pull request after the push, `gh` is not logged in, the credentials are refused at the push, there is no remote, `git` is not installed. Each ends `failed` at the stage `hold`, and `main` has only the record that the run failed: no piece, no hold, no branch, nothing uncommitted. The held draft is still in the folder of the run.

- [ ] **Step 1: Write the tests**

The helper that reads markdown the way GitHub does (where a fenced block begins and ends) was in the test of Task 12. The adversarial matrix needs it too, so it moves to a file that both read.

**Create `desk/test/support/markdown.ts`:**
```ts
// What the tests of a pull request share: reading markdown the way GitHub does, as far as the Desk needs to know where text is data.

/** The lines of markdown that are not inside a fenced block, and how many fenced blocks there are (CommonMark: a fence is closed by a fence of the same character that is at least as long). */
export function outsideFences(markdown: string): { outside: string[]; blocks: number; closed: boolean } {
  const outside: string[] = [];
  let open: { char: string; length: number } | undefined;
  let blocks = 0;
  for (const line of markdown.split('\n')) {
    if (open === undefined) {
      const start = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
      if (start === null) {
        outside.push(line);
        continue;
      }
      open = { char: (start[1] as string)[0] as string, length: (start[1] as string).length };
      blocks += 1;
      continue;
    }
    const end = /^ {0,3}(`+|~+)\s*$/.exec(line);
    if (end !== null && (end[1] as string)[0] === open.char && (end[1] as string).length >= open.length) open = undefined;
  }
  return { outside, blocks, closed: open === undefined };
}
```

**In `desk/test/stages/hold-pr.test.ts`, replace:**
```ts
import { useScratch } from '../support/context';
import { heldOf, verdicts } from '../support/held';
import { placePiece, readPieces, splitPiece } from '../support/pieces';
import { makeSite } from '../support/site';
```

**with:**
```ts
import { useScratch } from '../support/context';
import { heldOf, verdicts } from '../support/held';
import { outsideFences } from '../support/markdown';
import { placePiece, readPieces, splitPiece } from '../support/pieces';
import { makeSite } from '../support/site';
```

**In `desk/test/stages/hold-pr.test.ts`, replace:**
```ts
const heldBy = async (kind: keyof typeof KINDS): Promise<HeldArtifact> => heldOf(scratch, await KINDS[kind]());

/** The lines of markdown that are not inside a fenced block, and how many fenced blocks there are (CommonMark: a fence is closed by a fence of the same character that is at least as long). */
function outsideFences(markdown: string): { outside: string[]; blocks: number; closed: boolean } {
  const outside: string[] = [];
  let open: { char: string; length: number } | undefined;
  let blocks = 0;
  for (const line of markdown.split('\n')) {
    if (open === undefined) {
      const start = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
      if (start === null) {
        outside.push(line);
        continue;
      }
      open = { char: (start[1] as string)[0] as string, length: (start[1] as string).length };
      blocks += 1;
      continue;
    }
    const end = /^ {0,3}(`+|~+)\s*$/.exec(line);
    if (end !== null && (end[1] as string)[0] === open.char && (end[1] as string).length >= open.length) open = undefined;
  }
  return { outside, blocks, closed: open === undefined };
}

describe('outsideFences (the check that the tests below rely on)', () => {
  it('leaves out what is in a fenced block, and a block is closed only by a fence that is as long as the one that opened it', () => {
```

**with:**
```ts
const heldBy = async (kind: keyof typeof KINDS): Promise<HeldArtifact> => heldOf(scratch, await KINDS[kind]());

describe('outsideFences (the check that the tests below rely on)', () => {
  it('leaves out what is in a fenced block, and a block is closed only by a fence that is as long as the one that opened it', () => {
```

The README, and the usage.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: holds and corrections', () => {
  const holds = (): string => section('Holds and corrections');

  it('no longer says that the pull request of a hold or the command for a correction is not built', () => {
    expect(section('The desk workspace')).not.toContain('the pull request that carries a hold to the owner');
    expect(section('The desk workspace')).not.toContain('the command that records a correction or a retraction');
  });

  it('says that a held piece goes to the owner as a draft pull request from a branch made beside the checkout, in the order that it is done, and that the hold has the address', () => {
    expect(holds()).toContain('A held piece goes to the owner as a draft pull request.');
    expect(holds()).toContain('`hold/<day>-<slug>`');
    expect(holds()).toContain('The branch is made beside the checkout, from the commit that `main` is on, so the checkout is never changed');
    expect(holds()).toContain('`release: owner`');
    expect(holds()).toContain('Only then does it record the hold in the desk state, with the address of the pull request as `prUrl`');
    expect(holds()).toContain('A dry run never touches GitHub.');
    expect(holds()).toContain('it has never been run against GitHub itself');
  });

  it('says how the owner publishes the piece and how the owner discards it', () => {
    expect(holds()).toContain('marking the pull request ready for review and merging it');
    expect(holds()).toContain('You discard it by closing the pull request.');
  });

  it('says what the program needs, and that nothing is run through a shell', () => {
    expect(holds()).toContain('`git` and `gh`');
    expect(holds()).toContain('a remote called `origin`');
    expect(holds()).toContain('the checkout on `main`');
    expect(holds()).toContain('never through a shell');
    expect(holds()).toContain('the body of the pull request is passed as a file');
  });

  it('says that a step that fails fails the run at the stage hold, what is left, and the one case that is not a failure', () => {
    expect(holds()).toContain('It ends `failed` at the stage `hold`');
    expect(holds()).toContain('`main` gains only the record that the run failed');
    expect(holds()).toContain('| The pull request, after the push |');
    expect(holds()).toContain('open the pull request from it by hand, or delete the branch');
    expect(holds()).toContain('the hold is recorded without an address');
  });

  it('says what a correction does and does not do: it never deletes, the reason goes nowhere but the desk state, and it does not push or deploy', () => {
    expect(holds()).toContain('`npm run desk -- retract <slug> --reason <text>`');
    expect(holds()).toContain('sets `updatedAt` in the frontmatter of the piece to the UTC day of the record');
    expect(holds()).toContain('at most 500 characters');
    expect(holds()).toContain('it goes into the desk state as the note and nowhere else');
    expect(holds()).toContain('The rest of the piece is the same, byte for byte');
    expect(holds()).toContain('It does not push or deploy');
    expect(holds()).toContain('a piece that was held is on its pull request until you merge it');
  });

  it('lists retract among the commands, and in the exit codes', () => {
    const command = section('The desk command');
    expect(command).toContain('`npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]`');
    expect(command).toContain('for a correction that was made');
    expect(command).toContain('for a correction that was refused or failed');
    expect(README).toContain('`run`, `replay`, `status` and `retract`');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**In `desk/test/readme.test.ts`, replace:**
```ts
  });

  it('says that the content of a details element is kept, on purpose', () => {
    expect(limits()).toContain('`<details>`');
```

**with:**
```ts
  });

  it('says that the headline is in the title of a pull request and not in a fenced block, and that a pushed branch can be left without a pull request', () => {
    expect(limits()).toContain('**The headline in a pull request.**');
    expect(limits()).toContain('the title is the one place where it is not');
    expect(limits()).toContain('**A branch with no pull request.**');
    expect(limits()).toContain('stays on the remote');
  });

  it('says that the content of a details element is kept, on purpose', () => {
    expect(limits()).toContain('`<details>`');
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract` does not read them.
```

**with:**
```ts
    expect(USAGE).toContain('desk status');
    expect(USAGE).toContain('desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]');
    expect(USAGE).toContain('A piece that is held is sent to the owner as a draft pull request when the run is not dry');
    expect(USAGE).toContain('if that fails the run ends failed at the stage hold');
    expect(USAGE).toContain('(the branch hold/<day>-<slug> is pushed with git and gh, and the');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract` does not read them.
```

The adversarial matrix.

**In `desk/test/adversarial.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
```

**with:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
import { ExtractArtifact, FetchArtifact, VerifyArtifact, candidateId, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import type { RunResult } from '../src/run/orchestrate';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { fixtureText } from './support/fixtures';
import { publicLookup, tableLookup } from './support/lookup';
import { outsideBlocks } from './support/prompts';
import { EMPTY_CONTENT, SELECT, STATE, contentOf, setupRun } from './support/run';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route, Sent } from './support/transport';
```

**with:**
```ts
import { ExtractArtifact, FetchArtifact, VerifyArtifact, candidateId, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import { GhForge, HOLD_BRANCH } from '../src/run/forge';
import type { RunResult } from '../src/run/orchestrate';
import { SiteTarget } from '../src/run/target';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { scriptedExec } from './support/exec';
import type { ScriptedReply } from './support/exec';
import { fixtureText } from './support/fixtures';
import { publicLookup, tableLookup } from './support/lookup';
import { outsideFences } from './support/markdown';
import { outsideBlocks } from './support/prompts';
import { branchesIn, changesIn, git, initRepo, subjectsOf } from './support/repo';
import { EMPTY_CONTENT, SELECT, STATE, contentOf, setupRun, unentailed } from './support/run';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route, Sent } from './support/transport';
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
    expect(made.fake.calls.map((call) => call.role)).toEqual(['select']);
  });
});
```

**with:**
```ts
    expect(made.fake.calls.map((call) => call.role)).toEqual(['select']);
  });
});

// The runs that are held and sent to the owner. The programs that send a piece, `git` and `gh`, are not run: `GhForge` is given a script of what they answer, and keeps what it
// was asked to run, so that these say exactly which programs the Desk would have started, with which arguments. The checkout is a real repository with no remote.

const PULL_REQUEST = 'https://github.com/example/agentic-media-house/pull/9';
const NO_LOGIN = 'To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.\n';

/** A headline that a model wrote with everything in it that a shell, a markdown reader or a command line would take for something else. */
const SHELL_TITLE = 'Fixture Robotics ships $(touch /tmp/pwned) "FX-1" `id` arms; rm -rf / @everyone #1';

/** A held run in a repository of its own, whose pieces are sent with `GhForge` over `replies`. */
async function sentRun(fake: FakeClient, ...replies: ScriptedReply[]) {
  const made = setupRun(scratch, { fake });
  const cli = initRepo(made.repoDir);
  const { exec, calls } = scriptedExec(...replies);
  const result = await made.run({ target: new SiteTarget(made.repoDir, cli), forge: new GhForge(exec, { cwd: made.repoDir, tempDir: scratch() }) });
  return { ...made, calls, result };
}

describe('the adversarial matrix: a headline with shell characters reaches GhForge', () => {
  const got = async () => {
    let body = '';
    let bodyFile = '';
    const made = await sentRun(
      told({ piece: reply((copy) => { copy.title = fact(SHELL_TITLE, 'c-1'); }) }),
      { code: 0, stdout: 'https://github.com/example/agentic-media-house.git\n' },
      { code: 0 },
      (call) => {
        bodyFile = call.args[call.args.indexOf('--body-file') + 1] as string;
        body = readFileSync(bodyFile, 'utf8');
        return { code: 0, stdout: `${PULL_REQUEST}\n` };
      },
    );
    return { ...made, body, bodyFile };
  };

  it('is held and sent as a pull request, the title with the characters in it as one argument and nothing run through a shell', async () => {
    const { result, calls } = await got();
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBe(PULL_REQUEST);
    expect(calls.map((call) => call.file)).toEqual(['git', 'git', 'gh']);
    expect(calls[0]?.args).toEqual(['remote', 'get-url', 'origin']);
    const branch = `hold/${DEMO_DATE}-${result.slug}`;
    expect(HOLD_BRANCH.test(branch)).toBe(true);
    expect(calls[1]?.args).toEqual(['push', '-u', 'origin', branch]);
    expect(calls[2]?.args.slice(0, 8)).toEqual(['pr', 'create', '--draft', '--base', 'main', '--head', branch, '--title']);
    expect(calls[2]?.args[8]).toBe(`Held: ${SHELL_TITLE}`);
    expect(calls[2]?.args[9]).toBe('--body-file');
    expect(calls[2]?.args).toHaveLength(11);
  });

  it('puts the characters in one argument alone: every other argument of every program has none of them', async () => {
    const { calls } = await got();
    const others = calls.flatMap((call, at) => call.args.filter((argument, place) => !(at === 2 && place === 8)));
    for (const argument of others) {
      for (const character of ['$(', '`', '"', ';', ' ', '@', '#']) expect(argument, `${argument} has ${character}`).not.toContain(character);
    }
  });

  it('puts the headline in the body only inside a fenced block, in a file that is gone when gh has read it', async () => {
    const { body, bodyFile } = await got();
    expect(body).toContain(SHELL_TITLE);
    const { outside, blocks, closed } = outsideFences(body);
    expect(closed).toBe(true);
    expect(blocks).toBeGreaterThanOrEqual(1);
    expect(outside.join('\n')).not.toContain('$(');
    expect(outside.join('\n')).not.toContain('@everyone');
    expect(outside.join('\n')).not.toContain('`id`');
    expect(existsSync(bodyFile)).toBe(false);
  });

  it('ends with the piece on its branch and the hold on main with the address, and nothing else changed', async () => {
    const { result, repoDir } = await got();
    expect(branchesIn(repoDir)).toEqual([`hold/${DEMO_DATE}-${result.slug}`, 'main'].sort());
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${result.slug}`, 'start']);
    expect((await readDeskState(path.join(repoDir, STATE))).holds[0]?.prUrl).toBe(PULL_REQUEST);
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(changesIn(repoDir)).toEqual([]);
  });
});

const FORGE_DOWN: { name: string; replies: ScriptedReply[]; started: number; reason: string }[] = [
  {
    name: 'the network is down when the branch is pushed',
    replies: [{ code: 0 }, { code: 128, stderr: "fatal: unable to access 'https://github.com/example/agentic-media-house.git/': Could not resolve host: github.com\n" }],
    started: 2,
    reason: 'failed (exit code 128): fatal: unable to access',
  },
  {
    name: 'GitHub refuses the pull request after the branch was pushed',
    replies: [{ code: 0 }, { code: 0 }, { code: 1, stderr: 'GraphQL: Resource not accessible by integration (createPullRequest)\n' }],
    started: 3,
    reason: 'was pushed and no pull request was opened',
  },
  { name: 'gh is not logged in', replies: [{ code: 0 }, { code: 0 }, { code: 4, stderr: NO_LOGIN }], started: 3, reason: 'GitHub did not take the credentials' },
  { name: 'the credentials are refused at the push', replies: [{ code: 0 }, { code: 128, stderr: "remote: Permission to example/agentic-media-house.git denied to someone.\nfatal: unable to access 'https://github.com/example/agentic-media-house.git/': The requested URL returned error: 403\n" }], started: 2, reason: 'GitHub did not take the credentials' },
  { name: 'the repository has no remote', replies: [{ code: 2, stderr: "error: No such remote 'origin'\n" }], started: 1, reason: 'has no remote called origin' },
  { name: 'git is not installed', replies: [Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })], started: 1, reason: 'git cannot be started' },
];

describe.each(FORGE_DOWN.map((scenario) => [scenario.name, scenario] as const))('the adversarial matrix: a held run when the forge is down: %s', (_name, scenario) => {
  const run = () => sentRun(unentailed(), ...scenario.replies);

  it('ends failed at the stage hold, with the reason, and not published', async () => {
    const { result } = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(result.reason).toContain(scenario.reason);
    expect(result.pullRequest).toBeNull();
  });

  it('started no more programs than it should, and no shell', async () => {
    const { calls } = await run();
    expect(calls).toHaveLength(scenario.started);
    expect(calls.every((call) => call.file === 'git' || call.file === 'gh')).toBe(true);
  });

  it('leaves main as it was but for the record that the run failed: no piece, no hold, no branch, no change that is not committed', async () => {
    const { result, repoDir } = await run();
    expect(subjectsOf(repoDir)).toEqual([`desk: the run of ${DEMO_DATE} failed`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(git(repoDir, 'branch', '--show-current')).toBe('main');
    expect(changesIn(repoDir)).toEqual([]);
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.holds).toEqual([]);
    expect(state.lastRun).toMatchObject({ outcome: 'failed', slug: null });
    expect(result.slug).toBeNull();
  });

  it('keeps the held draft in the folder of the run, so that nothing is lost and the next try has it to read', async () => {
    const { result } = await run();
    expect(existsSync(path.join(result.dir, 'held'))).toBe(true);
  });
});

describe('the adversarial matrix: the runs that are sent to the owner', () => {
  it('has a scenario for a headline with shell characters and one for each way that the forge can be down, each with its own name', () => {
    expect(new Set(FORGE_DOWN.map((scenario) => scenario.name)).size).toBe(FORGE_DOWN.length);
    expect(FORGE_DOWN.length).toBeGreaterThanOrEqual(5);
  });
});

```

- [ ] **Step 2: Run the tests of the README and the usage, and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts test/cli.test.ts`
Expected: FAIL — `the README has no section "Holds and corrections"` and `A piece that is held is sent to the owner`

- [ ] **Step 3: Write the README and the usage**

**In `README.md`, replace:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, and holds every value's normalised form and unit to its raw text, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, the pull request that carries a hold to the owner, the command that records a correction or a retraction, the private evidence bucket, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**with:**
```markdown
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, and holds every value's normalised form and unit to its raw text, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit on `main`: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. A held piece that is sent to the owner also has one commit, of its two files, on a branch of its own (see Holds and corrections). Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, the private evidence bucket, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown
- `npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state. The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has: when the record is not there, or is of another run, status says that the try is not known and why.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`. The last line it prints says what it has shown, and what it has not: `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`. The model and the verifier of the demo are scripts written to pass, so it shows that the stages fit together and that a run can be replayed, and nothing about how well a real model writes or a real verifier judges.

## The verifier evals

```

**with:**
```markdown
- `npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state. The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has: when the record is not there, or is of another run, status says that the try is not known and why.

- `npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]` records a correction (the default) or a retraction of a piece that is on the site, and commits it (see Holds and corrections).

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`. The last line it prints says what it has shown, and what it has not: `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`. The model and the verifier of the demo are scripts written to pass, so it shows that the stages fit together and that a run can be replayed, and nothing about how well a real model writes or a real verifier judges.

## Holds and corrections

**A held piece goes to the owner as a draft pull request.** When a run that is not dry ends held, and the program can reach GitHub, the Desk does this, and stops at the first step that fails. All of it is built and tested with a stand-in for GitHub and a script in the place of `git` and `gh`; it has never been run against GitHub itself.

1. It keeps the draft in `runs/<date>/held/`, as it always did.
2. It commits the two files of the piece to a branch `hold/<day>-<slug>`: the article and the ledger, exactly as they would have been published, except that the ledger says `release: owner` (the receipts page then says that the owner released the piece) and that its gate route is `hold` with the reasons of the hold. The branch is made beside the checkout, from the commit that `main` is on, so the checkout is never changed: no switch of branch, no file written, whatever goes wrong.
3. It pushes the branch to `origin` and opens a draft pull request into `main`, titled `Held: <headline>`. The text says what was held and why (each reason in the words of the holds page of the site), what the gate and the model check said, and how to publish or discard the piece. What a model wrote (the headline, the messages of the failures, the notes of the model check) is in fenced blocks, so that it cannot become a link, a mention or a heading.
4. Only then does it record the hold in the desk state, with the address of the pull request as `prUrl`, and commit that to `main`.

You publish the piece by marking the pull request ready for review and merging it: the two files arrive on `main`, and the hold stays in the desk state. You discard it by closing the pull request. A dry run never touches GitHub.

What the program needs for this: `git` and `gh` (the command line of GitHub) on the path, `gh` logged in (or `GH_TOKEN` in the environment), a remote called `origin`, and the checkout on `main` with nothing uncommitted where the Desk writes (the desk state and the folders of the pieces and the ledgers). The programs are started with a list of arguments and never through a shell, the body of the pull request is passed as a file, and the branch must have the form `hold/<day>-<slug>` before anything is run.

**When a step fails, the run fails.** It ends `failed` at the stage `hold`, the next try of the day is allowed, the held draft is still in `runs/`, the desk state has no hold, and `main` gains only the record that the run failed. A draft that cannot be written as a piece (a sentence cites a claim that does not exist) is the one case that is not a failure: it has nothing to merge, so no pull request is opened, the hold is recorded without an address, and the reason of the run says so.

| Step that fails | What is left |
|---|---|
| Uncommitted changes where the Desk writes, no remote, the checkout is not on `main`, the branch or the slug is taken | Nothing was made |
| The push | The branch is removed |
| The pull request, after the push | The local branch is removed. The branch is on the remote, and the error says so: open the pull request from it by hand, or delete the branch |
| The record of the hold, after the pull request | The pull request and the branch stay, and the error says where the pull request is |

**A piece that is published and wrong is corrected in public, and never deleted.** `npm run desk -- retract <slug> --reason <text>` adds a record `{ at, slug, kind, note }` to the corrections of the desk state, sets `updatedAt` in the frontmatter of the piece to the UTC day of the record (the site refuses to build a piece whose `updatedAt` is not the day of its latest correction, and one that has a record and no `updatedAt`), and commits the two files in one commit. `--kind retraction` records a retraction; `--dry` says what would be done and writes nothing. The reason is one line of at most 500 characters (white space is made one space, control characters are refused), and it goes into the desk state as the note and nowhere else: not into the piece, not into the ledger, not into the message of the commit. The rest of the piece is the same, byte for byte, and its ledger is not touched. A second record on the same day changes only the desk state. The command refuses a slug that is not on the site (a piece that was held is on its pull request until you merge it), a piece or a desk state with uncommitted changes, and a clock that is before the day the piece was published or before an earlier record of the same piece. It does not push or deploy: the notice reaches readers when the commit reaches `main` and the site is built.

## The verifier evals

```

**In `README.md`, replace:**
```markdown
- **Analysis sentences.** Up to a fifth of the sentences of a piece may be the Desk's own analysis, which the page labels Analysis. The gate reads them for where they stand, how many there are, how they begin and the numbers, dates and names they bring in (G7), and the model check (G10) is never asked about them: it judges fact sentences and headings. Nothing reads what else an analysis sentence says, so a wrong analysis can be published. The share cap is what limits the exposure; it does not remove it.
- **Values that are not compared.** Extract holds the `normalised` form and the `unit` of every value of a claim to its `raw` text, and drops the claim (the reason `value-normalised-mismatch`) when they say something else: a number is read as the gate reads it (digits or number words, with the unit table of the gate), a date as ISO at the precision it is written, a name as lowercase with single spaces. A value whose `raw` text is not a number token, number words or a date that the gate reads (a vague amount such as "half", a lone "one", a date in another shape) is not compared with its normalised form, because the gate does not read it as a figure either. The check is made on claims, which are all that Extract makes; the gate itself still takes the `normalised` form on trust for a number in words.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

**with:**
```markdown
- **Analysis sentences.** Up to a fifth of the sentences of a piece may be the Desk's own analysis, which the page labels Analysis. The gate reads them for where they stand, how many there are, how they begin and the numbers, dates and names they bring in (G7), and the model check (G10) is never asked about them: it judges fact sentences and headings. Nothing reads what else an analysis sentence says, so a wrong analysis can be published. The share cap is what limits the exposure; it does not remove it.
- **Values that are not compared.** Extract holds the `normalised` form and the `unit` of every value of a claim to its `raw` text, and drops the claim (the reason `value-normalised-mismatch`) when they say something else: a number is read as the gate reads it (digits or number words, with the unit table of the gate), a date as ISO at the precision it is written, a name as lowercase with single spaces. A value whose `raw` text is not a number token, number words or a date that the gate reads (a vague amount such as "half", a lone "one", a date in another shape) is not compared with its normalised form, because the gate does not read it as a figure either. The check is made on claims, which are all that Extract makes; the gate itself still takes the `normalised` form on trust for a number in words.
- **The headline in a pull request.** The title of a hold's pull request is `Held: ` and the headline that the model wrote, on one line and cut at 100 characters. It is passed to `gh` as one argument and is never run, but it is shown on GitHub as it is written, and GitHub may turn a `#12` in it into a link to that issue or pull request. The text of the pull request has everything a model wrote in fenced blocks; the title is the one place where it is not.
- **A branch with no pull request.** A branch that was pushed when the pull request could not be opened stays on the remote (the Desk removes only its own copy). The error says its name; delete it or open the pull request from it by hand. Pushing it again the same day, for the same slug, is refused by git as a push that is not a fast-forward.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

**In `README.md`, replace:**
```markdown
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run desk -- <command>` | The command line of the Desk: `run`, `replay` and `status` (see The desk command). |
| `npm run desk:demo` | Run the made-up story through the whole pipeline in a dry run, replay it, and fail unless it was published, nothing was written and the replay is equal. |
| `npm run evals:verifier` | Run the labelled set of sixty sentences through a verifier and print precision and recall (see The verifier evals). |
```

**with:**
```markdown
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run desk -- <command>` | The command line of the Desk: `run`, `replay`, `status` and `retract` (see The desk command and Holds and corrections). |
| `npm run desk:demo` | Run the made-up story through the whole pipeline in a dry run, replay it, and fail unless it was published, nothing was written and the replay is equal. |
| `npm run evals:verifier` | Run the labelled set of sixty sentences through a verifier and print precision and recall (see The verifier evals). |
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

**with:**
```ts
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts test/cli.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 4: Run the adversarial matrix**

The new scenarios test what Tasks 11 to 14 built, so they pass the first time. Step 7 shows that they can fail.

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts test/stages/hold-pr.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 5: Run the whole check**

Run: `! LC_ALL=C grep -rn '[^[:print:][:space:]]' desk/src desk/test README.md`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 6: Commit**

```bash
git add README.md desk/src/cli.ts desk/test/adversarial.test.ts desk/test/cli.test.ts desk/test/readme.test.ts desk/test/stages/hold-pr.test.ts desk/test/support/markdown.ts
git commit -m "docs(desk): the README and the usage say how a held piece reaches the owner as a draft pull request and what is left when a step fails, what desk retract does and does not do, and the two limits that are new; the adversarial matrix gains a headline with shell characters that reaches GhForge, and a held run for each way that the forge can be down" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Show that a scenario can fail**

When a pull request cannot be opened after the branch was pushed, the Desk removes its own copy of the branch (`dropBranch`). Take that line away, and the scenario of GitHub refusing the pull request must fail, because a branch is left in the repository.

Run: `node -e "const fs=require('fs');const f='desk/src/stages/hold-pr.ts';const t=fs.readFileSync(f,'utf8');const line='    await target.dropBranch(branch).catch(() => undefined);\n';if(!t.includes(line))throw new Error('not found');fs.writeFileSync(f,t.replace(line,''))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts`
Expected: FAIL — `GitHub refuses the pull request after the branch was pushed`

Put it back.

Run: `git checkout -- desk/src/stages/hold-pr.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

---

### Task 16: What each outcome commits, and where

**Files:**
- Create: `desk/test/outcomes.test.ts`

Tasks 11 to 15 changed what a run leaves in the repository. A person who has to decide what to merge, what to delete and what to worry about, and an agent that has to write a workflow around it, needs it in one place. This task writes it once, as the table below, and makes the table a test: every row is made by a real run of the pipeline in the made-up world, in a real git repository that has no remote, with a `FakeForge`, and the test reads what the run left (the commits that `main` gained, the files in them, the other branches with their commits and files, and what the forge was asked) and says it in the words of the table.

| Outcome | On `main` | On a branch of its own | The forge |
|---|---|---|---|
| published | one commit `desk: publish <slug>`: the article, its ledger, the desk state | none | not asked |
| held, sent to the owner | one commit `desk: hold <slug>`: the desk state, whose new hold has the address of the pull request | `hold/<day>-<slug>`: one commit `desk: held piece <slug>, for the owner to release`: the article and the ledger | has a remote, push, pull request |
| held, with no forge | one commit `desk: hold <slug>`: the desk state | none | none given |
| held, with a draft that cannot be written as a piece | one commit `desk: hold <slug>`: the desk state, whose hold has no address; the reason says why | none | not asked |
| held, in a dry run | nothing | none | not asked |
| no story | one commit `desk: no story on <day>`: the desk state | none | not asked |
| failed before the hold | one commit `desk: the run of <day> failed`: the desk state | none | not asked |
| failed at the hold, the forge is down at the push | one commit `desk: the run of <day> failed`: the desk state | none: a branch that was made is removed | has a remote, push |
| failed at the hold, the pull request is refused | the same | none: the local branch is removed (the remote one stays, and the error says so) | has a remote, push, pull request |
| a correction of a published piece (`desk retract`) | one commit `desk: correct <slug>` (or `retract`): the article (`updatedAt`) and the desk state | none | not asked |

Read it down the middle column: `main` never gets more than one commit from a run, and a piece reaches it by one of two ways only, the run that publishes it or the owner who merges its pull request. Read it down the right column: the forge is asked only when a piece is held and the run is not dry.

**What the table does not say, and the next parts must.** Nothing here pushes `main`: the commits of a run are in the checkout of the machine that made them, and a workflow has to push them. A piece that the owner merges is on `main` on GitHub and not in the checkout of the machine that made the hold, which will see it at the next `git pull`. The desk state of a fresh checkout records the hold and the address of the pull request; it does not record that the owner merged or closed it. And the folder of a run (`runs/<date>/`, with the held draft) is git-ignored, so a workflow that must keep it past the end of the job has to upload it, and without the text of the pages (see the design: artifacts of a public repository are readable by anyone).

**The names that later parts use.** In `desk/src/run/forge.ts` (exported from the package): `ForgeTarget` (`hasRemote()`, `pushBranch(branch)`, `openDraftPullRequest({ branch, title, body, base })` giving `{ url, number }`), `FakeForge` (`calls`, `remote`, `fail(method, error)`), `GhForge(exec, { cwd, tempDir })`, `nodeExec(environment?)`, `ForgeError` (`kind`), `HOLD_BRANCH`, `holdBranchName(date, slug)`, `assertHoldBranch`, `checkPullRequest`. In `desk/src/stages/hold-pr.ts` (a stage file, not exported from the package): `renderHeldPiece(held)`, `heldPieceFiles(held)`, `holdPrTitle(held)`, `holdPrBody(held)`, `sendToOwner(ctx, target, forge, held)`. In `desk/src/run/git.ts`: `GitTarget.currentBranch()`, `commitToNewBranch(branch, files, message)`, `deleteBranch(branch)`, `MAIN_BRANCH`, `BranchFile`; `PublishTarget.commitPieceToBranch(change)` and `dropBranch(branch)`. `runHold(ctx, target, claims, verified, run, forge?)` gives `pullRequest` and `note`; `RunDeskOptions.forge` and `RunResult.pullRequest`; `CliDeps.forge` and `CliDeps.stages`; `resultLines(result)`; the line `pull request: <address>` of `desk run`. In `desk/src/run/retract.ts` (exported from the package): `retractPiece({ repoDir, git, slug, reason, kind, now, dry })` giving `{ slug, kind, at, updatedAt, pieceChanged, files, commit, dry }`, `RetractRefused`, `normaliseReason(reason)`, `setUpdatedAt(mdx, day)`, `MAX_REASON_LENGTH`; `addCorrection(state, correction)` in `desk-state.ts`; and the command `desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]`.

- [ ] **Step 1: Write the test**

The runs are made with the helpers that the tests of whole runs share (`setupRun`, `unentailed`), in a repository that `initRepo` makes of the made-up site. The row of the correction uses the golden piece, published.

**Create `desk/test/outcomes.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, demoClient } from '../src/demo/story';
import { DEMO_DATE } from '../src/demo/world';
import { FakeClient } from '../src/model/fake';
import { FakeForge, ForgeError } from '../src/run/forge';
import { retractPiece } from '../src/run/retract';
import { DryTarget, SiteTarget, sitePaths } from '../src/run/target';
import { useScratch } from './support/context';
import { PUBLISHED_SLUG, publishedSite } from './support/published';
import { branchesIn, git, initRepo } from './support/repo';
import { SELECT, STATE, setupRun, unentailed } from './support/run';
import type { RunSetup } from './support/run';

// What each way for a run to end commits, and where. This is the table that the owner needs in order to know what is in the repository after a run, and each row is made by a real
// run of the pipeline in a real git repository (with no remote), with a `FakeForge`: the test reads what the run left (the commits that `main` gained, the files in them, the
// other branches with their commits and files, and what the forge was asked) and says it in the same words as the table does.
//
//   | Outcome                                   | On main                                             | On a branch of its own                        | The forge                      |
//   |-------------------------------------------|-----------------------------------------------------|-----------------------------------------------|--------------------------------|
//   | published                                 | one commit: the article, its ledger, the desk state | none                                          | not asked                      |
//   | held, sent to the owner                   | one commit: the desk state, with the address        | hold/<day>-<slug>: the article and the ledger | remote, push, pull request     |
//   | held, with no forge                       | one commit: the desk state                          | none                                          | none given                     |
//   | held, a draft that cannot be a piece      | one commit: the desk state, with no address         | none                                          | not asked                      |
//   | held, in a dry run                        | nothing                                             | none                                          | not asked                      |
//   | no story                                  | one commit: the desk state                          | none                                          | not asked                      |
//   | failed before the hold                    | one commit: the desk state                          | none                                          | not asked                      |
//   | failed at the hold, the forge is down     | one commit: the desk state (the run failed)         | none (a branch that was made is removed)      | remote, push                   |
//   | failed at the hold, the pull request fails| one commit: the desk state (the run failed)         | none (the local branch is removed)            | remote, push, pull request     |
//   | a correction of a published piece         | one commit: the article (updatedAt), the desk state | none                                          | not asked                      |

const scratch = useScratch();
const paths = sitePaths();
const SLUG = 'fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant';

/** What a run or a correction left in a repository whose first commit is `start`: the commits and files that `main` gained, the branches that were made, and what the forge was asked. */
interface Left {
  main: string[];
  mainFiles: string[];
  branches: Record<string, { subjects: string[]; files: string[] }>;
  forge: string[];
}

/** What the repository `repoDir` has gained since its first commit. */
function leftIn(repoDir: string, forge: FakeForge): Left {
  const start = git(repoDir, 'rev-list', '--max-parents=0', 'main');
  const lines = (text: string): string[] => (text === '' ? [] : text.split('\n'));
  const gained = (ref: string) => ({ subjects: lines(git(repoDir, 'log', '--format=%s', ref, `^${start}`)), files: lines(git(repoDir, 'diff', '--name-only', start, ref)).sort() });
  const others = branchesIn(repoDir).filter((name) => name !== 'main');
  return {
    main: gained('main').subjects,
    mainFiles: gained('main').files,
    branches: Object.fromEntries(others.map((name) => [name, gained(name)])),
    forge: forge.calls.map((call) => call.method),
  };
}

/** A run of the made-up day in a repository of its own, with a forge, and what it left. */
async function ranWith(options: RunSetup, prepare: (forge: FakeForge) => void = () => undefined, overrides: { dry?: boolean; forge?: boolean } = {}) {
  const made = setupRun(scratch, options);
  const cli = initRepo(made.repoDir);
  const forge = new FakeForge();
  prepare(forge);
  const result = await made.run({ target: overrides.dry === true ? new DryTarget(made.repoDir) : new SiteTarget(made.repoDir, cli), ...(overrides.forge === false ? {} : { forge }) });
  return { result, left: leftIn(made.repoDir, forge) };
}

const NEWS = paths.newsFile(SLUG);
const LEDGER = paths.ledgerFile(SLUG);
const BRANCH = `hold/${DEMO_DATE}-${SLUG}`;
const FAILED = [`desk: the run of ${DEMO_DATE} failed`];

describe('what each outcome commits, and where', () => {
  it('published: one commit on main, with the article, its ledger and the desk state; no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: demoClient() });
    expect(result.outcome).toBe('published');
    expect(left).toEqual({ main: [`desk: publish ${SLUG}`], mainFiles: [LEDGER, NEWS, STATE], branches: {}, forge: [] });
  });

  it('held, sent to the owner: one commit on main with the desk state alone, and the article and the ledger in one commit on a branch of their own, which the forge pushed and opened a pull request from', async () => {
    const { result, left } = await ranWith({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({
      main: [`desk: hold ${SLUG}`],
      mainFiles: [STATE],
      branches: { [BRANCH]: { subjects: [`desk: held piece ${SLUG}, for the owner to release`], files: [LEDGER, NEWS] } },
      forge: ['hasRemote', 'pushBranch', 'openDraftPullRequest'],
    });
  });

  it('held, with no forge: one commit on main with the desk state alone, and no branch', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, undefined, { forge: false });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({ main: [`desk: hold ${SLUG}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('held, with a draft that cannot be written as a piece: one commit on main with the desk state alone, with no address, and no branch; the forge is not asked', async () => {
    const unwritable = structuredClone(DEMO_REPLY);
    unwritable.takeaways[0] = { kind: 'fact', text: DEMO_REPLY.takeaways[0]?.text ?? '', claimIds: ['c-99'] };
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS }).script('compose', unwritable, { replacements: [] }, { replacements: [] });
    const { result, left } = await ranWith({ fake });
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toContain('no pull request: the draft cannot be written as a piece');
    expect(left).toEqual({ main: [`desk: hold ${SLUG}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('held, in a dry run: nothing is committed anywhere and the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, undefined, { dry: true });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({ main: [], mainFiles: [], branches: {}, forge: [] });
  });

  it('no story: one commit on main with the desk state alone, and no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] }) });
    expect(result.outcome).toBe('no-story');
    expect(left).toEqual({ main: [`desk: no story on ${DEMO_DATE}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('failed before the hold: one commit on main with the desk state alone, and no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({
      stages: {
        compose: async () => {
          throw new Error('the composer fell over');
        },
      },
    });
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('compose');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('failed at the hold because the forge is down: one commit on main with the desk state alone, that says that the run failed, and no branch, because the one that was made is removed', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, (forge) => forge.fail('pushBranch', new ForgeError('failed', 'could not resolve host')));
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: ['hasRemote', 'pushBranch'] });
  });

  it('failed at the hold because the pull request cannot be opened: the same, and the forge was asked to open it', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, (forge) => forge.fail('openDraftPullRequest', new ForgeError('failed', 'GitHub said no')));
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: ['hasRemote', 'pushBranch', 'openDraftPullRequest'] });
  });

  it('a correction of a published piece: one commit on main, with the article (updatedAt) and the desk state; no branch; the forge is not asked', async () => {
    const { repoDir, cli } = publishedSite(scratch);
    const result = await retractPiece({ repoDir, git: cli, slug: PUBLISHED_SLUG, reason: 'A figure was wrong.', kind: 'correction', now: () => new Date('2026-10-06T09:30:00.000Z') });
    expect(result.commit).not.toBeNull();
    expect(leftIn(repoDir, new FakeForge())).toEqual({ main: [`desk: correct ${PUBLISHED_SLUG}`], mainFiles: [paths.newsFile(PUBLISHED_SLUG), STATE], branches: {}, forge: [] });
  });
});
```

- [ ] **Step 2: Run the test**

This test describes what Tasks 11 to 15 built, so it passes the first time. Step 3 shows that it can fail.

Run: `npm test --workspace @robywire/desk -- test/outcomes.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Show that it can fail**

The forge must not be touched in a dry run, and the one expression that says so is in `runHold`. Take it out, and the row of the dry run must fail: a dry target cannot make a branch, so the run ends failed.

Run: `node -e "const fs=require('fs');const f='desk/src/stages/hold.ts';const t=fs.readFileSync(f,'utf8');const from='forge === undefined || target.dry ? undefined';if(!t.includes(from))throw new Error('not found');fs.writeFileSync(f,t.replace(from,'forge === undefined ? undefined'))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/outcomes.test.ts`
Expected: FAIL — `held, in a dry run`

Put it back.

Run: `git checkout -- desk/src/stages/hold.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

- [ ] **Step 4: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Run everything that the repository checks**

This part changed the Desk and the README and nothing in the site, so the builds and the audits are as they were; they run all the same, because `npm run verify` is the one command that says that the repository as a whole is in order.

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. The lines of the output that matter, in the order they appear, as they were when this part was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the repository after this task and change when a test is added:

```text
Result (101 files):
- 0 errors

Test Files  35 passed (35)
Tests  2221 passed (2221)
Test Files  6 passed (6)
Tests  253 passed (253)
Test Files  38 passed (38)
Tests  1271 passed (1271)
Test Files  68 passed (68)
Tests  2911 passed (2911)

61 of 61 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

extract: 7 claims proposed, 7 kept, 0 dropped
compose: the gate says publish (0 failures, 0 hold reasons)
verify: the model check passed
verify: round 0: the gate says publish, the model check passed
outcome: published
dry run: nothing was written to the site or to git (3 files would have been)
04-extract: equal
05-compose: equal
06-verify: equal
replay: equal
desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality

Passed: 18 checks.   (audit:prod)
Passed: 17 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

- [ ] **Step 6: Commit**

```bash
git add desk/test/outcomes.test.ts
git commit -m "test(desk): what each way for a run to end commits, and where, as a table that real runs make in a real repository: published, held and sent to the owner, held with no forge, held with a draft that cannot be a piece, held in a dry run, no story, failed before the hold, failed at the hold, and a correction of a published piece" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing
