import { createHash, createHmac } from 'node:crypto';

// AWS Signature Version 4, written with node:crypto and nothing else. The private evidence bucket is reached through the S3 interface of Cloudflare R2, and every request to it has
// to carry a signature that proves who asks and that the request was not changed on the way. The signature is made of five things, each one a function here so that each can be
// checked against the worked examples that Amazon publishes: the canonical request (the request written in one fixed way), the string to sign (the canonical request, hashed, with
// the time and the scope), the signing key (the secret, mixed with the day, the region and the service), and the signature (the string to sign, keyed). `signRequest` puts them together.
//
// Everything is fixed for S3: a path is encoded once and is not normalised, the hash of the body is always sent and always made (a payload is never "unsigned"), and every header
// that is sent besides the host, the time and the hash is signed. Whatever could be read in two ways is refused instead of guessed: a plus sign in a path or a query string (S3 may
// read it as a space), a percent sign that is not an escape, a header with a character that is not printable ASCII, and a header that the signing sets itself.

/** The name of the algorithm, which is the first line of every string to sign and the first word of every authorization header. */
export const SIGNING_ALGORITHM = 'AWS4-HMAC-SHA256';

const HEX_64 = /^[0-9a-f]{64}$/;
const AMZ_DATE = /^\d{8}T\d{6}Z$/;
const NAME_OF_PLACE = /^[a-z0-9][a-z0-9-]*$/;
const HEADER_NAME = /^[a-z0-9-]+$/;
const PRINTABLE = /^[\t\x20-\x7e]*$/;

/** The headers that the signing sets, which a caller cannot give. */
const SET_BY_SIGNING = ['authorization', 'host', 'x-amz-content-sha256', 'x-amz-date'];

/** The order of two texts by their code units, which for the ASCII texts of a signature is the order of their bytes: below zero, zero or above zero. */
const compareText = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** The SHA-256 of a body, as 64 lowercase hex characters. A text is hashed as its UTF-8 bytes. */
export function hashBody(body: string | Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/** The time of a request as a signature writes it: the year to the second, in UTC, with no separators, such as `20130524T000000Z`. */
export function amzDate(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error('the time of a request to sign is not a date');
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Check that a text is the time of a signature, and give it back. */
function checkedDate(date: string): string {
  if (!AMZ_DATE.test(date)) throw new Error('the date of a signature is written 20130524T000000Z');
  return date;
}

/** Check a region or a service. */
function checkedPlace(kind: 'region' | 'service', text: string): string {
  if (!NAME_OF_PLACE.test(text)) throw new Error(`the ${kind} of a signing key is lowercase letters, digits and hyphens`);
  return text;
}

/** The scope of a credential: the day, the region, the service and the word `aws4_request`, with slashes between. */
export function credentialScope(parts: { amzDate: string; region: string; service: string }): string {
  return `${checkedDate(parts.amzDate).slice(0, 8)}/${checkedPlace('region', parts.region)}/${checkedPlace('service', parts.service)}/aws4_request`;
}

/** A text written as a path or a query string of S3 wants it: every byte but the letters, the digits and `-_.~` as `%` and two capital hex digits. */
function encode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** What an escaped text says, or an error that says where the escape is wrong. */
function decode(text: string, where: 'path' | 'query string'): string {
  try {
    return decodeURIComponent(text);
  } catch {
    throw new Error(`the ${where} has a percent sign that is not followed by two hex digits`);
  }
}

/**
 * The path of an address as the canonical request has it. Each segment is decoded and encoded again, once (so `%2f` becomes `%2F` and `$` becomes `%24`, and nothing is encoded twice,
 * which is the rule of S3). Empty segments and a slash at the end stay, and a dot is not resolved: S3 does not normalise a path. The path is the one that an address gives, which starts
 * with a slash.
 */
export function canonicalUri(pathname: string): string {
  if (!pathname.startsWith('/')) throw new Error('a path starts with a slash');
  if (pathname.includes('+')) throw new Error('a plus sign in a path can be read as a space: write a plus sign as %2B and a space as %20');
  return pathname
    .split('/')
    .map((segment) => encode(decode(segment, 'path')))
    .join('/');
}

/**
 * The query string of an address as the canonical request has it: the pairs of names and values, each encoded once, sorted by name and then by value, joined with `&`, and a name with no
 * value written with an equals sign and nothing after it (`lifecycle=`). With or without the question mark in front; empty pairs are left out.
 */
export function canonicalQueryString(search: string): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query.includes('+')) throw new Error('a plus sign in a query string can be read as a space: write a plus sign as %2B and a space as %20');
  const pairs = query
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair): [string, string] => {
      const at = pair.indexOf('=');
      const name = at < 0 ? pair : pair.slice(0, at);
      const value = at < 0 ? '' : pair.slice(at + 1);
      return [encode(decode(name, 'query string')), encode(decode(value, 'query string'))];
    });
  pairs.sort(([aName, aValue], [bName, bValue]) => compareText(aName, bName) || compareText(aValue, bValue));
  return pairs.map(([name, value]) => `${name}=${value}`).join('&');
}

/** The headers as the signature has them: the names in lowercase, the values trimmed with each run of spaces and tabs made one space, sorted by name. A name that is given twice is refused. */
function normalisedHeaders(headers: Readonly<Record<string, string>>): [string, string][] {
  const seen = new Map<string, string>();
  for (const [given, value] of Object.entries(headers)) {
    const name = given.toLowerCase();
    if (!HEADER_NAME.test(name)) throw new Error(`${JSON.stringify(given)} is not a header name: letters, digits and hyphens`);
    if (seen.has(name)) throw new Error(`the header ${name} is given twice`);
    if (!PRINTABLE.test(value)) throw new Error(`the value of the header ${name} is not printable ASCII`);
    seen.set(name, value.trim().replace(/[ \t]+/g, ' '));
  }
  return [...seen].sort(([a], [b]) => compareText(a, b));
}

