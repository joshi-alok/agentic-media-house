import { hasUnconfirmedLabel } from './audit/checks-links.mjs';
import { attr, elements, parseHtml } from './audit/dom.mjs';

// The parts of the Lighthouse run that do not need a browser, so that they can
// be tested: which pages to measure, how Chrome is started, how the scores are
// shown and which of them are too low.

/** The four Lighthouse categories, in the order they are shown. */
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** The names of the categories as the table shows them. */
const HEADINGS = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO' };

/** The lowest score a page may have in any category. */
export const THRESHOLD = 0.95;

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
 * One page and its scores, each from 0 to 1 or null when Lighthouse gave none.
 * @typedef {{ url: string, scores: Record<string, number | null> }} ScoreRow
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
        CATEGORIES.map((category) => {
          const score = row.scores[category] ?? null;
          return score === null ? '--' : String(Math.round(score * 100));
        }),
      ),
    ),
  ].join('\n');
}
