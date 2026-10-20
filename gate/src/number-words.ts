import { UNIT_SOURCE, canonicalUnit } from './normalise';

// Numbers written out in words. A sentence that says "twelve kilograms" states
// a figure just as "12 kg" does, so it has to be checked against the claims the
// same way. This module finds such a figure in a sentence and reads its value;
// `extractTokens` turns it into an ordinary number token. Every function here
// is pure.
//
// What is read: two to nineteen, the tens (twenty ... ninety) with an optional
// unit part ("twenty-five", "twenty five"), "hundred", "thousand", "million",
// "billion" and "dozen", with a multiplier in front ("two hundred", "three
// million", "twenty-five thousand", "two dozen"), "a" in front of a hundred, a
// thousand, a million, a billion or a dozen, an "and" after a hundred or a
// scale ("two hundred and fifty"), and a unit after the words ("twelve
// kilograms", "eighteen per cent"). "one" is a number only inside a longer
// number ("twenty-one", "one hundred") or when a unit follows ("one percent"):
// everywhere else it is the pronoun, as in "one of the plants".
//
// What is not read, and is therefore NOT checked (known limits, listed on the
// /method page): ordinals (first, second, third); vague quantities (a couple,
// several, a few, dozens, hundreds, millions); "zero", "no" and "none"; a
// number in words followed by "-" and a word ("six-axis" is read as the number
// 6, with no unit); fractions in words ("two thirds"; fractions written with
// digits are numbers already); and names that start with a lowercase letter
// (iRobot, xAI), which no capitalisation rule can see.
//
// What cannot be checked is reported instead: words that state an amount but
// have no value to compare ("half", "twice", "doubled", "tenfold", see
// UNCHECKABLE_SOURCE) and a run of number words that is not a well-formed
// number ("five five"). In a fact sentence G4 notes both with
// G4_NUMBER_WORD_UNCHECKABLE (a note: the model check judges the sentence); in
// an analysis sentence G7 refuses them (G7_ANALYSIS_NEW_VALUE) and in a heading
// G4 refuses them (G4_HEADING_NUMBER), because no model reads analysis and a
// heading states no figure. The composer is told to write the figure as digits
// and to cite a claim that gives it.

const SMALL: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Words that multiply what stands before them; "hundred" is read separately because it also takes a remainder. */
const SCALES: Readonly<Record<string, number>> = { thousand: 1000, million: 1000000, billion: 1000000000 };

// --- The regular expressions -------------------------------------------------

// Each letter of a word becomes a class, so that "Twelve" and "TWELVE" are
// read but the units after the words stay case-sensitive, as they are for digits.
const caseless = (word: string): string => [...word].map((letter) => `[${letter}${letter.toUpperCase()}]`).join('');
const alternatives = (words: readonly string[]): string => words.map(caseless).join('|');

const END = String.raw`(?![\p{L}\p{N}])`;
// A number word never starts inside a word or a hyphenated word: "someone", "high-five" and "top-ten" contain no number.
const START = String.raw`(?<![\p{L}\p{N}])(?<!\p{L}-)`;

const SCALE_WORDS = ['hundred', ...Object.keys(SCALES)];
const NUMBER_WORDS = [...Object.keys(SMALL), ...Object.keys(TENS), ...SCALE_WORDS, 'dozen'];

const WORD = `(?:${alternatives(NUMBER_WORDS)})${END}`;
// "a" is part of the number only in front of a hundred, a thousand, a million, a billion or a dozen.
const ARTICLE = `(?:[Aa]\\s+(?=(?:${alternatives([...SCALE_WORDS, 'dozen'])})${END}))?`;
// "and" is part of the number only right after a hundred, a thousand, a million or a billion.
const AND = `(?:(?<=(?:${alternatives(SCALE_WORDS)}))\\s+${caseless('and')})?`;

const RUN = `${ARTICLE}${WORD}(?:${AND}[-\\s]+${WORD})*`;
const UNIT = `(?:\\s+(?<unit>${UNIT_SOURCE})${END})?`;

/**
 * Regex source for one number in words with its unit, if it has one: "twelve",
 * "twenty-five", "two hundred and fifty", "a dozen", "twelve kilograms". Any
 * letter case. The scanner in tokens.ts compiles it with the `gu` flags. The
 * match may be a lone "one", or words that are not a well-formed number:
 * `readNumberWords` decides what a match is.
 */
export const NUMBER_WORD_SOURCE = `${START}(?<run>${RUN})${UNIT}`;

const WHOLE = new RegExp(`^${NUMBER_WORD_SOURCE}$`, 'u');

const AMOUNT_WORDS = ['half', 'halve', 'halves', 'halved', 'halving', 'twice', 'thrice'];
const MULTIPLY_WORDS = ['double', 'triple', 'quadruple'].flatMap((word) => [word, `${word}s`, `${word.slice(0, -1)}ed`, `${word.slice(0, -1)}ing`]);
const FOLD_PREFIXES = Object.keys(SMALL).filter((word) => word !== 'one').concat(Object.keys(TENS), SCALE_WORDS);

