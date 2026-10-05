import { describe, expect, it } from 'vitest';
import { UNIT_ALIASES } from '../src/normalise';
import { extractTokens, nameTokensOf, toNameToken } from '../src/tokens';

const names = (text: string) => extractTokens(text).names;
const numbers = (text: string) => extractTokens(text).numbers.map((token) => [token.value, token.unit]);
const dates = (text: string) => extractTokens(text).dates.map((token) => token.iso);

describe('extractTokens: the shape of the result', () => {
  it('finds numbers, dates and names in a golden-style sentence', () => {
    const text = 'Fixture Robotics reported a $450 million round, led by Corvane Partners, on 29 September 2026.';
    expect(extractTokens(text)).toEqual({
      numbers: [{ raw: '$450 million', value: '450000000', unit: 'USD' }],
      dates: [{ raw: '29 September 2026', iso: '2026-09-29', precision: 'day' }],
      uncheckable: [],
      names: ['robotics', 'corvane', 'partners'],
      initialWord: 'Fixture',
    });
  });

  it('keeps the raw text, the canonical value and the unit of each number', () => {
    expect(extractTokens('Peak tool speed is 2.3 m/s, and repeatability is 0.05 mm.')).toEqual({
      numbers: [
        { raw: '2.3 m/s', value: '2.3', unit: 'm/s' },
        { raw: '0.05 mm', value: '0.05', unit: 'mm' },
      ],
      dates: [],
      uncheckable: [],
      names: [],
      initialWord: 'Peak',
    });
  });

  it('omits the unit key when a number has no unit', () => {
    expect(extractTokens('It does 1,200 picks an hour.').numbers).toEqual([{ raw: '1,200', value: '1200' }]);
  });

  it('returns four empty lists for a sentence with no tokens', () => {
    expect(extractTokens('the arm moves quickly and quietly.')).toEqual({ numbers: [], dates: [], uncheckable: [], names: [] });
    expect(extractTokens('')).toEqual({ numbers: [], dates: [], uncheckable: [], names: [] });
  });
});

describe('extractTokens: quoted text is left to G5', () => {
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], uncheckable: [], names: ['ceo', 'monday'], initialWord: 'The' });
  });

  it('removes curly-quoted segments too', () => {
    expect(extractTokens('Jane said \u201CAcme ships 500 units\u201D today.').numbers).toEqual([]);
  });

  it('does not treat an unterminated quote as quoted text', () => {
    expect(numbers('He said "stop now 5 kg')).toEqual([['5', 'kg']]);
  });
});

