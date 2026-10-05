import { result } from './result.mjs';
import { xmlProblem } from './xml.mjs';

// The checks about the files of the build as a whole: no fixture content in a
// production build, XML that is well-formed, and the files that crawlers and
// feed readers look for. Every check takes the model of the site (see site.mjs)
// and returns { id, ok, problems }.

/** What gives away fixture content: the ribbon, the fictional company, and the slug of its pieces. */
const FIXTURE_TEXT = [
  { pattern: /fixture data/i, description: 'the fixture ribbon text' },
  { pattern: /fixture robotics/i, description: '"Fixture Robotics"' },
  { pattern: /fixture-robotics/i, description: '"fixture-robotics"' },
];

/**
 * A13 (production build only): nothing in the build comes from the fixtures: no ribbon, no fictional company, no file named after one.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoFixtureLeakage(site) {
  /** @type {string[]} */
  const problems = [];
  for (const file of [...site.paths].sort()) {
    if (/fixture/i.test(file)) problems.push(`${file}: is named after a fixture`);
    const text = site.files.get(file);
    if (text === undefined) continue;
    for (const { pattern, description } of FIXTURE_TEXT) {
      if (pattern.test(text)) problems.push(`${file}: contains ${description}`);
    }
  }
  return result('A13', problems);
}

/**
 * A14: every XML file (the feed, the sitemaps, the SVG cards) is well-formed.
 * @param {import('./site.mjs').Site} site
 */
export function checkXmlWellFormed(site) {
  /** @type {string[]} */
  const problems = [];
  for (const [file, text] of [...site.files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!/\.(xml|svg)$/.test(file)) continue;
    const problem = xmlProblem(text);
    if (problem !== undefined) problems.push(`${file}: ${problem}`);
  }
  return result('A14', problems);
}

/** The files a crawler or a feed reader asks for. */
const CRAWL_FILES = ['robots.txt', 'sitemap-index.xml', 'rss.xml', '404.html'];

/**
 * The addresses in the <loc> elements of an XML sitemap.
 * @param {string} xml
 * @returns {string[]}
 */
function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1].trim());
}

/**
 * A15: the files crawlers look for are there and agree: robots.txt allows everything and names a sitemap that exists, the sitemap index lists sitemaps that exist, the sitemaps list pages that exist, and every page but the 404 page is listed.
 * @param {import('./site.mjs').Site} site
 */
export function checkCrawlFiles(site) {
  /** @type {string[]} */
  const problems = [];
  for (const file of CRAWL_FILES) {
    if (!site.paths.has(file)) problems.push(`${file}: is missing`);
  }

  const robots = site.files.get('robots.txt');
  if (robots !== undefined) {
    if (!/^Allow:\s*\/\s*$/m.test(robots)) problems.push('robots.txt: has no "Allow: /" line');
    const line = /^Sitemap:\s*(\S+)\s*$/m.exec(robots);
    if (line === null) problems.push('robots.txt: has no Sitemap line');
    else if (!URL.canParse(line[1]) || new URL(line[1]).origin !== site.origin) problems.push(`robots.txt: the Sitemap line points at ${line[1]}, which is not on ${site.origin}`);
    else if (!site.paths.has(new URL(line[1]).pathname.slice(1))) problems.push(`robots.txt: the Sitemap line points at ${line[1]}, which is not a file in the build`);
  }

  const index = site.files.get('sitemap-index.xml');
  if (index === undefined) return result('A15', problems);

  /** @type {Set<string>} */
  const listed = new Set();
  for (const address of locations(index)) {
    const url = URL.canParse(address) ? new URL(address) : undefined;
    const sitemap = url === undefined || url.origin !== site.origin ? undefined : site.files.get(url.pathname.slice(1));
    if (sitemap === undefined) {
      problems.push(`sitemap-index.xml: lists ${address}, which is not a file in the build`);
      continue;
    }
    const file = /** @type {URL} */ (url).pathname.slice(1);
    for (const page of locations(sitemap)) {
      const target = URL.canParse(page) ? new URL(page) : undefined;
      if (target === undefined || target.origin !== site.origin) problems.push(`${file}: lists ${page}, which is not on ${site.origin}`);
      else if (target.pathname === '/404.html') problems.push(`${file}: lists ${page}, which is the 404 page`);
      else if (!site.pages.some((candidate) => candidate.route === target.pathname)) problems.push(`${file}: lists ${page}, which is not a page in the build`);
      else listed.add(target.pathname);
    }
  }

  for (const page of site.pages) {
    if (page.file !== '404.html' && !listed.has(page.route)) problems.push(`${page.file}: is not in the sitemap`);
  }
  return result('A15', problems);
}
