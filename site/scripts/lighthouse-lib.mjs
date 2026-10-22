import { hasUnconfirmedLabel } from './audit/checks-links.mjs';
import { attr, elements, parseHtml } from './audit/dom.mjs';

// The parts of the Lighthouse run that do not need a browser, so that they can
// be tested: which pages to measure, how Chrome is started, how a page that
// scores low is measured again and judged by the median of its runs, how the
// scores are shown and which of them are too low.

/** The four Lighthouse categories, in the order they are shown. */
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** The names of the categories as the table shows them. */
const HEADINGS = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO' };

/** The lowest score a page may have in any category. */
export const THRESHOLD = 0.95;

/** How often a page is measured at most: the first run, and two more when the first is below the floor. */
export const MAX_RUNS = 3;

/**
 * True for the home page of a fixture build, which carries the fixture ribbon.
 * @param {string} homeHtml
 * @returns {boolean}
 */
export function isFixtureBuild(homeHtml) {
  return homeHtml.includes('FIXTURE DATA');
}

/**
 * The pages to measure: the home page, the first article the home page links to (its lead piece) and the receipts page of that
 * article; and, when the build has one, the first other article that carries the "Unconfirmed." label (a piece that rests on
 * another outlet) and its receipts page, because those pages have markup the others do not.
 *
 * @param {string} homeHtml
 * @param {(route: string) => string | undefined} [readArticle]  The HTML of the article page at a route, or undefined if it cannot be read.
 * @returns {string[]}
 */
export function pagesToTest(homeHtml, readArticle = () => undefined) {
  const { document } = parseHtml(homeHtml);
  const routes = [
    ...new Set(
      elements(document, 'a')
        .map((link) => attr(link, 'href') ?? '')
        .filter((href) => /^\/news\/[^/]+\/$/.test(href)),
    ),
  ];
  const [lead, ...others] = routes;
  if (lead === undefined) throw new Error('The home page links to no article, so there is no article page to measure.');
  const pages = ['/', lead, `${lead}receipts/`];
  const unconfirmed = others.find((route) => {
    const html = readArticle(route);
    return html !== undefined && hasUnconfirmedLabel(parseHtml(html).document);
  });
  return unconfirmed === undefined ? pages : [...pages, unconfirmed, `${unconfirmed}receipts/`];
}

/**
 * The flags Chrome is started with: headless, and without its sandbox when the CI variable is set, because
 * a container on a CI runner usually cannot give Chrome one.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function chromeFlags(env) {
  const inCi = env.CI !== undefined && env.CI !== '' && env.CI !== 'false' && env.CI !== '0';
  return inCi ? ['--headless', '--no-sandbox'] : ['--headless'];
}

/**
 * The scores of one run of one page, each from 0 to 1 or null when Lighthouse gave none.
 * @typedef {Record<string, number | null>} Scores
 */

/**
 * One page and its scores. When the page was measured more than once, `scores` is the median of the runs and `runs` has the
 * scores of each run, in the order of the runs.
 * @typedef {{ url: string, scores: Scores, runs?: Scores[] }} ScoreRow
 */

/**
 * Every score below `threshold`, and every category with no score at all.
 * @param {ScoreRow[]} rows
 * @param {number} [threshold]
 * @returns {{ url: string, category: string, score: number | null }[]}
 */
export function lowScores(rows, threshold = THRESHOLD) {
  return rows.flatMap((row) =>
    CATEGORIES.flatMap((category) => {
      const score = row.scores[category] ?? null;
      return score === null || score < threshold ? [{ url: row.url, category, score }] : [];
    }),
  );
}

/**
 * The median of the scores of several runs of one page, for each category. It is the middle score; over an even number of
 * scores it is the lower of the two middle ones, so that the result is never better than the data supports. A category is
 * null when it has a score in no more than half of the runs, because the runs then do not say what the page scores. A category
 * that a run does not have counts as a category with no score.
 *
 * @param {Scores[]} runs
 * @returns {Scores}
 */
