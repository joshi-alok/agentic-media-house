import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeClient } from '../../src/model/fake';
import { ModelError } from '../../src/model/types';
import type { ModelClient, ModelRequest } from '../../src/model/types';
import { Answer, request } from '../support/requests';

// The fake is what every test of a stage uses instead of a model. It answers from a script,
// one queue of replies for each role, and it fails the way a bad model fails.

/** The error thrown by a call that must fail, or a failure of the test if the call succeeds. */
async function failureOf(client: ModelClient, req: ModelRequest<Answer> = request()): Promise<ModelError> {
  try {
    await client.json(req);
  } catch (error) {
    expect(error).toBeInstanceOf(ModelError);
    return error as ModelError;
  }
  throw new Error('the call succeeded');
}

describe('FakeClient replies', () => {
  it('gives the scripted value, typed by the schema of the request', async () => {
    const client = new FakeClient().script('select', { answer: 'hi' });
    const reply = await client.json(request());
    const answer: string = reply.value.answer;
    expect(answer).toBe('hi');
  });

  it('is usable wherever a ModelClient is wanted', () => {
    const client: ModelClient = new FakeClient();
    expect(typeof client.json).toBe('function');
  });

  it('gives the replies of a role in the order they were scripted, one for each call', async () => {
    const client = new FakeClient().script('select', { answer: 'first' }, { answer: 'second' });
    client.script('select', { answer: 'third' });
    expect((await client.json(request())).value.answer).toBe('first');
    expect((await client.json(request())).value.answer).toBe('second');
    expect((await client.json(request())).value.answer).toBe('third');
  });

  it('keeps a queue for each role', async () => {
    const client = new FakeClient().script('select', { answer: 'S' }).script('compose', { answer: 'C' });
    expect((await client.json(request({ role: 'compose' }))).value.answer).toBe('C');
    expect((await client.json(request({ role: 'select' }))).value.answer).toBe('S');
  });

  it('counts the replies that have not been used yet', async () => {
    const client = new FakeClient();
    expect(client.pending('select')).toBe(0);
    client.script('select', { answer: 'a' }, { answer: 'b' }).script('verify', { answer: 'c' });
    expect(client.pending('select')).toBe(2);
    expect(client.pending('verify')).toBe(1);
    await client.json(request());
    expect(client.pending('select')).toBe(1);
    expect(client.pending('verify')).toBe(1);
  });

  it('lets a function choose the reply from the request', async () => {
    const client = new FakeClient().script('select', (req: ModelRequest<unknown>) => ({ answer: `you said: ${req.user}` }));
    const reply = await client.json(request({ user: 'Say hello.' }));
    expect(reply.value).toEqual({ answer: 'you said: Say hello.' });
  });

  it('applies the schema defaults, so the caller gets the value the schema describes', async () => {
    const Defaulted = z.strictObject({ answer: z.string(), rounds: z.number().default(7) });
    const client = new FakeClient().script('select', { answer: 'hi' });
    const reply = await client.json({ ...request(), schema: Defaulted });
    expect(reply.value).toEqual({ answer: 'hi', rounds: 7 });
  });
});

