import { attr, elements, textOf } from './dom.mjs';
import { result } from './result.mjs';

// The checks that read the HTML of each page. Every check takes the model of
// the site (see site.mjs) and returns { id, ok, problems }.

/** The page that is exempt from the description check. */
const NOT_FOUND_PAGE = '404.html';

/**
 * A1: every page parses with no errors, and no element is left open.
 * @param {import('./site.mjs').Site} site
 */
export function checkHtmlParses(site) {
  return result(
    'A1',
    site.pages.flatMap((page) => page.errors.map((error) => `${page.file}: ${error}`)),
  );
}

/**
 * A2: every page has exactly one <h1>.
 * @param {import('./site.mjs').Site} site
 */
export function checkOneHeading(site) {
  return result(
    'A2',
    site.pages.flatMap((page) => {
      const count = elements(page.document, 'h1').length;
      return count === 1 ? [] : [`${page.file}: has ${count} <h1> elements; a page needs exactly 1`];
    }),
  );
}

/**
 * A3: every page has a language and a title, and every page except the 404 page has a meta description.
 * @param {import('./site.mjs').Site} site
 */
export function checkMetadata(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    const [root] = elements(page.document, 'html');
    if ((root === undefined ? '' : (attr(root, 'lang') ?? '')).trim() === '') problems.push(`${page.file}: <html> has no lang attribute`);

    const [title] = elements(page.document, 'title');
    if (title === undefined || textOf(title).trim() === '') problems.push(`${page.file}: the <title> is empty`);

    if (page.file === NOT_FOUND_PAGE) continue;
    const description = elements(page.document, 'meta').find((meta) => attr(meta, 'name') === 'description');
    if ((description === undefined ? '' : (attr(description, 'content') ?? '')).trim() === '') problems.push(`${page.file}: has no meta description`);
  }
  return result('A3', problems);
}

/**
 * A4: no page has an <img> element and no CSS loads a file with url(). Graphics are inline SVG.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoImages(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    if (elements(page.document, 'img').length > 0) problems.push(`${page.file}: has an <img> element`);
  }
  for (const sheet of site.stylesheets) {
    if (/url\(/i.test(sheet.css)) problems.push(`${sheet.where}: loads a file with url()`);
  }
  return result('A4', problems);
}

/**
 * A10: the first link in the <body> of every page is the skip link to #main.
 * @param {import('./site.mjs').Site} site
 */
export function checkSkipLink(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    const [body] = elements(page.document, 'body');
    const [first] = body === undefined ? [] : elements(body, 'a');
    if (first === undefined) {
      problems.push(`${page.file}: has no links, so no skip link`);
      continue;
    }
    const href = attr(first, 'href') ?? '';
    const isSkipLink = href === '#main' && (attr(first, 'class') ?? '').split(/\s+/).includes('skip-link');
    if (!isSkipLink) problems.push(`${page.file}: the first link in <body> is "${href}", not the skip link to #main`);
  }
  return result('A10', problems);
}
