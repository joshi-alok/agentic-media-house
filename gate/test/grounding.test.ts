import { describe, expect, it } from 'vitest';
import { cloneGolden } from '../src/fixtures';
import {
  SENTENCE_STARTERS,
  claimTexts,
  claimWords,
  isSentenceStarter,
  openingWordAccepted,
  wordSet,
} from '../src/grounding';
import { claimById } from './helpers';

// A curly apostrophe, written as a code so that this file stays ASCII.
const CURLY = String.fromCharCode(0x2019);

// SENTENCE_STARTERS is a list of function words. Every entry is placed in a
// part of speech below, so a reviewer can see why it is there, and the test
// requires the table and the constant to agree exactly. A noun or a verb has no
// row to sit in, so it cannot be added without this file saying what it is.
const FUNCTION_WORDS: Record<string, string[]> = {
  article: ['a', 'an', 'the'],
  determiner: ['this', 'that', 'these', 'those', 'some', 'many', 'most', 'all', 'both', 'each', 'every', 'no', 'any', 'another', 'other', 'such'],
  possessive: ['its', 'our', 'their', 'his', 'her'],
  pronoun: ['it', 'we', 'they', 'he', 'she', 'one', 'there', 'here'],
  question: ['what', 'which', 'who', 'whom', 'whose', 'why', 'how'],
  preposition: [
    'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as', 'at', 'before', 'below', 'between', 'beyond',
    'by', 'despite', 'during', 'for', 'from', 'in', 'into', 'of', 'on', 'over', 'per', 'through', 'throughout', 'to', 'toward',
    'towards', 'under', 'until', 'upon', 'via', 'with', 'within', 'without',
  ],
  conjunction: ['although', 'and', 'because', 'but', 'if', 'or', 'since', 'so', 'though', 'unless', 'when', 'whereas', 'where', 'whether', 'while', 'yet'],
  adverb: [
    'additionally', 'also', 'earlier', 'even', 'however', 'instead', 'later', 'meanwhile', 'not', 'now', 'only', 'overall',
    'recently', 'separately', 'still', 'then', 'therefore', 'thus', 'today',
  ],
};

describe('SENTENCE_STARTERS', () => {
  it('is exactly the function words in the table above, each with a part of speech', () => {
    expect([...SENTENCE_STARTERS].sort()).toEqual(Object.values(FUNCTION_WORDS).flat().sort());
  });

  it('lists each word once, in lowercase letters only', () => {
    expect(new Set(SENTENCE_STARTERS).size).toBe(SENTENCE_STARTERS.length);
    for (const word of SENTENCE_STARTERS) expect(word, word).toMatch(/^[a-z]+$/);
  });

  it('is frozen, so no caller can add a word', () => {
    expect(Object.isFrozen(SENTENCE_STARTERS)).toBe(true);
  });

  it('contains the opening words the design names', () => {
    for (const word of ['the', 'a', 'an', 'it', 'its', 'this', 'however', 'meanwhile', 'one', 'not', 'only', 'still', 'such']) {
      expect(SENTENCE_STARTERS, word).toContain(word);
    }
  });

  it('contains no noun, no verb and no name that a news sentence might open with', () => {
    const openers = [
      'shipments', 'plans', 'sales', 'company', 'companies', 'robot', 'robots', 'arm', 'arms', 'plant', 'figures', 'analysts',
      'fixture', 'brindle', 'tarnmoor', 'harlow', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'will', 'can', 'may', 'do',
      'does', 'said', 'says', 'announced', 'reported', 'half', 'twice', 'double', 'several', 'first', 'second', 'zero',
    ];
    for (const word of openers) expect(SENTENCE_STARTERS, word).not.toContain(word);
  });
});

describe('isSentenceStarter', () => {
  it.each([
    ['The', true],
    ['the', true],
    ['HOWEVER', true],
    ["It's", true],
    [`That${CURLY}s`, true],
    ['Shipments', false],
    ['Harlow', false],
    ['', false],
  ])('says %j is %s', (word, expected) => {
    expect(isSentenceStarter(word)).toBe(expected);
  });
});

describe('wordSet', () => {
  it('lists the words of the texts in lowercase, without the punctuation around them', () => {
    expect([...wordSet(['Shipments began, (Tarnmoor) on Monday.'])].sort()).toEqual(['began', 'monday', 'on', 'shipments', 'tarnmoor']);
  });

  it('reads a possessive as the word and keeps a dotted abbreviation together', () => {
    const words = wordSet(["Brindle's plant in the U.S. grew."]);
    expect(words.has('brindle')).toBe(true);
    expect(words.has('us')).toBe(true);
  });

  it('keeps a hyphenated word whole and also lists its parts', () => {
    const words = wordSet(['The FX-1 does tote-picking.']);
    for (const word of ['fx-1', 'fx', '1', 'tote-picking', 'tote', 'picking']) expect(words.has(word), word).toBe(true);
  });

  it('is the union over every text, and empty for none', () => {
    expect([...wordSet(['one two', 'three'])].sort()).toEqual(['one', 'three', 'two']);
    expect(wordSet([]).size).toBe(0);
  });

  it('matches a whole word only, never part of a longer word', () => {
    expect(wordSet(['Shipments began.']).has('ship')).toBe(false);
  });
});

describe('claimTexts and claimWords', () => {
  it('give the text, label, quoted passage, name values and outlet of a claim, and no other value', () => {
    const claim = structuredClone(claimById(cloneGolden().claims, 'c-5'));
    claim.source.outlet = 'Mercer Wire';
    expect(claimTexts(claim)).toEqual([
      claim.text,
      claim.label,
      claim.span.quote,
      'Tarnmoor',
      'Mercer Wire',
    ]);
  });

  it('leaves out the outlet when the claim has none', () => {
    const claim = claimById(cloneGolden().claims, 'c-8');
    expect(claimTexts(claim)).toEqual([claim.text, claim.label, claim.span.quote]);
  });

  it('claimWords is the word set of every text of every claim', () => {
    const { claims } = cloneGolden();
    const words = claimWords([claimById(claims, 'c-8'), claimById(claims, 'c-18')]);
    for (const word of ['payload', 'rated', 'kilograms', 'corvane', 'partners', 'lead', 'investor']) expect(words.has(word), word).toBe(true);
    expect(words.has('tarnmoor')).toBe(false);
  });
});

describe('openingWordAccepted', () => {
  const grounded = new Set(['shipments', 'tarnmoor']);
  const allowed = new Set(['august']);

  it.each([
    ['a function word', 'However', true],
    ['a word of the claims', 'Shipments', true],
    ['a word of the claims in another case', 'TARNMOOR', true],
    ['a word of the claims with a possessive', "Tarnmoor's", true],
    ['a word on the allow-list', 'August', true],
    ['a name that nothing supports', 'Harlow', false],
    ['an ordinary noun that nothing supports', 'Plans', false],
  ])('%s: %s is %s', (_why, word, expected) => {
    expect(openingWordAccepted(word, grounded, allowed)).toBe(expected);
  });
});
