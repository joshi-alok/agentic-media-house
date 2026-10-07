import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/model/types';
import { EvidenceError } from '../../src/run/evidence';
import type { EvidenceErrorKind, EvidenceMeta } from '../../src/run/evidence';
import { PENDING_PREFIX, PUBLISHED_PREFIX, R2EvidenceStore } from '../../src/run/r2-evidence';
import type { StoreRequest, StoreTransport } from '../../src/run/r2-evidence';
import { BUCKET_TIME, FAKE_BUCKET, FAKE_ENDPOINT, FAKE_KEY_ID, FAKE_R2, FAKE_SECRET, bucketStore, makeBucket } from '../support/bucket';

// The private bucket keeps what the Desk read: the text of each page, as an object named by its SHA-256. These tests give the store a made-up bucket (test/support/bucket.ts), which
// answers as an S3 bucket does and refuses a request whose signature it cannot check, so every request that the store makes is signed correctly for a test to pass. Nothing here
// reaches a network, and every key is a made-up one.

afterEach(() => vi.unstubAllGlobals());

const META: EvidenceMeta = {
  url: 'https://fixture-robotics.example/news/fx-1-second-plant',
  finalUrl: 'https://fixture-robotics.example/news/fx-1-second-plant',
  tier: 1,
  retrievedAt: '2026-10-05T04:31:00.000Z',
};
const TEXT = 'Fixture Robotics has begun shipping FX-1 warehouse arms.\nThe FX-1 mounts on existing conveyor frames.';
const HASH = sha256Hex(TEXT);
const HELLO_HASH = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

/** The kind of the error that a promise ends with; it fails if the promise ends in anything that is not an EvidenceError. */
async function kindOf(promise: Promise<unknown>): Promise<EvidenceErrorKind> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(EvidenceError);
  return (error as EvidenceError).kind;
}

/** The message of the error that a promise ends with. */
async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message;
}

/** A store with the text put in it, and a bucket whose calls are cleared. */
async function stored(text = TEXT, meta: EvidenceMeta = META) {
  const made = bucketStore();
  const { hash } = await made.store.put(text, meta);
  made.bucket.calls.length = 0;
  return { ...made, hash };
}

