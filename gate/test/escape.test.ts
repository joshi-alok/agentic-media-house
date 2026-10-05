import { describe, expect, it } from 'vitest';
import { escapeMdx } from '../src/render/escape';

// escapeMdx makes a sentence safe to place in MDX prose: whatever the text
// contains, it must come out as plain text and never as a heading, a list, a
// link, emphasis, an expression, a JSX element or an import. The expected
// strings below spell out each backslash twice, because they are written
// inside JavaScript string literals.

describe('escapeMdx: text that needs no escaping', () => {
  it.each([
    ['plain words', 'Plain sentence.'],
    ['an empty string', ''],
    ['a hyphen inside a word', 'FX-1 ships to the Tarnmoor plant'],
    ['digits, a dot and a slash inside a line', 'Peak tool speed is 2.3 m/s at 1.4 m reach'],
    ['a dollar amount and a percentage', 'It costs $38,000 and cuts cycle time by 18%'],
    ['straight quotes and an apostrophe', 'He said "ready" and it\'s done'],
    ['parentheses, commas, colons and semicolons', 'One (a), two: b; three'],
    ['the words import and export inside a sentence', 'Fixtures import and export parts; imports and exports differ'],
    ['a capitalised Import or Export at the start', 'Export controls tighten. Import duties rise.'],
    ['letters outside ASCII', 'caf' + String.fromCodePoint(0xe9) + ' ' + String.fromCodePoint(0x6771) + String.fromCodePoint(0x4eac)],
  ])('leaves %s alone', (_label, text) => {
    expect(escapeMdx(text)).toBe(text);
  });
});

describe('escapeMdx: characters escaped wherever they appear', () => {
  it.each([
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['a backtick', 'run `ls` now', 'run \\`ls\\` now'],
    ['an asterisk', 'a *b* c', 'a \\*b\\* c'],
    ['an underscore', 'snake_case', 'snake\\_case'],
    ['curly braces', 'Use {x} here', 'Use \\{x\\} here'],
    ['angle brackets', 'a <b> and </b>', 'a \\<b\\> and \\</b\\>'],
    ['square brackets', 'see [1] and [a](b)', 'see \\[1\\] and \\[a\\](b)'],
    ['a tilde', 'about ~5 kg', 'about \\~5 kg'],
    ['an ampersand', 'AT&T and &copy;', 'AT\\&T and \\&copy;'],
    ['a pipe', 'a | b', 'a \\| b'],
    ['a greater-than sign in the middle of a line', 'a > b', 'a \\> b'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });
});

describe('escapeMdx: characters escaped only at the start of a line', () => {
  it.each([
    ['a heading marker', '# Heading', '\\# Heading'],
    ['a second-level heading marker', '## Heading', '\\## Heading'],
    ['a bullet hyphen', '- item', '\\- item'],
    ['a bullet plus', '+ item', '\\+ item'],
    ['a block quote marker', '> quote', '\\> quote'],
    ['a numbered list marker with a dot', '1. one', '1\\. one'],
    ['a numbered list marker with a bracket', '12) twelve', '12\\) twelve'],
    ['a setext underline', '=== x', '\\=== x'],
    ['a thematic break', '--- x', '\\--- x'],
    ['a marker after leading spaces', '  - item', '  \\- item'],
  ])('escapes %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });

  it('applies the line-start rule to every line of a multi-line text', () => {
    expect(escapeMdx('first\n# second\n- third\n1. fourth')).toBe('first\n\\# second\n\\- third\n1\\. fourth');
  });

  it('does not escape the same characters in the middle of a line', () => {
    expect(escapeMdx('a - b + c = d # e 1. f')).toBe('a - b + c = d # e 1. f');
  });
});

describe('escapeMdx: lines that MDX would read as an import or export', () => {
  it.each([
    ['import at the start', 'import x from "y"', '&#105;mport x from "y"'],
    ['export at the start', 'export const a = 1', '&#101;xport const a = 1'],
    ['export on a later line', 'a\nexport b', 'a\n&#101;xport b'],
    ['import after leading spaces', '  import y', '  &#105;mport y'],
  ])('breaks the keyword of %s with a character reference', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });

  it('leaves a word that merely starts with the keyword', () => {
    expect(escapeMdx('important news, exported goods, imports')).toBe('important news, exported goods, imports');
  });
});

describe('escapeMdx: text that GFM would turn into a link', () => {
  it.each([
    ['a URL with a scheme', 'see https://a.example/x', 'see https:\\/\\/a.example/x'],
    ['a www address', 'see www.a.example', 'see www\\.a.example'],
    ['a WWW address in capitals', 'see WWW.A.EXAMPLE', 'see WWW\\.A.EXAMPLE'],
    ['an email address', 'write to me@a.example', 'write to me\\@a.example'],
  ])('breaks up %s', (_label, text, expected) => {
    expect(escapeMdx(text)).toBe(expected);
  });
});

describe('escapeMdx: a hostile sentence', () => {
  it('comes out with nothing live in it', () => {
    const hostile = '<script>alert(1)</script> {1+1} *bold* [x](javascript:y) `z`';
    expect(escapeMdx(hostile)).toBe('\\<script\\>alert(1)\\</script\\> \\{1+1\\} \\*bold\\* \\[x\\](javascript:y) \\`z\\`');
  });
});
