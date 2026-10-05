import { SAFE_BASES } from '../constants';
import type { Check, Failure } from '../gate';
import { allSentences } from '../sentences';
import { countWords } from '../text';

/** Every failure code G2 can report. */
export const G2_CODES = [
  'G2_OPENING_LENGTH',
  'G2_TAKEAWAYS_COUNT',
  'G2_BODY_LENGTH',
  'G2_SECTIONS_MIN',
  'G2_HEADING_QUESTION',
  'G2_LIMITATIONS_MISSING',
] as const;

const MIN_SECTIONS = 2;

const isSafeBasis = (basis: string) => (SAFE_BASES as readonly string[]).includes(basis);

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; no heading asks a
 * question; and a piece that rests on a company's own claims has a "What we
 * couldn't verify" section.
 *
 * The body is the opening, the takeaways, every section paragraph and the
 * limitations. The title, the description and the headings are not counted.
 */
export const checkG2: Check = ({ draft, claims }, ctx) => {
  const { openingWords, takeaways, bodyWords } = ctx.config;
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G2', code, message, where });

  const sentences = allSentences(draft);
  const wordsIn = (section: string) =>
    sentences.filter((item) => item.section === section).reduce((total, item) => total + countWords(item.sentence.text), 0);

  const opening = wordsIn('opening');
  if (opening < openingWords.min || opening > openingWords.max) {
    fail('G2_OPENING_LENGTH', `the opening paragraph is ${opening} words; it must be ${openingWords.min} to ${openingWords.max}`, 'opening');
  }

  if (draft.takeaways.length < takeaways.min || draft.takeaways.length > takeaways.max) {
    fail(
      'G2_TAKEAWAYS_COUNT',
      `there are ${draft.takeaways.length} key takeaways; there must be ${takeaways.min} to ${takeaways.max}`,
      'takeaways',
    );
  }

  const body = opening + wordsIn('takeaways') + wordsIn('body') + wordsIn('limitations');
  if (body < bodyWords.min || body > bodyWords.max) {
    fail('G2_BODY_LENGTH', `the body is ${body} words; it must be ${bodyWords.min} to ${bodyWords.max}`, 'body');
  }

  if (draft.sections.length < MIN_SECTIONS) {
    fail('G2_SECTIONS_MIN', `there are ${draft.sections.length} sections; there must be at least ${MIN_SECTIONS}`, 'sections');
  }

  for (const section of draft.sections) {
    if (section.heading.trim().endsWith('?')) {
      fail('G2_HEADING_QUESTION', `the heading "${section.heading}" is a question; headings must be statements`, `section "${section.heading}"`);
    }
  }

  const cited = new Set(sentences.flatMap((item) => item.sentence.claimIds));
  const needLimitations = claims.filter((claim) => cited.has(claim.id) && !isSafeBasis(claim.basis));
  if (needLimitations.length > 0 && draft.limitations.length === 0) {
    const ids = needLimitations.map((claim) => claim.id).join(', ');
    fail('G2_LIMITATIONS_MISSING', `claims ${ids} rest on a datasheet, press release, briefing or demo, but there is no "What we couldn't verify" section`, 'limitations');
  }

  return { failures, holdReasons: [] };
};