describe('R2EvidenceStore: put', () => {
  it('returns the SHA-256 of the text, as 64 lowercase hex characters', async () => {
    const { store } = bucketStore();
    expect(await store.put('hello', META)).toEqual({ hash: HELLO_HASH });
    expect((await store.put(TEXT, META)).hash).toBe(HASH);
  });

  it('asks the bucket whether it has the snapshot in the two places where it can be, and puts it in pending/ when it is in neither', async () => {
    const { store, bucket } = bucketStore();
    await store.put(TEXT, META);
    expect(bucket.asked()).toEqual([`HEAD ${PENDING_PREFIX}${HASH}`, `HEAD ${PUBLISHED_PREFIX}${HASH}`, `PUT ${PENDING_PREFIX}${HASH}`]);
    expect(PENDING_PREFIX).toBe('pending/');
    expect(PUBLISHED_PREFIX).toBe('published/');
  });

  it('sends one request to put it: to the bucket and the key in the path of the address, the text as the body, and what is known of it as metadata', async () => {
    const { store, bucket } = bucketStore();
    await store.put(TEXT, META);
    const put = bucket.calls.at(-1) as NonNullable<ReturnType<typeof bucket.calls.at>>;
    expect(put.method).toBe('PUT');
    expect(put.url).toBe(`${FAKE_ENDPOINT}/${FAKE_BUCKET}/pending/${HASH}`);
    expect(put.body).toBe(TEXT);
    expect(Object.keys(put.headers).sort()).toEqual([
      'authorization',
      'content-type',
      'host',
      'x-amz-content-sha256',
      'x-amz-date',
      'x-amz-meta-retrieved-at',
      'x-amz-meta-tier',
      'x-amz-meta-url',
    ]);
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers.host).toBe('fake-account.r2.example');
    expect(put.headers['x-amz-date']).toBe('20261006T043000Z');
    // The hash of the body is the name of the object: a text that is put by its hash is its own proof.
    expect(put.headers['x-amz-content-sha256']).toBe(HASH);
    expect(put.headers['x-amz-meta-url']).toBe(encodeURIComponent(META.url));
    expect(put.headers['x-amz-meta-tier']).toBe('1');
    expect(put.headers['x-amz-meta-retrieved-at']).toBe('2026-10-05T04:31:00.000Z');
    expect(put.status).toBe(200);
    expect(bucket.objects.get(`pending/${HASH}`)?.body).toBe(TEXT);
  });

  it('sends the address after the redirects too, when it is another address', async () => {
    const { store, bucket } = bucketStore();
    const meta = { ...META, finalUrl: 'https://fixture-robotics.example/news/fx-1-second-plant?ref=feed' };
    await store.put(TEXT, meta);
    const put = bucket.calls.at(-1) as NonNullable<ReturnType<typeof bucket.calls.at>>;
    expect(put.headers['x-amz-meta-final-url']).toBe(encodeURIComponent(meta.finalUrl));
    expect(Object.keys(put.headers)).toHaveLength(9);
  });

  it('sends every request in lowercase headers, with redirects not followed, a time limit, and the secret nowhere: not in an address, not in a header', async () => {
    const seen: StoreRequest[] = [];
    const made = makeBucket();
    const transport: StoreTransport = (url, init) => {
      seen.push(init);
      return made.transport(url, init);
    };
    const store = new R2EvidenceStore({ ...FAKE_R2, transport, now: () => BUCKET_TIME });
    await store.put(TEXT, META);
    await store.get(HASH);
    await store.keep(HASH);
    expect(seen).toHaveLength(7);
    for (const init of seen) {
      expect(init.redirect).toBe('manual');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      for (const name of Object.keys(init.headers)) expect(name).toBe(name.toLowerCase());
    }
    for (const call of made.calls) {
      expect(call.url).not.toContain(FAKE_SECRET);
      for (const value of Object.values(call.headers)) expect(value).not.toContain(FAKE_SECRET);
      expect(call.headers.authorization).toContain(`Credential=${FAKE_KEY_ID}/20261006/auto/s3/aws4_request`);
      expect(call.headers.authorization).not.toContain('fake-secret');
    }
  });

  it('does nothing when the snapshot is there: the second put asks once and stops, and the first record stays', async () => {
    const { store, bucket, hash } = await stored();
    const second = await store.put(TEXT, { ...META, url: 'https://mercer-wire.example/robotics/other', finalUrl: 'https://mercer-wire.example/robotics/other', tier: 2 });
    expect(second).toEqual({ hash });
    expect(bucket.asked()).toEqual([`HEAD pending/${hash}`]);
    expect((await store.get(hash)).meta).toEqual(META);
  });

  it('does nothing when the snapshot is kept, even if what was only put is gone', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    bucket.calls.length = 0;
    expect(await store.put(TEXT, META)).toEqual({ hash });
    expect(bucket.asked()).toEqual([`HEAD pending/${hash}`, `HEAD published/${hash}`]);
    expect(bucket.objects.has(`pending/${hash}`)).toBe(false);
  });

  it('keeps text that is not ASCII exactly as it was put, as UTF-8, and the empty text', async () => {
    const { store, bucket } = bucketStore();
    const text = `caf${String.fromCharCode(0xe9)}\n${String.fromCharCode(0x6771)}${String.fromCharCode(0x4eac)}`;
    const { hash } = await store.put(text, META);
    expect(bucket.objects.get(`pending/${hash}`)?.body).toBe(text);
    expect((await store.get(hash)).text).toBe(text);
    const empty = await store.put('', META);
    expect((await store.get(empty.hash)).text).toBe('');
  });

  it('keeps an address that is not ASCII, as text that is, and gives it back as it was', async () => {
    const { store, bucket } = bucketStore();
    const url = `https://fixture-robotics.example/news/caf${String.fromCharCode(0xe9)}?q=a b&x=1;2`;
    const meta = { ...META, url, finalUrl: url };
    const { hash } = await store.put(TEXT, meta);
    for (const value of Object.values((bucket.objects.get(`pending/${hash}`) as { headers: Record<string, string> }).headers)) expect(/^[\x20-\x7e]*$/.test(value)).toBe(true);
    expect((await store.get(hash)).meta).toEqual(meta);
  });

  it('refuses a record that is not valid, and asks the bucket nothing', async () => {
    const { store, bucket } = bucketStore();
    await expect(store.put(TEXT, { ...META, tier: 3 } as unknown as EvidenceMeta)).rejects.toThrow('the record of the evidence is not valid: tier:');
    await expect(store.put(TEXT, { ...META, url: 'not a url' })).rejects.toThrow('url:');
    await expect(store.put(TEXT, { ...META, extra: 1 } as unknown as EvidenceMeta)).rejects.toThrow('Unrecognized key');
    expect(bucket.calls).toEqual([]);
  });

  it('refuses a record that is too long to be the metadata of an object, and asks the bucket nothing', async () => {
    const { store, bucket } = bucketStore();
    const url = `https://fixture-robotics.example/${'a'.repeat(2500)}`;
    await expect(store.put(TEXT, { ...META, url, finalUrl: url })).rejects.toThrow('the record of the evidence is too long to be the metadata of an object');
    expect(bucket.calls).toEqual([]);
  });

  it('takes a record that is as long as it can be, 2000 bytes of the names and the values of the headers, and refuses one that is a byte longer', async () => {
    // The names and the values are counted: x-amz-meta-url (14) and the address written with its escapes (41 for https://fixture-robotics.example/ and one for each letter after it), x-amz-meta-tier (15) and 1,
    // and x-amz-meta-retrieved-at (23) and the 24 characters of the time: 118 bytes and one for each letter. The address after the redirects is the same address and is not sent.
    const { store, bucket } = bucketStore();
    const address = (letters: number): string => `https://fixture-robotics.example/${'a'.repeat(letters)}`;
    const { hash } = await store.put(TEXT, { ...META, url: address(1882), finalUrl: address(1882) });
    expect((await store.get(hash)).meta.url).toBe(address(1882));
    bucket.calls.length = 0;
    await expect(store.put('another text', { ...META, url: address(1883), finalUrl: address(1883) })).rejects.toThrow('the record of the evidence is too long to be the metadata of an object (2001 bytes, and at most 2000)');
    expect(bucket.calls).toEqual([]);
  });

  it('counts the address after the redirects too, when it is another address', async () => {
    const { store } = bucketStore();
    const address = `https://fixture-robotics.example/${'a'.repeat(1000)}`;
    await expect(store.put(TEXT, { ...META, url: address, finalUrl: `${address}b` })).rejects.toThrow('too long to be the metadata of an object (2');
  });
});

