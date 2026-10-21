import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/config';
import { clientFromConfig } from '../../src/model/factory';
import type { ClientChoice } from '../../src/model/factory';
import { FakeClient } from '../../src/model/fake';
import { RecordingClient } from '../../src/model/recorded';
import { ModelError } from '../../src/model/types';
import type { ModelClient } from '../../src/model/types';
import { request } from '../support/requests';

// The factory picks the client for a run and wraps it: retrying around budgeting around the client.
// The choice is made by whoever starts the run; the key comes from the environment they hand over,
// and the factory never looks at the real process environment itself.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-factory-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Waits for nothing, so a test of retrying needs no clock. */
const noWait = { sleep: async (): Promise<void> => undefined };
const overloaded = (): ModelError => new ModelError('transport', 'overloaded', { retryable: true });
const unreached = (): ModelError => new ModelError('transport', 'the Anthropic API could not be reached: Connection error.', { unreached: true });

describe('clientFromConfig with the fake client', () => {
  it('asks the fake client it was given and returns its answers', async () => {
    const fake = new FakeClient().script('select', { answer: 'scripted' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {});
    const reply = await built.client.json(request());
    expect(reply.value).toEqual({ answer: 'scripted' });
    expect(fake.calls).toEqual([request()]);
  });

  it('needs no key', () => {
    expect(() => clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient() }, {})).not.toThrow();
  });
});

describe('clientFromConfig with a folder to record in', () => {
  it('keeps a cassette of every call the chosen client answers, which a recorded client then replays', async () => {
    const dir = path.join(scratch, 'recording');
    const fake = new FakeClient().script('select', { answer: 'one' }, { answer: 'two' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait, dir);
    await built.client.json(request());
    await built.client.json(request({ user: 'Say goodbye.' }));
    expect(readdirSync(dir)).toHaveLength(2);
    const replay = clientFromConfig(defaultConfig(), { kind: 'recorded', cassetteDir: dir }, {});
    expect((await replay.client.json(request())).value).toEqual({ answer: 'one' });
    expect((await replay.client.json(request({ user: 'Say goodbye.' }))).value).toEqual({ answer: 'two' });
  });

  it('records nothing for a call that fails, and creates no folder when there is no call', async () => {
    const dir = path.join(scratch, 'failing');
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient() }, {}, noWait, dir);
    expect(existsSync(dir)).toBe(false);
    await expect(built.client.json(request())).rejects.toThrow('no scripted reply left');
    expect(existsSync(dir)).toBe(false);
  });

  it('records a call that succeeds after a retry, once, and counts every try against the budget', async () => {
    const dir = path.join(scratch, 'retrying');
    const flaky = new FakeClient().script('select', overloaded(), { answer: 'second try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: flaky }, {}, noWait, dir);
    await built.client.json(request());
    expect(readdirSync(dir)).toHaveLength(1);
    expect(built.spent().calls).toBe(2);
  });

  it('records nothing when it is not given a folder', async () => {
    const before = readdirSync(scratch).length;
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient().script('select', { answer: 'x' }) }, {});
    await built.client.json(request());
    expect(readdirSync(scratch)).toHaveLength(before);
  });
});

describe('clientFromConfig with a layer to put round the chosen client', () => {
  /** A layer that counts the calls that reach the chosen client, and keeps what each was asked. */
  const counting = () => {
    const seen: string[] = [];
    return { seen, wrap: (inner: ModelClient): ModelClient => ({ json: async (call) => (seen.push(call.user), inner.json(call)) }) };
  };

  it('puts it directly round the chosen client, so that it sees each call that reaches the model and the answer that the model gives', async () => {
    const layer = counting();
    const fake = new FakeClient().script('select', { answer: 'one' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait, undefined, layer.wrap);
    expect((await built.client.json(request())).value).toEqual({ answer: 'one' });
    expect(layer.seen).toEqual([request().user]);
    expect(fake.calls).toHaveLength(1);
  });

  it('sees every try of a call that is retried, because the retrying is outside it, and the budget counts the same tries', async () => {
    const layer = counting();
    const flaky = new FakeClient().script('select', overloaded(), { answer: 'second try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: flaky }, {}, noWait, undefined, layer.wrap);
    await built.client.json(request());
    expect(layer.seen).toHaveLength(2);
    expect(built.spent().calls).toBe(2);
  });

  it('sees a call that the budget refuses never, because the budget is outside it', async () => {
    const layer = counting();
    const config = { ...defaultConfig(), budget: { ...defaultConfig().budget, maxCalls: 1 } };
    const built = clientFromConfig(config, { kind: 'fake', fake: new FakeClient().script('select', { answer: 'a' }, { answer: 'b' }) }, {}, noWait, undefined, layer.wrap);
    await built.client.json(request());
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'budget' });
    expect(layer.seen).toHaveLength(1);
  });

  it('is put round a client that is recorded too, inside the recording, so that a layer that refuses a call leaves no cassette', async () => {
    const dir = path.join(scratch, 'wrapped-recording');
    const refusing = (): ModelClient => ({
      json: async () => {
        throw new Error('the layer refused');
      },
    });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient().script('select', { answer: 'x' }) }, {}, noWait, dir, refusing);
    await expect(built.client.json(request())).rejects.toThrow('the layer refused');
    expect(existsSync(dir)).toBe(false);
  });

  it('still needs the key of the api client, and refuses before it builds the layer', () => {
    let built = false;
    expect(() =>
      clientFromConfig(defaultConfig(), { kind: 'api' }, {}, noWait, undefined, (client) => {
        built = true;
        return client;
      }),
    ).toThrow('ANTHROPIC_API_KEY is not set');
    expect(built).toBe(false);
  });
});

