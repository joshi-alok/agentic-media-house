import { BEATS } from '@robywire/gate';
import { z } from 'zod';
import { SelectArtifact, extractPage, isTier1, writeArtifact } from '../index';
import type { Candidate, DiscoverArtifact } from '../index';
import { buildSelectUser, selectSystem } from '../prompts/select';
import { describeFailure, isSourceFailure } from './context';
import type { StageContext } from './context';
import { isCovered } from './duplicates';

// Stage 2, Select: choose one story or none. Code does the part that code can do: it drops what the Desk must not
// write about (a story it has covered, one that is old, one that is about no beat) and cuts the list to a
// shortlist. The model, in the role `select`, chooses from the titles of the shortlist, by the standard of the
// editorial bar, and is not trusted with anything else: the id it gives must be on the shortlist, and its reply
// is checked against that. Then code, not the model, finds the primary source of the story it chose.

/** The most tokens the reply of the model may have: an id and a few sentences. */
export const SELECT_MAX_OUTPUT_TOKENS = 600;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The reply that the model must give, for a shortlist with these ids: one of them or null, and the reasons. */
export function selectReplySchema(ids: [string, ...string[]]) {
  return z.strictObject({
    chosenId: z.enum(ids).nullable(),
    reasons: z.array(z.string().min(1).max(600)).min(1).max(10),
  });
}

/**
 * The span of time in which a story must have been published to be new on the day of a run: the `recencyHours` before the end of that day
 * (a day is read in UTC), as milliseconds since 1970. A time is in the window when it is at or after `start` and before `end`. Select applies it to
 * the date of a candidate and Fetch to the date of the page of a candidate that has none.
 */
export function recencyWindow(ctx: Pick<StageContext, 'date' | 'config'>): { start: number; end: number } {
  const end = Date.parse(`${ctx.date}T00:00:00.000Z`) + DAY;
  return { start: end - ctx.config.recencyHours * HOUR, end };
}

/**
 * The candidates that go to the model, best first. A candidate is dropped when a published piece covers it, when it was published
 * longer ago than `config.recencyHours` before the end of the day of the run (a candidate with no date is not dropped), when it
 * was published after the end of that day, and when none of its beats is one of the seven beats of the vocabulary. The rest are
 * ordered, newest first with the ones that have no date last (each group keeps the order in which Discover found them), and
 * cut to `config.shortlistMax`.
 */
export function shortlistOf(candidates: Candidate[], ctx: Pick<StageContext, 'date' | 'config' | 'published'>): Candidate[] {
  const { start, end } = recencyWindow(ctx);
  const kept = candidates.filter((candidate) => {
    if (isCovered(candidate, ctx.published, ctx.date)) return false;
    if (!candidate.beats.some((beat) => (BEATS as readonly string[]).includes(beat))) return false;
    if (candidate.publishedAt === undefined) return true;
    const time = Date.parse(candidate.publishedAt);
    return time >= start && time < end;
  });
  const timeOf = (candidate: Candidate): number => (candidate.publishedAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(candidate.publishedAt));
  // Array.prototype.sort is stable: candidates with the same time stay in the order they were found.
  return kept.sort((a, b) => timeOf(b) - timeOf(a)).slice(0, ctx.config.shortlistMax);
}

/**
 * The primary source of a story, by code: the candidate's own address when it is already a primary source (a company's own page), otherwise the
 * first link of the candidate's page, in the order of the page, whose address is one. The links are those that `extractPage` reads, which
 * are the links of the story itself and not those of its navigation, footer or sidebar. A page that cannot be fetched or read gives no
 * source, and the reason.
 */
async function findTier1(ctx: StageContext, chosen: Candidate): Promise<{ url: string } | { why: string }> {
  if (isTier1(chosen.url, ctx.sources)) return { url: chosen.url };
  try {
    const page = await ctx.fetcher.get(chosen.url);
    const link = extractPage(page.body, page.finalUrl).links.find((candidate) => isTier1(candidate.url, ctx.sources));
    return link === undefined ? { why: 'the page of the story has no link to a primary source' } : { url: link.url };
  } catch (error) {
    if (!isSourceFailure(error)) throw error;
    return { why: `the page of the story could not be read (${describeFailure(error)})` };
  }
}

/**
 * Choose one story, or none, and write `02-select.json`.
 *
 * With nothing on the shortlist, no model is asked. Otherwise one call is made, and a reply that is not valid, or that names an id that is not on
 * the shortlist, is a `schema` error that ends the run. When a story is chosen, its primary source is looked for (see `findTier1`); when
 * none is found the reasons end with a sentence of the code that says so, because such a story is written in attributed form and held.
 */
export async function runSelect(ctx: StageContext, discovered: DiscoverArtifact): Promise<SelectArtifact> {
  const shortlist = shortlistOf(discovered.candidates, ctx);
  let artifact: SelectArtifact;

  if (shortlist.length === 0) {
    const reason = `No candidate passed the filters: each must be new, published within the last ${ctx.config.recencyHours} hours or undated, and be about a beat.`;
    ctx.log(`select: ${reason}`);
    artifact = { date: ctx.date, chosen: null, reasons: [reason], tier1Url: null, shortlist: [] };
  } else {
    const ids = shortlist.map((candidate) => candidate.id) as [string, ...string[]];
    const reply = await ctx.client.json({
      role: 'select',
      model: ctx.config.models.select,
      system: selectSystem(),
      user: buildSelectUser(shortlist, ctx.sources.bar, ctx.date),
      schema: selectReplySchema(ids),
      maxOutputTokens: SELECT_MAX_OUTPUT_TOKENS,
    });
    const chosen = shortlist.find((candidate) => candidate.id === reply.value.chosenId) ?? null;
    if (chosen === null) {
      artifact = { date: ctx.date, chosen: null, reasons: reply.value.reasons, tier1Url: null, shortlist: ids };
    } else {
      const source = await findTier1(ctx, chosen);
      const reasons =
        'url' in source
          ? reply.value.reasons
          : [...reply.value.reasons, `No tier-1 source was found: ${source.why}, so the story is written in attributed form and held.`];
      artifact = { date: ctx.date, chosen, reasons, tier1Url: 'url' in source ? source.url : null, shortlist: ids };
    }
  }

  await writeArtifact(ctx.runDir, '02-select', artifact, SelectArtifact);
  return artifact;
}
