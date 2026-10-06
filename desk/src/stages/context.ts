import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { LedgerEntry } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { ExtractError, FeedError, FetchError, canonicalUrl, describeIssues } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher, ModelClient } from '../index';

// What every stage of the pipeline is given, and a few things they share. A stage is a function of a
// `StageContext` (and of the artifact of the stage before it); it does not read the clock, the network, the
// disk or a model except through what the context holds, so a test can run it with fixtures and a fake model.

/** What the Desk has already published: used to avoid writing the same story twice. */
export interface PublishedIndex {
  /** The slugs of the published pieces. */
  slugs: string[];
  /** Their titles, each with the day (YYYY-MM-DD) it was published. */
  titles: { title: string; publishedAt: string }[];
  /** The canonical addresses (see `canonicalUrl`) of every source the published pieces cite. */
  sourceUrls: string[];
}

export interface StageContext {
  /** The day of the run, YYYY-MM-DD. The clock is never read: this is the date. */
  date: string;
  config: DeskConfig;
  /** The loaded `sources.yml`. */
  sources: SourcesRegistry;
  /** The only way onto the web. */
  fetcher: Fetcher;
  /** The only way to a model. Every call has a role, and the budget and the retries are already in it. */
  client: ModelClient;
  /** Where snapshots are kept. */
  evidence: EvidenceStore;
  /** The folder of this run: the stages write their artifacts here. */
  runDir: string;
  published: PublishedIndex;
  /** A line for the log of the run. */
  log: (line: string) => void;
}

/** Nothing published yet. */
export function emptyPublished(): PublishedIndex {
  return { slugs: [], titles: [], sourceUrls: [] };
}

/**
 * What has been published, from the ledgers of the pieces: a folder of `<slug>.json` files (the site keeps them in
 * `site/src/content/ledger`; today it holds none). Other files in the folder are ignored. A folder that does not
 * exist, or a ledger that is not valid, is an error and stops the run: with a wrong list of what is published, the
 * Desk could write a story twice. With `keep`, only the ledgers for which it says true are counted, which is how a replay
 * sees the pieces that there were when its run began and not the one that run made.
 */
export async function loadPublishedIndex(ledgerDir: string, keep: (entry: LedgerEntry) => boolean = () => true): Promise<PublishedIndex> {
  let names: string[];
  try {
    names = await readdir(ledgerDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the ledger folder ${ledgerDir} does not exist`);
    throw error;
  }
  const index = emptyPublished();
  const urls = new Set<string>();
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    let data: unknown;
    try {
      data = JSON.parse(await readFile(path.join(ledgerDir, name), 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`the ledger ${name} is not valid JSON`);
      throw error;
    }
    const entry = LedgerEntry.safeParse(data);
    if (!entry.success) throw new Error(`the ledger ${name} is not valid: ${describeIssues(entry.error)}`);
    if (!keep(entry.data)) continue;
    index.slugs.push(entry.data.slug);
    index.titles.push({ title: entry.data.title, publishedAt: entry.data.publishedAt });
    for (const source of entry.data.sources) {
      const url = canonicalUrl(source.url);
      if (url !== null) urls.add(url);
    }
  }
  index.sourceUrls = [...urls];
  return index;
}

/**
 * Is this the kind of failure that a source has, as opposed to a bug of the Desk? A page that cannot be fetched, a feed
 * that cannot be read and a page that cannot be read are failures of a source: the stage skips it and goes on. Any other
 * error is not, and ends the run.
 */
export function isSourceFailure(error: unknown): error is FetchError | FeedError | ExtractError {
  return error instanceof FetchError || error instanceof FeedError || error instanceof ExtractError;
}

/** What went wrong with a source, in a sentence for the artifact and the log. */
export function describeFailure(error: FetchError | FeedError | ExtractError): string {
  if (error instanceof FeedError) return `the feed cannot be read: ${error.message}`;
  if (error instanceof ExtractError) return `the page cannot be read: ${error.message}`;
  return error.message;
}
