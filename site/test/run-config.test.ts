import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROFILES, defaultConfig, profileOverrides } from '@robywire/gate';
import { analysisLimit } from '../src/lib/copy';
import { gateConfigOf, runGateConfig, runProfile, runRevisionRounds } from '../src/lib/run-config';
import { DEFAULT_EXTRA_REVISION_ROUNDS, DEFAULT_MAX_REVISION_ROUNDS } from '../src/lib/revision-defaults';
import { gateRules } from '../src/lib/method';

// The daily run writes explainers: desk.config.yml names the profile `explainer`, and the gate holds a piece to the ranges of that profile (as notes). The method page says what the gate
// requires, so it must state the ranges that the daily run uses, and not the defaults of the gate, which are those of no kind of piece that is written. The site does not copy the
// numbers: it reads the name of the profile from the settings of the daily run, and the numbers from the gate.

const SETTINGS = readFileSync(new URL('../../desk.config.yml', import.meta.url), 'utf8');
const rule = (id: string) => gateRules().find((item) => item.id === id)!;

describe('the profile of the daily run', () => {
  it('is the explainer: desk.config.yml says so, and the site reads it from there', () => {
    expect(SETTINGS).toMatch(/^profile: explainer$/m);
    expect(runProfile()).toBe('explainer');
  });

  it('is read from the text of the settings: the name it gives, none when it gives none, and an error for a name the gate does not have', () => {
    expect(runProfile('profile: digest\nrunDir: runs\n')).toBe('digest');
    expect(runProfile('runDir: runs\n')).toBeUndefined();
    expect(runProfile('')).toBeUndefined();
    expect(() => runProfile('profile: newsletter\n')).toThrow('desk.config.yml names the profile "newsletter", which the gate does not have');
    expect(() => runProfile('profile: 3\n')).toThrow('which the gate does not have');
  });
});

