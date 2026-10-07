import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli';
import { useScratch } from '../support/context';
import { AUDIT, BRANCH, BUILD, DEPLOY, KEEP, PUSH, RUN, sequence, stepsThat } from '../support/desk-sequence';
import type { Script, SequenceOptions, World } from '../support/desk-sequence';
import { git } from '../support/repo';
import { loadWorkflow, stepNamed } from '../support/workflow';

// A rehearsal of the daily workflow on GitHub, and the switch of the schedule. The first runs of the workflow on GitHub should not be runs that publish: a start by hand with the input
// `dry` runs the Desk with `--dry` (the real sources, the real model, the real bucket, and every artifact written, and nothing published, committed or pushed), builds and audits the site, packs
// the run and keeps the pack, and pushes nothing, opens no pull request and starts no deploy. And the schedule itself does nothing until the variable DESK_SCHEDULE of the repository is `on`,
// so that the workflow can be on the repository, and be rehearsed, long before the day that the Desk is let go. The sequence of the steps is run as in build-before-push.test.ts.

const scratch = useScratch();
const run = (script: Script, options: SequenceOptions = {}): Promise<World> => sequence(scratch, script, options);
const PACK = 'Pack the run, with nothing in it that a model or a page wrote';

describe('desk.yml: a start by hand with dry', () => {
  it('runs the Desk with --dry, and not with --skip-if-done, which is for the starts of a schedule that finds a day done', async () => {
    const world = await run({ desk: 'nothing' }, { inputs: { dry: true } });
    expect(world.flags).toBe('--dry');
    const command = stepNamed(loadWorkflow('desk.yml'), RUN).run!.trim().split('\n').at(-1)!.replace('npm run desk -- ', '').replace('$DESK_FLAGS', world.flags as string).split(' ');
    expect(parseArgs(command)).toEqual({ ok: true, args: { command: 'run', date: undefined, dry: true, client: 'api', sources: 'live', forceNew: false, skipIfDone: false, cassettes: undefined, config: 'desk.config.yml' } });
  });

  it('pushes nothing, opens no pull request and starts no deploy, and keeps the pack of the run: the steps of a run that publishes are skipped, and the two that keep what a run leaves are not', async () => {
    const world = await run({ desk: 'nothing' }, { inputs: { dry: true } });
    expect(world.job.conclusion).toBe('success');
    expect(stepsThat(world, 'skipped')).toEqual([PUSH, BRANCH, DEPLOY]);
    expect(world.job.outcomeOf(RUN)).toBe('success');
    expect(world.job.outcomeOf(BUILD)).toBe('success');
    expect(world.job.outcomeOf(AUDIT)).toBe('success');
    expect(world.job.outcomeOf(PACK)).toBe('success');
    expect(world.job.outcomeOf(KEEP)).toBe('success');
    expect(world.dispatched).toEqual([]);
    expect(world.forge.calls).toEqual([]);
  });

  it('pushes nothing even when the checkout is ahead of main, as a mistake of a stage could leave it: the skip is the condition of the step, and not what the Desk did', async () => {
    const world = await run({ desk: 'commits' }, { inputs: { dry: true } });
    expect(world.job.outcomeOf(PUSH)).toBe('skipped');
    expect(world.origin.remoteHead()).not.toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.dispatched).toEqual([]);
  });

  it('still builds and audits the site, which is what a rehearsal on GitHub is for, and a site that does not build fails the job and opens nothing', async () => {
    const world = await run({ desk: 'nothing', build: 1 }, { inputs: { dry: true } });
    expect(world.job.conclusion).toBe('failure');
    expect(stepsThat(world, 'failure')).toEqual([BUILD]);
    expect(world.job.outcomeOf(BRANCH)).toBe('skipped');
    expect(world.forge.calls).toEqual([]);
    expect(world.job.outcomeOf(KEEP)).toBe('success');
  });

  it('fails the job when the run fails, and keeps the pack all the same, as a run that is not a rehearsal does', async () => {
    const world = await run({ desk: 'fails' }, { inputs: { dry: true } });
    expect(world.job.conclusion).toBe('failure');
    expect(world.job.outcomeOf(RUN)).toBe('failure');
    expect(world.job.outcomeOf(PACK)).toBe('success');
    expect(world.job.outcomeOf(PUSH)).toBe('skipped');
  });
});

describe('desk.yml: a start by hand without dry', () => {
  it('is a run like the starts of the schedule: --skip-if-done, the push and the deploy', async () => {
    for (const inputs of [{}, { dry: false }] as Record<string, boolean>[]) {
      const world = await run({ desk: 'commits' }, { inputs });
      expect(world.flags).toBe('--skip-if-done');
      expect(stepsThat(world, 'skipped')).toEqual([BRANCH]);
      expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
      expect(world.dispatched).toEqual(['gh workflow run deploy.yml --ref main']);
    }
  });
});

describe('desk.yml: the schedule, and the variable that switches it', () => {
  it('does nothing when the variable is not set: the job is skipped, no step runs, nothing is touched', async () => {
    const world = await run({ desk: 'commits' }, { event: 'schedule' });
    expect(world.job.conclusion).toBe('skipped');
    expect(stepsThat(world, 'success')).toEqual([]);
    expect(world.flags).toBeUndefined();
    expect(world.origin.remoteBranches()).toEqual(['main']);
    expect(world.dispatched).toEqual([]);
  });

  it.each(['off', 'ON', 'true', '1', ' on', 'on '])('does nothing when the variable is %j, which is anything but `on`', async (value) => {
    const world = await run({ desk: 'commits' }, { event: 'schedule', vars: { DESK_SCHEDULE: value } });
    // GitHub compares strings without regard to capitals, so `ON` is on; every other value is off.
    expect(world.job.conclusion).toBe(value === 'ON' ? 'success' : 'skipped');
  });

  it('runs as it always did when the variable is on: --skip-if-done, then build, audit, push, pack and deploy', async () => {
    const world = await run({ desk: 'commits' }, { event: 'schedule', vars: { DESK_SCHEDULE: 'on' } });
    expect(world.job.conclusion).toBe('success');
    expect(world.flags).toBe('--skip-if-done');
    expect(world.origin.remoteHead()).toBe(git(world.origin.work, 'rev-parse', 'HEAD'));
    expect(world.dispatched).toEqual(['gh workflow run deploy.yml --ref main']);
  });

  it('runs when it is started by hand, whatever the variable says: a rehearsal needs no switch', async () => {
    const world = await run({ desk: 'nothing' }, { event: 'workflow_dispatch', vars: { DESK_SCHEDULE: 'off' }, inputs: { dry: true } });
    expect(world.job.conclusion).toBe('success');
    expect(stepsThat(world, 'success')).toContain(RUN);
  });

  it('has no input on the schedule, so that the rehearsal flag is false there: it can never start a rehearsal, and never skips the push', async () => {
    const world = await run({ desk: 'commits' }, { event: 'schedule', vars: { DESK_SCHEDULE: 'on' }, inputs: {} });
    expect(world.job.outcomeOf(PUSH)).toBe('success');
  });
});
