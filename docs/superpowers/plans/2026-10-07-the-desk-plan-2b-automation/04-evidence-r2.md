## Plan 2b (part 4) — The private evidence store

**Goal:** the pages that the Desk quotes from must be kept where nobody can change them and where a reader of the receipts, a year from now, can be shown the page that a claim was taken from. Today the Desk keeps its snapshots in a folder on the machine that made the run (`evidence/`, which git ignores), and a machine that starts from a fresh checkout every day (a scheduled workflow) loses the folder when the job ends. This part builds the store that keeps them: a **private bucket on Cloudflare R2**, reached through the S3-compatible interface that R2 offers, with every request signed by code that the Desk contains (AWS Signature Version 4, written with `node:crypto`, so that no package is added and every line of it can be read). A snapshot is stored under the SHA-256 of its text, so the store can be checked by anyone who has the text: a snapshot that has changed is refused when it is read back. Snapshots that a **published** piece cites are kept for good, and the ones that a held, failed or empty run left are only kept for 90 days (the bucket is told so by a rule on a prefix, which the runbook sets).

| Task | What it does |
|---|---|
| 17 | `signRequest`: AWS Signature Version 4 in code. Each part of it (the canonical request, the string to sign, the signing key, the signature) is a function of its own and each is checked against the worked examples that Amazon publishes. |
| 18 | `R2EvidenceStore`: the `EvidenceStore` interface over a signed, injected `fetch`-like transport. The interface gains `keep(hash)`; `LocalEvidenceStore` gains it too; every failure is an `EvidenceError` with a kind. |
| 19 | The settings: `evidence: { kind: local \| r2 }` in the config file, the four `R2_*` variables from the environment only, `makeEvidenceStore`, and the command line builds its store through it. |
| 20 | The run uses the store at the three places where it matters: the snapshots are read back before Extract, the snapshots that a published piece cites are kept before the piece is committed, and a store that fails at any of the three ends the run as `failed`, with nothing published. |
| 21 | The README says what is stored, where, for how long, with which variables, and how the bucket is made; the adversarial matrix gains the store that changes a snapshot between Fetch and Extract. |
| 22 | Every key that the store writes and who may read it, as a table that a real run makes and a test checks, and the whole check. |

**Starting state:** Plans 1 and 2 are built, and so are parts 1 to 3 of this plan (Tasks 1 to 16). `npm run typecheck`, `npm test`, `npm run evals:seeded` (61 of 61 cases caught), `npm run fixtures:check` and `npm run verify` pass. Today `EvidenceStore` has three methods (`put`, `get`, `has`) and one implementation, `LocalEvidenceStore`, which keeps `<hash>.txt` and `<hash>.json` in a folder; `desk run` builds it from the setting `evidenceDir` and nothing else; and nothing reads a snapshot back between Fetch and Extract.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/desk -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, the README or a fixture; where a test needs one, it uses `String.fromCharCode`. After you create a file, `LC_ALL=C grep -n '[^[:print:][:space:]]' <file>` must print nothing.
- **No network, no credential.** Nothing in this part connects to Cloudflare, reads a real key or opens a socket. Every test gives the code a stand-in for the bucket (a function with the shape of `fetch`, which answers from memory), and every key in a test is an obviously made-up one (`AKIAFAKEFAKEFAKEFAKE`). The only keys that are not made up are the ones that Amazon prints in its documentation to say that they are examples, in the tests of Task 17.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** this part adds no package.

---

### Task 17: AWS Signature Version 4, in code

**Files:**
- Create: `desk/src/run/sigv4.ts` (`signRequest`, `canonicalRequest`, `stringToSign`, `signingKey`, `signatureOf`, `canonicalUri`, `canonicalQueryString`, `signedHeaders`, `hashBody`, `amzDate`, `credentialScope`, `SIGNING_ALGORITHM`)
- Create: `desk/test/run/sigv4.test.ts`
- Modify: `desk/src/index.ts` (exports it)
- Test: `desk/test/fetch/exports.test.ts`

Every request to the bucket has to carry a signature, which proves who asks and that the request was not changed on the way. The signature is made from the request, a secret key and the time, in the way that Amazon calls Signature Version 4, and R2 takes the same signature as S3. The Desk writes it itself, with `node:crypto`, for two reasons: no package is added to a project that has added one package in two plans, and every line that stands between the secret key and the bucket can be read in one file.

The signature is made in five steps, and each step is a function that the tests check on its own:

1. `canonicalRequest` writes the request in one fixed way: the method, the path, the query string, the headers (names in lowercase, values trimmed, sorted), the list of the names, and the hash of the body.
2. `stringToSign` is the name of the algorithm, the time, the scope (the day, the region, the service) and the hash of the canonical request.
3. `signingKey` is the secret key mixed, by one HMAC after another, with the day, the region, the service and the word `aws4_request`. The secret itself is never sent, and never leaves this function.
4. `signatureOf` is the string to sign, keyed with the signing key.
5. `signRequest` does all of it for one request and gives back the headers to send: `host`, `x-amz-date`, `x-amz-content-sha256` (the hash of the body, always: a payload is never sent "unsigned"), `authorization`, and the headers that it was given, in lowercase. Every header except `authorization` is signed, so what is signed is what is sent.

A signature that is wrong by one character is refused by the bucket with an answer that does not say where the mistake is, and no test of this repository can ask the bucket. So the functions are held to **the worked examples that Amazon publishes**: requests with their keys, their times and every value on the way to the signature. The test file names the pages (the S3 API Reference page on the authorization header, with its four examples; the page on deriving a signing key; the IAM page with the ListUsers request; the test suite of Signature Version 4) and quotes each expected value. The pages were not opened when this plan was verified, because nothing in it may use the network. Every value was computed again from the inputs that the pages print, and each matched what the pages print; a hash does not match by chance, so a value that was copied wrong cannot be among them. The engineer who wants to see the pages can compare.

The rules that S3 has and the code follows:

- **A path is encoded once, and is not normalised.** Each segment is decoded and encoded again with only `A-Za-z0-9-_.~` left as they are, so `test$file.text` is `test%24file.text` and `%2f` is `%2F`. Empty segments and a slash at the end stay (`/a//b/`). The path is the one that the address gives: `new URL` resolves a `..` before anything is signed, as the same address would be resolved before it is sent.
- **A query string is sorted.** The pairs are encoded once and sorted by name and then by value; a name with no value is written with an equals sign (`lifecycle=`).
- **Headers are lowercased and trimmed.** A run of spaces becomes one space. A header that is given twice (`Host` and `host`), a name that is not letters, digits and hyphens, and a value that is not printable ASCII are refused.
- **The body is always hashed.** A text is hashed as UTF-8.
- **What can be read in two ways is refused and not guessed.** A plus sign in a path or a query string (S3 may read it as a space; write `%2B` or `%20`), a percent sign that is not followed by two hex digits, an address with a user name or a password in it, and a request that already has a `host`, `authorization`, `x-amz-date` or `x-amz-content-sha256` header, which the signing sets.
- **The secret is never in a message.** A message says what is wrong and never what the address, the key or the secret was.

- [ ] **Step 1: Write the tests**

**Create `desk/test/run/sigv4.test.ts`:**
```ts
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

const S3_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
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
    accessKeyId: 'AKIAFAKEFAKEFAKEFAKE',
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
      /^AWS4-HMAC-SHA256 Credential=AKIAFAKEFAKEFAKEFAKE\/20261006\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
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
    const other = signRequest({ ...FAKE, accessKeyId: 'AKIAOTHEROTHEROTHER00' });
    expect(other.authorization).toContain('Credential=AKIAOTHEROTHEROTHER00/');
    expect(signatureOfRequest({ ...FAKE, accessKeyId: 'AKIAOTHEROTHEROTHER00' })).toBe(signatureOfRequest(FAKE));
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
```

The package entry point lists what it exports, and the signing is part of it.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  RunRecord,
  SelectArtifact,
  SitePaths,
  SourceKind,
```

**with:**
```ts
  RunRecord,
  SelectArtifact,
  SigningRequest,
  SitePaths,
  SourceKind,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'EvidenceMeta',
  'LocalEvidenceStore',
  'COMPANY_GROUP_BEATS',
  'tier1Newsrooms',
```

**with:**
```ts
  'EvidenceMeta',
  'LocalEvidenceStore',
  'SIGNING_ALGORITHM',
  'hashBody',
  'amzDate',
  'credentialScope',
  'canonicalUri',
  'canonicalQueryString',
  'signedHeaders',
  'canonicalRequest',
  'stringToSign',
  'signingKey',
  'signatureOf',
  'signRequest',
  'COMPANY_GROUP_BEATS',
  'tier1Newsrooms',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      EvidenceMeta,
      EvidenceStore,
      Newsroom,
      Tier2Feed,
```

**with:**
```ts
      EvidenceMeta,
      EvidenceStore,
      SigningRequest,
      Newsroom,
      Tier2Feed,
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/sigv4.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/sigv4'` and `exports signRequest`

- [ ] **Step 3: Write the signing**

**Create `desk/src/run/sigv4.ts`:**
```ts
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
```

It is exported with the rest of the package.

**In `desk/src/index.ts`, replace:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './run/desk-state';
export * from './run/git';
```

**with:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './run/sigv4';
export * from './run/desk-state';
export * from './run/git';
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/run/sigv4.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/run/sigv4.ts desk/test/run/sigv4.test.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Commit**

```bash
git add desk/src/index.ts desk/src/run/sigv4.ts desk/test/fetch/exports.test.ts desk/test/run/sigv4.test.ts
git commit -m "feat(desk): AWS Signature Version 4 written with node:crypto, each part (the canonical request, the string to sign, the signing key, the signature) exported and held to the worked examples that Amazon publishes for S3, IAM and its test suite, and signRequest, which gives the headers to send for a request, always hashes the body and refuses whatever could be read in two ways" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 18: R2EvidenceStore, and keep

**Files:**
- Create: `desk/src/run/r2-evidence.ts` (`R2EvidenceStore`, `StoreTransport`, `StoreRequest`, `R2Options`, `PENDING_PREFIX`, `PUBLISHED_PREFIX`)
- Create: `desk/test/run/r2-evidence.test.ts`, `desk/test/support/bucket.ts` (a bucket made of memory, which the tests of this part use)
- Modify: `desk/src/run/evidence.ts` (`EvidenceError`, `EVIDENCE_ERROR_KINDS`, `keep` on the interface and on `LocalEvidenceStore`, `KEPT_FOLDER`)
- Modify: `desk/src/index.ts` (exports the store)
- Modify: `desk/test/run/evidence.test.ts`, `desk/test/stages/fetch.test.ts` (a store that has `keep`), `desk/test/fetch/exports.test.ts`

The Desk's evidence is the text of the pages that a piece quotes, named by the SHA-256 of the text. `EvidenceStore` is the interface for keeping it, and `LocalEvidenceStore` keeps it in a folder. This task adds the second implementation, `R2EvidenceStore`, which keeps it in a private bucket on Cloudflare R2, and a method that both have.

**The bucket has two places.** A snapshot is an object named by its hash, in `pending/<hash>` when it was only put, and in `published/<hash>` when it was **kept**. `keep(hash)` is how a snapshot becomes one of the second kind: a piece that is published cites snapshots, and they are kept for good. The bucket is given a rule (by the runbook, not by this plan) that deletes what is in `pending/` 90 days after it was written, which is how the snapshots of runs that held a piece, found no story or failed are not kept for ever. `get` and `has` look in `pending/` first and then in `published/`, so a snapshot that was kept can still be read after its first copy has expired. `LocalEvidenceStore.keep` does the same on disk: it copies the two files of the snapshot into a folder `published` below the folder of the store, and `get` and `has` look there too.

**What an object has.** The text of the page is the body of the object. Where the text came from is its metadata, as headers of the request (`x-amz-meta-url`, `x-amz-meta-tier`, `x-amz-meta-retrieved-at`, and `x-amz-meta-final-url` when the address after the redirects is another one). An address is written with `encodeURIComponent`, because a header may only have printable ASCII, and S3 does not take more than 2 KB of metadata: a record that is longer is refused, before the bucket is asked anything. There is nothing secret in an object or in a request but the signature.

**Reading is checking.** `get` hashes the text that comes back and refuses it, as `tampered`, when the hash is not its name. A record that is not valid is `tampered` too, and an object with no record is `missing`. This is the same rule as the local store has, and it is what makes the bucket worth keeping the evidence in: nobody, the bucket included, can change a page without the Desk finding out.

**What goes wrong is an `EvidenceError`, and it says what kind.** There are four kinds, and every answer that is not the one wanted is one of them:

| The bucket | The error |
|---|---|
| does not answer: the connection fails, the time runs out, the answer stops half way, a redirect, a success that is not the one wanted, a 408, a 429, a 5xx | `unreachable` |
| refuses: a 401, a 403, and any other 4xx but a 404, a 408 and a 429 | `denied` |
| has a text that is not the one that its name says, or a record that is not valid | `tampered` |
| has nothing under the name (a 404, in both places), or no record of where the text came from | `missing` |

A message says what was asked (`GET pending/<hash>`), the status, and the start of what the bucket said, on one line and cut at 200 characters. **No key is ever in a message.** The secret is used only to sign and is not in any message that the store makes, and as a second wall every text that goes into a message has both keys (the id and the secret) taken out of it first, before it is cut, so that a key that the bucket repeated back cannot be half there.

**The bucket that the tests use.** `desk/test/support/bucket.ts` is a function with the shape of `fetch` that keeps objects in memory and answers as S3 does. It is as strict as the real one where a mistake of the Desk would show: it checks the signature of every request (with its own reading of the canonical request), refuses a header that was sent and not signed, refuses a body that is not the one that was hashed, and refuses a time that is more than 15 minutes away from its own. A test that expects a request to work therefore also shows that the request is signed correctly. It keeps every request in `calls`, every object in `objects`, and can be told to fail the next request with a status or an error.

- [ ] **Step 1: Write the tests**

The made-up bucket.

**Create `desk/test/support/bucket.ts`:**
```ts
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
export const FAKE_KEY_ID = 'AKIAFAKEFAKEFAKEFAKE';
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
function problemWith(call: { method: string; url: string; headers: Record<string, string>; body: string | undefined }): string | undefined {
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
  const away = Math.abs(Date.parse(`${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}T${time.slice(9, 11)}:${time.slice(11, 13)}:${time.slice(13, 15)}Z`) - BUCKET_TIME.getTime());
  if (Number.isNaN(away) || away > 15 * 60 * 1000) return 'RequestTimeTooSkewed';
  if (headers['x-amz-content-sha256'] !== hashBody(call.body ?? '')) return 'XAmzContentSHA256Mismatch';
  const canonical = canonicalRequest({ method: call.method, url: call.url, headers: Object.fromEntries(signed.map((name) => [name, headers[name] as string])), payloadHash: headers['x-amz-content-sha256'] });
  const expected = signatureOf(signingKey({ secretAccessKey: FAKE_SECRET, date: day, region, service }), stringToSign({ amzDate: time, region, service, canonicalRequest: canonical }));
  return expected === signature ? undefined : 'SignatureDoesNotMatch';
}

/** A made-up bucket, empty. */
export function makeBucket(): Bucket {
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
    const problem = problemWith(call);
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
```

The tests of the store. Read the table of what the bucket can answer, and the test of what a message never has.

**Create `desk/test/run/r2-evidence.test.ts`:**
```ts
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
      expect(message).toContain('***');
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
    expect(await messageOf(store.get(HASH))).toContain('fetch failed (getaddrinfo ENOTFOUND fake-account.r2.example)');
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
```

The tests of the local store gain the kinds of its errors, `keep`, and the reading of a kept snapshot after the others are cleared out.

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/model/types';
import { LocalEvidenceStore } from '../../src/run/evidence';
import type { EvidenceMeta, EvidenceStore } from '../../src/run/evidence';

// The evidence store keeps what the Desk read: the text of each page, named by its SHA-256. A claim of a
// piece points at a snapshot by that hash, so a snapshot that has changed is worse than one that is
// missing. Reading one back checks the hash, and a text that no longer matches is refused.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-evidence-'));
```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/model/types';
import { EVIDENCE_ERROR_KINDS, EvidenceError, KEPT_FOLDER, LocalEvidenceStore } from '../../src/run/evidence';
import type { EvidenceErrorKind, EvidenceMeta, EvidenceStore } from '../../src/run/evidence';

// The evidence store keeps what the Desk read: the text of each page, named by its SHA-256. A claim of a
// piece points at a snapshot by that hash, so a snapshot that has changed is worse than one that is
// missing. Reading one back checks the hash, and a text that no longer matches is refused. A snapshot that a published piece cites is kept, in a folder of its own,
// and stays when the folder of the others is cleaned out.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-evidence-'));
```

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
const HELLO_HASH = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

