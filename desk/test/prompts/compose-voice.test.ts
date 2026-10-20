import { describe, expect, it } from 'vitest';
import { EXPLAINER_VOICE, composeInstructions, composeSystem, configOf, reviseSystem } from '../../src/prompts/compose';

describe('the voice of an explainer', () => {
  it('is in the prompt of an explainer, and in no other prompt', () => {
    for (const line of EXPLAINER_VOICE) expect(composeSystem('explainer')).toContain(line);
    for (const line of EXPLAINER_VOICE) {
      expect(composeSystem()).not.toContain(line);
      expect(composeSystem('digest')).not.toContain(line);
      expect(composeSystem('brief')).not.toContain(line);
      expect(reviseSystem('explainer')).not.toContain(line);
    }
  });

  it('says what the piece is for, in the words of this publication', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('explains one thing that the claims describe');
    expect(text).toContain('AI agents');
  });

  it('says to explain a term only from the claims, so that no word comes from outside them', () => {
    expect(EXPLAINER_VOICE.join('\n')).toContain('using only what the claims say; if no claim explains a term, do not use the term');
  });

  it('says to give a heading that says what the section says, and gives an example of each', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('a heading that says what the section says');
    expect(text).toContain('"How a payment is settled"');
    expect(text).toContain('"Overview"');
  });

  it('says to say what the source does not say, and not to state a project\'s own description as settled', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('Say what the source does not say');
    expect(text).toContain('"the project says"');
  });

  it('puts the voice before the rules, so that the rules, which are checked, come last', () => {
    const text = composeSystem('explainer');
    expect(text.indexOf(EXPLAINER_VOICE[0]!)).toBeLessThan(text.indexOf('The Desk checks the rules below by code'));
  });

  it('does not change the instructions for the defaults of the gate', () => {
    expect(composeInstructions()).toBe(composeInstructions(configOf()));
  });
});
