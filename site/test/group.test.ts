import { describe, expect, it } from 'vitest';
import { firstBeat, groupByBeat, piecesIn } from '../src/lib/group';

const piece = (slug: string, ...categories: string[]) => ({ slug, data: { categories } });

describe('firstBeat', () => {
  it('is the first category that is a beat', () => {
    expect(firstBeat(['humanoids', 'funding'])).toBe('humanoids');
    expect(firstBeat(['funding', 'field-mobility'])).toBe('field-mobility');
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
    const a = piece('a', 'policy-standards');
    const b = piece('b', 'humanoids');
    const c = piece('c', 'policy-standards', 'funding');
    const d = piece('d', 'funding', 'humanoids');
    expect(groupByBeat([a, b, c, d])).toEqual([
      { beat: 'humanoids', pieces: [b, d] },
      { beat: 'policy-standards', pieces: [a, c] },
    ]);
  });

  it('leaves out beats that have no piece', () => {
    expect(groupByBeat([piece('a', 'humanoids')]).map((group) => group.beat)).toEqual(['humanoids']);
  });

  it('files a piece under its first beat only, not under its other beats', () => {
    const groups = groupByBeat([piece('a', 'humanoids', 'field-mobility')]);
    expect(groups).toHaveLength(1);
  });

  it('throws, naming the piece, when a piece has no beat', () => {
    expect(() => groupByBeat([piece('only-funding', 'funding')])).toThrow('groupByBeat: the piece "only-funding" has no beat among its categories');
  });
});

describe('piecesIn', () => {
  const a = piece('a', 'humanoids', 'funding');
  const b = piece('b', 'field-mobility');
  const c = piece('c', 'funding', 'field-mobility');

  it('lists the pieces that have the topic among their categories, in the order given', () => {
    expect(piecesIn([a, b, c], 'funding')).toEqual([a, c]);
    expect(piecesIn([a, b, c], 'field-mobility')).toEqual([b, c]);
  });

  it('is empty when no piece has the topic', () => {
    expect(piecesIn([a, b, c], 'policy-standards')).toEqual([]);
    expect(piecesIn([], 'humanoids')).toEqual([]);
  });
});