describe('LocalEvidenceStore: put', () => {
  it('returns the SHA-256 of the text, as 64 lowercase hex characters', async () => {
```

**with:**
```ts
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

describe('EvidenceError', () => {
  it('is an error that says what kind of trouble it is: unreachable, denied, tampered or missing', () => {
    expect([...EVIDENCE_ERROR_KINDS]).toEqual(['unreachable', 'denied', 'tampered', 'missing']);
    const error = new EvidenceError('denied', 'the store said no');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EvidenceError');
    expect(error.kind).toBe('denied');
    expect(error.message).toBe('the store said no');
  });
});

describe('LocalEvidenceStore: put', () => {
  it('returns the SHA-256 of the text, as 64 lowercase hex characters', async () => {
```

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
    writeFileSync(path.join(dir, `${hash}.txt`), TEXT.replace('FX-1', 'FX-2'));
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has been changed: its text no longer matches its hash`);
  });

```

**with:**
```ts
    writeFileSync(path.join(dir, `${hash}.txt`), TEXT.replace('FX-1', 'FX-2'));
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has been changed: its text no longer matches its hash`);
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });

```

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
    const hash = sha256Hex('never stored');
    await expect(store.get(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
  });

```

**with:**
```ts
    const hash = sha256Hex('never stored');
    await expect(store.get(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
    expect(await kindOf(store.get(hash))).toBe('missing');
  });

```

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
    unlinkSync(sidecar);
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has no record of where it came from`);
    writeFileSync(sidecar, '{"url": ');
    await expect(store.get(hash)).rejects.toThrow(`the record of the evidence ${hash} is not valid JSON`);
    writeFileSync(sidecar, JSON.stringify({ ...META, tier: 3 }));
    await expect(store.get(hash)).rejects.toThrow(`the record of the evidence ${hash} is not valid: tier:`);
  });

```

**with:**
```ts
    unlinkSync(sidecar);
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has no record of where it came from`);
    expect(await kindOf(store.get(hash))).toBe('missing');
    writeFileSync(sidecar, '{"url": ');
    await expect(store.get(hash)).rejects.toThrow(`the record of the evidence ${hash} is not valid JSON`);
    expect(await kindOf(store.get(hash))).toBe('tampered');
    writeFileSync(sidecar, JSON.stringify({ ...META, tier: 3 }));
    await expect(store.get(hash)).rejects.toThrow(`the record of the evidence ${hash} is not valid: tier:`);
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });

```

**In `desk/test/run/evidence.test.ts`, replace:**
```ts
      get: async (hash) => memory.get(hash) ?? Promise.reject(new Error('none')),
      has: async (hash) => memory.has(hash),
    };
    const { hash } = await store.put('x', META);
    expect(await store.has(hash)).toBe(true);
  });
});
```

**with:**
```ts
      get: async (hash) => memory.get(hash) ?? Promise.reject(new Error('none')),
      has: async (hash) => memory.has(hash),
      keep: async () => undefined,
    };
    const { hash } = await store.put('x', META);
    expect(await store.has(hash)).toBe(true);
  });
});

describe('LocalEvidenceStore: keep', () => {
  it('copies the text and its record into the folder `published`, byte for byte, and leaves the snapshot where it was', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    await store.keep(hash);
    expect(KEPT_FOLDER).toBe('published');
    expect(readFileSync(path.join(dir, KEPT_FOLDER, `${hash}.txt`), 'utf8')).toBe(TEXT);
    expect(readFileSync(path.join(dir, KEPT_FOLDER, `${hash}.json`), 'utf8')).toBe(readFileSync(path.join(dir, `${hash}.json`), 'utf8'));
    expect(readFileSync(path.join(dir, `${hash}.txt`), 'utf8')).toBe(TEXT);
    expect(readdirSync(dir).sort()).toEqual([KEPT_FOLDER, `${hash}.json`, `${hash}.txt`].sort());
    expect(readdirSync(path.join(dir, KEPT_FOLDER)).sort()).toEqual([`${hash}.json`, `${hash}.txt`]);
  });

  it('does nothing when the snapshot is kept already: the files are not written again', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    await store.keep(hash);
    const before = readdirSync(path.join(dir, KEPT_FOLDER)).map((name) => [name, statSync(path.join(dir, KEPT_FOLDER, name)).ino]);
    await store.keep(hash);
    expect(readdirSync(path.join(dir, KEPT_FOLDER)).map((name) => [name, statSync(path.join(dir, KEPT_FOLDER, name)).ino])).toEqual(before);
  });

  it('keeps the snapshots that are asked for and no other', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const first = await store.put('first text', META);
    await store.put('second text', META);
    await store.keep(first.hash);
    expect(readdirSync(path.join(dir, KEPT_FOLDER))).toHaveLength(2);
  });

  it('refuses a snapshot that is not stored, as missing, and keeps nothing', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    await store.put(TEXT, META);
    const hash = sha256Hex('never stored');
    expect(await kindOf(store.keep(hash))).toBe('missing');
    await expect(store.keep(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
    expect(() => readdirSync(path.join(dir, KEPT_FOLDER))).toThrow();
  });

  it('refuses a snapshot that has been changed, as tampered, and keeps nothing: what is kept is what get gives', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    writeFileSync(path.join(dir, `${hash}.txt`), `${TEXT} changed`);
    expect(await kindOf(store.keep(hash))).toBe('tampered');
    expect(() => readdirSync(path.join(dir, KEPT_FOLDER))).toThrow();
  });

  it('refuses what is not a hash, without looking for a file', async () => {
    const store = new LocalEvidenceStore(freshDir());
    await expect(store.keep('../../etc/passwd')).rejects.toThrow('is not a snapshot hash: 64 lowercase hex characters');
  });

  it('is the way a snapshot survives the clearing of the folder: after the others are removed, get, has and keep still find the kept one, and put does not write it again', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    await store.keep(hash);
    unlinkSync(path.join(dir, `${hash}.txt`));
    unlinkSync(path.join(dir, `${hash}.json`));
    expect(await store.has(hash)).toBe(true);
    expect(await store.get(hash)).toEqual({ text: TEXT, meta: META });
    await store.keep(hash);
    expect(await store.put(TEXT, { ...META, tier: 2 })).toEqual({ hash });
    expect(readdirSync(dir)).toEqual([KEPT_FOLDER]);
  });

  it('refuses a kept snapshot that has been changed, as it refuses any other', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    await store.keep(hash);
    unlinkSync(path.join(dir, `${hash}.txt`));
    unlinkSync(path.join(dir, `${hash}.json`));
    writeFileSync(path.join(dir, KEPT_FOLDER, `${hash}.txt`), 'changed');
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });
});
```

A store that the test of Fetch makes by hand has to have the new method, and the package entry point lists what it exports.

**In `desk/test/stages/fetch.test.ts`, replace:**
```ts
      get: async () => Promise.reject(new Error('unreachable')),
      has: async () => false,
    };
    const { ctx } = stageContext(scratch, { evidence });
```

**with:**
```ts
      get: async () => Promise.reject(new Error('unreachable')),
      has: async () => false,
      keep: async () => undefined,
    };
    const { ctx } = stageContext(scratch, { evidence });
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  Correction,
  DiscoverArtifact,
  EvidenceMeta,
  EvidenceStore,
```

**with:**
```ts
  Correction,
  DiscoverArtifact,
  EvidenceErrorKind,
  EvidenceMeta,
  EvidenceStore,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  PublishTarget,
  PullRequest,
  RateLimiterOptions,
  RefusalKind,
```

**with:**
```ts
  PublishTarget,
  PullRequest,
  R2Options,
  RateLimiterOptions,
  RefusalKind,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  SitePaths,
  SourceKind,
  TargetChange,
  TargetResult,
```

**with:**
```ts
  SitePaths,
  SourceKind,
  StoreRequest,
  StoreTransport,
  TargetChange,
  TargetResult,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'parseFeed',
  'EvidenceMeta',
  'LocalEvidenceStore',
  'SIGNING_ALGORITHM',
  'hashBody',
```

**with:**
```ts
  'parseFeed',
  'EvidenceMeta',
  'EVIDENCE_ERROR_KINDS',
  'EvidenceError',
  'KEPT_FOLDER',
  'LocalEvidenceStore',
  'PENDING_PREFIX',
  'PUBLISHED_PREFIX',
  'R2EvidenceStore',
  'SIGNING_ALGORITHM',
  'hashBody',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      EvidenceMeta,
      EvidenceStore,
      SigningRequest,
      Newsroom,
```

**with:**
```ts
      EvidenceMeta,
      EvidenceStore,
      EvidenceErrorKind,
      StoreRequest,
      StoreTransport,
      R2Options,
      SigningRequest,
      Newsroom,
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/run/evidence.test.ts test/run/r2-evidence.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/r2-evidence'`, `EVIDENCE_ERROR_KINDS is not iterable`, `store.keep is not a function` and `exports R2EvidenceStore`

- [ ] **Step 3: Write the store**

The interface, the error and the local store.

**In `desk/src/run/evidence.ts`, replace:**
```ts
export type EvidenceMeta = z.infer<typeof EvidenceMeta>;

/**
 * Where snapshots are kept. A folder on disk is `LocalEvidenceStore`; a bucket in the cloud will be another
 * implementation (a later plan). A store that cannot be reached throws, which fails the run: the Desk never
 * goes on without the evidence it will cite.
 */
```

**with:**
```ts
export type EvidenceMeta = z.infer<typeof EvidenceMeta>;

/** What is wrong with a store: it cannot be reached, it refused, what it holds is not what was put, or it holds nothing under that name. */
export const EVIDENCE_ERROR_KINDS = ['unreachable', 'denied', 'tampered', 'missing'] as const;
export type EvidenceErrorKind = (typeof EVIDENCE_ERROR_KINDS)[number];

/**
 * The error of a store, with the kind of trouble it is: `unreachable` (no answer, or an answer that says the store is down or busy), `denied` (the store was reached and
 * refused the request: the credentials, the permission, the bucket), `tampered` (the text no longer matches its hash, or its record is not valid) and `missing` (nothing is stored
 * for the hash, or the record of where it came from is not there). A message never has a credential in it.
 */
export class EvidenceError extends Error {
  readonly kind: EvidenceErrorKind;

  constructor(kind: EvidenceErrorKind, message: string) {
    super(message);
    this.name = 'EvidenceError';
    this.kind = kind;
  }
}

/**
 * Where snapshots are kept. A folder on disk is `LocalEvidenceStore`; a private bucket on Cloudflare R2 is `R2EvidenceStore`. A store that cannot be reached throws, which fails the run: the Desk never
 * goes on without the evidence it will cite.
 */
```

**In `desk/src/run/evidence.ts`, replace:**
```ts
  get(hash: string): Promise<{ text: string; meta: EvidenceMeta }>;
  has(hash: string): Promise<boolean>;
}

const HASH = /^[0-9a-f]{64}$/;

/** Whether a file exists. Only "not there" is an answer; any other failure of the file system is thrown. */
async function exists(file: string): Promise<boolean> {
```

**with:**
```ts
  get(hash: string): Promise<{ text: string; meta: EvidenceMeta }>;
  has(hash: string): Promise<boolean>;
  /**
   * Keep a snapshot for good. A snapshot that is only put may be removed after a while (the bucket has a rule for it); one that is kept is not: it is what a published piece cites. A snapshot that is
   * kept already is left as it is. Throws as `get` does for a hash that is not stored or whose text has been changed, and keeps nothing then.
   */
  keep(hash: string): Promise<void>;
}

const HASH = /^[0-9a-f]{64}$/;

/** The folder of the kept snapshots, below the folder of the store. */
export const KEPT_FOLDER = 'published';

/** Whether a file exists. Only "not there" is an answer; any other failure of the file system is thrown. */
async function exists(file: string): Promise<boolean> {
```

**In `desk/src/run/evidence.ts`, replace:**
```ts
}

/** Snapshots in a folder: `<hash>.txt` is the text and `<hash>.json` the record of where it came from. */
export class LocalEvidenceStore implements EvidenceStore {
  constructor(private readonly dir: string) {}

  private textFile(hash: string): string {
    return path.join(this.dir, `${hash}.txt`);
  }

  private metaFile(hash: string): string {
    return path.join(this.dir, `${hash}.json`);
  }

```

**with:**
```ts
}

/** Snapshots in a folder: `<hash>.txt` is the text and `<hash>.json` the record of where it came from. The kept ones are in the same two files in the folder `published` below it. */
export class LocalEvidenceStore implements EvidenceStore {
  constructor(private readonly dir: string) {}

  private textFile(folder: string, hash: string): string {
    return path.join(folder, `${hash}.txt`);
  }

  private metaFile(folder: string, hash: string): string {
    return path.join(folder, `${hash}.json`);
  }

  /** The folders that a snapshot can be in, the one of the store first: what is only put, and what is kept (which stays when the first is cleaned out). */
  private folders(): string[] {
    return [this.dir, path.join(this.dir, KEPT_FOLDER)];
  }

  private async hasIn(folder: string, hash: string): Promise<boolean> {
    return (await exists(this.textFile(folder, hash))) && (await exists(this.metaFile(folder, hash)));
  }

  private async write(folder: string, hash: string, text: string, meta: EvidenceMeta): Promise<void> {
    await writeFileAtomic(this.textFile(folder, hash), text);
    await writeFileAtomic(this.metaFile(folder, hash), `${JSON.stringify(JSON.parse(canonicalJson(meta)), null, 2)}\n`);
  }

```

**In `desk/src/run/evidence.ts`, replace:**
```ts
    // A snapshot that is there is left exactly as it is, and its first record stays. Only one that is missing a file is written.
    if (await this.has(hash)) return { hash };
    await writeFileAtomic(this.textFile(hash), text);
    await writeFileAtomic(this.metaFile(hash), `${JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2)}\n`);
    return { hash };
  }
```

**with:**
```ts
    // A snapshot that is there is left exactly as it is, and its first record stays. Only one that is missing a file is written.
    if (await this.has(hash)) return { hash };
    await this.write(this.dir, hash, text, parsed.data);
    return { hash };
  }
```

**In `desk/src/run/evidence.ts`, replace:**
```ts
  async get(hash: string): Promise<{ text: string; meta: EvidenceMeta }> {
    if (!HASH.test(hash)) throw new Error(`${JSON.stringify(hash)} is not a snapshot hash: 64 lowercase hex characters`);
    let text: string;
    try {
      text = await readFile(this.textFile(hash), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`no evidence is stored for ${hash}`);
      throw error;
    }
    if (sha256Hex(text) !== hash) throw new Error(`the evidence ${hash} has been changed: its text no longer matches its hash`);

    let source: string;
    try {
      source = await readFile(this.metaFile(hash), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the evidence ${hash} has no record of where it came from`);
      throw error;
    }
```

**with:**
```ts
  async get(hash: string): Promise<{ text: string; meta: EvidenceMeta }> {
    if (!HASH.test(hash)) throw new Error(`${JSON.stringify(hash)} is not a snapshot hash: 64 lowercase hex characters`);
    let text: string | undefined;
    let folder = this.dir;
    for (const candidate of this.folders()) {
      try {
        text = await readFile(this.textFile(candidate, hash), 'utf8');
        folder = candidate;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (text === undefined) throw new EvidenceError('missing', `no evidence is stored for ${hash}`);
    if (sha256Hex(text) !== hash) throw new EvidenceError('tampered', `the evidence ${hash} has been changed: its text no longer matches its hash`);

    let source: string;
    try {
      source = await readFile(this.metaFile(folder, hash), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new EvidenceError('missing', `the evidence ${hash} has no record of where it came from`);
      throw error;
    }
```

**In `desk/src/run/evidence.ts`, replace:**
```ts
      data = JSON.parse(source);
    } catch {
      throw new Error(`the record of the evidence ${hash} is not valid JSON`);
    }
    const parsed = EvidenceMeta.safeParse(data);
    if (!parsed.success) throw new Error(`the record of the evidence ${hash} is not valid: ${describeIssues(parsed.error)}`);
    return { text, meta: parsed.data };
  }

  async has(hash: string): Promise<boolean> {
    return HASH.test(hash) && (await exists(this.textFile(hash))) && (await exists(this.metaFile(hash)));
  }
}
```

**with:**
```ts
      data = JSON.parse(source);
    } catch {
      throw new EvidenceError('tampered', `the record of the evidence ${hash} is not valid JSON`);
    }
    const parsed = EvidenceMeta.safeParse(data);
    if (!parsed.success) throw new EvidenceError('tampered', `the record of the evidence ${hash} is not valid: ${describeIssues(parsed.error)}`);
    return { text, meta: parsed.data };
  }

  async has(hash: string): Promise<boolean> {
    if (!HASH.test(hash)) return false;
    for (const folder of this.folders()) if (await this.hasIn(folder, hash)) return true;
    return false;
  }

  async keep(hash: string): Promise<void> {
    // What is kept is what `get` gives, so a snapshot that has been changed is not kept.
    const { text, meta } = await this.get(hash);
    const kept = path.join(this.dir, KEPT_FOLDER);
    if (await this.hasIn(kept, hash)) return;
    await this.write(kept, hash, text, meta);
  }
}
```

The store of the bucket.

**Create `desk/src/run/r2-evidence.ts`:**
```ts
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
```

It is exported with the rest of the package.

**In `desk/src/index.ts`, replace:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './run/sigv4';
export * from './run/desk-state';
```

**with:**
```ts
export * from './fetch/feeds';
export * from './run/evidence';
export * from './run/r2-evidence';
export * from './run/sigv4';
export * from './run/desk-state';
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/run/evidence.test.ts test/run/r2-evidence.test.ts test/stages/fetch.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  4 passed (4)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/run/evidence.ts desk/src/run/r2-evidence.ts desk/test/run/evidence.test.ts desk/test/run/r2-evidence.test.ts desk/test/support/bucket.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Commit**

```bash
git add desk/src/index.ts desk/src/run/evidence.ts desk/src/run/r2-evidence.ts desk/test/fetch/exports.test.ts desk/test/run/evidence.test.ts desk/test/run/r2-evidence.test.ts desk/test/stages/fetch.test.ts desk/test/support/bucket.ts
git commit -m "feat(desk): R2EvidenceStore, the evidence store over the S3 interface of a private bucket on Cloudflare R2 with every request signed and made by a function that is handed in, a snapshot as an object named by its hash in pending/ until it is kept in published/, a read that checks the hash, and an EvidenceError of the kind of trouble it is (unreachable, denied, tampered or missing) for every other answer; the EvidenceStore interface gains keep, and so does LocalEvidenceStore" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 19: The setting, the environment, and the store that the command line builds

**Files:**
- Create: `desk/src/run/evidence-factory.ts` (`makeEvidenceStore`, `R2_VARIABLES`, `EvidenceDeps`)
- Create: `desk/test/run/evidence-factory.test.ts`
- Modify: `desk/src/config.ts` (the setting `evidence: { kind }`, and `EVIDENCE_KINDS`), `desk/test/config.test.ts`
- Modify: `desk/src/cli.ts` (the store is built by `makeEvidenceStore`; `CliDeps.evidenceTransport`; the usage text), `desk/test/cli.test.ts`
- Modify: `desk/test/support/bucket.ts` (the made-up bucket can take the clock of the command line), `desk/src/index.ts`, `desk/test/fetch/exports.test.ts`

A run is given one evidence store, and now there are two to choose from. This task makes the choice, in the one place where choices are made.

**What is a setting and what is not.** The setting `evidence.kind` is `local` (the default: a folder, `evidenceDir`) or `r2`. That is all that the file of settings says about the bucket. The **address of the bucket, its name and the two halves of the key that opens it** are read from the environment, in four variables (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), and never from a file, because a file of settings is committed to a repository that anyone can read, and a key in it would be published. The schema of the settings refuses an unknown key (it always did), so a file that tries to carry one of them (`evidence: { kind: r2, secretAccessKey: ... }`, or a setting called `r2`) is refused with a message that names the key and does not repeat what it held.

**There is no flag.** `desk run --evidence r2` does not exist: the settings decide, so that a run on a machine that has a file of settings and an environment cannot be told to keep its evidence somewhere else by a mistake in a command. The command line already refuses an option that it does not know, and a test says so.

**`makeEvidenceStore(config, env, deps)`** returns `LocalEvidenceStore` for `local` (it does not look at the environment) and `R2EvidenceStore` for `r2`. It names the variables that are not set, in the order of the list, and nothing else: never a value. A value is taken with the spaces and line ends at its ends taken off, as a secret that was pasted with one is still the secret, and one that is empty is not set. A value that the store refuses (an address that is not https, a name that cannot be a bucket's, a key that cannot sign) is refused with the message of the store, which does not say what the value was. The store checks its key when it is made, so a run that has a key that cannot sign stops before it has spent anything.

**The command line** builds the store through it, for `run` and for `replay`, and passes `deps.now` (the clock) to it. `CliDeps.evidenceTransport` is how a test gives the store a bucket made of memory, as `transport` is for the sites. A problem with the store is a mistake in the settings or the environment, so it is the exit code 2, said on the error output, before anything is run or written. One more refusal is made here: **the made-up world is refused for a bucket.** A run with `--sources fixtures` (or a replay of one) and `evidence.kind: r2` is refused, because the pages of the made-up world are fiction and nothing made up may be put in the bucket that a published piece will cite its evidence from.

- [ ] **Step 1: Write the tests**

The tests of the settings: the default, the two kinds, and what a file that carries a bucket is told.

**In `desk/test/config.test.ts`, replace:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PUBLICATION_NAME } from '@robywire/gate';
import { DeskConfig, defaultConfig, loadConfig, placeholderHost } from '../src/config';

