import type { LedgerEntry } from '../schemas';

/** The title and the description of a piece, as its frontmatter has them. */
export interface RenderedHead {
  title: string;
  description: string;
}

/** The text of the one sentence of `section`, or an error that names the section when there is none or more than one. */
function only(sentences: LedgerEntry['sentences'], section: 'title' | 'description'): string {
  const found = sentences.filter((item) => item.section === section);
  if (found.length === 0) throw new Error(`renderHead: the ledger has no ${section} sentence`);
  if (found.length > 1) throw new Error(`renderHead: the ledger has ${found.length} ${section} sentences, not 1`);
  return (found[0] as LedgerEntry['sentences'][number]).text;
}

/**
 * The title and the description of the frontmatter of a piece, written from its ledger alone: the text of the
 * ledger's title sentence and of its description sentence, with the spaces around each taken off, which is what
 * the frontmatter schema does to them when it reads the file. `renderDraft` writes the frontmatter (and the
 * title of the ledger) with this function and no other, and the site builds a piece only if its title and
 * description are exactly these, so that the page, the share card, the feed and the receipts cannot say a
 * different headline from the one the gate cleared. A ledger with no title sentence or no description
 * sentence, or with two of either, is an error.
 */
export function renderHead(ledger: Pick<LedgerEntry, 'sentences'>): RenderedHead {
  return {
    title: only(ledger.sentences, 'title').trim(),
    description: only(ledger.sentences, 'description').trim(),
  };
}
