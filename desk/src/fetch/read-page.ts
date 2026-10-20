import { extractPage } from './extract-text';
import type { ExtractedPage, PageLink } from './extract-text';
import { canonicalUrl } from './url';

// A page is read according to what the server says it is: plain text and markdown as text, and every other type that the fetcher lets through (html, xml, other text)
// through the html reader, as the Desk always did. Documentation, proposals and READMEs are often served as markdown, which an html reader would take for a page
// without structure.

/** The longest title, in characters, that a text gives itself. */
const TITLE_MAX = 200;

const MARKDOWN_LINK = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** The links of a markdown text, resolved against the address of the page, each address once, in the order of the text. */
function markdownLinks(text: string, base: string): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const url = canonicalUrl(match[2] as string, base);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, text: (match[1] as string).trim() });
  }
  return links;
}

/** A text as the Desk keeps it: lines end with a line feed, no line ends with a space, and no more than one empty line stands between two blocks. */
function tidy(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const mediaTypeOf = (contentType: string): string => contentType.split(';')[0]!.trim().toLowerCase();

/** Read a page: plain text and markdown as text with a title, links and no date, anything else through `extractPage`. */
export function readPage(page: { contentType: string; body: string; finalUrl: string }): ExtractedPage {
  const type = mediaTypeOf(page.contentType);
  if (type !== 'text/plain' && type !== 'text/markdown' && type !== 'text/x-markdown') return extractPage(page.body, page.finalUrl);
  const text = tidy(page.body);
  const heading = /^#{1,6}[ \t]+(.+)$/m.exec(text);
  const first = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const title = (heading?.[1] ?? first).trim().slice(0, TITLE_MAX);
  return { title, text, links: markdownLinks(text, page.finalUrl) };
}

/**
 * `text`, cut to at most `limit` characters at the last paragraph break before the limit, else at the last space, else at the limit (never inside a character
 * of two code units). `cut` says whether it was cut.
 */
export function cutText(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false };
  let end = limit;
  // `slice(0, end)` keeps the code units up to index `end - 1`: if that one is the first half of a character that is written with two, its second half is cut off.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  const head = text.slice(0, end);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > 0) return { text: head.slice(0, paragraph).trimEnd(), cut: true };
  const space = head.lastIndexOf(' ');
  if (space > 0) return { text: head.slice(0, space).trimEnd(), cut: true };
  return { text: head, cut: true };
}
