import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig } from '@robywire/gate';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
// about itself. These tests keep its numbers in step with the gate, and keep
// the parts of the pipeline that are not built yet in the future tense.

describe('gateRules', () => {
  const rules = gateRules();

  it('has one rule for each check of the gate, in order, so a new check fails this test until it is described', () => {
    expect(rules.map((rule) => rule.id)).toEqual([...CHECK_IDS]);
  });

  it('gives each rule its own name', () => {
    expect(rules.map((rule) => rule.name)).toEqual(['Frontmatter', 'Structure', 'Coverage', 'Values', 'Quotes', 'Sourcing', 'Analysis', 'Limitations', 'Hygiene']);
  });

  it.each(rules.map((rule) => [rule.id, rule.text] as const))('%s is written as one sentence: a capital, one full stop at the end and none inside', (_id, text) => {
    expect(text).toMatch(/^[A-Z]/);
    expect(text.endsWith('.')).toBe(true);
    expect(text.slice(0, -1)).not.toMatch(/[.!?](\s|$)/);
  });

  it('takes its numbers from the gate configuration', () => {
    const text = (id: string) => rules.find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 155 characters');
    expect(text('G1')).toContain('1 to 3 categories');
    expect(text('G2')).toContain('40 to 60 words');
    expect(text('G2')).toContain('3 to 5 key takeaways');
    expect(text('G2')).toContain('600 to 850 words');
    expect(text('G7')).toContain('at most 20 percent');
  });

  it('follows the configuration it is given', () => {
    const config = { ...defaultConfig(), descriptionMax: 99, analysisShareCap: 0.35, bodyWords: { min: 100, max: 200 } };
    const text = (id: string) => gateRules(config).find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(text('G2')).toContain('100 to 200 words');
    expect(text('G7')).toContain('at most 35 percent');
  });

  it('says that a piece which uses another outlet is held, and that analysis is labelled', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('held for the owner');
    expect(rules.find((rule) => rule.id === 'G7')?.text).toContain('is labelled');
  });
});

describe('PIPELINE_STAGES', () => {
  it('lists the seven stages of the design, in order', () => {
    expect(PIPELINE_STAGES.map((stage) => stage.name)).toEqual(['Discover', 'Select', 'Fetch', 'Extract', 'Compose', 'Verify', 'Publish or hold']);
  });

  it('describes every stage in the future tense, because none of them runs yet', () => {
    for (const stage of PIPELINE_STAGES) expect(stage.text, stage.name).toMatch(/\bwill\b/);
  });

  it('writes each stage as plain sentences', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.text, stage.name).toMatch(/^[A-Z]/);
      expect(stage.text.endsWith('.'), stage.name).toBe(true);
    }
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
    expect(scoreboardHeadline({ total: 40, caught: 40 })).toBe('40 of 40 seeded defects caught');
  });

  it('says so when some were missed', () => {
    expect(scoreboardHeadline({ total: 40, caught: 38 })).toBe('38 of 40 seeded defects caught');
  });

  it('uses the singular for one defect', () => {
    expect(scoreboardHeadline({ total: 1, caught: 1 })).toBe('1 of 1 seeded defect caught');
  });
});