export function medianScores(runs) {
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const scored = runs.flatMap((run) => run[category] ?? []).sort((a, b) => a - b);
      return [category, scored.length * 2 > runs.length ? scored[Math.floor((scored.length - 1) / 2)] : null];
    }),
  );
}

/**
 * True when a run scores below `threshold` in any category, or has no score in one, which is when the page is measured again.
 * @param {Scores} scores
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function needsRepeat(scores, threshold = THRESHOLD) {
  return lowScores([{ url: '', scores }], threshold).length > 0;
}

/**
 * Measure one page: run once; if that run is below the floor in any category (or has no score), run twice more, three runs in
 * all and never more, and judge the page by the median of the runs. A page that passes on its first run is measured once.
 * The runs are one after the other.
 *
 * @param {string} route
 * @param {(route: string) => Promise<Scores>} runOnce  One Lighthouse run of the page at `route`.
 * @param {number} [threshold]
 * @returns {Promise<ScoreRow>}
 */
export async function measureRoute(route, runOnce, threshold = THRESHOLD) {
  const runs = [await runOnce(route)];
  if (needsRepeat(runs[0], threshold)) {
    while (runs.length < MAX_RUNS) runs.push(await runOnce(route));
    return { url: route, scores: medianScores(runs), runs };
  }
  return { url: route, scores: runs[0] };
}

/**
 * Measure the pages one after the other, each with `measureRoute`.
 *
 * @param {string[]} routes
 * @param {(route: string) => Promise<Scores>} runOnce
 * @param {number} [threshold]
 * @returns {Promise<ScoreRow[]>}
 */
export async function measureRoutes(routes, runOnce, threshold = THRESHOLD) {
  /** @type {ScoreRow[]} */
  const rows = [];
  for (const route of routes) rows.push(await measureRoute(route, runOnce, threshold));
  return rows;
}

/**
 * A score out of 100 as a whole number, or two dashes when there is none.
 * @param {number | null} score
 * @returns {string}
 */
function whole(score) {
  return score === null ? '--' : String(Math.round(score * 100));
}

/**
 * The lowest score of a run over the categories, or null when a category has none.
 * @param {Scores} scores
 * @returns {number | null}
 */
function lowest(scores) {
  const all = CATEGORIES.map((category) => scores[category] ?? null);
  return all.includes(null) ? null : Math.min(.../** @type {number[]} */ (all));
}

/**
 * One short line for a page that was measured more than once: how often, the lowest score of each run, and the lowest of the
 * medians, which is what the page is judged by. Undefined for a page that was measured once.
 *
 * @param {ScoreRow} row
 * @returns {string | undefined}
 */
export function repeatNote(row) {
  const runs = row.runs ?? [];
  if (runs.length < 2) return undefined;
  return `  ${row.url} measured ${runs.length} times (lowest score of each run: ${runs.map((run) => whole(lowest(run))).join(', ')}), lowest median ${whole(lowest(row.scores))}`;
}

/**
 * A table of the scores, one row for each page, as whole numbers out of 100.
 * @param {ScoreRow[]} rows
 * @returns {string}
 */
export function formatScores(rows) {
  const urlWidth = Math.max('Page'.length, ...rows.map((row) => row.url.length));
  const widths = CATEGORIES.map((category) => HEADINGS[/** @type {keyof typeof HEADINGS} */ (category)].length);
  const line = (/** @type {string} */ first, /** @type {string[]} */ cells) =>
    [first.padEnd(urlWidth), ...cells.map((cell, index) => cell.padStart(widths[index]))].join('  ');
  return [
    line('Page', CATEGORIES.map((category) => HEADINGS[/** @type {keyof typeof HEADINGS} */ (category)])),
    ...rows.map((row) =>
      line(
        row.url,
        CATEGORIES.map((category) => whole(row.scores[category] ?? null)),
      ),
    ),
  ].join('\n');
}
