import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetedClient } from '../../src/model/budgeted';
import { FakeClient } from '../../src/model/fake';
import { RetryClient } from '../../src/model/retry';
import { ModelError } from '../../src/model/types';
import { request } from '../support/requests';
import { StubClient } from '../support/stub-client';

// A provider answers 429 or 5xx now and then, and a second try a moment later usually works.
// The wrapper tries again after exactly those failures, waits longer each time, and gives up.
// Every other failure is final: asking again would get the same answer, or would cost money.

afterEach(() => {
  vi.useRealTimers();
});

/** A transport error that is worth trying again, numbered so that a test can tell which one it got. */
const overloaded = (n = 0): ModelError => new ModelError('transport', `overloaded ${n}`, { retryable: true });

/** A `sleep` that does not wait and remembers how long it was asked to. */
function recorder(): { delays: number[]; sleep: (ms: number) => Promise<void> } {
  const delays: number[] = [];
  return { delays, sleep: async (ms) => void delays.push(ms) };
}

describe('RetryClient success', () => {
  it('returns the response of a call that works, with no wait', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', { answer: 'fine' });
    const reply = await new RetryClient(inner, { sleep }).json(request());
    expect(reply.value).toEqual({ answer: 'fine' });
    expect(inner.calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('tries again after a retryable error and returns the answer that comes, asking the same thing each time', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', overloaded(), { answer: 'second try' });
    const req = request();
    const reply = await new RetryClient(inner, { sleep }).json(req);
    expect(reply.value).toEqual({ answer: 'second try' });
    expect(inner.calls).toHaveLength(2);
    expect(inner.calls[0]).toBe(req);
    expect(inner.calls[1]).toBe(req);
    expect(delays).toEqual([1000]);
  });

  it('doubles the wait after each failure, starting from the base delay', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', overloaded(), overloaded(), overloaded(), { answer: 'fourth try' });
    await new RetryClient(inner, { sleep }).json(request());
    expect(delays).toEqual([1000, 2000, 4000]);

    const other = recorder();
    const again = new FakeClient().script('select', overloaded(), overloaded(), overloaded(), { answer: 'ok' });
    await new RetryClient(again, { baseDelayMs: 10, sleep: other.sleep }).json(request());
    expect(other.delays).toEqual([10, 20, 40]);
  });

  it('never waits longer than the longest delay', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', ...[1, 2, 3, 4, 5].map(overloaded), { answer: 'sixth try' });
    await new RetryClient(inner, { retries: 5, baseDelayMs: 1000, maxDelayMs: 3000, sleep }).json(request());
    expect(delays).toEqual([1000, 2000, 3000, 3000, 3000]);
  });
});

describe('RetryClient giving up', () => {
  it('stops after three retries by default and throws the last error it got', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', overloaded(1), overloaded(2), overloaded(3), overloaded(4), { answer: 'never asked for' });
    const error = await new RetryClient(inner, { sleep }).json(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).message).toBe('overloaded 4');
    expect(inner.calls).toHaveLength(4);
    expect(inner.pending('select')).toBe(1);
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('retries as many times as it is told to, and not at all when told zero', async () => {
    const none = new FakeClient().script('select', overloaded(1), { answer: 'never asked for' });
    await expect(new RetryClient(none, { retries: 0, sleep: recorder().sleep }).json(request())).rejects.toThrow('overloaded 1');
    expect(none.calls).toHaveLength(1);

    const one = new FakeClient().script('select', overloaded(1), overloaded(2), { answer: 'never asked for' });
    await expect(new RetryClient(one, { retries: 1, sleep: recorder().sleep }).json(request())).rejects.toThrow('overloaded 2');
    expect(one.calls).toHaveLength(2);
  });
});

