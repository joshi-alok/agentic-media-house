import { describe, expect, it } from 'vitest';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { allSentences, claimById, findSentence, mutate } from './helpers';

describe('mutate', () => {
  it('applies the change to a copy and returns it', () => {
    const base = cloneGolden();
    const result = mutate(base, (copy) => {
      copy.draft.title.text = 'A different title';
      copy.claims.pop();
    });
    expect(result.draft.title.text).toBe('A different title');
    expect(result.claims).toHaveLength(base.claims.length - 1);
  });

  it('leaves the base unchanged', () => {
    const base = cloneGolden();
    mutate(base, (copy) => {
      copy.draft.title.text = 'A different title';
      copy.draft.sections[0]!.heading = 'Changed';
      copy.claims[0]!.values.length = 0;
    });
    expect(base).toEqual(cloneGolden());
  });

  it('returns a copy that shares nothing with the base', () => {
    const base = cloneGolden();
    const result = mutate(base, () => {});
    expect(result).toEqual(base);
    expect(result.draft).not.toBe(base.draft);
    expect(result.claims[0]).not.toBe(base.claims[0]);
  });

  it('accepts the frozen originals as a base and still returns something that can be changed', () => {
    const result = mutate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, (copy) => {
      copy.draft.slug = 'changed';
    });
    expect(result.draft.slug).toBe('changed');
    expect(GOLDEN_DRAFT.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
  });
});

describe('allSentences', () => {
  it('is the document-order list from the gate sources', () => {
    expect(allSentences(GOLDEN_DRAFT)[0]?.sentence).toBe(GOLDEN_DRAFT.title);
  });
});

describe('findSentence', () => {
  it('finds the first sentence that matches, in document order', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (sentence) => sentence.text.includes('Fixture Robotics'));
    expect(found).toBe(draft.title);
  });

  it('can tell where a sentence is from its location', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (_sentence, located) => located.section === 'takeaways');
    expect(found).toBe(draft.takeaways[0]);
    const limitation = findSentence(draft, (sentence) => sentence.kind === 'limitation');
    expect(limitation).toBe(draft.limitations[0]);
  });

  it('returns the sentence inside the draft, so changing it changes the draft', () => {
    const { draft } = cloneGolden();
    const found = findSentence(draft, (sentence) => sentence.kind === 'analysis');
    found.text = 'Changed analysis.';
    expect(draft.sections[1]?.paragraphs[1]?.[1]?.text).toBe('Changed analysis.');
  });

  it('throws when nothing matches', () => {
    const { draft } = cloneGolden();
    expect(() => findSentence(draft, (sentence) => sentence.text === 'no such sentence')).toThrow(
      'no sentence in the draft matches',
    );
  });
});

describe('claimById', () => {
  it('returns the claim with that id', () => {
    expect(claimById(GOLDEN_CLAIMS, 'c-8').label).toBe('payload');
  });

  it('throws for an id that does not exist', () => {
    expect(() => claimById(GOLDEN_CLAIMS, 'c-999')).toThrow('no claim with id c-999');
  });
});
