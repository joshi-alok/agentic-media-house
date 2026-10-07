import path from 'node:path';
import { citedClaims } from '@robywire/gate';
import type { Claim, VerifierReason } from '@robywire/gate';
import { HeldArtifact, addHold, isPlainSlug, recordRun, writeJsonFile } from '../index';
import type { ForgeTarget, PublishTarget, TargetResult } from '../index';
import type { StageContext } from './context';
import { sendToOwner } from './hold-pr';
import type { HoldPullRequest } from './hold-pr';
import type { VerifyResult } from './verify';
import type { VerifierFailure } from './verify-model';

// Stage 7, the other way: a draft that cannot be published by itself is held. The gate holds it (a check still fails after the rounds of revision, or
// the piece cites another outlet) or the model check does not clear it. A hold is the Desk saying "not by myself", and it has three parts. The draft,
// the claims it cites and what every check said of it are written in the folder of the run, where the owner can read them and, later, release the
// piece. The desk state gets a record that a draft was held, with the reasons as codes, which the site's page of holds shows with a label for each.
// And nothing reaches the pages of the site: no piece and no ledger. The held text itself is never shown on the site.
//
// With a forge (a run that is not dry, on a machine that has a remote) there is a fourth part, and it comes before the record in the desk state: the piece is sent to the
// owner as a draft pull request (`sendToOwner` in `hold-pr.ts`), so that the hold in the desk state has the address of the pull request. The owner publishes the piece by
// merging it and discards it by closing it. When the forge fails, the run fails: the held draft is still in the folder of the run, and the desk state is as it was.

/** The run that is holding: its id, and the moment it is recording, as an ISO time. */
export interface HoldRun {
  runId: string;
  at: string;
}

export interface HoldResult {
  slug: string;
  /** The held draft, as a path: `<folder of the run>/held/<slug>.json`. */
  file: string;
  /** Why, as codes (see `holdReasonsOf`). */
  reasons: string[];
  /** The id of the commit of the desk state; null for a dry run. */
  commit: string | null;
  files: string[];
  /** The draft pull request that carries the piece to the owner; null when none was opened (a dry run, no forge, or a draft that cannot be written as a piece). */
  pullRequest: HoldPullRequest | null;
  /** Why no pull request was opened, when a forge was there to open one and the draft cannot be written as a piece; null otherwise. */
  note: string | null;
}

/** The reason that each way the model check can fail goes by, in the vocabulary of the gate package (`VERIFIER_REASONS`). */
const REASON_OF: Readonly<Record<VerifierFailure['code'], VerifierReason>> = {
  not_entailed: 'G10_NOT_ENTAILED',
  ambiguous: 'G10_AMBIGUOUS',
  unsupported: 'G10_LABEL_UNSUPPORTED',
  missing: 'G10_NOT_JUDGED',
};

/**
 * Why a piece was held, as codes, each once: the codes of the failures of the gate on the last draft, in the order the gate found them, then the gate's
 * hold reasons (`TIER2_ATTRIBUTION`), then what the model check said of the last draft (one reason for each way it failed). The model check says nothing of a draft
 * that the gate sent back, so a hold is made of the codes of the gate alone then. An earlier draft, which the composer rewrote, is not why the last one is held.
 */
export function holdReasonsOf(verified: Pick<VerifyResult, 'gate' | 'verifier' | 'history'>): string[] {
  const last = verified.history.at(-1);
  const codes = [
    ...verified.gate.failures.map((failure) => failure.code),
    ...verified.gate.holdReasons,
    ...(last?.verifierFailures ?? []).map((failure) => REASON_OF[failure.code]),
  ];
  return [...new Set(codes)];
}

/**
 * Hold the piece that `verified` says is not clear: write `held/<slug>.json` in the folder of the run, add a hold to the desk state with its reasons and
 * the categories of the piece, record the run as held, and commit the desk state. The held draft is written first and is kept even if the desk
 * state cannot be changed, because a refusal must never lose a draft.
 *
 * With a `forge` and a target that is not dry, the piece is first sent to the owner as a draft pull request (`sendToOwner`), and the hold records its address. A step of the forge
 * that fails ends the stage with its error, after the held draft was written and before the desk state was changed.
 *
 * Refuses a piece that Verify did not hold, a hold with no reason (the owner could not read what it says), and a slug that is not a plain slug (it is a file name).
 * A dry run writes the held draft all the same, as it writes every other artifact, and changes nothing in the site, and never touches the forge.
 */
export async function runHold(ctx: StageContext, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: HoldRun, forge?: ForgeTarget): Promise<HoldResult> {
  if (verified.outcome !== 'hold') throw new Error('runHold needs a piece that Verify held');
  const { draft } = verified;
  const reasons = holdReasonsOf(verified);
  if (reasons.length === 0) throw new Error(`runHold: the piece "${draft.slug}" is held but has no reason: neither the gate nor the model check failed it`);
  if (!isPlainSlug(draft.slug)) throw new Error(`runHold: "${draft.slug}" is not a plain slug, and a slug is a file name`);

  const file = path.join(ctx.runDir, 'held', `${draft.slug}.json`);
  const held: HeldArtifact = {
    date: ctx.date,
    slug: draft.slug,
    runId: run.runId,
    reasons,
    draft,
    claims: citedClaims(draft, claims),
    rounds: verified.rounds,
    gate: verified.gate,
    verifier: verified.verifier,
    history: verified.history,
  };
  await writeJsonFile(file, `the held draft ${draft.slug}.json`, held, HeldArtifact);

  const sent = forge === undefined || target.dry ? undefined : await sendToOwner(ctx, target, forge, held);
  const pullRequest = sent !== undefined && 'sent' in sent ? sent.sent : null;
  const note = sent !== undefined && 'notSent' in sent ? sent.notSent : null;

  let result: TargetResult;
  try {
    result = await target.apply({
      state: (state) =>
        recordRun(addHold(state, { at: run.at, categories: draft.categories, reasons, ...(pullRequest === null ? {} : { prUrl: pullRequest.url }) }), { at: run.at, outcome: 'held', runId: run.runId, slug: draft.slug }),
      message: `desk: hold ${draft.slug}`,
    });
  } catch (error) {
    if (pullRequest === null) throw error;
    const why = error instanceof Error ? error.message || error.name : String(error);
    throw new Error(`${why} (the draft pull request ${pullRequest.url} was opened and the hold is not recorded in the desk state: close the pull request, or record the hold by hand)`);
  }
  ctx.log(`hold: ${draft.slug} is held for ${reasons.join(', ')}, written to ${file}`);
  return { slug: draft.slug, file, reasons, commit: result.commit, files: result.files, pullRequest, note };
}
