import { ALL_CHECKS } from './checks';
import { CHECK_IDS } from './constants';
import type { CheckId, CheckResult, Route } from './constants';
import type { GateContext } from './config';
import type { Claim, Draft } from './schemas';
import { NOTE_CODES, severityOf } from './severity';

export type { CheckId } from './constants';
export { defaultContext } from './config';
export type { GateConfig, GateContext } from './config';

/** What the gate looks at: a draft and every claim it may cite. */
export interface GateInput {
  draft: Draft;
  claims: Claim[];
}

/** One thing a check found wrong. `code` is stable, `message` is for the composer, `where` locates it. */
export interface Failure {
  check: CheckId;
  code: string;
  message: string;
  where?: string;
}

/**
 * What a check returns. `failures` are everything the check found: the gate decides which of them block (see `severityOf`).
 * `holdReasons` do not send a draft back: they say the draft may be fine but needs the owner.
 */
export interface CheckOutput {
  failures: Failure[];
  holdReasons: string[];
}

/** A check is a pure function of the draft, the claims and the context. */
export type Check = (input: GateInput, ctx: GateContext) => CheckOutput;

export interface GateResult {
  route: Route;
  /** The blockers: what the draft is sent back for. */
  failures: Failure[];
  /** The notes: what was found and does not block (see `NOTE_CODES`). They are recorded in the ledger and never go back to the composer. */
  warnings: Failure[];
  holdReasons: string[];
  /** All nine ids are always present. A check is 'fail' when it produced a blocker. */
  checks: Record<CheckId, CheckResult>;
}

/**
 * Run `checks`, split what they report into blockers and notes by the severity of each code, and decide the route: any blocker means 'revise';
 * otherwise any hold reason means 'hold'; otherwise 'publish'. Every check runs, so one revision round gets every blocker at once. An error
 * thrown by a check is not caught: the run fails and nothing publishes. `notes` is the list of codes that do not block; the default is the
 * gate's own list, and a test may pass another.
 */
export function runGateWith(checks: readonly Check[], input: GateInput, ctx: GateContext, notes: readonly string[] = NOTE_CODES): GateResult {
  const outputs = checks.map((check) => check(input, ctx));
  const found = outputs.flatMap((output) => output.failures);
  const failures = found.filter((item) => severityOf(item.code, notes) === 'blocker');
  const warnings = found.filter((item) => severityOf(item.code, notes) === 'note');
  const holdReasons = outputs.flatMap((output) => output.holdReasons);

  const summary = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as Record<CheckId, CheckResult>;
  for (const item of failures) {
    summary[item.check] = 'fail';
  }

  const route: Route = failures.length > 0 ? 'revise' : holdReasons.length > 0 ? 'hold' : 'publish';
  return { route, failures, warnings, holdReasons, checks: summary };
}

/** Run every check in `ALL_CHECKS`. */
export function runGate(input: GateInput, ctx: GateContext): GateResult {
  return runGateWith(ALL_CHECKS, input, ctx);
}
