import { allSentences, citedClaims, describeLocation } from '@robywire/gate';
import type { Claim, Draft, LedgerEntry, LedgerSection } from '@robywire/gate';
import { z } from 'zod';
import { ModelError } from '../index';
import type { ModelClient, ModelEffort, ModelUsage } from '../index';
import { buildVerifyUser, verifySystem } from '../prompts/verify';
import type { StageContext } from './context';

// G10, the model check: the second layer of the gate. The code checks (G1 to G9) cannot judge meaning, so a model that did not write
// the piece is given every fact sentence and every heading of it, with the passages of the sources they rely on, and says whether the
// passages entail them, and whether the basis and the status of each claim are supported. Anything but "entailed" fails, a verdict
// that is missing fails, and a verdict for something that was not asked is refused: the verifier is held to the same rule as every other model,
// that code decides what its answer means.

/**
 * The most tokens the reply may have: a verdict and a short reason for every item and every claim of a long piece, and the thinking that comes before them.
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
  section: LedgerSection;
  /** Where the sentence stands, as the gate says it for a failure (`describeLocation`). */
  where: string;
  text: string;
  /** The claims it cites that exist, each once, in the order cited. */
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
  /** Every fact sentence: the title, the description, the opening, the takeaways and the sections. */
  sentences: SentenceItem[];
  /** The heading of every section that has a sentence. */
  headings: HeadingItem[];
  /** The claims the piece cites (each once): the passages that the items rely on, whose basis and status are judged too. */
  claims: Claim[];
}

/** The ids of the claims in `ids` that `known` has, each once, in order. */
const existing = (ids: readonly string[], known: ReadonlySet<string>): string[] => [...new Set(ids)].filter((id) => known.has(id));

/**
 * What is to be judged in `draft`, whose claims are `claims`. Every fact sentence is an item. Analysis is the Desk's reading and
 * is not judged here; the gate limits what it may say: no new number, date or name. The limitation sentences are written from templates and
 * checked exactly by G8. Every heading of a section that has a sentence is an item, relying on the claims that the sentences of its
 * section cite: a section with no sentence has no heading on the page, so its heading is not judged. A claim that no sentence cites does not
 * matter, and a citation of a claim that does not exist is left out (G3 reports it).
 */
export function verifyPlanOf(draft: Draft, claims: readonly Claim[]): VerifyPlan {
  const known = new Set(claims.map((claim) => claim.id));
  const located = allSentences(draft);
  const sentences = located
    .filter((item) => item.sentence.kind === 'fact')
    .map((item): SentenceItem => ({ id: `s${item.index}`, section: item.section, where: describeLocation(item), text: item.sentence.text, claimIds: existing(item.sentence.claimIds, known) }));
  const headings = draft.sections.flatMap((section, at): HeadingItem[] => {
    const sentences = section.paragraphs.flat();
    if (sentences.length === 0) return [];
    return [{ id: `h${at}`, text: section.heading, where: `section "${section.heading}"`, claimIds: existing(sentences.flatMap((sentence) => sentence.claimIds), known) }];
  });
  return { sentences, headings, claims: citedClaims(draft, claims) };
}

const reason = z.string().min(1).max(400);

/**
 * The reply that the verifier must give: a verdict for items and a judgement of the labels of claims. The ids are strings here, and
 * `aggregateVerdicts` refuses one that was not asked about or is given twice, because only the plan knows which ids there are.
 */
export const VerifyReply = z.strictObject({
  verdicts: z.array(z.strictObject({ id: z.string().min(1), verdict: z.enum(['entailed', 'not_entailed', 'ambiguous']), reason })).max(500),
  labels: z.array(z.strictObject({ id: z.string().min(1), basisSupported: z.boolean(), statusSupported: z.boolean(), reason })).max(100),
});
export type VerifyReply = z.infer<typeof VerifyReply>;

/** One thing the verifier did not clear. */
export interface VerifierFailure {
  /** The id of the item (`s3`, `h1`) or of the claim (`c-7`). */
  id: string;
  kind: 'sentence' | 'heading' | 'label';
  /** Why: the verdict (`not_entailed`, `ambiguous`), a label that is `unsupported`, or no verdict at all (`missing`). */
  code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing';
  /** The verifier's reason, or what the Desk found missing. */
  reason: string;
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
 * What the verifier's reply means. A sentence or a heading is cleared only by the verdict `entailed`; `not_entailed` and `ambiguous`
 * fail it, and so does a verdict that is missing. A claim is cleared only if both its basis and its status are judged supported;
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
    const verdict = verdicts.get(item.id);
    if (verdict === undefined) failures.push({ id: item.id, kind, code: 'missing', reason: 'the verifier gave no verdict' });
    else if (verdict.verdict !== 'entailed') failures.push({ id: item.id, kind, code: verdict.verdict, reason: verdict.reason });
  }
  for (const claim of plan.claims) {
    const label = labels.get(claim.id);
    if (label === undefined) {
      failures.push({ id: claim.id, kind: 'label', code: 'missing', reason: `the verifier gave no verdict on the basis "${claim.basis}" and the status "${claim.status}"` });
      continue;
    }
    if (!label.basisSupported) failures.push({ id: claim.id, kind: 'label', code: 'unsupported', reason: `the basis "${claim.basis}" is not supported: ${label.reason}` });
    if (!label.statusSupported) failures.push({ id: claim.id, kind: 'label', code: 'unsupported', reason: `the status "${claim.status}" is not supported: ${label.reason}` });
  }

  const notes =
    failures.length === 0
      ? [`Judged ${plan.sentences.length} fact sentences and ${plan.headings.length} headings against the passages they rely on, and the basis and the status of ${plan.claims.length} claims; every one was supported.`]
      : failures.map((failure) => noteOf(failure, plan));
  return { verifier: { model, passed: failures.length === 0, notes }, failures };
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
  if (plan.sentences.length + plan.headings.length === 0) throw new Error('runVerifier needs a draft with at least one fact sentence or heading to judge');
  const { outcome } = await judgePlan(ctx.client, ctx.config.models.verify, plan);
  ctx.log(`verify: the model check ${outcome.verifier.passed ? 'passed' : `failed ${outcome.failures.length} times`}`);
  return outcome;
}
