import { z } from 'zod';
import type { ModelRequest } from '../../src/model/types';

// What the tests of the model layer share: one small reply shape and a request that asks for it.
// The model name is a made-up one: only `desk/src/config.ts` may spell a real one.

/** The reply the sample request asks for. */
export const Answer = z.strictObject({ answer: z.string() });
export type Answer = z.infer<typeof Answer>;

/** A valid request for an `Answer`; any field can be replaced. */
export function request(overrides: Partial<ModelRequest<Answer>> = {}): ModelRequest<Answer> {
  return {
    role: 'select',
    model: 'model-a',
    system: 'You answer in JSON.',
    user: 'Say hello.',
    schema: Answer,
    maxOutputTokens: 100,
    ...overrides,
  };
}
