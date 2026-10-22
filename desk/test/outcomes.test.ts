import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, demoClient } from '../src/demo/story';
import { DEMO_DATE } from '../src/demo/world';
import { FakeClient } from '../src/model/fake';
import { FakeForge, ForgeError } from '../src/run/forge';
import { retractPiece } from '../src/run/retract';
import { DryTarget, SiteTarget, sitePaths } from '../src/run/target';
import { useScratch } from './support/context';
import { PUBLISHED_SLUG, publishedSite } from './support/published';
import { branchesIn, git, initRepo } from './support/repo';
import { SELECT, STATE, setupRun, unentailed } from './support/run';
import type { RunSetup } from './support/run';

// What each way for a run to end commits, and where. This is the table that the owner needs in order to know what is in the repository after a run, and each row is made by a real
// run of the pipeline in a real git repository (with no remote), with a `FakeForge`: the test reads what the run left (the commits that `main` gained, the files in them, the
// other branches with their commits and files, and what the forge was asked) and says it in the same words as the table does.
//
//   | Outcome                                   | On main                                             | On a branch of its own                        | The forge                      |
//   |-------------------------------------------|-----------------------------------------------------|-----------------------------------------------|--------------------------------|
//   | published                                 | one commit: the article, its ledger, the desk state | none                                          | not asked                      |
//   | held, sent to the owner                   | one commit: the desk state, with the address        | hold/<day>-<slug>: the article and the ledger | remote, push, pull request     |
//   | held, with no forge                       | one commit: the desk state                          | none                                          | none given                     |
//   | held, a draft that cannot be a piece      | one commit: the desk state, with no address         | none                                          | not asked                      |
//   | held, in a dry run                        | nothing                                             | none                                          | not asked                      |
//   | no story                                  | one commit: the desk state                          | none                                          | not asked                      |
//   | failed before the hold                    | one commit: the desk state                          | none                                          | not asked                      |
//   | failed at the hold, the forge is down     | one commit: the desk state (the run failed)         | none (a branch that was made is removed)      | remote, push                   |
//   | failed at the hold, the pull request fails| one commit: the desk state (the run failed)         | none (the local branch is removed)            | remote, push, pull request     |
//   | a correction of a published piece         | one commit: the article (updatedAt), the desk state | none                                          | not asked                      |

const scratch = useScratch();
const paths = sitePaths();
const SLUG = 'fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant';

/** What a run or a correction left in a repository whose first commit is `start`: the commits and files that `main` gained, the branches that were made, and what the forge was asked. */
interface Left {
  main: string[];
  mainFiles: string[];
  branches: Record<string, { subjects: string[]; files: string[] }>;
  forge: string[];
}

/** What the repository `repoDir` has gained since its first commit. */
function leftIn(repoDir: string, forge: FakeForge): Left {
  const start = git(repoDir, 'rev-list', '--max-parents=0', 'main');
  const lines = (text: string): string[] => (text === '' ? [] : text.split('\n'));
  const gained = (ref: string) => ({ subjects: lines(git(repoDir, 'log', '--format=%s', ref, `^${start}`)), files: lines(git(repoDir, 'diff', '--name-only', start, ref)).sort() });
  const others = branchesIn(repoDir).filter((name) => name !== 'main');
  return {
    main: gained('main').subjects,
    mainFiles: gained('main').files,
    branches: Object.fromEntries(others.map((name) => [name, gained(name)])),
    forge: forge.calls.map((call) => call.method),
  };
}

/** A run of the made-up day in a repository of its own, with a forge, and what it left. */
async function ranWith(options: RunSetup, prepare: (forge: FakeForge) => void = () => undefined, overrides: { dry?: boolean; forge?: boolean } = {}) {
  const made = setupRun(scratch, options);
  const cli = initRepo(made.repoDir);
  const forge = new FakeForge();
  prepare(forge);
  const result = await made.run({ target: overrides.dry === true ? new DryTarget(made.repoDir) : new SiteTarget(made.repoDir, cli), ...(overrides.forge === false ? {} : { forge }) });
  return { result, left: leftIn(made.repoDir, forge) };
}