// The method page says how many times a draft is sent back for revision. That is the number of the daily run, so the site reads it from desk.config.yml: the rounds of revision
// (`maxRevisionRounds`, not in the file, so the default) and the rounds that follow them while a problem that a sentence can mend is still there (`extraRevisionRounds`, 2 in the
// file). The site does not depend on the Desk, so it holds the defaults of the two settings in one file of its own (the Desk's tests compare them with its defaults).
describe('the rounds of revision of the daily run', () => {
  // This number is written here on purpose: changing the rounds of the daily run changes what the method page says ("four"), and must be done with its sentences read again.
  it('are four: the two of the default and the two more that desk.config.yml sets', () => {
    expect(SETTINGS).toMatch(/^extraRevisionRounds: 2$/m);
    expect(SETTINGS).not.toMatch(/^maxRevisionRounds:/m);
    expect(DEFAULT_MAX_REVISION_ROUNDS).toBe(2);
    expect(runRevisionRounds()).toBe(4);
  });

  it('are read from the text of the settings over the defaults: what the file sets, and the default for what it leaves out', () => {
    expect(runRevisionRounds('')).toBe(DEFAULT_MAX_REVISION_ROUNDS + DEFAULT_EXTRA_REVISION_ROUNDS);
    expect(runRevisionRounds('runDir: runs\n')).toBe(3);
    expect(runRevisionRounds('extraRevisionRounds: 0\n')).toBe(2);
    expect(runRevisionRounds('extraRevisionRounds: 2\n')).toBe(4);
    expect(runRevisionRounds('maxRevisionRounds: 1\n')).toBe(2);
    expect(runRevisionRounds('maxRevisionRounds: 3\nextraRevisionRounds: 1\n')).toBe(4);
    expect(runRevisionRounds('maxRevisionRounds: 0\nextraRevisionRounds: 0\n')).toBe(0);
  });

  it('are an error when the file sets a number that is not a whole number of rounds, so that the site does not build a page about a run that cannot start', () => {
    for (const bad of ['-1', '1.5', '"2"', 'true', '[]']) {
      expect(() => runRevisionRounds(`extraRevisionRounds: ${bad}\n`)).toThrow('desk.config.yml sets extraRevisionRounds');
      expect(() => runRevisionRounds(`maxRevisionRounds: ${bad}\n`)).toThrow('desk.config.yml sets maxRevisionRounds');
    }
  });

  it('keep the defaults in a file that imports nothing, so that the tests of the Desk can compare them with its own', () => {
    const source = readFileSync(new URL('../src/lib/revision-defaults.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^import /m);
    expect(source).toContain('export const DEFAULT_MAX_REVISION_ROUNDS = 2;');
    expect(source).toContain('export const DEFAULT_EXTRA_REVISION_ROUNDS = 1;');
  });
});

describe('the gate configuration of the daily run', () => {
  it('is the defaults of the gate with the ranges of the profile laid over them, and nothing else changed', () => {
    const config = runGateConfig();
    expect(config).toEqual({ ...defaultConfig(), ...profileOverrides('explainer') });
    expect(config).toEqual(gateConfigOf(runProfile()));
    const { openingWords, takeaways, bodyWords, analysisShareCap, ...rest } = config;
    const { openingWords: _o, takeaways: _t, bodyWords: _b, analysisShareCap: _a, ...defaults } = defaultConfig();
    expect(rest).toEqual(defaults);
    expect({ openingWords, takeaways, bodyWords, analysisShareCap }).toEqual(PROFILES.explainer);
  });

  it('is the defaults of the gate when the settings name no profile, and the ranges of the profile that they name otherwise', () => {
    expect(gateConfigOf(undefined)).toEqual(defaultConfig());
    expect(gateConfigOf('digest').bodyWords).toEqual(PROFILES.digest.bodyWords);
  });

  // These are the numbers that the page prints. They are written here on purpose: changing the profile of the daily run, or the ranges of the explainer, changes what the page says, and
  // must be done with the sentences of the page read again.
  it('has the ranges of the explainer: an opening of 40 to 80 words, 3 to 5 takeaways, a body of 500 to 1400 words, and at most 40 percent analysis', () => {
    const config = runGateConfig();
    expect(config.openingWords).toEqual({ min: 40, max: 80 });
    expect(config.takeaways).toEqual({ min: 3, max: 5 });
    expect(config.bodyWords).toEqual({ min: 500, max: 1400 });
    expect(config.analysisShareCap).toBe(0.4);
  });
});

describe('the method page states the ranges of the daily run', () => {
  const page = readFileSync(new URL('../src/pages/method/index.astro', import.meta.url), 'utf8');

  it('asks for the rules of the gate as the daily run has them: it passes no configuration of its own, so it gets that of the daily run', () => {
    expect(page).toContain('const rules = gateRules();');
    expect(gateRules()).toEqual(gateRules(runGateConfig()));
    expect(gateRules()).not.toEqual(gateRules(defaultConfig()));
  });

  it('says in G2 the ranges of the explainer, and in G7 the share of the explainer, and none of the defaults of the gate', () => {
    expect(rule('G2').notes).toContain('opening paragraph is 40 to 80 words');
    expect(rule('G2').notes).toContain('there are 3 to 5 key takeaways');
    expect(rule('G2').notes).toContain('is 500 to 1400 words');
    expect(rule('G7').notes).toContain("Analysis is at most 40 percent of the body's sentences");
    for (const stale of ['40 to 60 words', '600 to 850 words', 'at most 20 percent']) {
      expect(rule('G2').notes, stale).not.toContain(stale);
      expect(rule('G7').notes, stale).not.toContain(stale);
    }
  });

  it('says the same share in the known limit about analysis, in words: at most 40 percent of the sentences of the body', () => {
    expect(analysisLimit()).toContain('Analysis sentences, which are at most 40 percent of the sentences of the body (a piece above that is noted, not stopped)');
    expect(analysisLimit()).not.toContain('a fifth');
  });
});
