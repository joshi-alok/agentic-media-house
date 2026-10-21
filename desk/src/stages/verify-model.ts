import { allSentences, citedClaims, describeLocation } from '@robywire/gate';
import type { Claim, Draft, LedgerEntry, LedgerSection } from '@robywire/gate';
import { z } from 'zod';
import { ModelError } from '../index';
import type { LoweredStatus, ModelClient, ModelEffort, ModelUsage } from '../index';
import { buildVerifyUser, verifySystem } from '../prompts/verify';
import type { StageContext } from './context';

// G10, the model check: the second layer of the gate. The code checks (G1 to G9) cannot judge meaning, so a model that did not write
// the piece is given every fact sentence, every analysis sentence and every heading of it, with the passages of the sources they rely on, and says whether the
// passages entail them (for analysis: whether it adds nothing that they do not support), and whether the basis and the status of each claim are supported. Anything but "entailed" fails, an "entailed" over a
// non-empty list of what the passages do not state fails too, a verdict that is missing fails, and a verdict for something that was not asked is
// refused: the verifier is held to the same rule as every other model, that code decides what its answer means.

/**
 * The most tokens the reply may have: a reason, a list of what no passage states and a verdict for every item of a long piece, a judgement for every claim, and the thinking that comes before them.
 * On the model that checks, thinking counts toward this limit (as with `EXTRACT_MAX_OUTPUT_TOKENS`), and a reply that is cut off at the limit is a `refused` error
 * that ends the run, so the limit is generous (it was 8000).
 */
export const VERIFY_MAX_OUTPUT_TOKENS = 16000;

/**
 * How hard the model may think while it judges whether a sentence is supported, unsupported or distorted: `medium`, because this is the one job where a second look
 * is the point. It is a first setting to be measured on the labelled set (`npm run evals:verifier -- --client api`), not a conclusion.
 */
export const VERIFY_EFFORT: ModelEffort = 'medium';

/** What the verifier judges of a sentence. */
export interface SentenceItem {
  /** `s` and the position of the sentence in the piece, counting from 0 (`LocatedSentence.index` of the gate). */
  id: string;
  /** A statement of fact, or the Desk's own reading of the facts (analysis), which the verifier is told to judge by a looser rule. */
  kind: 'fact' | 'analysis';
  section: LedgerSection;
  /** Where the sentence stands, as the gate says it for a failure (`describeLocation`). */
  where: string;
  text: string;
  /** The claims it cites that exist, each once, in the order cited. An analysis sentence that cites none rests on every claim the piece cites. */
  claimIds: string[];
}

/** What the verifier judges of a heading. */
export interface HeadingItem {
  /** `h` and the position of the section in the piece, counting from 0. */
  id: string;
  text: string;
  where: string;
  /** The claims cited by any sentence of the section that exist, each once, in the order cited. */
  claimIds: string[];
}

/** Everything the verifier is asked to judge of a draft. */
export interface VerifyPlan {
  /** Every fact and analysis sentence: the title, the description, the opening, the takeaways and the sections. A limitation sentence is not one. */
  sentences: SentenceItem[];
  /** The heading of every section that has a sentence. */
  headings: HeadingItem[];
  /** The claims the piece cites (each once): the passages that the items rely on, whose basis and status are judged too. */
  claims: Claim[];
}

/** The ids of the claims in `ids` that `known` has, each once, in order. */
const existing = (ids: readonly string[], known: ReadonlySet<string>): string[] => [...new Set(ids)].filter((id) => known.has(id));

/**
 * What is to be judged in `draft`, whose claims are `claims`. Every fact sentence is an item. An analysis sentence is judged too: it may not bring in an entity,
 * event, figure or claim that the passages it relies on do not support (the gate's own limits on analysis stay as well). The limitation sentences are written from templates and
 * checked exactly by G8. Every heading of a section that has a sentence is an item, relying on the claims that the sentences of its
 * section cite: a section with no sentence has no heading on the page, so its heading is not judged. A claim that no sentence cites does not
 * matter, and a citation of a claim that does not exist is left out (G3 reports it).
 */
