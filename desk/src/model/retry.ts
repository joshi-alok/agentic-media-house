import { ModelError } from './types';
import type { ModelClient, ModelRequest, ModelResponse } from './types';

export interface RetryOptions {
  /** How many times to try again after the first failure. Default 3, so a call is made at most four times. */
  retries?: number;
  /** The wait before the first retry, in milliseconds; each later wait is twice the one before. Default 1000. */
  baseDelayMs?: number;
  /** The longest wait. Default 30000. */
  maxDelayMs?: number;
  /** How to wait. Default: a timer. A test passes a function that does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tries a call again after a failure that is worth another try: a transport error that is
 * marked `retryable` (the provider answered 429 or 5xx). It waits 1 second, then 2, then 4,
 * and gives up after the last retry by throwing the last error it got. Every other failure is
 * final and is thrown at once: a schema error, a refusal, a spent budget or an error that is
 * not a `ModelError` would only repeat, or cost money again.
 *
 * There is no random jitter in the waits. Jitter spreads out many clients that fail together,
 * and the Desk is one client making one run a day; without it the waits are exact, so a test
 * can check them.
 *
 * Each try is a call of the client behind this one. Put this wrapper around a `BudgetedClient`
 * and every retry counts against the budget.
 */
export class RetryClient implements ModelClient {
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly inner: ModelClient,
    options: RetryOptions = {},
  ) {
    this.retries = options.retries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.sleep = options.sleep ?? wait;
  }

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    for (let retry = 0; ; retry++) {
      try {
        return await this.inner.json(request);
      } catch (error) {
        if (!(error instanceof ModelError) || !error.retryable || retry >= this.retries) throw error;
        await this.sleep(Math.min(this.baseDelayMs * 2 ** retry, this.maxDelayMs));
      }
    }
  }
}
