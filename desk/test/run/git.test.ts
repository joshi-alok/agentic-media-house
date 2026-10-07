import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMIT_TRAILER, FakeGit, GitCli, MAIN_BRANCH } from '../../src/run/git';
import { useScratch } from '../support/context';
import { ISOLATED, changesIn, git, show } from '../support/repo';

// The Desk commits only what it wrote, only the files it names, and only into a repository that has nothing else of the Desk's in the way.
// The tests of `GitCli` run the real `git` in a repository that each test makes for itself in a temporary folder: nothing leaves the
// machine, and nothing is ever pushed.

const scratch = useScratch();

const cliFor = (dir: string, tempDir?: string): GitCli => new GitCli(dir, { env: ISOLATED, ...(tempDir === undefined ? {} : { tempDir }) });

function write(dir: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}

/** A repository with one commit: a README, the desk state and a piece. Its own settings say who commits and that nothing is signed. */
function makeRepo(): string {
  const dir = scratch();
  git(dir, 'init', '--quiet', '-b', 'main');
  git(dir, 'config', 'user.name', 'Test Committer');
  git(dir, 'config', 'user.email', 'committer@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  write(dir, 'README.md', 'readme\n');
  write(dir, 'site/src/data/desk-state.json', '{}\n');
  write(dir, 'site/src/content/news/older.mdx', 'older\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '--quiet', '-m', 'start');
  return dir;
}

const NEWS = 'site/src/content/news/new-piece.mdx';
const LEDGER = 'site/src/content/ledger/new-piece.json';
const STATE = 'site/src/data/desk-state.json';

/** The three files of a publish, written into `dir`: two new ones and a change to the state. */
function writePiece(dir: string): void {
  write(dir, NEWS, 'news\n');
  write(dir, LEDGER, '{}\n');
  write(dir, STATE, '{"changed":true}\n');
}

const filesOf = (dir: string, rev: string): string[] => git(dir, 'show', '--name-only', '--format=', rev).split('\n').sort();

describe('GitCli.commit', () => {
  it('commits exactly the files it is given and returns the id of the commit', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const id = await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(id).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS, STATE]);
    expect(changesIn(dir)).toEqual([]);
  });

  it('writes the message as the subject and the trailer of the project as a trailer, with the two -m options', async () => {
    const dir = makeRepo();
    writePiece(dir);
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('desk: publish new-piece');
    expect(git(dir, 'log', '-1', '--format=%B')).toBe(`desk: publish new-piece\n\n${COMMIT_TRAILER}`);
    expect(COMMIT_TRAILER).toBe('Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
    const message = git(dir, 'log', '-1', '--format=%B');
    const parsed = execFileSync('git', ['interpret-trailers', '--parse'], { cwd: dir, input: message, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();
    expect(parsed).toBe(COMMIT_TRAILER);
  });

  it('leaves every other change where it was: an untracked file stays untracked, a modified file stays modified', async () => {
    const dir = makeRepo();
    writePiece(dir);
    write(dir, 'notes.txt', 'mine\n');
    write(dir, 'README.md', 'changed readme\n');
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(changesIn(dir)).toEqual([' M README.md', '?? notes.txt']);
  });

  it('refuses when something else is already staged, because it would be committed with the Desk\'s files; nothing is committed', async () => {
    const dir = makeRepo();
    writePiece(dir);
    write(dir, 'README.md', 'staged by someone\n');
    git(dir, 'add', 'README.md');
    const head = git(dir, 'rev-parse', 'HEAD');
    await expect(cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece')).rejects.toThrow('README.md');
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'diff', '--cached', '--name-only')).toBe('README.md');
  });

  it('reads a path as a path and never as a pattern: a file called *.txt is committed alone', async () => {
    const dir = makeRepo();
    write(dir, 'a.txt', 'a\n');
    write(dir, '*.txt', 'star\n');
    const id = await cliFor(dir).commit(['*.txt'], 'desk: a literal path');
    expect(filesOf(dir, id)).toEqual(['*.txt']);
    expect(changesIn(dir)).toEqual(['?? a.txt']);
  });

  it('takes a path relative to the repository or an absolute one', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const id = await cliFor(dir).commit([NEWS, path.join(dir, LEDGER), STATE], 'desk: publish new-piece');
    expect(filesOf(dir, id)).toEqual([LEDGER, NEWS, STATE]);
  });

  it('refuses a path outside the repository, the repository itself, and no path at all', async () => {
    const dir = makeRepo();
    writePiece(dir);
    const cli = cliFor(dir);
    await expect(cli.commit(['../outside.txt'], 'x')).rejects.toThrow('is not inside the repository');
    await expect(cli.commit([path.join(path.dirname(dir), 'outside.txt')], 'x')).rejects.toThrow('is not inside the repository');
    await expect(cli.commit(['.'], 'x')).rejects.toThrow('the whole repository');
    await expect(cli.commit([], 'x')).rejects.toThrow('needs at least one path');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });

  it('refuses a message that says nothing', async () => {
    const dir = makeRepo();
    writePiece(dir);
    await expect(cliFor(dir).commit([NEWS], '   ')).rejects.toThrow('needs a message');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });

  it('refuses to make an empty commit: the files it is given have no change', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).commit([STATE], 'desk: record the run')).rejects.toThrow('git commit failed');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
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
    const hook = path.join(dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nenv | grep -E "^(GIT_LITERAL_PATHSPECS|GIT_TERMINAL_PROMPT|LC_ALL)=" | sort > .git/seen-env\n');
    chmodSync(hook, 0o755);
    writePiece(dir);
    await cliFor(dir).commit([NEWS, LEDGER, STATE], 'desk: publish new-piece');
    expect(readFileSync(path.join(dir, '.git/seen-env'), 'utf8').split('\n').filter((line) => line !== '')).toEqual(['GIT_LITERAL_PATHSPECS=1', 'GIT_TERMINAL_PROMPT=0', 'LC_ALL=C']);
  });

  it('says what git said without the line ending that git adds', async () => {
    const dir = scratch();
    write(dir, 'a.txt', 'a\n');
    const cli = new GitCli(dir, { env: { ...ISOLATED, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    const error = (await cli.commit(['a.txt'], 'x').catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/^git status failed: fatal: not a git repository/);
    expect(error.message.endsWith('\n')).toBe(false);
  });

  it('fails with what git said when git cannot run in the folder', async () => {
    const dir = scratch();
    write(dir, 'a.txt', 'a\n');
    const cli = new GitCli(dir, { env: { ...ISOLATED, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    await expect(cli.commit(['a.txt'], 'x')).rejects.toThrow(/git status failed: .*not a git repository/);
  });
});

describe('GitCli.isClean', () => {
  it('is true when none of the paths has a change', async () => {
    const dir = makeRepo();
    expect(await cliFor(dir).isClean([NEWS, LEDGER, STATE])).toBe(true);
  });

  it('is false for a tracked file that was modified, a new file that is not tracked, and a file that is staged', async () => {
    const dir = makeRepo();
    const cli = cliFor(dir);
    write(dir, STATE, '{"changed":true}\n');
    expect(await cli.isClean([STATE])).toBe(false);
    git(dir, 'checkout', '--quiet', STATE);
    write(dir, LEDGER, '{}\n');
    expect(await cli.isClean([LEDGER])).toBe(false);
    git(dir, 'add', LEDGER);
    expect(await cli.isClean([LEDGER])).toBe(false);
  });

  it('looks inside a folder it is given, and only at the paths it is given', async () => {
    const dir = makeRepo();
    const cli = cliFor(dir);
    write(dir, 'site/src/content/ledger/other.json', '{}\n');
    expect(await cli.isClean(['site/src/content/ledger'])).toBe(false);
    expect(await cli.isClean(['site/src/content/news', STATE])).toBe(true);
  });

  it('is false for a file that was deleted and not committed', async () => {
    const dir = makeRepo();
    rmSync(path.join(dir, 'site/src/content/news/older.mdx'));
    expect(await cliFor(dir).isClean(['site/src/content/news'])).toBe(false);
  });

  it('refuses the same paths that commit refuses', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).isClean(['../outside'])).rejects.toThrow('is not inside the repository');
    await expect(cliFor(dir).isClean([])).rejects.toThrow('needs at least one path');
  });
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
    git(dir, 'checkout', '--quiet', '-b', BRANCH);
    await expect(cliFor(dir).deleteBranch(BRANCH)).rejects.toThrow('git branch failed');
    expect(git(dir, 'branch', '--format=%(refname:short)')).toBe(`${BRANCH}\nmain`);
  });

  it('fails for a branch that is not there, and for a name that the Desk does not make', async () => {
    const dir = makeRepo();
    await expect(cliFor(dir).deleteBranch(BRANCH)).rejects.toThrow('not found');
    await expect(cliFor(dir).deleteBranch('--all')).rejects.toThrow('is not a branch name that the Desk makes');
  });
});

