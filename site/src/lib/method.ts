import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, the known
// limits of those rules, and the seven stages of the pipeline, which are
// written in the future tense because none of them is running yet. The
// sentences whose tense depends on a part of the Desk being live are in copy.ts.

/** The heading of the list of known limits on the method page. The rule G4 points at it, so the two cannot drift apart. */
export const LIMITS_HEADING = 'What the checks cannot see';

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
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, that only another outlet reported, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence, the title and the description included, cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: `The reader of the gate finds the numbers, dates and capitalised names in each factual sentence (what it cannot find is listed under "${LIMITS_HEADING}"), and each one it finds must appear among the values of a claim that sentence cites; numbers written in words are read like digits ("twelve kilograms" is 12 kg) and words that state an amount with no figure to check ("half", "twice", "doubled", "tenfold") are refused; a sentence may open with a capitalised word only if it is an ordinary function word or a word of the quoted passage, the names or the outlet of a claim the sentence cites (the text and the label of a claim are written by a model and count for nothing); a section heading has no number, date or quotation and no capitalised word that is not in the quoted passage, the names or the outlet of a claim cited in that section; and every value a claim lists is really in its quoted passage, as a whole word or number (a 2 is not found inside "12 weeks" or "2.3").`,
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in double quotation marks in the title, the description or a factual or analysis sentence is word for word inside the quoted passage of a claim that the sentence cites, where spacing, dashes and the shape of quotation marks and apostrophes do not matter and case and punctuation do.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet has the basis "reported" (no claim from a primary source has it) and may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed.", and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, may not bring in a number (written in digits or words), date or name that no factual sentence contains, and must open with an ordinary function word or a word of the quoted passage, the names or the outlet of a claim it cites.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status (and, for claims that another outlet reported, that outlet) through a fixed template, covers at most four claims, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: `The page address is not already in use, the title is not a near-duplicate of a title published in the last ${config.titleWindowDays} days (its words overlap theirs by ${overlap} percent or more, counting shared words over all words), and none of the banned filler phrases appears in the title, description, headings, body or limitations.`,
    },
  ];
}

/** One thing the checks cannot do, with an example that known-limits.test.ts shows with the real reader or the real gate. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `misread`: the reader finds a number in the example that is not the amount the sentence means.
   * `strict`: the gate refuses the example although the sentence may be fine.
   * `unchecked`: the example is text that a model writes and no rule reads: it passes whatever it says.
   */
  kind: 'unseen' | 'misread' | 'strict' | 'unchecked';
  text: string;
  example: string;
}

/** The sentence that opens the list of known limits, one phrase for each kind of limit. */
export const LIMITS_INTRO =
  'The rules above do what they say, and no more. These are the known limits: the places where a sentence can say something that no rule compares with a claim, where the reader takes a word for a number it does not mean, where the gate refuses more than it should, and the text that a model writes and no rule reads.';

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
    text: 'The word "one" on its own is not read as a number, so "one robot" is compared with no claim, although "one kilogram" is read as 1 kg.',
    example: 'The plant shipped one robot.',
  },
  {
    kind: 'unseen',
    text: 'Fractions written in words, such as "a third" and "a quarter", are not read.',
    example: 'A third of the arms shipped, and a quarter were returned.',
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
    kind: 'misread',
    text: 'A fraction that starts with a number word is read as that number: "two thirds" is read as the number 2, so the gate looks for a claim that lists a 2.',
    example: 'The plant shipped two thirds of the arms.',
  },
  {
    kind: 'misread',
    text: 'A compound such as "six-axis" is read as the number 6 with no unit, so a claim that lists a 6 in any unit supports it.',
    example: 'The six-axis arm shipped.',
  },
  {
    kind: 'strict',
    text: 'The name check is strict on purpose: it reads every capitalised word as a name, so an ordinary capitalised word, such as a noun that opens a sentence or a word in a Title Case heading, sends a draft back for revision. A false alarm costs a revision round; a name that slipped through would cost a wrong claim.',
    example: 'Output rose 5 percent.',
  },
  {
    kind: 'strict',
    text: 'A sentence cannot open with a name that starts with a lowercase letter, such as iRobot or xAI: every sentence must start with a capital letter or a digit, so the sentence has to be reworded.',
    example: 'iRobot shipped the arm.',
  },
  {
    kind: 'strict',
    text: 'The only evidence for a capitalised word that opens a sentence or a heading is the quoted passage of a claim, the names that claim lists and its outlet: the text and the label of a claim are written by a model and count for nothing, so a word that only they have sends the draft back, although it may be an ordinary word.',
    example: 'Rollout began in the spring.',
  },
  {
    kind: 'unchecked',
    text: 'The page address of a piece and the text and the label of each claim are written by a model, and no rule reads them for figures or names: a label such as "Harlow Logistics 12 plants" passes.',
    example: 'Harlow Logistics 12 plants',
  },
  {
    kind: 'unchecked',
    text: 'A section heading that names no figure and no capitalised word is not checked at all, whatever it asserts: "the arms keep failing" passes.',
    example: 'the arms keep failing',
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

/** The paragraph that explains the scoreboard on the method page. There are more cases than codes, so it says at least once. */
export const SCOREBOARD_INTRO =
  'A gate is worth what it catches. To test this one, the golden example piece is broken on purpose, at least once for every failure code of the nine checks, and the gate has to catch every break. A missed defect fails the tests. The result is kept with the code, and this table is read from it.';

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
  return `${board.caught} of ${board.total} seeded ${board.total === 1 ? 'defect' : 'defects'} caught`;
}
