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
  sentence: Sentence;
}

/**
 * Every sentence of `draft` in document order: title, description, opening,
 * takeaways, each section's paragraphs, then the limitations. The sentences
 * returned are the draft's own, not copies.
 */
export function allSentences(draft: Draft): LocatedSentence[] {
  const located: LocatedSentence[] = [];
  const add = (section: LedgerSection, sentence: Sentence, position: number, heading?: string) => {
    const item: LocatedSentence = { section, index: located.length, position, sentence };
    if (heading !== undefined) item.heading = heading;
    located.push(item);
  };

  add('title', draft.title, 1);
  add('description', draft.description, 1);
  draft.opening.forEach((sentence, at) => add('opening', sentence, at + 1));
  draft.takeaways.forEach((sentence, at) => add('takeaways', sentence, at + 1));
  for (const section of draft.sections) {
    section.paragraphs.flat().forEach((sentence, at) => add('body', sentence, at + 1, section.heading));
  }
  draft.limitations.forEach((sentence, at) => add('limitations', sentence, at + 1));
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
