import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentFolder, fixturesEnabled } from '../src/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fixturesEnabled', () => {
  it('is off when ROBYWIRE_FIXTURES is not set', () => {
    expect(fixturesEnabled({})).toBe(false);
  });

  it('is on only for the exact value 1', () => {
    expect(fixturesEnabled({ ROBYWIRE_FIXTURES: '1' })).toBe(true);
    for (const value of ['0', '', 'true', 'yes', ' 1', '1 ', '11']) {
      expect(fixturesEnabled({ ROBYWIRE_FIXTURES: value }), JSON.stringify(value)).toBe(false);
    }
  });

  it('reads the process environment when it is given none', () => {
    vi.stubEnv('ROBYWIRE_FIXTURES', '1');
    expect(fixturesEnabled()).toBe(true);
    vi.stubEnv('ROBYWIRE_FIXTURES', '0');
    expect(fixturesEnabled()).toBe(false);
  });
});

describe('contentFolder', () => {
  it('is content/ for a production build and content-fixtures/ for a fixture build', () => {
    expect(contentFolder(false)).toBe('content');
    expect(contentFolder(true)).toBe('content-fixtures');
  });
});
