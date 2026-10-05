import { describe, expect, it } from 'vitest';
import * as api from '@robywire/gate';
import type { CheckId, GateInput } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '@robywire/gate/fixtures';
import { claimById, findSentence, mutate } from './helpers';

// These tests use the package the way other workspaces will: by name.

describe('the public API of @robywire/gate', () => {
  it.each([
    // gate
    'runGate',
    'runGateWith',
    'defaultContext',
    'defaultConfig',
    'ALL_CHECKS',
    'checkG1',
    'checkG2',
    'checkG3',
    'checkG4',
    'checkG5',
    // text, normalisers, tokens, limitations, sentences
    'countWords',
    'normaliseQuotes',
    'stripQuoted',
    'quotedSegments',
    'sentenceWords',
    'jaccard',
    'parseNumberToken',
    'parseDateToken',
    'dateMatches',
    'canonicalUnit',
    'UNIT_ALIASES',
    'MONTH_NAMES',
    'extractTokens',
    'nameTokensOf',
    'toNameToken',
    'renderLimitation',
    'BASIS_TEMPLATES',
    'STATUS_TEMPLATES',
    'allSentences',
    'describeLocation',
    // configuration
    'DEFAULT_BANNED_PHRASES',
    'DEFAULT_NAME_ALLOW_LIST',
    // vocabularies, schemas, registry
    'BEATS',
    'CATEGORY_VOCAB',
    'SAFE_BASES',
    'CHECK_IDS',
    'Claim',
    'Draft',
    'LedgerEntry',
    'DeskState',
    'SLUG_PATTERN',
    'parseSources',
    'loadSources',
  ])('exports %s', (name) => {
    expect(Object.keys(api)).toContain(name);
  });

  it('keeps the fixtures out of the main entry point, so production code cannot import them by accident', () => {
    for (const name of ['GOLDEN_DRAFT', 'GOLDEN_CLAIMS', 'cloneGolden']) {
      expect(Object.keys(api)).not.toContain(name);
    }
  });

  it('lists the checks in order, starting with G1 to G5', () => {
    expect(api.ALL_CHECKS.slice(0, 5)).toEqual([api.checkG1, api.checkG2, api.checkG3, api.checkG4, api.checkG5]);
  });
});

describe('runGate on the golden piece', () => {
  it('publishes it: no failures, no hold reasons, and G1 to G5 all pass', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5'] as const) {
      expect(result.checks[id], id).toBe('pass');
    }
  });

  it('gives the same answer every time', () => {
    const first = api.runGate(cloneGolden(), api.defaultContext());
    const second = api.runGate(cloneGolden(), api.defaultContext());
    expect(second).toEqual(first);
  });

  it('reads the frozen originals without writing to them', () => {
    const result = api.runGate({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS }, api.defaultContext());
    expect(result.route).toBe('publish');
  });

  it('does not change the input it is given', () => {
    const input = cloneGolden();
    api.runGate(input, api.defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('runGate on the golden piece with one thing wrong', () => {
  const defects: [CheckId, string, (copy: GateInput) => void][] = [
    ['G1', 'G1_TITLE_EMPTY', (g) => (g.draft.title.text = '')],
    ['G2', 'G2_HEADING_QUESTION', (g) => (g.draft.sections[0]!.heading = 'What shipped?')],
    ['G3', 'G3_NO_CLAIM', (g) => (g.draft.takeaways[0]!.claimIds = [])],
    [
      'G4',
      'G4_NUMBER_UNSUPPORTED',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('38 kg')).text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
      },
    ],
    [
      'G5',
      'G5_QUOTE_NOT_VERBATIM',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.text.includes('We went from pilot')).text =
          '"We went from pilot to production in ten weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
      },
    ],
  ];

  it.each(defects)('sends the draft back for revision when %s finds %s', (id, code, change) => {
    const result = api.runGate(mutate(cloneGolden(), change), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks[id]).toBe('fail');
    expect(result.failures.some((failure) => failure.check === id && failure.code === code)).toBe(true);
  });

  it('marks only the checks that found something as fail', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        claimById(g.claims, 'c-13').span.quote = 'Arm mass: 39 kg.';
      }),
      api.defaultContext(),
    );
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'fail', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });
});
