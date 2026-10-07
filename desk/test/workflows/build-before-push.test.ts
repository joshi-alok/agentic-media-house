import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../../src/cli';
import type { CliDeps } from '../../src/cli';
import { defaultConfig } from '../../src/config';
import { FakeForge } from '../../src/run/forge';
import { FakeGit } from '../../src/run/git';
import { useScratch } from '../support/context';
import { runJob, wordsOf } from '../support/job';
import type { Executor, JobRun } from '../support/job';
import { makeOrigin } from '../support/origin';
import type { Origin } from '../support/origin';
import { git } from '../support/repo';
import { clock } from '../support/run';
import { loadWorkflow } from '../support/workflow';
import type { Step } from '../support/workflow';

// The whole sequence of desk.yml, from the run of the Desk to the deploy, with the conditions that each step has, and with the real `desk push` over a made-up GitHub (a bare
// repository in a folder and a fake forge) in the steps that push. What the Desk, the build and the audit do is scripted; what is under test is what follows from how each of them
// ends. The rule: what a run committed reaches main only after the site was built with it and its audit passed. A site that does not build, or whose audit fails, ends the sequence
// with main exactly as it was, the commits on a branch of their own, a draft pull request on the branch, no deploy, and a failed job.

const scratch = useScratch();
const workflow = loadWorkflow('desk.yml');

const RUN = 'Run the Desk';
const BUILD = 'Build the site with what the run committed';
const AUDIT = 'Audit the production build';
const PUSH = 'Push what the run committed';
const BRANCH = 'Keep what the run committed on a branch, because the site does not build with it';
const KEEP = 'Keep the artifacts of the run for 14 days';
const DEPLOY = 'Deploy the site';

const FAILING_REPORT = ['Audit of site/dist: 14 pages, 33 files (production build)', '  ok    A1   fine', '  FAIL  A5   a check', '             - pieces/a/index.html: a problem that names a page', '', 'FAILED: 1 problem in 1 of 2 checks.'].join('\n');

interface Script {
  /** What the Desk does: it commits (and ends 0), commits a record of a failure (and ends 1), or makes no commit (a day that is done: 0). */
  desk: 'commits' | 'fails' | 'nothing';
  build?: number;
  audit?: number;
  /** Starts a race: somebody else changes the desk state on origin just before the push to main. */
  race?: boolean;
}

interface World {
  origin: Origin;
  forge: FakeForge;
  dispatched: string[];
  err: string[];
  job: JobRun;
}

async function sequence(script: Script, options: { cancelled?: boolean } = {}): Promise<World> {
  const origin = makeOrigin(scratch());
  const forge = new FakeForge();
  const dispatched: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const cwd = scratch();
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
    const run = step.run ?? '';
    if (run === 'npm ci' || run.startsWith('git config')) return 0;
    if (run.startsWith('npm run desk -- run')) {
      if (script.desk !== 'nothing') origin.commit(origin.work, 'desk-state.json', '{"holds": 1}\n', script.desk === 'fails' ? 'desk: the run failed' : 'desk: published a piece');
      return script.desk === 'fails' ? 1 : 0;
    }
    if (run === 'npm run build') return script.build ?? 0;
    if (run.includes('npm run audit:prod')) {
      const code = script.audit ?? 0;
      writeFileSync(path.join(env.RUNNER_TEMP as string, 'audit.log'), code === 0 ? 'Passed: 18 checks.\n' : FAILING_REPORT);
      return code;
    }
    if (run.startsWith('npm run desk -- ')) return main(wordsOf(run.slice('npm run desk -- '.length), { ...env, GITHUB_RUN_ID: '4711', GITHUB_RUN_ATTEMPT: '1' }), deps);
    if (run.startsWith('gh workflow run')) {
      dispatched.push(run);
      return 0;
    }
    throw new Error(`this test does not know what the step "${step.name}" does`);
  };
  const job = await runJob(workflow, execute, { dir: scratch(), ...(options.cancelled === true ? { cancelled: true } : {}) });
  return { origin, forge, dispatched, err, job };
}

const steps = (world: World, outcome: 'success' | 'failure' | 'skipped'): string[] => world.job.steps.filter((step) => step.outcome === outcome).map((step) => step.name);

