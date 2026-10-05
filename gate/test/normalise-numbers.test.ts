import { describe, expect, it } from 'vitest';
import { UNIT_ALIASES, canonicalUnit, parseNumberToken } from '../src/normalise';

/** The expected result of parsing a number: a canonical decimal string and, if any, a canonical unit. */
const n = (value: string, unit?: string) => (unit === undefined ? { value } : { value, unit });

describe('parseNumberToken: plain numbers', () => {
  it.each([
    ['1200', n('1200')],
    ['1,200', n('1200')],
    ['1,200.50', n('1200.5')],
    ['12,345,678', n('12345678')],
    ['0.05', n('0.05')],
    ['0.50', n('0.5')],
    ['12.0', n('12')],
    ['007', n('7')],
    ['0', n('0')],
    ['000.10', n('0.1')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseNumberToken(raw)).toEqual(expected);
  });

  it('ignores whitespace around and inside the token', () => {
    expect(parseNumberToken('  12   kg ')).toEqual(n('12', 'kg'));
    expect(parseNumberToken('12\u00A0kg')).toEqual(n('12', 'kg'));
  });
});

describe('parseNumberToken: magnitudes', () => {
  it.each([
    ['1.2k', n('1200')],
    ['1.2K', n('1200')],
    ['5k', n('5000')],
    ['0.5k', n('500')],
    ['3 thousand', n('3000')],
    ['2.5 million', n('2500000')],
    ['1.5 billion', n('1500000000')],
    ['1.2 trillion', n('1200000000000')],
    ['1.234k', n('1234')],
    ['1.2345k', n('1234.5')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseNumberToken(raw)).toEqual(expected);
  });
});

describe('parseNumberToken: units', () => {
  it.each([
    ['12 kg', n('12', 'kg')],
    ['12kg', n('12', 'kg')],
    ['12 kilograms', n('12', 'kg')],
    ['1 kilogram', n('1', 'kg')],
    ['12 kilogrammes', n('12', 'kg')],
    ['2.3 m/s', n('2.3', 'm/s')],
    ['2.3m/s', n('2.3', 'm/s')],
    ['2.3 metres per second', n('2.3', 'm/s')],
    ['2.3 meters per second', n('2.3', 'm/s')],
    ['5%', n('5', '%')],
    ['5 %', n('5', '%')],
    ['5 percent', n('5', '%')],
    ['5 per cent', n('5', '%')],
    ['40 mm', n('40', 'mm')],
    ['1.5 m', n('1.5', 'm')],
    ['1.4 metres', n('1.4', 'm')],
    ['3 km', n('3', 'km')],
    ['12 km/h', n('12', 'km/h')],
    ['12 kph', n('12', 'km/h')],
    ['20 W', n('20', 'W')],
    ['20W', n('20', 'W')],
    ['1.2 kW', n('1.2', 'kW')],
    ['5 kWh', n('5', 'kWh')],
    ['5kWh', n('5', 'kWh')],
    ['48 V', n('48', 'V')],
    ['2 Ah', n('2', 'Ah')],
    ['100 Hz', n('100', 'Hz')],
    ['100Hz', n('100', 'Hz')],
    ['2 h', n('2', 'h')],
    ['2 hr', n('2', 'h')],
    ['2 hours', n('2', 'h')],
    ['30 min', n('30', 'min')],
    ['30 minutes', n('30', 'min')],
    ['10 s', n('10', 's')],
    ['10 seconds', n('10', 's')],
    ['6 DoF', n('6', 'DoF')],
    ['12 lb', n('12', 'lb')],
    ['1.2k kg', n('1200', 'kg')],
    ['120 grams', n('120', 'g')],
    ['2 tonnes', n('2', 'tonne')],
    ['5 ft', n('5', 'ft')],
    ['6 feet', n('6', 'ft')],
    ['3 inches', n('3', 'inch')],
    ['2 miles', n('2', 'mi')],
    ['60 mph', n('60', 'mph')],
    ['200 Nm', n('200', 'Nm')],
    ['1,200 rpm', n('1200', 'rpm')],
    ['5 Wh', n('5', 'Wh')],
    ['3000 mAh', n('3000', 'mAh')],
    ['1.5 kHz', n('1.5', 'kHz')],
    ['2.4 GHz', n('2.4', 'GHz')],
    ['40 ms', n('40', 'ms')],
    ['275 TOPS', n('275', 'TOPS')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseNumberToken(raw)).toEqual(expected);
  });

  it('does not convert between units: kg and lb, m and km stay as they are', () => {
    expect(parseNumberToken('12 kg')).toEqual(n('12', 'kg'));
    expect(parseNumberToken('12 lb')).toEqual(n('12', 'lb'));
    expect(parseNumberToken('1 km')).toEqual(n('1', 'km'));
    expect(parseNumberToken('1000 m')).toEqual(n('1000', 'm'));
  });

  it('keeps the longest unit: m/s is not "m", km/h is not "km", mins is not "m"', () => {
    expect(parseNumberToken('2 m/s')?.unit).toBe('m/s');
    expect(parseNumberToken('2 km/h')?.unit).toBe('km/h');
    expect(parseNumberToken('2 mins')?.unit).toBe('min');
    expect(parseNumberToken('2 kWh')?.unit).toBe('kWh');
    expect(parseNumberToken('2 Wh')?.unit).toBe('Wh');
    expect(parseNumberToken('2 ms')?.unit).toBe('ms');
    expect(parseNumberToken('2 mph')?.unit).toBe('mph');
    expect(parseNumberToken('2 mAh')?.unit).toBe('mAh');
  });

  it('treats unit spellings as case-sensitive, so an unknown spelling is not silently accepted', () => {
    expect(parseNumberToken('5 KG')).toBeNull();
    expect(parseNumberToken('5 Kilograms')).toBeNull();
    expect(parseNumberToken('5 hz')).toBeNull();
  });
});

