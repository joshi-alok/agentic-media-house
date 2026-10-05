import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { allElements, attr, elements, parseHtml, textOf } from './dom.mjs';

// The built site as the audit sees it: every file by its path inside dist/, the
// HTML pages parsed, and all the CSS in one list. The checks take this model
// and nothing else, so a test can build a small site from a few strings.

/**
 * @typedef {object} Page
 * @property {string} file  Path inside dist/, such as "news/a/index.html".
 * @property {string} route  The address of the page, such as "/news/a/".
 * @property {string} html
 * @property {import('./dom.mjs').Document} document
 * @property {string[]} errors  HTML parse errors.
 */

/**
 * @typedef {object} Sheet
 * @property {string} where  Where the CSS was found, for the report.
 * @property {string} css
 */

/**
 * @typedef {object} Site
 * @property {Map<string, string>} files  Text files by path.
 * @property {Set<string>} paths  Every file, text or not.
 * @property {Page[]} pages  Sorted by path.
 * @property {Sheet[]} stylesheets  CSS files, <style> elements and style attributes.
 * @property {string} origin  The address the site is built for, such as "https://robywire.example".
 */

/** The extensions whose files are read as text. */
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.svg', '.txt']);

/**
 * The address of the page in file `file`: "index.html" is "/", "a/index.html" is "/a/", "404.html" is "/404.html".
 * @param {string} file
 * @returns {string}
 */
export function routeOf(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

/**
 * Build the model from files given as text, keyed by their path inside dist/, and the paths of the files that are not text.
 * @param {Record<string, string>} textFiles
 * @param {string[]} [otherPaths]
 * @returns {Site}
 */
export function siteFromFiles(textFiles, otherPaths = []) {
  const files = new Map(Object.entries(textFiles));
  const paths = new Set([...files.keys(), ...otherPaths]);

  const pages = [...files.keys()]
    .filter((file) => file.endsWith('.html'))
    .sort()
    .map((file) => {
      const html = files.get(file) ?? '';
      const { document, errors } = parseHtml(html);
      return { file, route: routeOf(file), html, document, errors };
    });

  /** @type {Sheet[]} */
  const stylesheets = [...files.keys()]
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map((file) => ({ where: file, css: files.get(file) ?? '' }));
  for (const page of pages) {
    for (const style of elements(page.document, 'style')) stylesheets.push({ where: `${page.file} (style element)`, css: textOf(style) });
    for (const element of allElements(page.document)) {
      const inline = attr(element, 'style');
      if (inline !== undefined) stylesheets.push({ where: `${page.file} (style attribute)`, css: `x{${inline}}` });
    }
  }

  return { files, paths, pages, stylesheets, origin: originOf(pages) };
}

/**
 * The origin in the first canonical link of any page, or a made-up one.
 * @param {Page[]} pages
 * @returns {string}
 */
function originOf(pages) {
  for (const page of pages) {
    const link = elements(page.document, 'link').find((element) => attr(element, 'rel') === 'canonical');
    const href = link === undefined ? undefined : attr(link, 'href');
    if (href !== undefined && URL.canParse(href)) return new URL(href).origin;
  }
  return 'https://site.invalid';
}

/** @type {WeakMap<Page, Set<string>>} */
const idCache = new WeakMap();

/**
 * The ids of all the elements of a page.
 * @param {Page} page
 * @returns {Set<string>}
 */
export function idsOf(page) {
  let ids = idCache.get(page);
  if (ids === undefined) {
    ids = new Set(allElements(page.document).flatMap((element) => attr(element, 'id') ?? []));
    idCache.set(page, ids);
  }
  return ids;
}

/**
 * The paths of all the files under `dir`, relative to it and written with forward slashes.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listFiles(dir, prefix = '') {
  return readdirSync(path.join(dir, prefix)).flatMap((name) => {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    return statSync(path.join(dir, relative)).isDirectory() ? listFiles(dir, relative) : [relative];
  });
}

/**
 * Read a built site from a folder.
 * @param {string} dir
 * @returns {Site}
 */
export function loadSite(dir) {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist. Build the site first.`);
  /** @type {Record<string, string>} */
  const textFiles = {};
  /** @type {string[]} */
  const others = [];
  for (const file of listFiles(dir)) {
    if (TEXT_EXTENSIONS.has(path.extname(file))) textFiles[file] = readFileSync(path.join(dir, file), 'utf8');
    else others.push(file);
  }
  const site = siteFromFiles(textFiles, others);
  if (site.pages.length === 0) throw new Error(`${dir} contains no HTML page. Build the site first.`);
  return site;
}
