import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { correctionsFor, getDeskState, parseDeskState } from '../src/lib/desk-state';

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
