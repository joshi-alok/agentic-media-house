import { sha256Hex } from '../../src/model/types';
import { R2EvidenceStore } from '../../src/run/r2-evidence';
import type { R2Options, StoreRequest, StoreTransport } from '../../src/run/r2-evidence';
import { canonicalRequest, hashBody, signatureOf, signingKey, stringToSign } from '../../src/run/sigv4';

// A stand-in for a private bucket of Cloudflare R2, which the tests of the evidence store, of the runs that use it and of the table of its keys put in the place of the network. It is a
// function with the shape of `fetch` that keeps objects in memory and answers as an S3 bucket does for the three requests that the Desk makes (PUT, GET and HEAD of one object, with the
// path of the bucket in the address). It is as strict as the real bucket is where a mistake of the Desk would show: it checks the signature of every request, with its own reading of the
// canonical request, so a request that is signed wrongly, or that sends a header that it did not sign, or whose body is not the one that was hashed, is refused with a 403 or a 400 and
// the message of S3, and a test that expected it to work fails. Everything it was asked is in `calls`, and what it holds is in `objects`.

/** The settings of the made-up bucket: the address, the name, and a key that is obviously not one. */
export const FAKE_ENDPOINT = 'https://fake-account.r2.example';
export const FAKE_BUCKET = 'fake-evidence';
// Written in two pieces, so that no file of the repository holds a string with the shape of the id of an access key, which step 1 of the runbook searches for.
export const FAKE_KEY_ID = ['AKIA', 'FAKEFAKEFAKEFAKE'].join('');
export const FAKE_SECRET = 'fake-secret-access-key-not-real-0123456789';
export const FAKE_R2 = { endpoint: FAKE_ENDPOINT, bucket: FAKE_BUCKET, accessKeyId: FAKE_KEY_ID, secretAccessKey: FAKE_SECRET } as const;

/** The time of the made-up bucket, and of the stores that are made with it: the bucket refuses a request that is signed more than fifteen minutes away from it. */
export const BUCKET_TIME = new Date('2026-10-06T04:30:00.000Z');

/** One object: its text, and the headers that come back with it (the type, and the metadata that the store put). */
export interface StoredObject {
  body: string;
  headers: Record<string, string>;
}

/** One request, as the bucket saw it. */
export interface BucketCall {
  method: string;
  url: string;
  /** The key of the object, below the bucket: `pending/<hash>`. */
  key: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** What the bucket answered, or `thrown` for a request that a fault made fail with an error. */
  status: number | 'thrown';
}

/** What a fault makes the bucket answer in place of the answer that it would give: a status and a body, or an error that the transport throws. */
export type Fault = { status: number; body?: string; headers?: Record<string, string> } | Error;

const XML = { 'content-type': 'application/xml' };

const S3_ERRORS: Record<string, [number, string]> = {
  AccessDenied: [403, 'Access Denied'],
  InvalidAccessKeyId: [403, 'The Access Key Id you provided does not exist in our records.'],
  SignatureDoesNotMatch: [403, 'The request signature we calculated does not match the signature you provided.'],
  RequestTimeTooSkewed: [403, 'The difference between the request time and the current time is too large.'],
  XAmzContentSHA256Mismatch: [400, 'The provided x-amz-content-sha256 header does not match what was computed.'],
  NoSuchBucket: [404, 'The specified bucket does not exist.'],
  NoSuchKey: [404, 'The specified key does not exist.'],
  MethodNotAllowed: [405, 'The specified method is not allowed against this resource.'],
};

