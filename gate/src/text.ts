// Text utilities shared by the gate checks. Pure functions over strings.

/** Characters that open or close a double-quoted segment: straight and curly. */
const DOUBLE_QUOTE_CHARS = '"\u201C\u201D\u201E\u201F';

/** Number of words in `text`: runs of non-whitespace. "FX-1" and "m/s" are one word each. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Fold typographic variants into plain ASCII so that two spellings of the same
 * text compare equal: curly quotes and apostrophes become straight ones, en and
 * em dashes become a hyphen, every kind of space (including NBSP) becomes one
 * space, and the ends are trimmed.
 */
export function normaliseQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface QuotedSpan {
  /** Index of the opening quote mark. */
  start: number;
  /** Index just after the closing quote mark. */
  end: number;
  /** The text between the two quote marks, as written. */
  inner: string;
}

/**
 * Pair up the double-quote marks left to right: the first opens, the second
 * closes, the third opens again, the fourth closes it. Straight and curly marks are
 * interchangeable. A mark left over at the end has no partner, so it does not
 * start a segment.
 */
function findQuoted(text: string): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (!DOUBLE_QUOTE_CHARS.includes(text.charAt(i))) continue;
    if (open < 0) {
      open = i;
    } else {
      spans.push({ start: open, end: i + 1, inner: text.slice(open + 1, i) });
      open = -1;
    }
  }
  return spans;
}

/** Does `text` contain a double-quoted segment, even an empty one? Marks are paired as `stripQuoted` pairs them. */
export function hasQuoted(text: string): boolean {
  return findQuoted(text).length > 0;
}

/**
 * `text` without its double-quoted segments (the quote marks go too), with the
 * whitespace left behind collapsed. Quoted text is checked by G5, not by the
 * token checks, so the token checks work on what this returns.
 */
export function stripQuoted(text: string): string {
  let result = '';
  let cursor = 0;
  for (const span of findQuoted(text)) {
    result += text.slice(cursor, span.start);
    cursor = span.end;
  }
  return (result + text.slice(cursor)).replace(/\s+/g, ' ').trim();
}

/** The normalised inner text of each double-quoted segment. Empty segments are dropped. */
export function quotedSegments(text: string): string[] {
  return findQuoted(text)
    .map((span) => normaliseQuotes(span.inner))
    .filter((inner) => inner !== '');
}

/**
 * The words of `text` with the punctuation around each word removed. The case
 * is kept, and punctuation inside a word stays ("FX-1", "m/s", "U.S"). Words
 * that were nothing but punctuation disappear.
 */
export function sentenceWords(text: string): string[] {
  return normaliseQuotes(text)
    .split(' ')
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word !== '');
}

/** Jaccard similarity of two sets: shared items over all items. Two empty sets score 0. */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared++;
  }
  const all = a.size + b.size - shared;
  return all === 0 ? 0 : shared / all;
}
