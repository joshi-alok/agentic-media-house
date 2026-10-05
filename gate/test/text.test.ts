import { describe, expect, it } from 'vitest';
import { countWords, hasQuoted, jaccard, normaliseQuotes, quotedSegments, sentenceWords, stripQuoted } from '../src/text';

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['\n\t', 0],
    ['one', 1],
    ['  padded  ', 1],
    ['two words', 2],
    ['tabs\tand\nnewlines  count', 4],
    ['non\u00A0breaking space', 3],
    // A hyphenated, alphanumeric or slashed token is one word.
    ['FX-1', 1],
    ['m/s', 1],
    ['the FX-1 arm moves at 2.3 m/s', 7],
    // A dash with spaces around it is a token of its own and counts. The
    // piece avoids spaced dashes so that body counts are not inflated.
    ['one - two', 3],
  ])('counts %j as %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('normaliseQuotes', () => {
  it.each([
    ['\u201Cquoted\u201D', '"quoted"'],
    ['\u201Equoted\u201F', '"quoted"'],
    ['it\u2019s', "it's"],
    ['\u2018single\u2019', "'single'"],
    ['2026\u201327', '2026-27'],
    ['pause \u2014 here', 'pause - here'],
    ['a\u00A0b', 'a b'],
    ['a   b\t\nc', 'a b c'],
    ['  trimmed  ', 'trimmed'],
    ['', ''],
    ['already "plain" text', 'already "plain" text'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normaliseQuotes(input)).toBe(expected);
  });
});

describe('stripQuoted', () => {
  it.each([
    ['He said "stop" now.', 'He said now.'],
    ['He said \u201Cstop\u201D now.', 'He said now.'],
    ['Mixed \u201Cstop" marks.', 'Mixed marks.'],
    ['One "a" and two "b" quotes.', 'One and two quotes.'],
    ['"Ready," said Jane.', 'said Jane.'],
    ['Only quotes ""', 'Only quotes'],
    ['No quotes here.', 'No quotes here.'],
    ['', ''],
    // An unterminated quote is not a quoted segment: the text stays as it is.
    ['He said "stop now.', 'He said "stop now.'],
    // The third quote mark has no partner, so only the first pair is removed.
    ['a "b" c "d', 'a c "d'],
  ])('turns %j into %j', (input, expected) => {
    expect(stripQuoted(input)).toBe(expected);
  });
});

describe('hasQuoted', () => {
  // Curly quote marks, written as codes so that this file stays ASCII.
  const open = String.fromCharCode(0x201c);
  const close = String.fromCharCode(0x201d);

  it.each([
    ['He said "stop" now.', true],
    [`He said ${open}stop${close} now.`, true],
    [`Mixed ${open}stop" marks.`, true],
    ['Only quotes ""', true],
    ['An empty "   " pair', true],
    ['One "a" and two "b" quotes.', true],
    ['a "b" c "d', true],
    ['He said "stop now.', false],
    [`A single ${open} mark`, false],
    ['No quotes here.', false],
    ['', false],
  ])('says %j is %s', (input, expected) => {
    expect(hasQuoted(input)).toBe(expected);
  });
});

describe('quotedSegments', () => {
  it.each([
    ['He said "stop now" and "go".', ['stop now', 'go']],
    ['She said \u201CIt\u2019s ready\u201D today.', ["It's ready"]],
    ['A \u201Cmixed" pair', ['mixed']],
    ['Spaces "a   b" collapse', ['a b']],
    ['Trim " padded " inner', ['padded']],
    // Empty segments are noise and are dropped.
    ['Empty "" and "   " quotes', []],
    ['An unterminated "quote', []],
    ['No quotes at all', []],
    ['', []],
  ])('finds the segments of %j', (input, expected) => {
    expect(quotedSegments(input)).toEqual(expected);
  });
});

describe('sentenceWords', () => {
  it.each([
    ['The FX-1 arm, (rated) at 12 kg.', ['The', 'FX-1', 'arm', 'rated', 'at', '12', 'kg']],
    ['Keeps Original CASE', ['Keeps', 'Original', 'CASE']],
    ['Fixture\u2019s arm', ["Fixture's", 'arm']],
    ['U.S. speed 2.3 m/s', ['U.S', 'speed', '2.3', 'm/s']],
    ['pause \u2014 here', ['pause', 'here']],
    ['$450 million!', ['450', 'million']],
    ['"quoted" words', ['quoted', 'words']],
    ['...', []],
    ['', []],
  ])('splits %j into words', (input, expected) => {
    expect(sentenceWords(input)).toEqual(expected);
  });
});

describe('jaccard', () => {
  const set = (...items: string[]) => new Set(items);

  it.each([
    ['identical sets', set('a', 'b'), set('a', 'b'), 1],
    ['disjoint sets', set('a'), set('b'), 0],
    ['half-overlapping sets', set('a', 'b'), set('b', 'c'), 1 / 3],
    ['a subset', set('a'), set('a', 'b'), 0.5],
    ['one empty set', set(), set('a'), 0],
    ['two empty sets', set(), set(), 0],
  ])('scores %s', (_name, a, b, expected) => {
    expect(jaccard(a, b)).toBeCloseTo(expected, 10);
  });

  it('is symmetric', () => {
    const a = set('x', 'y', 'z');
    const b = set('y', 'z', 'w', 'v');
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });
});
