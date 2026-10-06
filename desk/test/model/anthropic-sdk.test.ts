import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicClient } from '../../src/model/anthropic';
import { request } from '../support/requests';

// The part of the client that anthropic.test.ts replaces: the call that goes through the SDK. Here the
// whole SDK is replaced by a stand-in class that records how it was built and what it was asked, so the
// default path is tested without a network and without a key. The key is an obvious fake.

const sdk = vi.hoisted(() => ({ built: [] as unknown[], asked: [] as unknown[], reply: undefined as unknown }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class StandInForTheSdk {
    messages = {
      create: async (params: unknown) => {
        sdk.asked.push(params);
        return sdk.reply;
      },
    };

    constructor(options: unknown) {
      sdk.built.push(options);
    }
  },
}));

const KEY = 'test-key-not-real';

beforeEach(() => {
  sdk.built.length = 0;
  sdk.asked.length = 0;
  sdk.reply = { content: [{ type: 'text', text: '{"answer":"from the sdk"}' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 2 } };
});

describe('AnthropicClient through the SDK', () => {
  it('builds the SDK client with the key it was given, no retrying of its own, no token from the environment, and a time limit', () => {
    new AnthropicClient({ apiKey: KEY });
    expect(sdk.built).toEqual([{ apiKey: KEY, authToken: null, maxRetries: 0, timeout: 120_000 }]);
  });

  it('asks the SDK with the four fields it sends and nothing else, and returns the value in the reply', async () => {
    const reply = await new AnthropicClient({ apiKey: KEY }).json(request({ model: 'model-q', maxOutputTokens: 77, user: 'Say hello.' }));
    expect(reply.value).toEqual({ answer: 'from the sdk' });
    expect(reply.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
    expect(sdk.asked).toHaveLength(1);
    const params = sdk.asked[0] as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    expect(params.model).toBe('model-q');
    expect(params.max_tokens).toBe(77);
    expect(params.messages).toEqual([{ role: 'user', content: 'Say hello.' }]);
  });

  it('does not build the SDK client when it is given a call of its own', () => {
    new AnthropicClient({ apiKey: KEY, createMessage: async () => ({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } }) });
    expect(sdk.built).toEqual([]);
  });

  it('refuses an empty key before the SDK client is built', () => {
    expect(() => new AnthropicClient({ apiKey: '' })).toThrow('AnthropicClient needs an API key');
    expect(sdk.built).toEqual([]);
  });
});
