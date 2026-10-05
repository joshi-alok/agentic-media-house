import { describe, expect, it } from 'vitest';
import {
  BASES,
  BEATS,
  CATEGORY_VOCAB,
  CHECK_IDS,
  CLAIM_TYPES,
  CROSS_TAGS,
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  SAFE_BASES,
  STATUSES,
} from '../src/constants';

describe('closed vocabularies', () => {
  it('lists the seven beats from the content contract, in contract order', () => {
    expect(BEATS).toEqual([
      'humanoids',
      'home-consumer',
      'industrial-warehouse',
      'field-mobility',
      'software-autonomy',
      'components-supply-chain',
      'policy-standards',
    ]);
  });

  it('has funding as the only cross-cutting tag', () => {
    expect(CROSS_TAGS).toEqual(['funding']);
  });

  it('allows the beats plus the cross tags as categories, and nothing else', () => {
    expect(CATEGORY_VOCAB).toEqual([...BEATS, 'funding']);
    expect(new Set(CATEGORY_VOCAB).size).toBe(CATEGORY_VOCAB.length);
  });

  it('names the eight claim bases, four statuses and six claim types', () => {
    expect(BASES).toEqual([
      'datasheet',
      'press-release',
      'briefing',
      'paper',
      'filing',
      'standard',
      'measured',
      'demo',
    ]);
    expect(STATUSES).toEqual(['demonstrated', 'deployed', 'planned', 'unspecified']);
    expect(CLAIM_TYPES).toEqual(['number', 'date', 'name', 'spec', 'quote', 'event']);
  });

  it('keeps the safe bases a subset of the bases', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
    for (const basis of SAFE_BASES) {
      expect(BASES).toContain(basis);
    }
  });

  it('numbers the checks G1 to G9', () => {
    expect(CHECK_IDS).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });
});

describe('the byline of the Desk', () => {
  it('names the author of every piece', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
  });

  it('says in a few plain words how a piece is made, and claims no verification that does not exist yet', () => {
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
    expect(DESK_BYLINE_LABEL).not.toMatch(/verif|check|audit/i);
    expect(DESK_BYLINE_LABEL).toMatch(/^[\x20-\x7E]+$/);
  });
});
