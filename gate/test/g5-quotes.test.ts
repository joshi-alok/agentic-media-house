import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG5 } from '../src/checks/g5-quotes';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import { claimById, findSentence, mutate } from './helpers';

const QUOTE_SENTENCE = '"We went from pilot to production in nine weeks," said Dana Whitcombe';

/** The sentence in the golden piece that holds the one quotation. */
const quoteSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.text.includes('We went from pilot'));

const failuresAfter = (change: (copy: GateInput) => void): Failure[] =>
  checkG5(mutate(cloneGolden(), change), defaultContext()).failures;

describe('G5: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG5(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('really contains a quotation for the check to look at', () => {
    expect(quoteSentence(cloneGolden()).text.startsWith(QUOTE_SENTENCE)).toBe(true);
  });

  it('is the fifth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[4]).toBe(checkG5);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG5(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G5_QUOTE_NOT_VERBATIM', () => {
  it('fails for a quotation that is not in the cited claim, and says where and what', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
    });
    expect(failures).toEqual([
      {
        check: 'G5',
        code: 'G5_QUOTE_NOT_VERBATIM',
        message:
          'the quotation "We went from pilot to production in ten weeks," at section "What the customer reports", sentence 4 is not word for word in any claim this sentence cites',
        where: 'section "What the customer reports", sentence 4',
      },
    ]);
  });

  it.each([
    ['changes one word', '"We went from pilot to production in ten weeks,"'],
    ['changes the case', '"we went from pilot to production in nine weeks,"'],
    ['changes the punctuation', '"We went from pilot to production in nine weeks."'],
    ['drops a word from the middle', '"We went from pilot to production in weeks,"'],
    ['joins two pieces with an ellipsis', '"We went from pilot ... in nine weeks,"'],
    ['adds a word', '"We quickly went from pilot to production in nine weeks,"'],
  ])('fails for a quotation that %s', (_name, quotation) => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = `${quotation} said Dana Whitcombe.`;
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G5_QUOTE_NOT_VERBATIM']);
  });

  it.each([
    ['a part of the span', '"went from pilot to production"'],
    ['the whole span between the marks', '"We went from pilot to production in nine weeks,"'],
    ['a few words that end at the comma', '"nine weeks,"'],
  ])('passes for a quotation that is %s', (_name, quotation) => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = `${quotation} is what the company said.`;
    });
    expect(failures).toEqual([]);
  });

  it('ignores differences in quote marks, apostrophes, dashes and spacing', () => {
    const failures = failuresAfter((g) => {
      claimById(g.claims, 'c-22').span.quote = '"We\u2019ve gone from pilot\u00A0to production \u2014 in nine weeks," said Dana Whitcombe.';
      quoteSentence(g).text = '\u201CWe\'ve gone from  pilot to production - in nine weeks,\u201D said Dana Whitcombe.';
    });
    expect(failures).toEqual([]);
  });

  it('accepts curly quote marks around a verbatim passage', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = '\u201CWe went from pilot to production in nine weeks,\u201D said Dana Whitcombe.';
    });
    expect(failures).toEqual([]);
  });

  it('does not count an unterminated quotation mark as a quotation', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = 'Dana Whitcombe said "we went from pilot to production in ten weeks.';
    });
    expect(failures).toEqual([]);
  });

  it('does not treat an empty pair of quote marks as a quotation', () => {
    expect(failuresAfter((g) => (quoteSentence(g).text = 'Dana Whitcombe said "" and nothing more.'))).toEqual([]);
  });

  it('needs the passage to be in a claim the sentence cites, not in some other claim', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).claimIds = ['c-21'];
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G5_QUOTE_NOT_VERBATIM']);
  });

  it('accepts a passage found in any one of several cited claims', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).claimIds = ['c-21', 'c-22'];
    });
    expect(failures).toEqual([]);
  });

  it('fails a quotation in a sentence that cites no claim, or only a claim that does not exist', () => {
    expect(failuresAfter((g) => (quoteSentence(g).claimIds = [])).map((failure) => failure.code)).toEqual([
      'G5_QUOTE_NOT_VERBATIM',
    ]);
    expect(failuresAfter((g) => (quoteSentence(g).claimIds = ['c-999'])).map((failure) => failure.code)).toEqual([
      'G5_QUOTE_NOT_VERBATIM',
    ]);
  });

  it('fails once for each bad quotation in a sentence and not twice for the same one', () => {
    const failures = failuresAfter((g) => {
      quoteSentence(g).text = 'He said "first bad" then "went from pilot" then "second bad" then "first bad".';
    });
    expect(failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['first bad', 'second bad']);
  });
});

describe('G5: which sentences it reads', () => {
  const BAD = 'He said "an invented quotation".';

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[3]!, 'takeaways, sentence 4'],
    ['a section sentence', (g: GateInput) => g.draft.sections[2]!.paragraphs[0]![1]!, 'section "What the filing shows", sentence 2'],
    ['an analysis sentence', (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis'), 'section "What the customer reports", sentence 6'],
  ])('reads %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => {
      pick(g).text = BAD;
    });
    expect(failures.map((failure) => [failure.code, failure.where])).toEqual([['G5_QUOTE_NOT_VERBATIM', where]]);
  });

  it('does not read limitation sentences, which come from templates', () => {
    expect(failuresAfter((g) => (g.draft.limitations[0]!.text = BAD))).toEqual([]);
  });
});
