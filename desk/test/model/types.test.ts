import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModelError, canonicalJson, jsonSchemaOf, requestKey, sha256Hex } from '../../src/model/types';
import type { ModelClient, ModelErrorKind, ModelRequest } from '../../src/model/types';
import { Answer, request } from '../support/requests';

// The types of the model layer, the one error it throws, and the key that names a request.

describe('the interface', () => {
  it('gives a caller the value typed by the schema it passed', async () => {
    const echo: ModelClient = {
      async json<T>(req: ModelRequest<T>) {
        return { value: req.schema.parse(JSON.parse(req.user)), usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const reply = await echo.json(request({ user: '{"answer":"hi"}' }));
    // `reply.value` is an `Answer`: this line does not compile if the type is lost on the way.
    const answer: string = reply.value.answer;
    expect(answer).toBe('hi');
    expect(reply.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
  });

  it('cannot carry a tool: a request has no field for one', () => {
    // `npm run typecheck` fails on the next line if a `tools` field is ever added to ModelRequest.
    // @ts-expect-error a request has no `tools` field
    const withTools: ModelRequest<Answer> = { ...request(), tools: [] };
    expect(withTools).toBeDefined();
  });
});

describe('ModelError', () => {
  it('is an Error that carries its kind and its message', () => {
    const error = new ModelError('schema', 'the reply is not JSON');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ModelError);
    expect(error.name).toBe('ModelError');
    expect(error.kind).toBe('schema');
    expect(error.message).toBe('the reply is not JSON');
    expect(String(error)).toBe('ModelError: the reply is not JSON');
  });

  it('has a cause only when it is given one', () => {
    const cause = new Error('socket hang up');
    expect(new ModelError('transport', 'no answer', { cause }).cause).toBe(cause);
    expect(new ModelError('transport', 'no answer').cause).toBeUndefined();
    expect('cause' in new ModelError('transport', 'no answer')).toBe(false);
  });

  it('is not retryable unless it says so', () => {
    expect(new ModelError('transport', 'no answer').retryable).toBe(false);
    expect(new ModelError('transport', 'no answer', {}).retryable).toBe(false);
    expect(new ModelError('transport', 'no answer', { retryable: false }).retryable).toBe(false);
    expect(new ModelError('transport', 'overloaded', { retryable: true }).retryable).toBe(true);
  });

  it('can be retryable only when it is a transport error', () => {
    const others: ModelErrorKind[] = ['schema', 'budget', 'unrecorded', 'refused'];
    for (const kind of others) expect(new ModelError(kind, 'x', { retryable: true }).retryable, kind).toBe(false);
  });

  it('is not unreached unless it says so: a call that never got an answer is a different thing from a provider that answered with an error', () => {
    expect(new ModelError('transport', 'no answer').unreached).toBe(false);
    expect(new ModelError('transport', 'no answer', { unreached: false }).unreached).toBe(false);
    expect(new ModelError('transport', 'Connection error.', { unreached: true }).unreached).toBe(true);
    expect(new ModelError('transport', 'overloaded', { retryable: true }).unreached).toBe(false);
    expect(new ModelError('transport', 'Connection error.', { unreached: true }).retryable).toBe(false);
  });

  it('can be unreached only when it is a transport error', () => {
    const others: ModelErrorKind[] = ['schema', 'budget', 'unrecorded', 'refused'];
    for (const kind of others) expect(new ModelError(kind, 'x', { unreached: true }).unreached, kind).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('is the SHA-256 of the text, in lowercase hex', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes the UTF-8 bytes of the text', () => {
    const cafe = 'caf' + String.fromCharCode(0xe9);
    expect(sha256Hex(cafe)).toBe('850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e');
  });
});

describe('canonicalJson', () => {
  it('gives the same text for the same data, whatever order the keys were written in', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('sorts the keys of nested objects, including those inside arrays', () => {
    expect(canonicalJson({ z: { y: 1, x: 2 }, list: [{ d: 1, c: 2 }] })).toBe('{"list":[{"c":2,"d":1}],"z":{"x":2,"y":1}}');
  });

  it('keeps the order of an array, which is part of its meaning', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ list: ['b', 'a'] })).not.toBe(canonicalJson({ list: ['a', 'b'] }));
  });

  it('writes values that are not objects as JSON does', () => {
    expect(canonicalJson('text')).toBe('"text"');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(7)).toBe('7');
    expect(canonicalJson({ gone: undefined, kept: null })).toBe('{"kept":null}');
  });
});

