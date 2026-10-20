import { describe, expect, it } from 'vitest';
import { extractPage } from '../../src/fetch/extract-text';
import { cutText, readAndCut, readPage } from '../../src/fetch/read-page';

const page = (contentType: string, body: string, finalUrl = 'https://eips.example/ercs/erc-0000.md') => ({ contentType, body, finalUrl });

describe('readPage: html', () => {
  it('reads html as the Desk always has', () => {
    const read = readPage(page('text/html; charset=utf-8', '<html><head><title>A page</title></head><body><article><p>Some text of the page.</p></article></body></html>', 'https://a.example/x'));
    expect(read.title).toBe('A page');
    expect(read.text).toContain('Some text of the page.');
  });

  it('reads every other type that the fetcher lets through as html too, as before', () => {
    const xml = '<html><head><title>A page</title></head><body><p>Some text.</p></body></html>';
    for (const contentType of ['application/xhtml+xml', 'text/xml', 'application/xml', '']) {
      expect(readPage(page(contentType, xml, 'https://a.example/x'))).toEqual(readPage(page('text/html', xml, 'https://a.example/x')));
    }
  });
});

describe('readPage: plain text and markdown', () => {
  const body = ['# ERC-0000: Agent payment registry', '', '', '', 'Status: Draft   ', 'See [the discussion](https://ethereum-magicians.org/t/x/1) and [the code](/code/registry).', ''].join('\r\n');

  it.each(['text/plain', 'text/markdown; charset=utf-8', 'text/x-markdown', 'TEXT/Markdown'])('reads %s as text', (contentType) => {
    const read = readPage(page(contentType, body));
    expect(read.title).toBe('ERC-0000: Agent payment registry');
    expect(read.text).toBe(['# ERC-0000: Agent payment registry', '', 'Status: Draft', 'See [the discussion](https://ethereum-magicians.org/t/x/1) and [the code](/code/registry).'].join('\n'));
  });

  it('reads the links of markdown, resolved against the address of the page, each once', () => {
    const read = readPage(page('text/markdown', `${body}\nAgain [the discussion](https://ethereum-magicians.org/t/x/1).`));
    expect(read.links).toEqual([
      { url: 'https://ethereum-magicians.org/t/x/1', text: 'the discussion' },
      { url: 'https://eips.example/code/registry', text: 'the code' },
    ]);
  });

  it('has no date: a text does not say when it was published', () => {
    expect(readPage(page('text/plain', 'Just text.')).publishedAt).toBeUndefined();
  });

  it('takes the first line as the title when there is no heading, at most 200 characters', () => {
    expect(readPage(page('text/plain', 'A first line\nsecond line')).title).toBe('A first line');
    expect(readPage(page('text/plain', 'x'.repeat(500))).title).toHaveLength(200);
  });

  it('takes a heading from one line only: a lone # is not a heading that borrows the line after it', () => {
    expect(readPage(page('text/plain', '#\n\nSecond line')).title).toBe('#');
  });

  it('is empty for an empty text', () => {
    expect(readPage(page('text/plain', '  \n ')).text).toBe('');
  });
});

describe('readPage: the control characters of a text', () => {
  it('keeps tabs and line feeds and drops the other control characters, as the text of a page has none', () => {
    const read = readPage(page('text/plain', 'a\u0000b\u0007c\u000bd\u000ce\u001ff\tg\nh\u0008i'));
    expect(read.text).toBe('abcdef\tg\nhi');
  });
});