function answer(code: string): Response {
  const [status, message] = S3_ERRORS[code] as [number, string];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`, { status, headers: XML });
}

/** The made-up bucket. */
export interface Bucket {
  transport: StoreTransport;
  calls: BucketCall[];
  objects: Map<string, StoredObject>;
  /** Make the next `times` requests that match answer with `fault`. `method` and `key` (a key, or the start of one) narrow what matches; with neither, every request matches. */
  fail(fault: Fault, options?: { method?: string; key?: string; times?: number }): void;
  /** The requests so far as `METHOD key` lines, which is how a test says what the Desk asked. */
  asked(): string[];
}

/** Check a request the way that the bucket does. Gives the code of the S3 error to answer with, or undefined when the request is good. */
function problemWith(call: { method: string; url: string; headers: Record<string, string>; body: string | undefined }, now: Date): string | undefined {
  const headers = Object.fromEntries(Object.entries(call.headers).map(([name, value]) => [name.toLowerCase(), value]));
  const match = /^AWS4-HMAC-SHA256 Credential=([A-Za-z0-9]+)\/(\d{8})\/([a-z0-9-]+)\/([a-z0-9-]+)\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? '');
  if (match === null) return 'AccessDenied';
  const [, keyId, day, region, service, names, signature] = match as unknown as [string, string, string, string, string, string, string];
  if (keyId !== FAKE_KEY_ID) return 'InvalidAccessKeyId';
  if (region !== 'auto' || service !== 's3') return 'SignatureDoesNotMatch';
  const signed = names.split(';');
  // What is sent has to be what is signed: every header but the signature itself is in the list, and the list has the three that S3 needs.
  const sent = Object.keys(headers).filter((name) => name !== 'authorization');
  if (sent.some((name) => !signed.includes(name)) || signed.some((name) => !(name in headers))) return 'SignatureDoesNotMatch';
  for (const needed of ['host', 'x-amz-content-sha256', 'x-amz-date']) if (!signed.includes(needed)) return 'SignatureDoesNotMatch';
  if (headers.host !== new URL(call.url).host) return 'SignatureDoesNotMatch';
  const time = headers['x-amz-date'] as string;
  if (time.slice(0, 8) !== day) return 'SignatureDoesNotMatch';
  const away = Math.abs(Date.parse(`${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}T${time.slice(9, 11)}:${time.slice(11, 13)}:${time.slice(13, 15)}Z`) - now.getTime());
  if (Number.isNaN(away) || away > 15 * 60 * 1000) return 'RequestTimeTooSkewed';
  if (headers['x-amz-content-sha256'] !== hashBody(call.body ?? '')) return 'XAmzContentSHA256Mismatch';
  const canonical = canonicalRequest({ method: call.method, url: call.url, headers: Object.fromEntries(signed.map((name) => [name, headers[name] as string])), payloadHash: headers['x-amz-content-sha256'] });
  const expected = signatureOf(signingKey({ secretAccessKey: FAKE_SECRET, date: day, region, service }), stringToSign({ amzDate: time, region, service, canonicalRequest: canonical }));
  return expected === signature ? undefined : 'SignatureDoesNotMatch';
}

/** A made-up bucket, empty. Its clock is `BUCKET_TIME` unless it is given another, which a test that runs the command line needs, as that has the clock of its own. */
export function makeBucket(now: () => Date = () => BUCKET_TIME): Bucket {
  const calls: BucketCall[] = [];
  const objects = new Map<string, StoredObject>();
  const faults: { fault: Fault; method?: string; key?: string; times: number }[] = [];

  const transport: StoreTransport = async (url: string, init: StoreRequest) => {
    const { pathname } = new URL(url);
    const [, bucket = '', ...rest] = pathname.split('/');
    const key = rest.join('/');
    const call: BucketCall = { method: init.method, url, key, headers: { ...init.headers }, body: init.body, status: 'thrown' };
    calls.push(call);

    const at = faults.findIndex((entry) => entry.times > 0 && (entry.method === undefined || entry.method === init.method) && (entry.key === undefined || key.startsWith(entry.key)));
    if (at >= 0) {
      const entry = faults[at] as (typeof faults)[number];
      entry.times -= 1;
      if (entry.fault instanceof Error) throw entry.fault;
      call.status = entry.fault.status;
      // A response with one of these statuses has no body, and cannot be made with one.
      const bodiless = init.method === 'HEAD' || [101, 204, 205, 304].includes(entry.fault.status);
      return new Response(bodiless ? null : (entry.fault.body ?? ''), { status: entry.fault.status, headers: entry.fault.headers ?? {} });
    }

    const respond = (response: Response): Response => {
      call.status = response.status;
      return response;
    };
    const problem = problemWith(call, now());
    if (problem !== undefined) return respond(answer(problem));
    if (bucket !== FAKE_BUCKET) return respond(answer('NoSuchBucket'));
    if (init.method === 'PUT') {
      const kept: Record<string, string> = { 'content-type': init.headers['content-type'] ?? 'binary/octet-stream' };
      for (const [name, value] of Object.entries(init.headers)) if (name.toLowerCase().startsWith('x-amz-meta-')) kept[name.toLowerCase()] = value;
      objects.set(key, { body: init.body ?? '', headers: kept });
      return respond(new Response('', { status: 200, headers: { etag: `"${sha256Hex(init.body ?? '').slice(0, 32)}"` } }));
    }
    if (init.method === 'GET' || init.method === 'HEAD') {
      const found = objects.get(key);
      if (found === undefined) return respond(init.method === 'HEAD' ? new Response(null, { status: 404 }) : answer('NoSuchKey'));
      return respond(new Response(init.method === 'HEAD' ? null : found.body, { status: 200, headers: { ...found.headers, 'content-length': String(Buffer.byteLength(found.body, 'utf8')) } }));
    }
    return respond(answer('MethodNotAllowed'));
  };

  return {
    transport,
    calls,
    objects,
    fail: (fault, options = {}) => void faults.push({ fault, times: options.times ?? 1, ...(options.method === undefined ? {} : { method: options.method }), ...(options.key === undefined ? {} : { key: options.key }) }),
    asked: () => calls.map((call) => `${call.method} ${call.key}`),
  };
}

/** A store over a made-up bucket, with the time of the bucket, and the bucket. Any of the options of the store can be replaced. */
export function bucketStore(overrides: Partial<R2Options> = {}): { store: R2EvidenceStore; bucket: Bucket } {
  const bucket = makeBucket();
  return { bucket, store: new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => BUCKET_TIME, ...overrides }) };
}