// The settings of a run live in one place and are checked when they are read:
```

**with:**
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PUBLICATION_NAME } from '@robywire/gate';
import { DeskConfig, EVIDENCE_KINDS, defaultConfig, loadConfig, placeholderHost } from '../src/config';

// The settings of a run live in one place and are checked when they are read:
```

**In `desk/test/config.test.ts`, replace:**
```ts
      runDir: 'runs',
      evidenceDir: 'evidence',
    });
  });
```

**with:**
```ts
      runDir: 'runs',
      evidenceDir: 'evidence',
      evidence: { kind: 'local' },
    });
  });
```

**In `desk/test/config.test.ts`, replace:**
```ts
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
```

**with:**
```ts
});

describe('the evidence store setting', () => {
  it('is the folder `evidenceDir` unless the file says r2, and has no other kind', () => {
    expect([...EVIDENCE_KINDS]).toEqual(['local', 'r2']);
    expect(defaultConfig().evidence).toEqual({ kind: 'local' });
    expect(loadConfig(configFile('evidence:\n  kind: r2\n')).evidence).toEqual({ kind: 'r2' });
    expect(loadConfig(configFile('evidence:\n  kind: local\n')).evidence).toEqual({ kind: 'local' });
    expect(loadConfig(configFile('evidence:\n  kind: r2\nevidenceDir: elsewhere\n'))).toEqual({ ...defaultConfig(), evidence: { kind: 'r2' }, evidenceDir: 'elsewhere' });
  });

  it('does not change the defaults of the next caller', () => {
    const first = defaultConfig();
    first.evidence.kind = 'r2';
    expect(defaultConfig().evidence.kind).toBe('local');
  });

  it('refuses another kind, a missing kind, and a setting that is not a mapping, naming the setting', () => {
    expect(failure('evidence:\n  kind: s3\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence:\n  kind: ""\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence: {}\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence: r2\n')).toBe('desk config <file>: evidence: Invalid input: expected object, received string');
  });

  it.each(['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'])('refuses %s in the setting, because the address, the name and the keys of a bucket are read from the environment and never from a file', (key) => {
    expect(failure(`evidence:\n  kind: r2\n  ${key}: fake-value-123\n`)).toBe(`desk config <file>: evidence: Unrecognized key: "${key}"`);
  });

  it.each(['r2', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'R2_ENDPOINT', 'R2_BUCKET', 'r2SecretAccessKey', 'secretAccessKey', 'bucket'])('refuses %s as a setting of its own', (key) => {
    expect(failure(`${key}: fake-value-123\n`)).toBe(`desk config <file>: Unrecognized key: "${key}"`);
  });

  it('never repeats what a refused key held: a secret that was put in a file is not in the message', () => {
    for (const yaml of ['evidence:\n  kind: r2\n  secretAccessKey: fake-secret-value-123\n', 'R2_SECRET_ACCESS_KEY: fake-secret-value-123\n', 'evidence: fake-secret-value-123\n', 'evidence:\n  kind: fake-secret-value-123\n']) {
      expect(failure(yaml), yaml).not.toContain('fake-secret-value-123');
    }
  });
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
```

The tests of the factory.

**Create `desk/test/run/evidence-factory.test.ts`:**
```ts
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
```

The command line is given a file of settings that asks for the bucket, an environment that describes a made-up one, the pages of the made-up world as live sites answer for them, and the made-up bucket. The made-up bucket takes the clock of the command line, so that it does not refuse a request as too far from its own time.

**In `desk/test/support/bucket.ts`, replace:**
```ts

/** Check a request the way that the bucket does. Gives the code of the S3 error to answer with, or undefined when the request is good. */
function problemWith(call: { method: string; url: string; headers: Record<string, string>; body: string | undefined }): string | undefined {
  const headers = Object.fromEntries(Object.entries(call.headers).map(([name, value]) => [name.toLowerCase(), value]));
  const match = /^AWS4-HMAC-SHA256 Credential=([A-Za-z0-9]+)\/(\d{8})\/([a-z0-9-]+)\/([a-z0-9-]+)\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? '');
```

**with:**
```ts

/** Check a request the way that the bucket does. Gives the code of the S3 error to answer with, or undefined when the request is good. */
function problemWith(call: { method: string; url: string; headers: Record<string, string>; body: string | undefined }, now: Date): string | undefined {
  const headers = Object.fromEntries(Object.entries(call.headers).map(([name, value]) => [name.toLowerCase(), value]));
  const match = /^AWS4-HMAC-SHA256 Credential=([A-Za-z0-9]+)\/(\d{8})\/([a-z0-9-]+)\/([a-z0-9-]+)\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? '');
```

**In `desk/test/support/bucket.ts`, replace:**
```ts
  const time = headers['x-amz-date'] as string;
  if (time.slice(0, 8) !== day) return 'SignatureDoesNotMatch';
  const away = Math.abs(Date.parse(`${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}T${time.slice(9, 11)}:${time.slice(11, 13)}:${time.slice(13, 15)}Z`) - BUCKET_TIME.getTime());
  if (Number.isNaN(away) || away > 15 * 60 * 1000) return 'RequestTimeTooSkewed';
  if (headers['x-amz-content-sha256'] !== hashBody(call.body ?? '')) return 'XAmzContentSHA256Mismatch';
```

**with:**
```ts
  const time = headers['x-amz-date'] as string;
  if (time.slice(0, 8) !== day) return 'SignatureDoesNotMatch';
  const away = Math.abs(Date.parse(`${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}T${time.slice(9, 11)}:${time.slice(11, 13)}:${time.slice(13, 15)}Z`) - now.getTime());
  if (Number.isNaN(away) || away > 15 * 60 * 1000) return 'RequestTimeTooSkewed';
  if (headers['x-amz-content-sha256'] !== hashBody(call.body ?? '')) return 'XAmzContentSHA256Mismatch';
```

**In `desk/test/support/bucket.ts`, replace:**
```ts
}

/** A made-up bucket, empty. */
export function makeBucket(): Bucket {
  const calls: BucketCall[] = [];
  const objects = new Map<string, StoredObject>();
```

**with:**
```ts
}

/** A made-up bucket, empty. Its clock is `BUCKET_TIME` unless it is given another, which a test that runs the command line needs, as that has the clock of its own. */
export function makeBucket(now: () => Date = () => BUCKET_TIME): Bucket {
  const calls: BucketCall[] = [];
  const objects = new Map<string, StoredObject>();
```

**In `desk/test/support/bucket.ts`, replace:**
```ts
      return response;
    };
    const problem = problemWith(call);
    if (problem !== undefined) return respond(answer(problem));
    if (bucket !== FAKE_BUCKET) return respond(answer('NoSuchBucket'));
```

**with:**
```ts
      return response;
    };
    const problem = problemWith(call, now());
    if (problem !== undefined) return respond(answer(problem));
    if (bucket !== FAKE_BUCKET) return respond(answer('NoSuchBucket'));
```

**In `desk/test/cli.test.ts`, replace:**
```ts
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { refuseApiOnFixtures } from '../src/run/spending';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
```

**with:**
```ts
import { DEMO_DATE, DEMO_REGISTRY_YAML } from '../src/demo/world';
import { refuseApiOnFixtures } from '../src/run/spending';
import { demoWorldMap } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import type { Transport } from '../src/fetch/http';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
import { placePiece } from './support/pieces';
import { PUBLISHED_SLUG, publishedPiece } from './support/published';
import { clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';

// The command line, called as a function: `main(argv, deps)` with a clock, an environment, a git and a place to print that the test hands in. Nothing
```

**with:**
```ts
import { placePiece } from './support/pieces';
import { PUBLISHED_SLUG, publishedPiece } from './support/published';
import { FAKE_BUCKET, FAKE_ENDPOINT, FAKE_KEY_ID, FAKE_SECRET, makeBucket } from './support/bucket';
import { START, clock } from './support/run';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
import { fileReply, scriptedTransport } from './support/transport';

// The command line, called as a function: `main(argv, deps)` with a clock, an environment, a git and a place to print that the test hands in. Nothing
```

**In `desk/test/cli.test.ts`, replace:**
```ts
});

describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
```

**with:**
```ts
});

describe('main: the evidence store', () => {
  // The setting evidence.kind of a file of settings says whether the snapshots of a run are kept in a folder or in a private bucket. The bucket is described by the environment
  // alone: these runs are given a made-up bucket (a function with the shape of fetch) and the made-up world as live sources, served by a made-up transport.
  const R2_FILE = ['evidence:', '  kind: r2', 'requestIntervalMs: 0', `userAgent: "${TEST_AGENT}"`, ''].join('\n');
  const R2_ENV = { R2_ENDPOINT: FAKE_ENDPOINT, R2_BUCKET: FAKE_BUCKET, R2_ACCESS_KEY_ID: FAKE_KEY_ID, R2_SECRET_ACCESS_KEY: FAKE_SECRET };

  /** The pages of the made-up world as live sites answer for them: the files of the fixtures, and no robots.txt. */
  const madeUpSites = () =>
    scriptedTransport({
      ...Object.fromEntries(Object.entries(demoWorldMap()).map(([url, file]) => [url, fileReply(file as string)])),
      ...Object.fromEntries(['fixture-robotics', 'mercer-wire', 'gantry-daily'].map((host) => [`https://${host}.example/robots.txt`, { status: 404, type: 'text/plain', body: '' }])),
    });

  /** A repository with a file of settings that asks for the bucket, and a made-up bucket. */
  function withBucket(overrides: Partial<CliDeps> = {}) {
    const bucket = makeBucket(() => START);
    const sites = madeUpSites();
    const made = setup({ config: undefined, env: R2_ENV, transport: sites.transport, evidenceTransport: bucket.transport, ...overrides });
    writeFileSync(path.join(made.cwd, 'desk.yml'), R2_FILE);
    return { ...made, bucket, sites };
  }

  it('is not chosen with a flag: --evidence is an option that run and replay do not have', () => {
    expect(refused('run', '--evidence', 'r2')).toBe('unknown option --evidence for run');
    expect(refused('replay', 'runs/x', '--evidence', 'local')).toBe('unknown option --evidence for replay');
    expect(USAGE).not.toContain('--evidence ');
  });

  it('says in the usage which store the settings choose, and where the bucket is described', () => {
    expect(USAGE).toContain('the setting evidence.kind of a file of settings (--config) chooses: local, a folder');
    expect(USAGE).toContain('R2_ENDPOINT, R2_BUCKET,');
    expect(USAGE).toContain('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY) and never from a file');
  });

  it('refuses a bucket that the environment does not describe, with exit code 2 and the names of the variables, and runs nothing and writes nothing', async () => {
    const { call, err, out, cwd, git, bucket } = withBucket({ env: { R2_BUCKET: FAKE_BUCKET } });
    const before = filesBelow(cwd);
    expect(await call('run', '--dry', '--client', 'fake', '--config', 'desk.yml')).toBe(2);
    expect(err).toEqual(['desk: the setting evidence.kind is r2, which needs R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the environment (they are not set, and a file of settings cannot have them)']);
    expect(out).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
    expect(git.commits).toEqual([]);
    expect(bucket.calls).toEqual([]);
  });

  it('refuses a bucket that the environment describes wrongly, and does not say what the value was', async () => {
    const { call, err } = withBucket({ env: { ...R2_ENV, R2_ENDPOINT: 'http://fake-account.r2.example', R2_SECRET_ACCESS_KEY: FAKE_SECRET } });
    expect(await call('run', '--dry', '--client', 'fake', '--config', 'desk.yml')).toBe(2);
    expect(err).toEqual(['desk: the setting evidence.kind is r2, and what the environment has for it cannot be used: the R2 endpoint is an https address with no path, such as https://<account>.r2.cloudflarestorage.com']);
  });

  it('refuses the made-up world for a bucket, for a run and for a replay, because nothing made up may be put in it', async () => {
    const { call, err, cwd, bucket } = withBucket();
    expect(await call(...DRY_DEMO, '--config', 'desk.yml')).toBe(2);
    expect(err[0]).toBe(
      'desk: --sources fixtures is a made-up world and is refused when the setting evidence.kind is r2: nothing made up may be put in the bucket, which a published piece cites its evidence from',
    );
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
    // A run of the made-up world, made with the folder, is not replayed from the bucket either.
    const folder = setup();
    expect(await folder.call(...DRY_DEMO)).toBe(0);
    writeFileSync(path.join(folder.cwd, 'desk.yml'), R2_FILE);
    folder.err.length = 0;
    expect(await folder.call('replay', path.join('runs', DEMO_DATE), '--config', 'desk.yml')).toBe(2);
    expect(folder.err[0]).toContain('is a made-up world and is refused when the setting evidence.kind is r2');
    expect(bucket.calls).toEqual([]);
  });

  it('keeps the pages of a run in the bucket that the environment describes, and not in the folder: two objects in pending/, nothing in published/ for a dry run, and no key anywhere that is printed', async () => {
    const { call, out, err, cwd, bucket, sites } = withBucket();
    expect(await call('run', '--dry', '--client', 'fake', '--date', DEMO_DATE, '--config', 'desk.yml')).toBe(0);
    expect(out).toContain('outcome: published');
    expect(sites.sent.length).toBeGreaterThan(0);
    const keys = [...bucket.objects.keys()].sort();
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => /^pending\/[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(existsSync(path.join(cwd, 'evidence'))).toBe(false);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_SECRET);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_KEY_ID);
  });
});