describe('readPage: the links of markdown', () => {
  // The expression that found the links before it was made linear (it let a `[` into the text and the target of a link): ordinary markdown has the same links under both.
  const OLD_MARKDOWN_LINK = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;
  const oldLinks = (text: string) => {
    const seen = new Set<string>();
    const links: { url: string; text: string }[] = [];
    for (const match of text.matchAll(OLD_MARKDOWN_LINK)) {
      if (seen.has(match[2] as string)) continue;
      seen.add(match[2] as string);
      links.push({ url: match[2] as string, text: (match[1] as string).trim() });
    }
    return links;
  };

  it.each([
    ['links in a sentence', 'See [the discussion](https://a.example/t/1) and [the code](https://a.example/code).'],
    ['a list of links, a link twice, an image', '- [One](https://a.example/one)\n- [Two](https://a.example/two)\n\nAgain [one](https://a.example/one) and ![a picture](https://a.example/i.png).'],
    ['what is not a link', 'An [empty]() target, [spaced](https://a.example/a b), a [reference][ref], a [bare bracket and (parentheses).\n\n[ref]: https://a.example/ref'],
    ['parentheses in the text and in the target', '[a (b)](https://a.example/p) and [wiki](https://a.example/wiki/Foo_(bar)).'],
    ['a text that spans two lines', '[one\ntwo](https://a.example/x) and [three](https://a.example/y)'],
  ])('finds the links of ordinary markdown as it did: %s', (_name, body) => {
    expect(readPage(page('text/markdown', body, 'https://a.example/page')).links).toEqual(oldLinks(body));
  });
});

describe('readPage: a hostile page', () => {
  // The fetcher reads at most `maxBytes` (2,000,000 bytes by default), and the Desk must not spend minutes on that much text: each of these once took time in proportion to the square of its length.
  const SIZE = 2_000_000;
  const milliseconds = (run: () => void): number => {
    const start = performance.now();
    run();
    return performance.now() - start;
  };

  it.each([
    ['open brackets', '['.repeat(SIZE)],
    ['open links', '[a]('.repeat(SIZE / 4)],
    ['targets that never end', '[a](b'.repeat(SIZE / 5)],
    ['a word, a long run of spaces and a word', `a${' '.repeat(SIZE)}b`],
    ['a long run of tabs after a heading mark', `#${'\t'.repeat(SIZE)}x`],
    ['lines that end in white space', 'a \n'.repeat(SIZE / 3)],
  ])('reads %s in well under a second', (_name, body) => {
    for (const contentType of ['text/plain', 'text/markdown']) {
      expect(milliseconds(() => readAndCut(page(contentType, body), 150_000))).toBeLessThan(1000);
    }
  });
});

describe('readAndCut', () => {
  it('reads an html page as readPage does, and says it was not cut', () => {
    const html = '<html><head><title>A page</title></head><body><article><p>Some text of the page.</p><a href="/x">a link</a></article></body></html>';
    const given = page('text/html', html, 'https://a.example/y');
    expect(readAndCut(given, 1000)).toEqual({ ...readPage(given), cut: false });
  });

  it('cuts the text, and keeps the title, the date and all the links of the page as it was read', () => {
    const body = '# A title\n\nThe first paragraph, [one](https://a.example/one).\n\nThe second paragraph, [two](https://a.example/two).';
    const read = readAndCut(page('text/markdown', body), 70);
    expect(read.cut).toBe(true);
    expect(read.title).toBe('A title');
    expect(read.text).toBe('# A title\n\nThe first paragraph, [one](https://a.example/one).');
    expect(read.links.map((link) => link.url)).toEqual(['https://a.example/one', 'https://a.example/two']);
    expect(read).not.toHaveProperty('publishedAt');
  });
});

