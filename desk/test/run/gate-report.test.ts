import { CHECK_IDS } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { GateReport } from '../../src/run/artifacts';

const ALL_PASS = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass']));

describe('GateReport', () => {
  it('accepts a report with notes', () => {
    const report = { route: 'publish', failures: [], warnings: [{ check: 'G2', code: 'G2_BODY_LENGTH', message: 'the body is 300 words' }], holdReasons: [], checks: ALL_PASS };
    expect(GateReport.parse(report)).toEqual(report);
  });

  it('accepts a report written before notes existed', () => {
    const report = { route: 'publish', failures: [], holdReasons: [], checks: ALL_PASS };
    expect(GateReport.parse(report)).toEqual(report);
  });

  it('refuses a note that is not a finding', () => {
    expect(GateReport.safeParse({ route: 'publish', failures: [], warnings: [{ code: 'G2_BODY_LENGTH' }], holdReasons: [], checks: ALL_PASS }).success).toBe(false);
  });
});