/** The names of the headers that are signed, in lowercase, sorted, joined with `;`: `host;range;x-amz-content-sha256;x-amz-date`. */
export function signedHeaders(headers: Readonly<Record<string, string>>): string {
  return normalisedHeaders(headers)
    .map(([name]) => name)
    .join(';');
}

/** An address as a URL, if it is an http or https address with no user name or password in it. What is wrong is said without saying what the address was, which may have a password in it. */
function parsedAddress(address: string): URL {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error('the address to sign is not an http or https address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('the address to sign is not an http or https address');
  if (url.username !== '' || url.password !== '') throw new Error('the address to sign has a user name or a password in it');
  return url;
}

const checkedMethod = (method: string): string => {
  if (!/^[A-Z]+$/.test(method)) throw new Error('the method is capital letters');
  return method;
};

/**
 * The request written in one fixed way: the method, the path, the query string, the headers (each as `name:value`, sorted), an empty line, the names of the headers, and the hash of the
 * payload, on separate lines. `url` is read as an address, so a dot in its path is resolved before it is signed, as the same address would be before it is sent.
 */
export function canonicalRequest(parts: { method: string; url: string; headers: Readonly<Record<string, string>>; payloadHash: string }): string {
  if (!HEX_64.test(parts.payloadHash)) throw new Error('the hash of the payload is 64 lowercase hex characters');
  const url = parsedAddress(parts.url);
  const headers = normalisedHeaders(parts.headers);
  return [
    checkedMethod(parts.method),
    canonicalUri(url.pathname),
    canonicalQueryString(url.search),
    ...headers.map(([name, value]) => `${name}:${value}`),
    '',
    headers.map(([name]) => name).join(';'),
    parts.payloadHash,
  ].join('\n');
}

/** What is signed: the algorithm, the time, the scope and the hash of the canonical request, on separate lines. */
export function stringToSign(parts: { amzDate: string; region: string; service: string; canonicalRequest: string }): string {
  return [SIGNING_ALGORITHM, parts.amzDate, credentialScope(parts), hashBody(parts.canonicalRequest)].join('\n');
}

const mac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** The key that signs: the secret, mixed with the day (`20130524`), the region, the service and the word `aws4_request`, one HMAC after another. It is good for that day, that region and that service. */
export function signingKey(parts: { secretAccessKey: string; date: string; region: string; service: string }): Buffer {
  if (!/^\d{8}$/.test(parts.date)) throw new Error('the day of a signing key is eight digits, such as 20130524');
  if (parts.secretAccessKey === '') throw new Error('the secret access key is empty');
  const region = checkedPlace('region', parts.region);
  const service = checkedPlace('service', parts.service);
  return mac(mac(mac(mac(`AWS4${parts.secretAccessKey}`, parts.date), region), service), 'aws4_request');
}

/** The signature: the string to sign, keyed with the signing key, as 64 lowercase hex characters. */
export function signatureOf(key: Buffer, text: string): string {
  return createHmac('sha256', key).update(text).digest('hex');
}

/** A request to sign. The body is the whole of it (a text is taken as UTF-8); a request with no body has the empty text. */
export interface SigningRequest {
  method: string;
  url: string;
  /** Headers to send and sign besides the ones that the signing sets (see `signRequest`). */
  headers?: Readonly<Record<string, string>>;
  body: string | Uint8Array;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}

/**
 * Sign a request, and give every header to send with it, in lowercase: the headers that were given, `host` (as the address gives it), `x-amz-date`, `x-amz-content-sha256` (the hash of the
 * body, always) and `authorization`. Every header but `authorization` is signed, so what is signed is what is sent. A request that cannot be signed is refused with a message that says why
 * and never has the secret in it.
 */
export function signRequest(request: SigningRequest): Record<string, string> {
  const method = checkedMethod(request.method);
  const url = parsedAddress(request.url);
  const region = checkedPlace('region', request.region);
  const service = checkedPlace('service', request.service);
  if (!/^[A-Za-z0-9]+$/.test(request.accessKeyId)) throw new Error('the access key id is letters and digits');
  if (request.secretAccessKey === '') throw new Error('the secret access key is empty');
  if (!/^[\x21-\x7e]+$/.test(request.secretAccessKey)) throw new Error('the secret access key is printable ASCII with no spaces');
  const time = amzDate(request.now);

  const given: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    const lower = name.toLowerCase();
    if (SET_BY_SIGNING.includes(lower)) throw new Error(`the header ${lower} is set by the signing`);
    if (lower in given) throw new Error(`the header ${lower} is given twice`);
    given[lower] = value;
  }
  const payloadHash = hashBody(request.body);
  const headers = { ...given, host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': time };

  const canonical = canonicalRequest({ method, url: request.url, headers, payloadHash });
  const key = signingKey({ secretAccessKey: request.secretAccessKey, date: time.slice(0, 8), region, service });
  const signature = signatureOf(key, stringToSign({ amzDate: time, region, service, canonicalRequest: canonical }));
  const authorization = `${SIGNING_ALGORITHM} Credential=${request.accessKeyId}/${credentialScope({ amzDate: time, region, service })}, SignedHeaders=${signedHeaders(headers)}, Signature=${signature}`;
  return { ...headers, authorization };
}
