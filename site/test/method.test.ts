import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, BASES, CHECK_IDS, LIMITATIONS_HEADING, LIMITATION_MAX_CLAIMS, SAFE_BASES, TAKEAWAYS_HEADING, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
// about itself. These tests keep its numbers in step with the gate, keep each
// rule honest about what the code really does, and keep the parts of the
// pipeline that are not built yet in the future tense. The known limits of the
// rules are tested in known-limits.test.ts.

describe('gateRules', () => {
  const rules = gateRules();

  it('has one rule for each check of the gate, in order, so a new check fails this test until it is described', () => {
    expect(rules.map((rule) => rule.id)).toEqual([...CHECK_IDS]);
  });

  it('gives each rule its own name', () => {
    expect(rules.map((rule) => rule.name)).toEqual(['Frontmatter', 'Structure', 'Coverage', 'Values', 'Quotes', 'Sourcing', 'Analysis', 'Limitations', 'Hygiene']);
  });

  it.each(rules.map((rule) => [rule.id, rule.text] as const))('%s is written as one sentence: a capital, one full stop at the end and none inside', (_id, text) => {
    expect(text).toMatch(/^[A-Z]/);
    expect(text.endsWith('.')).toBe(true);
    expect(text.slice(0, -1)).not.toMatch(/[.!?](\s|$)/);
  });

  it('takes its numbers from the gate configuration', () => {
    const text = (id: string) => rules.find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 155 characters');
    expect(text('G1')).toContain('1 to 3 categories');
    expect(text('G2')).toContain('40 to 60 words');
    expect(text('G2')).toContain('3 to 5 key takeaways');
    expect(text('G2')).toContain('600 to 850 words');
    expect(text('G2')).toContain('at most 80 characters');
    expect(text('G7')).toContain('at most 20 percent');
    expect(text('G9')).toContain('in the last 14 days');
    expect(text('G9')).toContain('by 60 percent or more');
  });

  it('follows the configuration it is given', () => {
    const config = {
      ...defaultConfig(),
      descriptionMax: 99,
      headingMax: 40,
      analysisShareCap: 0.35,
      bodyWords: { min: 100, max: 200 },
      titleWindowDays: 7,
      titleSimilarityThreshold: 0.5,
    };
    const text = (id: string) => gateRules(config).find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(text('G2')).toContain('100 to 200 words');
    expect(text('G2')).toContain('at most 40 characters');
    expect(text('G7')).toContain('at most 35 percent');
    expect(text('G9')).toContain('in the last 7 days');
    expect(text('G9')).toContain('by 50 percent or more');
  });

  // What the rules say the code does is true of the code: the claims that G4 makes about words are shown with the real reader.
  describe('what G4 says about words', () => {
    const g4 = rules.find((rule) => rule.id === 'G4')?.text ?? '';

    it('reads numbers written in words like digits', () => {
      expect(g4).toContain('numbers written in words are read like digits ("twelve kilograms" is 12 kg)');
      expect(extractTokens('It weighs twelve kilograms.').numbers).toEqual([{ raw: 'twelve kilograms', value: '12', unit: 'kg' }]);
    });

    it.each(['half', 'twice', 'doubled', 'tenfold'])('refuses "%s", a word that states an amount with no figure to check', (word) => {
      expect(g4).toContain(`"${word}"`);
      expect(extractTokens(`It grew ${word} last quarter.`).uncheckable).toEqual([word]);
    });

    it('does not claim to be total: it says what the reader finds and points at the list of its limits, which the page has under the same heading', () => {
      expect(g4).not.toMatch(/^Every number, date and name/);
      expect(g4).toMatch(/^The reader of the gate finds the numbers, dates and capitalised names in each factual sentence/);
      expect(g4).toContain(`(what it cannot find is listed under "${LIMITS_HEADING}")`);
      expect(g4).toContain('each one it finds must appear among the values of a claim that sentence cites');
    });

    it('names the rules for the first word of a sentence and for headings, which Part A of this milestone added', () => {
      expect(g4).toContain('a sentence may open with a capitalised word only if it is an ordinary function word or a word of the quoted passage, the names or the outlet of a claim the sentence cites (the text and the label of a claim are written by a model and count for nothing)');
      expect(g4).toContain('a section heading has no number, date or quotation');
    });
  });

  it('says in G6 that the article labels a sentence that rests on another outlet "Unconfirmed."', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('the article labels such a sentence "Unconfirmed."');
  });

  it('says in G6 that a claim from another outlet has the basis "reported" and a primary one never does, and the gate agrees', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('has the basis "reported" (no claim from a primary source has it)');
    expect(BASES).toContain('reported');
    expect(SAFE_BASES).not.toContain('reported');
  });

  it('says in G2 and G8 that what another outlet reported is covered by a limitation sentence that names the outlet', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('briefing or demo, that only another outlet reported, or that was only demonstrated');
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('(and, for claims that another outlet reported, that outlet)');
  });

  it('says in G8 that a limitation sentence covers at most four claims, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('through a fixed template, covers at most four claims, cites each claim once');
    expect(LIMITATION_MAX_CLAIMS).toBe(4);
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
    expect(startsWithCapitalOrDigit('7 investors took part.')).toBe(true);
    expect(startsWithCapitalOrDigit('"The arm," said Jane.')).toBe(true);
    expect(startsWithCapitalOrDigit('harlow logistics plans a plant.')).toBe(false);
  });

  it('says in G2 that no section has one of the two headings that the Desk writes itself, and the gate agrees', () => {
    const g2 = rules.find((rule) => rule.id === 'G2')?.text ?? '';
    expect(g2).toContain('is not a question and is not one of the two headings that the Desk writes itself ("Key takeaways" and "What we couldn\'t verify")');
    expect(g2).toContain(`"${TAKEAWAYS_HEADING}" and "${LIMITATIONS_HEADING}"`);
  });

  it('says in G2 and G8 what a limitation sentence is and what covers a claim', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('is covered by a sentence under "What we couldn\'t verify"');
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('a group of claims that share one basis or one status');
  });

  it('says in G7 that analysis may not use a number in words and must open with an ordinary word', () => {
    const g7 = rules.find((rule) => rule.id === 'G7')?.text ?? '';
    expect(g7).toContain('a number (written in digits or words)');
    expect(g7).toContain('must open with an ordinary function word or a word of the quoted passage, the names or the outlet of a claim it cites');
  });

  it('says in G1 that the author is the Desk', () => {
    expect(rules.find((rule) => rule.id === 'G1')?.text).toContain('the author is the Desk');
  });

  it('says that a piece which uses another outlet is held, and that analysis is labelled', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('held for the owner');
    expect(rules.find((rule) => rule.id === 'G7')?.text).toContain('is labelled');
  });
});

