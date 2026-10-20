import { describe, expect, it } from 'vitest';
import { BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import * as limitations from '../src/limitations';
import {
  BASIS_NOTES,
  STATUS_NOTES,
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

/** Claim number `n`, with a basis, a status and, for another outlet's claim, an outlet. */
const c = (n: number, basis: Basis = 'datasheet', status: Status = 'unspecified', outlet?: string): Claim =>
  claim({ id: `c-${n}`, basis, status, source: outlet === undefined ? BASE_CLAIM.source : { ...BASE_CLAIM.source, tier: 2, outlet } });

const idsOf = (groups: ReturnType<typeof limitationGroups>) => groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)]);

describe('the notes', () => {
  it('has a note for every basis and every status, and no others', () => {
    expect(Object.keys(BASIS_NOTES).sort()).toEqual([...BASES].sort());
    expect(Object.keys(STATUS_NOTES).sort()).toEqual([...STATUSES].sort());
  });

  it('has one placeholder, {outlet}, and only the note for reported claims has it', () => {
    for (const basis of BASES) expect(BASIS_NOTES[basis].includes('{outlet}'), basis).toBe(basis === 'reported');
    for (const status of STATUSES) expect(STATUS_NOTES[status], status).not.toContain('{');
  });

  it('is a sentence in each case: a capital at the start and a full stop at the end', () => {
    for (const text of [...Object.values(BASIS_NOTES), ...Object.values(STATUS_NOTES)]) expect(text).toMatch(/^[A-Z].*\.$/);
  });

  it('no longer has a cap on the size of a group, or a plural form', () => {
    expect('LIMITATION_MAX_CLAIMS' in limitations).toBe(false);
    expect('BASIS_TEMPLATES' in limitations).toBe(false);
    expect('STATUS_TEMPLATES_PLURAL' in limitations).toBe(false);
  });
});

