import { allSentences, describeLocation, normaliseQuotes, runGate } from '@robywire/gate';
import type { Claim, Draft, Failure, GateResult } from '@robywire/gate';
import { z } from 'zod';
import { ComposeArtifact, VerifyArtifact, writeArtifact } from '../index';
import { buildReviseUser, promptClaimIds, reviseSystem } from '../prompts/compose';
import type { ReviseItem } from '../prompts/compose';
import { COMPOSE_EFFORT, COMPOSE_MAX_OUTPUT_TOKENS, gateContextOf } from './compose';
import type { ComposeResult } from './compose';
import type { StageContext } from './context';
import { ReplySentence, finishDraft } from './draft-assembly';
import { runVerifier } from './verify-model';
import type { VerifierFailure } from './verify-model';

// Stage 6, Verify: the gate, then the model check (G10), and what follows a no. The gate (G1 to G9) judges the draft first, because
// it costs nothing; only a draft that it clears is shown to the verifier model. A draft that fails either is sent back to the
// composer with only the sentences and headings that failed and the reasons, and the replacements are put into the draft in the
// place of the sentences they replace; then the whole draft is judged again. This goes on for at most `config.maxRevisionRounds`
// rounds. A draft that is clean at the end is `publish`, unless it cites another outlet, in which case it is `hold` however clean it is,
// and a draft that is not clean at the end is `hold`: nothing is ever published on the strength of a draft that was not cleared.

/** What was found wrong with one sentence or heading of a draft: its id (`s3`, the sentence, or `h1`, the heading of a section) and why. */
export interface Problem {
  id: string;
  reason: string;
}

/** The problems that can be sent back, and the ones that cannot (what the composer cannot repair by rewriting a sentence or a heading). */
export interface Problems {
  problems: Problem[];
  unattached: string[];
}

/**
 * Which sentences and headings of `draft` the failures point at. Sentences are numbered as the gate numbers them, from 0 over the whole piece
 * (`allSentences`), and a section by its place, from 0.
 *
 * A gate failure points at a sentence when its `where` is the place of the sentence (`describeLocation`), at every sentence of the opening
 * when it is `opening` (the length of the opening is the length of its sentences), at a heading when it is `section "<heading>"`, and, for
 * a banned phrase, at every sentence and heading that has the phrase. A failure of the model check points at the sentence or the heading it judged.
 * Every other failure is `unattached`: it is about the piece as a whole (its length, its sections, its categories), about a claim (the
 * basis or the status of a claim, which no sentence can change), or about a sentence that code wrote (a limitation), and rewriting a sentence cannot
 * mend it. A reason is the gate's code and message, or what the verifier said. A limitation sentence is never pointed at: it is made again from the claims.
 */
export function problemsOf(draft: Draft, gate: GateResult, failures: readonly VerifierFailure[]): Problems {
  const located = allSentences(draft).filter((item) => item.sentence.kind !== 'limitation');
  const sentenceIds = (test: (item: (typeof located)[number]) => boolean): string[] => located.filter(test).map((item) => `s${item.index}`);
  const headingIds = (test: (heading: string) => boolean): string[] => draft.sections.flatMap((section, at) => (test(section.heading) ? [`h${at}`] : []));
  const fold = (text: string): string => normaliseQuotes(text).toLowerCase();

  const idsOf = (failure: Failure): string[] => {
    const { where } = failure;
    if (where === undefined) return [];
    if (failure.code === 'G9_BANNED_PHRASE') return [...sentenceIds((item) => fold(item.sentence.text).includes(fold(where))), ...headingIds((heading) => fold(heading).includes(fold(where)))];
    if (where === 'opening') return sentenceIds((item) => item.section === 'opening');
    const heading = /^section "(.*)"$/.exec(where);
    if (heading !== null) return headingIds((text) => text === heading[1]);
    return sentenceIds((item) => describeLocation(item) === where);
  };

  const result: Problems = { problems: [], unattached: [] };
  for (const failure of gate.failures) {
    // The gate reports a banned phrase once for every place it is in, each time with the phrase for its `where`, so each place gets the same sentence.
    const reason = failure.code === 'G9_BANNED_PHRASE' ? `${failure.code}: the banned phrase "${failure.where}" appears here` : `${failure.code}: ${failure.message}`;
    const ids = idsOf(failure);
    if (ids.length === 0) result.unattached.push(reason);
    for (const id of ids) result.problems.push({ id, reason });
  }
  for (const failure of failures) {
    if (failure.kind === 'label') {
      result.unattached.push(`claim ${failure.id}: ${failure.reason}`);
      continue;
    }
    const what = failure.code === 'missing' ? 'the model check gave no verdict on it' : `the model check judged it ${failure.code.replace('_', ' ')} by the passages it relies on`;
    result.problems.push({ id: failure.id, reason: `${what}: ${failure.reason}` });
  }
  const once = <T>(items: T[]): T[] => [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];
  return { problems: once(result.problems), unattached: once(result.unattached) };
}

