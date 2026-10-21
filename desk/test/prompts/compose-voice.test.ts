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

  it('says what is not yet known only where a claim says so, never that a page does not say something, and not to state a project\'s own description as settled', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('Say what is not yet known only where a claim says so');
    expect(text).toContain('never write that a page leaves something out or does not say something');
    expect(text).toContain('write that the project says it');
    expect(text).not.toContain('Say what the source does not say');
  });

  it('puts the voice after the job and before the rules, so that the rules, which are checked, come last', () => {
    const text = composeSystem('explainer');
    expect(text.indexOf('Write plain sentences: no markdown')).toBeLessThan(text.indexOf(EXPLAINER_VOICE[0]!));
    expect(text.indexOf(EXPLAINER_VOICE[0]!)).toBeLessThan(text.indexOf('The Desk checks the rules below by code'));
  });

  it('does not change the instructions for the defaults of the gate', () => {
    expect(composeInstructions()).toBe(composeInstructions(configOf()));
  });
});

describe('the voice of an explainer when the claims are many', () => {
  // In the real run of six pages the explainers were 145 to 242 words, against the 500 to 1400 that the profile notes: Extract proposed 5 to 11 claims for a page, and the writer wrote a sentence or
  // two for each and stopped. The prompt already says to write as long as the claims support and no longer; these lines say what to do with many claims, so that a longer piece comes from more
  // true claims and not from padding.
  const lineOf = (start: string): string => EXPLAINER_VOICE.find((line) => line.startsWith(start)) ?? '';
  const USE = (): string => lineOf('- When the claims are many, use them');
  const CLOSE = (): string => lineOf('- Close a section with one analysis sentence');

  it('says that when the claims are many each claim that bears on the thing has its own sentence, in the section where it belongs', () => {
    expect(USE()).not.toBe('');
    expect(USE()).toContain('give each claim that bears on the thing its own sentence, in the section where it belongs');
  });

  it('says not to merge two claims into one sentence and not to drop a claim only because it is minor', () => {
    expect(USE()).toContain('do not merge two claims into one sentence');
    expect(USE()).toContain('do not drop a claim only because it is minor');
  });

  it('says to give each section three or more sentences when the claims allow', () => {
    expect(USE()).toContain('Give each section three or more sentences when the claims allow.');
  });

  it('says that a takeaway states the point in other words and does not repeat a sentence of the body word for word', () => {
    expect(USE()).toContain('A takeaway states the point in other words and does not repeat a sentence of the body word for word.');
  });

  it('is one bullet, short, and adds nothing that a claim must support: it is about how to write what the claims say', () => {
    expect(EXPLAINER_VOICE.filter((line) => line.includes('When the claims are many'))).toHaveLength(1);
    expect(USE().split(/\s+/).length).toBeLessThanOrEqual(85);
    expect(USE()).not.toMatch(/pad|filler|fill the|longer piece|words in all/i);
    // the length is not asked for in words here: the rules give the range, and say never to pad
    expect(USE()).not.toMatch(/\d/);
  });

  it('says to close a section with one analysis sentence that says what its facts mean for a person who builds or uses agents, using only the facts of the piece, where that helps', () => {
    expect(CLOSE()).not.toBe('');
    expect(CLOSE()).toContain('Close a section with one analysis sentence that says what its facts mean for a person who builds or uses agents');
    expect(CLOSE()).toContain('using only the facts of the piece');
    expect(CLOSE()).toContain('where that helps');
  });

  it('leaves the share of analysis to the rules: it names no figure, and the rules give the share of the profile', () => {
    expect(CLOSE()).not.toMatch(/\d/);
    expect(CLOSE()).toContain('the share of analysis stays within the limit of the rules below');
    expect(composeSystem('explainer')).toContain('At most 40 per cent of the sentences of the piece may be analysis.');
    expect(EXPLAINER_VOICE.filter((line) => line.includes('Close a section with one analysis sentence'))).toHaveLength(1);
    expect(CLOSE().split(/\s+/).length).toBeLessThanOrEqual(60);
  });

  it('puts both lines in the voice of an explainer and in no other prompt, and the revise prompt does not have them', () => {
    for (const line of [USE(), CLOSE()]) {
      expect(composeSystem('explainer')).toContain(line);
      expect(composeSystem()).not.toContain(line);
      expect(composeSystem('digest')).not.toContain(line);
      expect(composeSystem('brief')).not.toContain(line);
      expect(reviseSystem()).not.toContain(line);
      expect(reviseSystem('explainer')).not.toContain(line);
    }
  });

  it('keeps the lines of the voice that were there, and the rules that say to write no more than the claims support and never to pad', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('Open with the point, in one sentence, before anything about where it came from.');
    expect(text).toContain('Give each section one job, and a heading that says what the section says');
    expect(text).toContain('Keep to what the claims say about the thing, in the order a reader needs it.');
    const rules = composeSystem('explainer');
    expect(rules).toContain('Write as long as the claims support and no longer.');
    expect(rules).toContain('If the claims cannot fill that, write a shorter piece: never pad it with anything that a claim does not say.');
  });
});