export function verifyPlanOf(draft: Draft, claims: readonly Claim[]): VerifyPlan {
  const known = new Set(claims.map((claim) => claim.id));
  const located = allSentences(draft);
  const cited = citedClaims(draft, claims);
  const sentences = located
    .filter((item) => item.sentence.kind !== 'limitation')
    .map((item): SentenceItem => {
      const own = existing(item.sentence.claimIds, known);
      // An analysis sentence that cites nothing rests on the whole of what the piece cites.
      const kind = item.sentence.kind === 'analysis' ? 'analysis' : 'fact';
      return { id: `s${item.index}`, kind, section: item.section, where: describeLocation(item), text: item.sentence.text, claimIds: kind === 'analysis' && own.length === 0 ? cited.map((claim) => claim.id) : own };
    });
  const headings = draft.sections.flatMap((section, at): HeadingItem[] => {
    const sentences = section.paragraphs.flat();
    if (sentences.length === 0) return [];
    return [{ id: `h${at}`, text: section.heading, where: `section "${section.heading}"`, claimIds: existing(sentences.flatMap((sentence) => sentence.claimIds), known) }];
  });
  return { sentences, headings, claims: cited };
}

const reason = z.string().min(1).max(400);
/** One thing an item says that no passage states or directly implies, in a few words. Trimmed, so that an item of only spaces is empty and refused. */
const unstated = z.string().trim().min(1).max(200);

/**
 * The reply that the verifier must give: a verdict for items and a judgement of the labels of claims. The ids are strings here, and
 * `aggregateVerdicts` refuses one that was not asked about or is given twice, because only the plan knows which ids there are.
 */
export const VerifyReply = z.strictObject({
  verdicts: z
    .array(
      // The order of these fields is the order in which the model writes them: its reason first, then what no passage states, and the verdict last, so that the
      // verdict follows from what the model has just said. `aggregateVerdicts` refuses a verdict that does not.
      z.strictObject({ id: z.string().min(1), reason, missing: z.array(unstated).max(8), verdict: z.enum(['entailed', 'not_entailed', 'ambiguous']) }),
    )
    .max(500),
  labels: z.array(z.strictObject({ id: z.string().min(1), basisSupported: z.boolean(), statusSupported: z.boolean(), reason })).max(100),
});
export type VerifyReply = z.infer<typeof VerifyReply>;

/** One thing the verifier did not clear. */
export interface VerifierFailure {
  /** The id of the item (`s3`, `h1`) or of the claim (`c-7`). */
  id: string;
  kind: 'sentence' | 'heading' | 'label';
  /**
   * Why: the verdict (`not_entailed`, `ambiguous`), a label that is `unsupported`, or no verdict at all (`missing`). The Desk recodes the verdict in two cases: an
   * `entailed` over a non-empty list of what no passage states is `not_entailed`, and a `not_entailed` with an empty list is `ambiguous`.
   */
  code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing';
  /** The verifier's reason, followed by what it says no passage states; or, where the Desk overrules the verdict or finds none, what the Desk found. */
  reason: string;
  /**
   * For a label that is not supported (`code` `unsupported`): which of the two it is, the `basis` or the `status`. Absent for a sentence or a heading, and for a label that was given no verdict
   * (`missing`), which says nothing about either. A failure in a record from before there was the field has none.
   */
  field?: 'basis' | 'status';
}

/** What G10 decided: the value of the `verifier` of a ledger, and each failure, for the revision that follows. */
export interface VerifierOutcome {
  verifier: NonNullable<LedgerEntry['verifier']>;
  failures: VerifierFailure[];
}

/** The note on a failure, in words for the owner: where, what the verifier found and why. */
function noteOf(failure: VerifierFailure, plan: VerifyPlan): string {
  const item = [...plan.sentences, ...plan.headings].find((candidate) => candidate.id === failure.id);
  if (item !== undefined) {
    const verdict = failure.code === 'missing' ? 'was not judged' : `was judged ${failure.code.replace('_', ' ')}`;
    return `${item.where} ${verdict}: ${failure.reason}`;
  }
  return `claim ${failure.id}: ${failure.reason}`;
}

/**
 * What the verifier's reply means. A sentence or a heading is cleared only by the verdict `entailed`, and only when its list of what the passages do not state is empty;
 * `not_entailed` and `ambiguous` fail it, and so does a verdict that is missing. The verdict must follow the list: `entailed` over a list that is not empty fails as
 * `not_entailed`, and `not_entailed` over an empty list fails as `ambiguous`, because the verifier named nothing. A claim is cleared only if both its basis and its status are judged supported;
 * a label that is not, or is missing, fails. The reply may not judge an id that the plan does not have, nor judge one twice: that is
 * a `schema` error of the model, which ends the run. `passed` is true only with no failure, and the notes say each failure (or, for a pass, what was
 * checked). Pure: the same plan and reply give the same outcome.
 */
