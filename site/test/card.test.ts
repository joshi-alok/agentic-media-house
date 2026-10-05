import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, cardFigures, escapeXml, renderCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const GOLDEN = LedgerEntry.parse(JSON.parse(read('ledger/fixture-robotics-ships-fx-1-to-second-plant.json')));

const unescape = (text: string): string => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

/** The text of the <text> elements that have the given data-role, unescaped, in document order. */
function textsWithRole(svg: string, role: string): string[] {
  return [...svg.matchAll(/<text[^>]*data-role="([^"]*)"[^>]*>([^<]*)<\/text>/g)].filter((match) => match[1] === role).map((match) => unescape(match[2]!));
}

/** A copy of the golden ledger entry with `change` applied. */
function entryWith(change: (copy: LedgerEntry) => void): LedgerEntry {
  const copy = structuredClone(GOLDEN);
  change(copy);
  return copy;
}

describe('wrapText', () => {
  it.each([
    ['fits on one line', 'one two three', 20, 3, ['one two three']],
    ['breaks at a space', 'one two three four', 9, 3, ['one two', 'three', 'four']],
    ['breaks after the last word that fits', 'aaa bbb ccc', 7, 3, ['aaa bbb', 'ccc']],
    ['fits a line of exactly the maximum length', 'abcde fghij', 5, 3, ['abcde', 'fghij']],
    ['collapses runs of spaces and trims the ends', '  one   two  ', 20, 3, ['one two']],
    ['is empty for empty text', '   ', 20, 3, []],
    ['cuts a word that is longer than a line', 'abcdefghij', 4, 3, ['abcd', 'efgh', 'ij']],
  ])('%s', (_name, text, maxChars, maxLines, expected) => {
    expect(wrapText(text, maxChars, maxLines)).toEqual(expected);
  });

  it('ends the last line with an ellipsis when the text needs more lines than it may have', () => {
    expect(wrapText('one two three four five six', 9, 2)).toEqual(['one two', `three${ELLIPSIS}`]);
  });

  it('shortens the last line to make room for the ellipsis', () => {
    expect(wrapText('aaaa bbbb cccc dddd', 4, 2)).toEqual(['aaaa', `bbb${ELLIPSIS}`]);
  });

  it('never makes a line longer than the maximum', () => {
    const lines = wrapText('Fixture Robotics ships its FX-1 warehouse arm to a second plant and then some more words follow', 16, 3);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(16);
  });

  it('does not add an ellipsis when the text fits exactly', () => {
    expect(wrapText('one two three four', 9, 3)).toEqual(['one two', 'three', 'four']);
  });

  it('rejects a line length or line count that cannot hold text, and says which', () => {
    expect(() => wrapText('x', 1, 3)).toThrow(RangeError);
    expect(() => wrapText('x', 1, 3)).toThrow('maxChars must be a whole number of at least 2');
    expect(() => wrapText('x', 2.5, 3)).toThrow('maxChars must be a whole number of at least 2');
    expect(() => wrapText('x', 10, 0)).toThrow(RangeError);
    expect(() => wrapText('x', 10, 0)).toThrow('maxLines must be a whole number of at least 1');
    expect(() => wrapText('x', 10, 1.5)).toThrow('maxLines must be a whole number of at least 1');
  });

  it('accepts the smallest line length and line count that can hold text', () => {
    expect(wrapText('ab cd', 2, 3)).toEqual(['ab', 'cd']);
    expect(wrapText('abc', 5, 1)).toEqual(['abc']);
  });
});

