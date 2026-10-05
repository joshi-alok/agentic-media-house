import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, the known
// limits of those rules, and the seven stages of the pipeline, which are
// written in the future tense because none of them is running yet. The
// sentences whose tense depends on a part of the Desk being live are in copy.ts.

export interface GateRule {
  id: CheckId;
  name: string;
  /** What the check requires, in one sentence. */
  text: string;
}

/**
 * The nine deterministic checks in plain English, with the limits taken from `config`. Each sentence says what the code
 * really checks: method.test.ts shows the claims it makes about words with the real reader, and the gate's own tests
 * show the rest.
 */
export function gateRules(config: GateConfig = defaultConfig()): GateRule[] {
  const { openingWords, takeaways, bodyWords, headingMax } = config;
  const share = Math.round(config.analysisShareCap * 100);
  const overlap = Math.round(config.titleSimilarityThreshold * 100);
  return [
    {
      id: 'G1',
      name: 'Frontmatter',
      text: `The title and the description are not empty, the description is at most ${config.descriptionMax} characters, the date is a real date, the page address is lowercase letters and digits joined by single hyphens, there are 1 to 3 categories, all different, from the closed list, with at least one beat among them, and the author is the Desk, so a piece cannot carry a human's name.`,
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence, the title and the description included, cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites; numbers written in words are read like digits ("twelve kilograms" is 12 kg) and words that state an amount with no figure to check ("half", "twice", "doubled", "tenfold") are refused; a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites; a section heading has no number, date or quotation and no capitalised word that no claim cited in that section contains; and every value a claim lists is really in its quoted passage.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in double quotation marks in the title, the description or a factual or analysis sentence is word for word inside the quoted passage of a claim that the sentence cites, where spacing, dashes and the shape of quotation marks and apostrophes do not matter and case and punctuation do.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed.", and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, may not bring in a number (written in digits or words), date or name that no factual sentence contains, and must open with an ordinary function word or a word that some factual sentence uses.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: `The page address is not already in use, the title is not a near-duplicate of a title published in the last ${config.titleWindowDays} days (its words overlap theirs by ${overlap} percent or more, counting shared words over all words), and none of the banned filler phrases appears in the title, description, headings, body or limitations.`,
    },
  ];
}

/** One thing the checks cannot do, with a sentence that shows it with the real token reader. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `strict`: the reader refuses the example's first word although the sentence may be fine.
   */
  kind: 'unseen' | 'strict';
  text: string;
  example: string;
}

/**
 * What the code cannot see, and where it refuses more than it should. The limit that meaning is not checked is
 * written in copy.ts, because who checks it is a matter of what is live.
 */
export const KNOWN_LIMITS: readonly KnownLimit[] = [
  {
    kind: 'unseen',
    text: 'Ordinals such as first, second and third are not read, so a sentence can say "the second plant" and the gate compares it with no claim.',
    example: 'The second plant opened in the third quarter.',
  },
  {
    kind: 'unseen',
    text: 'Vague quantities such as "a couple", "several", "a few" and "dozens" are not read either.',
    example: 'The plant shipped several arms and a couple of grippers, and dozens of units followed.',
  },
  {
    kind: 'unseen',
    text: 'The words "zero", "none" and "no" are not read as numbers.',
    example: 'The plants shipped zero arms, and none were left.',
  },
  {
    kind: 'unseen',
    text: 'A date that is not written out, such as "last year" or "next month", is not read.',
    example: 'It shipped last year and will ship next month.',
  },
  {
    kind: 'unseen',
    text: 'A name that starts with a lowercase letter, such as iRobot or xAI, cannot be seen by a rule that looks for capital letters.',
    example: 'iRobot and xAI joined the round.',
  },
  {
    kind: 'strict',
    text: 'The name check is strict on purpose: it reads every capitalised word as a name, so an ordinary capitalised word, such as a noun that opens a sentence or a word in a Title Case heading, sends a draft back for revision. A false alarm costs a revision round; a name that slipped through would cost a wrong claim.',
    example: 'Output rose 5 percent.',
  },
];

export interface PipelineStage {
  name: string;
  text: string;
}

/** The seven stages of the Desk. They are the design the Desk is being built to, so each is in the future tense. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    name: 'Discover',
    text: 'The Desk will poll the primary newsrooms and the secondary feeds in its source registry, and drop anything it has already seen.',
  },
  {
    name: 'Select',
    text: 'A small model will rank what is new against a written rubric and pick one story, or none. A story with no reachable primary source can still be picked, but it will be written in attributed form and will always be held.',
  },
  {
    name: 'Fetch',
    text: 'The Desk will fetch each primary source, respecting its robots.txt, and keep its text with a SHA-256 hash and the time it was fetched.',
  },
  {
    name: 'Extract',
    text: 'A model will break each source into atomic claims, each with the exact passage it rests on. Code will confirm that every passage appears word for word in the stored source.',
  },
  {
    name: 'Compose',
    text: 'A model will write the piece as sentences that each cite claim ids. A renderer written as code will turn those sentences into the page, so no text a model wrote reaches the site any other way.',
  },
  {
    name: 'Verify',
    text: 'The gate will check the draft. A draft that fails will go back for revision with the exact failures, at most twice.',
  },
  {
    name: 'Publish or hold',
    text: 'A draft that passes will be built and published. A draft that does not will be held for the owner as a draft pull request that carries the gate report.',
  },
];

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
  return `${board.caught} of ${board.total} seeded ${board.total === 1 ? 'defect' : 'defects'} caught`;
}
