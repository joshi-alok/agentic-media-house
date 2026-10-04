## Milestone 1 (part A) — Gate core and checks G1–G5

**Goal:** build the machinery the gate is made of (text handling, number and date normalisation, token extraction, limitation templates, the gate runner), the golden fixture that every later test starts from, and the first five deterministic checks: G1 frontmatter, G2 structure, G3 coverage, G4 values and G5 quotes. Everything here is a pure function. Nothing touches the network, a clock, a random number or a model.

**Starting state:** Milestone 0 is finished and committed. `npm run typecheck` and `npm test` pass. `gate/src/` holds `index.ts`, `constants.ts`, `schemas.ts` and `sources.ts`; `gate/test/` holds `smoke.test.ts`, `constants.test.ts`, `schemas.test.ts`, `sources.test.ts` and the test support file `schema-helpers.ts`. `gate/package.json` exports only `"."`. No package needs installing in this milestone.

**The idea in one paragraph.** The Desk writes a news piece as a structured *draft*: a title, a description, an opening, key takeaways, sections of paragraphs, and a list of limitations. Every piece of that is a *sentence* of kind `fact`, `analysis` or `limitation`. A sentence cites *claims* by id. A *claim* is one atomic statement taken from a source: a verbatim quoted span, where it came from (`basis`), how far the capability has got (`status`), and the numbers, dates and names it licenses (`values`). A *check* is a pure function `(input, ctx) => { failures, holdReasons }` that looks at a draft and its claims. The *gate* runs the checks and decides a route: any failure means `revise`, otherwise any hold reason means `hold`, otherwise `publish`. The schemas for all of this already exist in `gate/src/schemas.ts`.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. A character outside ASCII is written as a `\uXXXX` escape (for example `'\u201C'` is a curly opening quote). Type the escapes exactly as shown; never paste the character itself.
- Code style matches Milestone 0: two-space indentation, single quotes, semicolons, trailing commas, `import type` for imports that are only types.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

---

### Task 4: Text utilities

**Files:**
- Create: `gate/src/text.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/text.test.ts`

Several checks count words, compare quotations or measure how alike two titles are. These six functions are the only place the gate handles raw text. The test file is table-driven: each row is one case, and the edge cases are the point. An unterminated quotation mark is not a quotation. An empty pair of quotation marks is dropped. A dash with spaces around it counts as a word, so the golden piece never uses one.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/text.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { countWords, jaccard, normaliseQuotes, quotedSegments, sentenceWords, stripQuoted } from '../src/text';

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['\n\t', 0],
    ['one', 1],
    ['  padded  ', 1],
    ['two words', 2],
    ['tabs\tand\nnewlines  count', 4],
    ['non\u00A0breaking space', 3],
    // A hyphenated, alphanumeric or slashed token is one word.
    ['FX-1', 1],
    ['m/s', 1],
    ['the FX-1 arm moves at 2.3 m/s', 7],
    // A dash with spaces around it is a token of its own and counts. The
    // piece avoids spaced dashes so that body counts are not inflated.
    ['one - two', 3],
  ])('counts %j as %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('normaliseQuotes', () => {
  it.each([
    ['\u201Cquoted\u201D', '"quoted"'],
    ['\u201Equoted\u201F', '"quoted"'],
    ['it\u2019s', "it's"],
    ['\u2018single\u2019', "'single'"],
    ['2026\u201327', '2026-27'],
    ['pause \u2014 here', 'pause - here'],
    ['a\u00A0b', 'a b'],
    ['a   b\t\nc', 'a b c'],
    ['  trimmed  ', 'trimmed'],
    ['', ''],
    ['already "plain" text', 'already "plain" text'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normaliseQuotes(input)).toBe(expected);
  });
});

describe('stripQuoted', () => {
  it.each([
    ['He said "stop" now.', 'He said now.'],
    ['He said \u201Cstop\u201D now.', 'He said now.'],
    ['Mixed \u201Cstop" marks.', 'Mixed marks.'],
    ['One "a" and two "b" quotes.', 'One and two quotes.'],
    ['"Ready," said Jane.', 'said Jane.'],
    ['Only quotes ""', 'Only quotes'],
    ['No quotes here.', 'No quotes here.'],
    ['', ''],
    // An unterminated quote is not a quoted segment: the text stays as it is.
    ['He said "stop now.', 'He said "stop now.'],
    // The third quote mark has no partner, so only the first pair is removed.
    ['a "b" c "d', 'a c "d'],
  ])('turns %j into %j', (input, expected) => {
    expect(stripQuoted(input)).toBe(expected);
  });
});

describe('quotedSegments', () => {
  it.each([
    ['He said "stop now" and "go".', ['stop now', 'go']],
    ['She said \u201CIt\u2019s ready\u201D today.', ["It's ready"]],
    ['A \u201Cmixed" pair', ['mixed']],
    ['Spaces "a   b" collapse', ['a b']],
    ['Trim " padded " inner', ['padded']],
    // Empty segments are noise and are dropped.
    ['Empty "" and "   " quotes', []],
    ['An unterminated "quote', []],
    ['No quotes at all', []],
    ['', []],
  ])('finds the segments of %j', (input, expected) => {
    expect(quotedSegments(input)).toEqual(expected);
  });
});

describe('sentenceWords', () => {
  it.each([
    ['The FX-1 arm, (rated) at 12 kg.', ['The', 'FX-1', 'arm', 'rated', 'at', '12', 'kg']],
    ['Keeps Original CASE', ['Keeps', 'Original', 'CASE']],
    ['Fixture\u2019s arm', ["Fixture's", 'arm']],
    ['U.S. speed 2.3 m/s', ['U.S', 'speed', '2.3', 'm/s']],
    ['pause \u2014 here', ['pause', 'here']],
    ['$450 million!', ['450', 'million']],
    ['"quoted" words', ['quoted', 'words']],
    ['...', []],
    ['', []],
  ])('splits %j into words', (input, expected) => {
    expect(sentenceWords(input)).toEqual(expected);
  });
});

describe('jaccard', () => {
  const set = (...items: string[]) => new Set(items);

  it.each([
    ['identical sets', set('a', 'b'), set('a', 'b'), 1],
    ['disjoint sets', set('a'), set('b'), 0],
    ['half-overlapping sets', set('a', 'b'), set('b', 'c'), 1 / 3],
    ['a subset', set('a'), set('a', 'b'), 0.5],
    ['one empty set', set(), set('a'), 0],
    ['two empty sets', set(), set(), 0],
  ])('scores %s', (_name, a, b, expected) => {
    expect(jaccard(a, b)).toBeCloseTo(expected, 10);
  });

  it('is symmetric', () => {
    const a = set('x', 'y', 'z');
    const b = set('y', 'z', 'w', 'v');
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/text.test.ts`
Expected: FAIL — `Cannot find module '../src/text'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/text.ts`:**
```ts
// Text utilities shared by the gate checks. Pure functions over strings.

/** Characters that open or close a double-quoted segment: straight and curly. */
const DOUBLE_QUOTE_CHARS = '"\u201C\u201D\u201E\u201F';

/** Number of words in `text`: runs of non-whitespace. "FX-1" and "m/s" are one word each. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Fold typographic variants into plain ASCII so that two spellings of the same
 * text compare equal: curly quotes and apostrophes become straight ones, en and
 * em dashes become a hyphen, every kind of space (including NBSP) becomes one
 * space, and the ends are trimmed.
 */
export function normaliseQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface QuotedSpan {
  /** Index of the opening quote mark. */
  start: number;
  /** Index just after the closing quote mark. */
  end: number;
  /** The text between the two quote marks, as written. */
  inner: string;
}

/**
 * Pair up the double-quote marks left to right: the first opens, the second
 * closes, the third opens again, the fourth closes it. Straight and curly marks are
 * interchangeable. A mark left over at the end has no partner, so it does not
 * start a segment.
 */
function findQuoted(text: string): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (!DOUBLE_QUOTE_CHARS.includes(text.charAt(i))) continue;
    if (open < 0) {
      open = i;
    } else {
      spans.push({ start: open, end: i + 1, inner: text.slice(open + 1, i) });
      open = -1;
    }
  }
  return spans;
}

/**
 * `text` without its double-quoted segments (the quote marks go too), with the
 * whitespace left behind collapsed. Quoted text is checked by G5, not by the
 * token checks, so the token checks work on what this returns.
 */
export function stripQuoted(text: string): string {
  let result = '';
  let cursor = 0;
  for (const span of findQuoted(text)) {
    result += text.slice(cursor, span.start);
    cursor = span.end;
  }
  return (result + text.slice(cursor)).replace(/\s+/g, ' ').trim();
}

/** The normalised inner text of each double-quoted segment. Empty segments are dropped. */
export function quotedSegments(text: string): string[] {
  return findQuoted(text)
    .map((span) => normaliseQuotes(span.inner))
    .filter((inner) => inner !== '');
}

/**
 * The words of `text` with the punctuation around each word removed. The case
 * is kept, and punctuation inside a word stays ("FX-1", "m/s", "U.S"). Words
 * that were nothing but punctuation disappear.
 */
export function sentenceWords(text: string): string[] {
  return normaliseQuotes(text)
    .split(' ')
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word !== '');
}

/** Jaccard similarity of two sets: shared items over all items. Two empty sets score 0. */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared++;
  }
  const all = a.size + b.size - shared;
  return all === 0 ? 0 : shared / all;
}
```

Then export it from the package entry point.

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './constants';
export * from './schemas';
export * from './sources';
export * from './text';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/text.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/text.ts gate/test/text.test.ts gate/src/index.ts
git commit -m "feat(gate): add text utilities for word counts, quotes and set similarity" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Number normaliser

**Files:**
- Create: `gate/src/normalise.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/normalise-numbers.test.ts`

Check G4 has to see that "1,200" and "1.2k", or "12 kg" and "12 kilograms", are the same figure, and that "12 kg" and "12 lb" are not. `parseNumberToken` turns one number token into a canonical decimal string and a canonical unit, or returns `null` if the text is not a number. The rules, which the tests pin down:

- Decimal arithmetic is done on strings, never on floating-point numbers, so `1.2k` is exactly `1200`.
- The whole input must be the token: `12 kg` parses, `12 kg extra` does not.
- `k` directly after a number (`1.2k`) means thousand anywhere. The words `thousand`, `million`, `billion` and `trillion` work anywhere. The short forms `M`, `m`, `bn` and `B` are magnitudes only after a currency (`$450M`), because without one a bare `m` is metres and a bare `450M` is not read as a number at all.
- Currency symbols `$ € £ ₹` and the codes `USD EUR GBP INR` give the unit `USD`, `EUR`, `GBP` or `INR`.
- `UNIT_ALIASES` is the single table of unit spellings: metric and imperial mass and length, speed, power and energy, torque, rotation, frequency, time, percent, `DoF` and `TOPS`. A unit missing from the table is simply dropped from a sentence's number, which makes G4 more lenient, so the table covers the units robotics news uses. Spellings are case-sensitive on purpose, so `5 KG` is not read as 5 kg. Units are never converted into each other.
- Digits inside a name or code (`FX-1`, `H1`, `B2B`, `5G`) are not numbers, and neither is a date such as `2026-08-24`.

The file also exports `UNIT_SOURCE` and `NUMBER_SOURCE`, regular-expression sources that the date normaliser (Task 6) and the token scanner (Task 7) build on, so the number grammar is written once.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/normalise-numbers.test.ts`:**
```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/normalise-numbers.test.ts`
Expected: FAIL — `Cannot find module '../src/normalise'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/normalise.ts`:**
```ts
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
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './constants';
export * from './normalise';
export * from './schemas';
export * from './sources';
export * from './text';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/normalise-numbers.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/normalise.ts gate/test/normalise-numbers.test.ts gate/src/index.ts
git commit -m "feat(gate): normalise numbers, units and currency amounts to a canonical form" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Date normaliser

**Files:**
- Modify: `gate/src/normalise.ts` (append the date half)
- Test: `gate/test/normalise-dates.test.ts`

`parseDateToken` turns `2026-08-24`, `24 August 2026`, `24 Aug 2026`, `August 24, 2026`, `Aug 24, 2026`, `August 2026` and `2026` into an ISO string and a precision (`day`, `month` or `year`). It rejects impossible dates (31 February, month 13, 29 February in a non-leap year) and a bare year outside 1900 to 2100. `dateMatches` says whether a date written in a sentence agrees with a date a claim licenses: they match when the claim date is equal at the *sentence's* precision, and a claim that is less precise than the sentence (month only, while the sentence names the 24th) does not match.

`DATE_SOURCE` is the regular-expression source the token scanner uses. A bare year is not read as a year when a currency sign, a decimal point or a thousands comma touches it, or when a unit follows (`2000 kg` is a number).

- [ ] **Step 1: Write the failing test**

**Create `gate/test/normalise-dates.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, dateMatches, parseDateToken } from '../src/normalise';
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/normalise-dates.test.ts`
Expected: FAIL — `parseDateToken is not a function`.

- [ ] **Step 3: Write the implementation**

Append the date half to `gate/src/normalise.ts`. The block to replace is the last function of the file.

**In `gate/src/normalise.ts`, replace:**
```ts
  const value = shiftDecimal(groups.amount ?? '', exponent);
  return groups.unit === undefined ? { value } : { value, unit: canonicalUnit(groups.unit.replace(/\s+/g, ' ')) };
}
```

**with:**
```ts
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
 * Does a date written in a sentence agree with a date a claim licenses? They
 * match when the claim date is equal at the sentence date's precision: a day
 * needs the same day, a month the same month, a year the same year. A claim
 * that is less precise than the sentence (month only, sentence says the 24th)
 * does not match.
 */
export function dateMatches(sentenceDate: ParsedDate, claimIso: string): boolean {
  return claimIso.startsWith(sentenceDate.iso) && !/^\d/.test(claimIso.slice(sentenceDate.iso.length));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/normalise-dates.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/normalise.ts gate/test/normalise-dates.test.ts
git commit -m "feat(gate): normalise dates and match them at the sentence's precision" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Token extraction

**Files:**
- Create: `gate/src/tokens.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/tokens.test.ts`

`extractTokens(sentenceText)` finds the numbers, dates and names in one sentence. G4 will hold each of them against the claims the sentence cites. The rules are fixed:

1. Quoted segments are removed first. G5 checks quotations.
2. Dates are read before numbers and taken out of the text, so `24 August 2026` is one date and no numbers. An impossible date such as `31 February 2026` is not consumed, so its digits come out as numbers that no real date can support.
3. Numbers are digit-led tokens with an optional currency, magnitude and unit. Alphanumeric mixes such as `FX-1`, `H1` and `B2B` are names, not numbers.
4. Names are what remains. The sentence's first word is exempt (every sentence starts with a capital). After that, a word that starts with an uppercase letter, or mixes letters and digits, is a name token: lowercased, with a trailing possessive `'s` and the punctuation around it removed. A multi-word name gives one token per word. En and em dashes are treated as spaces, so a name glued on with a dash is still seen.

Name detection is deliberately strict. A capitalised ordinary word costs one revision round; a missed invented name would cost a wrong claim on the site. It cannot see a name that starts in lowercase (iRobot, xAI) or a number spelled out in words, and the model verifier (G10, Plan 2) covers those. The tests document both limits.

The file also exports `toNameToken` and `nameTokensOf`, the comparison form of a name, which G4 uses on the names a claim lists.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/tokens.test.ts`:**
```ts
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
      names: ['robotics', 'corvane', 'partners'],
    });
  });

  it('keeps the raw text, the canonical value and the unit of each number', () => {
    expect(extractTokens('Peak tool speed is 2.3 m/s, and repeatability is 0.05 mm.')).toEqual({
      numbers: [
        { raw: '2.3 m/s', value: '2.3', unit: 'm/s' },
        { raw: '0.05 mm', value: '0.05', unit: 'mm' },
      ],
      dates: [],
      names: [],
    });
  });

  it('omits the unit key when a number has no unit', () => {
    expect(extractTokens('It does 1,200 picks an hour.').numbers).toEqual([{ raw: '1,200', value: '1200' }]);
  });

  it('returns three empty lists for a sentence with no tokens', () => {
    expect(extractTokens('the arm moves quickly and quietly.')).toEqual({ numbers: [], dates: [], names: [] });
    expect(extractTokens('')).toEqual({ numbers: [], dates: [], names: [] });
  });
});

describe('extractTokens: quoted text is left to G5', () => {
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], names: ['ceo', 'monday'] });
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/tokens.test.ts`
Expected: FAIL — `Cannot find module '../src/tokens'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/tokens.ts`:**
```ts
import { DATE_SOURCE, NUMBER_SOURCE, parseDateToken, parseNumberToken } from './normalise';
import type { ParsedDate, ParsedNumber } from './normalise';
import { normaliseQuotes, sentenceWords, stripQuoted } from './text';

/** A number found in a sentence: the text as written plus its canonical value and unit. */
export interface NumberToken extends ParsedNumber {
  raw: string;
}

/** A date found in a sentence: the text as written plus its canonical ISO form. */
export interface DateToken extends ParsedDate {
  raw: string;
}

export interface SentenceTokens {
  numbers: NumberToken[];
  dates: DateToken[];
  /** Lowercased name tokens, each listed once, in order of first appearance. */
  names: string[];
}

// A date or number that has been read is replaced by this lowercase word. It
// is still a word, so a sentence that opens with a date still has a first word
// (which is exempt from name detection), but it can never be taken for a name.
const FILLER = 'x';

/**
 * Replace each match of `source` that `accept` takes with the filler word.
 * Matches that `accept` refuses stay in the text for the later passes.
 */
function consume(text: string, source: string, accept: (matched: string) => boolean): string {
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(source, 'gu'))) {
    if (!accept(match[0])) continue;
    result += `${text.slice(cursor, match.index)} ${FILLER} `;
    cursor = match.index + match[0].length;
  }
  return result + text.slice(cursor);
}

// A name token starts with an uppercase letter (this includes ALL-CAPS
// acronyms such as CEO and ISO), or mixes letters and digits (FX-1, H1, B2B).
function isNameWord(word: string): boolean {
  return /^\p{Lu}/u.test(word) || (/\p{L}/u.test(word) && /\p{N}/u.test(word));
}

/**
 * The comparison form of a word taken from a name: lowercase, without a
 * trailing possessive, and with the dots taken out of a dotted abbreviation,
 * so "Brindle's" is "brindle" and "U.S" is "us".
 */
export function toNameToken(word: string): string {
  const token = word.toLowerCase().replace(/'s$/, '');
  return /^\p{L}(?:\.\p{L})+$/u.test(token) ? token.replace(/\./g, '') : token;
}

/** The tokens of a name that a claim lists (such as "Brindle Logistics"): every word, in order. */
export function nameTokensOf(name: string): string[] {
  return sentenceWords(name).map(toNameToken);
}

/**
 * Find the numbers, dates and names in one sentence.
 *
 * 1. Quoted segments are removed first. G5 checks quotes.
 * 2. Dates are read before numbers and taken out of the text, so
 *    "24 August 2026" is one date and no numbers.
 * 3. Numbers are digit-led tokens with an optional currency, magnitude and
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits.
 *
 * Name detection is deliberately strict: it reports any capitalised word, so
 * an ordinary capitalised word costs a revision round. It cannot see a name
 * that starts in lowercase (iRobot, xAI) or a number spelled out in words;
 * the model verifier covers those. An impossible date (31 February) is not
 * consumed, so its digits come out as numbers that no real date can support.
 */
export function extractTokens(sentenceText: string): SentenceTokens {
  const text = normaliseQuotes(stripQuoted(sentenceText).replace(/[\u2013\u2014]/g, ' '));
  const dates: DateToken[] = [];
  const numbers: NumberToken[] = [];

  const withoutDates = consume(text, DATE_SOURCE, (matched) => {
    const parsed = parseDateToken(matched);
    if (parsed) dates.push({ raw: matched, ...parsed });
    return parsed !== null;
  });
  const withoutNumbers = consume(withoutDates, NUMBER_SOURCE, (matched) => {
    const parsed = parseNumberToken(matched);
    if (parsed) numbers.push({ raw: matched, ...parsed });
    return parsed !== null;
  });

  const names = sentenceWords(withoutNumbers).slice(1).filter(isNameWord).map(toNameToken);
  return { numbers, dates, names: [...new Set(names)] };
}
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './constants';
export * from './normalise';
export * from './schemas';
export * from './sources';
export * from './text';
export * from './tokens';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/tokens.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/tokens.ts gate/test/tokens.test.ts gate/src/index.ts
git commit -m "feat(gate): extract numbers, dates and names from a sentence" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gate configuration and the runner

**Files:**
- Create: `gate/src/config.ts`, `gate/src/gate.ts`, `gate/src/checks/index.ts`
- Modify: `gate/src/index.ts` (export the new modules)
- Test: `gate/test/config.test.ts`, `gate/test/gate.test.ts`

`config.ts` holds the thresholds the checks read (`GateConfig`), the banned phrases, the allow-list of capitalised words that need no claim (months, weekdays, a few acronyms), and `defaultContext(overrides?)`, which builds the `GateContext` every check receives. It always returns fresh objects, so one test can never change another test's defaults.

`gate.ts` defines the types every check uses (`GateInput`, `Failure`, `Check`, `GateResult`) and the runner. `runGateWith(checks, input, ctx)` runs every check (even after one fails, so one revision round gets every failure), merges their output, marks a check `fail` in the summary if it produced a failure, and picks the route. An error thrown by a check is deliberately not caught: the run fails and nothing publishes.

`checks/index.ts` exports `ALL_CHECKS`, the list `runGate` runs. It starts empty. Each check task adds its check to the list, and a check that is not in the list yet is reported as `pass`, so the summary always has all nine ids.

- [ ] **Step 1: Write the failing tests**

**Create `gate/test/config.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BANNED_PHRASES, DEFAULT_NAME_ALLOW_LIST, defaultConfig, defaultContext } from '../src/config';