describe('PIPELINE_STAGES', () => {
  it('lists the seven stages of the design, in order', () => {
    expect(PIPELINE_STAGES.map((stage) => stage.name)).toEqual(['Discover', 'Select', 'Fetch', 'Extract', 'Compose', 'Verify', 'Publish or hold']);
  });

  it('describes every stage in the future tense while the Desk does not publish, and in the present once it does', () => {
    // Turning LIVE.publishing on means rewriting these seven texts; this test fails until it is done.
    for (const stage of PIPELINE_STAGES) {
      if (LIVE.publishing) expect(stage.text, stage.name).not.toMatch(/\bwill\b/);
      else expect(stage.text, stage.name).toMatch(/\bwill\b/);
    }
  });

  it('writes each stage as plain sentences', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.text, stage.name).toMatch(/^[A-Z]/);
      expect(stage.text.endsWith('.'), stage.name).toBe(true);
    }
  });
});

describe('SCOREBOARD_INTRO', () => {
  it('says the golden piece is broken at least once for every failure code, because some codes have several cases', () => {
    expect(SCOREBOARD_INTRO).toContain('broken on purpose, at least once for every failure code of the nine checks');
    expect(SCOREBOARD_INTRO).not.toContain('on purpose, once for every');
  });

  it('is true: every failure code has at least one case, and some have more', () => {
    const counts = new Map<string, number>();
    for (const item of board.cases) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...ALL_FAILURE_CODES].sort());
    expect(Math.max(...counts.values())).toBeGreaterThan(1);
  });

  it('is what the README says too', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('breaks it in a known way at least once for every failure code of the nine checks');
    expect(readme).not.toContain('in a known way once for every failure code');
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
    expect(scoreboardHeadline({ total: 40, caught: 40 })).toBe('40 of 40 seeded defects caught');
  });

  it('says so when some were missed', () => {
    expect(scoreboardHeadline({ total: 40, caught: 38 })).toBe('38 of 40 seeded defects caught');
  });

  it('uses the singular for one defect', () => {
    expect(scoreboardHeadline({ total: 1, caught: 1 })).toBe('1 of 1 seeded defect caught');
  });
});
