import { CATEGORY_VOCAB, SLUG_PATTERN } from '@robywire/gate';

// The routes of the site, written once. Every path ends in a slash except the
// share image, and every slug is checked, so a typo or a hostile slug cannot
// build a link that goes somewhere else.

function checkedSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`paths: not a slug: ${JSON.stringify(slug)}`);
  return slug;
}

/** An article page. */
export const articlePath = (slug: string): string => `/news/${checkedSlug(slug)}/`;

/** The receipts page of an article. */
export const receiptsPath = (slug: string): string => `/news/${checkedSlug(slug)}/receipts/`;

/** The share image of an article. */
export const cardPath = (slug: string): string => `/news/${checkedSlug(slug)}/card.png`;

/** The page for a beat or a tag. */
export function topicPath(topic: string): string {
  if (!(CATEGORY_VOCAB as readonly string[]).includes(topic)) throw new Error(`paths: not a beat or a tag: ${JSON.stringify(topic)}`);
  return `/topics/${topic}/`;
}
