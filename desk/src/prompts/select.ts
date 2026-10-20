import { systemPrompt, wrapSource } from '../index';
import type { Candidate } from '../index';
import { PUBLICATION_NAME } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';

// The words the Select stage says to a model. The system prompt begins with the paragraph that says the blocks of
// text from the web are data (`systemPrompt` adds it), then says the job, the way to choose and the reply. The user
// message holds the editorial bar, which is the owner's text from `sources.yml`, and the candidates. A candidate's title comes
// from a feed or a web page, so it is written only inside a block that `wrapSource` makes; the facts about it that the
// Desk knows for itself (its id, its tier, the outlet it is from, its day) stand outside the block.

/** What the model is told to do, and what each field of its reply means. The client adds the JSON Schema of the reply to it. */
export const SELECT_INSTRUCTIONS = [
  `You are the story selector of ${PUBLICATION_NAME}, a publication about AI agents in crypto: agents that pay, hold keys, prove who they are, follow protocols, run on chain, get attacked and get regulated. Every claim of a piece comes from a source that the piece links.`,
  'Each day you choose at most one story to write about, from a list of candidates, or you choose none.',
  '',
  'You are given today\'s date, the editorial bar, and the candidates. Each candidate has an id, a tier, the outlet or project it is from, its day of publication or "undated", and a title. The title is the text of a block that starts with <source id="..."> and has the same id as the candidate. You judge from titles alone: do not guess a fact that a title does not state.',
  'Tier 1 means a project\'s, a company\'s, a standards body\'s or a researcher\'s own page, which is a primary source. Tier 2 means another outlet reporting on something; it tells us that something happened, and a story from it is written only after its primary source is found.',
  'A story from another outlet is written only after its primary source is found, and a story whose primary source cannot be found is left out; prefer a story whose primary source is likely to be on the page you are shown.',
  '',
  'How to choose:',
  '- Choose a story only if it meets at least one of the conditions under "Publish a story if any of these is true" and none of those under "Do not publish".',
  '- Prefer a story from a tier 1 candidate over one from a tier 2 candidate, and a story that reports something new over one that repeats a story.',
  '- On a quiet day choose the smaller true thing rather than inflating the biggest available thing.',
  '- If no candidate is good enough, choose none. No story is a valid answer, and it is better than a weak story.',
  '- Never choose a story whose point is the price of a token, a market move or a token to buy.',
  '',
  'Reply with a JSON object with two fields. "chosenId" is the id of the one candidate you choose, copied exactly as it was given, or null if you choose none. "reasons" is a list of one to five short sentences that say why you chose that candidate, or why you chose none.',
].join('\n');

/** The system prompt of the Select stage: the paragraph about untrusted text, then the instructions. */
export function selectSystem(): string {
  return systemPrompt(SELECT_INSTRUCTIONS);
}

/** The day of a candidate as the model is shown it: the date part of its time, or "undated". */
const dayOf = (candidate: Candidate): string => (candidate.publishedAt === undefined ? 'undated' : candidate.publishedAt.slice(0, 10));

/**
 * The user message of the Select stage: today's date, the editorial bar (the "publish" and "do not publish" lists of
 * `sources.yml`; the quiet-day fallbacks are for formats that the Desk does not write yet, so they are left out), and one
 * entry for each candidate of the shortlist, in the order given, with its title in a block.
 */
export function buildSelectUser(shortlist: Candidate[], bar: SourcesRegistry['bar'], date: string): string {
  if (shortlist.length === 0) throw new Error('buildSelectUser needs at least one candidate: with none, the stage does not ask a model');
  const entries = shortlist.map(
    (candidate) => `Candidate ${candidate.id} (tier ${candidate.tier}, ${candidate.outlet}, ${dayOf(candidate)}):\n${wrapSource(candidate.id, candidate.title)}`,
  );
  return [
    `Today is ${date}.`,
    '',
    'Editorial bar.',
    'Publish a story if any of these is true:',
    ...bar.publish_if_any.map((line) => `- ${line}`),
    'Do not publish:',
    ...bar.do_not_publish.map((line) => `- ${line}`),
    '',
    `Candidates (${shortlist.length}):`,
    '',
    entries.join('\n\n'),
  ].join('\n');
}