describe('FakeClient failures', () => {
  it('refuses a call that nothing was scripted for: an unrecorded error naming the role', async () => {
    const error = await failureOf(new FakeClient(), request({ role: 'extract' }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toBe('the fake client has no scripted reply left for the extract role');
  });

  it('refuses a call when the replies of its role have all been used, and does not touch other roles', async () => {
    const client = new FakeClient().script('select', { answer: 'only' }).script('verify', { answer: 'kept' });
    await client.json(request());
    expect((await failureOf(client)).kind).toBe('unrecorded');
    expect(client.pending('verify')).toBe(1);
  });

  it('throws a scripted ModelError as it is, keeping its kind and whether it is retryable', async () => {
    const scripted = new ModelError('transport', 'overloaded', { retryable: true });
    const error = await failureOf(new FakeClient().script('select', scripted));
    expect(error).toBe(scripted);
    expect(error.kind).toBe('transport');
    expect(error.retryable).toBe(true);
  });

  it('throws a ModelError that a function returns, and an error that a function throws', async () => {
    const returned = new ModelError('refused', 'no');
    expect(await failureOf(new FakeClient().script('select', () => returned))).toBe(returned);
    const thrown = new ModelError('budget', 'spent');
    const client = new FakeClient().script('select', () => {
      throw thrown;
    });
    expect(await failureOf(client)).toBe(thrown);
  });

  it('fails like a bad model when a scripted value does not match the schema: a schema error naming the field', async () => {
    const error = await failureOf(new FakeClient().script('select', { answer: 5 }));
    expect(error.kind).toBe('schema');
    expect(error.message).toBe('the reply for the select role does not match its schema: answer: Invalid input: expected string, received number');
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });

  it('treats a string as the raw text of a reply: JSON is parsed and then checked against the schema', async () => {
    const good = await new FakeClient().script('select', '{"answer":"from text"}').json(request());
    expect(good.value).toEqual({ answer: 'from text' });
    const wrongShape = await failureOf(new FakeClient().script('select', '{"reply":"x"}'));
    expect(wrongShape.kind).toBe('schema');
    expect(wrongShape.message).toContain('does not match its schema');
  });

  it('fails with a schema error when the raw text is not JSON, and keeps the parse error as the cause', async () => {
    const error = await failureOf(new FakeClient().script('select', 'Sure! Here is the answer.'));
    expect(error.kind).toBe('schema');
    expect(error.message).toBe('the reply for the select role is not valid JSON');
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it('uses up a bad reply like any other, so the next call gets the next reply', async () => {
    const client = new FakeClient().script('select', 'not json', { answer: 'fine' });
    expect((await failureOf(client)).kind).toBe('schema');
    expect((await client.json(request())).value.answer).toBe('fine');
  });
});

describe('FakeClient calls', () => {
  it('starts with no calls', () => {
    expect(new FakeClient().calls).toEqual([]);
  });

  it('records every request, in order, with the fields the stage sent', async () => {
    const client = new FakeClient().script('select', { answer: 'a' }).script('verify', { answer: 'b' });
    const first = request({ user: 'one' });
    const second = request({ role: 'verify', user: 'two', model: 'model-b', maxOutputTokens: 7 });
    await client.json(first);
    await client.json(second);
    expect(client.calls).toEqual([first, second]);
    expect(client.calls[1]?.maxOutputTokens).toBe(7);
  });

  it('records a call that fails, whether the reply was bad or there was none', async () => {
    const client = new FakeClient().script('select', 'not json');
    await failureOf(client, request({ user: 'bad reply' }));
    await failureOf(client, request({ user: 'no reply' }));
    expect(client.calls.map((call) => call.user)).toEqual(['bad reply', 'no reply']);
  });
});

describe('FakeClient usage', () => {
  it('reports about one token for four characters, rounded up, of the prompts and of the reply', async () => {
    // system 'You answer in JSON.' is 19 characters (5 tokens) and user 'Say hello.' is 10 (3 tokens);
    // the reply {"answer":"hi"} is 15 characters (4 tokens).
    const reply = await new FakeClient().script('select', { answer: 'hi' }).json(request());
    expect(reply.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
  });

  it('measures the text of a raw reply as it was scripted', async () => {
    const reply = await new FakeClient().script('select', '{ "answer": "hello there" }').json(request());
    expect(reply.usage.outputTokens).toBe(7);
  });

  it('gives the same usage for the same call every time', async () => {
    const client = new FakeClient().script('select', { answer: 'hi' }, { answer: 'hi' });
    const first = await client.json(request());
    const second = await client.json(request());
    expect(second.usage).toEqual(first.usage);
  });
});
