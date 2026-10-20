import { describe, expect, it } from 'vitest';
import { defaultConfig, defaultContext, runGate } from '../src';
import { cloneGolden } from '../src/fixtures';
import { PROFILES, PROFILE_IDS, isProfileId, profileOverrides } from '../src/profiles';

describe('PROFILES', () => {
  it('has a profile for each id, in order', () => {
    expect(Object.keys(PROFILES)).toEqual([...PROFILE_IDS]);
    expect([...PROFILE_IDS]).toEqual(['brief', 'digest', 'explainer']);
  });

  it.each(PROFILE_IDS.map((id) => [id] as const))('%s has ranges whose minimum is not above their maximum', (id) => {
    const profile = PROFILES[id];
    for (const range of [profile.openingWords, profile.takeaways, profile.bodyWords]) expect(range.min).toBeLessThanOrEqual(range.max);
    expect(profile.analysisShareCap).toBeGreaterThan(0);
    expect(profile.analysisShareCap).toBeLessThanOrEqual(1);
  });

  it('asks for no takeaways of a digest, and for three to five of an explainer', () => {
    expect(PROFILES.digest.takeaways).toEqual({ min: 0, max: 0 });
    expect(PROFILES.explainer.takeaways).toEqual({ min: 3, max: 5 });
  });

  it('does not change the default thresholds of the gate', () => {
    expect(defaultConfig().bodyWords).toEqual({ min: 600, max: 850 });
    expect(defaultConfig().analysisShareCap).toBe(0.2);
  });
});

describe('profileOverrides', () => {
  it('gives a fresh copy each time, so no caller can change the profile', () => {
    const first = profileOverrides('digest');
    first.bodyWords.max = 1;
    expect(profileOverrides('digest').bodyWords.max).toBe(500);
  });

  it('puts the ranges of the profile into the context of the gate and leaves the rest as it is', () => {
    const ctx = defaultContext({ config: profileOverrides('explainer') });
    expect(ctx.config.bodyWords).toEqual({ min: 500, max: 1400 });
    expect(ctx.config.descriptionMax).toBe(defaultConfig().descriptionMax);
  });

  it('holds the golden piece to the range of its profile as a note, and never as a blocker', () => {
    const codes = (id: 'brief' | 'digest' | 'explainer') => {
      const result = runGate(cloneGolden(), defaultContext({ config: profileOverrides(id) }));
      expect(result.failures).toEqual([]);
      expect(result.route).toBe('publish');
      return new Set(result.warnings.map((note) => note.code));
    };
    expect(codes('brief')).toEqual(new Set(['G2_BODY_LENGTH']));
    expect(codes('digest')).toEqual(new Set(['G2_BODY_LENGTH', 'G2_TAKEAWAYS_COUNT']));
    expect(codes('explainer')).toEqual(new Set());
  });
});

describe('isProfileId', () => {
  it('knows the three ids and nothing else', () => {
    expect(isProfileId('brief')).toBe(true);
    expect(isProfileId('news')).toBe(false);
    expect(isProfileId('')).toBe(false);
  });
});
