import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { BudgetedClient } from '../../src/model/budgeted';
import { ModelError } from '../../src/model/types';
import type { ModelUsage } from '../../src/model/types';
import { request } from '../support/requests';
import { StubClient } from '../support/stub-client';

// A run may spend a fixed number of calls and tokens. The wrapper counts what each call reports
// and refuses the call that would start after a limit has been reached.

const unlimited = { maxCalls: 1_000_000, maxInputTokens: 1_000_000_000, maxOutputTokens: 1_000_000_000 };
const usage = (inputTokens: number, outputTokens: number): ModelUsage => ({ inputTokens, outputTokens });

/** The error thrown by a call that must be refused, or a failure of the test if it was not. */
async function refusal(client: BudgetedClient): Promise<ModelError> {
  try {
    await client.json(request());
  } catch (error) {
    expect(error).toBeInstanceOf(ModelError);
    return error as ModelError;
  }
  throw new Error('the call was not refused');
}

describe('BudgetedClient passing calls through', () => {
  it('returns the response of the client behind it, and passes the request on unchanged', async () => {
    const inner = new StubClient(() => usage(3, 4));
    const client = new BudgetedClient(inner, unlimited);
    const req = request();
    const reply = await client.json(req);
    expect(reply.value).toEqual({ answer: 'reply 1' });
    expect(reply.usage).toEqual(usage(3, 4));
    expect(inner.calls).toEqual([req]);
  });

  it('lets an error of the client behind it through untouched', async () => {
    const failure = new ModelError('transport', 'overloaded', { retryable: true });
    const client = new BudgetedClient(new StubClient(() => failure), unlimited);
    await expect(client.json(request())).rejects.toBe(failure);
  });
});

describe('BudgetedClient.spent', () => {
  it('starts at nothing', () => {
    expect(new BudgetedClient(new StubClient(() => usage(1, 1)), unlimited).spent()).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('adds up the calls and the tokens that the calls reported', async () => {
    const client = new BudgetedClient(new StubClient((n) => usage(10 * n, n)), unlimited);
    await client.json(request());
    await client.json(request());
    await client.json(request());
    expect(client.spent()).toEqual({ calls: 3, inputTokens: 60, outputTokens: 6 });
  });

  it('returns a copy, so a caller cannot change what was spent', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(1, 1)), unlimited);
    await client.json(request());
    const spent = client.spent();
    spent.calls = 99;
    spent.inputTokens = 99;
    expect(client.spent()).toEqual({ calls: 1, inputTokens: 1, outputTokens: 1 });
  });

  it('counts a call that failed as a call, with no tokens', async () => {
    const client = new BudgetedClient(new StubClient((n) => (n === 2 ? new ModelError('schema', 'bad') : usage(5, 5))), unlimited);
    await client.json(request());
    await expect(client.json(request())).rejects.toThrow('bad');
    expect(client.spent()).toEqual({ calls: 2, inputTokens: 5, outputTokens: 5 });
  });
});