describe('RetryClient errors that are final', () => {
  const finals: [string, ModelError][] = [
    ['a transport error that is not retryable (a 400, a bad key)', new ModelError('transport', 'bad request')],
    ['a schema error', new ModelError('schema', 'not JSON')],
    ['a budget error', new ModelError('budget', 'budget spent')],
    ['an unrecorded error', new ModelError('unrecorded', 'nothing recorded')],
    ['a refusal', new ModelError('refused', 'declined')],
  ];

  it.each(finals)('does not retry %s', async (_name, error) => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', error, { answer: 'never asked for' });
    await expect(new RetryClient(inner, { sleep }).json(request())).rejects.toBe(error);
    expect(inner.calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('does not retry an error that is not a ModelError, which is a bug and not a failure of the provider', async () => {
    const { delays, sleep } = recorder();
    const bug = new TypeError('cannot read properties of undefined');
    const inner = new StubClient(() => {
      throw bug;
    });
    await expect(new RetryClient(inner, { sleep }).json(request())).rejects.toBe(bug);
    expect(inner.calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });
});

describe('RetryClient with the budget', () => {
  it('counts every try as a call: around a BudgetedClient, a run cannot retry past its budget', async () => {
    const { delays, sleep } = recorder();
    const inner = new StubClient((n) => overloaded(n));
    const budgeted = new BudgetedClient(inner, { maxCalls: 2, maxInputTokens: 1000, maxOutputTokens: 1000 });
    const error = await new RetryClient(budgeted, { sleep }).json(request()).catch((e: unknown) => e);
    expect((error as ModelError).kind).toBe('budget');
    expect(inner.calls).toHaveLength(2);
    expect(budgeted.spent().calls).toBe(2);
    expect(delays).toEqual([1000, 2000]);
  });
});

describe('RetryClient waiting', () => {
  it('waits with a real timer unless it is given something else to wait with: 1, 2 and 4 seconds by default', async () => {
    vi.useFakeTimers();
    const inner = new FakeClient().script('select', overloaded(), overloaded(), overloaded(), { answer: 'fourth try' });
    const pending = new RetryClient(inner).json(request());
    const callsAfter = async (ms: number): Promise<number> => {
      await vi.advanceTimersByTimeAsync(ms);
      return inner.calls.length;
    };
    expect(inner.calls).toHaveLength(1);
    expect(await callsAfter(999)).toBe(1);
    expect(await callsAfter(1)).toBe(2);
    expect(await callsAfter(1999)).toBe(2);
    expect(await callsAfter(1)).toBe(3);
    expect(await callsAfter(3999)).toBe(3);
    expect(await callsAfter(1)).toBe(4);
    expect((await pending).value).toEqual({ answer: 'fourth try' });
  });
});

// A call that could not reach the API at all (a connection error, a connection that timed out) is the other failure worth another try. It has a rule of its own:
// at most two retries, after 1 second and then 3, because a network that is down for a moment is back soon or it is not back at all.

/** A transport error from a call that never got an answer, numbered so that a test can tell which one it got. */
const unreached = (n = 0): ModelError => new ModelError('transport', `the Anthropic API could not be reached: Connection error. ${n}`, { unreached: true });

describe('RetryClient: a call that could not reach the API', () => {
  it('tries again after one failure, with the same request, after 1 second', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', unreached(), { answer: 'second try' });
    const req = request();
    const reply = await new RetryClient(inner, { sleep }).json(req);
    expect(reply.value).toEqual({ answer: 'second try' });
    expect(inner.calls).toEqual([req, req]);
    expect(delays).toEqual([1000]);
  });

  it('tries again after two failures, after 1 second and then 3 seconds', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', unreached(1), unreached(2), { answer: 'third try' });
    const reply = await new RetryClient(inner, { sleep }).json(request());
    expect(reply.value).toEqual({ answer: 'third try' });
    expect(inner.calls).toHaveLength(3);
    expect(delays).toEqual([1000, 3000]);
  });

  it('gives up after the third failure, which is two retries, and throws the last error it got', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', unreached(1), unreached(2), unreached(3), { answer: 'never asked for' });
    const error = await new RetryClient(inner, { sleep }).json(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).message).toBe('the Anthropic API could not be reached: Connection error. 3');
    expect(inner.calls).toHaveLength(3);
    expect(inner.pending('select')).toBe(1);
    expect(delays).toEqual([1000, 3000]);
  });

  it('waits with a real timer unless it is given something else to wait with: 1 second and then 3', async () => {
    vi.useFakeTimers();
    const inner = new FakeClient().script('select', unreached(), unreached(), { answer: 'third try' });
    const pending = new RetryClient(inner).json(request());
    const callsAfter = async (ms: number): Promise<number> => {
      await vi.advanceTimersByTimeAsync(ms);
      return inner.calls.length;
    };
    expect(inner.calls).toHaveLength(1);
    expect(await callsAfter(999)).toBe(1);
    expect(await callsAfter(1)).toBe(2);
    expect(await callsAfter(2999)).toBe(2);
    expect(await callsAfter(1)).toBe(3);
    expect((await pending).value).toEqual({ answer: 'third try' });
  });

  it('takes the waits from an option, one for each retry, and retries no more times than there are waits', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', unreached(1), unreached(2), unreached(3), { answer: 'never asked for' });
    await expect(new RetryClient(inner, { sleep, unreachedDelaysMs: [5] }).json(request())).rejects.toThrow('Connection error. 2');
    expect(inner.calls).toHaveLength(2);
    expect(delays).toEqual([5]);

    const none = new FakeClient().script('select', unreached(1), { answer: 'never asked for' });
    await expect(new RetryClient(none, { sleep: recorder().sleep, unreachedDelaysMs: [] }).json(request())).rejects.toThrow('Connection error. 1');
    expect(none.calls).toHaveLength(1);
  });

  it('retries nothing when it is told zero retries, whatever kind of failure it is', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', unreached(1), { answer: 'never asked for' });
    await expect(new RetryClient(inner, { retries: 0, sleep }).json(request())).rejects.toThrow('Connection error. 1');
    expect(inner.calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('keeps the rule of the provider for an error that the provider answered with, next to it: three retries, doubling', async () => {
    const { delays, sleep } = recorder();
    const inner = new FakeClient().script('select', overloaded(1), overloaded(2), overloaded(3), { answer: 'fourth try' });
    await new RetryClient(inner, { sleep }).json(request());
    expect(inner.calls).toHaveLength(4);
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('counts the retries of one call together when the two kinds of failure follow each other, so that a call is never tried more than four times', async () => {
    const { delays, sleep } = recorder();
    const mixed = new FakeClient().script('select', overloaded(1), unreached(2), { answer: 'third try' });
    await new RetryClient(mixed, { sleep }).json(request());
    expect(mixed.calls).toHaveLength(3);
    expect(delays).toEqual([1000, 3000]);

    const late = recorder();
    const tired = new FakeClient().script('select', overloaded(1), overloaded(2), unreached(3), { answer: 'never asked for' });
    await expect(new RetryClient(tired, { sleep: late.sleep }).json(request())).rejects.toThrow('Connection error. 3');
    expect(tired.calls).toHaveLength(3);
    expect(late.delays).toEqual([1000, 2000]);
  });

  it('retries only a transport error that is marked: a plain transport error, a schema error, a refusal and a budget error are final, as before', async () => {
    const { delays, sleep } = recorder();
    for (const error of [new ModelError('transport', 'the Anthropic API could not be reached: boom'), new ModelError('schema', 'x'), new ModelError('refused', 'x'), new ModelError('budget', 'x')]) {
      const inner = new FakeClient().script('select', error, { answer: 'never asked for' });
      await expect(new RetryClient(inner, { sleep }).json(request())).rejects.toBe(error);
      expect(inner.calls, error.kind).toHaveLength(1);
    }
    expect(delays).toEqual([]);
  });

  it('counts every try as a call: around a BudgetedClient with two calls, a call that fails twice and would work the third time stops with the budget error, not a third try', async () => {
    const { delays, sleep } = recorder();
    const inner = new StubClient((n) => (n < 3 ? unreached(n) : { inputTokens: 1, outputTokens: 1 }));
    const budgeted = new BudgetedClient(inner, { maxCalls: 2, maxInputTokens: 1000, maxOutputTokens: 1000 });
    const error = await new RetryClient(budgeted, { sleep }).json(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).kind).toBe('budget');
    expect((error as ModelError).message).toBe('budget spent: 2 of 2 model calls');
    expect(inner.calls).toHaveLength(2);
    expect(budgeted.spent()).toEqual({ calls: 2, inputTokens: 0, outputTokens: 0 });
    expect(delays).toEqual([1000, 3000]);
  });
});

describe('RetryClient: telling of a retry', () => {
  it('tells the listener, before it waits, which try is next and how many it may make, in words that hold no text of the request or of the error', async () => {
    const events: string[] = [];
    const retrying = new RetryClient(new FakeClient().script('select', unreached(1), unreached(2), { answer: 'ok' }), { sleep: async () => void events.push('wait') });
    retrying.onRetry((line) => void events.push(line));
    await retrying.json(request({ user: 'a secret question' }));
    expect(events).toEqual(['model: connection error, retrying (2 of 3)', 'wait', 'model: connection error, retrying (3 of 3)', 'wait']);
  });

  it('says it of a provider error too, with the four tries that it may make', async () => {
    const lines: string[] = [];
    const retrying = new RetryClient(new FakeClient().script('select', overloaded(1), { answer: 'ok' }), { sleep: recorder().sleep });
    retrying.onRetry((line) => void lines.push(line));
    await retrying.json(request());
    expect(lines).toEqual(['model: the API answered with an error that may pass, retrying (2 of 4)']);
  });

  it('says nothing when the call works, when no retry is made, or when nobody listens', async () => {
    const lines: string[] = [];
    const quiet = new RetryClient(new FakeClient().script('select', { answer: 'ok' }), { sleep: recorder().sleep });
    quiet.onRetry((line) => void lines.push(line));
    await quiet.json(request());
    const final = new RetryClient(new FakeClient().script('select', new ModelError('schema', 'x')), { sleep: recorder().sleep });
    final.onRetry((line) => void lines.push(line));
    await expect(final.json(request())).rejects.toThrow('x');
    expect(lines).toEqual([]);
    await expect(new RetryClient(new FakeClient().script('select', unreached(), { answer: 'ok' }), { sleep: recorder().sleep }).json(request())).resolves.toBeDefined();
  });

  it('does not let a listener that throws change what the call does', async () => {
    const retrying = new RetryClient(new FakeClient().script('select', unreached(), { answer: 'second try' }), { sleep: recorder().sleep });
    retrying.onRetry(() => {
      throw new Error('the log is broken');
    });
    expect((await retrying.json(request())).value).toEqual({ answer: 'second try' });
  });
});
