import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { describeIssues } from '../issues';
import { MODEL_ROLES, ModelError, requestKey, sha256Hex } from './types';
import type { ModelClient, ModelRequest, ModelResponse } from './types';

// Cassettes: model responses kept as files, so that a test can run on real answers with no
// model and no network. A cassette is one JSON file for one request, named by the request's key.
// It holds the hashes of the two prompts and never their text, and it holds no key or other
// secret: the schema below allows exactly these fields and refuses any other.

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const tokens = z.number().int().nonnegative();

export const Cassette = z.strictObject({
  /** The key of the request, as `requestKey` computes it; it must match the name of the file. */
  key: hash,
  request: z.strictObject({
    role: z.enum(MODEL_ROLES),
    model: z.string().min(1),
    systemHash: hash,
    userHash: hash,
  }),
  response: z.strictObject({
    value: z.unknown(),
    usage: z.strictObject({ inputTokens: tokens, outputTokens: tokens }),
  }),
});
export type Cassette = z.infer<typeof Cassette>;

/** Where the cassette with this request key is kept in a folder. */
export function cassettePath(dir: string, key: string): string {
  return path.join(dir, `${key}.json`);
}

/** Answers from the cassettes in a folder. A request that has no cassette, or whose cassette is damaged, is refused. */
export class RecordedClient implements ModelClient {
  constructor(private readonly dir: string) {}

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    const key = requestKey(request);
    const name = `${key}.json`;
    let text: string;
    try {
      text = readFileSync(cassettePath(this.dir, key), 'utf8');
    } catch (error) {
      throw new ModelError('unrecorded', `no recorded response for this ${request.role} request (key ${key}) in ${this.dir}`, { cause: error });
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new ModelError('unrecorded', `the cassette ${name} is not valid JSON`, { cause: error });
    }
    const cassette = Cassette.safeParse(data);
    if (!cassette.success) {
      throw new ModelError('unrecorded', `the cassette ${name} is not a valid cassette: ${describeIssues(cassette.error)}`, { cause: cassette.error });
    }
    if (cassette.data.key !== key) throw new ModelError('unrecorded', `the cassette ${name} was recorded for another request`);

    const value = request.schema.safeParse(cassette.data.response.value);
    if (!value.success) {
      throw new ModelError('schema', `the recorded reply in ${name} does not match its schema: ${describeIssues(value.error)}`, { cause: value.error });
    }
    return { value: value.data, usage: cassette.data.response.usage };
  }
}

/**
 * Forwards every call to another client and keeps each successful response as a cassette
 * in a folder, which it creates when it first needs it. A call that fails is not recorded.
 * Recording the same request again replaces its cassette.
 */
export class RecordingClient implements ModelClient {
  constructor(
    private readonly inner: ModelClient,
    private readonly dir: string,
  ) {}

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    const response = await this.inner.json(request);
    const key = requestKey(request);
    const cassette: Cassette = {
      key,
      request: { role: request.role, model: request.model, systemHash: sha256Hex(request.system), userHash: sha256Hex(request.user) },
      response,
    };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(cassettePath(this.dir, key), `${JSON.stringify(cassette, null, 2)}\n`);
    return response;
  }
}
