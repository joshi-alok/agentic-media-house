import { allSentences } from '@robywire/gate';
import type { Claim, GateInput, Sentence } from '@robywire/gate';

// Small helpers for writing seeded cases. They throw when they find nothing,
// so a case that points at a sentence the golden piece no longer has fails
// loudly instead of quietly changing nothing.

/** The claim with this id in `input`. */
export function claimOf(input: GateInput, id: string): Claim {
  const found = input.claims.find((claim) => claim.id === id);
  if (found === undefined) throw new Error(`seeded case: the golden piece has no claim ${id}`);
  return found;
}

/** The first sentence of the draft, in document order, whose text contains `fragment`. It is the live sentence, so a case can change it. */
export function sentenceWith(input: GateInput, fragment: string): Sentence {
  const found = allSentences(input.draft).find((item) => item.sentence.text.includes(fragment));
  if (found === undefined) throw new Error(`seeded case: no sentence of the golden piece contains "${fragment}"`);
  return found.sentence;
}
