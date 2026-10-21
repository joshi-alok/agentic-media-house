import { readFileSync } from 'node:fs';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, TIER2_OUTLET, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { defaultConfig } from '../../src/config';
import { HeldArtifact } from '../../src/run/artifacts';
import { DryTarget } from '../../src/run/target';
import { runCompose } from '../../src/stages/compose';
import { runHold } from '../../src/stages/hold';
import { runVerify } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext } from './context';
import { replyFromDraft } from './script';
import { makeSite } from './site';
import { verifierReply } from './verifier';

// What the tests of a held piece share: the verdicts that the real Compose and Verify stages give on scripts of a composer and a verifier that go wrong in each
// of the ways that a hold is for, and the held draft that the real Hold stage writes from each. Nothing here is written by hand that a stage writes.

/** The run that holds in these tests. */
export const HOLD_RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };

/** How many times a draft that is held goes back to the composer: every round that the configuration allows (`maxRevisionRounds` and `extraRevisionRounds`), so that a change of the limits does not break the helpers below. */
const ROUNDS = defaultConfig().maxRevisionRounds + defaultConfig().extraRevisionRounds;
/** What the composer says to each revision when it mends nothing: one reply for each of `rounds`. */
const UNMENDED = (rounds: number) => Array.from({ length: rounds }, () => ({ replacements: [] }));
/** One verifier reply for each time the draft is judged when it is sent back in each of `rounds`: the first draft and the draft after each round. */
const PASSES = <T>(rounds: number, reply: () => T): T[] => Array.from({ length: rounds + 1 }, reply);

/** A fact that cites two claims and says a payload that the claims do not say: the gate cannot match its number to them. */
export const INVENTED = (kilograms: number) => ({ kind: 'fact' as const, text: `The datasheet lists a ${kilograms} kg rated payload and a 1.4 m maximum reach.`, claimIds: ['c-8', 'c-9'] });

export type Reply = ReturnType<typeof replyFromDraft>;

/** The verdicts of the stages, in folders that `scratch` makes. */
export function verdicts(scratch: () => string) {
  /**
   * The verdict of Verify on a piece, made by the stages: the composer says `reply` first and then each of `revisions`, and the verifier gives the replies
   * that `verifier` makes from the plan of the first draft (one for each pass that the gate clears; the draft does not change in the tests that script more than one).
   */
  async function verdictOn(options: { reply?: Reply; claims?: Claim[]; revisions?: unknown[]; verifier?: (plan: ReturnType<typeof verifyPlanOf>) => unknown[] }) {
    const made = stageContext(scratch);
    const claims = options.claims ?? GOLDEN_CLAIMS;
    made.fake.script('compose', options.reply ?? replyFromDraft(), ...(options.revisions ?? []));
    const composed = await runCompose(made.ctx, claims);
    for (const reply of options.verifier?.(verifyPlanOf(composed.draft, claims)) ?? []) made.fake.script('verify', reply);
    const verified = await runVerify(made.ctx, claims, composed);
    return { ...made, claims, verified };
  }

  /**
   * A piece that cites another outlet, written as an attribution ("Mercer Wire reports that ..."): the gate clears it, because another outlet no longer forces a
   * hold, and the model check holds it: the verifier says that the attributed sentence is not entailed, in every pass, and the composer does not mend it. The
   * hold is a real one of the model check (G10_NOT_ENTAILED), and the held draft has the tier-2 claim, its outlet and the attributed sentence.
   */
  async function tier2() {
    const variant = makeTier2Variant(cloneGolden());
    return verdictOn({
      reply: replyFromDraft(variant.draft),
      claims: variant.claims,
      revisions: UNMENDED(ROUNDS),
      verifier: (plan) => {
        const attributed = plan.sentences.find((item) => item.text.startsWith(TIER2_OUTLET))?.id as string;
        return PASSES(ROUNDS, () => verifierReply(plan, { verdicts: { [attributed]: 'not_entailed' } }));
      },
    });
  }

  /** A piece with a number that its claims do not say, which the composer does not mend in the rounds that it has: the gate holds it with a failure of G4. */
  async function gateFailure() {
    const reply = replyFromDraft();
    reply.takeaways[1] = INVENTED(15);
    return verdictOn({ reply, revisions: UNMENDED(ROUNDS) });
  }

  /** A piece that the gate clears and the model check does not: the verifier finds a sentence ambiguous and a claim's label not supported, in every pass. */
  async function modelCheck() {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const sentence = plan.sentences[3]?.id as string;
    const claim = plan.claims[0]?.id as string;
    return verdictOn({
      revisions: UNMENDED(ROUNDS),
      verifier: () => PASSES(ROUNDS, () => verifierReply(plan, { verdicts: { [sentence]: 'ambiguous' }, unsupported: [claim], omit: [plan.sentences[5]?.id as string] })),
    });
  }

  return { verdictOn, tier2, gateFailure, modelCheck };
}

/** What a verdict is made of, as `verdicts` gives it. */
export type Verdict = Awaited<ReturnType<ReturnType<typeof verdicts>['tier2']>>;

/**
 * The draft that the Hold stage keeps of a verdict: the stage is run on a site that it only goes through the motions for (a dry run), and what it wrote
 * to the folder of the run is read back and checked against the schema, so the held draft is exactly what a run leaves.
 */
export async function heldOf(scratch: () => string, verdict: Verdict): Promise<HeldArtifact> {
  const result = await runHold(verdict.ctx, new DryTarget(makeSite(scratch())), verdict.claims, verdict.verified, HOLD_RUN);
  return HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
}