describe('main: a live run needs a user agent that is not a placeholder', () => {
  // The user agent is what the Desk calls itself to every site, and it must say where the site that is asking can be read about. The default
```

The package entry point lists what it exports.

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  Correction,
  DiscoverArtifact,
  EvidenceErrorKind,
  EvidenceMeta,
  EvidenceStore,
```

**with:**
```ts
  Correction,
  DiscoverArtifact,
  EvidenceDeps,
  EvidenceErrorKind,
  EvidenceKind,
  EvidenceMeta,
  EvidenceStore,
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
  'EvidenceMeta',
  'EVIDENCE_ERROR_KINDS',
  'EvidenceError',
  'KEPT_FOLDER',
  'LocalEvidenceStore',
```

**with:**
```ts
  'EvidenceMeta',
  'EVIDENCE_ERROR_KINDS',
  'EVIDENCE_KINDS',
  'EvidenceError',
  'R2_VARIABLES',
  'makeEvidenceStore',
  'KEPT_FOLDER',
  'LocalEvidenceStore',
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
      EvidenceStore,
      EvidenceErrorKind,
      StoreRequest,
      StoreTransport,
```

**with:**
```ts
      EvidenceStore,
      EvidenceErrorKind,
      EvidenceKind,
      EvidenceDeps,
      StoreRequest,
      StoreTransport,
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/config.test.ts test/run/evidence-factory.test.ts test/cli.test.ts test/fetch/exports.test.ts`
Expected: FAIL — `EVIDENCE_KINDS is not iterable`, `Cannot find module '../../src/run/evidence-factory'` and `exports makeEvidenceStore`

- [ ] **Step 3: Write the setting, the factory and the use of it**

The setting.

**In `desk/src/config.ts`, replace:**
```ts
const Models = z.strictObject({ select: text, extract: text, compose: text, verify: text });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
```

**with:**
```ts
const Models = z.strictObject({ select: text, extract: text, compose: text, verify: text });

/** Where the snapshots of sources are kept: `local` is a folder on this machine (`evidenceDir`), `r2` is a private bucket on Cloudflare R2. */
export const EVIDENCE_KINDS = ['local', 'r2'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * The evidence store. It has one setting, which of the two it is. The address, the name and the keys of a bucket are not settings: a file of settings is committed, so they are read
 * from the environment (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), and a file that tries to carry one of them is refused as a setting that does not exist.
 */
const Evidence = z.strictObject({ kind: z.enum(EVIDENCE_KINDS) });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
```

**In `desk/src/config.ts`, replace:**
```ts
  /** Where each run writes its artifacts. Kept out of git. */
  runDir: text,
  /** Where the snapshots of sources are kept. Kept out of git. */
  evidenceDir: text,
});
export type DeskConfig = z.infer<typeof DeskConfig>;
```

**with:**
```ts
  /** Where each run writes its artifacts. Kept out of git. */
  runDir: text,
  /** Where the snapshots of sources are kept, when the store is `local`. Kept out of git. */
  evidenceDir: text,
  evidence: Evidence,
});
export type DeskConfig = z.infer<typeof DeskConfig>;
```

**In `desk/src/config.ts`, replace:**
```ts
    runDir: 'runs',
    evidenceDir: 'evidence',
  };
}
```

**with:**
```ts
    runDir: 'runs',
    evidenceDir: 'evidence',
    evidence: { kind: 'local' },
  };
}
```

The factory.

**Create `desk/src/run/evidence-factory.ts`:**
```ts
import type { DeskConfig } from '../config';
import type { Environment } from '../model/factory';
import { LocalEvidenceStore } from './evidence';
import type { EvidenceStore } from './evidence';
import { R2EvidenceStore } from './r2-evidence';
import type { StoreTransport } from './r2-evidence';

// The evidence store of a run is chosen by one setting, `evidence.kind`, and built here. The folder of a local store is a setting too (`evidenceDir`). A bucket is not described by
// settings at all: its address, its name and the two halves of the key that opens it are read from the environment, because a file of settings is committed to a repository that anyone
// can read, and a key must never be in it. A store that is asked for and cannot be built is refused with a message that names the variables that are not there, never what they hold.

/** The variables of the environment that describe the bucket of a store of the kind `r2`, in the order that a message names them. */
export const R2_VARIABLES = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;

/** What a store of the kind `r2` is given besides the environment, which a test replaces: how requests are made, the clock, and how long to wait. */
export interface EvidenceDeps {
  transport?: StoreTransport;
  now?: () => Date;
  timeoutMs?: number;
}

/**
 * The evidence store that `config` asks for: `LocalEvidenceStore` in the folder `config.evidenceDir` for `local`, and `R2EvidenceStore` for `r2`, described by the four variables of
 * `R2_VARIABLES` in `env`. A value is taken with its spaces and line ends trimmed (a secret that was pasted with one at its end still works), and one that is empty is not set. The
 * variables that are not set are named in the error and nothing else is; a value that the store refuses (an address that is not https, a name that is not a bucket name, a key that
 * cannot sign) is refused with the message of the store, which does not repeat it. The `local` store does not look at the environment.
 */
export function makeEvidenceStore(config: DeskConfig, env: Environment, deps: EvidenceDeps = {}): EvidenceStore {
  if (config.evidence.kind === 'local') return new LocalEvidenceStore(config.evidenceDir);

  const value = (name: (typeof R2_VARIABLES)[number]): string => env[name]?.trim() ?? '';
  const missing = R2_VARIABLES.filter((name) => value(name) === '');
  if (missing.length > 0) {
    const [is, it] = missing.length === 1 ? ['it is', 'it'] : ['they are', 'them'];
    throw new Error(`the setting evidence.kind is r2, which needs ${missing.join(', ')} in the environment (${is} not set, and a file of settings cannot have ${it})`);
  }
  try {
    return new R2EvidenceStore({
      endpoint: value('R2_ENDPOINT'),
      bucket: value('R2_BUCKET'),
      accessKeyId: value('R2_ACCESS_KEY_ID'),
      secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
      ...(deps.transport === undefined ? {} : { transport: deps.transport }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    });
  } catch (error) {
    throw new Error(`the setting evidence.kind is r2, and what the environment has for it cannot be used: ${(error as Error).message}`);
  }
}
```

The command line.

**In `desk/src/cli.ts`, replace:**
```ts
  CLIENT_KINDS,
  HttpFetcher,
  LocalEvidenceStore,
  RetractRefused,
  RunRefused,
```

**with:**
```ts
  CLIENT_KINDS,
  HttpFetcher,
  RetractRefused,
  RunRefused,
```

**In `desk/src/cli.ts`, replace:**
```ts
  isPlainSlug,
  loadConfig,
  normaliseReason,
  placeholderHost,
```

**with:**
```ts
  isPlainSlug,
  loadConfig,
  makeEvidenceStore,
  normaliseReason,
  placeholderHost,
```

**In `desk/src/cli.ts`, replace:**
```ts
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**with:**
```ts
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, EvidenceStore, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoreTransport, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

**with:**
```ts
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
  '        The snapshots of the pages that a run reads are kept in the evidence store that the setting evidence.kind of a file of settings (--config) chooses: local, a folder',
  '        (evidenceDir), which is the default, or r2, a private bucket on Cloudflare R2, whose address, name and keys are read from the environment (R2_ENDPOINT, R2_BUCKET,',
  '        R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY) and never from a file. --sources fixtures is refused with r2, because nothing made up may be put in the bucket.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
```

**In `desk/src/cli.ts`, replace:**
```ts
  /** How the names of live sources are looked up, to check that they are public addresses; the default asks the system. */
  lookup?: Lookup;
  /** How the api client waits between tries. */
  retry?: RetryOptions;
```

**with:**
```ts
  /** How the names of live sources are looked up, to check that they are public addresses; the default asks the system. */
  lookup?: Lookup;
  /** How the requests to a bucket of the evidence store are made, when the setting evidence.kind is r2; the default is the global `fetch`. */
  evidenceTransport?: StoreTransport;
  /** How the api client waits between tries. */
  retry?: RetryOptions;
```

**In `desk/src/cli.ts`, replace:**
```ts
}

/** The registry and the fetcher of the sources that were asked for. */
function sourcesOf(kind: SourcesKind, deps: CliDeps, config: DeskConfig): { sources: SourcesRegistry; fetcher: Fetcher } {
```

**with:**
```ts
}

/**
 * The evidence store that the settings ask for, built from the environment of `deps` (`makeEvidenceStore`), or the exit code 2 and the reason, said on the error output. The made-up world
 * is refused for a bucket: its pages are fiction, and nothing made up may be put where a published piece will cite its evidence.
 */
function evidenceOf(deps: CliDeps, config: DeskConfig, sources: SourcesKind): { evidence: EvidenceStore } | { code: number } {
  if (sources === 'fixtures' && config.evidence.kind === 'r2') {
    deps.err('desk: --sources fixtures is a made-up world and is refused when the setting evidence.kind is r2: nothing made up may be put in the bucket, which a published piece cites its evidence from');
    return { code: 2 };
  }
  try {
    return { evidence: makeEvidenceStore(config, deps.env, { now: deps.now, ...(deps.evidenceTransport === undefined ? {} : { transport: deps.evidenceTransport }) }) };
  } catch (error) {
    deps.err(`desk: ${describeError(error)}`);
    return { code: 2 };
  }
}

/** The registry and the fetcher of the sources that were asked for. */
function sourcesOf(kind: SourcesKind, deps: CliDeps, config: DeskConfig): { sources: SourcesRegistry; fetcher: Fetcher } {
```

**In `desk/src/cli.ts`, replace:**
```ts
  }

  let choice: ClientChoice;
  if (args.client === 'fake') choice = { kind: 'fake', fake: demoClient() };
```

**with:**
```ts
  }

  const store = evidenceOf(deps, config, args.sources);
  if ('code' in store) return store.code;

  let choice: ClientChoice;
  if (args.client === 'fake') choice = { kind: 'fake', fake: demoClient() };
```

**In `desk/src/cli.ts`, replace:**
```ts
      clientKind: args.client,
      sourcesKind: args.sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
```

**with:**
```ts
      clientKind: args.client,
      sourcesKind: args.sources,
      evidence: store.evidence,
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
```

**In `desk/src/cli.ts`, replace:**
```ts
      return 2;
    }
    const report = await replayRun(runDir, {
      config,
      sources: sourcesOf(how.sources, deps, config).sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      ...(args.cassettes === undefined ? {} : { cassetteDir: path.resolve(deps.cwd, args.cassettes) }),
```

**with:**
```ts
      return 2;
    }
    const store = evidenceOf(deps, config, how.sources);
    if ('code' in store) return store.code;
    const report = await replayRun(runDir, {
      config,
      sources: sourcesOf(how.sources, deps, config).sources,
      evidence: store.evidence,
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      ...(args.cassettes === undefined ? {} : { cassetteDir: path.resolve(deps.cwd, args.cassettes) }),
```

It is exported with the rest of the package.

**In `desk/src/index.ts`, replace:**
```ts
export * from './run/evidence';
export * from './run/r2-evidence';
export * from './run/sigv4';
export * from './run/desk-state';
```

**with:**
```ts
export * from './run/evidence';
export * from './run/r2-evidence';
export * from './run/evidence-factory';
export * from './run/sigv4';
export * from './run/desk-state';
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/config.test.ts test/run/evidence-factory.test.ts test/cli.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  4 passed (4)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/config.ts desk/src/cli.ts desk/src/run/evidence-factory.ts desk/test/config.test.ts desk/test/cli.test.ts desk/test/run/evidence-factory.test.ts desk/test/support/bucket.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Commit**

```bash
git add desk/src/cli.ts desk/src/config.ts desk/src/index.ts desk/src/run/evidence-factory.ts desk/test/cli.test.ts desk/test/config.test.ts desk/test/fetch/exports.test.ts desk/test/run/evidence-factory.test.ts desk/test/support/bucket.ts
git commit -m "feat(desk): the evidence store is a setting (evidence.kind, local or r2), the bucket is described by four variables of the environment and never by a file, makeEvidenceStore builds the store and names the variables that are not set without ever saying a value, and the command line builds its store through it, refusing the made-up world for a bucket" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 20: The run uses the store: read back, keep, and fail closed

**Files:**
- Modify: `desk/src/stages/fetch.ts` (`confirmSnapshots`), `desk/src/stages/publish.ts` (keeps the snapshots that the piece cites before it writes the piece; `PublishResult.kept`), `desk/src/run/orchestrate.ts` (the stage `evidence`)
- Create: `desk/test/support/store.ts` (`watched`, a store that keeps its calls and can fail or lie; `acceptingStore`)
- Modify: `desk/test/stages/fetch.test.ts`, `desk/test/stages/publish.test.ts`, `desk/test/run/orchestrate.test.ts`, `desk/test/cli.test.ts`, `desk/test/fetch/exports.test.ts`

A run meets the evidence store in three places. **Fetch puts** each page it fetched (this has been so since Plan 2). **Between Fetch and Extract the run reads every snapshot back**, which is new. **Publish keeps** the snapshots that the piece cites, which is new too. A store that cannot do any of the three ends the run as `failed`, with the name of the stage, and nothing is published.

| The store fails when | The run ends | At the stage |
|---|---|---|
| Fetch puts a page | `failed`, nothing asked of the model after Select | `fetch` |
| the run reads the pages back | `failed`, nothing asked of the model after Select | `evidence` |
| Publish keeps the snapshots that the piece cites | `failed`, no piece and no ledger written | `publish` |

**Reading back.** `confirmSnapshots(ctx, snapshots)` asks the store for each snapshot by its hash and requires that what comes back is the text that was fetched. Both stores check a text against its hash when they read it, so a snapshot that was changed, lost or never kept stops the run here with the error of the store; a store that gives back another text without noticing is stopped by the comparison, as `tampered`. The reason for doing it is the claims: a quotation is checked against the text of the page, and a piece cites the page by its hash, so the text that Extract works from must be a text that the store itself will give back. If the store lost or changed a page between Fetch and Extract, the claims taken from it would cite a page that nobody can show, and the run stops before it has spent a call on them. The step is the stage `evidence` in the record of the run. A dry run reads back too (and puts), so that it can be replayed.

**Keeping, and why before the commit.** A piece that is published cites snapshots, and they must outlive the 90 days that the bucket keeps what is only put. Publish therefore calls `keep(hash)` for each source of the ledger of the piece, once each, **before it writes anything**. The order is deliberate. If the snapshots were kept after the commit, a store that failed then would leave a piece on the site whose evidence is in `pending/` only, where it expires, and the run would have no honest way to end: the piece is published and the run has failed. Kept before, a store that fails ends the run as `failed` at the stage `publish`, no file of the piece is written, and the next try of the day, which a failed day gets, is the retry. The price is a copy in `published/` of a snapshot of a piece that was not published, when the commit fails after the snapshots were kept (the checkout was checked clean when the run began, so this has never happened); a copy of a text that `pending/` has anyway does no harm. A piece that is held, a day with no story and a run that fails keep nothing: their snapshots stay in `pending/`, and expire. A dry run keeps nothing.

**What is not here.** A piece that the owner releases by merging the pull request of a hold is published by GitHub and not by a run, so nothing keeps its snapshots: they stay in `pending/` and expire after 90 days. The README says so, and the next part has to decide how they are kept (a command that keeps the snapshots of a piece that is on the site would do it).

- [ ] **Step 1: Write the tests**

Two helpers for the tests of the stages and of the runs: a store that keeps what it was asked, and can be told to fail or to lie, and one that accepts whatever it is asked to keep.

**Create `desk/test/support/store.ts`:**
```ts
import { sha256Hex } from '../../src/model/types';
import type { EvidenceMeta, EvidenceStore } from '../../src/run/evidence';

// A way to watch an evidence store, and to make it fail or lie: the tests of the runs that use a store say what the Desk asked of it, in what order, and what the run does when it answers
// badly. `watched` wraps any store (the folder, or a store of the made-up bucket) and keeps every call; a fault makes the next calls of a method throw, and `lie` makes `get` give back
// another text, as a store that does not check what it holds would.

/** One call of a store, and the hash that it was about (for a put, the hash of the text). */
export interface StoreCall {
  method: 'put' | 'get' | 'has' | 'keep';
  hash: string;
}

export interface WatchedStore extends EvidenceStore {
  calls: StoreCall[];
  /** The calls as lines, such as `get 271a7078`, with the hash cut to its first eight characters. */
  lines(): string[];
  /** Make the next `times` calls of `method` throw `error` (before the store is asked). */
  fail(method: StoreCall['method'], error: Error, times?: number): void;
  /** Make every `get` give back `text` as the text of the snapshot, whatever the store holds. */
  lie(text: string): void;
  /** Called at the start of every call, so that a test can look at the world at that moment. */
  onCall?: (call: StoreCall) => void;
}

/** A store that does what `inner` does, and keeps what it was asked. */
export function watched(inner: EvidenceStore): WatchedStore {
  const faults: { method: StoreCall['method']; error: Error; times: number }[] = [];
  let lying: string | undefined;
  const begin = (call: StoreCall): void => {
    watching.calls.push(call);
    watching.onCall?.(call);
    const fault = faults.find((entry) => entry.method === call.method && entry.times > 0);
    if (fault !== undefined) {
      fault.times -= 1;
      throw fault.error;
    }
  };
  const watching: WatchedStore = {
    calls: [],
    lines: () => watching.calls.map((call) => `${call.method} ${call.hash.slice(0, 8)}`),
    fail: (method, error, times = 1) => void faults.push({ method, error, times }),
    lie: (text) => {
      lying = text;
    },
    async put(text: string, meta: EvidenceMeta) {
      begin({ method: 'put', hash: sha256Hex(text) });
      return inner.put(text, meta);
    },
    async get(hash: string) {
      begin({ method: 'get', hash });
      const found = await inner.get(hash);
      return lying === undefined ? found : { ...found, text: lying };
    },
    async has(hash: string) {
      begin({ method: 'has', hash });
      return inner.has(hash);
    },
    async keep(hash: string) {
      begin({ method: 'keep', hash });
      return inner.keep(hash);
    },
  };
  return watching;
}

/** A store that keeps nothing and accepts everything: `keep` of any hash works, and what it was asked to keep is in `kept`. For the tests of a stage that cites snapshots that no store holds. */
export function acceptingStore(): EvidenceStore & { kept: string[] } {
  const kept: string[] = [];
  return {
    kept,
    put: async () => Promise.reject(new Error('this store puts nothing')),
    get: async () => Promise.reject(new Error('this store holds nothing')),
    has: async () => false,
    keep: async (hash) => void kept.push(hash),
  };
}
```

Fetch: reading back.

**In `desk/test/stages/fetch.test.ts`, replace:**
```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
```

**with:**
```ts
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
```

**In `desk/test/stages/fetch.test.ts`, replace:**
```ts
import { FetchArtifact, readArtifact } from '../../src/run/artifacts';
import type { SelectArtifact } from '../../src/run/artifacts';
import type { EvidenceStore } from '../../src/run/evidence';
import { fixtureText } from '../support/fixtures';
import { MAX_TITLE_LENGTH } from '../../src/stages/discover';
import { runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

// Fetch gets the pages that the story will be written from and keeps their text as evidence. These tests run it on
```

**with:**
```ts
import { FetchArtifact, readArtifact } from '../../src/run/artifacts';
import type { SelectArtifact } from '../../src/run/artifacts';
import { EvidenceError } from '../../src/run/evidence';
import type { EvidenceStore } from '../../src/run/evidence';
import { fixtureText } from '../support/fixtures';
import { MAX_TITLE_LENGTH } from '../../src/stages/discover';
import { confirmSnapshots, runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { watched } from '../support/store';

// Fetch gets the pages that the story will be written from and keeps their text as evidence. These tests run it on
```

**In `desk/test/stages/fetch.test.ts`, replace:**
```ts
    await expect(runFetch(ctx, selected(ARTICLE, URLS.release))).rejects.toThrow(new TypeError('a bug in the fetcher'));
  });
});
```

**with:**
```ts
    await expect(runFetch(ctx, selected(ARTICLE, URLS.release))).rejects.toThrow(new TypeError('a bug in the fetcher'));
  });
});

describe('confirmSnapshots: what Fetch stored is read back before anything is taken from it', () => {
  /** A context whose store is watched, and the snapshots that Fetch made in it. */
  async function fetched() {
    const made = stageContext(scratch);
    const store = watched(made.ctx.evidence);
    const ctx = { ...made.ctx, evidence: store };
    const result = await runFetch(ctx, selected(ARTICLE, URLS.release));
    if (!result.ok) throw new Error('the fetch failed');
    store.calls.length = 0;
    made.logs.length = 0;
    return { ...made, ctx, store, snapshots: result.snapshots };
  }

  it('asks the store for every snapshot by its hash, in order, and says how many it read back', async () => {
    const { ctx, store, snapshots, logs } = await fetched();
    await confirmSnapshots(ctx, snapshots);
    expect(store.calls).toEqual([
      { method: 'get', hash: sha256Hex(releaseText) },
      { method: 'get', hash: sha256Hex(articleText) },
    ]);
    expect(logs).toEqual(['evidence: read back 2 snapshots from the evidence store, each as it was fetched']);
  });

  it('says snapshot for one, and asks for nothing and says so for none', async () => {
    const { ctx, store, snapshots, logs } = await fetched();
    await confirmSnapshots(ctx, snapshots.slice(0, 1));
    expect(logs).toEqual(['evidence: read back 1 snapshot from the evidence store, each as it was fetched']);
    expect(store.calls).toHaveLength(1);
    await confirmSnapshots(ctx, []);
    expect(logs.at(-1)).toBe('evidence: read back 0 snapshots from the evidence store, each as it was fetched');
    expect(store.calls).toHaveLength(1);
  });

  it('stops with the error of the store when the store cannot give a snapshot back, and does not ask for the next', async () => {
    const { ctx, store, snapshots, logs } = await fetched();
    const down = new EvidenceError('unreachable', 'the evidence store could not be reached (GET pending/abc): connect ECONNREFUSED');
    store.fail('get', down);
    await expect(confirmSnapshots(ctx, snapshots)).rejects.toBe(down);
    expect(store.calls).toHaveLength(1);
    expect(logs).toEqual([]);
  });

  it('stops when the text of a snapshot has been changed in the store, as the store itself says', async () => {
    const { ctx, snapshots, evidenceDir } = await fetched();
    writeFileSync(path.join(evidenceDir, `${sha256Hex(articleText)}.txt`), `${articleText} changed`);
    await expect(confirmSnapshots(ctx, snapshots)).rejects.toMatchObject({ kind: 'tampered', message: `the evidence ${sha256Hex(articleText)} has been changed: its text no longer matches its hash` });
  });

  it('stops when the store does not have a snapshot that was fetched, as missing', async () => {
    const { ctx, snapshots } = await fetched();
    const lost = { ...(snapshots[0] as (typeof snapshots)[number]), hash: sha256Hex('a page that was never put') };
    await expect(confirmSnapshots(ctx, [lost])).rejects.toMatchObject({ kind: 'missing' });
  });

  it('stops when a store that does not check what it holds gives back another text than the one that was fetched, as tampered', async () => {
    const { ctx, store, snapshots, logs } = await fetched();
    store.lie('the text of another page');
    await expect(confirmSnapshots(ctx, snapshots)).rejects.toMatchObject({
      kind: 'tampered',
      message: `the evidence ${sha256Hex(releaseText)} is not the text that was fetched: the store gave back another text`,
    });
    expect(logs).toEqual([]);
  });
});
```

Publish: the golden piece cites snapshots that no store holds, so its tests are given a store that keeps whatever it is asked, and new tests say when the snapshots are kept, which, and what a store that fails does.

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runPublish } from '../../src/stages/publish';
```

**with:**
```ts
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { EvidenceError } from '../../src/run/evidence';
import type { EvidenceStore } from '../../src/run/evidence';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { runPublish } from '../../src/stages/publish';
```

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
import { stageContext, useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';

// Publish is the last step of a piece that the gate and the verifier cleared. It writes what the renderer gives and nothing else: the
```

**with:**
```ts
import { stageContext, useScratch } from '../support/context';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { acceptingStore } from '../support/store';

// Publish is the last step of a piece that the gate and the verifier cleared. It writes what the renderer gives and nothing else: the
```

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
}

function setup() {
  const made = stageContext(scratch);
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, target: new SiteTarget(repoDir, git) };
}

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

```

**with:**
```ts
}

