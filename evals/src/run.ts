import { ALL_CHECKS, runGateWith } from '@robywire/gate';
import type { Check, CheckId } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { SEEDED_CASES, seededContext } from './seeded';
import type { SeededCase } from './seeded';

export interface CaseResult {
  id: string;
  check: CheckId;
  code: string;
  /** True when the gate reported a finding from `check` with `code`, as a blocker or as a note. */
  caught: boolean;
  /** Every distinct code the gate reported for the broken piece, in order, blockers and notes alike. */
  gotCodes: string[];
}

export interface SeededResult {
  total: number;
  caught: number;
  /** caught / total. 0, never 1, when there are no cases. */
  rate: number;
  /** True when the unbroken golden piece gets route 'publish'. */
  baselinePasses: boolean;
  cases: CaseResult[];
}

/**
 * Break the golden piece once for each case and ask the gate. Every case gets
 * its own deep copy, so one case cannot leak into the next. `checks` and
 * `cases` default to the real ones; passing others is how the tests show that
 * a gate with a check missing is caught out.
 */
export function runSeeded(checks: readonly Check[] = ALL_CHECKS, cases: readonly SeededCase[] = SEEDED_CASES): SeededResult {
  const baselinePasses = runGateWith(checks, cloneGolden(), seededContext()).route === 'publish';

  const results = cases.map((item): CaseResult => {
    const result = runGateWith(checks, item.apply(cloneGolden()), seededContext());
    const reported = [...result.failures, ...result.warnings];
    return {
      id: item.id,
      check: item.check,
      code: item.code,
      caught: reported.some((finding) => finding.check === item.check && finding.code === item.code),
      gotCodes: [...new Set(reported.map((finding) => finding.code))],
    };
  });

  const caught = results.filter((item) => item.caught).length;
  return { total: results.length, caught, rate: results.length === 0 ? 0 : caught / results.length, baselinePasses, cases: results };
}
