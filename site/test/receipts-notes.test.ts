import { readFileSync } from 'node:fs';
import { LedgerEntry } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { receiptsView } from '../src/lib/receipts';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const ledgerOf = (): LedgerEntry =>
  LedgerEntry.parse(JSON.parse(readFileSync(new URL(`../src/content-fixtures/ledger/${SLUG}.json`, import.meta.url), 'utf8')));

describe('receiptsView: the notes', () => {
  it('has no notes for a piece that has none', () => {
    expect(receiptsView(ledgerOf()).gate.notes).toEqual([]);
  });

  it('turns a note into its code, its words and how many times it was found', () => {
    const ledger = ledgerOf();
    ledger.gate.notes = [{ code: 'G2_BODY_LENGTH', where: 'body' }];
    expect(receiptsView(ledger).gate.notes).toEqual([{ code: 'G2_BODY_LENGTH', label: 'The piece was too short or too long', count: 1 }]);
  });

  it('groups the findings of one code, in the order in which each code first came up, and counts them', () => {
    const ledger = ledgerOf();
    ledger.gate.notes = [
      { code: 'G2_BODY_LENGTH', where: 'body' },
      { code: 'G9_BANNED_PHRASE', where: 'delve' },
      { code: 'G9_BANNED_PHRASE', where: 'game-changer' },
      { code: 'G9_BANNED_PHRASE', where: 'delve' },
      { code: 'G2_BODY_LENGTH' },
    ];
    expect(receiptsView(ledger).gate.notes).toEqual([
      { code: 'G2_BODY_LENGTH', label: 'The piece was too short or too long', count: 2 },
      { code: 'G9_BANNED_PHRASE', label: 'A banned filler phrase was used', count: 3 },
    ]);
  });

  it('does not change the notes of the ledger it is given', () => {
    const ledger = ledgerOf();
    ledger.gate.notes = [{ code: 'G9_BANNED_PHRASE', where: 'delve' }, { code: 'G9_BANNED_PHRASE', where: 'delve' }];
    const before = structuredClone(ledger.gate.notes);
    receiptsView(ledger);
    expect(ledger.gate.notes).toEqual(before);
  });

  it('shows a code it has no words for as it is', () => {
    const ledger = ledgerOf();
    ledger.gate.notes = [{ code: 'G9_SOMETHING_NEW' }];
    expect(receiptsView(ledger).gate.notes).toEqual([{ code: 'G9_SOMETHING_NEW', label: 'G9_SOMETHING_NEW', count: 1 }]);
  });

  it('never shows where a note was found: that is a place for most codes and a phrase for one', () => {
    const ledger = ledgerOf();
    ledger.gate.notes = [{ code: 'G9_BANNED_PHRASE', where: 'delve' }];
    expect(JSON.stringify(receiptsView(ledger).gate.notes)).not.toContain('delve');
  });
});
