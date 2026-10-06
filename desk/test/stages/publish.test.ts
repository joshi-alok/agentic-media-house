import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEntry, NewsFrontmatter, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { Claim, DeskState } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runPublish } from '../../src/stages/publish';
import type { VerifyResult } from '../../src/stages/verify';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { stageContext, useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// Publish is the last step of a piece that the gate and the verifier cleared. It writes what the renderer gives and nothing else: the
// two files of the piece, written byte for byte, the record of the run in the desk state, and one commit. These tests start from the golden
// piece of the gate, which every check clears, and from a target in a made-up checkout of the site.

const scratch = useScratch();
const RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };
const SLUG = GOLDEN_DRAFT.slug;
const NEWS = sitePaths().newsFile(SLUG);
const LEDGER = sitePaths().ledgerFile(SLUG);
const STATE = sitePaths().stateFile;

const VERIFIER = { model: 'model-a', passed: true, notes: ['Judged every fact sentence and every heading; every one was supported.'] };

/** What Verify hands on for the golden piece: cleared by the gate and by the model check. */
function cleared(): VerifyResult {
  const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
  expect(gate.route).toBe('publish');
  return { outcome: 'publish', draft: GOLDEN_DRAFT, gate, verifier: VERIFIER, rounds: 0, history: [] };
}

function setup() {
  const made = stageContext(scratch);
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, target: new SiteTarget(repoDir, git) };
}

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** What the renderer gives for the cleared piece. */
function rendered(verified: VerifyResult = cleared()) {
  return renderDraft(verified.draft, GOLDEN_CLAIMS, { runId: RUN.runId, gate: verified.gate, verifier: verified.verifier, release: 'auto' });
}

describe('runPublish', () => {
  it('writes the piece and its ledger exactly as the renderer gives them, with the ledger as JSON with two-space indents and a final newline', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const expected = rendered();
    expect(read(repoDir, NEWS)).toBe(expected.mdx);
    expect(read(repoDir, LEDGER)).toBe(`${JSON.stringify(expected.ledger, null, 2)}\n`);
  });

  it('writes a ledger that the site accepts and that says how the piece came out: released by the gate, the run, and the verdict of the model check', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const ledger = LedgerEntry.parse(JSON.parse(read(repoDir, LEDGER)));
    expect(ledger.release).toBe('auto');
    expect(ledger.runId).toBe(RUN.runId);
    expect(ledger.verifier).toEqual(VERIFIER);
    expect(ledger.gate.route).toBe('publish');
    expect(read(repoDir, NEWS)).not.toContain('updatedAt');
  });

  it('writes a piece that the build of the site accepts: the front matter is valid, and the body, the title and the description are what the ledger renders', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const mdx = read(repoDir, NEWS);
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(mdx);
    if (match === null) throw new Error('the piece has no front matter');
    const data = NewsFrontmatter.parse(parse(match[1] as string));
    const ledger = LedgerEntry.parse(JSON.parse(read(repoDir, LEDGER)));
    const state = await readDeskState(path.join(repoDir, STATE));
    const matched = matchPieces([{ id: SLUG, data, body: match[2] as string }], [{ id: SLUG, data: ledger }], state.corrections);
    expect(matched.map((piece) => piece.slug)).toEqual([SLUG]);
  });

  it('records the run in the desk state and keeps what was there', async () => {
    const { ctx, repoDir, target } = setup();
    await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    const state: DeskState = await readDeskState(path.join(repoDir, STATE));
    expect(state).toEqual({ lastRun: { at: RUN.at, outcome: 'published', runId: RUN.runId, slug: SLUG }, holds: [], corrections: [] });
  });

  it('commits the piece, the ledger and the desk state in one commit, and returns its id with the files', async () => {
    const { ctx, git, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(git.commits).toEqual([{ id: result.commit, paths: [NEWS, LEDGER, STATE], message: `desk: publish ${SLUG}` }]);
    expect(result.slug).toBe(SLUG);
    expect(result.files).toEqual([NEWS, LEDGER, STATE]);
    expect(result.mdx).toBe(rendered().mdx);
    expect(result.ledger).toEqual(rendered().ledger);
  });

  it('logs what it did', async () => {
    const { ctx, logs, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(logs).toEqual([`publish: ${SLUG} written and committed as ${(result.commit as string).slice(0, 7)}`]);
  });

  it('refuses a slug that is taken, and changes nothing', async () => {
    const { ctx, repoDir, git, target } = setup();
    writeFileSync(path.join(repoDir, NEWS), 'an older piece\n');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('is already there');
    expect(existsSync(path.join(repoDir, LEDGER))).toBe(false);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });

  it('refuses a checkout that has uncommitted changes where it would write, and changes nothing', async () => {
    const { ctx, repoDir, git, target } = setup();
    git.dirty.add(STATE);
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('has changes that are not committed');
    expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });

  it('puts everything back when the commit fails', async () => {
    const { ctx, repoDir, git, target } = setup();
    git.failNextCommit = new Error('git commit failed: the index is locked');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('the index is locked');
    expect(filesBelow(repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
  });

  it('writes nothing for a dry run, and says so: no commit, the files it would have written, and a line in the log', async () => {
    const { ctx, logs, repoDir } = setup();
    const before = filesBelow(repoDir);
    const result = await runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN);
    expect(filesBelow(repoDir)).toEqual(before);
    expect(read(repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(result.commit).toBeNull();
    expect(result.files).toEqual([NEWS, LEDGER, STATE]);
    expect(result.mdx).toBe(rendered().mdx);
    expect(logs).toEqual([`publish: ${SLUG} would be written (dry run: nothing was written)`]);
  });

  it('a dry run is refused for the reasons a real run is: the slug is taken', async () => {
    const { ctx, repoDir } = setup();
    writeFileSync(path.join(repoDir, LEDGER), '{}\n');
    await expect(runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('is already there');
  });

  it('does not publish a verdict that says hold', async () => {
    const { ctx, repoDir, git, target } = setup();
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), outcome: 'hold' }, RUN)).rejects.toThrow('runPublish needs a piece that Verify cleared');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });

  it('does not trust the word publish: a gate that did not clear the piece, or a model check that did not pass, stops it', async () => {
    const { ctx, git, target } = setup();
    const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'hold', holdReasons: ['TIER2_ATTRIBUTION'] } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'revise' } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), verifier: { ...VERIFIER, passed: false } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(git.commits).toEqual([]);
  });

  it('does not publish a piece that cites another outlet: the gate holds it, and so do both a verdict of hold and one that wrongly says publish', async () => {
    const { ctx, repoDir, git, target } = setup();
    const variant = makeTier2Variant({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
    const gate = runGate(variant, defaultContext());
    expect(gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    const held: VerifyResult = { outcome: 'hold', draft: variant.draft, gate, verifier: VERIFIER, rounds: 0, history: [] };
    await expect(runPublish(ctx, target, variant.claims, held, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, variant.claims, { ...held, outcome: 'publish' }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });

  it('writes nothing when the piece cannot be rendered: a sentence cites a claim that was not given', async () => {
    const { ctx, repoDir, git, target } = setup();
    const claims: Claim[] = GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-1');
    await expect(runPublish(ctx, target, claims, cleared(), RUN)).rejects.toThrow('a sentence cites c-1, but no claim has that id');
    expect(filesBelow(repoDir)).toHaveLength(3);
    expect(git.commits).toEqual([]);
  });
});
