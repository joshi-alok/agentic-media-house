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
