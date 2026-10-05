import { describe, expect, it } from 'vitest';
import { buildScoreboard, renderScoreboardJson, renderTable } from '../src/scoreboard';
import type { CaseResult, SeededResult } from '../src/run';
import type { SeededCase } from '../src/seeded';

// These tests use small made-up results, so they check the formatting alone.
// The committed scoreboard file is checked against the real gate in scoreboard-file.test.ts.

const noop: SeededCase['apply'] = (base) => base;
const CASES: SeededCase[] = [
  { id: 'empty-title', check: 'G1', code: 'G1_TITLE_EMPTY', description: 'The title is empty.', apply: noop },
  { id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', description: 'A figure is swapped.', apply: noop },
  { id: 'analysis-flood', check: 'G7', code: 'G7_ANALYSIS_SHARE', description: 'Too much analysis.', apply: noop },
];

const row = (id: string, caught: boolean, gotCodes: string[]): CaseResult => {
  const item = CASES.find((candidate) => candidate.id === id)!;
  return { id, check: item.check, code: item.code, caught, gotCodes };
};

const ALL_CAUGHT: SeededResult = {
  total: 3,
  caught: 3,
  rate: 1,
  baselinePasses: true,
  cases: [
    row('empty-title', true, ['G1_TITLE_EMPTY']),
    row('swapped-number', true, ['G4_NUMBER_UNSUPPORTED']),
    row('analysis-flood', true, ['G7_ANALYSIS_SHARE']),
  ],
};

const ONE_MISSED: SeededResult = {
  total: 3,
  caught: 2,
  rate: 2 / 3,
  baselinePasses: true,
  cases: [
    row('empty-title', true, ['G1_TITLE_EMPTY']),
    row('swapped-number', false, ['G4_DATE_UNSUPPORTED', 'G4_NAME_UNSUPPORTED']),
    row('analysis-flood', false, []),
  ],
};

describe('buildScoreboard', () => {
  it('lists the summary and then every case with its description, keys in a fixed order', () => {
    const board = buildScoreboard(ALL_CAUGHT, CASES);
    expect(Object.keys(board)).toEqual(['total', 'caught', 'rate', 'baselinePasses', 'cases']);
    expect(board).toEqual({
      total: 3,
      caught: 3,
      rate: 1,
      baselinePasses: true,
      cases: [
        { id: 'empty-title', check: 'G1', code: 'G1_TITLE_EMPTY', description: 'The title is empty.', caught: true },
        { id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', description: 'A figure is swapped.', caught: true },
        { id: 'analysis-flood', check: 'G7', code: 'G7_ANALYSIS_SHARE', description: 'Too much analysis.', caught: true },
      ],
    });
    expect(Object.keys(board.cases[0]!)).toEqual(['id', 'check', 'code', 'description', 'caught']);
  });

  it('records a missed case as caught: false, and leaves out the codes the gate gave, which are for debugging', () => {
    const board = buildScoreboard(ONE_MISSED, CASES);
    expect(board.cases.map((item) => item.caught)).toEqual([true, false, false]);
    expect(JSON.stringify(board)).not.toContain('G4_DATE_UNSUPPORTED');
    expect(board.rate).toBeCloseTo(2 / 3, 10);
  });

  it('throws for a result whose case is not in the list of cases, rather than writing a scoreboard with a hole', () => {
    expect(() => buildScoreboard(ALL_CAUGHT, CASES.slice(1))).toThrow('no seeded case with the id "empty-title"');
  });

  it('has no timestamp or machine detail, so the same gate always gives the same scoreboard', () => {
    expect(buildScoreboard(ALL_CAUGHT, CASES)).toEqual(buildScoreboard(ALL_CAUGHT, CASES));
    expect(JSON.stringify(buildScoreboard(ALL_CAUGHT, CASES))).not.toMatch(/20\d\d-\d\d-\d\d|\/Users\/|\/home\//);
  });
});

describe('renderScoreboardJson', () => {
  it('writes two-space-indented JSON that ends with a newline and reads back as the scoreboard', () => {
    const board = buildScoreboard(ALL_CAUGHT, CASES);
    const text = renderScoreboardJson(board);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text.startsWith('{\n  "total": 3,\n  "caught": 3,\n  "rate": 1,\n  "baselinePasses": true,\n  "cases": [\n    {\n      "id": "empty-title",')).toBe(true);
    expect(JSON.parse(text)).toEqual(board);
  });
});

describe('renderTable', () => {
  it('shows the count, the percentage, the baseline and one line per case', () => {
    const lines = renderTable(ALL_CAUGHT).split('\n');
    expect(lines[0]).toBe('Seeded-defect evals');
    expect(lines).toContain('  3 of 3 cases caught (100.0%)');
    expect(lines).toContain('  baseline (the unbroken golden piece): publishes');
    const rows = lines.filter((line) => /^ {2}(caught|MISSED) /.test(line));
    expect(rows).toEqual([
      '  caught  G1     G1_TITLE_EMPTY         empty-title',
      '  caught  G4     G4_NUMBER_UNSUPPORTED  swapped-number',
      '  caught  G7     G7_ANALYSIS_SHARE      analysis-flood',
    ]);
  });

  it('marks a missed case, says what the gate reported instead, and shows the lower percentage', () => {
    const lines = renderTable(ONE_MISSED).split('\n');
    expect(lines).toContain('  2 of 3 cases caught (66.7%)');
    expect(lines).toContain('  MISSED  G4     G4_NUMBER_UNSUPPORTED  swapped-number  (the gate reported: G4_DATE_UNSUPPORTED, G4_NAME_UNSUPPORTED)');
    expect(lines).toContain('  MISSED  G7     G7_ANALYSIS_SHARE      analysis-flood  (the gate reported: nothing)');
  });

  it('says so when the baseline does not publish', () => {
    expect(renderTable({ ...ALL_CAUGHT, baselinePasses: false })).toContain('  baseline (the unbroken golden piece): does NOT publish');
  });

  it('does not print a percentage of 0 divided by 0', () => {
    const lines = renderTable({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] }).split('\n');
    expect(lines).toContain('  0 of 0 cases caught (0.0%)');
  });
});
