import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import {
  ALL_FAILURE_CODES,
  BASES,
  CHECK_IDS,
  G1_CODES,
  G2_CODES,
  G3_CODES,
  G4_CODES,
  G5_CODES,
  G6_CODES,
  G7_CODES,
  G8_CODES,
  G9_CODES,
  LIMITATIONS_HEADING,
  LIMITATION_MAX_CLAIMS,
  LedgerEntry,
  NOTE_CODES,
  SAFE_BASES,
  TAKEAWAYS_HEADING,
  defaultConfig,
  defaultContext,
  extractTokens,
  renderBody,
  runGate,
  severityOf,
} from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
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
    const notes = (id: string) => gateRules(config).find((rule) => rule.id === id)?.notes ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(notes('G2')).toContain('100 to 200 words');
    expect(notes('G2')).toContain('at most 40 characters');
    expect(notes('G7')).toContain('at most 35 percent');
    expect(text('G9')).toContain('in the last 7 days');
    expect(text('G9')).toContain('by 50 percent or more');
  });

  it('says in each rule what blocks, and in `notes` what is only recorded, which is empty when the check has no note', () => {
    for (const rule of rules) expect(typeof rule.notes).toBe('string');
    const noted = rules.filter((rule) => rule.notes !== '').map((rule) => rule.id);
    expect(noted).toEqual(['G2', 'G4', 'G7', 'G9']);
    for (const rule of rules.filter((item) => item.notes !== '')) {
      expect(rule.notes).toMatch(/^[A-Z]/);
      expect(rule.notes.endsWith('.')).toBe(true);
      expect(rule.notes).toContain('noted');
    }
  });

  it('puts the ranges of the gate in the notes of G2, the share of analysis in the notes of G7, and the other numbers in the rules', () => {
    const text = (id: string) => rules.find((rule) => rule.id === id)?.text ?? '';
    const notes = (id: string) => rules.find((rule) => rule.id === id)?.notes ?? '';
    expect(notes('G2')).toContain('40 to 60 words');
    expect(notes('G2')).toContain('3 to 5 key takeaways');
    expect(notes('G2')).toContain('600 to 850 words');
    expect(notes('G2')).toContain('at most 80 characters');
    expect(notes('G7')).toContain('at most 20 percent');
    expect(text('G1')).toContain('at most 155 characters');
    expect(text('G9')).toContain('in the last 14 days');
  });

  it('does not give a range of length as a rule that blocks: the text of G2 has no word count, and the notes say that a piece outside is published all the same', () => {
    const g2 = rules.find((rule) => rule.id === 'G2')!;
    expect(g2.text).not.toMatch(/\d+ to \d+ words/);
    expect(g2.notes).toContain('These are targets for the kind of piece. A piece outside them is noted and published all the same');
    expect(g2.notes).not.toContain('default kind');
    // Two sentences, not one with a comma between: the first ends at the heading, the second begins with the targets.
    expect(g2.notes).toContain('and not a question. These are targets');
  });

  // A rule has notes if and only if the gate lists a code of its check as a note, and the notes name exactly those: the page cannot say that
  // a check only notes what it blocks, or the other way round, without this test failing.
  describe('what the notes say is what the gate records as notes', () => {
    const CODES = { G1: G1_CODES, G2: G2_CODES, G3: G3_CODES, G4: G4_CODES, G5: G5_CODES, G6: G6_CODES, G7: G7_CODES, G8: G8_CODES, G9: G9_CODES } as const;

    it('lists a code of a check as a note only in a rule that has notes, and has notes only in a rule whose check has such a code', () => {
      for (const rule of rules) {
        const noteCodes = CODES[rule.id].filter((code) => severityOf(code) === 'note');
        expect(rule.notes !== '', rule.id).toBe(noteCodes.length > 0);
      }
    });

    it('records as notes the ten codes that the notes of G2, G4, G7 and G9 describe, and no other', () => {
      const byCheck = Object.fromEntries(
        (['G2', 'G4', 'G7', 'G9'] as const).map((id) => [id, CODES[id].filter((code) => severityOf(code) === 'note')]),
      );
      expect(byCheck).toEqual({
        G2: ['G2_OPENING_LENGTH', 'G2_TAKEAWAYS_COUNT', 'G2_BODY_LENGTH', 'G2_HEADING_QUESTION', 'G2_HEADING_TOO_LONG'],
        G4: ['G4_NAME_UNSUPPORTED', 'G4_HEADING_NAME', 'G4_NUMBER_WORD_UNCHECKABLE'],
        G7: ['G7_ANALYSIS_SHARE'],
        G9: ['G9_BANNED_PHRASE'],
      });
      expect(NOTE_CODES).toHaveLength(10);
    });

    it('says in G2 what it notes: the length of the opening, the number of takeaways, the length of the body, and a heading that is long or a question', () => {
      const notes = rules.find((rule) => rule.id === 'G2')?.notes ?? '';
      expect(notes).toContain('The opening paragraph is');
      expect(notes).toContain('key takeaways');
      expect(notes).toContain('the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings)');
      expect(notes).toContain('a heading is at most 80 characters and not a question');
    });

    it('says in G2 what blocks: the sections, the headings that are present and not reserved, and the limitations that cover a claim', () => {
      const g2 = rules.find((rule) => rule.id === 'G2')?.text ?? '';
      expect(g2).toContain('There are at least 2 sections, every section has a heading');
      expect(g2).toContain('no heading is one of the two headings that the Desk writes itself');
      expect(CODES.G2.filter((code) => severityOf(code) === 'blocker')).toEqual([
        'G2_SECTIONS_MIN',
        'G2_HEADING_EMPTY',
        'G2_HEADING_RESERVED',
        'G2_LIMITATIONS_MISSING',
        'G2_LIMITATION_COVERAGE',
      ]);
    });

    it('is true of G2: a piece outside the ranges of length is published with notes, and a piece with one section is sent back', () => {
      const few = cloneGolden();
      few.draft.takeaways = few.draft.takeaways.slice(0, 1);
      const result = runGate(few, defaultContext());
      expect(result.failures.map((failure) => failure.code)).toEqual([]);
      expect(result.warnings.map((note) => note.code)).toContain('G2_TAKEAWAYS_COUNT');
      expect(result.route).toBe('publish');
      expect(result.checks.G2).toBe('pass');

      const one = cloneGolden();
      one.draft.sections = one.draft.sections.slice(0, 1);
      expect(runGate(one, defaultContext()).failures.map((failure) => failure.code)).toContain('G2_SECTIONS_MIN');
    });
  });

  // What the rules say the code does is true of the code: the claims that G4 makes about words are shown with the real reader.
  describe('what G4 says about words', () => {
    const g4 = rules.find((rule) => rule.id === 'G4')?.text ?? '';
    const g4notes = rules.find((rule) => rule.id === 'G4')?.notes ?? '';

    it('reads numbers written in words like digits', () => {
      expect(g4).toContain('numbers written in words are read like digits ("twelve kilograms" is 12 kg)');
      expect(extractTokens('It weighs twelve kilograms.').numbers).toEqual([{ raw: 'twelve kilograms', value: '12', unit: 'kg' }]);
    });

    it.each(['half', 'twice', 'doubled', 'tenfold'])('notes "%s", a word that states an amount with no figure to check, and does not refuse it', (word) => {
      expect(g4notes).toContain(`"${word}"`);
      expect(g4).not.toContain(`"${word}"`);
      expect(extractTokens(`It grew ${word} last quarter.`).uncheckable).toEqual([word]);
    });

    it('does not claim to be total: it says what the reader finds and points at the list of its limits, which the page has under the same heading', () => {
      expect(g4).not.toMatch(/^Every number, date and name/);
      expect(g4).toMatch(/^The reader of the gate finds the numbers and dates in each factual sentence/);
      expect(g4).toContain(`(what it cannot find is listed under "${LIMITS_HEADING}")`);
      expect(g4).toContain('each one it finds must appear among the values of a claim that sentence cites');
    });

    // A word that mixes letters and digits is a date or a figure that the reader only takes for a name because it has letters: it blocks.
    it.each(['FY2027', '10x'])('says that a word that mixes letters and digits (such as %s) must appear in the passage, the names or the outlet of a cited claim, which is true of the gate: it blocks', (word) => {
      expect(g4).toContain('a word that mixes letters and digits (such as FY2027 or 10x) must appear in the quoted passage, the names or the outlet of a claim that sentence cites');
      expect(g4).toContain('in a heading, of a claim cited in its section');
      expect(g4notes).not.toContain('letters and digits');
      expect(extractTokens(`Shipments begin in ${word}.`).names).toEqual([word.toLowerCase()]);
      const sentence = cloneGolden();
      sentence.draft.takeaways[0]!.text = `Shipments begin in ${word}.`;
      const result = runGate(sentence, defaultContext());
      expect(result.failures.map((failure) => failure.code)).toContain('G4_FIGURE_UNSUPPORTED');
      expect(result.warnings.map((note) => note.code)).not.toContain('G4_FIGURE_UNSUPPORTED');
      expect(severityOf('G4_FIGURE_UNSUPPORTED')).toBe('blocker');
      // The same word in the quoted passage of a claim that the sentence cites passes.
      const cited = sentence.claims.find((claim) => claim.id === sentence.draft.takeaways[0]!.claimIds[0])!;
      cited.span.quote = `${cited.span.quote} Shipments begin in ${word}.`;
      expect(runGate(sentence, defaultContext()).failures.map((failure) => failure.code)).not.toContain('G4_FIGURE_UNSUPPORTED');
      // And in a heading.
      const heading = cloneGolden();
      heading.draft.sections[0]!.heading = `Output at ${word}`;
      expect(runGate(heading, defaultContext()).failures.map((failure) => failure.code)).toContain('G4_FIGURE_UNSUPPORTED');
    });

    it('does not make the capitalised names a rule that blocks: they are in the notes, and a name that no claim lists is only noted', () => {
      expect(g4).not.toContain('capitalised');
      expect(g4notes).toContain('capitalised names in each factual sentence (except its first word) and in each heading');
      expect(g4notes).toContain('a name that no cited claim lists');
    });

    it('names the rule for headings', () => {
      expect(g4).toContain('a section heading has no number, date or quotation');
    });

    it('says that a word that states an amount blocks in a heading, which is true of the gate: a heading with "doubled" is sent back and a sentence with it is noted', () => {
      expect(g4).toContain('no word that states an amount');
      const heading = cloneGolden();
      heading.draft.sections[0]!.heading = 'Output doubled';
      expect(runGate(heading, defaultContext()).failures.map((failure) => failure.code)).toContain('G4_HEADING_NUMBER');
      const sentence = cloneGolden();
      sentence.draft.takeaways[0]!.text = 'Output doubled.';
      const result = runGate(sentence, defaultContext());
      expect(result.failures.map((failure) => failure.code)).not.toContain('G4_NUMBER_WORD_UNCHECKABLE');
      expect(result.warnings.map((note) => note.code)).toContain('G4_NUMBER_WORD_UNCHECKABLE');
    });
  });

  it('says in G6 that the article labels in its body a sentence that rests on another outlet "Unconfirmed.", and that a title or a description that rests on one carries no label', () => {
    const g6 = rules.find((rule) => rule.id === 'G6')?.text ?? '';
    expect(g6).toContain('the article labels such a sentence "Unconfirmed." in its body');
    expect(g6).toContain('a title or a description that rests on one names the outlet and carries no label');
  });

  // The label is written by renderBody, which prints the opening, the takeaways, the body and the limitations: a title or a description that is
  // attributed is not printed in it, so it has no label.
  it('is true of the label: renderBody puts it on the sentences of the body and on nothing of the title or the description', () => {
    const ledger = LedgerEntry.parse(JSON.parse(readFileSync(new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json', import.meta.url), 'utf8')));
    const labelled = (entry: typeof ledger) => (renderBody(entry).match(/\*\*Unconfirmed\.\*\* /g) ?? []).length;
    const inBody = ledger.sentences.filter((item) => item.kind === 'fact' && item.attributed === true && ['opening', 'takeaways', 'body', 'limitations'].includes(item.section)).length;
    expect(inBody).toBeGreaterThan(0);
    expect(labelled(ledger)).toBe(inBody);
    for (const item of ledger.sentences.filter((sentence) => sentence.section === 'title' || sentence.section === 'description')) item.attributed = true;
    expect(labelled(ledger)).toBe(inBody);
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

  it('says in G2 that no section has one of the two headings that the Desk writes itself, and the gate agrees', () => {
    const g2 = rules.find((rule) => rule.id === 'G2')?.text ?? '';
    expect(g2).toContain('no heading is one of the two headings that the Desk writes itself ("Key takeaways" and "What we couldn\'t verify")');
    expect(g2).toContain(`"${TAKEAWAYS_HEADING}" and "${LIMITATIONS_HEADING}"`);
  });

  it('says in G2 and G8 what a limitation sentence is and what covers a claim', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('is covered by a sentence under "What we couldn\'t verify"');
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('a group of claims that share one basis or one status');
  });

  it('says in G7 that analysis may not use a number in words and must open with an ordinary word', () => {
    const g7 = rules.find((rule) => rule.id === 'G7')?.text ?? '';
    expect(g7).toContain('a number (written in digits or words)');
    expect(g7).toContain('a word that states an amount with no figure');
    expect(g7).toContain('must open with an ordinary function word or a word of the quoted passage, the names or the outlet of a claim it cites');
  });

  it('says in G7 that analysis stays out of the title and the description only, and the gate agrees: it may stand in the opening and the takeaways', () => {
    const g7 = rules.find((rule) => rule.id === 'G7')?.text ?? '';
    expect(g7).toContain('stays out of the title and the description,');
    expect(g7).not.toMatch(/opening and takeaways/);
    const analysis = { kind: 'analysis' as const, text: 'The shipments matter.', claimIds: ['c-1'] };
    const failuresWith = (place: 'title' | 'description' | 'opening' | 'takeaways') => {
      const input = cloneGolden();
      if (place === 'title' || place === 'description') input.draft[place] = analysis;
      else input.draft[place][0] = analysis;
      return runGate(input, defaultContext()).failures.map((failure) => failure.code);
    };
    expect(failuresWith('title')).toContain('G7_ANALYSIS_PLACEMENT');
    expect(failuresWith('description')).toContain('G7_ANALYSIS_PLACEMENT');
    expect(failuresWith('opening')).not.toContain('G7_ANALYSIS_PLACEMENT');
    expect(failuresWith('takeaways')).not.toContain('G7_ANALYSIS_PLACEMENT');
  });

  it('says in G7 that analysis may not bring in a word that states an amount with no figure, and the gate sends it back, as it only notes the same word in a factual sentence', () => {
    const input = cloneGolden();
    input.draft.takeaways[0] = { kind: 'analysis', text: 'The output doubled.', claimIds: ['c-1'] };
    const result = runGate(input, defaultContext());
    expect(result.failures.map((failure) => failure.code)).toContain('G7_ANALYSIS_NEW_VALUE');
    expect(result.failures.map((failure) => failure.message).join(' ')).toContain('number word "doubled"');
  });

  it('says in G7 that analysis must start with a capital letter or a digit, and the gate sends back an analysis sentence that starts with a lowercase letter', () => {
    expect(rules.find((rule) => rule.id === 'G7')?.text).toContain('must start with a capital letter or a digit');
    const input = cloneGolden();
    input.draft.takeaways[0] = { kind: 'analysis', text: 'the shipments matter.', claimIds: ['c-1'] };
    const result = runGate(input, defaultContext());
    expect(result.failures.map((failure) => failure.code)).toContain('G7_ANALYSIS_NEW_NAME');
    expect(result.failures.map((failure) => failure.message).join(' ')).toContain('not with a capital letter or a digit');
  });

  it('says in G7 that the share of analysis is only noted: a piece with too much analysis is published with a note', () => {
    const notes = rules.find((rule) => rule.id === 'G7')?.notes ?? '';
    expect(notes).toContain("Analysis is at most 20 percent of the body's sentences");
    expect(rules.find((rule) => rule.id === 'G7')?.text).not.toContain('percent');
    expect(severityOf('G7_ANALYSIS_SHARE')).toBe('note');
    expect(severityOf('G7_ANALYSIS_NEW_VALUE')).toBe('blocker');
    expect(severityOf('G7_ANALYSIS_NEW_NAME')).toBe('blocker');
    expect(severityOf('G7_ANALYSIS_PLACEMENT')).toBe('blocker');
  });

  it('says in G1 that the author is the Desk', () => {
    expect(rules.find((rule) => rule.id === 'G1')?.text).toContain('the author is the Desk');
  });

  it('says that analysis is labelled', () => {
    expect(rules.find((rule) => rule.id === 'G7')?.text).toContain('is labelled');
  });

  it('does not say that another outlet holds a piece, because it does not', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).not.toContain('held');
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('the article labels such a sentence "Unconfirmed." in its body');
  });
});

