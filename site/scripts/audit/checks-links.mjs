import { allElements, attr, elements, textOf } from './dom.mjs';
import { result } from './result.mjs';
import { idsOf } from './site.mjs';

// The checks about how the pages point at each other: internal links, the
// receipts page of every article, and the claim markers in the text. Every check
// takes the model of the site (see site.mjs) and returns { id, ok, problems }.

/** Meta tags whose content is an address. */
const META_ADDRESSES = new Set(['og:image', 'og:url', 'twitter:image']);

/**
 * An address written on a page, with the way to show it in a message.
 * @typedef {{ label: string, value: string }} Address
 */

/**
 * Every address a page writes: href and src attributes, and the content of the meta tags that hold one.
 * @param {import('./site.mjs').Page} page
 * @returns {Address[]}
 */
function addressesOf(page) {
  /** @type {Address[]} */
  const found = [];
  for (const element of allElements(page.document)) {
    for (const name of ['href', 'src']) {
      const value = attr(element, name);
      if (value !== undefined && value !== '') found.push({ label: `<${element.tagName} ${name}="${value}">`, value });
    }
    if (element.tagName === 'meta') {
      const key = attr(element, 'property') ?? attr(element, 'name') ?? '';
      const content = attr(element, 'content');
      if (META_ADDRESSES.has(key) && content !== undefined) found.push({ label: `<meta ${key} content="${content}">`, value: content });
    }
  }
  return found;
}

/**
 * Where an address written on `page` points inside the site: the file it names and the fragment. Undefined when it points
 * elsewhere (another site, a mailto: or data: address) or cannot be read.
 *
 * @param {import('./site.mjs').Site} site
 * @param {import('./site.mjs').Page} page
 * @param {string} value
 * @returns {{ file: string, pathname: string, fragment: string } | undefined}
 */
export function resolveInternal(site, page, value) {
  let url;
  try {
    url = new URL(value, new URL(page.route, site.origin));
  } catch {
    return undefined;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== site.origin) return undefined;
  let pathname;
  let fragment;
  try {
    pathname = decodeURIComponent(url.pathname);
    fragment = decodeURIComponent(url.hash.slice(1));
  } catch {
    return undefined;
  }
  return { file: pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1), pathname, fragment };
}

/**
 * A8: every internal address resolves to a file in the build, and every fragment is the id of an element on the page it points at.
 * @param {import('./site.mjs').Site} site
 */
export function checkInternalLinks(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    /** @type {Set<string>} */
    const seen = new Set();
    for (const address of addressesOf(page)) {
      const target = resolveInternal(site, page, address.value);
      if (target === undefined) continue;
      /** @type {string | undefined} */
      let problem;
      if (!site.paths.has(target.file)) {
        const folder = !target.pathname.endsWith('/') && site.paths.has(`${target.file}/index.html`);
        problem = `${address.label} does not match any file in the build${folder ? '; the folder needs a trailing slash' : ''}`;
      } else if (target.fragment !== '') {
        const destination = site.pages.find((candidate) => candidate.file === target.file);
        if (destination === undefined) problem = `${address.label} points at #${target.fragment} in a file that is not a page`;
        else if (!idsOf(destination).has(target.fragment)) problem = `${address.label} points at #${target.fragment}, which is not an id on that page`;
      }
      if (problem !== undefined && !seen.has(problem)) {
        seen.add(problem);
        problems.push(`${page.file}: ${problem}`);
      }
    }
  }
  return result('A8', problems);
}

const ARTICLE_FILE = /^news\/([^/]+)\/index\.html$/;

/**
 * The pages of the articles, with the file of each one's receipts page.
 * @param {import('./site.mjs').Site} site
 */
function articles(site) {
  return site.pages.flatMap((page) => {
    const match = ARTICLE_FILE.exec(page.file);
    return match === null ? [] : [{ page, receiptsFile: `news/${match[1]}/receipts/index.html` }];
  });
}

/**
 * The problem with the canonical link of a page, or undefined when it has one that points at the page itself.
 * @param {import('./site.mjs').Site} site
 * @param {import('./site.mjs').Page} page
 * @returns {string | undefined}
 */
function canonicalProblem(site, page) {
  const link = elements(page.document, 'link').find((element) => attr(element, 'rel') === 'canonical');
  const href = link === undefined ? undefined : attr(link, 'href');
  if (href === undefined || href === '') return `${page.file}: has no canonical link`;
  const pathname = new URL(href, site.origin).pathname;
  return pathname === page.route ? undefined : `${page.file}: the canonical link points at ${pathname}, not at ${page.route}`;
}

/**
 * A9: every article page links to its receipts page, which exists and has a canonical link, and has a canonical link and NewsArticle structured data of its own.
 * @param {import('./site.mjs').Site} site
 */
