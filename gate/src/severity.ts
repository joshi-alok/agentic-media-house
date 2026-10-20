/** How a finding of the gate counts: a blocker sends a draft back, a note is recorded and shown and never blocks. */
export const SEVERITIES = ['blocker', 'note'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * The codes that never block a piece. A check still reports them, and the ledger and the receipts page list them, so
 * what a soft rule would have cost is public. Every other code is a blocker, and so is a code that is not known at all: a check that gains a code
 * and is left out of this list cannot publish a piece by being left out.
 *
 * A note is a rule about the shape or the style of a piece, or about a word in a fact sentence or a heading that the model check judges better than a
 * word list can. A rule about analysis is never a note for a name or a figure, because the model check holds analysis only to adding nothing the passages do not support, and code stays the strict judge of what it may name or count. A blocker is a rule about a figure, a
 * quotation, a citation, a duplicate or the structure that the renderer needs. A word that mixes letters and digits (mid-2027, FY2027, 10x) is a figure,
 * although the reader of the gate takes it for a name, so G4_FIGURE_UNSUPPORTED blocks and is not on this list.
 */
export const NOTE_CODES: readonly string[] = [
  'G2_OPENING_LENGTH',
  'G2_TAKEAWAYS_COUNT',
  'G2_BODY_LENGTH',
  'G2_HEADING_QUESTION',
  'G2_HEADING_TOO_LONG',
  'G4_NAME_UNSUPPORTED',
  'G4_HEADING_NAME',
  'G4_NUMBER_WORD_UNCHECKABLE',
  'G7_ANALYSIS_SHARE',
  'G9_BANNED_PHRASE',
];

/** `note` for a code on the list of notes, `blocker` for every other code. */
export function severityOf(code: string, notes: readonly string[] = NOTE_CODES): Severity {
  return notes.includes(code) ? 'note' : 'blocker';
}
