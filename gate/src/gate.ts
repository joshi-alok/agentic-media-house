import { ALL_CHECKS } from './checks';
import { CHECK_IDS } from './constants';
import type { CheckId, CheckResult, Route } from './constants';
import type { GateContext } from './config';
import type { Claim, Draft } from './schemas';

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
 * What a check returns. `failures` send the draft back for revision.
 * `holdReasons` do not: they say the draft may be fine but needs the owner.
 */
export interface CheckOutput {
  failures: Failure[];
  holdReasons: string[];
}

/** A check is a pure function of the draft, the claims and the context. */
export type Check = (input: GateInput, ctx: GateContext) => CheckOutput;

export interface GateResult {
  route: Route;
  failures: Failure[];
  holdReasons: string[];
  /** All nine ids are always present. A check is 'fail' when it produced a failure. */
  checks: Record<CheckId, CheckResult>;
}

/**
 * Run `checks`, merge what they return, and decide the route: any failure
 * means 'revise'; otherwise any hold reason means 'hold'; otherwise 'publish'.
 * Every check runs, so one revision round gets every failure at once. An error
 * thrown by a check is not caught: the run fails and nothing publishes.
 */
export function runGateWith(checks: readonly Check[], input: GateInput, ctx: GateContext): GateResult {
  const outputs = checks.map((check) => check(input, ctx));
  const failures = outputs.flatMap((output) => output.failures);
  const holdReasons = outputs.flatMap((output) => output.holdReasons);

  const summary = Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as Record<CheckId, CheckResult>;
  for (const item of failures) {
    summary[item.check] = 'fail';
  }

  const route: Route = failures.length > 0 ? 'revise' : holdReasons.length > 0 ? 'hold' : 'publish';
  return { route, failures, holdReasons, checks: summary };
}

/** Run every check in `ALL_CHECKS`. */
export function runGate(input: GateInput, ctx: GateContext): GateResult {
  return runGateWith(ALL_CHECKS, input, ctx);
}
