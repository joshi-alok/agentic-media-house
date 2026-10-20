import { DiscoverArtifact, candidateId, extractPage, hostKey, isTier1, parseFeed, tier1Feeds, tier1Newsrooms, tier2Feeds, writeArtifact } from '../index';
import type { Candidate, Newsroom, PageLink, PrimaryFeed, Tier2Feed } from '../index';
import { describeFailure, isSourceFailure } from './context';
import type { StageContext } from './context';
import { isCovered, sameStory } from './duplicates';
import { matchesKeywords, plainText } from './keywords';

// Stage 1, Discover: find the stories of the day. Every newsroom and every feed of `sources.yml` is read; each feed
// item that holds a keyword of its source (every item, for a source with no keywords) and each headline link of a
// newsroom becomes a candidate; the ones the Desk has already seen or published are dropped. A source that cannot be
// read is skipped and the reason is kept, because a quiet source is not a reason to stop. If every source fails, the
// run fails: an outage must not look like a day with no news.
// No model is called.

/** The most candidates taken from one source. A feed or a page of absurd size would otherwise fill the artifact. */
export const MAX_PER_SOURCE = 200;

/** The longest title that is kept, in characters. A title is shown to a model, and a hostile feed could make one huge. */
export const MAX_TITLE_LENGTH = 300;

const HEADLINE_MIN_WORDS = 3;

function candidateOf(fields: { title: string; url: string; publishedAt?: string; outlet: string; tier: 1 | 2; beats: string[]; origin: 'feed' | 'newsroom' }): Candidate {
  const { publishedAt, ...rest } = fields;
  return { id: candidateId(fields.url), ...rest, title: fields.title.slice(0, MAX_TITLE_LENGTH), ...(publishedAt === undefined ? {} : { publishedAt }) };
}

/**
 * The links of a newsroom page that look like stories. A story link is on the newsroom's own host, below the newsroom's
 * own path (`/news/a` below `/news`; any page but the root below `/`), and has a text of at least three words, which leaves out
 * "Read more", "Press kit", the pager and the like. A newsroom whose stories are elsewhere gives no candidates: a
 * generic rule cannot do better than that, and an adapter for the site is the remedy (a later part).
 */
function headlines(room: Newsroom, links: PageLink[]): PageLink[] {
  const host = hostKey(room.url);
  const roomPath = new URL(room.url).pathname;
  const below = roomPath.endsWith('/') ? roomPath : `${roomPath}/`;
  return links.filter((link) => {
    const url = new URL(link.url);
    // The text of a link is already trimmed and in one line, so splitting at white space counts its words.
    const words = link.text.split(/\s+/).length;
    return hostKey(link.url) === host && url.pathname.startsWith(below) && url.pathname !== roomPath && words >= HEADLINE_MIN_WORDS;
  });
}

/**
 * Read the newsrooms and the feeds, make the candidates, drop the repeats and write `01-discover.json`.
 *
 * Newsrooms are read first, then the feeds of primary sources, then the feeds of other outlets, so that when a project's own post and an
 * outlet's report of it tell the same story, the post is the one kept. An item of a feed is left out, and the log says how many, when it holds no
 * keyword of its source (a source with no keywords keeps every item) and, in the feed of a primary source, when it links to a page that is not a
 * primary source. A candidate is dropped when its address is one that was already seen or
 * is cited by a published piece, or when its title tells the same story as one already kept, or as a piece published in the
 * last 14 days (the gate's own test of a title, see `sameStory`). At most `MAX_PER_SOURCE` candidates come from one source, counted after the items are left out.
 *
 * Throws, after writing the artifact, when every source failed, and throws at once when the registry has nothing to read.
 */
export async function runDiscover(ctx: StageContext): Promise<DiscoverArtifact> {
  const found: Candidate[] = [];
  const skipped: { source: string; reason: string }[] = [];
  let polled = 0;

  const attempt = async (source: string, read: () => Promise<Candidate[]>): Promise<void> => {
    polled++;
    try {
      const candidates = await read();
      if (candidates.length > MAX_PER_SOURCE) ctx.log(`discover: ${source} has ${candidates.length} candidates, and only the first ${MAX_PER_SOURCE} are kept`);
      found.push(...candidates.slice(0, MAX_PER_SOURCE));
    } catch (error) {
      if (!isSourceFailure(error)) throw error;
      const reason = describeFailure(error);
      skipped.push({ source, reason });
      ctx.log(`discover: skipped ${source}: ${reason}`);
    }
  };

  for (const room of tier1Newsrooms(ctx.sources)) {
    await attempt(room.name, async () => {
      const page = await ctx.fetcher.get(room.url);
      const { links } = extractPage(page.body, page.finalUrl);
      return headlines(room, links).map((link) =>
        candidateOf({ title: link.text, url: link.url, outlet: room.name, tier: 1, beats: room.beats, origin: 'newsroom' }),
      );
    });
  }
  for (const feed of tier1Feeds(ctx.sources)) {
    await attempt(feed.name, () => readFeed(ctx, feed, 1));
  }
  for (const feed of tier2Feeds(ctx.sources)) {
    await attempt(feed.name, () => readFeed(ctx, feed, 2));
  }

  if (polled === 0) throw new Error('discover: the registry has no newsroom or feed to read');

  const kept: Candidate[] = [];
  for (const candidate of found) {
    if (kept.some((other) => other.url === candidate.url)) {
      ctx.log(`discover: ${candidate.url} was found twice`);
      continue;
    }
    if (isCovered(candidate, ctx.published, ctx.date)) {
      ctx.log(`discover: ${candidate.url} is already covered by a published piece`);
      continue;
    }
    const same = kept.find((other) => sameStory(other.title, candidate.title));
    if (same !== undefined) {
      ctx.log(`discover: ${JSON.stringify(candidate.title)} tells the story of ${JSON.stringify(same.title)}, which was found first`);
      continue;
    }
    kept.push(candidate);
  }

  const artifact: DiscoverArtifact = { date: ctx.date, candidates: kept, skipped };
  await writeArtifact(ctx.runDir, '01-discover', artifact, DiscoverArtifact);
  if (skipped.length === polled) throw new Error(`discover: every source failed (${polled} of ${polled}); the first: ${skipped[0]?.source}: ${skipped[0]?.reason}`);
  return artifact;
}

async function readFeed(ctx: StageContext, feed: Tier2Feed | PrimaryFeed, tier: 1 | 2): Promise<Candidate[]> {
  const page = await ctx.fetcher.get(feed.feed);
  const parsed = parseFeed(page.body);
  if (parsed.skipped > 0) ctx.log(`discover: ${feed.name}: ${parsed.skipped} item(s) with no title or no link were left out`);
  let offTopic = 0;
  let elsewhere = 0;
  const items = parsed.items.filter((item) => {
    if (!matchesKeywords(`${item.title} ${plainText(item.summary)}`, feed.keywords)) {
      offTopic++;
      return false;
    }
    // A primary feed is trusted for what it says it published, not for where it links: an item whose page is not a page of a primary source is not written from.
    if (tier === 1 && !isTier1(item.link, ctx.sources)) {
      elsewhere++;
      return false;
    }
    return true;
  });
  if (offTopic > 0) ctx.log(`discover: ${feed.name}: ${offTopic} item(s) held no keyword of the source and were left out`);
  if (elsewhere > 0) ctx.log(`discover: ${feed.name}: ${elsewhere} item(s) link to a page that is not a primary source and were left out`);
  return items.map((item) => candidateOf({ title: item.title, url: item.link, publishedAt: item.publishedAt, outlet: feed.name, tier, beats: feed.beats, origin: 'feed' }));
}
