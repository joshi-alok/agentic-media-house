import { ModelError } from '../../src/model/types';
import type { ModelClient, ModelRequest, ModelResponse, ModelUsage } from '../../src/model/types';

/**
 * A client whose every call is decided by a function of the call number (the first call is 1):
 * it either reports some usage, or fails with the error the function returns. The wrappers of the
 * model layer are tested against it because, unlike `FakeClient`, it lets a test choose the usage.
 */
export class StubClient implements ModelClient {
  /** Every request this client was asked, in order. */
  readonly calls: ModelRequest<unknown>[] = [];

  constructor(private readonly outcome: (callNumber: number) => ModelUsage | ModelError) {}

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    this.calls.push(request);
    const outcome = this.outcome(this.calls.length);
    if (outcome instanceof ModelError) throw outcome;
    // The stub does not look at the schema: the value is a fixed object, which tests only compare.
    return { value: { answer: `reply ${this.calls.length}` } as unknown as T, usage: outcome };
  }
}
