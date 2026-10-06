import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { useScratch } from '../support/context';

// The Desk commits only what it wrote, only the files it names, and only into a repository that has nothing else of the Desk's in the way.
// The tests of `GitCli` run the real `git` in a repository that each test makes for itself in a temporary folder: nothing leaves the
// machine, and nothing is ever pushed.

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
});
