import { describe, expect, it } from 'vitest';
import { LedgerEntry, defaultContext, renderDraft, runGate } from '../src';
import { cloneGolden } from '../src/fixtures';

describe('the ledger records the notes of the gate', () => {
  it('lists the code and the place of each note, and nothing else', () => {
    const piece = cloneGolden();
    const gate = runGate(piece, defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
    expect(gate.route).toBe('publish');
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate });
    expect(ledger.gate.warnings).toEqual([{ code: 'G2_BODY_LENGTH', where: 'body' }]);
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });

  it('lists no notes for a piece that has none', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(ledger.gate.warnings).toEqual([]);
  });

  it('reads a ledger written before notes existed as one with no notes', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    const { warnings: _warnings, ...gateWithout } = ledger.gate;
    expect(LedgerEntry.parse({ ...ledger, gate: gateWithout }).gate.warnings).toEqual([]);
  });

  it('refuses a note that has no code', () => {
    const piece = cloneGolden();
    const { ledger } = renderDraft(piece.draft, piece.claims, { runId: 'run-1', gate: runGate(piece, defaultContext()) });
    expect(LedgerEntry.safeParse({ ...ledger, gate: { ...ledger.gate, warnings: [{ code: '' }] } }).success).toBe(false);
  });
});
