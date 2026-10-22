import { PUBLICATION_NAME } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { composeSystem, reviseSystem } from '../../src/prompts/compose';
import { extractSystem } from '../../src/prompts/extract';
import { selectSystem } from '../../src/prompts/select';
import { verifySystem } from '../../src/prompts/verify';

// A model is told whom it works for. The name comes from the gate's constant, so that it is spelled in one place,
// and no prompt may carry a name that the publication no longer has.

// What the prompt says the publication is: every stage is told that it works for a publication about AI agents in crypto (the piece is whatever kind its
// profile says, so the publication is not called news).
const PROMPTS = [
  ['select', selectSystem, 'a publication about AI agents in crypto'],
  ['extract', extractSystem, 'a publication about AI agents in crypto'],
  ['compose', composeSystem, 'a publication about AI agents in crypto'],
  ['revise', reviseSystem, 'a publication about AI agents in crypto'],
  ['verify', verifySystem, 'a publication about AI agents in crypto'],
] as const;

describe.each(PROMPTS)('the %s prompt', (_stage, system, what) => {
  it('says that the model works for the publication, by its name', () => {
    expect(system()).toContain(`of ${PUBLICATION_NAME}, ${what}`);
    expect(system()).toContain(`of Agentic Media House, ${what}`);
  });

  it('carries no old name', () => {
    expect(system()).not.toMatch(/robywire/i);
  });
});
