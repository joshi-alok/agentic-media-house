import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { jaccard, normaliseQuotes } from '../text';

/** Every failure code G9 can report. */
export const G9_CODES = ['G9_SLUG_COLLISION', 'G9_TITLE_DUPLICATE', 'G9_BANNED_PHRASE'] as const;

/**
 * Words that say nothing about which story a title is. They are left out when
 * two titles are compared, so "ships the FX-1 to a second plant" and "ships
 * FX-1 to second plant" count as the same words. Keep the list to function
 * words: a word that carries the story ("new", "raises", "first") must stay in.
 */
export const TITLE_STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'from',
  'as',
  'its',
  'is',
  'are',
]);

/**
 * The set of words a title is compared by: lowercase letters and digits, split
 * at everything else (so "FX-1" is "fx" and "1"), without the stop words.
 */
export function titleTokens(title: string): Set<string> {
  const words = normaliseQuotes(title)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !TITLE_STOP_WORDS.has(word));
  return new Set(words);
}

/**
 * G9, hygiene.
 *
 * - The slug is not already published (G9_SLUG_COLLISION). The pipeline picks
 *   a free slug with `disambiguateSlug` before it composes; this is the guard.
 * - The title is not a near-duplicate of a recent title (G9_TITLE_DUPLICATE):
 *   the overlap of their word sets, shared words over all words, reaches
 *   `titleSimilarityThreshold`. Only the closest recent title is reported.
 *   The default 0.6 was calibrated on the pairs in `g9-hygiene.test.ts`.
 *   A rewording that changes most of the words is not caught here; choosing a
 *   story that is not a repeat is the Select stage's job.
 * - None of the banned filler phrases appears (G9_BANNED_PHRASE), in the
 *   title, description, opening, takeaways, section headings and paragraphs, or
 *   limitations. Case, quote shapes, dashes and spacing are ignored. The
 *   match is on any part of the text, so "delve" catches "delves". Quoted
 *   passages are read too: if a source's own hype is inside a quotation,
 *   cut the quotation or paraphrase it. `where` is the phrase.
 */
export const checkG9: Check = ({ draft }, ctx) => {
  const failures: Failure[] = [];

  if (ctx.publishedSlugs.has(draft.slug)) {
    failures.push({
      check: 'G9',
      code: 'G9_SLUG_COLLISION',
      message: `the slug "${draft.slug}" is already published`,
      where: 'slug',
    });
  }

  const mine = titleTokens(draft.title.text);
  let closest: { title: string; score: number } | undefined;
  for (const recent of ctx.recentTitles) {
    const score = jaccard(mine, titleTokens(recent));
    if (score >= ctx.config.titleSimilarityThreshold && (closest === undefined || score > closest.score)) {
      closest = { title: recent, score };
    }
  }
  if (closest !== undefined) {
    failures.push({
      check: 'G9',
      code: 'G9_TITLE_DUPLICATE',
      message: `the title is too close to the recent title "${closest.title}": ${closest.score.toFixed(2)} word overlap, and ${ctx.config.titleSimilarityThreshold.toFixed(2)} is the limit`,
      where: 'title',
    });
  }

  const phrases = ctx.config.bannedPhrases
    .map((phrase) => ({ phrase, folded: normaliseQuotes(phrase).toLowerCase() }))
    .filter((item) => item.folded !== '');
  const places = [
    ...allSentences(draft).map((item) => ({ where: describeLocation(item), text: item.sentence.text })),
    ...draft.sections.map((section) => ({ where: `heading "${section.heading}"`, text: section.heading })),
  ];
  for (const place of places) {
    const text = normaliseQuotes(place.text).toLowerCase();
    for (const { phrase, folded } of phrases) {
      if (text.includes(folded)) {
        failures.push({
          check: 'G9',
          code: 'G9_BANNED_PHRASE',
          message: `the banned phrase "${phrase}" appears at ${place.where}`,
          where: phrase,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
