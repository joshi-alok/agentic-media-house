import type { GateInput } from '../gate';

/** How to turn one piece into another. */
export interface VariantOptions {
  slug: string;
  publishedAt: string;
  categories: string[];
  /**
   * Text to swap, in order, as [from, to] pairs. Every occurrence is replaced,
   * in the draft and in the claims together, so a sentence and the claim it
   * cites stay consistent. If `to` is as long as `from`, the claims' span
   * offsets stay correct too.
   */
  replace: [string, string][];
}

const NOT_JSON_SAFE = /["\\]/;

/**
 * A copy of `base` that tells the same story about something else. The
 * replacements run on the JSON text of the draft and the claims, so a name,
 * a number or a URL changes everywhere it appears. The slug, the date and the
 * categories are then set from `options`. `base` is never changed.
 */
export function makeVariant(base: GateInput, options: VariantOptions): GateInput {
  let json = JSON.stringify({ draft: base.draft, claims: base.claims });
  for (const [from, to] of options.replace) {
    if (from === '') throw new Error('makeVariant: a replacement cannot start from an empty string');
    if (NOT_JSON_SAFE.test(from) || NOT_JSON_SAFE.test(to)) {
      throw new Error('makeVariant: replacements may not contain quotation marks or backslashes');
    }
    if (!json.includes(from)) throw new Error(`makeVariant: "${from}" does not occur in the draft or the claims`);
    json = json.split(from).join(to);
  }
  const variant = JSON.parse(json) as GateInput;
  variant.draft.slug = options.slug;
  variant.draft.publishedAt = options.publishedAt;
  variant.draft.categories = [...options.categories];
  return variant;
}
