import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { HeldArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { FakeForge, ForgeError, HOLD_BRANCH, holdBranchName } from '../../src/run/forge';
import type { PullRequestRequest } from '../../src/run/forge';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runHold } from '../../src/stages/hold';
import { heldPieceFiles, holdPrBody, holdPrTitle } from '../../src/stages/hold-pr';
import { useScratch } from '../support/context';
import { HOLD_RUN, verdicts } from '../support/held';
import type { Verdict } from '../support/held';
import { placePiece, readPieces } from '../support/pieces';
import { branchesIn, changesIn, git, initRepo, show, subjectsOf } from '../support/repo';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// What a hold does when there is a forge: the piece is committed to a branch of its own, the branch is pushed, the draft pull request is opened, and only then is the hold
// recorded in the desk state, with the address of the pull request. These tests run the real stage in a real git repository (with no remote) and a `FakeForge`, because
// what matters is what is left in the repository, and in particular that the checkout is as it was found whatever goes wrong: no branch that it was not asked for, nothing
// that is not committed, and nothing on `main` but the record.

const scratch = useScratch();
const made = verdicts(scratch);
const STATE = sitePaths().stateFile;

/** A held piece in a checkout that is a real repository, with a forge that does nothing but remember. */
async function setup(verdict?: Verdict) {
  const held = verdict ?? (await made.tier2());
  const repoDir = makeSite(scratch());
  const cli = initRepo(repoDir);
  const forge = new FakeForge();
  const slug = held.verified.draft.slug;
  return { ...held, repoDir, cli, forge, slug, branch: holdBranchName(held.ctx.date, slug), target: new SiteTarget(repoDir, cli) };
}

/** The held draft that the stage wrote, read back. */
const heldIn = (file: string): HeldArtifact => HeldArtifact.parse(JSON.parse(readFileSync(file, 'utf8')));

/** Everything that says the checkout and `main` are as they were found: one commit, no other branch, the state as committed, nothing changed or new. */
function expectUntouched(repoDir: string): void {
  expect(subjectsOf(repoDir)).toEqual(['start']);
  expect(branchesIn(repoDir)).toEqual(['main']);
  expect(git(repoDir, 'branch', '--show-current')).toBe('main');
  expect(changesIn(repoDir)).toEqual([]);
  expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
  expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
}

