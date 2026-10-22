import { defaultContext, profileOverrides, runGate } from '@robywire/gate';
import type { Claim, Draft, GateContext, GateResult } from '@robywire/gate';
import type { ModelEffort } from '../model/types';
import { buildComposeUser, composeSystem } from '../prompts/compose';
import type { StageContext } from './context';
import { ComposeReply, assembleDraft } from './draft-assembly';

// Stage 5, Compose: write the piece. The model, in the role `compose`, is given the claims and writes sentences that cite them
// (never MDX, and never the slug, the date, the author or the limitations). Code assembles the draft from the reply and runs the gate
// on it. Whatever the gate finds is not an error of the stage: a draft the gate sends back is a normal result, and the Verify stage
// sends it back to the composer. The stage writes no artifact of its own; `05-compose.json` is written by Verify, which has every draft.

/** The most tokens the reply may have: a piece of 850 words is about 1,200 tokens, and every sentence also carries its claim ids and the JSON around them. */
export const COMPOSE_MAX_OUTPUT_TOKENS = 6000;

/** How hard the model may think while it writes from claims: `low`, as for any writing that follows fixed rules, which the gate then checks in code. */
export const COMPOSE_EFFORT: ModelEffort = 'low';

/** What the gate needs to know of the world: the slugs and the titles that are published, the ranges of the kind of piece, and the gate's own defaults for everything else. */
export function gateContextOf(ctx: Pick<StageContext, 'published' | 'profile'>): GateContext {
  return defaultContext({
    publishedSlugs: ctx.published.slugs,
    recentTitles: ctx.published.titles,
    ...(ctx.profile === undefined ? {} : { config: profileOverrides(ctx.profile) }),
  });
}

/** A draft, and what the gate says of it. */
export interface ComposeResult {
  draft: Draft;
  gate: GateResult;
}

/**
 * Compose the piece from `claims` and run the gate on it. One call is made, in the role `compose`; a reply that is not valid (see
 * `ComposeReply`) is a `schema` error that ends the run. The draft is `assembleDraft` of the reply, and the result is the draft with the
 * result of the gate: the route is `publish` when the gate found no blocker (a note does not stop a piece, and no check asks for a hold
 * any more), and `revise` when it found one.
 */
export async function runCompose(ctx: StageContext, claims: Claim[]): Promise<ComposeResult> {
  if (claims.length === 0) throw new Error('runCompose needs claims: Extract kept none');
  const reply = await ctx.client.json({
    role: 'compose',
    model: ctx.config.models.compose,
    system: composeSystem(ctx.profile),
    user: buildComposeUser(claims, ctx.date),
    schema: ComposeReply,
    maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
    effort: COMPOSE_EFFORT,
  });
  const draft = assembleDraft(reply.value, claims, ctx);
  const gate = runGate({ draft, claims }, gateContextOf(ctx));
  ctx.log(`compose: the gate says ${gate.route} (${gate.failures.length} failures, ${gate.warnings.length} notes, ${gate.holdReasons.length} hold reasons)`);
  return { draft, gate };
}
