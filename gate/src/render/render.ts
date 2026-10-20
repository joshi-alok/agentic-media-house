import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Release } from '../constants';
import type { Claim, Draft, LedgerEntry, LedgerSentence } from '../schemas';
import { allSentences } from '../sentences';
import type { LocatedSentence } from '../sentences';
import { renderBody } from './body';
import { renderHead } from './head';

/** What the renderer needs besides the draft and the claims. */
export interface RenderMeta {
  runId: string;
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
  /** How the piece came to be published, for the ledger: `auto` for a piece the gate cleared, `owner` for a hold the owner released. */
  release?: Release;
  /**
   * The day (YYYY-MM-DD) a correction or a retraction was recorded for the piece. It is written to
   * the frontmatter as `updatedAt`; a piece that was never corrected has none.
   */
  updatedAt?: string;
}

/** The MDX file and the ledger entry that go with it. */
export interface RenderedPiece {
  mdx: string;
  ledger: LedgerEntry;
}

const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Order by UTF-16 code units, so the result does not depend on the machine's locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The claim ids in the order the reader first meets them: the body (opening,
 * takeaways, sections, limitations) first, then any claim that only the title
 * or the description cites. The marker number of a claim is its position + 1.
 */
function claimOrder(located: readonly LocatedSentence[]): string[] {
  const inBody = located.filter((item) => item.section !== 'title' && item.section !== 'description');
  const inHead = located.filter((item) => item.section === 'title' || item.section === 'description');
  return [...new Set([...inBody, ...inHead].flatMap((item) => item.sentence.claimIds))];
}

/**
 * Render a gated draft as MDX plus its ledger entry. The output is a pure
 * function of the arguments: no clock, no randomness, newline line endings.
 * No text from the draft reaches the MDX unescaped.
 *
 * The body of the MDX is `renderBody(ledger)`: the ledger is built first and
 * the body is written from it, not from the draft. A section with no sentence
 * has nothing in the ledger, so the page has no heading for it, and neighbouring
 * sections with the same heading come out as one. The title and the description
 * of the frontmatter, and the title of the ledger, are `renderHead` of the
 * ledger's sentences: the title and description sentences with the spaces around
 * them taken off.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
  const located = allSentences(draft);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  const order = claimOrder(located);
  for (const id of order) {
    if (!claimsById.has(id)) throw new Error(`renderDraft: a sentence cites ${id}, but no claim has that id`);
  }

  for (const category of draft.categories) {
    if (!PLAIN_SLUG.test(category)) throw new Error(`renderDraft: the category "${category}" is not a plain slug`);
  }
  const { updatedAt } = meta;
  if (updatedAt !== undefined) {
    const day = dayNumber(updatedAt);
    if (day === undefined) throw new Error(`renderDraft: updatedAt "${updatedAt}" is not a real date in the form YYYY-MM-DD`);
    if (day < (dayNumber(draft.publishedAt) ?? NaN)) throw new Error(`renderDraft: updatedAt "${updatedAt}" is before publishedAt "${draft.publishedAt}"`);
  }
  const { release } = meta;
  if (release === 'auto' && meta.gate.route !== 'publish') {
    throw new Error(`renderDraft: release "auto" needs a gate route of publish, but the route is ${meta.gate.route}`);
  }
  if (release === 'owner' && meta.gate.route === 'publish') {
    throw new Error(`renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish`);
  }
  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = {
      index: item.index,
      section: item.section,
      paragraph: item.paragraph,
      kind: written.kind,
      text: written.text,
      claimIds: [...written.claimIds],
    };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
    return entry;
  });

  // The title and the description of the frontmatter, and the title of the ledger, come from the sentences of the ledger.
  const head = renderHead({ sentences });
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(head.title)}`,
    `description: ${JSON.stringify(head.description)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    ...(updatedAt === undefined ? [] : [`updatedAt: ${JSON.stringify(updatedAt)}`]),
    `categories: [${draft.categories.join(', ')}]`,
    'format: news',
    'featured: false',
    'author:',
    `  name: ${JSON.stringify(draft.author.name)}`,
    '---',
  ].join('\n');

  const cited = order.map((id) => claimsById.get(id) as Claim);
  const sources = new Map<string, LedgerEntry['sources'][number]>();
  for (const claim of cited) {
    if (sources.has(claim.source.url)) continue;
    const { url, tier, snapshotHash, retrievedAt, outlet } = claim.source;
    sources.set(url, outlet === undefined ? { url, tier, snapshotHash, retrievedAt } : { url, tier, snapshotHash, retrievedAt, outlet });
  }

  const ledger: LedgerEntry = {
    schemaVersion: 1,
    slug: draft.slug,
    runId: meta.runId,
    publishedAt: draft.publishedAt,
    title: head.title,
    categories: [...draft.categories],
    claims: structuredClone(cited),
    order,
    sentences,
    gate: {
      route: meta.gate.route,
      checks: { ...meta.gate.checks },
      holdReasons: [...meta.gate.holdReasons],
      warnings: meta.gate.warnings.map(({ code, where }) => (where === undefined ? { code } : { code, where })),
    },
    ...(release === undefined ? {} : { release }),
    ...(meta.verifier === undefined ? {} : { verifier: structuredClone(meta.verifier) }),
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
  };
  return { mdx: `${frontmatter}\n\n${renderBody(ledger)}`, ledger };
}
