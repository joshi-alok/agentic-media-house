import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionDay, correctionsFor, getDeskState, latestCorrectionDay, newestFirst, parseDeskState } from '../src/lib/desk-state';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';

const correction = (at: string, slug: string, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: `note ${at}` });

describe('parseDeskState', () => {
  it('accepts the empty state', () => {
    expect(parseDeskState(EMPTY)).toEqual(EMPTY);
  });

  it('rejects a state that does not match the schema, naming the problem', () => {
    expect(() => parseDeskState({ lastRun: null, holds: [{ at: 'yesterday', categories: [], reasons: [] }], corrections: [] })).toThrow('at');
    expect(() => parseDeskState({ lastRun: null, holds: [] })).toThrow('corrections');
    expect(() => parseDeskState(null)).toThrow();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getDeskState', () => {
  it('reads the production state when fixtures are off: nothing has run, nothing is held', async () => {
    expect(await getDeskState(false)).toEqual(EMPTY);
  });

  it('reads the fixture state when fixtures are on', async () => {
    const state = await getDeskState(true);
    const file = JSON.parse(readFileSync(new URL('../src/content-fixtures/desk-state.json', import.meta.url), 'utf8')) as unknown;
    expect(state).toEqual(parseDeskState(file));
    expect(state.lastRun?.outcome).toBe('published');
    expect(state.corrections).toHaveLength(1);
  });

  it('follows the build mode when it is not told which to read', async () => {
    vi.stubEnv('ROBYWIRE_FIXTURES', '1');
    vi.resetModules();
    const inFixtureMode = await import('../src/lib/desk-state');
    expect((await inFixtureMode.getDeskState()).lastRun?.outcome).toBe('published');

    vi.stubEnv('ROBYWIRE_FIXTURES', '');
    vi.resetModules();
    const inProductionMode = await import('../src/lib/desk-state');
    expect((await inProductionMode.getDeskState()).lastRun).toBeNull();
  });
});

describe('correctionsFor', () => {
  const state: DeskState = {
    ...EMPTY,
    corrections: [
      correction('2026-10-02T08:00:00Z', FX2),
      correction('2026-10-03T09:12:00Z', 'other-piece'),
      correction('2026-10-04T10:00:00Z', FX2, 'retraction'),
    ],
  };

  it('lists the entries for one slug, newest first', () => {
    expect(correctionsFor(state, FX2).map((entry) => [entry.at, entry.kind])).toEqual([
      ['2026-10-04T10:00:00Z', 'retraction'],
      ['2026-10-02T08:00:00Z', 'correction'],
    ]);
  });

  it('is empty for a slug with no entry', () => {
    expect(correctionsFor(state, 'no-such-piece')).toEqual([]);
  });

  it('does not change the state it is given', () => {
    const before = structuredClone(state);
    correctionsFor(state, FX2);
    expect(state).toEqual(before);
  });
});

describe('newestFirst', () => {
  it('sorts by the moment, newest first', () => {
    const items = [{ at: '2026-10-01T00:00:00Z' }, { at: '2026-10-03T00:00:00Z' }, { at: '2026-10-02T00:00:00Z' }];
    expect(newestFirst(items).map((item) => item.at)).toEqual(['2026-10-03T00:00:00Z', '2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z']);
  });

  it('compares moments, not text: 04:30 at +05:30 is the evening before, in UTC', () => {
    const items = [{ at: '2026-10-02T04:30:00+05:30' }, { at: '2026-10-02T00:00:00Z' }];
    expect(newestFirst(items).map((item) => item.at)).toEqual(['2026-10-02T00:00:00Z', '2026-10-02T04:30:00+05:30']);
  });

  it('keeps the given order for entries at the same moment', () => {
    const items = [
      { at: '2026-10-02T00:00:00Z', n: 1 },
      { at: '2026-10-02T00:00:00Z', n: 2 },
      { at: '2026-10-02T00:00:00Z', n: 3 },
    ];
    expect(newestFirst(items).map((item) => item.n)).toEqual([1, 2, 3]);
  });

  it('returns a new array and leaves the given one alone', () => {
    const items = [{ at: '2026-10-01T00:00:00Z' }, { at: '2026-10-02T00:00:00Z' }];
    const sorted = newestFirst(items);
    expect(sorted).not.toBe(items);
    expect(items.map((item) => item.at)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
  });
});

describe('correctionDay', () => {
  it('is the UTC day of the moment', () => {
    expect(correctionDay('2026-10-03T09:12:00Z')).toBe('2026-10-03');
    expect(correctionDay('2026-10-03T23:59:59Z')).toBe('2026-10-03');
    expect(correctionDay('2026-10-04T00:00:00Z')).toBe('2026-10-04');
  });

  it('converts a time with an offset to UTC first: 01:30 at +05:30 is the day before', () => {
    expect(correctionDay('2026-10-04T01:30:00+05:30')).toBe('2026-10-03');
    expect(correctionDay('2026-10-03T22:30:00-05:00')).toBe('2026-10-04');
  });
});

describe('latestCorrectionDay', () => {
  const corrections = [
    correction('2026-10-02T08:00:00Z', FX2),
    correction('2026-10-04T10:00:00Z', FX2, 'retraction'),
    correction('2026-10-06T00:00:00Z', 'other-piece'),
    correction('2026-10-03T09:12:00Z', FX2),
  ];

  it('is the day of the latest correction or retraction of the piece, whatever their order', () => {
    expect(latestCorrectionDay(corrections, FX2)).toBe('2026-10-04');
    expect(latestCorrectionDay([...corrections].reverse(), FX2)).toBe('2026-10-04');
  });

  it('is undefined for a piece with no entry', () => {
    expect(latestCorrectionDay(corrections, 'no-such-piece')).toBeUndefined();
    expect(latestCorrectionDay([], FX2)).toBeUndefined();
  });

  it('compares moments, not text: the later moment wins even when its text sorts first', () => {
    const mixed = [correction('2026-10-04T01:30:00+05:30', FX2), correction('2026-10-03T21:00:00Z', FX2)];
    expect(latestCorrectionDay(mixed, FX2)).toBe('2026-10-03');
  });
});
