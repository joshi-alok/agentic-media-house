import { hasWholePhrase, normaliseQuotes } from '@robywire/gate';

// The words by which a feed is narrowed to the beats of the publication. A feed such as arXiv or a trade outlet publishes mostly what the publication is not about,
// and a model that is shown every title spends its attention (and the shortlist) on them. An item is a candidate only if its title or its summary holds one of the keywords
// of its source, as a whole word or phrase: "agent" is not "reagent" and not "agents", so a source lists the forms it wants.

/** `text` with its tags taken out and its white space folded: a summary of a feed may hold HTML. */
export function plainText(text: string | undefined): string {
  return (text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Does `text` hold one of `keywords`? No keywords: yes, every item is kept. Case is ignored. */
export function matchesKeywords(text: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return true;
  // `hasWholePhrase` wants both sides folded the way the gate folds text: plain quotes, lowercase, one space between words.
  const fold = (value: string): string => normaliseQuotes(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const folded = fold(text);
  return keywords.some((keyword) => hasWholePhrase(folded, fold(keyword)));
}
