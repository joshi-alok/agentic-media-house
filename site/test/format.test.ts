import { describe, expect, it } from 'vitest';
import { CATEGORY_VOCAB } from '@robywire/gate';
import { beatBlurb, beatLabel, documentTitle, formatDate, formatDateTime, plural } from '../src/lib/format';

describe('formatDate', () => {
  it.each([
    ['2026-10-04', '4 Oct 2026'],
    ['2026-01-01', '1 Jan 2026'],
    ['2026-12-31', '31 Dec 2026'],
    ['2026-02-28', '28 Feb 2026'],
    ['2028-02-29', '29 Feb 2028'],
    ['2026-09-09', '9 Sep 2026'],
  ])('writes %s as %s', (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['2026-00-10'], ['2026-10-32'], ['2027-02-29'], ['0050-01-01'], ['4 Oct 2026'], ['2026-10-4'], ['2026-10-04T04:30:00Z'], [''], [' 2026-10-04']])(
    'refuses %j',
    (bad) => {
      expect(() => formatDate(bad)).toThrow(`formatDate: ${JSON.stringify(bad)} is not a date in the form YYYY-MM-DD`);
    },
  );

  it('does not depend on the time zone of the machine', () => {
    const before = process.env.TZ;
    try {
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        process.env.TZ = zone;
        expect(formatDate('2026-10-04')).toBe('4 Oct 2026');
        expect(formatDateTime('2026-10-04T23:59:00Z')).toBe('4 Oct 2026, 23:59 UTC');
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('formatDateTime', () => {
  it.each([
    ['2026-10-04T04:41:12Z', '4 Oct 2026, 04:41 UTC'],
    ['2026-10-03T09:12:00Z', '3 Oct 2026, 09:12 UTC'],
    ['2026-12-31T23:59:59Z', '31 Dec 2026, 23:59 UTC'],
    ['2026-10-04T00:00:00Z', '4 Oct 2026, 00:00 UTC'],
  ])('writes %s as %s', (iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });

  it('converts an offset to UTC', () => {
    expect(formatDateTime('2026-10-04T06:41:12+02:00')).toBe('4 Oct 2026, 04:41 UTC');
    expect(formatDateTime('2026-10-03T23:30:00-05:00')).toBe('4 Oct 2026, 04:30 UTC');
  });

  it('refuses something that is not a date and time', () => {
    expect(() => formatDateTime('yesterday')).toThrow('formatDateTime: "yesterday" is not a date and time');
    expect(() => formatDateTime('2026-10-04')).toThrow('formatDateTime: "2026-10-04" is not a date and time');
    expect(() => formatDateTime('2026-13-45T25:61:00Z')).toThrow('formatDateTime: "2026-13-45T25:61:00Z" is not a date and time');
  });
});

describe('beatLabel', () => {
  it('has a label for every beat and tag in the vocabulary, each different', () => {
    const labels = CATEGORY_VOCAB.map((slug) => beatLabel(slug));
    expect(new Set(labels).size).toBe(CATEGORY_VOCAB.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it('gives the labels the header and the chips show', () => {
    expect(beatLabel('humanoids')).toBe('Humanoids');
    expect(beatLabel('home-consumer')).toBe('Home & consumer');
    expect(beatLabel('industrial-warehouse')).toBe('Industrial & warehouse');
    expect(beatLabel('field-mobility')).toBe('Field & mobility');
    expect(beatLabel('software-autonomy')).toBe('Software & autonomy');
    expect(beatLabel('components-supply-chain')).toBe('Components & supply chain');
    expect(beatLabel('policy-standards')).toBe('Policy & standards');
    expect(beatLabel('funding')).toBe('Funding');
  });

  it('throws on a slug that is not in the vocabulary', () => {
    expect(() => beatLabel('robots')).toThrow('beatLabel: "robots" is not a beat or a tag');
    expect(() => beatLabel('')).toThrow('beatLabel: "" is not a beat or a tag');
    expect(() => beatLabel('constructor')).toThrow('beatLabel: "constructor" is not a beat or a tag');
  });
});

describe('beatBlurb', () => {
  it('has one sentence for every beat and tag, each different and each ending in a full stop', () => {
    const blurbs = CATEGORY_VOCAB.map((slug) => beatBlurb(slug));
    expect(new Set(blurbs).size).toBe(CATEGORY_VOCAB.length);
    for (const blurb of blurbs) expect(blurb.endsWith('.'), blurb).toBe(true);
  });

  it('says what the beat covers, as the content contract does', () => {
    expect(beatBlurb('humanoids')).toBe('General-purpose bipeds and androids, commercial and research.');
    expect(beatBlurb('funding')).toBe('Rounds, acquisitions, public listings and shutdowns, filed under the beat they concern.');
  });

  it('throws on a slug that is not in the vocabulary', () => {
    expect(() => beatBlurb('robots')).toThrow('beatBlurb: "robots" is not a beat or a tag');
    expect(() => beatBlurb('toString')).toThrow('beatBlurb: "toString" is not a beat or a tag');
  });
});

describe('plural', () => {
  it.each([
    [0, '0 claims'],
    [1, '1 claim'],
    [2, '2 claims'],
    [28, '28 claims'],
  ])('writes %i as %s', (n, expected) => {
    expect(plural(n, 'claim', 'claims')).toBe(expected);
  });

  it('uses the words it is given', () => {
    expect(plural(1, 'source', 'sources')).toBe('1 source');
    expect(plural(5, 'hold', 'holds')).toBe('5 holds');
  });
});

// The em dash is written as a code, so this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);

describe('documentTitle', () => {
  it('adds the site name after a dash', () => {
    expect(documentTitle('Humanoids')).toBe(`Humanoids ${EM_DASH} Robywire`);
  });

  it('leaves a title that already names the site as it is', () => {
    expect(documentTitle('Robywire')).toBe('Robywire');
    expect(documentTitle('Robywire: daily robotics news')).toBe('Robywire: daily robotics news');
  });
});
