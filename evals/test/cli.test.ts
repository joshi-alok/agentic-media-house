import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exitCodeFor, main } from '../src/cli';
import type { SeededResult } from '../src/run';
import { runSeeded } from '../src/run';
import { buildScoreboard, renderScoreboardJson, renderTable } from '../src/scoreboard';

const RESULT: SeededResult = { total: 4, caught: 4, rate: 1, baselinePasses: true, cases: [] };

describe('exitCodeFor', () => {
  it('is 0 only when every case is caught and the baseline publishes', () => {
    expect(exitCodeFor(RESULT)).toBe(0);
  });

  it('is 1 when one case is missed', () => {
    expect(exitCodeFor({ ...RESULT, caught: 3, rate: 0.75 })).toBe(1);
  });

  it('is 1 when the baseline does not publish, even though every case is caught', () => {
    expect(exitCodeFor({ ...RESULT, baselinePasses: false })).toBe(1);
  });

  it('is 1 when there are no cases at all', () => {
    expect(exitCodeFor({ total: 0, caught: 0, rate: 0, baselinePasses: true, cases: [] })).toBe(1);
  });
});

describe('main', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'robywire-seeded-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the scoreboard, prints the table and the verdict, and returns 0 for the real gate', () => {
    const file = pathToFileURL(join(dir, 'nested', 'seeded.json'));
    const printed: string[] = [];
    const code = main(file, (text) => printed.push(text));

    const result = runSeeded();
    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(renderScoreboardJson(buildScoreboard(result)));
    expect(printed.join('\n')).toContain(renderTable(result));
    expect(printed.join('\n')).toContain('PASS: every seeded defect was caught');
  });

  it('returns 1, says FAIL and still writes the scoreboard, with the miss in it, when a case gets through', () => {
    const missed: SeededResult = {
      total: 1,
      caught: 0,
      rate: 0,
      baselinePasses: true,
      cases: [{ id: 'swapped-number', check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', caught: false, gotCodes: [] }],
    };
    const file = pathToFileURL(join(dir, 'seeded.json'));
    const printed: string[] = [];
    const code = main(file, (text) => printed.push(text), () => missed);

    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('MISSED  G4     G4_NUMBER_UNSUPPORTED  swapped-number');
    expect(printed.join('\n')).toContain('FAIL: the gate missed a seeded defect');
    expect(JSON.parse(readFileSync(file, 'utf8')).cases[0].caught).toBe(false);
  });
});
