import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, LedgerEntry } from '@robywire/gate';
import { receiptsView } from '../src/lib/receipts';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
const golden = LedgerEntry.parse(JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')));
const view = receiptsView(golden);

describe('receiptsView: the claims', () => {
  it('lists the claims in the order the article first cites them, numbered from 1', () => {
    expect(view.claims.map((claim) => claim.id)).toEqual(golden.order);
    expect(view.claims.map((claim) => claim.marker)).toEqual(golden.order.map((_id, at) => at + 1));
    expect(view.claims.slice(0, 3).map((claim) => [claim.marker, claim.id])).toEqual([
      [1, 'c-1'],
      [2, 'c-23'],
      [3, 'c-26'],
    ]);
  });

  it('carries the label, the text and the quoted span of each claim', () => {
    const first = view.claims[0]!;
    expect(first.label).toBe('Tarnmoor shipment');
    expect(first.text).toBe('Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.');
    expect(first.quote).toBe(
      'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    );
  });

  it('carries the source, the short hash, the basis and the status', () => {
    const first = view.claims[0]!;
    expect(first.source).toEqual({ url: 'https://fixture-robotics.example/news/fx-1-second-plant', tier: 1, retrievedAt: '2026-10-04T04:30:00Z' });
    const full = golden.claims.find((claim) => claim.id === 'c-1')!.source.snapshotHash;
    expect(first.hash).toBe(full.slice(0, 12));
    expect(first.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(first.basis).toBe('press-release');
    expect(first.status).toBe('unspecified');
  });

  it('lists the 0-based indexes of the sentences that cite the claim', () => {
    const first = view.claims[0]!;
    const expected = golden.sentences.filter((s) => s.claimIds.includes('c-1')).map((s) => s.index);
    expect(first.citedBy).toEqual(expected);
    expect(first.citedBy[0]).toBe(0);
    expect(first.citedBy.length).toBeGreaterThan(3);
    for (const claim of view.claims) expect(claim.citedBy.length, claim.id).toBeGreaterThan(0);
  });

  it('includes the outlet only for a source that has one', () => {
    expect('outlet' in view.claims[0]!.source).toBe(false);
    const withOutlet = structuredClone(golden);
    withOutlet.claims[0]!.source = { ...withOutlet.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    expect(receiptsView(withOutlet).claims[0]!.source).toEqual({
      url: 'https://fixture-robotics.example/news/fx-1-second-plant',
      tier: 2,
      outlet: 'Mercer Wire',
      retrievedAt: '2026-10-04T04:30:00Z',
    });
  });
});

describe('receiptsView: the gate summary', () => {
  it('lists G1 to G9 in order, each with its result', () => {
    expect(view.gate.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
    expect(view.gate.checks.every((check) => check.result === 'pass')).toBe(true);
  });

  it('lists the checks in order whatever order the ledger stores them in', () => {
    const shuffled = structuredClone(golden);
    shuffled.gate.checks = Object.fromEntries(Object.entries(shuffled.gate.checks).reverse()) as typeof shuffled.gate.checks;
    expect(receiptsView(shuffled).gate.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
  });

  it('carries the route and the hold reasons', () => {
    expect(view.gate.route).toBe('publish');
    expect(view.gate.holdReasons).toEqual([]);
    const held = structuredClone(golden);
    held.gate = { route: 'hold', checks: { ...held.gate.checks, G6: 'fail' }, holdReasons: ['TIER2_ATTRIBUTION'] };
    const heldView = receiptsView(held);
    expect(heldView.gate.route).toBe('hold');
    expect(heldView.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(heldView.gate.checks.find((check) => check.id === 'G6')).toEqual({ id: 'G6', result: 'fail' });
  });

  it('has no verifier row when the ledger has no verifier', () => {
    expect(view.verifier).toBeUndefined();
    expect('verifier' in view).toBe(false);
  });

  it('has the verifier row when the ledger has one', () => {
    const checked = structuredClone(golden);
    checked.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['every sentence entailed'] };
    expect(receiptsView(checked).verifier).toEqual({ model: 'claude-sonnet-5-5', passed: true, notes: ['every sentence entailed'] });
  });
});

describe('receiptsView: the page header', () => {
  it('carries the slug and the title', () => {
    expect(view.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
    expect(view.title).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
  });
});

describe('receiptsView: a ledger that does not hold together', () => {
  it('throws when the order names a claim the ledger does not hold', () => {
    const broken = structuredClone(golden);
    broken.order.push('c-99');
    expect(() => receiptsView(broken)).toThrow('receiptsView: the order lists c-99, but the ledger holds no such claim');
  });

  it('throws when the ledger holds a claim the order leaves out', () => {
    const broken = structuredClone(golden);
    broken.order = broken.order.filter((id) => id !== 'c-5');
    expect(() => receiptsView(broken)).toThrow('receiptsView: the ledger holds c-5, but the order does not list it');
  });
});

describe('receiptsView', () => {
  it('does not change the ledger it is given', () => {
    const copy = structuredClone(golden);
    receiptsView(copy);
    expect(copy).toEqual(golden);
  });

  it('returns lists of its own, so changing the view cannot change the ledger', () => {
    const copy = structuredClone(golden);
    copy.gate.holdReasons = ['TIER2_ATTRIBUTION'];
    copy.verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['one'] };
    const result = receiptsView(copy);
    result.gate.holdReasons.push('x');
    result.verifier!.notes.push('x');
    expect(copy.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(copy.verifier.notes).toEqual(['one']);
  });
});