/**
 * The reply that the composer must give to a revision: for some of the items it was sent, a new sentence or a new heading, by id. The reply
 * need not cover every item (an item it leaves out stays as it is, and fails again), but it may not rewrite an item it was not sent, rewrite one
 * twice, or give a heading a sentence or a sentence a heading. Strict at every level.
 */
export function reviseReplySchema(items: readonly Pick<ReviseItem, 'id' | 'kind'>[]) {
  const entry = z.union([z.strictObject({ id: z.string(), sentence: ReplySentence }), z.strictObject({ id: z.string(), heading: z.string() })]);
  return z.strictObject({ replacements: z.array(entry).max(items.length) }).superRefine((reply, context) => {
    const seen = new Set<string>();
    reply.replacements.forEach((replacement, at) => {
      const item = items.find((candidate) => candidate.id === replacement.id);
      const wrong =
        item === undefined
          ? 'is not an item that was sent'
          : seen.has(replacement.id)
            ? 'is rewritten twice'
            : 'sentence' in replacement === (item.kind === 'heading')
              ? 'is rewritten as the wrong kind of thing: a sentence for a heading or a heading for a sentence'
              : undefined;
      seen.add(replacement.id);
      if (wrong !== undefined) context.addIssue({ code: 'custom', path: ['replacements', at, 'id'], message: `the item "${replacement.id}" ${wrong}` });
    });
  });
}

/** `s12` is the sentence, `h1` the heading of the section, and any other id is a bug of the Desk. */
function placeOf(id: string): { kind: 'sentence' | 'heading'; at: number } {
  const match = /^([sh])(\d+)$/.exec(id);
  if (match === null) throw new Error(`reviseDraft: "${id}" is not the id of a sentence or a heading`);
  return { kind: match[1] === 's' ? 'sentence' : 'heading', at: Number(match[2]) };
}

/**
 * What the composer is shown of the sentence or the heading `id` of `draft`. The ids of the claims that a sentence cites were written by the
 * composer: only those of claims in `known` are kept (`promptClaimIds`), and the others are logged, shortened to 40 characters, as one line.
 */
function itemOf(draft: Draft, id: string, reasons: string[], known: ReadonlySet<string>, log: (line: string) => void): ReviseItem {
  const { kind, at } = placeOf(id);
  if (kind === 'heading') {
    const section = draft.sections[at];
    if (section === undefined) throw new Error(`reviseDraft: the draft has no section ${at}`);
    return { id, kind: 'heading', section: 'body', text: section.heading, claimIds: [], attributed: false, reasons };
  }
  const found = allSentences(draft)[at];
  if (found === undefined || found.sentence.kind === 'limitation') throw new Error(`reviseDraft: the draft has no sentence ${at} that can be rewritten`);
  const { sentence } = found;
  const { kept, dropped } = promptClaimIds(sentence.claimIds, known);
  if (dropped.length > 0) {
    const shown = dropped.map((claimId) => JSON.stringify(claimId.length > 40 ? `${claimId.slice(0, 40)}...` : claimId)).join(', ');
    const one = dropped.length === 1;
    log(`verify: item ${id} cites ${shown}, which ${one ? 'is not the id of a claim' : 'are not ids of claims'}, so the composer is not told of ${one ? 'it' : 'them'}`);
  }
  return { id, kind: sentence.kind, section: found.section, text: sentence.text, claimIds: kept, attributed: sentence.kind === 'fact' && sentence.attributed === true, reasons };
}

