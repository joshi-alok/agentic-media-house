import { describe, expect, it } from 'vitest';
import { firstBeat, groupByBeat, piecesIn } from '../src/lib/group';

const piece = (slug: string, ...categories: string[]) => ({ slug, data: { categories } });

describe('firstBeat', () => {
  it('is the first category that is a beat', () => {
    expect(firstBeat(['payments-commerce', 'funding'])).toBe('payments-commerce');
    expect(firstBeat(['funding', 'identity-trust'])).toBe('identity-trust');
  });

  it('is undefined when there is no beat among the categories', () => {
    expect(firstBeat(['funding'])).toBeUndefined();
    expect(firstBeat([])).toBeUndefined();
  });
});

describe('groupByBeat', () => {
  it('is empty for no pieces', () => {
    expect(groupByBeat([])).toEqual([]);
  });

  it('groups pieces by their first beat, in the order of the beats, and keeps each group in the order given', () => {
    const a = piece('a', 'policy-regulation');
    const b = piece('b', 'payments-commerce');
    const c = piece('c', 'policy-regulation', 'funding');
    const d = piece('d', 'funding', 'payments-commerce');
    expect(groupByBeat([a, b, c, d])).toEqual([
      { beat: 'payments-commerce', pieces: [b, d] },
      { beat: 'policy-regulation', pieces: [a, c] },
    ]);
  });

  it('leaves out beats that have no piece', () => {
    expect(groupByBeat([piece('a', 'payments-commerce')]).map((group) => group.beat)).toEqual(['payments-commerce']);
  });

  it('files a piece under its first beat only, not under its other beats', () => {
    const groups = groupByBeat([piece('a', 'payments-commerce', 'identity-trust')]);
    expect(groups).toHaveLength(1);
  });

  it('throws, naming the piece, when a piece has no beat', () => {
    expect(() => groupByBeat([piece('only-funding', 'funding')])).toThrow('groupByBeat: the piece "only-funding" has no beat among its categories');
  });
});

describe('piecesIn', () => {
  const a = piece('a', 'payments-commerce', 'funding');
  const b = piece('b', 'identity-trust');
  const c = piece('c', 'funding', 'identity-trust');

  it('lists the pieces that have the topic among their categories, in the order given', () => {
    expect(piecesIn([a, b, c], 'funding')).toEqual([a, c]);
    expect(piecesIn([a, b, c], 'identity-trust')).toEqual([b, c]);
  });

  it('is empty when no piece has the topic', () => {
    expect(piecesIn([a, b, c], 'policy-regulation')).toEqual([]);
    expect(piecesIn([], 'payments-commerce')).toEqual([]);
  });
});
