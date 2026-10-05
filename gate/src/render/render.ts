import type { GateResult } from '../gate';
import { dayNumber } from '../normalise';
import type { Claim, Draft, LedgerEntry, LedgerSentence, Sentence } from '../schemas';
import { allSentences } from '../sentences';
import type { LocatedSentence } from '../sentences';
import { escapeMdx } from './escape';

/** What the renderer needs besides the draft and the claims. */
export interface RenderMeta {
  runId: string;
  gate: GateResult;
  verifier?: LedgerEntry['verifier'];
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

const TAKEAWAYS_HEADING = 'Key takeaways';
const LIMITATIONS_HEADING = "What we couldn't verify";
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
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
  const located = allSentences(draft);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  const order = claimOrder(located);
  for (const id of order) {
    if (!claimsById.has(id)) throw new Error(`renderDraft: a sentence cites ${id}, but no claim has that id`);
  }
  const markerOf = new Map(order.map((id, at) => [id, at + 1]));

  const receipts = `/news/${draft.slug}/receipts/`;
  const marker = (id: string) => `[${markerOf.get(id)}](${receipts}#${id})`;
  const sentence = (item: Sentence): string => {
    // A sentence has at most one label: analysis is the Desk's reading, "Unconfirmed." marks a fact it only attributes.
    const label = item.kind === 'analysis' ? '**Analysis.** ' : item.kind === 'fact' && item.attributed === true ? '**Unconfirmed.** ' : '';
    const markers = [...new Set(item.claimIds)].map(marker).join('');
    return `${label}${escapeMdx(item.text)}${markers}`;
  };
  const paragraph = (items: readonly Sentence[]): string => items.map(sentence).join(' ');

  for (const category of draft.categories) {
    if (!PLAIN_SLUG.test(category)) throw new Error(`renderDraft: the category "${category}" is not a plain slug`);
  }
  const { updatedAt } = meta;
  if (updatedAt !== undefined) {
    const day = dayNumber(updatedAt);
    if (day === undefined) throw new Error(`renderDraft: updatedAt "${updatedAt}" is not a real date in the form YYYY-MM-DD`);
    if (day < (dayNumber(draft.publishedAt) ?? NaN)) throw new Error(`renderDraft: updatedAt "${updatedAt}" is before publishedAt "${draft.publishedAt}"`);
  }
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(draft.title.text)}`,
    `description: ${JSON.stringify(draft.description.text)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    ...(updatedAt === undefined ? [] : [`updatedAt: ${JSON.stringify(updatedAt)}`]),
    `categories: [${draft.categories.join(', ')}]`,
    'format: news',
    'featured: false',
    'author:',
    `  name: ${JSON.stringify(draft.author.name)}`,
    '---',
  ].join('\n');

  const blocks: string[] = [];
  if (draft.opening.length > 0) blocks.push(paragraph(draft.opening));
  if (draft.takeaways.length > 0) {
    blocks.push(`## ${TAKEAWAYS_HEADING}`);
    blocks.push(draft.takeaways.map((item) => `- ${sentence(item)}`).join('\n'));
  }
  for (const section of draft.sections) {
    blocks.push(`## ${escapeMdx(section.heading)}`);
    for (const paragraphOf of section.paragraphs) blocks.push(paragraph(paragraphOf));
  }
  if (draft.limitations.length > 0) {
    blocks.push(`## ${LIMITATIONS_HEADING}`);
    blocks.push(paragraph(draft.limitations));
  }
  const mdx = `${frontmatter}\n\n${blocks.join('\n\n')}\n`;

  const cited = order.map((id) => claimsById.get(id) as Claim);
  const sources = new Map<string, LedgerEntry['sources'][number]>();
  for (const claim of cited) {
    if (sources.has(claim.source.url)) continue;
    const { url, tier, snapshotHash, retrievedAt, outlet } = claim.source;
    sources.set(url, outlet === undefined ? { url, tier, snapshotHash, retrievedAt } : { url, tier, snapshotHash, retrievedAt, outlet });
  }

  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = { index: item.index, section: item.section, kind: written.kind, text: written.text, claimIds: [...written.claimIds] };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
    return entry;
  });

  const ledger: LedgerEntry = {
    schemaVersion: 1,
    slug: draft.slug,
    runId: meta.runId,
    publishedAt: draft.publishedAt,
    title: draft.title.text,
    categories: [...draft.categories],
    claims: structuredClone(cited),
    order,
    sentences,
    gate: { route: meta.gate.route, checks: { ...meta.gate.checks }, holdReasons: [...meta.gate.holdReasons] },
    ...(meta.verifier === undefined ? {} : { verifier: structuredClone(meta.verifier) }),
    sources: [...sources.values()].sort((a, b) => byText(a.url, b.url)),
  };
  return { mdx, ledger };
}