describe('desk.yml in sequence: a site that builds and passes its audit', () => {
  it('is pushed to main and deployed, and the commits are not on another branch', async () => {
    const world = await sequence({ desk: 'commits' });
    expect(world.job.conclusion).toBe('success');
    expect(steps(world, 'skipped')).toEqual([BRANCH]);
    expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.forge.calls).toEqual([]);
    expect(world.dispatched).toEqual(['gh workflow run deploy.yml --ref main']);
  });

  it('has nothing to push on a day that is done, builds and audits all the same (it is main itself that they check), and does not deploy', async () => {
    const world = await sequence({ desk: 'nothing' });
    expect(world.job.conclusion).toBe('success');
    expect(world.job.outcomeOf(BUILD)).toBe('success');
    expect(world.job.outcomeOf(AUDIT)).toBe('success');
    expect(world.job.outcomeOf(PUSH)).toBe('success');
    expect(world.job.outcomeOf(DEPLOY)).toBe('skipped');
    expect(world.dispatched).toEqual([]);
  });

  it('pushes the record of a run that failed as well, and the job is red because the run failed', async () => {
    const world = await sequence({ desk: 'fails' });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(RUN)).toBe('failure');
    expect(world.job.outcomeOf(PUSH)).toBe('success');
    expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.dispatched).toHaveLength(1);
  });
});

describe('desk.yml in sequence: a site whose audit fails', () => {
  it('never touches main: the push is skipped, the commits are on desk-build-failed/<day>-<run>, a draft pull request is opened on it, the artifacts are kept, nothing is deployed, and the job fails', async () => {
    const world = await sequence({ desk: 'commits', audit: 1 });
    const before = git(world.origin.remote, 'rev-parse', 'main');
    expect(world.job.conclusion).toBe('failure');
    expect(steps(world, 'failure')).toEqual([AUDIT]);
    expect(steps(world, 'skipped')).toEqual([PUSH, DEPLOY]);
    expect(world.job.outcomeOf(BRANCH)).toBe('success');
    expect(world.job.outcomeOf(KEEP)).toBe('success');
    // Main of the remote is the commit that the checkout started from, and the commit of the run is on the branch.
    expect(before).toBe(git(world.origin.work, 'rev-parse', 'HEAD~1'));
    expect(world.origin.remoteBranches()).toEqual(['desk-build-failed/2026-10-05-4711-1', 'main']);
    expect(git(world.origin.remote, 'rev-parse', 'desk-build-failed/2026-10-05-4711-1')).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.dispatched).toEqual([]);
    expect(world.forge.calls).toHaveLength(1);
    const call = world.forge.calls[0] as { method: string; request: { branch: string; base: string; title: string; body: string } };
    expect(call.method).toBe('openDraftPullRequest');
    expect(call.request).toMatchObject({ branch: 'desk-build-failed/2026-10-05-4711-1', base: 'main' });
    expect(call.request.body).toContain('| Checks that failed | A5 (1 problem) |');
    expect(call.request.body).not.toContain('a problem that names a page');
  });
});

describe('desk.yml in sequence: a site that does not build', () => {
  it('does not audit, does not push to main, and opens the same pull request, saying that the build failed', async () => {
    const world = await sequence({ desk: 'commits', build: 1 });
    expect(world.job.conclusion).toBe('failure');
    expect(steps(world, 'failure')).toEqual([BUILD]);
    expect(steps(world, 'skipped')).toEqual([AUDIT, PUSH, DEPLOY]);
    expect(world.job.outcomeOf(BRANCH)).toBe('success');
    expect(world.origin.remoteHead()).not.toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.origin.remoteBranches()).toEqual(['desk-build-failed/2026-10-05-4711-1', 'main']);
    const request = (world.forge.calls[0] as { request: { body: string } }).request;
    expect(request.body).toContain('| Stopped at | the production build |');
  });

  it('is a failed job and no pull request when the build fails with nothing new from the run: it is main itself that does not build', async () => {
    const world = await sequence({ desk: 'nothing', build: 1 });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(BRANCH)).toBe('failure');
    expect(world.err.join('\n')).toContain('it is main itself that does not build');
    expect(world.forge.calls).toEqual([]);
    expect(world.origin.remoteBranches()).toEqual(['main']);
  });
});

describe('desk.yml in sequence: the push that cannot go to main', () => {
  it('ends the job red, with the commits on the rescue branch and nothing deployed, when somebody changed the desk state on main in the same lines', async () => {
    const world = await sequence({ desk: 'commits', race: true });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(PUSH)).toBe('failure');
    expect(world.job.outcomeOf(DEPLOY)).toBe('skipped');
    expect(world.job.outcomeOf(KEEP)).toBe('success');
    expect(world.origin.remoteBranches()).toEqual(['desk-rescue/2026-10-05-4711-1', 'main']);
    expect(world.err.join('\n')).toContain('the 1 commit of this run is on the branch desk-rescue/2026-10-05-4711-1 of origin');
  });
});

describe('desk.yml in sequence: a workflow that is cancelled', () => {
  it('runs no step of the sequence, and touches nothing', async () => {
    const world = await sequence({ desk: 'commits' }, { cancelled: true });
    expect(steps(world, 'success')).toEqual([]);
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.forge.calls).toEqual([]);
    expect(readFileSync(path.join(world.origin.work, 'desk-state.json'), 'utf8')).toBe('{"holds": 0}\n');
  });
});
