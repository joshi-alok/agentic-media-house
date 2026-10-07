import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useScratch } from '../support/context';
import { AUDIT, BRANCH, BUILD, DEPLOY, KEEP, PUSH, RUN, sequence, stepsThat } from '../support/desk-sequence';
import type { Script, SequenceOptions, World } from '../support/desk-sequence';
import { git } from '../support/repo';

// The whole sequence of desk.yml, from the run of the Desk to the deploy, with the conditions that each step has, and with the real `desk push` over a made-up GitHub (a bare
// repository in a folder and a fake forge) in the steps that push. What the Desk, the build and the audit do is scripted; what is under test is what follows from how each of them
// ends. The rule: what a run committed reaches main only after the site was built with it and its audit passed. A site that does not build, or whose audit fails, ends the sequence
// with main exactly as it was, the commits on a branch of their own, a draft pull request on the branch, no deploy, and a failed job.

const scratch = useScratch();

/** The sequence of desk.yml in a made-up repository of its own (see test/support/desk-sequence.ts). */
const run = (script: Script, options: SequenceOptions = {}): Promise<World> => sequence(scratch, script, options);

describe('desk.yml in sequence: a site that builds and passes its audit', () => {
  it('is pushed to main and deployed, and the commits are not on another branch', async () => {
    const world = await run({ desk: 'commits' });
    expect(world.job.conclusion).toBe('success');
    expect(stepsThat(world, 'skipped')).toEqual([BRANCH]);
    expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.forge.calls).toEqual([]);
    expect(world.dispatched).toEqual(['gh workflow run deploy.yml --ref main']);
  });

  it('has nothing to push on a day that is done, builds and audits all the same (it is main itself that they check), and does not deploy', async () => {
    const world = await run({ desk: 'nothing' });
    expect(world.job.conclusion).toBe('success');
    expect(world.job.outcomeOf(BUILD)).toBe('success');
    expect(world.job.outcomeOf(AUDIT)).toBe('success');
    expect(world.job.outcomeOf(PUSH)).toBe('success');
    expect(world.job.outcomeOf(DEPLOY)).toBe('skipped');
    expect(world.dispatched).toEqual([]);
  });

  it('pushes the record of a run that failed as well, and the job is red because the run failed', async () => {
    const world = await run({ desk: 'fails' });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(RUN)).toBe('failure');
    expect(world.job.outcomeOf(PUSH)).toBe('success');
    expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.dispatched).toHaveLength(1);
  });
});

describe('desk.yml in sequence: a site whose audit fails', () => {
  it('never touches main: the push is skipped, the commits are on desk-build-failed/<day>-<run>, a draft pull request is opened on it, the artifacts are kept, nothing is deployed, and the job fails', async () => {
    const world = await run({ desk: 'commits', audit: 1 });
    const before = git(world.origin.remote, 'rev-parse', 'main');
    expect(world.job.conclusion).toBe('failure');
    expect(stepsThat(world, 'failure')).toEqual([AUDIT]);
    expect(stepsThat(world, 'skipped')).toEqual([PUSH, DEPLOY]);
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
    const world = await run({ desk: 'commits', build: 1 });
    expect(world.job.conclusion).toBe('failure');
    expect(stepsThat(world, 'failure')).toEqual([BUILD]);
    expect(stepsThat(world, 'skipped')).toEqual([AUDIT, PUSH, DEPLOY]);
    expect(world.job.outcomeOf(BRANCH)).toBe('success');
    expect(world.origin.remoteHead()).not.toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.origin.remoteBranches()).toEqual(['desk-build-failed/2026-10-05-4711-1', 'main']);
    const request = (world.forge.calls[0] as { request: { body: string } }).request;
    expect(request.body).toContain('| Stopped at | the production build |');
  });

  it('is a failed job and no pull request when the build fails with nothing new from the run: it is main itself that does not build', async () => {
    const world = await run({ desk: 'nothing', build: 1 });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(BRANCH)).toBe('failure');
    expect(world.err.join('\n')).toContain('it is main itself that does not build');
    expect(world.forge.calls).toEqual([]);
    expect(world.origin.remoteBranches()).toEqual(['main']);
  });
});

describe('desk.yml in sequence: the push that cannot go to main', () => {
  it('ends the job red, with the commits on the rescue branch and nothing deployed, when somebody changed the desk state on main in the same lines', async () => {
    const world = await run({ desk: 'commits', race: true });
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
    const world = await run({ desk: 'commits' }, { cancelled: true });
    expect(stepsThat(world, 'success')).toEqual([]);
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.forge.calls).toEqual([]);
    expect(readFileSync(path.join(world.origin.work, 'desk-state.json'), 'utf8')).toBe('{"holds": 0}\n');
  });
});
