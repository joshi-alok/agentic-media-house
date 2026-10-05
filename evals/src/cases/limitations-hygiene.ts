import { SEEDED_PUBLISHED_SLUG } from '../context';
import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the limitation sentences (G8) and in hygiene (G9). */
export const LIMITATIONS_HYGIENE_CASES: SeededCase[] = [
  {
    id: 'limitation-in-body',
    check: 'G8',
    code: 'G8_LIMITATION_PLACEMENT',
    description: "A limitation sentence is placed in a body paragraph instead of 'What we couldn't verify'.",
    apply: (base) => {
      base.draft.sections[0]!.paragraphs[0]!.push(structuredClone(base.draft.limitations[0]!));
      return base;
    },
  },
  {
    id: 'limitation-unknown-claim',
    check: 'G8',
    code: 'G8_LIMITATION_CLAIMS',
    description: 'A limitation sentence cites a claim, c-99, that is not in the piece.',
    apply: (base) => {
      base.draft.limitations[0]!.claimIds = ['c-99'];
      return base;
    },
  },
  {
    id: 'limitation-edited-text',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the datasheet figure was independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The 12 kilograms payload figure has been confirmed independently.';
      return base;
    },
  },
  {
    id: 'limitation-wrong-template',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence keeps its text but is labelled with the wrong template.',
    apply: (base) => {
      base.draft.limitations[0]!.template = 'status';
      return base;
    },
  },
  {
    id: 'slug-collision',
    check: 'G9',
    code: 'G9_SLUG_COLLISION',
    description: 'The slug is the slug of a piece that is already published.',
    apply: (base) => {
      base.draft.slug = SEEDED_PUBLISHED_SLUG;
      return base;
    },
  },
  {
    id: 'duplicate-title',
    check: 'G9',
    code: 'G9_TITLE_DUPLICATE',
    description: 'The title repeats a recent title with only a stop word changed.',
    apply: (base) => {
      base.draft.title.text = 'Brindle Logistics adds 40 FX-1 arms to Ashvale';
      base.draft.title.claimIds = ['c-23'];
      return base;
    },
  },
  {
    id: 'banned-phrase',
    check: 'G9',
    code: 'G9_BANNED_PHRASE',
    description: "A takeaway calls the shipment a 'game-changer'.",
    apply: (base) => {
      sentenceWith(base, 'Tarnmoor is the second').text = 'Tarnmoor is the second Brindle Logistics plant to receive FX-1 arms, a game-changer for the site.';
      return base;
    },
  },
  {
    id: 'banned-phrase-in-heading',
    check: 'G9',
    code: 'G9_BANNED_PHRASE',
    description: "A section heading says 'revolutionary'.",
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What the revolutionary customer reports';
      return base;
    },
  },
];
