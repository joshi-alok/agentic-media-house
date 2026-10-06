import { BASES, ClaimSpan, defaultConfig as gateDefaults } from '@robywire/gate';
import type { Basis, ClaimValue } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { extractPage } from '../../src/fetch/extract-text';
import type { SourceKind } from '../../src/sources';
import { ALLOWED_BASES, CLAIM_PROBLEM_CODES, MAX_QUOTE_LENGTH, claimProblems, locateQuote } from '../../src/stages/claim-grounding';
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
    label: 'list price',
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
    const claim = clean({ text: 'Tarnmoor is due to receive arms in November 2026.', label: 'delivery month', quote: LINE[5] as string, values: [name('Tarnmoor')], basis: 'press-release' });
    expect(codesOf(claim)).toEqual([]);
  });

  it('has none when its text opens with a plain word that the quotation does not contain', () => {
    expect(codesOf(clean({ text: 'The company lists the FX-1 from $38,000.' }))).toEqual([]);
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
    const claim = (length: number) => clean({ text: 'The arm.', label: 'arm', quote: 'x'.repeat(length), values: [] });
    expect(codesOf(claim(300), 'company-newsroom', page)).toEqual([]);
    expect(codesOf(claim(301), 'company-newsroom', page)).toEqual(['quote-too-long']);
  });

  it('measures the passage as the page has it, so a quotation that is short only because the page pads it with white space is too long', () => {
    const page = `first${' '.repeat(400)}second`;
    const claim = clean({ text: 'The arm.', label: 'arm', quote: 'first second', values: [] });
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
    const claim = clean({ text: 'The FX-1 lifts 2.3 kg and ships in 12 weeks.', label: 'lead time', quote: page, values: [number('2.3 kg', '2.3', 'kg'), number('12', '12'), number('2.3', '2.3')] });
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
    const claim = clean({ text: 'Dana said it went from pilot to production.', label: 'pilot', quote: page, values: [name('Dana'), { kind: 'name', raw: '"we went from pilot to  production"', normalised: 'x' }] });
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
    expect(problems[1]?.message).toBe('the label says what the quotation does not: "15", "Harlow"');
  });

  it('allows a capitalised word that is on the allow-list, in the text and in the label', () => {
    expect(codesOf(clean({ text: 'The CEO of Fixture Robotics lists the FX-1 from $38,000.', label: 'CEO price' }))).toEqual([]);
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
    expect(CLAIM_PROBLEM_CODES).toEqual(['quote-not-found', 'quote-too-long', 'value-not-in-quote', 'text-not-in-quote', 'label-not-in-quote', 'basis-not-allowed', 'tier-basis']);
  });

  it('names the bases of every kind of source in one table', () => {
    expect(Object.keys(ALLOWED_BASES).sort()).toEqual(['arxiv', 'company-newsroom', 'sec', 'standard', 'tier2', 'unknown']);
  });
});
