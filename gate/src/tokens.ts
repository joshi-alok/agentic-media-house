import { DATE_SOURCE, NUMBER_SOURCE, parseDateToken, parseNumberToken } from './normalise';
import type { ParsedDate, ParsedNumber } from './normalise';
import { normaliseQuotes, sentenceWords, stripQuoted } from './text';

/** A number found in a sentence: the text as written plus its canonical value and unit. */
export interface NumberToken extends ParsedNumber {
  raw: string;
}

/** A date found in a sentence: the text as written plus its canonical ISO form. */
export interface DateToken extends ParsedDate {
  raw: string;
}

export interface SentenceTokens {
  numbers: NumberToken[];
  dates: DateToken[];
  /** Lowercased name tokens, each listed once, in order of first appearance. */
  names: string[];
}

// A date or number that has been read is replaced by this lowercase word. It
// is still a word, so a sentence that opens with a date still has a first word
// (which is exempt from name detection), but it can never be taken for a name.
const FILLER = 'x';

/**
 * Replace each match of `source` that `accept` takes with the filler word.
 * Matches that `accept` refuses stay in the text for the later passes.
 */
function consume(text: string, source: string, accept: (matched: string) => boolean): string {
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(source, 'gu'))) {
    if (!accept(match[0])) continue;
    result += `${text.slice(cursor, match.index)} ${FILLER} `;
    cursor = match.index + match[0].length;
  }
  return result + text.slice(cursor);
}

// A name token starts with an uppercase letter (this includes ALL-CAPS
// acronyms such as CEO and ISO), or mixes letters and digits (FX-1, H1, B2B).
function isNameWord(word: string): boolean {
  return /^\p{Lu}/u.test(word) || (/\p{L}/u.test(word) && /\p{N}/u.test(word));
}

/**
 * The comparison form of a word taken from a name: lowercase, without a
 * trailing possessive, and with the dots taken out of a dotted abbreviation,
 * so "Brindle's" is "brindle" and "U.S" is "us".
 */
export function toNameToken(word: string): string {
  const token = word.toLowerCase().replace(/'s$/, '');
  return /^\p{L}(?:\.\p{L})+$/u.test(token) ? token.replace(/\./g, '') : token;
}

/** The tokens of a name that a claim lists (such as "Brindle Logistics"): every word, in order. */
export function nameTokensOf(name: string): string[] {
  return sentenceWords(name).map(toNameToken);
}

/**
 * Find the numbers, dates and names in one sentence.
 *
 * 1. Quoted segments are removed first. G5 checks quotes.
 * 2. Dates are read before numbers and taken out of the text, so
 *    "24 August 2026" is one date and no numbers.
 * 3. Numbers are digit-led tokens with an optional currency, magnitude and
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits.
 *
 * Name detection is deliberately strict: it reports any capitalised word, so
 * an ordinary capitalised word costs a revision round. It cannot see a name
 * that starts in lowercase (iRobot, xAI) or a number spelled out in words;
 * the model verifier covers those. An impossible date (31 February) is not
 * consumed, so its digits come out as numbers that no real date can support.
 */
export function extractTokens(sentenceText: string): SentenceTokens {
  const text = normaliseQuotes(stripQuoted(sentenceText).replace(/[\u2013\u2014]/g, ' '));
  const dates: DateToken[] = [];
  const numbers: NumberToken[] = [];

  const withoutDates = consume(text, DATE_SOURCE, (matched) => {
    const parsed = parseDateToken(matched);
    if (parsed) dates.push({ raw: matched, ...parsed });
    return parsed !== null;
  });
  const withoutNumbers = consume(withoutDates, NUMBER_SOURCE, (matched) => {
    const parsed = parseNumberToken(matched);
    if (parsed) numbers.push({ raw: matched, ...parsed });
    return parsed !== null;
  });

  const names = sentenceWords(withoutNumbers).slice(1).filter(isNameWord).map(toNameToken);
  return { numbers, dates, names: [...new Set(names)] };
}
