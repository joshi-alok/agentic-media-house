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
