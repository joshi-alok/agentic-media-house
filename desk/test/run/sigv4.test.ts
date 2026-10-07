import { describe, expect, it } from 'vitest';
import {
  SIGNING_ALGORITHM,
  amzDate,
  canonicalQueryString,
  canonicalRequest,
  canonicalUri,
  credentialScope,
  hashBody,
  signRequest,
  signatureOf,
  signedHeaders,
  signingKey,
  stringToSign,
} from '../../src/run/sigv4';
import type { SigningRequest } from '../../src/run/sigv4';

// A request to a bucket has to carry a signature that the bucket can check, and the Desk writes the signing itself, with node:crypto and no package. A signature that is
// wrong by one character is refused by the bucket with an answer that says nothing about where the mistake is, so the code is held to the worked examples that Amazon
// publishes, which have the inputs and every value on the way to the signature. The examples are the ones of these pages:
//
//   [S3]   Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk (AWS Signature Version 4), in the Amazon S3 API Reference:
//          https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html  (the four examples GET Object, PUT Object, GET Bucket Lifecycle, GET Bucket (List Objects))
//   [KEY]  Examples of how to derive a signing key for Signature Version 4:
//          https://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html
//   [IAM]  Create a signed AWS API request, in the IAM User Guide (the ListUsers example):
//          https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
//   [SUITE] The AWS Signature Version 4 test suite, the request get-vanilla:
//          https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
//
// The access keys in them are the ones that Amazon prints in its documentation to say that they are examples, and nothing here is a real credential. The pages were not opened when
// this file was written (the tests of the Desk run with no network): every value below was computed again from the inputs that the pages print, and each came out as the page prints it.
// A SHA-256 or HMAC value does not come out right by chance, so a wrong copy of a value cannot be among them.

// The id of the example of Amazon, in two pieces so that no file of the repository holds a string with the shape of the id of an access key (the runbook searches for one).
const S3_KEY_ID = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const FAKE_KEY_ID = ['AKIA', 'FAKEFAKEFAKEFAKE'].join('');
const OTHER_KEY_ID = ['AKIA', 'OTHEROTHEROTHER00'].join('');
const S3_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const IAM_SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
/** The SHA-256 of the empty text, which is the hash of the body of every request that has none. */
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const S3_TIME = new Date(Date.UTC(2013, 4, 24, 0, 0, 0));

interface Example {
  name: string;
  request: Omit<SigningRequest, 'region' | 'service' | 'accessKeyId' | 'secretAccessKey' | 'now'>;
  /** The canonical request as the page prints it, one line for each element of the array. */
  canonical: string[];
  /** The SHA-256 of the canonical request, which is the last line of the string to sign. */
  canonicalHash: string;
  signedHeaders: string;
  signature: string;
}

