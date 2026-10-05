import { CHECK_IDS } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { CLAIMS_CASES } from './claims';
import { FRONTMATTER_STRUCTURE_CASES } from './frontmatter-structure';
import { LIMITATIONS_HYGIENE_CASES } from './limitations-hygiene';
import { SOURCING_ANALYSIS_CASES } from './sourcing-analysis';
import { SPEC_CASES } from './spec';

/**
 * Every seeded case, in the order of the checks (G1 to G9), which is the order
 * the scoreboard lists them. Within a check the order is the order they are
 * written in; the sort is stable.
 */
export const SEEDED_CASES: SeededCase[] = [
  ...SPEC_CASES,
  ...FRONTMATTER_STRUCTURE_CASES,
  ...CLAIMS_CASES,
  ...SOURCING_ANALYSIS_CASES,
  ...LIMITATIONS_HYGIENE_CASES,
].sort((a, b) => CHECK_IDS.indexOf(a.check) - CHECK_IDS.indexOf(b.check));
