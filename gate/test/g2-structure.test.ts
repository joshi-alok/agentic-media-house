import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG2 } from '../src/checks/g2-structure';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput } from '../src/gate';
import { LIMITATIONS_HEADING, TAKEAWAYS_HEADING, renderDraft } from '../src/render';
import { countWords } from '../src/text';
import { allSentences, claimById, mutate } from './helpers';

/** `count` words ending in a full stop, the first with a capital letter. */
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

  it('fails when a cited claim rests on docs, an announcement, a briefing or a demo and there are no limitations', () => {
    expect(codesAfter(noLimitations)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('names the section and the claims in the failure', () => {
    const out = resultAfter(noLimitations);
    expect(out.failures[0]?.where).toBe('limitations');
    expect(out.failures[0]?.message).toContain('c-1');
  });

  it.each(['docs', 'announcement', 'briefing', 'demo', 'reported'] as const)('treats a %s claim as needing limitations', (basis) => {
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
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'docs' });
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('counts a claim that only the title cites', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'docs' });
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
  const droppingSentence = (at: number, count = 1) => (g: GateInput) => {
    g.draft.limitations.splice(at, count);
  };

  it('passes the golden piece, whose five sentences cover every claim that needs one', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails each claim that a missing basis sentence leaves out, and says which and why', () => {
    // Sentence 1 covers the eight docs claims, c-8 to c-15. Setting the body length keeps G2_BODY_LENGTH out of the way.
    const out = resultAfter((g) => {
      droppingSentence(0)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures).toHaveLength(8);
    expect(out.failures[0]).toEqual({
      check: 'G2',
      code: 'G2_LIMITATION_COVERAGE',
      message: 'claim c-8 (payload) has the basis "docs", but no limitation sentence with the basis template cites it',
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
      message: 'claim c-5 (arms due at Tarnmoor) has the status "planned", but no limitation sentence with the status template cites it',
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
    // c-5 is an announcement claim that is planned. Drop the sentences for the announcements and for what is planned.
    const out = resultAfter((g) => {
      g.draft.limitations = g.draft.limitations.filter((sentence) => !sentence.claimIds.includes('c-5'));
      setBodyWords(g, 665);
    });
    const c5 = out.failures.filter((failure) => failure.where === 'c-5');
    expect(c5.map((failure) => failure.message.match(/has the (\w+)/)?.[1])).toEqual(['basis', 'status']);
  });

  it('reads the claims that the body cites, not the claims that limitation sentences cite', () => {
    // c-99 is a docs claim that only a limitation sentence mentions: nothing in the body rests on it.
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
      g.claims.push({ ...structuredClone(claimOfGolden(g, 'c-8')), id: 'c-99', basis: 'docs' });
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

describe('G2_HEADING_RESERVED', () => {
  // The renderer writes two headings itself: "Key takeaways" above the takeaways and "What we couldn't verify" above the notes that code
  // writes from the claims. A section of the composer with one of those headings would be written under the same heading as the real one,
  // and the page promises that what is under "What we couldn't verify" is written by code. The review of Plan 2 ran it: G1 to G9 passed.
  const asHeading = (heading: string) => (g: GateInput) => (g.draft.sections[1]!.heading = heading);

  it('says what the two reserved headings are', () => {
    expect(TAKEAWAYS_HEADING).toBe('Key takeaways');
    expect(LIMITATIONS_HEADING).toBe("What we couldn't verify");
  });

  it('fails for a section headed like the section of notes, and names the heading and where it is', () => {
    const out = resultAfter(asHeading("What we couldn't verify"));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_HEADING_RESERVED',
        message:
          'the heading "What we couldn\'t verify" is one that the Desk writes itself, over the notes that code writes from the claims: a section of the piece may not have it, because the page would show it twice',
        where: 'section "What we couldn\'t verify"',
      },
    ]);
  });

  it('fails for a section headed like the key takeaways', () => {
    const out = resultAfter(asHeading('Key takeaways'));
    expect(out.failures.map((failure) => [failure.code, failure.where])).toEqual([['G2_HEADING_RESERVED', 'section "Key takeaways"']]);
    expect(out.failures[0]?.message).toContain('over the key takeaways');
  });

  it.each([
    ['in lowercase', "what we couldn't verify"],
    ['in capitals', "WHAT WE COULDN'T VERIFY"],
    ['with a curly apostrophe', `What we couldn${String.fromCharCode(0x2019)}t verify`],
    ['with other white space', "  What  we\tcouldn't   verify "],
    ['with a full stop after it', "What we couldn't verify."],
    ['with a colon after it', "What we couldn't verify:"],
    ['the takeaways in capitals', 'KEY TAKEAWAYS'],
    ['the takeaways with other white space', ' Key   takeaways '],
    ['the takeaways with an exclamation mark', 'Key takeaways!'],
    ['the takeaways in quotation marks', '"Key takeaways"'],
  ])('fails for the heading %s', (_how, heading) => {
    expect(codesAfter(asHeading(heading))).toEqual(['G2_HEADING_RESERVED']);
  });

  it.each([
    ['one word more', "What we couldn't verify yet"],
    ['one word less', 'What we verified'],
    ['the takeaways of something', 'Key takeaways of the arm'],
    ['another word for it', 'Takeaways'],
    ['a longer sentence that has it inside', "Why what we couldn't verify matters"],
  ])('passes a heading with %s, which is a different heading', (_how, heading) => {
    expect(codesAfter(asHeading(heading))).toEqual([]);
  });

  it('fails once for each section that has a reserved heading', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = 'Key takeaways';
      g.draft.sections[2]!.heading = "What we couldn't verify";
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_RESERVED', 'G2_HEADING_RESERVED']);
  });

  it('is the only failure for a heading that is a reserved one, and not an empty, long or question heading too', () => {
    expect(codesAfter(asHeading("What we couldn't verify"))).toEqual(['G2_HEADING_RESERVED']);
  });

  it('shows what the renderer would write if the gate let it through: the heading twice, the first over sentences that a model wrote', () => {
    const input = mutate(cloneGolden(), asHeading("What we couldn't verify"));
    const { mdx } = renderDraft(input.draft, input.claims, { runId: 'fixture-run-1', gate: runGate(cloneGolden(), defaultContext()) });
    expect(mdx.split(`\n## ${LIMITATIONS_HEADING}\n`)).toHaveLength(3);
    expect(mdx.split(`\n## ${TAKEAWAYS_HEADING}\n`)).toHaveLength(2);
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
