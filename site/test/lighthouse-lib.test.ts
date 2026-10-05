import { describe, expect, it } from 'vitest';
import { CATEGORIES, THRESHOLD, chromeFlags, formatScores, isFixtureBuild, lowScores, pagesToTest } from '../scripts/lighthouse-lib.mjs';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const home = (body: string) => `<!doctype html><html lang="en"><head><title>T</title></head><body>${body}</body></html>`;
const RIBBON = '<div class="ribbon" role="note">FIXTURE DATA &mdash; not real reporting</div>';
const LEAD = `<h2><a href="/news/${SLUG}/">Title</a></h2>`;
const row = (url: string, scores: Record<string, number | null>) => ({ url, scores });
const PERFECT = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };

describe('isFixtureBuild', () => {
  it('is true for the home page of a fixture build, which carries the ribbon', () => {
    expect(isFixtureBuild(home(RIBBON + LEAD))).toBe(true);
  });

  it('is false for the home page of a production build', () => {
    expect(isFixtureBuild(home('<p class="empty">No pieces yet.</p>'))).toBe(false);
  });
});

describe('pagesToTest', () => {
  it('is the home page, the lead article and its receipts page', () => {
    expect(pagesToTest(home(RIBBON + LEAD))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('takes the first article link, and skips receipts links and topic links', () => {
    const body = `<a href="/topics/humanoids/">h</a><a href="/news/other/receipts/">r</a>${LEAD}<a href="/news/second/">s</a>`;
    expect(pagesToTest(home(body))[1]).toBe(`/news/${SLUG}/`);
  });

  it('stops with a clear message when the home page links to no article', () => {
    expect(() => pagesToTest(home('<p>No pieces yet.</p>'))).toThrow('links to no article');
  });
});

describe('chromeFlags', () => {
  it('runs Chrome headless', () => {
    expect(chromeFlags({})).toEqual(['--headless']);
  });

  it('adds --no-sandbox only when CI is set', () => {
    expect(chromeFlags({ CI: 'true' })).toEqual(['--headless', '--no-sandbox']);
    expect(chromeFlags({ CI: '1' })).toContain('--no-sandbox');
    expect(chromeFlags({ CI: '' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: 'false' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: '0' })).toEqual(['--headless']);
    expect(chromeFlags({ CI: undefined })).toEqual(['--headless']);
  });
});

describe('lowScores', () => {
  it('has the four categories and a threshold of 0.95', () => {
    expect(CATEGORIES).toEqual(['performance', 'accessibility', 'best-practices', 'seo']);
    expect(THRESHOLD).toBe(0.95);
  });

  it('is empty when every score reaches the threshold, 0.95 included', () => {
    expect(lowScores([row('/', PERFECT), row('/a/', { ...PERFECT, seo: 0.95 })])).toEqual([]);
  });

  it('lists each score below the threshold with its page and category', () => {
    expect(lowScores([row('/', PERFECT), row('/a/', { ...PERFECT, performance: 0.94, seo: 0.5 })])).toEqual([
      { url: '/a/', category: 'performance', score: 0.94 },
      { url: '/a/', category: 'seo', score: 0.5 },
    ]);
  });

  it('counts a category that has no score as a failure', () => {
    expect(lowScores([row('/', { ...PERFECT, accessibility: null })])).toEqual([{ url: '/', category: 'accessibility', score: null }]);
  });

  it('counts a category that is missing altogether as a failure', () => {
    expect(lowScores([row('/', { performance: 1, accessibility: 1, 'best-practices': 1 })])).toEqual([{ url: '/', category: 'seo', score: null }]);
  });
});

describe('formatScores', () => {
  it('writes a table of the four scores for each page, as whole numbers out of 100', () => {
    const table = formatScores([row('/', PERFECT), row('/news/a-long-slug/receipts/', { performance: 0.97, accessibility: 1, 'best-practices': 0.96, seo: 1 })]);
    expect(table).toBe(
      [
        'Page                         Performance  Accessibility  Best practices  SEO',
        '/                                    100            100             100  100',
        '/news/a-long-slug/receipts/           97            100              96  100',
      ].join('\n'),
    );
  });

  it('shows a missing score as two dashes', () => {
    const line = formatScores([row('/', { performance: 1, accessibility: null, 'best-practices': 1, seo: 1 })]).split('\n')[1]!;
    expect(line.split(/\s{2,}/)).toEqual(['/', '100', '--', '100', '100']);
  });
});
