// Normalisers: turn the different ways text writes a number or a date into one
// canonical form, so that "1,200" and "1.2k", or "12 kg" and "12 kilograms",
// compare equal. Every function here is pure. The gate trusts these tables, so
// anything they do not know is rejected (null), never guessed.

// --- Numbers ----------------------------------------------------------------

/**
 * Every spelling of a unit, mapped to the canonical unit. Spellings are
 * case-sensitive on purpose: "5 KG" is not read as 5 kg, so an odd spelling
 * stays unmatched and the draft goes back for revision. Units are never
 * converted into each other: a pound is not 0.45 kg.
 */
export const UNIT_ALIASES: Readonly<Record<string, string>> = {
  // mass
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kilogramme: 'kg',
  kilogrammes: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  tonne: 'tonne',
  tonnes: 'tonne',
  // length
  mm: 'mm',
  millimetre: 'mm',
  millimetres: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  cm: 'cm',
  centimetre: 'cm',
  centimetres: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  m: 'm',
  metre: 'm',
  metres: 'm',
  meter: 'm',
  meters: 'm',
  km: 'km',
  kilometre: 'km',
  kilometres: 'km',
  kilometer: 'km',
  kilometers: 'km',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
  inch: 'inch',
  inches: 'inch',
  mi: 'mi',
  mile: 'mi',
  miles: 'mi',
  // speed
  'm/s': 'm/s',
  'metre per second': 'm/s',
  'metres per second': 'm/s',
  'meter per second': 'm/s',
  'meters per second': 'm/s',
  'km/h': 'km/h',
  kph: 'km/h',
  'kilometre per hour': 'km/h',
  'kilometres per hour': 'km/h',
  'kilometer per hour': 'km/h',
  'kilometers per hour': 'km/h',
  mph: 'mph',
  'mile per hour': 'mph',
  'miles per hour': 'mph',
  // power, energy, electrical, frequency
  W: 'W',
  watt: 'W',
  watts: 'W',
  kW: 'kW',
  kilowatt: 'kW',
  kilowatts: 'kW',
  kWh: 'kWh',
  'kilowatt-hour': 'kWh',
  'kilowatt-hours': 'kWh',
  V: 'V',
  volt: 'V',
  volts: 'V',
  Ah: 'Ah',
  'amp-hour': 'Ah',
  'amp-hours': 'Ah',
  Hz: 'Hz',
  hertz: 'Hz',
  kHz: 'kHz',
  MHz: 'MHz',
  GHz: 'GHz',
  Wh: 'Wh',
  'watt-hour': 'Wh',
  'watt-hours': 'Wh',
  mAh: 'mAh',
  Nm: 'Nm',
  'newton-metre': 'Nm',
  'newton-metres': 'Nm',
  'newton-meter': 'Nm',
  'newton-meters': 'Nm',
  rpm: 'rpm',
  RPM: 'rpm',
  // ratio
  '%': '%',
  percent: '%',
  'per cent': '%',
  // time
  h: 'h',
  hr: 'h',
  hrs: 'h',
  hour: 'h',
  hours: 'h',
  min: 'min',
  mins: 'min',
  minute: 'min',
  minutes: 'min',
  s: 's',
  sec: 's',
  secs: 's',
  second: 's',
  seconds: 's',
  ms: 'ms',
  millisecond: 'ms',
  milliseconds: 'ms',
  // robotics
  DoF: 'DoF',
  DOF: 'DoF',
  TOPS: 'TOPS',
};

/** The canonical form of a unit spelling; a spelling the table does not know comes back unchanged. */
export function canonicalUnit(unit: string): string {
  return UNIT_ALIASES[unit] ?? unit;
}

/** A number in canonical form: a plain decimal string, and the canonical unit if it has one. */
export interface ParsedNumber {
  value: string;
  unit?: string;
}

const CURRENCIES: Readonly<Record<string, string>> = {
  $: 'USD',
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
  '\u20B9': 'INR',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  INR: 'INR',
};

// Powers of ten. "million" and its relatives work anywhere. The short suffixes
// k, M, bn and B are magnitudes only after a currency, because without one a
// bare "m" is metres; an attached k (1.2k) is a thousand everywhere.
const WORD_MAGNITUDES: Readonly<Record<string, number>> = { thousand: 3, million: 6, billion: 9, trillion: 12 };
const CURRENCY_SUFFIXES: Readonly<Record<string, number>> = { k: 3, K: 3, m: 6, M: 6, bn: 9, B: 9 };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex source matching any unit spelling, longest first so "m/s" wins over "m". */
export const UNIT_SOURCE = Object.keys(UNIT_ALIASES)
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .map((spelling) => escapeRegExp(spelling).replace(/ /g, '\\s'))
  .join('|');

