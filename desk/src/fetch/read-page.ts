import { extractPage } from './extract-text';
import type { ExtractedPage, PageLink } from './extract-text';
import { canonicalUrl } from './url';

// A page is read according to what the server says it is: plain text and markdown as text, and every other type that the fetcher lets through (html, xml, other text)
// through the html reader, as the Desk always did. Documentation, proposals and READMEs are often served as markdown, which an html reader would take for a page
// without structure.

/** The longest title, in characters, that a text gives itself. */
const TITLE_MAX = 200;

// Neither the text nor the target of a link may hold a `[`: an attempt at a match then ends at the next `[`, so the time to find every link is that of reading the text once.
// (With `[` allowed in them, a text of `[` or of `[a](` repeated makes each of its attempts read to the end, and a page of the size that `maxBytes` allows keeps the Desk busy for many minutes.)
const MARKDOWN_LINK = /\[([^\][\n]*)\]\(([^)\s[]+)\)/g;

/** The control characters that are not white space: they are not text, and a text of the Desk has none. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

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

/** A text as the Desk keeps it: no control characters, lines end with a line feed, no line ends with white space, and no more than one empty line stands between two blocks. */
function tidy(body: string): string {
  return body
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
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
 * `text`, cut to at most `limit` characters (never inside a character of two code units), at the last paragraph break before the limit, else at the last line break, but
 * only when that break falls past half the limit, so that a short heading and a long text without breaks is not cut to the heading; else at the last space, else at the limit.
 * A page of html has one line for each block and no empty lines, so it is cut at a block. `cut` says whether it was cut.
 */
export function cutText(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false };
  let end = limit;
  // `slice(0, end)` keeps the code units up to index `end - 1`: if that one is the first half of a character that is written with two, its second half is cut off.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  const head = text.slice(0, end);
  for (const mark of ['\n\n', '\n']) {
    const at = head.lastIndexOf(mark);
    if (at > limit / 2) return { text: head.slice(0, at).trimEnd(), cut: true };
  }
  const space = head.lastIndexOf(' ');
  if (space > 0) return { text: head.slice(0, space).trimEnd(), cut: true };
  return { text: head.trimEnd(), cut: true };
}

/** A page as `readPage` reads it, with its text cut by `cutText`; `cut` says whether it was. The links are those of the whole page, as read, and not only of what is left after the cut. */
export interface CutPage extends ExtractedPage {
  cut: boolean;
}

/** Read a page and cut its text to at most `limit` characters: what Fetch stores as the page, and what `desk tune` tries the models on. */
export function readAndCut(page: { contentType: string; body: string; finalUrl: string }, limit: number): CutPage {
  const read = readPage(page);
  return { ...read, ...cutText(read.text, limit) };
}
