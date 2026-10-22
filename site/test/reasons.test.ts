import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS } from '@robywire/gate';
import { REASON_LABELS, reasonLabel } from '../src/lib/reasons';

// The holds page tells a reader why the gate stopped a draft. The gate reports
// codes such as G4_NUMBER_UNSUPPORTED; a reader needs words. These tests make a
// code without words impossible: a check that gains a code fails here until
// the code is labelled.

describe('REASON_LABELS', () => {
  it('has a label for every failure code the gate can report', () => {
    const missing = ALL_FAILURE_CODES.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has a label for every hold reason, and TIER2_ATTRIBUTION is one of them', () => {
    expect(HOLD_REASONS).toContain('TIER2_ATTRIBUTION');
    const missing = HOLD_REASONS.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has a label for every reason the model check can give for a hold', () => {
    const missing = VERIFIER_REASONS.filter((code) => !Object.hasOwn(REASON_LABELS, code));
    expect(missing).toEqual([]);
  });

  it('has no label for a code that does not exist, so a removed code does not leave a stale label', () => {
    const known = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS, ...VERIFIER_REASONS]);
    const stale = Object.keys(REASON_LABELS).filter((code) => !known.has(code));
    expect(stale).toEqual([]);
  });

  it('gives each code its own label', () => {
    const labels = Object.values(REASON_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('writes every label as a short plain phrase: it starts with a capital, does not end in a full stop and does not repeat the code', () => {
    for (const [code, label] of Object.entries(REASON_LABELS)) {
      expect(label, code).toMatch(/^[A-Z]/);
      expect(label, code).not.toMatch(/[.!?]$/);
      expect(label.length, code).toBeLessThanOrEqual(70);
      expect(label, code).not.toMatch(/\bG\d_|_/);
    }
  });
});

describe('reasonLabel', () => {
  it('returns the label of a failure code', () => {
    expect(reasonLabel('G4_NUMBER_UNSUPPORTED')).toBe('A number was not in the claims it cites');
  });

  it('returns the label of the figure-like word, which is a blocker and not a note', () => {
    expect(reasonLabel('G4_FIGURE_UNSUPPORTED')).toBe('A figure-like word was not in the claims it cites');
  });

  it('returns the label of the tier-2 hold reason', () => {
    expect(reasonLabel('TIER2_ATTRIBUTION')).toBe("Rests on another outlet's reporting");
  });

  it('shows a code it does not know exactly as it is, so a new reason is never hidden', () => {
    expect(reasonLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('does not take a name from the object prototype for a code', () => {
    expect(reasonLabel('constructor')).toBe('constructor');
    expect(reasonLabel('toString')).toBe('toString');
  });
});
