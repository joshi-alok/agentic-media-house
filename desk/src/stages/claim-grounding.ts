import {
  canonicalUnit,
  dateMatches,
  defaultConfig as defaultGateConfig,
  extractTokens,
  isSentenceStarter,
  normaliseQuotes,
  openingWordAccepted,
  parseDateToken,
  parseNumberToken,
  readNumberWords,
  sentenceWords,
  toNameToken,
  valueInQuote,
  wordSet,
} from '@robywire/gate';
import type { Basis, ClaimValue, ParsedNumber } from '@robywire/gate';
import type { SourceKind } from '../index';

// What code checks about a claim that a model proposes, before the claim becomes part of the record. The model is asked for
// claims, each with a quotation from the page it read; it can invent a quotation, a figure or a name, and the gate that comes
// later does not read the text or the label of a claim (see the design, section 6.4). These checks are the only place
// where they are read. They are pure: a claim, the text of the page and the kind of the page go in, and the reasons to drop
// the claim come out.

/** The longest quotation a claim may have: what the claim schema allows and what the gate's configuration says. */
export const MAX_QUOTE_LENGTH = defaultGateConfig().spanMax;

/** The most words a label may have: a label is a short name for a claim, and it is printed in the notes under "What we couldn't verify", on the receipts page and on the fact card. */
export const MAX_LABEL_WORDS = 6;

/**
 * The plain words of four letters or more that the text of a claim may use although the quotation does not have them: words of
 * grammar and nothing else. There is no noun in the list, no verb that says what happens, no word that names a company or a
 * product, no negation (`cannot`, `never`, `without`), no word that changes how much or when (`only`, `over`, `under`, `about`,
 * `after`, `will`, `than`), and no modal (`could`, `would`). Every other word of four letters or more in the text must be a word
 * of the quotation. The prompt of the Extract stage prints this list, so the model is told exactly what the code allows.
 */
export const COMMON_WORDS: readonly string[] = Object.freeze([
  'also', 'been', 'being', 'does', 'from', 'have', 'into', 'itself', 'onto', 'that', 'their', 'them', 'there', 'these', 'they', 'this',
  'those', 'through', 'upon', 'were', 'what', 'which', 'whom', 'whose', 'with',
]);

const COMMON_SET: ReadonlySet<string> = new Set(COMMON_WORDS);

/** The words of fewer than four letters that still change what a sentence says, so that they too must be words of the quotation. */
const SHORT_NEGATIONS: ReadonlySet<string> = new Set(['no', 'not', 'nor', 'non']);

/**
 * What each kind of page may be the basis of, which is what the claim says its figure rests on. A company's own page is a
 * press release, a datasheet, a briefing or a demonstration; an arXiv page is a paper; an SEC page is a filing; a standards
 * body's page is a standard; a page of another outlet is only ever reported. Nothing is allowed from a page of unknown kind,
 * and `measured` is allowed from none: a figure that a company says it measured is the company's claim, and the basis
 * `measured` would excuse the piece from saying so.
 */
export const ALLOWED_BASES: Readonly<Record<SourceKind, readonly Basis[]>> = {
  'company-newsroom': ['press-release', 'datasheet', 'briefing', 'demo'],
  arxiv: ['paper'],
  sec: ['filing'],
  standard: ['standard'],
  tier2: ['reported'],
  unknown: [],
};

/** The words for a kind of source in a message, for a reader and for a model. */
export const KIND_WORDS: Readonly<Record<SourceKind, string>> = {
  'company-newsroom': 'a company newsroom',
  arxiv: 'an arXiv page',
  sec: 'an SEC page',
  standard: 'a standards body page',
  tier2: 'another outlet',
  unknown: 'an unknown kind of page',
};

/** Why a claim is dropped. The codes are stable: the artifact records them and the tests name them. */
export const CLAIM_PROBLEM_CODES = [
  'quote-not-found',
  'quote-too-long',
  'value-not-in-quote',
  'value-normalised-mismatch',
  'text-not-in-quote',
  'label-not-in-quote',
  'label-too-long',
  'basis-not-allowed',
  'tier-basis',
] as const;
export type ClaimProblemCode = (typeof CLAIM_PROBLEM_CODES)[number];

export interface ClaimProblem {
  code: ClaimProblemCode;
  /** A sentence for the artifact and the log. */
  message: string;
}

/** What the checks read of a claim that a model proposed: not yet a claim of the record, which has an id, a source and offsets. */
export interface ClaimCandidate {
  text: string;
  label: string;
  /** The passage of the page that the claim rests on, as the model wrote it. */
  quote: string;
  values: ClaimValue[];
  basis: Basis;
}

