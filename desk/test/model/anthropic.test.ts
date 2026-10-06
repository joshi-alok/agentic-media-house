import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicClient, replyFormat } from '../../src/model/anthropic';
import type { CreateMessage, MessageParams, MessageReply } from '../../src/model/anthropic';
import { ModelError } from '../../src/model/types';
import { Answer, request } from '../support/requests';

// The client for the Anthropic API. No test here reaches the network or needs a key: the call to the
// SDK is a function that the tests replace with a stand-in that gives scripted replies and records
// what it was sent. The key in these tests is an obvious fake.

const KEY = 'test-key-not-real';

/** A reply of the SDK holding one block of text. */
function reply(text: string, changes: Partial<MessageReply> = {}): MessageReply {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, ...changes };
}

/** A stand-in for the SDK call: it gives the outcomes in order (a reply, or an error to throw) and records every request. */
function standIn(...outcomes: (MessageReply | Error)[]): { createMessage: CreateMessage; sent: MessageParams[] } {
  const sent: MessageParams[] = [];
  const createMessage: CreateMessage = async (params) => {
    sent.push(params);
    const outcome = outcomes.shift();
    if (outcome === undefined) throw new Error('the stand-in has no outcome left');
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { createMessage, sent };
}

/** The error that a call must throw, or a failure of the test if it succeeds. */
async function failureOf(client: AnthropicClient): Promise<ModelError> {
  try {
    await client.json(request());
  } catch (error) {
    expect(error).toBeInstanceOf(ModelError);
    return error as ModelError;
  }
  throw new Error('the call succeeded');
}

/** An error of the SDK for an HTTP status, built the way the SDK builds it. */
const httpError = (status: number): Error =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type: 'api_error', message: 'something went wrong' } }, undefined, new Headers());

describe('AnthropicClient construction', () => {
  it('needs an API key, and says so without repeating anything it was given', () => {
    const { createMessage } = standIn();
    for (const apiKey of ['', '   ', '\n']) {
      expect(() => new AnthropicClient({ apiKey, createMessage }), JSON.stringify(apiKey)).toThrow('AnthropicClient needs an API key');
    }
  });

  it('is usable wherever a ModelClient is wanted', () => {
    const client = new AnthropicClient({ apiKey: KEY, createMessage: standIn().createMessage });
    expect(typeof client.json).toBe('function');
  });
});

describe('replyFormat', () => {
  it('tells the model to reply with one JSON value, and gives the JSON Schema it must satisfy', () => {
    const text = replyFormat(Answer);
    expect(text.startsWith('Reply with one JSON value and nothing else: no explanation and no code fence.')).toBe(true);
    expect(text).toContain('"required":["answer"]');
    expect(text).toContain('"properties":{"answer":{"type":"string"}}');
  });

  it('is plain ASCII: a sentence, a line break, and the schema on one line', () => {
    const text = replyFormat(Answer);
    expect(text).toMatch(/^[\x20-\x7e\n]+$/);
    expect(text.split('\n')).toHaveLength(2);
  });
});

