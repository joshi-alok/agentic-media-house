import { describe, expect, it } from 'vitest';
import { BASES, BEATS, CATEGORY_VOCAB, CROSS_TAGS, SAFE_BASES } from '../src/constants';
import { BASIS_NOTES } from '../src/limitations';

// The closed vocabularies of the domain. A piece is filed under these beats and each claim has one of these bases; the gate refuses anything else.

describe('the beats', () => {
  it('are the seven of AI agents in crypto, in the order of the site', () => {
    expect(BEATS).toEqual([
      'payments-commerce',
      'identity-trust',
      'wallets-keys',
      'protocols-standards',
      'agent-infrastructure',
      'security-incidents',
      'policy-regulation',
    ]);
  });

  it('have one cross tag, funding, and the vocabulary of categories is the beats and the tag', () => {
    expect(CROSS_TAGS).toEqual(['funding']);
    expect(CATEGORY_VOCAB).toEqual([...BEATS, 'funding']);
  });
});

describe('the bases', () => {
  it('are the nine of the domain: documentation and announcements of a project instead of datasheets and press releases', () => {
    expect([...BASES].sort()).toEqual(['announcement', 'briefing', 'demo', 'docs', 'filing', 'measured', 'paper', 'reported', 'standard']);
  });

  it('keep the safe ones: a filing, a standard, a paper or a measurement needs no note; what a project says of itself and what another outlet reports does', () => {
    expect([...SAFE_BASES].sort()).toEqual(['filing', 'measured', 'paper', 'standard']);
    for (const basis of ['docs', 'announcement', 'briefing', 'demo', 'reported'] as const) expect((SAFE_BASES as readonly string[]).includes(basis), basis).toBe(false);
  });

  it('have a note for each, and none says datasheet or press release', () => {
    for (const basis of BASES) expect(BASIS_NOTES[basis], basis).toBeTruthy();
    for (const note of Object.values(BASIS_NOTES)) expect(note).not.toMatch(/datasheet|press release/i);
  });
});
