import { ALL_CHECKS, NOTE_CODES, runGateWith, severityOf } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { SEEDED_CASES, seededContext } from '../src/seeded';

// A rule that has become a note must be proven to be one: the broken piece is reported under the code, as a note, and the code never sends it back.
// A rule that is a blocker must be proven to be one: the broken piece is sent back for the code.

const noteCases = SEEDED_CASES.filter((item) => severityOf(item.code) === 'note');
const blockerCases = SEEDED_CASES.filter((item) => severityOf(item.code) === 'blocker');
const run = (apply: (base: ReturnType<typeof cloneGolden>) => ReturnType<typeof cloneGolden>) => runGateWith(ALL_CHECKS, apply(cloneGolden()), seededContext());

describe('the seeded defects whose code is a note', () => {
  it('has a seeded defect for every note', () => {
    expect(new Set(noteCases.map((item) => item.code))).toEqual(new Set(NOTE_CODES));
  });

  it.each(noteCases.map((item) => [item.id, item] as const))('%s is reported as a note and never as a blocker', (_id, item) => {
    const result = run(item.apply);
    expect(result.warnings.some((finding) => finding.check === item.check && finding.code === item.code)).toBe(true);
    expect(result.failures.some((finding) => finding.code === item.code)).toBe(false);
  });
});

describe('the seeded defects whose code is a blocker', () => {
  it.each(blockerCases.map((item) => [item.id, item] as const))('%s sends the draft back', (_id, item) => {
    const result = run(item.apply);
    expect(result.failures.some((finding) => finding.check === item.check && finding.code === item.code)).toBe(true);
    expect(result.route).toBe('revise');
  });
});
