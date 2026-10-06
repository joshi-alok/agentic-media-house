import { FetchArtifact, extractPage, writeArtifact } from '../index';
import type { FetchDocument, SelectArtifact } from '../index';
import { describeFailure, isSourceFailure } from './context';
import type { StageContext } from './context';
import { MAX_TITLE_LENGTH } from './discover';
import { recencyWindow } from './select';

// Stage 3, Fetch: get the pages that the story will be written from, and keep them as evidence. For the story that
// Select chose these are the page of its primary source (if Select found one) and the page of the story itself. Each
// is fetched politely (the fetcher's job), reduced to its text, and put in the evidence store, which names it by the
// SHA-256 of the text. The artifact records where each page came from and its hash, never the text: the text is
// handed to the next stage in memory, and the evidence store is where anyone can read it again.

/** A page that was fetched and stored: what the artifact says about it, and its text. */
export interface Snapshot extends FetchDocument {
  text: string;
}

/**
 * What the Fetch stage hands on. When at least one page was fetched, `snapshots` holds them, the primary source first when
 * there is one, and `artifact` is what was written. When none was, the story cannot be written: the run ends with the
 * outcome `no-story`, and `reason` says why.
 */
export type FetchResult =
  | { ok: true; artifact: FetchArtifact; snapshots: Snapshot[] }
  | { ok: false; outcome: 'no-story'; reason: string; artifact: FetchArtifact };

/**
 * Why the date of a page does not make a story new, or undefined when it does. Used for a story that has no date of its own, whose page has to
 * have one inside the window of `recencyWindow`. The reason begins with `stale-or-undated`.
 */
function staleOrUndated(publishedAt: string | undefined, ctx: Pick<StageContext, 'date' | 'config'>): string | undefined {
  if (publishedAt === undefined) return 'stale-or-undated: the story has no date and its page gives none either';
  const { start, end } = recencyWindow(ctx);
  const time = Date.parse(publishedAt);
  if (time >= start && time < end) return undefined;
  return `stale-or-undated: the story has no date and its page says it was published ${publishedAt}, outside the ${ctx.config.recencyHours} hours before the end of ${ctx.date}`;
}

/**
 * Fetch the pages of the chosen story, store their text and write `03-fetch.json`.
 *
 * A page that cannot be fetched or read (robots.txt forbids it, it is too large, it is not text, it has no text in it) is not
 * fatal: it is recorded in the artifact with the reason and the stage goes on. In particular, when the primary source is
 * unreachable the story falls back to the page of the story alone, which is written in attributed form and held; the artifact
 * says that the primary source failed. When every page fails the result is `no-story`. A story that has no date of its own (a headline
 * link of a newsroom page) must have a page that gives one inside the window of `recencyWindow`, as an old announcement on a newsroom page
 * is not today's news: when its page gives none, or an old one, nothing more is fetched, the page is recorded as a failure whose reason begins
 * with `stale-or-undated`, and the result is `no-story` with that reason. Any other error ends the run, and that
 * includes a failure of the evidence store: the Desk does not go on without the evidence it will cite.
 *
 * The text is extracted once, by `extractPage`, and is what the store keeps and what the next stage quotes from. The size recorded
 * is that of the text in UTF-8 bytes, and the time is that of the fetch.
 */
export async function runFetch(ctx: StageContext, selected: SelectArtifact): Promise<FetchResult> {
  if (selected.chosen === null) throw new Error('runFetch needs a story: the Select stage chose none');
  const chosen = selected.chosen;

  const targets: { url: string; tier: 1 | 2 }[] = [];
  if (selected.tier1Url !== null) targets.push({ url: selected.tier1Url, tier: 1 });
  if (chosen.url !== selected.tier1Url) targets.push({ url: chosen.url, tier: chosen.tier });

  const documents: FetchDocument[] = [];
  const snapshots: Snapshot[] = [];
  const failures: FetchArtifact['failures'] = [];
  let stale: string | undefined;
  for (const target of targets) {
    try {
      const page = await ctx.fetcher.get(target.url);
      const { title, text, publishedAt } = extractPage(page.body, page.finalUrl);
      if (text === '') {
        failures.push({ ...target, reason: 'the page has no text to read' });
        ctx.log(`fetch: ${target.url} has no text to read`);
        continue;
      }
      if (target.url === chosen.url && chosen.publishedAt === undefined) {
        stale = staleOrUndated(publishedAt, ctx);
        if (stale !== undefined) {
          failures.push({ ...target, reason: stale });
          ctx.log(`fetch: ${target.url} is stale or undated: ${stale}`);
          break;
        }
      }
      const { hash } = await ctx.evidence.put(text, { url: target.url, finalUrl: page.finalUrl, tier: target.tier, retrievedAt: page.retrievedAt });
      const document: FetchDocument = {
        url: target.url,
        finalUrl: page.finalUrl,
        tier: target.tier,
        hash,
        retrievedAt: page.retrievedAt,
        bytes: Buffer.byteLength(text, 'utf8'),
        title: title.slice(0, MAX_TITLE_LENGTH),
      };
      documents.push(document);
      snapshots.push({ ...document, text });
    } catch (error) {
      if (!isSourceFailure(error)) throw error;
      const reason = describeFailure(error);
      failures.push({ ...target, reason });
      ctx.log(`fetch: ${target.url} could not be fetched (tier ${target.tier}): ${reason}`);
    }
  }

  const artifact: FetchArtifact = { date: ctx.date, documents, failures };
  await writeArtifact(ctx.runDir, '03-fetch', artifact, FetchArtifact);
  if (stale !== undefined) return { ok: false, outcome: 'no-story', reason: stale, artifact };
  if (snapshots.length === 0) {
    const why = failures.map((failure) => `${failure.url}: ${failure.reason}`).join('; ');
    return { ok: false, outcome: 'no-story', reason: `none of the pages of the story could be fetched: ${why}`, artifact };
  }
  return { ok: true, artifact, snapshots };
}
