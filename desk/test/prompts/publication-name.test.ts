import { PUBLICATION_NAME } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { composeSystem, reviseSystem } from '../../src/prompts/compose';
import { extractSystem } from '../../src/prompts/extract';
import { selectSystem } from '../../src/prompts/select';
import { verifySystem } from '../../src/prompts/verify';

// A model is told whom it works for. The name comes from the gate's constant, so that it is spelled in one place,
// and no prompt may carry a name that the publication no longer has.

const PROMPTS = [
  ['select', selectSystem],
  ['extract', extractSystem],
  ['compose', composeSystem],
  ['revise', reviseSystem],
  ['verify', verifySystem],
] as const;

describe.each(PROMPTS)('the %s prompt', (_stage, system) => {
  it('says that the model works for the publication, by its name', () => {
    expect(system()).toContain(`of ${PUBLICATION_NAME}, a robotics news site`);
    expect(system()).toContain('of Agentic Media House, a robotics news site');
  });

  it('carries no old name', () => {
    expect(system()).not.toMatch(/robywire/i);
  });
});