describe('cutText', () => {
  it('leaves a text that fits, and says it was not cut', () => {
    expect(cutText('One.\n\nTwo.', 100)).toEqual({ text: 'One.\n\nTwo.', cut: false });
  });

  it('leaves a text that is exactly as long as the limit', () => {
    expect(cutText('abcde', 5)).toEqual({ text: 'abcde', cut: false });
  });

  it('cuts at the last paragraph before the limit', () => {
    expect(cutText('One.\n\nTwo two.\n\nThree three three.', 20)).toEqual({ text: 'One.\n\nTwo two.', cut: true });
  });

  it('cuts at the last space when there is no paragraph break, and at the limit when there is no space', () => {
    expect(cutText('aaa bbb ccc ddd', 9)).toEqual({ text: 'aaa bbb', cut: true });
    expect(cutText('abcdefghij', 5)).toEqual({ text: 'abcde', cut: true });
  });

  it('keeps a whole character: it does not cut a surrogate pair in two', () => {
    const cut = cutText('ab\u{1F600}cd', 3);
    expect(cut.cut).toBe(true);
    expect(cut.text).toBe('ab');
  });

  it('keeps a whole character at every limit of a long run of them: the limit in the middle of a pair, and at the end of one', () => {
    const emoji = '\u{1F600}';
    const run = emoji.repeat(10);
    for (let limit = 1; limit < run.length; limit += 1) {
      const cut = cutText(run, limit);
      // A limit in the middle of a pair gives back the code unit that it would have split; a limit at the end of a pair keeps the pair.
      expect(cut.text).toBe(emoji.repeat(Math.floor(limit / 2)));
      expect(cut.text.length).toBeLessThanOrEqual(limit);
      expect(cut.cut).toBe(true);
    }
  });

  it('keeps the characters before a space or a paragraph break whole when the limit falls inside the pair that follows it', () => {
    const emoji = '\u{1F600}';
    expect(cutText(`${emoji}${emoji} cd`, 5)).toEqual({ text: `${emoji}${emoji}`, cut: true });
    expect(cutText(`${emoji}${emoji}\n\n${emoji}${emoji}`, 7)).toEqual({ text: `${emoji}${emoji}`, cut: true });
    expect(cutText(`ab ${emoji}${emoji}`, 4)).toEqual({ text: 'ab', cut: true });
  });

  it('gives an empty text when the limit is inside the first character, which the caller treats as no text', () => {
    expect(cutText('\u{1F600}\u{1F600}', 1)).toEqual({ text: '', cut: true });
  });

  it('cuts at the last line break when there is no paragraph break, and at a break only if it falls past half the limit', () => {
    expect(cutText('aaaa\nbbbb\ncccc\ndddd', 12)).toEqual({ text: 'aaaa\nbbbb', cut: true });
    // The paragraph break is in the first half, the line break after it is not.
    expect(cutText('a\n\nbbbb\ncccccc dd', 12)).toEqual({ text: 'a\n\nbbbb', cut: true });
    // No break past the middle: the last space.
    expect(cutText('aa\nbbbbbb bbbbbb bbbbbb', 12)).toEqual({ text: 'aa\nbbbbbb', cut: true });
  });

  it('is not cut to a short heading when the text that follows it has no break: it is cut at the last space', () => {
    const cut = cutText(`# Title\n\n${'word '.repeat(100)}`, 100);
    expect(cut.cut).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(100);
    expect(cut.text.startsWith('# Title\n\nword word')).toBe(true);
    expect(cut.text.endsWith(' word')).toBe(true);
  });

  it('cuts a page of html, which has one line for each block and no empty line, at a block', () => {
    const blocks = Array.from({ length: 12 }, (_, index) => `Block number ${index + 1} has a sentence of some length.`);
    const html = `<html><head><title>T</title></head><body><article>${blocks.map((block) => `<p>${block}</p>`).join('')}</article></body></html>`;
    const { text } = extractPage(html, 'https://a.example/x');
    expect(text).toBe(blocks.join('\n'));
    const cut = cutText(text, 200);
    expect(cut).toEqual({ text: blocks.slice(0, 4).join('\n'), cut: true });
  });

  it('does not end on white space, whichever kind of break it cuts at', () => {
    expect(cutText('abc\tdefgh', 4)).toEqual({ text: 'abc', cut: true });
    expect(cutText('abc  \n  defgh', 7)).toEqual({ text: 'abc', cut: true });
  });
});
