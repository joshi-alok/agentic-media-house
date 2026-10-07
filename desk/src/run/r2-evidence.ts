import { describeIssues } from '../issues';
import { sha256Hex } from '../model/types';
import { EvidenceError, EvidenceMeta } from './evidence';
import type { EvidenceErrorKind, EvidenceStore } from './evidence';
import { signRequest } from './sigv4';

// The private evidence bucket: `EvidenceStore` over the S3 interface of Cloudflare R2. A snapshot is an object named by the SHA-256 of its text, with where it came from as the
// metadata of the object, in one of two places of the bucket: `pending/<hash>` when it was only put (a rule of the bucket removes what is there after 90 days, which the runbook sets), and
// `published/<hash>` when it was kept, because a published piece cites it (nothing removes those). Every request is signed (`signRequest`), goes to `<endpoint>/<bucket>/<key>`
// (the path-style address, which R2 takes), and is made by a function that is handed in with the shape of `fetch`, so that a test gives it a bucket made of memory and nothing here
// opens a connection of its own.
//
// What is read back is checked: the text of an object must hash to its name, as with the folder on disk. A store that cannot be reached, that refuses, that has been changed or
// that has nothing under the name says so as an `EvidenceError` of the kind that it is, and never goes on: the Desk does not publish what it cannot keep the evidence of.
// A message has the status and the start of what the bucket said, cut at 200 characters, and no key: the secret is only ever in the signing, and every message is made with both keys taken out.

/** A request that the store makes: what `fetch` is given besides the address. */
export interface StoreRequest {
  method: 'GET' | 'HEAD' | 'PUT';
  headers: Record<string, string>;
  body?: string;
  /** Always `manual`: an answer that is a redirect is an endpoint that is wrong, and is not followed. */
  redirect: 'manual';
  /** Ends at the time limit of the store. */
  signal: AbortSignal;
}

/** A function like `fetch`. The default is the global `fetch`; a test passes a bucket made of memory. */
export type StoreTransport = (url: string, init: StoreRequest) => Promise<Response>;

/** Where a snapshot is that was only put, and where it is that was kept. */
export const PENDING_PREFIX = 'pending/';
export const PUBLISHED_PREFIX = 'published/';

/** R2 has one region, which it calls `auto`, and takes the signature of the service `s3`. */
const REGION = 'auto';
const SERVICE = 's3';

const HASH = /^[0-9a-f]{64}$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const CONTENT_TYPE = 'text/plain; charset=utf-8';
/** What the bucket may be told about a snapshot as the metadata of its object: S3 allows 2 KB of it, and the names of the headers are counted. */
const MAX_METADATA = 2000;
/** How much of what a bucket said is put in a message. */
const EXCERPT = 200;
const DEFAULT_TIMEOUT_MS = 20_000;

/** The names of the headers that carry the record of a snapshot. The address after the redirects is only there when it is another address. */
const META_HEADERS = { url: 'x-amz-meta-url', finalUrl: 'x-amz-meta-final-url', tier: 'x-amz-meta-tier', retrievedAt: 'x-amz-meta-retrieved-at' } as const;

export interface R2Options {
  /** The address of the account's S3 interface: `https://<account>.r2.cloudflarestorage.com`, with no path. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** How requests are made; the default is the global `fetch`. */
  transport?: StoreTransport;
  /** The clock, which the signature carries. A test passes its own. */
  now?: () => Date;
  /** The longest the store waits for an answer, in milliseconds. Default 20000. */
  timeoutMs?: number;
}

/** How an error is said: its message, and the message of its cause when it has one (`fetch failed` of node says nothing without it). */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const message = error.message || error.name;
  return error.cause instanceof Error ? `${message} (${error.cause.message})` : message;
}

/** The kind of trouble that an answer is, from its status. A 404 is "missing"; a bucket that is busy, down or somewhere else (a 408, a 429, a 5xx, a redirect, any status below 400) is "unreachable"; any other answer (a 401, a 403, a 400) is a refusal, "denied". */
function kindOfStatus(status: number): EvidenceErrorKind {
  if (status === 404) return 'missing';
  if (status < 400 || status === 408 || status === 429 || status >= 500) return 'unreachable';
  return 'denied';
}