describe('R2EvidenceStore: get', () => {
  it('returns the text and the record, with one request when the snapshot was only put', async () => {
    const { store, bucket, hash } = await stored();
    expect(await store.get(hash)).toEqual({ text: TEXT, meta: META });
    expect(bucket.asked()).toEqual([`GET pending/${hash}`]);
    expect(bucket.calls[0]?.body).toBeUndefined();
    expect(bucket.calls[0]?.url).toBe(`${FAKE_ENDPOINT}/${FAKE_BUCKET}/pending/${hash}`);
  });

  it('reads a kept snapshot when what was only put is gone, which is what happens to it after the days that the bucket is told to wait', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    bucket.calls.length = 0;
    expect(await store.get(hash)).toEqual({ text: TEXT, meta: META });
    expect(bucket.asked()).toEqual([`GET pending/${hash}`, `GET published/${hash}`]);
  });

  it('gives the address after the redirects as the address asked for when the record has no other', async () => {
    const { store } = bucketStore();
    const { hash } = await store.put(TEXT, META);
    expect((await store.get(hash)).meta.finalUrl).toBe(META.url);
  });

  it('refuses a text that is not the one that the name says, as tampered, whichever way it was changed', async () => {
    for (const change of [(text: string) => `${text} `, (text: string) => text.slice(0, -1), () => '', (text: string) => text.replace('\n', '\r\n'), (text: string) => text.replace('FX-1', 'FX-2')]) {
      const { store, bucket, hash } = await stored();
      const object = bucket.objects.get(`pending/${hash}`) as { body: string };
      object.body = change(TEXT);
      expect(await kindOf(store.get(hash))).toBe('tampered');
      await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has been changed: its text no longer matches its hash`);
    }
  });

  it('refuses a kept text that was changed, in the same way', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    (bucket.objects.get(`published/${hash}`) as { body: string }).body = 'something else';
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });

  it('says that nothing is stored for a hash that is in neither place, as missing, after asking both', async () => {
    const { store, bucket } = await stored();
    const hash = sha256Hex('never stored');
    expect(await kindOf(store.get(hash))).toBe('missing');
    await expect(store.get(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
    expect(bucket.asked().slice(0, 2)).toEqual([`GET pending/${hash}`, `GET published/${hash}`]);
  });

  it('refuses a snapshot that has no record of where it came from, as missing', async () => {
    const { store, bucket, hash } = await stored();
    const object = bucket.objects.get(`pending/${hash}`) as { headers: Record<string, string> };
    object.headers = { 'content-type': 'text/plain; charset=utf-8' };
    expect(await kindOf(store.get(hash))).toBe('missing');
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has no record of where it came from`);
  });

  it('refuses a record that is not valid, as tampered', async () => {
    const { store, bucket, hash } = await stored();
    const object = bucket.objects.get(`pending/${hash}`) as { headers: Record<string, string> };
    object.headers['x-amz-meta-tier'] = '3';
    await expect(store.get(hash)).rejects.toThrow(`the record of the evidence ${hash} is not valid: tier:`);
    expect(await kindOf(store.get(hash))).toBe('tampered');
    object.headers['x-amz-meta-tier'] = '1';
    object.headers['x-amz-meta-url'] = '%E0%A4%A';
    expect(await kindOf(store.get(hash))).toBe('tampered');
    delete object.headers['x-amz-meta-url'];
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });

  it.each(['', 'abc', '../../etc/passwd', 'A'.repeat(64), `${'a'.repeat(63)}g`, `${'a'.repeat(64)}/../x`])('refuses %j as a hash, without asking the bucket', async (hash) => {
    const { store, bucket } = bucketStore();
    await expect(store.get(hash)).rejects.toThrow('is not a snapshot hash: 64 lowercase hex characters');
    expect(bucket.calls).toEqual([]);
  });
});

