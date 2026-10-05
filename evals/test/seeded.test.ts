import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS, checkG3, checkG4, runGateWith } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { sentenceWith } from '../src/cases/support';
import { runSeeded } from '../src/run';
import { SEEDED_CASES, SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_TITLE, seededContext } from '../src/seeded';
import type { SeededCase } from '../src/seeded';

// The seeded-defect evals: take the golden piece, break it in one known way,
// and check that the gate says so. Every case names the check and the failure
// code that must catch it. A defect that gets through is a hole in the gate.

/** The ids the design spec names. They are public: the /method page lists them. */
const SPEC_IDS = {
  'swapped-number': ['G4', 'G4_NUMBER_UNSUPPORTED'],
  'invented-quote': ['G5', 'G5_QUOTE_NOT_VERBATIM'],
  'tier2-only-claim': ['G6', 'G6_TIER2_UNATTRIBUTED'],
  'unsupported-sentence': ['G3', 'G3_NO_CLAIM'],
} as const;

describe('the baseline', () => {
  it('is the golden piece, which publishes under the context the cases run in', () => {
    const result = runGateWith(ALL_CHECKS, cloneGolden(), seededContext());
    expect(result.failures).toEqual([]);
    expect(result.route).toBe('publish');
  });

  it('runs under a context with a published slug and a recent title, so the hygiene cases have something to collide with', () => {
    const ctx = seededContext();
    expect([...ctx.publishedSlugs]).toEqual([SEEDED_PUBLISHED_SLUG]);
    expect(ctx.recentTitles).toEqual([SEEDED_RECENT_TITLE]);
    expect(cloneGolden().draft.slug).not.toBe(SEEDED_PUBLISHED_SLUG);
    expect(cloneGolden().draft.title.text).not.toBe(SEEDED_RECENT_TITLE);
  });

  it('gives each caller a fresh context', () => {
    expect(seededContext()).not.toBe(seededContext());
    expect(seededContext().publishedSlugs).not.toBe(seededContext().publishedSlugs);
  });
});

describe('the cases', () => {
  it('have unique, kebab-case ids and a description', () => {
    const ids = SEEDED_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SEEDED_CASES) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(item.description.length, item.id).toBeGreaterThan(15);
    }
  });

  it('describe the defect without the name of the fictional company: the production /method page shows the descriptions, and no production page may carry fixture content', () => {
    for (const item of SEEDED_CASES) expect(item.description, item.id).not.toMatch(/fixture (data|robotics)|fixture-robotics/i);
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s names a check and a failure code that exist', (_id, item) => {
    expect(CHECK_IDS).toContain(item.check);
    expect(ALL_FAILURE_CODES).toContain(item.code);
    expect(item.code.startsWith(`${item.check}_`)).toBe(true);
  });

  it.each(SEEDED_CASES.map((item) => [item.id, item] as const))('%s changes the input it is given', (_id, item) => {
    const changed = item.apply(cloneGolden());
    expect(changed).not.toEqual(cloneGolden());
  });

  it('include the four defects the design spec names, under their names', () => {
    for (const [id, [check, code]] of Object.entries(SPEC_IDS)) {
      const found = SEEDED_CASES.find((item) => item.id === id);
      expect(found, id).toBeDefined();
      expect([found?.check, found?.code], id).toEqual([check, code]);
    }
  });
});

describe('runSeeded', () => {
  it('catches every case and reports the baseline as publishing', () => {
    const result = runSeeded();
    const missed = result.cases.filter((item) => !item.caught).map((item) => `${item.id} (${item.code}; got ${item.gotCodes.join(', ') || 'nothing'})`);
    expect(missed).toEqual([]);
    expect(result.baselinePasses).toBe(true);
    expect(result.total).toBe(SEEDED_CASES.length);
    expect(result.caught).toBe(result.total);
    expect(result.rate).toBe(1);
  });

  it('reports each case in order, with the codes the gate gave', () => {
    const result = runSeeded();
    expect(result.cases.map((item) => item.id)).toEqual(SEEDED_CASES.map((item) => item.id));
    const swapped = result.cases.find((item) => item.id === 'swapped-number')!;
    expect(swapped).toEqual({
      id: 'swapped-number',
      check: 'G4',
      code: 'G4_NUMBER_UNSUPPORTED',
      caught: true,
      gotCodes: ['G4_NUMBER_UNSUPPORTED'],
    });
  });

  it('gives the same answer every time, so a case cannot leak into the next one', () => {
    expect(runSeeded()).toEqual(runSeeded());
  });

  it('counts a case as caught only when the right check reports the right code', () => {
    // Without G4 the swapped number slips through: no G4 failure at all.
    const result = runSeeded(ALL_CHECKS.filter((check) => check !== checkG4));
    const swapped = result.cases.find((item) => item.id === 'swapped-number')!;
    expect(swapped.caught).toBe(false);
    expect(swapped.gotCodes).not.toContain('G4_NUMBER_UNSUPPORTED');
  });

  it('can fail: with one check switched off, its cases are missed and the rate drops below 1', () => {
    const result = runSeeded(ALL_CHECKS.filter((check) => check !== checkG3));
    expect(result.baselinePasses).toBe(true);
    expect(result.rate).toBeLessThan(1);
    const missed = result.cases.filter((item) => !item.caught);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((item) => item.check === 'G3')).toBe(true);
    expect(result.caught + missed.length).toBe(result.total);
  });

  it('catches nothing when no check runs', () => {
    const result = runSeeded([]);
    expect(result.caught).toBe(0);
    expect(result.rate).toBe(0);
    expect(result.baselinePasses).toBe(true);
  });

  it('never reports a rate of 1 for a run of no cases, which would otherwise be 0 divided by 0', () => {
    const result = runSeeded(ALL_CHECKS, []);
    expect(result).toEqual({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] });
  });

  it('reports a baseline that does not publish', () => {
    const failing = () => ({ failures: [{ check: 'G1' as const, code: 'G1_TITLE_EMPTY', message: 'always' }], holdReasons: [] });
    expect(runSeeded([failing]).baselinePasses).toBe(false);
  });
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
  const twoWrongNumbers: Omit<SeededCase, 'check' | 'code'> = {
    id: 'two-wrong-numbers',
    description: 'Two figures in one sentence do not match their claims.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 651 W in typical use.';
      return base;
    },
  };

  it('lists each code the gate gave once, however often it gave it', () => {
    const [result] = runSeeded(ALL_CHECKS, [{ ...twoWrongNumbers, check: 'G4', code: 'G4_NUMBER_UNSUPPORTED' }]).cases;
    expect(result).toEqual({
      id: 'two-wrong-numbers',
      check: 'G4',
      code: 'G4_NUMBER_UNSUPPORTED',
      caught: true,
      gotCodes: ['G4_NUMBER_UNSUPPORTED'],
    });
  });

  it('does not count a case as caught when the check fails with some other code', () => {
    const [result] = runSeeded(ALL_CHECKS, [{ ...twoWrongNumbers, check: 'G4', code: 'G4_DATE_UNSUPPORTED' }]).cases;
    expect(result?.caught).toBe(false);
    expect(result?.gotCodes).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });
});
