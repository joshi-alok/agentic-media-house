import { describe, expect, it } from 'vitest';
import { composeSystem } from '../../src/prompts/compose';
import { extractSystem } from '../../src/prompts/extract';
import { selectSystem } from '../../src/prompts/select';
import { verifySystem } from '../../src/prompts/verify';

describe('the prompts say what the publication is', () => {
  it.each([
    ['select', selectSystem()],
    ['extract', extractSystem()],
    ['verify', verifySystem()],
    ['compose', composeSystem()],
  ])('%s: AI agents in crypto, no robotics', (_name, prompt) => {
    expect(prompt).not.toMatch(/robot/i);
  });

  it('the compose prompt says there is no price, no market call and no advice', () => {
    expect(composeSystem()).toContain('no price prediction, no market call and no advice to buy, sell or hold');
  });

  it('the select prompt says what the publication covers', () => {
    expect(selectSystem()).toContain('AI agents in crypto');
  });
});
