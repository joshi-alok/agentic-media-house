import type { DeskConfig } from '../config';
import { ModelError } from './types';
import type { ModelClient, ModelRequest, ModelResponse } from './types';

/** What one run may spend: the `budget` block of the configuration. */
export type Budget = DeskConfig['budget'];

/** What a run has spent so far. */
export interface Spent {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** The error of a call refused because a count has reached its limit. */
const spentError = (used: number, limit: number, what: string): ModelError => new ModelError('budget', `budget spent: ${used} of ${limit} ${what}`);

/**
 * Counts what a run spends on a model and refuses calls once a limit is reached, so that a
 * run cannot cost more than the budget allows (a refused call fails the run).
 *
 * A call may start only while every count is below its limit: the calls made, the input
 * tokens and the output tokens that earlier calls reported. A call that crosses a token
 * limit is let finish and keeps its answer, because its tokens are already spent and are
 * known only when it returns; it is the next call that is refused. A call counts from the
 * moment it starts, even if it fails, so that calls started together cannot go over the limit.
 * A failed call adds no tokens, because it reported none.
 */
export class BudgetedClient implements ModelClient {
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(
    private readonly inner: ModelClient,
    private readonly budget: Budget,
  ) {}

  /** What has been spent so far, as a copy. */
  spent(): Spent {
    return { calls: this.calls, inputTokens: this.inputTokens, outputTokens: this.outputTokens };
  }

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    this.refuseIfSpent();
    this.calls += 1;
    const response = await this.inner.json(request);
    this.inputTokens += response.usage.inputTokens;
    this.outputTokens += response.usage.outputTokens;
    return response;
  }

  private refuseIfSpent(): void {
    const { maxCalls, maxInputTokens, maxOutputTokens } = this.budget;
    if (this.calls >= maxCalls) throw spentError(this.calls, maxCalls, 'model calls');
    if (this.inputTokens >= maxInputTokens) throw spentError(this.inputTokens, maxInputTokens, 'input tokens');
    if (this.outputTokens >= maxOutputTokens) throw spentError(this.outputTokens, maxOutputTokens, 'output tokens');
  }
}
