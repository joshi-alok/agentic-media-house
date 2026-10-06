import type { Claim } from './schemas';
import { normaliseQuotes, sentenceWords } from './text';
import { toNameToken } from './tokens';

// Words that begin a sentence are exempt from name checking, because every
// sentence begins with a capital letter. That exemption is also a hole: a made-up
// company at the start of a sentence ("Harlow Logistics plans ...") would only
// have its second word checked. These helpers close it. An opening word that
// looks like a name is accepted when it is an ordinary function word, when the
// evidence of a claim the sentence rests on contains it (the quoted passage, the
// names the claim lists, the outlet), or when the allow-list names it. The text
// and the label of a claim are written by a model and are evidence of nothing: a
// lowercase invented name there ("harlow") must not license a capitalised opening.

/**
 * Function words that may open a sentence without being found in a claim:
 * articles, determiners, pronouns, prepositions, conjunctions and sentence
 * adverbs. There is no noun and no verb in the list, and there must never be:
 * the first word of a news sentence is often a name, a noun or a verb, and
 * those have to come from a claim. gate/test/grounding.test.ts gives every
 * entry a part of speech.
 */
export const SENTENCE_STARTERS: readonly string[] = Object.freeze([
  // articles and determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'some', 'many', 'most', 'all', 'both', 'each', 'every', 'no', 'any', 'another', 'other', 'such',
  // possessives and pronouns
  'its', 'our', 'their', 'his', 'her', 'it', 'we', 'they', 'he', 'she', 'one', 'there', 'here',
  // question and relative words
  'what', 'which', 'who', 'whom', 'whose', 'why', 'how',
  // prepositions
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as', 'at', 'before', 'below', 'between', 'beyond',
  'by', 'despite', 'during', 'for', 'from', 'in', 'into', 'of', 'on', 'over', 'per', 'through', 'throughout', 'to', 'toward',
  'towards', 'under', 'until', 'upon', 'via', 'with', 'within', 'without',
  // conjunctions
  'although', 'and', 'because', 'but', 'if', 'or', 'since', 'so', 'though', 'unless', 'when', 'whereas', 'where', 'whether', 'while', 'yet',
  // sentence adverbs
  'additionally', 'also', 'earlier', 'even', 'however', 'instead', 'later', 'meanwhile', 'not', 'now', 'only', 'overall',
  'recently', 'separately', 'still', 'then', 'therefore', 'thus', 'today',
]);

const STARTER_SET: ReadonlySet<string> = new Set(SENTENCE_STARTERS);

/** The comparison form of one word: plain quotes, lowercase, no possessive ending. */
const comparable = (word: string): string => toNameToken(normaliseQuotes(word));

/** Is `word` one of SENTENCE_STARTERS, in any case and with or without a possessive ending ("It's")? */
export function isSentenceStarter(word: string): boolean {
  return STARTER_SET.has(comparable(word));
}

/**
 * The whole words of `texts`, each in the comparison form of `toNameToken`
 * (lowercase, no trailing possessive). A hyphenated word is listed whole and
 * also by its parts, so "tote-picking" supports "Tote" as well as "Tote-picking".
 * Only whole words are compared: "ship" is not in "shipments".
 */
export function wordSet(texts: Iterable<string>): Set<string> {
  const words = new Set<string>();
  for (const text of texts) {
    for (const word of sentenceWords(text)) {
      words.add(toNameToken(word));
      for (const part of word.split('-')) {
        if (part !== '') words.add(toNameToken(part));
      }
    }
  }
  return words;
}

/**
 * The text that is evidence for a word: the passage a claim quotes, the names
 * it lists and the outlet that reported it. Not the text of the claim and not
 * its label: a model writes both, and a word that only they have is a word that
 * only a model has. The quoted passage was found in the page by code, the names
 * were found in the passage by code, and the outlet is recorded by code.
 */
export function claimTexts(claim: Claim): string[] {
  const names = claim.values.filter((value) => value.kind === 'name').map((value) => value.raw);
  return [claim.span.quote, ...names, ...(claim.source.outlet === undefined ? [] : [claim.source.outlet])];
}

/** The word set of the evidence (`claimTexts`) of every claim in `claims`. */
export function claimWords(claims: Iterable<Claim>): Set<string> {
  return wordSet([...claims].flatMap(claimTexts));
}

/**
 * May a sentence open with `word`, which looks like a name? Yes when it is a
 * sentence starter, when it is in `grounded` (the words of the claims, or of
 * the fact sentences, that vouch for it), or when it is on the allow-list.
 * `allowList` is the context's, in lowercase.
 */
export function openingWordAccepted(word: string, grounded: ReadonlySet<string>, allowList: ReadonlySet<string>): boolean {
  const token = comparable(word);
  return STARTER_SET.has(token) || grounded.has(token) || allowList.has(token);
}

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const DIGIT = /^\p{N}$/u;

/** The last character of `text`, which may be one that takes two UTF-16 units; the empty string for no text. */
const lastCharacter = (text: string): string => Array.from(text.slice(-2)).at(-1) ?? '';

/** The first character of `text`, which may be one that takes two UTF-16 units; the empty string for no text. */
const firstCharacter = (text: string): string => Array.from(text.slice(0, 2))[0] ?? '';

/**
 * Is `raw`, a value that a claim lists, in `quote`, the passage the claim was taken from, as a whole token? The two are
 * compared as the gate compares text everywhere (`normaliseQuotes`: any kind of space is one space, curly quotation marks
 * and long dashes are the plain ones), and the case counts. Where `raw` stands, the character before it and the character
 * after it must not be a letter or a digit, so 2 is not in "12 weeks", "Acme" is not in "Acmeville" and "twelve" is not in
 * "twelves". A dot or a comma that joins a digit at the edge of `raw` to the next digit is no edge either: 2 is not in
 * "2.3" or in "1,200", and 200 is not in "1,200", while 12 is in "12." at the end of a sentence and in "12, 13". When the
 * value stands in more than one place one whole place is enough. A value that is empty is in no quotation.
 */
export function valueInQuote(raw: string, quote: string): boolean {
  const wanted = normaliseQuotes(raw);
  const text = normaliseQuotes(quote);
  if (wanted === '') return false;
  const startsWithDigit = DIGIT.test(firstCharacter(wanted));
  const endsWithDigit = DIGIT.test(lastCharacter(wanted));
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    const end = at + wanted.length;
    const before = lastCharacter(text.slice(0, at));
    const after = firstCharacter(text.slice(end));
    if (LETTER_OR_DIGIT.test(before) || LETTER_OR_DIGIT.test(after)) continue;
    // "1,200" and "2.3": a dot or a comma between two digits is part of one number.
    if (startsWithDigit && (before === '.' || before === ',') && DIGIT.test(lastCharacter(text.slice(0, at - 1)))) continue;
    if (endsWithDigit && (after === '.' || after === ',') && DIGIT.test(firstCharacter(text.slice(end + 1)))) continue;
    return true;
  }
  return false;
}
