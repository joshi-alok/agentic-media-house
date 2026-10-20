import { describe, expect, it } from 'vitest';
import * as api from '@robywire/gate';
import type { CheckId, ContextOverrides, GateInput } from '@robywire/gate';
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
    'checkG6',
    'checkG7',
    'checkG8',
    'checkG9',
    'ALL_FAILURE_CODES',
    'HOLD_REASONS',
    // severity
    'NOTE_CODES',
    'SEVERITIES',
    'severityOf',
    // slugs and titles
    'disambiguateSlug',
    'titleTokens',
    'TITLE_STOP_WORDS',
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

  it('lists the nine checks in order, G1 to G9', () => {
    expect(api.ALL_CHECKS).toEqual([
      api.checkG1,
      api.checkG2,
      api.checkG3,
      api.checkG4,
      api.checkG5,
      api.checkG6,
      api.checkG7,
      api.checkG8,
      api.checkG9,
    ]);
    expect(api.ALL_CHECKS).toHaveLength(api.CHECK_IDS.length);
  });

  it('lists the failure codes of all nine checks, each starting with the id of its check', () => {
    for (const id of api.CHECK_IDS) {
      expect(api.ALL_FAILURE_CODES.some((code) => code.startsWith(`${id}_`)), id).toBe(true);
    }
    expect(api.ALL_FAILURE_CODES.every((code) => /^G[1-9]_/.test(code))).toBe(true);
  });
});

describe('runGate on the golden piece', () => {
  it('publishes it: no failures, no hold reasons, and all nine checks pass', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext());
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
    expect(result.route).toBe('publish');
    expect(result.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
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

/**
 * Make c-19 (the investor count) a claim reported by an outlet, and leave the sentence that cites it as it was.
 * The claim has the basis `reported`, which needs a limitation sentence, so the limitations are built again.
 */
function makeTier2(g: GateInput): void {
  const claim = claimById(g.claims, 'c-19');
  claim.source.tier = 2;
  claim.source.outlet = 'Mercer Wire';
  claim.basis = 'reported';
  g.draft.limitations = api.buildLimitations(api.citedClaims(g.draft, g.claims));
}

/** Then write that sentence the way a tier-2 claim must be written. */
function attribute(g: GateInput): void {
  const sentence = findSentence(g.draft, (item) => item.text === 'It lists 7 investors in the round.');
  sentence.text = 'Mercer Wire reports that 7 investors took part in the round.';
  if (sentence.kind === 'fact') sentence.attributed = true;
}

describe('runGate on the golden piece with one thing wrong', () => {
  const defects: [CheckId, string, (copy: GateInput) => void, ContextOverrides?][] = [
    ['G1', 'G1_TITLE_EMPTY', (g) => (g.draft.title.text = '')],
    ['G2', 'G2_HEADING_RESERVED', (g) => (g.draft.sections[1]!.heading = "What we couldn't verify")],
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
    ['G6', 'G6_TIER2_UNATTRIBUTED', (g) => makeTier2(g)],
    ['G6', 'G6_TIER2_BASIS', (g) => (claimById(g.claims, 'c-19').source = { ...claimById(g.claims, 'c-19').source, tier: 2, outlet: 'Mercer Wire' })],
    ['G6', 'G6_TIER1_REPORTED', (g) => (claimById(g.claims, 'c-19').basis = 'reported')],
    [
      'G7',
      'G7_ANALYSIS_NEW_VALUE',
      (g) => {
        findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'The measured rate is 22% below the datasheet maximum.';
      },
    ],
    ['G8', 'G8_LIMITATION_MISMATCH', (g) => (g.draft.limitations[0]!.text = 'The payload figure is exact.')],
    ['G9', 'G9_SLUG_COLLISION', () => undefined, { publishedSlugs: ['fixture-robotics-ships-fx-1-to-second-plant'] }],
  ];

  it.each(defects)('sends the draft back for revision when %s finds %s', (id, code, change, overrides) => {
    const result = api.runGate(mutate(cloneGolden(), change), api.defaultContext(overrides));
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

describe('runGate when the piece rests on a tier-2 claim', () => {
  it('holds a properly attributed piece: nothing failed, but it may not publish by itself', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        makeTier2(g);
        attribute(g);
      }),
      api.defaultContext(),
    );
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
    expect(result.route).toBe('hold');
    expect(Object.values(result.checks).every((value) => value === 'pass')).toBe(true);
  });

  it('sends an unattributed piece back for revision instead: a failure beats a hold', () => {
    const result = api.runGate(mutate(cloneGolden(), makeTier2), api.defaultContext());
    expect(result.route).toBe('revise');
    expect(result.checks.G6).toBe('fail');
    expect(result.holdReasons).toEqual([]);
  });

  it('revises, and still lists the hold reason, when a properly attributed piece also has a failure elsewhere', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        makeTier2(g);
        attribute(g);
        g.draft.sections[0]!.heading = '';
      }),
      api.defaultContext(),
    );
    expect(result.route).toBe('revise');
    expect(result.checks.G2).toBe('fail');
    expect(result.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });
});

describe('runGate: length and shape are notes', () => {
  it('publishes a piece whose body is outside the range, and lists the length as a note', () => {
    const result = api.runGate(cloneGolden(), api.defaultContext({ config: { bodyWords: { min: 5000, max: 6000 } } }));
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(['G2_BODY_LENGTH']);
    expect(result.checks.G2).toBe('pass');
  });

  it('publishes a piece whose heading is a question, and lists the heading as a note', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.sections[0]!.heading = 'What shipped?';
      }),
      api.defaultContext(),
    );
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(['G2_HEADING_QUESTION']);
  });

  it('still sends a piece back for a broken structure: a piece with one section is a blocker', () => {
    const result = api.runGate(
      mutate(cloneGolden(), (g) => {
        g.draft.sections = g.draft.sections.slice(0, 1);
      }),
      api.defaultContext(),
    );
    expect(result.failures.map((item) => item.code)).toContain('G2_SECTIONS_MIN');
    expect(result.route).toBe('revise');
  });
});
