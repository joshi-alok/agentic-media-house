import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoClient } from '../../src/demo/story';
import { DEMO_DATE } from '../../src/demo/world';
import { FakeClient } from '../../src/model/fake';
import { clientFromConfig } from '../../src/model/factory';
import { readDeskState } from '../../src/run/desk-state';
import { FakeForge, ForgeError } from '../../src/run/forge';
import type { RunDeskOptions } from '../../src/run/orchestrate';
import { DryTarget, SiteTarget } from '../../src/run/target';
import { useScratch } from '../support/context';
import { branchesIn, changesIn, git, initRepo, subjectsOf } from '../support/repo';
import { SELECT, START, STATE, clock, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE } from '../support/site';

// A whole run with a forge, in the made-up world with a scripted model, in a real git repository that has no remote and with a `FakeForge`. These say what each ending
// of a run does to the repository and to the forge: only a piece that is held is sent to the owner, a forge that fails ends the run as failed at the stage `hold` with
// the repository as it was (but for the record that the run failed), and the next try of the day, with the forge back, sends the piece.

const scratch = useScratch();

/** A run of the made-up day in a repository of its own. `run()` runs it with the forge; any option of the run can be replaced. */
function setup(options: RunSetup = {}) {
  const made = setupRun(scratch, { fake: unentailed(), ...options });
  const cli = initRepo(made.repoDir);
  const forge = new FakeForge();
  const target = new SiteTarget(made.repoDir, cli);
  return { ...made, forge, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ target, forge, ...overrides }) };
}

describe('a run that is held, with a forge', () => {
  it('ends held with the address of the draft pull request, which the output, the record and the desk state all have', async () => {
    const { run, forge, repoDir, dir } = setup();
    const result = await run();
    expect(result.outcome).toBe('held');
    expect(result.stage).toBe('hold');
    expect(result.pullRequest).toBe('https://github.example/agentic-media-house/pull/1');
    expect(result.reason).toBe(`held for G10_NOT_ENTAILED; draft pull request ${result.pullRequest}`);
    expect(recordOf(dir).reason).toBe(result.reason);
    const branch = `hold/${DEMO_DATE}-${result.slug}`;
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: START.toISOString(), outcome: 'held', runId: result.runId, slug: result.slug },
      holds: [{ at: START.toISOString(), categories: expect.any(Array), reasons: ['G10_NOT_ENTAILED'], prUrl: result.pullRequest }],
      corrections: [],
    });
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
  });

  it('commits the piece to the branch and the record of the hold to main, and nothing else anywhere', async () => {
    const { run, repoDir } = setup();
    const result = await run();
    const branch = `hold/${DEMO_DATE}-${result.slug}`;
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${result.slug}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(git(repoDir, 'diff', '--name-only', 'main', branch).split('\n')).toEqual([`site/src/content/ledger/${result.slug}.json`, `site/src/content/news/${result.slug}.mdx`, STATE].sort());
    expect(git(repoDir, 'branch', '--show-current')).toBe('main');
    expect(changesIn(repoDir)).toEqual([]);
    expect(result.commit).toBe(git(repoDir, 'rev-parse', 'main'));
  });

  it('ends failed at the stage hold when the forge fails, with the held draft kept, the hold not recorded, and the repository as it was but for the record that the run failed', async () => {
    const { run, forge, repoDir, dir } = setup();
    forge.fail('pushBranch', new ForgeError('auth', 'GitHub did not take the credentials, so a branch was not pushed'));
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(result.reason).toBe('GitHub did not take the credentials, so a branch was not pushed');
    expect(result.pullRequest).toBeNull();
    expect(result.slug).toBeNull();
    expect(existsSync(path.join(dir, 'held'))).toBe(true);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({ lastRun: { at: START.toISOString(), outcome: 'failed', runId: result.runId, slug: null }, holds: [], corrections: [] });
    expect(subjectsOf(repoDir)).toEqual([`desk: the run of ${DEMO_DATE} failed`, 'start']);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(changesIn(repoDir)).toEqual([]);
    expect(readFileSync(path.join(repoDir, 'site/src/content/news/.gitkeep'), 'utf8')).toBe('');
  });

  it('is tried again the same day when the forge has failed, and the second try sends the piece: the branch of the first try was removed, so the name is free', async () => {
    const made = setup();
    made.forge.fail('openDraftPullRequest', new ForgeError('failed', 'GraphQL: Something went wrong'));
    const first = await made.run();
    expect(first.outcome).toBe('failed');
    expect(first.reason).toContain('the branch');
    expect(first.reason).toContain('was pushed and no pull request was opened');
    expect(branchesIn(made.repoDir)).toEqual(['main']);
    const second = await made.run({ model: clientFromConfig(made.config, { kind: 'fake', fake: unentailed() }, {}), now: clock() });
    expect(second.outcome).toBe('held');
    expect(second.attempt).toBe(2);
    expect(second.pullRequest).toBe('https://github.example/agentic-media-house/pull/1');
    expect(branchesIn(made.repoDir)).toEqual([`hold/${DEMO_DATE}-${second.slug}`, 'main'].sort());
    expect(made.forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest', 'hasRemote', 'pushBranch', 'openDraftPullRequest']);
  });

  it('ends failed at the stage hold when the repository has no remote, and sends nothing', async () => {
    const { run, forge, repoDir } = setup();
    forge.remote = false;
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(result.reason).toContain('has no remote called origin');
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('touches nothing of the forge in a dry run, which is the same held piece with no pull request', async () => {
    const { run, forge, repoDir } = setup();
    const result = await run({ target: new DryTarget(repoDir) });
    expect(result.outcome).toBe('held');
    expect(result.dry).toBe(true);
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toBe('held for G10_NOT_ENTAILED');
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual(['start']);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
  });

  it('holds with no pull request when there is no forge, as before, and says nothing of one', async () => {
    const { run, repoDir } = setup();
    const result = await run({ forge: undefined });
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toBe('held for G10_NOT_ENTAILED');
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${result.slug}`, 'start']);
  });
});

describe('a run that does not end held, with a forge', () => {
  it('publishes without touching the forge: one commit on main with the piece, its ledger and the desk state, and no branch', async () => {
    const { run, forge, repoDir } = setup({ fake: demoClient() });
    const result = await run();
    expect(result.outcome).toBe('published');
    expect(result.pullRequest).toBeNull();
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual([`desk: publish ${result.slug}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main').split('\n')).toEqual([`site/src/content/ledger/${result.slug}.json`, `site/src/content/news/${result.slug}.mdx`, STATE]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('finds no story without touching the forge: one commit on main with the desk state', async () => {
    const { run, forge, repoDir } = setup({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] }) });
    const result = await run();
    expect(result.outcome).toBe('no-story');
    expect(forge.calls).toEqual([]);
    expect(subjectsOf(repoDir)).toEqual([`desk: no story on ${DEMO_DATE}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('fails before the hold without touching the forge', async () => {
    const { run, forge, repoDir } = setup({ fake: new FakeClient().script('select', SELECT) });
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(result.stage).not.toBe('hold');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });
});
