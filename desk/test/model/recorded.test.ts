import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeClient } from '../../src/model/fake';
import { RecordedClient, RecordingClient, cassettePath } from '../../src/model/recorded';
import { ModelError, requestKey, sha256Hex } from '../../src/model/types';
import type { ModelClient, ModelRequest, ModelResponse } from '../../src/model/types';
import { Answer, request } from '../support/requests';

// A cassette is one JSON file for one request, named by the key of the request. A recording client
// writes them while it forwards calls to a real model; a recorded client replays them with no model.
// Together they let a test run on real responses without a network, and they refuse anything new.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-cassettes-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** The path of a folder that does not exist yet; the recording client has to create it. */
const freshDir = (): string => path.join(scratch, `cassettes-${++counter}`, 'nested');

/** The error that a call must throw, or a failure of the test if the call succeeds. */
async function failureOf(client: ModelClient, req: ModelRequest<Answer> = request()): Promise<ModelError> {
  try {
    await client.json(req);
  } catch (error) {
    expect(error).toBeInstanceOf(ModelError);
    return error as ModelError;
  }
  throw new Error('the call succeeded');
}

/** Record the reply `{ answer }` for `req` into `dir`. */
async function record(dir: string, req: ModelRequest<Answer>, answer = 'recorded'): Promise<void> {
  await new RecordingClient(new FakeClient().script(req.role, { answer }), dir).json(req);
}

describe('cassettePath', () => {
  it('is the folder, then the key, then .json', () => {
    expect(cassettePath('some/dir', 'abc')).toBe(path.join('some/dir', 'abc.json'));
  });
});

