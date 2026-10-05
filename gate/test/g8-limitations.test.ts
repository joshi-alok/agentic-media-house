import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG8 } from '../src/checks/g8-limitations';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';

const run = (change: (copy: GateInput) => void): CheckOutput => checkG8(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

/** The first golden limitation sentence: the datasheet note for c-8, the payload. */
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT = "The 12 kilograms payload figure comes from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';

/** Point a limitation sentence at these claim ids, whatever the type says about how many there may be. */
const cites = (sentence: LimitationSentence, ids: string[]) => {
  (sentence as { claimIds: string[] }).claimIds = ids;
};

describe('G8: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG8(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('has limitation sentences for the check to read, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(new Set(limitations.map((sentence) => sentence.template))).toEqual(new Set(['basis', 'status']));
  });

  it('is the eighth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[7]).toBe(checkG8);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG8(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });

  it('passes a piece with no limitation sentences, which G2 reports when one is needed', () => {
    expect(run((g) => (g.draft.limitations = []))).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = first(g)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = first(g)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = first(g)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[2] = first(g)), 'takeaways, sentence 3'],
    ['a section', (g: GateInput) => (g.draft.sections[1]!.paragraphs[2]![0] = first(g)), 'section "What the customer reports", sentence 8'],
  ])('fails a limitation sentence in %s, even if its text is right', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_PLACEMENT',
        message: `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = first(g);
      g.draft.takeaways[0] = first(g);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'takeaways, sentence 1']);
  });
});

describe('G8_LIMITATION_CLAIMS', () => {
  it('fails a limitation sentence that cites a claim which does not exist', () => {
    const output = run((g) => cites(first(g), ['c-999']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} cites c-999, which is not one of this piece's claims`,
        where: FIRST_AT,
      },
    ]);
  });

  it.each([
    ['no claim', [] as string[], 'none'],
    ['two claims', ['c-8', 'c-9'], '2'],
  ])('fails a limitation sentence that cites %s', (_name, ids, count) => {
    const output = run((g) => cites(first(g), ids));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} must cite exactly one claim; it cites ${count}`,
        where: FIRST_AT,
      },
    ]);
  });

  it('does not also report a mismatch when there is no claim to render the template from', () => {
    expect(codes(run((g) => cites(first(g), ['c-999'])))).toEqual(['G8_LIMITATION_CLAIMS']);
  });

  it('also reads a limitation sentence in the wrong place', () => {
    const output = run((g) => {
      cites(first(g), ['c-999']);
      g.draft.opening[0] = first(g);
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G8_LIMITATION_PLACEMENT', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', FIRST_AT],
    ]);
  });
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
    const output = run((g) => {
      first(g).text = 'The payload figure is exact.';
    });
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8; it must read: "${FIRST_TEXT}"`,
        where: FIRST_AT,
      },
    ]);
  });

  it('compares the text exactly: one changed word, an extra space or a missing full stop fails', () => {
    for (const text of [
      FIRST_TEXT.replace('available', 'obtainable'),
      FIRST_TEXT.replace('payload', 'payload  '),
      FIRST_TEXT.replace(/\.$/, ''),
      `${FIRST_TEXT} `,
      FIRST_TEXT.toLowerCase(),
    ]) {
      expect(codes(run((g) => (first(g).text = text))), text).toEqual(['G8_LIMITATION_MISMATCH']);
    }
  });

  it('fails the right text under the wrong template', () => {
    // The text is the basis sentence for c-8; the status template renders something else.
    const output = run((g) => {
      first(g).template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} does not match the status template for c-8; it must read: "The source does not say whether the payload has been demonstrated or deployed."`,
    ]);
  });

  it('fails the right text under the wrong claim', () => {
    expect(codes(run((g) => cites(first(g), ['c-9'])))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it.each([
    ['c-8', 'basis', 'briefing'],
    ['c-8', 'basis', 'filing'],
    ['c-5', 'status', 'deployed'],
    ['c-27', 'status', 'planned'],
  ])('fails when the metadata of %s is changed after the sentence was written: %s becomes %s', (id, field, value) => {
    const output = run((g) => {
      Object.assign(claimById(g.claims, id), { [field]: value });
    });
    expect(output.failures.map((failure) => failure.code)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails when the claim\'s label or figure is changed', () => {
    expect(codes(run((g) => (claimById(g.claims, 'c-8').label = 'rated load')))).toEqual(['G8_LIMITATION_MISMATCH']);
    expect(codes(run((g) => (claimById(g.claims, 'c-8').values[0]!.raw = '14 kilograms')))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('reports each mismatched sentence', () => {
    const output = run((g) => {
      g.draft.limitations[0]!.text = 'Wrong.';
      g.draft.limitations[3]!.text = 'Also wrong.';
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['limitations, sentence 1', 'limitations, sentence 4']);
  });
});

describe('what G8 does not read', () => {
  it('ignores fact and analysis sentences, even ones that read like a limitation', () => {
    const output = run((g) => {
      g.draft.opening[0] = { kind: 'fact', text: FIRST_TEXT, claimIds: ['c-8'] };
      g.draft.takeaways[0] = { kind: 'analysis', text: 'The note is not a template sentence.', claimIds: [] };
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