describe('jsonSchemaOf', () => {
  it('describes what a schema accepts', () => {
    expect(jsonSchemaOf(Answer)).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    });
  });

  it('does not fail on a schema with a transform, which cannot be described', () => {
    const trimmed = z.strictObject({ name: z.string().transform((value) => value.trim()) });
    expect(() => jsonSchemaOf(trimmed)).not.toThrow();
  });
});

describe('requestKey', () => {
  it('is 64 lowercase hex characters', () => {
    expect(requestKey(request())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the same for the same request, and for an equal request built again', () => {
    const other = z.strictObject({ answer: z.string() });
    expect(requestKey(request())).toBe(requestKey(request()));
    expect(requestKey(request({ schema: other }))).toBe(requestKey(request()));
  });

  it('is the same in every run: this request has always had this key', () => {
    // If this fails after an upgrade of zod, every recorded response would miss: record them again.
    expect(requestKey(request())).toBe('0575003e55a74cbb3b549565141ea1796d82818a3e665c88e945a038cd8f5cfa');
  });

  it('changes with the role, the model, the system prompt and the user message', () => {
    const base = requestKey(request());
    expect(requestKey(request({ role: 'verify' }))).not.toBe(base);
    expect(requestKey(request({ model: 'model-b' }))).not.toBe(base);
    expect(requestKey(request({ system: 'You answer in JSON!' }))).not.toBe(base);
    expect(requestKey(request({ user: 'Say goodbye.' }))).not.toBe(base);
  });

  it('changes with the schema of the reply', () => {
    const base = requestKey(request());
    const keys = [
      requestKey({ ...request(), schema: z.strictObject({ answer: z.string(), why: z.string() }) }),
      requestKey({ ...request(), schema: z.strictObject({ answer: z.number() }) }),
      requestKey({ ...request(), schema: z.strictObject({ reply: z.string() }) }),
    ];
    for (const key of keys) expect(key).not.toBe(base);
    expect(new Set(keys).size).toBe(3);
  });

  it('keeps the system prompt and the user message apart: moving text from one to the other changes the key', () => {
    expect(requestKey(request({ system: 'ab', user: 'c' }))).not.toBe(requestKey(request({ system: 'a', user: 'bc' })));
  });

  it('does not change with maxOutputTokens, which limits the answer and is not part of the question', () => {
    expect(requestKey(request({ maxOutputTokens: 1 }))).toBe(requestKey(request({ maxOutputTokens: 100_000 })));
  });

  it('does not depend on the order in which the fields of the request were written', () => {
    const reordered: ModelRequest<Answer> = {
      maxOutputTokens: 100,
      schema: Answer,
      user: 'Say hello.',
      system: 'You answer in JSON.',
      model: 'model-a',
      role: 'select',
    };
    expect(requestKey(reordered)).toBe(requestKey(request()));
  });
});

describe('ModelError: what a failed call cost', () => {
  it('reports no cost unless it is given one', () => {
    expect(new ModelError('transport', 'no answer').usage).toBeUndefined();
  });

  it('keeps the cost of a call that spent tokens and failed all the same', () => {
    expect(new ModelError('refused', 'cut off', { usage: { inputTokens: 7000, outputTokens: 8000 } }).usage).toEqual({ inputTokens: 7000, outputTokens: 8000 });
  });
});

describe('requestKey and the effort of a request', () => {
  it('does not depend on it, as it does not depend on the limit of the reply: how hard a model thinks is not part of the question', () => {
    const base = requestKey(request());
    expect(requestKey(request({ effort: 'low' }))).toBe(base);
    expect(requestKey(request({ effort: 'high' }))).toBe(base);
  });
});
