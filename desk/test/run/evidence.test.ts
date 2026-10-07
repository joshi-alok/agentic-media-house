import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/model/types';
import { EVIDENCE_ERROR_KINDS, EvidenceError, KEPT_FOLDER, LocalEvidenceStore } from '../../src/run/evidence';
import type { EvidenceErrorKind, EvidenceMeta, EvidenceStore } from '../../src/run/evidence';

// The evidence store keeps what the Desk read: the text of each page, named by its SHA-256. A claim of a
// piece points at a snapshot by that hash, so a snapshot that has changed is worse than one that is
// missing. Reading one back checks the hash, and a text that no longer matches is refused. A snapshot that a published piece cites is kept, in a folder of its own,
// and stays when the folder of the others is cleaned out.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-evidence-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** The path of a folder that does not exist yet. */
const freshDir = (): string => path.join(scratch, `evidence-${++counter}`, 'snapshots');

const META: EvidenceMeta = {
  url: 'https://fixture-robotics.example/news/fx-1-second-plant',
  finalUrl: 'https://fixture-robotics.example/news/fx-1-second-plant',
  tier: 1,
  retrievedAt: '2026-10-05T04:31:00.000Z',
};
const TEXT = 'Fixture Robotics has begun shipping FX-1 warehouse arms.\nThe FX-1 mounts on existing conveyor frames.';
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
    const store = new LocalEvidenceStore(freshDir());
    expect(await store.put('hello', META)).toEqual({ hash: HELLO_HASH });
    expect((await store.put(TEXT, META)).hash).toBe(sha256Hex(TEXT));
  });

  it('keeps the text in a file named by the hash, exactly as it is', async () => {
    const dir = freshDir();
    const { hash } = await new LocalEvidenceStore(dir).put(TEXT, META);
    expect(readFileSync(path.join(dir, `${hash}.txt`), 'utf8')).toBe(TEXT);
  });

  it('keeps where the text came from in a sidecar file, as JSON with sorted keys and a final newline', async () => {
    const dir = freshDir();
    const { hash } = await new LocalEvidenceStore(dir).put(TEXT, META);
    expect(readFileSync(path.join(dir, `${hash}.json`), 'utf8')).toBe(
      [
        '{',
        '  "finalUrl": "https://fixture-robotics.example/news/fx-1-second-plant",',
        '  "retrievedAt": "2026-10-05T04:31:00.000Z",',
        '  "tier": 1,',
        '  "url": "https://fixture-robotics.example/news/fx-1-second-plant"',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('creates the folder, and the folders above it', async () => {
    const dir = freshDir();
    await new LocalEvidenceStore(dir).put('x', META);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('keeps two texts under two hashes', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const a = await store.put('first text', META);
    const b = await store.put('second text', META);
    expect(a.hash).not.toBe(b.hash);
    expect(readdirSync(dir)).toHaveLength(4);
  });

  it('does nothing when the same text is put again: the files are not written again and the first record stays', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const first = await store.put(TEXT, META);
    const before = readdirSync(dir).map((name) => [name, statSync(path.join(dir, name)).ino]);
    const second = await store.put(TEXT, { ...META, url: 'https://mercer-wire.example/robotics/other', finalUrl: 'https://mercer-wire.example/robotics/other', tier: 2 });
    expect(second).toEqual(first);
    expect(readdirSync(dir).map((name) => [name, statSync(path.join(dir, name)).ino])).toEqual(before);
    expect((await store.get(first.hash)).meta).toEqual(META);
  });

  it('puts two snapshots that are the same text at once without trouble', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const results = await Promise.all([store.put(TEXT, META), store.put(TEXT, META), store.put(TEXT, META)]);
    expect(new Set(results.map((result) => result.hash)).size).toBe(1);
    expect(readdirSync(dir)).toHaveLength(2);
    expect((await store.get(results[0]!.hash)).text).toBe(TEXT);
  });

  it('completes a snapshot that was only half written, when the same text is put again', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    unlinkSync(path.join(dir, `${hash}.json`));
    expect(await store.has(hash)).toBe(false);
    await store.put(TEXT, META);
    expect(await store.has(hash)).toBe(true);
    expect((await store.get(hash)).meta).toEqual(META);
  });

  it('refuses a record that is not valid, and writes nothing', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    await expect(store.put(TEXT, { ...META, tier: 3 } as unknown as EvidenceMeta)).rejects.toThrow('the record of the evidence is not valid: tier:');
    await expect(store.put(TEXT, { ...META, url: 'not a url' })).rejects.toThrow('url:');
    await expect(store.put(TEXT, { ...META, extra: 1 } as unknown as EvidenceMeta)).rejects.toThrow('Unrecognized key');
    expect(() => readdirSync(dir)).toThrow();
  });
});

