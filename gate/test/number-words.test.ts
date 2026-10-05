import { describe, expect, it } from 'vitest';
import { UNIT_ALIASES } from '../src/normalise';
import { NUMBER_WORD_SOURCE, UNCHECKABLE_SOURCE, readNumberWords } from '../src/number-words';

const phrases = (text: string): string[] => [...text.matchAll(new RegExp(NUMBER_WORD_SOURCE, 'gu'))].map((match) => match[0]);
const uncheckable = (text: string): string[] => [...text.matchAll(new RegExp(UNCHECKABLE_SOURCE, 'gu'))].map((match) => match[0]);
const read = (phrase: string) => readNumberWords(phrase);
const valueOf = (phrase: string) => {
  const reading = read(phrase);
  return reading.kind === 'number' ? reading.value : reading.kind;
};

describe('readNumberWords: the value of a phrase', () => {
  it.each([
    ['two', '2'],
    ['nine', '9'],
    ['ten', '10'],
    ['twelve', '12'],
    ['nineteen', '19'],
    ['twenty', '20'],
    ['forty', '40'],
    ['ninety', '90'],
    ['twenty-five', '25'],
    ['twenty five', '25'],
    ['ninety-nine', '99'],
    ['twenty-one', '21'],
    ['hundred', '100'],
    ['a hundred', '100'],
    ['one hundred', '100'],
    ['two hundred', '200'],
    ['two hundred and fifty', '250'],
    ['two hundred fifty', '250'],
    ['nine hundred ninety-nine', '999'],
    ['a hundred and one', '101'],
    ['nineteen hundred', '1900'],
    ['thousand', '1000'],
    ['a thousand', '1000'],
    ['one thousand', '1000'],
    ['five thousand', '5000'],
    ['twenty-five thousand', '25000'],
    ['two hundred thousand', '200000'],
    ['two thousand five hundred', '2500'],
    ['two thousand and five', '2005'],
    ['million', '1000000'],
    ['a million', '1000000'],
    ['three million', '3000000'],
    ['three million two hundred thousand', '3200000'],
    ['a billion', '1000000000'],
    ['two billion', '2000000000'],
    ['dozen', '12'],
    ['a dozen', '12'],
    ['one dozen', '12'],
    ['two dozen', '24'],
    ['twenty dozen', '240'],
    ['Twelve', '12'],
    ['TWELVE', '12'],
    ['Twenty-Five', '25'],
  ])('reads %j as %s', (phrase, expected) => {
    expect(valueOf(phrase)).toBe(expected);
  });

  it('reads a unit after the words, in its canonical form', () => {
    expect(read('twelve kilograms')).toEqual({ kind: 'number', value: '12', unit: 'kg' });
    expect(read('twelve kg')).toEqual({ kind: 'number', value: '12', unit: 'kg' });
    expect(read('two hundred metres per second')).toEqual({ kind: 'number', value: '200', unit: 'm/s' });
    expect(read('eighteen per cent')).toEqual({ kind: 'number', value: '18', unit: '%' });
    expect(read('eighteen percent')).toEqual({ kind: 'number', value: '18', unit: '%' });
    expect(read('three million tonnes')).toEqual({ kind: 'number', value: '3000000', unit: 'tonne' });
  });

  it('reads every unit of the table after the words', () => {
    for (const [alias, unit] of Object.entries(UNIT_ALIASES)) {
      expect(read(`seven ${alias}`), alias).toEqual({ kind: 'number', value: '7', unit });
    }
  });

  it('leaves the unit key out when there is none', () => {
    expect(read('twelve')).toStrictEqual({ kind: 'number', value: '12' });
  });

  it('ignores spaces around the phrase and extra spaces inside it', () => {
    expect(read('  twenty   five  kg ')).toEqual({ kind: 'number', value: '25', unit: 'kg' });
  });

  it('reads "one" as a number only when a unit follows', () => {
    expect(read('one percent')).toEqual({ kind: 'number', value: '1', unit: '%' });
    expect(read('One per cent')).toEqual({ kind: 'number', value: '1', unit: '%' });
    expect(read('one kg')).toEqual({ kind: 'number', value: '1', unit: 'kg' });
    expect(read('one')).toEqual({ kind: 'plain' });
    expect(read('One')).toEqual({ kind: 'plain' });
  });

  it('says "plain" for text that is not a number in words at all', () => {
    expect(read('plants')).toEqual({ kind: 'plain' });
    expect(read('hundred and')).toEqual({ kind: 'plain' });
    expect(read('a twenty')).toEqual({ kind: 'plain' });
    expect(read('')).toEqual({ kind: 'plain' });
  });

  it('reads "one" inside a longer number as part of it', () => {
    expect(valueOf('twenty-one')).toBe('21');
    expect(valueOf('one hundred')).toBe('100');
    expect(valueOf('one thousand')).toBe('1000');
    expect(valueOf('a hundred and one')).toBe('101');
  });

  it.each([
    ['five five'],
    ['one two'],
    ['twenty twenty'],
    ['hundred hundred'],
    ['thousand million'],
    ['thousand thousand'],
    ['five dozen thousand'],
    ['twenty dozen six'],
    ['dozen two'],
    ['hundred dozen'],
    ['two three dozen'],
    ['ten twenty'],
  ])('does not read %j as a number, because it is not a well-formed cardinal', (phrase) => {
    expect(read(phrase)).toEqual({ kind: 'uncheckable' });
  });
});

