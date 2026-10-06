import { describe, expect, it } from 'vitest';
import { cloneGolden } from '../src/fixtures';
import {
  SENTENCE_STARTERS,
  claimTexts,
  claimWords,
  isSentenceStarter,
  openingWordAccepted,
  valueInQuote,
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
  it('give the quoted passage, the name values and the outlet of a claim, and nothing a model wrote about it: not the text, not the label, no other value', () => {
    const claim = structuredClone(claimById(cloneGolden().claims, 'c-5'));
    claim.source.outlet = 'Mercer Wire';
    claim.text = 'a sentence that a model wrote';
    claim.label = 'a label that a model wrote';
    expect(claimTexts(claim)).toEqual([claim.span.quote, 'Tarnmoor', 'Mercer Wire']);
  });

  it('leaves out the outlet when the claim has none', () => {
    const claim = claimById(cloneGolden().claims, 'c-8');
    expect(claimTexts(claim)).toEqual([claim.span.quote]);
  });

  it('claimWords is the word set of every text of every claim', () => {
    const { claims } = cloneGolden();
    const words = claimWords([claimById(claims, 'c-8'), claimById(claims, 'c-18')]);
    for (const word of ['payload', 'rated', 'kilograms', 'corvane', 'partners', 'lead', 'investor']) expect(words.has(word), word).toBe(true);
    expect(words.has('tarnmoor')).toBe(false);
  });

  it('claimWords has no word that only the text or the label of a claim has', () => {
    const claim = structuredClone(claimById(cloneGolden().claims, 'c-8'));
    claim.text = 'the harlow dynamics arm is rated for a payload of 12 kg';
    claim.label = 'harlow payload';
    expect(claimWords([claim]).has('harlow')).toBe(false);
    expect(claimWords([claim]).has('payload')).toBe(true);
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

describe('valueInQuote', () => {
  // A value is in its quotation only as a whole token: the character before it and the character after it are not a
  // letter or a digit, and a dot or a comma that joins a digit of the value to the next digit of a number does not count
  // as an edge either. So 2 is not in 12 weeks, 2.3 m/s, 1,200 or 2k, but 12 is in "12 weeks" and in "12."
  it.each([
    ['a number followed by a word', '12', 'delivery within 12 weeks of an order'],
    ['a number at the end of a sentence', '12', 'delivery within 12.'],
    ['a number that is the whole quotation', '12', '12'],
    ['a number in brackets', '12', 'delivery (12) weeks'],
    ['a decimal number', '2.3', 'a top speed of 2.3 m/s'],
    ['a number with a thousands comma', '1,200', 'ships 1,200 units'],
    ['a money amount with its magnitude', '$450 million', 'raised a $450 million round'],
    ['a money amount at the end of a sentence', '$450 million', 'raised $450 million.'],
    ['a number with its unit', '12 kg', 'Rated payload: 12 kg'],
    ['a number in a list', '2', 'items 1, 2, 3'],
    ['the second place where it stands, after one that is part of a longer number', '2', 'in 12 weeks or 2 weeks'],
    ['a year at the end of a sentence', '2027', 'builds 500 arms in 2027.'],
    ['a date', '30 November 2026', 'due by 30 November 2026.'],
    ['a number written in words', 'twelve', 'within twelve weeks'],
    ['a name', 'Fixture Robotics', 'Fixture Robotics has begun shipping'],
    ['a name that is followed by a possessive', 'Acme', "made by Acme's arm"],
    ['a name with a digit in it', 'FX-1', 'the FX-1 arm'],
    ['a name in quotation marks', 'Acme', 'the "Acme" arm'],
  ])('finds %s: %s in "%s"', (_why, raw, quote) => {
    expect(valueInQuote(raw, quote)).toBe(true);
  });

  it.each([
    ['inside a longer number', '2', 'delivery within 12 weeks of an order'],
    ['at the start of a longer number', '1', 'delivery within 12 weeks of an order'],
    ['inside a decimal number, before its dot', '2', 'a top speed of 2.3 m/s'],
    ['inside a decimal number, after its dot', '3', 'a top speed of 2.3 m/s'],
    ['as the whole number of a decimal number', '12', 'it lifts 12.5 kg'],
    ['as the decimals of a decimal number', '5', 'it lifts 12.5 kg'],
    ['as the first group of a number with a thousands comma', '1', 'ships 1,200 units'],
    ['as the last group of a number with a thousands comma', '200', 'ships 1,200 units'],
    ['as the decimals of a number that is the first thing of the quotation', '5', '1.5 kg is the payload'],
    ['as the last group of a number with a thousands comma that is the first thing of the quotation', '200', '1,200 units shipped'],
    ['in front of a letter', '2', 'a 2k run'],
    ['after a letter', '2', 'in Q2 the company'],
    ['inside a name that has a digit after it', 'FX-1', 'the FX-10 arm'],
    ['inside a longer word', 'twelve', 'within twelves of weeks'],
    ['at the end of a longer word', 'twelve', 'within untwelve weeks'],
    ['at the start of a longer name', 'Acme', 'the Acmeville plant'],
    ['at the start of a longer word with a letter outside ASCII', 'Zo', `the Zo${String.fromCharCode(0xeb)}trope`],
    ['when it is not there', '13', 'delivery within 12 weeks of an order'],
    ['when it is written differently in the quotation', '12', 'delivery within twelve weeks'],
    ['when the case differs', 'Acme', 'made by acme'],
    ['when it is empty', '', 'delivery within 12 weeks'],
    ['when it is only white space', ' ', 'delivery within 12 weeks'],
  ])('does not find it %s: %s in "%s"', (_why, raw, quote) => {
    expect(valueInQuote(raw, quote)).toBe(false);
  });

  it('reads white space, quotation marks and dashes as the gate does everywhere else', () => {
    const nbsp = String.fromCharCode(0xa0);
    const curly = String.fromCharCode(0x2019);
    const dash = String.fromCharCode(0x2013);
    expect(valueInQuote('12 kg', `Rated payload: 12${nbsp}kg`)).toBe(true);
    expect(valueInQuote('12  kg', 'Rated payload: 12 kg')).toBe(true);
    expect(valueInQuote(`Acme${curly}s`, "Acme's arm")).toBe(true);
    expect(valueInQuote("Acme's", `Acme${curly}s arm`)).toBe(true);
    expect(valueInQuote('FX-1', `the FX${dash}1 arm`)).toBe(true);
  });

  it('finds a value at the very start and at the very end of the quotation', () => {
    expect(valueInQuote('12', '12 weeks')).toBe(true);
    expect(valueInQuote('weeks', '12 weeks')).toBe(true);
  });

  it('treats a letter outside the basic plane as a letter, and a mark that is no letter as an edge', () => {
    const letter = String.fromCodePoint(0x1d4d0);
    expect(valueInQuote('2', `${letter}2`)).toBe(false);
    expect(valueInQuote('2', `${String.fromCodePoint(0x1f916)}2`)).toBe(true);
  });
});
