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

/**
 * Where snapshots are kept. A folder on disk is `LocalEvidenceStore`; a bucket in the cloud will be another
 * implementation (a later plan). A store that cannot be reached throws, which fails the run: the Desk never
 * goes on without the evidence it will cite.
 */
export interface EvidenceStore {
  /** Keep a text and where it came from; returns its hash. Putting a text that is already kept changes nothing. */
  put(text: string, meta: EvidenceMeta): Promise<{ hash: string }>;
  /** The text and its record. Throws if the hash is not stored, or the text no longer matches the hash. */
  get(hash: string): Promise<{ text: string; meta: EvidenceMeta }>;
  has(hash: string): Promise<boolean>;
}

const HASH = /^[0-9a-f]{64}$/;

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

/** Snapshots in a folder: `<hash>.txt` is the text and `<hash>.json` the record of where it came from. */
export class LocalEvidenceStore implements EvidenceStore {
  constructor(private readonly dir: string) {}

  private textFile(hash: string): string {
    return path.join(this.dir, `${hash}.txt`);
  }

  private metaFile(hash: string): string {
    return path.join(this.dir, `${hash}.json`);
  }

  async put(text: string, meta: EvidenceMeta): Promise<{ hash: string }> {
    const parsed = EvidenceMeta.safeParse(meta);
    if (!parsed.success) throw new Error(`the record of the evidence is not valid: ${describeIssues(parsed.error)}`);
    const hash = sha256Hex(text);
    // A snapshot that is there is left exactly as it is, and its first record stays. Only one that is missing a file is written.
    if (await this.has(hash)) return { hash };
    await writeFileAtomic(this.textFile(hash), text);
    await writeFileAtomic(this.metaFile(hash), `${JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2)}\n`);
    return { hash };
  }

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
    let data: unknown;
    try {
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
