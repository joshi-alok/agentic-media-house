import type { Claim, LedgerSection } from '@robywire/gate';

// The words that the prompts use, outside the blocks, for what the Desk knows for itself.

/** Where a claim is from, in words, for the line outside its block: a primary source, or another outlet, named. */
export const provenance = (claim: Claim): string => (claim.source.tier === 2 ? `reported by ${claim.source.outlet}, another outlet` : 'from a primary source');

/** Where a sentence stands, in words that no composer wrote: the part of the piece, never the heading of a section. */
export const PLACE: Readonly<Record<LedgerSection, string>> = {
  title: 'the title',
  description: 'the description',
  opening: 'the opening',
  takeaways: 'a key takeaway',
  body: 'a section',
  limitations: 'the limitations',
};
