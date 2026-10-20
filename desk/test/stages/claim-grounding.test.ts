import { BASES, ClaimSpan, SENTENCE_STARTERS, defaultConfig as gateDefaults } from '@robywire/gate';
import type { Basis, ClaimValue } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { extractPage } from '../../src/fetch/extract-text';
import type { SourceKind } from '../../src/sources';
import { ALLOWED_BASES, CLAIM_PROBLEM_CODES, COMMON_WORDS, MAX_LABEL_WORDS, MAX_QUOTE_LENGTH, claimProblems, locateQuote, normalisedMismatch, shortenLabel } from '../../src/stages/claim-grounding';
import type { ClaimCandidate } from '../../src/stages/claim-grounding';
import { URLS } from '../support/context';
import { fixtureText } from '../support/fixtures';

// A model that is asked for claims will sometimes invent a quotation, a figure or a name. These are the checks that
// code applies to every claim it returns: the quotation must be in the page, and nothing the claim says may go beyond
// the quotation. The tests run them on the text of the made-up release page of Fixture Robotics.

const PAGE = extractPage(fixtureText('pages/fixture-robotics-fx-1-second-plant.html'), URLS.release).text;
const LINE = PAGE.split('\n');
const ALLOW = new Set(['october', 'november', 'ceo']);

const name = (raw: string): ClaimValue => ({ kind: 'name', raw, normalised: raw.toLowerCase() });
const number = (raw: string, normalised: string, unit?: string): ClaimValue => (unit === undefined ? { kind: 'number', raw, normalised } : { kind: 'number', raw, normalised, unit });

/** A claim that passes every check against the release page, from a company's newsroom. A test changes one thing in it. */
function clean(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 12 weeks of an order.',
    label: 'per arm',
    quote: LINE[4] as string,
    values: [number('$38,000', '38000', 'USD'), number('12', '12'), name('Fixture Robotics'), name('FX-1')],
    basis: 'press-release',
    ...overrides,
  };
}

const codesOf = (claim: ClaimCandidate, kind: SourceKind = 'company-newsroom', page = PAGE): string[] => claimProblems(claim, page, kind, ALLOW).map((problem) => problem.code);

describe('locateQuote', () => {
  it('finds a passage and gives its offsets in the text of the page', () => {
    const quote = LINE[3] as string;
    const found = locateQuote(PAGE, quote);
    expect(found).not.toBeNull();
    expect(PAGE.slice(found?.start, found?.end)).toBe(quote);
    expect(found?.start).toBe(PAGE.indexOf(quote));
  });

  it('finds a passage that is a part of a line', () => {
    const found = locateQuote(PAGE, 'needs no new safety cage');
    expect(PAGE.slice(found?.start, found?.end)).toBe('needs no new safety cage');
  });

  it('reads a run of white space of either text as one space, and gives the offsets of the page as it is', () => {
    const page = 'The FX-1  mounts on\n   existing conveyor\tframes.';
    const found = locateQuote(page, 'mounts on existing  conveyor frames');
    expect(page.slice(found?.start, found?.end)).toBe('mounts on\n   existing conveyor\tframes');
  });

  it('reads a no-break space as a space', () => {
    const page = `needs${String.fromCharCode(0xa0)}no new cage`;
    expect(locateQuote(page, 'needs no new cage')).toEqual({ start: 0, end: page.length });
  });

  it('leaves out the white space at the two ends of the quotation', () => {
    const found = locateQuote(PAGE, '  \n Tarnmoor is due to receive 60 arms by 30 November 2026.\t ');
    expect(PAGE.slice(found?.start, found?.end)).toBe('Tarnmoor is due to receive 60 arms by 30 November 2026.');
  });

  it('finds a quotation that runs over the end of a line', () => {
    const quote = `${LINE[5]} ${LINE[6]}`;
    const found = locateQuote(PAGE, quote);
    expect(PAGE.slice(found?.start, found?.end)).toBe(`${LINE[5]}\n${LINE[6]}`);
  });

  it('reads curly quotation marks, curly apostrophes and long dashes as the plain characters, and still returns the page as it is', () => {
    const page = `The company${String.fromCharCode(0x2019)}s arm ${String.fromCharCode(0x2013)} the FX-1 ${String.fromCharCode(0x2013)} said ${String.fromCharCode(0x201c)}ready${String.fromCharCode(0x201d)}.`;
    const found = locateQuote(page, `company's arm - the FX-1 - said "ready".`);
    expect(page.slice(found?.start, found?.end)).toBe(page.slice(4));
  });

  it('takes the first of two places where the same passage stands', () => {
    const page = 'FX-1 arms ship. Later, FX-1 arms ship.';
    expect(locateQuote(page, 'FX-1 arms ship.')).toEqual({ start: 0, end: 15 });
  });

  it('counts offsets in the characters of the page even after a character outside the basic plane', () => {
    const page = `${String.fromCodePoint(0x1f916)} FX-1 arms ship.`;
    const found = locateQuote(page, 'FX-1 arms ship.');
    expect(page.slice(found?.start, found?.end)).toBe('FX-1 arms ship.');
  });

  it('does not find a passage in a different case, or one that is not there, or a part of a word that is not the whole passage', () => {
    expect(locateQuote(PAGE, 'tarnmoor is due to receive 60 arms')).toBeNull();
    expect(locateQuote(PAGE, 'Tarnmoor is due to receive 70 arms')).toBeNull();
    expect(locateQuote(PAGE, 'Tarnmoor is due to receive 60 arms by 30 November 2026. And more.')).toBeNull();
  });

  it('does not read white space away: a space that the page has is a space that the quotation needs, and one that it lacks is one the quotation may not have', () => {
    expect(locateQuote('The FX-1 arm', 'The FX-1arm')).toBeNull();
    expect(locateQuote('The FX-1arm', 'The FX-1 arm')).toBeNull();
    expect(locateQuote('ab', 'a b')).toBeNull();
    expect(locateQuote('a b', 'ab')).toBeNull();
    expect(locateQuote('a b', 'a b')).toEqual({ start: 0, end: 3 });
  });

  it('finds nothing for a quotation that is empty or only white space', () => {
    expect(locateQuote(PAGE, '')).toBeNull();
    expect(locateQuote(PAGE, ' \n\t ')).toBeNull();
    expect(locateQuote('', 'x')).toBeNull();
  });

  it('finds a passage at the very end of a long page', () => {
    const page = `${'word '.repeat(200_000)}the last words`;
    const found = locateQuote(page, 'the  last words');
    expect(page.slice(found?.start, found?.end)).toBe('the last words');
  });
});