/** One character as a quotation is compared: any kind of space is a space, a curly quotation mark or a long dash is the plain one. */
const foldChar = (char: string): string => (/\s/u.test(char) ? ' ' : char.charCodeAt(0) < 128 ? char : normaliseQuotes(char));

/**
 * `text` as a quotation is compared, and where each character of it came from. A run of white space is one space,
 * and it points at the first of the spaces; every other character is one character, so `at[i]` is the position in `text`
 * of the character that became `folded[i]`.
 */
function fold(text: string): { folded: string; at: number[] } {
  const chars: string[] = [];
  const at: number[] = [];
  let afterSpace = false;
  for (let index = 0; index < text.length; index++) {
    const char = foldChar(text.charAt(index));
    if (char === ' ' && afterSpace) continue;
    afterSpace = char === ' ';
    chars.push(char);
    at.push(index);
  }
  return { folded: chars.join(''), at };
}

/**
 * Where a quotation is in the text of a page: the offsets, in the page as it is written, of the passage that the quotation
 * quotes, so that `page.slice(start, end)` is the passage. The comparison ignores how white space is written (a run of spaces,
 * tabs and line ends is one space, and so is a no-break space) and the shape of quotation marks, apostrophes and dashes, which
 * a model often writes plainly where a page has the typographic ones; it does not ignore case, and it does not guess. When the
 * passage stands in more than one place the first is taken. A quotation that is empty or is not on the page is `null`.
 */
export function locateQuote(page: string, quote: string): { start: number; end: number } | null {
  const wanted = fold(quote).folded.trim();
  if (wanted === '') return null;
  const { folded, at } = fold(page);
  const found = folded.indexOf(wanted);
  if (found < 0) return null;
  return { start: at[found] as number, end: (at[found + wanted.length - 1] as number) + 1 };
}

/** The first characters of a text for a message, so that a model's long answer cannot make a message long. */
const excerpt = (text: string, length = 80): string => (text.length <= length ? text : `${text.slice(0, length)}...`);

/** `text` with its double quotation marks taken out, so that the words between a pair are read like the rest. */
const unquoted = (text: string): string => normaliseQuotes(text).replaceAll('"', ' ');

/** Does `word` have four letters or more, not counting digits and signs? */
const longWord = (word: string): boolean => word.replace(/[^\p{L}]/gu, '').length >= 4;

/**
 * What a sentence of a claim (its text, or its label) says that the quotation does not: the numbers and the dates that it reads
 * (with `extractTokens`, the reader of the gate), the amounts in words that have no value to compare, the capitalised words in the
 * middle of it, and its first word when that would be taken for a name. A number needs a number of the same value in the quotation,
 * and the same unit when the sentence gives one; a date needs a date in the quotation that agrees at the precision the sentence uses;
 * a word needs to be a whole word of the quotation, or on the allow-list, and the first word may be a plain word as well
 * (the rule that the gate has for the first word of a sentence).
 */
function beyondQuote(sentence: string, quote: string, allowList: ReadonlySet<string>): string[] {
  const own = extractTokens(unquoted(sentence));
  const there = extractTokens(unquoted(quote));
  const words = wordSet([quote]);
  const missing: string[] = [];
  for (const token of new Map(own.numbers.map((number) => [number.raw, number])).values()) {
    if (!there.numbers.some((number) => number.value === token.value && (token.unit === undefined || number.unit === token.unit))) missing.push(token.raw);
  }
  for (const token of new Map(own.dates.map((date) => [date.raw, date])).values()) {
    if (!there.dates.some((date) => dateMatches(token, date.iso))) missing.push(token.raw);
  }
  missing.push(...own.uncheckable.filter((word) => !there.uncheckable.includes(word)));
  missing.push(...own.names.filter((word) => !words.has(word) && !allowList.has(word)));
  if (own.initialWord !== undefined && !openingWordAccepted(own.initialWord, words, allowList)) missing.push(own.initialWord);
  return missing;
}