describe('runHold with a forge: the piece is sent to the owner', () => {
  it('commits the piece to a branch, pushes it, opens a draft pull request into main, and says where it is', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const held = heldIn(result.file);
    expect(branch).toBe(`hold/2026-10-05-${slug}`);
    expect(result.pullRequest).toEqual({ url: 'https://github.example/agentic-media-house/pull/1', number: 1, branch, commit: git(repoDir, 'rev-parse', branch) });
    expect(result.note).toBeNull();
    const request: PullRequestRequest = { branch, title: holdPrTitle(held), body: holdPrBody(held), base: 'main' };
    expect(forge.calls).toEqual([{ method: 'hasRemote' }, { method: 'pushBranch', branch }, { method: 'openDraftPullRequest', request }]);
  });

  it('puts the two files of the piece on the branch, as one commit on top of main, with the message and the trailer of the project', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const files = heldPieceFiles(heldIn(result.file));
    expect(git(repoDir, 'rev-list', '--count', `main..${branch}`)).toBe('1');
    expect(git(repoDir, 'rev-parse', `${branch}^`)).toBe(git(repoDir, 'rev-parse', 'main~1'));
    expect(git(repoDir, 'diff', '--name-status', `${branch}^`, branch).split('\n')).toEqual([`A\tsite/src/content/ledger/${slug}.json`, `A\tsite/src/content/news/${slug}.mdx`]);
    expect(show(repoDir, `${branch}:site/src/content/news/${slug}.mdx`)).toBe(files.mdx);
    // The ledger has the same content as the one that is made again from the draft on disk; the order of the keys of a claim follows the schema there, so the text is compared as data.
    expect(JSON.parse(show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`))).toEqual(JSON.parse(files.ledger));
    expect(git(repoDir, 'log', '-1', '--format=%B', branch)).toBe(`desk: held piece ${slug}, for the owner to release\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
  });

  it('puts on the branch a piece that the site builds: what the site checks of a piece and its ledger passes when the owner merges it', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup();
    await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    const merged = makeSite(scratch());
    placePiece(merged, { slug, mdx: show(repoDir, `${branch}:site/src/content/news/${slug}.mdx`), ledger: show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`) });
    const { news, ledgers } = readPieces(merged);
    expect(matchPieces(news, ledgers, []).map((piece) => piece.slug)).toEqual([slug]);
    expect(ledgers[0]?.data.release).toBe('owner');
  });

  it('opens the pull request before the hold is recorded, so that the record has its address, and records the hold on main with it', async () => {
    const { ctx, claims, verified, repoDir, target, slug, branch } = await setup();
    const seen: { stateWhenOpened?: string; subjectsWhenOpened?: string[]; branchWhenPushed?: string } = {};
    class SpyForge extends FakeForge {
      override async pushBranch(name: string): Promise<void> {
        seen.branchWhenPushed = git(repoDir, 'rev-parse', '--verify', name);
        return super.pushBranch(name);
      }
      override async openDraftPullRequest(request: PullRequestRequest) {
        seen.stateWhenOpened = readFileSync(path.join(repoDir, STATE), 'utf8');
        seen.subjectsWhenOpened = subjectsOf(repoDir);
        return super.openDraftPullRequest(request);
      }
    }
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, new SpyForge());
    // The branch was there when it was pushed, and on main the hold was not yet recorded when the pull request was opened.
    expect(seen.branchWhenPushed).toMatch(/^[0-9a-f]{40}$/);
    expect(seen.stateWhenOpened).toBe(COMMITTED_STATE);
    expect(seen.subjectsWhenOpened).toEqual(['start']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect(result.commit).toBe(git(repoDir, 'rev-parse', 'main'));
    expect(result.files).toEqual([STATE]);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: HOLD_RUN.at, outcome: 'held', runId: HOLD_RUN.runId, slug },
      holds: [{ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'], prUrl: result.pullRequest?.url }],
      corrections: [],
    });
    expect(git(repoDir, 'diff', '--name-only', `main~1`, 'main')).toBe(STATE);
    expect(branch).toBe(result.pullRequest?.branch);
  });

  it('leaves the checkout on main with nothing changed and no piece in it: the branch is made beside it', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(git(repoDir, 'branch', '--show-current')).toBe('main');
    expect(changesIn(repoDir)).toEqual([]);
    expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
  });

  it('keeps the held draft in the folder of the run, and logs where the pull request is', async () => {
    const { ctx, logs, claims, verified, forge, target, slug, branch } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(existsSync(result.file)).toBe(true);
    expect(logs).toContain(`hold: ${slug} is sent to the owner as the draft pull request https://github.example/agentic-media-house/pull/1 (branch ${branch})`);
    expect(logs.at(-1)).toMatch(/^hold: .* is held for TIER2_ATTRIBUTION, written to /);
  });

  it('sends a piece that was held by the model check, which the gate cleared, in the same way', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug, branch } = await setup(await made.modelCheck());
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.reasons).toEqual(['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED']);
    expect(git(repoDir, 'rev-parse', '--verify', branch)).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.parse(show(repoDir, `${branch}:site/src/content/ledger/${slug}.json`)).gate.route).toBe('hold');
  });

  it('names the branch from the day and the slug, and cuts a long slug so that the branch is still one that the Desk pushes', async () => {
    const verdict = await made.tier2();
    const long = `long-${'x'.repeat(120)}`;
    verdict.verified.draft.slug = long;
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup(verdict);
    expect(branch).toBe(`hold/2026-10-05-${long.slice(0, 80)}`);
    expect(HOLD_BRANCH.test(branch)).toBe(true);
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.pullRequest?.branch).toBe(branch);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
  });
});

