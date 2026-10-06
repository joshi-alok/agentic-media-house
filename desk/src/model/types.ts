import { createHash } from 'node:crypto';
import { z } from 'zod';

// The one interface through which the Desk asks a model for anything. It can
// express a system prompt, one user message, the shape of the reply and a limit
// on its length, and nothing else: there is no field for a tool, so no stage and
// no client can offer a model one. Text from the web reaches a model only inside
// the user message, in the blocks that `wrapSource` makes.

/** The four jobs a model does in the pipeline. The config names the model for each. */
export type ModelRole = 'select' | 'extract' | 'compose' | 'verify';

/** One question to a model, and the shape the answer must have. */
export interface ModelRequest<T> {
  role: ModelRole;
  /** The model to ask: always `config.models[role]`, passed in by the stage. */
  model: string;
  system: string;
  /** The one user message. Untrusted text is in it, and only inside `<source>` blocks. */
  user: string;
  /** The reply is JSON and must satisfy this schema; the client returns the parsed value. */
  schema: z.ZodType<T>;
  /** The most tokens the reply may have. */
  maxOutputTokens: number;
}

/** What a call cost, as the model's provider reported it. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse<T> {
  value: T;
  usage: ModelUsage;
}

export interface ModelClient {
  /** Ask for a JSON value of the shape `request.schema` describes. Fails with a `ModelError`, never with a half-valid value. */
  json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>>;
}

/**
 * Why a call failed.
 * - `transport`: the request did not get an answer (network, the provider's own errors); some are `retryable`.
 * - `schema`: the reply came but is not JSON of the shape that was asked for.
 * - `budget`: the run has used all it may spend.
 * - `unrecorded`: no scripted reply or recorded response exists for this request.
 * - `refused`: the model stopped without finishing an answer: it declined, or ran out of its output limit.
 */
export type ModelErrorKind = 'transport' | 'schema' | 'budget' | 'unrecorded' | 'refused';

/** The only error a `ModelClient` throws. */
export class ModelError extends Error {
  readonly kind: ModelErrorKind;
  /** True only for a transport error that is worth trying again (a 429 or a 5xx); false for every other kind. */
  readonly retryable: boolean;

  constructor(kind: ModelErrorKind, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ModelError';
    this.kind = kind;
    this.retryable = kind === 'transport' && options.retryable === true;
  }
}

/** Sort the keys of every object, at every depth, so that equal values give equal text. Arrays keep their order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/** JSON text of a value with the keys of every object in sorted order: the same data always gives the same text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** The SHA-256 of a text, as 64 lowercase hex characters. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The JSON Schema of what a schema accepts, as a plain object. It describes the
 * values a reply may have (a transform or a refinement cannot be described and is
 * left out), and it is what both the request key and the reply format are made from.
 */
export function jsonSchemaOf<T>(schema: z.ZodType<T>): unknown {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
}

/**
 * The identity of a request: the SHA-256 of the canonical JSON of its role, model,
 * system prompt, user message and the JSON Schema of its reply. It is the same in
 * every run and does not depend on the order in which fields were written, so a
 * recorded response can be found again; changing any one of the five gives a
 * different key.
 *
 * `maxOutputTokens` is left out on purpose. It limits how long the answer may be;
 * it is not part of the question. A limit that someone changes in the config
 * must not make every recorded response miss.
 */
export function requestKey<T>(request: ModelRequest<T>): string {
  return sha256Hex(
    canonicalJson({
      role: request.role,
      model: request.model,
      system: request.system,
      user: request.user,
      schema: jsonSchemaOf(request.schema),
    }),
  );
}
