import { describeIssues } from '../issues';
import { ModelError } from './types';
import type { ModelClient, ModelRequest, ModelResponse, ModelRole } from './types';

// A model that answers from a script. Every test of a stage, and the dry run of the
// Desk, uses it in place of a real model. It is not lenient: a reply that does not
// match the schema of the request fails exactly as a bad model's reply fails, so a
// test that scripts a bad reply tests how the stage copes with one.

/** About one token for four characters, rounded up. Rough, and the same every time. */
const tokensOf = (text: string): number => Math.ceil(text.length / 4);

export class FakeClient implements ModelClient {
  /** Every request this client was asked, in order, including those it failed. */
  readonly calls: ModelRequest<unknown>[] = [];
  private readonly queues = new Map<ModelRole, unknown[]>();

  /**
   * Add replies for a role; each call for that role uses up the next one. A reply is:
   * - a `ModelError`: the call throws it;
   * - a string: the raw text of the model's reply, which is read as JSON;
   * - a function: it is called with the request and what it returns is the reply (it may throw);
   * - anything else: the value the model replied with.
   * A value, or a string that is JSON, must satisfy the schema of the request.
   */
  script(role: ModelRole, ...replies: unknown[]): this {
    const queue = this.queues.get(role) ?? [];
    queue.push(...replies);
    this.queues.set(role, queue);
    return this;
  }

  /** How many scripted replies for a role have not been used. */
  pending(role: ModelRole): number {
    return this.queues.get(role)?.length ?? 0;
  }

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    this.calls.push(request);
    const queue = this.queues.get(request.role);
    if (queue === undefined || queue.length === 0) {
      throw new ModelError('unrecorded', `the fake client has no scripted reply left for the ${request.role} role`);
    }
    const scripted = queue.shift();
    const reply = typeof scripted === 'function' ? scripted(request) : scripted;
    if (reply instanceof ModelError) throw reply;

    let value = reply;
    if (typeof reply === 'string') {
      try {
        value = JSON.parse(reply);
      } catch (error) {
        throw new ModelError('schema', `the reply for the ${request.role} role is not valid JSON`, { cause: error });
      }
    }
    const parsed = request.schema.safeParse(value);
    if (!parsed.success) {
      throw new ModelError('schema', `the reply for the ${request.role} role does not match its schema: ${describeIssues(parsed.error)}`, {
        cause: parsed.error,
      });
    }
    const replyText = typeof reply === 'string' ? reply : JSON.stringify(reply);
    return { value: parsed.data, usage: { inputTokens: tokensOf(request.system) + tokensOf(request.user), outputTokens: tokensOf(replyText) } };
  }
}