describe('R2EvidenceStore: has', () => {
  it('says whether a snapshot is stored, in either place', async () => {
    const { store, bucket } = bucketStore();
    expect(await store.has(HASH)).toBe(false);
    expect(bucket.asked()).toEqual([`HEAD pending/${HASH}`, `HEAD published/${HASH}`]);
    await store.put(TEXT, META);
    bucket.calls.length = 0;
    expect(await store.has(HASH)).toBe(true);
    expect(bucket.asked()).toEqual([`HEAD pending/${HASH}`]);
    expect(await store.has(sha256Hex('another text'))).toBe(false);
  });

  it('says yes for a snapshot that is only kept', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    expect(await store.has(hash)).toBe(true);
  });

  it('says no, and does not ask, for something that is not a hash', async () => {
    const { store, bucket } = bucketStore();
    for (const hash of ['', 'abc', '../../etc/passwd', 'A'.repeat(64)]) expect(await store.has(hash)).toBe(false);
    expect(bucket.calls).toEqual([]);
  });

  it('does not say no when the bucket cannot answer: it fails', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status: 503, body: 'try again' }, { method: 'HEAD' });
    expect(await kindOf(store.has(HASH))).toBe('unreachable');
  });
});

describe('R2EvidenceStore: keep', () => {
  it('copies the snapshot to published/, with its text and its record, and leaves what was put where it is', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    expect(bucket.asked()).toEqual([`HEAD published/${hash}`, `GET pending/${hash}`, `PUT published/${hash}`]);
    expect(bucket.objects.get(`published/${hash}`)).toEqual(bucket.objects.get(`pending/${hash}`));
    expect(bucket.objects.get(`published/${hash}`)?.body).toBe(TEXT);
    expect([...bucket.objects.keys()].sort()).toEqual([`pending/${hash}`, `published/${hash}`]);
  });

  it('does nothing when the snapshot is kept already: one question and no more', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.calls.length = 0;
    await store.keep(hash);
    expect(bucket.asked()).toEqual([`HEAD published/${hash}`]);
  });

  it('does nothing when the snapshot is kept and what was only put has expired: it was kept in time', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    bucket.calls.length = 0;
    await store.keep(hash);
    expect(bucket.asked()).toEqual([`HEAD published/${hash}`]);
  });

  it('keeps the snapshots that are asked for and no other', async () => {
    const { store, bucket, hash } = await stored();
    await store.put('another page', META);
    await store.keep(hash);
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/'))).toEqual([`published/${hash}`]);
  });

  it('refuses a snapshot that is not stored, as missing, and keeps nothing', async () => {
    const { store, bucket } = await stored();
    const hash = sha256Hex('never stored');
    expect(await kindOf(store.keep(hash))).toBe('missing');
    await expect(store.keep(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/'))).toEqual([]);
  });

  it('refuses a snapshot that has been changed, as tampered, and keeps nothing: what is kept is what get gives', async () => {
    const { store, bucket, hash } = await stored();
    (bucket.objects.get(`pending/${hash}`) as { body: string }).body = `${TEXT} changed`;
    expect(await kindOf(store.keep(hash))).toBe('tampered');
    expect(bucket.objects.has(`published/${hash}`)).toBe(false);
  });

  it('refuses what is not a hash, without asking the bucket', async () => {
    const { store, bucket } = bucketStore();
    await expect(store.keep('../../etc/passwd')).rejects.toThrow('is not a snapshot hash: 64 lowercase hex characters');
    expect(bucket.calls).toEqual([]);
  });

  it('gives back from published/ the same text and record that were put, so that a kept snapshot is a whole one', async () => {
    const { store, bucket, hash } = await stored();
    await store.keep(hash);
    bucket.objects.delete(`pending/${hash}`);
    expect(await store.get(hash)).toEqual({ text: TEXT, meta: META });
  });

  it.each([
    ['asking whether it is kept', { method: 'HEAD' }],
    ['reading what was put', { method: 'GET' }],
    ['writing the copy', { method: 'PUT' }],
  ])('fails, as unreachable, when the bucket is down while %s, and keeps nothing', async (_when, narrow) => {
    const { store, bucket, hash } = await stored();
    bucket.fail({ status: 503, body: 'Service Unavailable' }, narrow);
    expect(await kindOf(store.keep(hash))).toBe('unreachable');
    expect(bucket.objects.has(`published/${hash}`)).toBe(false);
  });
});