describe('NUMBER_WORD_SOURCE: where a number in words is found', () => {
  it('finds a number in words with its unit', () => {
    expect(phrases('The arm lifts twelve kilograms at full reach.')).toEqual(['twelve kilograms']);
    expect(phrases('It raised eighteen per cent more.')).toEqual(['eighteen per cent']);
  });

  it('finds the longest phrase', () => {
    expect(phrases('It shipped two hundred and fifty arms.')).toEqual(['two hundred and fifty']);
    expect(phrases('It shipped twenty-five arms and twenty five more.')).toEqual(['twenty-five', 'twenty five']);
    expect(phrases('It shipped three million two hundred thousand parts.')).toEqual(['three million two hundred thousand']);
  });

  it('finds a number in any case', () => {
    expect(phrases('Twelve arms and TWELVE more and tWeLvE too.')).toEqual(['Twelve', 'TWELVE', 'tWeLvE']);
  });

  it('finds "a hundred", "a thousand", "a million" and "a dozen", but not another "a"', () => {
    expect(phrases('It shipped a hundred, a dozen, a thousand and a million.')).toEqual(['a hundred', 'a dozen', 'a thousand', 'a million']);
    expect(phrases('It shipped a plant and a second site.')).toEqual([]);
  });

  it('keeps "and" inside a number only after hundred, thousand, million or billion', () => {
    expect(phrases('Between five and ten arms.')).toEqual(['five', 'ten']);
    expect(phrases('Two hundred and ten arms.')).toEqual(['Two hundred and ten']);
    expect(phrases('Two and three arms.')).toEqual(['Two', 'three']);
  });

  it('keeps the words apart when they are separated by a comma or a word', () => {
    expect(phrases('Five, six and seven arms.')).toEqual(['Five', 'six', 'seven']);
    expect(phrases('Five or six arms.')).toEqual(['Five', 'six']);
  });

  it('does not find number words inside other words', () => {
    expect(phrases('Someone was alone with the tenant, a wonderful stone phone.')).toEqual([]);
    expect(phrases('Ninety-nine and ninetieth and eighteenth.')).toEqual(['Ninety-nine']);
    expect(phrases('Hundreds of arms, thousands of picks, millions of parts and dozens of plants.')).toEqual([]);
    expect(phrases('A tenfold rise.')).toEqual([]);
    expect(phrases('The pontoon, the twelfth and the fivesome.')).toEqual([]);
  });

  it('does not find a number word that is the tail of a hyphenated word', () => {
    expect(phrases('A high-five and a top-ten list.')).toEqual([]);
  });

  it('finds a number word before a hyphen, as the digits are found in "6-axis"', () => {
    expect(phrases('A six-axis arm and a two-finger gripper.')).toEqual(['six', 'two']);
  });

  it('finds "one" so that the reader of the phrase can decide, and attaches a unit to it', () => {
    expect(phrases('One of the plants ran one percent faster.')).toEqual(['One', 'one percent']);
  });

  it('attaches a unit only after a space, and only a unit the table knows', () => {
    expect(phrases('Twelve kg, twelve kilograms, twelve-kg and twelve plants.')).toEqual(['Twelve kg', 'twelve kilograms', 'twelve', 'twelve']);
    expect(phrases('Twelve KG.')).toEqual(['Twelve']);
  });

  it('does not attach the start of a longer word as a unit', () => {
    expect(phrases('Twelve minutes ago, twelve mins ago, twelve mile, twelve milestones.')).toEqual([
      'Twelve minutes',
      'twelve mins',
      'twelve mile',
      'twelve',
    ]);
  });
});

describe('UNCHECKABLE_SOURCE: words that state an amount with no number to check', () => {
  it.each([
    'half',
    'Half',
    'halve',
    'halves',
    'halved',
    'halving',
    'twice',
    'Twice',
    'thrice',
    'double',
    'doubles',
    'doubled',
    'doubling',
    'triple',
    'triples',
    'tripled',
    'tripling',
    'quadruple',
    'quadruples',
    'quadrupled',
    'quadrupling',
    'twofold',
    'tenfold',
    'ten-fold',
    'Tenfold',
    'twentyfold',
    'hundredfold',
    'thousandfold',
    'millionfold',
  ])('finds %j', (word) => {
    expect(uncheckable(`Output ${word} last year.`)).toEqual([word]);
  });

  it('finds every one in a sentence, in order', () => {
    expect(uncheckable('Output doubled, then half of it tripled twice.')).toEqual(['doubled', 'half', 'tripled', 'twice']);
  });

  it.each(['halfway', 'doubtful', 'tripod', 'doublet', 'halfhearted', 'manifold', 'onefold', 'folded', 'fold', 'triplet', 'halls', 'twiceborn'])(
    'does not find %j',
    (word) => {
      expect(uncheckable(`Output ${word} last year.`)).toEqual([]);
    },
  );

  it('finds "half" next to a hyphen, because "half-year" is still half of something', () => {
    expect(uncheckable('A half-year result.')).toEqual(['half']);
  });
});
