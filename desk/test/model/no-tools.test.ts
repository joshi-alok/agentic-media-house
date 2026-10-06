import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/config';
import { AnthropicClient } from '../../src/model/anthropic';
import type { MessageParams } from '../../src/model/anthropic';
import { clientFromConfig } from '../../src/model/factory';
import { FakeClient } from '../../src/model/fake';
import { RecordingClient } from '../../src/model/recorded';
import { request } from '../support/requests';

// No client of the Desk gives a model a tool. This file is the guard: it builds a request through
// every real path and looks at what would leave the process, and fails if it holds a tool, a tool
// choice, or anything else that lets a model call a function. The path through the real SDK is
// checked at the HTTP request, with `fetch` replaced, so nothing here reaches the network.

const KEY = 'test-key-not-real';

/** The names a request must never contain: anything that offers a model something to call. */
const FORBIDDEN = ['tools', 'tool_choice', 'tool_use', 'tool_result', 'functions', 'function_call', 'mcp_servers'];

/** Every key of a JSON value, at every depth. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  return [];
}

/** Fails unless `payload` holds none of the forbidden names, as a key at any depth. */
function expectNoTools(payload: unknown): void {
  const keys = keysOf(payload);
  for (const name of FORBIDDEN) expect(keys, `a request holds the key "${name}"`).not.toContain(name);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-no-tools-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** What the stubbed `fetch` was asked to send. */
interface Sent {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/**
 * Replace `fetch` for the SDK. It answers each request with the next text as the model's reply, and records
 * what it was asked to send. The base URL is also pointed at a local port that nothing listens on, so that
 * if the stub were ever bypassed the request could not leave this machine.
 */
function stubFetch(...texts: string[]): Sent[] {
  const sent: Sent[] = [];
  vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:9');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'model-a',
        content: [{ type: 'text', text: texts.shift() ?? '{"answer":"default"}' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 2 },
      };
      return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return sent;
}

describe('the guard itself', () => {
  it('finds a forbidden key at any depth, and not a word in a text', () => {
    expect(() => expectNoTools({ a: [{ b: { tools: [] } }] })).toThrow('a request holds the key "tools"');
    expect(() => expectNoTools({ tool_choice: { type: 'auto' } })).toThrow('tool_choice');
    expect(() => expectNoTools({ system: 'You have no tools and no functions.' })).not.toThrow();
  });
});

describe('no tools in what the clients behind the wrappers receive', () => {
  it('the fake client gets the request as the stage wrote it, with the six fields of a request and nothing more', async () => {
    const fake = new FakeClient().script('select', { answer: 'a' });
    await clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}).client.json(request());
    expect(Object.keys(fake.calls[0] as object).sort()).toEqual(['maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    expectNoTools(fake.calls[0]);
  });

  it('a cassette holds no tool, and a recorded client sends nothing anywhere', async () => {
    const dir = path.join(scratch, 'cassettes');
    await new RecordingClient(new FakeClient().script('select', { answer: 'a' }), dir).json(request());
    for (const file of readdirSync(dir)) expectNoTools(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const built = clientFromConfig(defaultConfig(), { kind: 'recorded', cassetteDir: dir }, {});
    await built.client.json(request());
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('no tools in what leaves for the API', () => {
  it('the call handed to the API by the client holds four fields and no tool, in the first request and in the repair', async () => {
    const sent: MessageParams[] = [];
    const client = new AnthropicClient({
      apiKey: KEY,
      createMessage: async (params) => {
        sent.push(params);
        const text = sent.length === 1 ? 'not json' : '{"answer":"repaired"}';
        return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
      },
    });
    await client.json(request());
    expect(sent).toHaveLength(2);
    for (const params of sent) {
      expectNoTools(params);
      expect(Object.keys(params).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    }
  });

  it('the HTTP request that the real SDK builds holds four fields and no tool, and no beta feature is switched on', async () => {
    const sent = stubFetch('{"answer":"hello"}');
    const reply = await new AnthropicClient({ apiKey: KEY }).json(request({ model: 'model-q', maxOutputTokens: 55 }));
    expect(reply.value).toEqual({ answer: 'hello' });
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0]?.url ?? '').pathname).toBe('/v1/messages');
    expectNoTools(sent[0]?.body);
    expect(Object.keys(sent[0]?.body ?? {}).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    expect(sent[0]?.body.model).toBe('model-q');
    expect(sent[0]?.body.max_tokens).toBe(55);
    expect(sent[0]?.headers.has('anthropic-beta')).toBe(false);
  });

  it('the same holds for the repair request that the real SDK builds', async () => {
    const sent = stubFetch('not json', '{"answer":"repaired"}');
    await new AnthropicClient({ apiKey: KEY }).json(request());
    expect(sent).toHaveLength(2);
    for (const one of sent) {
      expectNoTools(one.body);
      expect(Object.keys(one.body).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    }
  });

  it('the stack that the factory builds for the API holds to it too, with the key from the given environment and no other credential', async () => {
    const sent = stubFetch('{"answer":"hello"}');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'a-token-in-the-process-environment');
    const built = clientFromConfig(defaultConfig(), { kind: 'api' }, { ANTHROPIC_API_KEY: ` ${KEY}\n` });
    await built.client.json(request());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers.get('x-api-key')).toBe(KEY);
    expect(sent[0]?.headers.has('authorization')).toBe(false);
    expectNoTools(sent[0]?.body);
    expect(Object.keys(sent[0]?.body ?? {}).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    expect(built.spent()).toEqual({ calls: 1, inputTokens: 4, outputTokens: 2 });
  });
});