/** A copy of `draft` in which each sentence in `sentences` (by its number) and each heading in `headings` (by its section) is replaced. */
function replaceIn(draft: Draft, sentences: ReadonlyMap<number, ReplySentence>, headings: ReadonlyMap<number, string>): Draft {
  const copy = structuredClone(draft);
  // `allSentences` returns the sentences of the draft that it is given, not copies, so changing one of them changes the copy.
  for (const item of allSentences(copy)) {
    const replacement = sentences.get(item.index);
    if (replacement === undefined) continue;
    const sentence: Record<string, unknown> = item.sentence;
    for (const key of Object.keys(sentence)) delete sentence[key];
    Object.assign(sentence, structuredClone(replacement));
  }
  for (const [at, heading] of headings) (copy.sections[at] as Draft['sections'][number]).heading = heading;
  return copy;
}

/**
 * Send the composer only what failed, and put what it sends back into the draft. `problems` are the sentences and headings of `draft` to rewrite
 * (by id, each with its reasons; an id given twice has all its reasons) and none may be empty. One call is made, in the role `compose`, with a
 * prompt of its own (`reviseSystem`): the claims, and the failing items in blocks each with the problems found in it; no other sentence of the piece is
 * shown. The reply is checked (`reviseReplySchema`; a reply that is not valid is a `schema` error that ends the run), each replacement takes the place
 * of the sentence or heading it replaces, and an item the composer did not rewrite stays as it was. The new draft is what `finishDraft` makes of that:
 * the slug follows the title, and the limitation sentences are made again from the claims the new sentences cite. The draft given is not changed.
 */
export async function reviseDraft(ctx: StageContext, claims: Claim[], draft: Draft, problems: Problem[]): Promise<Draft> {
  if (problems.length === 0) throw new Error('reviseDraft needs a problem to send back: with none, there is nothing to ask');
  const reasons = new Map<string, string[]>();
  for (const { id, reason } of problems) reasons.set(id, [...new Set([...(reasons.get(id) ?? []), reason])]);
  const known = new Set(claims.map((claim) => claim.id));
  const items = [...reasons]
    .map(([id, why]) => itemOf(draft, id, why, known, ctx.log))
    .sort((a, b) => (a.kind === 'heading' ? 1 : 0) - (b.kind === 'heading' ? 1 : 0) || placeOf(a.id).at - placeOf(b.id).at);

  const reply = await ctx.client.json({
    role: 'compose',
    model: ctx.config.models.compose,
    system: reviseSystem(),
    user: buildReviseUser(claims, items),
    schema: reviseReplySchema(items),
    maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
    effort: COMPOSE_EFFORT,
  });

  const sentences = new Map<number, ReplySentence>();
  const headings = new Map<number, string>();
  for (const replacement of reply.value.replacements) {
    if ('sentence' in replacement) sentences.set(placeOf(replacement.id).at, replacement.sentence);
    else headings.set(placeOf(replacement.id).at, replacement.heading);
  }
  const { slug: _slug, publishedAt: _publishedAt, author: _author, limitations: _limitations, ...body } = replaceIn(draft, sentences, headings);
  return finishDraft(body, claims, ctx);
}

