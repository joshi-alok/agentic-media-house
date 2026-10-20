import { allSentences } from '@robywire/gate';
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
    description: 'A sentence gives the number of the claim it cites with a different unit.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 lb rated payload and a 1.4 m maximum reach.';
      return base;
    },
  },
  {
    id: 'swapped-number-in-words',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives a number written in words, with its unit, that is not the number of the claim it cites.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a rated payload of thirteen kilograms and a 1.4 m maximum reach.';
      return base;
    },
  },
  {
    id: 'uncheckable-number-word',
    check: 'G4',
    code: 'G4_NUMBER_WORD_UNCHECKABLE',
    description: 'A sentence states an amount in a word, such as "twice", that no claim can support.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').text = 'It lists 7 investors in the round, twice as many as before.';
      return base;
    },
  },
  {
    id: 'swapped-date',
    check: 'G4',
    code: 'G4_DATE_UNSUPPORTED',
    description: 'A sentence gives a date that is not the date of the claim it cites.',
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
    description: 'A sentence names a company that no claim it cites mentions.',
    apply: (base) => {
      sentenceWith(base, 'The round, led by').text = 'The round, led by Harlow Capital, totals $450 million, according to a regulatory filing.';
      return base;
    },
  },
  {
    id: 'unsupported-figure-word',
    check: 'G4',
    code: 'G4_FIGURE_UNSUPPORTED',
    description: 'A sentence gives a date as a word that mixes letters and digits, "mid-2027", that no claim it cites contains.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 kg rated payload and a 1.4 m maximum reach, with shipments from mid-2027.';
      return base;
    },
  },
  {
    id: 'heading-with-number',
    check: 'G4',
    code: 'G4_HEADING_NUMBER',
    description: 'A section heading states a figure, as in "the company ships 500 arms".',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'Fixture Robotics ships 500 arms';
      return base;
    },
  },
  {
    id: 'heading-with-quote',
    check: 'G4',
    code: 'G4_HEADING_QUOTE',
    description: 'A section heading contains a quoted passage.',
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What the customer calls "production"';
      return base;
    },
  },
  {
    id: 'heading-with-invented-name',
    check: 'G4',
    code: 'G4_HEADING_NAME',
    description: 'A section heading names a company, Harlow Logistics, that no claim of its section mentions.',
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What Harlow Logistics reports';
      return base;
    },
  },
  {
    id: 'value-outside-span',
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description: 'A claim lists a value that is not in the quotation it says it was taken from.',
    apply: (base) => {
      claimOf(base, 'c-13').span.quote = 'Arm mass: 39 kg.';
      return base;
    },
  },
  {
    id: 'value-inside-longer-number',
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description:
      'A claim lists the value 2, which is only the end of the 12 in its quotation, and the sentences that cite it give a delivery time of 2 weeks.',
    apply: (base) => {
      const claim = claimOf(base, 'c-4');
      claim.values = claim.values.map((value) => (value.raw === '12' ? { ...value, raw: '2', normalised: '2' } : value));
      for (const { sentence } of allSentences(base.draft)) sentence.text = sentence.text.replaceAll('12 weeks', '2 weeks');
      return base;
    },
  },
  {
    id: 'altered-quote',
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: 'A quotation changes one word of the passage it quotes.',
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
        '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      return base;
    },
  },
];
