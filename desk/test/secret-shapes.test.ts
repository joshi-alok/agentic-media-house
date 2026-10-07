import { describe, expect, it } from 'vitest';
import { secretsIn } from './support/secrets';

// The files that this repository publishes about its own running (the settings of the daily run, the two workflows, the Cloudflare settings and the runbook) must
// never hold a key. `secretsIn` is the one function that says whether a text has anything shaped like one, and the tests of those files ask it. It is a safety net
// and not a proof: a secret that looks like none of the shapes below gets through it. So these tests say exactly which shapes it knows, and that it can say yes.
//
// The samples are made here from pieces, so that this file does not itself hold a string shaped like a key, and the shapes are those of the keys of this project
// (an Anthropic key, an access key id of AWS and of R2, the secret that goes with it, a token of Cloudflare, and a token of GitHub).

const piece = (...parts: string[]): string => parts.join('');
const MIXED = piece('q8Zr', 'T1vK', 'm3Xw', 'P9cL', 'e5Jd', 'N7hB', 'y2Fs', 'U4aG', 'o6Qi', 'V0tR');

describe('secretsIn', () => {
  it('finds an Anthropic key, by its prefix', () => {
    expect(secretsIn(`key: ${piece('sk', '-ant-', 'api03-', 'abc')}`)).toEqual(['an Anthropic key (line 1)']);
  });

  it('finds an access key id of AWS or of R2, which is four letters and sixteen capitals or digits', () => {
    expect(secretsIn(`id: ${piece('AK', 'IA', 'ABCDEFGH', 'IJKLMNOP')}`)).toEqual(['an access key id (line 1)']);
    expect(secretsIn(`id: ${piece('AS', 'IA', '0123456789', 'ABCDEF')}`)).toEqual(['an access key id (line 1)']);
  });

  it('finds a token of GitHub, by its prefix', () => {
    expect(secretsIn(piece('gh', 'p_', 'a'.repeat(24)))).toEqual(['a token of GitHub (line 1)']);
    expect(secretsIn(piece('github', '_pat_', 'a'.repeat(24)))).toEqual(['a token of GitHub (line 1)']);
  });

  it('finds a private key, by its first line', () => {
    expect(secretsIn(piece('-----', 'BEGIN ', 'PRIVATE KEY', '-----'))).toEqual(['a private key (line 1)']);
  });

  it('finds a secret of forty characters or more that mixes capitals, small letters and digits, which is how the secret of an access key and a token of Cloudflare look', () => {
    expect(secretsIn(`secret: ${MIXED}`)).toEqual(['a long mixed token (line 1)']);
    expect(secretsIn(`secret: "${MIXED}"`)).toEqual(['a long mixed token (line 1)']);
  });

  it('counts a zero as a digit: a token whose only digit is a zero is as much a secret as any other', () => {
    expect(secretsIn(`secret: ${'aBcD'.repeat(9)}e0Fg`)).toEqual(['a long mixed token (line 1)']);
    expect(secretsIn(`secret: ${'a0'.repeat(20)}`)).toEqual(['a long hexadecimal token (line 1)']);
  });

  it('finds forty hexadecimal digits or more, which is how the secret of an R2 access key looks', () => {
    expect(secretsIn(`secret: ${'0123456789abcdef'.repeat(4)}`)).toEqual(['a long hexadecimal token (line 1)']);
    expect(secretsIn(`secret: ${'0123456789abcdef'.repeat(3).slice(0, 40)}`)).toEqual(['a long hexadecimal token (line 1)']);
  });

  it('says the line, counting from 1, and never what it found', () => {
    const found = secretsIn(`one\ntwo\nkey: ${piece('sk', '-ant-', 'api03-', 'abc')}\nfour`);
    expect(found).toEqual(['an Anthropic key (line 3)']);
    expect(found.join('')).not.toContain('api03');
  });

  it('says every line that has one, once for each kind that it finds there', () => {
    const text = `${piece('sk', '-ant-', 'x')}\nfine\n${piece('AK', 'IA', 'ABCDEFGH', 'IJKLMNOP')} ${MIXED}`;
    expect(secretsIn(text)).toEqual(['an Anthropic key (line 1)', 'an access key id (line 3)', 'a long mixed token (line 3)']);
  });

  it('finds nothing in what these files really say: names of variables, paths, addresses, versions and sentences', () => {
    const fine = [
      'ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
      'path: docs/superpowers/specs/2026-10-06-the-desk-automation-design.md',
      'userAgent: AgenticMediaHouseDesk/0.1 (+https://agentic-media-house.joshi-alok.workers.dev/method)',
      'uses: actions/checkout@v7',
      'a model is named claude-haiku-4-5-20251001',
      'a-very-long-path-of-lowercase-words-and-numbers-like-2026-10-06-and-so-on-and-so-forth',
      'run: gh secret set ANTHROPIC_API_KEY < ~/.config/agentic-media-house/anthropic.key',
    ];
    for (const line of fine) expect(secretsIn(line), line).toEqual([]);
  });

  it('does not take a long word of capitals and small letters with no digit, or a long run of digits, for a secret', () => {
    expect(secretsIn('AVeryLongIdentifierWithCapitalsAndSmallLettersOnlyAndNoDigitsAtAllInIt')).toEqual([]);
    expect(secretsIn('1'.repeat(50))).toEqual([]);
  });
});
