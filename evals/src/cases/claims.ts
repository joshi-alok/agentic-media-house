import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

/**
 * Defects in how sentences use claims: an unknown claim (G3, besides the spec's
 * unsupported sentence), figures, dates and names that do not match (G4,
 * besides the spec's swapped number), and an altered quotation (G5, besides
 * the spec's invented one).
 */
export const CLAIMS_CASES: SeededCase[] = [
  {
    id: 'unknown-claim',
    check: 'G3',
    code: 'G3_UNKNOWN_CLAIM',
    description: 'A sentence cites a claim, c-99, that is not in the piece.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').claimIds = ['c-99'];
      return base;
    },
  },
  {
    id: 'swapped-unit',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the payload as 12 lb; the claim it cites says 12 kg.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 lb rated payload and a 1.4 m maximum reach.';
      return base;
    },
  },
  {
    id: 'swapped-date',
    check: 'G4',
    code: 'G4_DATE_UNSUPPORTED',
    description: 'A sentence gives the first sale as 29 October 2026; the filing says 29 September 2026.',
    apply: (base) => {
      sentenceWith(base, 'The filing dates the first sale').text =
        'The filing dates the first sale of the $450 million round to 29 October 2026.';
      return base;
    },
  },
  {
    id: 'invented-name',
    check: 'G4',
    code: 'G4_NAME_UNSUPPORTED',
    description: 'A sentence names Harlow Capital as lead investor; the filing names Corvane Partners.',
    apply: (base) => {
      sentenceWith(base, 'The round, led by').text = 'The round, led by Harlow Capital, totals $450 million, according to a regulatory filing.';
      return base;
    },
  },
  {
    id: 'invented-name-at-sentence-start',
    check: 'G4',
    code: 'G4_INITIAL_WORD_UNSUPPORTED',
    description: 'A sentence opens with a company, Harlow Logistics, that the claim it cites never mentions.',
    apply: (base) => {
      sentenceWith(base, 'Brindle Logistics plans to use').text = 'Harlow Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.';
      return base;
    },
  },
  {
    id: 'value-outside-span',
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description: 'A claim lists a value, 38 kg, that is not in the quotation it says it was taken from.',
    apply: (base) => {
      claimOf(base, 'c-13').span.quote = 'Arm mass: 39 kg.';
      return base;
    },
  },
  {
    id: 'altered-quote',
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: "A quotation changes one word of the source's: ten weeks, not nine.",
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
        '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      return base;
    },
  },
];
