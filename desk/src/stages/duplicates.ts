import { dayNumber, jaccard, defaultConfig as defaultGateConfig, titleTokens } from '@robywire/gate';
import type { Candidate } from '../index';
import type { PublishedIndex } from './context';

// Is a candidate a story the Desk has already seen or published? The rules are the gate's: the same word-overlap
// score and threshold as G9 (the gate rejects a draft whose title is too close to a recent one), so a story
// that Discover lets through is not one that the gate would call a repeat of a piece of the last two weeks.

const GATE = defaultGateConfig();

/** Do two titles tell the same story? Their words, leaving out the small ones, overlap by at least the gate's threshold. */
export function sameStory(a: string, b: string): boolean {
  return jaccard(titleTokens(a), titleTokens(b)) >= GATE.titleSimilarityThreshold;
}

/**
 * Has this candidate been published already? Yes when its address is one that a published piece cites (at any age),
 * or when its title tells the same story as a title published on `date` or in the days before it, up to the
 * gate's window of 14 (a title dated after `date` is not considered).
 */
export function isCovered(candidate: Candidate, published: PublishedIndex, date: string): boolean {
  if (published.sourceUrls.includes(candidate.url)) return true;
  const today = dayNumber(date) ?? Number.NaN;
  return published.titles.some((entry) => {
    const days = today - (dayNumber(entry.publishedAt) ?? Number.NaN);
    // NaN is neither below 0 nor above the window, so a date that is not real cannot rule a title out.
    if (days < 0 || days > GATE.titleWindowDays) return false;
    return sameStory(candidate.title, entry.title);
  });
}
