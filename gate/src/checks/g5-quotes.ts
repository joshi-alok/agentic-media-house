import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes, quotedSegments } from '../text';

/** Every failure code G5 can report. */
export const G5_CODES = ['G5_QUOTE_NOT_VERBATIM'] as const;

/**
 * G5, quotes: every passage in double quotation marks in the title, the
 * description or a fact or analysis sentence is word for word inside the
 * quoted span of a claim that sentence cites. Spacing, dashes and the shape of
 * quote marks and apostrophes are ignored; case and punctuation are not.
 *
 * Limitation sentences come from templates and are not read.
 */
export const checkG5: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind === 'limitation') continue;
    const passages = [...new Set(quotedSegments(sentence.text))];
    if (passages.length === 0) continue;

    const where = describeLocation(located);
    const spans = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []).map((claim) => normaliseQuotes(claim.span.quote));
    for (const passage of passages) {
      if (!spans.some((span) => span.includes(passage))) {
        failures.push({
          check: 'G5',
          code: 'G5_QUOTE_NOT_VERBATIM',
          message: `the quotation "${passage}" at ${where} is not word for word in any claim this sentence cites`,
          where,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
