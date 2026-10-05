import type { LedgerSection } from './constants';
import type { Claim, Draft, Sentence } from './schemas';

/** A sentence of a draft together with where it sits. */
export interface LocatedSentence {
  section: LedgerSection;
  /** The section heading. Present on body sentences only. */
  heading?: string;
  /** 0-based position over the whole piece, in document order. The ledger uses the same numbering. */
  index: number;
  /** 1-based position within its section. For a body section, paragraphs count as one run. */
  position: number;
  /**
   * 0-based number of the paragraph it belongs to, within its section or list. The opening and the
   * limitations are one paragraph each, so 0; each key takeaway is a bullet of its own, so its
   * position minus 1; the paragraphs of a body section count from 0 under their heading, and neighbouring
   * sections with the same heading count on from each other, because the page shows them as one section.
   * An empty paragraph is not counted. The title and the description are 0.
   */
  paragraph: number;
  sentence: Sentence;
}

/**
 * Every sentence of `draft` in document order: title, description, opening,
 * takeaways, each section's paragraphs, then the limitations. The sentences
 * returned are the draft's own, not copies.
 */
export function allSentences(draft: Draft): LocatedSentence[] {
  const located: LocatedSentence[] = [];
  const add = (section: LedgerSection, sentence: Sentence, position: number, paragraph: number, heading?: string) => {
    const item: LocatedSentence = { section, index: located.length, position, paragraph, sentence };
    if (heading !== undefined) item.heading = heading;
    located.push(item);
  };

  add('title', draft.title, 1, 0);
  add('description', draft.description, 1, 0);
  draft.opening.forEach((sentence, at) => add('opening', sentence, at + 1, 0));
  draft.takeaways.forEach((sentence, at) => add('takeaways', sentence, at + 1, at));
  let previousHeading: string | undefined;
  let paragraph = 0;
  for (const section of draft.sections) {
    if (section.heading !== previousHeading) paragraph = 0;
    previousHeading = section.heading;
    let position = 0;
    for (const sentences of section.paragraphs) {
      if (sentences.length === 0) continue;
      for (const sentence of sentences) add('body', sentence, ++position, paragraph, section.heading);
      paragraph++;
    }
  }
  draft.limitations.forEach((sentence, at) => add('limitations', sentence, at + 1, 0));
  return located;
}

/** A short description of where a sentence sits, for the `where` of a failure. */
export function describeLocation(item: LocatedSentence): string {
  if (item.section === 'title' || item.section === 'description') return item.section;
  if (item.section === 'body') return `section "${item.heading ?? ''}", sentence ${item.position}`;
  return `${item.section}, sentence ${item.position}`;
}

/**
 * The claims that the sentences of `draft` cite, other than the limitation
 * sentences, which only describe claims. Each claim is listed once, in the
 * order of `claims`; an id that no claim has is ignored.
 */
export function citedClaims(draft: Draft, claims: readonly Claim[]): Claim[] {
  const cited = new Set(
    allSentences(draft)
      .filter((item) => item.sentence.kind !== 'limitation')
      .flatMap((item) => item.sentence.claimIds),
  );
  return claims.filter((claim) => cited.has(claim.id));
}