describe('AnthropicClient success', () => {
  it('returns the value, parsed from the text of the reply and checked against the schema, and the usage', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":"hello"}'));
    const result = await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
    const answer: string = result.value.answer;
    expect(answer).toBe('hello');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(sent).toHaveLength(1);
  });

  it('sends the model, the limit on the reply, the system prompt with the reply format, and the one user message', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":"hello"}'));
    const req = request({ model: 'model-q', maxOutputTokens: 321, system: 'Be brief.', user: 'Say hello.' });
    await new AnthropicClient({ apiKey: KEY, createMessage }).json(req);
    expect(sent[0]).toEqual({
      model: 'model-q',
      max_tokens: 321,
      system: `Be brief.\n\n${replyFormat(Answer)}`,
      messages: [{ role: 'user', content: 'Say hello.' }],
    });
  });

  it('sends nothing but those four things: no tools, no tool choice, nothing else', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":"hello"}'));
    await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
    expect(Object.keys(sent[0] as object).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    expect('tools' in (sent[0] as object)).toBe(false);
    expect('tool_choice' in (sent[0] as object)).toBe(false);
  });

  it('accepts the JSON inside a code fence, with or without a language, and spaces around it', async () => {
    const texts = ['```json\n{"answer":"fenced"}\n```', '```\n{"answer":"fenced"}\n```', '  ```JSON \n{"answer":"fenced"}```\n\n', '\n\n  {"answer":"fenced"}  \n'];
    for (const text of texts) {
      const { createMessage } = standIn(reply(text));
      const result = await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
      expect(result.value, JSON.stringify(text)).toEqual({ answer: 'fenced' });
    }
  });

  it('reads a fenced value that itself contains a fence in a string', async () => {
    const value = { answer: 'use ``` to fence' };
    const { createMessage } = standIn(reply('```json\n' + JSON.stringify(value) + '\n```'));
    expect((await new AnthropicClient({ apiKey: KEY, createMessage }).json(request())).value).toEqual(value);
  });

  it('joins the text blocks of a reply, ignoring the other blocks and a text block that has no text', async () => {
    const { createMessage } = standIn(
      reply('', {
        content: [
          { type: 'thinking' },
          { type: 'text' },
          { type: 'text', text: '{"answer":' },
          { type: 'text', text: '"in two parts"}' },
        ],
      }),
    );
    expect((await new AnthropicClient({ apiKey: KEY, createMessage }).json(request())).value).toEqual({ answer: 'in two parts' });
  });

  it('counts the input tokens that were written to or read from a cache as input tokens', async () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 };
    const { createMessage } = standIn(reply('{"answer":"x"}', { usage }));
    expect((await new AnthropicClient({ apiKey: KEY, createMessage }).json(request())).usage).toEqual({ inputTokens: 1110, outputTokens: 5 });
    const nulls = standIn(reply('{"answer":"x"}', { usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null } }));
    expect((await new AnthropicClient({ apiKey: KEY, createMessage: nulls.createMessage }).json(request())).usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe('AnthropicClient repair', () => {
  it('asks once more when the reply is not JSON, showing the model its reply and what was wrong', async () => {
    const { createMessage, sent } = standIn(reply('Sure! Here you go.'), reply('{"answer":"repaired"}', { usage: { input_tokens: 20, output_tokens: 7 } }));
    const result = await new AnthropicClient({ apiKey: KEY, createMessage }).json(request({ user: 'Say hello.' }));
    expect(result.value).toEqual({ answer: 'repaired' });
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
    expect(sent).toHaveLength(2);
    const [first, second] = sent as [MessageParams, MessageParams];
    expect(second.model).toBe(first.model);
    expect(second.max_tokens).toBe(first.max_tokens);
    expect(second.system).toBe(first.system);
    expect(second.messages).toHaveLength(3);
    expect(second.messages[0]).toEqual({ role: 'user', content: 'Say hello.' });
    expect(second.messages[1]).toEqual({ role: 'assistant', content: 'Sure! Here you go.' });
    expect(second.messages[2]?.role).toBe('user');
    expect(second.messages[2]?.content).toContain('Your last reply could not be used: the reply is not valid JSON (');
    expect(second.messages[2]?.content).toContain('Reply again with only the corrected JSON value.');
    expect(Object.keys(second).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
  });

  it('asks once more when the reply is JSON of the wrong shape, and says which part is wrong', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":5}'), reply('{"answer":"fixed"}'));
    const result = await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
    expect(result.value).toEqual({ answer: 'fixed' });
    expect(sent[1]?.messages[2]?.content).toBe(
      'Your last reply could not be used: the reply does not match the required shape: answer: Invalid input: expected string, received number. Reply again with only the corrected JSON value.',
    );
  });

  it('gives the model a placeholder to show when its first reply had no text at all', async () => {
    const { createMessage, sent } = standIn(reply('', { content: [] }), reply('{"answer":"fixed"}'));
    await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
    expect(sent[1]?.messages[1]).toEqual({ role: 'assistant', content: '(empty reply)' });
  });

  it('makes one repair call and no more: a second bad reply is a schema error that keeps the cause', async () => {
    const { createMessage, sent } = standIn(reply('not json'), reply('{"answer":7}'), reply('{"answer":"never asked for"}'));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('schema');
    expect(error.message).toBe(
      'the reply is not usable, and one repair did not fix it: the reply does not match the required shape: answer: Invalid input: expected string, received number',
    );
    expect(error.cause).toBeInstanceOf(z.ZodError);
    expect(sent).toHaveLength(2);
  });

  it('keeps the parse error as the cause when the repaired reply is still not JSON', async () => {
    const { createMessage } = standIn(reply('not json'), reply('still not json'));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('schema');
    expect(error.message).toContain('the reply is not usable, and one repair did not fix it: the reply is not valid JSON (');
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it('does not repair a reply that was valid the first time', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":"first"}'), reply('{"answer":"second"}'));
    await new AnthropicClient({ apiKey: KEY, createMessage }).json(request());
    expect(sent).toHaveLength(1);
  });
});

describe('AnthropicClient errors from the API', () => {
  it.each([429, 500, 502, 503, 529, 599])('maps an HTTP %i to a transport error that is worth trying again', async (status) => {
    const failure = httpError(status);
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(failure).createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe(`the Anthropic API returned an error: ${failure.message}`);
    expect(error.cause).toBe(failure);
  });

  it.each([400, 401, 403, 404, 413, 422, 499, 600])('maps an HTTP %i to a transport error that is not worth trying again', async (status) => {
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(httpError(status)).createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(false);
  });

  it('maps a failure to reach the API, which has no HTTP status, to a transport error that is not retried', async () => {
    const failure = new Anthropic.APIConnectionError({ message: 'socket hang up' });
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(failure).createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('the Anthropic API could not be reached: socket hang up');
    expect(error.cause).toBe(failure);
  });

  it('maps any other error thrown by the call to a transport error that is not retried', async () => {
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(new Error('boom')).createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('the Anthropic API could not be reached: boom');
  });

  it.each([
    ['a string', 'boom', 'boom'],
    ['nothing at all', null, 'null'],
    ['a number', 42, '42'],
  ])('maps a thrown value that is not an error (%s) to a transport error that is not retried', async (_name, thrown, text) => {
    const createMessage: CreateMessage = async () => {
      throw thrown;
    };
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe(`the Anthropic API could not be reached: ${text}`);
  });

  it('lets a ModelError through as it is', async () => {
    const given = new ModelError('budget', 'budget spent');
    expect(await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(given).createMessage }))).toBe(given);
  });

  it('maps the errors of the repair call in the same way', async () => {
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage: standIn(reply('not json'), httpError(529)).createMessage }));
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(true);
  });
});

