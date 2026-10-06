import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { HOLD_REASONS, checkG6 } from '../src/checks/g6-sourcing';
import { defaultContext } from '../src/config';
import { BASES } from '../src/constants';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { allSentences, claimById, findSentence, mutate } from './helpers';

const OUTLET = 'Mercer Wire';
const OTHER_OUTLET = 'Tarn Daily';

// Two golden sentences that each cite exactly one claim, and that no other
// sentence cites: c-19 (the investor count) and c-24 (the Ashvale go-live date).
const INVESTORS = 'It lists 7 investors in the round.';
const INVESTORS_AT = 'section "What the filing shows", sentence 3';
const GO_LIVE = 'The installation at Ashvale went live on 18 August 2026, according to Brindle Logistics.';
const GO_LIVE_AT = 'section "What the customer reports", sentence 3';

const sentenceWith = (g: GateInput, text: string) => findSentence(g.draft, (sentence) => sentence.text === text);

/** Make a golden claim a tier-2 claim reported by `outlet`: another outlet is its only source, so its basis is `reported`. */
function makeTier2(g: GateInput, id: string, outlet: string = OUTLET): void {
  const claim = claimById(g.claims, id);
  claim.source.tier = 2;
  claim.source.outlet = outlet;
  claim.basis = 'reported';
}

/** Add a copy of claim `from` as the tier-2 claim c-29, which no sentence cites yet. */
function addTier2Copy(g: GateInput, from: string): void {
  const copy = structuredClone(claimById(g.claims, from));
  copy.id = 'c-29';
  copy.source.tier = 2;
  copy.source.outlet = OUTLET;
  copy.basis = 'reported';
  g.claims.push(copy);
}

/** Rewrite the sentence `current` the way a tier-2 claim must be written: with the outlet's name, marked attributed. */
function attribute(g: GateInput, current: string, text: string): void {
  const sentence = sentenceWith(g, current);
  sentence.text = text;
  if (sentence.kind === 'fact') sentence.attributed = true;
}

const run = (change: (copy: GateInput) => void): CheckOutput => checkG6(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);
const messages = (output: CheckOutput) => output.failures.map((failure) => failure.message);

describe('G6: the golden piece', () => {
  it('passes with no failures and no hold reasons, because every claim is tier 1', () => {
    expect(checkG6(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the sixth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[5]).toBe(checkG6);
  });

  it('does not change its input', () => {
    const input = mutate(cloneGolden(), (g) => makeTier2(g, 'c-19'));
    const before = structuredClone(input);
    checkG6(input, defaultContext());
    expect(input).toEqual(before);
  });

  it('does not ask for attribution on a tier-1 sentence that happens to be marked attributed', () => {
    const output = run((g) => {
      const sentence = sentenceWith(g, INVESTORS);
      if (sentence.kind === 'fact') sentence.attributed = true;
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G6_TIER2_UNATTRIBUTED', () => {
  it('fails a fact sentence that cites a tier-2 claim and is not marked attributed, and says where and why', () => {
    const output = run((g) => makeTier2(g, 'c-19'));
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER2_UNATTRIBUTED',
        message: `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it is not marked attributed and it does not name "Mercer Wire"; write "<outlet> reports ..." and mark the sentence attributed`,
        where: INVESTORS_AT,
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('fails a sentence that is marked attributed but does not name the outlet', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'The filing lists 7 investors, according to reports.');
    });
    expect(messages(output)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it does not name "Mercer Wire"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('fails a sentence that names the outlet but is not marked attributed', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      sentenceWith(g, INVESTORS).text = 'Mercer Wire reports that 7 investors took part in the round.';
    });
    expect(messages(output)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claim c-19 but it is not marked attributed; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('fails a sentence that is marked attributed: false', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      const sentence = sentenceWith(g, INVESTORS);
      sentence.text = 'Mercer Wire reports that 7 investors took part in the round.';
      if (sentence.kind === 'fact') sentence.attributed = false;
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('fails a sentence that cites a tier-2 claim with no outlet recorded, because it can never be named', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      delete claimById(g.claims, 'c-19').source.outlet;
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('needs every tier-2 outlet a sentence cites to be named, not only one of them', () => {
    const atInvestors = (text: string) =>
      run((g) => {
        makeTier2(g, 'c-19');
        makeTier2(g, 'c-24', OTHER_OUTLET);
        attribute(g, INVESTORS, text);
        sentenceWith(g, text).claimIds = ['c-19', 'c-24'];
      }).failures.filter((failure) => failure.where === INVESTORS_AT);

    expect(atInvestors('Mercer Wire and Tarn Daily report that 7 investors took part.')).toEqual([]);
    expect(atInvestors('Mercer Wire reports that 7 investors took part.').map((failure) => failure.message)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claims c-19, c-24 but it does not name "Tarn Daily"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('lists every outlet the sentence leaves out', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24', OTHER_OUTLET);
      attribute(g, INVESTORS, 'Two outlets report that 7 investors took part.');
      sentenceWith(g, 'Two outlets report that 7 investors took part.').claimIds = ['c-19', 'c-24'];
    });
    expect(output.failures.filter((failure) => failure.where === INVESTORS_AT).map((failure) => failure.message)).toEqual([
      `the fact sentence at ${INVESTORS_AT} rests on tier-2 claims c-19, c-24 but it does not name "Mercer Wire" or "Tarn Daily"; write "<outlet> reports ..." and mark the sentence attributed`,
    ]);
  });

  it('names an outlet once when two of the claims a sentence cites come from it', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      makeTier2(g, 'c-18');
    });
    const opening = output.failures.find((failure) => failure.where === 'opening, sentence 3');
    expect(opening?.message).toContain('but it is not marked attributed and it does not name "Mercer Wire"; write');
  });

  it('names a claim once in the message when the sentence cites it twice', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      sentenceWith(g, INVESTORS).claimIds = ['c-19', 'c-19'];
    });
    expect(messages(output)[0]).toContain('tier-2 claim c-19 but');
  });

  it('does not take a blank outlet for a name that every sentence contains', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', '   ');
      attribute(g, INVESTORS, 'Reports say that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED']);
  });

  it('ignores spaces around the outlet as recorded', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', '  Mercer Wire ');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it('reports a sentence once, however many tier-2 claims it cites', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      makeTier2(g, 'c-18');
    });
    expect(output.failures.filter((failure) => failure.where === 'opening, sentence 3')).toHaveLength(1);
  });

  it('reports each unattributed sentence separately, in document order', () => {
    const output = run((g) => makeTier2(g, 'c-18'));
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G6_TIER2_UNATTRIBUTED', 'opening, sentence 3'],
      ['G6_TIER2_UNATTRIBUTED', 'section "What the filing shows", sentence 1'],
    ]);
  });

  it('matches the outlet whatever its case, and ignores the shape of apostrophes and spacing', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19', "O'Neill  Wire");
      attribute(g, INVESTORS, 'O\u2019NEILL wire reports that 7 investors took part.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[0]!, 'opening, sentence 1'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[0]!.paragraphs[1]![2]!, 'section "What shipped", sentence 7'],
  ])('reads %s', (_name, pick, where) => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      pick(g).claimIds = ['c-19'];
    });
    expect(output.failures.filter((failure) => failure.where === where).map((failure) => failure.code)).toEqual([
      'G6_TIER2_UNATTRIBUTED',
    ]);
  });
});