/** A context whose evidence store keeps whatever it is asked to keep: the hashes of the golden piece are not those of any page that a store holds. */
function setup(evidence: EvidenceStore & { kept: string[] } = acceptingStore()) {
  const made = stageContext(scratch, { evidence });
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, store: evidence, target: new SiteTarget(repoDir, git) };
}

/** The snapshots that the golden piece cites, each once, as its ledger lists them: five pages, with five hashes. */
const CITED = (): string[] => [...new Set(rendered().ledger.sources.map((source) => source.snapshotHash))];

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

```

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
    const { ctx, logs, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(logs).toEqual([`publish: ${SLUG} written and committed as ${(result.commit as string).slice(0, 7)}`]);
  });

```

**with:**
```ts
    const { ctx, logs, target } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(logs).toEqual(['publish: kept 5 snapshots that the piece cites', `publish: ${SLUG} written and committed as ${(result.commit as string).slice(0, 7)}`]);
  });

```

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
  });

  it('a dry run is refused for the reasons a real run is: the slug is taken', async () => {
    const { ctx, repoDir } = setup();
```

**with:**
```ts
  });

  it('keeps nothing for a dry run: the snapshots that a piece would cite are not kept by a piece that is not written', async () => {
    const { ctx, repoDir, store } = setup();
    const result = await runPublish(ctx, new DryTarget(repoDir), GOLDEN_CLAIMS, cleared(), RUN);
    expect(store.kept).toEqual([]);
    expect(result.kept).toEqual([]);
  });

  it('a dry run is refused for the reasons a real run is: the slug is taken', async () => {
    const { ctx, repoDir } = setup();
```

**In `desk/test/stages/publish.test.ts`, replace:**
```ts
  });
});
```

**with:**
```ts
  });
});

describe('runPublish: the evidence that the piece cites is kept before the piece is written', () => {
  it('keeps the snapshots of the sources of the ledger, each once, in the order of the ledger, and says which', async () => {
    const { ctx, target, store } = setup();
    const result = await runPublish(ctx, target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(CITED()).toHaveLength(5);
    expect(store.kept).toEqual(CITED());
    expect(result.kept).toEqual(CITED());
    expect(store.kept).toEqual(rendered().ledger.sources.map((source) => source.snapshotHash));
  });

  it('keeps a snapshot once when two sources of the ledger have the same text', async () => {
    const { ctx, target, store } = setup();
    const same = 'a'.repeat(64);
    const claims = GOLDEN_CLAIMS.map((claim) => ({ ...claim, source: { ...claim.source, snapshotHash: same } }));
    await runPublish(ctx, target, claims, cleared(), RUN);
    expect(store.kept).toEqual([same]);
  });

  it('says snapshot, and not snapshots, when it kept one', async () => {
    const { ctx, target, logs } = setup();
    const claims = GOLDEN_CLAIMS.map((claim) => ({ ...claim, source: { ...claim.source, snapshotHash: 'b'.repeat(64) } }));
    await runPublish(ctx, target, claims, cleared(), RUN);
    expect(logs[0]).toBe('publish: kept 1 snapshot that the piece cites');
  });

  it('keeps them before anything is written or committed: when the store is asked, the ledger is not on the site and git has no commit', async () => {
    const made = setup();
    const seen: { ledger: boolean; commits: number }[] = [];
    const store: EvidenceStore & { kept: string[] } = {
      ...made.store,
      keep: async (hash) => {
        seen.push({ ledger: existsSync(path.join(made.repoDir, LEDGER)), commits: made.git.commits.length });
        made.store.kept.push(hash);
      },
    };
    await runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN);
    expect(seen).toHaveLength(5);
    expect(seen.every((at) => !at.ledger && at.commits === 0)).toBe(true);
    expect(made.git.commits).toHaveLength(1);
  });

  it('does not publish when a snapshot cannot be kept: nothing is written, nothing is committed, and the error says that it is the store', async () => {
    const made = setup();
    const down = new EvidenceError('unreachable', 'the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED');
    const store: EvidenceStore & { kept: string[] } = {
      ...made.store,
      keep: async (hash) => {
        if (made.store.kept.length === 2) throw down;
        made.store.kept.push(hash);
      },
    };
    await expect(runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow(
      'the snapshots that the piece cites could not be kept, so the piece is not published: the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED',
    );
    expect(made.store.kept).toEqual(CITED().slice(0, 2));
    expect(filesBelow(made.repoDir)).toEqual(['site/src/content/ledger/.gitkeep', 'site/src/content/news/.gitkeep', STATE]);
    expect(read(made.repoDir, STATE)).toBe(COMMITTED_STATE);
    expect(made.git.commits).toEqual([]);
    expect(made.logs).toEqual([]);
  });

  it('says the same of a store that fails with what is not an error', async () => {
    const made = setup();
    const store: EvidenceStore & { kept: string[] } = { ...made.store, keep: () => Promise.reject('a string, thrown') };
    await expect(runPublish({ ...made.ctx, evidence: store }, made.target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow('could not be kept, so the piece is not published: a string, thrown');
  });

  it('keeps nothing for a piece that is not cleared: not for a verdict of hold, not for a gate that did not clear it, not for a model check that did not pass', async () => {
    const { ctx, target, store } = setup();
    const gate = runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, defaultContext());
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), outcome: 'hold' }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), gate: { ...gate, route: 'revise' } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS, { ...cleared(), verifier: { ...VERIFIER, passed: false } }, RUN)).rejects.toThrow('needs a piece that Verify cleared');
    expect(store.kept).toEqual([]);
  });

  it('keeps nothing for a piece that cannot be rendered', async () => {
    const { ctx, target, store } = setup();
    await expect(runPublish(ctx, target, GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-1'), cleared(), RUN)).rejects.toThrow('a sentence cites c-1');
    expect(store.kept).toEqual([]);
  });

  it('does not publish a piece whose snapshot the store does not hold, and the error is the one of the store', async () => {
    const { ctx, target } = setup(acceptingStore());
    const refusing: EvidenceStore = { ...acceptingStore(), keep: async (hash) => Promise.reject(new EvidenceError('missing', `no evidence is stored for ${hash}`)) };
    await expect(runPublish({ ...ctx, evidence: refusing }, target, GOLDEN_CLAIMS, cleared(), RUN)).rejects.toThrow(`so the piece is not published: no evidence is stored for ${CITED()[0]}`);
  });
});
```

The whole run: a store that is watched, a store of the bucket made of memory, and each place where a store can fail.

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
import { VerifyArtifact, readArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { refuseApiOnFixtures } from '../../src/run/spending';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
import { FETCHED_AT, useScratch, withPages } from '../support/context';
import { EMPTY_CONTENT, SELECT, START, STATE, clock, contentOf, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE, filesBelow } from '../support/site';

// One run of the Desk, from end to end. Most of these tests run the real stages in the made-up world with a scripted model, so that the whole
```

**with:**
```ts
import { VerifyArtifact, readArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { EvidenceError, LocalEvidenceStore } from '../../src/run/evidence';
import { LOCK_FILE, RunRefused } from '../../src/run/lock';
import { R2EvidenceStore } from '../../src/run/r2-evidence';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { refuseApiOnFixtures } from '../../src/run/spending';
import { sitePaths } from '../../src/run/target';
import { runDiscover } from '../../src/stages/discover';
import { runFetch } from '../../src/stages/fetch';
import { FETCHED_AT, useScratch, withPages } from '../support/context';
import { EMPTY_CONTENT, SELECT, START, STATE, clock, contentOf, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { COMMITTED_STATE, filesBelow } from '../support/site';
import { watched } from '../support/store';
import { FAKE_R2, makeBucket } from '../support/bucket';

// One run of the Desk, from end to end. Most of these tests run the real stages in the made-up world with a scripted model, so that the whole
```

**In `desk/test/run/orchestrate.test.ts`, replace:**
```ts
    expect([...outcomes]).toEqual([['published', 1], ['held', 1], ['no-story', 1], ['failed', 1], ['dry', 0]]);
  });
});
```

**with:**
```ts
    expect([...outcomes]).toEqual([['published', 1], ['held', 1], ['no-story', 1], ['failed', 1], ['dry', 0]]);
  });
});

describe('runDesk: the evidence store', () => {
  // A run puts the pages that it fetched in the evidence store, reads each back before it takes a word from it, and, for a piece that it publishes, keeps the snapshots that the piece cites
  // before the piece is written. A store that cannot do any of the three ends the run as failed, at the stage where it happened, with nothing published. These runs are given a store
  // that watches the folder, so that they say what was asked of it, and a store that fails when it is told to.
  const down = (what: string) => new EvidenceError('unreachable', `the evidence store could not be reached (${what}): connect ECONNREFUSED`);

  function watchedRun(options: RunSetup = {}) {
    const made = setup(options);
    const store = watched(new LocalEvidenceStore(made.config.evidenceDir));
    return { ...made, store, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ evidence: store, ...overrides }) };
  }
  const methods = (store: ReturnType<typeof watched>): string[] => store.calls.map((call) => call.method);

  it('puts both pages, reads both back, and keeps the snapshots that the piece cites, in that order, for a piece that it publishes', async () => {
    const made = watchedRun();
    const result = await made.run();
    expect(result.outcome).toBe('published');
    const ledger = JSON.parse(readFileSync(path.join(made.repoDir, sitePaths().ledgerFile(result.slug as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
    const fetched = made.store.calls.filter((call) => call.method === 'put').map((call) => call.hash);
    expect(fetched).toHaveLength(2);
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get', ...ledger.sources.map(() => 'keep')]);
    expect(made.store.calls.filter((call) => call.method === 'get').map((call) => call.hash)).toEqual(fetched);
    const kept = made.store.calls.filter((call) => call.method === 'keep').map((call) => call.hash);
    expect(kept).toEqual(ledger.sources.map((source) => source.snapshotHash));
    expect(kept.length).toBeGreaterThanOrEqual(1);
    for (const hash of kept) expect(fetched).toContain(hash);
    expect(existsSync(path.join(made.config.evidenceDir, 'published', `${kept[0]}.txt`))).toBe(true);
  });

  it('keeps the snapshots before the piece is committed, and reads them back before Extract is asked anything', async () => {
    const made = watchedRun();
    const seen: string[] = [];
    made.store.onCall = (call) => void seen.push(`${call.method} with ${made.git.commits.length} commits and ${made.fake.calls.map((request) => request.role).join(',')}`);
    await made.run();
    expect(seen.filter((line) => line.startsWith('keep'))).toEqual(seen.filter((line) => line.startsWith('keep')).map(() => 'keep with 0 commits and select,extract,compose,verify'));
    expect(seen.filter((line) => line.startsWith('get'))).toEqual(['get with 0 commits and select', 'get with 0 commits and select']);
  });

  it('says in the log of the run what it read back and what it kept', async () => {
    const made = watchedRun();
    await made.run();
    expect(made.logs).toContain('evidence: read back 2 snapshots from the evidence store, each as it was fetched');
    expect(made.logs.some((line) => /^publish: kept \d+ snapshots? that the piece cites$/.test(line))).toBe(true);
  });

  it('does not keep anything for a piece that is held: its snapshots stay as they were put', async () => {
    const made = watchedRun({ fake: unentailed() });
    expect((await made.run()).outcome).toBe('held');
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
    expect(existsSync(path.join(made.config.evidenceDir, 'published'))).toBe(false);
  });

  it('does not keep anything for a day with no story: not when Select chooses none, which asks the store nothing, and not when Extract keeps too few claims', async () => {
    const none = watchedRun({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) });
    expect((await none.run()).outcome).toBe('no-story');
    expect(none.store.calls).toEqual([]);
    const few = watchedRun({ config: { minClaims: 99 } });
    const result = await few.run();
    expect([result.outcome, result.stage]).toEqual(['no-story', 'extract']);
    expect(methods(few.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('does not keep anything for a run that fails after Fetch', async () => {
    const made = watchedRun({ stages: composeFails() });
    expect((await made.run()).outcome).toBe('failed');
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('puts and reads back in a dry run, so that the run can be replayed, and never keeps: nothing is published', async () => {
    const made = watchedRun({ dry: true });
    const result = await made.run();
    expect([result.outcome, result.dry]).toEqual(['published', true]);
    expect(methods(made.store)).toEqual(['put', 'put', 'get', 'get']);
  });

  it('ends failed at the stage fetch when the store cannot take the first page, with nothing asked of the model after Select and nothing published', async () => {
    const made = watchedRun();
    made.store.fail('put', down('PUT pending/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage, result.slug]).toEqual(['failed', 'fetch', null]);
    expect(result.reason).toBe('the evidence store could not be reached (PUT pending/abc): connect ECONNREFUSED');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(methods(made.store)).toEqual(['put']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect((await readDeskState(path.join(made.repoDir, STATE))).lastRun).toMatchObject({ outcome: 'failed', slug: null });
  });

  it('ends failed at the stage evidence when the store cannot give a page back, before Extract is asked anything', async () => {
    const made = watchedRun();
    made.store.fail('get', down('GET pending/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
    expect(result.reason).toBe('the evidence store could not be reached (GET pending/abc): connect ECONNREFUSED');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(methods(made.store)).toEqual(['put', 'put', 'get']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'failed', stage: 'evidence' });
  });

  it('ends failed at the stage evidence when the store gives back another text than the one that was fetched, even if it does not notice', async () => {
    const made = watchedRun();
    made.store.lie('the text of another page');
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
    expect(result.reason).toContain('is not the text that was fetched: the store gave back another text');
    expect(made.fake.calls.map((request) => request.role)).toEqual(['select']);
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
  });

  it('ends failed at the stage publish when the store cannot keep a snapshot, and publishes nothing: no piece, no ledger, one commit that says that the run failed', async () => {
    const made = watchedRun();
    made.store.fail('keep', down('HEAD published/abc'));
    const result = await made.run();
    expect([result.outcome, result.stage, result.slug]).toEqual(['failed', 'publish', null]);
    expect(result.reason).toBe('the snapshots that the piece cites could not be kept, so the piece is not published: the evidence store could not be reached (HEAD published/abc): connect ECONNREFUSED');
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    expect(made.git.commits[0]?.message).toBe(`desk: the run of ${DEMO_DATE} failed`);
    const state = await readDeskState(path.join(made.repoDir, STATE));
    expect(state.lastRun).toMatchObject({ outcome: 'failed', slug: null });
    expect(recordOf(made.dir)).toMatchObject({ outcome: 'failed', stage: 'publish', slug: null, commit: result.commit });
  });

  it('is tried again the next time, and publishes when the store is well: a day that failed because of the store is not lost', async () => {
    const made = watchedRun();
    made.store.fail('keep', down('HEAD published/abc'));
    expect((await made.run()).outcome).toBe('failed');
    const second = await again(made, { evidence: made.store });
    expect([second.outcome, second.attempt]).toEqual(['published', 2]);
    expect(contentOf(made.repoDir)).toHaveLength(4);
  });

  it('ends failed at the first call when the store is down all along, and asks it no more than it must', async () => {
    const made = watchedRun();
    made.store.fail('put', down('PUT pending/abc'), 100);
    const result = await made.run();
    expect([result.outcome, result.stage]).toEqual(['failed', 'fetch']);
    expect(made.store.calls).toHaveLength(1);
  });

  describe('with a bucket', () => {
    // The same runs with the store of the bucket, over a bucket made of memory that checks the signature of every request.
    function bucketRun(options: RunSetup = {}) {
      const made = setup(options);
      const bucket = makeBucket(() => START);
      const store = new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START });
      return { ...made, bucket, store, run: (overrides: Partial<RunDeskOptions> = {}) => made.run({ evidence: store, ...overrides }) };
    }
    const keysOf = (bucket: ReturnType<typeof makeBucket>, prefix: string): string[] => [...bucket.objects.keys()].filter((key) => key.startsWith(prefix)).sort();

    it('keeps both pages in pending/ and the pages that the piece cites in published/, for a piece that is published', async () => {
      const made = bucketRun();
      const result = await made.run();
      expect(result.outcome).toBe('published');
      const ledger = JSON.parse(readFileSync(path.join(made.repoDir, sitePaths().ledgerFile(result.slug as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
      expect(keysOf(made.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(made.bucket, 'published/')).toEqual(ledger.sources.map((source) => `published/${source.snapshotHash}`).sort());
      expect(made.bucket.calls.every((call) => call.status === 200 || call.status === 404)).toBe(true);
      expect(existsSync(made.config.evidenceDir)).toBe(false);
    });

    it('keeps only what was put in pending/ for a piece that is held, and keeps nothing for a dry run', async () => {
      const held = bucketRun({ fake: unentailed() });
      expect((await held.run()).outcome).toBe('held');
      expect(keysOf(held.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(held.bucket, 'published/')).toEqual([]);
      const dry = bucketRun({ dry: true });
      expect((await dry.run()).outcome).toBe('published');
      expect(keysOf(dry.bucket, 'pending/')).toHaveLength(2);
      expect(keysOf(dry.bucket, 'published/')).toEqual([]);
    });

    it('ends failed at the stage fetch, naming the bucket as unreachable, when the bucket is down, and at the stage publish when it goes down after the pages were read back', async () => {
      const first = bucketRun();
      first.bucket.fail({ status: 503, body: '<Error><Code>ServiceUnavailable</Code></Error>' }, { method: 'PUT' });
      const result = await first.run();
      expect([result.outcome, result.stage]).toEqual(['failed', 'fetch']);
      expect(result.reason).toMatch(/^the evidence store answered PUT pending\/[0-9a-f]{64} with 503: <Error><Code>ServiceUnavailable<\/Code><\/Error>$/);
      const later = bucketRun();
      later.bucket.fail({ status: 503 }, { method: 'PUT', key: 'published/' });
      const kept = await later.run();
      expect([kept.outcome, kept.stage]).toEqual(['failed', 'publish']);
      expect(kept.reason).toContain('could not be kept, so the piece is not published: the evidence store answered PUT published/');
      expect(keysOf(later.bucket, 'published/')).toEqual([]);
      expect(contentOf(later.repoDir)).toEqual(EMPTY_CONTENT);
    });

    it('ends failed at the stage evidence when the bucket changes a page that was put: the text no longer matches its hash', async () => {
      const made = bucketRun({ stages: {} });
      const fetchThenChange: Stages['fetch'] = async (ctx, selected) => {
        const fetched = await runFetch(ctx, selected);
        for (const key of keysOf(made.bucket, 'pending/')) (made.bucket.objects.get(key) as { body: string }).body += ' ';
        return fetched;
      };
      const result = await made.run({ stages: { fetch: fetchThenChange } });
      expect([result.outcome, result.stage]).toEqual(['failed', 'evidence']);
      expect(result.reason).toMatch(/^the evidence [0-9a-f]{64} has been changed: its text no longer matches its hash$/);
      expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    });
  });
});
```

The command line: a published piece in a run of the made-up world over made-up sites, from the replies that a dry run recorded, keeps what the piece cites in the bucket.

**In `desk/test/cli.test.ts`, replace:**
```ts
  });

  it('keeps the pages of a run in the bucket that the environment describes, and not in the folder: two objects in pending/, nothing in published/ for a dry run, and no key anywhere that is printed', async () => {
    const { call, out, err, cwd, bucket, sites } = withBucket();
```