describe('defaultConfig', () => {
  it('holds the thresholds from the design spec', () => {
    expect(defaultConfig()).toEqual({
      analysisShareCap: 0.2,
      openingWords: { min: 40, max: 60 },
      takeaways: { min: 3, max: 5 },
      bodyWords: { min: 600, max: 850 },
      descriptionMax: 155,
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
      bannedPhrases: DEFAULT_BANNED_PHRASES,
    });
  });

  it('returns a new object each time, so one caller cannot change another caller defaults', () => {
    const first = defaultConfig();
    first.openingWords.min = 1;
    first.descriptionMax = 1;
    expect(defaultConfig().openingWords.min).toBe(40);
    expect(defaultConfig().descriptionMax).toBe(155);
  });
});

describe('DEFAULT_BANNED_PHRASES', () => {
  it.each([
    "in today's fast-moving world of robotics",
    'game-changer',
    'game changer',
    'revolutionary',
    'groundbreaking',
    'unprecedented',
    'cutting-edge',
    'ever-evolving',
    'delve',
    "it's worth noting",
    'in the realm of',
    'paves the way',
  ])('bans %j', (phrase) => {
    expect(DEFAULT_BANNED_PHRASES).toContain(phrase);
  });

  it('is written in lowercase with plain apostrophes, ready to compare against lowercased text', () => {
    for (const phrase of DEFAULT_BANNED_PHRASES) {
      expect(phrase, phrase).toBe(phrase.toLowerCase());
      expect(phrase, phrase).not.toMatch(/[^\x20-\x7E]/);
    }
  });
});

describe('DEFAULT_NAME_ALLOW_LIST', () => {
  it('allows the twelve month names and the seven weekday names', () => {
    for (const word of [
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ]) {
      expect(DEFAULT_NAME_ALLOW_LIST.has(word), word).toBe(true);
    }
  });

  it('allows the common acronyms', () => {
    for (const word of ['ai', 'ceo', 'cto', 'us', 'uk', 'eu', 'un']) {
      expect(DEFAULT_NAME_ALLOW_LIST.has(word), word).toBe(true);
    }
  });

  it('does not allow a company or product name', () => {
    expect(DEFAULT_NAME_ALLOW_LIST.has('fixture')).toBe(false);
    expect(DEFAULT_NAME_ALLOW_LIST.has('fx-1')).toBe(false);
  });

  it('is entirely lowercase', () => {
    for (const word of DEFAULT_NAME_ALLOW_LIST) {
      expect(word, word).toBe(word.toLowerCase());
    }
  });
});

describe('defaultContext', () => {
  it('starts with the default config, no published slugs, no recent titles and the default allow-list', () => {
    const ctx = defaultContext();
    expect(ctx.config).toEqual(defaultConfig());
    expect(ctx.publishedSlugs.size).toBe(0);
    expect(ctx.recentTitles).toEqual([]);
    expect([...ctx.nameAllowList].sort()).toEqual([...DEFAULT_NAME_ALLOW_LIST].sort());
  });

  it('merges config overrides over the defaults', () => {
    const ctx = defaultContext({ config: { descriptionMax: 100, analysisShareCap: 0.5 } });
    expect(ctx.config.descriptionMax).toBe(100);
    expect(ctx.config.analysisShareCap).toBe(0.5);
    expect(ctx.config.spanMax).toBe(300);
    expect(ctx.config.openingWords).toEqual({ min: 40, max: 60 });
  });

  it('accepts published slugs as any iterable and recent titles as an array', () => {
    const ctx = defaultContext({
      publishedSlugs: ['fixture-robotics-ships-fx-1'],
      recentTitles: ['An earlier title'],
    });
    expect(ctx.publishedSlugs.has('fixture-robotics-ships-fx-1')).toBe(true);
    expect(ctx.recentTitles).toEqual(['An earlier title']);
  });

  it('replaces the allow-list when one is given, and lowercases its words', () => {
    const ctx = defaultContext({ nameAllowList: ['Brindle', 'ACME'] });
    expect([...ctx.nameAllowList].sort()).toEqual(['acme', 'brindle']);
  });

  it('returns a new context each time, so tests cannot leak into each other', () => {
    (defaultContext().nameAllowList as Set<string>).add('leak');
    (defaultContext().publishedSlugs as Set<string>).add('leak');
    defaultContext().config.openingWords.max = 1;
    expect(defaultContext().nameAllowList.has('leak')).toBe(false);
    expect(defaultContext().publishedSlugs.has('leak')).toBe(false);
    expect(defaultContext().config.openingWords.max).toBe(60);
  });
});
```

**Create `gate/test/gate.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS } from '../src/constants';
import type { CheckId } from '../src/constants';
import { defaultContext } from '../src/config';
import { ALL_CHECKS } from '../src/checks';
import { runGate, runGateWith } from '../src/gate';
import type { Check, Failure, GateInput } from '../src/gate';

// A schema-valid draft with nothing in it. These tests are about how results
// are combined, so the checks here are stubs that never look at the input.
const INPUT: GateInput = {
  draft: {
    slug: 'a-slug',
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    author: { name: 'Robywire Desk' },
    title: { kind: 'fact', text: 'A title', claimIds: [] },
    description: { kind: 'fact', text: 'A description', claimIds: [] },
    opening: [],
    takeaways: [],
    sections: [],
    limitations: [],
  },
  claims: [],
};

const failure = (check: CheckId, code: string, where?: string): Failure =>
  where === undefined ? { check, code, message: `${code} happened` } : { check, code, message: `${code} happened`, where };

const passes: Check = () => ({ failures: [], holdReasons: [] });
const fails = (check: CheckId, code: string): Check => () => ({ failures: [failure(check, code)], holdReasons: [] });
const holds = (reason: string): Check => () => ({ failures: [], holdReasons: [reason] });

const run = (checks: Check[]) => runGateWith(checks, INPUT, defaultContext());

describe('runGateWith: the route', () => {
  it('publishes when every check passes', () => {
    const result = run([passes, passes]);
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
  });

  it('sends the draft back for revision when a check fails', () => {
    const result = run([passes, fails('G3', 'G3_NO_CLAIM')]);
    expect(result.route).toBe('revise');
    expect(result.failures).toEqual([failure('G3', 'G3_NO_CLAIM')]);
  });

  it('holds the draft when a check only asks for a hold', () => {
    const result = run([passes, holds('a tier-2 source')]);
    expect(result.route).toBe('hold');
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['a tier-2 source']);
  });

  it('revises, and still reports the hold reasons, when a failure and a hold reason are both present', () => {
    const result = run([holds('a tier-2 source'), fails('G4', 'G4_NUMBER_UNSUPPORTED')]);
    expect(result.route).toBe('revise');
    expect(result.holdReasons).toEqual(['a tier-2 source']);
  });
});

describe('runGateWith: the per-check summary', () => {
  it('lists every check from G1 to G9 as pass when nothing fails', () => {
    const { checks } = run([passes]);
    expect(Object.keys(checks)).toEqual([...CHECK_IDS]);
    expect(Object.values(checks).every((value) => value === 'pass')).toBe(true);
  });

  it('marks only the checks that produced a failure as fail', () => {
    const { checks } = run([fails('G2', 'G2_BODY_LENGTH'), fails('G5', 'G5_QUOTE_NOT_VERBATIM'), passes]);
    expect(checks).toEqual({
      G1: 'pass',
      G2: 'fail',
      G3: 'pass',
      G4: 'pass',
      G5: 'fail',
      G6: 'pass',
      G7: 'pass',
      G8: 'pass',
      G9: 'pass',
    });
  });

  it('keeps a check as pass when it only asked for a hold', () => {
    const { checks } = run([holds('a tier-2 source')]);
    expect(checks.G6).toBe('pass');
  });

  it('passes every check when no checks are registered, which is how checks that are not written yet are treated', () => {
    const result = run([]);
    expect(result.route).toBe('publish');
    expect(Object.values(result.checks).every((value) => value === 'pass')).toBe(true);
  });
});

describe('runGateWith: combining outputs', () => {
  it('lists failures and hold reasons in the order the checks ran', () => {
    const result = run([
      fails('G2', 'G2_A'),
      holds('first hold'),
      () => ({ failures: [failure('G1', 'G1_B'), failure('G1', 'G1_C', 'title')], holdReasons: ['second hold'] }),
    ]);
    expect(result.failures.map((item) => item.code)).toEqual(['G2_A', 'G1_B', 'G1_C']);
    expect(result.failures[2]?.where).toBe('title');
    expect(result.holdReasons).toEqual(['first hold', 'second hold']);
  });

  it('keeps duplicate hold reasons, because a check decides what to report', () => {
    const result = run([holds('same reason'), holds('same reason')]);
    expect(result.holdReasons).toEqual(['same reason', 'same reason']);
  });

  it('runs every check, even after one has failed, so one revision round gets every failure', () => {
    const seen: string[] = [];
    const record = (name: string): Check => () => {
      seen.push(name);
      return { failures: [failure('G1', name)], holdReasons: [] };
    };
    run([record('first'), record('second'), record('third')]);
    expect(seen).toEqual(['first', 'second', 'third']);
  });

  it('hands each check the input and the context', () => {
    const ctx = defaultContext({ publishedSlugs: ['taken'] });
    let received: unknown[] = [];
    runGateWith(
      [
        (input, context) => {
          received = [input, context];
          return { failures: [], holdReasons: [] };
        },
      ],
      INPUT,
      ctx,
    );
    expect(received[0]).toBe(INPUT);
    expect(received[1]).toBe(ctx);
  });

  it('lets an error from a check escape, so the run fails closed instead of publishing', () => {
    const broken: Check = () => {
      throw new Error('check blew up');
    };
    expect(() => run([broken])).toThrow('check blew up');
  });
});

