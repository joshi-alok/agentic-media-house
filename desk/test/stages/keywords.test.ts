import { describe, expect, it } from 'vitest';
import { itemMatches, matchesKeywords, plainText } from '../../src/stages/keywords';

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

  it('takes out the tags and only the tags: a less-than sign and a greater-than sign in the text stay, and the words between them', () => {
    expect(plainText('we show x < y and z > w agent')).toBe('we show x < y and z > w agent');
    expect(plainText('1<2 and 3>2')).toBe('1<2 and 3>2');
    expect(plainText('<br/>one</p> two <a href="https://x.example/?a=1&b=2">three</a>')).toBe('one two three');
  });

  it('is linear: a summary of thousands of less-than signs and no tag is read in a fraction of a second', () => {
    // A pattern such as /<[^>]*>/ looks for a closing sign from each of the signs, and takes seconds for this text, and minutes for a page at the limit of the bytes of a fetch.
    const hostile = '<'.repeat(50_000);
    const started = performance.now();
    expect(plainText(hostile)).toBe(hostile);
    expect(plainText(`${'<a '.repeat(20_000)}agent`)).toBe(`${'<a '.repeat(20_000)}agent`.trim());
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('itemMatches', () => {
  const keywords = ['smart contract', 'agent'];

  it('keeps every item when there are no keywords', () => {
    expect(itemMatches({ title: 'Anything', summary: 'at all' }, [])).toBe(true);
    expect(itemMatches({ title: 'Anything' }, [])).toBe(true);
  });

  it('matches a keyword in the title only', () => {
    expect(itemMatches({ title: 'An agent pays', summary: 'Nothing else here.' }, keywords)).toBe(true);
    expect(itemMatches({ title: 'An agent pays' }, keywords)).toBe(true);
  });

  it('matches a keyword in the summary only, and reads the summary as the text it shows', () => {
    expect(itemMatches({ title: 'A plain title', summary: '<p>About a <b>smart contract</b> wallet.</p>' }, keywords)).toBe(true);
    expect(itemMatches({ title: 'A plain title', summary: '<a href="https://x.example/agent">link</a>' }, keywords)).toBe(false);
  });

  it('does not match an item that has no keyword in the title and none in the summary', () => {
    expect(itemMatches({ title: 'Inclusion lists', summary: 'Nothing about the topic.' }, keywords)).toBe(false);
    expect(itemMatches({ title: 'Inclusion lists' }, keywords)).toBe(false);
  });

  it('does not join the end of the title to the start of the summary: a phrase must lie in one of them', () => {
    expect(itemMatches({ title: 'Smart', summary: 'contract wallets arrive' }, keywords)).toBe(false);
    expect(itemMatches({ title: 'Why the new smart', summary: 'Contract wallets arrive' }, keywords)).toBe(false);
  });
});