describe('escapeXml', () => {
  it('escapes the five characters XML cares about', () => {
    expect(escapeXml(`a & b < c > d " e '`)).toBe('a &amp; b &lt; c &gt; d &quot; e &#39;');
  });

  it('removes characters that XML 1.0 does not allow at all', () => {
    expect(escapeXml(`a${String.fromCharCode(0)}b${String.fromCharCode(1)}c${String.fromCharCode(11)}d${String.fromCharCode(31)}e`)).toBe('abcde');
  });

  it('keeps tabs and line feeds', () => {
    expect(escapeXml('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('cardFigures', () => {
  it('takes the value and label of the first three number claims, in the order the article cites them', () => {
    expect(cardFigures(GOLDEN)).toEqual([
      { value: 'USD 450 million', label: 'funding round' },
      { value: '18 per cent', label: 'cycle-time cut' },
      { value: '$38,000', label: 'list price' },
    ]);
  });

  it('ignores claims of other types, even when they have numbers', () => {
    const figures = cardFigures(GOLDEN);
    expect(figures.map((figure) => figure.label)).not.toContain('payload');
  });

  it('shows fewer figures when there are fewer number claims', () => {
    const entry = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardFigures(entry)).toEqual([{ value: 'USD 450 million', label: 'funding round' }]);
  });

  it('shows none when no claim is a number claim', () => {
    expect(cardFigures(entryWith((copy) => copy.claims.forEach((claim) => (claim.type = 'event'))))).toEqual([]);
  });

  it('uses the first value of a number claim that lists no number, and skips a number claim with no value at all', () => {
    const entry = entryWith((copy) => {
      const byId = new Map(copy.claims.map((claim) => [claim.id, claim]));
      byId.get('c-17')!.values = [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }];
      byId.get('c-20')!.values = [];
    });
    expect(cardFigures(entry).map((figure) => figure.value)).toEqual(['Corvane Partners', '$38,000', '940']);
  });

  it('follows the order of the ledger, not the order of the claims list', () => {
    const entry = entryWith((copy) => {
      copy.order = [...copy.order].reverse();
    });
    expect(cardFigures(entry).map((figure) => figure.label)).toEqual(['investor count', 'measured pick rate', 'list price']);
  });
});

describe('renderCardSvg', () => {
  const svg = renderCardSvg(GOLDEN);

  it('is a well-formed XML document', () => {
    expect(xmlProblem(svg)).toBeUndefined();
  });

  it('is 1200 by 630', () => {
    expect([CARD_WIDTH, CARD_HEIGHT]).toEqual([1200, 630]);
    expect(svg).toContain('width="1200" height="630" viewBox="0 0 1200 630"');
  });

  it('carries the wordmark and the title, wrapped over at most three lines', () => {
    expect(textsWithRole(svg, 'wordmark')).toEqual(['ROBYWIRE']);
    const title = textsWithRole(svg, 'title');
    expect(title.length).toBeGreaterThanOrEqual(2);
    expect(title.length).toBeLessThanOrEqual(3);
    expect(title.join(' ')).toBe(GOLDEN.title);
  });

  it('shows the three key figures with their labels', () => {
    expect(textsWithRole(svg, 'figure')).toEqual(['USD 450 million', '18 per cent', '$38,000']);
    expect(textsWithRole(svg, 'figure-label')).toEqual(['funding round', 'cycle-time cut', 'list price']);
  });

  it('sets the figures large, in weight 400 and in the link colour', () => {
    const figures = [...svg.matchAll(/<text[^>]*data-role="figure"[^>]*>/g)].map((match) => match[0]);
    expect(figures).toHaveLength(3);
    for (const tag of figures) {
      expect(tag).toContain('font-weight="400"');
      expect(tag).toContain(`fill="${CARD_COLOURS.link}"`);
      expect(Number(/font-size="(\d+)"/.exec(tag)?.[1])).toBeGreaterThanOrEqual(44);
    }
  });

  it('says how many claims and sources the article has, and the host of the first source it cites', () => {
    expect(textsWithRole(svg, 'counts')).toEqual(['28 claims from 5 sources']);
    expect(textsWithRole(svg, 'host')).toEqual(['fixture-robotics.example']);
  });

  it('sets all the figures of a card at one size, chosen for the longest of them', () => {
    const sizeOf = (card: string) => [...card.matchAll(/data-role="figure" [^>]*font-size="(\d+)"/g)].map((match) => Number(match[1]));
    expect(sizeOf(svg)).toEqual([44, 44, 44]);
    const short = renderCardSvg(entryWith((copy) => {
      for (const claim of copy.claims) if (claim.type === 'number') claim.values = [{ kind: 'number', raw: String(claim.label.length), normalised: '1' }];
    }));
    expect(sizeOf(short)).toEqual([64, 64, 64]);
  });

  it.each([
    [1, 64],
    [8, 64],
    [9, 52],
    [12, 52],
    [13, 44],
    [15, 44],
  ])('sets figures whose longest is %i characters at %i', (length, size) => {
    const card = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.values = [{ kind: 'number', raw: 'x'.repeat(length), normalised: '1' }];
        for (const id of ['c-20', 'c-4']) copy.claims.find((claim) => claim.id === id)!.values = [{ kind: 'number', raw: '1', normalised: '1' }];
      }),
    );
    expect([...card.matchAll(/data-role="figure" [^>]*font-size="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([size, size, size]);
  });

  it('places the title lines 62 pixels apart, from 190', () => {
    const long = renderCardSvg(entryWith((copy) => (copy.title = 'word '.repeat(60).trim())));
    const baselines = [...long.matchAll(/data-role="title" x="\d+" y="(\d+)"/g)].map((match) => Number(match[1]));
    expect(baselines).toEqual([190, 252, 314]);
  });

  it('cuts a label that is too long for its column', () => {
    const card = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.label = 'a label that goes on and on and on and on';
      }),
    );
    const [first] = textsWithRole(card, 'figure-label');
    expect(first!.length).toBeLessThanOrEqual(26);
    expect(first!.endsWith(ELLIPSIS)).toBe(true);
  });

  it('cuts a figure that is too long for its column', () => {
    const long = renderCardSvg(entryWith((copy) => {
      copy.claims.find((claim) => claim.id === 'c-17')!.values = [{ kind: 'number', raw: 'about 4,500,000,000 US dollars', normalised: '4500000000' }];
    }));
    const [first] = textsWithRole(long, 'figure');
    expect(first!.length).toBeLessThanOrEqual(15);
    expect(first!.endsWith(ELLIPSIS)).toBe(true);
  });

  it('draws a one-pixel hairline frame', () => {
    expect(svg).toMatch(/<rect [^>]*fill="none"[^>]*stroke-width="1"/);
    expect(svg).not.toMatch(/stroke-width="(?!1")/);
  });

  it('contains no image, no link and no web font', () => {
    expect(svg).not.toMatch(/<image|<img|href=|url\(|@font-face|<style|<script/i);
  });

  it('names only system fonts', () => {
    const families = [...svg.matchAll(/font-family="([^"]*)"/g)].map((match) => match[1]);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) expect(family).toBe('-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif');
  });

  it('is the same every time', () => {
    expect(renderCardSvg(GOLDEN)).toBe(svg);
    expect(renderCardSvg(structuredClone(GOLDEN))).toBe(svg);
  });

  it('escapes markup in the title, so a hostile title cannot break the card or add elements', () => {
    const hostile = renderCardSvg(entryWith((copy) => (copy.title = 'A & B <script>alert(1)</script> "quoted"')));
    expect(xmlProblem(hostile)).toBeUndefined();
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&amp;');
    expect(hostile).toContain('&lt;script&gt;');
    expect(textsWithRole(hostile, 'title').join(' ')).toContain('A & B <script>alert(1)</script>');
  });

  it('escapes the label of a figure and the host as well', () => {
    const hostile = renderCardSvg(
      entryWith((copy) => {
        copy.claims.find((claim) => claim.id === 'c-17')!.label = 'a <b> & c';
      }),
    );
    expect(xmlProblem(hostile)).toBeUndefined();
    expect(hostile).toContain('a &lt;b&gt; &amp; c');
  });

  it('stays well-formed with a character that XML 1.0 forbids in the title', () => {
    const odd = renderCardSvg(entryWith((copy) => (copy.title = `Bad${String.fromCharCode(1)}title`)));
    expect(xmlProblem(odd)).toBeUndefined();
    expect(textsWithRole(odd, 'title')).toEqual(['Badtitle']);
  });

  it('ends a very long title with an ellipsis on the third line', () => {
    const long = renderCardSvg(entryWith((copy) => (copy.title = 'word '.repeat(60).trim())));
    const lines = textsWithRole(long, 'title');
    expect(lines).toHaveLength(3);
    expect(lines[2]!.endsWith(ELLIPSIS)).toBe(true);
    expect(xmlProblem(long)).toBeUndefined();
  });

  it('draws a card with no figures, no claims and no sources without failing', () => {
    const bare = renderCardSvg(entryWith((copy) => Object.assign(copy, { claims: [], order: [], sources: [] })));
    expect(xmlProblem(bare)).toBeUndefined();
    expect(textsWithRole(bare, 'counts')).toEqual(['0 claims from 0 sources']);
    expect(bare).not.toContain('data-role="host"');
    expect(bare).not.toContain('data-role="figure"');
  });

  it('uses only colours from the light design tokens', () => {
    const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    // The light scheme is the first block, before the dark media query.
    const lightBlock = tokens.slice(0, tokens.indexOf('@media'));
    const allowed = new Set([...lightBlock.matchAll(/--[a-z0-9-]+\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((match) => match[1]!.toUpperCase()));
    const used = new Set([...svg.matchAll(/#[0-9A-Fa-f]{6}/g)].map((match) => match[0].toUpperCase()));
    expect(used.size).toBeGreaterThan(2);
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  });
});
