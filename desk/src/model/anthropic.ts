import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { describeIssues } from '../issues';
import { ModelError, jsonSchemaOf } from './types';
import type { ModelClient, ModelRequest, ModelResponse, ModelUsage } from './types';

// The client for the Anthropic API. It sends a system prompt and one user message and a limit on
// the reply, and nothing else: it has no way to send a tool. It reads the text of the reply as
// JSON and checks it against the schema of the request. A reply that cannot be used gets one
// repair call, in which the model is shown what was wrong; after that the call fails.

/**
 * What this client sends to the API: exactly these four fields. There is no field for a tool
 * or a tool choice, so none can be sent. (The SDK accepts much more; this is the part used.)
 */
export interface MessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** What this client reads of the API's reply. (The SDK's reply has much more.) */
export interface MessageReply {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

/** One call of the API. The default is the SDK's; a test passes a stand-in. */
export type CreateMessage = (params: MessageParams) => Promise<MessageReply>;

export interface AnthropicClientOptions {
  apiKey: string;
  createMessage?: CreateMessage;
}

/** How long one call may take before it is given up: two minutes. */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * The SDK's call, for one key. The SDK's own retrying is switched off (`maxRetries: 0`) because
 * `RetryClient` does the retrying, and every try must count against the run's budget. The SDK
 * would otherwise take a token from the environment as well as the key; `authToken: null` stops that.
 */
function sdkCreateMessage(apiKey: string): CreateMessage {
  const sdk = new Anthropic({ apiKey, authToken: null, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
  return (params) => sdk.messages.create(params);
}

/** The paragraph that tells the model what its reply must look like, with the JSON Schema of the schema. */
export function replyFormat<T>(schema: z.ZodType<T>): string {
  return `Reply with one JSON value and nothing else: no explanation and no code fence. The value must satisfy this JSON Schema:\n${JSON.stringify(jsonSchemaOf(schema))}`;
}

/** The JSON inside a code fence if the whole text is one fenced block, else the text without the spaces around it. */
function unfence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[A-Za-z0-9_-]*[ \t]*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

/** The HTTP status that an error carries, if it carries one: an error of the SDK for an answer that was not a success. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** An error of the call itself as a transport error; only a 429 and a 5xx are worth trying again. */
function transportError(error: unknown): ModelError {
  const message = error instanceof Error ? error.message : String(error);
  const status = statusOf(error);
  if (status === undefined) return new ModelError('transport', `the Anthropic API could not be reached: ${message}`, { cause: error });
  const retryable = status === 429 || (status >= 500 && status <= 599);
  return new ModelError('transport', `the Anthropic API returned an error: ${message}`, { cause: error, retryable });
}

/** The error for a reply that stopped without being a finished answer. */
function unfinished(stopReason: string | null): ModelError {
  if (stopReason === 'refusal') return new ModelError('refused', 'the model declined to answer');
  if (stopReason === 'max_tokens') return new ModelError('refused', 'the reply was cut off at the output limit');
  return new ModelError('refused', `the model stopped before it finished its answer: stop reason ${stopReason ?? 'none'}`);
}

type Reading<T> = { ok: true; value: T } | { ok: false; problem: string; cause: unknown };

/** The text of a reply as a value of the schema, or what is wrong with it. */
function read<T>(text: string, schema: z.ZodType<T>): Reading<T> {
  let data: unknown;
  try {
    data = JSON.parse(unfence(text));
  } catch (error) {
    return { ok: false, problem: `the reply is not valid JSON (${(error as Error).message})`, cause: error };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, problem: `the reply does not match the required shape: ${describeIssues(parsed.error)}`, cause: parsed.error };
  return { ok: true, value: parsed.data };
}

export class AnthropicClient implements ModelClient {
  private readonly createMessage: CreateMessage;

  /** The key must not be empty. It is used only to build the SDK's client; it is never written into an error or a log. */
  constructor(options: AnthropicClientOptions) {
    if (options.apiKey.trim() === '') throw new Error('AnthropicClient needs an API key, and the one it was given is empty');
    this.createMessage = options.createMessage ?? sdkCreateMessage(options.apiKey);
  }

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    const base = { model: request.model, max_tokens: request.maxOutputTokens, system: `${request.system}\n\n${replyFormat(request.schema)}` };
    const user = { role: 'user' as const, content: request.user };

    const first = await this.ask({ ...base, messages: [user] });
    const reading = read(first.text, request.schema);
    if (reading.ok) return { value: reading.value, usage: first.usage };

    // One repair: show the model its reply and what was wrong with it.
    const repair = [
      user,
      { role: 'assistant' as const, content: first.text === '' ? '(empty reply)' : first.text },
      { role: 'user' as const, content: `Your last reply could not be used: ${reading.problem}. Reply again with only the corrected JSON value.` },
    ];
    const second = await this.ask({ ...base, messages: repair });
    const usage = { inputTokens: first.usage.inputTokens + second.usage.inputTokens, outputTokens: first.usage.outputTokens + second.usage.outputTokens };
    const again = read(second.text, request.schema);
    if (again.ok) return { value: again.value, usage };
    throw new ModelError('schema', `the reply is not usable, and one repair did not fix it: ${again.problem}`, { cause: again.cause });
  }

  /** One call of the API: the text of the reply and what it cost, or the error it is mapped to. */
  private async ask(params: MessageParams): Promise<{ text: string; usage: ModelUsage }> {
    let message: MessageReply;
    try {
      message = await this.createMessage(params);
    } catch (error) {
      throw error instanceof ModelError ? error : transportError(error);
    }
    if (message.stop_reason !== 'end_turn') throw unfinished(message.stop_reason);
    const { usage } = message;
    return {
      text: message.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join(''),
      usage: {
        inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
      },
    };
  }
}
