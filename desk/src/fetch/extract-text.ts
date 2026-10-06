import { defaultTreeAdapter, parse } from 'parse5';
import type { DefaultTreeAdapterTypes, TreeAdapter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { canonicalUrl } from './url';

// From the HTML of a page to what the rest of the Desk uses: the title, the readable text (which is what a
// snapshot is, and what a quotation must be found in) and the links. The page is untrusted. It is parsed
// the way a browser parses it, so broken markup gives a tree and not an error; what is dropped is
// dropped with its whole subtree, so script text can never be mistaken for the page; and a page that
// nests its elements absurdly deep is refused, because the parser takes time in proportion to the
// square of the depth and a page of 100,000 nested elements would keep the Desk busy for a minute.
// What a reader of the page cannot see is not what the page says either: an element that is hidden
// (the `hidden` attribute, `aria-hidden="true"`, an inline style of `display:none`, `visibility:hidden`
// or `font-size:0`) is dropped like a script. That is judged from the markup and the inline style only.
// The style sheets of the page are not read, so text that a style sheet hides is text of the page here,
// and so is the content of a `<details>` element, which a reader sees by opening it.

type Node = DefaultTreeAdapterTypes.Node;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type Element = DefaultTreeAdapterTypes.Element;

/** A link of a page: an absolute address with the text of the link, which may be empty. */
export interface PageLink {
  url: string;
  text: string;
}

export interface ExtractedPage {
  /** The title of the page, in one line; empty when the page has none. */
  title: string;
  /** The readable text: one line for each block of text, white space collapsed, no empty lines. */
  text: string;
  /** The links of the part of the page that is read, each address once, in the order of the page. */
  links: PageLink[];
}

/** The page cannot be read: it is nested too deeply. */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

/** The deepest nesting of elements that is read. Browsers stop at 512, and real pages stay far below it. */
export const MAX_DEPTH = 512;

/**
 * What is not part of what a page says: its code, its styling, the furniture around the text, and a template, which a browser
 * never shows (the parser keeps its content out of the children of the element, and it is listed all the same).
 */
const DROPPED = new Set(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'template']);

/** Elements that start a new line of text, and end one. */
const BLOCKS = new Set([
  'address',
  'article',
  'blockquote',
  'body',
  'br',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'html',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

/** Cells of a table sit on one line, with a space between them. */
const CELLS = new Set(['td', 'th']);

class TooDeep extends Error {}

/** How many nodes there are from a node up to the document, the node included. */
function depthOf(node: Node): number {
  let depth = 0;
  for (let current: Node | null = node; current !== null; current = 'parentNode' in current ? current.parentNode : null) depth++;
  return depth;
}

/** Refuse a node that would go under a parent that is already as deep as a page may go. */
function assertRoom(parent: ParentNode): void {
  if (depthOf(parent) >= MAX_DEPTH) throw new TooDeep();
}

/**
 * The parser's own tree builder, which stops the parse as soon as an element would be put deeper than
 * `MAX_DEPTH`. The check is made where the tree grows, so it holds however the markup was written (nested
 * tags, tags that the parser rearranges, tables), and a page that is too deep is refused after a few
 * milliseconds. The depth is counted from the parents themselves each time, so moving a node cannot
 * leave a wrong number behind.
 */
const SHALLOW: TreeAdapter<DefaultTreeAdapterMap> = {
  ...defaultTreeAdapter,
  appendChild(parent, child) {
    assertRoom(parent);
    defaultTreeAdapter.appendChild(parent, child);
  },
  insertBefore(parent, child, reference) {
    assertRoom(parent);
    defaultTreeAdapter.insertBefore(parent, child, reference);
  },
};

const isElement = (node: Node): node is Element => 'tagName' in node;
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The elements below `parent`, in the order of the page, leaving out those that `skip` picks, with everything in them. */
function* descendants(parent: ParentNode, skip: (element: Element) => boolean): Generator<Element> {
  for (const child of parent.childNodes) {
    if (!isElement(child) || skip(child)) continue;
    yield child;
    yield* descendants(child, skip);
  }
}

/** A size of nothing: 0, 0.0, .0, with or without a unit or a per cent sign. */
const ZERO_SIZE = /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:[a-z]+|%)?$/;

/** Does an inline style hide its element: `display:none`, `visibility:hidden` or `collapse`, or `font-size` of nothing? Comments, case, space and `!important` do not matter. */
function styleHides(style: string): boolean {
  for (const declaration of style.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).replace(/!\s*important\s*$/i, '').trim().toLowerCase();
    if (property === 'display' && value === 'none') return true;
    if (property === 'visibility' && (value === 'hidden' || value === 'collapse')) return true;
    if (property === 'font-size' && ZERO_SIZE.test(value)) return true;
  }
  return false;
}

