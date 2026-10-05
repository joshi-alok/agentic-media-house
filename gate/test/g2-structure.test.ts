import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG2 } from '../src/checks/g2-structure';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, claimById, findSentence, mutate } from './helpers';

/** `count` words ending in a full stop, the first with a capital letter, as every sentence must start (G2_SENTENCE_START). */
const sentenceOf = (count: number) => `${['Word', ...Array.from({ length: count - 1 }, () => 'word')].join(' ')}.`;

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
  for (const sentence of sections) sentence.text = 'Word.';
  sections.at(-1)!.text = sentenceOf(target - (bodyWords(input) - 1));
}

const claimOfGolden = (input: GateInput, id: string) => claimById(input.claims, id);

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
    // The headings are far too long, which is reported, but the body length is not affected.
    expect(codesAfter(change)).toEqual(['G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG']);
  });
});

describe('G2_SECTIONS_MIN', () => {
  it('fails for a single section, and for none', () => {
    expect(codesAfter((g) => (g.draft.sections = g.draft.sections.slice(0, 1)))).toContain('G2_SECTIONS_MIN');
    expect(codesAfter((g) => (g.draft.sections = []))).toContain('G2_SECTIONS_MIN');
  });

  it('passes for two sections', () => {
    const change = (g: GateInput) => {
      g.draft.sections = g.draft.sections.slice(0, 2);
      setBodyWords(g, 665);
    };
    expect(codesAfter(change)).toEqual([]);
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

describe('G2_HEADING_TOO_LONG', () => {
  const headingOf = (length: number) => 'a'.repeat(length);

  it('passes a heading of exactly 80 characters and fails one of 81', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = headingOf(80)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = headingOf(81)))).toEqual(['G2_HEADING_TOO_LONG']);
  });

  it('counts the characters without the spaces around the heading', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = `  ${headingOf(80)}  `))).toEqual([]);
  });

  it('says how long the heading is and where it is', () => {
    const out = resultAfter((g) => (g.draft.sections[1]!.heading = headingOf(95)));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_HEADING_TOO_LONG',
        message: `the heading "${headingOf(95)}" is 95 characters; the limit is 80`,
        where: `section "${headingOf(95)}"`,
      },
    ]);
  });

  it('reads the limit from the context', () => {
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 20 } }))).toEqual([
      'G2_HEADING_TOO_LONG',
      'G2_HEADING_TOO_LONG',
    ]);
    // The longest golden heading, "What the customer reports", has 25 characters.
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 24 } }))).toEqual(['G2_HEADING_TOO_LONG']);
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 25 } }))).toEqual([]);
  });

  it('fails once for each long heading', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = headingOf(81);
      g.draft.sections[2]!.heading = headingOf(120);
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG']);
  });
});

describe('G2_HEADING_EMPTY', () => {
  it.each([[''], ['   '], ['\t\n']])('fails for the heading %j', (heading) => {
    const out = resultAfter((g) => (g.draft.sections[1]!.heading = heading));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_HEADING_EMPTY',
        message: 'a section has no heading: every section needs a heading that says what it is about',
        where: `section "${heading}"`,
      },
    ]);
  });

  it('fails once for each empty heading', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = '';
      g.draft.sections[2]!.heading = ' ';
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_EMPTY', 'G2_HEADING_EMPTY']);
  });
});