describe('clientFromConfig with recorded responses', () => {
  it('replays the cassettes in the folder it was given', async () => {
    const dir = path.join(scratch, 'cassettes');
    await new RecordingClient(new FakeClient().script('select', { answer: 'recorded' }), dir).json(request());
    const built = clientFromConfig(defaultConfig(), { kind: 'recorded', cassetteDir: dir }, {});
    expect((await built.client.json(request())).value).toEqual({ answer: 'recorded' });
  });

  it('refuses a request that has no cassette, and does not retry that', async () => {
    const built = clientFromConfig(defaultConfig(), { kind: 'recorded', cassetteDir: path.join(scratch, 'empty') }, {}, noWait);
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'unrecorded' });
    expect(built.spent().calls).toBe(1);
  });
});

describe('clientFromConfig with the API', () => {
  const api: ClientChoice = { kind: 'api' };

  it('needs ANTHROPIC_API_KEY in the environment it is given, and says so', () => {
    expect(() => clientFromConfig(defaultConfig(), api, {})).toThrow('ANTHROPIC_API_KEY is not set: the api client needs it in the environment');
  });

  it('refuses a key that is empty or only spaces', () => {
    for (const key of ['', '   ']) {
      expect(() => clientFromConfig(defaultConfig(), api, { ANTHROPIC_API_KEY: key }), JSON.stringify(key)).toThrow('ANTHROPIC_API_KEY is not set');
    }
  });

  it('reads the key from the environment it is given and never from the process environment', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a-key-in-the-process-environment');
    expect(() => clientFromConfig(defaultConfig(), api, {})).toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('builds the client when the key is there, without making a call', () => {
    const built = clientFromConfig(defaultConfig(), api, { ANTHROPIC_API_KEY: 'test-key-not-real' });
    expect(typeof built.client.json).toBe('function');
    expect(built.spent()).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0 });
  });

});

describe('clientFromConfig with a choice that does not exist', () => {
  it('refuses it, and says which kinds there are', () => {
    expect(() => clientFromConfig(defaultConfig(), { kind: 'nonsense' } as unknown as ClientChoice, {})).toThrow(
      'unknown client kind "nonsense": use fake, recorded or api',
    );
  });
});

describe('clientFromConfig wrapping', () => {
  it('stops a run at the budget of the configuration', async () => {
    const config = defaultConfig();
    config.budget.maxCalls = 2;
    const fake = new FakeClient().script('select', { answer: 'a' }, { answer: 'b' }, { answer: 'never asked for' });
    const built = clientFromConfig(config, { kind: 'fake', fake }, {});
    await built.client.json(request());
    await built.client.json(request());
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'budget', message: 'budget spent: 2 of 2 model calls' });
    expect(fake.calls).toHaveLength(2);
  });

  it('reports what was spent, from the usage the client behind it reported', async () => {
    const fake = new FakeClient().script('select', { answer: 'hi' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {});
    await built.client.json(request());
    expect(built.spent()).toEqual({ calls: 1, inputTokens: 8, outputTokens: 4 });
  });

  it('retries a retryable error, and the budget counts every try (retrying is outside budgeting)', async () => {
    const fake = new FakeClient().script('select', overloaded(), overloaded(), { answer: 'third try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait);
    const reply = await built.client.json(request());
    expect(reply.value).toEqual({ answer: 'third try' });
    expect(built.spent().calls).toBe(3);
  });

  it('ends the retrying when the budget runs out in the middle of it', async () => {
    const config = defaultConfig();
    config.budget.maxCalls = 2;
    const fake = new FakeClient().script('select', overloaded(), overloaded(), overloaded(), { answer: 'never asked for' });
    const built = clientFromConfig(config, { kind: 'fake', fake }, {}, noWait);
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'budget' });
    expect(fake.calls).toHaveLength(2);
  });

  it('does not retry an error that is final', async () => {
    const fake = new FakeClient().script('select', new ModelError('schema', 'not JSON'), { answer: 'never asked for' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait);
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'schema' });
    expect(fake.calls).toHaveLength(1);
  });

  it('retries a call that could not reach the API, twice at most, and the budget counts every try', async () => {
    const fake = new FakeClient().script('select', unreached(), unreached(), { answer: 'third try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait);
    expect((await built.client.json(request())).value).toEqual({ answer: 'third try' });
    expect(built.spent().calls).toBe(3);

    const down = new FakeClient().script('select', unreached(), unreached(), unreached(), { answer: 'never asked for' });
    const failing = clientFromConfig(defaultConfig(), { kind: 'fake', fake: down }, {}, noWait);
    await expect(failing.client.json(request())).rejects.toMatchObject({ kind: 'transport', unreached: true });
    expect(down.calls).toHaveLength(3);
  });

  it('stops a call that could not reach the API at the budget: with two calls, a call that fails twice and would work the third time ends with the budget error', async () => {
    const config = defaultConfig();
    config.budget.maxCalls = 2;
    const fake = new FakeClient().script('select', unreached(), unreached(), { answer: 'never asked for' });
    const built = clientFromConfig(config, { kind: 'fake', fake }, {}, noWait);
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'budget', message: 'budget spent: 2 of 2 model calls' });
    expect(fake.calls).toHaveLength(2);
  });

  it('hands the lines about retries to whoever asks, which is how a run puts them in its log', async () => {
    const fake = new FakeClient().script('select', unreached(), overloaded(), { answer: 'third try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait);
    const lines: string[] = [];
    built.onRetry?.((line) => void lines.push(line));
    await built.client.json(request());
    expect(lines).toEqual(['model: connection error, retrying (2 of 3)', 'model: the API answered with an error that may pass, retrying (3 of 4)']);
  });
});
