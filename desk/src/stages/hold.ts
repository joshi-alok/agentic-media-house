import path from 'node:path';
import { citedClaims } from '@robywire/gate';
import type { Claim, VerifierReason } from '@robywire/gate';
import { HeldArtifact, addHold, isPlainSlug, recordRun, writeJsonFile } from '../index';
import type { PublishTarget } from '../index';
import type { StageContext } from './context';
import type { VerifyResult } from './verify';
import type { VerifierFailure } from './verify-model';

// Stage 7, the other way: a draft that cannot be published by itself is held. The gate holds it (a check still fails after the rounds of revision, or
// the piece cites another outlet) or the model check does not clear it. A hold is the Desk saying "not by myself", and it has three parts. The draft,
// the claims it cites and what every check said of it are written in the folder of the run, where the owner can read them and, later, release the
// piece. The desk state gets a record that a draft was held, with the reasons as codes, which the site's page of holds shows with a label for each.
// And nothing reaches the pages of the site: no piece and no ledger. The held text itself is never shown on the site.

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
 * Refuses a piece that Verify did not hold, a hold with no reason (the owner could not read what it says), and a slug that is not a plain slug (it is a file name).
 * A dry run writes the held draft all the same, as it writes every other artifact, and changes nothing in the site.
 */
export async function runHold(ctx: StageContext, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: HoldRun): Promise<HoldResult> {
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

  const result = await target.apply({
    state: (state) => recordRun(addHold(state, { at: run.at, categories: draft.categories, reasons }), { at: run.at, outcome: 'held', runId: run.runId, slug: draft.slug }),
    message: `desk: hold ${draft.slug}`,
  });
  ctx.log(`hold: ${draft.slug} is held for ${reasons.join(', ')}, written to ${file}`);
  return { slug: draft.slug, file, reasons, commit: result.commit, files: result.files };
}