describe('RecordingClient', () => {
  it('returns what the client behind it returns, and passes the request on unchanged', async () => {
    const inner = new FakeClient().script('select', { answer: 'hi' });
    const req = request();
    const reply = await new RecordingClient(inner, freshDir()).json(req);
    expect(reply.value).toEqual({ answer: 'hi' });
    expect(reply.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
    expect(inner.calls).toEqual([req]);
  });

  it('writes one file named by the key of the request, and creates the folder for it', async () => {
    const dir = freshDir();
    await record(dir, request());
    expect(readdirSync(dir)).toEqual([`${requestKey(request())}.json`]);
  });

  it('writes the request as its hashes, never its text, with the response beside it', async () => {
    const dir = freshDir();
    const req = request({ system: 'SYSTEM TEXT', user: 'USER TEXT', model: 'model-z', role: 'verify' });
    await record(dir, req, 'the answer');
    const text = readFileSync(cassettePath(dir, requestKey(req)), 'utf8');
    expect(text).toBe(
      JSON.stringify(
        {
          key: requestKey(req),
          request: { role: 'verify', model: 'model-z', systemHash: sha256Hex('SYSTEM TEXT'), userHash: sha256Hex('USER TEXT') },
          response: { value: { answer: 'the answer' }, usage: { inputTokens: 6, outputTokens: 6 } },
        },
        null,
        2,
      ) + '\n',
    );
    expect(text).not.toContain('SYSTEM TEXT');
    expect(text).not.toContain('USER TEXT');
  });

  it('holds nothing that could be a key: only the key of the request, the hashes, the model name and the response', async () => {
    const dir = freshDir();
    await record(dir, request());
    const cassette = JSON.parse(readFileSync(cassettePath(dir, requestKey(request())), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(cassette).sort()).toEqual(['key', 'request', 'response']);
    expect(Object.keys(cassette.request as object).sort()).toEqual(['model', 'role', 'systemHash', 'userHash']);
    expect(Object.keys(cassette.response as object).sort()).toEqual(['usage', 'value']);
    expect(JSON.stringify(cassette)).not.toMatch(/api[-_]?key|secret|token_?auth|bearer/i);
  });

  it('writes a file for each different request, and one file for the same request recorded twice', async () => {
    const dir = freshDir();
    await record(dir, request({ user: 'one' }));
    await record(dir, request({ user: 'two' }));
    await record(dir, request({ user: 'two' }), 'recorded again');
    expect(readdirSync(dir).sort()).toEqual([`${requestKey(request({ user: 'one' }))}.json`, `${requestKey(request({ user: 'two' }))}.json`].sort());
  });

  it('records only a call that succeeded, and lets the error through untouched', async () => {
    const dir = freshDir();
    const failure = new ModelError('transport', 'overloaded', { retryable: true });
    const error = await failureOf(new RecordingClient(new FakeClient().script('select', failure), dir));
    expect(error).toBe(failure);
    expect(existsSync(dir)).toBe(false);
  });
});

describe('RecordingClient when a paid response cannot be written', () => {
  // The call has already been answered, and paid for, when the cassette is written. A write that fails
  // must not make the tokens disappear: the error carries them, so that the budget counts the call.
  const paid = { inputTokens: 20_000, outputTokens: 7_000 };
  const secrets = { system: 'SYSTEM TEXT of a prompt', user: 'PAGE TEXT of a source', answer: 'ANSWER TEXT of a model' };

  /** A client that answers every call with the secret reply and the usage that was paid for, and counts the calls. */
  const answering = (): ModelClient & { calls: number } => {
    const client = {
      calls: 0,
      json: async <T,>(): Promise<ModelResponse<T>> => {
        client.calls += 1;
        return { value: { answer: secrets.answer } as T, usage: paid };
      },
    };
    return client;
  };

  /** A folder that cannot be created, because a file is where its parent should be. */
  function folderUnderAFile(): string {
    const file = path.join(scratch, `not-a-folder-${++counter}`);
    writeFileSync(file, 'a file');
    return path.join(file, 'cassettes');
  }

  /** A folder that exists, but whose cassette cannot be written, because a folder is where the file should be. */
  function folderWithABlockedCassette(req: ModelRequest<Answer>): string {
    const dir = freshDir();
    mkdirSync(cassettePath(dir, requestKey(req)), { recursive: true });
    return dir;
  }

  const cases: [string, (req: ModelRequest<Answer>) => string][] = [
    ['the folder cannot be created', folderUnderAFile],
    ['the file cannot be written', folderWithABlockedCassette],
  ];

  for (const [when, dirFor] of cases) {
    describe(`when ${when}`, () => {
      const req = request({ system: secrets.system, user: secrets.user });
      const failing = async (): Promise<{ error: ModelError; dir: string; inner: { calls: number } }> => {
        const dir = dirFor(req);
        const inner = answering();
        return { error: await failureOf(new RecordingClient(inner, dir), req), dir, inner };
      };

      it('fails with an unrecorded error that carries the usage of the response, and is not retryable', async () => {
        const { error, inner } = await failing();
        expect(error.kind).toBe('unrecorded');
        expect(error.usage).toEqual(paid);
        expect(error.retryable).toBe(false);
        expect(inner.calls).toBe(1);
      });

      it('names the problem, the role and the folder, and says the call was paid for', async () => {
        const { error, dir } = await failing();
        expect(error.message).toMatch(/^the response to this select request was paid for but could not be recorded in /);
        expect(error.message).toContain(dir);
        expect(error.message).toMatch(/\b(ENOTDIR|EEXIST|EISDIR|ENOENT)\b/);
      });

      it('holds no text of a page, a prompt or a reply, and keeps the error that was thrown as its cause', async () => {
        const { error } = await failing();
        for (const text of Object.values(secrets)) expect(error.message).not.toContain(text);
        expect(error.cause).toBeInstanceOf(Error);
      });
    });
  }

  it('does not wrap an error of the client behind it: it is let through untouched, as before', async () => {
    const failure = new ModelError('refused', 'cut off', { usage: paid });
    expect(await failureOf(new RecordingClient({ json: async () => Promise.reject(failure) }, folderUnderAFile()))).toBe(failure);
  });
});

describe('RecordedClient replay', () => {
  it('gives back what a recording client wrote: the value and the usage', async () => {
    const dir = freshDir();
    await record(dir, request(), 'from the cassette');
    const reply = await new RecordedClient(dir).json(request());
    const answer: string = reply.value.answer;
    expect(answer).toBe('from the cassette');
    expect(reply.usage).toEqual({ inputTokens: 8, outputTokens: 8 });
  });

  it('finds each request by its key, whatever order they come in, and for every role', async () => {
    const dir = freshDir();
    const roles = ['select', 'extract', 'compose', 'verify'] as const;
    for (const role of roles) await record(dir, request({ role }), `reply of ${role}`);
    const replay = new RecordedClient(dir);
    for (const role of [...roles].reverse()) expect((await replay.json(request({ role }))).value.answer).toBe(`reply of ${role}`);
  });

  it('replays the same request as often as it is asked', async () => {
    const dir = freshDir();
    await record(dir, request());
    const replay = new RecordedClient(dir);
    expect((await replay.json(request())).value).toEqual((await replay.json(request())).value);
  });

  it('replays a request for a model with a one-character name', async () => {
    const dir = freshDir();
    await record(dir, request({ model: 'm' }));
    expect((await new RecordedClient(dir).json(request({ model: 'm' }))).value.answer).toBe('recorded');
  });

  it('still finds the response when only maxOutputTokens has changed', async () => {
    const dir = freshDir();
    await record(dir, request({ maxOutputTokens: 100 }));
    expect((await new RecordedClient(dir).json(request({ maxOutputTokens: 5000 }))).value.answer).toBe('recorded');
  });
});

describe('RecordedClient refuses what was not recorded', () => {
  it('says which request it could not find: its role, its key and the folder', async () => {
    const dir = freshDir();
    await record(dir, request());
    const asked = request({ role: 'compose', user: 'something new' });
    const error = await failureOf(new RecordedClient(dir), asked);
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toBe(`no recorded response for this compose request (key ${requestKey(asked)}) in ${dir}`);
  });

  it('misses when the prompt changed, the model changed, the role changed or the schema changed', async () => {
    const dir = freshDir();
    await record(dir, request());
    const replay = new RecordedClient(dir);
    const changed: ModelRequest<Answer>[] = [
      request({ system: 'You answer in JSON, politely.' }),
      request({ user: 'Say hello!' }),
      request({ model: 'model-b' }),
      request({ role: 'extract' }),
      { ...request(), schema: z.strictObject({ answer: z.string().min(1) }) },
    ];
    for (const req of changed) expect((await failureOf(replay, req)).kind).toBe('unrecorded');
  });

  it('refuses everything when there is no cassette folder at all', async () => {
    const error = await failureOf(new RecordedClient(path.join(scratch, 'does-not-exist')));
    expect(error.kind).toBe('unrecorded');
  });
});

describe('RecordedClient refuses a damaged cassette', () => {
  /** Record the sample request, then replace its file by `change` of the recorded cassette. */
  async function damaged(change: (cassette: Record<string, unknown>) => unknown): Promise<ModelError> {
    const dir = freshDir();
    await record(dir, request());
    const file = cassettePath(dir, requestKey(request()));
    writeFileSync(file, JSON.stringify(change(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)));
    return failureOf(new RecordedClient(dir));
  }

  it('when the file is not JSON', async () => {
    const dir = freshDir();
    await record(dir, request());
    const file = cassettePath(dir, requestKey(request()));
    writeFileSync(file, '{ "key": ');
    const error = await failureOf(new RecordedClient(dir));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toBe(`the cassette ${requestKey(request())}.json is not valid JSON`);
  });

  it('when a part of it is missing, naming the part', async () => {
    const error = await damaged(({ key, request: part }) => ({ key, request: part }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toBe(`the cassette ${requestKey(request())}.json is not a valid cassette: response: Invalid input: expected object, received undefined`);
  });

  it('when it holds a field that a cassette does not have, such as a secret someone pasted into it', async () => {
    const error = await damaged((cassette) => ({ ...cassette, apiKey: 'not-a-real-key' }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toContain('Unrecognized key: "apiKey"');
  });

  it('when it names no model', async () => {
    const error = await damaged((cassette) => ({ ...cassette, request: { ...(cassette.request as object), model: '' } }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toContain('request.model');
  });

  it('when its hashes are not hashes', async () => {
    const error = await damaged((cassette) => ({ ...cassette, request: { ...(cassette.request as object), userHash: 'abc' } }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toContain('request.userHash');
  });

  it('when it is not the cassette of the request that found it (the file was renamed or copied)', async () => {
    const error = await damaged((cassette) => ({ ...cassette, key: 'f'.repeat(64) }));
    expect(error.kind).toBe('unrecorded');
    expect(error.message).toBe(`the cassette ${requestKey(request())}.json was recorded for another request`);
  });

  it('when its response no longer fits the schema: a schema error, as a bad reply from a model gives', async () => {
    const error = await damaged((cassette) => ({ ...cassette, response: { ...(cassette.response as object), value: { answer: 5 } } }));
    expect(error.kind).toBe('schema');
    expect(error.message).toBe(`the recorded reply in ${requestKey(request())}.json does not match its schema: answer: Invalid input: expected string, received number`);
  });
});
