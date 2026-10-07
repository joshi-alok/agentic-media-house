import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
import { writeFileAtomic } from './atomic';
import { FetchDocument } from './artifacts';

// Evidence is what the Desk read, kept as it was read. A snapshot is the text of a page, and its name is
// the SHA-256 of that text, so every claim of a piece can point at exactly the text it was taken from, and
// anyone can check that the text is still that text. Evidence is immutable: a snapshot is written once,
// and a snapshot that has changed is refused when it is read, which is worse than one that is missing.

/** Where a snapshot came from: what was asked for, where the redirects ended, how it counts (tier 1 or 2), and when. */
export const EvidenceMeta = FetchDocument.pick({ url: true, finalUrl: true, tier: true, retrievedAt: true });
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
export interface EvidenceStore {
  /** Keep a text and where it came from; returns its hash. Putting a text that is already kept changes nothing. */
  put(text: string, meta: EvidenceMeta): Promise<{ hash: string }>;
  /** The text and its record. Throws if the hash is not stored, or the text no longer matches the hash. */
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
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
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

  async put(text: string, meta: EvidenceMeta): Promise<{ hash: string }> {
    const parsed = EvidenceMeta.safeParse(meta);
    if (!parsed.success) throw new Error(`the record of the evidence is not valid: ${describeIssues(parsed.error)}`);
    const hash = sha256Hex(text);
    // A snapshot that is there is left exactly as it is, and its first record stays. Only one that is missing a file is written.
    if (await this.has(hash)) return { hash };
    await this.write(this.dir, hash, text, parsed.data);
    return { hash };
  }

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
    let data: unknown;
    try {
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
