import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';
import { checkG3 } from './g3-coverage';
import { checkG4 } from './g4-values';
import { checkG5 } from './g5-quotes';

export { checkG1, checkG2, checkG3, checkG4, checkG5 };

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2, checkG3, checkG4, checkG5];
