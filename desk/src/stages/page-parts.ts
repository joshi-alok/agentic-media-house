// Cutting a page into parts, for the Extract stage when the settings ask for it (`extractChunkWords`). A model that is given a whole page of fifteen hundred words takes the facts of
// its first paragraphs and stops; given four hundred words, it reads them through. The cut is made by code and never by a model, only between words, and the parts, taken in
// order, are the page exactly: every character of the page is in one part, so that a quotation that lies inside one paragraph lies inside one part, and the claims of every part are
// still checked against the whole page. The work is one pass over the text and a few passes over its words, whatever the text is.

/** The most parts that one page is cut into. A page that would need more is cut into parts of about a sixth of its words. */
export const MAX_PARTS = 6;

/** What closes a sentence after its full stop: a quotation mark, a bracket, an emphasis mark of markdown, a guillemet. */
const CLOSERS = '"\')]}*_`\u201d\u2019\u00bb';

/** What ends a sentence: a full stop, a question mark, an exclamation mark, an ellipsis. */
const TERMINATORS = '.!?\u2026';

/** Whether a UTF-16 code unit is white space as the `\s` of a regular expression has it, which is how the Desk has always counted words (`/\S+/`). */
function isSpace(code: number): boolean {
  if (code < 128) return code === 32 || (code >= 9 && code <= 13);
  return code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

/** The words of a text as the Desk counts them: the runs of characters that are not white space. */
export function wordsIn(text: string): number {
  let words = 0;
  let inWord = false;
  for (let at = 0; at < text.length; at++) {
    const word = !isSpace(text.charCodeAt(at));
    if (word && !inWord) words += 1;
    inWord = word;
  }
  return words;
}

/** Whether the word that ends just before `end` ends a sentence: a full stop or the like, with any closing marks after it. */
function endsSentence(text: string, end: number): boolean {
  let at = end - 1;
  while (at >= 0 && CLOSERS.includes(text.charAt(at))) at -= 1;
  return at >= 0 && TERMINATORS.includes(text.charAt(at));
}

/**
 * Where each word of the text starts, and how strong a break stands before it: 0 for a blank line (two line feeds or more in the white space between the two words), 1 for a line
 * break, 2 for the end of a sentence, 3 for any other space. The first word has no break before it.
 */
function wordsOf(text: string, count: number): { starts: Int32Array; breaks: Uint8Array } {
  const starts = new Int32Array(count);
  const breaks = new Uint8Array(count);
  let word = -1;
  let inWord = false;
  let lineFeeds = 0;
  let wordEnd = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (isSpace(code)) {
      if (inWord) {
        inWord = false;
        wordEnd = at;
        lineFeeds = 0;
      }
      if (code === 10) lineFeeds += 1;
    } else if (!inWord) {
      inWord = true;
      word += 1;
      starts[word] = at;
      if (word > 0) breaks[word] = lineFeeds >= 2 ? 0 : lineFeeds === 1 ? 1 : endsSentence(text, wordEnd) ? 2 : 3;
    }
  }
  return { starts, breaks };
}

/**
 * The places a part may start, as the number of words before them, in order, from 0 to the number of words. The paragraphs of the page are always cut apart: they are the blocks between its
 * blank lines or, when it has none (the text of an html page has one line for each block), its lines. A piece that is longer than `limit` words is then cut at its line breaks, a piece
 * that is still longer at the ends of its sentences, and a piece that is still longer at any space. A piece of at most `limit` words is not cut again.
 */
function placesOf(breaks: Uint8Array, count: number, limit: number): number[] {
  const paragraph = breaks.indexOf(0, 1) >= 0 ? 0 : 1;
  let places = [0, count];
  for (let strength = 0; strength <= 3; strength++) {
    const next = [0];
    for (let at = 0; at + 1 < places.length; at++) {
      const from = places[at] as number;
      const to = places[at + 1] as number;
      if (strength === paragraph || to - from > limit) {
        for (let word = from + 1; word < to; word++) if (breaks[word] === strength) next.push(word);
      }
      next.push(to);
    }
    places = next;
  }
  return places;
}

/**
 * Cut the text of a page into parts of about `targetWords` words, to be read one at a time. The parts, taken in order, are the text exactly (`parts.join('') === text`) and none is empty;
 * a text with no character has no part.
 *
 * - A page of at most one and a half times the target is one part.
 * - The page is cut into as many parts as the target goes into it, nearest whole number, and into at most `MAX_PARTS`: a page of more than six times the target is cut into six, which
 *   is a target of `ceil(words / 6)`. Each cut is made at the place nearest to where an even cut would fall.
 * - A part starts only at a word, and the white space before the word stays at the end of the part before. The places are the blank lines between paragraphs (the line breaks, for a
 *   page that has no blank line); a paragraph that is longer than twice the target is cut at its line breaks, a line that is longer than that at the ends of its sentences, and what
 *   is still longer at a space. A paragraph of at most twice the target is not cut, and a word never is.
 * - A last part of under half the target is joined to the one before it.
 */
export function splitIntoParts(text: string, targetWords: number): string[] {
  if (!Number.isInteger(targetWords) || targetWords < 1) throw new RangeError(`splitIntoParts needs a target of a whole number of words, 1 or more: got ${targetWords}`);
  if (text === '') return [];
  const words = wordsIn(text);
  const target = Math.max(targetWords, Math.ceil(words / MAX_PARTS));
  if (words <= 1.5 * target) return [text];

  const { starts, breaks } = wordsOf(text, words);
  const places = placesOf(breaks, words, 2 * target);
  const count = Math.min(MAX_PARTS, Math.max(2, Math.round(words / target)));

  // The word at which each part after the first starts: of the places, the one nearest to where an even cut falls, and past the one before.
  const cuts: number[] = [];
  let last = 0;
  for (let part = 1; part < count; part++) {
    const wanted = Math.max((part * words) / count, last + 0.5);
    let low = 0;
    let high = places.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((places[middle] as number) < wanted) low = middle + 1;
      else high = middle;
    }
    const after = places[low] as number;
    const before = low > 0 ? (places[low - 1] as number) : 0;
    const afterFits = after > last && after < words;
    const beforeFits = before > last && before < words;
    if (!afterFits && !beforeFits) break;
    last = afterFits && (!beforeFits || after - wanted < wanted - before) ? after : before;
    cuts.push(last);
  }
  while (cuts.length > 0 && words - (cuts.at(-1) as number) < target / 2) cuts.pop();

  const parts: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    const at = starts[cut] as number;
    parts.push(text.slice(from, at));
    from = at;
  }
  parts.push(text.slice(from));
  return parts;
}
