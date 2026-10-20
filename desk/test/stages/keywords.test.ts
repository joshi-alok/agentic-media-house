import { describe, expect, it } from 'vitest';
import { matchesKeywords, plainText } from '../../src/stages/keywords';

describe('matchesKeywords', () => {
  it('keeps everything when there are no keywords', () => {
    expect(matchesKeywords('anything at all', [])).toBe(true);
  });

  it('matches whole words or phrases, ignoring case', () => {
    expect(matchesKeywords('Agents that pay: x402 in practice', ['agents'])).toBe(true);
    expect(matchesKeywords('An AGENT pays', ['agent'])).toBe(true);
    expect(matchesKeywords('smart contract wallets', ['Smart Contract'])).toBe(true);
  });

  it('does not match a longer word or a part of one', () => {
    expect(matchesKeywords('A reagent in the lab', ['agent'])).toBe(false);
    expect(matchesKeywords('Agentic payments', ['agent'])).toBe(false);
    expect(matchesKeywords('said again', ['AI'])).toBe(false);
  });

  it('reads a curly apostrophe or quotation mark as the plain one, in the text and in the keyword', () => {
    expect(matchesKeywords(`The agent${String.fromCharCode(0x2019)}s wallet`, ["agent's wallet"])).toBe(true);
    expect(matchesKeywords("The agent's wallet", [`agent${String.fromCharCode(0x2019)}s wallet`])).toBe(true);
  });

  it('matches a keyword that has punctuation inside it', () => {
    expect(matchesKeywords('ERC-8004 registries', ['ERC-8004'])).toBe(true);
    expect(matchesKeywords('on-chain agents', ['on-chain'])).toBe(true);
  });

  it('is true if any one keyword matches', () => {
    expect(matchesKeywords('Stablecoins and wallets', ['agent', 'wallets'])).toBe(true);
    expect(matchesKeywords('Stablecoins and wallets', ['agent', 'bots'])).toBe(false);
  });
});

describe('plainText', () => {
  it('takes the tags out of a summary and folds white space', () => {
    expect(plainText('<p>Agents  <b>pay</b>\n now</p>')).toBe('Agents pay now');
    expect(plainText(undefined)).toBe('');
  });
});