/** Is the element hidden from a reader by its own attributes: `hidden` (whatever its value), `aria-hidden="true"`, or an inline style that hides it? */
function isHidden(element: Element): boolean {
  return element.attrs.some(
    ({ name, value }) => name === 'hidden' || (name === 'aria-hidden' && value.trim().toLowerCase() === 'true') || (name === 'style' && styleHides(value)),
  );
}

/** Is the element left out of the page, with everything in it: dropped by its name, or hidden? */
const isDropped = (element: Element): boolean => DROPPED.has(element.tagName) || isHidden(element);

/** The text of a node in one line, with the dropped elements left out. */
function plainText(node: ParentNode): string {
  let text = '';
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') text += (child as DefaultTreeAdapterTypes.TextNode).value;
    else if (isElement(child) && !isDropped(child)) text += plainText(child);
  }
  return collapse(text);
}

/** The text of the first title element of the page, wherever it is, or an empty string. */
function titleOf(document: ParentNode): string {
  const title = [...descendants(document, () => false)].find((element) => element.tagName === 'title');
  return title === undefined ? '' : plainText(title);
}

/**
 * Read a page. `baseUrl` is the address the page was fetched from, which relative links are resolved against
 * (a `<base>` tag in the page is ignored: a page could use it to send the Desk to another host).
 *
 * The text is that of the page's article if it has exactly one `<article>`, otherwise of its `<main>`, otherwise
 * of its `<body>`. A page with several articles is a list of stories (a newsroom), and is read whole. Scripts,
 * styles, `noscript`, navigation, headers, footers, asides, forms and templates are left out with everything in them,
 * and so are the elements that are hidden from a reader (see `isHidden`: the `hidden` attribute, `aria-hidden="true"`,
 * an inline style of `display:none`, `visibility:hidden` or `font-size:0`), the links in them too; an article or a main
 * part that is hidden is not counted. The content of `<details>` is kept. Block elements end a line; white space is collapsed. The links are those of the same part of the page:
 * absolute http and https addresses (see `canonicalUrl`) with their text, each address once, and not the
 * address of the page itself. When one address has two links, the first, unless its text is empty and a later
 * link has some (an image link and a headline link to one story). The title is the page's `<title>`, or else
 * the first `<h1>` of the part that is read.
 *
 * Throws `ExtractError` for a page nested more than `MAX_DEPTH` levels deep.
 */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const self = canonicalUrl(baseUrl);
  if (self === null) throw new Error(`extractPage needs the address the page was fetched from, an http or https address: got ${JSON.stringify(baseUrl)}`);

  let document: DefaultTreeAdapterTypes.Document;
  try {
    document = parse(html, { treeAdapter: SHALLOW });
  } catch (error) {
    if (error instanceof TooDeep) throw new ExtractError(`the page is nested more than ${MAX_DEPTH} levels deep`);
    throw error;
  }

  const elements = [...descendants(document, isDropped)];
  const articles = elements.filter((element) => element.tagName === 'article');
  // The tree of a document always has a body, so the document itself, which would also read the head, is only the last resort for the type.
  const root: ParentNode =
    (articles.length === 1 ? articles[0] : undefined) ??
    elements.find((element) => element.tagName === 'main') ??
    elements.find((element) => element.tagName === 'body') ??
    document;

  const lines: string[] = [];
  let line = '';
  const endLine = (): void => {
    const text = collapse(line);
    if (text !== '') lines.push(text);
    line = '';
  };
  const links = new Map<string, string>();

  const read = (parent: ParentNode): void => {
    for (const child of parent.childNodes) {
      if (child.nodeName === '#text') {
        line += (child as DefaultTreeAdapterTypes.TextNode).value;
        continue;
      }
      if (!isElement(child) || isDropped(child)) continue;
      const block = BLOCKS.has(child.tagName);
      const cell = CELLS.has(child.tagName);
      if (block) endLine();
      if (cell) line += ' ';
      if (child.tagName === 'a') collectLink(child);
      read(child);
      if (cell) line += ' ';
      if (block) endLine();
    }
  };

  const collectLink = (anchor: Element): void => {
    const href = anchor.attrs.find((attribute) => attribute.name === 'href')?.value;
    if (href === undefined) return;
    const url = canonicalUrl(href, self);
    if (url === null || url === self) return;
    const text = plainText(anchor);
    const known = links.get(url);
    if (known === undefined || (known === '' && text !== '')) links.set(url, text);
  };

  read(root);
  endLine();

  const title = titleOf(document) || firstHeading(root);
  return { title, text: lines.join('\n'), links: [...links].map(([url, text]) => ({ url, text })) };
}

/** The text of the first `<h1>` below `root`, or an empty string. */
function firstHeading(root: ParentNode): string {
  const heading = [...descendants(root, isDropped)].find((element) => element.tagName === 'h1');
  return heading === undefined ? '' : plainText(heading);
}
