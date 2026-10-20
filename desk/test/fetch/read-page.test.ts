import { describe, expect, it } from 'vitest';
import { cutText, readPage } from '../../src/fetch/read-page';

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
    expect(cutText(`${emoji}\n\n${emoji}${emoji}`, 5)).toEqual({ text: emoji, cut: true });
    expect(cutText(`ab ${emoji}${emoji}`, 4)).toEqual({ text: 'ab', cut: true });
  });

  it('gives an empty text when the limit is inside the first character, which the caller treats as no text', () => {
    expect(cutText('\u{1F600}\u{1F600}', 1)).toEqual({ text: '', cut: true });
  });
});