export function checkArticlePages(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const linksToReceipts = addressesOf(page).some((address) => resolveInternal(site, page, address.value)?.file === receiptsFile);
    if (!linksToReceipts) problems.push(`${page.file}: does not link to its receipts page`);

    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    if (receipts === undefined) problems.push(`${page.file}: its receipts page ${receiptsFile} does not exist`);

    const canonical = canonicalProblem(site, page);
    if (canonical !== undefined) problems.push(canonical);

    let hasNewsArticle = false;
    for (const script of elements(page.document, 'script').filter((element) => attr(element, 'type') === 'application/ld+json')) {
      try {
        if (JSON.parse(textOf(script))?.['@type'] === 'NewsArticle') hasNewsArticle = true;
      } catch {
        problems.push(`${page.file}: its structured data is not valid JSON`);
      }
    }
    if (!hasNewsArticle) problems.push(`${page.file}: has no NewsArticle structured data`);

    if (receipts !== undefined) {
      const receiptsCanonical = canonicalProblem(site, receipts);
      if (receiptsCanonical !== undefined) problems.push(receiptsCanonical);
    }
  }
  return result('A9', problems);
}

/**
 * A11: every claim marker in an article points at a claim anchor (#c-1) that exists on the receipts page of the same article, and an article has at least one marker.
 * @param {import('./site.mjs').Site} site
 */
export function checkClaimMarkers(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    const seen = new Set();
    for (const element of elements(page.document, 'a')) {
      const href = attr(element, 'href') ?? '';
      const target = resolveInternal(site, page, href);
      // A marker is a link to a fragment of a receipts page; a plain link to the page has no fragment.
      if (target === undefined || target.fragment === '' || !/^news\/[^/]+\/receipts\/index\.html$/.test(target.file) || seen.has(href)) continue;
      seen.add(href);
      if (target.file !== receiptsFile) problems.push(`${page.file}: the marker "${href}" points at another piece's receipts`);
      else if (!/^c-\d+$/.test(target.fragment)) problems.push(`${page.file}: the marker "${href}" is not a claim anchor like #c-1`);
      else if (receipts === undefined || !idsOf(receipts).has(target.fragment)) problems.push(`${page.file}: the marker "${href}" has no claim with that id on the receipts page`);
    }
    if (seen.size === 0) problems.push(`${page.file}: has no claim markers`);
  }
  return result('A11', problems);
}

/**
 * True when the page has the bold label "Unconfirmed." that the renderer writes before a sentence that rests on another outlet.
 * Space around the text inside the element does not matter.
 * @param {import('./dom.mjs').Node} document
 * @returns {boolean}
 */
export function hasUnconfirmedLabel(document) {
  return elements(document, 'strong').some((label) => textOf(label).trim() === 'Unconfirmed.');
}

/**
 * A16: an article whose receipts page lists a claim from a tier-2 source (the "Tier 2 source" chip) labels what rests on it: the article has the bold label "Unconfirmed." that the renderer writes before an attributed sentence.
 * @param {import('./site.mjs').Site} site
 */
export function checkUnconfirmedLabel(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page, receiptsFile } of articles(site)) {
    const receipts = site.pages.find((candidate) => candidate.file === receiptsFile);
    // A missing receipts page is A9's to report.
    if (receipts === undefined) continue;
    const tier2 = elements(receipts.document, 'span').filter((chip) => (attr(chip, 'class') ?? '').split(/\s+/).includes('chip--tier2')).length;
    if (tier2 === 0) continue;
    if (!hasUnconfirmedLabel(page.document)) {
      problems.push(`${page.file}: its receipts page lists ${tier2} ${tier2 === 1 ? 'claim' : 'claims'} from a tier-2 source, but the article has no "Unconfirmed." label`);
    }
  }
  return result('A16', problems);
}

/**
 * A17: every article shows its fact card: a <figure data-fact-card> with role="img" and an aria-label that holds an inline <svg>.
 * The card is a picture, and the design allows no <img>, so it is drawn into the page; the label is what a screen reader reads in its place.
 * @param {import('./site.mjs').Site} site
 */
export function checkFactCard(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page } of articles(site)) {
    const figures = elements(page.document, 'figure').filter((figure) => attr(figure, 'data-fact-card') !== undefined);
    if (figures.length === 0) problems.push(`${page.file}: has no fact card (a <figure data-fact-card>)`);
    for (const figure of figures) {
      if (elements(figure, 'svg').length === 0) problems.push(`${page.file}: its fact card has no inline <svg>`);
      if (attr(figure, 'role') !== 'img' || (attr(figure, 'aria-label') ?? '').trim() === '') problems.push(`${page.file}: its fact card needs role="img" and a non-empty aria-label`);
    }
  }
  return result('A17', problems);
}