/** Make every claim one that needs no limitation sentence: a filing, with a status of "deployed". */
const needNothing = (g: GateInput) => {
  for (const claim of g.claims) {
    claim.basis = 'filing';
    claim.status = 'deployed';
  }
};

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
      needNothing(g);
      g.claims[0]!.basis = basis;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it.each(['demonstrated', 'planned'] as const)('treats a claim that is only %s as needing limitations', (status) => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims[0]!.status = status;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it.each(['filing', 'standard', 'paper', 'measured'] as const)('lets a piece resting only on %s claims go without', (basis) => {
    const change = (g: GateInput) => {
      needNothing(g);
      for (const claim of g.claims) claim.basis = basis;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it.each(['deployed', 'unspecified'] as const)('lets a piece whose claims are all %s go without', (status) => {
    const change = (g: GateInput) => {
      needNothing(g);
      for (const claim of g.claims) claim.status = status;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('ignores a claim that no sentence cites', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('counts a claim that only the title cites', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      g.draft.title.claimIds = ['c-99'];
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('ignores a citation of a claim that does not exist, which G3 reports', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.draft.title.claimIds = ['c-999'];
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('passes when limitations exist, whatever the bases', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });
});

describe('G2_LIMITATION_COVERAGE', () => {
  const droppingSentence = (at: number) => (g: GateInput) => {
    g.draft.limitations.splice(at, 1);
  };

  it('passes the golden piece, whose five sentences cover every claim that needs one', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails each claim that a missing basis sentence leaves out, and says which and why', () => {
    // Sentence 1 covers the eight datasheet claims, c-8 to c-15. Setting the body length keeps G2_BODY_LENGTH out of the way.
    const out = resultAfter((g) => {
      droppingSentence(0)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures).toHaveLength(8);
    expect(out.failures[0]).toEqual({
      check: 'G2',
      code: 'G2_LIMITATION_COVERAGE',
      message: 'claim c-8 (payload) has the basis "datasheet", but no limitation sentence with the basis template cites it',
      where: 'c-8',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15']);
    expect(new Set(out.failures.map((failure) => failure.code))).toEqual(new Set(['G2_LIMITATION_COVERAGE']));
  });

  it('fails each claim that a missing status sentence leaves out, and says which and why', () => {
    // Sentence 5 covers the five planned claims.
    const out = resultAfter((g) => {
      droppingSentence(4)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures[0]).toEqual({
      check: 'G2',
      code: 'G2_LIMITATION_COVERAGE',
      message: 'claim c-5 (Tarnmoor delivery schedule) has the status "planned", but no limitation sentence with the status template cites it',
      where: 'c-5',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-5', 'c-6', 'c-7', 'c-25', 'c-26']);
  });

  it('fails a claim that is left out of a sentence which is otherwise there', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[0]!.claimIds = g.draft.limitations[0]!.claimIds.filter((id) => id !== 'c-12');
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => [failure.code, failure.where])).toEqual([['G2_LIMITATION_COVERAGE', 'c-12']]);
  });

  it('does not count a sentence of the other template as covering a claim', () => {
    // c-27 and c-28 are covered by sentence 3 (basis) and sentence 4 (status). Make both of them 'basis' sentences.
    const out = resultAfter((g) => {
      g.draft.limitations[3]!.template = 'basis';
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => [failure.code, failure.where, failure.message.includes('status template')])).toEqual([
      ['G2_LIMITATION_COVERAGE', 'c-27', true],
      ['G2_LIMITATION_COVERAGE', 'c-28', true],
    ]);
  });

  it('asks a claim that needs both kinds of sentence for both, basis first', () => {
    // c-5 is a press-release claim that is planned. Drop the sentences for the press releases and for what is planned.
    const out = resultAfter((g) => {
      g.draft.limitations = g.draft.limitations.filter((sentence) => !sentence.claimIds.includes('c-5'));
      setBodyWords(g, 665);
    });
    const c5 = out.failures.filter((failure) => failure.where === 'c-5');
    expect(c5.map((failure) => failure.message.match(/has the (\w+)/)?.[1])).toEqual(['basis', 'status']);
  });

  it('reads the claims that the body cites, not the claims that limitation sentences cite', () => {
    // c-99 is a datasheet claim that only a limitation sentence mentions: nothing in the body rests on it.
    const out = resultAfter((g) => {
      g.claims.push({ ...structuredClone(claimOfGolden(g, 'c-8')), id: 'c-99' });
      g.draft.limitations[0]!.claimIds = [...g.draft.limitations[0]!.claimIds, 'c-99'];
    });
    expect(out.failures.map((failure) => failure.code)).not.toContain('G2_LIMITATION_COVERAGE');
  });

  it('asks nothing for claims that need no sentence, and nothing of an uncited claim', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.draft.limitations = [];
      setBodyWords(g, 665);
      g.claims.push({ ...structuredClone(claimOfGolden(g, 'c-8')), id: 'c-99', basis: 'datasheet' });
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('leaves the case where there is no section at all to G2_LIMITATIONS_MISSING', () => {
    const out = resultAfter((g) => {
      g.draft.limitations = [];
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('ignores an unknown id in a sentence, which G8 reports', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[0]!.claimIds = [...g.draft.limitations[0]!.claimIds, 'c-999'];
    });
    expect(out.failures).toEqual([]);
  });
});

describe('G2_SENTENCE_START', () => {
  const MESSAGE_END = 'every sentence must start with a capital letter or a digit (after any opening quotation mark or bracket), so that the first-word rule can read it';

  /** Sets the text of the first key takeaway, a sentence that cites a claim and whose length does not matter to any other rule. */
  const takeawayIs = (text: string) => (g: GateInput) => {
    g.draft.takeaways[0]!.text = text;
  };

  /** Turns the first letter of the sentence at `index` (document order, as allSentences numbers them) to lowercase. */
  const lowerAt = (index: number) => (g: GateInput) => {
    const { sentence } = allSentences(g.draft)[index]!;
    sentence.text = sentence.text.replace(/^./u, (first) => first.toLowerCase());
  };

  const golden = cloneGolden();
  const firstHeading = golden.draft.sections[0]!.heading;
  const indexOfFirst = (section: string) => allSentences(golden.draft).findIndex((item) => item.section === section);

  it('passes every sentence of the golden piece, the title, the description, the opening, the takeaways, the body and the limitations', () => {
    expect(allSentences(golden.draft)).toHaveLength(42);
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails a sentence that starts in lowercase, and says where it is and what it starts with', () => {
    const out = resultAfter(takeawayIs('harlow logistics plans a plant.'));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_SENTENCE_START',
        message: `the sentence at takeaways, sentence 1 starts with "harlow": ${MESSAGE_END}`,
        where: 'takeaways, sentence 1',
      },
    ]);
    expect(out.holdReasons).toEqual([]);
  });

  it.each([
    ['title', 'title'],
    ['description', 'description'],
    ['opening', 'opening, sentence 1'],
    ['takeaways', 'takeaways, sentence 1'],
    ['body', `section "${firstHeading}", sentence 1`],
    ['limitations', 'limitations, sentence 1'],
  ])('checks the sentences of the %s: the first one in lowercase fails, at %s', (section, where) => {
    const out = resultAfter(lowerAt(indexOfFirst(section)));
    expect(out.failures.map((failure) => [failure.code, failure.where])).toEqual([['G2_SENTENCE_START', where]]);
  });

  it('checks analysis sentences as it checks facts', () => {
    const out = resultAfter((g) => {
      const sentence = findSentence(g.draft, (candidate) => candidate.kind === 'analysis');
      sentence.text = sentence.text.replace(/^./u, (first) => first.toLowerCase());
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_SENTENCE_START']);
    expect(out.failures[0]!.where).toMatch(/^section "/);
  });

  it('reports each sentence that fails, once, in the order of the piece', () => {
    const last = allSentences(golden.draft).length - 1;
    const out = resultAfter((g) => {
      lowerAt(last)(g);
      lowerAt(0)(g);
      lowerAt(indexOfFirst('body'))(g);
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['title', `section "${firstHeading}", sentence 1`, 'limitations, sentence 5']);
  });

  it('reports it after the other failures of G2', () => {
    const out = resultAfter((g) => {
      lowerAt(0)(g);
      g.draft.sections = g.draft.sections.slice(0, 1);
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_BODY_LENGTH', 'G2_SECTIONS_MIN', 'G2_SENTENCE_START']);
  });

  it.each([
    ['a digit', '7 investors took part in the round.'],
    ['a capital letter', 'Investors took part in the round.'],
    ['a letter and a digit', '3D printing helped the round.'],
    ['a capital letter of another alphabet', '\u00C9clair Robotics took part in the round.'],
    ['a digit of another script', '\u0663 investors took part in the round.'],
    ['spaces and then a capital letter', '  Investors took part in the round.'],
    ['a straight quotation mark and then a capital letter', '"Investors took part," said the company.'],
    ['a curly quotation mark and then a capital letter', '\u201CInvestors took part,\u201D said the company.'],
    ['a low quotation mark and then a capital letter', '\u201EInvestors took part,\u201F said the company.'],
    ['a single quotation mark and then a capital letter', '\u2018Investors took part\u2019 was the line.'],
    ['an opening bracket and then a capital letter', '(Investors took part in the round.)'],
    ['a square bracket and then a capital letter', '[Investors] took part in the round.'],
    ['a quotation mark, a bracket and then a digit', '"(7 investors) took part," said the company.'],
  ])('passes a sentence that starts with %s', (_name, text) => {
    expect(codesAfter(takeawayIs(text))).toEqual([]);
  });

  it.each([
    ['a lowercase letter', 'investors took part in the round.'],
    ['a lowercase name that starts a sentence', 'iRobot took part in the round.'],
    ['a lowercase letter after a straight quotation mark', '"investors took part," said the company.'],
    ['a lowercase letter after a curly quotation mark', '\u201Cinvestors took part,\u201D said the company.'],
    ['a lowercase letter after a bracket', '(investors took part in the round.)'],
    ['a lowercase letter after a quotation mark and a bracket', '"(investors) took part," said the company.'],
    ['spaces and then a lowercase letter', '  investors took part in the round.'],
    ['a lowercase letter of another alphabet', '\u00E9clair Robotics took part in the round.'],
    ['a currency sign', '$2 million was raised.'],
    ['a dash', '- Investors took part in the round.'],
    ['a full stop', '...Investors took part in the round.'],
    ['a closing bracket', ') Investors took part in the round.'],
  ])('fails a sentence that starts with %s', (_name, text) => {
    expect(codesAfter(takeawayIs(text))).toEqual(['G2_SENTENCE_START']);
  });

  it('names the first word after the opening quotation marks and brackets, as written, up to 40 characters', () => {
    const message = (text: string) => resultAfter(takeawayIs(text)).failures[0]!.message;
    expect(message('"(harlow) logistics plans a plant."')).toContain('starts with "harlow)"');
    expect(message(`${'x'.repeat(60)} plans a plant.`)).toContain(`starts with "${'x'.repeat(40)}"`);
  });

  it('fails a sentence that has no first character, and says so', () => {
    for (const text of ['', '   ', '""', '"("']) {
      const out = resultAfter(takeawayIs(text));
      expect(out.failures, JSON.stringify(text)).toEqual([
        {
          check: 'G2',
          code: 'G2_SENTENCE_START',
          message: 'the sentence at takeaways, sentence 1 has no first character: every sentence must start with a capital letter or a digit',
          where: 'takeaways, sentence 1',
        },
      ]);
    }
  });

  it('stops what the first-word rule of G4 cannot see: a made-up name in lowercase at the start of a sentence', () => {
    const input = mutate(cloneGolden(), takeawayIs('harlow logistics plans a second plant.'));
    // G4 finds no first word and no name in that sentence, so it reports nothing ...
    expect(checkG4(input, defaultContext()).failures).toEqual([]);
    // ... and G2 is the check that refuses it.
    expect(checkG2(input, defaultContext()).failures.map((failure) => failure.code)).toEqual(['G2_SENTENCE_START']);
  });

  it('does not read the headings, which are not sentences: G4 has its own rule for them', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = 'what shipped'))).toEqual([]);
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
