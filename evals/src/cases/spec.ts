import type { SeededCase } from '../seeded';
import { claimOf, reportedBy, sentenceWith } from './support';

/**
 * The four defects the design spec names, under the names the spec gives
 * them. The ids are public: the /method page lists them, so do not rename one.
 */
export const SPEC_CASES: SeededCase[] = [
  {
    id: 'swapped-number',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence states a number whose digits are swapped from the number of the claim it cites.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
      return base;
    },
  },
  {
    id: 'invented-quote',
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: 'A sentence puts words in quotation marks that the cited source never said.',
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
        '"We have never seen an arm this reliable," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      return base;
    },
  },
  {
    id: 'tier2-only-claim',
    check: 'G6',
    code: 'G6_TIER2_UNATTRIBUTED',
    description: 'A claim that comes only from another outlet is stated as plain fact, with no attribution.',
    apply: (base) => {
      reportedBy(base, 'c-18', 'Mercer Wire');
      return base;
    },
  },
  {
    id: 'unsupported-sentence',
    check: 'G3',
    code: 'G3_NO_CLAIM',
    description: 'A fact sentence is added that cites no claim at all.',
    apply: (base) => {
      base.draft.sections[0]!.paragraphs[0]!.push({
        kind: 'fact',
        text: 'The arm is also certified for use in cold storage.',
        claimIds: [],
      });
      return base;
    },
  },
];