describe('the hold reason', () => {
  it('passes a properly attributed tier-2 citation but asks for a hold', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output).toEqual({ failures: [], holdReasons: ['TIER2_ATTRIBUTION'] });
  });

  it('asks for the hold once for the whole piece, however many sentences cite tier-2 claims', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
      attribute(g, GO_LIVE, 'Mercer Wire reports that the installation at Ashvale went live on 18 August 2026.');
    });
    expect(output.failures).toEqual([]);
    expect(output.holdReasons).toEqual(['TIER2_ATTRIBUTION']);
  });

  it('is withheld while there is still a G6 failure, because the piece is going back for revision anyway', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      makeTier2(g, 'c-24');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output.failures.map((failure) => failure.where)).toEqual([GO_LIVE_AT]);
    expect(output.holdReasons).toEqual([]);
  });

  it('is not asked for when no sentence cites the tier-2 claim', () => {
    expect(run((g) => addTier2Copy(g, 'c-19'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('is listed in HOLD_REASONS, which the site reads to give every hold reason a label', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(HOLD_REASONS).toEqual(['TIER2_ATTRIBUTION']);
    expect(output.holdReasons.every((reason) => (HOLD_REASONS as readonly string[]).includes(reason))).toBe(true);
  });
});

describe('G6_TIER2_IN_ANALYSIS', () => {
  const analysisAt = 'section "What the customer reports", sentence 6';
  const analysis = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');

  it('fails an analysis sentence that cites a tier-2 claim', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-12');
      analysis(g).claimIds.push('c-29');
    });
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER2_IN_ANALYSIS',
        message: `the analysis sentence at ${analysisAt} cites c-29, which comes from a tier-2 outlet; analysis may rest only on tier-1 claims`,
        where: analysisAt,
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('fails even when an attributed fact sentence cites the same claim properly', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
      analysis(g).claimIds.push('c-19');
    });
    expect(codes(output)).toEqual(['G6_TIER2_IN_ANALYSIS']);
    expect(output.holdReasons).toEqual([]);
  });
});

