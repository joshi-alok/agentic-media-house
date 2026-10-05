import { describe, expect, it } from 'vitest';
import { disambiguateSlug } from '../src/slug';
import { SLUG_PATTERN } from '../src/schemas';

// Content contract section 7: a daily site will want the same slug twice. On a
// collision the year is appended, then the month; this gate adds the day as a
// last resort, and refuses to publish if even that is taken.
const SLUG = 'figure-raises-series-c';

describe('disambiguateSlug', () => {
  it('keeps a slug that is free', () => {
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set())).toBe(SLUG);
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set(['another-slug']))).toBe(SLUG);
  });

  it('appends the year when the slug is taken', () => {
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set([SLUG]))).toBe('figure-raises-series-c-2027');
  });

  it('appends the month when the year is taken as well, as in the contract example', () => {
    const taken = new Set([SLUG, 'figure-raises-series-c-2027']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe('figure-raises-series-c-2027-03');
  });

  it('appends the day when the month is taken too', () => {
    const taken = new Set([SLUG, 'figure-raises-series-c-2027', 'figure-raises-series-c-2027-03']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe('figure-raises-series-c-2027-03-15');
  });

  it('throws, naming the slug and every candidate it tried, when all four are taken', () => {
    const taken = new Set([
      SLUG,
      'figure-raises-series-c-2027',
      'figure-raises-series-c-2027-03',
      'figure-raises-series-c-2027-03-15',
    ]);
    expect(() => disambiguateSlug(SLUG, '2027-03-15', taken)).toThrow(
      'every candidate for the slug "figure-raises-series-c" is already published: figure-raises-series-c, figure-raises-series-c-2027, figure-raises-series-c-2027-03, figure-raises-series-c-2027-03-15',
    );
  });

  it('takes the first candidate that is free, whatever else is taken', () => {
    // The plain slug is free, so it wins even though every longer form is taken.
    const taken = new Set(['figure-raises-series-c-2027', 'figure-raises-series-c-2027-03', 'figure-raises-series-c-2027-03-15']);
    expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toBe(SLUG);
    // The year is free, so it wins even though the month and day forms are taken.
    expect(disambiguateSlug(SLUG, '2027-03-15', new Set([SLUG, 'figure-raises-series-c-2027-03']))).toBe('figure-raises-series-c-2027');
  });

  it('builds the suffix from publishedAt, not from the clock', () => {
    expect(disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG]))).toBe('figure-raises-series-c-2031');
    expect(disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG, 'figure-raises-series-c-2031']))).toBe('figure-raises-series-c-2031-12');
    expect(
      disambiguateSlug(SLUG, '2031-12-09', new Set([SLUG, 'figure-raises-series-c-2031', 'figure-raises-series-c-2031-12'])),
    ).toBe('figure-raises-series-c-2031-12-09');
  });

  it('does not change the set it is given', () => {
    const taken = new Set([SLUG]);
    disambiguateSlug(SLUG, '2027-03-15', taken);
    expect([...taken]).toEqual([SLUG]);
  });

  it('returns a valid slug whenever it is given one', () => {
    for (const taken of [new Set<string>(), new Set([SLUG]), new Set([SLUG, `${SLUG}-2027`]), new Set([SLUG, `${SLUG}-2027`, `${SLUG}-2027-03`])]) {
      expect(disambiguateSlug(SLUG, '2027-03-15', taken)).toMatch(SLUG_PATTERN);
    }
  });

  it.each(['', '2027', '2027-03', '2027-3-5', '2027-13-01', '2027-02-30', 'March 15, 2027', '2027-03-15T04:30:00Z'])(
    'refuses a publishedAt that is not a real YYYY-MM-DD date: "%s"',
    (publishedAt) => {
      expect(() => disambiguateSlug(SLUG, publishedAt, new Set())).toThrow(`publishedAt "${publishedAt}" is not a real date in the form YYYY-MM-DD`);
    },
  );

  it('refuses a bad date even when the plain slug is free, so a bad date is never hidden', () => {
    expect(() => disambiguateSlug(SLUG, 'soon', new Set())).toThrow('is not a real date');
  });
});