**with:**
```ts
  });

  it('keeps the pages that a published piece cites in published/, for a run that is not dry: the made-up story, replayed from the replies that a dry run recorded, over the made-up sites', async () => {
    const { call, out, err, cwd, bucket, git } = withBucket();
    expect(await call('run', '--dry', '--client', 'fake', '--date', DEMO_DATE, '--config', 'desk.yml')).toBe(0);
    mkdirSync(path.join(cwd, 'cassettes-kept'));
    for (const name of readdirSync(path.join(cwd, 'runs', DEMO_DATE, 'cassettes'))) copyFileSync(path.join(cwd, 'runs', DEMO_DATE, 'cassettes', name), path.join(cwd, 'cassettes-kept', name));
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/'))).toEqual([]);
    expect(await call('run', '--client', 'recorded', '--cassettes', 'cassettes-kept', '--date', DEMO_DATE, '--force-new', '--config', 'desk.yml')).toBe(0);
    expect(out.filter((line) => line === 'outcome: published')).toHaveLength(2);
    expect(git.commits).toHaveLength(1);
    const ledger = JSON.parse(readFileSync(path.join(cwd, sitePaths().ledgerFile(out.find((line) => line.startsWith('piece: '))?.slice(7) as string)), 'utf8')) as { sources: { snapshotHash: string }[] };
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('published/')).sort()).toEqual(ledger.sources.map((source) => `published/${source.snapshotHash}`).sort());
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('pending/'))).toHaveLength(2);
    expect([...out, ...err].join('\n')).not.toContain(FAKE_SECRET);
  });

  it('keeps the pages of a run in the bucket that the environment describes, and not in the folder: two objects in pending/, nothing in published/ for a dry run, and no key anywhere that is printed', async () => {
    const { call, out, err, cwd, bucket, sites } = withBucket();
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts

  it('does not export the stages or their prompts', () => {
    const stages = ['runDiscover', 'runSelect', 'runFetch', 'shortlistOf', 'loadPublishedIndex', 'emptyPublished', 'selectSystem', 'buildSelectUser'];
    const extraction = ['locateQuote', 'claimProblems', 'runExtract', 'extractReplySchema', 'kindOfSnapshot', 'extractSystem', 'buildExtractUser'];
    const assembly = ['slugFromTitle', 'ComposeReply', 'ReplySentence', 'assembleDraft', 'finishDraft'];
```

**with:**
```ts

  it('does not export the stages or their prompts', () => {
    const stages = ['runDiscover', 'runSelect', 'runFetch', 'confirmSnapshots', 'shortlistOf', 'loadPublishedIndex', 'emptyPublished', 'selectSystem', 'buildSelectUser'];
    const extraction = ['locateQuote', 'claimProblems', 'runExtract', 'extractReplySchema', 'kindOfSnapshot', 'extractSystem', 'buildExtractUser'];
    const assembly = ['slugFromTitle', 'ComposeReply', 'ReplySentence', 'assembleDraft', 'finishDraft'];
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/stages/fetch.test.ts test/stages/publish.test.ts test/run/orchestrate.test.ts test/cli.test.ts`
Expected: FAIL — `confirmSnapshots is not a function` and `expected [ 'put', 'put' ] to deeply equal [ 'put', 'put', 'get', 'get'`

- [ ] **Step 3: Write the reading back, the keeping and the stage**

**In `desk/src/stages/fetch.ts`, replace:**
```ts
import { FetchArtifact, extractPage, writeArtifact } from '../index';
import type { FetchDocument, SelectArtifact } from '../index';
import { describeFailure, isSourceFailure } from './context';
```

**with:**
```ts
import { EvidenceError, FetchArtifact, extractPage, writeArtifact } from '../index';
import type { FetchDocument, SelectArtifact } from '../index';
import { describeFailure, isSourceFailure } from './context';
```

**In `desk/src/stages/fetch.ts`, replace:**
```ts
// is fetched politely (the fetcher's job), reduced to its text, and put in the evidence store, which names it by the
// SHA-256 of the text. The artifact records where each page came from and its hash, never the text: the text is
// handed to the next stage in memory, and the evidence store is where anyone can read it again.

/** A page that was fetched and stored: what the artifact says about it, and its text. */
```

**with:**
```ts
// is fetched politely (the fetcher's job), reduced to its text, and put in the evidence store, which names it by the
// SHA-256 of the text. The artifact records where each page came from and its hash, never the text: the text is
// handed to the next stage in memory, and the evidence store is where anyone can read it again. Before the next stage takes a
// word of it, the run reads every snapshot back from the store (`confirmSnapshots`): the claims of a piece are taken from text that the store
// gave back, which it has checked against its hash.

/** A page that was fetched and stored: what the artifact says about it, and its text. */
```

**In `desk/src/stages/fetch.ts`, replace:**
```ts
  return { ok: true, artifact, snapshots };
}
```

**with:**
```ts
  return { ok: true, artifact, snapshots };
}

/**
 * Read back what Fetch stored, before anything is taken from it: every snapshot is asked of the evidence store by its hash, and what the store gives must be the text that was fetched.
 * A store checks the text that it reads against its hash (`get` of both stores of the Desk does), so a snapshot that the store lost, changed or never kept stops the run here with the
 * error of the store; a store that gives back another text without noticing is stopped here too, as `tampered`. Nothing is returned: the text that Extract works from is the text
 * that was fetched, which is now known to be the text that the store holds.
 */
export async function confirmSnapshots(ctx: Pick<StageContext, 'evidence' | 'log'>, snapshots: readonly Snapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    const stored = await ctx.evidence.get(snapshot.hash);
    if (stored.text !== snapshot.text) {
      throw new EvidenceError('tampered', `the evidence ${snapshot.hash} is not the text that was fetched: the store gave back another text`);
    }
  }
  ctx.log(`evidence: read back ${snapshots.length} ${snapshots.length === 1 ? 'snapshot' : 'snapshots'} from the evidence store, each as it was fetched`);
}
```

**In `desk/src/stages/publish.ts`, replace:**
```ts
// `renderDraft` of the gate package: the Desk writes no text of its own into a piece. The stage writes the two files that the renderer gives,
// byte for byte, records the run in the desk state, and commits the three files in one commit; where they are written is the target's business
// (`SiteTarget` writes and commits, `DryTarget` writes nothing). Nothing is pushed: that is for the daily workflow of a later plan.

/** The run that is publishing: its id, and the moment it is recording, as an ISO time. */
```

**with:**
```ts
// `renderDraft` of the gate package: the Desk writes no text of its own into a piece. The stage writes the two files that the renderer gives,
// byte for byte, records the run in the desk state, and commits the three files in one commit; where they are written is the target's business
// (`SiteTarget` writes and commits, `DryTarget` writes nothing). Nothing is pushed: that is for the daily workflow of a later plan. Before anything is written, the snapshots
// that the piece cites are kept in the evidence store (`keep`), for good, so that a piece is never on the site while the pages that it quotes can still be lost; a store that
// cannot keep them ends the stage, and the piece is not published.

/** The run that is publishing: its id, and the moment it is recording, as an ISO time. */
```

**In `desk/src/stages/publish.ts`, replace:**
```ts
  mdx: string;
  ledger: LedgerEntry;
  /** The id of the commit; null for a dry run. */
  commit: string | null;
```

**with:**
```ts
  mdx: string;
  ledger: LedgerEntry;
  /** The snapshots that the piece cites, as their hashes, which were kept in the evidence store before the piece was written; none for a dry run, which keeps nothing. */
  kept: string[];
  /** The id of the commit; null for a dry run. */
  commit: string | null;
```

**In `desk/src/stages/publish.ts`, replace:**
```ts
 * that the site uses before anything is written, because the site refuses to build a piece with a ledger it cannot read.
 *
 * The target refuses, before it writes, a slug that is taken and a checkout with uncommitted changes where the files go; and puts everything back
 * if the commit fails. Whatever it throws ends the run.
 */
export async function runPublish(ctx: Pick<StageContext, 'log'>, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: PublishRun): Promise<PublishResult> {
  if (verified.outcome !== 'publish' || verified.gate.route !== 'publish' || !verified.verifier.passed) {
    throw new Error('runPublish needs a piece that Verify cleared: the outcome and the route of the gate must be publish, and the model check must have passed');
```

**with:**
```ts
 * that the site uses before anything is written, because the site refuses to build a piece with a ledger it cannot read.
 *
 * Then the snapshots that the piece cites (the sources of its ledger, each once) are kept in the evidence store, one after the other. A snapshot that cannot be kept (the store is
 * down, refuses, or holds a text that has been changed) ends the stage with an error that says so, and nothing is written: it is the store and not the piece that stopped it. A dry
 * run keeps nothing. If the commit fails after that, the snapshots stay kept, which does no harm: each is a copy of what is in the store already.
 *
 * The target refuses, before it writes, a slug that is taken and a checkout with uncommitted changes where the files go; and puts everything back
 * if the commit fails. Whatever it throws ends the run.
 */
export async function runPublish(ctx: Pick<StageContext, 'log' | 'evidence'>, target: PublishTarget, claims: Claim[], verified: VerifyResult, run: PublishRun): Promise<PublishResult> {
  if (verified.outcome !== 'publish' || verified.gate.route !== 'publish' || !verified.verifier.passed) {
    throw new Error('runPublish needs a piece that Verify cleared: the outcome and the route of the gate must be publish, and the model check must have passed');
```

**In `desk/src/stages/publish.ts`, replace:**
```ts
  const slug = verified.draft.slug;

  const result = await target.apply({
    piece: { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` },