describe('FakeGit', () => {
  it('records each commit with its paths and its message, and gives each an id of its own', async () => {
    const fake = new FakeGit();
    const first = await fake.commit(['a', 'b'], 'first');
    const second = await fake.commit(['c'], 'second');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(fake.commits).toEqual([
      { id: first, paths: ['a', 'b'], message: 'first' },
      { id: second, paths: ['c'], message: 'second' },
    ]);
  });

  it('is clean until a path that overlaps one of those it is told are dirty', async () => {
    const fake = new FakeGit();
    expect(await fake.isClean(['site/src/content/news'])).toBe(true);
    fake.dirty.add('site/src/content/news/old.mdx');
    expect(await fake.isClean(['site/src/content/news'])).toBe(false);
    expect(await fake.isClean(['site/src/content/news/old.mdx'])).toBe(false);
    expect(await fake.isClean(['site/src/content/ledger'])).toBe(true);
    expect(await fake.isClean(['site'])).toBe(false);
  });

  it('is dirty for a path inside a folder that is dirty, and for a folder that holds a path that is dirty, whichever of several it overlaps', async () => {
    const fake = new FakeGit();
    fake.dirty.add('site/src/content');
    fake.dirty.add('site/src/data/desk-state.json');
    expect(await fake.isClean(['site/src/content/news/old.mdx'])).toBe(false);
    expect(await fake.isClean(['site/src/data'])).toBe(false);
    expect(await fake.isClean(['site/src/other', 'site/src/content/ledger'])).toBe(false);
    expect(await fake.isClean(['site/src/other', 'README.md'])).toBe(true);
    expect(await fake.isClean(['site/src/content-fixtures'])).toBe(true);
  });

  it('fails the next commit with the error it is given, and records nothing', async () => {
    const fake = new FakeGit();
    fake.failNextCommit = new Error('no space left');
    await expect(fake.commit(['a'], 'x')).rejects.toThrow('no space left');
    expect(fake.commits).toEqual([]);
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
    fake.branch = BRANCH;
    await expect(fake.deleteBranch(BRANCH)).rejects.toThrow('the checkout is on');
    fake.branch = 'main';
    await expect(fake.deleteBranch(BRANCH)).rejects.toThrow('is not there');
  });
});