describe('BudgetedClient limits', () => {
  it('refuses the call after the last one the budget allows: a budget error that says which limit', async () => {
    const inner = new StubClient(() => usage(1, 1));
    const client = new BudgetedClient(inner, { ...unlimited, maxCalls: 3 });
    for (let i = 0; i < 3; i++) await client.json(request());
    const error = await refusal(client);
    expect(error.kind).toBe('budget');
    expect(error.message).toBe('budget spent: 3 of 3 model calls');
    expect(inner.calls).toHaveLength(3);
  });

  it('allows a call while the input tokens are below the limit, and refuses it once they reach it', async () => {
    const allowed = new BudgetedClient(new StubClient(() => usage(50, 1)), { ...unlimited, maxInputTokens: 101 });
    await allowed.json(request());
    await allowed.json(request());
    await allowed.json(request());
    expect(allowed.spent().inputTokens).toBe(150);

    const inner = new StubClient(() => usage(50, 1));
    const client = new BudgetedClient(inner, { ...unlimited, maxInputTokens: 100 });
    await client.json(request());
    await client.json(request());
    const error = await refusal(client);
    expect(error.kind).toBe('budget');
    expect(error.message).toBe('budget spent: 100 of 100 input tokens');
    expect(inner.calls).toHaveLength(2);
  });

  it('allows a call while the output tokens are below the limit, and refuses it once they reach it', async () => {
    const allowed = new BudgetedClient(new StubClient(() => usage(1, 10)), { ...unlimited, maxOutputTokens: 21 });
    await allowed.json(request());
    await allowed.json(request());
    await allowed.json(request());
    expect(allowed.spent().outputTokens).toBe(30);

    const client = new BudgetedClient(new StubClient(() => usage(1, 10)), { ...unlimited, maxOutputTokens: 20 });
    await client.json(request());
    await client.json(request());
    const error = await refusal(client);
    expect(error.kind).toBe('budget');
    expect(error.message).toBe('budget spent: 20 of 20 output tokens');
  });

  it('lets the call that crosses a token limit finish and keep its answer, and refuses the next one', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(150, 1)), { ...unlimited, maxInputTokens: 100 });
    expect((await client.json(request())).usage.inputTokens).toBe(150);
    expect((await refusal(client)).message).toBe('budget spent: 150 of 100 input tokens');
  });

  it('does not count a refused call, and does not ask the client behind it', async () => {
    const inner = new StubClient(() => usage(1, 1));
    const client = new BudgetedClient(inner, { ...unlimited, maxCalls: 1 });
    await client.json(request());
    await refusal(client);
    await refusal(client);
    expect(client.spent().calls).toBe(1);
    expect(inner.calls).toHaveLength(1);
  });

  it('names the calls first when several limits are reached together', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(5, 5)), { maxCalls: 1, maxInputTokens: 5, maxOutputTokens: 5 });
    await client.json(request());
    expect((await refusal(client)).message).toBe('budget spent: 1 of 1 model calls');
  });

  it('names the input tokens before the output tokens', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(5, 5)), { ...unlimited, maxInputTokens: 5, maxOutputTokens: 5 });
    await client.json(request());
    expect((await refusal(client)).message).toBe('budget spent: 5 of 5 input tokens');
  });

  it('counts a call from the moment it starts, so calls started together cannot go over the limit', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(1, 1)), { ...unlimited, maxCalls: 1 });
    const first = client.json(request());
    const second = client.json(request());
    await expect(first).resolves.toBeDefined();
    await expect(second).rejects.toMatchObject({ kind: 'budget' });
  });

  it('is built from the budget of the configuration: the default budget allows 24 calls', async () => {
    const client = new BudgetedClient(new StubClient(() => usage(1, 1)), defaultConfig().budget);
    for (let i = 0; i < 24; i++) await client.json(request());
    expect((await refusal(client)).message).toBe('budget spent: 24 of 24 model calls');
  });
});

describe('BudgetedClient and a call that failed after it spent tokens', () => {
  it('adds the tokens that the error reports, and lets the error through untouched', async () => {
    const failure = new ModelError('refused', 'the reply was cut off at the output limit', { usage: usage(7000, 8000) });
    const client = new BudgetedClient(new StubClient(() => failure), unlimited);
    await expect(client.json(request())).rejects.toBe(failure);
    expect(client.spent()).toEqual({ calls: 1, inputTokens: 7000, outputTokens: 8000 });
  });

  it('adds nothing for an error that reports no tokens, such as a call that never reached the model', async () => {
    const client = new BudgetedClient(new StubClient(() => new ModelError('transport', 'no answer')), unlimited);
    await expect(client.json(request())).rejects.toMatchObject({ kind: 'transport' });
    expect(client.spent()).toEqual({ calls: 1, inputTokens: 0, outputTokens: 0 });
  });

  it('refuses the next call once the tokens of the failed one have reached a limit', async () => {
    const client = new BudgetedClient(new StubClient(() => new ModelError('refused', 'cut off', { usage: usage(100, 8000) })), { ...unlimited, maxOutputTokens: 8000 });
    await expect(client.json(request())).rejects.toMatchObject({ kind: 'refused' });
    expect((await refusal(client)).message).toBe('budget spent: 8000 of 8000 output tokens');
  });
});