describe('runHold with a forge: when a step fails, the run fails and the checkout is as it was', () => {
  it('stops when the push fails, removes the branch, records nothing, and keeps the held draft', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup();
    forge.fail('pushBranch', new ForgeError('auth', 'GitHub did not take the credentials'));
    const error = await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'ForgeError', kind: 'auth', message: 'GitHub did not take the credentials' });
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch']);
    expectUntouched(repoDir);
    expect(existsSync(path.join(ctx.runDir, 'held', `${slug}.json`))).toBe(true);
  });

  it('stops when the pull request cannot be opened, removes the branch, and says that the branch was pushed', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    forge.fail('openDraftPullRequest', new ForgeError('failed', 'GraphQL: Something went wrong'));
    const error = (await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught)) as ForgeError;
    expect(error).toBeInstanceOf(ForgeError);
    expect(error.kind).toBe('failed');
    expect(error.message).toBe(`GraphQL: Something went wrong (the branch ${branch} was pushed and no pull request was opened: open one from it by hand, or delete the branch)`);
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expectUntouched(repoDir);
  });

  it('stops when there is no remote, before anything is made', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    forge.remote = false;
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toMatchObject({ kind: 'no-remote', message: expect.stringContaining('has no remote called origin') });
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expectUntouched(repoDir);
  });

  it('stops when git cannot be asked whether there is a remote', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    forge.fail('hasRemote', new ForgeError('tool-missing', 'git cannot be started'));
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toMatchObject({ kind: 'tool-missing' });
    expectUntouched(repoDir);
  });

  it('refuses when the branch is already there, and leaves that branch exactly as it was', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    git(repoDir, 'branch', branch);
    const tip = git(repoDir, 'rev-parse', branch);
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow(`the branch ${branch} already exists`);
    expect(git(repoDir, 'rev-parse', branch)).toBe(tip);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
    expect(subjectsOf(repoDir)).toEqual(['start']);
  });

  it('refuses when the desk state has a change that is not committed, before it asks the forge anything', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    writeFileSync(path.join(repoDir, STATE), `${COMMITTED_STATE}\n`);
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('has changes that are not committed');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(changesIn(repoDir)).toEqual([' M site/src/data/desk-state.json']);
  });

  it('refuses when there is a file in the folder of the pieces that is not committed', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    writeFileSync(path.join(repoDir, 'site/src/content/news/someone-elses.mdx'), 'not committed\n');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('has changes that are not committed');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('refuses when the checkout is not on main, because the branch would carry the commits of the other branch', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    git(repoDir, 'switch', '--quiet', '-c', 'other');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('but the checkout is on other');
    expect(branchesIn(repoDir)).toEqual(['main', 'other']);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
  });

  it('refuses when the checkout is on no branch', async () => {
    const { ctx, claims, verified, repoDir, forge, target } = await setup();
    git(repoDir, 'checkout', '--quiet', '--detach');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('but the checkout is on no branch');
    expect(branchesIn(repoDir)).toEqual(['main']);
  });

  it('refuses when the slug is taken by a piece that is already on the site', async () => {
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup();
    writeFileSync(path.join(repoDir, `site/src/content/news/${slug}.mdx`), 'a piece\n');
    git(repoDir, 'add', '.');
    git(repoDir, 'commit', '--quiet', '-m', 'a piece with the same slug');
    await expect(runHold(ctx, target, claims, verified, HOLD_RUN, forge)).rejects.toThrow('so the slug');
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(forge.calls).toEqual([{ method: 'hasRemote' }]);
  });

  it('tells where the pull request is when the hold cannot be recorded after it was opened, and keeps the branch, which the pull request is from', async () => {
    const { ctx, claims, verified, repoDir, forge, target, branch } = await setup();
    // A hook of git that refuses every commit: the branch is made without it, and the commit of the desk state is not.
    const hook = path.join(repoDir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const error = (await runHold(ctx, target, claims, verified, HOLD_RUN, forge).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toContain('git commit failed');
    expect(error.message).toContain('the draft pull request https://github.example/agentic-media-house/pull/1 was opened and the hold is not recorded in the desk state');
    expect(forge.calls.map((call) => call.method)).toEqual(['hasRemote', 'pushBranch', 'openDraftPullRequest']);
    expect(branchesIn(repoDir)).toEqual([branch, 'main'].sort());
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(changesIn(repoDir)).toEqual([]);
  });
});

describe('runHold with a forge: what is not sent', () => {
  it('opens no pull request for a draft that cannot be written as a piece, records the hold without an address, and says why', async () => {
    const verdict = await made.tier2();
    verdict.verified.draft.title = { ...verdict.verified.draft.title, claimIds: ['c-99'] } as typeof verdict.verified.draft.title;
    const { ctx, claims, verified, repoDir, forge, target, slug } = await setup(verdict);
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN, forge);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toContain('the draft cannot be written as a piece, so there is nothing for the owner to merge');
    expect(result.note).toContain('c-99');
    expect(forge.calls).toEqual([]);
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect((await readDeskState(path.join(repoDir, STATE))).holds).toEqual([{ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'] }]);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect(existsSync(result.file)).toBe(true);
  });

  it('never touches the forge in a dry run, and writes nothing', async () => {
    const { ctx, claims, verified, repoDir, forge } = await setup();
    const result = await runHold(ctx, new DryTarget(repoDir), claims, verified, HOLD_RUN, forge);
    expect(forge.calls).toEqual([]);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toBeNull();
    expectUntouched(repoDir);
    expect(existsSync(result.file)).toBe(true);
  });

  it('does what it did before when there is no forge: the hold is recorded without an address, and no branch is made', async () => {
    const { ctx, claims, verified, repoDir, target, slug } = await setup();
    const result = await runHold(ctx, target, claims, verified, HOLD_RUN);
    expect(result.pullRequest).toBeNull();
    expect(result.note).toBeNull();
    expect(branchesIn(repoDir)).toEqual(['main']);
    expect(subjectsOf(repoDir)).toEqual([`desk: hold ${slug}`, 'start']);
    expect((await readDeskState(path.join(repoDir, STATE))).holds[0]).toEqual({ at: HOLD_RUN.at, categories: verified.draft.categories, reasons: ['TIER2_ATTRIBUTION'] });
  });
});
