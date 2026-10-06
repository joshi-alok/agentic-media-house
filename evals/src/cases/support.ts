import { allSentences, buildLimitations, citedClaims } from '@robywire/gate';
import type { Claim, GateInput, LimitationSentence, Sentence } from '@robywire/gate';

// Small helpers for writing seeded cases. They throw when they find nothing,
// so a case that points at a sentence the golden piece no longer has fails
// loudly instead of quietly changing nothing.

/** The claim with this id in `input`. */
export function claimOf(input: GateInput, id: string): Claim {
  const found = input.claims.find((claim) => claim.id === id);
  if (found === undefined) throw new Error(`seeded case: the golden piece has no claim ${id}`);
  return found;
}

/** The limitation sentence of `input` that cites claim `id`. It is the live sentence, so a case can change it. */
export function limitationCiting(input: GateInput, id: string): LimitationSentence {
  const found = input.draft.limitations.find((sentence) => sentence.claimIds.includes(id));
  if (found === undefined) throw new Error(`seeded case: no limitation sentence of the golden piece cites ${id}`);
  return found;
}

/** The first sentence of the draft, in document order, whose text contains `fragment`. It is the live sentence, so a case can change it. */
export function sentenceWith(input: GateInput, fragment: string): Sentence {
  const found = allSentences(input.draft).find((item) => item.sentence.text.includes(fragment));
  if (found === undefined) throw new Error(`seeded case: no sentence of the golden piece contains "${fragment}"`);
  return found.sentence;
}

/**
 * Make claim `id` one that only `outlet` reports: a tier-2 source with the basis `reported`. A reported claim
 * needs a limitation sentence, so the limitations are written again from the claims the piece cites. Call it
 * after every sentence that should cite the claim does.
 */
export function reportedBy(input: GateInput, id: string, outlet: string): void {
  const claim = claimOf(input, id);
  claim.source.tier = 2;
  claim.source.outlet = outlet;
  claim.basis = 'reported';
  input.draft.limitations = buildLimitations(citedClaims(input.draft, input.claims));
}

/** Write the sentence that contains `fragment` as an attribution to `outlet`: the new text, marked attributed. */
export function attributeTo(input: GateInput, fragment: string, text: string): void {
  const sentence = sentenceWith(input, fragment);
  sentence.text = text;
  if (sentence.kind === 'fact') sentence.attributed = true;
}
