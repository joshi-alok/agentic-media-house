import { describe, expect, it } from 'vitest';
import { CHECK_IDS } from '../src/constants';
import type { CheckId } from '../src/constants';
import { defaultContext } from '../src/config';
import { ALL_CHECKS } from '../src/checks';
import { runGate, runGateWith } from '../src/gate';
import type { Check, Failure, GateInput } from '../src/gate';

// A schema-valid draft with nothing in it. These tests are about how results
// are combined, so the checks here are stubs that never look at the input.
const INPUT: GateInput = {
  draft: {
    slug: 'a-slug',
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    author: { name: 'Agentic Media House Desk' },
    title: { kind: 'fact', text: 'A title', claimIds: [] },
    description: { kind: 'fact', text: 'A description', claimIds: [] },
    opening: [],
    takeaways: [],
    sections: [],
    limitations: [],
  },
  claims: [],
};

const failure = (check: CheckId, code: string, where?: string): Failure =>
  where === undefined ? { check, code, message: `${code} happened` } : { check, code, message: `${code} happened`, where };

const passes: Check = () => ({ failures: [], holdReasons: [] });
const fails = (check: CheckId, code: string): Check => () => ({ failures: [failure(check, code)], holdReasons: [] });
const holds = (reason: string): Check => () => ({ failures: [], holdReasons: [reason] });

const run = (checks: Check[]) => runGateWith(checks, INPUT, defaultContext());

describe('runGateWith: the route', () => {
  it('publishes when every check passes', () => {
    const result = run([passes, passes]);
    expect(result.route).toBe('publish');
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual([]);
  });

  it('sends the draft back for revision when a check fails', () => {
    const result = run([passes, fails('G3', 'G3_NO_CLAIM')]);
    expect(result.route).toBe('revise');
    expect(result.failures).toEqual([failure('G3', 'G3_NO_CLAIM')]);
  });

  it('holds the draft when a check only asks for a hold', () => {
    const result = run([passes, holds('a tier-2 source')]);
    expect(result.route).toBe('hold');
    expect(result.failures).toEqual([]);
    expect(result.holdReasons).toEqual(['a tier-2 source']);
  });

  it('revises, and still reports the hold reasons, when a failure and a hold reason are both present', () => {
    const result = run([holds('a tier-2 source'), fails('G4', 'G4_NUMBER_UNSUPPORTED')]);
    expect(result.route).toBe('revise');
    expect(result.holdReasons).toEqual(['a tier-2 source']);
  });
});

describe('runGateWith: the per-check summary', () => {
  it('lists every check from G1 to G9 as pass when nothing fails', () => {
    const { checks } = run([passes]);
    expect(Object.keys(checks)).toEqual([...CHECK_IDS]);
    expect(Object.values(checks).every((value) => value === 'pass')).toBe(true);
  });

  it('marks only the checks that produced a failure as fail', () => {
    const { checks } = run([fails('G2', 'G2_BODY_LENGTH'), fails('G5', 'G5_QUOTE_NOT_VERBATIM'), passes]);
    expect(checks).toEqual({
      G1: 'pass',
      G2: 'fail',
      G3: 'pass',
      G4: 'pass',
      G5: 'fail',
      G6: 'pass',
      G7: 'pass',
      G8: 'pass',
      G9: 'pass',
    });
  });

  it('keeps a check as pass when it only asked for a hold', () => {
    const { checks } = run([holds('a tier-2 source')]);
    expect(checks.G6).toBe('pass');
  });

  it('passes every check when no checks are registered, which is how checks that are not written yet are treated', () => {
    const result = run([]);
    expect(result.route).toBe('publish');
    expect(Object.values(result.checks).every((value) => value === 'pass')).toBe(true);
  });
});

describe('runGateWith: combining outputs', () => {
  it('lists failures and hold reasons in the order the checks ran', () => {
    const result = run([
      fails('G2', 'G2_A'),
      holds('first hold'),
      () => ({ failures: [failure('G1', 'G1_B'), failure('G1', 'G1_C', 'title')], holdReasons: ['second hold'] }),
    ]);
    expect(result.failures.map((item) => item.code)).toEqual(['G2_A', 'G1_B', 'G1_C']);
    expect(result.failures[2]?.where).toBe('title');
    expect(result.holdReasons).toEqual(['first hold', 'second hold']);
  });

  it('keeps duplicate hold reasons, because a check decides what to report', () => {
    const result = run([holds('same reason'), holds('same reason')]);
    expect(result.holdReasons).toEqual(['same reason', 'same reason']);
  });

  it('runs every check, even after one has failed, so one revision round gets every failure', () => {
    const seen: string[] = [];
    const record = (name: string): Check => () => {
      seen.push(name);
      return { failures: [failure('G1', name)], holdReasons: [] };
    };
    run([record('first'), record('second'), record('third')]);
    expect(seen).toEqual(['first', 'second', 'third']);
  });

  it('hands each check the input and the context', () => {
    const ctx = defaultContext({ publishedSlugs: ['taken'] });
    let received: unknown[] = [];
    runGateWith(
      [
        (input, context) => {
          received = [input, context];
          return { failures: [], holdReasons: [] };
        },
      ],
      INPUT,
      ctx,
    );
    expect(received[0]).toBe(INPUT);
    expect(received[1]).toBe(ctx);
  });

  it('lets an error from a check escape, so the run fails closed instead of publishing', () => {
    const broken: Check = () => {
      throw new Error('check blew up');
    };
    expect(() => run([broken])).toThrow('check blew up');
  });
});

describe('runGate', () => {
  it('runs the checks registered in ALL_CHECKS', () => {
    ALL_CHECKS.push(fails('G9', 'G9_STUB'));
    try {
      const result = runGate(INPUT, defaultContext());
      expect(result.failures.map((item) => item.code)).toContain('G9_STUB');
      expect(result.checks.G9).toBe('fail');
    } finally {
      ALL_CHECKS.pop();
    }
  });

  it('has ALL_CHECKS as a list of check functions', () => {
    expect(Array.isArray(ALL_CHECKS)).toBe(true);
    for (const check of ALL_CHECKS) {
      expect(typeof check).toBe('function');
    }
  });
});
