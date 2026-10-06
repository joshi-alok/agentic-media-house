import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { canonicalUrl } from './url';

// Another outlet's feed says what it has published. The Desk uses it to find stories and never to write
// from. A feed is text from outside: it may be broken, or be something other than a feed, and then the
// Desk says so with a `FeedError` and skips the source. RSS 2.0 and Atom are read; RSS 1.0 is not.

/** One story of a feed. The link is a canonical address (see `canonicalUrl`); the date is an ISO time when the feed had a date that could be read. */
export interface FeedItem {
  title: string;
  link: string;
  publishedAt?: string;
  /** The description of the item as the feed wrote it. It may hold HTML. It is data, and no stage shows it to a model. */
  summary?: string;
}

export interface ParsedFeed {
  format: 'rss' | 'atom';
  items: FeedItem[];
  /** How many items had no title, or no link that is the address of a page, and were left out. */
  skipped: number;
}

/**
 * Why a feed could not be read.
 * - `malformed`: it is not well-formed XML (or is nested absurdly deep).
 * - `unknown-format`: it is XML, but not an RSS 2.0 or an Atom feed.
 */
export type FeedErrorKind = 'malformed' | 'unknown-format';

export class FeedError extends Error {
  readonly kind: FeedErrorKind;

  constructor(kind: FeedErrorKind, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'FeedError';
    this.kind = kind;
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** The zone names that RFC 822 gives, as hours from UTC. */
const ZONES: Record<string, number> = { gmt: 0, ut: 0, utc: 0, z: 0, est: -5, edt: -4, cst: -6, cdt: -5, mst: -7, mdt: -6, pst: -8, pdt: -7 };
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const RFC_822 = /^(?:[a-z]{3,9},\s*)?(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{2}|\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*([a-z]+|[+-]\d{4})?$/i;

/** Minutes east of UTC for the zone of a date: `Z`, `+02:00`, `+0200`, `+02`, a name such as `GMT` or `EDT`, or nothing (which is UTC). */
function offsetMinutes(zone: string | undefined): number | undefined {
  if (zone === undefined) return 0;
  const named = ZONES[zone.toLowerCase()];
  if (named !== undefined) return named * 60;
  const numeric = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (numeric === null) return undefined;
  const hours = Number(numeric[2]);
  const minutes = Number(numeric[3] ?? 0);
  if (hours > 23 || minutes > 59) return undefined;
  return (numeric[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * A date from a feed as an ISO time in UTC, or `undefined` if the text is not a date that can be read. Two forms are
 * read: ISO 8601 (`2026-10-04T09:30:00+02:00`, with or without the time, the zone and the seconds) and the date of
 * RSS, which is RFC 822 (`Sun, 04 Oct 2026 09:15:00 +0000`). A date with no zone is read as UTC, so that the answer
 * does not depend on where the Desk runs. Fractions of a second are dropped. A date that does not exist (31 February,
 * the 25th hour) is not a date. Text that merely contains one is not one either.
 */
export function normaliseFeedDate(text: string): string | undefined {
  const value = text.trim();
  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  let second: number;
  let zone: string | undefined;

  const iso = ISO.exec(value);
  const rfc = iso === null ? RFC_822.exec(value) : null;
  if (iso !== null) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])] as [number, number, number];
    [hour, minute, second] = [Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0)];
    zone = iso[7];
  } else if (rfc !== null) {
    day = Number(rfc[1]);
    month = MONTHS.indexOf((rfc[2] as string).toLowerCase()) + 1;
    const written = rfc[3] as string;
    // RFC 2822: a year of two digits is in 2000-2049 below 50 and in 1950-1999 from 50.
    year = written.length === 2 ? Number(written) + (Number(written) < 50 ? 2000 : 1900) : Number(written);
    [hour, minute, second] = [Number(rfc[4]), Number(rfc[5]), Number(rfc[6] ?? 0)];
    zone = rfc[7];
  } else {
    return undefined;
  }

  const offset = offsetMinutes(zone);
  if (offset === undefined || hour > 23 || minute > 59 || second > 59) return undefined;
  // The day must exist in the month: February 31 would roll over into March, month 13 into the next year, month 0 into
  // the last one, and a year below 100 into the twentieth century, and in each of them the month or the year changes.
  const midnight = new Date(Date.UTC(year, month - 1, day));
  if (midnight.getUTCFullYear() !== year || midnight.getUTCMonth() !== month - 1) return undefined;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000).toISOString();
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

/** The text of a node of the parsed XML, in one line: a string, or the text of an element that has attributes. */
function textOf(node: unknown): string {
  const raw = typeof node === 'string' ? node : asRecord(node)?.['#text'];
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/** The first of some addresses that is the address of a page, in its canonical form. */
function firstAddress(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const address = canonicalUrl(candidate);
    if (address !== null) return address;
  }
  return undefined;
}

/**
 * Read an RSS 2.0 or an Atom feed. Items come out in the order of the feed. An item with no title, or with no link
 * that is the address of a page (an Atom entry counts only its `alternate` link, not an enclosure), is left out and
 * counted in `skipped`. A date that cannot be read leaves the item without one: undated items are not an error.
 * Throws `FeedError` for text that is not well-formed XML, for XML nested absurdly deep, and for XML that is not a feed.
 * Entities that a feed defines for itself are never expanded.
 */
export function parseFeed(xml: string): ParsedFeed {
  // A byte order mark and blank lines before the XML declaration are common in the wild, and harmless.
  const text = xml.trimStart();
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw new FeedError('malformed', `the feed is not well-formed XML: ${validation.err.msg} (line ${validation.err.line})`);

  let parsed: Record<string, unknown>;
  try {
    // `htmlEntities` is what turns character references such as &#8217; into characters in this version of the parser.
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      htmlEntities: true,
    }).parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new FeedError('malformed', `the feed is not well-formed XML: ${(error as Error).message}`, { cause: error });
  }

  // A document that has passed the validator has a root element, so the name that is left after the declaration is never missing.
  const [root = ''] = Object.keys(parsed).filter((name) => !name.startsWith('?'));
  if (root === 'rss') {
    const channel = asRecord(asRecord(parsed.rss)?.channel);
    if (channel === undefined) throw new FeedError('unknown-format', 'the RSS feed does not have exactly one channel');
    return readItems('rss', asList(channel.item), (item) => ({
      link: firstAddress(asList(item.link).map(textOf)),
      date: textOf(item.pubDate) || textOf(item['dc:date']),
      summary: textOf(item.description),
    }));
  }
  if (root === 'feed') {
    return readItems('atom', asList(asRecord(parsed.feed)?.entry), (entry) => ({
      link: firstAddress(
        asList(entry.link).flatMap((link) => {
          const attributes = asRecord(link);
          const rel = attributes?.['@_rel'];
          const href = attributes?.['@_href'];
          return (rel === undefined || rel === 'alternate') && typeof href === 'string' ? [href] : [];
        }),
      ),
      date: textOf(entry.published) || textOf(entry.updated),
      summary: textOf(entry.summary),
    }));
  }
  throw new FeedError('unknown-format', `the XML is not an RSS 2.0 or an Atom feed: its root element is <${root}>`);
}

/** The items of a feed, with what is needed of each read by `pick`; the ones that cannot be used are counted. */
function readItems(
  format: 'rss' | 'atom',
  rawItems: unknown[],
  pick: (item: Record<string, unknown>) => { link: string | undefined; date: string; summary: string },
): ParsedFeed {
  const items: FeedItem[] = [];
  let skipped = 0;
  for (const raw of rawItems) {
    const item = asRecord(raw);
    const title = item === undefined ? '' : textOf(item.title);
    const { link, date, summary } = item === undefined ? { link: undefined, date: '', summary: '' } : pick(item);
    if (title === '' || link === undefined) {
      skipped++;
      continue;
    }
    const publishedAt = normaliseFeedDate(date);
    items.push({ title, link, ...(publishedAt === undefined ? {} : { publishedAt }), ...(summary === '' ? {} : { summary }) });
  }
  return { format, items, skipped };
}
