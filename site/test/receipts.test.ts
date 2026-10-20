import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, LedgerEntry, defaultContext, runGate } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { CHECKS_PASSED_TEXT, receiptsView, releaseNote, routeText } from '../src/lib/receipts';

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

  it('carries the label and the quoted span of each claim, and not the text, which a model paraphrased', () => {
    const first = view.claims[0]!;
    expect(first.label).toBe('second plant');
    expect('text' in first).toBe(false);
    for (const claim of view.claims) expect(Object.keys(claim), claim.id).not.toContain('text');
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

  it('marks a claim from a tier-2 source as unconfirmed, and a tier-1 claim as not', () => {
    expect(view.claims.every((claim) => claim.unconfirmed === false)).toBe(true);
    const outlet = structuredClone(golden);
    outlet.claims[0]!.source = { ...outlet.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    const claims = receiptsView(outlet).claims;
    expect(claims.map((claim) => claim.unconfirmed)).toEqual([true, ...claims.slice(1).map(() => false)]);
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

  it('carries the route, and each hold reason with its code and its words', () => {
    expect(view.gate.route).toBe('publish');
    expect(view.gate.holdReasons).toEqual([]);
    const held = structuredClone(golden);
    held.gate = { route: 'hold', checks: { ...held.gate.checks, G6: 'fail' }, holdReasons: ['TIER2_ATTRIBUTION'], notes: [] };
    const heldView = receiptsView(held);
    expect(heldView.gate.route).toBe('hold');
    expect(heldView.gate.holdReasons).toEqual([{ code: 'TIER2_ATTRIBUTION', label: "Rests on another outlet's reporting" }]);
    expect(heldView.gate.checks.find((check) => check.id === 'G6')).toEqual({ id: 'G6', result: 'fail' });
  });

  it('shows a hold reason that has no label by its code, so that nothing is hidden', () => {
    const odd = structuredClone(golden);
    odd.gate.holdReasons = ['SOMETHING_NEW'];
    expect(receiptsView(odd).gate.holdReasons).toEqual([{ code: 'SOMETHING_NEW', label: 'SOMETHING_NEW' }]);
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

describe('routeText', () => {
  it('says in words what the gate did, so that a route is never shown on its own', () => {
    expect(routeText('publish')).toBe('The gate cleared this piece.');
    expect(routeText('hold')).toBe('This draft was held for the owner.');
    expect(routeText('revise')).toBe('The gate sent this draft back for revision.');
  });

  it('is part of the gate summary', () => {
    expect(view.gate.routeText).toBe(routeText(view.gate.route));
    const held = structuredClone(golden);
    held.gate = { route: 'hold', checks: held.gate.checks, holdReasons: ['TIER2_ATTRIBUTION'], notes: [] };
    delete held.release;
    expect(receiptsView(held).gate.routeText).toBe('This draft was held for the owner.');
  });

  // A hold comes from a blocker that stood after two rounds of revision, or from the model check, which is not the gate: the words do not say which.
  it('does not say who held a draft, because a hold can come from the model check as well as from the gate', () => {
    expect(routeText('hold')).not.toMatch(/\bgate\b/i);
    expect(routeText('publish')).toBe('The gate cleared this piece.');
    expect(routeText('revise')).toBe('The gate sent this draft back for revision.');
  });
});

describe('releaseNote', () => {
  it('says that the gate published the piece without a human, for auto', () => {
    expect(releaseNote('auto')).toBe('Published by the gate without a human.');
  });

  it('says that the piece was held and the owner released it, for owner, without saying who held it', () => {
    expect(releaseNote('owner')).toBe('Held for the owner, then released by the owner.');
    expect(releaseNote('owner')).not.toMatch(/\bgate\b/i);
  });

  it('says nothing when the ledger does not say', () => {
    expect(releaseNote(undefined)).toBeUndefined();
  });
});

describe('receiptsView: how the piece was released', () => {
  const without = (() => {
    const copy = structuredClone(golden);
    delete copy.release;
    return copy;
  })();

  it('has no note when the ledger has no release, and no key either', () => {
    expect(receiptsView(without).releaseNote).toBeUndefined();
    expect('releaseNote' in receiptsView(without)).toBe(false);
  });

  it('has the note for auto', () => {
    expect(receiptsView({ ...without, release: 'auto' }).releaseNote).toBe('Published by the gate without a human.');
  });

  it('has the note for owner', () => {
    const held = structuredClone(without);
    held.gate = { route: 'hold', checks: held.gate.checks, holdReasons: ['TIER2_ATTRIBUTION'], notes: [] };
    expect(receiptsView({ ...held, release: 'owner' }).releaseNote).toBe('Held for the owner, then released by the owner.');
  });
});

describe('CHECKS_PASSED_TEXT', () => {
  it('says that a check passes when it found no blocker, and that a note does not fail it', () => {
    expect(CHECKS_PASSED_TEXT).toBe(
      'A check passes when it found no blocker. A note does not fail a check, so a piece that has only notes still shows every check as passed; its notes are listed below the checks.',
    );
  });

  // The sentence is true of the gate and of the ledger: a piece with notes and no blocker has every check as pass, and its notes are in the view.
  it('is true: a piece with only notes has all nine checks as pass, the route publish, and its notes listed', () => {
    const noted = cloneGolden();
    noted.draft.takeaways = noted.draft.takeaways.slice(0, 1);
    const result = runGate(noted, defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(Object.values(result.checks)).toEqual(CHECK_IDS.map(() => 'pass'));
    const ledger = structuredClone(golden);
    ledger.gate = { route: 'publish', checks: result.checks, holdReasons: [], notes: result.warnings.map(({ code, where }) => (where === undefined ? { code } : { code, where })) };
    const shown = receiptsView(ledger).gate;
    expect(shown.checks.every((check) => check.result === 'pass')).toBe(true);
    expect(shown.notes.length).toBeGreaterThan(0);
  });

  it('is printed by the receipts page, between the count of the checks and the list of them', () => {
    const page = readFileSync(new URL('../src/pages/news/[slug]/receipts/index.astro', import.meta.url), 'utf8');
    expect(page).toContain('{CHECKS_PASSED_TEXT}');
    expect(page.indexOf('checks passed.')).toBeLessThan(page.indexOf('{CHECKS_PASSED_TEXT}'));
    expect(page.indexOf('{CHECKS_PASSED_TEXT}')).toBeLessThan(page.indexOf('<ul class="checks">'));
  });

  // It says that the notes are listed below, so a piece with no note does not carry it.
  it('is printed only when the piece has notes, because it says that they are listed below the checks', () => {
    const page = readFileSync(new URL('../src/pages/news/[slug]/receipts/index.astro', import.meta.url), 'utf8');
    expect(page).toContain('{view.gate.notes.length > 0 && <p>{CHECKS_PASSED_TEXT}</p>}');
    expect(page.match(/CHECKS_PASSED_TEXT/g)).toHaveLength(2); // the import and the one place where it is printed
    expect(view.gate.notes).toEqual([]);
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
    result.gate.holdReasons.push({ code: 'x', label: 'x' });
    result.verifier!.notes.push('x');
    expect(copy.gate.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(copy.verifier.notes).toEqual(['one']);
  });
});
