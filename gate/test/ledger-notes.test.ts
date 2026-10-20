import { describe, expect, it } from 'vitest';
import { LedgerEntry, defaultContext, renderDraft, runGate } from '../src';
import { cloneGolden } from '../src/fixtures';

describe('the ledger records the notes of the gate', () => {
  it('lists the code and the place of each note, and nothing else', () => {
    const piece = cloneGolden();
    const gate = runGate(piece, defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
    expect(gate.route).toBe('publish');
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate });
    expect(ledger.gate.notes).toEqual([{ code: 'G2_BODY_LENGTH', where: 'body' }]);
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });

  it('lists no notes for a piece that has none', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(ledger.gate.notes).toEqual([]);
  });

  it('reads a ledger written before notes existed as one with no notes', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    const { notes: _notes, ...gateWithout } = ledger.gate;
    expect(LedgerEntry.parse({ ...ledger, gate: gateWithout }).gate.notes).toEqual([]);
  });

  it('refuses a note that has no code', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(LedgerEntry.safeParse({ ...ledger, gate: { ...ledger.gate, notes: [{ code: '' }] } }).success).toBe(false);
  });

  it('keeps the notes in the order in which the gate found them, and keeps the repeats', () => {
    const piece = cloneGolden();
    const gate = runGate(piece, defaultContext({ config: { bodyWords: { min: 5000, max: 6000 }, bannedPhrases: ['begun shipping'] } }));
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate });
    expect(ledger.gate.notes.map((note) => note.code)).toEqual(gate.warnings.map((note) => note.code));
    expect(ledger.gate.notes.map((note) => note.code)).toEqual(['G2_BODY_LENGTH', 'G9_BANNED_PHRASE', 'G9_BANNED_PHRASE']);
  });

  it('writes no place for a note that has none, not even an empty one', () => {
    const piece = cloneGolden();
    const gate = { ...runGate(piece, defaultContext()), warnings: [{ check: 'G2' as const, code: 'G2_BODY_LENGTH', message: 'a message that must not be stored' }] };
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate });
    expect(ledger.gate.notes).toStrictEqual([{ code: 'G2_BODY_LENGTH' }]);
    expect(JSON.stringify(ledger)).not.toContain('must not be stored');
  });

  it('refuses a note that has a place and no code', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(LedgerEntry.safeParse({ ...ledger, gate: { ...ledger.gate, notes: [{ where: 'body' }] } }).success).toBe(false);
  });
});

/** A ledger of the golden piece whose gate left one note (the body is far too short for the limits in the context). */
function ledgerWithNotes(): LedgerEntry {
  const piece = cloneGolden();
  const gate = runGate(piece, defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
  return renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate }).ledger;
}

describe('the ledger field for the notes of the gate', () => {
  it('is called notes, and a ledger that still says warnings is refused', () => {
    const entry = ledgerWithNotes();
    expect(entry.gate.notes).toEqual([{ code: 'G2_BODY_LENGTH', where: 'body' }]);
    expect(LedgerEntry.parse(entry).gate.notes).toEqual(entry.gate.notes);
    const old = structuredClone(entry) as Record<string, any>;
    old.gate.warnings = old.gate.notes;
    delete old.gate.notes;
    expect(LedgerEntry.safeParse(old).success).toBe(false);
  });

  it('is empty, not missing, for a ledger written without notes', () => {
    const entry = structuredClone(ledgerWithNotes()) as Record<string, any>;
    delete entry.gate.notes;
    expect(LedgerEntry.parse(entry).gate.notes).toEqual([]);
  });
});
