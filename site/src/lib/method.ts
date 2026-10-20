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
  /** What the check only records and does not stop a piece for; empty when it has none. */
  notes: string;
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
      notes: '',
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `There are at least 2 sections, every section has a heading, no heading is one of the two headings that the Desk writes itself ("Key takeaways" and "What we couldn't verify"), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, that only another outlet reported, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
      notes: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words, and a heading is at most ${headingMax} characters and not a question. These are targets for the kind of piece. A piece outside them is noted and published all the same, and its receipts page lists what was outside.`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence, the title and the description included, cites at least one claim, and every claim a sentence cites exists.',
      notes: '',
    },
    {
      id: 'G4',
      name: 'Values',
      text: `The reader of the gate finds the numbers and dates in each factual sentence (what it cannot find is listed under "${LIMITS_HEADING}"), and each one it finds must appear among the values of a claim that sentence cites; a word that mixes letters and digits (such as FY2027 or 10x) must appear in the quoted passage, the names or the outlet of a claim that sentence cites (in a heading, of a claim cited in its section); numbers written in words are read like digits ("twelve kilograms" is 12 kg); a section heading has no number, date or quotation and no word that states an amount with no figure; and every value a claim lists is really in its quoted passage, as a whole word or number (a 2 is not found inside "12 weeks" or "2.3").`,
      notes: 'The reader also finds the capitalised names in each factual sentence (except its first word) and in each heading, and the words that state an amount with no figure to check in a factual sentence ("half", "twice", "doubled", "tenfold"); a name that no cited claim lists, and such a word, are noted and do not stop the piece, because the model check judges what a sentence means better than a list of words can.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in double quotation marks in the title, the description or a factual or analysis sentence is word for word inside the quoted passage of a claim that the sentence cites, where spacing, dashes and the shape of quotation marks and apostrophes do not matter and case and punctuation do.',
      notes: '',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet has the basis "reported" (no claim from a primary source has it) and may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed." in its body, and a title or a description that rests on one names the outlet and carries no label.',
      notes: '',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title and the description, may not bring in a number (written in digits or words), a date, a word that states an amount with no figure, or a name that no factual sentence contains, must start with a capital letter or a digit, and must open with an ordinary function word or a word of the quoted passage, the names or the outlet of a claim it cites.`,
      notes: `Analysis is at most ${share} percent of the body's sentences; a piece that goes over is noted and published.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status (and, for claims that another outlet reported, that outlet) through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
      notes: '',
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: `The page address is not already in use, and the title is not a near-duplicate of a title published in the last ${config.titleWindowDays} days (its words overlap theirs by ${overlap} percent or more, counting shared words over all words).`,
      notes: 'None of the banned filler phrases should appear in the title, description, headings, body or limitations; one that does is noted and the piece is published.',
    },
  ];
}

/** One thing the checks cannot do, with an example that known-limits.test.ts shows with the real reader or the real gate. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `misread`: the reader finds a number in the example that is not the amount the sentence means.
   * `strict`: the gate notes or refuses the example although the sentence may be fine.
   * `unchecked`: the example passes the checks of code whatever it says: text that a model writes and no rule reads, a name that a rule only notes, or an analysis sentence that
   * only the model check judges (and a model can miss).
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
    kind: 'unseen',
    text: 'A capitalised word that opens a factual sentence is not read as a name, so an invented name there is not even noted; the model check is the only reader.',
    example: 'Tarnmoor shipped.',
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
    text: 'The name check is strict on purpose: it reads every capitalised word (except the first word of a sentence) as a name, so an ordinary capitalised word, such as a noun that opens a section heading, is noted. A note costs nothing, and the model check reads each sentence for a name that slipped through.',
    example: 'Output rose in the spring.',
  },
  {
    kind: 'strict',
    text: 'The only evidence for a capitalised word that opens a section heading or an analysis sentence is the quoted passage of a claim, the names that claim lists and its outlet: the text and the label of a claim are written by a model and count for nothing, so a word that only they have is noted in a heading and sends an analysis sentence back, although it may be an ordinary word.',
    example: 'Rollout began in the spring.',
  },
  {
    kind: 'unchecked',
    text: 'The page address of a piece and the text and the label of each claim are written by a model, and no rule of the gate reads them for figures or names: a label such as "Harlow Logistics 12 plants" passes the gate. The Extract stage will check the text and the label against the passage before the gate sees the claim, and the receipts page shows the label and the passage, never the text.',
    example: 'Harlow Logistics 12 plants',
  },
  {
    kind: 'unchecked',
    text: 'Analysis sentences, which are a fifth of the sentences of the body or fewer by default (a piece above that is noted, not stopped), are checked by code for where they stand and for the numbers, dates and names they bring in, and then by the model check, which refuses one that adds an entity, an event, a figure or a claim of fact that the passages it relies on do not support. A model can miss one, and a judgement or a consequence that the passages plainly support is allowed by design, so an analysis sentence can still be wrong in a way that no rule sees; the page labels it Analysis.',
    example: 'The delivery schedule matters more than the price.',
  },
  {
    kind: 'unchecked',
    text: 'A capitalised word that no claim lists is noted, not refused (except the first word of a sentence, which is not read as a name): between it and the page stands the model check, and nothing else.',
    example: 'The plant is the second Harlow plant.',
  },
  {
    kind: 'unchecked',
    text: 'A section heading that names no figure and no capitalised word is not checked by code for what it asserts: "the arms keep failing" passes the gate.',
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
    text: 'A small model will rank what is new against a written rubric and pick one story, or none. A story with no reachable primary source can still be picked, but it will be written in attributed form, naming the outlet.',
  },
  {
    name: 'Fetch',
    text: 'The Desk will fetch each primary source, respecting its robots.txt, and keep its text with a SHA-256 hash and the time it was fetched.',
  },
  {
    name: 'Extract',
    text: 'A model will break each source into atomic claims, each with the exact passage it rests on. Code will confirm that every passage appears word for word in the stored source, that every value of a claim is in its passage, and that the label and the text of a claim bring in no word, figure or name that the passage does not have.',
  },
  {
    name: 'Compose',
    text: 'A model will write the piece as sentences that each cite claim ids. A renderer written as code will turn those sentences into the page, so no text a model wrote reaches the site any other way.',
  },
  {
    name: 'Verify',
    text: 'The gate will check the draft. A blocker, such as a number or a date that no claim has, sends the draft back for revision with the exact failures, at most twice; a note, such as a length outside the target, is recorded and does not stop the piece.',
  },
  {
    name: 'Publish or hold',
    text: 'A draft with no blocker, that the model check clears, will be built and published, with its notes on its receipts page. A draft that does not will be held for the owner as a draft pull request that carries the gate report.',
  },
];

/** The paragraph that explains the scoreboard on the method page. There are more cases than codes, so it says at least once. */
export const SCOREBOARD_INTRO =
  'A gate is worth what it reports. To test this one, the golden example piece is broken on purpose, at least once for every failure code of the nine checks, and the gate has to report every break, as a blocker that sends the draft back or as a note that is recorded. A missed defect fails the tests. The result is kept with the code, and this table is read from it.';

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
  return `${board.caught} of ${board.total} seeded ${board.total === 1 ? 'defect' : 'defects'} caught`;
}
