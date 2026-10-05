import type { LedgerEntry, LedgerSentence } from '../schemas';
import { escapeMdx } from './escape';

export const TAKEAWAYS_HEADING = 'Key takeaways';
export const LIMITATIONS_HEADING = "What we couldn't verify";

/** Consecutive items that have the same key, in order. */
function runs<T>(items: readonly T[], keyOf: (item: T) => string | number): T[][] {
  const found: T[][] = [];
  for (const item of items) {
    const last = found.at(-1);
    if (last !== undefined && keyOf(last[0] as T) === keyOf(item)) last.push(item);
    else found.push([item]);
  }
  return found;
}

/**
 * The body of the article, as MDX, written from its ledger alone: the text under the frontmatter,
 * ending with one newline. `renderDraft` writes the article body with this function and no other,
 * and the site builds a piece only if the body of its MDX file is exactly this, so the article and
 * its ledger cannot say different things.
 *
 * What it uses from each ledger sentence: its section, paragraph and heading (they say where the
 * sentence goes), its kind and `attributed` (they say which label it carries), its text and the
 * claims it cites; the markers are numbered by the order of the ledger. A sentence that cites a claim
 * the order does not list is an error, and so is a body sentence with no heading. Text is escaped as
 * `renderDraft` escapes it.
 */
export function renderBody(ledger: LedgerEntry): string {
  const markerOf = new Map(ledger.order.map((id, at) => [id, at + 1]));
  const receipts = `/news/${ledger.slug}/receipts/`;
  const marker = (id: string): string => {
    const number = markerOf.get(id);
    if (number === undefined) throw new Error(`renderBody: a sentence cites ${id}, but the order of the ledger does not list it`);
    return `[${number}](${receipts}#${id})`;
  };
  const sentence = (item: LedgerSentence): string => {
    // A sentence has at most one label: analysis is the Desk's reading, "Unconfirmed." marks a fact it only attributes.
    const label = item.kind === 'analysis' ? '**Analysis.** ' : item.kind === 'fact' && item.attributed === true ? '**Unconfirmed.** ' : '';
    return `${label}${escapeMdx(item.text)}${[...new Set(item.claimIds)].map(marker).join('')}`;
  };
  const headingOf = (item: LedgerSentence): string => {
    if (item.heading === undefined) throw new Error(`renderBody: the body sentence ${item.index} has no heading`);
    return item.heading;
  };
  const paragraphs = (items: readonly LedgerSentence[]): LedgerSentence[][] => runs(items, (item) => item.paragraph);
  const paragraph = (items: readonly LedgerSentence[]): string => items.map(sentence).join(' ');
  const sentencesOf = (section: LedgerSentence['section']): LedgerSentence[] => ledger.sentences.filter((item) => item.section === section);

  const blocks: string[] = [];
  for (const items of paragraphs(sentencesOf('opening'))) blocks.push(paragraph(items));

  const takeaways = paragraphs(sentencesOf('takeaways'));
  if (takeaways.length > 0) {
    blocks.push(`## ${TAKEAWAYS_HEADING}`);
    blocks.push(takeaways.map((items) => `- ${paragraph(items)}`).join('\n'));
  }

  for (const section of runs(sentencesOf('body'), headingOf)) {
    blocks.push(`## ${escapeMdx(headingOf(section[0] as LedgerSentence))}`);
    for (const items of paragraphs(section)) blocks.push(paragraph(items));
  }

  const limitations = paragraphs(sentencesOf('limitations'));
  if (limitations.length > 0) {
    blocks.push(`## ${LIMITATIONS_HEADING}`);
    for (const items of limitations) blocks.push(paragraph(items));
  }
  return `${blocks.join('\n\n')}\n`;
}
