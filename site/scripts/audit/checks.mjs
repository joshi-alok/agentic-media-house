import { checkCrawlFiles, checkNoFixtureLeakage, checkNoOldName, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';

/**
 * What the checks need besides the site.
 * @typedef {object} AuditOptions
 * @property {string} tokensCss  The text of src/styles/tokens.css.
 * @property {boolean} [prod]  True for a production build, which gets the fixture check too.
 */

/**
 * One check of the audit.
 * @typedef {object} Check
 * @property {string} id
 * @property {string} title  What the check requires, for the report.
 * @property {boolean} [prodOnly]  True if the check runs only for a production build.
 * @property {(site: import('./site.mjs').Site, options: AuditOptions) => import('./result.mjs').CheckResult} run
 */

/** @type {Check[]} */
export const CHECKS = [
  { id: 'A1', title: 'Every page parses as HTML with no errors and no element left open', run: checkHtmlParses },
  { id: 'A2', title: 'Every page has exactly one h1', run: checkOneHeading },
  { id: 'A3', title: 'Every page has a language and a title, and every page but 404 a description', run: checkMetadata },
  { id: 'A4', title: 'No images: no img element and no CSS url()', run: checkNoImages },
  { id: 'A5', title: 'No italics in the HTML or the CSS', run: checkNoItalics },
  { id: 'A6', title: 'No web fonts and no font requests', run: checkNoWebFonts },
  { id: 'A7', title: 'Hairlines only: no border above one pixel and no rounded corner', run: checkHairlines },
  { id: 'A8', title: 'Every internal link, file and #fragment resolves', run: checkInternalLinks },
  { id: 'A9', title: 'Every article links to its receipts and has a canonical link and NewsArticle data', run: checkArticlePages },
  { id: 'A10', title: 'The skip link is the first link on every page', run: checkSkipLink },
  { id: 'A11', title: 'Every claim marker points at its claim on the receipts page', run: checkClaimMarkers },
  { id: 'A12', title: 'Every colour in the CSS, the SVG files and the inline SVG belongs to the design tokens', run: (site, options) => checkColourLaw(site, options.tokensCss) },
  { id: 'A13', title: 'No fixture content in a production build', prodOnly: true, run: checkNoFixtureLeakage },
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
  { id: 'A17', title: 'Every article shows its fact card, a labelled figure with an inline SVG', run: checkFactCard },
  { id: 'A18', title: 'The old name of the publication is nowhere in the build: no page, feed, sitemap, card or robots file has it, and no file is named after it', run: checkNoOldName },
];

/**
 * Run the checks on a site, in order. The fixture check runs only when `options.prod` is true.
 *
 * @param {import('./site.mjs').Site} site
 * @param {AuditOptions} options
 * @returns {(import('./result.mjs').CheckResult & { title: string })[]}
 */
export function runChecks(site, options) {
  if (typeof options?.tokensCss !== 'string') throw new TypeError('runChecks: options.tokensCss, the text of tokens.css, is required');
  return CHECKS.filter((check) => options.prod === true || check.prodOnly !== true).map((check) => ({ ...check.run(site, options), title: check.title }));
}
