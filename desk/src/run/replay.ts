import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourcesRegistry } from '@robywire/gate';
import { FetchArtifact, FetchError, RecordedClient, SelectArtifact, readArtifact, readDeskState, readRunRecord } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
import type { StageContext } from '../stages/context';
import { runExtract } from '../stages/extract';
import type { Snapshot } from '../stages/fetch';
import { runVerify } from '../stages/verify';

// Replay: run the stages that read a model again, from what the run itself kept, and see whether the result is what the run wrote. A run keeps
// the pages it read (in the evidence store, named by their hash), the story that Select chose, and, when it is recorded, the replies of the model
// (cassettes). With those, Extract, Compose and Verify can be run again with no network and no model, and if the code, the prompts or the
// evidence have changed since the run, the result will differ, or the replay will say that a reply it needs was never recorded. A replay never writes
// into the folder of the run: it makes its artifacts in a folder of its own, compares them with the stored ones and removes it.

/** The artifacts that a replay makes again, in the order of the stages. */
export const REPLAYED = ['04-extract', '05-compose', '06-verify'] as const;

export interface ReplayOptions {
  config: DeskConfig;
  /** The source registry that the run used (Extract reads the kind of each page from it). */
  sources: SourcesRegistry;
  evidence: EvidenceStore;
  /** The folder of the ledgers of the published pieces. The pieces that there were when the run began are what the replay sees. */
  ledgerDir: string;
  /** The file of the desk state: the holds that there were when the run began are part of what the stages saw. */
  stateFile: string;
  /** Where the replies of the model are kept. By default `cassettes` in the folder of the run. */
  cassetteDir?: string;
  /** The folder in which the replay makes its own folder for the artifacts it writes. By default the temporary directory of the machine. */
  workDir?: string;
  /** The fetcher that the stages are given. A replay has no use for it, so by default it refuses every request; a test hands in one that counts. */
  fetcher?: Fetcher;
}

/**
 * How one artifact came out: `equal`; `different` (with the first place where it differs); `missing` (the run has it and the replay did not make it); or `unexpected`
 * (the replay made it and the run does not have it).
 */
export interface ReplayedArtifact {
  name: string;
  status: 'equal' | 'different' | 'missing' | 'unexpected';
  detail: string | null;
}

export interface ReplayReport {
  runId: string;
  /** True only when the replay ran to the end and every artifact it made is the one the run stored, and there is at least one. */
  equal: boolean;
  artifacts: ReplayedArtifact[];
  /** Why the replay stopped before the end (a reply that was never recorded, evidence that is missing or has changed); null when it did not. */
  error: string | null;
  /** What the stages logged. */
  log: string[];
}

/** The fetcher of a replay unless it is given another: it refuses every request. */
export const refusingFetcher: Fetcher = {
  async get(url: string) {
    throw new FetchError('network', url, 'a replay does not use the network');
  },
};

/** The text of a file, or null when it is not there. */
async function textOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const show = (value: unknown): string => {
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

/** The first place where two parsed JSON values differ, as a path (`claims[0].label`) and the two values; undefined when they are the same. */
function firstDifference(stored: unknown, replayed: unknown, where: string): string | undefined {
  if (Array.isArray(stored) && Array.isArray(replayed)) {
    for (let at = 0; at < Math.max(stored.length, replayed.length); at++) {
      if (at >= stored.length) return `${where}[${at}] was not stored`;
      if (at >= replayed.length) return `${where}[${at}] was not replayed`;
      const found = firstDifference(stored[at], replayed[at], `${where}[${at}]`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isObject(stored) && isObject(replayed)) {
    for (const key of [...new Set([...Object.keys(stored), ...Object.keys(replayed)])].sort()) {
      const here = where === '' ? key : `${where}.${key}`;
      if (!(key in stored)) return `${here} was not stored`;
      if (!(key in replayed)) return `${here} was not replayed`;
      const found = firstDifference(stored[key], replayed[key], here);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return stored === replayed ? undefined : `${where}: stored ${show(stored)}, replayed ${show(replayed)}`;
}

function compare(name: string, stored: string | null, replayed: string | null): ReplayedArtifact | undefined {
  if (stored === null && replayed === null) return undefined;
  if (stored === null) return { name, status: 'unexpected', detail: 'the replay made it and the run did not' };
  if (replayed === null) return { name, status: 'missing', detail: 'the run has it and the replay did not make it' };
  if (stored === replayed) return { name, status: 'equal', detail: null };
  return { name, status: 'different', detail: firstDifference(JSON.parse(stored), JSON.parse(replayed), '') ?? 'the files differ' };
}

/**
 * Replay the run in `runDir`: rebuild the pages it read from the evidence store (by the hashes in `03-fetch.json`), run Extract, Compose and Verify again
 * with the replies in the cassettes, and compare each artifact with the one the run stored. The run folder must have the record `run.json`, `02-select.json` and
 * `03-fetch.json`, which are what a replay starts from; without them there is nothing to replay and it throws. Anything that goes wrong after that, a reply that was
 * never recorded or evidence that is gone or has been changed, ends the replay early and is reported, with the artifacts it did not get to as `missing`.
 *
 * The published pieces that the stages see are those that there were when the run began: a ledger written by the run itself or later is left out, so that the slug of
 * the piece, which depends on what is published, comes out as it did. The replay uses no network (`fetcher` refuses every request) and writes nothing into the folder of the run.
 */
export async function replayRun(runDir: string, options: ReplayOptions): Promise<ReplayReport> {
  const record = await readRunRecord(path.join(runDir, 'run.json'));
  const selected = await readArtifact(runDir, '02-select', SelectArtifact);
  const fetched = await readArtifact(runDir, '03-fetch', FetchArtifact);

  const folder = await mkdtemp(path.join(options.workDir ?? tmpdir(), 'desk-replay-'));
  const log: string[] = [];
  let error: string | null = null;
  try {
    try {
      const snapshots: Snapshot[] = [];
      for (const document of fetched.documents) snapshots.push({ ...document, text: (await options.evidence.get(document.hash)).text });
      const published = await loadPublishedIndex(options.ledgerDir, (entry) => entry.publishedAt < record.date || (entry.publishedAt === record.date && entry.runId < record.runId), {
        holds: (await readDeskState(options.stateFile)).holds,
        date: record.date,
        before: record.startedAt,
      });
      const ctx: StageContext = {
        date: record.date,
        config: options.config,
        sources: options.sources,
        fetcher: options.fetcher ?? refusingFetcher,
        client: new RecordedClient(options.cassetteDir ?? path.join(runDir, 'cassettes')),
        evidence: options.evidence,
        runDir: folder,
        published,
        log: (line) => void log.push(line),
      };
      const extracted = await runExtract(ctx, snapshots, selected);
      if (extracted.ok) {
        const claims = extracted.artifact.claims;
        await runVerify(ctx, claims, await runCompose(ctx, claims));
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message || caught.name : String(caught);
    }

    const artifacts: ReplayedArtifact[] = [];
    for (const name of REPLAYED) {
      const found = compare(name, await textOrNull(path.join(runDir, `${name}.json`)), await textOrNull(path.join(folder, `${name}.json`)));
      if (found !== undefined) artifacts.push(found);
    }
    return { runId: record.runId, equal: error === null && artifacts.length > 0 && artifacts.every((artifact) => artifact.status === 'equal'), artifacts, error, log };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
