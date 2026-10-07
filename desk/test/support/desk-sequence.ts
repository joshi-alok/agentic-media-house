import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../../src/cli';
import type { CliDeps } from '../../src/cli';
import { defaultConfig } from '../../src/config';
import { FakeForge } from '../../src/run/forge';
import { FakeGit } from '../../src/run/git';
import { runJob, wordsOf } from './job';
import type { Executor, JobRun } from './job';
import { makeOrigin } from './origin';
import type { Origin } from './origin';
import { git } from './repo';
import { clock } from './run';
import { loadWorkflow } from './workflow';
import type { Step } from './workflow';

// The sequence of desk.yml as a test runs it: the steps of the job in order with the conditions that each has (`runJob`), with the real `desk push` over a made-up GitHub (a bare repository
// in a folder and a fake forge) in the steps that push and `desk pack-artifact` in the step that packs. What the Desk, the build and the audit do is scripted; what is under test is what
// follows from how each of them ends and from what started the workflow.

const workflow = loadWorkflow('desk.yml');

export const RUN = 'Run the Desk';
export const BUILD = 'Build the site with what the run committed';
export const AUDIT = 'Audit the production build';
export const PUSH = 'Push what the run committed';
export const BRANCH = 'Keep what the run committed on a branch, because the site does not build with it';
export const KEEP = 'Keep the artifacts of the run for 14 days';
export const DEPLOY = 'Deploy the site';

export const FAILING_REPORT = ['Audit of site/dist: 14 pages, 33 files (production build)', '  ok    A1   fine', '  FAIL  A5   a check', '             - pieces/a/index.html: a problem that names a page', '', 'FAILED: 1 problem in 1 of 2 checks.'].join('\n');

export interface Script {
  /** What the Desk does: it commits (and ends 0), commits a record of a failure (and ends 1), or makes no commit (a day that is done: 0). */
  desk: 'commits' | 'fails' | 'nothing';
  build?: number;
  audit?: number;
  /** Starts a race: somebody else changes the desk state on origin just before the push to main. */
  race?: boolean;
}

export interface World {
  origin: Origin;
  forge: FakeForge;
  dispatched: string[];
  err: string[];
  job: JobRun;
  /** The `DESK_FLAGS` that the step that runs the Desk was given, the flag or flags that its command ends with. */
  flags: string | undefined;
}

export interface SequenceOptions {
  cancelled?: boolean;
  /** What started the workflow: `schedule` or `workflow_dispatch` (the default). */
  event?: string;
  /** The inputs of a start by hand. */
  inputs?: Record<string, string | boolean>;
  /** The variables of the repository. */
  vars?: Record<string, string>;
}

export async function sequence(scratch: () => string, script: Script, options: SequenceOptions = {}): Promise<World> {
  const origin = makeOrigin(scratch());
  const forge = new FakeForge();
  const dispatched: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const cwd = scratch();
  let flags: string | undefined;
  const pushGit: CliDeps['pushGit'] = async (args) => {
    if (script.race === true && args[0] === 'push' && args.includes('HEAD:main')) {
      git(origin.other, 'pull', '--quiet', '--ff-only');
      origin.commit(origin.other, 'desk-state.json', '{"holds": 2}\n', 'someone else');
      git(origin.other, 'push', '--quiet', 'origin', 'main');
    }
    return origin.run(args);
  };
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git: new FakeGit(), config: defaultConfig(), pushGit, forge };
  const execute: Executor = async (step: Step, env) => {
    if (step.uses !== undefined) return 0;
    // A step that pushes starts by giving git its credential (a line of the same words in each of them); what it does is what follows.
    const run = (step.run ?? '').trim().split('\n').filter((line) => line !== '. .github/scripts/github-auth.sh').join('\n');
    if (run === 'npm ci' || run.startsWith('git config')) return 0;
    if (run.startsWith('npm run desk -- run')) {
      flags = env.DESK_FLAGS;
      if (script.desk !== 'nothing') origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', script.desk === 'fails' ? 'desk: the run failed' : 'desk: published a piece');
      return script.desk === 'fails' ? 1 : 0;
    }
    if (run === 'npm run build') return script.build ?? 0;
    if (run.includes('npm run audit:prod')) {
      const code = script.audit ?? 0;
      writeFileSync(path.join(env.RUNNER_TEMP as string, 'audit.log'), code === 0 ? 'Passed: 18 checks.\n' : FAILING_REPORT);
      return code;
    }
    if (run.startsWith('npm run desk -- ')) return main(wordsOf(run.slice('npm run desk -- '.length).replace('$(date -u +%F)', '2026-10-05'), { ...env, GITHUB_RUN_ID: '4711', GITHUB_RUN_ATTEMPT: '1' }), deps);
    if (run.startsWith('gh workflow run')) {
      dispatched.push(run);
      return 0;
    }
    throw new Error(`this test does not know what the step "${step.name}" does`);
  };
  const job = await runJob(workflow, execute, {
    dir: scratch(),
    ...(options.cancelled === true ? { cancelled: true } : {}),
    ...(options.event === undefined ? {} : { event: options.event }),
    ...(options.inputs === undefined ? {} : { inputs: options.inputs }),
    ...(options.vars === undefined ? {} : { vars: options.vars }),
  });
  return { origin, forge, dispatched, err, job, flags };
}

/** The names of the steps that ended as `outcome` says. */
export const stepsThat = (world: World, outcome: 'success' | 'failure' | 'skipped'): string[] => world.job.steps.filter((step) => step.outcome === outcome).map((step) => step.name);
