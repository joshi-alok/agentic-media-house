import type { LedgerSection } from '../constants';
import type { Check, Failure } from '../gate';
import { dateMatches } from '../normalise';
import type { DateToken, NumberToken } from '../tokens';
import { extractTokens, toNameToken } from '../tokens';
import { claimWords, isSentenceStarter, openingWordAccepted } from '../grounding';
import { allSentences, describeLocation } from '../sentences';
import { afterOpeners, startsWithCapitalOrDigit } from '../text';

/** Every failure code G7 can report. */
export const G7_CODES = ['G7_ANALYSIS_PLACEMENT', 'G7_ANALYSIS_SHARE', 'G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_NAME'] as const;

/** Parts of the piece where analysis is not allowed: the title and the description, which are fact by contract. */
const NO_ANALYSIS: readonly LedgerSection[] = ['title', 'description'];

/** The sentences the share is measured over: everything below the title and the description. */
const BODY: readonly LedgerSection[] = ['opening', 'takeaways', 'body', 'limitations'];

/** The longest first word that the message about the start of a sentence quotes. */
const MAX_FIRST_WORD = 40;

/**
 * G7, analysis rules. Analysis is the Desk's own reading of the facts, and it
 * is kept on a short lead.
 *
 * - It may not appear in the title or the description (G7_ANALYSIS_PLACEMENT).
 * - It may be at most `analysisShareCap` of the body's sentences
 *   (G7_ANALYSIS_SHARE). The body here is the opening, the takeaways, the
 *   sections and the limitations.
 * - It may not introduce a number, date or name that no fact sentence of the
 *   piece contains. A new number, number word or date is G7_ANALYSIS_NEW_VALUE; a
 *   new name, an opening word that looks like a name among them, is G7_ANALYSIS_NEW_NAME. Numbers match by value, and by unit
 *   when the analysis gives one; a date matches a fact date at the precision the
 *   analysis uses; names are the capitalised words `extractTokens` finds,
 *   except the first word of a sentence and the words on the allow-list.
 *   A name that a fact sentence has as its first word counts as stated when the claims that fact cites ground it, by the
 *   rule for an opening word below (a function word does not count: it is no name); an opening word that those claims
 *   do not have counts for nothing, so a company that only an ungrounded first word names is still new.
 *   Numbers written out in words count as numbers, and a word that states an
 *   amount with no value to compare ("half", "doubled") is always new.
 *   A new name is a blocker like a new figure (G7_ANALYSIS_NEW_NAME): the model check holds analysis only to adding nothing the passages do not support, so code stays the strict judge of what it may name.
 *   The first word of an analysis sentence has its own rule (G7_ANALYSIS_NEW_NAME): when it looks like a name
 *   it must be a function word from SENTENCE_STARTERS, a word on the allow-list, or
 *   a whole word (any case) of the quoted passage, the name values or the outlet of
 *   a claim that the analysis sentence cites. The words of the fact sentences, and the
 *   text and the label of a claim, ground nothing: they are what a model wrote.
 * - It starts with a capital letter or a digit, once any opening quotation marks and brackets
 *   are skipped (G7_ANALYSIS_NEW_NAME). The rule for the opening word reads only a word that
 *   starts with a capital letter, and code is the strict reader of analysis, so an analysis sentence that
 *   began in lowercase ("harlow reported something similar.") would have its first word read
 *   by no rule of the gate. There is no such rule for a fact sentence: the model check judges it.
 */
export const checkG7: Check = ({ draft, claims }, ctx) => {
  const sentences = allSentences(draft);
  const failures: Failure[] = [];
  const analysis = sentences.filter((item) => item.sentence.kind === 'analysis');

  for (const item of analysis.filter((located) => NO_ANALYSIS.includes(located.section))) {
    const where = describeLocation(item);
    failures.push({
      check: 'G7',
      code: 'G7_ANALYSIS_PLACEMENT',
      message: `the analysis sentence at ${where} is not allowed there: the title and the description state facts only`,
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
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  for (const item of facts) {
    const tokens = extractTokens(item.sentence.text);
    numbers.push(...tokens.numbers);
    dates.push(...tokens.dates);
    for (const name of tokens.names) names.add(name);
    // The first word is no name token (every sentence starts with a capital letter), but a fact that opens with the company it is about does state
    // it: when the claims the fact cites ground the word, as they must for an analysis sentence that opens with it, an analysis sentence may name it.
    if (tokens.initialWord !== undefined && !isSentenceStarter(tokens.initialWord)) {
      const cited = [...new Set(item.sentence.claimIds)].flatMap((id) => byId.get(id) ?? []);
      if (openingWordAccepted(tokens.initialWord, claimWords(cited), ctx.nameAllowList)) names.add(toNameToken(tokens.initialWord));
    }
  }

  for (const item of analysis) {
    const where = describeLocation(item);
    const { text } = item.sentence;
    const tokens = extractTokens(text);
    const fail = (code: (typeof G7_CODES)[number], message: string) => failures.push({ check: 'G7', code, message, where });
    /** The message for a number, a date, a name or an opening word that the analysis brings in. */
    const introduces = (what: string, why = 'which no fact sentence contains') =>
      `the analysis sentence at ${where} introduces the ${what}, ${why}`;

    if (!startsWithCapitalOrDigit(text)) {
      const first = afterOpeners(text).split(/\s/u)[0]!.slice(0, MAX_FIRST_WORD);
      fail(
        'G7_ANALYSIS_NEW_NAME',
        first === ''
          ? `the analysis sentence at ${where} has no first character, so no name can be read in it: start it with a capital letter or a digit`
          : `the analysis sentence at ${where} starts with "${first}", not with a capital letter or a digit, so its first word cannot be read as a name: start it with a capital letter or a digit`,
      );
    }

    const cited = [...new Set(item.sentence.claimIds)].flatMap((id) => byId.get(id) ?? []);
    if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, claimWords(cited), ctx.nameAllowList)) {
      fail(
        'G7_ANALYSIS_NEW_NAME',
        introduces(
          `opening word "${tokens.initialWord}"`,
          'which is neither an ordinary opening word nor a word of the quoted passage, the names or the outlet of any claim it cites',
        ),
      );
    }
    for (const token of new Map(tokens.numbers.map((number) => [number.raw, number])).values()) {
      if (!numbers.some((fact) => fact.value === token.value && (token.unit === undefined || fact.unit === token.unit))) {
        fail('G7_ANALYSIS_NEW_VALUE', introduces(`number "${token.raw}"`));
      }
    }
    for (const word of tokens.uncheckable) {
      fail('G7_ANALYSIS_NEW_VALUE', introduces(`number word "${word}"`));
    }
    for (const token of new Map(tokens.dates.map((date) => [date.raw, date])).values()) {
      if (!dates.some((fact) => dateMatches(token, fact.iso))) {
        fail('G7_ANALYSIS_NEW_VALUE', introduces(`date "${token.raw}"`));
      }
    }
    for (const name of tokens.names) {
      if (!names.has(name) && !ctx.nameAllowList.has(name)) {
        fail('G7_ANALYSIS_NEW_NAME', introduces(`name "${name}"`));
      }
    }
  }

  return { failures, holdReasons: [] };
};