const AMOUNT = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const WORD_END = String.raw`(?![\p{L}\p{N}])`;
// A number never starts inside a word or a hyphenated name: FX-1, H1 and B2B contain no number.
const NUMBER_START = String.raw`(?<![\p{L}\p{N}])(?<!\p{L}-)`;
const CURRENCY = String.raw`(?:[$\u20AC\u00A3\u20B9]|(?<![\p{L}\p{N}])(?:USD|EUR|GBP|INR))`;

const MONEY = String.raw`(?<cur>${CURRENCY})\s?(?<camount>${AMOUNT})(?:\s?(?<cmag>thousand|million|billion|trillion|bn|B|M|m|k|K)${WORD_END})?`;
const PLAIN = String.raw`${NUMBER_START}(?<amount>${AMOUNT})(?:(?<kmag>[kK])${WORD_END}|\s(?<wmag>thousand|million|billion|trillion)${WORD_END})?(?:\s?(?<unit>${UNIT_SOURCE})${WORD_END})?`;

/**
 * Regex source for one number token: an optional currency, an amount with
 * optional thousands commas and decimals, an optional magnitude, an optional
 * unit. The token must end at a word boundary, so "5G" and "12abc" do not match.
 * The token scanner in tokens.ts compiles this with the `gu` flags.
 */
export const NUMBER_SOURCE = `(?:${MONEY}|${PLAIN})${WORD_END}`;

const WHOLE_NUMBER = new RegExp(`^${NUMBER_SOURCE}$`, 'u');

/** Move the decimal point of a plain decimal string `exponent` places to the right, exactly (no floats). */
function shiftDecimal(amount: string, exponent: number): string {
  const [whole = '', fraction = ''] = amount.replace(/,/g, '').split('.');
  const digits = whole + fraction;
  const point = whole.length + exponent;
  const padded = digits.padEnd(point, '0');
  const integer = padded.slice(0, point).replace(/^0+(?=\d)/, '');
  const rest = padded.slice(point).replace(/0+$/, '');
  return rest === '' ? integer : `${integer}.${rest}`;
}

/**
 * Parse one number token into a canonical decimal string and canonical unit.
 * The whole of `raw` must be the token: "12 kg" parses, "12 kg extra" does not.
 * Returns null for anything that is not a number, including names that contain
 * digits (FX-1, H1, B2B, 5G) and dates (2026-08-24).
 */
export function parseNumberToken(raw: string): ParsedNumber | null {
  const match = WHOLE_NUMBER.exec(raw.trim().replace(/\s+/g, ' '));
  const groups = match?.groups as Record<string, string | undefined> | undefined;
  if (!groups) return null;
  if (groups.cur !== undefined) {
    const suffix = groups.cmag;
    const exponent = suffix === undefined ? 0 : (WORD_MAGNITUDES[suffix] ?? CURRENCY_SUFFIXES[suffix] ?? 0);
    return { value: shiftDecimal(groups.camount ?? '', exponent), unit: CURRENCIES[groups.cur] };
  }
  const exponent = groups.kmag !== undefined ? 3 : groups.wmag !== undefined ? (WORD_MAGNITUDES[groups.wmag] ?? 0) : 0;
  const value = shiftDecimal(groups.amount ?? '', exponent);
  return groups.unit === undefined ? { value } : { value, unit: canonicalUnit(groups.unit.replace(/\s+/g, ' ')) };
}

// --- Dates ------------------------------------------------------------------

/** A date in canonical form: `iso` is `YYYY-MM-DD`, `YYYY-MM` or `YYYY`, matching `precision`. */
export interface ParsedDate {
  iso: string;
  precision: 'day' | 'month' | 'year';
}

/** Month names and abbreviations as written in English text, mapped to 1-12. */
export const MONTH_NAMES: Readonly<Record<string, number>> = {
  January: 1,
  Jan: 1,
  February: 2,
  Feb: 2,
  March: 3,
  Mar: 3,
  April: 4,
  Apr: 4,
  May: 5,
  June: 6,
  Jun: 6,
  July: 7,
  Jul: 7,
  August: 8,
  Aug: 8,
  September: 9,
  Sept: 9,
  Sep: 9,
  October: 10,
  Oct: 10,
  November: 11,
  Nov: 11,
  December: 12,
  Dec: 12,
};

