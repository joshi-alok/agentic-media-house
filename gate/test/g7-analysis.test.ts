import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG7 } from '../src/checks/g7-analysis';
import { defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { runGate } from '../src/gate';
import type { Sentence } from '../src/schemas';
import { findSentence, mutate } from './helpers';

const threeFacts: Sentence[] = [
  { kind: 'fact', text: 'Another plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'One more plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'A third plain fact.', claimIds: ['c-1'] },
];

// The golden piece has three analysis sentences. The first, in the section
// "What the customer reports", is the one these tests change. None of them
// contains a number, a date or a name, so they add nothing the facts do not already say.
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
  ])('fails an analysis sentence in %s', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_PLACEMENT',
        message: `the analysis sentence at ${where} is not allowed there: the title and the description state facts only`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = asAnalysis(g.draft.title);
      g.draft.description = asAnalysis(g.draft.description);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'description']);
  });

  it.each([
    ['the opening', (g: GateInput) => (g.draft.opening[1] = asAnalysis(g.draft.opening[1]!))],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[3] = asAnalysis(g.draft.takeaways[3]!))],
  ])('allows analysis in %s: a blog needs a voice there, and only the title and the description are closed to it', (_name, change) => {
    expect(codes(run((g) => void change(g)))).not.toContain('G7_ANALYSIS_PLACEMENT');
  });

  it('allows analysis in the sections of the body', () => {
    expect(run((g) => (g.draft.sections[2]!.paragraphs[1]![0] = asAnalysis(g.draft.sections[2]!.paragraphs[1]![0]!)))).toEqual({
      failures: [],
      holdReasons: [],
    });
  });
});

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 44 sentences, three of them analysis: opening 3,
  // takeaways 4, sections 28, limitations 9. Seven more analysis sentences make
  // 10 of 51 (19.6%); eight more make 11 of 52 (21.2%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 7))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 8)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 11 of the 52 sentences in the body (21.2%); the cap is 20.0%',
        where: 'body',
      },
    ]);
  });

  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.06 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.07 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 3 / 44 } })).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['the opening', (g: GateInput) => g.draft.opening.push(...threeFacts)],
    ['the takeaways', (g: GateInput) => g.draft.takeaways.push(...threeFacts)],
    ['a section', (g: GateInput) => g.draft.sections[0]!.paragraphs[0]!.push(...threeFacts)],
    [
      'the limitations',
      (g: GateInput) => g.draft.limitations.push(structuredClone(g.draft.limitations[0]!), structuredClone(g.draft.limitations[1]!), structuredClone(g.draft.limitations[2]!)),
    ],
  ])('counts the sentences of %s among the body sentences', (_name, addThree) => {
    // 11 analysis sentences of 52 is over the cap; three more body sentences make it exactly 11 of 55, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 8);
      addThree(g);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 4 of 45 would be over a cap of 3 in 44; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 3 / 44 } });
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
      g.draft.description = { kind: 'analysis', text: 'That is 22% more than before.', claimIds: [] };
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_NEW_VALUE']);
  });
});

