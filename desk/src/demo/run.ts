import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FakeGit, defaultConfig } from '../index';
import { main } from '../cli';
import type { CliDeps } from '../cli';
import { DEMO_DATE } from './world';

// The demo: `npm run desk:demo`. It runs the command `desk run --dry --client fake --sources fixtures`, the whole pipeline from Discover to the end, in the
// made-up world with a scripted model, and then replays the run from what it kept. It succeeds, with exit code 0, only if the run ended published, in a dry run,
// with nothing written: the site is exactly as it was and git was not asked to commit, and only if the replay finds every artifact equal. It is part of
// `npm run verify`, so that a change that breaks the pipeline as a whole, and not any one test of it, stops the check.

export interface DemoDeps {
  out(line: string): void;
  err(line: string): void;
  /** The root of the repository, which the demo reads (the desk state) and never changes. */
  cwd: string;
  now: () => Date;
  /** The folder in which the demo makes its own folder for the run and the evidence. By default the temporary directory of the machine. */
  workDir?: string;
}

/** Every file below `dir` with a hash of what is in it, as lines in order; a folder that is not there has none. */
export async function snapshot(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const lines: string[] = [];
  for (const entry of entries.filter((item) => item.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    lines.push(`${path.relative(dir, file)} ${createHash('sha256').update(await readFile(file)).digest('hex')}`);
  }
  return lines.sort();
}

/**
 * Run the demo and return the exit code: 0 when the run ended published in a dry run, wrote nothing into the site, asked git for nothing and replays equal;
 * 1 otherwise, with what went wrong on the error output. Everything the run printed is printed. The run's own folders are made in `workDir` and removed at the end.
 * `cli` is the command line that is run, which a test replaces to show that the demo notices each way it can go wrong.
 */
export async function runDemo(deps: DemoDeps, cli: (argv: readonly string[], deps: CliDeps) => Promise<number> = main): Promise<number> {
  const watched = [path.join(deps.cwd, 'site/src/content'), path.join(deps.cwd, 'site/src/data')];
  const before = await Promise.all(watched.map(snapshot));
  const work = await mkdtemp(path.join(deps.workDir ?? tmpdir(), 'desk-demo-'));
  try {
    const out: string[] = [];
    const err: string[] = [];
    const git = new FakeGit();
    const cliDeps: CliDeps = {
      out: (line) => void out.push(line),
      err: (line) => void err.push(line),
      env: {},
      cwd: deps.cwd,
      now: deps.now,
      git,
      config: { ...defaultConfig(), runDir: path.join(work, 'runs'), evidenceDir: path.join(work, 'evidence') },
    };
    const code = await cli(['run', '--dry', '--client', 'fake', '--sources', 'fixtures'], cliDeps);
    const run = out.length;
    const replayCode = code === 0 ? await cli(['replay', path.join(work, 'runs', DEMO_DATE), '--sources', 'fixtures'], cliDeps) : 1;
    for (const line of out) deps.out(line);

    const problems: string[] = [];
    if (code !== 0) problems.push(`the run exited with ${code}`);
    if (!out.slice(0, run).includes('outcome: published')) problems.push('the run did not end published');
    if (!out.slice(0, run).some((line) => line.startsWith('dry run: nothing was written'))) problems.push('the run was not a dry run');
    if (git.commits.length > 0) problems.push(`git was asked to commit ${git.commits.length} time(s)`);
    const after = await Promise.all(watched.map(snapshot));
    if (JSON.stringify(after) !== JSON.stringify(before)) problems.push('the site was changed: the content or the desk state is not as it was');
    if (code === 0 && (replayCode !== 0 || !out.slice(run).includes('replay: equal'))) problems.push('the replay of the run did not find every artifact equal');
    for (const line of err) problems.push(`error output: ${line}`);

    if (problems.length > 0) {
      for (const problem of problems) deps.err(`desk demo: ${problem}`);
      return 1;
    }
    deps.out('desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality');
    return 0;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Run as a program, `tsx desk/src/demo/run.ts`: but not when this file is imported, as the tests do.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDemo({ out: (line) => console.log(line), err: (line) => console.error(line), cwd: process.cwd(), now: () => new Date() });
}
