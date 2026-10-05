import { describe, expect, it } from 'vitest';
import { defaultContext } from '../src/config';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { Claim, Draft } from '../src/schemas';

// The site's fixture pieces are variants of the golden piece: the same story
// about a different (fictional) product, so that the home page and the topic
// pages have several pieces to show. Each one must pass the whole gate, or the
// fixtures would show things the real site could never publish.

const swapProduct = (n: number): [string, string][] => [
  ['FX-1', `FX-${n}`],
  ['fx-1', `fx-${n}`],
];

const VARIANTS = [
  { n: 2, slug: 'fixture-robotics-ships-fx-2-to-second-plant', publishedAt: '2026-10-03', categories: ['humanoids'] },
  { n: 3, slug: 'fixture-robotics-ships-fx-3-to-second-plant', publishedAt: '2026-10-02', categories: ['policy-standards'] },
  { n: 4, slug: 'fixture-robotics-ships-fx-4-to-second-plant', publishedAt: '2026-10-01', categories: ['home-consumer', 'field-mobility'] },
];

const variantOf = (v: (typeof VARIANTS)[number]) =>
  makeVariant(cloneGolden(), { slug: v.slug, publishedAt: v.publishedAt, categories: v.categories, replace: swapProduct(v.n) });

describe('makeVariant: the variants pass the whole gate', () => {
  it.each(VARIANTS)('FX-$n publishes with no failures and no hold reasons', (v) => {
    const result = runGate(variantOf(v), defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
  });

  it('keeps every variant valid against the schemas', () => {
    for (const v of VARIANTS) {
      const variant = variantOf(v);
      expect(() => Draft.parse(variant.draft)).not.toThrow();
      for (const claim of variant.claims) expect(() => Claim.parse(claim)).not.toThrow();
    }
  });
});

describe('makeVariant: what changes', () => {
  const variant = variantOf(VARIANTS[0]!);

  it('sets the slug, the date and the categories', () => {
    expect(variant.draft.slug).toBe('fixture-robotics-ships-fx-2-to-second-plant');
    expect(variant.draft.publishedAt).toBe('2026-10-03');
    expect(variant.draft.categories).toEqual(['humanoids']);
  });

  it('sets the slug from the options even when the replacements would have produced another one', () => {
    const renamed = makeVariant(cloneGolden(), { slug: 'a-different-slug', publishedAt: '2026-10-03', categories: ['humanoids'], replace: swapProduct(2) });
    expect(renamed.draft.slug).toBe('a-different-slug');
  });

  it('applies each replacement to the draft and to the claims alike', () => {
    expect(variant.draft.title.text).toBe('Fixture Robotics ships its FX-2 warehouse arm to a second plant');
    const json = JSON.stringify(variant);
    expect(json).not.toContain('FX-1');
    expect(json).not.toContain('fx-1');
    const first = variant.claims[0]!;
    expect(first.span.quote).toContain('FX-2 warehouse arms');
    expect(first.values.map((value) => value.normalised)).toContain('fx-2');
    expect(first.source.url).toBe('https://fixture-robotics.example/news/fx-2-second-plant');
  });

  it('applies the replacements in the order given', () => {
    const chained = makeVariant(cloneGolden(), { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'], replace: [['FX-1', 'FX-2'], ['FX-2', 'FX-7']] });
    expect(chained.draft.title.text).toContain('FX-7');
    expect(chained.draft.title.text).not.toContain('FX-2');
  });

  it('keeps the span length equal to the quote length when the replacement has the same length', () => {
    for (const claim of variant.claims) expect(claim.span.end - claim.span.start).toBe(claim.span.quote.length);
  });
});

describe('makeVariant: the base is never changed', () => {
  it('leaves a frozen base untouched and returns a separate copy', () => {
    const base = { draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS };
    const variant = makeVariant(base, { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'], replace: swapProduct(2) });
    expect(variant.draft).not.toBe(GOLDEN_DRAFT);
    expect(variant.claims).not.toBe(GOLDEN_CLAIMS);
    expect(JSON.stringify(GOLDEN_DRAFT)).toContain('FX-1');
    expect(cloneGolden()).toEqual({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
  });

  it('works with no replacement at all', () => {
    const same = makeVariant(cloneGolden(), { slug: GOLDEN_DRAFT.slug, publishedAt: GOLDEN_DRAFT.publishedAt, categories: [...GOLDEN_DRAFT.categories], replace: [] });
    expect(same).toEqual(cloneGolden());
  });
});

describe('makeVariant: mistakes fail loudly', () => {
  const options = { slug: 'a-b', publishedAt: '2026-10-03', categories: ['humanoids'] };

  it('throws when a replacement matches nothing', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-9', 'FX-8']] })).toThrow('makeVariant: "FX-9" does not occur in the draft or the claims');
  });

  it('throws when a replacement starts from an empty string', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['', 'x']] })).toThrow('makeVariant: a replacement cannot start from an empty string');
  });

  it('throws when a replacement contains a quotation mark or a backslash', () => {
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-1', 'FX"1']] })).toThrow('makeVariant: replacements may not contain quotation marks or backslashes');
    expect(() => makeVariant(cloneGolden(), { ...options, replace: [['FX-1', 'FX\\1']] })).toThrow('makeVariant: replacements may not contain quotation marks or backslashes');
  });
});
