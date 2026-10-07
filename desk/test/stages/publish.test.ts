import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEntry, NewsFrontmatter, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { Claim, DeskState } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { EvidenceError } from '../../src/run/evidence';
import type { EvidenceStore } from '../../src/run/evidence';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runPublish } from '../../src/stages/publish';
import type { VerifyResult } from '../../src/stages/verify';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { stageContext, useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { acceptingStore } from '../support/store';

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

/** A context whose evidence store keeps whatever it is asked to keep: the hashes of the golden piece are not those of any page that a store holds. */
function setup(evidence: EvidenceStore & { kept: string[] } = acceptingStore()) {
  const made = stageContext(scratch, { evidence });
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, store: evidence, target: new SiteTarget(repoDir, git) };
}

/** The snapshots that the golden piece cites, each once, as its ledger lists them: five pages, with five hashes. */
const CITED = (): string[] => [...new Set(rendered().ledger.sources.map((source) => source.snapshotHash))];

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
    expect(logs).toEqual(['publish: kept 5 snapshots that the piece cites', `publish: ${SLUG} written and committed as ${(result.commit as string).slice(0, 7)}`]);
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

  it('keeps nothing for a dry run: the snapshots that a piece would cite are not kept by a piece that is not written', async () => {
    const { ctx, repoDir, store } = setup();
    const result = await runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN);
    expect(store.kept).toEqual([]);
    expect(result.kept).toEqual([]);
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

describe('runPublish: the evidence that the piece cites is kept before the piece is written', () => {
  it('keeps the snapshots of the sources of the ledger, each once, in the order of the ledger, and says which', async () => {
    const { ctx, target, store } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(CITED()).toHaveLength(5);
    expect(store.kept).toEqual(CITED());
    expect(result.kept).toEqual(CITED());
    expect(store.kept).toEqual(rendered().ledger.sources.map((source) => source.snapshotHash));
  });

  it('keeps a snapshot once when two sources of the ledger have the same text', async () => {
    const { ctx, target, store } = setup();
    const same = 'a'.repeat(64);
    const claims = GOLDEN_CLAIMS.map((claim) => ({ ...claim, source: { ...claim.source, snapshotHash: same } }));
    await runPublish(ctx, target, claims, cleared(), RUN);
    expect(store.kept).toEqual([same]);
  });

  it('says snapshot, and not snapshots, when it kept one', async () => {
    const { ctx, target, logs } = setup();
    const claims = GOLDEN_CLAIMS.map((claim) => ({ ...claim, source: { ...claim.source, snapshotHash: 'b'.repeat(64) } }));
    await runPublish(ctx, target, claims, cleared(), RUN);
    expect(logs[0]).toBe('publish: kept 1 snapshot that the piece cites');
  });

  it('keeps them before anything is written or committed: when the store is asked, the ledger is not on the site and git has no commit', async () => {
    const made = setup();
    const seen: { ledger: boolean; commits: number }[] = [];
    const store: EvidenceStore & { kept: string[] } = {
      ...made.store,
      keep: async (hash) => {
        seen.push({ ledger: existsSync(path.join(made.repoDir, LEDGER)), commits: made.git.commits.length });
        made.store.kept.push(hash);
      },
    };
    await runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(seen).toHaveLength(5);
    expect(seen.every((at) => !at.ledger && at.commits === 0)).toBe(true);
    expect(made.git.commits).toHaveLength(1);
  });

  it('does not publish when a snapshot cannot be kept: nothing is written, nothing is committed, and the error says that it is the store', async () => {
    const made = setup();
    const down = new EvidenceError('unreachable', 'the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED');
    const store: EvidenceStore & { kept: string[] } = {
      ...made.store,
      keep: async (hash) => {
        if (made.store.kept.length === 2) throw down;
        made.store.kept.push(hash);
      },
    };
    await expect(runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow(
      'the snapshots that the piece cites could not be kept, so the piece is not published: the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED',
    );
    expect(made.store.kept).toEqual(CITED().slice(0, 2));
    expect(filesBelow(made.repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(made.repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(made.git.commits).toEqual([]);
    expect(made.logs).toEqual([]);
  });

  it('says the same of a store that fails with what is not an error', async () => {
    const made = setup();
    const store: EvidenceStore & { kept: string[] } = { ...made.store, keep: () => Promise.reject('a string, thrown') };
    await expect(runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('could not be kept, so the piece is not published: a string, thrown');
  });

  it('keeps nothing for a piece that is not cleared: not for a verdict of hold, not for a gate that did not clear it, not for a model check that did not pass', async () => {
    const { ctx, target, store } = setup();
    const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), outcome: 'hold' }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'revise' } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), verifier: { ...VERIFIER, passed: false } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(store.kept).toEqual([]);
  });

  it('keeps nothing for a piece that cannot be rendered', async () => {
    const { ctx, target, store } = setup();
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-1'), cleared(), RUN)).rejects.toThrow('a sentence cites c-1');
    expect(store.kept).toEqual([]);
  });

  it('does not publish a piece whose snapshot the store does not hold, and the error is the one of the store', async () => {
    const { ctx, target } = setup(acceptingStore());
    const refusing: EvidenceStore = { ...acceptingStore(), keep: async (hash) => Promise.reject(new EvidenceError('missing', `no evidence is stored for ${hash}`)) };
    await expect(runPublish({ ...ctx, evidence: refusing }, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow(`so the piece is not published: no evidence is stored for ${CITED()[0]}`);
  });
});
