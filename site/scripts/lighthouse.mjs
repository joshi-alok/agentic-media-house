import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES, THRESHOLD, chromeFlags, formatScores, isFixtureBuild, lowScores, pagesToTest } from './lighthouse-lib.mjs';
import { serve } from './serve-dist.mjs';

// `npm run lighthouse` measures the built fixture site with Lighthouse: the
// home page, the lead article and its receipts page, and an article that rests
// on another outlet with its receipts page, in all four categories.
// It builds nothing. It exits 0 if every score is 95 or more, 1 if any is
// lower, and 2 if it could not measure (no fixture build, no Chrome).

const DEFAULT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/**
 * Measure the pages at `baseUrl` with Lighthouse in a headless Chrome. Chrome is found by chrome-launcher, which
 * uses the CHROME_PATH environment variable first. Lighthouse's own defaults apply: a phone-sized screen and
 * simulated slow network.
 *
 * @param {string} baseUrl
 * @param {string[]} routes
 * @returns {Promise<import('./lighthouse-lib.mjs').ScoreRow[]>}
 */
async function measureWithChrome(baseUrl, routes) {
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  const chrome = await launch({ chromeFlags: chromeFlags(process.env) });
  try {
    /** @type {import('./lighthouse-lib.mjs').ScoreRow[]} */
    const rows = [];
    for (const route of routes) {
      const result = await lighthouse(baseUrl + route, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: CATEGORIES });
      const categories = result?.lhr.categories ?? {};
      rows.push({ url: route, scores: Object.fromEntries(CATEGORIES.map((category) => [category, categories[category]?.score ?? null])) });
    }
    return rows;
  } finally {
    chrome.kill();
  }
}

/**
 * The HTML of the page at `route` in the build, or undefined when there is no such file.
 *
 * @param {string} dist
 * @param {string} route
 * @returns {string | undefined}
 */
function readPage(dist, route) {
  try {
    return readFileSync(path.join(dist, route, 'index.html'), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Run the measurement. Returns the exit code.
 *
 * @param {{ dist?: string, print?: (text: string) => void, measure?: typeof measureWithChrome }} [options]
 * @returns {Promise<number>}
 */
export async function main({ dist = DEFAULT_DIST, print = console.log, measure = measureWithChrome } = {}) {
  let home;
  try {
    home = readFileSync(path.join(dist, 'index.html'), 'utf8');
  } catch {
    print(`There is no built site in ${dist}. Run "npm run build:fixtures" first.`);
    return 2;
  }
  if (!isFixtureBuild(home)) {
    print(`${dist} is a production build, which has no article to measure. Run "npm run build:fixtures" first.`);
    return 2;
  }

  const server = await serve(dist);
  try {
    const rows = await measure(server.url, pagesToTest(home, (route) => readPage(dist, route)));
    print(`Lighthouse, ${rows.length} pages (phone screen, simulated slow network)`);
    print(formatScores(rows));
    const low = lowScores(rows);
    if (low.length === 0) {
      print(`All scores are ${THRESHOLD * 100} or more.`);
      return 0;
    }
    print(`Below ${THRESHOLD * 100}:`);
    for (const item of low) print(`  ${item.url} ${item.category} ${item.score === null ? 'no score' : Math.round(item.score * 100)}`);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /** @type {{ code?: string }} */ (error)?.code;
    if (code === 'ERR_LAUNCHER_PATH_NOT_SET' || code === 'ERR_LAUNCHER_NOT_INSTALLED') print('Chrome was not found. Install Google Chrome, or set CHROME_PATH to the Chrome executable.');
    else print(`Lighthouse failed: ${message}`);
    return 2;
  } finally {
    await server.close();
  }
}

// Run when started as a script, not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
