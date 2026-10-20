import type { Check, Failure } from '../gate';
import { needsBasisLimitation, needsStatusLimitation } from '../limitations';
import { LIMITATIONS_HEADING, TAKEAWAYS_HEADING } from '../render/body';
import { allSentences, citedClaims } from '../sentences';
import { countWords, normaliseQuotes } from '../text';

/** Every failure code G2 can report. */
export const G2_CODES = [
  'G2_OPENING_LENGTH',
  'G2_TAKEAWAYS_COUNT',
  'G2_BODY_LENGTH',
  'G2_SECTIONS_MIN',
  'G2_HEADING_QUESTION',
  'G2_HEADING_TOO_LONG',
  'G2_HEADING_EMPTY',
  'G2_HEADING_RESERVED',
  'G2_LIMITATIONS_MISSING',
  'G2_LIMITATION_COVERAGE',
] as const;

const MIN_SECTIONS = 2;

/**
 * A heading as it is compared with the two that the renderer writes itself: quotation marks and apostrophes plain, white space one space, capitals
 * as lowercase, and no punctuation or space at either end ("What we couldn't verify." with a curly apostrophe is the heading "what we couldn't verify").
 */
const headingKey = (heading: string): string => normaliseQuotes(heading).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** The headings that the renderer writes over what code writes, each with what it is over, for the message. */
const RESERVED_HEADINGS: ReadonlyMap<string, string> = new Map([
  [headingKey(TAKEAWAYS_HEADING), 'the key takeaways'],
  [headingKey(LIMITATIONS_HEADING), 'the notes that code writes from the claims'],
]);

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; every heading is
 * there, is short enough (`headingMax`) and is not a question, and is not one of the two headings that the renderer writes itself,
 * "Key takeaways" and "What we couldn't verify" (G2_HEADING_RESERVED: a section of the composer with one of them would be written under the same
 * heading as the real one, and the page says that what stands under "What we couldn't verify" is written by code); and a piece that
 * rests on a company's own claims has a "What we couldn't verify" section
 * that covers each claim that needs a note (G2_LIMITATION_COVERAGE).
 * What a heading may say is G4's question (G4_HEADING_*).
 *
 * The body is the opening, the takeaways, every section paragraph and the
 * limitations. The title, the description and the headings are not counted.
 */
export const checkG2: Check = ({ draft, claims }, ctx) => {
  const { openingWords, takeaways, bodyWords, headingMax } = ctx.config;
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
    const where = `section "${section.heading}"`;
    const heading = section.heading.trim();
    if (heading === '') {
      fail('G2_HEADING_EMPTY', 'a section has no heading: every section needs a heading that says what it is about', where);
    } else if (heading.length > headingMax) {
      fail('G2_HEADING_TOO_LONG', `the heading "${section.heading}" is ${heading.length} characters; the limit is ${headingMax}`, where);
    }
    if (heading.endsWith('?')) {
      fail('G2_HEADING_QUESTION', `the heading "${section.heading}" is a question; headings must be statements`, where);
    }
    const over = RESERVED_HEADINGS.get(headingKey(heading));
    if (over !== undefined) {
      fail('G2_HEADING_RESERVED', `the heading "${section.heading}" is one that the Desk writes itself, over ${over}: a section of the piece may not have it, because the page would show it twice`, where);
    }
  }

  // A claim cited by the body needs a 'basis' sentence unless its figure comes
  // from a filing, a standard, a paper or a measurement, and a 'status' sentence
  // when the capability was only demonstrated or is only planned.
  const needs = citedClaims(draft, claims).flatMap((claim) => [
    ...(needsBasisLimitation(claim) ? [{ claim, template: 'basis' as const, key: claim.basis }] : []),
    ...(needsStatusLimitation(claim) ? [{ claim, template: 'status' as const, key: claim.status }] : []),
  ]);
  if (needs.length > 0 && draft.limitations.length === 0) {
    const ids = [...new Set(needs.map((need) => need.claim.id))].join(', ');
    fail(
      'G2_LIMITATIONS_MISSING',
      `claims ${ids} need a note on what could not be verified (they rest on documentation, an announcement, a briefing or a demo, or are only demonstrated or planned), but there is no "What we couldn't verify" section`,
      'limitations',
    );
  } else {
    for (const { claim, template, key } of needs) {
      const covered = draft.limitations.some((sentence) => sentence.template === template && sentence.claimIds.includes(claim.id));
      if (!covered) {
        fail(
          'G2_LIMITATION_COVERAGE',
          `claim ${claim.id} (${claim.label}) has the ${template} "${key}", but no limitation sentence with the ${template} template cites it`,
          claim.id,
        );
      }
    }
  }

  return { failures, holdReasons: [] };
};
