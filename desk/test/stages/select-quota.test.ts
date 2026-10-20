import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { emptyPublished } from '../../src/stages/context';
import { shortlistOf } from '../../src/stages/select';
import { RUN_DATE, candidate } from '../support/candidates';

const ctx = (overrides: Partial<ReturnType<typeof defaultConfig>> = {}) => ({ date: RUN_DATE, config: { ...defaultConfig(), ...overrides }, published: emptyPublished() });
const from = (outlet: string, n: number) =>
  candidate({ url: `https://${outlet.toLowerCase().replace(/\W/g, '')}.example/p/${n}`, title: `${outlet} story ${n} about agents`, outlet, tier: 1, origin: 'feed', beats: ['protocols-standards'], publishedAt: `2026-10-04T0${9 - n}:00:00.000Z` });

describe('shortlistOf: the share of one source', () => {
  it('takes at most shortlistPerSource stories from one source, the newest first, and then the others', () => {
    const noisy = [1, 2, 3, 4, 5].map((n) => from('arXiv', n));
    const quiet = [from('Ethereum Research', 1)];
    const list = shortlistOf([...noisy, ...quiet], ctx({ shortlistPerSource: 2 }));
    // Newest first; the two stories of 08:00 keep the order in which they were found, and the third arXiv story is over the share.
    expect(list.map((item) => item.title)).toEqual(['arXiv story 1 about agents', 'Ethereum Research story 1 about agents', 'arXiv story 2 about agents']);
  });

  it('still stops at shortlistMax', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((outlet) => [1, 2].map((n) => from(outlet, n)));
    expect(shortlistOf(many, ctx({ shortlistPerSource: 2, shortlistMax: 5 }))).toHaveLength(5);
  });

  it('does not let a story that is over the share of its source use a place of the shortlist', () => {
    const list = shortlistOf([1, 2, 3, 4, 5].map((n) => from('A', n)).concat([from('B', 1), from('C', 1)]), ctx({ shortlistPerSource: 2, shortlistMax: 4 }));
    expect(list.map((item) => item.title)).toEqual(['A story 1 about agents', 'B story 1 about agents', 'C story 1 about agents', 'A story 2 about agents']);
  });

  it('has 3 by default', () => {
    expect(defaultConfig().shortlistPerSource).toBe(3);
  });
});
