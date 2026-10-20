/** How a finding of the gate counts: a blocker sends a draft back, a note is recorded and shown and never blocks. */
export const SEVERITIES = ['blocker', 'note'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * The codes that never block a piece. A check still reports them, and the ledger and the receipts page will list them (Plan 3, Tasks 6 and 7), so
 * what a soft rule would have cost is public. The list is empty until Tasks 2 and 3 fill it. Every other code is a blocker, and so is a code that is
 * not known at all: a check that gains a code and is left out of this list cannot publish a piece by being left out.
 *
 * A note is a rule about the shape or the style of a piece, or about a word the model check judges better than a word list can. A blocker is a rule
 * about a figure, a quotation, a citation, a duplicate or the structure that the renderer needs.
 */
export const NOTE_CODES: readonly string[] = [];

/** `note` for a code on the list of notes, `blocker` for every other code. */
export function severityOf(code: string, notes: readonly string[] = NOTE_CODES): Severity {
  return notes.includes(code) ? 'note' : 'blocker';
}