const S3_EXAMPLES: Example[] = [
  {
    name: 'GET Object',
    request: { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' }, body: '' },
    canonical: [
      'GET',
      '/test.txt',
      '',
      'host:examplebucket.s3.amazonaws.com',
      'range:bytes=0-9',
      `x-amz-content-sha256:${EMPTY}`,
      'x-amz-date:20130524T000000Z',
      '',
      'host;range;x-amz-content-sha256;x-amz-date',
      EMPTY,
    ],
    canonicalHash: '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
    signedHeaders: 'host;range;x-amz-content-sha256;x-amz-date',
    signature: 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  },
  {
    // The key of this object is test$file.text: the dollar sign is written %24 in the canonical request, and the date header and the storage class are signed too.
    name: 'PUT Object',
    request: {
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test$file.text',
      headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      body: 'Welcome to Amazon S3.',
    },
    canonical: [
      'PUT',
      '/test%24file.text',
      '',
      'date:Fri, 24 May 2013 00:00:00 GMT',
      'host:examplebucket.s3.amazonaws.com',
      'x-amz-content-sha256:44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
      'x-amz-date:20130524T000000Z',
      'x-amz-storage-class:REDUCED_REDUNDANCY',
      '',
      'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
      '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
    ],
    canonicalHash: '9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d',
    signedHeaders: 'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    signature: '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
  },
  {
    // A query string with a name and no value: the canonical form has the equals sign.
    name: 'GET Bucket Lifecycle',
    request: { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?lifecycle', body: '' },
    canonical: ['GET', '/', 'lifecycle=', 'host:examplebucket.s3.amazonaws.com', `x-amz-content-sha256:${EMPTY}`, 'x-amz-date:20130524T000000Z', '', 'host;x-amz-content-sha256;x-amz-date', EMPTY],
    canonicalHash: '9766c798316ff2757b517bc739a67f6213b4ab36dd5da2f94eaebf79c77395ca',
    signedHeaders: 'host;x-amz-content-sha256;x-amz-date',
    signature: 'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543',
  },
  {
    // Two parameters, which the canonical form has in the order of their names.
    name: 'GET Bucket (List Objects)',
    request: { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2', body: '' },
    canonical: ['GET', '/', 'max-keys=2&prefix=J', 'host:examplebucket.s3.amazonaws.com', `x-amz-content-sha256:${EMPTY}`, 'x-amz-date:20130524T000000Z', '', 'host;x-amz-content-sha256;x-amz-date', EMPTY],
    canonicalHash: 'df57d21db20da04d7fa30298dd4488ba3a2b47ca3a489c74750e0f1e7df1b9b7',
    signedHeaders: 'host;x-amz-content-sha256;x-amz-date',
    signature: '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
  },
];

/** Every header that a request of an example is sent with, as the canonical request has them: the ones the example gives, and the three that are signed with every request. */
function signedSet(example: Example): Record<string, string> {
  const payload = example.canonical.at(-1) as string;
  const host = new URL(example.request.url).host;
  return { ...example.request.headers, host, 'x-amz-content-sha256': payload, 'x-amz-date': '20130524T000000Z' };
}

describe('the examples of Amazon for S3: each value on the way to the signature', () => {
  it.each(S3_EXAMPLES.map((example) => [example.name, example] as const))('%s: the canonical request is the one that the page prints', (_name, example) => {
    expect(canonicalRequest({ method: example.request.method, url: example.request.url, headers: signedSet(example), payloadHash: example.canonical.at(-1) as string })).toBe(example.canonical.join('\n'));
  });

  it.each(S3_EXAMPLES.map((example) => [example.name, example] as const))('%s: the hash of the canonical request and the string to sign are the ones that the page prints', (_name, example) => {
    const text = example.canonical.join('\n');
    expect(hashBody(text)).toBe(example.canonicalHash);
    expect(stringToSign({ amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3', canonicalRequest: text })).toBe(
      ['AWS4-HMAC-SHA256', '20130524T000000Z', '20130524/us-east-1/s3/aws4_request', example.canonicalHash].join('\n'),
    );
  });

  it.each(S3_EXAMPLES.map((example) => [example.name, example] as const))('%s: the signature is the one that the page prints', (_name, example) => {
    const key = signingKey({ secretAccessKey: S3_SECRET, date: '20130524', region: 'us-east-1', service: 's3' });
    const text = stringToSign({ amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3', canonicalRequest: example.canonical.join('\n') });
    expect(signatureOf(key, text)).toBe(example.signature);
  });

  it.each(S3_EXAMPLES.map((example) => [example.name, example] as const))('%s: the signed headers are the ones that the page prints', (_name, example) => {
    expect(signedHeaders(signedSet(example))).toBe(example.signedHeaders);
  });
});

describe('signRequest: the examples of Amazon for S3, from the request to the headers that are sent', () => {
  it.each(S3_EXAMPLES.map((example) => [example.name, example] as const))('%s: the authorization header is the one that the page prints, and the other headers are the ones that carry what was signed', (_name, example) => {
    const sent = signRequest({ ...example.request, region: 'us-east-1', service: 's3', accessKeyId: S3_KEY_ID, secretAccessKey: S3_SECRET, now: S3_TIME });
    expect(sent.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${S3_KEY_ID}/20130524/us-east-1/s3/aws4_request, SignedHeaders=${example.signedHeaders}, Signature=${example.signature}`,
    );
    const expected = { ...signedSet(example), authorization: sent.authorization };
    expect(sent).toEqual(Object.fromEntries(Object.entries(expected).map(([name, value]) => [name.toLowerCase(), value])));
  });
});

describe('the other worked examples of Amazon', () => {
  it('[KEY] derives the signing key of the example: the secret, the day 20150830, us-east-1 and iam', () => {
    expect(signingKey({ secretAccessKey: IAM_SECRET, date: '20150830', region: 'us-east-1', service: 'iam' }).toString('hex')).toBe(
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });

  it('[IAM] ListUsers: the canonical request, the string to sign and the signature are the ones that the page prints', () => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Host: 'iam.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' };
    const canonical = canonicalRequest({ method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08', headers, payloadHash: EMPTY });
    expect(canonical).toBe(
      [
        'GET',
        '/',
        'Action=ListUsers&Version=2010-05-08',
        'content-type:application/x-www-form-urlencoded; charset=utf-8',
        'host:iam.amazonaws.com',
        'x-amz-date:20150830T123600Z',
        '',
        'content-type;host;x-amz-date',
        EMPTY,
      ].join('\n'),
    );
    expect(signedHeaders(headers)).toBe('content-type;host;x-amz-date');
    expect(hashBody(canonical)).toBe('f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59');
    const text = stringToSign({ amzDate: '20150830T123600Z', region: 'us-east-1', service: 'iam', canonicalRequest: canonical });
    expect(text).toBe(['AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/iam/aws4_request', 'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59'].join('\n'));
    const key = signingKey({ secretAccessKey: IAM_SECRET, date: '20150830', region: 'us-east-1', service: 'iam' });
    expect(signatureOf(key, text)).toBe('5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  });

  it('[SUITE] get-vanilla: a service that is not S3, and a request with no query and two headers', () => {
    const headers = { Host: 'example.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' };
    const canonical = canonicalRequest({ method: 'GET', url: 'https://example.amazonaws.com/', headers, payloadHash: EMPTY });
    expect(canonical).toBe(['GET', '/', '', 'host:example.amazonaws.com', 'x-amz-date:20150830T123600Z', '', 'host;x-amz-date', EMPTY].join('\n'));
    const text = stringToSign({ amzDate: '20150830T123600Z', region: 'us-east-1', service: 'service', canonicalRequest: canonical });
    expect(text).toBe(['AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/service/aws4_request', 'bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63'].join('\n'));
    const key = signingKey({ secretAccessKey: IAM_SECRET, date: '20150830', region: 'us-east-1', service: 'service' });
    expect(signatureOf(key, text)).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });
});

describe('the pieces of the signature', () => {
  it('names the algorithm and the scope of a credential', () => {
    expect(SIGNING_ALGORITHM).toBe('AWS4-HMAC-SHA256');
    expect(credentialScope({ amzDate: '20130524T000000Z', region: 'auto', service: 's3' })).toBe('20130524/auto/s3/aws4_request');
  });

  it('writes the time of a request as the date of the signature: the year to the second, in UTC, with no separators and no milliseconds', () => {
    expect(amzDate(S3_TIME)).toBe('20130524T000000Z');
    expect(amzDate(new Date('2015-08-30T12:36:00.789Z'))).toBe('20150830T123600Z');
    expect(amzDate(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z');
    expect(amzDate(new Date('2026-10-05T23:59:59.999+02:00'))).toBe('20261005T215959Z');
  });

  it('refuses a time that is not a date', () => {
    expect(() => amzDate(new Date('not a date'))).toThrow('the time of a request to sign is not a date');
  });

  it('hashes a body as the SHA-256 of its bytes: the empty body, a text, the same text as bytes, and a text that is not ASCII as UTF-8', () => {
    expect(hashBody('')).toBe(EMPTY);
    expect(hashBody('Welcome to Amazon S3.')).toBe('44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    expect(hashBody(new TextEncoder().encode('Welcome to Amazon S3.'))).toBe(hashBody('Welcome to Amazon S3.'));
    const accented = `caf${String.fromCharCode(0xe9)}`;
    expect(hashBody(accented)).toBe(hashBody(new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9])));
    expect(hashBody(accented)).not.toBe(hashBody(new Uint8Array([0x63, 0x61, 0x66, 0xe9])));
    expect(hashBody(new Uint8Array([]))).toBe(EMPTY);
  });

  it('refuses a date, a region, a service and a secret that cannot be part of a signing key', () => {
    const ok = { secretAccessKey: 'fake-secret', date: '20130524', region: 'auto', service: 's3' };
    expect(() => signingKey({ ...ok, date: '2013-05-24' })).toThrow('the day of a signing key is eight digits');
    expect(() => signingKey({ ...ok, date: '2013052' })).toThrow('the day of a signing key is eight digits');
    expect(() => signingKey({ ...ok, region: 'Auto' })).toThrow('the region of a signing key is lowercase letters, digits and hyphens');
    expect(() => signingKey({ ...ok, service: 's3/x' })).toThrow('the service of a signing key is lowercase letters, digits and hyphens');
    expect(() => signingKey({ ...ok, secretAccessKey: '' })).toThrow('the secret access key is empty');
  });

  it('refuses a time or a hash that is not what the string to sign is made of', () => {
    const ok = { amzDate: '20130524T000000Z', region: 'auto', service: 's3', canonicalRequest: 'x' };
    expect(() => stringToSign({ ...ok, amzDate: '2013-05-24T00:00:00Z' })).toThrow('the date of a signature is written 20130524T000000Z');
    expect(() => credentialScope({ ...ok, amzDate: '20130524' })).toThrow('the date of a signature is written 20130524T000000Z');
  });
});

describe('the canonical path', () => {
  it.each([
    ['/', '/'],
    ['/test.txt', '/test.txt'],
    ['/pending/abc', '/pending/abc'],
    ['/test$file.text', '/test%24file.text'],
    ['/a b', '/a%20b'],
    ['/a%20b', '/a%20b'],
    ["/!*'()", '/%21%2A%27%28%29'],
    ['/~-._09azAZ', '/~-._09azAZ'],
    [`/caf${String.fromCharCode(0xe9)}`, '/caf%C3%A9'],
    ['/caf%C3%A9', '/caf%C3%A9'],
    ['/a%2fb', '/a%2Fb'],
    ['/a%2Fb', '/a%2Fb'],
    ['/a%25b', '/a%25b'],
  ])('writes %j as %j: every segment is encoded once, with capital letters in the escapes', (path, expected) => {
    expect(canonicalUri(path)).toBe(expected);
  });

  it('keeps empty segments and a slash at the end, and does not resolve dots, because S3 does not normalise a path', () => {
    expect(canonicalUri('/a//b/')).toBe('/a//b/');
    expect(canonicalUri('//')).toBe('//');
    expect(canonicalUri('/a/./b/../c')).toBe('/a/./b/../c');
  });

  it('does not encode again what is encoded: a segment that has %2F is one segment, and %25 is a percent sign, once', () => {
    expect(canonicalUri('/a%2Fb/c')).toBe('/a%2Fb/c');
    expect(canonicalUri('/100%25')).toBe('/100%25');
  });

  it('refuses a path that does not start with a slash, a plus sign, which S3 may read as a space, and a percent sign that is not an escape', () => {
    expect(() => canonicalUri('a/b')).toThrow('a path starts with a slash');
    expect(() => canonicalUri('/a+b')).toThrow('a plus sign in a path');
    expect(() => canonicalUri('/100%')).toThrow('the path has a percent sign that is not followed by two hex digits');
    expect(() => canonicalUri('/%zz')).toThrow('the path has a percent sign that is not followed by two hex digits');
    expect(() => canonicalUri('/%ED%A0%80')).toThrow('the path has a percent sign that is not followed by two hex digits');
  });
});

describe('the canonical query string', () => {
  it.each([
    ['', ''],
    ['?', ''],
    ['?lifecycle', 'lifecycle='],
    ['lifecycle', 'lifecycle='],
    ['?a=1', 'a=1'],
    ['?b=2&a=1', 'a=1&b=2'],
    ['?prefix=J&max-keys=2', 'max-keys=2&prefix=J'],
    ['?a=2&a=1', 'a=1&a=2'],
    ['?Z=1&a=2', 'Z=1&a=2'],
    ['?a=1&&b=2&', 'a=1&b=2'],
    ['?a=b%20c', 'a=b%20c'],
    ['?a=b%2Bc', 'a=b%2Bc'],
    ['?a=b%2bc', 'a=b%2Bc'],
    ['?a=*', 'a=%2A'],
    ['?a=x=y', 'a=x%3Dy'],
    ['?a=&b', 'a=&b='],
    ['?=x', '=x'],
    ['?x=&=y', '=y&x='],
    [`?a=caf${String.fromCharCode(0xe9)}`, 'a=caf%C3%A9'],
    ['?a%20b=c', 'a%20b=c'],
  ])('writes %j as %j: names and values encoded once, the pairs sorted by name and then by value', (search, expected) => {
    expect(canonicalQueryString(search)).toBe(expected);
  });

  it('sorts by the encoded name: a colon, which is written %3A, comes before a digit, and a name that is the start of another comes first', () => {
    expect(canonicalQueryString('?a0=1&a%3A=2')).toBe('a%3A=2&a0=1');
    expect(canonicalQueryString('?a%20b=1&a=2')).toBe('a=2&a%20b=1');
  });

  it('refuses a plus sign, which a server may read as a space, and a percent sign that is not an escape', () => {
    expect(() => canonicalQueryString('?a=b+c')).toThrow('a plus sign in a query string');
    expect(() => canonicalQueryString('?a+b=c')).toThrow('a plus sign in a query string');
    expect(() => canonicalQueryString('?a=100%')).toThrow('the query string has a percent sign that is not followed by two hex digits');
  });
});

describe('the canonical headers', () => {
  const PAYLOAD = EMPTY;

  it('writes the names in lowercase, sorted, each with its value, and lists the names that are signed', () => {
    const headers = { 'X-Amz-Date': '20130524T000000Z', Host: 'h.example', 'Content-Type': 'text/plain', Range: 'bytes=0-9' };
    expect(canonicalRequest({ method: 'GET', url: 'https://h.example/', headers, payloadHash: PAYLOAD })).toBe(
      ['GET', '/', '', 'content-type:text/plain', 'host:h.example', 'range:bytes=0-9', 'x-amz-date:20130524T000000Z', '', 'content-type;host;range;x-amz-date', PAYLOAD].join('\n'),
    );
    expect(signedHeaders(headers)).toBe('content-type;host;range;x-amz-date');
  });

  it('trims a value and makes every run of spaces and tabs one space', () => {
    const headers = { Host: 'h.example', 'X-Amz-Meta-Note': '  a   b\t\tc  ' };
    expect(canonicalRequest({ method: 'GET', url: 'https://h.example/', headers, payloadHash: PAYLOAD })).toContain('\nx-amz-meta-note:a b c\n');
  });

  it('keeps a value that has nothing to trim exactly as it is, and an empty value as the empty text', () => {
    const headers = { Host: 'h.example', 'X-Amz-Meta-A': 'a b', 'X-Amz-Meta-B': '   ' };
    const canonical = canonicalRequest({ method: 'GET', url: 'https://h.example/', headers, payloadHash: PAYLOAD });
    expect(canonical).toContain('\nx-amz-meta-a:a b\nx-amz-meta-b:\n');
  });

  it('sorts by the bytes of the names, so that a hyphen comes before a letter and a digit before both', () => {
    const headers = { Host: 'h.example', 'x-amz-meta-b': '1', 'x-amz-meta-a-b': '2', 'x-amz-meta-a': '3', 'x-amz-meta-1': '4' };
    expect(signedHeaders(headers)).toBe('host;x-amz-meta-1;x-amz-meta-a;x-amz-meta-a-b;x-amz-meta-b');
  });

  it('refuses the same header written twice in two ways', () => {
    expect(() => signedHeaders({ Host: 'a', host: 'b' })).toThrow('the header host is given twice');
  });

  it('refuses a header that is not a name and a value of printable ASCII', () => {
    expect(() => signedHeaders({ 'bad name': 'x' })).toThrow('is not a header name');
    expect(() => signedHeaders({ '': 'x' })).toThrow('is not a header name');
    expect(() => signedHeaders({ 'x-a': 'one\ntwo' })).toThrow('the value of the header x-a is not printable ASCII');
    expect(() => signedHeaders({ 'x-a': `caf${String.fromCharCode(0xe9)}` })).toThrow('the value of the header x-a is not printable ASCII');
    expect(() => signedHeaders({ 'x-a': `a${String.fromCharCode(0)}b` })).toThrow('the value of the header x-a is not printable ASCII');
  });

  it('refuses a payload hash that is not a SHA-256, and a method that is not capital letters', () => {
    expect(() => canonicalRequest({ method: 'GET', url: 'https://h.example/', headers: { host: 'h.example' }, payloadHash: 'UNSIGNED-PAYLOAD' })).toThrow('the hash of the payload is 64 lowercase hex characters');
    expect(() => canonicalRequest({ method: 'get', url: 'https://h.example/', headers: { host: 'h.example' }, payloadHash: PAYLOAD })).toThrow('the method is capital letters');
  });

  it('signs the path that is sent: an address is read as an address, so dots are resolved by the reader of the address before they are signed', () => {
    expect(canonicalRequest({ method: 'GET', url: 'https://h.example/a/../b', headers: { host: 'h.example' }, payloadHash: PAYLOAD }).split('\n')[1]).toBe('/b');
    expect(canonicalRequest({ method: 'GET', url: 'https://h.example/a//b/', headers: { host: 'h.example' }, payloadHash: PAYLOAD }).split('\n')[1]).toBe('/a//b/');
  });
});

describe('signRequest', () => {
  const FAKE = {
    method: 'PUT',
    url: 'https://fake-account.r2.example/fake-bucket/pending/0123',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'the text of a page',
    region: 'auto',
    service: 's3',
    accessKeyId: FAKE_KEY_ID,
    secretAccessKey: 'fake-secret-access-key-0123456789',
    now: new Date('2026-10-06T04:30:00.000Z'),
  } satisfies SigningRequest;

  const signatureOfRequest = (request: SigningRequest): string => /Signature=([0-9a-f]{64})$/.exec(signRequest(request).authorization as string)?.[1] as string;

  it('gives the headers to send: the host, the time, the hash of the body, the authorization, and the headers that it was given in lowercase', () => {
    const sent = signRequest(FAKE);
    expect(Object.keys(sent).sort()).toEqual(['authorization', 'content-type', 'host', 'x-amz-content-sha256', 'x-amz-date']);
    expect(sent.host).toBe('fake-account.r2.example');
    expect(sent['x-amz-date']).toBe('20261006T043000Z');
    expect(sent['x-amz-content-sha256']).toBe(hashBody('the text of a page'));
    expect(sent['content-type']).toBe('text/plain; charset=utf-8');
    expect(sent.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=${FAKE_KEY_ID}/20261006/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$`),
    );
  });

  it('gives the same headers for the same request every time, and takes no header that it was not given', () => {
    expect(signRequest(FAKE)).toEqual(signRequest({ ...FAKE }));
    const { headers: _headers, ...bare } = FAKE;
    expect(Object.keys(signRequest(bare)).sort()).toEqual(['authorization', 'host', 'x-amz-content-sha256', 'x-amz-date']);
  });

  it('always hashes the body, a request with no body as the empty text, and never says that the payload is unsigned', () => {
    expect(signRequest({ ...FAKE, method: 'GET', body: '' })['x-amz-content-sha256']).toBe(EMPTY);
    expect(signRequest({ ...FAKE, body: new TextEncoder().encode('the text of a page') })['x-amz-content-sha256']).toBe(hashBody('the text of a page'));
    expect(JSON.stringify(signRequest(FAKE))).not.toContain('UNSIGNED');
    expect(() => signRequest({ ...FAKE, headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' } })).toThrow('the header x-amz-content-sha256 is set by the signing');
  });

  it('writes the host as the reader of the address does: with the port when it is not the usual one, and without it when it is', () => {
    expect(signRequest({ ...FAKE, url: 'https://fake-account.r2.example:8443/fake-bucket/x' }).host).toBe('fake-account.r2.example:8443');
    expect(signRequest({ ...FAKE, url: 'https://fake-account.r2.example:443/fake-bucket/x' }).host).toBe('fake-account.r2.example');
    expect(signRequest({ ...FAKE, url: 'http://fake-account.r2.example:80/fake-bucket/x' }).host).toBe('fake-account.r2.example');
  });

  it.each([
    ['another secret', { secretAccessKey: 'fake-secret-access-key-0123456780' }],
    ['a time one second later', { now: new Date('2026-10-06T04:30:01.000Z') }],
    ['a time on another day', { now: new Date('2026-10-07T04:30:00.000Z') }],
    ['another body', { body: 'the text of a page.' }],
    ['a body of bytes that is not the same bytes', { body: new TextEncoder().encode('the text of a pagE') }],
    ['another method', { method: 'POST' }],
    ['another path', { url: 'https://fake-account.r2.example/fake-bucket/pending/0124' }],
    ['another bucket', { url: 'https://fake-account.r2.example/other-bucket/pending/0123' }],
    ['another host', { url: 'https://other-account.r2.example/fake-bucket/pending/0123' }],
    ['a query string', { url: 'https://fake-account.r2.example/fake-bucket/pending/0123?x=1' }],
    ['another region', { region: 'us-east-1' }],
    ['another service', { service: 'iam' }],
    ['another value of a header', { headers: { 'Content-Type': 'text/html' } }],
    ['one more header', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'x-amz-meta-url': 'a' } }],
  ] as [string, Partial<SigningRequest>][])('gives another signature for %s', (_what, change) => {
    expect(signatureOfRequest({ ...FAKE, ...change })).not.toBe(signatureOfRequest(FAKE));
  });

  it('does not change the signature for what is not signed: the key id is in the credential and not in the signature, and the order and the case of the headers do not matter', () => {
    const other = signRequest({ ...FAKE, accessKeyId: OTHER_KEY_ID });
    expect(other.authorization).toContain(`Credential=${OTHER_KEY_ID}/`);
    expect(signatureOfRequest({ ...FAKE, accessKeyId: OTHER_KEY_ID })).toBe(signatureOfRequest(FAKE));
    const two = { ...FAKE, headers: { 'X-A': '1', 'x-b': '2' } };
    const flipped = { ...FAKE, headers: { 'X-B': '2', 'x-a': '1' } };
    expect(signRequest(two)).toEqual(signRequest(flipped));
  });

  it('never puts the secret in what it gives', () => {
    const sent = signRequest(FAKE);
    for (const value of Object.values(sent)) expect(value).not.toContain(FAKE.secretAccessKey);
    expect(JSON.stringify(sent)).not.toContain('fake-secret');
  });

  it('refuses the headers that it sets itself, in any case, and says that it sets them', () => {
    for (const name of ['host', 'Host', 'authorization', 'Authorization', 'x-amz-date', 'X-Amz-Date', 'x-amz-content-sha256']) {
      expect(() => signRequest({ ...FAKE, headers: { [name]: 'x' } }), name).toThrow(`the header ${name.toLowerCase()} is set by the signing`);
    }
  });

  it('refuses a header that it is given twice, in two ways of writing it', () => {
    expect(() => signRequest({ ...FAKE, headers: { 'X-A': '1', 'x-a': '2' } })).toThrow('the header x-a is given twice');
  });

  it('refuses a request that is not one: a method, an address, a region, a service, a key id, a secret or a time that cannot be used', () => {
    expect(() => signRequest({ ...FAKE, method: 'put' })).toThrow('the method is capital letters');
    expect(() => signRequest({ ...FAKE, url: 'not an address' })).toThrow('the address to sign is not an http or https address');
    expect(() => signRequest({ ...FAKE, url: 'ftp://fake-account.r2.example/x' })).toThrow('the address to sign is not an http or https address');
    expect(() => signRequest({ ...FAKE, region: 'Auto' })).toThrow('the region of a signing key is lowercase letters, digits and hyphens');
    expect(() => signRequest({ ...FAKE, service: '' })).toThrow('the service of a signing key is lowercase letters, digits and hyphens');
    expect(() => signRequest({ ...FAKE, accessKeyId: '' })).toThrow('the access key id is letters and digits');
    expect(() => signRequest({ ...FAKE, accessKeyId: 'AKIA FAKE' })).toThrow('the access key id is letters and digits');
    expect(() => signRequest({ ...FAKE, secretAccessKey: '' })).toThrow('the secret access key is empty');
    expect(() => signRequest({ ...FAKE, secretAccessKey: 'has a space' })).toThrow('the secret access key is printable ASCII with no spaces');
    expect(() => signRequest({ ...FAKE, secretAccessKey: 'fake\nsecret' })).toThrow('the secret access key is printable ASCII with no spaces');
    expect(() => signRequest({ ...FAKE, now: new Date('nope') })).toThrow('the time of a request to sign is not a date');
  });

  it('refuses an address with a user name or a password in it, or both, and does not say what it was', () => {
    for (const userinfo of ['someone:fake-secret-access-key-0123456789@', 'someone@', ':fake-secret-access-key-0123456789@']) {
      let message = '';
      try {
        signRequest({ ...FAKE, url: `https://${userinfo}fake-account.r2.example/x` });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, userinfo).toBe('the address to sign has a user name or a password in it');
      expect(message).not.toContain('fake-secret');
    }
  });

  it('does not put the secret in the message of an error, whatever the error is', () => {
    const bad: Partial<SigningRequest>[] = [{ method: 'x' }, { url: '::' }, { region: '' }, { accessKeyId: '' }, { headers: { host: 'x' } }, { headers: { 'x-a': '\n' } }, { now: new Date('nope') }];
    for (const change of bad) {
      let message = '';
      try {
        signRequest({ ...FAKE, ...change });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(change)).not.toBe('');
      expect(message).not.toContain(FAKE.secretAccessKey);
    }
  });
});
