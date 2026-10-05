import type { CheckId } from '@robywire/gate';
import type { SeededResult } from './run';
import { SEEDED_CASES } from './seeded';
import type { SeededCase } from './seeded';

/**
 * The public result of the seeded-defect evals. It is committed as
 * `evals/scoreboard/seeded.json` and shown on the site's /method page. It has
 * no timestamp, no path and no machine detail, so the same gate always writes
 * the same file.
 */
export interface Scoreboard {
  total: number;
  caught: number;
  rate: number;
  baselinePasses: boolean;
  cases: { id: string; check: CheckId; code: string; description: string; caught: boolean }[];
}

/** The scoreboard for `result`, with each case's description taken from `cases`. Keys are created in a fixed order. */
export function buildScoreboard(result: SeededResult, cases: readonly SeededCase[] = SEEDED_CASES): Scoreboard {
  return {
    total: result.total,
    caught: result.caught,
    rate: result.rate,
    baselinePasses: result.baselinePasses,
    cases: result.cases.map((item) => {
      const seeded = cases.find((candidate) => candidate.id === item.id);
      if (seeded === undefined) throw new Error(`buildScoreboard: there is no seeded case with the id "${item.id}"`);
      return { id: item.id, check: item.check, code: item.code, description: seeded.description, caught: item.caught };
    }),
  };
}

/** The scoreboard as the text of the committed file: two-space JSON and one trailing newline. */
export function renderScoreboardJson(board: Scoreboard): string {
  return `${JSON.stringify(board, null, 2)}\n`;
}

/** A table for a person reading the terminal. Missed cases say what the gate reported instead. */
export function renderTable(result: SeededResult): string {
  const codeWidth = Math.max('code'.length, ...result.cases.map((item) => item.code.length));
  const line = (status: string, check: string, code: string, rest: string) =>
    `  ${status}  ${check.padEnd('check'.length)}  ${code.padEnd(codeWidth)}  ${rest}`;

  return [
    'Seeded-defect evals',
    `  ${result.caught} of ${result.total} cases caught (${(result.rate * 100).toFixed(1)}%)`,
    `  baseline (the unbroken golden piece): ${result.baselinePasses ? 'publishes' : 'does NOT publish'}`,
    '',
    line('result', 'check', 'code', 'case'),
    ...result.cases.map((item) =>
      line(
        item.caught ? 'caught' : 'MISSED',
        item.check,
        item.code,
        item.caught ? item.id : `${item.id}  (the gate reported: ${item.gotCodes.join(', ') || 'nothing'})`,
      ),
    ),
  ].join('\n');
}