describe('runGate', () => {
  it('runs the checks registered in ALL_CHECKS', () => {
    ALL_CHECKS.push(fails('G9', 'G9_STUB'));
    try {
      const result = runGate(INPUT, defaultContext());
      expect(result.failures.map((item) => item.code)).toContain('G9_STUB');
      expect(result.checks.G9).toBe('fail');
    } finally {
      ALL_CHECKS.pop();
    }
  });

  it('has ALL_CHECKS as a list of check functions', () => {
    expect(Array.isArray(ALL_CHECKS)).toBe(true);
    for (const check of ALL_CHECKS) {
      expect(typeof check).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/config.test.ts test/gate.test.ts`
Expected: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/config.ts`:**
```ts
/** An inclusive range of counts. */
export interface Range {
  min: number;
  max: number;
}

/** The thresholds the checks read. Every one is a value to tune, not a rule to rewrite. */
export interface GateConfig {
  /** G7: the largest share of a piece's sentences that may be analysis. */
  analysisShareCap: number;
  /** G2: words in the opening paragraph. */
  openingWords: Range;
  /** G2: number of key-takeaway bullets. */
  takeaways: Range;
  /** G2: words in the body (opening, takeaways, sections and limitations). */
  bodyWords: Range;
  /** G1: characters in the description. */
  descriptionMax: number;
  /** Characters in a claim's quoted span. The schema allows 300; the extractor stage enforces this. */
  spanMax: number;
  /** G9: a new title whose word overlap with a recent title reaches this is a near-duplicate. */
  titleSimilarityThreshold: number;
  /** G9: phrases that must not appear anywhere in the piece. Lowercase, plain apostrophes. */
  bannedPhrases: readonly string[];
}

/** Filler and hype that the house style does not allow. Compared in lowercase. */
export const DEFAULT_BANNED_PHRASES: readonly string[] = [
  "in today's fast-moving world of robotics",
  'game-changer',
  'game changer',
  'revolutionary',
  'groundbreaking',
  'unprecedented',
  'cutting-edge',
  'ever-evolving',
  'delve',
  "it's worth noting",
  'in the realm of',
  'paves the way',
];

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ACRONYMS = ['ai', 'ceo', 'cto', 'us', 'uk', 'eu', 'un'];

/**
 * Capitalised words that G4 accepts without a claim listing them as a name:
 * month and weekday names and a few common acronyms. Lowercase, because G4
 * compares lowercased name tokens. Add to it when a false positive keeps
 * sending good drafts back.
 */
export const DEFAULT_NAME_ALLOW_LIST: ReadonlySet<string> = new Set([...MONTHS, ...WEEKDAYS, ...ACRONYMS]);

/** A fresh copy of the default thresholds. A new object each time, so no caller can change another's defaults. */
export function defaultConfig(): GateConfig {
  return {
    analysisShareCap: 0.2,
    openingWords: { min: 40, max: 60 },
    takeaways: { min: 3, max: 5 },
    bodyWords: { min: 600, max: 850 },
    descriptionMax: 155,
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
    bannedPhrases: DEFAULT_BANNED_PHRASES,
  };
}

/** Everything a check needs besides the draft and the claims. */
export interface GateContext {
  config: GateConfig;
  /** Slugs of pieces already published (G9 rejects a slug collision). */
  publishedSlugs: ReadonlySet<string>;
  /** Titles of recent pieces (G9 rejects a near-duplicate title). */
  recentTitles: readonly string[];
  /** Lowercase words G4 accepts as names without a claim. */
  nameAllowList: ReadonlySet<string>;
}

export interface ContextOverrides {
  /** Merged over the default thresholds, field by field. */
  config?: Partial<GateConfig>;
  publishedSlugs?: Iterable<string>;
  recentTitles?: readonly string[];
  /** Replaces the default allow-list. Spread DEFAULT_NAME_ALLOW_LIST into it to extend the default. */
  nameAllowList?: Iterable<string>;
}

/** A fresh context with the default thresholds and allow-list and nothing published, plus any overrides. */
export function defaultContext(overrides: ContextOverrides = {}): GateContext {
  return {
    config: { ...defaultConfig(), ...overrides.config },
    publishedSlugs: new Set(overrides.publishedSlugs ?? []),
    recentTitles: overrides.recentTitles ?? [],
    nameAllowList: new Set([...(overrides.nameAllowList ?? DEFAULT_NAME_ALLOW_LIST)].map((word) => word.toLowerCase())),
  };
}
```

**Create `gate/src/checks/index.ts`:**
```ts
import type { Check } from '../gate';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [];
```

**Create `gate/src/gate.ts`:**
```ts
import { ALL_CHECKS } from './checks';
import { CHECK_IDS } from './constants';
import type { CheckId, CheckResult, Route } from './constants';
import type { GateContext } from './config';
import type { Claim, Draft } from './schemas';

export type { CheckId } from './constants';
export { defaultContext } from './config';
export type { GateConfig, GateContext } from './config';

/** What the gate looks at: a draft and every claim it may cite. */
export interface GateInput {
  draft: Draft;
  claims: Claim[];
}

/** One thing a check found wrong. `code` is stable, `message` is for the composer, `where` locates it. */
export interface Failure {
  check: CheckId;
  code: string;
  message: string;
  where?: string;
}

/**
 * What a check returns. `failures` send the draft back for revision.
 * `holdReasons` do not: they say the draft may be fine but needs the owner.
 */
export interface CheckOutput {
  failures: Failure[];
  holdReasons: string[];
}

/** A check is a pure function of the draft, the claims and the context. */
export type Check = (input: GateInput, ctx: GateContext) => CheckOutput;

export interface GateResult {
  route: Route;
  failures: Failure[];
  holdReasons: string[];
  /** All nine ids are always present. A check is 'fail' when it produced a failure. */
  checks: Record<CheckId, CheckResult>;
}

/**
 * Run `checks`, merge what they return, and decide the route: any failure
 * means 'revise'; otherwise any hold reason means 'hold'; otherwise 'publish'.
 * Every check runs, so one revision round gets every failure at once. An error
 * thrown by a check is not caught: the run fails and nothing publishes.
 */
export function runGateWith(checks: readonly Check[], input: GateInput, ctx: GateContext): GateResult {
  const outputs = checks.map((check) => check(input, ctx));
  const failures = outputs.flatMap((output) => output.failures);
  const holdReasons = outputs.flatMap((output) => output.holdReasons);

  const summary = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as Record<CheckId, CheckResult>;
  for (const item of failures) {
    summary[item.check] = 'fail';
  }

  const route: Route = failures.length > 0 ? 'revise' : holdReasons.length > 0 ? 'hold' : 'publish';
  return { route, failures, holdReasons, checks: summary };
}

/** Run every check in `ALL_CHECKS`. */
export function runGate(input: GateInput, ctx: GateContext): GateResult {
  return runGateWith(ALL_CHECKS, input, ctx);
}
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './config';
export * from './constants';
export * from './gate';
export * from './normalise';
export * from './schemas';
export * from './sources';
export * from './text';
export * from './tokens';
```

`gate.ts` re-exports `defaultContext`, `GateConfig`, `GateContext` and `CheckId` so that a check can import everything it needs from one place. The package entry point star-exports both modules; TypeScript and Vitest accept that because both resolve to the same declarations.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/config.test.ts test/gate.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/config.ts gate/src/gate.ts gate/src/checks/index.ts gate/src/index.ts gate/test/config.test.ts gate/test/gate.test.ts
git commit -m "feat(gate): add gate config, context and the runGate skeleton with routing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Limitation templates

**Files:**
- Create: `gate/src/limitations.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/limitations.test.ts`

The "What we couldn't verify" sentences are never freely composed. They are rendered from a claim's metadata through twelve fixed templates, eight for the claim's `basis` and four for its `status`, so a later check (G8) can render the same sentence and compare. In a template, `{v}` stands for the claim's figure followed by a space (the first `number` value, else the first value of any kind, else nothing) and `{label}` for the claim's label. The sentences are fixed word for word: for example a datasheet claim labelled `payload` with the figure `12 kg` renders as "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available."

- [ ] **Step 1: Write the failing test**

**Create `gate/test/limitations.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import { BASIS_TEMPLATES, STATUS_TEMPLATES, renderLimitation } from '../src/limitations';
import type { Claim } from '../src/schemas';

const BASE_CLAIM: Claim = {
  id: 'c-1',
  text: 'The FX-1 arm is rated for a 12 kg payload.',
  label: 'payload',
  type: 'spec',
  source: {
    url: 'https://fixture-robotics.example/products/fx-1/datasheet',
    tier: 1,
    snapshotHash: 'a'.repeat(64),
    retrievedAt: '2026-10-04T04:30:00Z',
  },
  span: { start: 0, end: 20, quote: 'Rated payload: 12 kg' },
  basis: 'datasheet',
  status: 'unspecified',
  values: [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }],
};

const claim = (overrides: Partial<Claim>): Claim => ({ ...BASE_CLAIM, ...overrides });

describe('renderLimitation: basis templates', () => {
  it.each<[Basis, string]>([
    ['datasheet', "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available."],
    ['press-release', 'The 12 kg payload figure comes from a company press release; no independent measurement was available.'],
    ['briefing', 'The 12 kg payload figure was given in a company briefing; no independent measurement was available.'],
    ['demo', 'The payload was shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "The 12 kg payload figure is reported in the authors' paper; it has not been independently reproduced."],
    ['filing', 'The 12 kg payload figure comes from a regulatory filing.'],
    ['standard', 'The payload requirement comes from the published standard.'],
    ['measured', 'The 12 kg payload figure was measured by the source and is reported as stated.'],
  ])('renders the %s template', (basis, expected) => {
    expect(renderLimitation(claim({ basis }), 'basis')).toBe(expected);
  });

  it('has a template for every basis, and no others', () => {
    expect(Object.keys(BASIS_TEMPLATES).sort()).toEqual([...BASES].sort());
  });

  it('matches the example in the design spec', () => {
    const speed = claim({
      label: 'speed',
      values: [{ kind: 'number', raw: '2.3 m/s', normalised: '2.3', unit: 'm/s' }],
    });
    expect(renderLimitation(speed, 'basis')).toBe(
      "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available.",
    );
  });
});

describe('renderLimitation: status templates', () => {
  it.each<[Status, string]>([
    ['demonstrated', 'The top speed was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states the top speed is deployed; no independent confirmation was available.'],
    ['planned', 'The top speed is planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed has been demonstrated or deployed.'],
  ])('renders the %s template', (status, expected) => {
    expect(renderLimitation(claim({ status, label: 'top speed' }), 'status')).toBe(expected);
  });

  it('has a template for every status, and no others', () => {
    expect(Object.keys(STATUS_TEMPLATES).sort()).toEqual([...STATUSES].sort());
  });

  it('never includes the claim value, because a status describes the capability, not a figure', () => {
    expect(renderLimitation(claim({ status: 'deployed' }), 'status')).not.toContain('12 kg');
  });
});

describe('renderLimitation: the value in the sentence', () => {
  it('uses the first number value, even when a name value comes first', () => {
    const mixed = claim({
      values: [
        { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
        { kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' },
        { kind: 'number', raw: '1.4 m', normalised: '1.4', unit: 'm' },
      ],
    });
    expect(renderLimitation(mixed, 'basis')).toBe(
      "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('falls back to the first value when none is a number', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation(named, 'basis')).toBe('The Corvane Partners lead investor figure comes from a regulatory filing.');
  });

  it('leaves the value out, with no stray space, when the claim has none', () => {
    expect(renderLimitation(claim({ values: [] }), 'basis')).toBe(
      "The payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('keeps a dollar sign in a value as it is written', () => {
    const money = claim({
      label: 'funding round',
      basis: 'filing',
      values: [{ kind: 'number', raw: '$450 million', normalised: '450000000', unit: 'USD' }],
    });
    expect(renderLimitation(money, 'basis')).toBe('The $450 million funding round figure comes from a regulatory filing.');
  });

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'name', raw: '{label}', normalised: 'x' }] });
    expect(renderLimitation(odd, 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('is pure: the same claim gives the same sentence and the claim is not changed', () => {
    const input = claim({});
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts`
Expected: FAIL — `Cannot find module '../src/limitations'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/limitations.ts`:**
```ts
import type { Basis, Status } from './constants';
import type { Claim } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. They are
// filled in from a claim's metadata through these fixed templates, so the gate
// can check them by rendering the same sentence and comparing. `{v}` is the
// claim's figure followed by a space (or nothing); `{label}` is the claim's label.

/** What a claim's `basis` tells the reader about where the figure came from. */
export const BASIS_TEMPLATES: Readonly<Record<Basis, string>> = {
  datasheet: "The {v}{label} figure comes from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {v}{label} figure comes from a company press release; no independent measurement was available.',
  briefing: 'The {v}{label} figure was given in a company briefing; no independent measurement was available.',
  demo: 'The {label} was shown in a demonstration; the source does not describe independent testing.',
  paper: "The {v}{label} figure is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'The {v}{label} figure comes from a regulatory filing.',
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
};

/** What a claim's `status` tells the reader about how far the capability has got. */
export const STATUS_TEMPLATES: Readonly<Record<Status, string>> = {
  demonstrated: 'The {label} was demonstrated; the source does not report it in commercial deployment.',
  deployed: 'The company states the {label} is deployed; no independent confirmation was available.',
  planned: 'The {label} is planned, not delivered.',
  unspecified: 'The source does not say whether the {label} has been demonstrated or deployed.',
};

/**
 * The claim's figure as it is written in the source, followed by a space: the
 * first number value, else the first value of any kind, else nothing.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
  return value === undefined ? '' : `${value.raw} `;
}

/** Render the limitation sentence for `claim` through the `basis` or the `status` template. */
export function renderLimitation(claim: Claim, template: 'basis' | 'status'): string {
  const text = template === 'basis' ? BASIS_TEMPLATES[claim.basis] : STATUS_TEMPLATES[claim.status];
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label)\}/g, (_placeholder, name: string) => (name === 'v' ? figureOf(claim) : claim.label));
}
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './config';
export * from './constants';
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './schemas';
export * from './sources';
export * from './text';
export * from './tokens';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/limitations.ts gate/test/limitations.test.ts gate/src/index.ts
git commit -m "feat(gate): render limitation sentences from claim metadata with frozen templates" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The golden fixture, part 1: claims

**Files:**
- Modify: `gate/package.json` (add the `./fixtures` export)
- Create: `gate/src/fixtures/golden.ts`, `gate/src/fixtures/index.ts`
- Test: `gate/test/golden-claims.test.ts`

The *golden* fixture is one complete, fictional news piece that passes every check. Every later test copies it, breaks one thing, and expects the matching check to notice. The story is invented: a company called Fixture Robotics ships its FX-1 warehouse arm to a second plant, run by a customer called Brindle Logistics. All URLs are on `*.example` domains. The fixture is exported as `@robywire/gate/fixtures`, a separate entry point that the main `@robywire/gate` entry does not re-export, so production code cannot import it by accident.

This task adds the 28 claims. They come from five invented sources (a press release, a datasheet, a regulatory filing, a customer's results page, a demo day), use the bases `press-release`, `datasheet`, `filing`, `measured` and `demo`, and use every status and every claim type. A snapshot hash is the SHA-256 of the URL followed by the quote, computed with `node:crypto`, so it is deterministic. Every value's raw text appears literally in its claim's quote, and the claims are chosen so that the figures can be written two ways: a claim says `1.2k` or `USD 450 million` or `18 per cent` or `12 kilograms` or `2026-09-29` while the piece says `1,200`, `$450 million`, `18%`, `12 kg` or `29 September 2026`. That is how the golden piece exercises every normaliser. The originals are frozen all the way down.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/golden-claims.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { BASES, CLAIM_TYPES, STATUSES } from '../src/constants';
import { defaultConfig } from '../src/config';
import { GOLDEN_CLAIMS } from '../src/fixtures';
import { parseDateToken, parseNumberToken } from '../src/normalise';
import { Claim } from '../src/schemas';
import { expectValid } from './schema-helpers';

const rawValues = GOLDEN_CLAIMS.flatMap((claim) => claim.values.map((value) => value.raw));

describe('GOLDEN_CLAIMS: shape', () => {
  it('has about two dozen claims with unique ids', () => {
    expect(GOLDEN_CLAIMS.length).toBeGreaterThanOrEqual(20);
    const ids = GOLDEN_CLAIMS.map((claim) => claim.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GOLDEN_CLAIMS.map((claim) => [claim.id, claim] as const))('%s is a valid Claim', (_id, claim) => {
    expectValid(Claim, claim);
  });

  it('draws every claim from a tier-1 source on a fictional *.example domain', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.source.tier, claim.id).toBe(1);
      expect(new URL(claim.source.url).hostname, claim.id).toMatch(/\.example$/);
      expect(claim.source.outlet, claim.id).toBeUndefined();
    }
  });

  it('retrieves every snapshot at one fixed time', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.source.retrievedAt, claim.id).toBe('2026-10-04T04:30:00Z');
    }
  });
});

describe('GOLDEN_CLAIMS: spans and hashes', () => {
  it('ends every span exactly quote.length after it starts, within the span limit', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.span.end, claim.id).toBe(claim.span.start + claim.span.quote.length);
      expect(claim.span.quote.length, claim.id).toBeLessThanOrEqual(defaultConfig().spanMax);
    }
  });

  it('hashes the url followed by the quote with SHA-256, so every hash is deterministic and different', async () => {
    const { createHash } = await import('node:crypto');
    for (const claim of GOLDEN_CLAIMS) {
      const expected = createHash('sha256')
        .update(claim.source.url + claim.span.quote)
        .digest('hex');
      expect(claim.source.snapshotHash, claim.id).toBe(expected);
    }
    const hashes = GOLDEN_CLAIMS.map((claim) => claim.source.snapshotHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('has every value written literally inside its own span quote', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values) {
        expect(claim.span.quote, `${claim.id}: ${value.raw}`).toContain(value.raw);
      }
    }
  });
});

describe('GOLDEN_CLAIMS: values agree with the normalisers', () => {
  it('lists a normalised value and unit that parseNumberToken also derives from the raw text', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'number')) {
        const parsed = parseNumberToken(value.raw);
        expect(parsed?.value, `${claim.id}: ${value.raw}`).toBe(value.normalised);
        expect(parsed?.unit, `${claim.id}: ${value.raw}`).toBe(value.unit);
      }
    }
  });

  it('lists the ISO date that parseDateToken derives from the raw text', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'date')) {
        expect(parseDateToken(value.raw)?.iso, `${claim.id}: ${value.raw}`).toBe(value.normalised);
      }
    }
  });

  it('lists names in lowercase as their normalised form', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'name')) {
        expect(value.normalised, claim.id).toBe(value.raw.toLowerCase());
      }
    }
  });

  it('puts the number first in every number-type claim, because the fact card shows that value', () => {
    for (const claim of GOLDEN_CLAIMS.filter((item) => item.type === 'number')) {
      expect(claim.values[0]?.kind, claim.id).toBe('number');
    }
    expect(GOLDEN_CLAIMS.filter((item) => item.type === 'number').length).toBeGreaterThanOrEqual(3);
  });

  it('spells figures in every family the normalisers handle', () => {
    expect(rawValues).toContain('1.2k');
    expect(rawValues).toContain('$38,000');
    expect(rawValues).toContain('12 kilograms');
    expect(rawValues).toContain('2.3 metres per second');
    expect(rawValues).toContain('18 per cent');
    expect(rawValues).toContain('USD 450 million');
    expect(rawValues).toContain('2026-09-29');
    expect(rawValues).toContain('1 October 2026');
    expect(rawValues).toContain('2027');
  });
});

describe('GOLDEN_CLAIMS: coverage of the vocabularies', () => {
  it('uses datasheet, press-release, filing, measured and demo bases', () => {
    const bases = new Set(GOLDEN_CLAIMS.map((claim) => claim.basis));
    for (const basis of ['datasheet', 'press-release', 'filing', 'measured', 'demo']) {
      expect(bases.has(basis as (typeof BASES)[number]), basis).toBe(true);
    }
  });

  it('uses every status', () => {
    const statuses = new Set(GOLDEN_CLAIMS.map((claim) => claim.status));
    expect([...statuses].sort()).toEqual([...STATUSES].sort());
  });

  it('uses every claim type', () => {
    const types = new Set(GOLDEN_CLAIMS.map((claim) => claim.type));
    expect([...types].sort()).toEqual([...CLAIM_TYPES].sort());
  });
});

describe('GOLDEN_CLAIMS: protection', () => {
  it('is frozen all the way down, so a test cannot change it by accident', () => {
    expect(Object.isFrozen(GOLDEN_CLAIMS)).toBe(true);
    const first = GOLDEN_CLAIMS[0] as (typeof GOLDEN_CLAIMS)[number];
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.span)).toBe(true);
    expect(Object.isFrozen(first.values)).toBe(true);
    expect(() => {
      first.label = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      first.values.push({ kind: 'name', raw: 'X', normalised: 'x' });
    }).toThrow(TypeError);
  });

  it('is reachable by package name through the fixtures export', async () => {
    const linked = await import('@robywire/gate/fixtures');
    expect(linked.GOLDEN_CLAIMS).toBe(GOLDEN_CLAIMS);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/golden-claims.test.ts`
Expected: FAIL — `"./fixtures" is not exported under the conditions`.

- [ ] **Step 3: Write the implementation**

Add the export entry. `gate/package.json` gets a second `exports` key and nothing else changes.

**Replace `gate/package.json` with:**
```json
{
  "name": "@robywire/gate",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Pure-function checks G1-G9 that decide whether a draft may publish.",
  "exports": {
    ".": "./src/index.ts",
    "./fixtures": "./src/fixtures/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "yaml": "2.9.1",
    "zod": "4.6.5"
  }
}
```

**Create `gate/src/fixtures/index.ts`:**
```ts
export * from './golden';
```

**Create `gate/src/fixtures/golden.ts`:**
```ts
import { createHash } from 'node:crypto';
import type { Claim, ClaimValue } from '../schemas';

// The golden fixture: one complete, fictional news piece that passes every
// check. Fixture Robotics, the FX-1 arm, Brindle Logistics and every URL on a
// *.example domain are invented. Tests copy it (cloneGolden), change one thing
// and expect the matching check to notice.

const RETRIEVED_AT = '2026-10-04T04:30:00Z';

const RELEASE = 'https://fixture-robotics.example/news/fx-1-second-plant';
const DATASHEET = 'https://fixture-robotics.example/products/fx-1/datasheet';
const FILING = 'https://filings.example/fixture-robotics/offering-2026';
const CUSTOMER = 'https://brindle-logistics.example/news/ashvale-results';
const DEMO_DAY = 'https://fixture-robotics.example/events/demo-day';

const name = (raw: string): ClaimValue => ({ kind: 'name', raw, normalised: raw.toLowerCase() });
const date = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
const number = (raw: string, normalised: string, unit?: string): ClaimValue =>
  unit === undefined ? { kind: 'number', raw, normalised } : { kind: 'number', raw, normalised, unit };

interface ClaimSpec extends Omit<Claim, 'source' | 'span'> {
  url: string;
  start: number;
  quote: string;
}

// The snapshot hash is the SHA-256 of the URL followed by the quote: not the
// hash of a real page, but deterministic and different for every claim.
function claim({ url, start, quote, ...rest }: ClaimSpec): Claim {
  return {
    ...rest,
    source: {
      url,
      tier: 1,
      snapshotHash: createHash('sha256')
        .update(url + quote)
        .digest('hex'),
      retrievedAt: RETRIEVED_AT,
    },
    span: { start, end: start + quote.length, quote },
  };
}

// The originals are frozen all the way down, so a test that forgets to copy
// them fails loudly instead of changing the fixture for every later test.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Twenty-eight claims from five sources. The bases are press-release,
// datasheet, filing, measured and demo; the statuses are unspecified,
// deployed, demonstrated and planned.
const CLAIMS: Claim[] = [
  // --- Fixture Robotics press release ---
  claim({
    id: 'c-1',
    text: 'Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.',
    label: 'Tarnmoor shipment',
    type: 'event',
    url: RELEASE,
    start: 112,
    quote:
      'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    basis: 'press-release',
    status: 'unspecified',
    values: [name('Fixture Robotics'), name('FX-1'), name('Brindle Logistics'), name('Tarnmoor')],
  }),
  claim({
    id: 'c-2',
    text: 'Fixture Robotics announced the shipments on 1 October 2026.',
    label: 'announcement date',
    type: 'date',
    url: RELEASE,
    start: 0,
    quote: 'Tarnmoor, 1 October 2026: Fixture Robotics announced that deliveries have started.',
    basis: 'press-release',
    status: 'unspecified',
    values: [date('1 October 2026', '2026-10-01')],
  }),
  claim({
    id: 'c-3',
    text: 'The FX-1 mounts on existing conveyor frames without a new safety cage.',
    label: 'retrofit mounting',
    type: 'spec',
    url: RELEASE,
    start: 278,
    quote: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.',
    basis: 'press-release',
    status: 'unspecified',
    values: [name('FX-1')],
  }),
  claim({
    id: 'c-4',
    text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 12 weeks of an order.',
    label: 'list price',
    type: 'number',
    url: RELEASE,
    start: 391,
    quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.',
    basis: 'press-release',
    status: 'unspecified',
    values: [number('$38,000', '38000', 'USD'), number('12', '12'), name('Fixture Robotics'), name('FX-1')],
  }),
  claim({
    id: 'c-5',
    text: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    label: 'Tarnmoor delivery schedule',
    type: 'event',
    url: RELEASE,
    start: 498,
    quote: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Tarnmoor'), number('60', '60'), date('30 November 2026', '2026-11-30')],
  }),
  claim({
    id: 'c-6',
    text: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    label: 'production plan',
    type: 'event',
    url: RELEASE,
    start: 559,
    quote: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Fixture Robotics'), name('FX-1'), number('500', '500'), date('2027', '2027')],
  }),
  claim({
    id: 'c-7',
    text: 'Fixture Robotics will use the funds to expand FX-1 production.',
    label: 'use of funds',
    type: 'event',
    url: RELEASE,
    start: 620,
    quote: 'Fixture Robotics said it will use the funds to expand FX-1 production.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Fixture Robotics'), name('FX-1')],
  }),
  // --- FX-1 datasheet ---
  claim({
    id: 'c-8',
    text: 'The FX-1 is rated for a payload of 12 kg at full reach.',
    label: 'payload',
    type: 'spec',
    url: DATASHEET,
    start: 340,
    quote: 'Rated payload: 12 kilograms at full reach.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('12 kilograms', '12', 'kg')],
  }),
  claim({
    id: 'c-9',
    text: 'The FX-1 has a maximum reach of 1.4 m.',
    label: 'reach',
    type: 'spec',
    url: DATASHEET,
    start: 392,
    quote: 'Maximum reach: 1.4 metres from the base.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('1.4 metres', '1.4', 'm')],
  }),
  claim({
    id: 'c-10',
    text: 'The FX-1 has a peak tool speed of 2.3 m/s.',
    label: 'top speed',
    type: 'spec',
    url: DATASHEET,
    start: 441,
    quote: 'Peak tool speed: 2.3 metres per second.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('2.3 metres per second', '2.3', 'm/s')],
  }),
  claim({
    id: 'c-11',
    text: 'The FX-1 repeats a position to within 0.05 mm.',
    label: 'repeatability',
    type: 'spec',
    url: DATASHEET,
    start: 488,
    quote: 'Repeatability: 0.05 mm.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('0.05 mm', '0.05', 'mm')],
  }),
  claim({
    id: 'c-12',
    text: 'The FX-1 can pick up to 1,200 items an hour.',
    label: 'pick rate',
    type: 'spec',
    url: DATASHEET,
    start: 520,
    quote: 'Throughput: up to 1.2k picks an hour.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('1.2k', '1200')],
  }),
  claim({
    id: 'c-13',
    text: 'The FX-1 weighs 38 kg.',
    label: 'arm mass',
    type: 'spec',
    url: DATASHEET,
    start: 575,
    quote: 'Arm mass: 38 kg.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('38 kg', '38', 'kg')],
  }),
  claim({
    id: 'c-14',
    text: 'The FX-1 draws 650 W in typical use.',
    label: 'power draw',
    type: 'spec',
    url: DATASHEET,
    start: 600,
    quote: 'Typical power draw: 650 W.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('650 W', '650', 'W')],
  }),
  claim({
    id: 'c-15',
    text: 'The FX-1 has an ingress protection rating of IP54.',
    label: 'ingress protection',
    type: 'spec',
    url: DATASHEET,
    start: 640,
    quote: 'Ingress protection: IP54, suitable for dusty warehouse floors.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [name('IP54')],
  }),
  // --- Regulatory filing ---
  claim({
    id: 'c-16',
    text: 'The offering recorded in the filing had its first sale on 29 September 2026.',
    label: 'first-sale date',
    type: 'date',
    url: FILING,
    start: 210,
    quote: 'Date of first sale: 2026-09-29',
    basis: 'filing',
    status: 'unspecified',
    values: [date('2026-09-29', '2026-09-29')],
  }),
  claim({
    id: 'c-17',
    text: 'The offering raised USD 450 million.',
    label: 'funding round',
    type: 'number',
    url: FILING,
    start: 268,
    quote: 'Total amount sold: USD 450 million',
    basis: 'filing',
    status: 'unspecified',
    values: [number('USD 450 million', '450000000', 'USD')],
  }),
  claim({
    id: 'c-18',
    text: 'Corvane Partners led the offering.',
    label: 'lead investor',
    type: 'name',
    url: FILING,
    start: 330,
    quote: 'Lead investor: Corvane Partners',
    basis: 'filing',
    status: 'unspecified',
    values: [name('Corvane Partners')],
  }),
  claim({
    id: 'c-19',
    text: 'Seven investors took part in the offering.',
    label: 'investor count',
    type: 'number',
    url: FILING,
    start: 372,
    quote: 'Total number of investors: 7',
    basis: 'filing',
    status: 'unspecified',
    values: [number('7', '7')],
  }),
  // --- Brindle Logistics results ---
  claim({
    id: 'c-20',
    text: 'Brindle Logistics measured an 18 per cent cut in cycle time at Ashvale.',
    label: 'cycle-time cut',
    type: 'number',
    url: CUSTOMER,
    start: 84,
    quote:
      'At Ashvale, Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells, comparing the four weeks before and after the FX-1 arms went live.',
    basis: 'measured',
    status: 'deployed',
    values: [number('18 per cent', '18', '%'), name('Ashvale'), name('Brindle Logistics'), name('FX-1')],
  }),
  claim({
    id: 'c-21',
    text: 'Ashvale averaged 940 picks an hour per arm over the same weeks.',
    label: 'measured pick rate',
    type: 'number',
    url: CUSTOMER,
    start: 251,
    quote: 'Across the same weeks, Ashvale averaged 940 picks an hour per arm.',
    basis: 'measured',
    status: 'deployed',
    values: [number('940', '940'), name('Ashvale')],
  }),
  claim({
    id: 'c-22',
    text: 'Dana Whitcombe of Brindle Logistics said the plant went from pilot to production in nine weeks.',
    label: 'pilot-to-production time',
    type: 'quote',
    url: CUSTOMER,
    start: 410,
    quote:
      '"We went from pilot to production in nine weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.',
    basis: 'press-release',
    status: 'deployed',
    values: [name('Dana Whitcombe'), name('Brindle Logistics')],
  }),
  claim({
    id: 'c-23',
    text: 'Brindle Logistics runs 40 FX-1 arms at its Ashvale plant.',
    label: 'Ashvale installation',
    type: 'event',
    url: CUSTOMER,
    start: 0,
    quote: 'Brindle Logistics now runs 40 FX-1 arms at its Ashvale plant.',
    basis: 'press-release',
    status: 'deployed',
    values: [number('40', '40'), name('Brindle Logistics'), name('FX-1'), name('Ashvale')],
  }),
  claim({
    id: 'c-24',
    text: 'The Brindle Logistics installation at Ashvale went live on 18 August 2026.',
    label: 'Ashvale go-live date',
    type: 'date',
    url: CUSTOMER,
    start: 62,
    quote: 'The Brindle Logistics installation at Ashvale went live on 18 August 2026.',
    basis: 'press-release',
    status: 'deployed',
    values: [date('18 August 2026', '2026-08-18'), name('Brindle Logistics'), name('Ashvale')],
  }),
  claim({
    id: 'c-25',
    text: 'Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.',
    label: 'Tarnmoor use',
    type: 'event',
    url: CUSTOMER,
    start: 520,
    quote: 'Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Brindle Logistics'), name('Tarnmoor')],
  }),
  claim({
    id: 'c-26',
    text: 'Brindle Logistics plans to add a third site in 2027.',
    label: 'third-site rollout',
    type: 'event',
    url: CUSTOMER,
    start: 604,
    quote: 'Brindle Logistics plans to add a third site in 2027.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Brindle Logistics'), date('2027', '2027')],
  }),
  // --- Demo day ---
  claim({
    id: 'c-27',
    text: 'Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
    label: 'trailer unloading',
    type: 'event',
    url: DEMO_DAY,
    start: 150,
    quote: 'At its demo day, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
    basis: 'demo',
    status: 'demonstrated',
    values: [name('Fixture Robotics'), name('FX-1')],
  }),
  claim({
    id: 'c-28',
    text: 'The demo day was held on 24 September 2026.',
    label: 'demo day',
    type: 'date',
    url: DEMO_DAY,
    start: 20,
    quote: 'Demo day was held on 24 September 2026 in the three-bay test hall.',
    basis: 'demo',
    status: 'demonstrated',
    values: [date('24 September 2026', '2026-09-24')],
  }),
];

export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/golden-claims.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/package.json gate/src/fixtures gate/test/golden-claims.test.ts
git commit -m "feat(gate): add the golden fixture's claims behind the fixtures package export" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The golden fixture, part 2: the draft

**Files:**
- Modify: `gate/src/fixtures/golden.ts` (add the draft, `GOLDEN_DRAFT` and `cloneGolden`)
- Test: `gate/test/golden-draft.test.ts`

The draft is the piece that cites those claims. Its shape is fixed so that later tests can rely on it: slug `fixture-robotics-ships-fx-1-to-second-plant`, published `2026-10-04`, categories `industrial-warehouse` and `funding`, author `Robywire Desk`; a description of at most 155 characters; an opening of three sentences and 40 to 60 words; four takeaways; three sections with declarative headings and two or three paragraphs each; exactly one analysis sentence, inside a section, that introduces no number, date or name; exactly one double-quoted passage, word for word from a cited claim; and 15 limitation sentences produced by calling `renderLimitation`, so the templates and the fixture can never drift apart. The body (opening, takeaways, sections and limitations) is 640 to 720 words, so an edit of a few dozen words cannot push it out of the 600 to 850 limit. It avoids every banned phrase, and it never uses a dash with spaces around it.

`cloneGolden()` returns `{ draft, claims }`, a deep copy. Tests change copies, never the originals, which are frozen so a test that forgets to copy fails loudly.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/golden-draft.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig, DEFAULT_BANNED_PHRASES } from '../src/config';
import { CATEGORY_VOCAB } from '../src/constants';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { renderLimitation } from '../src/limitations';
import { Draft } from '../src/schemas';
import type { Sentence } from '../src/schemas';
import { countWords, normaliseQuotes, quotedSegments } from '../src/text';
import { extractTokens } from '../src/tokens';
import { expectValid } from './schema-helpers';

const words = (sentences: Sentence[]) => sentences.reduce((total, sentence) => total + countWords(sentence.text), 0);
const bodySentences = GOLDEN_DRAFT.sections.flatMap((section) => section.paragraphs.flat());
const everySentence: Sentence[] = [
  GOLDEN_DRAFT.title,
  GOLDEN_DRAFT.description,
  ...GOLDEN_DRAFT.opening,
  ...GOLDEN_DRAFT.takeaways,
  ...bodySentences,
  ...GOLDEN_DRAFT.limitations,
];
const claimIds = new Set(GOLDEN_CLAIMS.map((claim) => claim.id));

describe('GOLDEN_DRAFT: frontmatter', () => {
  it('is a valid Draft', () => {
    expectValid(Draft, GOLDEN_DRAFT);
  });

  it('has the slug, date, categories and author the design calls for', () => {
    expect(GOLDEN_DRAFT.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
    expect(GOLDEN_DRAFT.publishedAt).toBe('2026-10-04');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_DRAFT.author).toEqual({ name: 'Robywire Desk' });
    for (const category of GOLDEN_DRAFT.categories) {
      expect(CATEGORY_VOCAB).toContain(category);
    }
  });

  it('has a title and a description of at most 155 characters, both fact sentences', () => {
    expect(GOLDEN_DRAFT.title.kind).toBe('fact');
    expect(GOLDEN_DRAFT.title.text.length).toBeGreaterThan(0);
    expect(GOLDEN_DRAFT.description.kind).toBe('fact');
    expect(GOLDEN_DRAFT.description.text.length).toBeLessThanOrEqual(defaultConfig().descriptionMax);
  });
});

describe('GOLDEN_DRAFT: structure', () => {
  it('opens with two or three sentences of 40 to 60 words', () => {
    expect(GOLDEN_DRAFT.opening.length).toBeGreaterThanOrEqual(2);
    expect(GOLDEN_DRAFT.opening.length).toBeLessThanOrEqual(3);
    expect(words(GOLDEN_DRAFT.opening)).toBeGreaterThanOrEqual(40);
    expect(words(GOLDEN_DRAFT.opening)).toBeLessThanOrEqual(60);
  });

  it('has four key takeaways', () => {
    expect(GOLDEN_DRAFT.takeaways).toHaveLength(4);
  });

  it('has three sections with declarative headings and two or three paragraphs each', () => {
    expect(GOLDEN_DRAFT.sections).toHaveLength(3);
    for (const section of GOLDEN_DRAFT.sections) {
      expect(section.heading.trim().length, section.heading).toBeGreaterThan(0);
      expect(section.heading, section.heading).not.toMatch(/\?/);
      expect(section.paragraphs.length, section.heading).toBeGreaterThanOrEqual(2);
      expect(section.paragraphs.length, section.heading).toBeLessThanOrEqual(3);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length, section.heading).toBeGreaterThan(0);
      }
    }
  });

  it('has a body of 640 to 720 words, so a small edit stays inside the 600 to 850 limit', () => {
    const total = words(GOLDEN_DRAFT.opening) + words(GOLDEN_DRAFT.takeaways) + words(bodySentences) + words(GOLDEN_DRAFT.limitations);
    expect(total).toBeGreaterThanOrEqual(640);
    expect(total).toBeLessThanOrEqual(720);
  });

  it('ends every sentence except the title with a full stop', () => {
    for (const sentence of everySentence.filter((item) => item !== GOLDEN_DRAFT.title)) {
      expect(sentence.text, sentence.text).toMatch(/\.$/u);
    }
    expect(GOLDEN_DRAFT.title.text).not.toMatch(/[.?!]$/u);
  });
});

describe('GOLDEN_DRAFT: citations', () => {
  it('cites only claims that exist, and gives every fact sentence at least one', () => {
    for (const sentence of everySentence) {
      for (const id of sentence.claimIds) {
        expect(claimIds.has(id), `${id} in "${sentence.text}"`).toBe(true);
      }
      if (sentence.kind === 'fact') {
        expect(sentence.claimIds.length, sentence.text).toBeGreaterThan(0);
      }
    }
  });

  it('cites every claim at least once, so no claim is left over', () => {
    const cited = new Set(everySentence.flatMap((sentence) => sentence.claimIds));
    expect([...claimIds].filter((id) => !cited.has(id))).toEqual([]);
  });
});

describe('GOLDEN_DRAFT: analysis', () => {
  const analyses = bodySentences.filter((sentence) => sentence.kind === 'analysis');

  it('has exactly one analysis sentence, and it is in a section', () => {
    expect(everySentence.filter((sentence) => sentence.kind === 'analysis')).toHaveLength(1);
    expect(analyses).toHaveLength(1);
  });

  it('introduces no number, date or name that a fact sentence does not already contain', () => {
    const facts = everySentence.filter((sentence) => sentence.kind === 'fact').map((sentence) => extractTokens(sentence.text));
    const factNumbers = new Set(facts.flatMap((tokens) => tokens.numbers.map((token) => `${token.value} ${token.unit ?? ''}`)));
    const factDates = new Set(facts.flatMap((tokens) => tokens.dates.map((token) => token.iso)));
    const factNames = new Set(facts.flatMap((tokens) => tokens.names));
    const own = extractTokens(analyses[0]?.text ?? '');
    for (const token of own.numbers) expect(factNumbers.has(`${token.value} ${token.unit ?? ''}`), token.raw).toBe(true);
    for (const token of own.dates) expect(factDates.has(token.iso), token.raw).toBe(true);
    for (const token of own.names) expect(factNames.has(token), token).toBe(true);
  });
});

describe('GOLDEN_DRAFT: quotes', () => {
  const textSentences = everySentence.filter((sentence) => sentence.kind !== 'limitation');

  it('contains exactly one double-quoted passage', () => {
    expect(textSentences.flatMap((sentence) => quotedSegments(sentence.text))).toHaveLength(1);
  });

  it('quotes it word for word from a claim the sentence cites', () => {
    for (const sentence of textSentences) {
      const cited = sentence.claimIds.map((id) => GOLDEN_CLAIMS.find((claim) => claim.id === id));
      for (const segment of quotedSegments(sentence.text)) {
        const found = cited.some((claim) => normaliseQuotes(claim?.span.quote ?? '').includes(segment));
        expect(found, segment).toBe(true);
      }
    }
  });
});

describe('GOLDEN_DRAFT: limitations', () => {
  it('has limitation sentences rendered by renderLimitation from the claim they cite', () => {
    expect(GOLDEN_DRAFT.limitations.length).toBeGreaterThan(0);
    for (const sentence of GOLDEN_DRAFT.limitations) {
      expect(sentence.kind).toBe('limitation');
      expect(sentence.claimIds).toHaveLength(1);
      const cited = GOLDEN_CLAIMS.find((claim) => claim.id === sentence.claimIds[0]);
      expect(cited, sentence.text).toBeDefined();
      expect(sentence.text).toBe(renderLimitation(cited as (typeof GOLDEN_CLAIMS)[number], sentence.template));
    }
  });

  it('never says the same thing twice', () => {
    const texts = GOLDEN_DRAFT.limitations.map((sentence) => sentence.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('describes both the basis and the status of claims', () => {
    expect(GOLDEN_DRAFT.limitations.some((sentence) => sentence.template === 'basis')).toBe(true);
    expect(GOLDEN_DRAFT.limitations.some((sentence) => sentence.template === 'status')).toBe(true);
  });

  it('exists because the piece rests on datasheet, press-release and demo claims', () => {
    const cited = new Set(everySentence.flatMap((sentence) => sentence.claimIds));
    const unsafe = GOLDEN_CLAIMS.filter((claim) => cited.has(claim.id) && !['filing', 'standard', 'paper', 'measured'].includes(claim.basis));
    expect(unsafe.length).toBeGreaterThan(0);
  });
});

describe('GOLDEN_DRAFT: wording', () => {
  it('uses none of the banned phrases', () => {
    const text = [...everySentence.map((sentence) => sentence.text), ...GOLDEN_DRAFT.sections.map((section) => section.heading)]
      .join(' ')
      .toLowerCase();
    for (const phrase of DEFAULT_BANNED_PHRASES) {
      expect(text, phrase).not.toContain(phrase);
    }
  });

  it('writes figures in the forms the normalisers must reconcile with the claims', () => {
    const text = everySentence.map((sentence) => sentence.text).join(' ');
    for (const written of ['1,200 picks', '$450 million', '18%', '12 kg', '2.3 m/s', '1.4 m', '29 September 2026', '1 October 2026', '2027']) {
      expect(text, written).toContain(written);
    }
    const raws = GOLDEN_CLAIMS.flatMap((claim) => claim.values.map((value) => value.raw));
    for (const raw of ['1.2k', 'USD 450 million', '18 per cent', '12 kilograms', '2.3 metres per second', '2026-09-29']) {
      expect(raws, raw).toContain(raw);
    }
  });
});

describe('cloneGolden', () => {
  it('returns the draft and claims, equal to the originals', () => {
    const copy = cloneGolden();
    expect(copy.draft).toEqual(GOLDEN_DRAFT);
    expect(copy.claims).toEqual(GOLDEN_CLAIMS);
  });

  it('returns a deep copy that shares nothing with the originals', () => {
    const copy = cloneGolden();
    expect(copy.draft).not.toBe(GOLDEN_DRAFT);
    expect(copy.draft.sections[0]).not.toBe(GOLDEN_DRAFT.sections[0]);
    expect(copy.draft.sections[0]?.paragraphs[0]?.[0]).not.toBe(GOLDEN_DRAFT.sections[0]?.paragraphs[0]?.[0]);
    expect(copy.claims).not.toBe(GOLDEN_CLAIMS);
    expect(copy.claims[0]).not.toBe(GOLDEN_CLAIMS[0]);
    expect(copy.claims[0]?.values).not.toBe(GOLDEN_CLAIMS[0]?.values);
  });

  it('returns a copy that tests can change without touching the originals', () => {
    const copy = cloneGolden();
    copy.draft.title.text = 'changed';
    copy.draft.categories.push('humanoids');
    copy.claims[0]!.label = 'changed';
    copy.claims.pop();
    expect(GOLDEN_DRAFT.title.text).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_CLAIMS[0]?.label).toBe('Tarnmoor shipment');
    expect(cloneGolden().claims).toHaveLength(GOLDEN_CLAIMS.length);
  });

  it('leaves the originals frozen, so a test that forgets to copy fails loudly', () => {
    expect(Object.isFrozen(GOLDEN_DRAFT)).toBe(true);
    expect(Object.isFrozen(GOLDEN_DRAFT.sections[0]?.paragraphs[0]?.[0])).toBe(true);
    expect(() => {
      GOLDEN_DRAFT.title.text = 'changed';
    }).toThrow(TypeError);
  });

  it('is reachable by package name through the fixtures export', async () => {
    const linked = await import('@robywire/gate/fixtures');
    expect(linked.cloneGolden().draft.slug).toBe(GOLDEN_DRAFT.slug);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/golden-draft.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'sections')`.

- [ ] **Step 3: Write the implementation**

Two edits to `gate/src/fixtures/golden.ts`. The first adds the imports the draft needs.

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
import { createHash } from 'node:crypto';
import type { Claim, ClaimValue } from '../schemas';

// The golden fixture: one complete, fictional news piece that passes every
// check. Fixture Robotics, the FX-1 arm, Brindle Logistics and every URL on a
```

**with:**
```ts
import { createHash } from 'node:crypto';
import { renderLimitation } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence, LimitationSentence } from '../schemas';

// The golden fixture: one complete, fictional news piece that passes every
// check. Fixture Robotics, the FX-1 arm, Brindle Logistics and every URL on a
```

The second replaces the last line of the file (the export of the claims) with itself followed by the draft, its export and `cloneGolden`.

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
];

export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);
```

**with:**
```ts
];

export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);

const claimById = (id: string): Claim => {
  const found = CLAIMS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`the golden fixture has no claim ${id}`);
  return found;
};

const fact = (text: string, ...claimIds: string[]): FactSentence => ({ kind: 'fact', text, claimIds });
const analysis = (text: string, ...claimIds: string[]): AnalysisSentence => ({ kind: 'analysis', text, claimIds });
// A limitation sentence is rendered from the claim it describes, so the
// fixture and the gate's templates cannot drift apart.
const limitation = (id: string, template: 'basis' | 'status'): LimitationSentence => ({
  kind: 'limitation',
  text: renderLimitation(claimById(id), template),
  claimIds: [id],
  template,
});

const DRAFT: Draft = {
  slug: 'fixture-robotics-ships-fx-1-to-second-plant',
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: 'Robywire Desk' },
  title: fact('Fixture Robotics ships its FX-1 warehouse arm to a second plant', 'c-1'),
  description: fact(
    'Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor.',
    'c-1',
    'c-8',
  ),
  opening: [
    fact(
      'Fixture Robotics has begun shipping its FX-1 warehouse arm to a second plant run by Brindle Logistics, at Tarnmoor.',
      'c-1',
    ),
    fact('The first site, at Ashvale, now runs 40 of the arms, and a third site is planned.', 'c-23', 'c-26'),
    fact(
      'The company also reported a $450 million funding round, led by Corvane Partners, in a regulatory filing.',
      'c-17',
      'c-18',
    ),
  ],
  takeaways: [
    fact('Tarnmoor is the second Brindle Logistics plant to receive FX-1 arms.', 'c-1'),
    fact('The datasheet lists a 12 kg rated payload and a 1.4 m maximum reach.', 'c-8', 'c-9'),
    fact('Brindle Logistics measured an 18% cut in cycle time at Ashvale.', 'c-20'),
    fact('The filing dates the first sale of the $450 million round to 29 September 2026.', 'c-16', 'c-17'),
  ],
  sections: [
    {
      heading: 'What shipped',
      paragraphs: [
        [
          fact(
            "Fixture Robotics announced on 1 October 2026 that deliveries of the FX-1 warehouse arm to Brindle Logistics have started at Tarnmoor, the customer's second plant.",
            'c-1',
            'c-2',
          ),
          fact('The company says the arm is built for tote picking and trailer unloading.', 'c-1'),
          fact('It also says the arm mounts on existing conveyor frames without a new safety cage.', 'c-3'),
          fact('Fixture Robotics lists the arm from $38,000, with delivery within 12 weeks of an order.', 'c-4'),
        ],
        [
          fact(
            'The datasheet lists a rated payload of 12 kg at full reach and a maximum reach of 1.4 m from the base.',
            'c-8',
            'c-9',
          ),
          fact('Peak tool speed is 2.3 m/s, and repeatability is 0.05 mm.', 'c-10', 'c-11'),
          fact('The same document gives a throughput of up to 1,200 picks an hour.', 'c-12'),
          fact('The arm itself weighs 38 kg and draws 650 W in typical use.', 'c-13', 'c-14'),
          fact(
            'It lists an ingress protection rating of IP54, which the company describes as suitable for dusty warehouse floors.',
            'c-15',
          ),
        ],
        [
          fact('At Ashvale, the first Brindle Logistics plant, 40 FX-1 arms are now running.', 'c-23'),
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
          fact('Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.', 'c-25'),
        ],
      ],
    },
    {
      heading: 'What the customer reports',
      paragraphs: [
        [
          fact('At Ashvale, Brindle Logistics measured an 18% cut in cycle time on its tote-picking cells.', 'c-20'),
          fact('It compared the four weeks before and after the arms went live.', 'c-20'),
          fact('The installation at Ashvale went live on 18 August 2026, according to Brindle Logistics.', 'c-24'),
          fact(
            '"We went from pilot to production in nine weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.',
            'c-22',
          ),
        ],
        [
          fact('Across the same weeks, Ashvale averaged 940 picks an hour per arm.', 'c-21'),
          analysis(
            'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
            'c-21',
            'c-12',
          ),
          fact(
            'At a demo day on 24 September 2026, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
            'c-27',
            'c-28',
          ),
        ],
        [fact('Brindle Logistics plans to add a third site in 2027.', 'c-26')],
      ],
    },
    {
      heading: 'What the filing shows',
      paragraphs: [
        [
          fact(
            'The round, led by Corvane Partners, totals $450 million, according to a regulatory filing.',
            'c-17',
            'c-18',
          ),
          fact('The filing records the first sale on 29 September 2026.', 'c-16'),
          fact('It lists 7 investors in the round.', 'c-19'),
        ],
        [
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('It expects to build 500 FX-1 arms in 2027.', 'c-6'),
        ],
      ],
    },
  ],
  limitations: [
    limitation('c-8', 'basis'),
    limitation('c-9', 'basis'),
    limitation('c-10', 'basis'),
    limitation('c-11', 'basis'),
    limitation('c-12', 'basis'),
    limitation('c-13', 'basis'),
    limitation('c-14', 'basis'),
    limitation('c-4', 'basis'),
    limitation('c-27', 'basis'),
    limitation('c-27', 'status'),
    limitation('c-23', 'status'),
    limitation('c-5', 'status'),
    limitation('c-25', 'status'),
    limitation('c-26', 'status'),
    limitation('c-20', 'basis'),
  ],
};

export const GOLDEN_DRAFT: Draft = deepFreeze(DRAFT);

/** A deep copy of the golden draft and claims, in the shape the gate takes. Tests change copies, never the originals. */
export function cloneGolden(): { draft: Draft; claims: Claim[] } {
  return structuredClone({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/golden-draft.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/fixtures/golden.ts gate/test/golden-draft.test.ts
git commit -m "feat(gate): add the golden draft and cloneGolden" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Sentence locator and shared test helpers

**Files:**
- Create: `gate/src/sentences.ts`, `gate/test/helpers.ts`
- Modify: `gate/src/index.ts` (export the new module)
- Test: `gate/test/sentences.test.ts`, `gate/test/helpers.test.ts`

Every check walks the sentences of a draft and reports where it found a problem. `allSentences(draft)` lists them in document order (title, description, opening, takeaways, each section's paragraphs, limitations), each with its section, heading, whole-piece `index` (the numbering the ledger will use) and 1-based `position` in its section. `describeLocation` turns one into the `where` text of a failure, for example `opening, sentence 2` or `section "What shipped", sentence 4`.

`gate/test/helpers.ts` is test support, not product code: `mutate(base, fn)` deep-copies a gate input and applies `fn` to the copy; `findSentence(draft, predicate)` returns the first matching sentence, the real object inside the draft, and throws if none matches so a typo in a test fails loudly; `claimById(claims, id)` returns a claim or throws; `allSentences` is re-exported. Every check test in this milestone is written with them.

- [ ] **Step 1: Write the failing tests**

**Create `gate/test/sentences.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { GOLDEN_DRAFT } from '../src/fixtures';
import { allSentences, describeLocation } from '../src/sentences';
import type { Draft } from '../src/schemas';

const located = allSentences(GOLDEN_DRAFT);

const bodyCount = GOLDEN_DRAFT.sections.reduce((total, section) => total + section.paragraphs.flat().length, 0);

describe('allSentences', () => {
  it('lists every sentence once', () => {
    const expected =
      2 + GOLDEN_DRAFT.opening.length + GOLDEN_DRAFT.takeaways.length + bodyCount + GOLDEN_DRAFT.limitations.length;
    expect(located).toHaveLength(expected);
  });

  it('puts them in document order: title, description, opening, takeaways, sections, limitations', () => {
    const sections = located.map((item) => item.section);
    const firstOfEach = ['title', 'description', 'opening', 'takeaways', 'body', 'limitations'].map((name) =>
      sections.indexOf(name as (typeof sections)[number]),
    );
    expect(firstOfEach).toEqual([...firstOfEach].sort((a, b) => a - b));
    expect(firstOfEach[0]).toBe(0);
    expect(located[0]?.sentence).toBe(GOLDEN_DRAFT.title);
    expect(located[1]?.sentence).toBe(GOLDEN_DRAFT.description);
    expect(located[2]?.sentence).toBe(GOLDEN_DRAFT.opening[0]);
    expect(located.at(-1)?.sentence).toBe(GOLDEN_DRAFT.limitations.at(-1));
  });

  it('numbers the sentences from 0 over the whole piece', () => {
    expect(located.map((item) => item.index)).toEqual(located.map((_item, position) => position));
  });

  it('numbers sentences from 1 within their section', () => {
    expect(located.find((item) => item.section === 'title')?.position).toBe(1);
    const opening = located.filter((item) => item.section === 'opening');
    expect(opening.map((item) => item.position)).toEqual([1, 2, 3]);
    const limitations = located.filter((item) => item.section === 'limitations');
    expect(limitations[0]?.position).toBe(1);
    expect(limitations.at(-1)?.position).toBe(GOLDEN_DRAFT.limitations.length);
  });

  it('flattens the paragraphs of a section and names the heading on each body sentence', () => {
    const first = GOLDEN_DRAFT.sections[0];
    const inFirst = located.filter((item) => item.heading === first?.heading);
    expect(inFirst.map((item) => item.sentence)).toEqual(first?.paragraphs.flat());
    expect(inFirst.map((item) => item.position)).toEqual(inFirst.map((_item, at) => at + 1));
    for (const item of located) {
      expect(item.heading !== undefined, item.sentence.text).toBe(item.section === 'body');
    }
  });

  it('handles a draft with nothing but a title and a description', () => {
    const bare: Draft = {
      ...GOLDEN_DRAFT,
      opening: [],
      takeaways: [],
      sections: [],
      limitations: [],
    };
    expect(allSentences(bare).map((item) => item.section)).toEqual(['title', 'description']);
  });
});

describe('describeLocation', () => {
  it('names a singleton by its section', () => {
    expect(describeLocation(located[0]!)).toBe('title');
    expect(describeLocation(located[1]!)).toBe('description');
  });

  it('names a list sentence by section and position', () => {
    const second = located.filter((item) => item.section === 'opening')[1]!;
    expect(describeLocation(second)).toBe('opening, sentence 2');
    const takeaway = located.filter((item) => item.section === 'takeaways')[2]!;
    expect(describeLocation(takeaway)).toBe('takeaways, sentence 3');
    const limitation = located.filter((item) => item.section === 'limitations')[0]!;
    expect(describeLocation(limitation)).toBe('limitations, sentence 1');
  });

  it('names a body sentence by its heading and position', () => {
    const body = located.filter((item) => item.section === 'body')[3]!;
    expect(describeLocation(body)).toBe('section "What shipped", sentence 4');
  });
});
```

**Create `gate/test/helpers.ts`:**
```ts
import type { GateInput } from '../src/gate';
import type { Claim, Draft, Sentence } from '../src/schemas';
import type { LocatedSentence } from '../src/sentences';
import { allSentences } from '../src/sentences';

export { allSentences };

/**
 * A deep copy of `base` with `change` applied to the copy. The base is never
 * touched, even when it is the frozen golden fixture, so a test can start from
 * `cloneGolden()` and describe in one function what it breaks.
 */
export function mutate(base: GateInput, change: (copy: GateInput) => void): GateInput {
  const copy = structuredClone(base);
  change(copy);
  return copy;
}

/**
 * The first sentence of `draft`, in document order, that `predicate` accepts.
 * The sentence returned is the one inside `draft`, so a test can change it in
 * place. Throws if there is none, so a typo in a test fails loudly.
 */
export function findSentence(draft: Draft, predicate: (sentence: Sentence, located: LocatedSentence) => boolean): Sentence {
  const found = allSentences(draft).find((item) => predicate(item.sentence, item));
  if (found === undefined) throw new Error('findSentence: no sentence in the draft matches the predicate');
  return found.sentence;
}

/** The claim with this id. Throws if there is none. */
export function claimById(claims: readonly Claim[], id: string): Claim {
  const found = claims.find((claim) => claim.id === id);
  if (found === undefined) throw new Error(`claimById: no claim with id ${id}`);
  return found;
}
```

**Create `gate/test/helpers.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { allSentences, claimById, findSentence, mutate } from './helpers';

describe('mutate', () => {
  it('applies the change to a copy and returns it', () => {
    const base = cloneGolden();
    const result = mutate(base, (copy) => {
      copy.draft.title.text = 'A different title';
      copy.claims.pop();
    });
    expect(result.draft.title.text).toBe('A different title');
    expect(result.claims).toHaveLength(base.claims.length - 1);
  });

  it('leaves the base unchanged', () => {
    const base = cloneGolden();
    mutate(base, (copy) => {
      copy.draft.title.text = 'A different title';
      copy.draft.sections[0]!.heading = 'Changed';
      copy.claims[0]!.values.length = 0;
    });
    expect(base).toEqual(cloneGolden());
  });

  it('returns a copy that shares nothing with the base', () => {
    const base = cloneGolden();
    const result = mutate(base, () => {});
    expect(result).toEqual(base);
    expect(result.draft).not.toBe(base.draft);
    expect(result.claims[0]).not.toBe(base.claims[0]);
  });

  it('accepts the frozen originals as a base and still returns something that can be changed', () => {
    const result = mutate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, (copy) => {
      copy.draft.slug = 'changed';
    });
    expect(result.draft.slug).toBe('changed');
    expect(GOLDEN_DRAFT.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
  });
});

describe('allSentences', () => {
  it('is the document-order list from the gate sources', () => {
    expect(allSentences(GOLDEN_DRAFT)[0]?.sentence).toBe(GOLDEN_DRAFT.title);
  });
});

describe('findSentence', () => {
  it('finds the first sentence that matches, in document order', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (sentence) => sentence.text.includes('Fixture Robotics'));
    expect(found).toBe(draft.title);
  });

  it('can tell where a sentence is from its location', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (_sentence, located) => located.section === 'takeaways');
    expect(found).toBe(draft.takeaways[0]);
    const limitation = findSentence(draft, (sentence) => sentence.kind === 'limitation');
    expect(limitation).toBe(draft.limitations[0]);
  });

  it('returns the sentence inside the draft, so changing it changes the draft', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (sentence) => sentence.kind === 'analysis');
    found.text = 'Changed analysis.';
    expect(draft.sections[1]?.paragraphs[1]?.[1]?.text).toBe('Changed analysis.');
  });

  it('throws when nothing matches', () => {
    const { draft } = cloneGolden();
    expect(() => findSentence(draft, (sentence) => sentence.text === 'no such sentence')).toThrow(
      'no sentence in the draft matches',
    );
  });
});

