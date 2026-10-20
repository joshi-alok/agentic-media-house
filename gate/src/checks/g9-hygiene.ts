import type { Check, Failure } from '../gate';
import { dayNumber } from '../normalise';
import { allSentences, describeLocation } from '../sentences';
import { hasWholePhrase, jaccard, normaliseQuotes } from '../text';

/** Every failure code G9 can report. */
export const G9_CODES = ['G9_SLUG_COLLISION', 'G9_TITLE_DUPLICATE', 'G9_BANNED_PHRASE', 'G9_POLICY_PHRASE'] as const;

/** A cashtag: a dollar sign directly followed by two to ten letters, not preceded by a letter, a digit or another dollar sign (`$ETH`; not `$38,000` or `US$5`). */
const CASHTAG = /(?<![\p{L}\p{N}$])\$[A-Za-z]{2,10}(?![A-Za-z0-9])/gu;

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
 *   `titleSimilarityThreshold`. A title is recent when it was published on
 *   the draft's day or up to `titleWindowDays` (14) calendar days before it,
 *   in UTC; a title dated after the draft is ignored. A date that is not a
 *   real date, on either side, cannot rule a title out, so that title is
 *   compared (G1 reports a draft date that is not real). Only the closest
 *   recent title is reported.
 *   The default 0.6 was calibrated on the pairs in `g9-hygiene.test.ts`.
 *   A rewording that changes most of the words is not caught here; choosing a
 *   story that is not a repeat is the Select stage's job.
 * - None of the banned filler phrases appears (G9_BANNED_PHRASE), in the
 *   title, description, opening, takeaways, section headings and paragraphs, or
 *   limitations. Case, quote shapes, dashes and spacing are ignored. The
 *   match is on any part of the text, so "delve" catches "delves". Quoted
 *   passages are read too: if a source's own hype is inside a quotation,
 *   cut the quotation or paraphrase it. `where` is the phrase.
 * - The Desk makes no price prediction, no market call and gives no advice to
 *   buy, sell or hold, and writes no ticker with a dollar sign
 *   (G9_POLICY_PHRASE, a blocker). It reads the title, the description, every
 *   fact and analysis sentence and every section heading; the limitation
 *   sentences are written by code from fixed notes and are not read. The
 *   phrases of `policyPhrases` are matched by whole words (no letter or digit
 *   next to the phrase), so "price target" is refused and "prices targeted"
 *   is not; case, quote shapes, dashes and spacing are ignored, and quoted
 *   passages are read. A cashtag is a dollar sign followed by two to ten
 *   letters. `where` is the place, `title`, `opening, sentence 1` or
 *   `section "<heading>"`, so that a sentence or a heading that has one can be
 *   sent back to the composer.
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
  const today = dayNumber(draft.publishedAt) ?? NaN;
  let closest: { title: string; score: number } | undefined;
  for (const recent of ctx.recentTitles) {
    // How many days before the draft the title was published. It is NaN when either date is not real, and NaN is
    // neither below 0 nor above the window, so such a title is compared.
    const days = today - (dayNumber(recent.publishedAt) ?? NaN);
    if (days < 0 || days > ctx.config.titleWindowDays) continue;
    const score = jaccard(mine, titleTokens(recent.title));
    if (score >= ctx.config.titleSimilarityThreshold && (closest === undefined || score > closest.score)) {
      closest = { title: recent.title, score };
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

  // What the Desk never says in its own voice. The title, the description, every fact and analysis sentence and every heading are read; the
  // limitation sentences are written by code from fixed notes and are not. `where` is the place, so that a sentence or a heading that has one can be sent back.
  const voice = [
    ...allSentences(draft)
      .filter((item) => item.sentence.kind !== 'limitation')
      .map((item) => ({ where: describeLocation(item), text: item.sentence.text })),
    ...draft.sections.map((section) => ({ where: `section "${section.heading}"`, text: section.heading })),
  ];
  const policy = ctx.config.policyPhrases
    .map((phrase) => ({ phrase, folded: normaliseQuotes(phrase).toLowerCase() }))
    .filter((item) => item.folded !== '');
  for (const place of voice) {
    const text = normaliseQuotes(place.text).toLowerCase();
    for (const { phrase, folded } of policy) {
      if (hasWholePhrase(text, folded)) {
        failures.push({
          check: 'G9',
          code: 'G9_POLICY_PHRASE',
          message: `the phrase "${phrase}" appears at ${place.where}: the Desk makes no price prediction, no market call and gives no advice to buy, sell or hold`,
          where: place.where,
        });
      }
    }
    for (const tag of new Set(place.text.match(CASHTAG) ?? [])) {
      failures.push({
        check: 'G9',
        code: 'G9_POLICY_PHRASE',
        message: `the cashtag "${tag}" appears at ${place.where}: write the name of the token, not a ticker with a dollar sign`,
        where: place.where,
      });
    }
  }

  return { failures, holdReasons: [] };
};