describe('MAX_QUOTE_LENGTH', () => {
  it('is the longest quotation that the claim schema and the gate allow', () => {
    expect(MAX_QUOTE_LENGTH).toBe(300);
    expect(MAX_QUOTE_LENGTH).toBe(gateDefaults().spanMax);
    expect(ClaimSpan.safeParse({ start: 0, end: 300, quote: 'x'.repeat(300) }).success).toBe(true);
    expect(ClaimSpan.safeParse({ start: 0, end: 301, quote: 'x'.repeat(301) }).success).toBe(false);
  });
});

describe('claimProblems: a clean claim', () => {
  it('has no problem', () => {
    expect(claimProblems(clean(), PAGE, 'company-newsroom', ALLOW)).toEqual([]);
  });

  it('has none when the quotation is the page as it is written but with its white space changed', () => {
    expect(codesOf(clean({ quote: `${LINE[4]}`.replace(/ /g, '  ') }))).toEqual([]);
  });

  it('has none when its text says a figure as the quotation does in other words (12 kg and 12 kilograms, twelve and 12)', () => {
    const page = 'The arm is rated for a payload of 12 kilograms at full reach.';
    const claim = clean({ text: 'The arm is rated for a payload of twelve kg.', label: 'payload', quote: page, values: [number('12 kilograms', '12', 'kg')], basis: 'datasheet' });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });

  it('has none when its text gives a figure without the unit that the quotation gives it with', () => {
    const page = 'The arm is rated for a payload of 12 kilograms, and lists from $38,000.';
    const claim = clean({ text: 'The arm is rated for a payload of 12, and lists from 38,000.', label: 'payload', quote: page, values: [], basis: 'datasheet' });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });

  it('has none when its text names a month on the allow-list and a date that the quotation gives in full', () => {
    const claim = clean({ text: 'Tarnmoor is due to receive arms in November 2026.', label: 'arms due', quote: LINE[5] as string, values: [name('Tarnmoor')], basis: 'press-release' });
    expect(codesOf(claim)).toEqual([]);
  });

  it('has none when its text opens with a plain word that the quotation does not contain', () => {
    expect(codesOf(clean({ text: 'This lists the FX-1 from $38,000.' }))).toEqual([]);
  });
});

