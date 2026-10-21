import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROFILES, defaultConfig, profileOverrides } from '@robywire/gate';
import { analysisLimit } from '../src/lib/copy';
import { gateConfigOf, runGateConfig, runProfile } from '../src/lib/run-config';
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
