import type { LedgerSection } from '../constants';
import type { Check, Failure } from '../gate';
import { dateMatches } from '../normalise';
import type { DateToken, NumberToken } from '../tokens';
import { extractTokens } from '../tokens';
import { openingWordAccepted, wordSet } from '../grounding';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G7 can report. */
export const G7_CODES = ['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_SHARE', 'G7_ANALYSIS_NEW_VALUE'] as const;

/** Parts of the piece where analysis is not allowed: the parts a reader takes as plain fact. */
const NO_ANALYSIS: readonly LedgerSection[] = ['title', 'description', 'opening', 'takeaways'];

/** The sentences the share is measured over: everything below the title and the description. */
const BODY: readonly LedgerSection[] = ['opening', 'takeaways', 'body', 'limitations'];

/**
 * G7, analysis rules. Analysis is the Desk's own reading of the facts, and it
 * is kept on a short lead.
 *
 * - It may appear only in the sections of the body (G7_ANALYSIS_PLACEMENT).
 * - It may be at most `analysisShareCap` of the body's sentences
 *   (G7_ANALYSIS_SHARE). The body here is the opening, the takeaways, the
 *   sections and the limitations.
 * - It may not introduce a number, date or name that no fact sentence of the
 *   piece contains (G7_ANALYSIS_NEW_VALUE). Numbers match by value, and by unit
 *   when the analysis gives one; a date matches a fact date at the precision the
 *   analysis uses; names are the capitalised words `extractTokens` finds,
 *   except the first word of a sentence and the words on the allow-list.
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 *   The first word of an analysis sentence has its own rule: when it looks like a name
 *   it must be a function word from SENTENCE_STARTERS, a word on the allow-list, or
 *   a whole word (any case, anywhere) of some fact sentence of the piece.
 */
export const checkG7: Check = ({ draft }, ctx) => {
  const sentences = allSentences(draft);
  const failures: Failure[] = [];
  const analysis = sentences.filter((item) => item.sentence.kind === 'analysis');

  for (const item of analysis.filter((located) => NO_ANALYSIS.includes(located.section))) {
    const where = describeLocation(item);
    failures.push({
      check: 'G7',
      code: 'G7_ANALYSIS_PLACEMENT',
      message: `the analysis sentence at ${where} is not allowed there: analysis belongs in the sections of the body`,
      where,
    });
  }

  const body = sentences.filter((item) => BODY.includes(item.section));
  const inBody = analysis.filter((item) => BODY.includes(item.section)).length;
  // Divide, do not multiply the cap: 12 / 60 is exactly the double 0.2, while 0.2 * 60 may not be exactly 12.
  if (body.length > 0 && inBody / body.length > ctx.config.analysisShareCap) {
    const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
    failures.push({
      check: 'G7',
      code: 'G7_ANALYSIS_SHARE',
      message: `analysis sentences are ${inBody} of the ${body.length} sentences in the body (${percent(inBody / body.length)}); the cap is ${percent(ctx.config.analysisShareCap)}`,
      where: 'body',
    });
  }

  // What the fact sentences state.
  const numbers: NumberToken[] = [];
  const dates: DateToken[] = [];
  const names = new Set<string>();
  const facts = sentences.filter((located) => located.sentence.kind === 'fact');
  const factWords = wordSet(facts.map((item) => item.sentence.text));
  for (const item of facts) {
    const tokens = extractTokens(item.sentence.text);
    numbers.push(...tokens.numbers);
    dates.push(...tokens.dates);
    for (const name of tokens.names) names.add(name);
  }

  for (const item of analysis) {
    const where = describeLocation(item);
    const tokens = extractTokens(item.sentence.text);
    const fail = (what: string) =>
      failures.push({
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${where} introduces the ${what}, which no fact sentence contains`,
        where,
      });

    if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, factWords, ctx.nameAllowList)) {
      fail(`opening word "${tokens.initialWord}"`);
    }
    for (const token of new Map(tokens.numbers.map((number) => [number.raw, number])).values()) {
      if (!numbers.some((fact) => fact.value === token.value && (token.unit === undefined || fact.unit === token.unit))) {
        fail(`number "${token.raw}"`);
      }
    }
    for (const token of new Map(tokens.dates.map((date) => [date.raw, date])).values()) {
      if (!dates.some((fact) => dateMatches(token, fact.iso))) {
        fail(`date "${token.raw}"`);
      }
    }
    for (const name of tokens.names) {
      if (!names.has(name) && !ctx.nameAllowList.has(name)) {
        fail(`name "${name}"`);
      }
    }
  }

  return { failures, holdReasons: [] };
};
