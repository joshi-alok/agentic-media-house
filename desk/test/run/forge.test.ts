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
