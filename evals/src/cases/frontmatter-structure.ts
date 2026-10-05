import type { SeededCase } from '../seeded';
import { sentenceWith } from './support';

/** Defects in the frontmatter (G1) and in the shape of the piece (G2). */
export const FRONTMATTER_STRUCTURE_CASES: SeededCase[] = [
  {
    id: 'empty-title',
    check: 'G1',
    code: 'G1_TITLE_EMPTY',
    description: 'The title is empty.',
    apply: (base) => {
      base.draft.title.text = '';
      return base;
    },
  },
  {
    id: 'empty-description',
    check: 'G1',
    code: 'G1_DESCRIPTION_EMPTY',
    description: 'The description is blank.',
    apply: (base) => {
      base.draft.description.text = '  ';
      return base;
    },
  },
  {
    id: 'long-description',
    check: 'G1',
    code: 'G1_DESCRIPTION_TOO_LONG',
    description: 'The description is longer than the 155 characters a search result shows.',
    apply: (base) => {
      const { text } = base.draft.description;
      base.draft.description.text = `${text.slice(0, -1)}, and the plant, the arm, the customer and the funding round are described at some length.`;
      return base;
    },
  },
  {
    id: 'impossible-date',
    check: 'G1',
    code: 'G1_BAD_DATE',
    description: 'The publication date is 30 February.',
    apply: (base) => {
      base.draft.publishedAt = '2026-02-30';
      return base;
    },
  },
  {
    id: 'bad-slug',
    check: 'G1',
    code: 'G1_SLUG_FORMAT',
    description: 'The slug has capital letters and spaces.',
    apply: (base) => {
      base.draft.slug = 'Fixture Robotics Ships FX-1';
      return base;
    },
  },
  {
    id: 'no-categories',
    check: 'G1',
    code: 'G1_CATEGORY_COUNT',
    description: 'The piece has no category.',
    apply: (base) => {
      base.draft.categories = [];
      return base;
    },
  },
  {
    id: 'repeated-category',
    check: 'G1',
    code: 'G1_CATEGORY_COUNT',
    description: 'The same category is listed twice.',
    apply: (base) => {
      base.draft.categories = ['industrial-warehouse', 'industrial-warehouse'];
      return base;
    },
  },
  {
    id: 'unknown-category',
    check: 'G1',
    code: 'G1_CATEGORY_UNKNOWN',
    description: 'A category is not in the closed vocabulary.',
    apply: (base) => {
      base.draft.categories = ['industrial-warehouse', 'quantum-robots'];
      return base;
    },
  },
  {
    id: 'funding-without-beat',
    check: 'G1',
    code: 'G1_CATEGORY_NO_BEAT',
    description: 'The piece is tagged funding but has no beat.',
    apply: (base) => {
      base.draft.categories = ['funding'];
      return base;
    },
  },
  {
    id: 'blank-author',
    check: 'G1',
    code: 'G1_AUTHOR_MISSING',
    description: 'The author name is blank.',
    apply: (base) => {
      base.draft.author.name = '  ';
      return base;
    },
  },
  {
    id: 'author-not-desk',
    check: 'G1',
    code: 'G1_AUTHOR_NOT_DESK',
    description: 'The author is a person, not the Desk.',
    apply: (base) => {
      base.draft.author.name = 'Jane Doe';
      return base;
    },
  },
  {
    id: 'short-opening',
    check: 'G2',
    code: 'G2_OPENING_LENGTH',
    description: 'The opening paragraph is shorter than the length the rule requires.',
    apply: (base) => {
      base.draft.opening = base.draft.opening.slice(0, 1);
      return base;
    },
  },
  {
    id: 'two-takeaways',
    check: 'G2',
    code: 'G2_TAKEAWAYS_COUNT',
    description: 'There are two key takeaways, not three to five.',
    apply: (base) => {
      base.draft.takeaways = base.draft.takeaways.slice(0, 2);
      return base;
    },
  },
  {
    id: 'short-body',
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'The body is shorter than the length the rule requires.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 1);
      return base;
    },
  },
  {
    id: 'long-body',
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'A sentence is padded until the piece is over 850 words.',
    apply: (base) => {
      const sentence = sentenceWith(base, 'The arm itself weighs');
      sentence.text = `${sentence.text.slice(0, -1)}${' and the arm keeps working as described'.repeat(30)}.`;
      return base;
    },
  },
  {
    id: 'one-section',
    check: 'G2',
    code: 'G2_SECTIONS_MIN',
    description: 'All the paragraphs sit under one heading.',
    apply: (base) => {
      const [first] = base.draft.sections;
      base.draft.sections = [{ heading: first!.heading, paragraphs: base.draft.sections.flatMap((section) => section.paragraphs) }];
      return base;
    },
  },
  {
    id: 'question-heading',
    check: 'G2',
    code: 'G2_HEADING_QUESTION',
    description: 'A section heading ends in a question mark.',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'What shipped?';
      return base;
    },
  },
  {
    id: 'heading-too-long',
    check: 'G2',
    code: 'G2_HEADING_TOO_LONG',
    description: 'A section heading runs to more than 80 characters.',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'What shipped, in the order that the company announced it, with every detail that its release gives';
      return base;
    },
  },
  {
    id: 'empty-heading',
    check: 'G2',
    code: 'G2_HEADING_EMPTY',
    description: 'A section heading is blank.',
    apply: (base) => {
      base.draft.sections[0]!.heading = '  ';
      return base;
    },
  },
  {
    id: 'lowercase-sentence-start',
    check: 'G2',
    code: 'G2_SENTENCE_START',
    description: 'A sentence starts with a lowercase letter, so the first-word rule would not read its first word.',
    apply: (base) => {
      const sentence = sentenceWith(base, 'The arm itself weighs');
      sentence.text = `${sentence.text.charAt(0).toLowerCase()}${sentence.text.slice(1)}`;
      return base;
    },
  },
  {
    id: 'limitation-uncovered-claim',
    check: 'G2',
    code: 'G2_LIMITATION_COVERAGE',
    description: 'A claim that needs a limitation is left out of the limitation sentence that describes its group.',
    apply: (base) => {
      const [datasheet] = base.draft.limitations;
      datasheet!.claimIds = datasheet!.claimIds.filter((id) => id !== 'c-12');
      return base;
    },
  },
  {
    id: 'no-limitations',
    check: 'G2',
    code: 'G2_LIMITATIONS_MISSING',
    description: "The 'What we couldn't verify' section is missing from a piece that rests on a company's own claims.",
    apply: (base) => {
      base.draft.limitations = [];
      return base;
    },
  },
];