export function aggregateVerdicts(model: string, plan: VerifyPlan, reply: VerifyReply): VerifierOutcome {
  const items = [...plan.sentences.map((item) => ({ item, kind: 'sentence' as const })), ...plan.headings.map((item) => ({ item, kind: 'heading' as const }))];
  const verdicts = new Map<string, VerifyReply['verdicts'][number]>();
  for (const verdict of reply.verdicts) {
    if (!items.some(({ item }) => item.id === verdict.id)) throw new ModelError('schema', `the verifier judged "${verdict.id}", which is not a sentence or a heading it was given`);
    if (verdicts.has(verdict.id)) throw new ModelError('schema', `the verifier judged "${verdict.id}" more than once`);
    verdicts.set(verdict.id, verdict);
  }
  const labels = new Map<string, VerifyReply['labels'][number]>();
  for (const label of reply.labels) {
    if (!plan.claims.some((claim) => claim.id === label.id)) throw new ModelError('schema', `the verifier judged the labels of "${label.id}", which is not a claim it was given`);
    if (labels.has(label.id)) throw new ModelError('schema', `the verifier judged the labels of "${label.id}" more than once`);
    labels.set(label.id, label);
  }

  const failures: VerifierFailure[] = [];
  for (const { item, kind } of items) {
    const fail = (code: VerifierFailure['code'], why: string) => failures.push({ id: item.id, kind, code, reason: why });
    const verdict = verdicts.get(item.id);
    if (verdict === undefined) {
      fail('missing', 'the verifier gave no verdict');
      continue;
    }
    const notStated = verdict.missing.join('; ');
    if (verdict.verdict === 'entailed') {
      // The verdict must follow the list: an item that the verifier itself found things missing from is not entailed, whatever it went on to say.
      if (notStated !== '') fail('not_entailed', `the verifier said entailed, but its own list of what the passages do not state is not empty: ${notStated}`);
    } else if (verdict.verdict === 'not_entailed' && notStated === '') {
      fail('ambiguous', `the verifier said not entailed but named nothing that the passages do not state (${verdict.reason})`);
    } else {
      fail(verdict.verdict, notStated === '' ? verdict.reason : `${verdict.reason} Not stated: ${notStated}`);
    }
  }
  for (const claim of plan.claims) {
    const label = labels.get(claim.id);
    if (label === undefined) {
      failures.push({ id: claim.id, kind: 'label', code: 'missing', reason: `the verifier gave no verdict on the basis "${claim.basis}" and the status "${claim.status}"` });
      continue;
    }
    if (!label.basisSupported) failures.push({ id: claim.id, kind: 'label', code: 'unsupported', field: 'basis', reason: `the basis "${claim.basis}" is not supported: ${label.reason}` });
    if (!label.statusSupported) failures.push({ id: claim.id, kind: 'label', code: 'unsupported', field: 'status', reason: `the status "${claim.status}" is not supported: ${label.reason}` });
  }
  return outcomeOf(model, plan, failures);
}

/** The note for a status that was lowered, in words that hold nothing that a model wrote, because the notes of a piece that is published go on its receipts page. */
const loweringNote = (entry: StatusLowering): string => `claim ${entry.claimId}: the status "${entry.from}" was lowered to "${entry.to}" because the model check did not find it in the passage.`;

/**
 * The outcome for `failures` of `plan`: passed only with none, and a note for each failure, or, for a pass, what was checked. `lowered` are the statuses that were lowered in this pass to
 * answer failures that are not in `failures` any more (see `lowerRejectedStatuses`), and `earlier` those lowered in the passes before it; each has a note after the rest, the earlier ones first,
 * so that the last pass, which is the one a piece carries, tells all of them.
 */
function outcomeOf(model: string, plan: VerifyPlan, failures: VerifierFailure[], lowered: readonly StatusLowering[] = [], earlier: readonly StatusLowering[] = []): VerifierOutcome {
  const facts = plan.sentences.filter((item) => item.kind === 'fact').length;
  const checked = `Judged ${facts} fact sentences, ${plan.sentences.length - facts} analysis sentences and ${plan.headings.length} headings against the passages they rely on, and the basis and the status of ${plan.claims.length} claims;`;
  const changed = lowered.length + earlier.length;
  const supported = changed === 0 ? 'every one was supported.' : `every sentence, heading and basis was supported, and so was every status except the ${changed} lowered below.`;
  const notes = [...(failures.length === 0 ? [`${checked} ${supported}`] : failures.map((failure) => noteOf(failure, plan))), ...earlier.map(loweringNote), ...lowered.map(loweringNote)];
  return { verifier: { model, passed: failures.length === 0, notes }, failures };
}

/** A status that was lowered: a `LoweredStatus` without the round, which only the stage that loops over rounds knows. */
export type StatusLowering = Omit<LoweredStatus, 'round'>;

