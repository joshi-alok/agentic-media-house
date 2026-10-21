import { describe, expect, it } from 'vitest';
import { MAX_PARTS, splitIntoParts, wordsIn } from '../../src/stages/page-parts';

// A page is cut into parts for the Extract stage when the settings ask for it (`extractChunkWords`). The cut is made by code and only between words: the parts, taken in
// order, are the page exactly, so that a quotation of the page lies in the one part that holds it, and the claims of every part are checked against the whole page.

/** A paragraph of `words` words, `label` then the number of the word, with a full stop after every tenth word and at the end. */
function paragraph(words: number, label: string): string {
  return Array.from({ length: words }, (_, at) => `${label}w${at}${(at + 1) % 10 === 0 || at === words - 1 ? '.' : ''}`).join(' ');
}

/** Paragraphs of the given sizes, labelled p0, p1 and so on, joined by `glue`. */
const paragraphs = (sizes: readonly number[], glue = '\n\n'): string => sizes.map((size, at) => paragraph(size, `p${at}`)).join(glue);

const sizesOf = (parts: readonly string[]): number[] => parts.map(wordsIn);

describe('wordsIn', () => {
  it('counts the runs of characters that are not white space', () => {
    expect(wordsIn('')).toBe(0);
    expect(wordsIn('   \n\n  ')).toBe(0);
    expect(wordsIn('one')).toBe(1);
    expect(wordsIn(' one  two\nthree\n\nfour\tfive ')).toBe(5);
  });

  it('counts as the message of the Extract stage has always counted: with /\\S+/, white space of every kind', () => {
    const spaces = [' ', '\t', '\n', '\r', '\u000b', '\u000c', '\u00a0', '\u1680', '\u2003', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
    const pieces = ['a', 'bc', '.', 'x\u200by', String.fromCodePoint(0x1f600), '\u0085', '\u180e', ...spaces];
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 300; round++) {
      const text = Array.from({ length: Math.floor(next() * 40) }, () => pieces[Math.floor(next() * pieces.length)]).join('');
      expect(wordsIn(text), JSON.stringify(text)).toBe((text.match(/\S+/g) ?? []).length);
    }
  });
});

describe('splitIntoParts: how many parts', () => {
  it('leaves a page of at most one and a half times the target as one part, and cuts one word more', () => {
    const exactly = paragraphs([200, 200, 200]);
    expect(wordsIn(exactly)).toBe(600);
    expect(splitIntoParts(exactly, 400)).toEqual([exactly]);
    const more = paragraphs([200, 200, 201]);
    expect(splitIntoParts(more, 400)).toHaveLength(2);
  });

  it('cuts a page of 1,200 words into three parts of 400, between paragraphs', () => {
    const page = paragraphs(Array<number>(12).fill(100));
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([400, 400, 400]);
    expect(parts.join('')).toBe(page);
    expect(parts[0]?.startsWith('p0w0 ')).toBe(true);
    expect(parts[1]?.startsWith('p4w0 ')).toBe(true);
    expect(parts[2]?.startsWith('p8w0 ')).toBe(true);
    expect(parts[0]?.endsWith('p3w99.\n\n')).toBe(true);
  });

  it('cuts a page of 900 words into two parts and not three, so that a part is about the target', () => {
    expect(sizesOf(splitIntoParts(paragraphs(Array<number>(9).fill(100)), 400))).toEqual([400, 500]);
  });

  it('grows the target to a sixth of the page when the page would need more than six parts', () => {
    const page = paragraphs(Array<number>(60).fill(100));
    expect(MAX_PARTS).toBe(6);
    expect(sizesOf(splitIntoParts(page, 400))).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
    // 6,001 words: a target of ceil(6001 / 6) = 1001
    expect(splitIntoParts(`${page} extra`, 400).length).toBeLessThanOrEqual(6);
  });

  it('never makes a part of a text with no word, and reads a text of white space only as one part', () => {
    expect(splitIntoParts('', 400)).toEqual([]);
    expect(splitIntoParts('\n\n\n', 400)).toEqual(['\n\n\n']);
    expect(splitIntoParts('word', 1)).toEqual(['word']);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses a target of %s words', (target) => {
    expect(() => splitIntoParts('a b c', target)).toThrow(RangeError);
  });
});