/**
 * Regex source for a word that states an amount that cannot be checked
 * against a claim: half (and halve, halved), twice, thrice, double, triple,
 * quadruple (and their endings), and the "fold" words (tenfold, ten-fold,
 * hundredfold). Any letter case, whole words only. Compile it with the `gu` flags.
 */
export const UNCHECKABLE_SOURCE = `(?<![\\p{L}\\p{N}])(?:${alternatives([...AMOUNT_WORDS, ...MULTIPLY_WORDS])}|(?:${alternatives(FOLD_PREFIXES)})-?${caseless('fold')})${END}`;

// --- Reading a phrase --------------------------------------------------------

/** What `readNumberWords` makes of a phrase that `NUMBER_WORD_SOURCE` matched. */
export type NumberWordsReading =
  | { kind: 'number'; value: string; unit?: string }
  /** A lone "one" with no unit: the pronoun, not a quantity. */
  | { kind: 'plain' }
  /** Number words that do not make a well-formed number, such as "five five". */
  | { kind: 'uncheckable' };

interface Read {
  value: number;
  /** The index of the first word that was not used. */
  next: number;
}

/** One to ninety-nine at `at`: a small number, a ten, or a ten with a unit part. */
function readUnderHundred(words: readonly string[], at: number): Read | undefined {
  const first = words[at] ?? '';
  const tens = TENS[first];
  if (tens !== undefined) {
    const unit = SMALL[words[at + 1] ?? ''];
    return unit === undefined || unit > 9 ? { value: tens, next: at + 1 } : { value: tens + unit, next: at + 2 };
  }
  const small = SMALL[first];
  return small === undefined ? undefined : { value: small, next: at + 1 };
}

/** One to nine hundred ninety-nine at `at`: "two hundred and fifty", "a hundred" (the "a" is dropped before), or under a hundred. */
function readGroup(words: readonly string[], at: number): Read | undefined {
  const lead = readUnderHundred(words, at);
  const hundredAt = lead === undefined ? at : lead.next;
  if (words[hundredAt] !== 'hundred') return lead;
  const afterAnd = words[hundredAt + 1] === 'and' ? hundredAt + 2 : hundredAt + 1;
  const rest = readUnderHundred(words, afterAnd);
  const value = (lead?.value ?? 1) * 100;
  return rest === undefined ? { value, next: hundredAt + 1 } : { value: value + rest.value, next: rest.next };
}

/** The value of the words of a run, or undefined when they are not a well-formed number. */
function evaluate(words: readonly string[]): number | undefined {
  const start = words[0] === 'a' ? 1 : 0;
  if (words.at(-1) === 'dozen') {
    const body = words.slice(start, -1);
    if (body.length === 0) return 12;
    const count = readUnderHundred(body, 0);
    return count !== undefined && count.next === body.length ? count.value * 12 : undefined;
  }

  let at = start;
  let total = 0;
  let lastScale = Infinity;
  while (at < words.length) {
    const group = readGroup(words, at);
    const scaleAt = group === undefined ? at : group.next;
    const scale = SCALES[words[scaleAt] ?? ''];
    if (scale === undefined) {
      if (group === undefined) return undefined;
      total += group.value;
      at = group.next;
      break;
    }
    // The scales must fall: "two million three hundred thousand", never "three thousand two million".
    if (scale >= lastScale) return undefined;
    total += (group?.value ?? 1) * scale;
    lastScale = scale;
    at = scaleAt + 1;
    // The regular expression lets an "and" in only before another number word, so it is never the last word.
    if (words[at] === 'and') at++;
  }
  return at === words.length ? total : undefined;
}

/**
 * Read a phrase that `NUMBER_WORD_SOURCE` matched. A well-formed number gives its
 * value as a plain decimal string and the canonical unit if a unit follows; a lone
 * "one" without a unit is `plain`; anything else made of number words is
 * `uncheckable`. Text that is not a number in words at all is `plain` too.
 */
export function readNumberWords(raw: string): NumberWordsReading {
  const groups = WHOLE.exec(raw.trim().replace(/\s+/g, ' '))?.groups as { run?: string; unit?: string } | undefined;
  if (groups?.run === undefined) return { kind: 'plain' };
  const words = groups.run.toLowerCase().split(/[-\s]+/);
  const unit = groups.unit === undefined ? undefined : canonicalUnit(groups.unit.replace(/\s+/g, ' '));
  if (words.length === 1 && words[0] === 'one' && unit === undefined) return { kind: 'plain' };
  const value = evaluate(words);
  if (value === undefined) return { kind: 'uncheckable' };
  return unit === undefined ? { kind: 'number', value: String(value) } : { kind: 'number', value: String(value), unit };
}
