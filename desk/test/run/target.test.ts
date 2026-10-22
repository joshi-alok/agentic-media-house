import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addHold, readDeskState, recordRun } from '../../src/run/desk-state';
import type { LastRun } from '../../src/run/desk-state';
import { COMMIT_TRAILER, FakeGit, GitCli } from '../../src/run/git';
import { DryTarget, SiteTarget, isPlainSlug, sitePaths } from '../../src/run/target';
import type { TargetChange } from '../../src/run/target';
import { useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// A target is where a run puts what it made: the files of a piece and the desk state, in the checkout of the site, committed in one
// commit. `SiteTarget` does it; `DryTarget` goes through the same checks and writes nothing. Both refuse before they write, and the first,
// if the commit fails, puts everything back.

const scratch = useScratch();

const NEWS = 'site/src/content/news/fixture-piece.mdx';
const LEDGER = 'site/src/content/ledger/fixture-piece.json';
const STATE = 'site/src/data/desk-state.json';

const RUN: LastRun = { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'fixture-piece' };
const PIECE = { slug: 'fixture-piece', mdx: '---\ntitle: "A piece"\n---\n\nThe body.\n', ledger: '{\n  "slug": "fixture-piece"\n}\n' };

/** A change that publishes `PIECE` and records the run. */
const publishing = (overrides: Partial<TargetChange> = {}): TargetChange => ({ piece: PIECE, state: (state) => recordRun(state, RUN), message: 'desk: publish fixture-piece', ...overrides });

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** A site in a new folder, and a fake git for it. */
function setup() {
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { repoDir, git, target: new SiteTarget(repoDir, git) };
}

describe('sitePaths', () => {
  it('names the folders and the file of the site, below the folder of the site', () => {
    const paths = sitePaths();
    expect(paths.newsDir).toBe('site/src/content/news');
    expect(paths.ledgerDir).toBe('site/src/content/ledger');
    expect(paths.stateFile).toBe(STATE);
    expect(paths.newsFile('fixture-piece')).toBe(NEWS);
    expect(paths.ledgerFile('fixture-piece')).toBe(LEDGER);
    expect(sitePaths('web').stateFile).toBe('web/src/data/desk-state.json');
  });
});

describe('isPlainSlug', () => {
  it('accepts lowercase letters and digits joined by single hyphens', () => {
    for (const slug of ['a', '7', 'fx-1', 'fixture-robotics-ships-fx-1-to-second-plant', '2026-10-05']) expect(isPlainSlug(slug), slug).toBe(true);
  });

  it('refuses anything else: capitals, spaces, dots, slashes, a hyphen at either end or twice, and nothing', () => {
    for (const slug of ['', 'A', 'a b', 'a.b', 'a/b', '../a', '-a', 'a-', 'a--b', 'a_b', `caf${String.fromCharCode(0xe9)}`]) expect(isPlainSlug(slug), slug).toBe(false);
  });
});

describe('SiteTarget.apply', () => {
  it('writes the piece and the ledger exactly as given, changes the desk state, and commits the three files with the message', async () => {
    const { repoDir, git, target } = setup();
    const result = await target.apply(publishing());
    expect(read(repoDir, NEWS)).toBe(PIECE.mdx);
    expect(read(repoDir, LEDGER)).toBe(PIECE.ledger);
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun).toEqual(RUN);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0]).toEqual({ id: result.commit, paths: [NEWS, LEDGER, STATE], message: 'desk: publish fixture-piece' });
    expect(result).toEqual({ commit: git.commits[0]?.id, files: [NEWS, LEDGER, STATE] });
    expect(target.dry).toBe(false);
  });

  it('with no piece, changes only the desk state and commits only it', async () => {
    const { repoDir, git, target } = setup();
    const before = filesBelow(repoDir);
    const result = await target.apply({ state: (state) => recordRun(state, { ...RUN, outcome: 'no-story', slug: null }), message: 'desk: no story' });
    expect(filesBelow(repoDir)).toEqual(before);
    expect((await readDeskState(path.join(repoDir, STATE))).lastRun?.outcome).toBe('no-story');
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(result.files).toEqual([STATE]);
  });

  it('asks git whether the state and the two content folders are clean before it writes anything, and refuses when they are not', async () => {
    for (const dirty of [STATE, 'site/src/content/news/older.mdx', 'site/src/content/ledger/older.json']) {
      const { repoDir, git, target } = setup();
      git.dirty.add(dirty);
      await expect(target.apply(publishing())).rejects.toThrow(`has changes that are not committed (${sitePaths().stateFile}, ${sitePaths().newsDir}, ${sitePaths().ledgerDir})`);
      expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
      expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
      expect(git.commits).toEqual([]);
    }
  });

  it('with no piece, asks about the state file alone: a stray piece of an earlier run does not stop a record of a run', async () => {
    const { git, target } = setup();
    git.dirty.add('site/src/content/news/older.mdx');
    await expect(target.apply({ state: (state) => recordRun(state, RUN), message: 'desk: record' })).resolves.toMatchObject({ files: [STATE] });
    git.dirty.add(STATE);
    await expect(target.apply({ state: (state) => recordRun(state, RUN), message: 'desk: record' })).rejects.toThrow(`has changes that are not committed (${STATE})`);
  });

  it('never overwrites a piece or a ledger that is there: the slug is taken, and nothing is changed', async () => {
    for (const taken of [NEWS, LEDGER]) {
      const { repoDir, git, target } = setup();
      writeFileSync(path.join(repoDir, taken), 'already published\n');
      await expect(target.apply(publishing())).rejects.toThrow(`${taken} is already there, so the slug "fixture-piece" is taken`);
      expect(read(repoDir, taken)).toBe('already published\n');
      expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
      expect(git.commits).toEqual([]);
    }
  });

  it('refuses a slug that is not a plain slug, because the slug is a file name', async () => {
    for (const slug of ['../outside', 'Upper-Case', 'two words', 'a/b', '', '-leading', 'double--hyphen']) {
      const { git, target } = setup();
      await expect(target.apply(publishing({ piece: { ...PIECE, slug } }))).rejects.toThrow('is not a plain slug');
      expect(git.commits).toEqual([]);
    }
  });

  it('fails closed on a desk state that cannot be read: nothing is written', async () => {
    const { repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    await expect(target.apply(publishing())).rejects.toThrow('is not valid JSON');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe('{"lastRun": ');
    expect(git.commits).toEqual([]);
  });

  it('refuses a change of the state that would lose a hold: nothing is written', async () => {
    const { repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify({ lastRun: null, holds: [{ at: '2026-10-04T04:30:00.000Z', categories: [], reasons: ['G2_BODY_LENGTH'] }], corrections: [] })}\n`);
    const before = read(repoDir, STATE);
    await expect(target.apply(publishing({ state: (state: DeskState) => ({ ...state, holds: [] }) }))).rejects.toThrow('never loses a hold');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(read(repoDir, STATE)).toBe(before);
    expect(git.commits).toEqual([]);
  });

  it('puts everything back when the commit fails: the new files are removed and the desk state is what it was, byte for byte', async () => {
    const { repoDir, git, target } = setup();
    git.failNextCommit = new Error('git commit failed: disk full');
    await expect(target.apply(publishing())).rejects.toThrow('disk full');
    expect(existsSync(path.join(repoDir, NEWS))).toBe(false);
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    // And the next try is not in the way of itself.
    await expect(target.apply(publishing())).resolves.toMatchObject({ files: [NEWS, LEDGER, STATE] });
  });

  it('keeps the holds that are there when it records a hold', async () => {
    const { repoDir, target } = setup();
    const hold = { at: '2026-10-05T04:32:00.000Z', categories: ['payments-commerce'], reasons: ['TIER2_ATTRIBUTION'] };
    await target.apply({ state: (state) => addHold(state, hold), message: 'desk: hold 1' });
    await target.apply({ state: (state) => addHold(state, { ...hold, reasons: ['G4_NUMBER_UNSUPPORTED'] }), message: 'desk: hold 2' });
    expect((await readDeskState(path.join(repoDir, STATE))).holds.map((item) => item.reasons)).toEqual([['TIER2_ATTRIBUTION'], ['G4_NUMBER_UNSUPPORTED']]);
  });
});

describe('SiteTarget.preflight', () => {
  it('passes when the desk state can be read and the state and the two content folders are clean', async () => {
    const { target } = setup();
    await expect(target.preflight()).resolves.toBeUndefined();
  });

  it('refuses, naming the three places, when any of them has a change that is not committed', async () => {
    for (const dirty of [STATE, 'site/src/content/news/older.mdx', 'site/src/content/ledger/older.json']) {
      const { git, target } = setup();
      git.dirty.add(dirty);
      await expect(target.preflight()).rejects.toThrow(`has changes that are not committed (${STATE}, site/src/content/news, site/src/content/ledger)`);
    }
  });

  it('refuses a desk state that cannot be read, before it asks git', async () => {
    const { repoDir, target } = setup();
    writeFileSync(path.join(repoDir, STATE), 'nonsense');
    await expect(target.preflight()).rejects.toThrow('is not valid JSON');
  });

  it('writes nothing and commits nothing', async () => {
    const { repoDir, git, target } = setup();
    const before = filesBelow(repoDir);
    await target.preflight();
    expect(filesBelow(repoDir)).toEqual(before);
    expect(git.commits).toEqual([]);
  });
});

describe('SiteTarget.apply with the real git', () => {
  const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...ISOLATED } }).trim();

  function repo(): string {
    const dir = makeSite(scratch());
    git(dir, 'init', '--quiet', '-b', 'main');
    git(dir, 'config', 'user.name', 'Test Committer');
    git(dir, 'config', 'user.email', 'committer@example.com');
    git(dir, 'config', 'commit.gpgsign', 'false');
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'start');
    return dir;
  }

  it('makes one commit with the three files and the trailer, and leaves the checkout clean', async () => {
    const dir = repo();
    const result = await new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing());
    expect(result.commit).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([LEDGER, NEWS, STATE]);
    expect(git(dir, 'log', '-1', '--format=%B')).toBe(`desk: publish fixture-piece\n\n${COMMIT_TRAILER}`);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('refuses when the desk state has a change that is not committed, and changes nothing', async () => {
    const dir = repo();
    writeFileSync(path.join(dir, STATE), '{"lastRun":null,"holds":[],"corrections":[]} \n');
    await expect(new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing())).rejects.toThrow('has changes that are not committed');
    expect(git(dir, 'log', '--format=%s')).toBe('start');
    expect(existsSync(path.join(dir, NEWS))).toBe(false);
  });

  it('puts the checkout back when git refuses the commit (something else is staged)', async () => {
    const dir = repo();
    writeFileSync(path.join(dir, 'elsewhere.txt'), 'staged\n');
    git(dir, 'add', 'elsewhere.txt');
    await expect(new SiteTarget(dir, new GitCli(dir, { env: ISOLATED })).apply(publishing())).rejects.toThrow('elsewhere.txt');
    expect(existsSync(path.join(dir, NEWS))).toBe(false);
    expect(read(dir, STATE)).toBe(COMMITTED_STATE);
    expect(git(dir, 'log', '--format=%s')).toBe('start');
  });
});

describe('DryTarget.preflight', () => {
  it('passes when the desk state can be read, and does not ask git, so a dirty checkout does not stop a dry run', async () => {
    const repoDir = makeSite(scratch());
    await expect(new DryTarget(repoDir).preflight()).resolves.toBeUndefined();
  });

  it('refuses a desk state that cannot be read, or that is not there', async () => {
    const repoDir = makeSite(scratch());
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    await expect(new DryTarget(repoDir).preflight()).rejects.toThrow('is not valid JSON');
    rmSync(path.join(repoDir, STATE));
    await expect(new DryTarget(repoDir).preflight()).rejects.toThrow('does not exist');
  });
});

describe('DryTarget.apply', () => {
  it('writes nothing: the folders and the desk state are as they were', async () => {
    const repoDir = makeSite(scratch());
    const before = filesBelow(repoDir);
    const target = new DryTarget(repoDir);
    const result = await target.apply(publishing());
    expect(filesBelow(repoDir)).toEqual(before);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(target.dry).toBe(true);
    expect(result).toEqual({ commit: null, files: [NEWS, LEDGER, STATE] });
  });

  it('says which files it would have written, as the site target does, with no piece too', async () => {
    const repoDir = makeSite(scratch());
    expect((await new DryTarget(repoDir).apply({ state: (state) => state, message: 'x' })).files).toEqual([STATE]);
  });

  it('refuses what the site target refuses before it writes: a slug that is taken, a slug that is not plain, a desk state that cannot be read, a change that loses a hold', async () => {
    const repoDir = makeSite(scratch());
    const target = new DryTarget(repoDir);
    await expect(target.apply(publishing({ piece: { ...PIECE, slug: '../x' } }))).rejects.toThrow('is not a plain slug');
    writeFileSync(path.join(repoDir, LEDGER), 'taken\n');
    await expect(target.apply(publishing())).rejects.toThrow('is already there');
    rmSync(path.join(repoDir, LEDGER));
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify({ lastRun: null, holds: [{ at: '2026-10-04T04:30:00.000Z', categories: [], reasons: ['x'] }], corrections: [] })}\n`);
    await expect(target.apply(publishing({ state: (state: DeskState) => ({ ...state, holds: [] }) }))).rejects.toThrow('never loses a hold');
    writeFileSync(path.join(repoDir, STATE), 'nonsense');
    await expect(target.apply(publishing())).rejects.toThrow('is not valid JSON');
  });

  it('needs the folders of a site: in a folder that is not one it fails, as a run in the wrong place should', async () => {
    const empty = scratch();
    mkdirSync(path.join(empty, 'site'), { recursive: true });
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

