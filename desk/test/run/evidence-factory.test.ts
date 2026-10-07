import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import type { DeskConfig } from '../../src/config';
import { LocalEvidenceStore } from '../../src/run/evidence';
import type { EvidenceMeta } from '../../src/run/evidence';
import { R2_VARIABLES, makeEvidenceStore } from '../../src/run/evidence-factory';
import { R2EvidenceStore } from '../../src/run/r2-evidence';
import { BUCKET_TIME, FAKE_BUCKET, FAKE_ENDPOINT, FAKE_KEY_ID, FAKE_SECRET, makeBucket } from '../support/bucket';
import { useScratch } from '../support/context';

// A run is given one evidence store, and the setting `evidence.kind` says which. A folder is described by a setting; a bucket is described by the environment alone, because a file of
// settings is committed and a key must not be in it. A store that is asked for and cannot be made is refused before the run starts, and the message names the variables and never what they hold.

const scratch = useScratch();
const META: EvidenceMeta = { url: 'https://fixture-robotics.example/news/a', finalUrl: 'https://fixture-robotics.example/news/a', tier: 1, retrievedAt: '2026-10-05T04:31:00.000Z' };

const r2Config = (): DeskConfig => ({ ...defaultConfig(), evidence: { kind: 'r2' } });
const FULL_ENV = { R2_ENDPOINT: FAKE_ENDPOINT, R2_BUCKET: FAKE_BUCKET, R2_ACCESS_KEY_ID: FAKE_KEY_ID, R2_SECRET_ACCESS_KEY: FAKE_SECRET };

/** The message of the error that building a store throws. */
function refusal(config: DeskConfig, env: Record<string, string | undefined>): string {
  try {
    makeEvidenceStore(config, env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('a store was made');
}

describe('makeEvidenceStore: local', () => {
  it('is the folder evidenceDir, which is the default, and it does not look at the environment', async () => {
    const dir = path.join(scratch(), 'snapshots');
    const config = { ...defaultConfig(), evidenceDir: dir };
    const store = makeEvidenceStore(config, {});
    expect(store).toBeInstanceOf(LocalEvidenceStore);
    const { hash } = await store.put('a page', META);
    expect(readdirSync(dir).sort()).toEqual([`${hash}.json`, `${hash}.txt`]);
    expect(makeEvidenceStore(config, FULL_ENV)).toBeInstanceOf(LocalEvidenceStore);
    expect(makeEvidenceStore(config, { R2_BUCKET: '!' })).toBeInstanceOf(LocalEvidenceStore);
  });

  it('makes nothing on disk until something is put', () => {
    const dir = path.join(scratch(), 'snapshots');
    makeEvidenceStore({ ...defaultConfig(), evidenceDir: dir }, {});
    expect(existsSync(dir)).toBe(false);
  });
});

describe('makeEvidenceStore: r2', () => {
  it('is a store of the bucket that the environment describes, which signs with the key that the environment has, and asks the transport that it is given', async () => {
    const bucket = makeBucket();
    const store = makeEvidenceStore(r2Config(), FULL_ENV, { transport: bucket.transport, now: () => BUCKET_TIME });
    expect(store).toBeInstanceOf(R2EvidenceStore);
    const { hash } = await store.put('a page', META);
    // The bucket checks the signature of every request, so a store that was given the wrong key or the wrong bucket would not have put anything.
    expect([...bucket.objects.keys()]).toEqual([`pending/${hash}`]);
    expect(bucket.calls[0]?.url).toBe(`${FAKE_ENDPOINT}/${FAKE_BUCKET}/pending/${hash}`);
    await store.keep(hash);
    expect([...bucket.objects.keys()].sort()).toEqual([`pending/${hash}`, `published/${hash}`]);
  });

  it('names the four variables, and what a file of settings cannot have, when none is set', () => {
    expect([...R2_VARIABLES]).toEqual(['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
    expect(refusal(r2Config(), {})).toBe(
      'the setting evidence.kind is r2, which needs R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the environment (they are not set, and a file of settings cannot have them)',
    );
  });

  it.each(R2_VARIABLES)('names %s, and it alone, when it is the one that is not set', (name) => {
    const env: Record<string, string | undefined> = { ...FULL_ENV };
    delete env[name];
    expect(refusal(r2Config(), env)).toBe(`the setting evidence.kind is r2, which needs ${name} in the environment (it is not set, and a file of settings cannot have it)`);
  });

  it('names the ones that are missing, in the order of the list, and never the ones that are set or what they hold', () => {
    const message = refusal(r2Config(), { R2_BUCKET: 'bucket-sentinel', R2_SECRET_ACCESS_KEY: 'secret-sentinel' });
    expect(message).toContain('needs R2_ENDPOINT, R2_ACCESS_KEY_ID in the environment (they are not set');
    expect(message).not.toContain('R2_BUCKET');
    expect(message).not.toContain('R2_SECRET_ACCESS_KEY');
    expect(message).not.toContain('sentinel');
  });

  it('counts a variable that is empty, or has nothing but spaces and line ends, as not set, and one that is undefined', () => {
    expect(refusal(r2Config(), { ...FULL_ENV, R2_BUCKET: '', R2_ACCESS_KEY_ID: '  \n', R2_ENDPOINT: undefined })).toContain('needs R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID in the environment');
  });

  it('takes a value with the spaces and line ends at its ends taken off, as a secret that was pasted with one is still the secret', async () => {
    const bucket = makeBucket();
    const padded = Object.fromEntries(Object.entries(FULL_ENV).map(([name, value]) => [name, `  ${value}\n`]));
    const store = makeEvidenceStore(r2Config(), padded, { transport: bucket.transport, now: () => BUCKET_TIME });
    await store.put('a page', META);
    expect(bucket.objects.size).toBe(1);
  });

  it.each([
    ['an endpoint that is not https', { R2_ENDPOINT: 'http://fake-account.r2.example' }, 'the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com'],
    ['an endpoint with a path', { R2_ENDPOINT: 'https://fake-account.r2.example/fake-evidence' }, 'the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com'],
    ['a name that is not a bucket name', { R2_BUCKET: 'Not A Bucket' }, 'the bucket name is 3 to 63 lowercase letters, digits and hyphens'],
    ['a key id with a space in it', { R2_ACCESS_KEY_ID: 'AKIA FAKE' }, 'the access key id is letters and digits'],
    ['a secret with a space in it', { R2_SECRET_ACCESS_KEY: 'fake secret key' }, 'the secret access key is printable ASCII with no spaces'],
  ])('refuses %s, with the message of the store, and does not say what it was', (_what, change, said) => {
    const message = refusal(r2Config(), { ...FULL_ENV, ...change });
    expect(message).toBe(`the setting evidence.kind is r2, and what the environment has for it cannot be used: ${said}`);
    for (const value of Object.values(change)) expect(message).not.toContain(value);
  });

  it('makes no request and reads nothing but the four variables: building a store asks nobody', () => {
    const bucket = makeBucket();
    makeEvidenceStore(r2Config(), { ...FULL_ENV, ANTHROPIC_API_KEY: 'not-for-the-store' }, { transport: bucket.transport });
    expect(bucket.calls).toEqual([]);
  });

  it('gives the store the time limit that it is given', async () => {
    const hang = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const store = makeEvidenceStore(r2Config(), FULL_ENV, { transport: hang, now: () => BUCKET_TIME, timeoutMs: 20 });
    const started = Date.now();
    await expect(store.has('a'.repeat(64))).rejects.toMatchObject({ kind: 'unreachable' });
    // The store gives up when the time that it was given is up, and not at its own limit of twenty seconds.
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
