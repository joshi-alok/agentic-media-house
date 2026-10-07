import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { LedgerEntry, dayNumber, defaultConfig as defaultGateConfig } from '@robywire/gate';
import type { DeskState, SourcesRegistry } from '@robywire/gate';
import { ExtractError, FeedError, FetchError, canonicalUrl, describeIssues } from '../index';
import type { DeskConfig, EvidenceStore, Fetcher, ModelClient } from '../index';

// What every stage of the pipeline is given, and a few things they share. A stage is a function of a
// `StageContext` (and of the artifact of the stage before it); it does not read the clock, the network, the
// disk or a model except through what the context holds, so a test can run it with fixtures and a fake model.

/** What the Desk has already published, and what it holds in an open pull request: used to avoid writing the same story twice. */
export interface PublishedIndex {
  /** The slugs of the published pieces, and of the pieces that are held in a pull request that is not yet a fortnight old. */
  slugs: string[];
  /** Their titles, each with the day (YYYY-MM-DD) it was published. */
  titles: { title: string; publishedAt: string }[];
  /** The canonical addresses (see `canonicalUrl`) of every source the published pieces cite, and of the stories that are held in a pull request that is not yet a fortnight old. */
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

/** The holds of the desk state, and the day that a run is for: what a story that is held in a pull request is remembered by. */
export interface HeldStories {
  holds: DeskState['holds'];
  /** The day of the run, YYYY-MM-DD. */
  date: string;
  /** When given, only a hold recorded before this moment (an ISO time) counts: a replay sees the holds that there were when its run began, and not the one that run made. */
  before?: string;
}

/**
 * Whether a hold still keeps its story out of the pipeline on the day `held.date`: it was recorded on that day or in the days before it, up to the gate's window of `titleWindowDays`
 * (14), as a title of a published piece is compared with. A hold from yesterday counts, one from fifteen days ago does not, and a hold recorded after the day does not (a run of a
 * day that is past does not see what was held since).
 */
function keepsOut(hold: DeskState['holds'][number], held: HeldStories): boolean {
  if (held.before !== undefined && hold.at >= held.before) return false;
  const days = (dayNumber(held.date) ?? Number.NaN) - (dayNumber(hold.at.slice(0, 10)) ?? Number.NaN);
  return days >= 0 && days <= defaultGateConfig().titleWindowDays;
}

/**
 * What has been published, from the ledgers of the pieces: a folder of `<slug>.json` files (the site keeps them in
 * `site/src/content/ledger`; today it holds none). Other files in the folder are ignored. A folder that does not
 * exist, or a ledger that is not valid, is an error and stops the run: with a wrong list of what is published, the
 * Desk could write a story twice. With `keep`, only the ledgers for which it says true are counted, which is how a replay
 * sees the pieces that there were when its run began and not the one that run made.
 *
 * With `held`, the stories that are held count as covered too: the slug and the address of the story of each hold (`keepsOut`) are added to the slugs and the addresses of the
 * published pieces, so that Discover does not offer the story again and the slug of another piece does not collide with the slug of a piece that is waiting for the owner. A hold
 * from before the desk state remembered them has neither, and covers nothing.
 */
export async function loadPublishedIndex(ledgerDir: string, keep: (entry: LedgerEntry) => boolean = () => true, held?: HeldStories): Promise<PublishedIndex> {
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
  const slugs = new Set(index.slugs);
  for (const hold of held === undefined ? [] : held.holds.filter((candidate) => keepsOut(candidate, held))) {
    if (hold.slug !== undefined) slugs.add(hold.slug);
    const url = hold.sourceUrl === undefined ? null : canonicalUrl(hold.sourceUrl);
    if (url !== null) urls.add(url);
  }
  index.slugs = [...slugs];
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
