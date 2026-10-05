import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG7 } from '../src/checks/g7-analysis';
import { defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import type { Sentence } from '../src/schemas';
import { findSentence, mutate } from './helpers';

const twoFacts: Sentence[] = [
  { kind: 'fact', text: 'Another plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'One more plain fact.', claimIds: ['c-1'] },
];

// The golden piece has exactly one analysis sentence. It contains no number,
// date or name, so it adds nothing the facts do not already say.
const ANALYSIS_AT = 'section "What the customer reports", sentence 6';
const analysisSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');

const run = (change: (copy: GateInput) => void, overrides?: ContextOverrides): CheckOutput =>
  checkG7(mutate(cloneGolden(), change), defaultContext(overrides));
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

/** Make a fact sentence into an analysis sentence with the same words and claims. */
const asAnalysis = (sentence: Sentence): Sentence => ({ kind: 'analysis', text: sentence.text, claimIds: sentence.claimIds });

/** Say `text` in the golden piece's one analysis sentence. */
const saying = (text: string) => (g: GateInput) => {
  analysisSentence(g).text = text;
};

/** Add `count` analysis sentences with no number, date or name to the last paragraph of the piece. */
function addAnalysis(g: GateInput, count: number): void {
  const last = g.draft.sections.at(-1)!.paragraphs.at(-1)!;
  for (let i = 0; i < count; i++) last.push({ kind: 'analysis', text: 'That is a plain reading of the figures.', claimIds: [] });
}

describe('G7: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG7(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('really contains the one analysis sentence the other tests build on', () => {
    expect(analysisSentence(cloneGolden()).text).toBe(
      'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
    );
  });

  it('is the seventh check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[6]).toBe(checkG7);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG7(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G7_ANALYSIS_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = asAnalysis(g.draft.title)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = asAnalysis(g.draft.description)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = asAnalysis(g.draft.opening[1]!)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[3] = asAnalysis(g.draft.takeaways[3]!)), 'takeaways, sentence 4'],
  ])('fails an analysis sentence in %s', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_PLACEMENT',
        message: `the analysis sentence at ${where} is not allowed there: analysis belongs in the sections of the body`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = asAnalysis(g.draft.title);
      g.draft.opening[0] = asAnalysis(g.draft.opening[0]!);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'opening, sentence 1']);
  });

  it('allows analysis in the sections of the body', () => {
    expect(run((g) => (g.draft.sections[2]!.paragraphs[1]![0] = asAnalysis(g.draft.sections[2]!.paragraphs[1]![0]!)))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });
});

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 47 sentences, one of them analysis: opening 3,
  // takeaways 4, sections 25, limitations 15. Ten more analysis sentences make
  // 11 of 57 (19.3%); eleven more make 12 of 58 (20.7%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 10))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 11)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 12 of the 58 sentences in the body (20.7%); the cap is 20.0%',
        where: 'body',
      },
    ]);
  });

  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.02 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.03 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 1 / 47 } })).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['the opening', (g: GateInput) => g.draft.opening.push(...twoFacts)],
    ['the takeaways', (g: GateInput) => g.draft.takeaways.push(...twoFacts)],
    ['a section', (g: GateInput) => g.draft.sections[0]!.paragraphs[0]!.push(...twoFacts)],
    ['the limitations', (g: GateInput) => g.draft.limitations.push(structuredClone(g.draft.limitations[0]!), structuredClone(g.draft.limitations[1]!))],
  ])('counts the sentences of %s among the body sentences', (_name, addTwo) => {
    // 12 analysis sentences of 58 is over the cap; two more body sentences make it exactly 12 of 60, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 11);
      addTwo(g);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 2 of 47 would be over a cap of 1 in 47; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 1 / 47 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });

  it('has no share to measure in a piece with no body sentences', () => {
    const output = run((g) => {
      g.draft.opening = [];
      g.draft.takeaways = [];
      g.draft.sections = [];
      g.draft.limitations = [];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G7_ANALYSIS_NEW_VALUE: numbers', () => {
  const NEW_NUMBER = 'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';

  it('fails an analysis sentence that brings in a number no fact sentence contains, and says which', () => {
    expect(run(saying(NEW_NUMBER)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number "22%", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a number the facts state', 'The measured 940 picks an hour is below the maximum.'],
    ['the same number written differently', 'The measured rate is below the 1.2k maximum, and a 12 kg payload is rated.'],
    ['a number whose unit the facts also use', 'The 38 kg arm and its 650 W draw are modest.'],
    ['a number without a unit that the facts give a unit', 'The 38 figure is a mass.'],
    ['a currency amount the facts state', 'The $450 million round is large.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails the same number with a different unit', () => {
    expect(codes(run(saying('The 12 lb payload is modest.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('reports a new number once, however often the sentence repeats it', () => {
    expect(codes(run(saying('Up 22% and then 22% again, and 31%.')))).toEqual(['G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_VALUE']);
  });

  it('takes the facts to be the fact sentences only: not another analysis sentence, not a limitation', () => {
    const second = run((g) => {
      saying('The gap is 22% in this case.')(g);
      addAnalysis(g, 1);
      findSentence(g.draft, (sentence) => sentence.text === 'That is a plain reading of the figures.').text = 'It is also 22% in the other case.';
    });
    expect(codes(second)).toEqual(['G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_VALUE']);

    const limitation = run((g) => {
      g.draft.limitations[0]!.text = 'The 77 kg figure comes from somewhere.';
      saying('The 77 kg figure is an outlier.')(g);
    });
    expect(codes(limitation)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('takes a number from any fact sentence: the title, the description, the takeaways and the sections', () => {
    expect(run(saying('The 1.4 m reach and the 40 arms are modest.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reads an analysis sentence in the wrong place for new values as well as for placement', () => {
    const output = run((g) => {
      g.draft.opening[1] = { kind: 'analysis', text: 'That is 22% more than before.', claimIds: [] };
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_NEW_VALUE']);
  });
});

describe('G7_ANALYSIS_NEW_VALUE: dates', () => {
  it('fails a date no fact sentence contains, and says which', () => {
    const output = run(saying('The gap has narrowed since 5 August 2026.'));
    expect(output.failures.map((failure) => [failure.code, failure.message])).toEqual([
      ['G7_ANALYSIS_NEW_VALUE', `the analysis sentence at ${ANALYSIS_AT} introduces the date "5 August 2026", which no fact sentence contains`],
    ]);
  });

  it.each([
    ['a date the facts state', 'The gap has narrowed since 18 August 2026.'],
    ['the same date written another way', 'The gap has narrowed since 2026-08-18.'],
    ['a month that a stated date falls in', 'The gap has narrowed since August 2026.'],
    ['a year that a stated date falls in', 'The gap has narrowed since 2026.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports a new date once, however often the sentence repeats it', () => {
    expect(codes(run(saying('Narrower since 5 August 2026, and again since 5 August 2026.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a year the facts do not mention', () => {
    expect(codes(run(saying('The gap may narrow by 2029.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a day when the facts give only the month', () => {
    const output = run((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The installation at Ashvale went live')).text =
        'The installation at Ashvale went live in August 2026, according to Brindle Logistics.';
      saying('The gap has narrowed since 18 August 2026.')(g);
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });
});

describe('G7_ANALYSIS_NEW_VALUE: names', () => {
  it('fails a name no fact sentence contains, and says which', () => {
    const output = run(saying('The rate sits below the maximum, a gap that Harlow Logistics also reported.'));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the name "harlow", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it('allows names the fact sentences use', () => {
    expect(run(saying('The pattern at Ashvale suggests Tarnmoor will follow, as Brindle Logistics hopes.'))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });

  it('exempts the first word of the sentence, as the name check for facts does', () => {
    expect(run(saying('Harlow reported something similar.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('ignores names on the allow-list, and takes the allow-list from the context', () => {
    expect(run(saying('The rate sits below the maximum, as it did on Monday.'))).toEqual({ failures: [], holdReasons: [] });
    const text = 'The rate sits below the maximum, a gap that Harlow also reported.';
    expect(codes(run(saying(text)))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
    expect(run(saying(text), { nameAllowList: ['harlow'] })).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not read quoted words, which G5 checks', () => {
    expect(run(saying('The rate sits below the maximum, a gap that the "Harlow" report calls normal.'))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });

  it('reports each new name once, and several names separately', () => {
    const output = run(saying('The rate sits below the maximum, as Harlow and Harlow and Quillon also found.'));
    expect(output.failures.map((failure) => failure.message.match(/name "([^"]+)"/)?.[1])).toEqual(['harlow', 'quillon']);
  });

  it('does not read fact sentences, which G4 checks', () => {
    const output = run((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The arm itself weighs')).text =
        'The arm itself weighs 83 kg and draws 650 W in typical use, said Harlow.';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
