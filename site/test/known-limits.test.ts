import { describe, expect, it } from 'vitest';
import { extractTokens, isSentenceStarter, openingWordAccepted } from '@robywire/gate';
import { KNOWN_LIMITS } from '../src/lib/method';

// The method page lists what the checks cannot see. A limit that stops being true
// must fail a test, so each one is shown here with the real token reader of the gate.

describe('KNOWN_LIMITS', () => {
  const unseen = KNOWN_LIMITS.filter((limit) => limit.kind === 'unseen');
  const strict = KNOWN_LIMITS.filter((limit) => limit.kind === 'strict');

  it('lists what the review asked for: ordinals, vague quantities, lowercase names, and the false alarms of the name check', () => {
    const text = KNOWN_LIMITS.map((limit) => limit.text).join(' ');
    expect(text).toContain('Ordinals such as first, second and third');
    expect(text).toContain('"a couple", "several"');
    expect(text).toContain('iRobot or xAI');
    expect(text).toContain('The name check is strict on purpose');
    expect(unseen.length).toBeGreaterThanOrEqual(5);
    expect(strict).toHaveLength(1);
  });

  it.each(KNOWN_LIMITS.map((limit) => [limit.text.slice(0, 40), limit] as const))('is written as plain sentences: %s', (_name, limit) => {
    expect(limit.text).toMatch(/^[A-Z]/);
    expect(limit.text.endsWith('.')).toBe(true);
    expect(limit.example.endsWith('.')).toBe(true);
  });

  // A limit that stops being true must fail a test. Each example is a sentence that the real token reader looks at.
  it.each(unseen.map((limit) => [limit.example, limit] as const))('is true: the gate reads no number, date, name or amount in "%s"', (example) => {
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([]);
    expect(tokens.dates).toEqual([]);
    expect(tokens.uncheckable).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it.each(unseen.map((limit) => [limit.example, limit] as const))('has an example that the opening-word rule lets through, so the sentence is not stopped for another reason: "%s"', (example) => {
    const { initialWord } = extractTokens(example);
    expect(initialWord === undefined || isSentenceStarter(initialWord), example).toBe(true);
  });

  it('shows with the same reader that a number, a date and a name that the gate can see are seen, so the examples above are not empty by accident', () => {
    expect(extractTokens('The plant shipped 12 arms on 3 October 2026, and Mercer Wire reported it.')).toMatchObject({
      numbers: [{ value: '12' }],
      dates: [{ iso: '2026-10-03' }],
      names: ['mercer', 'wire'],
    });
  });

  it('is true of the strict limit: an ordinary capitalised noun at the start of a sentence is refused unless a claim contains it', () => {
    const [limit] = strict;
    const { initialWord } = extractTokens(limit!.example);
    expect(initialWord).toBe('Output');
    expect(openingWordAccepted('Output', new Set(), new Set())).toBe(false);
    expect(openingWordAccepted('Output', new Set(['output']), new Set())).toBe(true);
  });

  it('says what the strictness costs and what it buys', () => {
    const [limit] = strict;
    expect(limit!.text).toContain('A false alarm costs a revision round; a name that slipped through would cost a wrong claim.');
  });
});
