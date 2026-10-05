import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG3 } from '../src/checks/g3-coverage';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import { allSentences, findSentence, mutate } from './helpers';

const failuresAfter = (change: (copy: GateInput) => void): Failure[] =>
  checkG3(mutate(cloneGolden(), change), defaultContext()).failures;

const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);

describe('G3: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG3(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the third check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[2]).toBe(checkG3);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG3(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G3_NO_CLAIM', () => {
  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[2]!, 'takeaways, sentence 3'],
    ['a section sentence', (g: GateInput) => g.draft.sections[0]!.paragraphs[1]![0]!, 'section "What shipped", sentence 5'],
    ['a sentence in a later section', (g: GateInput) => g.draft.sections[2]!.paragraphs[1]![1]!, 'section "What the filing shows", sentence 5'],
  ])('fails for a fact sentence with no claim in %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => (pick(g).claimIds = []));
    expect(summary(failures)).toEqual([['G3_NO_CLAIM', where]]);
    expect(failures[0]?.check).toBe('G3');
    expect(failures[0]?.message).toContain(where);
  });

  it('does not ask an analysis sentence for a claim', () => {
    const failures = failuresAfter((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').claimIds = [];
    });
    expect(failures).toEqual([]);
  });

  it('leaves a limitation sentence with no claim to G8', () => {
    const failures = failuresAfter((g) => {
      (g.draft.limitations[0] as { claimIds: string[] }).claimIds = [];
    });
    expect(failures).toEqual([]);
  });

  it('reports every uncited fact sentence, in document order', () => {
    const failures = failuresAfter((g) => {
      g.draft.sections[1]!.paragraphs[0]![0]!.claimIds = [];
      g.draft.title.claimIds = [];
      g.draft.takeaways[0]!.claimIds = [];
    });
    expect(summary(failures)).toEqual([
      ['G3_NO_CLAIM', 'title'],
      ['G3_NO_CLAIM', 'takeaways, sentence 1'],
      ['G3_NO_CLAIM', 'section "What the customer reports", sentence 1'],
    ]);
  });
});

describe('G3_UNKNOWN_CLAIM', () => {
  it.each([
    ['a fact sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['an analysis sentence', (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis'), 'section "What the customer reports", sentence 6'],
    ['a limitation sentence', (g: GateInput) => g.draft.limitations[3]!, 'limitations, sentence 4'],
  ])('fails for an id that is not a claim in %s', (_name, pick, where) => {
    const failures = failuresAfter((g) => {
      (pick(g).claimIds as string[]).push('c-999');
    });
    expect(summary(failures)).toEqual([['G3_UNKNOWN_CLAIM', where]]);
    expect(failures[0]?.message).toContain('c-999');
    expect(failures[0]?.message).toContain(where);
  });

  it('fails once for each unknown id, but not twice for the same id', () => {
    const failures = failuresAfter((g) => {
      g.draft.opening[0]!.claimIds = ['c-1', 'c-998', 'c-999', 'c-999'];
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G3_UNKNOWN_CLAIM', 'G3_UNKNOWN_CLAIM']);
    expect(failures.map((failure) => failure.message.match(/c-\d+/)?.[0])).toEqual(['c-998', 'c-999']);
  });

  it('does not also report a missing claim when the only id is unknown', () => {
    expect(summary(failuresAfter((g) => (g.draft.opening[0]!.claimIds = ['c-999'])))).toEqual([
      ['G3_UNKNOWN_CLAIM', 'opening, sentence 1'],
    ]);
  });

  it('treats every citation of a claim that is missing from the list as unknown', () => {
    const input = cloneGolden();
    const citing = allSentences(input.draft).filter((item) => item.sentence.claimIds.includes('c-1'));
    const failures = failuresAfter((g) => {
      g.claims = g.claims.filter((claim) => claim.id !== 'c-1');
    });
    expect(citing.length).toBeGreaterThan(3);
    expect(failures).toHaveLength(citing.length);
    expect(new Set(failures.map((failure) => failure.code))).toEqual(new Set(['G3_UNKNOWN_CLAIM']));
  });
});
