import { dateMatches, defaultConfig as defaultGateConfig, extractTokens, normaliseQuotes, openingWordAccepted, wordSet } from '@robywire/gate';
import type { Basis, ClaimValue } from '@robywire/gate';
import type { SourceKind } from '../index';

// What code checks about a claim that a model proposes, before the claim becomes part of the record. The model is asked for
// claims, each with a quotation from the page it read; it can invent a quotation, a figure or a name, and the gate that comes
// later does not read the text or the label of a claim (see the design, section 6.4). These checks are the only place
// where they are read. They are pure: a claim, the text of the page and the kind of the page go in, and the reasons to drop
// the claim come out.

/** The longest quotation a claim may have: what the claim schema allows and what the gate's configuration says. */
export const MAX_QUOTE_LENGTH = defaultGateConfig().spanMax;

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
  'text-not-in-quote',
  'label-not-in-quote',
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
 * 2. Each value the claim lists is inside the quotation, compared as the gate compares it (G4_VALUE_NOT_IN_SPAN).
 * 3. The text, and then the label, say nothing that the quotation does not: no number, date, amount in words or capitalised word
 *    that is not in it (see `beyondQuote`). The text and the label are read by no check of the gate.
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
    const folded = normaliseQuotes(passage);
    for (const value of claim.values) {
      if (!folded.includes(normaliseQuotes(value.raw))) {
        problems.push({ code: 'value-not-in-quote', message: `the value "${excerpt(value.raw)}" is not in the quotation` });
      }
    }
    for (const [code, field, sentence] of [
      ['text-not-in-quote', 'text', claim.text],
      ['label-not-in-quote', 'label', claim.label],
    ] as const) {
      const beyond = beyondQuote(sentence, passage, allowList);
      if (beyond.length > 0) {
        problems.push({ code, message: `the ${field} says what the quotation does not: ${beyond.map((item) => `"${excerpt(item, 40)}"`).join(', ')}` });
      }
    }
  }
  const basis = basisProblem(claim.basis, kind);
  if (basis !== undefined) problems.push(basis);
  return problems;
}
