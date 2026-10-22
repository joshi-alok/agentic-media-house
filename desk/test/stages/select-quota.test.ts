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

  it('cuts the list after it is put in order and after the share is applied: the oldest story of a source over its share goes, and another source still has its place', () => {
    const at = (outlet: string, time: string) =>
      candidate({ url: `https://${outlet.toLowerCase()}.example/${time.replace(':', '')}`, title: `${outlet} at ${time}`, outlet, tier: 1, origin: 'feed', beats: ['protocols-standards'], publishedAt: `${RUN_DATE}T${time}:00.000Z` });
    // Found in this order: A at 06:00, A at 07:00, A at 08:00, B at 05:00. Newest first: A 08:00, A 07:00, A 06:00, B 05:00.
    // Of source A, two stories are the share, so A at 06:00 is over it and B at 05:00 takes the third place.
    const found = [at('A', '06:00'), at('A', '07:00'), at('A', '08:00'), at('B', '05:00')];
    expect(shortlistOf(found, ctx({ shortlistPerSource: 2, shortlistMax: 3 })).map((item) => item.title)).toEqual(['A at 08:00', 'A at 07:00', 'B at 05:00']);
  });

  it('has 3 by default', () => {
    expect(defaultConfig().shortlistPerSource).toBe(3);
  });
});
