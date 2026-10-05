import { describe, expect, it } from 'vitest';
import { BASES, CLAIM_TYPES, STATUSES } from '../src/constants';
import { defaultConfig } from '../src/config';
import { GOLDEN_CLAIMS } from '../src/fixtures';
import { parseDateToken, parseNumberToken } from '../src/normalise';
import { Claim } from '../src/schemas';
import { expectValid } from './schema-helpers';

const rawValues = GOLDEN_CLAIMS.flatMap((claim) => claim.values.map((value) => value.raw));

describe('GOLDEN_CLAIMS: shape', () => {
  it('has about two dozen claims with unique ids', () => {
    expect(GOLDEN_CLAIMS.length).toBeGreaterThanOrEqual(20);
    const ids = GOLDEN_CLAIMS.map((claim) => claim.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GOLDEN_CLAIMS.map((claim) => [claim.id, claim] as const))('%s is a valid Claim', (_id, claim) => {
    expectValid(Claim, claim);
  });

  it('draws every claim from a tier-1 source on a fictional *.example domain', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.source.tier, claim.id).toBe(1);
      expect(new URL(claim.source.url).hostname, claim.id).toMatch(/\.example$/);
      expect(claim.source.outlet, claim.id).toBeUndefined();
    }
  });

  it('retrieves every snapshot at one fixed time', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.source.retrievedAt, claim.id).toBe('2026-10-04T04:30:00Z');
    }
  });
});

describe('GOLDEN_CLAIMS: spans and hashes', () => {
  it('ends every span exactly quote.length after it starts, within the span limit', () => {
    for (const claim of GOLDEN_CLAIMS) {
      expect(claim.span.end, claim.id).toBe(claim.span.start + claim.span.quote.length);
      expect(claim.span.quote.length, claim.id).toBeLessThanOrEqual(defaultConfig().spanMax);
    }
  });

  it('hashes the url followed by the quote with SHA-256, so every hash is deterministic and different', async () => {
    const { createHash } = await import('node:crypto');
    for (const claim of GOLDEN_CLAIMS) {
      const expected = createHash('sha256')
        .update(claim.source.url + claim.span.quote)
        .digest('hex');
      expect(claim.source.snapshotHash, claim.id).toBe(expected);
    }
    const hashes = GOLDEN_CLAIMS.map((claim) => claim.source.snapshotHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('has every value written literally inside its own span quote', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values) {
        expect(claim.span.quote, `${claim.id}: ${value.raw}`).toContain(value.raw);
      }
    }
  });
});

describe('GOLDEN_CLAIMS: values agree with the normalisers', () => {
  it('lists a normalised value and unit that parseNumberToken also derives from the raw text', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'number')) {
        const parsed = parseNumberToken(value.raw);
        expect(parsed?.value, `${claim.id}: ${value.raw}`).toBe(value.normalised);
        expect(parsed?.unit, `${claim.id}: ${value.raw}`).toBe(value.unit);
      }
    }
  });

  it('lists the ISO date that parseDateToken derives from the raw text', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'date')) {
        expect(parseDateToken(value.raw)?.iso, `${claim.id}: ${value.raw}`).toBe(value.normalised);
      }
    }
  });

  it('lists names in lowercase as their normalised form', () => {
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'name')) {
        expect(value.normalised, claim.id).toBe(value.raw.toLowerCase());
      }
    }
  });

  it('puts the number first in every number-type claim, because the fact card shows that value', () => {
    for (const claim of GOLDEN_CLAIMS.filter((item) => item.type === 'number')) {
      expect(claim.values[0]?.kind, claim.id).toBe('number');
    }
    expect(GOLDEN_CLAIMS.filter((item) => item.type === 'number').length).toBeGreaterThanOrEqual(3);
  });

  it('spells figures in every family the normalisers handle', () => {
    expect(rawValues).toContain('1.2k');
    expect(rawValues).toContain('$38,000');
    expect(rawValues).toContain('12 kilograms');
    expect(rawValues).toContain('2.3 metres per second');
    expect(rawValues).toContain('18 per cent');
    expect(rawValues).toContain('USD 450 million');
    expect(rawValues).toContain('2026-09-29');
    expect(rawValues).toContain('1 October 2026');
    expect(rawValues).toContain('2027');
  });
});

describe('GOLDEN_CLAIMS: coverage of the vocabularies', () => {
  it('uses datasheet, press-release, filing, measured and demo bases', () => {
    const bases = new Set(GOLDEN_CLAIMS.map((claim) => claim.basis));
    for (const basis of ['datasheet', 'press-release', 'filing', 'measured', 'demo']) {
      expect(bases.has(basis as (typeof BASES)[number]), basis).toBe(true);
    }
  });

  it('uses every status', () => {
    const statuses = new Set(GOLDEN_CLAIMS.map((claim) => claim.status));
    expect([...statuses].sort()).toEqual([...STATUSES].sort());
  });

  it('uses every claim type', () => {
    const types = new Set(GOLDEN_CLAIMS.map((claim) => claim.type));
    expect([...types].sort()).toEqual([...CLAIM_TYPES].sort());
  });
});

describe('GOLDEN_CLAIMS: protection', () => {
  it('is frozen all the way down, so a test cannot change it by accident', () => {
    expect(Object.isFrozen(GOLDEN_CLAIMS)).toBe(true);
    const first = GOLDEN_CLAIMS[0] as (typeof GOLDEN_CLAIMS)[number];
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.span)).toBe(true);
    expect(Object.isFrozen(first.values)).toBe(true);
    expect(() => {
      first.label = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      first.values.push({ kind: 'name', raw: 'X', normalised: 'x' });
    }).toThrow(TypeError);
  });

  it('is reachable by package name through the fixtures export', async () => {
    const linked = await import('@robywire/gate/fixtures');
    expect(linked.GOLDEN_CLAIMS).toBe(GOLDEN_CLAIMS);
  });
});
