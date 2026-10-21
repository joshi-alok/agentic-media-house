import { ModelError } from './types';
import type { ModelClient, ModelRequest, ModelResponse } from './types';

export interface RetryOptions {
  /** The most times to try again after a failure, of any kind. Default 3, so a call is made at most four times. 0 means no retrying at all. */
  retries?: number;
  /** The wait before the first retry of an answer of the provider (a 429 or a 5xx), in milliseconds; each later wait is twice the one before. Default 1000. */
  baseDelayMs?: number;
  /** The longest wait of that kind. Default 30000. */
  maxDelayMs?: number;
  /** The waits before the retries of a call that could not reach the API, one for each retry: a call is tried again as many times as there are waits. Default 1000 and 3000, so such a call is made at most three times. */
  unreachedDelaysMs?: readonly number[];
  /** How to wait. Default: a timer. A test passes a function that does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tries a call again after a failure that is worth another try, of two kinds. One is a transport error that is marked `retryable` (the provider answered 429 or 5xx): it waits
 * 1 second, then 2, then 4, and tries again up to three times. The other is a transport error that is marked `unreached` (the connection failed or timed out, so no reply
 * came and the call reports no tokens): it waits 1 second, then 3, and tries again up to twice. Both stop when the last retry has failed, by throwing the last error they got. The retries
 * of one call are counted together, whatever their kinds, so the longest rule is never over three retries. Every other failure is final and is thrown at once: a schema error, a
 * refusal, a spent budget, a 4xx and an error that is not a `ModelError` would only repeat, or cost money again.
 *
 * There is no random jitter in the waits. Jitter spreads out many clients that fail together,
 * and the Desk is one client making one run a day; without it the waits are exact, so a test
 * can check them.
 *
 * Each try is a call of the client behind this one. Put this wrapper around a `BudgetedClient`
 * and every retry counts against the budget.
 *
 * A listener, set with `onRetry`, is told in a line of fixed words before each wait which try is next and how many the call may have; the line holds nothing of the request, of
 * the reply or of the error.
 */
export class RetryClient implements ModelClient {
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly unreachedDelaysMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private listener: ((line: string) => void) | undefined;

  constructor(
    private readonly inner: ModelClient,
    options: RetryOptions = {},
  ) {
    this.retries = options.retries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.unreachedDelaysMs = options.unreachedDelaysMs ?? [1000, 3000];
    this.sleep = options.sleep ?? wait;
  }

  /** Tell `listener` of each retry from now on, in place of the one before. The run that owns the log sets it after the client is built. */
  onRetry(listener: (line: string) => void): void {
    this.listener = listener;
  }

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    for (let retry = 0; ; retry++) {
      try {
        return await this.inner.json(request);
      } catch (error) {
        const next = this.retryAfter(error, retry);
        if (next === undefined) throw error;
        this.tell(`model: ${next.what}, retrying (${retry + 2} of ${next.tries})`);
        await this.sleep(next.delayMs);
      }
    }
  }

  /** How to try again after `error`, which ended the try that follows `retry` earlier retries (0 for the first try): the wait, how it is told, and how many tries the call may have; undefined when the error is final or the retries are used up. */
  private retryAfter(error: unknown, retry: number): { delayMs: number; what: string; tries: number } | undefined {
    if (!(error instanceof ModelError) || retry >= this.retries) return undefined;
    if (error.retryable) return { delayMs: Math.min(this.baseDelayMs * 2 ** retry, this.maxDelayMs), what: 'the API answered with an error that may pass', tries: this.retries + 1 };
    const delayMs = this.unreachedDelaysMs[retry];
    if (error.unreached && delayMs !== undefined) return { delayMs, what: 'connection error', tries: Math.min(this.retries, this.unreachedDelaysMs.length) + 1 };
    return undefined;
  }

  /** A line to the listener. A listener that fails must not change what the call does, so its error is dropped. */
  private tell(line: string): void {
    try {
      this.listener?.(line);
    } catch {
      // The log is for reading; a call is not worth failing for it.
    }
  }
}
