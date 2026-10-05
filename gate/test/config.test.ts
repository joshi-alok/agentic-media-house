import { describe, expect, it } from 'vitest';
import { DEFAULT_BANNED_PHRASES, DEFAULT_NAME_ALLOW_LIST, defaultConfig, defaultContext } from '../src/config';

describe('defaultConfig', () => {
  it('holds the thresholds from the design spec', () => {
    expect(defaultConfig()).toEqual({
      analysisShareCap: 0.2,
      openingWords: { min: 40, max: 60 },
      takeaways: { min: 3, max: 5 },
      bodyWords: { min: 600, max: 850 },
      descriptionMax: 155,
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
      bannedPhrases: DEFAULT_BANNED_PHRASES,
    });
  });

  it('returns a new object each time, so one caller cannot change another caller defaults', () => {
    const first = defaultConfig();
    first.openingWords.min = 1;
    first.descriptionMax = 1;
    expect(defaultConfig().openingWords.min).toBe(40);
    expect(defaultConfig().descriptionMax).toBe(155);
  });
});

describe('DEFAULT_BANNED_PHRASES', () => {
  it.each([
    "in today's fast-moving world of robotics",
    'game-changer',
    'game changer',
    'revolutionary',
    'groundbreaking',
    'unprecedented',
    'cutting-edge',
    'ever-evolving',
    'delve',
    "it's worth noting",
    'in the realm of',
    'paves the way',
  ])('bans %j', (phrase) => {
    expect(DEFAULT_BANNED_PHRASES).toContain(phrase);
  });

  it('is written in lowercase with plain apostrophes, ready to compare against lowercased text', () => {
    for (const phrase of DEFAULT_BANNED_PHRASES) {
      expect(phrase, phrase).toBe(phrase.toLowerCase());
      expect(phrase, phrase).not.toMatch(/[^\x20-\x7E]/);
    }
  });
});

describe('DEFAULT_NAME_ALLOW_LIST', () => {
  it('allows the twelve month names and the seven weekday names', () => {
    for (const word of [
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ]) {
      expect(DEFAULT_NAME_ALLOW_LIST.has(word), word).toBe(true);
    }
  });

  it('allows the common acronyms', () => {
    for (const word of ['ai', 'ceo', 'cto', 'us', 'uk', 'eu', 'un']) {
      expect(DEFAULT_NAME_ALLOW_LIST.has(word), word).toBe(true);
    }
  });

  it('does not allow a company or product name', () => {
    expect(DEFAULT_NAME_ALLOW_LIST.has('fixture')).toBe(false);
    expect(DEFAULT_NAME_ALLOW_LIST.has('fx-1')).toBe(false);
  });

  it('is entirely lowercase', () => {
    for (const word of DEFAULT_NAME_ALLOW_LIST) {
      expect(word, word).toBe(word.toLowerCase());
    }
  });
});

describe('defaultContext', () => {
  it('starts with the default config, no published slugs, no recent titles and the default allow-list', () => {
    const ctx = defaultContext();
    expect(ctx.config).toEqual(defaultConfig());
    expect(ctx.publishedSlugs.size).toBe(0);
    expect(ctx.recentTitles).toEqual([]);
    expect([...ctx.nameAllowList].sort()).toEqual([...DEFAULT_NAME_ALLOW_LIST].sort());
  });

  it('merges config overrides over the defaults', () => {
    const ctx = defaultContext({ config: { descriptionMax: 100, analysisShareCap: 0.5 } });
    expect(ctx.config.descriptionMax).toBe(100);
    expect(ctx.config.analysisShareCap).toBe(0.5);
    expect(ctx.config.spanMax).toBe(300);
    expect(ctx.config.openingWords).toEqual({ min: 40, max: 60 });
  });

  it('accepts published slugs as any iterable and recent titles as an array', () => {
    const ctx = defaultContext({
      publishedSlugs: ['fixture-robotics-ships-fx-1'],
      recentTitles: ['An earlier title'],
    });
    expect(ctx.publishedSlugs.has('fixture-robotics-ships-fx-1')).toBe(true);
    expect(ctx.recentTitles).toEqual(['An earlier title']);
  });

  it('replaces the allow-list when one is given, and lowercases its words', () => {
    const ctx = defaultContext({ nameAllowList: ['Brindle', 'ACME'] });
    expect([...ctx.nameAllowList].sort()).toEqual(['acme', 'brindle']);
  });

  it('returns a new context each time, so tests cannot leak into each other', () => {
    (defaultContext().nameAllowList as Set<string>).add('leak');
    (defaultContext().publishedSlugs as Set<string>).add('leak');
    defaultContext().config.openingWords.max = 1;
    expect(defaultContext().nameAllowList.has('leak')).toBe(false);
    expect(defaultContext().publishedSlugs.has('leak')).toBe(false);
    expect(defaultContext().config.openingWords.max).toBe(60);
  });
});