```

**with:**
```ts
  const slug = verified.draft.slug;

  const kept = target.dry ? [] : [...new Set(ledger.sources.map((source) => source.snapshotHash))];
  try {
    for (const hash of kept) await ctx.evidence.keep(hash);
  } catch (error) {
    throw new Error(`the snapshots that the piece cites could not be kept, so the piece is not published: ${error instanceof Error ? error.message || error.name : String(error)}`);
  }
  if (kept.length > 0) ctx.log(`publish: kept ${kept.length} ${kept.length === 1 ? 'snapshot' : 'snapshots'} that the piece cites`);

  const result = await target.apply({
    piece: { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` },
```

**In `desk/src/stages/publish.ts`, replace:**
```ts
  });
  ctx.log(result.commit === null ? `publish: ${slug} would be written (dry run: nothing was written)` : `publish: ${slug} written and committed as ${result.commit.slice(0, 7)}`);
  return { slug, mdx, ledger, commit: result.commit, files: result.files };
}
```

**with:**
```ts
  });
  ctx.log(result.commit === null ? `publish: ${slug} would be written (dry run: nothing was written)` : `publish: ${slug} written and committed as ${result.commit.slice(0, 7)}`);
  return { slug, mdx, ledger, kept, commit: result.commit, files: result.files };
}
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
import { runDiscover } from '../stages/discover';
import { runExtract } from '../stages/extract';
import { runFetch } from '../stages/fetch';
import { runHold } from '../stages/hold';
import { runPublish } from '../stages/publish';
```

**with:**
```ts
import { runDiscover } from '../stages/discover';
import { runExtract } from '../stages/extract';
import { confirmSnapshots, runFetch } from '../stages/fetch';
import { runHold } from '../stages/hold';
import { runPublish } from '../stages/publish';
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
 * moved and nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage) or `held` (the
 * Hold stage; with a `forge` the held piece is first sent to the owner as a draft pull request). Anything a stage throws, a model error and a spent budget included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
```

**with:**
```ts
 * moved and nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made; between Fetch and Extract every snapshot that Fetch stored is read
 * back from the evidence store (the stage `evidence`), and a store that has lost or changed one ends the run. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage, which keeps the snapshots that the piece cites before it writes the piece) or `held` (the
 * Hold stage; with a `forge` the held piece is first sent to the owner as a draft pull request). Anything a stage throws, a model error, a spent budget and a failure of the evidence store included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
```

**In `desk/src/run/orchestrate.ts`, replace:**
```ts
      const fetched = await stages.fetch(ctx, selected);
      if (!fetched.ok) return { outcome: 'no-story', stage, reason: fetched.reason };
      stage = 'extract';
      const extracted = await stages.extract(ctx, fetched.snapshots, selected);
```

**with:**
```ts
      const fetched = await stages.fetch(ctx, selected);
      if (!fetched.ok) return { outcome: 'no-story', stage, reason: fetched.reason };
      stage = 'evidence';
      await confirmSnapshots(ctx, fetched.snapshots);
      stage = 'extract';
      const extracted = await stages.extract(ctx, fetched.snapshots, selected);
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/stages/fetch.test.ts test/stages/publish.test.ts test/run/orchestrate.test.ts test/cli.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  5 passed (5)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/stages/fetch.ts desk/src/stages/publish.ts desk/src/run/orchestrate.ts desk/test/support/store.ts desk/test/stages/fetch.test.ts desk/test/stages/publish.test.ts desk/test/run/orchestrate.test.ts desk/test/cli.test.ts`
Expected: PASS — prints nothing

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Commit**

```bash
git add desk/src/run/orchestrate.ts desk/src/stages/fetch.ts desk/src/stages/publish.ts desk/test/cli.test.ts desk/test/fetch/exports.test.ts desk/test/run/orchestrate.test.ts desk/test/stages/fetch.test.ts desk/test/stages/publish.test.ts desk/test/support/store.ts
git commit -m "feat(desk): a run reads every snapshot back from the evidence store before Extract takes a word from it, and Publish keeps the snapshots that the piece cites before it writes the piece, so that a store that cannot put, read or keep ends the run as failed at the stage fetch, evidence or publish with nothing published, and a piece that is held, a day with no story, a failed run and a dry run keep nothing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 21: The README says what is stored, and the matrix tampers with the store

**Files:**
- Modify: `README.md` (a section, The evidence store; the settings, the limits, and the places that said that the bucket is not built)
- Modify: `desk/test/readme.test.ts`, `desk/test/adversarial.test.ts`

Two things are left of what the store needs before it can be used, and neither is a line of the Desk. A person who is about to make the bucket has to be told what the Desk will write into it, where, for how long, who can read it and which variables it reads, in a place that a test keeps true. And the adversarial matrix, which is the list of what a model, a page or a service can do to make the Desk publish what it should not, has to have the one thing that the store can do: change a page after the Desk has fetched it.

**The README.** A section, The evidence store, says in the order that a person needs it: what a snapshot is, where the two stores keep it, which four variables describe a bucket and that they are never read from a file, which two kinds of object the store writes (a table: `pending/<hash>` and `published/<hash>`, when each is written and what removes it), what a run does with the store and where it ends when the store fails, who can read what is in the bucket, and how the bucket is made (by the runbook, outside this plan: private, a rule on the prefix `pending/`, a token limited to the bucket). It says plainly that the store has never been used against Cloudflare. Four limits join the list of what the Desk does not check, and the one that matters most is the first: **a piece that the owner releases by merging the pull request of a hold is published by GitHub and not by a run, so nothing keeps its snapshots, and the bucket removes them after 90 days.** The three places in the README that said that the bucket is not built say what is true now.

**The matrix.** Seven scenarios, each of them the clean story (which is published when nothing is done to it) with one thing done to the store at the moment between the end of Fetch and the start of Extract, which nothing else watches: a page of the folder is changed by one space, a page is lost, the record of where a page came from is lost, an object of the bucket is changed by one space, an object is lost, the record of an object is changed, and a store that does not check what it holds gives back another text. Each must end `failed` at the stage `evidence`, with the model asked only to select (it is never asked to take a claim from a page that the store cannot show), nothing on the site and one commit of the desk state. The same run with nothing changed is published, so each scenario is bad because of the change and not because the run is.

- [ ] **Step 1: Write the tests**

The README test says what the section says, in the words that matter.

**In `desk/test/readme.test.ts`, replace:**
```ts
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

**with:**
```ts
});

describe('the README: the evidence store', () => {
  const store = (): string => section('The evidence store');

  it('no longer says that the bucket is not built, and says that it is built and has never been used against Cloudflare', () => {
    expect(section('Which parts are live')).not.toContain('the bucket is not built');
    expect(section('Which parts are live')).toContain('has never been used against Cloudflare');
    expect(section('The desk workspace')).not.toContain('the private evidence bucket,');
    expect(store()).toContain('It has never been used against Cloudflare');
  });

  it('says what a snapshot is: the text of a page named by its SHA-256, with where it came from, never changed, and refused when it no longer matches its hash', () => {
    expect(store()).toContain('the text of the page, named by its SHA-256');
    expect(store()).toContain('putting a text that is kept already changes nothing');
    expect(store()).toContain('refused when it is read back');
  });

  it('says which store the settings choose, that the folder is the default, and that the bucket is reached through the S3 interface of R2 with a signature that the Desk writes itself and tests against the examples of Amazon', () => {
    expect(store()).toContain('`evidence.kind`');
    expect(store()).toContain('`local`, the default, is a folder');
    expect(store()).toContain('`r2` is a **private bucket on Cloudflare R2**');
    expect(store()).toContain('desk/src/run/sigv4.ts');
    expect(store()).toContain('AWS Signature Version 4 written with `node:crypto`');
    expect(store()).toContain('worked examples that Amazon publishes');
    expect(store()).toContain('No package was added.');
  });

  it('says that the bucket is described by four variables of the environment and never by a file, that there is no flag, and what a run does without them', () => {
    for (const name of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) expect(store()).toContain(`\`${name}\``);
    expect(store()).toContain('They are never read from a file of settings');
    expect(store()).toContain('there is no flag to choose the store');
    expect(store()).toContain('refused with exit code 2, naming the ones that are missing and never what any of them holds');
    expect(store()).toContain('No message, log, record or artifact of the Desk has a key in it');
    expect(store()).toContain('`--sources fixtures`, the made-up world, is refused with `r2`');
  });

  it('says which keys the store writes, when, and for how long, in a table of the two prefixes', () => {
    expect(store()).toContain('| `pending/<hash>` |');
    expect(store()).toContain('| `published/<hash>` |');
    expect(store()).toContain('By the bucket, 90 days after it was written');
    expect(store()).toContain('| Never |');
    expect(store()).toContain('`<hash>` is 64 lowercase hex characters.');
    expect(store()).toContain('a dry run puts and reads but never keeps');
    expect(store()).toContain('leave their snapshots in `pending/` only');
  });

  it('says what a run does with the store, where it ends when the store fails, and the four kinds of trouble', () => {
    expect(store()).toContain('(the stage `evidence`)');
    expect(store()).toContain('Publish keeps the snapshots that the piece cites before it writes the piece');
    expect(store()).toContain('ends the run `failed` at the stage `fetch`, `evidence` or `publish`, with nothing published');
    for (const kind of ['unreachable', 'denied', 'tampered', 'missing']) expect(store()).toContain(`\`${kind}\``);
  });

  it('says who can read the snapshots, and that page text is not in the repository or in what a workflow uploads', () => {
    expect(store()).toContain('The bucket is private: no public access, no `r2.dev` address and no custom domain');
    expect(store()).toContain('the Desk never sends an access-control header');
    expect(store()).toContain('by no one else');
    expect(store()).toContain('at most 300 characters');
    expect(store()).toContain('must not have page text');
  });

  it('says how the bucket is made, and that the runbook makes it', () => {
    expect(store()).toContain('The runbook makes it, once, outside this plan');
    expect(store()).toContain('deletes the objects of the prefix `pending/` 90 days after they were written');
    expect(store()).toContain('an API token that may read and write objects, limited to this bucket');
  });

  it('says in the settings that the evidence setting chooses the store and that a file that carries a key is refused', () => {
    const command = section('The desk command');
    expect(command).toContain('The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store');
    expect(command).toContain('a file that carries one is refused like any other setting that does not exist');
  });

  it('says the limits that the store has: the evidence of a piece that the owner releases, no retries, copies of an unpublished piece, and a record that is too long', () => {
    const limits = section('What the Desk does not check');
    expect(limits).toContain('**Evidence of a piece that the owner releases.**');
    expect(limits).toContain('a command that keeps the snapshots that a piece on the site cites is not built');
    expect(limits).toContain('**The store does not retry.**');
    expect(limits).toContain('**Copies of snapshots of a piece that was not published.**');
    expect(limits).toContain('**A record that is too long.**');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');
```

The matrix.

**In `desk/test/adversarial.test.ts`, replace:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
```

**with:**
```ts
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
import { ExtractArtifact, FetchArtifact, VerifyArtifact, candidateId, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import { GhForge, HOLD_BRANCH } from '../src/run/forge';
import type { RunResult } from '../src/run/orchestrate';
import { SiteTarget } from '../src/run/target';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { scriptedExec } from './support/exec';
```

**with:**
```ts
import { ExtractArtifact, FetchArtifact, VerifyArtifact, candidateId, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import { LocalEvidenceStore } from '../src/run/evidence';
import type { EvidenceStore } from '../src/run/evidence';
import { GhForge, HOLD_BRANCH } from '../src/run/forge';
import type { RunResult } from '../src/run/orchestrate';
import { R2EvidenceStore } from '../src/run/r2-evidence';
import { SiteTarget } from '../src/run/target';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { runFetch } from '../src/stages/fetch';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { scriptedExec } from './support/exec';
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
import { outsideBlocks } from './support/prompts';
import { branchesIn, changesIn, git, initRepo, subjectsOf } from './support/repo';
import { EMPTY_CONTENT, SELECT, STATE, contentOf, setupRun, unentailed } from './support/run';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route, Sent } from './support/transport';
```

**with:**
```ts
import { outsideBlocks } from './support/prompts';
import { branchesIn, changesIn, git, initRepo, subjectsOf } from './support/repo';
import { EMPTY_CONTENT, SELECT, START, STATE, contentOf, setupRun, unentailed } from './support/run';
import { FAKE_R2, makeBucket } from './support/bucket';
import { watched } from './support/store';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route, Sent } from './support/transport';
```

**In `desk/test/adversarial.test.ts`, replace:**
```ts
    expect(FORGE_DOWN.length).toBeGreaterThanOrEqual(5);
  });
});

```

**with:**
```ts
    expect(FORGE_DOWN.length).toBeGreaterThanOrEqual(5);
  });
});

// The evidence store is something that the Desk trusts with the text of the pages that a piece quotes, and a store can go wrong: it can change a page, lose one or give back another text
// than the one that it holds. The run reads every snapshot back before Extract takes a word from it, so each of these ends the run, failed, at the stage evidence, before the model is asked
// to take a claim from a page that the store cannot show. The store is changed at the one moment where nothing else would notice, between the end of Fetch and the start of Extract.

type MadeRun = ReturnType<typeof setupRun>;

interface StoreFault {
  name: string;
  /** The store that the run is given, and what is done to it when Fetch has ended. */
  store: (made: MadeRun) => { evidence: EvidenceStore; change: () => void; keys?: () => string[] };
  /** What the error of the run says. */
  reason: string;
}

/** The files of a folder of snapshots with the ending `ending`, as paths. */
const snapshotsIn = (dir: string, ending: string): string[] => readdirSync(dir).filter((name) => name.endsWith(ending)).map((name) => path.join(dir, name));

const STORE_FAULTS: StoreFault[] = [
  {
    name: 'a page in the folder is changed by one space',
    store: (made) => ({
      evidence: new LocalEvidenceStore(made.config.evidenceDir),
      change: () => snapshotsIn(made.config.evidenceDir, '.txt').forEach((file) => writeFileSync(file, `${readFileSync(file, 'utf8')} `)),
    }),
    reason: 'has been changed: its text no longer matches its hash',
  },
  {
    name: 'a page in the folder is lost',
    store: (made) => ({ evidence: new LocalEvidenceStore(made.config.evidenceDir), change: () => snapshotsIn(made.config.evidenceDir, '.txt').forEach((file) => unlinkSync(file)) }),
    reason: 'no evidence is stored for',
  },
  {
    name: 'the record of where a page came from is lost',
    store: (made) => ({ evidence: new LocalEvidenceStore(made.config.evidenceDir), change: () => snapshotsIn(made.config.evidenceDir, '.json').forEach((file) => unlinkSync(file)) }),
    reason: 'has no record of where it came from',
  },
  {
    name: 'an object of the bucket is changed by one space',
    store: () => {
      const bucket = makeBucket(() => START);
      return {
        evidence: new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START }),
        change: () => [...bucket.objects.values()].forEach((object) => void (object.body += ' ')),
      };
    },
    reason: 'has been changed: its text no longer matches its hash',
  },
  {
    name: 'an object of the bucket is lost',
    store: () => {
      const bucket = makeBucket(() => START);
      return { evidence: new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START }), change: () => bucket.objects.clear() };
    },
    reason: 'no evidence is stored for',
  },
  {
    name: 'the record of an object of the bucket is changed',
    store: () => {
      const bucket = makeBucket(() => START);
      return {
        evidence: new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START }),
        change: () => [...bucket.objects.values()].forEach((object) => void (object.headers['x-amz-meta-tier'] = '7')),
      };
    },
    reason: 'the record of the evidence',
  },
  {
    name: 'a store that does not check what it holds gives back another text',
    store: (made) => {
      const store = watched(new LocalEvidenceStore(made.config.evidenceDir));
      return { evidence: store, change: () => store.lie('The FX-1 weighs 38 kg and ships free.') };
    },
    reason: 'is not the text that was fetched: the store gave back another text',
  },
];

/** The clean story, run with a store that is changed when Fetch is done (or not changed, for the control). */
async function storeRun(fault: StoreFault, changed: boolean) {
  const made = setupRun(scratch, { fake: told({ verify: [clearingVerifier], revisions: [] }) });
  const { evidence, change } = fault.store(made);
  const stages = {
    fetch: async (...args: Parameters<typeof runFetch>) => {
      const fetched = await runFetch(...args);
      if (changed) change();
      return fetched;
    },
  };
  return { ...made, result: await made.run({ evidence, stages }) };
}

describe.each(STORE_FAULTS.map((fault) => [fault.name, fault] as const))('the adversarial matrix: the evidence store, %s, between Fetch and Extract', (_name, fault) => {
  it('ends failed at the stage evidence, with what is wrong with the store as the reason, and not published', async () => {
    const { result } = await storeRun(fault, true);
    expect(result.outcome).toBe('failed');
    expect(result.stage).toBe('evidence');
    expect(result.reason).toContain(fault.reason);
    expect(result.slug).toBeNull();
  });

  it('does not ask the model to take a claim from the page: only Select was asked', async () => {
    const { fake } = await storeRun(fault, true);
    expect(fake.calls.map((call) => call.role)).toEqual(['select']);
  });

  it('puts nothing into the pages of the site, and makes one commit, of the desk state alone, that says that the run failed, with no hold', async () => {
    const { repoDir, git } = await storeRun(fault, true);
    expect(contentOf(repoDir)).toEqual(EMPTY_CONTENT);
    expect(git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.lastRun).toMatchObject({ outcome: 'failed', slug: null });
    expect(state.holds).toEqual([]);
  });

  it('is only stopped for the change: the same run with nothing changed is published', async () => {
    const { result, repoDir } = await storeRun(fault, false);
    expect(result.outcome).toBe('published');
    expect(contentOf(repoDir)).toHaveLength(4);
  });
});

describe('the adversarial matrix: the evidence store', () => {
  it('has a scenario for a changed page, a lost page, a lost record and a store that lies, for the folder and for the bucket, each with its own name', () => {
    expect(new Set(STORE_FAULTS.map((fault) => fault.name)).size).toBe(STORE_FAULTS.length);
    expect(STORE_FAULTS.length).toBeGreaterThanOrEqual(7);
    expect(STORE_FAULTS.map((fault) => fault.reason)).toEqual(expect.arrayContaining(['has been changed: its text no longer matches its hash', 'no evidence is stored for', 'has no record of where it came from']));
  });
});
```

- [ ] **Step 2: Run the tests**

The README has no such section yet.

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `the README has no section "The evidence store"`

The scenarios of the matrix describe what Task 20 built, so they pass the first time. Step 5 shows that they can fail.

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts -t "the evidence store"`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the README**

**In `README.md`, replace:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk; the bucket is not built), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (not built) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace
```

**with:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk unless a file of settings asks for the bucket, which is built and tested against a stand-in that checks every signature, and has never been used against Cloudflare), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (not built) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace
```

**In `README.md`, replace:**
```markdown
`desk/` (`@robywire/desk`) is the pipeline that will write the site. It is built and tested with no network and no API key: every test runs on made-up pages and a scripted model. `desk/test/setup/no-network.ts` runs before every test file and makes `fetch`, `net.connect`, `http.request` and `https.request` (and the lookup of a name) throw "network is not available in tests", so that a test that forgets to give the code a stand-in for the web fails at once and says what it tried to do. The guard is a safety net and not a proof: a test that started a child process that connects, or loaded a native module, could get through it. What keeps the tests offline is that each one gives the code its own stand-in.

- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, and holds every value's normalised form and unit to its raw text, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit on `main`: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. A held piece that is sent to the owner also has one commit, of its two files, on a branch of its own (see Holds and corrections). Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, the private evidence bucket, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**with:**
```markdown
`desk/` (`@robywire/desk`) is the pipeline that will write the site. It is built and tested with no network and no API key: every test runs on made-up pages and a scripted model. `desk/test/setup/no-network.ts` runs before every test file and makes `fetch`, `net.connect`, `http.request` and `https.request` (and the lookup of a name) throw "network is not available in tests", so that a test that forgets to give the code a stand-in for the web fails at once and says what it tried to do. The guard is a safety net and not a proof: a test that started a child process that connects, or loaded a native module, could get through it. What keeps the tests offline is that each one gives the code its own stand-in.

- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, the folders `runs/` and `evidence/`, and which evidence store a run keeps its snapshots in (`evidence.kind`: a folder or a bucket). `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, and holds every value's normalised form and unit to its raw text, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json` (which says how the run was made: which client answered the model, where the stories came from, and which try of its day it was), and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in the evidence store (see The evidence store): the folder `evidence/`, unless the settings say a bucket. A run takes a lock. A day that published, was held or found no story is not run again unless `--force-new` says so; a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise, and the run after the last is refused); and the folder of an earlier run is kept beside the new one, as `runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed. Every run that is not dry makes exactly one commit on `main`: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. A held piece that is sent to the owner also has one commit, of its two files, on a branch of its own (see Holds and corrections). Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown
- `npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]` records a correction (the default) or a retraction of a piece that is on the site, and commits it (see Holds and corrections).

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.
```

**with:**
```markdown
- `npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]` records a correction (the default) or a retraction of a piece that is on the site, and commits it (see Holds and corrections).

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store (see The evidence store); the address, the name and the keys of a bucket are not settings, and a file that carries one is refused like any other setting that does not exist. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.
```

**In `README.md`, replace:**
```markdown
**A piece that is published and wrong is corrected in public, and never deleted.** `npm run desk -- retract <slug> --reason <text>` adds a record `{ at, slug, kind, note }` to the corrections of the desk state, sets `updatedAt` in the frontmatter of the piece to the UTC day of the record (the site refuses to build a piece whose `updatedAt` is not the day of its latest correction, and one that has a record and no `updatedAt`), and commits the two files in one commit. `--kind retraction` records a retraction; `--dry` says what would be done and writes nothing. The reason is one line of at most 500 characters (white space is made one space, control characters are refused), and it goes into the desk state as the note and nowhere else: not into the piece, not into the ledger, not into the message of the commit. The rest of the piece is the same, byte for byte, and its ledger is not touched. A second record on the same day changes only the desk state. The command refuses a slug that is not on the site (a piece that was held is on its pull request until you merge it), a piece or a desk state with uncommitted changes, and a clock that is before the day the piece was published or before an earlier record of the same piece. It does not push or deploy: the notice reaches readers when the commit reaches `main` and the site is built.

## The verifier evals

```

**with:**
```markdown
**A piece that is published and wrong is corrected in public, and never deleted.** `npm run desk -- retract <slug> --reason <text>` adds a record `{ at, slug, kind, note }` to the corrections of the desk state, sets `updatedAt` in the frontmatter of the piece to the UTC day of the record (the site refuses to build a piece whose `updatedAt` is not the day of its latest correction, and one that has a record and no `updatedAt`), and commits the two files in one commit. `--kind retraction` records a retraction; `--dry` says what would be done and writes nothing. The reason is one line of at most 500 characters (white space is made one space, control characters are refused), and it goes into the desk state as the note and nowhere else: not into the piece, not into the ledger, not into the message of the commit. The rest of the piece is the same, byte for byte, and its ledger is not touched. A second record on the same day changes only the desk state. The command refuses a slug that is not on the site (a piece that was held is on its pull request until you merge it), a piece or a desk state with uncommitted changes, and a clock that is before the day the piece was published or before an earlier record of the same piece. It does not push or deploy: the notice reaches readers when the commit reaches `main` and the site is built.

## The evidence store

**What is kept.** Every page that a run reads is kept as a **snapshot**: the text of the page, named by its SHA-256, with where it came from (the address that was asked for, the address after the redirects, whether the source is tier 1 or tier 2, and when it was fetched). A claim of a piece points at a snapshot by its hash, so anyone who has the text can check that it is the text that the claim was taken from. A snapshot is never changed: putting a text that is kept already changes nothing, and a snapshot whose text no longer matches its hash is refused when it is read back, which is worse than one that is missing.

**Where.** The setting `evidence.kind` of a file of settings (`--config`) chooses the store. `local`, the default, is a folder (`evidenceDir`, `evidence/`, which git ignores): two files for each snapshot, `<hash>.txt` and `<hash>.json`, and the snapshots that were kept in a folder `published` below it. The folder is gone when a machine that starts from a fresh checkout every day ends its job, so a workflow uses the other kind. `r2` is a **private bucket on Cloudflare R2**, reached through its S3-compatible interface: `desk/src/run/r2-evidence.ts` makes the requests (a `PUT`, a `GET` or a `HEAD` of one object, at the address `<endpoint>/<bucket>/<key>`), and `desk/src/run/sigv4.ts` signs every one of them, with AWS Signature Version 4 written with `node:crypto`, each step of which is tested against the worked examples that Amazon publishes. No package was added.

**Which variables.** A bucket is described by four variables of the environment and by nothing else: `R2_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`, with no path), `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. They are never read from a file of settings, because a file of settings is committed (a file that carries one is refused as a setting that does not exist), and there is no flag to choose the store: the settings decide. A run that asks for `r2` and does not have all four is refused with exit code 2, naming the ones that are missing and never what any of them holds, and a value that the store refuses (an address that is not https, a name that is not a bucket name, a key that cannot sign) is refused the same way. No message, log, record or artifact of the Desk has a key in it: the secret is used to sign and nowhere else, and every message of the store has both keys taken out of it. `--sources fixtures`, the made-up world, is refused with `r2`: nothing made up may be put in the bucket.

**What is written.** Two kinds of object, and nothing else:

| Key | What it is | Written when | Removed |
|---|---|---|---|
| `pending/<hash>` | The text of a page that a run fetched, with where it came from as the metadata of the object | Fetch, for every page, in every run, dry or not | By the bucket, 90 days after it was written (a rule on the prefix, set when the bucket is made) |
| `published/<hash>` | The same, for a snapshot that a published piece cites | Publish, before the piece is written, for each source of its ledger | Never |

`<hash>` is 64 lowercase hex characters. A piece that is held, a day with no story and a run that fails leave their snapshots in `pending/` only, and a dry run puts and reads but never keeps. Reading and asking look in `pending/` and then in `published/`, so a snapshot that was kept can still be read after its first copy has expired.

**What a run does with it.** Fetch puts each page. Before Extract takes a word from a page, the run reads every snapshot back (the stage `evidence`): the text must be the one that was fetched, and a store that has lost or changed it ends the run. Publish keeps the snapshots that the piece cites before it writes the piece. A store that cannot be reached, that refuses, or that holds what has been changed, at any of the three, ends the run `failed` at the stage `fetch`, `evidence` or `publish`, with nothing published; the next try of the day (up to `maxAttemptsPerDay`) is the retry. The error says what kind of trouble it is: `unreachable` (no answer, a 408, a 429, a 5xx, a redirect), `denied` (a 401, a 403, any other refusal), `tampered` (the text does not match its hash, or its record is not valid) or `missing`.

**Who can read it.** The bucket is private: no public access, no `r2.dev` address and no custom domain are set on it, and the Desk never sends an access-control header, so every object has what the bucket gives by default. A snapshot can be read by the holder of a key that the bucket takes, which is the token that the Desk signs with (limited to this bucket) and the owner of the Cloudflare account, and by no one else. The text of a page never leaves the bucket: the repository has the hash of each snapshot and a short quotation of each claim (at most 300 characters), and what a workflow uploads as an artifact must not have page text, because the artifacts of a public repository are public.

**How the bucket is made.** The runbook makes it, once, outside this plan: a bucket that is private; a rule that deletes the objects of the prefix `pending/` 90 days after they were written (and none for `published/`); an API token that may read and write objects, limited to this bucket; and the four variables set as secrets of the workflow. The store is built and tested with no bucket and no network: every test gives it a bucket made of memory that answers as S3 does and refuses a request whose signature it cannot check. It has never been used against Cloudflare, so what R2 answers to a real request is for the first real run to confirm.

## The verifier evals

```

**In `README.md`, replace:**
```markdown
- **The headline in a pull request.** The title of a hold's pull request is `Held: ` and the headline that the model wrote, on one line and cut at 100 characters. It is passed to `gh` as one argument and is never run, but it is shown on GitHub as it is written, and GitHub may turn a `#12` in it into a link to that issue or pull request. The text of the pull request has everything a model wrote in fenced blocks; the title is the one place where it is not.
- **A branch with no pull request.** A branch that was pushed when the pull request could not be opened stays on the remote (the Desk removes only its own copy). The error says its name; delete it or open the pull request from it by hand. Pushing it again the same day, for the same slug, is refused by git as a push that is not a fast-forward.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

