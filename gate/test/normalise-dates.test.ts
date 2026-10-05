import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, dateMatches, dayNumber, parseDateToken } from '../src/normalise';
import type { ParsedDate } from '../src/normalise';

const day = (iso: string): ParsedDate => ({ iso, precision: 'day' });
const month = (iso: string): ParsedDate => ({ iso, precision: 'month' });
const year = (iso: string): ParsedDate => ({ iso, precision: 'year' });

describe('parseDateToken: day precision', () => {
  it.each([
    ['2026-08-24', day('2026-08-24')],
    ['24 August 2026', day('2026-08-24')],
    ['24 Aug 2026', day('2026-08-24')],
    ['24 Aug. 2026', day('2026-08-24')],
    ['24 August, 2026', day('2026-08-24')],
    ['August 24, 2026', day('2026-08-24')],
    ['August 24 2026', day('2026-08-24')],
    ['Aug 24, 2026', day('2026-08-24')],
    ['Aug. 24, 2026', day('2026-08-24')],
    ['1 October 2026', day('2026-10-01')],
    ['01 October 2026', day('2026-10-01')],
    ['5 Sept 2026', day('2026-09-05')],
    ['5 Sep 2026', day('2026-09-05')],
    ['Sept. 5, 2026', day('2026-09-05')],
    ['5 May 2026', day('2026-05-05')],
    ['31 December 2026', day('2026-12-31')],
    ['29 February 2028', day('2028-02-29')],
    ['2000-02-29', day('2000-02-29')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseDateToken(raw)).toEqual(expected);
  });

  it('ignores whitespace around and inside the date', () => {
    expect(parseDateToken('  24   August 2026 ')).toEqual(day('2026-08-24'));
    expect(parseDateToken('24\u00A0August\u00A02026')).toEqual(day('2026-08-24'));
  });
});

describe('parseDateToken: month and year precision', () => {
  it.each([
    ['August 2026', month('2026-08')],
    ['Aug 2026', month('2026-08')],
    ['Aug. 2026', month('2026-08')],
    ['August, 2026', month('2026-08')],
    ['May 2026', month('2026-05')],
    ['2026', year('2026')],
    ['1900', year('1900')],
    ['2100', year('2100')],
    ['2027', year('2027')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseDateToken(raw)).toEqual(expected);
  });
});

describe('parseDateToken: impossible dates and non-dates', () => {
  it.each([
    '31 February 2026',
    '30 February 2028',
    '29 February 2026',
    '31 April 2026',
    '32 August 2026',
    '0 August 2026',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-08-00',
    '2026-8-24',
    '24 Augst 2026',
    '24/08/2026',
    '24 august 2026',
    '24 AUGUST 2026',
    'August 24th, 2026',
    '24 August',
    'August',
    '24 August 2026 and more',
    '1899',
    '2101',
    '0999-01-01',
    '12026',
    '20266',
    '2,026',
    '',
    'FX-1',
    'H1',
    'Q3 2026',
    '1,200',
  ])('returns null for %j', (raw) => {
    expect(parseDateToken(raw)).toBeNull();
  });
});

describe('MONTH_NAMES', () => {
  it('numbers the twelve full month names from 1 to 12', () => {
    const full = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    full.forEach((name, index) => {
      expect(MONTH_NAMES[name], name).toBe(index + 1);
    });
  });

  it('reads every month name and abbreviation in a date', () => {
    for (const [name, number] of Object.entries(MONTH_NAMES)) {
      const expected = `2026-${String(number).padStart(2, '0')}-15`;
      expect(parseDateToken(`15 ${name} 2026`), name).toEqual(day(expected));
    }
  });
});

describe('dayNumber', () => {
  it('counts days from 1970-01-01', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('1969-12-31')).toBe(-1);
    expect(dayNumber('2000-01-01')).toBe(10957);
  });

  it('makes the difference of two dates the number of calendar days between them', () => {
    expect(dayNumber('2026-10-04')! - dayNumber('2026-09-20')!).toBe(14);
    expect(dayNumber('2027-01-05')! - dayNumber('2026-12-22')!).toBe(14);
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-16')!).toBe(14);
    expect(dayNumber('2027-03-01')! - dayNumber('2027-02-15')!).toBe(14);
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-28')!).toBe(2);
    expect(dayNumber('2027-03-01')! - dayNumber('2027-02-28')!).toBe(1);
  });

  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-10-00', '2026-8-4', '24 August 2026', '2026', '', '2026-10-04T00:00:00Z', ' 2026-10-04', '2026-10-04 ', '0999-01-01'])(
    'is undefined for %j, which is not a real date written YYYY-MM-DD',
    (date) => {
      expect(dayNumber(date)).toBeUndefined();
    },
  );
});

describe('dateMatches', () => {
  it.each([
    // A day-precision sentence date needs the claim to name the same day.
    [day('2026-08-24'), '2026-08-24', true],
    [day('2026-08-24'), '2026-08-25', false],
    [day('2026-08-24'), '2026-09-24', false],
    [day('2026-08-24'), '2027-08-24', false],
    [day('2026-08-24'), '2026-08', false],
    [day('2026-08-24'), '2026', false],
    // A month-precision sentence date matches any claim date in that month.
    [month('2026-08'), '2026-08-24', true],
    [month('2026-08'), '2026-08-01', true],
    [month('2026-08'), '2026-08', true],
    [month('2026-08'), '2026-09-24', false],
    [month('2026-08'), '2027-08-24', false],
    [month('2026-08'), '2026', false],
    // A year-precision sentence date matches any claim date in that year.
    [year('2026'), '2026-08-24', true],
    [year('2026'), '2026-08', true],
    [year('2026'), '2026', true],
    [year('2026'), '2027-08-24', false],
    [year('2026'), '20261', false],
    [year('2026'), '', false],
    [month('2026-08'), '2026-083', false],
  ] as const)('%j against the claim date %j is %s', (sentenceDate, claimIso, expected) => {
    expect(dateMatches(sentenceDate, claimIso)).toBe(expected);
  });
});
