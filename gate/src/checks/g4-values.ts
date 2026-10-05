import type { Check, Failure } from '../gate';
import { canonicalUnit, dateMatches, parseDateToken, parseNumberToken } from '../normalise';
import type { ParsedNumber } from '../normalise';
import type { Claim, ClaimValue } from '../schemas';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf } from '../tokens';

/**
 * A number value of a claim in canonical form. The raw text is the authority:
 * it is parsed with the same function as the sentence, so "1.2k" and "1,200"
 * meet. The model's `normalised` and `unit` are used only when the raw text is
 * not a number token (for example "twelve").
 */
function claimNumber(value: ClaimValue): ParsedNumber {
  const parsed = parseNumberToken(value.raw);
  if (parsed !== null) return parsed;
  const number = parseNumberToken(value.normalised)?.value ?? value.normalised;
  return value.unit === undefined ? { value: number } : { value: number, unit: canonicalUnit(value.unit) };
}

/** A date value of a claim as an ISO string, from the raw text when it parses, else from `normalised`. */
const claimDate = (value: ClaimValue): string => parseDateToken(value.raw)?.iso ?? value.normalised;

/**
 * G4, values: every number, date and name in a fact sentence must come from a
 * claim that sentence cites, and every value a cited claim lists must really
 * be in the claim's quoted span.
 *
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A date matches a claim date at the
 * precision the sentence uses. A name matches when each of its words is a word
 * of a cited claim's name value or is on the allow-list. Name detection is
 * deliberately strict (see `extractTokens`): a false positive only costs a
 * revision round, a false negative would let an invented name through.
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
export const checkG4: Check = ({ draft, claims }, ctx) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];
  const citedByFacts = new Map<string, Claim>();

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'fact') continue;
    const where = describeLocation(located);
    const cited = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []);
    for (const claim of cited) citedByFacts.set(claim.id, claim);

    const values = cited.flatMap((claim) => claim.values);
    const supportedNumbers = values.filter((value) => value.kind === 'number').map(claimNumber);
    const supportedDates = values.filter((value) => value.kind === 'date').map(claimDate);
    const supportedNames = new Set(values.filter((value) => value.kind === 'name').flatMap((value) => nameTokensOf(value.raw)));

    const tokens = extractTokens(sentence.text);
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });

    const seenNumbers = new Set<string>();
    for (const token of tokens.numbers) {
      if (seenNumbers.has(token.raw)) continue;
      seenNumbers.add(token.raw);
      const supported = supportedNumbers.some(
        (number) => number.value === token.value && (token.unit === undefined || number.unit === token.unit),
      );
      if (!supported) {
        fail('G4_NUMBER_UNSUPPORTED', `the number "${token.raw}" at ${where} is not in any claim this sentence cites`);
      }
    }

    const seenDates = new Set<string>();
    for (const token of tokens.dates) {
      if (seenDates.has(token.raw)) continue;
      seenDates.add(token.raw);
      if (!supportedDates.some((iso) => dateMatches(token, iso))) {
        fail('G4_DATE_UNSUPPORTED', `the date "${token.raw}" at ${where} is not in any claim this sentence cites`);
      }
    }

    for (const name of tokens.names) {
      if (!supportedNames.has(name) && !ctx.nameAllowList.has(name)) {
        fail(
          'G4_NAME_UNSUPPORTED',
          `the capitalised word "${name}" at ${where} is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word`,
        );
      }
    }
  }

  // Each claim is checked once, however many sentences cite it.
  for (const claim of citedByFacts.values()) {
    const quote = normaliseQuotes(claim.span.quote);
    const missing = claim.values.find((value) => !quote.includes(normaliseQuotes(value.raw)));
    if (missing !== undefined) {
      failures.push({
        check: 'G4',
        code: 'G4_VALUE_NOT_IN_SPAN',
        message: `claim ${claim.id} lists the value "${missing.raw}", which does not appear in its quoted span`,
        where: claim.id,
      });
    }
  }

  return { failures, holdReasons: [] };
};
