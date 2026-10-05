import type { Check, Failure } from '../gate';
import { renderLimitation } from '../limitations';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = ['G8_LIMITATION_PLACEMENT', 'G8_LIMITATION_CLAIMS', 'G8_LIMITATION_MISMATCH'] as const;

/**
 * G8, limitations: the "What we couldn't verify" sentences are never freely
 * written. Each one describes the metadata of exactly one claim through one
 * of the fixed templates in `limitations.ts`, so this check can render the
 * sentence again and compare. The comparison is exact.
 *
 * - A limitation sentence may sit only in `draft.limitations`
 *   (G8_LIMITATION_PLACEMENT), wherever else it is found.
 * - It cites exactly one claim of the piece (G8_LIMITATION_CLAIMS).
 * - Its text is what the template for its claim renders (G8_LIMITATION_MISMATCH).
 *   A sentence whose claim has changed since it was written fails here too.
 *
 * Whether a limitation is present at all is G2's question.
 */
export const checkG8: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'limitation') continue;
    const where = describeLocation(located);

    if (located.section !== 'limitations') {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_PLACEMENT',
        message: `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
        where,
      });
    }

    const ids = sentence.claimIds;
    const claim = ids.length === 1 ? byId.get(ids[0]) : undefined;
    if (claim === undefined) {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message:
          ids.length === 1
            ? `the limitation sentence at ${where} cites ${ids[0]}, which is not one of this piece's claims`
            : `the limitation sentence at ${where} must cite exactly one claim; it cites ${ids.length === 0 ? 'none' : ids.length}`,
        where,
      });
      continue;
    }

    const expected = renderLimitation(claim, sentence.template);
    if (sentence.text !== expected) {
      failures.push({
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${where} does not match the ${sentence.template} template for ${claim.id}; it must read: "${expected}"`,
        where,
      });
    }
  }

  return { failures, holdReasons: [] };
};
