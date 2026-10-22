import { describe, expect, it } from 'vitest';
import { afterOpeners, countWords, hasQuoted, hasWholePhrase, jaccard, normaliseQuotes, quotedSegments, sentenceWords, startsWithCapitalOrDigit, stripQuoted } from '../src/text';

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

describe('afterOpeners', () => {
  it.each([
    ['Plain text', 'Plain text'],
    ['  padded', 'padded'],
    ['"Quoted," said Jane.', 'Quoted," said Jane.'],
    ['\u201CCurly\u201D start', 'Curly\u201D start'],
    ['\u2018single\u2019 start', 'single\u2019 start'],
    ['\u201Elow\u201F start', 'low\u201F start'],
    ["'single' start", "single' start"],
    ['\u00ABguillemets\u00BB', 'guillemets\u00BB'],
    ['\u2039single guillemet', 'single guillemet'],
    ['(bracket) start', 'bracket) start'],
    ['[square] start', 'square] start'],
    ['{curly} start', 'curly} start'],
    ['  ("[mixed ones', 'mixed ones'],
    ['\u00A0\u00A0non-breaking spaces', 'non-breaking spaces'],
    ['', ''],
    ['"("  ', ''],
    // Only what stands before the first letter goes: the rest, and every kind of character after it, stays.
    ['A "b" (c)', 'A "b" (c)'],
    ['$450 million', '$450 million'],
    [') closing bracket first', ') closing bracket first'],
  ])('skips what stands in front of the first letter of %j', (input, expected) => {
    expect(afterOpeners(input)).toBe(expected);
  });
});

describe('startsWithCapitalOrDigit', () => {
  it.each([
    'The arm shipped.',
    'A',
    '7 investors took part.',
    '2026 was a busy year.',
    '3D printing helped.',
    '"The arm," said Jane.',
    '\u201CThe arm,\u201D said Jane.',
    '\u2018The arm\u2019 was new.',
    '(The arm shipped.)',
    '["The arm"] shipped.',
    '  The arm shipped.',
    '\u00C9clair Robotics grew.',
    '\u00D6zdemir Logistics grew.',
    '\u0416 started it.',
    '\u0663 investors took part.',
  ])('accepts %j', (text) => {
    expect(startsWithCapitalOrDigit(text)).toBe(true);
  });

  it.each([
    'harlow logistics plans a plant.',
    'iRobot joined.',
    'xAI joined.',
    '"the arm," said Jane.',
    '\u201Cthe arm,\u201D said Jane.',
    '(the arm shipped.)',
    '  the arm shipped.',
    '\u00E9clair Robotics grew.',
    '$450 million was raised.',
    '- The arm shipped.',
    '...The arm shipped.',
    ') The arm shipped.',
    '\u2014The arm shipped.',
    '',
    '   ',
    '""',
    '"("',
  ])('refuses %j', (text) => {
    expect(startsWithCapitalOrDigit(text)).toBe(false);
  });

  it('looks at the first character only, so a capital later in the sentence does not help', () => {
    expect(startsWithCapitalOrDigit('the Arm shipped.')).toBe(false);
    expect(startsWithCapitalOrDigit('The arm Shipped.')).toBe(true);
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

describe('hasWholePhrase', () => {
  it('is false for an empty phrase, whatever the text', () => {
    expect(hasWholePhrase('price target', '')).toBe(false);
    expect(hasWholePhrase('', '')).toBe(false);
  });

  it('is false for an empty text and for a text without the phrase', () => {
    expect(hasWholePhrase('', 'price target')).toBe(false);
    expect(hasWholePhrase('the price of the target', 'price target')).toBe(false);
  });

  it('finds the phrase when it is the whole text, at the start, in the middle and at the end', () => {
    expect(hasWholePhrase('price target', 'price target')).toBe(true);
    expect(hasWholePhrase('price target was raised', 'price target')).toBe(true);
    expect(hasWholePhrase('they raised the price target again', 'price target')).toBe(true);
    expect(hasWholePhrase('they raised the price target', 'price target')).toBe(true);
  });

  it('does not find the phrase inside a longer word, on either side', () => {
    expect(hasWholePhrase('they reprice target dates', 'price target')).toBe(false);
    expect(hasWholePhrase('the price targeted by the attack', 'price target')).toBe(false);
    expect(hasWholePhrase('a price targets list', 'price target')).toBe(false);
    expect(hasWholePhrase('the subprice target', 'price target')).toBe(false);
  });

  it('does not find the phrase next to a letter of another alphabet, which is a letter all the same', () => {
    expect(hasWholePhrase('\u00E9price target', 'price target')).toBe(false);
    expect(hasWholePhrase('price target\u00FC', 'price target')).toBe(false);
  });

  it('does not find the phrase next to a digit, and finds it next to a space or a mark that is not a letter or a digit', () => {
    expect(hasWholePhrase('price target2', 'price target')).toBe(false);
    expect(hasWholePhrase('2price target', 'price target')).toBe(false);
    expect(hasWholePhrase('price target 2', 'price target')).toBe(true);
    for (const text of ['(price target)', '"price target"', 'price target, again', 'the price target.', 'a non-price target-based plan']) {
      expect(hasWholePhrase(text, 'price target'), text).toBe(true);
    }
  });

  it('looks at every place the phrase stands: a place that is inside a word does not hide a later one that is not', () => {
    expect(hasWholePhrase('reprice target and price target', 'price target')).toBe(true);
    expect(hasWholePhrase('price targets and a price target', 'price target')).toBe(true);
    expect(hasWholePhrase('price targetprice target', 'price target')).toBe(false);
  });

  it('looks at places that overlap: the second one starts inside the first', () => {
    // The first "a a" has a letter in front of it; the second starts on the last letter of the first.
    expect(hasWholePhrase('aa a a', 'a a')).toBe(true);
    expect(hasWholePhrase('ababa', 'aba')).toBe(false);
    expect(hasWholePhrase('aaa', 'aa')).toBe(false);
  });

  it('compares the text as it is: the caller folds the case and the quotation marks first', () => {
    expect(hasWholePhrase('Price Target', 'price target')).toBe(false);
    expect(hasWholePhrase('price target', 'price target')).toBe(true);
  });
});
