import { createHash } from 'node:crypto';
import type { GateInput } from '../gate';
import { buildLimitations } from '../limitations';
import { allSentences, citedClaims } from '../sentences';

// A fictional outlet and its page, like every other name and address in the
// fixtures: nothing here is a real publication.
export const TIER2_OUTLET = 'Mercer Wire';
const TIER2_URL = 'https://mercer-wire.example/robotics/fixture-robotics-offering';
const TIER2_QUOTE = 'The offering drew 7 investors, according to people familiar with the filing.';
const TIER2_QUOTE_START = 96;

const CLAIM_ID = 'c-19';
const PLAIN_SENTENCE = 'It lists 7 investors in the round.';
const ATTRIBUTED_SENTENCE = `${TIER2_OUTLET} reports that 7 investors took part in the round.`;

/**
 * A copy of `base` (the golden piece, or a variant of it) in which the investor
 * count comes from another outlet instead of from the filing. Claim c-19 is now
 * a tier-2 claim of Mercer Wire with the basis `reported`, and the sentence that
 * cites it is written the way check G6 requires: it names the outlet and is
 * marked `attributed`. A reported claim needs a limitation sentence, so the
 * limitations are built again from the claims the piece cites.
 *
 * Nothing fails in the gate, but a piece that rests on another outlet is never
 * published by itself: the gate asks for a hold (TIER2_ATTRIBUTION) and the
 * owner decides. `base` is never changed.
 */
export function makeTier2Variant(base: GateInput): GateInput {
  const copy = structuredClone(base);

  const claim = copy.claims.find((item) => item.id === CLAIM_ID);
  if (claim === undefined) throw new Error(`makeTier2Variant: the piece has no claim ${CLAIM_ID}`);
  const found = allSentences(copy.draft).find((item) => item.sentence.kind === 'fact' && item.sentence.text === PLAIN_SENTENCE);
  if (found === undefined || found.sentence.kind !== 'fact') {
    throw new Error(`makeTier2Variant: the piece has no sentence "${PLAIN_SENTENCE}"`);
  }

  claim.source = {
    url: TIER2_URL,
    tier: 2,
    // As in the golden piece: the SHA-256 of the address followed by the quote, which is not the hash of a real page.
    snapshotHash: createHash('sha256')
      .update(TIER2_URL + TIER2_QUOTE)
      .digest('hex'),
    retrievedAt: claim.source.retrievedAt,
    outlet: TIER2_OUTLET,
  };
  claim.basis = 'reported';
  claim.span = { start: TIER2_QUOTE_START, end: TIER2_QUOTE_START + TIER2_QUOTE.length, quote: TIER2_QUOTE };

  found.sentence.text = ATTRIBUTED_SENTENCE;
  found.sentence.attributed = true;
  copy.draft.limitations = buildLimitations(citedClaims(copy.draft, copy.claims));
  return copy;
}
