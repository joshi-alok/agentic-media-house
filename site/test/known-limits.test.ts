import { describe, expect, it } from 'vitest';
import {
  buildLimitations,
  citedClaims,
  claimWords,
  defaultConfig,
  defaultContext,
  extractTokens,
  openingWordAccepted,
  runGate,
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
    expect(unchecked).toHaveLength(4);
    expect(KNOWN_LIMITS).toHaveLength(15);
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

  // The examples above are read by the token reader alone. Here the same sentences stand in a piece that the real gate looks at.
  it.each(unseen.map((limit) => [limit.example, limit] as const))('has an example that the gate lets through with no finding about a figure or a name: "%s"', (example) => {
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = example;
    const result = runGate(input, defaultContext());
    const found = [...result.failures, ...result.warnings].filter((finding) => finding.check === 'G4' || finding.check === 'G5').map((finding) => finding.code);
    expect(found, example).toEqual([]);
  });

  it.each(misread.map((limit) => [limit.example, limit] as const))('has an example that the gate looks up as the number it reads, and sends back when no claim lists it: "%s"', (example) => {
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = example;
    const result = runGate(input, defaultContext());
    expect(result.failures.map((failure) => failure.code), example).toContain('G4_NUMBER_UNSUPPORTED');
  });

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

  /** The golden piece with one section heading and its first sentence changed, and the codes of the findings about the heading, as blockers and as notes. */
  const headingFindings = (input: GateInput) => {
    const result = runGate(input, defaultContext());
    return {
      blockers: result.failures.filter((failure) => failure.code === 'G4_HEADING_NAME').length,
      notes: result.warnings.filter((note) => note.code === 'G4_HEADING_NAME').length,
    };
  };

  it('is true of the strict limit about the name check: an ordinary capitalised noun that opens a section heading is noted, and not noted when a claim of the section contains it', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    expect(limit.text).toContain('such as a noun that opens a section heading, is noted');
    expect(extractTokens(limit.example).initialWord).toBe('Output');
    const input = cloneGolden();
    input.draft.sections[0]!.heading = limit.example.replace(/\.$/, '');
    expect(headingFindings(input)).toEqual({ blockers: 0, notes: 1 });
    // The word is in the quoted passage of a claim that the section cites.
    const cited = input.draft.sections[0]!.paragraphs.flat().flatMap((sentence) => sentence.claimIds);
    const claim = input.claims.find((item) => item.id === cited[0])!;
    claim.span.quote = `${claim.span.quote} Output rose.`;
    expect(headingFindings(input)).toEqual({ blockers: 0, notes: 0 });
  });

  it('is true of the strict limit about the name check in a sentence: an ordinary capitalised word in the middle of a fact sentence is noted and does not send the piece back', () => {
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = 'The Output of the plant rose.';
    const result = runGate(input, defaultContext());
    expect(result.failures.map((failure) => failure.code)).not.toContain('G4_NAME_UNSUPPORTED');
    expect(result.warnings.map((note) => note.code)).toContain('G4_NAME_UNSUPPORTED');
  });

  it('is true of the strict limit about the evidence for an opening word: a word that only the text or the label of a claim has is not enough, and the same word in the quoted passage is', () => {
    const limit = withText(strict, 'The only evidence for a capitalised word that opens a section heading');
    expect(limit.text).toContain('the text and the label of a claim are written by a model and count for nothing');
    expect(limit.text).toContain('is noted in a heading and sends an analysis sentence back');
    expect(extractTokens(limit.example).initialWord).toBe('Rollout');
    const claim = structuredClone(cloneGolden().claims[0]!);
    claim.text = 'The rollout began.';
    claim.label = 'rollout';
    expect(claim.span.quote.toLowerCase()).not.toContain('rollout');
    expect(openingWordAccepted('Rollout', claimWords([claim]), new Set())).toBe(false);
    claim.span.quote = `${claim.span.quote} The rollout began.`;
    expect(openingWordAccepted('Rollout', claimWords([claim]), new Set())).toBe(true);
  });

  it('is true of that evidence in the gate: the word is noted at the head of a heading and refused at the head of an analysis sentence while only the label has it, and neither once the passage has it', () => {
    const limit = withText(strict, 'The only evidence for a capitalised word that opens a section heading');
    const opening = limit.example.replace(/\.$/, '');
    const build = (inPassage: boolean): GateInput => {
      const input = cloneGolden();
      const section = input.draft.sections[0]!;
      const claim = input.claims.find((item) => item.id === section.paragraphs.flat()[0]!.claimIds[0])!;
      claim.text = 'The rollout began.';
      claim.label = 'rollout';
      if (inPassage) claim.span.quote = `${claim.span.quote} The rollout began.`;
      else expect(claim.span.quote.toLowerCase()).not.toContain('rollout');
      section.heading = opening;
      section.paragraphs[0]![0] = { kind: 'analysis', text: limit.example, claimIds: [claim.id] };
      return input;
    };
    const findings = (input: GateInput) => {
      const result = runGate(input, defaultContext());
      return {
        headingBlockers: result.failures.filter((failure) => failure.code === 'G4_HEADING_NAME').length,
        headingNotes: result.warnings.filter((note) => note.code === 'G4_HEADING_NAME').length,
        analysisBlockers: result.failures.filter((failure) => failure.code === 'G7_ANALYSIS_NEW_NAME' && failure.message.includes('opening word "Rollout"')).length,
      };
    };
    expect(findings(build(false))).toEqual({ headingBlockers: 0, headingNotes: 1, analysisBlockers: 1 });
    expect(findings(build(true))).toEqual({ headingBlockers: 0, headingNotes: 0, analysisBlockers: 0 });
  });

  it('says what the strictness costs and what it buys', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    expect(limit.text).toContain('A note costs nothing, and the model check reads each sentence for a name that slipped through.');
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

  it('is true of analysis: a sentence of the Desk\'s own reading that asserts what no claim says passes, and no model check is made of it', () => {
    const limit = withText(unchecked, 'Analysis sentences, up to a fifth of the sentences of the body');
    expect(limit.text).toContain('and by no model');
    expect(limit.text).toContain('the page labels it Analysis');
    const input = cloneGolden();
    const analysis = input.draft.sections.flatMap((section) => section.paragraphs.flat()).find((sentence) => sentence.kind === 'analysis')!;
    analysis.text = limit.example;
    expect(route(input)).toEqual({ route: 'publish', failures: [] });
    // The share is the limit that the text names, at most a fifth, and it is what makes the exposure small and not nil.
    expect(defaultConfig().analysisShareCap).toBe(0.2);
  });

  it('is true of a heading: one that asserts something in words and names no figure and no capitalised word passes', () => {
    const limit = withText(unchecked, 'A section heading that names no figure');
    expect(limit.text).toContain('is not checked by code for what it asserts');
    expect(limit.text).not.toContain('not checked at all');
    const input = cloneGolden();
    input.draft.sections[0]!.heading = limit.example;
    expect(route(input)).toEqual({ route: 'publish', failures: [] });
  });

  it('is true of names: a piece with a name that no claim lists is published by the gate, and the name is noted', () => {
    const limit = withText(unchecked, 'A capitalised word that no claim lists is noted');
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = limit.example;
    const result = runGate(input, defaultContext());
    expect(result.failures.map((failure) => failure.code)).not.toContain('G4_NAME_UNSUPPORTED');
    expect(result.warnings.map((note) => note.code)).toContain('G4_NAME_UNSUPPORTED');
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
