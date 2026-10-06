import { describe, expect, it } from 'vitest';
import { BASES, SAFE_BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import {
  BASIS_TEMPLATES,
  BASIS_TEMPLATES_PLURAL,
  STATUS_TEMPLATES,
  STATUS_TEMPLATES_PLURAL,
  buildLimitations,
  claimNumber,
  joinList,
  limitationGroups,
  needsBasisLimitation,
  needsStatusLimitation,
  outletOf,
  renderLimitation,
} from '../src/limitations';
import type { Claim } from '../src/schemas';

const BASE_CLAIM: Claim = {
  id: 'c-1',
  text: 'The FX-1 arm is rated for a 12 kg payload.',
  label: 'payload',
  type: 'spec',
  source: {
    url: 'https://fixture-robotics.example/products/fx-1/datasheet',
    tier: 1,
    snapshotHash: 'a'.repeat(64),
    retrievedAt: '2026-10-04T04:30:00Z',
  },
  span: { start: 0, end: 20, quote: 'Rated payload: 12 kg' },
  basis: 'datasheet',
  status: 'unspecified',
  values: [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }],
};

const claim = (overrides: Partial<Claim>): Claim => ({ ...BASE_CLAIM, ...overrides });

/** A second and a third claim, to make groups: a reach of 1.4 m and an ingress rating that is a name. */
const REACH = claim({ id: 'c-2', label: 'reach', values: [{ kind: 'number', raw: '1.4 m', normalised: '1.4', unit: 'm' }] });
const RATING = claim({ id: 'c-3', label: 'ingress protection', values: [{ kind: 'name', raw: 'IP54', normalised: 'ip54' }] });

