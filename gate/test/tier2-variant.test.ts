import { describe, expect, it } from 'vitest';
import { defaultContext } from '../src/config';
import { TIER2_OUTLET, cloneGolden, makeTier2Variant, makeVariant } from '../src/fixtures';
import { runGate } from '../src/gate';
import { Claim, Draft } from '../src/schemas';
import { allSentences } from '../src/sentences';
import { claimById, mutate } from './helpers';

// The tier-2 variant is the golden piece with one fact that another outlet
// reported, written the way check G6 demands. The gate does not publish such a
// piece by itself; it holds it for the owner. The site's fifth fixture piece
// is made from it, and the renderer tests use it.

const attributedSentence = (input: ReturnType<typeof cloneGolden>) =>
  allSentences(input.draft).find((item) => item.sentence.kind === 'fact' && item.sentence.text.startsWith(TIER2_OUTLET))?.sentence;

describe('makeTier2Variant', () => {
  const variant = makeTier2Variant(cloneGolden());

  it('passes every check and asks for a hold, because it rests on another outlet', () => {
    const result = runGate(variant, defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(result.route).toBe('hold');
  });

  it('turns the investor count into a tier-2 claim of the outlet, on a .example address with a hash of its own', () => {
    const claim = claimById(variant.claims, 'c-19');
    expect(claim.source.tier).toBe(2);
    expect(claim.source.outlet).toBe('Mercer Wire');
    expect(TIER2_OUTLET).toBe('Mercer Wire');
    expect(new URL(claim.source.url).hostname.endsWith('.example')).toBe(true);
    expect(claim.source.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const others = variant.claims.filter((item) => item.id !== 'c-19').map((item) => item.source.snapshotHash);
    expect(others).not.toContain(claim.source.snapshotHash);
    expect(claim.span.end - claim.span.start).toBe(claim.span.quote.length);
    expect(claim.span.quote).toContain('7');
  });

  it('writes the sentence that cites it as an attribution, marked attributed', () => {
    const sentence = attributedSentence(variant);
    expect(sentence).toEqual({ kind: 'fact', text: 'Mercer Wire reports that 7 investors took part in the round.', claimIds: ['c-19'], attributed: true });
  });

  it('changes nothing else: one claim and one sentence differ from the golden piece', () => {
    const golden = cloneGolden();
    expect(variant.claims.filter((claim, at) => JSON.stringify(claim) !== JSON.stringify(golden.claims[at])).map((claim) => claim.id)).toEqual(['c-19']);
    const before = allSentences(golden.draft).map((item) => JSON.stringify(item.sentence));
    const after = allSentences(variant.draft).map((item) => JSON.stringify(item.sentence));
    expect(after.filter((text, at) => text !== before[at])).toHaveLength(1);
  });

  it('keeps the claims and the draft valid against the schemas', () => {
    expect(() => Draft.parse(variant.draft)).not.toThrow();
    for (const claim of variant.claims) expect(() => Claim.parse(claim)).not.toThrow();
  });

  it('does not change the piece it is given', () => {
    const base = cloneGolden();
    makeTier2Variant(base);
    expect(base).toEqual(cloneGolden());
  });

  it('works on a variant of the golden piece too, and keeps the date of its retrieval', () => {
    const second = makeVariant(cloneGolden(), {
      slug: 'fixture-robotics-ships-fx-5-to-second-plant',
      publishedAt: '2026-09-30',
      categories: ['policy-standards', 'funding'],
      replace: [
        ['FX-1', 'FX-5'],
        ['fx-1', 'fx-5'],
        ['2026-10-04T04:30:00Z', '2026-09-30T04:30:00Z'],
      ],
    });
    const result = makeTier2Variant(second);
    expect(runGate(result, defaultContext()).route).toBe('hold');
    expect(claimById(result.claims, 'c-19').source.retrievedAt).toBe('2026-09-30T04:30:00Z');
  });

  it('stops, saying what is missing, when the piece has no investor-count claim or no sentence that cites it', () => {
    const noClaim = mutate(cloneGolden(), (g) => {
      g.claims = g.claims.filter((claim) => claim.id !== 'c-19');
    });
    expect(() => makeTier2Variant(noClaim)).toThrow('makeTier2Variant: the piece has no claim c-19');
    const noSentence = mutate(cloneGolden(), (g) => {
      for (const item of allSentences(g.draft)) if (item.sentence.text === 'It lists 7 investors in the round.') item.sentence.text = 'Seven investors took part.';
    });
    expect(() => makeTier2Variant(noSentence)).toThrow('makeTier2Variant: the piece has no sentence "It lists 7 investors in the round."');
  });
});
