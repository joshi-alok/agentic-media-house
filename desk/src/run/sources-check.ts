import type { SourcesRegistry } from '@robywire/gate';
import { FeedError, FetchError, isTier1, parseFeed, sourceKind } from '../index';
import type { Fetcher, SourceKind } from '../index';
import { readPage } from '../fetch/read-page';
import { itemMatches } from '../stages/keywords';

// A registry is a claim about the web. `checkSources` fetches each entry the way the Desk fetches (the fetcher it is given honours robots.txt and the pace of the
// settings), reads each feed, and reports what it found, so that an entry that cannot be read is known before a run depends on it. It writes nothing and asks no model.

/** What was found in a feed. */
export interface FeedFinding {
  items: number;
  /** Items that hold a keyword of the entry (all of them when the entry has none). */
  matching: number;
  /** Items whose link is a page of a primary source (what Discover would keep of a primary feed). */
  primary: number;
  /** The newest date any item has, or null. */
  newest: string | null;
  /** The newest stories, at most `LATEST_ITEMS`, that hold a keyword and, for a primary feed, link to a primary page: the pages a story could be written from. */
  latest: { title: string; link: string; publishedAt: string | null }[];
}

/** How many stories of a feed the report lists. */
export const LATEST_ITEMS = 3;

export type CheckResult = 'ok' | 'robots' | 'error' | 'not-a-feed' | 'empty' | 'skipped';

export interface CheckRow {
  name: string;
  /** The address that was fetched: the feed when there is one, else the page. */
  target: string;
  kind: SourceKind;
  result: CheckResult;
  /** In words: why it failed, or what the page or feed was. */
  detail: string;
  /** For a feed that was read; null for a page and for a failure. */
  feed: FeedFinding | null;
}

export interface SourceCheck {
  rows: CheckRow[];
  /** How many entries were fetched. */
  tried: number;
  /** How many of them could be read. */
  readable: number;
}

interface Entry {
  name: string;
  url: string | undefined;
  feed: string | undefined;
  keywords: readonly string[];
  status: string;
  tier: 1 | 2;
}

const isAddress = (text: string): boolean => /^https?:\/\//i.test(text);

function entriesOf(registry: SourcesRegistry): Entry[] {
  const primary = [
    ...Object.values(registry.primary.companies).flat(),
    ...registry.primary.research,
    ...registry.primary.standards,
    ...registry.primary.funding,
    ...registry.primary.events,
  ].map((entry): Entry => ({ name: entry.name, url: entry.url, feed: entry.feed, keywords: entry.keywords ?? [], status: entry.status, tier: 1 }));
  const secondary = registry.secondary.map((entry): Entry => ({ name: entry.name, url: undefined, feed: entry.feed, keywords: entry.keywords ?? [], status: entry.status, tier: 2 }));
  return [...primary, ...secondary].filter((entry) => isAddress(entry.feed ?? entry.url ?? ''));
}

/** Fetch every entry that has an address and report what was found; an entry whose status is `blocked` is not fetched. */
export async function checkSources(registry: SourcesRegistry, fetcher: Fetcher): Promise<SourceCheck> {
  const rows: CheckRow[] = [];
  for (const entry of entriesOf(registry)) {
    const target = (entry.feed ?? entry.url) as string;
    const kind = sourceKind(entry.url ?? target, registry);
    const row = (result: CheckResult, detail: string, feed: FeedFinding | null = null): CheckRow => ({ name: entry.name, target, kind, result, detail, feed });
    if (entry.status === 'blocked') {
      rows.push(row('skipped', 'its status is blocked'));
      continue;
    }
    try {
      const page = await fetcher.get(target);
      if (entry.feed === undefined) {
        const text = readPage(page).text;
        rows.push(text === '' ? row('empty', 'the page has no text to read') : row('ok', `page, ${text.length} characters of text`));
        continue;
      }
      const parsed = parseFeed(page.body);
      const dates = parsed.items.flatMap((item) => (item.publishedAt === undefined ? [] : [item.publishedAt])).sort();
      const matching = parsed.items.filter((item) => itemMatches(item, entry.keywords));
      const wanted = matching.filter((item) => entry.tier === 2 || isTier1(item.link, registry));
      const finding: FeedFinding = {
        items: parsed.items.length,
        matching: matching.length,
        primary: parsed.items.filter((item) => isTier1(item.link, registry)).length,
        newest: dates.at(-1) ?? null,
        latest: [...wanted]
          .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
          .slice(0, LATEST_ITEMS)
          .map((item) => ({ title: item.title, link: item.link, publishedAt: item.publishedAt ?? null })),
      };
      rows.push(parsed.items.length === 0 ? row('empty', 'the feed has no items', finding) : row('ok', `feed, ${finding.items} items`, finding));
    } catch (error) {
      if (error instanceof FeedError) rows.push(row('not-a-feed', error.message));
      else if (error instanceof FetchError) rows.push(row(error.kind === 'robots' ? 'robots' : 'error', error.message));
      else throw error;
    }
  }
  const tried = rows.filter((row) => row.result !== 'skipped').length;
  return { rows, tried, readable: rows.filter((row) => row.result === 'ok').length };
}

/** The report as lines to print: one for each entry (with `items`, the newest stories of a feed under it), then the count. */
export function formatSourceCheck(report: SourceCheck, options: { items?: boolean } = {}): string[] {
  const pad = (text: string, width: number): string => text.padEnd(width);
  const lines = report.rows.flatMap((row) => {
    const what =
      row.feed !== null && row.result === 'ok'
        ? `feed: ${row.feed.items} items, ${row.feed.matching} with a keyword, ${row.feed.primary} on a primary page, newest ${row.feed.newest === null ? 'unknown' : row.feed.newest.slice(0, 10)}`
        : row.detail;
    const line = `${pad(row.result, 10)}${pad(row.name, 32)}${pad(row.kind, 18)}${what}`;
    const stories = options.items === true && row.feed !== null ? row.feed.latest.map((story) => `    ${story.publishedAt === null ? 'undated   ' : story.publishedAt.slice(0, 10)}  ${story.title}  ${story.link}`) : [];
    return [line, ...stories];
  });
  const skipped = report.rows.length - report.tried;
  return [...lines, `${report.readable} of ${report.tried} entries can be read; ${skipped} ${skipped === 1 ? 'was' : 'were'} not tried`];
}
