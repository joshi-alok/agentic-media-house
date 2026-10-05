import type { Check } from '../gate';
import { G1_CODES, checkG1 } from './g1-frontmatter';
import { G2_CODES, checkG2 } from './g2-structure';
import { G3_CODES, checkG3 } from './g3-coverage';
import { G4_CODES, checkG4 } from './g4-values';
import { G5_CODES, checkG5 } from './g5-quotes';
import { G6_CODES, checkG6 } from './g6-sourcing';
import { G7_CODES, checkG7 } from './g7-analysis';
import { G8_CODES, checkG8 } from './g8-limitations';
import { G9_CODES, checkG9 } from './g9-hygiene';

export { checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9 };
export { G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES };
export { TITLE_STOP_WORDS, titleTokens } from './g9-hygiene';

/**
 * Every check that `runGate` runs, in order: G1 to G9. A check that is not in
 * this list is not run, and `runGate` reports it as 'pass', so a new check
 * must be added here.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5, checkG6, checkG7, checkG8, checkG9];

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
  ...G7_CODES,
  ...G8_CODES,
  ...G9_CODES,
];
