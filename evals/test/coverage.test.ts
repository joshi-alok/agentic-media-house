import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS } from '@robywire/gate';
import { runSeeded } from '../src/run';

// The proof is only as wide as its cases. If a check gains a failure code and
// nobody writes a seeded case for it, this test fails and names the code.

describe('coverage of the gate by the seeded cases', () => {
  const result = runSeeded();
  const caughtCodes = new Set(result.cases.filter((item) => item.caught).map((item) => item.code));

  it('catches at least one case for every failure code any check can report', () => {
    const uncovered = ALL_FAILURE_CODES.filter((code) => !caughtCodes.has(code));
    expect(uncovered).toEqual([]);
  });

  it('has a case for every check from G1 to G9', () => {
    const checks = new Set(result.cases.map((item) => item.check));
    expect([...CHECK_IDS].filter((id) => !checks.has(id))).toEqual([]);
  });

  it('has no case whose code is not a code the gate can report', () => {
    const unknown = result.cases.filter((item) => !ALL_FAILURE_CODES.includes(item.code)).map((item) => item.id);
    expect(unknown).toEqual([]);
  });
});

describe('the proof can fail, check by check', () => {
  // ALL_CHECKS is in the order of CHECK_IDS. Switch one check off: exactly the
  // cases written for that check must slip through, and no others.
  it.each(CHECK_IDS.map((id, index) => [id, index] as const))('with %s switched off, its cases are missed and no others', (id, index) => {
    const result = runSeeded(ALL_CHECKS.filter((_check, at) => at !== index));
    const missed = result.cases.filter((item) => !item.caught).map((item) => item.id);
    const written = runSeeded().cases.filter((item) => item.check === id).map((item) => item.id);
    expect(written.length).toBeGreaterThan(0);
    expect(missed).toEqual(written);
    expect(result.rate).toBeLessThan(1);
  });
});