const MONTH = `(?:${Object.keys(MONTH_NAMES).join('|')})`;

const ISO_DATE = String.raw`(?<iy>\d{4})-(?<im>\d{2})-(?<id>\d{2})`;
const DAY_MONTH_YEAR = String.raw`(?<dd>\d{1,2})\s(?<dm>${MONTH})\.?,?\s(?<dy>\d{4})`;
const MONTH_DAY_YEAR = String.raw`(?<mm>${MONTH})\.?\s(?<md>\d{1,2}),?\s(?<my>\d{4})`;
const MONTH_YEAR = String.raw`(?<ym>${MONTH})\.?,?\s(?<yy>\d{4})`;
// A bare year is 1900-2100. It is not a year when a currency sign, a decimal
// point or a thousands comma touches it ("$2000", "2026.5"), or when a unit
// follows ("2000 kg"): those are numbers, and the number scanner reads them.
const BARE_YEAR = String.raw`(?<![$\u20AC\u00A3\u20B9.,])(?<!\p{L}-)(?<by>19\d{2}|20\d{2}|2100)(?![.,]\d)(?!\s?(?:${UNIT_SOURCE})(?![\p{L}\p{N}]))`;

/**
 * Regex source for one date token, longest form first: ISO, `24 August 2026`,
 * `August 24, 2026`, `August 2026`, then a bare year. It matches the shape of a
 * date only; `parseDateToken` is what rejects 31 February. The token scanner in
 * tokens.ts compiles this with the `gu` flags.
 */
export const DATE_SOURCE = String.raw`(?<![\p{L}\p{N}])(?:${ISO_DATE}|${DAY_MONTH_YEAR}|${MONTH_DAY_YEAR}|${MONTH_YEAR}|${BARE_YEAR})(?![\p{L}\p{N}])`;

const WHOLE_DATE = new RegExp(`^${DATE_SOURCE}$`, 'u');

const pad = (value: number) => String(value).padStart(2, '0');

/** Days in `month` (1-12) of `year`, leap years included. */
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Parse one date token. The whole of `raw` must be the date. Returns null for
 * an impossible date (31 February, month 13), an unknown format, or a bare year
 * outside 1900-2100.
 */
export function parseDateToken(raw: string): ParsedDate | null {
  const match = WHOLE_DATE.exec(raw.trim().replace(/\s+/g, ' '));
  const groups = match?.groups as Record<string, string | undefined> | undefined;
  if (!groups) return null;
  if (groups.by !== undefined) return { iso: groups.by, precision: 'year' };

  const year = Number(groups.iy ?? groups.dy ?? groups.my ?? groups.yy);
  const monthName = groups.dm ?? groups.mm ?? groups.ym;
  const month = groups.im !== undefined ? Number(groups.im) : MONTH_NAMES[monthName ?? ''];
  if (year < 1000 || month === undefined || month < 1 || month > 12) return null;

  const dayText = groups.id ?? groups.dd ?? groups.md;
  if (dayText === undefined) return { iso: `${year}-${pad(month)}`, precision: 'month' };
  const dayNumber = Number(dayText);
  if (dayNumber < 1 || dayNumber > daysInMonth(year, month)) return null;
  return { iso: `${year}-${pad(month)}-${pad(dayNumber)}`, precision: 'day' };
}

/**
 * The number of days from 1970-01-01 (UTC) to `date`, which must be a real
 * calendar date written exactly YYYY-MM-DD; undefined for anything else
 * (2026-02-30, 2026-8-4, "24 August 2026", a date with a time, a year before
 * 1000). The difference of two day numbers is the number of calendar days
 * between the dates, leap days included, whatever the time zone of the machine.
 */
export function dayNumber(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parseDateToken(date)?.precision !== 'day') return undefined;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Does a date written in a sentence agree with a date a claim licenses? They
 * match when the claim date is equal at the sentence date's precision: a day
 * needs the same day, a month the same month, a year the same year. A claim
 * that is less precise than the sentence (month only, sentence says the 24th)
 * does not match.
 */
export function dateMatches(sentenceDate: ParsedDate, claimIso: string): boolean {
  return claimIso.startsWith(sentenceDate.iso) && !/^\d/.test(claimIso.slice(sentenceDate.iso.length));
}