describe('claimProblems: the quotation', () => {
  it('drops a claim whose quotation is not on the page', () => {
    expect(codesOf(clean({ quote: 'Fixture Robotics lists the FX-1 from $28,000 per arm.' }))).toEqual(['quote-not-found']);
  });

  it('gives the other checks no say when the quotation is not on the page: they read the quotation, and there is none', () => {
    const claim = clean({ text: 'Harlow Logistics bought 900 arms.', label: 'Harlow order', quote: 'Harlow Logistics bought 900 arms.', values: [number('900', '900')], basis: 'datasheet' });
    expect(codesOf(claim)).toEqual(['quote-not-found']);
  });

  it('still says that the basis is wrong when the quotation is not on the page', () => {
    expect(codesOf(clean({ quote: 'Not on the page.', basis: 'filing' }))).toEqual(['quote-not-found', 'basis-not-allowed']);
  });

  it('drops a claim whose quotation is only white space', () => {
    expect(codesOf(clean({ quote: '   ' }))).toEqual(['quote-not-found']);
  });

  it('allows a quotation of exactly 300 characters and drops one of 301', () => {
    const page = `${'x'.repeat(301)} end`;
    const claim = (length: number) => clean({ text: 'The arm.', label: 'the', quote: 'x'.repeat(length), values: [] });
    expect(codesOf(claim(300), 'company-newsroom', page)).toEqual([]);
    expect(codesOf(claim(301), 'company-newsroom', page)).toEqual(['quote-too-long']);
  });

  it('measures the passage as the page has it, so a quotation that is short only because the page pads it with white space is too long', () => {
    const page = `first${' '.repeat(400)}second`;
    const claim = clean({ text: 'The arm.', label: 'first', quote: 'first second', values: [] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual(['quote-too-long']);
  });

  it('shows a quotation of 80 characters whole, and one of 81 cut at 80 with three dots', () => {
    const eighty = `${'abcdefghi '.repeat(8)}`.slice(0, 80);
    expect(eighty).toHaveLength(80);
    expect(claimProblems(clean({ quote: eighty }), PAGE, 'company-newsroom', ALLOW)[0]?.message).toBe(`the quotation is not on the page: "${eighty}"`);
    expect(claimProblems(clean({ quote: `${eighty}z` }), PAGE, 'company-newsroom', ALLOW)[0]?.message).toBe(`the quotation is not on the page: "${eighty}..."`);
  });

  it('says in words what is wrong and shows the start of the quotation', () => {
    const [problem] = claimProblems(clean({ quote: `Not on the page, ${'and so on '.repeat(30)}` }), PAGE, 'company-newsroom', ALLOW);
    expect(problem?.message).toMatch(/^the quotation is not on the page: "Not on the page, and so on/);
    expect((problem?.message ?? '').length).toBeLessThan(200);
  });
});

describe('normalisedMismatch: what a value says about itself and what its raw text says', () => {
  const date = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
  const named = (raw: string, normalised: string): ClaimValue => ({ kind: 'name', raw, normalised });

  it.each([
    ['a plain number', number('12', '12')],
    ['a number with a unit written as the table has it', number('12 kg', '12', 'kg')],
    ['a unit that is another spelling of the canonical one, in the raw text and in the unit field', number('12 kilograms', '12', 'kilograms')],
    ['a number with a thousands comma, normalised as a plain decimal', number('1,200', '1200')],
    ['a number with a magnitude letter', number('1.2k', '1200')],
    ['a number with a magnitude word', number('3 million', '3000000')],
    ['a decimal', number('2.30', '2.3')],
    ['a sum of money, whose unit is its currency', number('$38,000', '38000', 'USD')],
    ['a sum of money with a magnitude', number('$1.5 billion', '1500000000', 'USD')],
    ['a percentage', number('3 percent', '3', '%')],
    ['a number in words', number('twelve', '12')],
    ['a number in words with a unit', number('twelve kilograms', '12', 'kg')],
    ['a number in words with a hyphen and a scale', number('twenty-five thousand', '25000')],
    ['a normalised form that has a comma, which the gate reads as the number it is', number('1200', '1,200')],
    ['a day', date('1 October 2026', '2026-10-01')],
    ['a day in the other order, and in ISO form', date('October 1, 2026', '2026-10-01')],
    ['a date that is an ISO date already', date('2026-10-01', '2026-10-01')],
    ['a month', date('October 2026', '2026-10')],
    ['a year', date('2027', '2027')],
    ['a name', named('Brindle Logistics', 'brindle logistics')],
    ['a name with a hyphen and a digit', named('FX-1', 'fx-1')],
    ['a name with a run of white space, folded to one space', named('Brindle  \n Logistics', 'brindle logistics')],
    ['a name with white space at its edges, which is no part of it', named(' Brindle Logistics\n', 'brindle logistics')],
  ] as [string, ClaimValue][])('finds nothing wrong with %s', (_what, value) => {
    expect(normalisedMismatch(value)).toBeUndefined();
  });

  it.each([
    ['the probe of the review: the raw text is twelve, the claim says 15', number('twelve', '15'), 'the number "twelve" reads as 12, but the claim gives 15'],
    ['a number in digits', number('12', '15'), 'the number "12" reads as 12, but the claim gives 15'],
    ['a number that is off by a power of ten', number('1.2k', '12000'), 'the number "1.2k" reads as 1200, but the claim gives 12000'],
    ['a number with a comma that is read as a decimal point', number('1,200', '1.2'), 'the number "1,200" reads as 1200, but the claim gives 1.2'],
    ['a number whose normalised form is not a number', number('12', 'twelve'), 'the number "12" reads as 12, but the claim gives twelve'],
    ['a number whose unit is another', number('12 kg', '12', 'g'), 'the number "12 kg" reads as 12 kg, but the claim gives 12 g'],
    ['a number whose unit is left out', number('12 kg', '12'), 'the number "12 kg" reads as 12 kg, but the claim gives 12'],
    ['a number that is given a unit that its raw text does not have', number('12', '12', 'kg'), 'the number "12" reads as 12, but the claim gives 12 kg'],
    ['a sum of money with another currency', number('$38,000', '38000', 'EUR'), 'the number "$38,000" reads as 38000 USD, but the claim gives 38000 EUR'],
    ['a number in words with a wrong unit', number('twelve kilograms', '12', 'lb'), 'the number "twelve kilograms" reads as 12 kg, but the claim gives 12 lb'],
    ['a day that is another day', date('1 October 2026', '2026-10-02'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02'],
    ['a day written as the day first, when the month is what the model wrote', date('1 October 2026', '2026-10'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10'],
    ['a month given with a day', date('October 2026', '2026-10-01'), 'the date "October 2026" reads as 2026-10, but the claim gives 2026-10-01'],
    ['a year given with a month', date('2027', '2027-01'), 'the date "2027" reads as 2027, but the claim gives 2027-01'],
    ['a date that is not in the ISO form', date('1 October 2026', '1 October 2026'), 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 1 October 2026'],
    ['a name that is not in lowercase', named('Brindle Logistics', 'Brindle Logistics'), 'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "Brindle Logistics"'],
    ['a name that is another name', named('Brindle Logistics', 'harlow logistics'), 'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "harlow logistics"'],
    ['a name with a run of white space left in', named('Brindle  Logistics', 'brindle  logistics'), 'the name "Brindle  Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "brindle  logistics"'],
  ] as [string, ClaimValue, string][])('says what is wrong with %s', (_what, value, message) => {
    expect(normalisedMismatch(value)).toBe(message);
  });

  it.each([
    ['a word that states an amount that has no value to compare', number('half', '0.5')],
    ['a lone one, which is a pronoun', number('one', '5')],
    ['number words that are not a number', number('five five', '7')],
    ['a phrase that is more than a number', number('about twelve kilograms', '15')],
    ['a name that has digits', number('FX-1', '3')],
    ['a date in a form that the gate does not read', date('last Tuesday', '2026-10-01')],
    ['a day that does not exist', date('31 February 2026', '2026-02-28')],
    ['a month with no year', date('October', '2026-10')],
  ] as [string, ClaimValue][])('compares nothing when the raw text is not a token that the gate reads: %s', (_what, value) => {
    expect(normalisedMismatch(value)).toBeUndefined();
  });

  it('shows at most 40 characters of a raw text and of a normalised form, with three dots when it cuts', () => {
    const long = `${'a'.repeat(50)} b`;
    expect(normalisedMismatch(named(long, 'x'))).toBe(`the name "${'a'.repeat(40)}..." in lowercase with single spaces is "${'a'.repeat(40)}...", but the claim gives "x"`);
    expect(normalisedMismatch(number('12', 'z'.repeat(41)))).toBe(`the number "12" reads as 12, but the claim gives ${'z'.repeat(40)}...`);
    expect(normalisedMismatch(named('b'.repeat(40), 'b'.repeat(40)))).toBeUndefined();
  });
});

describe('claimProblems: a value that says other than its raw text', () => {
  const page = 'Fixture Robotics says the arm lifts twelve kg. It ships on 1 October 2026 from Brindle Logistics.';
  const quote = (overrides: Partial<ClaimCandidate>): ClaimCandidate =>
    clean({ text: 'The arm lifts twelve kg.', label: 'lifts twelve kg', quote: 'the arm lifts twelve kg.', values: [number('twelve kg', '12', 'kg')], ...overrides });

  it('keeps a claim whose number in words says what its normalised form says', () => {
    expect(codesOf(quote({}), 'company-newsroom', page)).toEqual([]);
  });

  it('drops the probe of the review: twelve that is normalised as 15, which would let a sentence that says 15 kg cite a quotation that says twelve kg', () => {
    const problems = claimProblems(quote({ values: [number('twelve kg', '15', 'kg')] }), page, 'company-newsroom', ALLOW);
    expect(problems).toEqual([{ code: 'value-normalised-mismatch', message: 'the number "twelve kg" reads as 12 kg, but the claim gives 15 kg' }]);
  });

  it('drops a claim for a date, a name and a number in digits that say other than their raw text, once for each value', () => {
    const claim = clean({
      text: 'It ships on 1 October 2026 from Brindle Logistics.',
      label: 'ships on 1 October 2026',
      quote: 'It ships on 1 October 2026 from Brindle Logistics.',
      values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-02' }, name('Brindle Logistics'), { kind: 'name', raw: 'Brindle', normalised: 'Brindle' }, number('1', '2')],
    });
    expect(claimProblems(claim, page, 'company-newsroom', ALLOW)).toEqual([
      { code: 'value-normalised-mismatch', message: 'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02' },
      { code: 'value-normalised-mismatch', message: 'the name "Brindle" in lowercase with single spaces is "brindle", but the claim gives "Brindle"' },
      { code: 'value-normalised-mismatch', message: 'the number "1" reads as 1, but the claim gives 2' },
    ]);
  });

  it('gives the reasons that a value is not in the quotation first and the reasons that it says other than its raw text next, then those of the text and the label', () => {
    const claim = quote({ text: 'Harlow lifts twelve kg.', label: 'Harlow lifts', values: [number('7', '8'), number('twelve kg', '15', 'kg'), name('Harlow')] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual(['value-not-in-quote', 'value-not-in-quote', 'value-normalised-mismatch', 'value-normalised-mismatch', 'text-not-in-quote', 'label-not-in-quote']);
  });

  it('does not make the check for a claim whose quotation is not on the page, which has nothing else checked either', () => {
    expect(codesOf(quote({ quote: 'not on the page', values: [number('twelve kg', '15', 'kg')] }), 'company-newsroom', page)).toEqual(['quote-not-found']);
  });
});

describe('claimProblems: the values', () => {
  it('drops a claim that lists a number that the quotation does not contain', () => {
    expect(codesOf(clean({ values: [number('$39,000', '39000', 'USD')] }))).toEqual(['value-not-in-quote']);
  });

  it('drops a claim that lists a date or a name that the quotation does not contain', () => {
    expect(codesOf(clean({ values: [{ kind: 'date', raw: '2 October 2026', normalised: '2026-10-02' }] }))).toEqual(['value-not-in-quote']);
    expect(codesOf(clean({ values: [name('Harlow Logistics')] }))).toEqual(['value-not-in-quote']);
  });

  it.each([
    ['2', 'a number that ends a longer number (12)'],
    ['3', 'the first digit of a longer number ($38,000)'],
    ['38', 'the thousands of a number with a comma ($38,000)'],
    ['000', 'the last group of a number with a comma ($38,000)'],
    ['Robot', 'the start of a longer word (Robotics)'],
    ['week', 'the start of a longer word (weeks)'],
  ])('drops a claim whose value %s is only a part of a longer figure or word: %s', (raw) => {
    const claim = clean({ values: [number(raw, raw)] });
    expect(codesOf(claim)).toEqual(['value-not-in-quote']);
  });

  it('keeps a claim whose values stand as whole tokens in the quotation, at the end of a sentence too', () => {
    const page = 'The FX-1 lifts 2.3 kg. It ships in 12 weeks.';
    const claim = clean({ text: 'The FX-1 lifts 2.3 kg and ships in 12 weeks.', label: 'ships in 12 weeks', quote: page, values: [number('2.3 kg', '2.3', 'kg'), number('12', '12'), number('2.3', '2.3')] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });

  it('says once for every value that is missing', () => {
    const problems = claimProblems(clean({ values: [number('7', '7'), name('Harlow'), name('FX-1')] }), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual(['value-not-in-quote', 'value-not-in-quote']);
    expect(problems[0]?.message).toContain('"7"');
    expect(problems[1]?.message).toContain('"Harlow"');
  });

  it('reads a value the way the gate does: plain quotation marks, and one space for any white space', () => {
    const page = `Dana said ${String.fromCharCode(0x201c)}we went from pilot\nto production${String.fromCharCode(0x201d)}.`;
    const claim = clean({ text: 'Dana said it went from pilot to production.', label: 'pilot', quote: page, values: [name('Dana'), { kind: 'name', raw: '"we went from pilot to  production"', normalised: '"we went from pilot to production"' }] });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });

  it('is satisfied by a claim with no values at all', () => {
    expect(codesOf(clean({ values: [] }))).toEqual([]);
  });
});

describe('claimProblems: the text and the label', () => {
  it.each([
    ['an invented number', { text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 15 weeks of an order.' }, 'text-not-in-quote', '"15"'],
    ['a figure with another unit', { text: 'Fixture Robotics lists the FX-1 from EUR 38,000, with delivery within 12 weeks of an order.' }, 'text-not-in-quote', '"EUR 38,000"'],
    ['a swapped number', { text: 'Fixture Robotics lists the FX-1 from $83,000, with delivery within 12 weeks of an order.' }, 'text-not-in-quote', '"$83,000"'],
    ['an invented date', { text: 'Fixture Robotics lists the FX-1 from $38,000 as of 3 October 2026.' }, 'text-not-in-quote', '"3 October 2026"'],
    ['an invented name in the middle', { text: 'Fixture Robotics lists the FX-1 from $38,000 to Harlow Logistics.' }, 'text-not-in-quote', '"harlow"'],
    ['an invented name at the start', { text: 'Harlow lists the FX-1 from $38,000.' }, 'text-not-in-quote', '"Harlow"'],
    ['an amount in words that has no value to check', { text: 'Fixture Robotics lists the FX-1 at twice the price of rivals.' }, 'text-not-in-quote', '"twice"'],
    ['an invented number in the label', { label: '15 week delivery' }, 'label-not-in-quote', '"15"'],
    ['an invented name in the label', { label: 'Harlow price' }, 'label-not-in-quote', '"Harlow"'],
    ['an invented name at the start of the label', { label: 'Northwind list price' }, 'label-not-in-quote', '"Northwind"'],
  ] as const)('drops a claim with %s', (_what, overrides, code, shown) => {
    const problems = claimProblems(clean(overrides), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual([code]);
    expect(problems[0]?.message).toContain(shown);
  });

  it('allows an amount in words when the quotation says it too', () => {
    const page = 'Throughput is twice that of the FX-0 arm.';
    const claim = clean({ text: 'Throughput is twice that of the FX-0 arm.', label: 'throughput', quote: page, values: [], basis: 'datasheet' });
    expect(codesOf(claim, 'company-newsroom', page)).toEqual([]);
  });

  it('reads the words inside quotation marks of the text as well: a quoted figure is still a figure', () => {
    const claim = clean({ text: 'Fixture Robotics said "delivery within 15 weeks of an order".' });
    expect(codesOf(claim)).toEqual(['text-not-in-quote']);
  });

  it('says what is missing for the text and for the label in one problem each, with every item of it', () => {
    const problems = claimProblems(clean({ text: 'Harlow lists the FX-1 from $83,000 in 15 weeks.', label: 'Harlow 15 week price' }), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual(['text-not-in-quote', 'label-not-in-quote']);
    expect(problems[0]?.message).toBe('the text says what the quotation does not: "$83,000", "15", "Harlow"');
    expect(problems[1]?.message).toBe('the label says what the quotation does not: "15", "Harlow", "week", "price"');
  });

  it('allows a capitalised word that is on the allow-list, in the text and in the label', () => {
    expect(codesOf(clean({ text: 'The CEO of Fixture Robotics lists the FX-1 from $38,000.', label: 'CEO per arm' }))).toEqual([]);
  });
});

describe('claimProblems: the words of the label', () => {
  // A label is a short name for a claim. It is printed in the notes under "What we couldn't verify", on the receipts page and on the
  // fact card, and no rule of the gate reads it, so every word of it must be a word of the quotation.
  it('has a longest length of six words', () => {
    expect(MAX_LABEL_WORDS).toBe(6);
  });

  it.each([
    ['a word that the quotation does not have', 'list price', ['"list"', '"price"']],
    ['a lowercase invented name', 'harlow per arm', ['"harlow"']],
    ['a word that is the start of a word of the quotation', 'list per arm', ['"list"']],
    ['a word in another form than the quotation has it', 'delivery week', ['"week"']],
  ] as const)('drops a claim whose label has %s', (_what, label, shown) => {
    const problems = claimProblems(clean({ label }), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual(['label-not-in-quote']);
    expect(problems[0]?.message).toBe(`the label says what the quotation does not: ${shown.join(', ')}`);
  });

  it.each([
    ['words of the quotation', 'delivery within 12 weeks'],
    ['words of the quotation in other cases', 'FIXTURE robotics'],
    ['a plain word that may start a sentence, though the quotation does not have it', 'to arm'],
    ['a word on the allow-list', 'CEO per arm'],
    ['a name with a digit in it', 'the FX-1'],
    ['a figure of the quotation', 'from $38,000'],
    ['six words', 'Fixture Robotics lists the FX-1 from'],
  ])('keeps a claim whose label has %s', (_what, label) => {
    expect(codesOf(clean({ label }))).toEqual([]);
  });

  it('reads a word of the label that has a hyphen by its parts when the quotation does not have it whole: tote-picking is as good as tote picking', () => {
    const page = 'The arms are built for tote picking and trailer unloading.';
    const labelled = (label: string) => claimProblems(clean({ text: 'The arms are built for tote picking.', label, quote: page, values: [], basis: 'datasheet' }), page, 'company-newsroom', ALLOW);
    expect(labelled('tote-picking arms')).toEqual([]);
    expect(labelled('tote-pickers arms').map((problem) => problem.message)).toEqual(['the label says what the quotation does not: "tote-pickers"']);
    expect(labelled('tote-picking-robots arms').map((problem) => problem.code)).toEqual(['label-not-in-quote']);
    expect(codesOf(clean({ label: 'FX-1 per arm' }))).toEqual([]);
  });

  it('drops a claim whose label has more than six words, and says how many it has', () => {
    const problems = claimProblems(clean({ label: 'Fixture Robotics lists the FX-1 from arm' }), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual(['label-too-long']);
    expect(problems[0]?.message).toBe('the label has 7 words, and the longest allowed is 6');
  });

  it('drops a claim whose label has both a word that is not in the quotation and too many words, and says both', () => {
    const problems = claimProblems(clean({ label: 'the list price of the arm, from the order' }), PAGE, 'company-newsroom', ALLOW);
    expect(problems.map((problem) => problem.code)).toEqual(['label-not-in-quote', 'label-too-long']);
  });

  it('drops a claim whose label has no word at all', () => {
    for (const label of ['--', '...', ' ']) {
      const problems = claimProblems(clean({ label }), PAGE, 'company-newsroom', ALLOW);
      expect(problems.map((problem) => [problem.code, problem.message]), label).toEqual([['label-not-in-quote', 'the label has no word']]);
    }
  });

  it('reads the label by the same rule whatever the source: a page of another outlet too', () => {
    const page = 'The arm is priced from $38,000, the outlet reported.';
    const claim = clean({ text: 'The arm is priced from $38,000.', label: 'list price', quote: page, values: [number('$38,000', '38000', 'USD')], basis: 'reported' });
    expect(codesOf(claim, 'tier2', page)).toEqual(['label-not-in-quote']);
    expect(codesOf({ ...claim, label: 'priced from $38,000' }, 'tier2', page)).toEqual([]);
  });
});

describe('claimProblems: the words of the text', () => {
  // The text of a claim is a plain sentence that a model writes. Its figures, dates and capitalised words are read since part 3;
  // now its other words are read too: a word of four letters or more must be a word of the quotation or a plain word of grammar.
  const PAYLOAD = 'The arm lifts 12.5 kg at full reach.';
  const textOf = (text: string, page = PAYLOAD) =>
    claimProblems(clean({ text, label: 'the', quote: page, values: [], basis: 'datasheet' }), page, 'company-newsroom', ALLOW);

  it.each([
    ['an invented lowercase name (the probe of the review)', 'the harlow dynamics arm lifts 12.5 kg', ['"harlow"', '"dynamics"']],
    ['a negation of four letters or more (the probe of the review)', 'The arm cannot lift 12.5 kg.', ['"cannot"', '"lift"']],
    ['an assertion of the model', 'The arm never fails and is the safest on the market.', ['"never"', '"fails"', '"safest"', '"market"']],
    ['a word in another form than the quotation has it', 'The arm lifted 12.5 kg.', ['"lifted"']],
    ['the word no, which the quotation does not have', 'The arm lifts no more than 12.5 kg.', ['"no"', '"more"', '"than"']],
    ['the word not, which the quotation does not have', 'The arm does not lift 12.5 kg.', ['"not"', '"lift"']],
    ['a part of a word with a hyphen', 'The arm lifts 12.5 kg at full-length reach.', ['"length"']],
  ] as const)('drops a claim whose text has %s', (_what, text, shown) => {
    const problems = textOf(text);
    expect(problems.map((problem) => problem.code)).toEqual(['text-not-in-quote']);
    expect(problems[0]?.message).toBe(`the text says what the quotation does not: ${shown.join(', ')}`);
  });

  it.each([
    ['the words of the quotation', 'The arm lifts 12.5 kg at full reach.'],
    ['the words of the quotation in another order and case', 'At full reach, THE ARM lifts 12.5 kg.'],
    ['a plain word of grammar', 'The arm, which lifts 12.5 kg, has a full reach.'],
    ['a figure with a unit that the quotation spells another way', 'The arm lifts 12.5 kilograms at full reach.'],
    ['words of three letters or fewer that the quotation does not have', 'The arm lifts 12.5 kg at its full reach, per the big dog.'],
    ['a month on the allow-list', 'The arm lifts 12.5 kg at full reach in October.'],
  ])('keeps a claim whose text has %s', (_what, text) => {
    expect(textOf(text).map((problem) => problem.code)).not.toContain('text-not-in-quote');
  });

  it('keeps a text that says no, not or nor when the quotation says it too', () => {
    const page = 'The FX-1 needs no new safety cage, and it is not noisy.';
    expect(textOf('The FX-1 needs no new safety cage and is not noisy.', page)).toEqual([]);
  });

  it('reads a word with a hyphen by its parts: tote-picking is as good as tote picking', () => {
    const page = 'The arms are built for tote picking.';
    expect(textOf('The arms are built for tote-picking.', page)).toEqual([]);
    expect(textOf('The arms are built for tote-pickers.', page).map((problem) => problem.message)).toEqual(['the text says what the quotation does not: "pickers"']);
  });

  it('lists a word once, whatever the number of times and the case it is written in, after the figures and the names', () => {
    const problems = textOf('Harlow ships them to Harlow, 15 times.');
    expect(problems[0]?.message).toBe('the text says what the quotation does not: "15", "harlow", "ships", "times"');
  });

  it('shows no more than forty characters of a word, and three dots after a longer one', () => {
    const long = 'x'.repeat(50);
    const problems = textOf(`The arm lifts ${long} at full reach.`);
    expect(problems[0]?.message).toBe(`the text says what the quotation does not: "${'x'.repeat(40)}..."`);
  });
});

describe('COMMON_WORDS', () => {
  it('is frozen, so no caller can add a word', () => {
    expect(Object.isFrozen(COMMON_WORDS)).toBe(true);
  });

  it('holds words of four letters or more, in lowercase letters only, each once', () => {
    expect(new Set(COMMON_WORDS).size).toBe(COMMON_WORDS.length);
    for (const word of COMMON_WORDS) {
      expect(word, word).toMatch(/^[a-z]{4,}$/);
    }
  });

  it('is small: a list of grammar and not a vocabulary', () => {
    expect(COMMON_WORDS.length).toBeLessThanOrEqual(30);
  });

  it('holds no negation, no word that changes how much, when or how sure, no modal, and no word that is a noun, a verb of what happens or a name', () => {
    const forbidden = [
      'cannot', 'never', 'without', 'neither', 'none', 'nothing', 'only', 'just', 'even', 'still', 'always', 'often', 'some', 'many', 'most', 'more', 'less', 'least',
      'every', 'each', 'both', 'over', 'under', 'above', 'below', 'about', 'after', 'before', 'since', 'until', 'than', 'will', 'would', 'could', 'should', 'might',
      'must', 'shall', 'because', 'while', 'when', 'where', 'between', 'beyond', 'against', 'despite', 'during',
      'company', 'arm', 'arms', 'robot', 'robots', 'plant', 'price', 'order', 'ships', 'said', 'says', 'lists', 'fixture', 'robotics', 'brindle', 'logistics', 'tarnmoor', 'mercer',
    ];
    for (const word of forbidden) expect(COMMON_WORDS, word).not.toContain(word);
  });

  it('has no word that the gate lets begin a sentence only because it is a negation or a quantity', () => {
    for (const word of ['not', 'no', 'only', 'all']) expect(SENTENCE_STARTERS).toContain(word);
    for (const word of ['not', 'no', 'only', 'all']) expect(COMMON_WORDS).not.toContain(word);
  });
});

describe('claimProblems: the basis', () => {
  // What each kind of source may be the basis of. Written out here, in full, and not read from the code under test.
  const ALLOWED: Record<SourceKind, Basis[]> = {
    'company-newsroom': ['press-release', 'datasheet', 'briefing', 'demo'],
    arxiv: ['paper'],
    sec: ['filing'],
    standard: ['standard'],
    tier2: ['reported'],
    unknown: [],
  };
  const KINDS = Object.keys(ALLOWED) as SourceKind[];

  it.each(KINDS.flatMap((kind) => BASES.map((basis) => [kind, basis] as const)))('a claim from %s with the basis %s', (kind, basis) => {
    const allowed = ALLOWED[kind].includes(basis);
    const found = codesOf(clean({ basis }), kind);
    if (allowed) expect(found).toEqual([]);
    else expect(found).toHaveLength(1);
  });

  it('says that the basis is wrong for the kind of source, naming the bases that are allowed', () => {
    const [problem] = claimProblems(clean({ basis: 'filing' }), PAGE, 'company-newsroom', ALLOW);
    expect(problem?.code).toBe('basis-not-allowed');
    expect(problem?.message).toBe('the basis "filing" does not fit a company newsroom: the bases for it are press-release, datasheet, briefing, demo');
  });

  it('never allows the basis measured: no source of a story can be taken at its word as a measurement', () => {
    for (const kind of KINDS) expect(codesOf(clean({ basis: 'measured' }), kind)).toHaveLength(1);
  });

  it('gives the rule of the gate (G6) when a claim from another outlet has a basis other than reported', () => {
    const [problem] = claimProblems(clean({ basis: 'press-release' }), PAGE, 'tier2', ALLOW);
    expect(problem?.code).toBe('tier-basis');
    expect(problem?.message).toBe('a claim that rests on another outlet has the basis "reported", not "press-release" (check G6)');
  });

  it('gives the rule of the gate (G6) when a claim from a primary source has the basis reported', () => {
    const [problem] = claimProblems(clean({ basis: 'reported' }), PAGE, 'sec', ALLOW);
    expect(problem?.code).toBe('tier-basis');
    expect(problem?.message).toBe('the basis "reported" is for a claim that rests on another outlet, not for one from a primary source (check G6)');
  });

  it('says that no claim can be taken from a page that is not a known kind of source', () => {
    const [problem] = claimProblems(clean(), PAGE, 'unknown', ALLOW);
    expect(problem?.code).toBe('basis-not-allowed');
    expect(problem?.message).toBe('the page is not a known kind of source, so no claim can be taken from it');
  });
});

describe('claimProblems: all the reasons at once', () => {
  it('lists every reason a claim must be dropped, in the order of the checks', () => {
    const claim = clean({
      text: 'Harlow lists the FX-1 for 15 weeks.',
      label: 'Harlow price',
      values: [name('Harlow')],
      basis: 'filing',
    });
    expect(codesOf(claim)).toEqual(['value-not-in-quote', 'text-not-in-quote', 'label-not-in-quote', 'basis-not-allowed']);
  });

  it('knows exactly the codes it can give', () => {
    expect(CLAIM_PROBLEM_CODES).toEqual(['quote-not-found', 'quote-too-long', 'value-not-in-quote', 'value-normalised-mismatch', 'text-not-in-quote', 'label-not-in-quote', 'label-too-long', 'basis-not-allowed', 'tier-basis']);
  });

  it('names the bases of every kind of source in one table', () => {
    expect(Object.keys(ALLOWED_BASES).sort()).toEqual(['arxiv', 'company-newsroom', 'sec', 'standard', 'tier2', 'unknown']);
  });
});

describe('shortenLabel', () => {
  it('leaves a label of the longest allowed length as it is', () => {
    expect(shortenLabel('Fixture Robotics lists the FX-1 arm')).toBe('Fixture Robotics lists the FX-1 arm');
    expect(MAX_LABEL_WORDS).toBe(6);
  });

  it('cuts a longer label at the longest allowed length', () => {
    expect(shortenLabel('Fixture Robotics lists the FX-1 from arm')).toBe('Fixture Robotics lists the FX-1 from');
  });

  it('takes the punctuation off the end of what is left', () => {
    expect(shortenLabel('payload, reach, mass, speed, power, torque, cycle time')).toBe('payload, reach, mass, speed, power, torque');
  });

  it('keeps the one word of a label that is a single long word', () => {
    expect(shortenLabel('payload')).toBe('payload');
  });

  it('returns a label of exactly the longest allowed length byte for byte, with the comma at its end', () => {
    expect(shortenLabel('payload, reach, mass, speed, power, torque,')).toBe('payload, reach, mass, speed, power, torque,');
  });

  it('returns a short label byte for byte, with its odd spacing', () => {
    expect(shortenLabel('Fixture  Robotics lists')).toBe('Fixture  Robotics lists');
    expect(shortenLabel(' per arm, ')).toBe(' per arm, ');
  });

  it('leaves no quote mark open when the cut falls inside a quotation', () => {
    const cut = shortenLabel('The "FX-1 arm lists a very long payload" claim now');
    expect(cut).toBe('The FX-1 arm lists a very');
    expect(cut).not.toContain('"');
  });

  it('leaves no curly quote mark open when the cut falls inside a quotation', () => {
    const opening = String.fromCharCode(0x201c);
    const closing = String.fromCharCode(0x201d);
    const cut = shortenLabel(`The ${opening}FX-1 arm lists a very long payload${closing} claim now`);
    expect(cut).toBe('The FX-1 arm lists a very');
    expect(cut).not.toContain(opening);
    expect(cut).not.toContain(closing);
  });

  it('keeps the quote marks of a quotation that the cut leaves whole', () => {
    expect(shortenLabel('The "FX-1 arm" lists a very long payload')).toBe('The "FX-1 arm" lists a very');
  });

  it('leaves no bracket open when the cut falls inside a parenthesis', () => {
    const cut = shortenLabel('one two three four (five six seven) eight');
    expect(cut).toBe('one two three four five six');
    expect(cut).not.toContain('(');
  });

  it('keeps the brackets of a parenthesis that the cut leaves whole', () => {
    expect(shortenLabel('one two (three) four five six seven')).toBe('one two (three) four five six');
  });
});