describe('claimById', () => {
  it('returns the claim with that id', () => {
    expect(claimById(GOLDEN_CLAIMS, 'c-8').label).toBe('payload');
  });

  it('throws for an id that does not exist', () => {
    expect(() => claimById(GOLDEN_CLAIMS, 'c-999')).toThrow('no claim with id c-999');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/sentences.test.ts test/helpers.test.ts`
Expected: FAIL — `Cannot find module '../src/sentences'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/sentences.ts`:**
```ts
import type { LedgerSection } from './constants';
import type { Draft, Sentence } from './schemas';

/** A sentence of a draft together with where it sits. */
export interface LocatedSentence {
  section: LedgerSection;
  /** The section heading. Present on body sentences only. */
  heading?: string;
  /** 0-based position over the whole piece, in document order. The ledger uses the same numbering. */
  index: number;
  /** 1-based position within its section. For a body section, paragraphs count as one run. */
  position: number;
  sentence: Sentence;
}

/**
 * Every sentence of `draft` in document order: title, description, opening,
 * takeaways, each section's paragraphs, then the limitations. The sentences
 * returned are the draft's own, not copies.
 */
export function allSentences(draft: Draft): LocatedSentence[] {
  const located: LocatedSentence[] = [];
  const add = (section: LedgerSection, sentence: Sentence, position: number, heading?: string) => {
    const item: LocatedSentence = { section, index: located.length, position, sentence };
    if (heading !== undefined) item.heading = heading;
    located.push(item);
  };

  add('title', draft.title, 1);
  add('description', draft.description, 1);
  draft.opening.forEach((sentence, at) => add('opening', sentence, at + 1));
  draft.takeaways.forEach((sentence, at) => add('takeaways', sentence, at + 1));
  for (const section of draft.sections) {
    section.paragraphs.flat().forEach((sentence, at) => add('body', sentence, at + 1, section.heading));
  }
  draft.limitations.forEach((sentence, at) => add('limitations', sentence, at + 1));
  return located;
}

/** A short description of where a sentence sits, for the `where` of a failure. */
export function describeLocation(item: LocatedSentence): string {
  if (item.section === 'title' || item.section === 'description') return item.section;
  if (item.section === 'body') return `section "${item.heading ?? ''}", sentence ${item.position}`;
  return `${item.section}, sentence ${item.position}`;
}
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './config';
export * from './constants';
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './schemas';
export * from './sentences';
export * from './sources';
export * from './text';
export * from './tokens';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/sentences.test.ts test/helpers.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/sentences.ts gate/src/index.ts gate/test/sentences.test.ts gate/test/helpers.ts gate/test/helpers.test.ts
git commit -m "feat(gate): locate sentences in a draft and add the shared test helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Check G1, frontmatter

**Files:**
- Create: `gate/src/checks/g1-frontmatter.ts`
- Modify: `gate/src/schemas.ts` (export the slug pattern), `gate/src/checks/index.ts` (register the check)
- Test: `gate/test/g1-frontmatter.test.ts`

G1 looks at the fields the site builds from the draft. Its failure codes are fixed:

| Code | When |
|---|---|
| `G1_TITLE_EMPTY` | the title text is empty or only spaces |
| `G1_DESCRIPTION_TOO_LONG` | the description is longer than `descriptionMax` (155) characters |
| `G1_BAD_DATE` | `publishedAt` is not a real calendar date in the form `YYYY-MM-DD` |
| `G1_SLUG_FORMAT` | the slug is not lowercase letters and digits joined by single hyphens |
| `G1_CATEGORY_COUNT` | there are not 1 to 3 categories, or one is listed twice |
| `G1_CATEGORY_UNKNOWN` | a category is not in the closed vocabulary (one failure per unknown slug) |
| `G1_CATEGORY_NO_BEAT` | `funding` appears but no beat does (funding is a tag, not a beat) |
| `G1_AUTHOR_MISSING` | the author name is empty or missing |

The slug rule already exists as a regular expression inside the `Draft` schema. This task moves it into an exported `SLUG_PATTERN` so the schema and G1 can never disagree.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g1-frontmatter.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG1 } from '../src/checks/g1-frontmatter';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { mutate } from './helpers';

/** The failure codes G1 reports for the golden input after `change`. */
function codesAfter(change: (copy: GateInput) => void, ctx = defaultContext()): string[] {
  return checkG1(mutate(cloneGolden(), change), ctx).failures.map((failure) => failure.code);
}

describe('G1: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG1(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the first check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[0]).toBe(checkG1);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG1(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });

  it('stamps every failure as G1 and says where the problem is', () => {
    const out = checkG1(
      mutate(cloneGolden(), (g) => {
        g.draft.title.text = '';
        g.draft.slug = 'Bad Slug';
      }),
      defaultContext(),
    );
    expect(out.failures.map((failure) => [failure.check, failure.code, failure.where])).toEqual([
      ['G1', 'G1_TITLE_EMPTY', 'title'],
      ['G1', 'G1_SLUG_FORMAT', 'slug'],
    ]);
    for (const failure of out.failures) {
      expect(failure.message.length).toBeGreaterThan(0);
    }
  });
});

describe('G1_TITLE_EMPTY', () => {
  it.each(['', ' ', '\n\t '])('fails for the title %j', (title) => {
    expect(codesAfter((g) => (g.draft.title.text = title))).toEqual(['G1_TITLE_EMPTY']);
  });

  it('passes for a one-word title', () => {
    expect(codesAfter((g) => (g.draft.title.text = 'Funding'))).toEqual([]);
  });
});

describe('G1_DESCRIPTION_TOO_LONG', () => {
  it('passes at exactly 155 characters and fails at 156', () => {
    expect(codesAfter((g) => (g.draft.description.text = 'x'.repeat(155)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.description.text = 'x'.repeat(156)))).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('counts characters, not bytes', () => {
    expect(codesAfter((g) => (g.draft.description.text = '\u00E9'.repeat(155)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.description.text = '\u00E9'.repeat(156)))).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('reads the limit from the config', () => {
    const ctx = defaultContext({ config: { descriptionMax: 100 } });
    expect(codesAfter(() => {}, ctx)).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('puts the length and the limit in the message', () => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.description.text = 'x'.repeat(200))), defaultContext());
    expect(out.failures[0]?.message).toContain('200');
    expect(out.failures[0]?.message).toContain('155');
    expect(out.failures[0]?.where).toBe('description');
  });
});

describe('G1_BAD_DATE', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-00', '2026-8-4', '24 August 2026', '2026', '', '2026-10-04T00:00:00Z', ' 2026-10-04'])(
    'fails for %j',
    (publishedAt) => {
      expect(codesAfter((g) => (g.draft.publishedAt = publishedAt))).toEqual(['G1_BAD_DATE']);
    },
  );

  it.each(['2026-10-04', '2026-02-28', '2028-02-29', '2026-12-31'])('passes for %j', (publishedAt) => {
    expect(codesAfter((g) => (g.draft.publishedAt = publishedAt))).toEqual([]);
  });
});

describe('G1_SLUG_FORMAT', () => {
  it.each(['Has-Capital', 'has space', 'under_score', '-leading', 'trailing-', 'double--hyphen', '', 'caf\u00E9', 'dot.dot'])(
    'fails for %j',
    (slug) => {
      expect(codesAfter((g) => (g.draft.slug = slug))).toEqual(['G1_SLUG_FORMAT']);
    },
  );

  it.each(['a', 'fx-1', '2026-plan', 'fixture-robotics-ships-fx-1-to-second-plant'])('passes for %j', (slug) => {
    expect(codesAfter((g) => (g.draft.slug = slug))).toEqual([]);
  });
});

describe('G1_CATEGORY_COUNT', () => {
  it('fails for no categories', () => {
    expect(codesAfter((g) => (g.draft.categories = []))).toEqual(['G1_CATEGORY_COUNT']);
  });

  it('fails for four categories', () => {
    expect(codesAfter((g) => (g.draft.categories = ['humanoids', 'home-consumer', 'field-mobility', 'funding']))).toEqual([
      'G1_CATEGORY_COUNT',
    ]);
  });

  it('fails for a duplicated category', () => {
    expect(codesAfter((g) => (g.draft.categories = ['humanoids', 'humanoids']))).toEqual(['G1_CATEGORY_COUNT']);
  });

  it.each([
    [['humanoids']],
    [['humanoids', 'funding']],
    [['humanoids', 'field-mobility', 'funding']],
  ])('passes for %j', (categories) => {
    expect(codesAfter((g) => (g.draft.categories = categories))).toEqual([]);
  });
});

describe('G1_CATEGORY_UNKNOWN', () => {
  it('fails once for each category outside the vocabulary and names it', () => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.categories = ['humanoids', 'robots', 'Funding'])), defaultContext());
    expect(out.failures.map((failure) => failure.code)).toEqual(['G1_CATEGORY_UNKNOWN', 'G1_CATEGORY_UNKNOWN']);
    expect(out.failures[0]?.message).toContain('robots');
    expect(out.failures[1]?.message).toContain('Funding');
  });

  it('does not also complain about a missing beat when the only category is unknown', () => {
    expect(codesAfter((g) => (g.draft.categories = ['robots']))).toEqual(['G1_CATEGORY_UNKNOWN']);
  });
});

