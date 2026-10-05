import type { Check, Failure } from '../gate';
import { canonicalUnit, dateMatches, parseDateToken, parseNumberToken } from '../normalise';
import type { ParsedNumber } from '../normalise';
import type { Claim, ClaimValue } from '../schemas';
import { claimWords, openingWordAccepted } from '../grounding';
import { allSentences, describeLocation } from '../sentences';
import { hasQuoted, normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf, toNameToken } from '../tokens';

/** Every failure code G4 can report. */
export const G4_CODES = [
  'G4_NUMBER_UNSUPPORTED',
  'G4_DATE_UNSUPPORTED',
  'G4_NAME_UNSUPPORTED',
  'G4_VALUE_NOT_IN_SPAN',
  'G4_INITIAL_WORD_UNSUPPORTED',
  'G4_HEADING_NUMBER',
  'G4_HEADING_QUOTE',
  'G4_HEADING_NAME',
  'G4_NUMBER_WORD_UNCHECKABLE',
] as const;

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
 * canonical unit if the sentence gives one. A number written out in words
 * ("twelve kilograms") is read as a number and checked the same way; a claim may
 * list it as `raw: "twelve"` with `normalised: "12"`. Words that state an amount
 * with no value to compare ("half", "twice", "doubled", "tenfold") are rejected
 * with G4_NUMBER_WORD_UNCHECKABLE: write the figure as digits and cite a claim
 * for it (number-words.ts says what is read and lists the known limits).
 * A date matches a claim date at the precision the sentence uses. A name
 * matches when each of its words is a word of a cited claim's name value or
 * outlet, or is on the allow-list. Name detection is deliberately strict (see
 * `extractTokens`): a false positive only costs a revision round, a false
 * negative would let an invented name through.
 *
 * The first word of a sentence is not a name token, because every sentence
 * starts with a capital letter. When it looks like a name it has a rule of its
 * own (G4_INITIAL_WORD_UNSUPPORTED): it must be a function word from
 * SENTENCE_STARTERS, or a word of the text, label, quoted passage, name values or
 * outlet of a claim the sentence cites, or on the allow-list. Without it, a
 * made-up company at the start of a sentence would only have its second word checked.
 *
 * Section headings are free text that no claim vouches for, so they are held
 * to a stricter rule than sentences: a heading may contain no number and no
 * date (G4_HEADING_NUMBER), no quoted passage (G4_HEADING_QUOTE), and no
 * capitalised word, the first one included, that is not a word of a claim cited in
 * its own section or on the allow-list (G4_HEADING_NAME; the first word may also be
 * a function word from SENTENCE_STARTERS).
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
    // The outlet of a cited claim counts as a name too: a tier-2 claim can only
    // be used as an attribution ("Mercer Wire reports ..."), and G6 requires the
    // sentence to say so. The outlet is recorded by the pipeline, not written by the composer.
    const supportedNames = new Set([
      ...values.filter((value) => value.kind === 'name').flatMap((value) => nameTokensOf(value.raw)),
      ...cited.flatMap((claim) => nameTokensOf(claim.source.outlet ?? '')),
    ]);

    const tokens = extractTokens(sentence.text);
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });

    if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, claimWords(cited), ctx.nameAllowList)) {
      fail(
        'G4_INITIAL_WORD_UNSUPPORTED',
        `the sentence at ${where} opens with "${tokens.initialWord}", which is neither an ordinary opening word nor a word of any claim this sentence cites: start with an ordinary word, or cite the claim that mentions it`,
      );
    }

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

    for (const word of tokens.uncheckable) {
      fail(
        'G4_NUMBER_WORD_UNCHECKABLE',
        `the words "${word}" at ${where} state an amount that cannot be checked against a claim: write the figure as digits and cite the claim that gives it`,
      );
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
          `the capitalised word "${name}" at ${where} is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word in the middle of the sentence (the first word of a sentence keeps its capital letter)`,
        );
      }
    }
  }

  for (const section of draft.sections) {
    const heading = section.heading;
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where: `section "${heading}"` });

    if (hasQuoted(heading)) {
      fail('G4_HEADING_QUOTE', `the heading "${heading}" contains a quoted passage: put quotations in the body, where they are checked word for word`);
    }

    const tokens = extractTokens(heading);
    const figures = [...tokens.numbers.map((token) => token.raw), ...tokens.dates.map((token) => token.raw), ...tokens.uncheckable].map(
      (raw) => `"${raw}"`,
    );
    if (figures.length > 0) {
      fail(
        'G4_HEADING_NUMBER',
        `the heading "${heading}" contains a number or a date (${figures.join(', ')}): a heading says what a section is about and states no figure`,
      );
    }

    const ids = new Set(section.paragraphs.flat().flatMap((item) => item.claimIds));
    const words = claimWords([...ids].flatMap((id) => byId.get(id) ?? []));
    const unsupported = [
      ...(tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, words, ctx.nameAllowList)
        ? [toNameToken(tokens.initialWord)]
        : []),
      ...tokens.names.filter((name) => !words.has(name) && !ctx.nameAllowList.has(name)),
    ];
    for (const name of new Set(unsupported)) {
      fail(
        'G4_HEADING_NAME',
        `the capitalised word "${name}" in the heading "${heading}" is not a word of any claim cited in this section: write it in lowercase if it is an ordinary word, or leave the name out of the heading`,
      );
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