describe('AnthropicClient replies that are not an answer', () => {
  it('maps a refusal to a refused error, and does not try to repair it', async () => {
    const { createMessage, sent } = standIn(reply('I cannot help with that.', { stop_reason: 'refusal' }), reply('{"answer":"never asked for"}'));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('refused');
    expect(error.message).toBe('the model declined to answer');
    expect(sent).toHaveLength(1);
  });

  it('maps a reply cut off at the output limit to a refused error, even when what came is valid JSON', async () => {
    const { createMessage, sent } = standIn(reply('{"answer":"complete"}', { stop_reason: 'max_tokens' }));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('refused');
    expect(error.message).toBe('the reply was cut off at the output limit');
    expect(sent).toHaveLength(1);
  });

  it.each(['tool_use', 'pause_turn', 'model_context_window_exceeded', 'stop_sequence', null])('maps the stop reason %s to a refused error that names it', async (reason) => {
    const { createMessage } = standIn(reply('{"answer":"x"}', { stop_reason: reason }));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('refused');
    expect(error.message).toBe(`the model stopped before it finished its answer: stop reason ${reason ?? 'none'}`);
  });

  it('refuses in the same way when it is the repaired reply that stopped early', async () => {
    const { createMessage } = standIn(reply('not json'), reply('{"answer":"x"}', { stop_reason: 'max_tokens' }));
    const error = await failureOf(new AnthropicClient({ apiKey: KEY, createMessage }));
    expect(error.kind).toBe('refused');
  });
});