describe('G1_CATEGORY_NO_BEAT', () => {
  it('fails when funding is the only category', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding']))).toEqual(['G1_CATEGORY_NO_BEAT']);
  });

  it('fails when funding sits beside an unknown category, because there is still no beat', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding', 'robots']))).toEqual([
      'G1_CATEGORY_UNKNOWN',
      'G1_CATEGORY_NO_BEAT',
    ]);
  });

  it('passes when a beat comes with funding', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding', 'policy-standards']))).toEqual([]);
  });
});

describe('G1_AUTHOR_MISSING', () => {
  it.each(['', '   '])('fails for the author name %j', (name) => {
    expect(codesAfter((g) => (g.draft.author.name = name))).toEqual(['G1_AUTHOR_MISSING']);
  });

  it('fails when the author is missing altogether', () => {
    expect(codesAfter((g) => ((g.draft as { author?: unknown }).author = undefined))).toEqual(['G1_AUTHOR_MISSING']);
  });
});

describe('G1: several problems at once', () => {
  it('reports every one, so a single revision round can fix them all', () => {
    const codes = codesAfter((g) => {
      g.draft.title.text = '';
      g.draft.description.text = 'x'.repeat(300);
      g.draft.publishedAt = 'yesterday';
      g.draft.slug = 'Bad Slug';
      g.draft.categories = [];
      g.draft.author.name = '';
    });
    expect(codes).toEqual([
      'G1_TITLE_EMPTY',
      'G1_DESCRIPTION_TOO_LONG',
      'G1_BAD_DATE',
      'G1_SLUG_FORMAT',
      'G1_CATEGORY_COUNT',
      'G1_AUTHOR_MISSING',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g1-frontmatter.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g1-frontmatter'`.

- [ ] **Step 3: Write the implementation**

First export the slug pattern from the schemas.

**In `gate/src/schemas.ts`, replace:**
```ts
export const Sentence = z.discriminatedUnion('kind', [FactSentence, AnalysisSentence, LimitationSentence]);
export type Sentence = z.infer<typeof Sentence>;

export const Draft = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  publishedAt: isoDate,
  // A list of strings only. G1 checks the slugs against CATEGORY_VOCAB.
  categories: z.array(z.string()),
```

**with:**
```ts
export const Sentence = z.discriminatedUnion('kind', [FactSentence, AnalysisSentence, LimitationSentence]);
export type Sentence = z.infer<typeof Sentence>;

/** A slug is lowercase letters and digits in groups separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Draft = z.object({
  slug: z.string().regex(SLUG_PATTERN, 'slug must be lowercase kebab-case'),
  publishedAt: isoDate,
  // A list of strings only. G1 checks the slugs against CATEGORY_VOCAB.
  categories: z.array(z.string()),
```

Then the check, and its registration.

**Create `gate/src/checks/g1-frontmatter.ts`:**
```ts
import { BEATS, CATEGORY_VOCAB, CROSS_TAGS } from '../constants';
import type { Check, Failure } from '../gate';
import { parseDateToken } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

const MIN_CATEGORIES = 1;
const MAX_CATEGORIES = 3;

const isBeat = (category: string) => (BEATS as readonly string[]).includes(category);
const isCrossTag = (category: string) => (CROSS_TAGS as readonly string[]).includes(category);
const isKnown = (category: string) => (CATEGORY_VOCAB as readonly string[]).includes(category);

/**
 * G1, frontmatter: the fields the site builds from the draft (title,
 * description, date, slug, categories, author) are present and well formed.
 */
export const checkG1: Check = ({ draft }, ctx) => {
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G1', code, message, where });

  if (draft.title.text.trim() === '') {
    fail('G1_TITLE_EMPTY', 'the title is empty', 'title');
  }

  const length = draft.description.text.length;
  if (length > ctx.config.descriptionMax) {
    fail(
      'G1_DESCRIPTION_TOO_LONG',
      `the description is ${length} characters; the limit is ${ctx.config.descriptionMax}`,
      'description',
    );
  }

  // The regex fixes the shape (parseDateToken alone would also take "24 August 2026"); the parser checks the calendar.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.publishedAt) || parseDateToken(draft.publishedAt)?.precision !== 'day') {
    fail('G1_BAD_DATE', `publishedAt "${draft.publishedAt}" is not a real date in the form YYYY-MM-DD`, 'publishedAt');
  }

  if (!SLUG_PATTERN.test(draft.slug)) {
    fail('G1_SLUG_FORMAT', `the slug "${draft.slug}" is not lowercase letters and digits separated by single hyphens`, 'slug');
  }

  const { categories } = draft;
  if (categories.length < MIN_CATEGORIES || categories.length > MAX_CATEGORIES) {
    fail('G1_CATEGORY_COUNT', `categories must list ${MIN_CATEGORIES} to ${MAX_CATEGORIES} slugs; found ${categories.length}`, 'categories');
  } else if (new Set(categories).size !== categories.length) {
    fail('G1_CATEGORY_COUNT', 'categories lists the same slug more than once', 'categories');
  }
  for (const category of categories.filter((item) => !isKnown(item))) {
    fail('G1_CATEGORY_UNKNOWN', `the category "${category}" is not in the vocabulary (${CATEGORY_VOCAB.join(', ')})`, 'categories');
  }
  if (categories.some(isCrossTag) && !categories.some(isBeat)) {
    fail('G1_CATEGORY_NO_BEAT', 'funding is a tag, not a beat: list the beat the story is about as well', 'categories');
  }

  if ((draft.author?.name ?? '').trim() === '') {
    fail('G1_AUTHOR_MISSING', 'the author name is missing', 'author');
  }

  return { failures, holdReasons: [] };
};
```

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g1-frontmatter.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/schemas.ts gate/src/checks gate/test/g1-frontmatter.test.ts
git commit -m "feat(gate): add check G1 for frontmatter" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Check G2, structure

**Files:**
- Create: `gate/src/checks/g2-structure.ts`
- Modify: `gate/src/checks/index.ts` (register the check)
- Test: `gate/test/g2-structure.test.ts`

G2 checks the shape of the piece. The failure codes are fixed, and each failure's `where` names the offending part:

| Code | When | `where` |
|---|---|---|
| `G2_OPENING_LENGTH` | the opening has fewer than 40 or more than 60 words | `opening` |
| `G2_TAKEAWAYS_COUNT` | there are not 3 to 5 takeaways | `takeaways` |
| `G2_BODY_LENGTH` | the body has fewer than 600 or more than 850 words | `body` |
| `G2_SECTIONS_MIN` | there are fewer than 2 sections | `sections` |
| `G2_HEADING_QUESTION` | a section heading ends with `?` | `section "<heading>"` |
| `G2_LIMITATIONS_MISSING` | a claim that any sentence cites has a basis outside `filing`, `standard`, `paper`, `measured`, but `draft.limitations` is empty | `limitations` |

The body is the opening, the takeaways, every section paragraph and the limitations. The title, the description and the headings are not counted. The limits come from `ctx.config`, so tests can change them. The test file builds exact word counts with two small helpers (`sentenceOf(n)` and `setBodyWords`), so every boundary is tested on both sides.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g2-structure.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG2 } from '../src/checks/g2-structure';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, mutate } from './helpers';

/** `count` words ending in a full stop. */
const sentenceOf = (count: number) => `${Array.from({ length: count - 1 }, () => 'word').join(' ')} word.`;

/** The body as G2 defines it: opening, takeaways, sections and limitations. Not the title, description or headings. */
const bodyWords = (input: GateInput) =>
  allSentences(input.draft)
    .filter((item) => item.section !== 'title' && item.section !== 'description')
    .reduce((total, item) => total + countWords(item.sentence.text), 0);

/**
 * Rewrite the section paragraphs so that the whole body has exactly `target`
 * words: every section sentence becomes one word, and the last one grows to
 * make up the difference. (The opening, takeaways and limitations stay as they
 * are, so the smallest body this can make is a little over 300 words.)
 */
function setBodyWords(input: GateInput, target: number): void {
  const sections = allSentences(input.draft)
    .filter((item) => item.section === 'body')
    .map((item) => item.sentence);
  for (const sentence of sections) sentence.text = 'word.';
  sections.at(-1)!.text = sentenceOf(target - (bodyWords(input) - 1));
}

function resultAfter(change: (copy: GateInput) => void, ctx = defaultContext()) {
  return checkG2(mutate(cloneGolden(), change), ctx);
}

const codesAfter = (change: (copy: GateInput) => void, ctx = defaultContext()) =>
  resultAfter(change, ctx).failures.map((failure) => failure.code);

describe('G2: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG2(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the second check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[1]).toBe(checkG2);
  });

  it('has a body well inside the limits, so the length tests below start from a known place', () => {
    expect(bodyWords(cloneGolden())).toBeGreaterThanOrEqual(640);
    expect(bodyWords(cloneGolden())).toBeLessThanOrEqual(720);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG2(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G2_OPENING_LENGTH', () => {
  const withOpeningWords = (count: number) => (g: GateInput) => {
    g.draft.opening = [{ kind: 'fact', text: sentenceOf(count), claimIds: ['c-1'] }];
  };

  it.each([39, 61, 1])('fails for an opening of %i words', (count) => {
    expect(codesAfter(withOpeningWords(count))).toEqual(['G2_OPENING_LENGTH']);
  });

  it.each([40, 50, 60])('passes for an opening of %i words', (count) => {
    expect(codesAfter(withOpeningWords(count))).toEqual([]);
  });

  it('counts every sentence of the opening together', () => {
    const split = (g: GateInput) => {
      g.draft.opening = [
        { kind: 'fact', text: sentenceOf(20), claimIds: ['c-1'] },
        { kind: 'fact', text: sentenceOf(20), claimIds: ['c-1'] },
      ];
    };
    expect(codesAfter(split)).toEqual([]);
    const tooMany = (g: GateInput) => {
      g.draft.opening = [
        { kind: 'fact', text: sentenceOf(31), claimIds: ['c-1'] },
        { kind: 'fact', text: sentenceOf(30), claimIds: ['c-1'] },
      ];
    };
    expect(codesAfter(tooMany)).toEqual(['G2_OPENING_LENGTH']);
  });

  it('reads the limits from the config and names the count in the message', () => {
    const ctx = defaultContext({ config: { openingWords: { min: 10, max: 20 } } });
    const out = checkG2(cloneGolden(), ctx);
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_OPENING_LENGTH']);
    expect(out.failures[0]?.where).toBe('opening');
    expect(out.failures[0]?.message).toContain('53');
  });
});

describe('G2_TAKEAWAYS_COUNT', () => {
  it.each([0, 1, 2, 6, 7])('fails for %i takeaways', (count) => {
    const change = (g: GateInput) => {
      const base = g.draft.takeaways;
      g.draft.takeaways = Array.from({ length: count }, (_item, at) => structuredClone(base[at % base.length]!));
      setBodyWords(g, 665);
    };
    expect(codesAfter(change)).toEqual(['G2_TAKEAWAYS_COUNT']);
  });

  it.each([3, 4, 5])('passes for %i takeaways', (count) => {
    const change = (g: GateInput) => {
      const base = g.draft.takeaways;
      g.draft.takeaways = Array.from({ length: count }, (_item, at) => structuredClone(base[at % base.length]!));
      setBodyWords(g, 665);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('names the count in the message', () => {
    const out = resultAfter((g) => {
      g.draft.takeaways = g.draft.takeaways.slice(0, 2);
      setBodyWords(g, 665);
    });
    expect(out.failures[0]?.where).toBe('takeaways');
    expect(out.failures[0]?.message).toContain('2');
  });
});

describe('G2_BODY_LENGTH', () => {
  it.each([599, 851, 400, 1200])('fails for a body of %i words', (target) => {
    expect(codesAfter((g) => setBodyWords(g, target))).toEqual(['G2_BODY_LENGTH']);
  });

  it.each([600, 640, 850])('passes for a body of %i words', (target) => {
    expect(codesAfter((g) => setBodyWords(g, target))).toEqual([]);
  });

  it('reads the limits from the config and names the count in the message', () => {
    const ctx = defaultContext({ config: { bodyWords: { min: 100, max: 200 } } });
    const out = checkG2(cloneGolden(), ctx);
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_BODY_LENGTH']);
    expect(out.failures[0]?.where).toBe('body');
    expect(out.failures[0]?.message).toContain(String(bodyWords(cloneGolden())));
  });

  it('counts the takeaways, the sections and the limitations', () => {
    const longTakeaway = (g: GateInput) => (g.draft.takeaways[0]!.text = sentenceOf(250));
    const longSection = (g: GateInput) => (g.draft.sections[0]!.paragraphs[0]![0]!.text = sentenceOf(250));
    const longLimitation = (g: GateInput) => (g.draft.limitations[0]!.text = sentenceOf(250));
    expect(codesAfter(longTakeaway)).toEqual(['G2_BODY_LENGTH']);
    expect(codesAfter(longSection)).toEqual(['G2_BODY_LENGTH']);
    expect(codesAfter(longLimitation)).toEqual(['G2_BODY_LENGTH']);
  });

  it('counts the opening too', () => {
    expect(codesAfter((g) => (g.draft.opening[0]!.text = sentenceOf(250)))).toEqual([
      'G2_OPENING_LENGTH',
      'G2_BODY_LENGTH',
    ]);
  });

  it('does not count the title, the description or the headings', () => {
    const change = (g: GateInput) => {
      g.draft.title.text = sentenceOf(300);
      g.draft.description.text = sentenceOf(300);
      for (const section of g.draft.sections) section.heading = sentenceOf(300).replace('.', '');
    };
    expect(codesAfter(change)).toEqual([]);
  });
});

describe('G2_SECTIONS_MIN', () => {
  it('fails for a single section, and for none', () => {
    expect(codesAfter((g) => (g.draft.sections = g.draft.sections.slice(0, 1)))).toContain('G2_SECTIONS_MIN');
    expect(codesAfter((g) => (g.draft.sections = []))).toContain('G2_SECTIONS_MIN');
  });

  it('passes for two sections', () => {
    expect(codesAfter((g) => (g.draft.sections = g.draft.sections.slice(0, 2)))).toEqual([]);
  });

  it('names the count in the message', () => {
    const out = resultAfter((g) => (g.draft.sections = g.draft.sections.slice(0, 1)));
    const failure = out.failures.find((item) => item.code === 'G2_SECTIONS_MIN');
    expect(failure?.where).toBe('sections');
    expect(failure?.message).toContain('1');
  });
});

describe('G2_HEADING_QUESTION', () => {
  it('fails for a heading that ends with a question mark and names the heading', () => {
    const out = resultAfter((g) => (g.draft.sections[1]!.heading = 'What did the customer report?'));
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_HEADING_QUESTION']);
    expect(out.failures[0]?.where).toBe('section "What did the customer report?"');
  });

  it('fails once for each question heading, and when the mark is followed by spaces', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = 'What shipped? ';
      g.draft.sections[2]!.heading = 'Why does it matter?';
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_QUESTION', 'G2_HEADING_QUESTION']);
  });

  it('passes for a question mark that is not at the end', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = 'What shipped? The arm'))).toEqual([]);
  });
});

describe('G2_LIMITATIONS_MISSING', () => {
  const noLimitations = (g: GateInput) => {
    g.draft.limitations = [];
    setBodyWords(g, 665);
  };

  it('fails when a cited claim rests on a datasheet, press release, briefing or demo and there are no limitations', () => {
    expect(codesAfter(noLimitations)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('names the section and the claims in the failure', () => {
    const out = resultAfter(noLimitations);
    expect(out.failures[0]?.where).toBe('limitations');
    expect(out.failures[0]?.message).toContain('c-1');
  });

  it.each(['datasheet', 'press-release', 'briefing', 'demo'] as const)('treats a %s claim as needing limitations', (basis) => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims[0]!.basis = basis;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it.each(['filing', 'standard', 'paper', 'measured'] as const)('lets a piece resting only on %s claims go without', (basis) => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = basis;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('ignores a claim that no sentence cites', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('counts a claim that only the title cites', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      g.draft.title.claimIds = ['c-99'];
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('ignores a citation of a claim that does not exist, which G3 reports', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.draft.title.claimIds = ['c-999'];
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('passes when limitations exist, whatever the bases', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });
});

describe('G2: several problems at once', () => {
  it('reports every one', () => {
    const change = (g: GateInput) => {
      g.draft.opening = [{ kind: 'fact', text: sentenceOf(10), claimIds: ['c-1'] }];
      g.draft.takeaways = [];
      g.draft.sections = g.draft.sections.slice(0, 1);
      g.draft.sections[0]!.heading = 'Why?';
      g.draft.limitations = [];
    };
    expect(codesAfter(change)).toEqual([
      'G2_OPENING_LENGTH',
      'G2_TAKEAWAYS_COUNT',
      'G2_BODY_LENGTH',
      'G2_SECTIONS_MIN',
      'G2_HEADING_QUESTION',
      'G2_LIMITATIONS_MISSING',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g2-structure.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g2-structure'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g2-structure.ts`:**
```ts
import { SAFE_BASES } from '../constants';
import type { Check, Failure } from '../gate';
import { allSentences } from '../sentences';
import { countWords } from '../text';

const MIN_SECTIONS = 2;

const isSafeBasis = (basis: string) => (SAFE_BASES as readonly string[]).includes(basis);

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; no heading asks a
 * question; and a piece that rests on a company's own claims has a "What we
 * couldn't verify" section.
 *
 * The body is the opening, the takeaways, every section paragraph and the
 * limitations. The title, the description and the headings are not counted.
 */
export const checkG2: Check = ({ draft, claims }, ctx) => {
  const { openingWords, takeaways, bodyWords } = ctx.config;
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G2', code, message, where });

  const sentences = allSentences(draft);
  const wordsIn = (section: string) =>
    sentences.filter((item) => item.section === section).reduce((total, item) => total + countWords(item.sentence.text), 0);

  const opening = wordsIn('opening');
  if (opening < openingWords.min || opening > openingWords.max) {
    fail('G2_OPENING_LENGTH', `the opening paragraph is ${opening} words; it must be ${openingWords.min} to ${openingWords.max}`, 'opening');
  }

  if (draft.takeaways.length < takeaways.min || draft.takeaways.length > takeaways.max) {
    fail(
      'G2_TAKEAWAYS_COUNT',
      `there are ${draft.takeaways.length} key takeaways; there must be ${takeaways.min} to ${takeaways.max}`,
      'takeaways',
    );
  }

  const body = opening + wordsIn('takeaways') + wordsIn('body') + wordsIn('limitations');
  if (body < bodyWords.min || body > bodyWords.max) {
    fail('G2_BODY_LENGTH', `the body is ${body} words; it must be ${bodyWords.min} to ${bodyWords.max}`, 'body');
  }

  if (draft.sections.length < MIN_SECTIONS) {
    fail('G2_SECTIONS_MIN', `there are ${draft.sections.length} sections; there must be at least ${MIN_SECTIONS}`, 'sections');
  }

  for (const section of draft.sections) {
    if (section.heading.trim().endsWith('?')) {
      fail('G2_HEADING_QUESTION', `the heading "${section.heading}" is a question; headings must be statements`, `section "${section.heading}"`);
    }
  }

  const cited = new Set(sentences.flatMap((item) => item.sentence.claimIds));
  const needLimitations = claims.filter((claim) => cited.has(claim.id) && !isSafeBasis(claim.basis));
  if (needLimitations.length > 0 && draft.limitations.length === 0) {
    const ids = needLimitations.map((claim) => claim.id).join(', ');
    fail('G2_LIMITATIONS_MISSING', `claims ${ids} rest on a datasheet, press release, briefing or demo, but there is no "What we couldn't verify" section`, 'limitations');
  }

  return { failures, holdReasons: [] };
};
```

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g2-structure.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks gate/test/g2-structure.test.ts
git commit -m "feat(gate): add check G2 for structure" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Check G3, coverage

**Files:**
- Create: `gate/src/checks/g3-coverage.ts`
- Modify: `gate/src/checks/index.ts` (register the check)
- Test: `gate/test/g3-coverage.test.ts`

G3 makes sure every statement of fact points at evidence. It looks at every sentence of the piece, and its failure codes are fixed:

| Code | When |
|---|---|
| `G3_NO_CLAIM` | a `fact` sentence cites no claim at all |
| `G3_UNKNOWN_CLAIM` | any sentence cites an id that is not in `claims` (once per sentence and id) |

Each failure's `where` is the sentence's location, for example `opening, sentence 2`. An analysis sentence may cite nothing. A limitation sentence with no claim is not G3's business; G8 checks limitations against their templates.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g3-coverage.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG3 } from '../src/checks/g3-coverage';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import { allSentences, findSentence, mutate } from './helpers';

const failuresAfter = (change: (copy: GateInput) => void): Failure[] =>
  checkG3(mutate(cloneGolden(), change), defaultContext()).failures;

const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);

describe('G3: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG3(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the third check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[2]).toBe(checkG3);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG3(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G3_NO_CLAIM', () => {
  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[2]!, 'takeaways, sentence 3'],
    ['a section sentence', (g: GateInput) => g.draft.sections[0]!.paragraphs[1]![0]!, 'section "What shipped", sentence 5'],
    ['a sentence in a later section', (g: GateInput) => g.draft.sections[2]!.paragraphs[1]![1]!, 'section "What the filing shows", sentence 5'],
  ])('fails for a fact sentence with no claim in %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => (pick(g).claimIds = []));
    expect(summary(failures)).toEqual([['G3_NO_CLAIM', where]]);
    expect(failures[0]?.check).toBe('G3');
    expect(failures[0]?.message).toContain(where);
  });

  it('does not ask an analysis sentence for a claim', () => {
    const failures = failuresAfter((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').claimIds = [];
    });
    expect(failures).toEqual([]);
  });

  it('leaves a limitation sentence with no claim to G8', () => {
    const failures = failuresAfter((g) => {
      (g.draft.limitations[0] as { claimIds: string[] }).claimIds = [];
    });
    expect(failures).toEqual([]);
  });

  it('reports every uncited fact sentence, in document order', () => {
    const failures = failuresAfter((g) => {
      g.draft.sections[1]!.paragraphs[0]![0]!.claimIds = [];
      g.draft.title.claimIds = [];
      g.draft.takeaways[0]!.claimIds = [];
    });
    expect(summary(failures)).toEqual([
      ['G3_NO_CLAIM', 'title'],
      ['G3_NO_CLAIM', 'takeaways, sentence 1'],
      ['G3_NO_CLAIM', 'section "What the customer reports", sentence 1'],
    ]);
  });
});

describe('G3_UNKNOWN_CLAIM', () => {
  it.each([
    ['a fact sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['an analysis sentence', (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis'), 'section "What the customer reports", sentence 6'],
    ['a limitation sentence', (g: GateInput) => g.draft.limitations[3]!, 'limitations, sentence 4'],
  ])('fails for an id that is not a claim in %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => {
      (pick(g).claimIds as string[]).push('c-999');
    });
    expect(summary(failures)).toEqual([['G3_UNKNOWN_CLAIM', where]]);
    expect(failures[0]?.message).toContain('c-999');
    expect(failures[0]?.message).toContain(where);
  });

  it('fails once for each unknown id, but not twice for the same id', () => {
    const failures = failuresAfter((g) => {
      g.draft.opening[0]!.claimIds = ['c-1', 'c-998', 'c-999', 'c-999'];
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G3_UNKNOWN_CLAIM', 'G3_UNKNOWN_CLAIM']);
    expect(failures.map((failure) => failure.message.match(/c-\d+/)?.[0])).toEqual(['c-998', 'c-999']);
  });

  it('does not also report a missing claim when the only id is unknown', () => {
    expect(summary(failuresAfter((g) => (g.draft.opening[0]!.claimIds = ['c-999'])))).toEqual([
      ['G3_UNKNOWN_CLAIM', 'opening, sentence 1'],
    ]);
  });

  it('treats every citation of a claim that is missing from the list as unknown', () => {
    const input = cloneGolden();
    const citing = allSentences(input.draft).filter((item) => item.sentence.claimIds.includes('c-1'));
    const failures = failuresAfter((g) => {
      g.claims = g.claims.filter((claim) => claim.id !== 'c-1');
    });
    expect(citing.length).toBeGreaterThan(3);
    expect(failures).toHaveLength(citing.length);
    expect(new Set(failures.map((failure) => failure.code))).toEqual(new Set(['G3_UNKNOWN_CLAIM']));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g3-coverage.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g3-coverage'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g3-coverage.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';

/**
 * G3, coverage: every fact sentence cites at least one claim, and every claim
 * any sentence cites exists. It looks at every sentence of the piece: title,
 * description, opening, takeaways, section paragraphs and limitations.
 *
 * An analysis sentence may cite nothing. A limitation sentence with no claim is
 * left to G8, which checks limitations against their templates.
 */
export const checkG3: Check = ({ draft, claims }) => {
  const known = new Set(claims.map((claim) => claim.id));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    const where = describeLocation(located);
    if (sentence.kind === 'fact' && sentence.claimIds.length === 0) {
      failures.push({
        check: 'G3',
        code: 'G3_NO_CLAIM',
        message: `the fact sentence at ${where} cites no claim`,
        where,
      });
    }
    for (const id of new Set(sentence.claimIds)) {
      if (!known.has(id)) {
        failures.push({
          check: 'G3',
          code: 'G3_UNKNOWN_CLAIM',
          message: `the sentence at ${where} cites ${id}, which is not one of this piece's claims`,
          where,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
```

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';
import { checkG3 } from './g3-coverage';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g3-coverage.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks gate/test/g3-coverage.test.ts
git commit -m "feat(gate): add check G3 for claim coverage" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Check G4, values

**Files:**
- Create: `gate/src/checks/g4-values.ts`
- Modify: `gate/src/checks/index.ts` (register the check)
- Test: `gate/test/g4-values.test.ts`

G4 is the check that catches a swapped number, a wrong date or an invented name. For every `fact` sentence it uses `extractTokens` and holds each token against the claims *that sentence cites*. The failure codes are fixed:

| Code | When | `where` |
|---|---|---|
| `G4_NUMBER_UNSUPPORTED` | a number is not matched by a cited claim's `number` value. If the sentence gives a unit, the claim's unit must equal it; if it gives none, any unit matches | the sentence |
| `G4_DATE_UNSUPPORTED` | a date is not matched, at the sentence date's precision (`dateMatches`), by a cited claim's `date` value | the sentence |
| `G4_NAME_UNSUPPORTED` | a name token is neither a word of a cited claim's `name` value nor on `ctx.nameAllowList` | the sentence |
| `G4_VALUE_NOT_IN_SPAN` | a claim cited by a fact sentence lists a value whose raw text does not occur in that claim's `span.quote` | the claim id, once per claim |

The claim side is read the same way as the sentence side: the claim value's *raw text* is parsed with the same functions (`parseNumberToken`, `parseDateToken`), so "1.2k" and "1,200" meet. The model's own `normalised` and `unit` fields are used only when the raw text is not a number or date token (for example "twelve"); a `normalised` value that disagrees with the raw text is ignored, so it cannot be used to smuggle a figure through. Analysis and limitation sentences are not read, and quoted text is left to G5. Name detection is strict, and false positives route to revision, never to publish; one test says so.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g4-values.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import type { Claim, ClaimValue } from '../src/schemas';
import { findSentence, mutate } from './helpers';

// --- A tiny input: a title that cites the given claims, and nothing else. ----

const num = (raw: string, normalised: string, unit?: string): ClaimValue =>
  unit === undefined ? { kind: 'number', raw, normalised } : { kind: 'number', raw, normalised, unit };
const when = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
const who = (raw: string): ClaimValue => ({ kind: 'name', raw, normalised: raw.toLowerCase() });

/** A claim whose quote is made of its values, so every value is in its span unless `quote` says otherwise. */
function claimOf(values: ClaimValue[], overrides: Partial<Claim> = {}): Claim {
  const quote = overrides.span?.quote ?? (values.map((value) => value.raw).join('; ') || 'nothing');
  return {
    id: 'c-1',
    text: 'A claim.',
    label: 'thing',
    type: 'spec',
    source: {
      url: 'https://fixture-robotics.example/a',
      tier: 1,
      snapshotHash: 'a'.repeat(64),
      retrievedAt: '2026-10-04T04:30:00Z',
    },
    span: { start: 0, end: quote.length, quote },
    basis: 'datasheet',
    status: 'unspecified',
    values,
    ...overrides,
  };
}

function mini(text: string, claims: Claim[], cited: string[] = claims.map((claim) => claim.id)): GateInput {
  return {
    draft: {
      slug: 'a-slug',
      publishedAt: '2026-10-04',
      categories: ['humanoids'],
      author: { name: 'Robywire Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'Ok.', claimIds: cited },
      opening: [],
      takeaways: [],
      sections: [],
      limitations: [],
    },
    claims,
  };
}

const run = (input: GateInput, overrides?: ContextOverrides) => checkG4(input, defaultContext(overrides));
const codes = (input: GateInput, overrides?: ContextOverrides) => run(input, overrides).failures.map((failure) => failure.code);
const goldenCodes = (change: (copy: GateInput) => void) => codes(mutate(cloneGolden(), change));
const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);

// ---------------------------------------------------------------------------

describe('G4: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG4(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the fourth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[3]).toBe(checkG4);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG4(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G4 numbers: the same figure written differently is supported', () => {
  it.each([
    ['It does 1,200 picks an hour.', num('1.2k', '1200')],
    ['It does 1.2k picks an hour.', num('1,200', '1200')],
    ['It does 1200 picks an hour.', num('1.2k', '1200')],
    ['It lifts 12 kg.', num('12 kilograms', '12', 'kg')],
    ['It lifts 12 kilograms.', num('12 kg', '12', 'kg')],
    ['It lifts 12.', num('12 kg', '12', 'kg')],
    ['It moves at 2.3 m/s.', num('2.3 metres per second', '2.3', 'm/s')],
    ['It moves at 2.3 metres per second.', num('2.3 m/s', '2.3', 'm/s')],
    ['Cycle time fell 18%.', num('18 per cent', '18', '%')],
    ['Cycle time fell 18 percent.', num('18%', '18', '%')],
    ['It raised $450 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450M.', num('$450 million', '450000000', 'USD')],
    ['It raised USD 450 million.', num('$450m', '450000000', 'USD')],
    ['It raised 450 million dollars.', num('USD 450 million', '450000000', 'USD')],
    ['It costs $38,000.', num('$38,000', '38000', 'USD')],
    ['It draws 650 W.', num('650 watts', '650', 'W')],
  ])('accepts %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual([]);
  });
});

describe('G4 numbers: a different figure, or a different unit, is not supported', () => {
  it.each([
    ['It lifts 13 kg.', num('12 kg', '12', 'kg')],
    ['It lifts 12 lb.', num('12 kg', '12', 'kg')],
    ['It lifts 12 kg.', num('12 lb', '12', 'lb')],
    ['It lifts 12 kg.', num('12', '12')],
    ['It lifts 1.2 kg.', num('12 kg', '12', 'kg')],
    ['It reaches 1 km.', num('1000 m', '1000', 'm')],
    ['It does 1,200 picks an hour.', num('1.3k', '1300')],
    ['Cycle time fell 19%.', num('18 per cent', '18', '%')],
    ['It raised $45 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450 million.', num('EUR 450 million', '450000000', 'EUR')],
    ['It raised $450 million.', num('450 million', '450000000')],
    ['It moves at 2.3 m/s.', num('2.3 km/h', '2.3', 'km/h')],
  ])('rejects %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('names the number and where it is', () => {
    const out = run(mini('It lifts 13 kg.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NUMBER_UNSUPPORTED',
        message: 'the number "13 kg" at title is not in any claim this sentence cites',
        where: 'title',
      },
    ]);
  });

  it('does not count a name or a date value as support for a number', () => {
    expect(codes(mini('It lifts 2026 kg.', [claimOf([when('2026', '2026')])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
    expect(codes(mini('It lifts 12 kg.', [claimOf([who('12 kg')])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('accepts support from any one of the cited claims', () => {
    const first = claimOf([num('12 kg', '12', 'kg')], { id: 'c-1' });
    const second = claimOf([num('650 W', '650', 'W')], { id: 'c-2' });
    expect(codes(mini('It lifts 12 kg and draws 650 W.', [first, second]))).toEqual([]);
  });

  it('does not accept support from a claim the sentence does not cite', () => {
    const cited = claimOf([num('650 W', '650', 'W')], { id: 'c-1' });
    const uncited = claimOf([num('12 kg', '12', 'kg')], { id: 'c-2' });
    expect(codes(mini('It lifts 12 kg.', [cited, uncited], ['c-1']))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('reports each unsupported number once, even when it is written twice', () => {
    const out = run(mini('It lifts 13 kg, and 13 kg again, and 14 kg too.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['13 kg', '14 kg']);
  });
});

describe('G4 numbers: the claim value comes from its raw text', () => {
  it('trusts the raw text over a normalised value that disagrees with it', () => {
    const lying = claimOf([num('12 kg', '13', 'kg')]);
    expect(codes(mini('It lifts 12 kg.', [lying]))).toEqual([]);
    expect(codes(mini('It lifts 13 kg.', [lying]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('falls back to the normalised value and unit when the raw text is not a number token', () => {
    const spelled = claimOf([num('twelve', '12', 'kilograms')]);
    expect(codes(mini('It lifts 12 kg.', [spelled]))).toEqual([]);
    expect(codes(mini('It lifts 13 kg.', [spelled]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
    expect(codes(mini('It lifts 12 lb.', [spelled]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('reads a comma in a fallback value', () => {
    const spelled = claimOf([num('twelve hundred', '1,200')]);
    expect(codes(mini('It does 1200 picks.', [spelled]))).toEqual([]);
  });
});

describe('G4 dates', () => {
  it.each([
    ['It shipped on 29 September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 2026-09-29.', when('29 September 2026', '2026-09-29')],
    ['It shipped on Sep 29, 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in September 2026.', when('September 2026', '2026-09')],
    ['It shipped in 2027.', when('2027', '2027')],
    ['It shipped on 29 September 2026.', when('around the end of the quarter', '2026-09-29')],
  ])('accepts %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual([]);
  });

  it.each([
    ['It shipped on 30 September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 October 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 September 2027.', when('2026-09-29', '2026-09-29')],
    ['It shipped in October 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in 2027.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 September 2026.', when('September 2026', '2026-09')],
    ['It shipped on 29 September 2026.', when('2026', '2026')],
    ['It shipped in 2027.', when('2026', '2026')],
    ['It shipped in 2026.', when('twenty twenty-six', '20261')],
  ])('rejects %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('names the date and where it is', () => {
    const out = run(mini('It shipped on 30 September 2026.', [claimOf([when('2026-09-29', '2026-09-29')])]));
    expect(out.failures[0]?.message).toBe('the date "30 September 2026" at title is not in any claim this sentence cites');
    expect(out.failures[0]?.where).toBe('title');
  });

  it('trusts the raw text of a date over a normalised value that disagrees with it', () => {
    const lying = claimOf([when('29 September 2026', '2026-09-30')]);
    expect(codes(mini('It shipped on 29 September 2026.', [lying]))).toEqual([]);
    expect(codes(mini('It shipped on 30 September 2026.', [lying]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('reports each unsupported date once, even when it is written twice', () => {
    const out = run(mini('It shipped on 30 September 2026 and on 30 September 2026.', [claimOf([when('2026-09-29', '2026-09-29')])]));
    expect(out.failures.map((failure) => failure.code)).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('does not count a number value as support for a date', () => {
    expect(codes(mini('It shipped in 2026.', [claimOf([num('2026', '2026')])]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('reports an impossible date as unsupported numbers, never as a real date', () => {
    const out = codes(mini('It shipped on 31 February 2026.', [claimOf([when('2026-02-28', '2026-02-28')])]));
    expect(out).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});

describe('G4 names', () => {
  it('accepts a name that a cited claim lists as a name value', () => {
    expect(codes(mini('Shipments by Acme rose.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('rejects a name that no cited claim lists', () => {
    const out = run(mini('Shipments by Acme rose.', [claimOf([who('Fixture Robotics')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NAME_UNSUPPORTED',
        message:
          'the capitalised word "acme" at title is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word',
        where: 'title',
      },
    ]);
  });

  it('compares each word of a multi-word name, in any case', () => {
    const claim = claimOf([who('Brindle Logistics')]);
    expect(codes(mini('Plans at Brindle Logistics grew.', [claim]))).toEqual([]);
    expect(codes(mini('Plans at the Logistics site grew.', [claim]))).toEqual([]);
    expect(codes(mini('Plans at Brindle Freight grew.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('reads a possessive as the name', () => {
    expect(codes(mini("Plans at Acme's plant grew.", [claimOf([who('Acme')])]))).toEqual([]);
    expect(codes(mini('Plans at Acme\u2019s plant grew.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('accepts a model name and an acronym that a claim lists', () => {
    expect(codes(mini('Sales of the FX-1 and the ISO rules rose.', [claimOf([who('FX-1'), who('ISO')])]))).toEqual([]);
    expect(codes(mini('Sales of the FX-1 rose.', [claimOf([who('FX-2')])]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('accepts a name listed by any one of the cited claims, but not by a claim that is not cited', () => {
    const a = claimOf([who('Acme')], { id: 'c-1' });
    const b = claimOf([who('Zenith')], { id: 'c-2' });
    expect(codes(mini('Plans at Acme and Zenith grew.', [a, b]))).toEqual([]);
    expect(codes(mini('Plans at Acme and Zenith grew.', [a, b], ['c-1']))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('does not take a name from the claim text, only from its name values', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { text: 'Acme lifts 12 kg.' });
    expect(codes(mini('Plans at Acme grew by 12 kg.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('accepts a word on the allow-list without a claim, and an allow-list passed in the context', () => {
    expect(codes(mini('It shipped in August, on a Monday, said the CEO of the US firm.', [claimOf([])]))).toEqual([]);
    expect(codes(mini('Plans at Acme grew.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('Plans at Acme grew.', [claimOf([])]), { nameAllowList: ['acme'] })).toEqual([]);
  });

  it('exempts the first word of the sentence, so a sentence-initial name is not caught here', () => {
    expect(codes(mini('Acme ships arms.', [claimOf([])]))).toEqual([]);
  });

  it('is deliberately strict: a capitalised ordinary word is reported, and a revision fixes it', () => {
    expect(codes(mini('Sales rose, Analysts said.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('Sales rose, analysts said.', [claimOf([])]))).toEqual([]);
  });

  it('reports each unsupported name once', () => {
    const out = run(mini('Plans at Acme and Acme and Zenith grew.', [claimOf([])]));
    expect(out.failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['acme', 'zenith']);
  });
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('Jane said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
  });

  it('skips analysis sentences', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'Acme shipped 999 units on 3 May 2027.';
    });
    expect(failures).toEqual([]);
  });

  it('skips limitation sentences', () => {
    const failures = goldenCodes((g) => {
      g.draft.limitations[0]!.text = 'Acme shipped 999 units on 3 May 2027.';
    });
    expect(failures).toEqual([]);
  });

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[1]!.paragraphs[2]![0]!, 'section "What the customer reports", sentence 8'],
  ])('reads %s', (_name, pick, where) => {
    const input = mutate(cloneGolden(), (g) => {
      pick(g).text = 'It weighs 999 kg.';
    });
    expect(summary(checkG4(input, defaultContext()).failures)).toEqual([['G4_NUMBER_UNSUPPORTED', where]]);
  });

  it('does not stop at a claim id that does not exist: the figures in that sentence are simply unsupported', () => {
    const out = codes(mini('It lifts 12 kg.', [claimOf([num('12 kg', '12', 'kg')])], ['c-999']));
    expect(out).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('treats a fact sentence with no claims as having nothing to support its figures', () => {
    expect(codes(mini('It lifts 12 kg.', [claimOf([num('12 kg', '12', 'kg')])], []))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });
});

describe('G4_VALUE_NOT_IN_SPAN', () => {
  it('fails when a cited claim lists a value whose raw text is not in its span quote', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { span: { start: 0, end: 20, quote: 'Rated payload: 13 kg' } });
    const out = run(mini('It lifts 12 kg.', [claim]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_VALUE_NOT_IN_SPAN',
        message: 'claim c-1 lists the value "12 kg", which does not appear in its quoted span',
        where: 'c-1',
      },
    ]);
  });

  it('reports a claim once however many sentences cite it and however many of its values are missing', () => {
    const claim = claimOf([num('12 kg', '12', 'kg'), num('650 W', '650', 'W')], { span: { start: 0, end: 5, quote: 'Other' } });
    const input = mini('It lifts 12 kg and draws 650 W.', [claim]);
    const failures = run(input).failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('12 kg');
  });

  it('checks name and date values too', () => {
    const claim = claimOf([who('Acme'), when('2026-09-29', '2026-09-29')], { span: { start: 0, end: 5, quote: 'Other' } });
    const out = run(mini('Acme shipped it on 29 September 2026.', [claim]));
    expect(out.failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN')).toHaveLength(1);
  });

  it('ignores spacing, dash and quote-mark differences between the raw text and the quote', () => {
    const claim = claimOf([num('12 kg', '12', 'kg'), who('Acme\u2019s')], {
      span: { start: 0, end: 30, quote: 'Rated payload: 12\u00A0kg for Acme\u2019s arm' },
    });
    expect(run(mini('It lifts 12 kg.', [claim])).failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN')).toEqual([]);
  });

  it('is case-sensitive, as the quote is a verbatim extract', () => {
    const claim = claimOf([who('Acme')], { span: { start: 0, end: 12, quote: 'made by acme' } });
    expect(codes(mini('Plans at Acme grew.', [claim]))).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

  it('only looks at claims that a fact sentence cites', () => {
    const bad = claimOf([num('12 kg', '12', 'kg')], { id: 'c-2', span: { start: 0, end: 5, quote: 'Other' } });
    const good = claimOf([num('650 W', '650', 'W')], { id: 'c-1' });
    expect(codes(mini('It draws 650 W.', [good, bad], ['c-1']))).toEqual([]);
  });

  it('puts the failure after the sentence failures', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { span: { start: 0, end: 5, quote: 'Other' } });
    expect(codes(mini('It lifts 13 kg.', [claim]))).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_VALUE_NOT_IN_SPAN']);
  });
});

describe('G4 on the golden piece: one change at a time', () => {
  it('catches a swapped number', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.includes('38 kg')).text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
    });
    expect(codesFound).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('catches a swapped date', () => {
    const codesFound = goldenCodes((g) => {
      const sentence = findSentence(g.draft, (item) => item.text.includes('first sale on'));
      sentence.text = 'The filing records the first sale on 30 September 2026.';
    });
    expect(codesFound).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('catches an invented name', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The round, led by')).text =
        'The round, led by Quillfeather Capital, totals $450 million, according to a regulatory filing.';
    });
    expect(codesFound).toEqual(['G4_NAME_UNSUPPORTED', 'G4_NAME_UNSUPPORTED']);
  });

  it('catches a claim whose value is not in its quote', () => {
    const codesFound = goldenCodes((g) => {
      g.claims.find((claim) => claim.id === 'c-13')!.span.quote = 'Arm mass: 39 kg.';
    });
    expect(codesFound).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

  it('catches a claim that is cited in place of the right one', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('Peak tool speed')).claimIds = ['c-12', 'c-13'];
    });
    expect(codesFound).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g4-values'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g4-values.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { canonicalUnit, dateMatches, parseDateToken, parseNumberToken } from '../normalise';
import type { ParsedNumber } from '../normalise';
import type { Claim, ClaimValue } from '../schemas';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf } from '../tokens';

/**
 * A number value of a claim in canonical form. The raw text is the authority:
 * it is parsed with the same function as the sentence, so "1.2k" and "1,200"
 * meet. The model's `normalised` and `unit` are used only when the raw text is
 * not a number token (for example "twelve").
 */
function claimNumber(value: ClaimValue): ParsedNumber {
  const parsed = parseNumberToken(value.raw);
  if (parsed !== null) return parsed;
  const number = parseNumberToken(value.normalised)?.value ?? value.normalised;
  return value.unit === undefined ? { value: number } : { value: number, unit: canonicalUnit(value.unit) };
}

/** A date value of a claim as an ISO string, from the raw text when it parses, else from `normalised`. */
const claimDate = (value: ClaimValue): string => parseDateToken(value.raw)?.iso ?? value.normalised;

/**
 * G4, values: every number, date and name in a fact sentence must come from a
 * claim that sentence cites, and every value a cited claim lists must really
 * be in the claim's quoted span.
 *
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A date matches a claim date at the
 * precision the sentence uses. A name matches when each of its words is a word
 * of a cited claim's name value or is on the allow-list. Name detection is
 * deliberately strict (see `extractTokens`): a false positive only costs a
 * revision round, a false negative would let an invented name through.
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
export const checkG4: Check = ({ draft, claims }, ctx) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];
  const citedByFacts = new Map<string, Claim>();

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'fact') continue;
    const where = describeLocation(located);
    const cited = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []);
    for (const claim of cited) citedByFacts.set(claim.id, claim);

    const values = cited.flatMap((claim) => claim.values);
    const supportedNumbers = values.filter((value) => value.kind === 'number').map(claimNumber);
    const supportedDates = values.filter((value) => value.kind === 'date').map(claimDate);
    const supportedNames = new Set(values.filter((value) => value.kind === 'name').flatMap((value) => nameTokensOf(value.raw)));

    const tokens = extractTokens(sentence.text);
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });

    const seenNumbers = new Set<string>();
    for (const token of tokens.numbers) {
      if (seenNumbers.has(token.raw)) continue;
      seenNumbers.add(token.raw);
      const supported = supportedNumbers.some(
        (number) => number.value === token.value && (token.unit === undefined || number.unit === token.unit),
      );
      if (!supported) {
        fail('G4_NUMBER_UNSUPPORTED', `the number "${token.raw}" at ${where} is not in any claim this sentence cites`);
      }
    }

    const seenDates = new Set<string>();
    for (const token of tokens.dates) {
      if (seenDates.has(token.raw)) continue;
      seenDates.add(token.raw);
      if (!supportedDates.some((iso) => dateMatches(token, iso))) {
        fail('G4_DATE_UNSUPPORTED', `the date "${token.raw}" at ${where} is not in any claim this sentence cites`);
      }
    }

    for (const name of tokens.names) {
      if (!supportedNames.has(name) && !ctx.nameAllowList.has(name)) {
        fail(
          'G4_NAME_UNSUPPORTED',
          `the capitalised word "${name}" at ${where} is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word`,
        );
      }
    }
  }

  // Each claim is checked once, however many sentences cite it.
  for (const claim of citedByFacts.values()) {
    const quote = normaliseQuotes(claim.span.quote);
    const missing = claim.values.find((value) => !quote.includes(normaliseQuotes(value.raw)));
    if (missing !== undefined) {
      failures.push({
        check: 'G4',
        code: 'G4_VALUE_NOT_IN_SPAN',
        message: `claim ${claim.id} lists the value "${missing.raw}", which does not appear in its quoted span`,
        where: claim.id,
      });
    }
  }

  return { failures, holdReasons: [] };
};
```

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';
import { checkG3 } from './g3-coverage';
import { checkG4 } from './g4-values';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks gate/test/g4-values.test.ts
git commit -m "feat(gate): add check G4 for numbers, dates, names and values in spans" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Check G5, quotes

**Files:**
- Create: `gate/src/checks/g5-quotes.ts`
- Modify: `gate/src/checks/index.ts` (register the check)
- Test: `gate/test/g5-quotes.test.ts`

G5 catches an invented or doctored quotation. It has one failure code:

| Code | When |
|---|---|
| `G5_QUOTE_NOT_VERBATIM` | a passage in double quotation marks in the title, the description, or a fact or analysis sentence is not word for word inside the `span.quote` of at least one claim *that sentence cites* |

Both sides are passed through `normaliseQuotes` first, so spacing, dashes and the shape of quotation marks and apostrophes do not matter; case and punctuation do. A sentence that cites no claim and holds a quotation fails. Limitation sentences come from templates and are not read. `where` is the sentence's location and the message contains the passage.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/g5-quotes.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG5 } from '../src/checks/g5-quotes';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import { claimById, findSentence, mutate } from './helpers';

const QUOTE_SENTENCE = '"We went from pilot to production in nine weeks," said Dana Whitcombe';

/** The sentence in the golden piece that holds the one quotation. */
const quoteSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.text.includes('We went from pilot'));

const failuresAfter = (change: (copy: GateInput) => void): Failure[] =>
  checkG5(mutate(cloneGolden(), change), defaultContext()).failures;

describe('G5: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG5(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('really contains a quotation for the check to look at', () => {
    expect(quoteSentence(cloneGolden()).text.startsWith(QUOTE_SENTENCE)).toBe(true);
  });

  it('is the fifth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[4]).toBe(checkG5);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG5(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G5_QUOTE_NOT_VERBATIM', () => {
  it('fails for a quotation that is not in the cited claim, and says where and what', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
    });
    expect(failures).toEqual([
      {
        check: 'G5',
        code: 'G5_QUOTE_NOT_VERBATIM',
        message:
          'the quotation "We went from pilot to production in ten weeks," at section "What the customer reports", sentence 4 is not word for word in any claim this sentence cites',
        where: 'section "What the customer reports", sentence 4',
      },
    ]);
  });

  it.each([
    ['changes one word', '"We went from pilot to production in ten weeks,"'],
    ['changes the case', '"we went from pilot to production in nine weeks,"'],
    ['changes the punctuation', '"We went from pilot to production in nine weeks."'],
    ['drops a word from the middle', '"We went from pilot to production in weeks,"'],
    ['joins two pieces with an ellipsis', '"We went from pilot ... in nine weeks,"'],
    ['adds a word', '"We quickly went from pilot to production in nine weeks,"'],
  ])('fails for a quotation that %s', (_name, quotation) => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = `${quotation} said Dana Whitcombe.`;
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G5_QUOTE_NOT_VERBATIM']);
  });

  it.each([
    ['a part of the span', '"went from pilot to production"'],
    ['the whole span between the marks', '"We went from pilot to production in nine weeks,"'],
    ['a few words that end at the comma', '"nine weeks,"'],
  ])('passes for a quotation that is %s', (_name, quotation) => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = `${quotation} is what the company said.`;
    });
    expect(failures).toEqual([]);
  });

  it('ignores differences in quote marks, apostrophes, dashes and spacing', () => {
    const failures = failuresAfter((g) => {
      claimById(g.claims, 'c-22').span.quote = '"We\u2019ve gone from pilot\u00A0to production \u2014 in nine weeks," said Dana Whitcombe.';
      quoteSentence(g).text = '\u201CWe\'ve gone from  pilot to production - in nine weeks,\u201D said Dana Whitcombe.';
    });
    expect(failures).toEqual([]);
  });

  it('accepts curly quote marks around a verbatim passage', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = '\u201CWe went from pilot to production in nine weeks,\u201D said Dana Whitcombe.';
    });
    expect(failures).toEqual([]);
  });

  it('does not count an unterminated quotation mark as a quotation', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = 'Dana Whitcombe said "we went from pilot to production in ten weeks.';
    });
    expect(failures).toEqual([]);
  });

  it('does not treat an empty pair of quote marks as a quotation', () => {
    expect(failuresAfter((g) => (quoteSentence(g).text = 'Dana Whitcombe said "" and nothing more.'))).toEqual([]);
  });

  it('needs the passage to be in a claim the sentence cites, not in some other claim', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).claimIds = ['c-21'];
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G5_QUOTE_NOT_VERBATIM']);
  });

  it('accepts a passage found in any one of several cited claims', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).claimIds = ['c-21', 'c-22'];
    });
    expect(failures).toEqual([]);
  });

  it('fails a quotation in a sentence that cites no claim, or only a claim that does not exist', () => {
    expect(failuresAfter((g) => (quoteSentence(g).claimIds = [])).map((failure) => failure.code)).toEqual([
      'G5_QUOTE_NOT_VERBATIM',
    ]);
    expect(failuresAfter((g) => (quoteSentence(g).claimIds = ['c-999'])).map((failure) => failure.code)).toEqual([
      'G5_QUOTE_NOT_VERBATIM',
    ]);
  });

  it('fails once for each bad quotation in a sentence and not twice for the same one', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = 'He said "first bad" then "went from pilot" then "second bad" then "first bad".';
    });
    expect(failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['first bad', 'second bad']);
  });
});