/** The record of a snapshot as the headers of an object. The addresses may have characters that a header cannot, so they are escaped. */
function metadataOf(meta: EvidenceMeta): Record<string, string> {
  const headers: Record<string, string> = {
    [META_HEADERS.url]: encodeURIComponent(meta.url),
    [META_HEADERS.tier]: String(meta.tier),
    [META_HEADERS.retrievedAt]: meta.retrievedAt,
  };
  if (meta.finalUrl !== meta.url) headers[META_HEADERS.finalUrl] = encodeURIComponent(meta.finalUrl);
  const size = Object.entries(headers).reduce((total, [name, value]) => total + name.length + value.length, 0);
  if (size > MAX_METADATA) throw new Error(`the record of the evidence is too long to be the metadata of an object (${size} bytes, and at most ${MAX_METADATA})`);
  return headers;
}

/** What a header says, with its escapes undone; the header as it is when it has an escape that is not one, which the record then refuses. */
function unescaped(value: string | null): string | undefined {
  if (value === null) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class R2EvidenceStore implements EvidenceStore {
  private readonly base: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly transport: StoreTransport;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: R2Options) {
    let endpoint: URL | undefined;
    try {
      endpoint = new URL(options.endpoint);
    } catch {
      endpoint = undefined;
    }
    // What is wrong is said without saying what the endpoint was: a key pasted into the wrong setting would be in the message.
    if (endpoint === undefined || endpoint.protocol !== 'https:' || endpoint.username !== '' || endpoint.password !== '' || endpoint.pathname !== '/' || endpoint.search !== '' || endpoint.hash !== '') {
      throw new Error('the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com');
    }
    if (!BUCKET_NAME.test(options.bucket)) throw new Error('the bucket name is 3 to 63 lowercase letters, digits and hyphens');
    this.base = `${endpoint.origin}/${options.bucket}/`;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.transport = options.transport ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // A key that cannot sign is found now, before a run has spent anything, and not at the first page.
    this.sign('HEAD', 'check', {}, undefined);
  }

  /** The headers of a request, signed. */
  private sign(method: string, key: string, headers: Record<string, string>, body: string | undefined): Record<string, string> {
    return signRequest({
      method,
      url: `${this.base}${key}`,
      headers,
      body: body ?? '',
      region: REGION,
      service: SERVICE,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      now: this.now(),
    });
  }

  /** A text with both keys taken out of it. */
  private redact(text: string): string {
    return text.split(this.secretAccessKey).join('***').split(this.accessKeyId).join('***');
  }

  /** What a bucket said, on one line of printable characters, with both keys taken out first (so that a key cut in two by the end of the excerpt is not half there), and cut at 200 characters. */
  private excerpt(text: string): string {
    const clean = this.redact(text)
      .replace(/[^\x20-\x7e]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    return clean.length > EXCERPT ? `${clean.slice(0, EXCERPT)}...` : clean;
  }

  /** An error of the store, with the keys taken out of its message. */
  private fail(kind: EvidenceErrorKind, message: string): EvidenceError {
    return new EvidenceError(kind, this.redact(message));
  }

  /** Make one request, signed. A request that does not get an answer is unreachable. */
  private async send(method: StoreRequest['method'], key: string, headers: Record<string, string> = {}, body?: string): Promise<Response> {
    const url = `${this.base}${key}`;
    const signed = this.sign(method, key, headers, body);
    try {
      return await this.transport(url, { method, headers: signed, ...(body === undefined ? {} : { body }), redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw this.fail('unreachable', `the evidence store could not be reached (${method} ${key}): ${this.excerpt(describeError(error))}`);
    }
  }

  /** The error for an answer that is not the one that was wanted: what was asked, the status, and the start of what the bucket said. */
  private async refusal(method: StoreRequest['method'], key: string, response: Response): Promise<EvidenceError> {
    let said = '';
    if (method !== 'HEAD') {
      try {
        said = await response.text();
      } catch {
        said = '';
      }
    }
    const excerpt = this.excerpt(said);
    return this.fail(kindOfStatus(response.status), `the evidence store answered ${method} ${key} with ${response.status}${excerpt === '' ? '' : `: ${excerpt}`}`);
  }

  /** Whether the object is there: 200 says yes and 404 says no, and anything else is an error. */
  private async exists(key: string): Promise<boolean> {
    const response = await this.send('HEAD', key);
    if (response.status === 200) return true;
    if (response.status === 404) return false;
    throw await this.refusal('HEAD', key, response);
  }

  private async store(key: string, text: string, metadata: Record<string, string>): Promise<void> {
    const response = await this.send('PUT', key, { 'content-type': CONTENT_TYPE, ...metadata }, text);
    if (response.status < 200 || response.status >= 300) throw await this.refusal('PUT', key, response);
    // What is left of the answer is read, so that the connection is let go.
    await response.text().catch(() => undefined);
  }

  async put(text: string, meta: EvidenceMeta): Promise<{ hash: string }> {
    const parsed = EvidenceMeta.safeParse(meta);
    if (!parsed.success) throw new Error(`the record of the evidence is not valid: ${describeIssues(parsed.error)}`);
    // A record that cannot be the metadata of an object is found before the bucket is asked anything.
    const metadata = metadataOf(parsed.data);
    const hash = sha256Hex(text);
    // A snapshot that is there, put or kept, is left exactly as it is, and its first record stays.
    if (await this.has(hash)) return { hash };
    await this.store(`${PENDING_PREFIX}${hash}`, text, metadata);
    return { hash };
  }

  async get(hash: string): Promise<{ text: string; meta: EvidenceMeta }> {
    if (!HASH.test(hash)) throw new Error(`${JSON.stringify(hash)} is not a snapshot hash: 64 lowercase hex characters`);
    for (const prefix of [PENDING_PREFIX, PUBLISHED_PREFIX]) {
      const key = `${prefix}${hash}`;
      const response = await this.send('GET', key);
      if (response.status === 404) {
        await response.text().catch(() => undefined);
        continue;
      }
      if (response.status !== 200) throw await this.refusal('GET', key, response);
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw this.fail('unreachable', `the evidence store did not send the whole of the answer (GET ${key}): ${this.excerpt(describeError(error))}`);
      }
      if (sha256Hex(text) !== hash) throw this.fail('tampered', `the evidence ${hash} has been changed: its text no longer matches its hash`);
      return { text, meta: this.metaOf(hash, response.headers) };
    }
    throw this.fail('missing', `no evidence is stored for ${hash}`);
  }

  /** The record of a snapshot, from the headers of its object. An object with none of them has no record; one with a record that is not valid has been changed. */
  private metaOf(hash: string, headers: Headers): EvidenceMeta {
    if (Object.values(META_HEADERS).every((name) => !headers.has(name))) throw this.fail('missing', `the evidence ${hash} has no record of where it came from`);
    const url = unescaped(headers.get(META_HEADERS.url));
    const tier = headers.get(META_HEADERS.tier);
    const parsed = EvidenceMeta.safeParse({
      url,
      finalUrl: unescaped(headers.get(META_HEADERS.finalUrl)) ?? url,
      tier: tier === null ? undefined : Number(tier),
      retrievedAt: headers.get(META_HEADERS.retrievedAt) ?? undefined,
    });
    if (!parsed.success) throw this.fail('tampered', `the record of the evidence ${hash} is not valid: ${describeIssues(parsed.error)}`);
    return parsed.data;
  }

  async has(hash: string): Promise<boolean> {
    if (!HASH.test(hash)) return false;
    return (await this.exists(`${PENDING_PREFIX}${hash}`)) || (await this.exists(`${PUBLISHED_PREFIX}${hash}`));
  }

  async keep(hash: string): Promise<void> {
    if (!HASH.test(hash)) throw new Error(`${JSON.stringify(hash)} is not a snapshot hash: 64 lowercase hex characters`);
    const key = `${PUBLISHED_PREFIX}${hash}`;
    if (await this.exists(key)) return;
    // What is kept is what `get` gives, so a snapshot that has been changed is not kept.
    const { text, meta } = await this.get(hash);
    await this.store(key, text, metadataOf(meta));
  }
}
