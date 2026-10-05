import { describe, expect, it } from 'vitest';
import { BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import { BASIS_TEMPLATES, STATUS_TEMPLATES, renderLimitation } from '../src/limitations';
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

describe('renderLimitation: basis templates', () => {
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
    expect(renderLimitation(claim({ basis }), 'basis')).toBe(expected);
  });

  it('has a template for every basis, and no others', () => {
    expect(Object.keys(BASIS_TEMPLATES).sort()).toEqual([...BASES].sort());
  });

  it('matches the example in the design spec', () => {
    const speed = claim({
      label: 'speed',
      values: [{ kind: 'number', raw: '2.3 m/s', normalised: '2.3', unit: 'm/s' }],
    });
    expect(renderLimitation(speed, 'basis')).toBe(
      "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available.",
    );
  });
});

describe('renderLimitation: status templates', () => {
  it.each<[Status, string]>([
    ['demonstrated', 'The top speed was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states the top speed is deployed; no independent confirmation was available.'],
    ['planned', 'The top speed is planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed has been demonstrated or deployed.'],
  ])('renders the %s template', (status, expected) => {
    expect(renderLimitation(claim({ status, label: 'top speed' }), 'status')).toBe(expected);
  });

  it('has a template for every status, and no others', () => {
    expect(Object.keys(STATUS_TEMPLATES).sort()).toEqual([...STATUSES].sort());
  });

  it('never includes the claim value, because a status describes the capability, not a figure', () => {
    expect(renderLimitation(claim({ status: 'deployed' }), 'status')).not.toContain('12 kg');
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
    expect(renderLimitation(mixed, 'basis')).toBe(
      "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('falls back to the first value when none is a number', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation(named, 'basis')).toBe('The Corvane Partners lead investor figure comes from a regulatory filing.');
  });

  it('leaves the value out, with no stray space, when the claim has none', () => {
    expect(renderLimitation(claim({ values: [] }), 'basis')).toBe(
      "The payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('keeps a dollar sign in a value as it is written', () => {
    const money = claim({
      label: 'funding round',
      basis: 'filing',
      values: [{ kind: 'number', raw: '$450 million', normalised: '450000000', unit: 'USD' }],
    });
    expect(renderLimitation(money, 'basis')).toBe('The $450 million funding round figure comes from a regulatory filing.');
  });

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'name', raw: '{label}', normalised: 'x' }] });
    expect(renderLimitation(odd, 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('is pure: the same claim gives the same sentence and the claim is not changed', () => {
    const input = claim({});
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });
});