describe('renderLimitation: one claim, basis templates', () => {
  it.each<[Basis, string]>([
    ['datasheet', "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available."],
    ['press-release', 'The 12 kg payload figure comes from a company press release; no independent measurement was available.'],
    ['briefing', 'The 12 kg payload figure was given in a company briefing; no independent measurement was available.'],
    ['demo', 'The payload was shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "The 12 kg payload figure is reported in the authors' paper; it has not been independently reproduced."],
    ['filing', 'The 12 kg payload figure comes from a regulatory filing.'],
    ['standard', 'The payload requirement comes from the published standard.'],
    ['measured', 'The 12 kg payload figure was measured by the source and is reported as stated.'],
  ])('renders the %s template', (basis, expected) => {
    expect(renderLimitation([claim({ basis })], 'basis')).toBe(expected);
  });

  it('has a template for every basis, and no others', () => {
    expect(Object.keys(BASIS_TEMPLATES).sort()).toEqual([...BASES].sort());
    expect(Object.keys(BASIS_TEMPLATES_PLURAL).sort()).toEqual([...BASES].sort());
  });

  it('matches the example in the design spec', () => {
    const speed = claim({
      label: 'speed',
      values: [{ kind: 'number', raw: '2.3 m/s', normalised: '2.3', unit: 'm/s' }],
    });
    expect(renderLimitation([speed], 'basis')).toBe(
      "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available.",
    );
  });
});

describe('renderLimitation: one claim, status templates', () => {
  it.each<[Status, string]>([
    ['demonstrated', 'The top speed was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states the top speed is deployed; no independent confirmation was available.'],
    ['planned', 'The top speed is planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed has been demonstrated or deployed.'],
  ])('renders the %s template', (status, expected) => {
    expect(renderLimitation([claim({ status, label: 'top speed' })], 'status')).toBe(expected);
  });

  it('has a template for every status, and no others', () => {
    expect(Object.keys(STATUS_TEMPLATES).sort()).toEqual([...STATUSES].sort());
    expect(Object.keys(STATUS_TEMPLATES_PLURAL).sort()).toEqual([...STATUSES].sort());
  });

  it('never includes the claim value, because a status describes the capability, not a figure', () => {
    expect(renderLimitation([claim({ status: 'deployed' })], 'status')).not.toContain('12 kg');
  });
});

describe('renderLimitation: two or more claims, basis templates', () => {
  const two = (basis: Basis) => renderLimitation([claim({ basis }), { ...REACH, basis }], 'basis');

  it.each<[Basis, string]>([
    ['datasheet', "The 12 kg payload and 1.4 m reach figures come from the company's datasheet; no independent measurement was available."],
    ['press-release', 'The 12 kg payload and 1.4 m reach figures come from a company press release; no independent measurement was available.'],
    ['briefing', 'The 12 kg payload and 1.4 m reach figures were given in a company briefing; no independent measurement was available.'],
    ['demo', 'The payload and reach were shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "The 12 kg payload and 1.4 m reach figures are reported in the authors' paper; they have not been independently reproduced."],
    ['filing', 'The 12 kg payload and 1.4 m reach figures come from a regulatory filing.'],
    ['standard', 'The payload and reach requirements come from the published standard.'],
    ['measured', 'The 12 kg payload and 1.4 m reach figures were measured by the source and are reported as stated.'],
  ])('renders the %s template for two claims', (basis, expected) => {
    expect(two(basis)).toBe(expected);
  });

  it('joins three claims as "A, B and C", with no comma before the "and"', () => {
    expect(renderLimitation([claim({}), REACH, RATING], 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('joins four claims with commas and one "and"', () => {
    const four = [claim({}), REACH, RATING, claim({ id: 'c-4', label: 'mass', values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }] })];
    expect(renderLimitation(four, 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach, IP54 ingress protection and 38 kg mass figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('writes the figure of each claim by the same rule as for one claim: the first number, else the first value, else nothing', () => {
    const none = claim({ id: 'c-4', label: 'finish', values: [] });
    expect(renderLimitation([none, RATING], 'basis')).toBe(
      "The finish and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('takes the template from the first claim', () => {
    expect(renderLimitation([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'demo', label: 'reach' })], 'basis')).toBe(
      'The 12 kg payload and 12 kg reach figures come from a regulatory filing.',
    );
  });
});

describe('renderLimitation: two or more claims, status templates', () => {
  const two = (status: Status) => renderLimitation([claim({ status, label: 'top speed' }), claim({ id: 'c-2', status, label: 'repeatability' })], 'status');

  it.each<[Status, string]>([
    ['demonstrated', 'The top speed and repeatability were demonstrated; the source does not report them in commercial deployment.'],
    ['deployed', 'The company states the top speed and repeatability are deployed; no independent confirmation was available.'],
    ['planned', 'The top speed and repeatability are planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed and repeatability have been demonstrated or deployed.'],
  ])('renders the %s template for two claims', (status, expected) => {
    expect(two(status)).toBe(expected);
  });

  it('joins three claims as "A, B and C"', () => {
    const three = [claim({ status: 'planned', label: 'a' }), claim({ id: 'c-2', status: 'planned', label: 'b' }), claim({ id: 'c-3', status: 'planned', label: 'c' })];
    expect(renderLimitation(three, 'status')).toBe('The a, b and c are planned, not delivered.');
  });
});

describe('renderLimitation: the value in the sentence', () => {
  it('uses the first number value, even when a name value comes first', () => {
    const mixed = claim({
      values: [
        { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
        { kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' },
        { kind: 'number', raw: '1.4 m', normalised: '1.4', unit: 'm' },
      ],
    });
    expect(renderLimitation([mixed], 'basis')).toBe(
      "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('falls back to the first value when none is a number', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation([named], 'basis')).toBe('The Corvane Partners lead investor figure comes from a regulatory filing.');
  });

  it('leaves the value out, with no stray space, when the claim has none', () => {
    expect(renderLimitation([claim({ values: [] })], 'basis')).toBe(
      "The payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('keeps a dollar sign in a value as it is written', () => {
    const money = claim({
      label: 'funding round',
      basis: 'filing',
      values: [{ kind: 'number', raw: '$450 million', normalised: '450000000', unit: 'USD' }],
    });
    expect(renderLimitation([money], 'basis')).toBe('The $450 million funding round figure comes from a regulatory filing.');
  });

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'name', raw: '{label}', normalised: 'x' }] });
    expect(renderLimitation([odd], 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
    );
    const items = claim({ label: '{items}', values: [] });
    expect(renderLimitation([items, odd], 'basis')).toBe(
      "The {items} and {label} {v} figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('is pure: the same claims give the same sentence and the claims are not changed', () => {
    const input = [claim({}), REACH];
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });

  it('refuses a group with no claim', () => {
    expect(() => renderLimitation([], 'basis')).toThrow('renderLimitation: a limitation sentence needs at least one claim');
  });
});

describe('joinList', () => {
  it.each([
    [[], ''],
    [['a'], 'a'],
    [['a', 'b'], 'a and b'],
    [['a', 'b', 'c'], 'a, b and c'],
    [['a', 'b', 'c', 'd'], 'a, b, c and d'],
  ])('joins %j as %j', (items, expected) => {
    expect(joinList(items)).toBe(expected);
  });
});

describe('claimNumber', () => {
  it.each([
    ['c-1', 1],
    ['c-12', 12],
    ['c-007', 7],
  ])('reads %j as %d', (id, expected) => {
    expect(claimNumber(id)).toBe(expected);
  });

  it.each(['', 'c-', 'c-x', 'x-1', 'c-1a', '1', 'C-1', ' c-1'])('reads %j as NaN', (id) => {
    expect(claimNumber(id)).toBeNaN();
  });
});

describe('needsBasisLimitation and needsStatusLimitation', () => {
  it('a claim needs a basis sentence unless its basis is one of the safe bases', () => {
    for (const basis of BASES) {
      expect(needsBasisLimitation(claim({ basis })), basis).toBe(!(SAFE_BASES as readonly string[]).includes(basis));
    }
  });

  it('a claim needs a status sentence when it is demonstrated or planned, and not when it is deployed or unspecified', () => {
    expect(needsStatusLimitation(claim({ status: 'demonstrated' }))).toBe(true);
    expect(needsStatusLimitation(claim({ status: 'planned' }))).toBe(true);
    expect(needsStatusLimitation(claim({ status: 'deployed' }))).toBe(false);
    expect(needsStatusLimitation(claim({ status: 'unspecified' }))).toBe(false);
  });
});

describe('limitationGroups', () => {
  const c = (n: number, basis: Basis, status: Status = 'unspecified'): Claim => claim({ id: `c-${n}`, basis, status, label: `item ${n}` });

  it('groups the claims that need a basis sentence by basis, in the order of BASES, each group by claim number', () => {
    const groups = limitationGroups([c(12, 'demo'), c(3, 'press-release'), c(10, 'datasheet'), c(2, 'datasheet'), c(5, 'press-release'), c(1, 'briefing')]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-2', 'c-10']],
      ['basis', 'press-release', ['c-3', 'c-5']],
      ['basis', 'briefing', ['c-1']],
      ['basis', 'demo', ['c-12']],
    ]);
  });

  it('leaves out the claims whose basis is safe', () => {
    const groups = limitationGroups([c(1, 'filing'), c(2, 'standard'), c(3, 'paper'), c(4, 'measured')]);
    expect(groups).toEqual([]);
  });

  it('groups the claims that need a status sentence by status, demonstrated first, after the basis groups', () => {
    const groups = limitationGroups([c(4, 'filing', 'planned'), c(2, 'filing', 'demonstrated'), c(1, 'datasheet', 'planned'), c(3, 'filing', 'deployed'), c(5, 'filing', 'unspecified')]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-1']],
      ['status', 'demonstrated', ['c-2']],
      ['status', 'planned', ['c-1', 'c-4']],
    ]);
  });

  it('puts a claim in a basis group and a status group when it needs both', () => {
    const groups = limitationGroups([c(1, 'press-release', 'planned')]);
    expect(groups.map((group) => [group.template, group.key])).toEqual([
      ['basis', 'press-release'],
      ['status', 'planned'],
    ]);
  });

  it('counts a claim once, however often it is listed', () => {
    const groups = limitationGroups([c(1, 'datasheet'), c(1, 'datasheet'), c(2, 'datasheet')]);
    expect(groups[0]!.claims.map((item) => item.id)).toEqual(['c-1', 'c-2']);
  });

  it('sorts by the number in the id, not by the text: c-2 before c-10', () => {
    const groups = limitationGroups([c(10, 'datasheet'), c(9, 'datasheet'), c(100, 'datasheet'), c(2, 'datasheet')]);
    expect(groups[0]!.claims.map((item) => item.id)).toEqual(['c-2', 'c-9', 'c-10', 'c-100']);
  });

  it('gives no group for no claims, and does not change what it is given', () => {
    expect(limitationGroups([])).toEqual([]);
    const input = [c(2, 'datasheet'), c(1, 'datasheet')];
    const before = structuredClone(input);
    limitationGroups(input);
    expect(input).toEqual(before);
  });
});

describe('buildLimitations', () => {
  it('writes one limitation sentence for each group, with the claims of the group, its template and the rendered text', () => {
    const claims = [claim({ id: 'c-2', label: 'reach', values: REACH.values }), claim({ id: 'c-1' }), claim({ id: 'c-3', basis: 'filing', status: 'planned', label: 'schedule', values: [] })];
    expect(buildLimitations(claims)).toEqual([
      {
        kind: 'limitation',
        text: "The 12 kg payload and 1.4 m reach figures come from the company's datasheet; no independent measurement was available.",
        claimIds: ['c-1', 'c-2'],
        template: 'basis',
      },
      {
        kind: 'limitation',
        text: 'The schedule is planned, not delivered.',
        claimIds: ['c-3'],
        template: 'status',
      },
    ]);
  });

  it('writes a single-claim sentence exactly as the single template says', () => {
    const [sentence] = buildLimitations([claim({})]);
    expect(sentence!.text).toBe(BASIS_TEMPLATES.datasheet.replace('{v}', '12 kg ').replace('{label}', 'payload'));
  });

  it('writes nothing when no claim needs a sentence', () => {
    expect(buildLimitations([])).toEqual([]);
    expect(buildLimitations([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'measured', status: 'deployed' })])).toEqual([]);
  });
});

describe('outletOf', () => {
  /** A tier-2 claim whose source names `outlet`, or names none when it is undefined. */
  const from = (outlet: string | undefined): Claim => claim({ source: { ...BASE_CLAIM.source, tier: 2, ...(outlet === undefined ? {} : { outlet }) } });

  it('is the outlet the source names, without the spaces around it', () => {
    expect(outletOf(from('Mercer Wire'))).toBe('Mercer Wire');
    expect(outletOf(from('  Mercer Wire \t'))).toBe('Mercer Wire');
  });

  it('is empty when the source names no outlet, or only spaces', () => {
    expect(outletOf(from(undefined))).toBe('');
    expect(outletOf(from('   '))).toBe('');
    expect(outletOf(claim({}))).toBe('');
  });
});

describe('the basis reported', () => {
  /** A claim that only another outlet reports: tier 2, with the outlet named, and the basis `reported`. */
  const reported = (id: string, label: string, outlet: string, raw?: string): Claim =>
    claim({
      id,
      label,
      basis: 'reported',
      source: { ...BASE_CLAIM.source, tier: 2, outlet },
      values: raw === undefined ? [] : [{ kind: 'number', raw, normalised: raw }],
    });

  it('is never a safe basis, so a reported claim always needs a limitation sentence', () => {
    expect(SAFE_BASES).not.toContain('reported');
    expect(needsBasisLimitation(reported('c-1', 'investor count', 'Mercer Wire', '7'))).toBe(true);
  });

  it('is written in the singular with the figure, the label and the outlet', () => {
    expect(renderLimitation([reported('c-19', 'investor count', 'Mercer Wire', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.',
    );
  });

  it('is written in the plural with the figure and label of each claim, and the outlet once', () => {
    const two = [reported('c-19', 'investor count', 'Mercer Wire', '7'), reported('c-20', 'round size', 'Mercer Wire', '$450 million')];
    expect(renderLimitation(two, 'basis')).toBe(
      'The 7 investor count and $450 million round size figures are reported by Mercer Wire and were not checked against a primary source.',
    );
  });

  it('takes the outlet from the claims themselves, without the spaces around it, and reads a "$" in it as a letter', () => {
    expect(renderLimitation([reported('c-1', 'investor count', '  Mercer Wire ', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.',
    );
    expect(renderLimitation([reported('c-1', 'investor count', 'Cash $& Wire', '7')], 'basis')).toBe(
      'The 7 investor count figure is reported by Cash $& Wire and was not checked against a primary source.',
    );
  });

  it('names the outlet of the first claim, which is why a group never mixes outlets', () => {
    const mixed = [reported('c-1', 'investor count', 'Mercer Wire', '7'), reported('c-2', 'round size', 'Tarn Daily', '5')];
    expect(renderLimitation(mixed, 'basis')).toContain('are reported by Mercer Wire and were');
  });

  it('has an outlet only in its own templates', () => {
    for (const basis of BASES) {
      expect(BASIS_TEMPLATES[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
      expect(BASIS_TEMPLATES_PLURAL[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
    }
    expect(renderLimitation([claim({ source: { ...BASE_CLAIM.source, outlet: 'Mercer Wire' } })], 'basis')).not.toContain('Mercer Wire');
  });

  it('is grouped by outlet, so two outlets make two groups, the outlet of the lowest claim number first, after the other basis groups', () => {
    const groups = limitationGroups([
      reported('c-9', 'a', 'Tarn Daily'),
      reported('c-2', 'b', 'Mercer Wire'),
      reported('c-5', 'c', 'Tarn Daily'),
      reported('c-4', 'd', 'Mercer Wire'),
      claim({ id: 'c-20', basis: 'demo' }),
      claim({ id: 'c-21', basis: 'datasheet', status: 'planned' }),
    ]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-21']],
      ['basis', 'demo', ['c-20']],
      ['basis', 'reported', ['c-2', 'c-4']],
      ['basis', 'reported', ['c-5', 'c-9']],
      ['status', 'planned', ['c-21']],
    ]);
  });

  it('is written as one sentence for each outlet by buildLimitations', () => {
    const claims = [
      reported('c-9', 'investor count', 'Tarn Daily', '7'),
      reported('c-2', 'round size', 'Mercer Wire', '$450 million'),
      reported('c-5', 'valuation', 'Tarn Daily', '$2 billion'),
    ];
    expect(buildLimitations(claims)).toEqual([
      {
        kind: 'limitation',
        text: 'The $450 million round size figure is reported by Mercer Wire and was not checked against a primary source.',
        claimIds: ['c-2'],
        template: 'basis',
      },
      {
        kind: 'limitation',
        text: 'The $2 billion valuation and 7 investor count figures are reported by Tarn Daily and were not checked against a primary source.',
        claimIds: ['c-5', 'c-9'],
        template: 'basis',
      },
    ]);
  });
});
