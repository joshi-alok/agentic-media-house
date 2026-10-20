import { ModelError } from '../src/index';
import type { ModelClient, ModelRequest, ModelResponse } from '../src/index';
import type { EvalItem, EvalSet } from './run-verifier';

// Verifiers that are scripted, for testing the harness and for proving its wiring with no model: one that knows the answers, one that clears everything (lazy),
// and one that clears nothing (too strict). They read the sentences from the blocks of the message that the real prompt builds, find them in the set, and
// reply in the shape that the real verifier must, so the harness cannot tell them from a model except by what they say.

export type Verdict = 'entailed' | 'not_entailed' | 'ambiguous';

/** The blocks of a message: the id and the text of each. */
function blocksOf(message: string): { id: string; text: string }[] {
  return [...message.matchAll(/<source id="([^"]+)">\n([\s\S]*?)\n<\/source>/g)].map((match) => ({ id: match[1] as string, text: match[2] as string }));
}

/**
 * A verifier that gives `decide(item)` as the verdict on each sentence it is shown and judges every claim's basis and status supported. It finds an item
 * by its sentence, which is why the sentences of a set are all different, and fails if it is asked about one that the set does not have.
 */
export function scriptedVerifier(set: EvalSet, decide: (item: EvalItem) => Verdict): ModelClient {
  return {
    async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
      const blocks = blocksOf(request.user);
      const verdicts = blocks
        .filter((block) => /^s\d+$/.test(block.id))
        .map((block) => {
          const item = set.items.find((candidate) => candidate.sentence === block.text);
          if (item === undefined) throw new Error(`the scripted verifier was asked about a sentence that is not in the set: ${JSON.stringify(block.text)}`);
          const verdict = decide(item);
          return { id: block.id, reason: 'Scripted.', missing: verdict === 'not_entailed' ? ['what the passages do not say'] : [], verdict };
        });
      const labels = blocks.filter((block) => /^c-\d+$/.test(block.id)).map((block) => ({ id: block.id, basisSupported: true, statusSupported: true, reason: 'Scripted.' }));
      const parsed = request.schema.safeParse({ verdicts, labels });
      if (!parsed.success) throw new ModelError('schema', 'the scripted reply does not match the schema of the request');
      return { value: parsed.data, usage: { inputTokens: Math.ceil(request.user.length / 4), outputTokens: 20 * (verdicts.length + labels.length) } };
    },
  };
}

/** A verifier that knows the answers: it clears the sentences that are supported and no others. */
export const perfectVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, (item) => (item.label === 'supported' ? 'entailed' : 'not_entailed'));

/** A lazy verifier: it clears every sentence. */
export const lazyVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, () => 'entailed');

/** A verifier that is too strict: it clears no sentence. */
export const strictVerifier = (set: EvalSet): ModelClient => scriptedVerifier(set, () => 'not_entailed');