/**
 * Answer the failures of the model check that a lower status mends. The model check judges the status of a claim against its passage; one it does not find is lowered to
 * `unspecified`, which says nothing about how far the thing has got, so that the piece then says less and never more. That is done for each failure that says a *status* was not
 * supported (`field` `status`, with the code `unsupported`) of a claim in `claims` whose status is not `unspecified` already. A basis that is not supported is not answered, because no basis
 * says nothing; neither is a label given no verdict, or a failure of a sentence or a heading.
 *
 * A claim whose status an earlier pass lowered (it is in `earlier`) is `unspecified` now, and the model check is asked about it again in every pass; if it rejects that status too, there is
 * nothing lower to lower it to and the piece is not worse for it, so the failure is set aside: no new lowering and no new note, the failure removed, and the claim's id is in `repeated`
 * so that the stage can say so. A claim that Extract itself gave as `unspecified` was never lowered, and a status of it that is rejected stays a failure.
 *
 * Returns the claims with those statuses lowered (a copy: the claims given are not changed, and when none is lowered they are returned as they are), what was lowered, in the order of the
 * claims, the claims whose lowered status was rejected again, and the outcome of the check without the failures that were answered: it passes when no other failure is left, and its notes
 * say what was lowered, and also what was lowered in the passes before this one (`earlier`), which are given because the notes of the last pass are the ones that a published piece
 * carries. Pure.
 */
export function lowerRejectedStatuses(
  plan: VerifyPlan,
  claims: Claim[],
  outcome: VerifierOutcome,
  earlier: readonly StatusLowering[] = [],
): { claims: Claim[]; lowered: StatusLowering[]; repeated: string[]; outcome: VerifierOutcome } {
  const lowered: StatusLowering[] = [];
  const repeated: string[] = [];
  const answered = new Set<VerifierFailure>();
  for (const claim of claims) {
    const failure = outcome.failures.find((candidate) => candidate.kind === 'label' && candidate.code === 'unsupported' && candidate.field === 'status' && candidate.id === claim.id);
    if (failure === undefined) continue;
    if (earlier.some((entry) => entry.claimId === claim.id)) {
      repeated.push(claim.id);
      answered.add(failure);
      continue;
    }
    if (claim.status === 'unspecified') continue;
    lowered.push({ claimId: claim.id, from: claim.status, to: 'unspecified', reason: failure.reason });
    answered.add(failure);
  }
  const ids = new Set(lowered.map((entry) => entry.claimId));
  const remaining = outcome.failures.filter((failure) => !answered.has(failure));
  if (lowered.length === 0 && earlier.length === 0) return { claims, lowered, repeated, outcome };
  return {
    claims: lowered.length === 0 ? claims : claims.map((claim): Claim => (ids.has(claim.id) ? { ...claim, status: 'unspecified' } : claim)),
    lowered,
    repeated,
    outcome: outcomeOf(outcome.verifier.model, plan, remaining, lowered, earlier),
  };
}

/**
 * Ask a verifier model about `plan` and say what it means: one call, in the role `verify`, with the model `model`, whose reply is checked against `VerifyReply`
 * and read by `aggregateVerdicts`. A reply that does not match, or that judges what was not asked, is a `schema` error. It is what `runVerifier` does for a
 * draft, and what the evals do for the sentences of the labelled set, so that both measure the same prompt and the same reading of the reply. Returns what
 * the call cost along with the outcome.
 */
export async function judgePlan(client: ModelClient, model: string, plan: VerifyPlan): Promise<{ outcome: VerifierOutcome; usage: ModelUsage }> {
  const reply = await client.json({
    role: 'verify',
    model,
    system: verifySystem(),
    user: buildVerifyUser({ claims: plan.claims, sentences: plan.sentences, headings: plan.headings }),
    schema: VerifyReply,
    maxOutputTokens: VERIFY_MAX_OUTPUT_TOKENS,
    effort: VERIFY_EFFORT,
  });
  return { outcome: aggregateVerdicts(model, plan, reply.value), usage: reply.usage };
}

/**
 * Ask the verifier model about `draft` and say what it means (see `judgePlan`), with the model that the configuration names for the role. A reply that does
 * not match `VerifyReply`, or that judges what was not asked, is a `schema` error that ends the run.
 */
export async function runVerifier(ctx: StageContext, draft: Draft, claims: Claim[]): Promise<VerifierOutcome> {
  const plan = verifyPlanOf(draft, claims);
  if (plan.sentences.length + plan.headings.length === 0) throw new Error('runVerifier needs a draft with at least one fact sentence, analysis sentence or heading to judge');
  const { outcome } = await judgePlan(ctx.client, ctx.config.models.verify, plan);
  ctx.log(`verify: the model check ${outcome.verifier.passed ? 'passed' : `failed ${outcome.failures.length} times`}`);
  return outcome;
}
