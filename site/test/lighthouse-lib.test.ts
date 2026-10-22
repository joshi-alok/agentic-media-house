import { describe, expect, it } from 'vitest';
import { CATEGORIES, MAX_RUNS, THRESHOLD, chromeFlags, formatScores, isFixtureBuild, lowScores, measureRoute, measureRoutes, medianScores, needsRepeat, pagesToTest, repeatNote } from '../scripts/lighthouse-lib.mjs';

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
    const body = `<a href="/topics/payments-commerce/">h</a><a href="/news/other/receipts/">r</a>${LEAD}<a href="/news/second/">s</a>`;
    expect(pagesToTest(home(body))[1]).toBe(`/news/${SLUG}/`);
  });

  it('stops with a clear message when the home page links to no article', () => {
    expect(() => pagesToTest(home('<p>No pieces yet.</p>'))).toThrow('links to no article');
  });
});

describe('pagesToTest: an article that rests on another outlet', () => {
  const HELD = 'fixture-robotics-ships-fx-5-to-second-plant';
  const links = `${LEAD}<h2><a href="/news/fixture-robotics-ships-fx-2-to-second-plant/">Second</a></h2><h2><a href="/news/${HELD}/">Held</a></h2>`;
  const label = '<p><strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part.</p>';
  const articles = (pages: Record<string, string>) => (route: string) => pages[route];

  it('adds the first article with the Unconfirmed. label, and its receipts page, after the lead article and its receipts', () => {
    const read = articles({ [`/news/${SLUG}/`]: '<p>plain</p>', '/news/fixture-robotics-ships-fx-2-to-second-plant/': '<p>plain</p>', [`/news/${HELD}/`]: label });
    expect(pagesToTest(home(RIBBON + links), read)).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${HELD}/`, `/news/${HELD}/receipts/`]);
  });

  it('measures the lead once when the lead is the article that carries the label', () => {
    expect(pagesToTest(home(RIBBON + links), articles({ [`/news/${SLUG}/`]: label, [`/news/${HELD}/`]: label }))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${HELD}/`, `/news/${HELD}/receipts/`]);
    expect(pagesToTest(home(RIBBON + LEAD), articles({ [`/news/${SLUG}/`]: label }))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('takes the first of several articles with the label', () => {
    const read = articles({ '/news/fixture-robotics-ships-fx-2-to-second-plant/': label, [`/news/${HELD}/`]: label });
    expect(pagesToTest(home(RIBBON + links), read)[3]).toBe('/news/fixture-robotics-ships-fx-2-to-second-plant/');
  });

  it('adds nothing when no article has the label, or when an article cannot be read', () => {
    expect(pagesToTest(home(RIBBON + links), articles({}))).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
  });

  it('does not take the word in running text, or another bold label, for the label', () => {
    const read = articles({ [`/news/${HELD}/`]: '<p>It is Unconfirmed. <strong>Analysis.</strong> Not that.</p>' });
    expect(pagesToTest(home(RIBBON + links), read)).toHaveLength(3);
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

describe('medianScores', () => {
  const scores = (performance: number | null, rest: Partial<typeof PERFECT> = {}) => ({ ...PERFECT, ...rest, performance });

  it('is the middle score of each category over three runs', () => {
    expect(medianScores([scores(0.87), scores(1), scores(0.9)])).toEqual({ ...PERFECT, performance: 0.9 });
  });

  it('is not the best or the worst run, and does not depend on the order of the runs', () => {
    for (const runs of [[0.87, 1, 1], [1, 0.87, 1], [1, 1, 0.87]]) expect(medianScores(runs.map((value) => scores(value))).performance).toBe(1);
    for (const runs of [[0.87, 0.88, 1], [1, 0.88, 0.87], [0.88, 1, 0.87]]) expect(medianScores(runs.map((value) => scores(value))).performance).toBe(0.88);
  });

  it('takes the median of each category by itself, so that a different run can be the odd one out in each', () => {
    const median = medianScores([
      { performance: 0.87, accessibility: 1, 'best-practices': 1, seo: 1 },
      { performance: 1, accessibility: 0.9, 'best-practices': 1, seo: 1 },
      { performance: 1, accessibility: 1, 'best-practices': 0.8, seo: 1 },
    ]);
    expect(median).toEqual(PERFECT);
  });

  it('is the lower of the two middle scores over two runs, so that it is never better than the data supports', () => {
    expect(medianScores([scores(1), scores(0.87)]).performance).toBe(0.87);
    expect(medianScores([scores(0.87), scores(1)]).performance).toBe(0.87);
  });

  it('is the lower of the two middle scores over four runs', () => {
    expect(medianScores([scores(0.8), scores(0.9), scores(0.95), scores(1)]).performance).toBe(0.9);
  });

  it('is the score of the run when there is one run', () => {
    expect(medianScores([scores(0.87)])).toEqual({ ...PERFECT, performance: 0.87 });
  });

  it('has a score for every category, and nothing else', () => {
    expect(Object.keys(medianScores([scores(1)]))).toEqual(CATEGORIES);
  });

  it('is null for a category with no score in most of the runs', () => {
    expect(medianScores([scores(null), scores(null), scores(1)]).performance).toBeNull();
    expect(medianScores([scores(null)]).performance).toBeNull();
    expect(medianScores([scores(null), scores(1)]).performance).toBeNull();
  });

  it('leaves a category that has a score in most of the runs to the runs that have one', () => {
    expect(medianScores([scores(null), scores(0.9), scores(1)]).performance).toBe(0.9);
    expect(medianScores([scores(1), scores(null), scores(1)]).performance).toBe(1);
  });

  it('counts a category that is missing from a run as a category with no score', () => {
    const without = { performance: 1, accessibility: 1, 'best-practices': 1 };
    expect(medianScores([without, PERFECT, PERFECT]).seo).toBe(1);
    expect(medianScores([without, without, PERFECT]).seo).toBeNull();
  });

  it('is null in every category when there are no runs', () => {
    expect(medianScores([])).toEqual({ performance: null, accessibility: null, 'best-practices': null, seo: null });
  });
});

describe('needsRepeat', () => {
  it('is false when every score reaches the threshold, 0.95 included', () => {
    expect(needsRepeat(PERFECT)).toBe(false);
    expect(needsRepeat({ ...PERFECT, seo: 0.95 })).toBe(false);
  });

  it('is true when any score is below the threshold', () => {
    expect(needsRepeat({ ...PERFECT, performance: 0.87 })).toBe(true);
    expect(needsRepeat({ ...PERFECT, seo: 0.94 })).toBe(true);
  });

  it('is true when a category has no score, or is missing', () => {
    expect(needsRepeat({ ...PERFECT, accessibility: null })).toBe(true);
    expect(needsRepeat({ performance: 1, accessibility: 1, 'best-practices': 1 })).toBe(true);
  });

  it('takes the threshold as a second argument', () => {
    expect(needsRepeat({ ...PERFECT, performance: 0.9 }, 0.9)).toBe(false);
    expect(needsRepeat({ ...PERFECT, performance: 0.9 }, 0.91)).toBe(true);
  });
});

describe('measureRoute', () => {
  /** A measurement that gives the scores in turn and counts its calls. */
  function fake(...performances: (number | null)[]) {
    const calls: string[] = [];
    const runOnce = async (route: string) => {
      calls.push(route);
      return { ...PERFECT, performance: performances[Math.min(calls.length, performances.length) - 1] ?? null };
    };
    return { calls, runOnce };
  }

  it('allows three runs in all', () => {
    expect(MAX_RUNS).toBe(3);
  });

  it('measures a page that passes on its first run once, and gives that run as it is, with no list of runs', async () => {
    const { calls, runOnce } = fake(1, 0.5, 0.5);
    expect(await measureRoute('/x/', runOnce)).toEqual({ url: '/x/', scores: PERFECT });
    expect(calls).toEqual(['/x/']);
  });

  it('does not measure again for a score of exactly 0.95', async () => {
    const { calls, runOnce } = fake(0.95, 0.5, 0.5);
    expect((await measureRoute('/x/', runOnce)).scores.performance).toBe(0.95);
    expect(calls).toHaveLength(1);
  });

  it('measures twice more when the first run is below the floor, and gives the median row and the runs', async () => {
    const { calls, runOnce } = fake(0.87, 1, 1);
    const result = await measureRoute('/x/', runOnce);
    expect(calls).toEqual(['/x/', '/x/', '/x/']);
    expect(result.url).toBe('/x/');
    expect(result.scores).toEqual(PERFECT);
    expect(result.runs).toEqual([{ ...PERFECT, performance: 0.87 }, PERFECT, PERFECT]);
  });

  it('measures twice more when the first run has no score in a category', async () => {
    const { calls, runOnce } = fake(null, 1, 1);
    expect((await measureRoute('/x/', runOnce)).scores).toEqual(PERFECT);
    expect(calls).toHaveLength(3);
  });

  it('measures three times and no more, however low the scores are', async () => {
    const { calls, runOnce } = fake(0.5, 0.5, 0.5, 0.5, 0.5);
    const result = await measureRoute('/x/', runOnce);
    expect(calls).toHaveLength(3);
    expect(result.runs).toHaveLength(3);
    expect(result.scores.performance).toBe(0.5);
  });

  it('measures the second and the third run even when the second is high, because the median needs three', async () => {
    const { calls, runOnce } = fake(0.87, 1, 0.87);
    const result = await measureRoute('/x/', runOnce);
    expect(calls).toHaveLength(3);
    expect(result.scores.performance).toBe(0.87);
  });

  it('judges the page by the median: a page that is low in the first run and in one other run is low', async () => {
    expect((await measureRoute('/x/', fake(0.87, 0.88, 1).runOnce)).scores.performance).toBe(0.88);
    expect((await measureRoute('/x/', fake(0.87, 1, 0.87).runOnce)).scores.performance).toBe(0.87);
    expect((await measureRoute('/x/', fake(0.87, 0.87, 1).runOnce)).scores.performance).toBe(0.87);
  });

  it('runs one after the other, never two at the same time', async () => {
    let running = 0;
    let most = 0;
    const runOnce = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return { ...PERFECT, performance: 0.5 };
    };
    await measureRoute('/x/', runOnce);
    expect(most).toBe(1);
  });

  it('passes on the failure of a run, in the first or in a later one', async () => {
    await expect(measureRoute('/x/', async () => Promise.reject(new Error('the page did not load')))).rejects.toThrow('the page did not load');
    let count = 0;
    const later = async () => {
      count += 1;
      if (count === 2) throw new Error('Chrome crashed');
      return { ...PERFECT, performance: 0.5 };
    };
    await expect(measureRoute('/x/', later)).rejects.toThrow('Chrome crashed');
  });
});

describe('measureRoutes', () => {
  it('measures the pages in order, one after the other, and repeats only the pages that need it', async () => {
    const calls: string[] = [];
    const first: Record<string, number> = {};
    const rows = await measureRoutes(['/', '/a/', '/b/'], async (route) => {
      calls.push(route);
      first[route] = (first[route] ?? 0) + 1;
      return { ...PERFECT, performance: route === '/a/' && first[route] === 1 ? 0.87 : 1 };
    });
    expect(calls).toEqual(['/', '/a/', '/a/', '/a/', '/b/']);
    expect(rows.map((item) => item.url)).toEqual(['/', '/a/', '/b/']);
    expect(rows.map((item) => item.runs?.length)).toEqual([undefined, 3, undefined]);
    expect(lowScores(rows)).toEqual([]);
  });
});

describe('repeatNote', () => {
  const runs = (...performances: (number | null)[]) => performances.map((performance) => ({ ...PERFECT, performance }));
  const measured = (url: string, ...performances: (number | null)[]) => ({ url, scores: medianScores(runs(...performances)), runs: runs(...performances) });

  it('is undefined for a page that was measured once', () => {
    expect(repeatNote(row('/x/', PERFECT))).toBeUndefined();
    expect(repeatNote({ url: '/x/', scores: PERFECT, runs: [PERFECT] })).toBeUndefined();
  });

  it('says how often the page was measured, the lowest score of each run, and the lowest of the medians', () => {
    expect(repeatNote(measured('/x/', 0.87, 1, 1))).toBe('  /x/ measured 3 times (lowest score of each run: 87, 100, 100), lowest median 100');
  });

  it('shows a median below the floor as it is', () => {
    expect(repeatNote(measured('/x/', 0.87, 0.88, 1))).toBe('  /x/ measured 3 times (lowest score of each run: 87, 88, 100), lowest median 88');
  });

  it('takes the lowest category of each run, not only the performance', () => {
    const note = repeatNote({ url: '/x/', scores: PERFECT, runs: [{ ...PERFECT, seo: 0.9, performance: 0.97 }, PERFECT, PERFECT] });
    expect(note).toBe('  /x/ measured 3 times (lowest score of each run: 90, 100, 100), lowest median 100');
  });

  it('shows a run with a missing score as two dashes', () => {
    expect(repeatNote(measured('/x/', null, 1, 1))).toBe('  /x/ measured 3 times (lowest score of each run: --, 100, 100), lowest median 100');
  });

  it('is plain ASCII', () => {
    expect([...repeatNote(measured('/x/', 0.87, 1, 1))!].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});
