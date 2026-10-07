import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_URLS } from '../src/demo/world';
import { FakeClient } from '../src/model/fake';
import { clientFromConfig } from '../src/model/factory';
import { SelectArtifact, candidateId, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import { FakeForge } from '../src/run/forge';
import type { RunDeskOptions } from '../src/run/orchestrate';
import { SiteTarget } from '../src/run/target';
import { useScratch } from './support/context';
import { git, initRepo } from './support/repo';
import { STATE, clock, setupRun, unentailed } from './support/run';
import type { RunSetup } from './support/run';

// A piece that is held waits for the owner in a draft pull request. Until the owner merges or closes it, the Desk must not choose the same story again, or every day would
// open another pull request for it, and merging two would publish two pieces. The hold remembers the slug of the piece and the address of the story (the desk state), and
// the published index counts a hold that is not yet a fortnight old as covering its story. These are whole runs in the made-up world, in a real repository, with a fake forge.

const scratch = useScratch();

function setup(options: RunSetup = {}) {
  const made = setupRun(scratch, { fake: unentailed(), ...options });
  const cli = initRepo(made.repoDir);
  const forge = new FakeForge();
  const target = new SiteTarget(made.repoDir, cli);
  /** Run the day again, with a model that finds no story unless the test gives another. */
  const again = (overrides: Partial<RunDeskOptions> = {}, fake: FakeClient = quiet()) => made.run({ target, forge, model: clientFromConfig(made.config, { kind: 'fake', fake }, {}), now: clock(), ...overrides });
  return { ...made, forge, again, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ target, forge, ...overrides }) };
}

/** A model that chooses no story, and so is no help to a run that has no story that it may choose. */
const quiet = (): FakeClient => new FakeClient().script('select', { chosenId: null, reasons: ['nothing today'] });

const opened = (forge: FakeForge): number => forge.calls.filter((call) => call.method === 'openDraftPullRequest').length;

/** The ids of the candidates that were put to the model in the run that was made in `dir`. */
const shortlistOf = async (dir: string): Promise<string[]> => (await readArtifact(dir, '02-select', SelectArtifact)).shortlist;

const HELD_STORY = candidateId(DEMO_URLS.mercerArticle);

describe('an open hold is remembered', () => {
  it('writes the slug of the held piece and the address of the story that was chosen into the desk state, with the address of the pull request', async () => {
    const { run, repoDir } = setup();
    const result = await run();
    expect(result.outcome).toBe('held');
    const [hold] = (await readDeskState(path.join(repoDir, STATE))).holds;
    expect(hold).toMatchObject({ slug: result.slug, sourceUrl: DEMO_URLS.mercerArticle, prUrl: result.pullRequest });
  });

  it('does not offer the story again on the same day: it is not on the shortlist of the second run, which opens no second pull request', async () => {
    const { run, again, forge, dir } = setup();
    expect((await run()).outcome).toBe('held');
    expect(await shortlistOf(dir)).toContain(HELD_STORY);
    expect((await again({ forceNew: true })).outcome).toBe('no-story');
    expect(await shortlistOf(dir)).not.toContain(HELD_STORY);
    expect(opened(forge)).toBe(1);
  });

  it('does not offer it the next day either, though the story is still new that day', async () => {
    const { run, again, forge, config } = setup();
    expect((await run()).outcome).toBe('held');
    expect((await again({ date: '2026-10-06' })).outcome).toBe('no-story');
    expect(await shortlistOf(path.join(config.runDir, '2026-10-06'))).not.toContain(HELD_STORY);
    expect(opened(forge)).toBe(1);
  });

  it('chooses the story again when the hold does not remember it, as a hold from before the desk state remembered does not: it is the two new fields that keep it out', async () => {
    const { run, again, forge, repoDir } = setup();
    expect((await run()).outcome).toBe('held');
    // Take what the hold remembers out of the desk state, and commit that as the owner would.
    const file = path.join(repoDir, STATE);
    const state = await readDeskState(file);
    writeFileSync(file, `${JSON.stringify({ ...state, holds: state.holds.map(({ slug: _slug, sourceUrl: _sourceUrl, ...rest }) => rest) }, null, 2)}\n`);
    git(repoDir, 'commit', '--quiet', '-am', 'a hold from before holds remembered their story');
    expect((await again({ date: '2026-10-06' }, unentailed())).outcome).toBe('held');
    expect(opened(forge)).toBe(2);
  });

  it('chooses it again on the same day, with --force-new, when the owner has deleted the hold and committed that: the second try has a branch of its own, and the first try\'s branch does not stand in its way', async () => {
    const { run, again, forge, repoDir } = setup();
    const first = await run();
    expect(first.outcome).toBe('held');
    const file = path.join(repoDir, STATE);
    const state = await readDeskState(file);
    writeFileSync(file, `${JSON.stringify({ ...state, holds: [] }, null, 2)}\n`);
    git(repoDir, 'commit', '--quiet', '-am', 'let go of the hold that was discarded');
    const second = await again({ forceNew: true }, unentailed());
    expect(second.outcome).toBe('held');
    expect(second.attempt).toBe(2);
    expect(forge.calls.filter((call) => call.method === 'pushBranch').map((call) => (call as { branch: string }).branch)).toEqual([`hold/2026-10-05-${first.slug}`, `hold/2026-10-05-${first.slug}-t2`]);
    expect(opened(forge)).toBe(2);
  });

  it('chooses it again when the owner has deleted the hold from the desk state and committed that: how a discarded pull request is let go of before the fortnight is over', async () => {
    const { run, again, forge, repoDir } = setup();
    expect((await run()).outcome).toBe('held');
    const file = path.join(repoDir, STATE);
    const state = await readDeskState(file);
    writeFileSync(file, `${JSON.stringify({ ...state, holds: [] }, null, 2)}\n`);
    git(repoDir, 'commit', '--quiet', '-am', 'let go of the hold that was discarded');
    const result = await again({ date: '2026-10-06' }, unentailed());
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBe('https://github.example/agentic-media-house/pull/2');
    expect(opened(forge)).toBe(2);
  });
});