describe('extractTokens: dates are taken before numbers and consumed', () => {
  it('reads a long date as one date and no numbers', () => {
    const tokens = extractTokens('On 24 August 2026 the company shipped.');
    expect(tokens.dates).toEqual([{ raw: '24 August 2026', iso: '2026-08-24', precision: 'day' }]);
    expect(tokens.numbers).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it('reads an ISO date as one date, not as a year and two numbers', () => {
    const tokens = extractTokens('The sale closed on 2026-09-29.');
    expect(tokens.dates).toEqual([{ raw: '2026-09-29', iso: '2026-09-29', precision: 'day' }]);
    expect(tokens.numbers).toEqual([]);
  });

  it.each([
    ['Aug 24, 2026 was the day.', ['2026-08-24']],
    ['It shipped in August 2026.', ['2026-08']],
    ['It shipped in 2026.', ['2026']],
    ['2026 will be the year.', ['2026']],
    ['Between 2025 and 2027 sales doubled.', ['2025', '2027']],
    ['Sales from 2025\u20132027 doubled.', ['2025', '2027']],
    ['Sales from 2025-2027 doubled.', ['2025', '2027']],
    ['It ran from 1 October 2026 to 30 November 2026.', ['2026-10-01', '2026-11-30']],
  ])('finds the dates in %j', (text, expected) => {
    expect(dates(text)).toEqual(expected);
  });

  it('does not consume month names that belong to a date, but reports a loose month name as a name', () => {
    expect(names('On 24 August 2026 the company shipped.')).toEqual([]);
    expect(names('In August the company shipped on Monday.')).toEqual(['august', 'monday']);
  });

  it('leaves an impossible date as numbers, so it cannot be supported by a real date', () => {
    const tokens = extractTokens('It shipped on 31 February 2026.');
    expect(tokens.dates).toEqual([]);
    expect(numbers('It shipped on 31 February 2026.')).toEqual([
      ['31', undefined],
      ['2026', undefined],
    ]);
    expect(tokens.names).toEqual(['february']);
  });

  it('does not find a date inside a code or a word', () => {
    expect(dates('The FX2026 model and the 2026x model.')).toEqual([]);
    expect(extractTokens('The FX2026 model and the 2026x model.').names).toEqual(['fx2026', '2026x']);
  });

  it('reads a four-digit number as a date only when it is a bare year', () => {
    expect(dates('It lifts 2000 kg.')).toEqual([]);
    expect(numbers('It lifts 2000 kg.')).toEqual([['2000', 'kg']]);
    expect(dates('It costs $2000.')).toEqual([]);
    expect(numbers('It costs $2000.')).toEqual([['2000', 'USD']]);
    expect(dates('It sold 1,200 units.')).toEqual([]);
    expect(dates('It sold 2.5 million units.')).toEqual([]);
    expect(dates('It grew 2026.5 percent.')).toEqual([]);
    expect(dates('It sold 1899 units.')).toEqual([]);
    expect(numbers('It sold 1899 units.')).toEqual([['1899', undefined]]);
  });
});

describe('extractTokens: numbers', () => {
  it.each([
    ['It does 1,200 picks an hour.', [['1200', undefined]]],
    ['It does 1.2k picks an hour.', [['1200', undefined]]],
    ['It lifts 12 kg.', [['12', 'kg']]],
    ['It lifts 12 kilograms at full reach.', [['12', 'kg']]],
    ['It moves at 2.3 m/s.', [['2.3', 'm/s']]],
    ['It moves at 2.3 metres per second.', [['2.3', 'm/s']]],
    ['Cycle time fell 18% in a month.', [['18', '%']]],
    ['Cycle time fell 18 per cent in a month.', [['18', '%']]],
    ['It raised $450 million.', [['450000000', 'USD']]],
    ['It raised $450M.', [['450000000', 'USD']]],
    ['It raised USD 450 million.', [['450000000', 'USD']]],
    ['It draws 650 W and 48 V.', [['650', 'W'], ['48', 'V']]],
    ['A 6 DoF arm that runs at 100Hz.', [['6', 'DoF'], ['100', 'Hz']]],
    ['It reaches 1.4 m and weighs 38 kg.', [['1.4', 'm'], ['38', 'kg']]],
    ['It lifts 5\u201310 kg.', [['5', undefined], ['10', 'kg']]],
    ['A 12-kg arm.', [['12', undefined]]],
    ['It sold 40 of them.', [['40', undefined]]],
    ['(40 units)', [['40', undefined]]],
    ['It ships 5 million units.', [['5000000', undefined]]],
  ])('finds the numbers in %j', (text, expected) => {
    expect(numbers(text)).toEqual(expected);
  });

  it('prefers the longest unit when scanning, so m/s is not read as m and km/h is not read as km', () => {
    expect(numbers('At 2.3 m/s.')).toEqual([['2.3', 'm/s']]);
    expect(numbers('At 12 km/h.')).toEqual([['12', 'km/h']]);
    expect(numbers('For 5 mins.')).toEqual([['5', 'min']]);
  });

  it('does not read digits inside a name or an alphanumeric code as numbers', () => {
    expect(numbers('The FX-1 shipped.')).toEqual([]);
    expect(numbers('The H1 results and the B2B market.')).toEqual([]);
    expect(numbers('A COVID-19 delay and the Q3 plan.')).toEqual([]);
    expect(numbers('The model-2 arm.')).toEqual([]);
    expect(numbers('The 5G rollout and 3D vision.')).toEqual([]);
    expect(numbers('Its 2nd plant.')).toEqual([]);
  });

  it('treats a number that is joined to an unknown unit as a name', () => {
    expect(extractTokens('Its 5G rollout and 3D vision.').names).toEqual(['5g', '3d']);
  });

  it('reads every unit the table knows, with or without a space', () => {
    for (const [alias, unit] of Object.entries(UNIT_ALIASES)) {
      expect(numbers(`It is 7 ${alias}.`), alias).toEqual([['7', unit]]);
    }
  });
});

describe('extractTokens: numbers written in words', () => {
  it.each([
    ['The arm lifts twelve kilograms at full reach.', [['12', 'kg']]],
    ['It lifts twelve kg.', [['12', 'kg']]],
    ['It has twenty-five arms.', [['25', undefined]]],
    ['It has twenty five arms.', [['25', undefined]]],
    ['It shipped two hundred arms.', [['200', undefined]]],
    ['It shipped two hundred and fifty arms.', [['250', undefined]]],
    ['It shipped three million parts.', [['3000000', undefined]]],
    ['It shipped five thousand parts.', [['5000', undefined]]],
    ['It shipped a dozen arms.', [['12', undefined]]],
    ['It shipped two dozen arms.', [['24', undefined]]],
    ['It shipped a hundred arms.', [['100', undefined]]],
    ['Output rose by one percent.', [['1', '%']]],
    ['Output rose by eighteen per cent.', [['18', '%']]],
    ['It moves at two metres per second.', [['2', 'm/s']]],
    ['It has a six-axis arm.', [['6', undefined]]],
    ['It shipped 5 arms and ten more.', [['5', undefined], ['10', undefined]]],
    ['It shipped five arms or six arms.', [['5', undefined], ['6', undefined]]],
  ])('finds the numbers in %j', (text, expected) => {
    expect(numbers(text)).toEqual(expected);
  });

  it('keeps the words as written in the raw text, and reads a unit only in the spelling the table knows', () => {
    expect(extractTokens('It lifts Twelve Kilograms.').numbers).toEqual([{ raw: 'Twelve', value: '12' }]);
    expect(extractTokens('It lifts Twelve kilograms.').numbers).toEqual([{ raw: 'Twelve kilograms', value: '12', unit: 'kg' }]);
    expect(extractTokens('It shipped two hundred and fifty arms.').numbers).toEqual([{ raw: 'two hundred and fifty', value: '250' }]);
  });

  it('reads "one" as a number only inside a longer number or in front of a unit', () => {
    expect(numbers('One of the plants shipped it, and no one knew which one.')).toEqual([]);
    expect(numbers('It shipped one hundred arms and twenty-one more.')).toEqual([['100', undefined], ['21', undefined]]);
    expect(numbers('Output rose one percent.')).toEqual([['1', '%']]);
  });

  it('does not report a number word as a name, and does not report a first word that is a number word', () => {
    const tokens = extractTokens('Twelve kilograms is the payload.');
    expect(tokens.numbers).toEqual([{ raw: 'Twelve kilograms', value: '12', unit: 'kg' }]);
    expect(tokens.names).toEqual([]);
    expect(tokens).not.toHaveProperty('initialWord');
    expect(names('Shipments of Twelve arms rose.')).toEqual([]);
  });

  it('keeps "One" at the start of a sentence as the first word, which is an ordinary opening word', () => {
    expect(extractTokens('One of the plants shipped it.').initialWord).toBe('One');
  });

  it('does not read a number word inside another word, or at the end of a hyphenated word', () => {
    expect(numbers('Someone with a high-five, a top-ten list and the tenth plant.')).toEqual([]);
  });

  it('leaves the unit key out of a number in words that has no unit', () => {
    expect(Object.keys(extractTokens('It shipped twelve arms.').numbers[0]!)).toEqual(['raw', 'value']);
    expect(Object.keys(extractTokens('It shipped twelve kilograms.').numbers[0]!)).toEqual(['raw', 'value', 'unit']);
  });

  it('reads digits first and words after them, and leaves quoted words to G5', () => {
    expect(numbers('Jane said "twelve arms" and 5 arms and ten more.')).toEqual([['5', undefined], ['10', undefined]]);
  });

  it('reads a number in words before it can be mistaken for a date', () => {
    const tokens = extractTokens('Between 2025 and twenty arms.');
    expect(tokens.dates.map((date) => date.iso)).toEqual(['2025']);
    expect(tokens.numbers.map((number) => number.value)).toEqual(['20']);
  });
});

describe('extractTokens: amounts that cannot be checked', () => {
  const uncheckable = (text: string) => extractTokens(text).uncheckable;

  it.each([
    ['Output doubled last year.', ['doubled']],
    ['Output has half the range.', ['half']],
    ['Output rose twice as fast.', ['twice']],
    ['Output rose tenfold.', ['tenfold']],
    ['Output rose ten-fold.', ['ten-fold']],
    ['Output tripled and then quadrupled.', ['tripled', 'quadrupled']],
    ['Output is halved.', ['halved']],
    ['It shipped five five arms.', ['five five']],
  ])('lists the words of %j', (text, expected) => {
    expect(uncheckable(text)).toEqual(expected);
  });

  it('does not read them as numbers or as names', () => {
    const tokens = extractTokens('Output rose tenfold, then Doubled.');
    expect(tokens.numbers).toEqual([]);
    expect(tokens.names).toEqual([]);
    expect(tokens.uncheckable).toEqual(['tenfold', 'doubled']);
  });

  it('lists each word once, in lowercase', () => {
    expect(uncheckable('Doubled and doubled, then DOUBLED, then half.')).toEqual(['doubled', 'half']);
  });

  it('lowercases a run of number words that is not a number, too', () => {
    expect(uncheckable('It shipped Five Five arms.')).toEqual(['five five']);
  });

  it('lists nothing for a sentence with no such word', () => {
    expect(uncheckable('It shipped twelve arms to a halfway house.')).toEqual([]);
  });

  it('leaves quoted words to G5', () => {
    expect(uncheckable('Jane said "it doubled" today.')).toEqual([]);
  });
});

describe('extractTokens: names', () => {
  it('exempts the first word of the sentence, whatever it is', () => {
    expect(names('Acme ships arms.')).toEqual([]);
    expect(names('Ships Acme arms.')).toEqual(['acme']);
    expect(names('Shipments of Acme arms rose.')).toEqual(['acme']);
  });

  it('exempts nothing when the sentence starts with a number or a date', () => {
    expect(names('24 August 2026, Fixture shipped it.')).toEqual(['fixture']);
    expect(names('12 kg Acme arms.')).toEqual(['acme']);
  });

  it('keeps each word of a multi-word name as its own token', () => {
    expect(names('Shipments by Brindle Logistics and Corvane Partners rose.')).toEqual([
      'brindle',
      'logistics',
      'corvane',
      'partners',
    ]);
  });

  it('lowercases names and strips a trailing possessive and surrounding punctuation', () => {
    expect(names('Shipments of Fixture\u2019s arms, (Acme) and Brindle\u2019s plant rose.')).toEqual([
      'fixture',
      'acme',
      'brindle',
    ]);
    expect(names("Sales of the arms by Fixture' rose.")).toEqual(['fixture']);
  });

  it('lists a name once, however often it appears', () => {
    expect(names('Shipments by Acme and Acme\u2019s rival Acme rose.')).toEqual(['acme']);
  });

  it('treats acronyms, products and alphanumeric mixes as names', () => {
    expect(names('Orders for the FX-1 and the H1 and ISO rules rose.')).toEqual(['fx-1', 'h1', 'iso']);
    expect(names('The CEO and CTO met.')).toEqual(['ceo', 'cto']);
    expect(names('The B2B market grew.')).toEqual(['b2b']);
  });

  it('treats a dotted abbreviation as the same name as its plain form', () => {
    expect(names('Sales in the U.S. and the U.K. rose.')).toEqual(['us', 'uk']);
  });

  it('does not treat lowercase words as names', () => {
    expect(names('the arm moves with the load and the speed.')).toEqual([]);
  });

  it('reads accented capitals', () => {
    expect(names('Plants in \u00C9vry and Z\u00FCrich opened.')).toEqual(['\u00E9vry', 'z\u00FCrich']);
  });

  it('treats an en or em dash as a separator, so a name glued on with a dash is still seen', () => {
    expect(names('The arms\u2014Fixture ships them.')).toEqual(['fixture']);
    expect(names('The arms\u2013Fixture ships them.')).toEqual(['fixture']);
  });

  it('still sees a name that is joined to a number or a date by a slash', () => {
    expect(names('The 12 kg/Fixture ratio rose.')).toEqual(['fixture']);
    expect(names('The 2026/Fixture plan rose.')).toEqual(['fixture']);
  });

  it('does not report the unit of a number as a name', () => {
    expect(names('It draws 650 W at 48 V and 2 Ah with 6 DoF and 100 Hz and 1.2 kW.')).toEqual([]);
  });

  it('is deliberately strict: a capitalised ordinary word is reported as a name', () => {
    // False positives send the draft to revision; they never publish it.
    expect(names('Shipments rose, Analysts said.')).toEqual(['analysts']);
    expect(names('The Arm shipped.')).toEqual(['arm']);
  });

  it('cannot see a name that starts with a lowercase letter (iRobot, xAI)', () => {
    // A known gap that the model verifier (G10) covers.
    expect(names('Shipments by iRobot and xAI rose.')).toEqual([]);
  });
});

describe('extractTokens: the first word', () => {
  const initial = (text: string) => extractTokens(text).initialWord;

  it.each([
    ['Harlow Logistics plans a plant.', 'Harlow'],
    ['Shipments began in the spring.', 'Shipments'],
    ['The arm shipped.', 'The'],
    ['However, the arm shipped.', 'However'],
    ['CEO Jane Doe resigned.', 'CEO'],
    ['FX-1 arms shipped.', 'FX-1'],
    ['H1 results rose.', 'H1'],
    ['(Fixture) arms shipped.', 'Fixture'],
    ["Brindle's plant opened.", "Brindle's"],
    ['A plant opened.', 'A'],
  ])('reports the first word of %j, as written: %j', (text, expected) => {
    expect(initial(text)).toBe(expected);
  });

  it.each([
    ['shipments began in the spring.'],
    ['iRobot opened a plant.'],
    ['24 August 2026, Fixture shipped it.'],
    ['12 kg Acme arms.'],
    ['$450 million was raised.'],
    ['2026 will be the year.'],
    ['"Quoted words," said Jane.'],
    [''],
    ['...'],
  ])('reports no first word for %j', (text) => {
    expect(extractTokens(text)).not.toHaveProperty('initialWord');
  });

  it('keeps the first word out of the list of names, which starts at the second word', () => {
    const tokens = extractTokens('Harlow Logistics plans a plant.');
    expect(tokens.initialWord).toBe('Harlow');
    expect(tokens.names).toEqual(['logistics']);
  });

  it('reads the first word after the quoted passage is taken out', () => {
    expect(initial('"We shipped," Harlow said.')).toBe('Harlow');
  });
});

describe('toNameToken', () => {
  it.each([
    ['Fixture', 'fixture'],
    ["Fixture's", 'fixture'],
    ['FX-1', 'fx-1'],
    ['U.S', 'us'],
    ['U.K', 'uk'],
    ["O'Neil", "o'neil"],
    ['Z\u00FCrich', 'z\u00FCrich'],
    ['A.I', 'ai'],
  ])('turns %j into %j', (word, expected) => {
    expect(toNameToken(word)).toBe(expected);
  });
});

describe('nameTokensOf', () => {
  it.each([
    ['Brindle Logistics', ['brindle', 'logistics']],
    ['FX-1', ['fx-1']],
    ['Dana Whitcombe', ['dana', 'whitcombe']],
    ['Robotics of Tomorrow, Inc.', ['robotics', 'of', 'tomorrow', 'inc']],
    ['U.S. Department', ['us', 'department']],
    ['', []],
  ])('lists the tokens of the name value %j', (value, expected) => {
    expect(nameTokensOf(value)).toEqual(expected);
  });
});