describe('splitIntoParts: where it cuts', () => {
  it('cuts at the blank line between paragraphs and not at the line breaks inside them', () => {
    // 8 paragraphs of 3 lines of 50 words
    const page = Array.from({ length: 8 }, (_, at) => [0, 1, 2].map((line) => paragraph(50, `q${at}l${line}`)).join('\n')).join('\n\n');
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([450, 300, 450]);
    for (const part of parts.slice(0, -1)) expect(part.endsWith('\n\n')).toBe(true);
    for (const part of parts.slice(1)) expect(part.startsWith('q')).toBe(true);
  });

  it('cuts at the line breaks when the page has no blank line, as the text of an html page has none', () => {
    const page = paragraphs(Array<number>(12).fill(100), '\n');
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([400, 400, 400]);
    expect(parts[0]?.endsWith('p3w99.\n')).toBe(true);
    expect(parts.join('')).toBe(page);
  });

  it('takes the lines of a page that has no blank line for its paragraphs, also when the page is only a little over one and a half times the target, and leaves one long line whole', () => {
    expect(sizesOf(splitIntoParts(paragraphs([200, 200, 201], '\n'), 400))).toEqual([400, 201]);
    // one paragraph of 700 words, twice the target at most: not cut, though it is more than one and a half times the target
    expect(splitIntoParts(paragraph(700, 'a'), 400)).toEqual([paragraph(700, 'a')]);
  });

  it('does not cut inside a paragraph of at most twice the target, however it would balance the parts', () => {
    // 100 words, 800 (twice the target), 100
    const page = paragraphs([100, 800, 100]);
    const parts = splitIntoParts(page, 400);
    expect(parts.join('')).toBe(page);
    expect(parts.some((part) => part.includes('p1w0 ') && part.includes('p1w799.'))).toBe(true);
  });

  it('cuts a paragraph of more than twice the target at the end of a sentence', () => {
    // one line of 1,200 words in sentences of ten
    const page = Array.from({ length: 120 }, (_, at) => paragraph(10, `s${at}`)).join(' ');
    expect(page.includes('\n')).toBe(false);
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([400, 400, 400]);
    for (const part of parts.slice(0, -1)) expect(part).toMatch(/\.\s$/);
    for (const part of parts.slice(1)) expect(part).toMatch(/^s\d+w0 /);
  });

  it('cuts a line of more than twice the target that has no sentence end at a space, and never inside a word', () => {
    const page = Array.from({ length: 1200 }, (_, at) => `word${at}`).join(' ');
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([400, 400, 400]);
    expect(parts.join('')).toBe(page);
    for (const part of parts.slice(0, -1)) expect(part.endsWith(' ')).toBe(true);
    expect(parts.flatMap((part) => part.split(/\s+/).filter((word) => word !== ''))).toEqual(page.split(' '));
  });

  it('takes a closing quotation mark or bracket after the full stop as part of the sentence', () => {
    const sentence = (at: number): string => `${paragraph(9, `c${at}`).replace(/\.$/, '')} said (so).")`;
    const page = Array.from({ length: 120 }, (_, at) => sentence(at)).join(' ');
    const parts = splitIntoParts(page, 400);
    for (const part of parts.slice(0, -1)) expect(part).toMatch(/said \(so\)\."\)\s$/);
  });

  it('keeps a word that is longer than the whole page budget whole', () => {
    const page = `${'x'.repeat(5000)} ${paragraph(1500, 'a')}`;
    const parts = splitIntoParts(page, 400);
    expect(parts.join('')).toBe(page);
    expect(parts[0]?.startsWith(`${'x'.repeat(5000)} `)).toBe(true);
    expect(splitIntoParts('x'.repeat(150_000), 400)).toEqual(['x'.repeat(150_000)]);
  });

  it('never cuts inside a character that is written with two code units', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const page = Array.from({ length: 1000 }, () => emoji).join(' ');
    const parts = splitIntoParts(page, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(page);
    for (const part of parts) expect(part.split(/\s+/).filter((word) => word !== '').every((word) => word === emoji)).toBe(true);
  });

  it('keeps the white space at the start and at the end of the page, in the first part and the last', () => {
    const page = `\n\n  ${paragraphs(Array<number>(12).fill(100))}\n\n`;
    const parts = splitIntoParts(page, 400);
    expect(parts[0]?.startsWith('\n\n  p0w0')).toBe(true);
    expect(parts.at(-1)?.endsWith('p11w99.\n\n')).toBe(true);
    expect(parts.join('')).toBe(page);
  });

  it('joins a last part of under half the target to the part before it', () => {
    // 330, 600 and 70 words: the cut at 330 and the cut at 930 would leave 70 words at the end
    const page = paragraphs([330, 600, 70]);
    const parts = splitIntoParts(page, 400);
    expect(sizesOf(parts)).toEqual([330, 670]);
    expect(parts.join('')).toBe(page);
    // a last part of exactly half the target stays
    expect(sizesOf(splitIntoParts(paragraphs([330, 600, 200]), 400))).toEqual([330, 600, 200]);
  });
});

describe('splitIntoParts: whatever the page', () => {
  // A small generator with a seed, so that a failure can be reproduced: pages of words, separated now by a space, now by a line break, now by a blank line, now by a full stop.
  function generator(seed: number) {
    let state = seed;
    const next = (): number => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
    return { next, pick };
  }
  const GLUE = [' ', ' ', ' ', '  ', '\n', '\n\n', '\n \n', '\t', '\u00a0', '. ', '.\n', '? ', '.") ', '\r\n', '\n\n\n'];
  const WORDS = ['a', 'bb', 'the', 'protocol', '1,200', '$38,000', 'x402', 'e.g.', '(see)', String.fromCodePoint(0x1f600), 'long'.repeat(20)];

  function page(seed: number): { text: string; target: number } {
    const { next, pick } = generator(seed);
    const words = Math.floor(next() ** 2 * 3500);
    let text = next() < 0.2 ? pick(['\n', ' ', '\n\n  ']) : '';
    for (let at = 0; at < words; at++) text += pick(WORDS) + (at === words - 1 && next() < 0.5 ? '' : pick(GLUE));
    return { text, target: 1 + Math.floor(next() ** 2 * 700) };
  }

  it('covers the page exactly and in order, makes no empty part, and makes at most six', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { text, target } = page(seed);
      const parts = splitIntoParts(text, target);
      const label = `seed ${seed}, ${wordsIn(text)} words, target ${target}`;
      expect(parts.join(''), label).toBe(text);
      expect(parts.length, label).toBeLessThanOrEqual(MAX_PARTS);
      if (text === '') expect(parts, label).toEqual([]);
      else expect(parts.length, label).toBeGreaterThanOrEqual(1);
      for (const part of parts) expect(part, label).not.toBe('');
      if (parts.length > 1) for (const part of parts) expect(wordsIn(part), label).toBeGreaterThan(0);
      expect(parts.reduce((sum, part) => sum + wordsIn(part), 0), label).toBe(wordsIn(text));
    }
  });

  it('cuts only between words: a part after the first starts with a word, and every part but the last ends with white space', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { text, target } = page(seed);
      const parts = splitIntoParts(text, target);
      const label = `seed ${seed}, target ${target}`;
      for (const part of parts.slice(1)) expect(part, label).toMatch(/^\S/);
      for (const part of parts.slice(0, -1)) expect(part, label).toMatch(/\s$/);
    }
  });

  it('leaves a page of at most one and a half times the target as one part, and gives the last part at least half the target (or a sixth of the page, when the target grew)', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { text, target } = page(seed);
      if (text === '') continue;
      const words = wordsIn(text);
      const parts = splitIntoParts(text, target);
      const label = `seed ${seed}, ${words} words, target ${target}`;
      const effective = Math.max(target, Math.ceil(words / MAX_PARTS));
      if (words <= 1.5 * effective) expect(parts, label).toHaveLength(1);
      else expect(parts.length, label).toBeGreaterThanOrEqual(1);
      if (parts.length > 1) expect(wordsIn(parts.at(-1) as string), label).toBeGreaterThanOrEqual(effective / 2);
    }
  });

  it('gives the same parts for the same page', () => {
    const { text, target } = page(99);
    expect(splitIntoParts(text, target)).toEqual(splitIntoParts(text, target));
  });
});