describe('G6_TIER2_BASIS', () => {
  const BAD_BASIS = 'comes from a tier-2 outlet but has the basis "filing"; a claim that rests only on another outlet has the basis "reported"';
  /** c-19 as another outlet's claim, properly attributed, but with the basis it had as a filing claim. */
  const filingBasis = (g: GateInput) => {
    makeTier2(g, 'c-19');
    claimById(g.claims, 'c-19').basis = 'filing';
    attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
  };

  it('fails a tier-2 claim that has any basis but reported, and says which claim and what the basis must be', () => {
    const output = run(filingBasis);
    expect(output.failures).toEqual([{ check: 'G6', code: 'G6_TIER2_BASIS', message: `claim c-19 (investor count) ${BAD_BASIS}` }]);
    expect(output.holdReasons).toEqual([]);
  });

  it.each(BASES.filter((basis) => basis !== 'reported'))('fails the basis %s on a tier-2 claim', (basis) => {
    const output = run((g) => {
      filingBasis(g);
      claimById(g.claims, 'c-19').basis = basis;
    });
    expect(messages(output)).toEqual([`claim c-19 (investor count) comes from a tier-2 outlet but has the basis "${basis}"; a claim that rests only on another outlet has the basis "reported"`]);
  });

  it('reports a claim once, however many sentences cite it', () => {
    const output = run((g) => {
      makeTier2(g, 'c-17');
      claimById(g.claims, 'c-17').basis = 'filing';
      for (const located of allSentences(g.draft)) {
        if (located.sentence.claimIds.includes('c-17') && located.sentence.kind === 'fact') {
          located.sentence.attributed = true;
          located.sentence.text = `Mercer Wire reports that ${located.sentence.text}`;
        }
      }
    });
    expect(output.failures.filter((failure) => failure.code === 'G6_TIER2_BASIS')).toHaveLength(1);
  });

  it('reads a claim that only a limitation sentence cites', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      claimById(g.claims, 'c-29').basis = 'filing';
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(codes(output)).toEqual(['G6_TIER2_BASIS']);
  });

  it('does not read a claim that no sentence cites', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      claimById(g.claims, 'c-29').basis = 'filing';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('comes after the failures of the sentences, and keeps the hold reason back', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      claimById(g.claims, 'c-19').basis = 'filing';
    });
    expect(codes(output)).toEqual(['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_BASIS']);
    expect(output.holdReasons).toEqual([]);
  });

  it('accepts a tier-2 claim whose basis is reported', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(codes(output)).toEqual([]);
  });
});

describe('G6_TIER1_REPORTED', () => {
  it('fails a tier-1 claim that has the basis reported, and says which claim and why', () => {
    const output = run((g) => {
      claimById(g.claims, 'c-19').basis = 'reported';
    });
    expect(output.failures).toEqual([
      {
        check: 'G6',
        code: 'G6_TIER1_REPORTED',
        message:
          'claim c-19 (investor count) comes from a tier-1 source but has the basis "reported"; that basis is for claims that rest only on another outlet, so give it the basis its source supports',
      },
    ]);
    expect(output.holdReasons).toEqual([]);
  });

  it('reports a claim once, however many sentences cite it', () => {
    const output = run((g) => {
      claimById(g.claims, 'c-17').basis = 'reported';
    });
    expect(codes(output)).toEqual(['G6_TIER1_REPORTED']);
  });

  it('reads a claim that only a limitation sentence cites, and not one that nothing cites', () => {
    const limited = run((g) => {
      const copy = structuredClone(claimById(g.claims, 'c-19'));
      copy.id = 'c-29';
      copy.basis = 'reported';
      g.claims.push(copy);
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(codes(limited)).toEqual(['G6_TIER1_REPORTED']);
    const uncited = run((g) => {
      const copy = structuredClone(claimById(g.claims, 'c-19'));
      copy.id = 'c-29';
      copy.basis = 'reported';
      g.claims.push(copy);
    });
    expect(uncited).toEqual({ failures: [], holdReasons: [] });
  });

  it('tells the two apart: a tier-2 claim with the wrong basis and a tier-1 claim that is reported each fail once, with their own code', () => {
    const output = run((g) => {
      makeTier2(g, 'c-19');
      claimById(g.claims, 'c-19').basis = 'filing';
      claimById(g.claims, 'c-24').basis = 'reported';
      attribute(g, INVESTORS, 'Mercer Wire reports that 7 investors took part in the round.');
    });
    expect(output.failures.map((failure) => [failure.code, failure.message.slice(0, 20)])).toEqual([
      ['G6_TIER2_BASIS', 'claim c-19 (investor'],
      ['G6_TIER1_REPORTED', 'claim c-24 (Ashvale '],
    ]);
  });
});

describe('what G6 leaves to other checks', () => {
  it('ignores a claim id that does not exist, which G3 reports', () => {
    const output = run((g) => {
      sentenceWith(g, INVESTORS).claimIds = ['c-999'];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not read limitation sentences, which describe a claim and assert nothing', () => {
    const output = run((g) => {
      addTier2Copy(g, 'c-19');
      g.draft.limitations[0]!.claimIds = ['c-29'];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
