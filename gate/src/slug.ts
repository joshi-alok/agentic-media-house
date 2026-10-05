import { parseDateToken } from './normalise';

/**
 * Pick a slug that is not published yet. The content contract (section 7)
 * lets a recurring story reuse a slug by adding the year, then the month; this
 * adds the day as a last resort. The candidates, in order:
 *
 *   slug, slug-YYYY, slug-YYYY-MM, slug-YYYY-MM-DD
 *
 * The date is the piece's `publishedAt`, never the clock. The first candidate
 * that is not in `existing` is returned. If all four are taken it throws, and
 * the run fails closed instead of overwriting a published page.
 */
export function disambiguateSlug(slug: string, publishedAt: string, existing: ReadonlySet<string>): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || parseDateToken(publishedAt)?.precision !== 'day') {
    throw new Error(`disambiguateSlug: publishedAt "${publishedAt}" is not a real date in the form YYYY-MM-DD`);
  }
  const candidates = [slug, `${slug}-${publishedAt.slice(0, 4)}`, `${slug}-${publishedAt.slice(0, 7)}`, `${slug}-${publishedAt}`];
  const free = candidates.find((candidate) => !existing.has(candidate));
  if (free === undefined) {
    throw new Error(`disambiguateSlug: every candidate for the slug "${slug}" is already published: ${candidates.join(', ')}`);
  }
  return free;
}
