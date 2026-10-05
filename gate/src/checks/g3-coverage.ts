import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';

/**
 * G3, coverage: every fact sentence cites at least one claim, and every claim
 * any sentence cites exists. It looks at every sentence of the piece: title,
 * description, opening, takeaways, section paragraphs and limitations.
 *
 * An analysis sentence may cite nothing. A limitation sentence with no claim is
 * left to G8, which checks limitations against their templates.
 */
export const checkG3: Check = ({ draft, claims }) => {
  const known = new Set(claims.map((claim) => claim.id));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    const where = describeLocation(located);
    if (sentence.kind === 'fact' && sentence.claimIds.length === 0) {
      failures.push({
        check: 'G3',
        code: 'G3_NO_CLAIM',
        message: `the fact sentence at ${where} cites no claim`,
        where,
      });
    }
    for (const id of new Set(sentence.claimIds)) {
      if (!known.has(id)) {
        failures.push({
          check: 'G3',
          code: 'G3_UNKNOWN_CLAIM',
          message: `the sentence at ${where} cites ${id}, which is not one of this piece's claims`,
          where,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
