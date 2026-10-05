import { describe, expect, it } from 'vitest';
import {
  buildLimitations,
  checkG2,
  citedClaims,
  defaultContext,
  extractTokens,
  isSentenceStarter,
  openingWordAccepted,
  runGate,
  startsWithCapitalOrDigit,
} from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { KNOWN_LIMITS, LIMITS_HEADING, LIMITS_INTRO } from '../src/lib/method';
import type { KnownLimit } from '../src/lib/method';

// The method page lists what the checks cannot see. A limit that stops being true
// must fail a test, so each one is shown here with the real token reader of the gate,
// or, for the text that no rule reads, with the real gate.

const ofKind = (kind: KnownLimit['kind']) => KNOWN_LIMITS.filter((limit) => limit.kind === kind);
const unseen = ofKind('unseen');
const misread = ofKind('misread');
const strict = ofKind('strict');
const unchecked = ofKind('unchecked');
const withText = (limits: readonly KnownLimit[], fragment: string): KnownLimit => {
  const found = limits.find((limit) => limit.text.includes(fragment));
  if (found === undefined) throw new Error(`no known limit says "${fragment}"`);
  return found;
};

describe('KNOWN_LIMITS', () => {
  it('lists what the reviews asked for: ordinals, vague quantities, a lone "one", fractions, lowercase names, and the false alarms of the name check', () => {
    const text = KNOWN_LIMITS.map((limit) => limit.text).join(' ');
    expect(text).toContain('Ordinals such as first, second and third');
    expect(text).toContain('"a couple", "several"');
    expect(text).toContain('The word "one" on its own');
    expect(text).toContain('"a third" and "a quarter"');
    expect(text).toContain('"two thirds" is read as the number 2');
    expect(text).toContain('"six-axis" is read as the number 6 with no unit');
    expect(text).toContain('iRobot or xAI');
    expect(text).toContain('The name check is strict on purpose');
    expect(unseen).toHaveLength(7);
    expect(misread).toHaveLength(2);
    expect(strict).toHaveLength(2);
    expect(unchecked).toHaveLength(2);
    expect(KNOWN_LIMITS).toHaveLength(13);
  });

  it.each(KNOWN_LIMITS.map((limit) => [limit.text.slice(0, 40), limit] as const))('is written as plain sentences: %s', (_name, limit) => {
    expect(limit.text).toMatch(/^[A-Z]/);
    expect(limit.text.endsWith('.')).toBe(true);
    // The example of a limit about text that no rule reads is a label or a heading, not a sentence.
    if (limit.kind !== 'unchecked') expect(limit.example.endsWith('.')).toBe(true);
  });

  // A limit that stops being true must fail a test. Each example is a sentence that the real token reader looks at.
  it.each(unseen.map((limit) => [limit.example, limit] as const))('is true: the gate reads no number, date, name or amount in "%s"', (example) => {
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([]);
    expect(tokens.dates).toEqual([]);
    expect(tokens.uncheckable).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it.each([...unseen, ...misread].map((limit) => [limit.example, limit] as const))(
    'has an example that the opening-word rule lets through, so the sentence is not stopped for another reason: "%s"',
    (example) => {
      const { initialWord } = extractTokens(example);
      expect(initialWord === undefined || isSentenceStarter(initialWord), example).toBe(true);
    },
  );

  it('shows with the same reader that a number, a date and a name that the gate can see are seen, so the examples above are not empty by accident', () => {
    expect(extractTokens('The plant shipped 12 arms on 3 October 2026, and Mercer Wire reported it.')).toMatchObject({
      numbers: [{ value: '12' }],
      dates: [{ iso: '2026-10-03' }],
      names: ['mercer', 'wire'],
    });
  });

  it('shows that a lone "one" is not read although "one" with a unit is, and that "half" is refused although other fractions are unseen', () => {
    expect(withText(unseen, 'The word "one" on its own').text).toContain('"one kilogram" is read as 1 kg');
    expect(extractTokens('The plant shipped one robot.').numbers).toEqual([]);
    expect(extractTokens('The plant shipped one kilogram of grease.').numbers).toEqual([{ raw: 'one kilogram', value: '1', unit: 'kg' }]);
    expect(extractTokens('The plant shipped a half of the arms.').uncheckable).toEqual(['half']);
    expect(extractTokens('A third of the arms shipped.').uncheckable).toEqual([]);
  });

  // What the reader takes the example for. Each misread limit has a row, so a new one fails until it is shown.
  const READ_AS: Record<string, { raw: string; value: string }> = {
    'The plant shipped two thirds of the arms.': { raw: 'two', value: '2' },
    'The six-axis arm shipped.': { raw: 'six', value: '6' },
  };

  it.each(misread.map((limit) => [limit.example, limit] as const))('is true: the reader takes "%s" for a number, and for no unit', (example) => {
    const reading = READ_AS[example];
    expect(reading, `a row for "${example}"`).toBeDefined();
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([reading]);
    expect(tokens.numbers[0]).not.toHaveProperty('unit');
    expect(tokens.dates).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it('shows that "six-axis" is read like "6-axis", and that the digits need no unit either', () => {
    expect(extractTokens('The 6-axis arm shipped.').numbers).toEqual([{ raw: '6', value: '6' }]);
  });

  it('is true of the strict limit about the name check: an ordinary capitalised noun at the start of a sentence is refused unless a claim contains it', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    const { initialWord } = extractTokens(limit.example);
    expect(initialWord).toBe('Output');
    expect(openingWordAccepted('Output', new Set(), new Set())).toBe(false);
    expect(openingWordAccepted('Output', new Set(['output']), new Set())).toBe(true);
  });

  it('says what the strictness costs and what it buys', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    expect(limit.text).toContain('A false alarm costs a revision round; a name that slipped through would cost a wrong claim.');
  });

  it('is true of the strict limit about a sentence that opens with a lowercase name: the sentence rule of G2 refuses it, and the reader sees no name in it', () => {
    const limit = withText(strict, 'A sentence cannot open with a name that starts with a lowercase letter');
    expect(limit.text).toContain('iRobot or xAI');
    expect(limit.text).toContain('every sentence must start with a capital letter or a digit');
    expect(startsWithCapitalOrDigit(limit.example)).toBe(false);
    expect(extractTokens(limit.example)).not.toHaveProperty('initialWord');
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = limit.example;
    const refused = checkG2(input, defaultContext()).failures.map((failure) => failure.code);
    expect(refused).toEqual(['G2_SENTENCE_START']);
  });
});

describe('KNOWN_LIMITS: the text that no rule reads, shown with the real gate', () => {
  const route = (input: GateInput) => {
    const result = runGate(input, defaultContext());
    return { route: result.route, failures: result.failures.map((failure) => failure.code) };
  };
  /** The golden piece with the limitation sentences written again, as the gate requires after a claim's label changes. */
  const withLimitationsRewritten = (input: GateInput): GateInput => {
    input.draft.limitations = buildLimitations(citedClaims(input.draft, input.claims));
    return input;
  };

  it('starts from a golden piece that the gate publishes', () => {
    expect(route(cloneGolden())).toEqual({ route: 'publish', failures: [] });
  });

  it('is true of the page address, the text and the label of a claim: a made-up company and a number in them pass', () => {
    const limit = withText(unchecked, 'The page address of a piece and the text and the label of each claim');
    const input = cloneGolden();
    input.draft.slug = limit.example.toLowerCase().replaceAll(' ', '-');
    expect(input.draft.slug).toBe('harlow-logistics-12-plants');
    const claim = input.claims.find((item) => item.id === 'c-12')!;
    claim.label = limit.example;
    claim.text = `${limit.example} was announced.`;
    expect(route(withLimitationsRewritten(input))).toEqual({ route: 'publish', failures: [] });
    expect(extractTokens(limit.example)).toMatchObject({ numbers: [{ value: '12' }], names: ['logistics'], initialWord: 'Harlow' });
  });

  it('is true of a heading: one that asserts something in words and names no figure and no capitalised word passes', () => {
    const limit = withText(unchecked, 'A section heading that names no figure');
    const input = cloneGolden();
    input.draft.sections[0]!.heading = limit.example;
    expect(route(input)).toEqual({ route: 'publish', failures: [] });
  });

  it('is not an accident of the gate being switched off: the same label in a sentence is refused', () => {
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = 'Harlow Logistics 12 plants were announced.';
    expect(route(input).failures).toContain('G4_NUMBER_UNSUPPORTED');
  });
});

describe('the introduction and the heading of the list of limits', () => {
  it('has a heading that the page and the rule G4 both use, so the pointer cannot name a section that is not there', () => {
    expect(LIMITS_HEADING).toBe('What the checks cannot see');
  });

  it('says which kinds of limit the list holds, one phrase for each kind', () => {
    expect(LIMITS_INTRO).toContain('that no rule compares with a claim');
    expect(LIMITS_INTRO).toContain('takes a word for a number');
    expect(LIMITS_INTRO).toContain('refuses more than it should');
    expect(LIMITS_INTRO).toContain('that a model writes and no rule reads');
  });
});