describe('splitIntoParts: a hostile page', () => {
  // `maxBytes` lets a page of 2,000,000 bytes through the fetcher and `maxPageChars` cuts its text to 150,000 characters, but the split must not depend on either: it takes time in proportion
  // to the length of the text, whatever the text is.
  const SIZE = 2_000_000;
  const milliseconds = (run: () => void): number => {
    const start = performance.now();
    run();
    return performance.now() - start;
  };

  it.each([
    ['one line of 150,000 characters of short words', 'ab '.repeat(50_000)],
    ['one line of 150,000 characters with no space', 'a'.repeat(150_000)],
    ['one line of two million characters of short words', 'a '.repeat(SIZE / 2)],
    ['only line feeds', '\n'.repeat(SIZE)],
    ['only spaces and line feeds', ' \n'.repeat(SIZE / 2)],
    ['100,000 lines of one word', 'w\n'.repeat(100_000)],
    ['a million lines of one word', 'w\n'.repeat(SIZE / 2)],
    ['100,000 paragraphs of one word', 'w\n\n'.repeat(100_000)],
    ['sentences of one word', 'a. '.repeat(SIZE / 3)],
    ['full stops followed by a long run of closing brackets', `a.${')'.repeat(1000)} `.repeat(SIZE / 1004)],
    ['a word, a long run of white space and a word', `a${' \n'.repeat(SIZE / 4)}b`],
    ['blank lines of white space between words', 'a \n \n '.repeat(SIZE / 7)],
  ])('cuts %s in well under a second, and the parts are the page', (_name, body) => {
    let parts: string[] = [];
    expect(milliseconds(() => void (parts = splitIntoParts(body, 400)))).toBeLessThan(1000);
    expect(parts.join('')).toBe(body);
    expect(parts.length).toBeLessThanOrEqual(MAX_PARTS);
  });
});
