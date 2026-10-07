import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CliDeps } from '../../src/cli';
import { main } from '../../src/cli';
import { runDemo, snapshot } from '../../src/demo/run';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { clock } from '../support/run';
import { useScratch } from '../support/context';

// The demo is the whole pipeline run as one command, in a dry run, and replayed. These tests run it in a made-up checkout of the site, and replace the command that
// it runs with ones that go wrong in each way it must notice, to show that it exits 1 for each.

const scratch = useScratch();

function setup() {
  const cwd = makeSite(scratch());
  const out: string[] = [];
  const err: string[] = [];
  const workDir = scratch();
  return { cwd, out, err, workDir, deps: { out: (line: string) => void out.push(line), err: (line: string) => void err.push(line), cwd, now: clock(), workDir } };
}

const STATE = 'site/src/data/desk-state.json';

describe('runDemo', () => {
  it('runs the made-up story in a dry run, replays it, and exits 0 with a line that says what it showed', async () => {
    const { deps, out, err } = setup();
    expect(await runDemo(deps)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toContain('outcome: published');
    expect(out.some((line) => line.startsWith('dry run: nothing was written to the site or to git'))).toBe(true);
    expect(out).toContain('replay: equal');
    expect(out.at(-1)).toBe('desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality');
  });

  it('writes nothing into the site and removes its own folder when it is done', async () => {
    const { deps, cwd, workDir } = setup();
    const before = filesBelow(cwd);
    await runDemo(deps);
    expect(filesBelow(cwd)).toEqual(before);
    expect(readdirSync(workDir)).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('can be run again at once, since it keeps nothing: the day of the made-up world is not taken', async () => {
    const { deps } = setup();
    expect(await runDemo(deps)).toBe(0);
    expect(await runDemo({ ...deps, now: clock() })).toBe(0);
  });

  it('makes its own folder in the folder it is told to, and not elsewhere', async () => {
    const { deps, workDir } = setup();
    const seen: string[][] = [];
    await runDemo(deps, async (argv, cliDeps) => {
      seen.push(readdirSync(workDir));
      return main(argv, cliDeps);
    });
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]?.[0]).toMatch(/^desk-demo-/);
  });

  it('does not mind the order of the lines of the run: the line that says it was a dry run may come first', async () => {
    const { deps, out, err } = setup();
    const dryFirst = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        cliDeps.out('outcome: published');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, dryFirst)).toBe(0);
    expect(err).toEqual([]);
    expect(out.at(-1)).toContain('desk demo: ok');
  });

  it('exits 1 and says so when the run does not end published', async () => {
    const { deps, err } = setup();
    const held = async (_argv: readonly string[], cliDeps: CliDeps) => {
      cliDeps.out('outcome: held');
      return 0;
    };
    expect(await runDemo(deps, held)).toBe(1);
    expect(err).toContain('desk demo: the run did not end published');
    expect(err).toContain('desk demo: the run was not a dry run');
  });

  it('exits 1 when the command exits with a code that is not 0, and does not replay', async () => {
    const { deps, err, out } = setup();
    const calls: string[] = [];
    const failing = async (argv: readonly string[]) => {
      calls.push(argv[0] as string);
      return 1;
    };
    expect(await runDemo(deps, failing)).toBe(1);
    expect(calls).toEqual(['run']);
    expect(err).toContain('desk demo: the run exited with 1');
    expect(out).toEqual([]);
  });

  it('exits 1 when git is asked to commit, and when the run does not say that it was dry', async () => {
    const { deps, err } = setup();
    const committing = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('commit: abc');
        await cliDeps.git.commit([STATE], 'x');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, committing)).toBe(1);
    expect(err).toEqual(['desk demo: the run was not a dry run', 'desk demo: git was asked to commit 1 time(s)']);
  });

  it('exits 1 when anything in the site is changed, a new piece or the desk state', async () => {
    for (const change of [(cwd: string) => writeFileSync(path.join(cwd, 'site/src/content/news/a-piece.mdx'), 'x'), (cwd: string) => writeFileSync(path.join(cwd, STATE), `${COMMITTED_STATE} `)]) {
      const { deps, err, cwd } = setup();
      const writing = async (_argv: readonly string[], cliDeps: CliDeps) => {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        change(cwd);
        return 0;
      };
      expect(await runDemo(deps, writing)).toBe(1);
      expect(err).toContain('desk demo: the site was changed: the content or the desk state is not as it was');
    }
  });

  it('exits 1 when the replay does not find every artifact equal, or exits with a code that is not 0', async () => {
    const { deps, err } = setup();
    const differing = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        return 0;
      }
      cliDeps.out('replay: not equal');
      return 1;
    };
    expect(await runDemo(deps, differing)).toBe(1);
    expect(err).toContain('desk demo: the replay of the run did not find every artifact equal');
    const silent = setup();
    const quiet = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
      }
      return 0;
    };
    expect(await runDemo(silent.deps, quiet)).toBe(1);
    expect(silent.err).toContain('desk demo: the replay of the run did not find every artifact equal');
  });

  it('exits 1 when the command printed anything on the error output, because that is where its complaints go', async () => {
    const { deps, err } = setup();
    const complaining = async (argv: readonly string[], cliDeps: CliDeps) => {
      if (argv[0] === 'run') {
        cliDeps.out('outcome: published');
        cliDeps.out('dry run: nothing was written to the site or to git (3 files would have been)');
        cliDeps.err('a warning');
      } else cliDeps.out('replay: equal');
      return 0;
    };
    expect(await runDemo(deps, complaining)).toBe(1);
    expect(err).toEqual(['desk demo: error output: a warning']);
  });

  it('removes its folder when the command throws, and lets the error out', async () => {
    const { deps, workDir } = setup();
    await expect(
      runDemo(deps, async () => {
        throw new Error('the command broke');
      }),
    ).rejects.toThrow('the command broke');
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('runs the same command as the one the owner types: the real command line, with the made-up world and the scripted story, dry', async () => {
    const seen: (readonly string[])[] = [];
    const { deps } = setup();
    await runDemo(deps, async (argv, cliDeps) => {
      seen.push(argv);
      return main(argv, cliDeps);
    });
    expect(seen[0]).toEqual(['run', '--dry', '--client', 'fake', '--sources', 'fixtures']);
    expect(seen[1]?.[0]).toBe('replay');
    expect(seen[1]?.slice(2)).toEqual([]);
  });
});