describe('G7_ANALYSIS_NEW_VALUE: numbers in words', () => {
  it('fails a number in words that no fact sentence contains, and says which', () => {
    expect(run(saying('The thirteen kilograms payload is modest.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number "thirteen kilograms", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a number the facts state in digits', 'The twelve kilograms payload is modest.'],
    ['a number whose unit the facts also use', 'The thirty-eight kg arm is modest.'],
    ['a number without a unit', 'The forty arms at Ashvale are modest.'],
    ['a count that the facts state', 'The seven investors are modest.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails the right figure with the wrong unit', () => {
    expect(codes(run(saying('The twelve pounds payload is modest.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a word that states an amount with no value to check, and says which', () => {
    expect(run(saying('The measured rate is half the maximum.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number word "half", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it('reports each such word once', () => {
    expect(codes(run(saying('The rate doubled, doubled again and then halved.')))).toEqual([
      'G7_ANALYSIS_NEW_VALUE',
      'G7_ANALYSIS_NEW_VALUE',
    ]);
  });

  it('does not take "one" for a number when it is the pronoun', () => {
    expect(run(saying('The gap is one that is normal for a figure quoted as an upper limit.'))).toEqual({ failures: [], holdReasons: [] });
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
    expect(codes(run(saying('The gap is narrower since 5 August 2026, and again since 5 August 2026.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
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

describe('G7_ANALYSIS_NEW_NAME: names', () => {
  it('fails a name no fact sentence contains, and says which', () => {
    const output = run(saying('The rate sits below the maximum, a gap that Harlow Logistics also reported.'));
    expect(output.failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_NAME',
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

  it('does not read the first word as a name: it has its own rule, below', () => {
    const output = run(saying('Ashvale reported something similar, as Harlow did.'));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the analysis sentence at ${ANALYSIS_AT} introduces the name "harlow", which no fact sentence contains`,
    ]);
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME']);
  });

  it('ignores names on the allow-list, and takes the allow-list from the context', () => {
    expect(run(saying('The rate sits below the maximum, as it did on Monday.'))).toEqual({ failures: [], holdReasons: [] });
    const text = 'The rate sits below the maximum, a gap that Harlow also reported.';
    expect(codes(run(saying(text)))).toEqual(['G7_ANALYSIS_NEW_NAME']);
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
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME', 'G7_ANALYSIS_NEW_NAME']);
  });

  it('does not read fact sentences, which G4 checks', () => {
    const output = run((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The arm itself weighs')).text =
        'The arm itself weighs 83 kg and draws 650 W in typical use, said Harlow.';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G7_ANALYSIS_NEW_NAME: a name that a fact sentence opens with', () => {
  // In the golden piece "Fixture" opens the title, the description and several sentences, and is also said in the middle of the demo-day sentence.
  // Take it out of the middle of that sentence, so that the facts have it only as their first word.
  const demoDay = (g: GateInput) =>
    (findSentence(g.draft, (sentence) => sentence.text.startsWith('At a demo day on 24 September 2026')).text =
      'At a demo day on 24 September 2026, the company showed an FX-1 arm unloading mixed cartons from a trailer.');
  const naming = (text: string) => (g: GateInput) => {
    demoDay(g);
    saying(text)(g);
  };

  it('starts from facts that have the name only as their first word', () => {
    const only = cloneGolden();
    demoDay(only);
    const stated = only.draft.sections.flatMap((section) => section.paragraphs.flat()).filter((sentence) => sentence.kind === 'fact');
    expect(stated.some((sentence) => sentence.text.startsWith('Fixture Robotics'))).toBe(true);
    expect(stated.some((sentence) => /\sFixture\b/.test(sentence.text))).toBe(false);
  });

  it('lets an analysis sentence name the company that facts open with, when the claims those facts cite have the word', () => {
    expect(run(naming('The schedule suggests Fixture Robotics will keep to its plan.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('still refuses a company that no fact has, and says so', () => {
    const output = run(naming('The schedule suggests Harlow Robotics will keep to its plan.'));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the analysis sentence at ${ANALYSIS_AT} introduces the name "harlow", which no fact sentence contains`,
    ]);
  });

  it('still refuses a company that a fact opens with when the claims that fact cites do not have the word', () => {
    const output = run((g) => {
      naming('The schedule suggests Harlow will keep to its plan.')(g);
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The datasheet lists a rated payload')).text = 'Harlow lists a rated payload of 12 kg at full reach and a maximum reach of 1.4 m.';
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(output.failures[0]!.message).toContain('name "harlow"');
  });

  it('counts the opening word of a fact that is grounded only by the claims that fact cites, not by the claims of another fact', () => {
    const output = run((g) => {
      naming('The schedule suggests Quillon will keep to its plan.')(g);
      const fact = findSentence(g.draft, (sentence) => sentence.text.startsWith('The datasheet lists a rated payload'));
      fact.text = 'Quillon lists a rated payload of 12 kg at full reach and a maximum reach of 1.4 m.';
      const other = g.claims.find((claim) => claim.id === 'c-20')!;
      other.span.quote += ' Quillon was not involved.';
    });
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME']);
    const grounded = run((g) => {
      naming('The schedule suggests Quillon will keep to its plan.')(g);
      const fact = findSentence(g.draft, (sentence) => sentence.text.startsWith('The datasheet lists a rated payload'));
      fact.text = 'Quillon lists a rated payload of 12 kg at full reach and a maximum reach of 1.4 m.';
      g.claims.find((claim) => claim.id === 'c-8')!.span.quote += ' Quillon made it.';
    });
    expect(grounded).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not make a function word that a fact opens with a name that an analysis sentence may use in the middle of a sentence', () => {
    // "The" opens many facts, but an ordinary opening word is not a name: a capital "The" in the middle of an analysis sentence is still read as one.
    const output = run(naming('The schedule suggests that The Plan will hold.'));
    expect(output.failures.map((failure) => failure.message.match(/name "([^"]+)"/)?.[1])).toEqual(['the', 'plan']);
  });
});

describe('G7_ANALYSIS_NEW_NAME: the opening word', () => {
  it('fails an analysis sentence that opens with a name no claim it cites contains, and says which', () => {
    expect(run(saying('Harlow reported something similar.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_NAME',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the opening word "Harlow", which is neither an ordinary opening word nor a word of the quoted passage, the names or the outlet of any claim it cites`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a function word', 'However, that is normal for a figure quoted as an upper limit.'],
    ['a name that the quoted passage of a claim it cites has', 'Ashvale reported something similar.'],
    ['a name in another case', 'ASHVALE reported something similar.'],
    ['a name with a possessive ending', "Ashvale's rate is below the maximum."],
    ['an ordinary word that the quoted passage of a claim it cites has', 'Picks fell below the maximum.'],
    ['a word on the allow-list', 'Monday brought a similar rate.'],
    ['a quotation mark and then a capital letter', '"Picks" fell below the maximum.'],
    ['a bracket and then a capital letter', '(Picks) fell below the maximum.'],
    ['a number', '940 picks is below the maximum.'],
  ])('allows an opening with %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['a word that only a fact sentence has, as its own first word', 'Peak speeds are normal for a figure quoted as an upper limit.'],
    ['a word that only the title has', 'Robotics is a field where such gaps are normal.'],
    ['a name that a fact sentence states and the claims it cites do not have', 'Corvane reported something similar.'],
  ])('refuses an opening with %s', (_name, text) => {
    expect(codes(run(saying(text)))).toEqual(['G7_ANALYSIS_NEW_NAME']);
  });

  it('takes the word from the claims that the analysis sentence cites, and from no other claim', () => {
    expect(codes(run((g) => { saying('Corvane reported something similar.')(g); analysisSentence(g).claimIds = ['c-21', 'c-18']; }))).toEqual([]);
    expect(codes(run((g) => { saying('Corvane reported something similar.')(g); analysisSentence(g).claimIds = []; }))).toEqual(['G7_ANALYSIS_NEW_NAME']);
  });

  it('does not take the word from the text or the label of a claim it cites', () => {
    const made = (change: (claim: GateInput['claims'][number]) => void) => (g: GateInput) => {
      saying('Harlow reported something similar.')(g);
      change(g.claims.find((claim) => claim.id === 'c-21')!);
    };
    expect(codes(run(made((claim) => { claim.text = 'harlow averaged 940 picks an hour.'; })))).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(codes(run(made((claim) => { claim.label = 'harlow pick rate'; })))).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(codes(run(made((claim) => { claim.values.push({ kind: 'name', raw: 'Harlow', normalised: 'harlow' }); })))).toEqual([]);
  });

  it('takes the allow-list from the context', () => {
    expect(codes(run(saying('Harlow reported something similar.')))).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(run(saying('Harlow reported something similar.'), { nameAllowList: ['harlow'] })).toEqual({ failures: [], holdReasons: [] });
  });

  it('takes no word from another analysis sentence or from a limitation', () => {
    const second = run((g) => {
      saying('Harlow reported something similar.')(g);
      addAnalysis(g, 1);
      findSentence(g.draft, (sentence) => sentence.text === 'That is a plain reading of the figures.').text = 'Harlow also did.';
    });
    expect(codes(second)).toEqual(['G7_ANALYSIS_NEW_NAME', 'G7_ANALYSIS_NEW_NAME']);

    const limitation = run(saying('Measurement was not independent.'));
    expect(codes(limitation)).toEqual(['G7_ANALYSIS_NEW_NAME']);
  });

  it('reports the opening word before the other new values of the sentence', () => {
    const output = run(saying('Harlow saw 22% less.'));
    expect(output.failures.map((failure) => failure.message.match(/introduces the (.*?),/)?.[1])).toEqual(['opening word "Harlow"', 'number "22%"']);
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME', 'G7_ANALYSIS_NEW_VALUE']);
  });

  it('gives an invented company at the start the code of a name and an invented number at the start the code of a value', () => {
    const company = run(saying('Harlow Logistics reported something similar.'));
    expect(codes(company)).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(company.failures[0]!.message).toContain('opening word "Harlow"');

    const number = run(saying('22% fewer picks is normal for a figure quoted as an upper limit.'));
    expect(codes(number)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
    expect(number.failures[0]!.message).toContain('number "22%"');
  });
});

describe('G7_ANALYSIS_NEW_NAME: an analysis sentence that does not start with a capital letter or a digit', () => {
  // The rule for the opening word reads only a word that starts with a capital letter, and no model reads analysis. A sentence that starts in lowercase
  // ("harlow reported something similar.") would have its first word read by nothing, so it is refused.
  it('fails an analysis sentence that starts with a lowercase name, and says where it is and what it starts with', () => {
    expect(run(saying('harlow reported something similar.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_NAME',
        message: `the analysis sentence at ${ANALYSIS_AT} starts with "harlow", not with a capital letter or a digit, so its first word cannot be read as a name: start it with a capital letter or a digit`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it('sends the draft back', () => {
    const result = runGate(mutate(cloneGolden(), saying('harlow reported something similar.')), defaultContext());
    expect(result.failures.map((failure) => failure.code)).toEqual(['G7_ANALYSIS_NEW_NAME']);
    expect(result.route).toBe('revise');
  });

  it.each([
    ['a lowercase word that is not a name', 'picks fell below the maximum.'],
    ['a lowercase letter after a quotation mark', '"picks" fell below the maximum.'],
    ['a lowercase letter after a bracket', '(picks) fell below the maximum.'],
    ['spaces and then a lowercase letter', '  picks fell below the maximum.'],
    ['a dash', '- Picks fell below the maximum.'],
    ['a full stop', '...Picks fell below the maximum.'],
    ['a closing bracket', ') Picks fell below the maximum.'],
  ])('fails an analysis sentence that starts with %s', (_name, text) => {
    expect(codes(run(saying(text)))).toEqual(['G7_ANALYSIS_NEW_NAME']);
  });

  it('names the first word after the opening quotation marks and brackets, as written, up to 40 characters', () => {
    const message = (text: string) => run(saying(text)).failures[0]!.message;
    expect(message('"(harlow) reported something similar."')).toContain('starts with "harlow)"');
    expect(message(`${'x'.repeat(60)} reported something similar.`)).toContain(`starts with "${'x'.repeat(40)}"`);
  });

  it('fails an analysis sentence that has no first character, and says so', () => {
    for (const text of ['', '   ', '""']) {
      expect(run(saying(text)).failures, JSON.stringify(text)).toEqual([
        {
          check: 'G7',
          code: 'G7_ANALYSIS_NEW_NAME',
          message: `the analysis sentence at ${ANALYSIS_AT} has no first character, so no name can be read in it: start it with a capital letter or a digit`,
          where: ANALYSIS_AT,
        },
      ]);
    }
  });

  it.each([
    ['a digit', '940 picks is below the maximum.'],
    ['a capital letter', 'Picks fell below the maximum.'],
    ['a quotation mark and then a capital letter', '"Picks" fell below the maximum.'],
    ['a curly quotation mark and then a capital letter', '\u201CPicks\u201D fell below the maximum.'],
    ['a bracket and then a digit', '(940) picks is below the maximum.'],
  ])('passes an analysis sentence that starts with %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports it once, and not also as an opening word', () => {
    const output = run(saying('harlow saw 22% less.'));
    expect(codes(output)).toEqual(['G7_ANALYSIS_NEW_NAME', 'G7_ANALYSIS_NEW_VALUE']);
  });

  it('reads analysis sentences only: a fact sentence that starts in lowercase is the business of the model check', () => {
    const lowercase = run((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'fact').text = 'harlow announced that deliveries have started.';
    });
    expect(lowercase).toEqual({ failures: [], holdReasons: [] });
  });

  it('reads an analysis sentence wherever it stands, each at its own place', () => {
    const output = run((g) => {
      saying('harlow reported something similar.')(g);
      addAnalysis(g, 1);
      findSentence(g.draft, (sentence) => sentence.text === 'That is a plain reading of the figures.').text = 'it is plain.';
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G7_ANALYSIS_NEW_NAME', ANALYSIS_AT],
      ['G7_ANALYSIS_NEW_NAME', expect.stringMatching(/^section "/)],
    ]);
    expect(new Set(output.failures.map((failure) => failure.where)).size).toBe(2);
  });
});
