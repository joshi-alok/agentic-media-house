import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useScratch } from '../support/context';
import { runJob, wordsOf } from '../support/job';
import type { Executor } from '../support/job';
import type { Step, Workflow } from '../support/workflow';

// The little interpreter of jobs that the tests of the sequence of a workflow use. It has to be right, or the tests that rely on it would say the wrong thing: so it is tested on its
// own, with workflows made up for the purpose.

const scratch = useScratch();

const jobOf = (steps: Step[]): Workflow => ({ name: 'made up', on: {}, jobs: { only: { 'runs-on': 'ubuntu-latest', steps } } });

/** Run a job whose steps end as `codes` says (by id), and say which steps ran and how. */
async function ran(steps: Step[], codes: Record<string, number>, options: { cancelled?: boolean; inputs?: Record<string, string | boolean>; write?: Record<string, string> } = {}) {
  const execute: Executor = async (step, env) => {
    const line = options.write?.[step.id ?? ''];
    if (line !== undefined) appendFileSync(env.GITHUB_OUTPUT as string, line);
    return codes[step.id ?? ''] ?? 0;
  };
  const job = await runJob(jobOf(steps), execute, { dir: scratch(), ...options });
  return { job, outcomes: Object.fromEntries(job.steps.map((step) => [step.id ?? step.name, step.outcome])) };
}

describe('runJob: the conditions of the steps', () => {
  it('runs a step with no condition only when every step before it succeeded, and skips the ones after a failure', async () => {
    const { job, outcomes } = await ran([{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }], { b: 1 });
    expect(outcomes).toEqual({ a: 'success', b: 'failure', c: 'skipped' });
    expect(job.conclusion).toBe('failure');
  });

  it('runs a step that has `!cancelled()` after a failure, and `failure()` only after one, and `always()` always', async () => {
    const steps: Step[] = [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b', if: '${{ !cancelled() }}' },
      { id: 'c', name: 'c', if: '${{ failure() }}' },
      { id: 'd', name: 'd', if: 'always()' },
    ];
    expect((await ran(steps, { a: 1 })).outcomes).toEqual({ a: 'failure', b: 'success', c: 'success', d: 'success' });
    expect((await ran(steps, {})).outcomes).toEqual({ a: 'success', b: 'success', c: 'skipped', d: 'success' });
  });

  it('adds success() to a condition that has no function that checks the status, as GitHub does', async () => {
    const steps: Step[] = [{ id: 'a', name: 'a' }, { id: 'b', name: 'b', if: "${{ steps.a.outcome == 'failure' }}" }];
    expect((await ran(steps, { a: 1 })).outcomes.b).toBe('skipped');
  });

  it('reads the outcome and the conclusion of an earlier step, and what it wrote to its outputs', async () => {
    const steps: Step[] = [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b', if: "${{ !cancelled() && steps.a.conclusion == 'success' && steps.a.outputs.pushed == 'true' }}" },
      { id: 'c', name: 'c', if: "${{ !cancelled() && steps.a.outputs.pushed != 'true' }}" },
    ];
    expect((await ran(steps, {}, { write: { a: 'pushed=true\n' } })).outcomes).toEqual({ a: 'success', b: 'success', c: 'skipped' });
    expect((await ran(steps, {}, { write: { a: 'pushed=false\n' } })).outcomes).toEqual({ a: 'success', b: 'skipped', c: 'success' });
    expect((await ran(steps, {})).outcomes).toEqual({ a: 'success', b: 'skipped', c: 'success' });
  });

  it('puts `&&` above `||`, brackets above both, and `!` on what follows it', async () => {
    const steps: Step[] = [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b', if: "${{ !cancelled() && (steps.a.outcome == 'failure' || steps.a.outcome == 'success') }}" },
      { id: 'c', name: 'c', if: "${{ !cancelled() && steps.a.outcome == 'failure' || steps.a.outcome == 'success' }}" },
      { id: 'd', name: 'd', if: "${{ !cancelled() && !(steps.a.outcome == 'success') }}" },
    ];
    expect((await ran(steps, {})).outcomes).toEqual({ a: 'success', b: 'success', c: 'success', d: 'skipped' });
  });

  it('compares strings without regard to capitals, and reads the inputs of a start by hand, a boolean as true or false', async () => {
    const steps: Step[] = [
      { id: 'a', name: 'a', if: "${{ inputs.dry == false }}" },
      { id: 'b', name: 'b', if: "${{ inputs.dry == true }}" },
      { id: 'c', name: 'c', if: "${{ inputs.mode == 'FAST' }}" },
    ];
    expect((await ran(steps, {}, { inputs: { dry: true, mode: 'fast' } })).outcomes).toEqual({ a: 'skipped', b: 'success', c: 'success' });
    expect((await ran(steps, {}, { inputs: { dry: false } })).outcomes).toEqual({ a: 'success', b: 'skipped', c: 'skipped' });
  });

  it('treats an input that is not there as false and an empty string as false', async () => {
    const steps: Step[] = [{ id: 'a', name: 'a', if: '${{ !inputs.dry }}' }, { id: 'b', name: 'b', if: "${{ !'' }}" }];
    expect((await ran(steps, {})).outcomes).toEqual({ a: 'success', b: 'success' });
  });

  it('runs nothing when the workflow was cancelled, not even a step with no condition', async () => {
    const { outcomes } = await ran([{ id: 'a', name: 'a' }, { id: 'b', name: 'b', if: '${{ !cancelled() }}' }, { id: 'c', name: 'c', if: '${{ cancelled() }}' }], {}, { cancelled: true });
    expect(outcomes).toEqual({ a: 'skipped', b: 'skipped', c: 'success' });
  });

  it('says which step ended how, by name, and is an error for a name that is not a step', async () => {
    const { job } = await ran([{ id: 'a', name: 'First' }], {});
    expect(job.outcomeOf('First')).toBe('success');
    expect(() => job.outcomeOf('Second')).toThrow('no step is named "Second"');
  });

  it.each([
    ['a function that it does not know', '${{ hashFiles() == 1 }}'],
    ['a context that it does not know', "${{ github.event_name == 'push' }}"],
    ['something that is not a condition', '${{ steps.a.outcome === 1 }}'],
    ['a bracket that is not closed', '${{ (steps.a.outcome }}'],
    ['a condition that stops short', '${{ steps.a.outcome == }}'],
    ['a word after the end of the condition', "${{ true 'x' }}"],
  ])('is an error for %s, so that a workflow that outgrows it fails loudly', async (_what, condition) => {
    await expect(ran([{ id: 'a', name: 'a' }, { id: 'b', name: 'b', if: condition }], {})).rejects.toThrow();
  });
});

describe('wordsOf', () => {
  it('splits a command line into its words, keeps a quoted word whole, and fills in the variables that the step has', () => {
    expect(wordsOf('push --run-id "${A}-${B}" --output "$OUT" plain', { A: '4711', B: '2', OUT: '/tmp/out' })).toEqual(['push', '--run-id', '4711-2', '--output', '/tmp/out', 'plain']);
  });

  it('is an error for a variable that the test did not give, which would otherwise be an empty word', () => {
    expect(() => wordsOf('push "$NOPE"', {})).toThrow('reads NOPE');
  });
});
