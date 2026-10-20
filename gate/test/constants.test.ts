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
  PUBLICATION_NAME,
  PUBLICATION_WORDMARK,
  RELEASES,
  SAFE_BASES,
  STATUSES,
  VERIFIER_REASONS,
} from '../src/constants';
import { ALL_FAILURE_CODES, HOLD_REASONS } from '../src/checks';

describe('closed vocabularies', () => {
  it('lists the seven beats of the publication, in the order of the site', () => {
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

  it('has funding as the only cross-cutting tag', () => {
    expect(CROSS_TAGS).toEqual(['funding']);
  });

  it('allows the beats plus the cross tags as categories, and nothing else', () => {
    expect(CATEGORY_VOCAB).toEqual([...BEATS, 'funding']);
    expect(new Set(CATEGORY_VOCAB).size).toBe(CATEGORY_VOCAB.length);
  });

  it('names the nine claim bases, four statuses and six claim types', () => {
    expect(BASES).toEqual([
      'docs',
      'announcement',
      'briefing',
      'paper',
      'filing',
      'standard',
      'measured',
      'demo',
      'reported',
    ]);
    expect(STATUSES).toEqual(['demonstrated', 'deployed', 'planned', 'unspecified']);
    expect(CLAIM_TYPES).toEqual(['number', 'date', 'name', 'spec', 'quote', 'event']);
  });

  it('names the four reasons the model check gives for a hold, each a G10 code of its own and none a code of G1 to G9 or a hold reason of the gate', () => {
    expect(VERIFIER_REASONS).toEqual(['G10_NOT_ENTAILED', 'G10_AMBIGUOUS', 'G10_LABEL_UNSUPPORTED', 'G10_NOT_JUDGED']);
    for (const reason of VERIFIER_REASONS) {
      expect(reason).toMatch(/^G10_[A-Z_]+$/);
      expect(ALL_FAILURE_CODES).not.toContain(reason);
      expect(HOLD_REASONS as readonly string[]).not.toContain(reason);
    }
  });

  it('names the two ways a piece comes to be published', () => {
    expect(RELEASES).toEqual(['auto', 'owner']);
  });

  it('keeps the safe bases a subset of the bases, and never calls what another outlet reported safe', () => {
    expect(SAFE_BASES).toEqual(['filing', 'standard', 'paper', 'measured']);
    for (const basis of SAFE_BASES) {
      expect(BASES).toContain(basis);
    }
    expect(SAFE_BASES).not.toContain('reported');
  });

  it('numbers the checks G1 to G9', () => {
    expect(CHECK_IDS).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });
});

describe('the name of the publication', () => {
  it('is Agentic Media House', () => {
    expect(PUBLICATION_NAME).toBe('Agentic Media House');
  });

  it('has a wordmark that is the same name in capitals, for the header and the fact card', () => {
    expect(PUBLICATION_WORDMARK).toBe('AGENTIC MEDIA HOUSE');
    expect(PUBLICATION_WORDMARK).toBe(PUBLICATION_NAME.toUpperCase());
  });

  it('is plain ASCII, and no name of it is the old one', () => {
    for (const name of [PUBLICATION_NAME, PUBLICATION_WORDMARK, DESK_AUTHOR_NAME]) {
      expect(name).toMatch(/^[\x20-\x7E]+$/);
      expect(name).not.toMatch(/robywire/i);
    }
  });
});

describe('the byline of the Desk', () => {
  it('names the author of every piece: the publication and the word Desk', () => {
    expect(DESK_AUTHOR_NAME).toBe('Agentic Media House Desk');
    expect(DESK_AUTHOR_NAME).toBe(`${PUBLICATION_NAME} Desk`);
  });

  it('says in a few plain words how a piece is made, and claims no verification that does not exist yet', () => {
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
    expect(DESK_BYLINE_LABEL).not.toMatch(/verif|check|audit/i);
    expect(DESK_BYLINE_LABEL).toMatch(/^[\x20-\x7E]+$/);
  });
});
