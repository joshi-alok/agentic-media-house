import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6];

/**
 * Every failure code any check can report. The seeded-defect evals prove that
 * the gate catches each one, so a check that gains a code adds it to its own
 * list and to this one.
 */
export const ALL_FAILURE_CODES: readonly string[] = [
  ...G1_CODES,
  ...G2_CODES,
  ...G3_CODES,
  ...G4_CODES,
  ...G5_CODES,
  ...G6_CODES,
];
