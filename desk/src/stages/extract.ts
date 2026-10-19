import { BASES, CLAIM_TYPES, STATUSES, VALUE_KINDS, defaultContext } from '@robywire/gate';
import type { Claim, SourcesRegistry } from '@robywire/gate';
import { z } from 'zod';
import { ExtractArtifact, sourceKind, writeArtifact } from '../index';
import type { SelectArtifact, SourceKind } from '../index';
import type { ModelEffort } from '../model/types';
import { MAX_CLAIMS, buildExtractUser, extractSystem } from '../prompts/extract';
import { claimProblems, locateQuote } from './claim-grounding';
import type { Snapshot } from './fetch';
import type { StageContext } from './context';

// Stage 4, Extract: turn the pages that Fetch stored into claims. The model, in the role `extract`, reads each page and proposes
// claims with a quotation each. It is trusted with nothing: code checks every claim against the page (`claimProblems`), drops
// what fails, and does everything else itself: it finds the offsets of the quotation in the page, numbers the claims, and takes
// the source of a claim (address, tier, hash, time, outlet) from the page the model says it read, never from the model.

/** The most tokens the reply may have: 40 claims of about 150 tokens each, and room for the JSON around them. */
export const EXTRACT_MAX_OUTPUT_TOKENS = 8000;

/**
 * How hard the model may think while it extracts. Finding the passages that state a fact and copying them word for word is extraction, which Anthropic's guidance puts at
 * `low`; the first trial on a real page ran at the model's default (`high`), spent all of the 8000 tokens on thinking and wrote no claim. The code checks every quotation
 * whatever the effort, so a lower effort cannot let a wrong one through. Only a model that takes an effort may be given one.
 */
export const EXTRACT_EFFORT: ModelEffort = 'low';

const text = z.string().min(1);

/** A value of a claim as the model proposes it. Strict: a field the Desk does not know is refused, not ignored. */
const ReplyValue = z.strictObject({ kind: z.enum(VALUE_KINDS), raw: text, normalised: text, unit: text.optional() });

/**
 * The reply that the model must give, for a stage with this many pages: a list of claims, each of which says which page it is
 * from by number. Unknown fields are refused at every level. The length of a quotation is not limited here, so that a long one
 * is dropped as a claim and does not fail the whole reply (see `claimProblems`).
 */
export function extractReplySchema(sourceCount: number) {
  return z.strictObject({
    claims: z
      .array(
        z.strictObject({
          text,
          label: text,
          type: z.enum(CLAIM_TYPES),
          quote: text,
          values: z.array(ReplyValue).max(20),
          basis: z.enum(BASES),
          status: z.enum(STATUSES),
          source: z.number().int().min(1).max(sourceCount),
        }),
      )
      .max(MAX_CLAIMS),
  });
}

/**
 * What the Extract stage hands on. With at least `config.minClaims` claims kept, `artifact` is what was written. With fewer there
 * is not enough to write a piece from, and the run ends with the outcome `no-story`; `reason` says why, and the artifact is
 * written all the same, with the claims that survived and the ones that did not.
 */
export type ExtractResult = { ok: true; artifact: ExtractArtifact } | { ok: false; outcome: 'no-story'; reason: string; artifact: ExtractArtifact };

/**
 * What kind of page a snapshot is, for the check of its claims' basis. A page of another outlet (tier 2) is `tier2` whatever its
 * address. A tier-1 page is what `sourceKind` says of its address, provided the address the Desk asked for and the address
 * it was served from agree: a page that redirected to another kind of site (an open redirect on a company's site, say) is not the
 * company's page, so it is `unknown`, and so is a tier-1 page that turns out to be another outlet's.
 */
export function kindOfSnapshot(snapshot: Pick<Snapshot, 'tier' | 'url' | 'finalUrl'>, registry: SourcesRegistry): SourceKind {
  if (snapshot.tier === 2) return 'tier2';
  const kind = sourceKind(snapshot.finalUrl, registry);
  return kind === 'tier2' || kind !== sourceKind(snapshot.url, registry) ? 'unknown' : kind;
}

