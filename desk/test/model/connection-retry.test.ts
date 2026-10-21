import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AnthropicClient } from '../../src/model/anthropic';
import type { CreateMessage, MessageParams, MessageReply } from '../../src/model/anthropic';
import { BudgetedClient } from '../../src/model/budgeted';
import { RetryClient } from '../../src/model/retry';
import { ModelError } from '../../src/model/types';
import { request } from '../support/requests';

// The whole stack of a real run, with the SDK's call replaced by a stand-in that fails or answers as it is told: the client for the API inside the budget inside the retrying.
// This is where it is shown that a call that could not reach the API is tried again, that nothing else is, and that every try is a call of the budget.

const KEY = 'test-key-not-real';

const reply = (text: string, changes: Partial<MessageReply> = {}): MessageReply => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, ...changes });
const connection = (message = 'Connection error.'): Error => new Anthropic.APIConnectionError({ message });
const httpError = (status: number): Error => Anthropic.APIError.generate(status, { type: 'error', error: { type: 'api_error', message: 'something went wrong' } }, undefined, new Headers());

/** The stack: what `clientFromConfig` builds around the client for the API, with the SDK's call replaced and the waits recorded. */
function stack(outcomes: (MessageReply | Error)[], maxCalls = 40) {
  const sent: MessageParams[] = [];
  const delays: number[] = [];
  const queue = [...outcomes];
  const createMessage: CreateMessage = async (params) => {
    sent.push(params);
    const outcome = queue.shift();
    if (outcome === undefined) throw new Error('the stand-in has no outcome left');
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const budgeted = new BudgetedClient(new AnthropicClient({ apiKey: KEY, createMessage }), { maxCalls, maxInputTokens: 100_000, maxOutputTokens: 100_000 });
  const lines: string[] = [];
  const client = new RetryClient(budgeted, { sleep: async (ms) => void delays.push(ms) });
  client.onRetry((line) => void lines.push(line));
  return { client, budgeted, sent, delays, lines, left: () => queue.length };
}

const failureOf = async (client: RetryClient): Promise<ModelError> => {
  const error = await client.json(request()).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ModelError);
  return error as ModelError;
};

describe('a model call that could not reach the API', () => {
  it('succeeds after one connection error: the call is made twice, the pause is 1 second, and the retry is logged', async () => {
    const made = stack([connection(), reply('{"answer":"second try"}')]);
    expect((await made.client.json(request())).value).toEqual({ answer: 'second try' });
    expect(made.sent).toHaveLength(2);
    expect(made.sent[1]).toEqual(made.sent[0]);
    expect(made.delays).toEqual([1000]);
    expect(made.lines).toEqual(['model: connection error, retrying (2 of 3)']);
  });

  it('succeeds after two failures, one a connection error and one a connection that timed out, with pauses of 1 and 3 seconds', async () => {
    const made = stack([connection(), new Anthropic.APIConnectionTimeoutError(), reply('{"answer":"third try"}')]);
    expect((await made.client.json(request())).value).toEqual({ answer: 'third try' });
    expect(made.sent).toHaveLength(3);
    expect(made.delays).toEqual([1000, 3000]);
    expect(made.lines).toEqual(['model: connection error, retrying (2 of 3)', 'model: connection error, retrying (3 of 3)']);
  });

  it('fails after three failures with the message that a connection error has always had, and makes no fourth try', async () => {
    const made = stack([connection(), connection(), connection(), reply('{"answer":"never asked for"}')]);
    const error = await failureOf(made.client);
    expect(error.kind).toBe('transport');
    expect(error.message).toBe('the Anthropic API could not be reached: Connection error.');
    expect(made.sent).toHaveLength(3);
    expect(made.left()).toBe(1);
    expect(made.delays).toEqual([1000, 3000]);
  });

  it('does not count tokens for a try that failed: the budget has the tokens of the reply that came, and every try as a call', async () => {
    const made = stack([connection(), connection(), reply('{"answer":"third try"}')]);
    await made.client.json(request());
    expect(made.budgeted.spent()).toEqual({ calls: 3, inputTokens: 10, outputTokens: 5 });
  });

  it('is stopped by the budget, not by a third try: with two calls, a call that fails twice and would work the third time ends with the budget error', async () => {
    const made = stack([connection(), connection(), reply('{"answer":"never asked for"}')], 2);
    const error = await failureOf(made.client);
    expect(error.kind).toBe('budget');
    expect(error.message).toBe('budget spent: 2 of 2 model calls');
    expect(made.sent).toHaveLength(2);
    expect(made.budgeted.spent().calls).toBe(2);
  });

  it('is not tried again once a reply has arrived: a reply that cannot be used is repaired once, and a connection error in the repair ends the call with its message', async () => {
    const made = stack([reply('not json'), connection('socket hang up'), reply('{"answer":"never asked for"}')]);
    const error = await failureOf(made.client);
    expect(error.message).toBe('the Anthropic API could not be reached: socket hang up');
    expect(made.sent).toHaveLength(2);
    expect(made.delays).toEqual([]);
    expect(made.lines).toEqual([]);
    expect(made.budgeted.spent()).toEqual({ calls: 1, inputTokens: 10, outputTokens: 5 });
  });
});

describe('a model call that failed in any other way', () => {
  it.each([400, 401, 403, 404, 413, 422])('does not try again after an HTTP %i', async (status) => {
    const made = stack([httpError(status), reply('{"answer":"never asked for"}')]);
    const error = await failureOf(made.client);
    expect(error.message).toContain('the Anthropic API returned an error');
    expect(made.sent).toHaveLength(1);
    expect(made.delays).toEqual([]);
  });

  it('does not try again after an error that is not an error of the SDK, or one of the SDK that is not a connection error', async () => {
    for (const failure of [new Error('boom'), new Anthropic.APIUserAbortError(), new Anthropic.AnthropicError('Could not resolve authentication method.')]) {
      const made = stack([failure, reply('{"answer":"never asked for"}')]);
      expect((await failureOf(made.client)).kind).toBe('transport');
      expect(made.sent, failure.message).toHaveLength(1);
      expect(made.delays).toEqual([]);
    }
  });

  it('does not try again after a refusal, a reply cut off at the limit, or a reply that is not usable after its repair', async () => {
    const cases: [string, (MessageReply | Error)[]][] = [
      ['refused', [reply('', { stop_reason: 'refusal' }), reply('{"answer":"never asked for"}')]],
      ['refused', [reply('{"answer":', { stop_reason: 'max_tokens' }), reply('{"answer":"never asked for"}')]],
      ['schema', [reply('not json'), reply('still not json'), reply('{"answer":"never asked for"}')]],
    ];
    for (const [kind, outcomes] of cases) {
      const made = stack(outcomes);
      expect((await failureOf(made.client)).kind).toBe(kind);
      expect(made.delays).toEqual([]);
      expect(made.lines).toEqual([]);
    }
  });

  it('still tries again after a 429 and a 5xx, three times at most, as it did before', async () => {
    const made = stack([httpError(429), httpError(503), httpError(529), reply('{"answer":"fourth try"}')]);
    expect((await made.client.json(request())).value).toEqual({ answer: 'fourth try' });
    expect(made.sent).toHaveLength(4);
    expect(made.delays).toEqual([1000, 2000, 4000]);

    const fails = stack([httpError(500), httpError(500), httpError(500), httpError(500), reply('{"answer":"never asked for"}')]);
    expect((await failureOf(fails.client)).message).toContain('the Anthropic API returned an error');
    expect(fails.sent).toHaveLength(4);
  });
});
