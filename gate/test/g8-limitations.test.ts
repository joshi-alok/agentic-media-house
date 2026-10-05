import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG8 } from '../src/checks/g8-limitations';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { renderLimitation } from '../src/limitations';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';

const run = (change: (copy: GateInput) => void): CheckOutput => checkG8(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

// The golden piece has five limitation sentences, one for each group of claims:
//   1  basis    datasheet      c-8 to c-15, eight claims
//   2  basis    press-release  c-1 to c-7 and c-22 to c-26, twelve claims
//   3  basis    demo           c-27 and c-28
//   4  status   demonstrated   c-27 and c-28
//   5  status   planned        c-5, c-6, c-7, c-25 and c-26
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT =
  "The 12 kilograms payload, 1.4 metres reach, 2.3 metres per second top speed, 0.05 mm repeatability, 1.2k pick rate, 38 kg arm mass, 650 W power draw and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';
const FIRST_IDS = ['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15'];

/** Point a limitation sentence at these claim ids. */
const cites = (sentence: LimitationSentence, ids: string[]) => {
  sentence.claimIds = ids;
};

describe('G8: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG8(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('has five limitation sentences, one for each group of claims, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations).toHaveLength(5);
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(limitations[0]?.claimIds).toEqual(FIRST_IDS);
    expect(limitations.map((sentence) => [sentence.template, sentence.claimIds.length])).toEqual([
      ['basis', 8],
      ['basis', 12],
      ['basis', 2],
      ['status', 2],
      ['status', 5],
    ]);
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

  it('passes a sentence for one claim, written with the singular template', () => {
    const output = run((g) => {
      g.draft.limitations = [
        {
          kind: 'limitation',
          text: "The 12 kilograms payload figure comes from the company's datasheet; no independent measurement was available.",
          claimIds: ['c-8'],
          template: 'basis',
        },
      ];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = first(g)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = first(g)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = first(g)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[2] = first(g)), 'takeaways, sentence 3'],
    ['a section', (g: GateInput) => (g.draft.sections[1]!.paragraphs[2]![0] = first(g)), 'section "What the customer reports", sentence 9'],
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
  it('fails a limitation sentence that cites a claim which does not exist, and names it', () => {
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

  it('names every unknown claim, even when the other claims it cites are real', () => {
    const output = run((g) => cites(first(g), ['c-8', 'c-998', 'c-999']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} cites c-998 and c-999, which are not claims of this piece`,
    ]);
  });

  it('fails a limitation sentence that cites no claim', () => {
    const output = run((g) => cites(first(g), []));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} cites no claim: it must cite the claims it describes`,
        where: FIRST_AT,
      },
    ]);
  });

  it('fails a limitation sentence that cites a claim twice', () => {
    const output = run((g) => cites(first(g), ['c-8', 'c-8', 'c-9']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} cites c-8 more than once: cite each claim once`,
    ]);
  });

  it('fails a limitation sentence that lists its claims out of order, by the number in the id', () => {
    const output = run((g) => cites(first(g), ['c-9', 'c-8']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} lists c-8 after c-9: list the claims in ascending order of claim number`,
    ]);
  });

  it('orders by number and not as text: c-9 comes before c-10', () => {
    expect(codes(run((g) => cites(first(g), ['c-10', 'c-9'])))).toEqual(['G8_LIMITATION_CLAIMS']);
    const ordered = run((g) => {
      const sentence = first(g);
      cites(sentence, ['c-9', 'c-10']);
      sentence.text = renderLimitation([claimById(g.claims, 'c-9'), claimById(g.claims, 'c-10')], 'basis');
    });
    expect(ordered).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports one failure for a sentence, for the first problem it has', () => {
    expect(codes(run((g) => cites(first(g), ['c-999', 'c-999', 'c-8'])))).toEqual(['G8_LIMITATION_CLAIMS']);
  });

  it('does not also report a group or a mismatch when there is no usable list of claims', () => {
    for (const ids of [['c-999'], [], ['c-8', 'c-8'], ['c-9', 'c-8']]) {
      expect(codes(run((g) => cites(first(g), ids))), ids.join()).toEqual(['G8_LIMITATION_CLAIMS']);
    }
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

describe('G8_LIMITATION_GROUP', () => {
  it('fails a basis sentence whose claims do not share one basis, and says which', () => {
    const output = run((g) => cites(first(g), ['c-1', 'c-8']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: `the limitation sentence at ${FIRST_AT} groups claims with different bases (c-1: press-release, c-8: datasheet): a basis sentence covers claims that share one basis`,
        where: FIRST_AT,
      },
    ]);
  });

  it('fails a status sentence whose claims do not share one status, and says which', () => {
    const output = run((g) => cites(g.draft.limitations[4]!, ['c-5', 'c-27']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: 'the limitation sentence at limitations, sentence 5 groups claims with different statuses (c-5: planned, c-27: demonstrated): a status sentence covers claims that share one status',
        where: 'limitations, sentence 5',
      },
    ]);
  });

  it('checks the claims against the template of the sentence, not against each other only', () => {
    // c-8 to c-15 all have the status "unspecified", so they share a status: the group is fine under the status template, and the text is what is wrong.
    const output = run((g) => {
      first(g).template = 'status';
    });
    expect(codes(output)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('does not also report a mismatch for a mixed group', () => {
    expect(codes(run((g) => cites(first(g), ['c-1', 'c-8'])))).toEqual(['G8_LIMITATION_GROUP']);
  });

  it('fails when the metadata of one claim of a group is changed after the sentence was written', () => {
    expect(codes(run((g) => (claimById(g.claims, 'c-9').basis = 'briefing')))).toEqual(['G8_LIMITATION_GROUP']);
    expect(codes(run((g) => (claimById(g.claims, 'c-5').status = 'deployed')))).toEqual(['G8_LIMITATION_GROUP']);
  });

  it('reports each mixed group', () => {
    const output = run((g) => {
      cites(g.draft.limitations[0]!, ['c-1', 'c-8']);
      cites(g.draft.limitations[2]!, ['c-8', 'c-27']);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['limitations, sentence 1', 'limitations, sentence 3']);
  });
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
    const output = run((g) => {
      first(g).text = 'The payload figures are exact.';
    });
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8, c-9, c-10, c-11, c-12, c-13, c-14, c-15; it must read: "${FIRST_TEXT}"`,
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

  it('compares the plural: a group written with the singular words fails', () => {
    const singular = FIRST_TEXT.replace('figures come', 'figure comes');
    expect(codes(run((g) => (first(g).text = singular)))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails the right text under the wrong template', () => {
    // The text of sentence 3 (the demo basis) under the status template, over the same two claims.
    const output = run((g) => {
      g.draft.limitations[2]!.template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      'the limitation sentence at limitations, sentence 3 does not match the status template for c-27, c-28; it must read: "The trailer unloading and demo day were demonstrated; the source does not report them in commercial deployment."',
    ]);
  });

  it('fails the right text under other claims of the same basis', () => {
    expect(codes(run((g) => cites(first(g), ['c-8', 'c-9'])))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails when the metadata of every claim of a group is changed after the sentence was written', () => {
    const output = run((g) => {
      for (const id of FIRST_IDS) claimById(g.claims, id).basis = 'briefing';
    });
    expect(output.failures.map((failure) => failure.code)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it("fails when a claim's label or figure is changed", () => {
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

  it('does not ask whether the claims of a safe basis needed a sentence: a sentence about them is allowed', () => {
    const output = run((g) => {
      g.draft.limitations.push({
        kind: 'limitation',
        text: renderLimitation([claimById(g.claims, 'c-16'), claimById(g.claims, 'c-17')], 'basis'),
        claimIds: ['c-16', 'c-17'],
        template: 'basis',
      });
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