describe('the method page', () => {
  const page = readFileSync(new URL('../src/pages/method/index.astro', import.meta.url), 'utf8');

  it('prints the notes of a rule under its text, so that dropping them from the template fails here', () => {
    expect(page).toContain('{rule.text}');
    expect(page).toContain("{rule.notes !== '' && <span class=\"rule-notes\"> Noted, not blocking: {rule.notes}</span>}");
    expect(page.indexOf('{rule.text}')).toBeLessThan(page.indexOf('{rule.notes'));
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

  it('says what the gate sends back and what it only notes, and that a story from another outlet is written as an attribution and is not held for that', () => {
    const text = (name: string) => PIPELINE_STAGES.find((stage) => stage.name === name)?.text ?? '';
    expect(text('Select')).toContain('but it will be written in attributed form, naming the outlet.');
    expect(text('Select')).not.toContain('held');
    expect(text('Verify')).toBe(
      'The gate will check the draft. A blocker, such as a number or a date that no claim has, sends the draft back for revision with the exact failures, at most twice; a note, such as a length outside the target, is recorded and does not stop the piece.',
    );
    expect(text('Publish or hold')).toBe(
      'A draft with no blocker, that the model check clears, will be built and published, with its notes on its receipts page. A draft that does not will be held for the owner as a draft pull request that carries the gate report.',
    );
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

  it('says that the gate has to report every break, as a blocker or as a note, and that is what the scoreboard counts', () => {
    expect(SCOREBOARD_INTRO).toMatch(/^A gate is worth what it reports\./);
    expect(SCOREBOARD_INTRO).toContain('and the gate has to report every break, as a blocker that sends the draft back or as a note that is recorded.');
    expect(SCOREBOARD_INTRO).not.toContain('worth what it catches');
    expect(SCOREBOARD_INTRO).not.toContain('catch every break');
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

// The README says what the method page says. A sentence of it that the code makes untrue must fail a test here, as the sentences of the page do.
describe('the README: blockers and notes, and another outlet', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

  it('says that a piece publishes when the gate finds no blocker and the model check agrees, and that rules of shape and style are notes', () => {
    expect(readme).toContain('only when a code-based gate finds no blocker');
    expect(readme).toContain('and an independent model check agrees that each factual sentence says what its sources say');
    expect(readme).toContain('Rules about length, shape, capitalised names and filler are notes: they are recorded on the receipts page of the piece and do not stop it.');
    expect(readme).toContain('Anything the gate or the model check cannot clear will be held for the owner.');
    expect(readme).not.toContain('verifies that every factual sentence traces to a quoted span in a primary (tier-1) source');
  });

  it('says that a claim from another outlet is an attribution that the article labels, and not that such a piece is never published by itself', () => {
    expect(readme).toContain('A claim from another outlet may appear only as an attribution that names the outlet, and the article labels it Unconfirmed in its body.');
    expect(readme).toContain('A headline or a description built on such a claim names the outlet and carries no label, and a piece may rest entirely on another outlet\'s reporting and be published without a human when the gate and the model check clear it.');
    expect(readme).not.toContain('never published by itself');
    expect(readme).not.toContain('They are never the sole source of a claim');
  });

  it('says that the fifth fixture was held by the model check, which is what its ledger records', () => {
    expect(readme).toContain('(`G10_AMBIGUOUS`: it could not tell if a sentence was supported)');
    expect(readme).not.toContain('so the gate holds it (`TIER2_ATTRIBUTION`)');
  });

  it('says what the gate checks of analysis and that its share is only noted, and no longer that a cap limits the exposure', () => {
    const start = readme.indexOf('- **Analysis sentences.**');
    const bullet = readme.slice(start, readme.indexOf('\n', start));
    expect(start).toBeGreaterThan(0);
    // The strings that desk/test/readme.test.ts pins stay.
    expect(bullet).toContain('**Analysis sentences.**');
    expect(bullet).toContain('the model check (G10) is never asked about them');
    expect(bullet).toContain('where they stand (not in the title or the description)');
    expect(bullet).toContain('the numbers, dates, words of amount and names they bring in that no factual sentence contains');
    expect(bullet).toContain('with a capital letter or a digit, and with a function word or a word of the quoted passage, the name values or the outlet of a claim they cite');
    expect(bullet).toContain('The share of the body that analysis takes (a fifth by default) is only noted on the receipts page, and the gate does not stop a piece for it.');
    expect(bullet).toContain('The page labels every analysis sentence, and the receipts page notes a piece whose analysis goes over the target share; that shows the exposure and does not remove it.');
    expect(bullet).not.toContain('Up to a fifth of the sentences of a piece may be');
    expect(bullet).not.toContain('The share cap is what limits the exposure');
    expect(bullet).not.toContain('how many there are');
  });

  it('documents --profile of the tuning harness, and the words and the notes of each draft', () => {
    expect(readme).toContain('**The profile.** `--profile brief|digest|explainer` judges the drafts against the ranges of a kind of piece');
    expect(readme).toContain('and tells the writer the same ranges');
    expect(readme).toContain('the notes and the words of the draft');
  });
});

// The runbook is read by the owner before the first real run. It must not promise a hold that the gate no longer makes.
describe('the runbook: what holds a piece', () => {
  const runbook = readFileSync(new URL('../../docs/runbook.md', import.meta.url), 'utf8');

  it('does not say that a story with no primary source is held, because it is written in attributed form and published when it is cleared', () => {
    expect(runbook).not.toContain('rehearsal: no primary source, so every piece is held');
    expect(runbook).not.toContain('(so every story that the Desk writes is written in attributed form and **held**, which is the rule of the design)');
    expect(runbook).toContain('rehearsal: no primary source');
    expect(runbook).toContain('is written in attributed form, and the gate and the model check publish it when they clear it; it is held only if one of them does not');
    expect(runbook).toContain('**If the run publishes instead**');
  });

  it('says that the share of analysis is only noted, and that the length of a piece is a note and not a hold', () => {
    expect(runbook).not.toContain('how many, how they begin');
    expect(runbook).not.toContain('the share cap of G7 is the answer');
    expect(runbook).toContain('their share of the piece is only noted');
    expect(runbook).toContain('the label on every analysis sentence and the note of its share are the answer');
    expect(runbook).not.toContain('A draft that fails G2 (`G2_BODY_LENGTH`, `G2_OPENING_LENGTH`, `G2_TAKEAWAYS_COUNT`, `G2_SECTIONS_MIN`) is held');
    expect(runbook).toContain('those codes are notes, and the piece is published with the note on its receipts page');
    expect(runbook).toContain('(`G2_SECTIONS_MIN`) is a blocker that no rewritten sentence can mend');
  });
});