describe('parseNumberToken: currency', () => {
  it.each([
    ['$450 million', n('450000000', 'USD')],
    ['$450M', n('450000000', 'USD')],
    ['$450m', n('450000000', 'USD')],
    ['$450 M', n('450000000', 'USD')],
    ['USD 450 million', n('450000000', 'USD')],
    ['USD450 million', n('450000000', 'USD')],
    ['$1.2bn', n('1200000000', 'USD')],
    ['$3B', n('3000000000', 'USD')],
    ['$3 billion', n('3000000000', 'USD')],
    ['$1.2 trillion', n('1200000000000', 'USD')],
    ['$12k', n('12000', 'USD')],
    ['$12 thousand', n('12000', 'USD')],
    ['$450', n('450', 'USD')],
    ['$1,200', n('1200', 'USD')],
    ['$1,200.50', n('1200.5', 'USD')],
    ['\u20AC1.2bn', n('1200000000', 'EUR')],
    ['EUR 5 million', n('5000000', 'EUR')],
    ['\u00A33B', n('3000000000', 'GBP')],
    ['GBP 7', n('7', 'GBP')],
    ['\u20B9250', n('250', 'INR')],
    ['INR 5 million', n('5000000', 'INR')],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseNumberToken(raw)).toEqual(expected);
  });

  it('reads a bare m as metres and a bare M or B as nothing, but the same suffix after a currency as a magnitude', () => {
    expect(parseNumberToken('450 m')).toEqual(n('450', 'm'));
    expect(parseNumberToken('450M')).toBeNull();
    expect(parseNumberToken('3 B')).toBeNull();
    expect(parseNumberToken('3bn')).toBeNull();
    expect(parseNumberToken('$450m')).toEqual(n('450000000', 'USD'));
  });
});

describe('parseNumberToken: things that are not numbers', () => {
  it.each([
    '',
    '   ',
    'abc',
    'FX-1',
    'H1',
    'B2B',
    '5G',
    '3D',
    '2nd',
    'twelve',
    '$',
    'USD',
    '2026-08-24',
    '1,20',
    '12 widgets',
    '12 kg extra',
    '5 k',
    '5million',
    '1.2.3',
  ])('returns null for %j', (raw) => {
    expect(parseNumberToken(raw)).toBeNull();
  });
});

describe('UNIT_ALIASES', () => {
  const canonicalUnits = [...new Set(Object.values(UNIT_ALIASES))].sort();

  it('maps every spelling to one of the canonical units, and nothing else', () => {
    expect(canonicalUnits).toEqual(
      [
        '%', 'Ah', 'DoF', 'GHz', 'Hz', 'MHz', 'Nm', 'TOPS', 'V', 'W', 'Wh', 'cm', 'ft', 'g', 'h', 'inch', 'kHz', 'kW', 'kWh',
        'kg', 'km', 'km/h', 'lb', 'm', 'm/s', 'mAh', 'mi', 'min', 'mm', 'mph', 'ms', 'rpm', 's', 'tonne',
      ].sort(),
    );
  });

  it('lists every canonical unit as a spelling of itself', () => {
    for (const unit of canonicalUnits) {
      expect(UNIT_ALIASES[unit], unit).toBe(unit);
    }
  });

  it.each(Object.entries(UNIT_ALIASES))('reads the spelling "%s" as the unit %s', (alias, canonical) => {
    expect(parseNumberToken(`5 ${alias}`)).toEqual(n('5', canonical));
  });
});

describe('canonicalUnit', () => {
  it('maps a known spelling to its canonical unit', () => {
    expect(canonicalUnit('kilograms')).toBe('kg');
    expect(canonicalUnit('metres per second')).toBe('m/s');
    expect(canonicalUnit('kg')).toBe('kg');
  });

  it('returns an unknown unit unchanged, so an unknown unit still has to match exactly', () => {
    expect(canonicalUnit('picks')).toBe('picks');
    expect(canonicalUnit('USD')).toBe('USD');
  });
});