/** The capitalised words that need no claim: the gate's own list, so that this stage and the gate agree. */
const ALLOW_LIST = defaultContext().nameAllowList;

/**
 * Extract the claims of the chosen story from the pages that Fetch stored, and write `04-extract.json`.
 *
 * The pages are shown to the model in the order given, numbered from 1; a page that is not a known kind of source (see
 * `kindOfSnapshot`) is not shown, and when none is left no model is asked. One call is made, and a reply that is not valid is a
 * `schema` error that ends the run, with nothing written. Each claim of the reply is then checked by `claimProblems` against the
 * page it names: a claim with a problem is recorded in `dropped` (its place in the reply, its text and every reason), and the
 * rest are kept, numbered `c-1`, `c-2` and so on in the order of the reply, with the quoted span as the page has it.
 */
export async function runExtract(ctx: StageContext, snapshots: Snapshot[], selected: SelectArtifact): Promise<ExtractResult> {
  if (selected.chosen === null) throw new Error('runExtract needs a story: the Select stage chose none');
  if (snapshots.length === 0) throw new Error('runExtract needs at least one page: Fetch stored none');
  const { outlet } = selected.chosen;

  const pages: { snapshot: Snapshot; kind: SourceKind }[] = [];
  for (const snapshot of snapshots) {
    const kind = kindOfSnapshot(snapshot, ctx.sources);
    if (kind === 'unknown') ctx.log(`extract: ${snapshot.url} is not a known kind of source, so it is not read`);
    else pages.push({ snapshot, kind });
  }

  const claims: Claim[] = [];
  const dropped: ExtractArtifact['dropped'] = [];
  if (pages.length > 0) {
    const reply = await ctx.client.json({
      role: 'extract',
      model: ctx.config.models.extract,
      system: extractSystem(),
      user: buildExtractUser(pages.map(({ snapshot, kind }) => ({ tier: snapshot.tier, kind, ...(kind === 'tier2' ? { outlet } : {}), text: snapshot.text }))),
      schema: extractReplySchema(pages.length),
      maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
      effort: EXTRACT_EFFORT,
    });
    reply.value.claims.forEach((proposed, index) => {
      const { snapshot, kind } = pages[proposed.source - 1] as { snapshot: Snapshot; kind: SourceKind };
      const problems = claimProblems(proposed, snapshot.text, kind, ALLOW_LIST);
      if (problems.length > 0) {
        dropped.push({ index, text: proposed.text, reasons: problems });
        return;
      }
      const found = locateQuote(snapshot.text, proposed.quote) as { start: number; end: number };
      claims.push({
        id: `c-${claims.length + 1}`,
        text: proposed.text,
        label: proposed.label,
        type: proposed.type,
        source: {
          url: snapshot.url,
          tier: snapshot.tier,
          snapshotHash: snapshot.hash,
          retrievedAt: snapshot.retrievedAt,
          ...(snapshot.tier === 2 ? { outlet } : {}),
        },
        span: { start: found.start, end: found.end, quote: snapshot.text.slice(found.start, found.end) },
        basis: proposed.basis,
        status: proposed.status,
        values: proposed.values,
      });
    });
  }

  const artifact: ExtractArtifact = { date: ctx.date, claims, dropped };
  await writeArtifact(ctx.runDir, '04-extract', artifact, ExtractArtifact);
  ctx.log(`extract: ${claims.length + dropped.length} claims proposed, ${claims.length} kept, ${dropped.length} dropped`);
  if (claims.length < ctx.config.minClaims) {
    const why = pages.length === 0 ? 'no page of the story is a known kind of source' : `${claims.length} of the ${claims.length + dropped.length} claims proposed survived the checks`;
    return { ok: false, outcome: 'no-story', reason: `${why}, and at least ${ctx.config.minClaims} are needed to write a piece`, artifact };
  }
  return { ok: true, artifact };
}