describe('snapshot', () => {
  it('lists every file below a folder, with a hash of what is in it, in order, whatever order the files were made in', async () => {
    const dir = scratch();
    mkdirSync(path.join(dir, 'b'));
    writeFileSync(path.join(dir, 'b', 'two.txt'), 'two');
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
    expect(await snapshot(dir)).toEqual([`a.txt ${hash('one')}`, `${path.join('b', 'two.txt')} ${hash('two')}`]);
  });

  it('changes when a file is changed, added or removed, and not otherwise', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    const before = await snapshot(dir);
    expect(await snapshot(dir)).toEqual(before);
    writeFileSync(path.join(dir, 'a.txt'), 'two');
    expect(await snapshot(dir)).not.toEqual(before);
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    writeFileSync(path.join(dir, 'b.txt'), 'x');
    expect((await snapshot(dir)).length).toBe(2);
  });

  it('has nothing for a folder that is not there, and fails for any other trouble with a folder', async () => {
    expect(await snapshot(path.join(scratch(), 'nowhere'))).toEqual([]);
    const file = path.join(scratch(), 'file.txt');
    writeFileSync(file, 'x');
    await expect(snapshot(file)).rejects.toThrow();
  });
});

describe('the program', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('runs when it is started as a program, with the real repository as its folder, and exits with 0 after printing that it is ok', () => {
    const run = spawnSync('npx', ['tsx', 'desk/src/demo/run.ts'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('outcome: published');
    expect(run.stdout).toContain('desk demo: ok');
    expect(run.stderr).toBe('');
  }, 60_000);

  it('does nothing when it is only imported', () => {
    const run = spawnSync('npx', ['tsx', '--eval', "import('./desk/src/demo/run.ts').then((module) => console.log(typeof module.runDemo))"], { cwd: root, encoding: 'utf8' });
    expect(run.stdout.trim()).toBe('function');
  }, 60_000);
});