/** What the Verify stage hands on. */
export interface VerifyResult {
  /** `publish` only when the gate cleared the last draft and the model check passed; `hold` otherwise, whatever the reason. */
  outcome: 'publish' | 'hold';
  /** The last draft, and what the gate and the model check said of it. */
  draft: Draft;
  gate: GateResult;
  verifier: VerifyArtifact['verifier'];
  /** How many times the draft went back to the composer: 0 when it was clean the first time. */
  rounds: number;
  /** Every pass, in order (see `VerifyArtifact`). */
  history: VerifyArtifact['history'];
}

/**
 * Judge the draft that Compose wrote, send back what fails, and say whether the piece may be published.
 *
 * Each round: the gate's verdict on the draft (Compose gave it for the first; later it is run again); when the gate found no failure, the model
 * check (`runVerifier`; a draft that code has sent back is not shown to the model). A draft with no failure of either is done. Otherwise, when
 * rounds are left (`config.maxRevisionRounds`) and there is something that a rewritten sentence or heading can mend (`problemsOf`), `reviseDraft` makes a new draft and the
 * next round judges it; when there is not, the draft is held. A failure that no sentence can mend (the length of the piece, the basis of a claim)
 * is not sent anywhere: it is recorded, and the draft is held when the rounds that could mend the rest are over.
 *
 * The outcome is `publish` only for a draft that the gate routes to `publish` and the model check passed. A draft that cites another outlet is routed to `hold`
 * by the gate (TIER2_ATTRIBUTION), so it is held even though it is clean: it is never published by itself. When the model check never saw the last draft,
 * `verifier` says so and is not passed.
 *
 * Writes `05-compose.json` (every draft, the first and each revision) and `06-verify.json` (every pass). Nothing is written when a call fails: the error ends the run.
 */
export async function runVerify(ctx: StageContext, claims: Claim[], composed: ComposeResult): Promise<VerifyResult> {
  const gateContext = gateContextOf(ctx);
  const drafts: Draft[] = [composed.draft];
  const history: VerifyArtifact['history'] = [];
  let { draft, gate } = composed;
  let verifier: VerifyArtifact['verifier'] | undefined;

  for (let round = 0; ; round++) {
    const checked = gate.failures.length === 0 ? await runVerifier(ctx, draft, claims) : undefined;
    verifier = checked?.verifier;
    const clean = checked?.verifier.passed === true;
    const { problems, unattached } = problemsOf(draft, gate, checked?.failures ?? []);
    const send = !clean && round < ctx.config.maxRevisionRounds && problems.length > 0;
    const ids = [...new Set(problems.map((problem) => problem.id))];
    history.push({ round, gate: structuredClone(gate), verifier: verifier ?? null, verifierFailures: structuredClone(checked?.failures ?? []), sent: send ? ids : [] });
    ctx.log(
      `verify: round ${round}: the gate says ${gate.route}, the model check ${checked === undefined ? 'was not asked' : checked.verifier.passed ? 'passed' : 'failed'}` +
        (send ? `; sent back: ${ids.join(' ')}` : unattached.length > 0 ? `; problems that no sentence can mend: ${unattached.length}` : ''),
    );
    if (!send) break;
    draft = await reviseDraft(ctx, claims, draft, problems);
    drafts.push(draft);
    gate = runGate({ draft, claims }, gateContext);
  }

  const last = verifier ?? { model: ctx.config.models.verify, passed: false, notes: ['The model check was not run on this draft: the gate found failures first.'] };
  const outcome = gate.route === 'publish' && last.passed ? 'publish' : 'hold';
  const rounds = drafts.length - 1;
  await writeArtifact(ctx.runDir, '05-compose', { date: ctx.date, drafts }, ComposeArtifact);
  await writeArtifact(ctx.runDir, '06-verify', { date: ctx.date, outcome, rounds, gate: structuredClone(gate), verifier: last, history }, VerifyArtifact);
  return { outcome, draft, gate, verifier: last, rounds, history };
}
