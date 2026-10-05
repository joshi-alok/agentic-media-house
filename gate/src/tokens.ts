import { DATE_SOURCE, NUMBER_SOURCE, parseDateToken, parseNumberToken } from './normalise';
import type { ParsedDate, ParsedNumber } from './normalise';
import { NUMBER_WORD_SOURCE, UNCHECKABLE_SOURCE, readNumberWords } from './number-words';
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
  /** Numbers written with digits, then numbers written out in words ("twelve kilograms" is 12 kg), each in order of appearance. */
  numbers: NumberToken[];
  dates: DateToken[];
  /**
   * Words that state an amount that has no value to check ("half", "twice",
   * "doubled", "tenfold") and runs of number words that are not a number
   * ("five five"), lowercased, each listed once, in order of appearance.
   */
  uncheckable: string[];
  /** Lowercased name tokens, each listed once, in order of first appearance. The first word of the sentence is not among them. */
  names: string[];
  /**
   * The first word of the sentence as written, without the punctuation around
   * it, when it would have been a name token had it not been first: it starts
   * with a capital letter or mixes letters and digits. Absent otherwise,
   * for example when the sentence opens with a number or a date. A sentence that opens with a lowercase
   * word has none either, which is why G2 requires every sentence to start with a capital letter or a digit.
   */
  initialWord?: string;
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
 * 4. Numbers written in words are read next, as numbers ("twelve kilograms" is
 *    12 kg). Words that state an amount but have no value to check (half,
 *    twice, doubled, tenfold) are listed as `uncheckable`. See number-words.ts for
 *    what is read and for the known limits.
 * 5. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits. The first
 *    word is every sentence's capital letter, so it is not a name token; when
 *    it looks like one it is reported as `initialWord`, and the checks ground it
 *    with `openingWordAccepted` instead.
 *
 * Name detection is deliberately strict: it reports any capitalised word, so
 * an ordinary capitalised word costs a revision round. It cannot see a name
 * that starts in lowercase (iRobot, xAI), an ordinal (first, second) or a vague
 * quantity (several, a couple); the model verifier covers those. An impossible date (31 February) is not
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

  // Amounts that cannot be checked come out before the numbers in words, so that "tenfold" is not read as "ten".
  const uncheckable: string[] = [];
  const withoutAmounts = consume(withoutNumbers, UNCHECKABLE_SOURCE, (matched) => {
    uncheckable.push(matched.toLowerCase());
    return true;
  });
  const withoutWords = consume(withoutAmounts, NUMBER_WORD_SOURCE, (matched) => {
    const reading = readNumberWords(matched);
    if (reading.kind === 'plain') return false;
    if (reading.kind === 'uncheckable') uncheckable.push(matched.toLowerCase());
    else numbers.push({ raw: matched, value: reading.value, ...(reading.unit === undefined ? {} : { unit: reading.unit }) });
    return true;
  });

  const [first, ...rest] = sentenceWords(withoutWords);
  const names = rest.filter(isNameWord).map(toNameToken);
  const tokens: SentenceTokens = { numbers, dates, uncheckable: [...new Set(uncheckable)], names: [...new Set(names)] };
  if (first !== undefined && isNameWord(first)) tokens.initialWord = first;
  return tokens;
}
