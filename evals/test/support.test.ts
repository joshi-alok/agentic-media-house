import { describe, expect, it } from 'vitest';
import { buildLimitations, citedClaims } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { attributeTo, claimOf, limitationCiting, reportedBy, sentenceWith } from '../src/cases/support';

// The seeded cases are written with a few helpers. A helper that quietly did less than it says would make a case
// break the piece in a different way than its description says, so each is tested on its own.

describe('reportedBy', () => {
  it('makes a claim one that only the outlet reports: a tier-2 source that names it, with the basis reported', () => {
    const input = cloneGolden();
    reportedBy(input, 'c-19', 'Mercer Wire');
    const claim = claimOf(input, 'c-19');
    expect([claim.source.tier, claim.source.outlet, claim.basis]).toEqual([2, 'Mercer Wire', 'reported']);
  });

  it('changes no other claim', () => {
    const input = cloneGolden();
    reportedBy(input, 'c-19', 'Mercer Wire');
    const others = (claims: typeof input.claims) => claims.filter((claim) => claim.id !== 'c-19');
    expect(others(input.claims)).toEqual(others(cloneGolden().claims));
  });

  it('writes the limitation sentences again from the claims the piece cites, so that the reported claim is covered', () => {
    const input = cloneGolden();
    expect(input.draft.limitations.some((sentence) => sentence.claimIds.includes('c-19'))).toBe(false);
    reportedBy(input, 'c-19', 'Mercer Wire');
    expect(input.draft.limitations).toEqual(buildLimitations(citedClaims(input.draft, input.claims)));
    expect(input.draft.limitations.some((sentence) => sentence.claimIds.includes('c-19'))).toBe(true);
  });

  it('stops, saying so, when the golden piece has no such claim', () => {
    expect(() => reportedBy(cloneGolden(), 'c-999', 'Mercer Wire')).toThrow('seeded case: the golden piece has no claim c-999');
  });
});

describe('attributeTo', () => {
  it('writes a fact sentence as an attribution: the new text, marked attributed', () => {
    const input = cloneGolden();
    attributeTo(input, 'It lists 7 investors', 'Mercer Wire reports that 7 investors took part in the round.');
    expect(sentenceWith(input, 'Mercer Wire reports')).toEqual({
      kind: 'fact',
      text: 'Mercer Wire reports that 7 investors took part in the round.',
      claimIds: ['c-19'],
      attributed: true,
    });
  });

  it('marks only a fact sentence: an analysis sentence gets the new text and no flag', () => {
    const input = cloneGolden();
    attributeTo(input, 'The measured rate sits below', 'Mercer Wire reports that the measured rate sits below the maximum.');
    const sentence = sentenceWith(input, 'Mercer Wire reports');
    expect(sentence.kind).toBe('analysis');
    expect(sentence).not.toHaveProperty('attributed');
  });

  it('stops, saying so, when no sentence has the words', () => {
    expect(() => attributeTo(cloneGolden(), 'words that no sentence has', 'Anything.')).toThrow(
      'seeded case: no sentence of the golden piece contains "words that no sentence has"',
    );
  });
});

describe('limitationCiting', () => {
  it('finds the limitation sentence that cites the claim', () => {
    expect(limitationCiting(cloneGolden(), 'c-12').claimIds).toEqual(['c-12', 'c-13', 'c-14', 'c-15']);
  });

  it('gives the live sentence, so that a case can change it', () => {
    const input = cloneGolden();
    limitationCiting(input, 'c-12').claimIds = [];
    expect(input.draft.limitations.filter((sentence) => sentence.claimIds.length === 0)).toHaveLength(1);
  });

  it('gives the first sentence when two cite the claim', () => {
    expect(limitationCiting(cloneGolden(), 'c-27').template).toBe('basis');
  });

  it('stops, saying so, when no limitation sentence cites the claim', () => {
    expect(() => limitationCiting(cloneGolden(), 'c-99')).toThrow('seeded case: no limitation sentence of the golden piece cites c-99');
  });
});