describe('renderLimitation', () => {
  it.each<[Basis, string]>([
    ['datasheet', "What is cited here comes from the company's datasheet; no independent measurement was available."],
    ['press-release', 'What is cited here comes from a company press release; no independent measurement was available.'],
    ['briefing', 'What is cited here was given in a company briefing; no independent measurement was available.'],
    ['demo', 'What is cited here was shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "What is cited here is reported in the authors' paper; it has not been independently reproduced."],
    ['filing', 'What is cited here comes from a regulatory filing.'],
    ['standard', 'What is cited here comes from the published standard.'],
    ['measured', 'What is cited here was measured by the source and is reported as stated.'],
  ])('writes the %s note', (basis, expected) => {
    expect(renderLimitation([claim({ basis })], 'basis')).toBe(expected);
  });

  it.each<[Status, string]>([
    ['demonstrated', 'What is cited here was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states that what is cited here is deployed; no independent confirmation was available.'],
    ['planned', 'What is cited here is planned, not delivered.'],
    ['unspecified', 'The source does not say whether what is cited here has been demonstrated or deployed.'],
  ])('writes the %s note', (status, expected) => {
    expect(renderLimitation([claim({ status })], 'status')).toBe(expected);
  });

  it('writes the same sentence for one claim and for many that share the basis', () => {
    const one = renderLimitation([c(1)], 'basis');
    expect(renderLimitation([c(1), c(2), c(3), c(4), c(5), c(6)], 'basis')).toBe(one);
  });

  it('says nothing of the label or the figure of a claim', () => {
    const text = renderLimitation([claim({ label: 'payload', basis: 'press-release' })], 'basis');
    expect(text).not.toContain('payload');
    expect(text).not.toContain('12');
  });

  it('names the outlet of a reported claim, without the spaces around it, and reads a "$" in the name as text', () => {
    const reported = (outlet: string) => claim({ basis: 'reported', source: { ...BASE_CLAIM.source, tier: 2, outlet } });
    expect(renderLimitation([reported('  Mercer Wire ')], 'basis')).toBe('What is cited here is reported by Mercer Wire; it was not checked against a primary source.');
    expect(renderLimitation([reported('Cash $& Wire')], 'basis')).toContain('reported by Cash $& Wire;');
  });

  it('is the same for the same claims and does not change them', () => {
    const input = [c(1), c(2)];
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });

  it('refuses an empty group', () => {
    expect(() => renderLimitation([], 'basis')).toThrow('renderLimitation: a limitation sentence needs at least one claim');
  });
});

describe('needsBasisLimitation and needsStatusLimitation', () => {
  it('asks for a basis sentence unless the figure comes from a filing, a standard, a paper or a measurement', () => {
    expect(BASES.filter((basis) => !needsBasisLimitation(claim({ basis })))).toEqual(['paper', 'filing', 'standard', 'measured']);
  });

  it('asks for a status sentence when the capability was only demonstrated or is only planned', () => {
    expect(STATUSES.filter((status) => needsStatusLimitation(claim({ status })))).toEqual(['demonstrated', 'planned']);
  });
});

describe('limitationGroups', () => {
  it('makes one group for each basis in the order of BASES, then one for each status, whatever the order of the claims', () => {
    const groups = limitationGroups([c(12, 'demo'), c(3, 'press-release'), c(10, 'datasheet'), c(2, 'datasheet'), c(5, 'press-release'), c(1, 'briefing')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'datasheet', ['c-2', 'c-10']],
      ['basis', 'press-release', ['c-3', 'c-5']],
      ['basis', 'briefing', ['c-1']],
      ['basis', 'demo', ['c-12']],
    ]);
  });

  it('does not cut a group, however many claims it has', () => {
    const many = Array.from({ length: 11 }, (_, at) => c(at + 1));
    expect(idsOf(limitationGroups([...many].reverse()))).toEqual([['basis', 'datasheet', ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8', 'c-9', 'c-10', 'c-11']]]);
  });

  it('orders by claim number, not as text', () => {
    const groups = limitationGroups([c(10), c(9), c(100), c(2)]);
    expect(groups[0]?.claims.map((item) => item.id)).toEqual(['c-2', 'c-9', 'c-10', 'c-100']);
  });

  it('makes no group for a safe basis', () => {
    expect(limitationGroups([c(1, 'filing'), c(2, 'standard'), c(3, 'paper'), c(4, 'measured')])).toEqual([]);
  });

  it('puts a claim that needs both a basis sentence and a status sentence in a group of each kind, the status groups last', () => {
    const groups = limitationGroups([c(4, 'filing', 'planned'), c(2, 'filing', 'demonstrated'), c(1, 'datasheet', 'planned'), c(3, 'filing', 'deployed')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'datasheet', ['c-1']],
      ['status', 'demonstrated', ['c-2']],
      ['status', 'planned', ['c-1', 'c-4']],
    ]);
  });

  it('groups the claims that another outlet reported by outlet, the outlet of the lowest claim first, one group each', () => {
    const groups = limitationGroups([c(5, 'reported', 'unspecified', 'Tarn Daily'), c(2, 'reported', 'unspecified', 'Mercer Wire'), c(7, 'reported', 'unspecified', 'Tarn Daily')]);
    expect(idsOf(groups)).toEqual([
      ['basis', 'reported', ['c-2']],
      ['basis', 'reported', ['c-5', 'c-7']],
    ]);
  });

  it('counts a claim once however many times it is given, and gives nothing for nothing', () => {
    expect(idsOf(limitationGroups([c(1), c(1), c(2)]))).toEqual([['basis', 'datasheet', ['c-1', 'c-2']]]);
    expect(limitationGroups([])).toEqual([]);
  });

  it('does not change what it is given', () => {
    const input = [c(3), c(1)];
    const before = structuredClone(input);
    limitationGroups(input);
    expect(input).toEqual(before);
  });
});

describe('buildLimitations', () => {
  it('makes a sentence for each group, with its text, its claims in order and its template', () => {
    const built = buildLimitations([c(2, 'press-release', 'planned'), c(1, 'press-release')]);
    expect(built).toEqual([
      { kind: 'limitation', text: BASIS_NOTES['press-release'], claimIds: ['c-1', 'c-2'], template: 'basis' },
      { kind: 'limitation', text: STATUS_NOTES.planned, claimIds: ['c-2'], template: 'status' },
    ]);
  });

  it('says the outlet in the sentence of a reported group', () => {
    const [sentence] = buildLimitations([c(1, 'reported', 'unspecified', 'Mercer Wire')]);
    expect(sentence?.text).toBe('What is cited here is reported by Mercer Wire; it was not checked against a primary source.');
  });
});

describe('claimNumber, joinList and outletOf', () => {
  it('reads the number of a claim id and nothing else', () => {
    expect(claimNumber('c-12')).toBe(12);
    expect(Number.isNaN(claimNumber('x-12'))).toBe(true);
  });

  it('joins "A", "A and B", "A, B and C"', () => {
    expect([joinList([]), joinList(['a']), joinList(['a', 'b']), joinList(['a', 'b', 'c'])]).toEqual(['', 'a', 'a and b', 'a, b and c']);
  });

  it('trims the outlet and says nothing when the source names none', () => {
    expect(outletOf(c(1, 'reported', 'unspecified', ' Mercer Wire '))).toBe('Mercer Wire');
    expect(outletOf(c(1))).toBe('');
  });
});