describe('LocalEvidenceStore: get', () => {
  it('returns the text and the record', async () => {
    const store = new LocalEvidenceStore(freshDir());
    const { hash } = await store.put(TEXT, META);
    expect(await store.get(hash)).toEqual({ text: TEXT, meta: META });
  });

  it('returns text that is not ASCII exactly as it was put', async () => {
    const store = new LocalEvidenceStore(freshDir());
    const text = `caf${String.fromCharCode(0xe9)}\n${String.fromCharCode(0x6771)}${String.fromCharCode(0x4eac)}`;
    const { hash } = await store.put(text, META);
    expect((await store.get(hash)).text).toBe(text);
  });

  it('returns the empty text, which is a text', async () => {
    const store = new LocalEvidenceStore(freshDir());
    const { hash } = await store.put('', META);
    expect((await store.get(hash)).text).toBe('');
  });

  it('refuses a text that has been changed, and says so', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    writeFileSync(path.join(dir, `${hash}.txt`), TEXT.replace('FX-1', 'FX-2'));
    await expect(store.get(hash)).rejects.toThrow(`the evidence ${hash} has been changed: its text no longer matches its hash`);
    expect(await kindOf(store.get(hash))).toBe('tampered');
  });

  it.each([
    ['one character longer', (text: string) => `${text} `],
    ['one character shorter', (text: string) => text.slice(0, -1)],
    ['emptied', () => ''],
    ['with another line ending', (text: string) => text.replace('\n', '\r\n')],
  ])('refuses a text that is %s', async (_name, change) => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    writeFileSync(path.join(dir, `${hash}.txt`), change(TEXT));
    await expect(store.get(hash)).rejects.toThrow('has been changed');
  });

  it('says that nothing is stored for a hash that is not stored', async () => {
    const store = new LocalEvidenceStore(freshDir());
    const hash = sha256Hex('never stored');
    await expect(store.get(hash)).rejects.toThrow(`no evidence is stored for ${hash}`);
    expect(await kindOf(store.get(hash))).toBe('missing');
  });

  it('refuses a snapshot whose record is missing, or is not JSON, or is not a record', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    const { hash } = await store.put(TEXT, META);
    const sidecar = path.join(dir, `${hash}.json`);
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

  it.each(['', 'abc', '../../etc/passwd', 'A'.repeat(64), `${'a'.repeat(63)}g`, `${'a'.repeat(64)}.txt`, `${'a'.repeat(64)}/../x`])('refuses %j as a hash, without looking for a file', async (hash) => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    await expect(new LocalEvidenceStore(dir).get(hash)).rejects.toThrow('is not a snapshot hash: 64 lowercase hex characters');
  });
});

describe('LocalEvidenceStore: has', () => {
  it('says whether a snapshot is stored', async () => {
    const store = new LocalEvidenceStore(freshDir());
    const hash = sha256Hex(TEXT);
    expect(await store.has(hash)).toBe(false);
    await store.put(TEXT, META);
    expect(await store.has(hash)).toBe(true);
    expect(await store.has(sha256Hex('another text'))).toBe(false);
  });

  it('says no, and does not fail, for something that is not a hash', async () => {
    const store = new LocalEvidenceStore(freshDir());
    for (const hash of ['', 'abc', '../../etc/passwd', 'A'.repeat(64)]) expect(await store.has(hash)).toBe(false);
  });

  it('says no when the folder does not exist, and when only the text is there', async () => {
    const dir = freshDir();
    const store = new LocalEvidenceStore(dir);
    expect(await store.has(sha256Hex('x'))).toBe(false);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${sha256Hex('x')}.txt`), 'x');
    expect(await store.has(sha256Hex('x'))).toBe(false);
  });

  it('is a plain interface that anything can implement', async () => {
    const memory = new Map<string, { text: string; meta: EvidenceMeta }>();
    const store: EvidenceStore = {
      put: async (text, meta) => {
        memory.set(sha256Hex(text), { text, meta });
        return { hash: sha256Hex(text) };
      },
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