describe('G5: which sentences it reads', () => {
  const BAD = 'He said "an invented quotation".';

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[3]!, 'takeaways, sentence 4'],
    ['a section sentence', (g: GateInput) => g.draft.sections[2]!.paragraphs[0]![1]!, 'section "What the filing shows", sentence 2'],
    ['an analysis sentence', (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis'), 'section "What the customer reports", sentence 6'],
  ])('reads %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => {
      pick(g).text = BAD;
    });
    expect(failures.map((failure) => [failure.code, failure.where])).toEqual([['G5_QUOTE_NOT_VERBATIM', where]]);
  });

  it('does not read limitation sentences, which come from templates', () => {
    expect(failuresAfter((g) => (g.draft.limitations[0]!.text = BAD))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/g5-quotes.test.ts`
Expected: FAIL — `Cannot find module '../src/checks/g5-quotes'`.

- [ ] **Step 3: Write the implementation**

**Create `gate/src/checks/g5-quotes.ts`:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes, quotedSegments } from '../text';

/**
 * G5, quotes: every passage in double quotation marks in the title, the
 * description or a fact or analysis sentence is word for word inside the
 * quoted span of a claim that sentence cites. Spacing, dashes and the shape of
 * quote marks and apostrophes are ignored; case and punctuation are not.
 *
 * Limitation sentences come from templates and are not read.
 */
export const checkG5: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind === 'limitation') continue;
    const passages = [...new Set(quotedSegments(sentence.text))];
    if (passages.length === 0) continue;

    const where = describeLocation(located);
    const spans = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []).map((claim) => normaliseQuotes(claim.span.quote));
    for (const passage of passages) {
      if (!spans.some((span) => span.includes(passage))) {
        failures.push({
          check: 'G5',
          code: 'G5_QUOTE_NOT_VERBATIM',
          message: `the quotation "${passage}" at ${where} is not word for word in any claim this sentence cites`,
          where,
        });
      }
    }
  }

  return { failures, holdReasons: [] };
};
```

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';
import { checkG3 } from './g3-coverage';
import { checkG4 } from './g4-values';
import { checkG5 } from './g5-quotes';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/g5-quotes.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks gate/test/g5-quotes.test.ts
git commit -m "feat(gate): add check G5 for verbatim quotations" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Public API and the golden piece through the gate

**Files:**
- Modify: `gate/src/checks/index.ts` (also export the checks), `gate/src/index.ts` (export the checks)
- Test: `gate/test/golden-gate.test.ts`

The last task of the milestone proves the pieces fit. It imports the package the way other workspaces will, by name (`@robywire/gate`, and `@robywire/gate/fixtures` for the golden piece), and checks that the public API is there; that the golden piece goes through `runGate` with route `publish`, no failures and G1 to G5 passing; that `runGate` reads the frozen originals without writing to them; and that one deliberate defect per check sends the draft back for revision with that check marked `fail`. The golden piece is not exported from the main entry point.

- [ ] **Step 1: Write the failing test**

**Create `gate/test/golden-gate.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import * as api from '@robywire/gate';
import type { CheckId, GateInput } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '@robywire/gate/fixtures';
import { claimById, findSentence, mutate } from './helpers';

// These tests use the package the way other workspaces will: by name.

describe('the public API of @robywire/gate', () => {
  it.each([
    // gate
    'runGate',
    'runGateWith',
    'defaultContext',
    'defaultConfig',
    'ALL_CHECKS',
    'checkG1',
    'checkG2',
    'checkG3',
    'checkG4',
    'checkG5',
    // text, normalisers, tokens, limitations, sentences
    'countWords',
    'normaliseQuotes',
    'stripQuoted',
    'quotedSegments',
    'sentenceWords',
    'jaccard',
    'parseNumberToken',
    'parseDateToken',
    'dateMatches',
    'canonicalUnit',
    'UNIT_ALIASES',
    'MONTH_NAMES',
    'extractTokens',
    'nameTokensOf',
    'toNameToken',
    'renderLimitation',
    'BASIS_TEMPLATES',
    'STATUS_TEMPLATES',
    'allSentences',
    'describeLocation',
    // configuration
    'DEFAULT_BANNED_PHRASES',
    'DEFAULT_NAME_ALLOW_LIST',
    // vocabularies, schemas, registry
    'BEATS',
    'CATEGORY_VOCAB',
    'SAFE_BASES',
    'CHECK_IDS',
    'Claim',
    'Draft',
    'LedgerEntry',
    'DeskState',
    'SLUG_PATTERN',
    'parseSources',
    'loadSources',
  ])('exports %s', (name) => {
    expect(Object.keys(api)).toContain(name);
  });

  it('keeps the fixtures out of the main entry point, so production code cannot import them by accident', () => {
    for (const name of ['GOLDEN_DRAFT', 'GOLDEN_CLAIMS', 'cloneGolden']) {
      expect(Object.keys(api)).not.toContain(name);
    }
  });

  it('lists the checks in order, starting with G1 to G5', () => {
    expect(api.ALL_CHECKS.slice(0, 5)).toEqual([api.checkG1, api.checkG2, api.checkG3, api.checkG4, api.checkG5]);
  });
});

describe('runGate on the golden piece', () => {
  it('publishes it: no failures, no hold reasons, and G1 to G5 all pass', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5'] as const) {
      expect(result.checks[id], id).toBe('pass');
    }
  });

  it('gives the same answer every time', () => {
    const first = api.runGate(cloneGolden(), api.defaultContext());
    const second = api.runGate(cloneGolden(), api.defaultContext());
    expect(second).toEqual(first);
  });

  it('reads the frozen originals without writing to them', () => {
    const result = api.runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, api.defaultContext());
    expect(result.route).toBe('publish');
  });

  it('does not change the input it is given', () => {
    const input = cloneGolden();
    api.runGate(input, api.defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('runGate on the golden piece with one thing wrong', () => {
  const defects: [CheckId, string, (copy: GateInput) => void][] = [
    ['G1', 'G1_TITLE_EMPTY', (g) => (g.draft.title.text = '')],
    ['G2', 'G2_HEADING_QUESTION', (g) => (g.draft.sections[0]!.heading = 'What shipped?')],
    ['G3', 'G3_NO_CLAIM', (g) => (g.draft.takeaways[0]!.claimIds = [])],
    [
      'G4',
      'G4_NUMBER_UNSUPPORTED',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('38 kg')).text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
      },
    ],
    [
      'G5',
      'G5_QUOTE_NOT_VERBATIM',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('We went from pilot')).text =
          '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      },
    ],
  ];

  it.each(defects)('sends the draft back for revision when %s finds %s', (id, code, change) => {
    const result = api.runGate(mutate(cloneGolden(), change), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks[id]).toBe('fail');
    expect(result.failures.some((failure) => failure.check === id && failure.code === code)).toBe(true);
  });

  it('marks only the checks that found something as fail', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        claimById(g.claims, 'c-13').span.quote = 'Arm mass: 39 kg.';
      }),
      api.defaultContext(),
    );
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'fail', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: FAIL — `to include 'ALL_CHECKS'`.

- [ ] **Step 3: Write the implementation**

**Replace `gate/src/checks/index.ts` with:**
```ts
import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';
import { checkG3 } from './g3-coverage';
import { checkG4 } from './g4-values';
import { checkG5 } from './g5-quotes';

export { checkG1, checkG2, checkG3, checkG4, checkG5 };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5];
```

**Replace `gate/src/index.ts` with:**
```ts
export const GATE_PACKAGE = '@robywire/gate';

export * from './checks';
export * from './config';
export * from './constants';
export * from './gate';
export * from './limitations';
export * from './normalise';
export * from './schemas';
export * from './sentences';
export * from './sources';
export * from './text';
export * from './tokens';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test --workspace @robywire/gate -- test/golden-gate.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

- [ ] **Step 6: Commit**

```bash
git add gate/src/checks/index.ts gate/src/index.ts gate/test/golden-gate.test.ts
git commit -m "feat(gate): export the checks and prove the golden piece passes G1 to G5 through runGate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Run the milestone's done-when checks**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS — every `Test Files` and `Tests` summary line says passed and none says failed.

Run: `npx tsx -e "import { runGate, defaultContext } from '@robywire/gate'; import { cloneGolden } from '@robywire/gate/fixtures'; const result = runGate(cloneGolden(), defaultContext()); console.log(result.route, JSON.stringify(result.checks))"`
Expected: PASS — prints `publish {"G1":"pass","G2":"pass","G3":"pass","G4":"pass","G5":"pass"`, followed by `G6` to `G9` also as `pass`, because those checks are not written yet and an unregistered check counts as a pass.

Run: `git status --porcelain`
Expected: prints nothing (everything is committed).

Run: `git log --oneline`
Expected: PASS — the log, newest first, starts with `feat(gate): export the checks and prove the golden piece passes G1 to G5 through runGate`, and further down contains `feat(gate): add text utilities for word counts, quotes and set similarity` just above the Milestone 0 commits.
