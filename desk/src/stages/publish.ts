import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { recordRun } from '../index';
import type { PublishTarget } from '../index';
import type { StageContext } from './context';
import type { VerifyResult } from './verify';

// Stage 7, Publish: put a piece that the gate and the verifier cleared on the site. Everything that reaches the site passes through
// `renderDraft` of the gate package: the Desk writes no text of its own into a piece. The stage writes the two files that the renderer gives,
// byte for byte, records the run in the desk state, and commits the three files in one commit; where they are written is the target's business
// (`SiteTarget` writes and commits, `DryTarget` writes nothing). Nothing is pushed: that is for the daily workflow of a later plan. Before anything is written, the snapshots
// that the piece cites are kept in the evidence store (`keep`), for good, so that a piece is never on the site while the pages that it quotes can still be lost; a store that
// cannot keep them ends the stage, and the piece is not published.

/** The run that is publishing: its id, and the moment it is recording, as an ISO time. */
export interface PublishRun {
  runId: string;
  at: string;
}

export interface PublishResult {
  slug: string;
  /** The text of the `.mdx` file, as written (or as it would have been written). */
  mdx: string;
  ledger: LedgerEntry;
  /** The snapshots that the piece cites, as their hashes, which were kept in the evidence store before the piece was written; none for a dry run, which keeps nothing. */
  kept: string[];
  /** The id of the commit; null for a dry run. */
  commit: string | null;
  /** The files of the commit, as paths below the repository. */
  files: string[];
}

/**
 * Publish the piece that `verified` says is clear, written from `claims`.
 *
 * The stage does not take Verify's word alone: it refuses unless the outcome is `publish` and the gate's route is `publish` and the model check passed,
 * so a piece that cites another outlet (the gate holds it) or one that was not cleared cannot get here by a wrong label. The piece is rendered with
 * `release: 'auto'` (nobody released it: the gate cleared it) and no `updatedAt` (it has never been corrected). The ledger is checked against the schema
 * that the site uses before anything is written, because the site refuses to build a piece with a ledger it cannot read.
 *
 * Then the snapshots that the piece cites (the sources of its ledger, each once) are kept in the evidence store, one after the other. A snapshot that cannot be kept (the store is
 * down, refuses, or holds a text that has been changed) ends the stage with an error that says so, and nothing is written: it is the store and not the piece that stopped it. A dry
 * run keeps nothing. If the commit fails after that, the snapshots stay kept, which does no harm: each is a copy of what is in the store already.
 *
 * The target refuses, before it writes, a slug that is taken and a checkout with uncommitted changes where the files go; and puts everything back
 * if the commit fails. Whatever it throws ends the run.
 */
export async function runPublish(ctx: Pick<StageContext, 'log' | 'evidence'>, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: PublishRun): Promise<PublishResult> {
  if (verified.outcome !== 'publish' || verified.gate.route !== 'publish' || !verified.verifier.passed) {
    throw new Error('runPublish needs a piece that Verify cleared: the outcome and the route of the gate must be publish, and the model check must have passed');
  }
  const { mdx, ledger } = renderDraft(verified.draft, claims, { runId: run.runId, gate: verified.gate, verifier: verified.verifier, release: 'auto' });
  const checked = LedgerEntry.safeParse(ledger);
  if (!checked.success) throw new Error(`runPublish: the ledger of the piece is not one the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  const slug = verified.draft.slug;

  const kept = target.dry ? [] : [...new Set(ledger.sources.map((source) => source.snapshotHash))];
  try {
    for (const hash of kept) await ctx.evidence.keep(hash);
  } catch (error) {
    throw new Error(`the snapshots that the piece cites could not be kept, so the piece is not published: ${error instanceof Error ? error.message || error.name : String(error)}`);
  }
  if (kept.length > 0) ctx.log(`publish: kept ${kept.length} ${kept.length === 1 ? 'snapshot' : 'snapshots'} that the piece cites`);

  const result = await target.apply({
    piece: { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` },
    state: (state) => recordRun(state, { at: run.at, outcome: 'published', runId: run.runId, slug }),
    message: `desk: publish ${slug}`,
  });
  ctx.log(result.commit === null ? `publish: ${slug} would be written (dry run: nothing was written)` : `publish: ${slug} written and committed as ${result.commit.slice(0, 7)}`);
  return { slug, mdx, ledger, kept, commit: result.commit, files: result.files };
}