/** `items` without the ones that `listed` already has (compared in lowercase) and without repeats. */
function additional(items: readonly string[], listed: readonly string[]): string[] {
  const seen = new Set(listed.map((item) => item.toLowerCase()));
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * The words of the text of a claim that go beyond its quotation: a word of four letters or more (or one of `no`, `not`, `nor`, `non`)
 * that is not a word of the quotation, not in COMMON_WORDS and not on the allow-list. A word with a hyphen is read by its parts, so
 * "tote-picking" is as good as "tote picking". A word with a digit in it is a figure, which `beyondQuote` reads, and so are the numbers,
 * the dates and the amounts in words, with their units, which are taken out of the text before its words are read.
 */
function wordsBeyondQuote(text: string, quote: string, allowList: ReadonlySet<string>): string[] {
  const there = wordSet([quote]);
  const found: string[] = [];
  // The figures, the dates and the amounts in words are read by `beyondQuote`, with their units: they are taken out before the words are.
  const own = extractTokens(unquoted(text));
  let rest = ` ${unquoted(text)} `;
  for (const raw of [...own.numbers.map((number) => number.raw), ...own.dates.map((date) => date.raw), ...own.uncheckable]) rest = rest.replaceAll(raw, ' ');
  for (const word of sentenceWords(rest)) {
    if (/\p{N}/u.test(word)) continue;
    for (const part of word.split('-')) {
      const token = toNameToken(part);
      if (!longWord(token) && !SHORT_NEGATIONS.has(token)) continue;
      if (!there.has(token) && !COMMON_SET.has(token) && !allowList.has(token)) found.push(part);
    }
  }
  return found;
}

/**
 * The words of the label of a claim that are not words of the quotation: every word of a label (a short name) must be a whole word of
 * the quotation, in any case, or a plain word that may start a sentence (`SENTENCE_STARTERS`), or on the allow-list. A word with a hyphen
 * passes when it is a word of the quotation or when each of its parts is one.
 */
function labelWordsBeyondQuote(label: string, quote: string, allowList: ReadonlySet<string>): string[] {
  const there = wordSet([quote]);
  const plain = (word: string): boolean => there.has(toNameToken(word)) || isSentenceStarter(word) || allowList.has(toNameToken(word));
  // A word with a hyphen is as good as the whole word of the quotation, or as all its parts are.
  return sentenceWords(unquoted(label)).filter((word) => !plain(word) && !(word.includes('-') && word.split('-').every(plain)));
}

/** A number as the gate reads it from a raw text: a digit token (`parseNumberToken`) or number words (`readNumberWords`), or null when the text is neither. */
function numberOfRaw(raw: string): ParsedNumber | null {
  const token = parseNumberToken(raw);
  if (token !== null) return token;
  const words = readNumberWords(raw);
  return words.kind === 'number' ? { value: words.value, ...(words.unit === undefined ? {} : { unit: words.unit }) } : null;
}

const figure = (value: string, unit: string | undefined): string => (unit === undefined ? value : `${value} ${unit}`);

/**
 * What a value says about itself that its raw text does not: a sentence, or `undefined` when its `normalised` form (and `unit`) say what the raw text says.
 * The gate reads the raw text of a number, and of a date, before it reads the model's `normalised` form, except when the raw text is number words, which it
 * cannot read as a digit token: then the `normalised` form is what licenses a sentence, so a claim that lists `twelve` as `15` would let a sentence that says
 * 15 kg cite a quotation that says twelve kg. This is the one place where the two are held to each other, for every kind of value.
 *
 * - A number: when the raw text is a digit token or number words, its value and unit are those that the gate reads from it (`numberOfRaw`), and the claim must
 *   give the same: `normalised` read as the gate reads it (so "1,200" is 1200), and `unit` in its canonical spelling, which is absent when the raw text has none.
 * - A date: when the raw text is a date that the gate reads, `normalised` is the ISO form of it at the precision it has: YYYY-MM-DD for a day, YYYY-MM for a month, YYYY for a year.
 * - A name: `normalised` is the raw text in lowercase with every run of white space made one space.
 *
 * A raw text that the gate cannot read as a number or a date (a vague amount, "half", a lone "one", a date in another shape) is not compared: it is not a
 * token that G4 reads either. The text of the sentence is shown in part, so that a long answer of a model cannot make a long message.
 */
export function normalisedMismatch(value: ClaimValue): string | undefined {
  const raw = excerpt(value.raw, 40);
  if (value.kind === 'number') {
    const read = numberOfRaw(value.raw);
    if (read === null) return undefined;
    const given = { value: parseNumberToken(value.normalised)?.value ?? value.normalised, unit: value.unit === undefined ? undefined : canonicalUnit(value.unit) };
    if (given.value === read.value && given.unit === read.unit) return undefined;
    return `the number "${raw}" reads as ${figure(read.value, read.unit)}, but the claim gives ${figure(excerpt(given.value, 40), given.unit)}`;
  }
  if (value.kind === 'date') {
    const read = parseDateToken(value.raw);
    if (read === null || value.normalised === read.iso) return undefined;
    return `the date "${raw}" reads as ${read.iso}, but the claim gives ${excerpt(value.normalised, 40)}`;
  }
  const lowercase = value.raw.replace(/\s+/gu, ' ').trim().toLowerCase();
  if (value.normalised === lowercase) return undefined;
  return `the name "${raw}" in lowercase with single spaces is "${excerpt(lowercase, 40)}", but the claim gives "${excerpt(value.normalised, 40)}"`;
}

/** What goes wrong with the basis of a claim from this kind of page, or undefined when the basis fits. */
function basisProblem(basis: Basis, kind: SourceKind): ClaimProblem | undefined {
  if (ALLOWED_BASES[kind].includes(basis)) return undefined;
  if (kind === 'unknown') return { code: 'basis-not-allowed', message: 'the page is not a known kind of source, so no claim can be taken from it' };
  if (kind === 'tier2') return { code: 'tier-basis', message: `a claim that rests on another outlet has the basis "reported", not "${basis}" (check G6)` };
  if (basis === 'reported') return { code: 'tier-basis', message: 'the basis "reported" is for a claim that rests on another outlet, not for one from a primary source (check G6)' };
  return { code: 'basis-not-allowed', message: `the basis "${basis}" does not fit ${KIND_WORDS[kind]}: the bases for it are ${ALLOWED_BASES[kind].join(', ')}` };
}

/**
 * Every reason that a claim must be dropped, in the order of the checks; none means the claim may be kept. `page` is the text
 * of the page the claim was taken from, `kind` is what kind of page that is, and `allowList` is the gate's list of capitalised
 * words that need no claim (lowercase).
 *
 * 1. The quotation is on the page (`locateQuote`) and, as the page has it, is at most MAX_QUOTE_LENGTH characters.
 *    While the quotation is not on the page the next three checks have nothing to read, so they are not made.
 * 2. Each value the claim lists is inside the quotation as a whole token, compared as the gate compares it (`valueInQuote`, G4_VALUE_NOT_IN_SPAN):
 *    a 2 is not in "12 weeks". Every such value is reported, and then every value whose `normalised` form or unit says other than its raw text (`normalisedMismatch`).
 * 3. The text, and then the label, say nothing that the quotation does not: no number, date, amount in words or capitalised word
 *    that is not in it (see `beyondQuote`). The text and the label are read by no check of the gate. And words: every word of the
 *    label is a word of the quotation, a plain word that may start a sentence or on the allow-list, and the label is at most
 *    MAX_LABEL_WORDS words long; every word of the text of four letters or more is a word of the quotation, or one of COMMON_WORDS,
 *    or on the allow-list, and so is every negation (`no`, `not`, `nor`, `non`). A lowercase name or an assertion in the text or the label
 *    ("harlow", "never fails", "cannot lift") is therefore a reason to drop the claim.
 * 4. The basis is one that the kind of page allows (ALLOWED_BASES) and agrees with the tier, as check G6 requires.
 */
export function claimProblems(claim: ClaimCandidate, page: string, kind: SourceKind, allowList: ReadonlySet<string>): ClaimProblem[] {
  const problems: ClaimProblem[] = [];
  const found = locateQuote(page, claim.quote);
  if (found === null) {
    problems.push({ code: 'quote-not-found', message: `the quotation is not on the page: "${excerpt(claim.quote)}"` });
  } else {
    const passage = page.slice(found.start, found.end);
    if (passage.length > MAX_QUOTE_LENGTH) {
      problems.push({ code: 'quote-too-long', message: `the passage quoted is ${passage.length} characters, and the longest allowed is ${MAX_QUOTE_LENGTH}` });
    }
    for (const value of claim.values) {
      if (!valueInQuote(value.raw, passage)) {
        problems.push({ code: 'value-not-in-quote', message: `the value "${excerpt(value.raw)}" is not in the quotation` });
      }
    }
    for (const value of claim.values) {
      const mismatch = normalisedMismatch(value);
      if (mismatch !== undefined) problems.push({ code: 'value-normalised-mismatch', message: mismatch });
    }
    const shown = (items: readonly string[]): string => items.map((item) => `"${excerpt(item, 40)}"`).join(', ');
    const inText = additional(beyondQuote(claim.text, passage, allowList), []);
    const textBeyond = [...inText, ...additional(wordsBeyondQuote(claim.text, passage, allowList), inText)];
    if (textBeyond.length > 0) problems.push({ code: 'text-not-in-quote', message: `the text says what the quotation does not: ${shown(textBeyond)}` });
    const inLabel = additional(beyondQuote(claim.label, passage, allowList), []);
    const labelWords = sentenceWords(unquoted(claim.label)).length;
    const labelBeyond = [...inLabel, ...additional(labelWordsBeyondQuote(claim.label, passage, allowList), inLabel)];
    if (labelBeyond.length > 0) problems.push({ code: 'label-not-in-quote', message: `the label says what the quotation does not: ${shown(labelBeyond)}` });
    else if (labelWords === 0) problems.push({ code: 'label-not-in-quote', message: 'the label has no word' });
    if (labelWords > MAX_LABEL_WORDS) problems.push({ code: 'label-too-long', message: `the label has ${labelWords} words, and the longest allowed is ${MAX_LABEL_WORDS}` });
  }
  const basis = basisProblem(claim.basis, kind);
  if (basis !== undefined) problems.push(basis);
  return problems;
}