describe('R2EvidenceStore: what the bucket can answer', () => {
  it.each([
    [400, 'denied'],
    [401, 'denied'],
    [403, 'denied'],
    [405, 'denied'],
    [409, 'denied'],
    [412, 'denied'],
    [499, 'denied'],
    [408, 'unreachable'],
    [429, 'unreachable'],
    [500, 'unreachable'],
    [502, 'unreachable'],
    [503, 'unreachable'],
    [504, 'unreachable'],
    [301, 'unreachable'],
    [307, 'unreachable'],
    [204, 'unreachable'],
    [206, 'unreachable'],
  ] as [number, EvidenceErrorKind][])('maps a %i to a get that fails as %s', async (status, kind) => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status, body: 'no' }, { method: 'GET' });
    expect(await kindOf(store.get(HASH))).toBe(kind);
  });

  it.each([
    [401, 'denied'],
    [403, 'denied'],
    [404, 'missing'],
    [400, 'denied'],
    [429, 'unreachable'],
    [500, 'unreachable'],
    [503, 'unreachable'],
    [300, 'unreachable'],
    [301, 'unreachable'],
  ] as [number, EvidenceErrorKind][])('maps a %i to a put that fails as %s', async (status, kind) => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status, body: 'no' }, { method: 'PUT' });
    expect(await kindOf(store.put(TEXT, META))).toBe(kind);
    expect(bucket.objects.size).toBe(0);
  });

  it.each([
    [401, 'denied'],
    [403, 'denied'],
    [500, 'unreachable'],
    [206, 'unreachable'],
  ] as [number, EvidenceErrorKind][])('maps a %i to a head that fails as %s', async (status, kind) => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status }, { method: 'HEAD' });
    expect(await kindOf(store.has(HASH))).toBe(kind);
  });

  it('takes any success for a put', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status: 204 }, { method: 'PUT' });
    expect(await store.put(TEXT, META)).toEqual({ hash: HASH });
  });

  it('says in the message what was asked, what the bucket answered, and the start of what it said, cut at 200 characters and on one line', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status: 503, body: `<Error>\n  <Code>SlowDown</Code>\n\n  <Message>${'x'.repeat(300)}</Message>${String.fromCharCode(7)}</Error>` }, { method: 'GET' });
    const message = await messageOf(store.get(HASH));
    expect(message).toBe(`the evidence store answered GET pending/${HASH} with 503: <Error> <Code>SlowDown</Code> <Message>${'x'.repeat(200 - '<Error> <Code>SlowDown</Code> <Message>'.length)}...`);
    expect(message.length).toBeLessThan(400);
  });

  it('leaves out the white space at the two ends of what the bucket said', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status: 503, body: '\n  Slow down  \n' }, { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store answered GET pending/${HASH} with 503: Slow down`);
  });

  it('says nothing of the body when there is none, and does not cut a body of exactly 200 characters', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail({ status: 503 }, { method: 'HEAD' });
    expect(await messageOf(store.has(HASH))).toBe(`the evidence store answered HEAD pending/${HASH} with 503`);
    bucket.fail({ status: 503, body: 'y'.repeat(200) }, { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store answered GET pending/${HASH} with 503: ${'y'.repeat(200)}`);
    bucket.fail({ status: 503, body: 'z'.repeat(201) }, { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store answered GET pending/${HASH} with 503: ${'z'.repeat(200)}...`);
  });

  it('never has a key in a message, whatever the bucket says, even when the key is cut in two by the end of the excerpt', async () => {
    const { store, bucket } = bucketStore();
    for (const body of [`credentials ${FAKE_SECRET} and ${FAKE_KEY_ID}`, `${'a'.repeat(190)}${FAKE_SECRET}`, `${'a'.repeat(180)} ${FAKE_KEY_ID} ${FAKE_SECRET}`]) {
      bucket.fail({ status: 403, body }, { method: 'GET' });
      const message = await messageOf(store.get(HASH));
      expect(message).not.toContain(FAKE_SECRET);
      expect(message).not.toContain('fake-secret');
      expect(message).not.toContain(FAKE_KEY_ID);
      expect(message).not.toContain('AKIAFAKE');
      expect(message).toContain('<key>');
    }
  });

  it('turns a transport that throws into unreachable, with what it said, and never a key', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail(new Error('connect ECONNREFUSED 203.0.113.9:443'), { method: 'GET' });
    expect(await kindOf(store.get(HASH))).toBe('unreachable');
    bucket.fail(new Error('connect ECONNREFUSED 203.0.113.9:443'), { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store could not be reached (GET pending/${HASH}): connect ECONNREFUSED 203.0.113.9:443`);
    bucket.fail(new Error(`tried ${FAKE_KEY_ID}:${FAKE_SECRET}`), { method: 'GET' });
    const leaky = await messageOf(store.get(HASH));
    expect(leaky).not.toContain('fake-secret');
    expect(leaky).not.toContain(FAKE_KEY_ID);
  });

  it('says what the cause of a failed fetch was, as the fetch of node reports it', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND fake-account.r2.example') }), { method: 'GET' });
    // The host of the bucket has the id of the account in it, and a message goes into the record of a run and into a log that a public repository shows to anyone.
    const message = await messageOf(store.get(HASH));
    expect(message).toContain('fetch failed (getaddrinfo ENOTFOUND <r2-endpoint>)');
    expect(message).not.toContain('fake-account');
    expect(message).not.toContain('r2.example');
  });

  it('turns a transport that throws what is not an error into unreachable as well', async () => {
    const transport: StoreTransport = () => Promise.reject('a string, thrown');
    const store = new R2EvidenceStore({ ...FAKE_R2, transport, now: () => BUCKET_TIME });
    expect(await kindOf(store.get(HASH))).toBe('unreachable');
    expect(await messageOf(store.get(HASH))).toContain('a string, thrown');
  });

  it('turns an answer whose body cannot be read to the end into unreachable', async () => {
    const broken = (): ReadableStream<Uint8Array> =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('connection reset'));
        },
      });
    const transport: StoreTransport = () => Promise.resolve(new Response(broken(), { status: 200 }));
    const store = new R2EvidenceStore({ ...FAKE_R2, transport, now: () => BUCKET_TIME });
    expect(await kindOf(store.get(HASH))).toBe('unreachable');
    expect(await messageOf(store.get(HASH))).toContain('connection reset');
  });

  it('gives up on a bucket that does not answer, after the time that it was given, as unreachable', async () => {
    const transport: StoreTransport = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const store = new R2EvidenceStore({ ...FAKE_R2, transport, now: () => BUCKET_TIME, timeoutMs: 20 });
    const started = Date.now();
    expect(await kindOf(store.get(HASH))).toBe('unreachable');
    // It gives up when the time that it was given is up, and not at its own limit of twenty seconds.
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('R2EvidenceStore: how it is made', () => {
  it('accepts an https address with no path, with a slash after it or a port, and names the bucket in the path of every request', async () => {
    for (const endpoint of ['https://fake-account.r2.example/', 'https://fake-account.r2.example:8443']) {
      const { store, bucket } = bucketStore({ endpoint });
      await store.has(HASH);
      expect(bucket.calls[0]?.url).toBe(`${new URL(endpoint).origin}/${FAKE_BUCKET}/pending/${HASH}`);
    }
  });

  it.each(['', 'not an address', 'http://fake-account.r2.example', 'ftp://fake-account.r2.example', 'https://fake-account.r2.example/bucket', 'https://fake-account.r2.example?a=1', 'https://fake-account.r2.example/#f', 'https://someone:fake-password@fake-account.r2.example', 'https://someone@fake-account.r2.example', 'https://:fake-password@fake-account.r2.example'])(
    'refuses %j as an endpoint, and does not say what it was',
    (endpoint) => {
      let message = '';
      try {
        new R2EvidenceStore({ ...FAKE_R2, endpoint });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe('the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com');
    },
  );

  it.each(['', 'ab', 'Capitals', 'under_score', 'with space', '-leading', 'trailing-', 'a'.repeat(64), 'dotted.name'])('refuses %j as the name of a bucket', (bucket) => {
    expect(() => new R2EvidenceStore({ ...FAKE_R2, bucket })).toThrow('the bucket name is 3 to 63 lowercase letters, digits and hyphens');
  });

  it.each(['abc', 'a-b-c', 'a'.repeat(63), '123'])('accepts %j as the name of a bucket', (bucket) => {
    expect(() => new R2EvidenceStore({ ...FAKE_R2, bucket })).not.toThrow();
  });

  it('refuses a key that cannot sign, at once, and does not say what it was', () => {
    expect(() => new R2EvidenceStore({ ...FAKE_R2, accessKeyId: '' })).toThrow('the access key id is letters and digits');
    expect(() => new R2EvidenceStore({ ...FAKE_R2, accessKeyId: 'AKIA FAKE' })).toThrow('the access key id is letters and digits');
    expect(() => new R2EvidenceStore({ ...FAKE_R2, secretAccessKey: '' })).toThrow('the secret access key is empty');
    let message = '';
    try {
      new R2EvidenceStore({ ...FAKE_R2, secretAccessKey: 'fake secret with spaces' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('the secret access key is printable ASCII with no spaces');
  });

  it('uses fetch, as it is when the request is made, when it is given no transport', async () => {
    const stub = vi.fn(async (_url: string, init: StoreRequest) => new Response(init.method === 'HEAD' ? null : '', { status: init.method === 'HEAD' ? 404 : 200 }));
    vi.stubGlobal('fetch', stub);
    const store = new R2EvidenceStore({ ...FAKE_R2, now: () => BUCKET_TIME });
    await store.put(TEXT, META);
    expect(stub.mock.calls.map(([url, init]) => `${init.method} ${url.slice(FAKE_ENDPOINT.length)}`)).toEqual([
      `HEAD /${FAKE_BUCKET}/pending/${HASH}`,
      `HEAD /${FAKE_BUCKET}/published/${HASH}`,
      `PUT /${FAKE_BUCKET}/pending/${HASH}`,
    ]);
  });

  it('signs with the time that it is given, and with the time of the clock when it is given none', async () => {
    const { store, bucket } = bucketStore({ now: () => new Date('2027-01-02T03:04:05.678Z') });
    await store.has(HASH).catch(() => undefined);
    expect(bucket.calls[0]?.headers['x-amz-date']).toBe('20270102T030405Z');
    const seen: string[] = [];
    const transport: StoreTransport = async (_url, init) => {
      seen.push(init.headers['x-amz-date'] as string);
      return new Response(null, { status: 404 });
    };
    const before = Date.now();
    await new R2EvidenceStore({ ...FAKE_R2, transport }).has(HASH);
    const sent = seen[0] as string;
    const at = Date.parse(`${sent.slice(0, 4)}-${sent.slice(4, 6)}-${sent.slice(6, 8)}T${sent.slice(9, 11)}:${sent.slice(11, 13)}:${sent.slice(13, 15)}Z`);
    expect(Math.abs(at - before)).toBeLessThan(5000);
  });
});

// A message of the store goes into the record of a run, into its log, and, when the run fails, into the output of a workflow of a public repository, where GitHub hides a whole secret and
// not a part of one. The address of the bucket has the id of the Cloudflare account in it, and the name of the bucket says whose it is. So a message never has the address of the endpoint, the
// id of the account, the name of the bucket or either key, whatever the network or the bucket said: they are replaced by `<r2-endpoint>`, `<bucket>` and `<key>`.
describe('R2EvidenceStore: what no message says', () => {
  const ACCOUNT = '0123456789abcdef0123456789abcdef';
  const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const NAME = 'agentic-media-house-evidence';
  const KEY_ID = 'AKIAMADEUPKEYID12345';
  const SECRET = 'made-up-secret-access-key-0123456789abcdefghij';
  const REAL_SHAPED = { endpoint: `https://${HOST}`, bucket: NAME, accessKeyId: KEY_ID, secretAccessKey: SECRET } as const;

  /** What the network or the bucket might say, with the address, the account, the bucket and the keys in it, in the ways that they are written. */
  const ECHO = `<Error><Code>SignatureDoesNotMatch</Code><Endpoint>${HOST}</Endpoint><BucketName>${NAME}</BucketName><Key>pending/${HASH}</Key><AWSAccessKeyId>${KEY_ID}</AWSAccessKeyId><CanonicalRequest>GET\n/${NAME}/pending/${HASH}\n\nhost:${HOST}\n</CanonicalRequest><Authorization>AWS4-HMAC-SHA256 Credential=${KEY_ID}/20261006/auto/s3/aws4_request, SignedHeaders=host, Signature=${'0'.repeat(64)}</Authorization></Error>`;

  const FAULTS: [string, Error | { status: number; body: string }][] = [
    ['a DNS failure', new TypeError('fetch failed', { cause: new Error(`getaddrinfo ENOTFOUND ${HOST}`) })],
    ['a DNS failure, in capitals', new Error(`GETADDRINFO ENOTFOUND ${HOST.toUpperCase()}`)],
    ['a failure to connect, with the port', new Error(`connect ECONNREFUSED ${HOST}:443`)],
    ['a TLS error', new Error(`Hostname/IP does not match certificate's altnames: Host: ${HOST}. is not in the cert's altnames: DNS:*.other.example`)],
    ['a timeout that names the address', new Error(`Request to https://${HOST}/${NAME}/pending/${HASH} timed out after 20000 ms`)],
    ['an error that names the address and the key that was tried, as the name of a path and as a header', new Error(`403 for https://${HOST}/${NAME}/published/${HASH} with ${KEY_ID}:${SECRET}`)],
    ['an error that has the address and the name written as a url does', new Error(`failed ${encodeURIComponent(`https://${HOST}/${NAME}`)} ${encodeURIComponent(SECRET)}`)],
    ['an answer whose body echoes the whole request', { status: 403, body: ECHO }],
    ['an answer whose body is the address and nothing else', { status: 502, body: `https://${HOST}` }],
    ['an answer with the secret key in the middle of a long body', { status: 400, body: `${'x'.repeat(150)} ${SECRET} ${HOST} ${'y'.repeat(150)}` }],
  ];

  function clean(message: string): void {
    for (const secret of [HOST, ACCOUNT, NAME, KEY_ID, SECRET]) expect(message.toLowerCase(), message).not.toContain(secret.toLowerCase());
    expect(message, message).not.toContain('r2.cloudflarestorage.com');
    expect(message, message).not.toMatch(/\b[0-9a-f]{32}\b/);
    expect(message, message).not.toContain(encodeURIComponent(SECRET));
    expect(message, message).not.toContain('made-up-secret');
  }

  it.each(FAULTS)('is clean for %s', async (_what, fault) => {
    const bucket = makeBucket();
    bucket.fail(fault instanceof Error ? fault : { status: fault.status, body: fault.body }, { method: 'GET' });
    const store = new R2EvidenceStore({ ...REAL_SHAPED, transport: bucket.transport, now: () => BUCKET_TIME });
    const message = await messageOf(store.get(HASH));
    clean(message);
    expect(message).toContain('the evidence store');
  });

  it('puts the marks where the address, the bucket and the keys were, so that what the message says can still be read', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail(new Error(`getaddrinfo ENOTFOUND fake-account.r2.example while asking ${FAKE_BUCKET} with ${FAKE_KEY_ID} and ${FAKE_SECRET}`), { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store could not be reached (GET pending/${HASH}): getaddrinfo ENOTFOUND <r2-endpoint> while asking <bucket> with <key> and <key>`);
  });

  it('takes out the whole address with its scheme as one mark, and a bare host, with or without the port, as one mark, and does not leave half of either', async () => {
    const { store, bucket } = bucketStore();
    bucket.fail(new Error(`${FAKE_ENDPOINT}/${FAKE_BUCKET}/pending/x and fake-account.r2.example:443 and https://FAKE-ACCOUNT.R2.EXAMPLE`), { method: 'GET' });
    const message = await messageOf(store.get(HASH));
    // The port is not a secret and stays; a host and a port that is not the usual one are taken out together.
    expect(message).toContain('<r2-endpoint>/<bucket>/pending/x and <r2-endpoint>:443 and <r2-endpoint>');
    expect(message).not.toContain('fake-account');
  });

  it('does not take the name of the bucket out of its own sentences, where a bucket named like a word would spoil them: only out of what the network or the bucket said', async () => {
    const bucket = makeBucket();
    const store = new R2EvidenceStore({ ...FAKE_R2, bucket: 'evidence', transport: bucket.transport, now: () => BUCKET_TIME });
    bucket.fail({ status: 503, body: 'the bucket evidence is busy' }, { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store answered GET pending/${HASH} with 503: the bucket <bucket> is busy`);
  });

  it('leaves a short first label of the address alone, which is a word and not an account id, and takes the address out all the same', async () => {
    const bucket = makeBucket();
    const store = new R2EvidenceStore({ ...FAKE_R2, endpoint: 'https://r2.example', transport: bucket.transport, now: () => BUCKET_TIME });
    bucket.fail(new Error('r2 is down; ask r2.example, or R2'), { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store could not be reached (GET pending/${HASH}): r2 is down; ask <r2-endpoint>, or R2`);
  });

  it('takes the first label of the address out by itself when it is long enough to be an account id (eight characters), and not the second label of an address, which is a word', async () => {
    const bucket = makeBucket();
    const store = new R2EvidenceStore({ ...FAKE_R2, endpoint: 'https://abcd1234.longword-label.example', transport: bucket.transport, now: () => BUCKET_TIME });
    bucket.fail(new Error('account abcd1234 is not allowed; longword-label is a word'), { method: 'GET' });
    expect(await messageOf(store.get(HASH))).toBe(`the evidence store could not be reached (GET pending/${HASH}): account <r2-endpoint> is not allowed; longword-label is a word`);
  });

  it('is clean in every kind of message that the store makes: a refusal, an unreachable bucket, a body that cannot be read, a text that was changed, and a record that is not valid', async () => {
    const bucket = makeBucket();
    const store = new R2EvidenceStore({ ...REAL_SHAPED, transport: bucket.transport, now: () => BUCKET_TIME });
    const messages: string[] = [];
    bucket.fail({ status: 403, body: ECHO }, { method: 'HEAD' });
    messages.push(await messageOf(store.has(HASH)));
    bucket.fail({ status: 500, body: ECHO }, { method: 'PUT' });
    messages.push(await messageOf(store.put(TEXT, META)));
    bucket.fail(new Error(`reset by ${HOST}`), { method: 'HEAD' });
    messages.push(await messageOf(store.keep(HASH)));
    expect(messages).toHaveLength(3);
    for (const message of messages) clean(message);
  });
});
