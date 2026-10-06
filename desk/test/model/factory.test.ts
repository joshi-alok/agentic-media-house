import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/config';
import { clientFromConfig } from '../../src/model/factory';
import type { ClientChoice } from '../../src/model/factory';
import { FakeClient } from '../../src/model/fake';
import { RecordingClient } from '../../src/model/recorded';
import { ModelError } from '../../src/model/types';
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
});