**with:**
```markdown
- **The headline in a pull request.** The title of a hold's pull request is `Held: ` and the headline that the model wrote, on one line and cut at 100 characters. It is passed to `gh` as one argument and is never run, but it is shown on GitHub as it is written, and GitHub may turn a `#12` in it into a link to that issue or pull request. The text of the pull request has everything a model wrote in fenced blocks; the title is the one place where it is not.
- **A branch with no pull request.** A branch that was pushed when the pull request could not be opened stays on the remote (the Desk removes only its own copy). The error says its name; delete it or open the pull request from it by hand. Pushing it again the same day, for the same slug, is refused by git as a push that is not a fast-forward.
- **Evidence of a piece that the owner releases.** Only a run that publishes keeps snapshots. A piece that the owner publishes by merging the pull request of a hold is published by GitHub, so nothing keeps its snapshots: they are in `pending/`, and the bucket removes them 90 days after they were written. Merge a hold within 90 days, or keep the snapshots by hand; a command that keeps the snapshots that a piece on the site cites is not built.
- **The store does not retry.** A request to the bucket that fails once fails the run. A day that failed is tried again by the schedule (up to `maxAttemptsPerDay` runs a day), but a bucket that is down for hours fails every try.
- **Copies of snapshots of a piece that was not published.** Publish keeps the snapshots before it writes the piece. If the commit then fails, the copies in `published/` stay, though the piece was not published: each is a copy of a text that is in `pending/` anyway.
- **A record that is too long.** The record of a snapshot is the metadata of its object, and S3 takes 2 KB of metadata. A page whose address is so long that its record does not fit (roughly 1,500 characters of address, fewer when the address after the redirects is another one) fails the run at Fetch.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts test/adversarial.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' README.md desk/test/readme.test.ts desk/test/adversarial.test.ts`
Expected: PASS — prints nothing

- [ ] **Step 5: Show that the matrix can fail**

The run reads every snapshot back before Extract, and the one line that says so is in the orchestrator. Take it out, and the scenarios must fail: Extract is then given the text that was fetched, whatever the store has become, and the story is published although the store holds something else.

Run: `node -e "const fs=require('fs');const f='desk/src/run/orchestrate.ts';const t=fs.readFileSync(f,'utf8');const from='await confirmSnapshots(ctx, fetched.snapshots);';if(!t.includes(from))throw new Error('not found');fs.writeFileSync(f,t.replace(from,''))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/adversarial.test.ts -t "the evidence store"`
Expected: FAIL — `ends failed at the stage evidence`

Put it back.

Run: `git checkout -- desk/src/run/orchestrate.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

- [ ] **Step 6: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 7: Commit**

```bash
git add README.md desk/test/adversarial.test.ts desk/test/readme.test.ts
git commit -m "docs(desk): the README says what the evidence store keeps, where, for how long, who can read it, which variables describe a bucket and how the bucket is made, and its four new limits, with a test that keeps it true; the adversarial matrix gains the store that changes or loses a snapshot, or gives back another text, between Fetch and Extract, which ends the run failed at the stage evidence with nothing published" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Every key that the store writes, and who can read it

**Files:**
- Create: `desk/test/evidence-objects.test.ts`

Tasks 17 to 21 built a store, and a person who is about to make the bucket, and an agent that has to write the workflow that uses it, needs to know in one place what the Desk puts into it. This task writes that once, as the tables below, and makes the first one a test: every row is made by a real run of the pipeline in the made-up world, over a bucket made of memory that checks the signature of every request, and the test reads which keys the run left and says it in the words of the table.

**Every object that the Desk ever writes**, and who can read it:

| Key | Written by | When | Who can read it | Removed |
|---|---|---|---|---|
| `pending/<hash>` | `R2EvidenceStore.put` | Fetch, for every page that a run fetches, in every run (dry or not) | The holder of a key that the bucket takes: the token that the Desk signs with (limited to this bucket) and the owner of the Cloudflare account. The run itself reads it back before Extract; `desk replay` reads it on any machine that has the four variables | By the bucket, 90 days after it was written (a rule on the prefix, made by the runbook) |
| `published/<hash>` | `R2EvidenceStore.keep` | Publish, before the piece is written, once for each source of its ledger; never for a dry run | The same | Never |

`<hash>` is the SHA-256 of the text, 64 lowercase hex characters. **No other key is ever written.** Each object has the text of a page as its body and, as its metadata, the address, the tier and the time (and the address after the redirects when it is another one): nothing that is secret. The Desk reads with `GET` and `HEAD`, writes with `PUT`, and never lists and never deletes (it does not even have the code to). Every request is signed, so every read and every write is by the holder of the key, and the Desk never sends an access-control header, so an object is as private as the bucket is: **the bucket must have no public access, no `r2.dev` address and no custom domain**, which is what the runbook sets and what no test of this repository can check.

**What each way for a run to end leaves** (the rows of the test):

| Outcome | `pending/<hash>` | `published/<hash>` |
|---|---|---|
| published | both pages | the pages that the piece cites, which are the sources of its ledger |
| held | both pages | none |
| no story, because Select chooses none | none: nothing was fetched | none |
| no story, because Extract keeps too few claims | both pages | none |
| failed after Fetch | both pages | none |
| failed, because the bucket cannot keep | both pages | none, and no piece is written |
| a dry run | both pages | none |
| the next try of a day that failed | nothing is written again | the pages that the piece cites |

**What these tables do not say, and the next parts must.** The workflow that runs the Desk has to give the run a file of settings that says `evidence: { kind: r2 }`, and the four variables `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from the secrets of the repository; without them the run is refused with exit code 2 before it asks a model anything. It must not upload the folder `evidence/` (with the bucket there is none) and must not upload page text. A hold that the owner releases by merging a pull request is published by GitHub, and nothing keeps its snapshots: they expire in `pending/` 90 days after the run. And the store has never been used against Cloudflare: what R2 answers to a real signed request (above all to `PUT` with metadata headers, to `HEAD`, and to an answer with no body) is for the first real run to confirm.

**The names that later parts use.** In `desk/src/run/sigv4.ts` (exported from the package): `signRequest({ method, url, headers, body, region, service, accessKeyId, secretAccessKey, now })` giving every header to send, and the five steps of it: `canonicalRequest`, `stringToSign`, `signingKey`, `signatureOf`, and `hashBody`, `amzDate`, `credentialScope`, `canonicalUri`, `canonicalQueryString`, `signedHeaders`, `SIGNING_ALGORITHM`. In `desk/src/run/evidence.ts`: `EvidenceStore` with `put`, `get`, `has` and `keep(hash)`, `LocalEvidenceStore` (which keeps in the folder `published` below its own), `EvidenceError` with `kind` (`unreachable`, `denied`, `tampered` or `missing`), `EVIDENCE_ERROR_KINDS`, `KEPT_FOLDER`. In `desk/src/run/r2-evidence.ts`: `R2EvidenceStore({ endpoint, bucket, accessKeyId, secretAccessKey, transport?, now?, timeoutMs? })`, `StoreTransport`, `StoreRequest`, `R2Options`, `PENDING_PREFIX`, `PUBLISHED_PREFIX`. In `desk/src/run/evidence-factory.ts`: `makeEvidenceStore(config, env, deps)`, `R2_VARIABLES`, `EvidenceDeps`. In `desk/src/config.ts`: the setting `evidence: { kind }`, `EVIDENCE_KINDS`. `CliDeps.evidenceTransport`. In `desk/src/stages/fetch.ts` (a stage file, not exported from the package): `confirmSnapshots(ctx, snapshots)`; `PublishResult.kept`. The stages that a run can end at because of the store: `fetch`, `evidence`, `publish`.

- [ ] **Step 1: Write the test**

**Create `desk/test/evidence-objects.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoClient } from '../src/demo/story';
import { DEMO_URLS } from '../src/demo/world';
import { extractPage } from '../src/fetch/extract-text';
import { FakeClient } from '../src/model/fake';
import { clientFromConfig } from '../src/model/factory';
import { sha256Hex } from '../src/model/types';
import { R2EvidenceStore } from '../src/run/r2-evidence';
import { sitePaths } from '../src/run/target';
import { FAKE_R2, makeBucket } from './support/bucket';
import type { Bucket } from './support/bucket';
import { useScratch } from './support/context';
import { fixtureText } from './support/fixtures';
import { START, clock, setupRun, unentailed } from './support/run';
import type { RunSetup } from './support/run';

// What each way for a run to end leaves in the bucket, and which keys the store ever writes. This is the table that the owner needs in order to know what is in the bucket
// after a run, and who can read it, and each row is made by a real run of the pipeline over a bucket made of memory that checks the signature of every request:
//
//   | Outcome                                  | pending/<hash>             | published/<hash>                                   |
//   |------------------------------------------|----------------------------|----------------------------------------------------|
//   | published                                | both pages                 | the pages that the piece cites (its ledger)        |
//   | held                                     | both pages                 | none                                               |
//   | no story, Select chooses none            | none (nothing was fetched) | none                                               |
//   | no story, Extract keeps too few claims   | both pages                 | none                                               |
//   | failed after Fetch                       | both pages                 | none                                               |
//   | failed, the bucket cannot keep           | both pages                 | none (and no piece is written)                     |
//   | a dry run                                | both pages                 | none                                               |
//   | the next try of a day that failed        | nothing is written again   | the pages that the piece cites                     |
//
//   Every key is `pending/` or `published/` and the hash of a text (64 lowercase hex characters). No other key is ever written.
//   The Desk reads with GET and HEAD, writes with PUT, and never lists and never deletes. Every request is signed, so it is a holder of the key that reads and writes.
//   Who may read an object: the holder of a key that the bucket takes (the token that the Desk signs with, limited to the bucket, and the owner of the Cloudflare account) and no one else:
//   the Desk never makes an object public (no access-control header is ever sent), and the bucket has no public address (the runbook).

const scratch = useScratch();
const KEY = /^(pending|published)\/[0-9a-f]{64}$/;

const releaseText = extractPage(fixtureText('pages/fixture-robotics-fx-1-second-plant.html'), DEMO_URLS.release).text;
const articleText = extractPage(fixtureText('pages/mercer-wire-fx-1-second-plant.html'), DEMO_URLS.mercerArticle).text;
const RELEASE = sha256Hex(releaseText);
const ARTICLE = sha256Hex(articleText);
const BOTH = [`pending/${ARTICLE}`, `pending/${RELEASE}`].sort();

/** A run of the made-up day with the bucket made of memory for its evidence store. */
async function ranInBucket(options: RunSetup = {}, prepare: (bucket: Bucket) => void = () => undefined) {
  const made = setupRun(scratch, options);
  const bucket = makeBucket(() => START);
  prepare(bucket);
  const store = new R2EvidenceStore({ ...FAKE_R2, transport: bucket.transport, now: () => START });
  const result = await made.run({ evidence: store });
  return { made, bucket, store, result };
}

/** The keys of the bucket with a prefix, sorted. */
const keysOf = (bucket: Bucket, prefix: string): string[] => [...bucket.objects.keys()].filter((key) => key.startsWith(prefix)).sort();

/** The hashes of the pages that the ledger of a published piece cites. */
function citedBy(made: ReturnType<typeof setupRun>, slug: string): string[] {
  const ledger = JSON.parse(readFileSync(path.join(made.repoDir, sitePaths().ledgerFile(slug)), 'utf8')) as { sources: { snapshotHash: string }[] };
  return ledger.sources.map((source) => source.snapshotHash);
}

describe('what each outcome leaves in the bucket', () => {
  it('published: both pages in pending/, and in published/ the pages that the piece cites, which are the sources of its ledger', async () => {
    const { made, bucket, result } = await ranInBucket();
    expect(result.outcome).toBe('published');
    const cited = citedBy(made, result.slug as string);
    expect(cited).toEqual([RELEASE]);
    expect(keysOf(bucket, 'pending/')).toEqual(BOTH);
    expect(keysOf(bucket, 'published/')).toEqual([`published/${RELEASE}`]);
    expect(bucket.objects.get(`published/${RELEASE}`)?.body).toBe(releaseText);
    expect(bucket.objects.get(`pending/${ARTICLE}`)?.body).toBe(articleText);
  });

  it('held: both pages in pending/ and nothing in published/', async () => {
    const { bucket, result } = await ranInBucket({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, []]);
  });

  it('no story because Select chooses none: nothing is fetched, so nothing is in the bucket and the bucket is not asked anything', async () => {
    const { bucket, result } = await ranInBucket({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] }) });
    expect(result.outcome).toBe('no-story');
    expect(bucket.calls).toEqual([]);
  });

  it('no story because Extract keeps too few claims: both pages in pending/ and nothing in published/', async () => {
    const { bucket, result } = await ranInBucket({ config: { minClaims: 99 } });
    expect([result.outcome, result.stage]).toEqual(['no-story', 'extract']);
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, []]);
  });

  it('failed after Fetch: both pages in pending/ and nothing in published/', async () => {
    const { bucket, result } = await ranInBucket({
      stages: {
        compose: async () => {
          throw new Error('the composer fell over');
        },
      },
    });
    expect([result.outcome, result.stage]).toEqual(['failed', 'compose']);
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, []]);
  });

  it('failed because the bucket cannot keep: both pages in pending/, nothing in published/, and no piece is written', async () => {
    const { made, bucket, result } = await ranInBucket({}, (given) => given.fail({ status: 503, body: 'Service Unavailable' }, { method: 'PUT', key: 'published/' }));
    expect([result.outcome, result.stage]).toEqual(['failed', 'publish']);
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, []]);
    expect(made.git.commits.map((commit) => commit.paths)).toEqual([[sitePaths().stateFile]]);
  });

  it('a dry run: both pages in pending/, so that the run can be replayed, and nothing in published/', async () => {
    const { bucket, result } = await ranInBucket({ dry: true });
    expect([result.outcome, result.dry]).toEqual(['published', true]);
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, []]);
  });

  it('the next try of a day that failed: the pages that are in pending/ are not written again, and the piece is published with its pages kept', async () => {
    const { made, bucket, store, result } = await ranInBucket({}, (given) => given.fail({ status: 503 }, { method: 'PUT', key: 'published/' }));
    expect([result.outcome, result.stage]).toEqual(['failed', 'publish']);
    expect(keysOf(bucket, 'published/')).toEqual([]);
    const before = bucket.calls.length;
    const second = await made.run({ evidence: store, model: clientFromConfig(made.config, { kind: 'fake', fake: demoClient() }, {}), now: clock() });
    expect([second.outcome, second.attempt]).toEqual(['published', 2]);
    expect(bucket.calls.slice(before).filter((call) => call.method === 'PUT').map((call) => call.key)).toEqual([`published/${RELEASE}`]);
    expect([keysOf(bucket, 'pending/'), keysOf(bucket, 'published/')]).toEqual([BOTH, [`published/${RELEASE}`]]);
  });

  it('writes no key that is not pending/ or published/ and a hash, in any of these runs, and reads with GET and HEAD, writes with PUT, and nothing else: no list and no delete', async () => {
    const runs = await Promise.all([ranInBucket(), ranInBucket({ fake: unentailed() }), ranInBucket({ dry: true }), ranInBucket({ config: { minClaims: 99 } })]);
    for (const { bucket } of runs) {
      expect(bucket.objects.size).toBeGreaterThan(0);
      for (const key of bucket.objects.keys()) expect(key, key).toMatch(KEY);
      for (const call of bucket.calls) {
        expect(['GET', 'HEAD', 'PUT'], `${call.method} ${call.key}`).toContain(call.method);
        expect(call.key, call.key).toMatch(KEY);
        expect(new URL(call.url).search, call.url).toBe('');
        expect(new URL(call.url).pathname.startsWith(`/${FAKE_R2.bucket}/`), call.url).toBe(true);
      }
    }
  });

  it('signs every request, and never sends an access-control header, so that an object is as private as the bucket is', async () => {
    const { bucket } = await ranInBucket();
    expect(bucket.calls.length).toBeGreaterThan(5);
    for (const call of bucket.calls) {
      expect(call.headers.authorization, call.key).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
      expect(Object.keys(call.headers).filter((name) => name.startsWith('x-amz-acl') || name.startsWith('x-amz-grant')), call.key).toEqual([]);
      expect([200, 404], `${call.method} ${call.key}`).toContain(call.status);
    }
  });

  it('puts the same record on every object, and nothing else in it that is secret: the address, the tier and the time, in headers', async () => {
    const { bucket } = await ranInBucket();
    for (const object of bucket.objects.values()) {
      expect(Object.keys(object.headers).sort()).toEqual(['content-type', 'x-amz-meta-retrieved-at', 'x-amz-meta-tier', 'x-amz-meta-url']);
      expect(JSON.stringify(object.headers)).not.toContain(FAKE_R2.secretAccessKey);
    }
  });
});
```

- [ ] **Step 2: Run the test**

This test describes what Tasks 17 to 21 built, so it passes the first time. Step 3 shows that it can fail.

Run: `npm test --workspace @robywire/desk -- test/evidence-objects.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Show that it can fail**

A dry run keeps nothing, and the one expression that says so is in Publish. Take it out, and the row of the dry run must fail: the dry run would then keep the page that its piece cites.

Run: `node -e "const fs=require('fs');const f='desk/src/stages/publish.ts';const t=fs.readFileSync(f,'utf8');const from='target.dry ? [] : ';if(!t.includes(from))throw new Error('not found');fs.writeFileSync(f,t.replace(from,''))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/evidence-objects.test.ts`
Expected: FAIL — `a dry run`

Put it back.

Run: `git checkout -- desk/src/stages/publish.ts`
Expected: PASS — prints nothing

Run: `git status --short -- desk/src`
Expected: PASS — prints nothing

- [ ] **Step 4: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 5: Run everything that the repository checks**

This part changed the Desk and the README and nothing in the site, so the builds and the audits are as they were; they run all the same, because `npm run verify` is the one command that says that the repository as a whole is in order.

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. The lines of the output that matter, in the order they appear, as they were when this part was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the repository after this task and change when a test is added:

```text
Result (101 files):
- 0 errors

Test Files  35 passed (35)
Tests  2221 passed (2221)
Test Files  6 passed (6)
Tests  253 passed (253)
Test Files  38 passed (38)
Tests  1271 passed (1271)
Test Files  72 passed (72)
Tests  3274 passed (3274)

61 of 61 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

extract: 7 claims proposed, 7 kept, 0 dropped
compose: the gate says publish (0 failures, 0 hold reasons)
verify: the model check passed
verify: round 0: the gate says publish, the model check passed
outcome: published
dry run: nothing was written to the site or to git (3 files would have been)
04-extract: equal
05-compose: equal
06-verify: equal
replay: equal
desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality

Passed: 18 checks.   (audit:prod)
Passed: 17 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

- [ ] **Step 6: Commit**

```bash
git add desk/test/evidence-objects.test.ts
git commit -m "test(desk): what each way for a run to end leaves in the bucket, and which keys the store ever writes and how, as a table that real runs make over a bucket that checks every signature: published, held, no story, failed after Fetch, failed because the bucket cannot keep, a dry run, and the next try of a day that failed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing
