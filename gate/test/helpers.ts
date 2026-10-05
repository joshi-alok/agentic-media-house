import type { GateInput } from '../src/gate';
import type { Claim, Draft, Sentence } from '../src/schemas';
import type { LocatedSentence } from '../src/sentences';
import { allSentences } from '../src/sentences';

export { allSentences };

/**
 * A deep copy of `base` with `change` applied to the copy. The base is never
 * touched, even when it is the frozen golden fixture, so a test can start from
 * `cloneGolden()` and describe in one function what it breaks.
 */
export function mutate(base: GateInput, change: (copy: GateInput) => void): GateInput {
  const copy = structuredClone(base);
  change(copy);
  return copy;
}

/**
 * The first sentence of `draft`, in document order, that `predicate` accepts.
 * The sentence returned is the one inside `draft`, so a test can change it in
 * place. Throws if there is none, so a typo in a test fails loudly.
 */
export function findSentence(draft: Draft, predicate: (sentence: Sentence, located: LocatedSentence) => boolean): Sentence {
  const found = allSentences(draft).find((item) => predicate(item.sentence, item));
  if (found === undefined) throw new Error('findSentence: no sentence in the draft matches the predicate');
  return found.sentence;
}

/** The claim with this id. Throws if there is none. */
export function claimById(claims: readonly Claim[], id: string): Claim {
  const found = claims.find((claim) => claim.id === id);
  if (found === undefined) throw new Error(`claimById: no claim with id ${id}`);
  return found;
}
