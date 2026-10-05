import { parse } from 'parse5';

// A small reading interface over parse5's tree, so that the checks do not each
// walk it by hand.

/** @typedef {import('parse5').DefaultTreeAdapterMap['node']} Node */
/** @typedef {import('parse5').DefaultTreeAdapterMap['element']} Element */
/** @typedef {import('parse5').DefaultTreeAdapterMap['document']} Document */

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** Elements that never have an end tag. */
const VOID_ELEMENTS = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** Elements whose end tag the HTML standard lets a page leave out. */
const OPTIONAL_END_TAG = new Set(['body', 'caption', 'colgroup', 'dd', 'dt', 'head', 'html', 'li', 'optgroup', 'option', 'p', 'rp', 'rt', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);

/**
 * Parse an HTML document the way a browser does. The problems are the parse
 * errors that the HTML standard names (a missing doctype, a repeated
 * attribute, a null character and so on) and every element that was opened in
 * the source and never closed, with their positions.
 *
 * A browser silently drops an end tag that closes nothing, so a stray end tag
 * is not reported; the element it should have closed is.
 *
 * @param {string} html
 * @returns {{ document: Document, errors: string[] }}
 */
export function parseHtml(html) {
  /** @type {string[]} */
  const errors = [];
  const document = parse(html, {
    sourceCodeLocation: true,
    onParseError: (error) => errors.push(`${error.code} (line ${error.startLine}, column ${error.startCol})`),
  });
  for (const element of allElements(document)) {
    const location = element.sourceCodeLocation;
    if (location?.startTag === undefined || location.endTag !== undefined) continue;
    if (element.namespaceURI !== HTML_NAMESPACE || VOID_ELEMENTS.has(element.tagName) || OPTIONAL_END_TAG.has(element.tagName)) continue;
    errors.push(`unclosed-element <${element.tagName}> (line ${location.startLine}, column ${location.startCol})`);
  }
  return { document, errors };
}

/**
 * True for an element node.
 * @param {Node} node
 * @returns {node is Element}
 */
function isElement(node) {
  return 'tagName' in node;
}

/**
 * Every element below `root`, in document order. The content of a <template> is not part of the page and is skipped.
 * @param {Node} root
 * @returns {Element[]}
 */
export function allElements(root) {
  /** @type {Element[]} */
  const found = [];
  /** @param {Node} node */
  const visit = (node) => {
    if (isElement(node)) found.push(node);
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return found;
}

/**
 * The elements below `root` with the given tag name.
 * @param {Node} root
 * @param {string} tagName
 * @returns {Element[]}
 */
export function elements(root, tagName) {
  return allElements(root).filter((element) => element.tagName === tagName);
}

/**
 * The value of an attribute, or undefined when the element does not have it.
 * @param {Element} element
 * @param {string} name
 * @returns {string | undefined}
 */
export function attr(element, name) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

/**
 * The text inside a node: all its text descendants joined.
 * @param {Node} node
 * @returns {string}
 */
export function textOf(node) {
  if ('value' in node && node.nodeName === '#text') return node.value;
  if (!('childNodes' in node)) return '';
  return node.childNodes.map(textOf).join('');
}
