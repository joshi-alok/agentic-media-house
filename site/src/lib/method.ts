import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, and the
// seven stages of the pipeline, which are written in the future tense because
// none of them is running yet.

export interface GateRule {
  id: CheckId;
  name: string;
  /** What the check requires, in one sentence. */
  text: string;
}

/** The nine deterministic checks in plain English, with the limits taken from `config`. */
export function gateRules(config: GateConfig = defaultConfig()): GateRule[] {
  const { openingWords, takeaways, bodyWords } = config;
  const share = Math.round(config.analysisShareCap * 100);
  return [
    {
      id: 'G1',
      name: 'Frontmatter',
      text: `The title is not empty, the description is at most ${config.descriptionMax} characters, the date is a real date, the page address is lowercase words joined by hyphens, there are 1 to 3 categories from the closed list with at least one beat among them, and an author is named.`,
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, no heading asks a question, and a piece that rests on a company's own datasheet, press release, briefing or demo has a section on what could not be verified.`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites, and every value a claim lists is really in its quoted passage; the name check is strict on purpose, because a false alarm only sends a draft back for revision.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in quotation marks is word for word inside the quoted passage of a claim that the sentence cites.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only as an attribution that names the outlet, never in analysis, and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, and may not bring in a number, date or name that no factual sentence contains.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each comes from a fixed template that describes one claim's basis or status, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: 'The page address is not already in use, the title is not a near-duplicate of a recent title, and none of the banned filler phrases appears.',
    },
  ];
}

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
