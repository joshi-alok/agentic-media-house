import type { Check } from '../gate';
import { checkG1 } from './g1-frontmatter';
import { checkG2 } from './g2-structure';

/**
 * Every check that `runGate` runs, in order. Each check task adds its check
 * here. A check that is not in the list yet is simply not run, and `runGate`
 * reports it as 'pass'.
 */
export const ALL_CHECKS: Check[] = [checkG1, checkG2];