const NEWS = paths.newsFile(SLUG);
const LEDGER = paths.ledgerFile(SLUG);
const BRANCH = `hold/${DEMO_DATE}-${SLUG}`;
const FAILED = [`desk: the run of ${DEMO_DATE} failed`];

describe('what each outcome commits, and where', () => {
  it('published: one commit on main, with the article, its ledger and the desk state; no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: demoClient() });
    expect(result.outcome).toBe('published');
    expect(left).toEqual({ main: [`desk: publish ${SLUG}`], mainFiles: [LEDGER, NEWS, STATE], branches: {}, forge: [] });
  });

  it('held, sent to the owner: one commit on main with the desk state alone, and the article and the ledger in one commit on a branch of their own, which the forge pushed and opened a pull request from', async () => {
    const { result, left } = await ranWith({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({
      main: [`desk: hold ${SLUG}`],
      mainFiles: [STATE],
      branches: { [BRANCH]: { subjects: [`desk: held piece ${SLUG}, for the owner to release`], files: [LEDGER, NEWS] } },
      forge: ['hasRemote', 'branchExists', 'pushBranch', 'openDraftPullRequest'],
    });
  });

  it('held, with no forge: one commit on main with the desk state alone, and no branch', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, undefined, { forge: false });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({ main: [`desk: hold ${SLUG}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('held, with a draft that cannot be written as a piece: one commit on main with the desk state alone, with no address, and no branch; the forge is not asked', async () => {
    const unwritable = structuredClone(DEMO_REPLY);
    unwritable.takeaways[0] = { kind: 'fact', text: DEMO_REPLY.takeaways[0]?.text ?? '', claimIds: ['c-99'] };
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS }).script('compose', unwritable, { replacements: [] }, { replacements: [] }, { replacements: [] });
    const { result, left } = await ranWith({ fake });
    expect(result.outcome).toBe('held');
    expect(result.pullRequest).toBeNull();
    expect(result.reason).toContain('no pull request: the draft cannot be written as a piece');
    expect(left).toEqual({ main: [`desk: hold ${SLUG}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('held, in a dry run: nothing is committed anywhere and the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, undefined, { dry: true });
    expect(result.outcome).toBe('held');
    expect(left).toEqual({ main: [], mainFiles: [], branches: {}, forge: [] });
  });

  it('no story: one commit on main with the desk state alone, and no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] }) });
    expect(result.outcome).toBe('no-story');
    expect(left).toEqual({ main: [`desk: no story on ${DEMO_DATE}`], mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('failed before the hold: one commit on main with the desk state alone, and no branch; the forge is not asked', async () => {
    const { result, left } = await ranWith({
      stages: {
        compose: async () => {
          throw new Error('the composer fell over');
        },
      },
    });
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('compose');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: [] });
  });

  it('failed at the hold because the forge is down: one commit on main with the desk state alone, that says that the run failed, and no branch, because the one that was made is removed', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, (forge) => forge.fail('pushBranch', new ForgeError('failed', 'could not resolve host')));
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: ['hasRemote', 'branchExists', 'pushBranch'] });
  });

  it('failed at the hold because the pull request cannot be opened: the same, and the forge was asked to open it', async () => {
    const { result, left } = await ranWith({ fake: unentailed() }, (forge) => forge.fail('openDraftPullRequest', new ForgeError('failed', 'GitHub said no')));
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('hold');
    expect(left).toEqual({ main: FAILED, mainFiles: [STATE], branches: {}, forge: ['hasRemote', 'branchExists', 'pushBranch', 'openDraftPullRequest'] });
  });

  it('a correction of a published piece: one commit on main, with the article (updatedAt) and the desk state; no branch; the forge is not asked', async () => {
    const { repoDir, cli } = publishedSite(scratch);
    const result = await retractPiece({ repoDir, git: cli, slug: PUBLISHED_SLUG, reason: 'A figure was wrong.', kind: 'correction', now: () => new Date('2026-10-06T09:30:00.000Z') });
    expect(result.commit).not.toBeNull();
    expect(leftIn(repoDir, new FakeForge())).toEqual({ main: [`desk: correct ${PUBLISHED_SLUG}`], mainFiles: [paths.newsFile(PUBLISHED_SLUG), STATE], branches: {}, forge: [] });
  });
});
