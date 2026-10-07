import { readFile } from 'node:fs/promises';
import { DeskState } from '@robywire/gate';
import { describeIssues } from '../issues';
import { canonicalJson } from '../model/types';
import { writeFileAtomic } from './atomic';

// The desk state is what the Desk says about itself on the site: the last run and what it did, the drafts it held, and the
// corrections. It is one JSON file in the site (`site/src/data/desk-state.json`) and the site checks it against the gate's
// `DeskState` schema, so that is the schema used here. The Desk may add a hold and may replace the record of the last run. It
// never removes or rewrites anything else (a correction is public, and so is a hold), and a file it cannot read is left exactly
// as it is: a run that starts from a guess could erase the record of what the Desk did.

/** The record of a run, as the state keeps it. */
export type LastRun = NonNullable<DeskState['lastRun']>;

/** A draft the gate held back: when, its categories, why (the codes of the failures and hold reasons), and the pull request when there is one. */
export type Hold = DeskState['holds'][number];

/** A correction or a retraction of a published piece: when it was recorded, which piece, which of the two it is, and the note that says why. */
export type Correction = DeskState['corrections'][number];

/** The state with `run` as its last run. A new state: the one given is not changed, and the two share nothing. */
export function recordRun(state: DeskState, run: LastRun): DeskState {
  return structuredClone({ ...state, lastRun: run });
}

/** The state with `hold` after the holds that are there. A new state: the one given is not changed, and the two share nothing. */
export function addHold(state: DeskState, hold: Hold): DeskState {
  return structuredClone({ ...state, holds: [...state.holds, hold] });
}

/** The state with `correction` after the corrections that are there. A new state: the one given is not changed, and the two share nothing. */
export function addCorrection(state: DeskState, correction: Correction): DeskState {
  return structuredClone({ ...state, corrections: [...state.corrections, correction] });
}

/**
 * Read and check the desk state in `file`. A file that is missing (a run in the wrong folder), is not JSON, does not fit the
 * schema, or has a field the schema does not define is an error that names the file. The last is refused because the schema
 * would drop the field when the state is written again, and the Desk does not delete.
 */
export async function readDeskState(file: string): Promise<DeskState> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the desk state ${file} does not exist`);
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error(`the desk state ${file} is not valid JSON`);
  }
  const parsed = DeskState.safeParse(data);
  if (!parsed.success) throw new Error(`the desk state ${file} is not valid: ${describeIssues(parsed.error)}`);
  if (canonicalJson(parsed.data) !== canonicalJson(data)) {
    throw new Error(`the desk state ${file} has fields that the desk state does not define, so the Desk does not rewrite it`);
  }
  return parsed.data;
}

/**
 * Check `state` and write it to `file`: JSON with two-space indents, the fields in the order of the schema and a final newline, written in
 * one step (see `writeFileAtomic`). A state that is not valid is not written.
 */
export async function writeDeskState(file: string, state: DeskState): Promise<void> {
  const parsed = DeskState.safeParse(state);
  if (!parsed.success) throw new Error(`the desk state to write to ${file} is not valid: ${describeIssues(parsed.error)}`);
  await writeFileAtomic(file, `${JSON.stringify(parsed.data, null, 2)}\n`);
}

/** Whether `before` is the first items of `after`, item for item. */
const isPrefix = (before: readonly unknown[], after: readonly unknown[]): boolean =>
  before.length <= after.length && before.every((item, at) => canonicalJson(item) === canonicalJson(after[at]));

/**
 * Refuse a change that loses a hold or a correction: the holds and the corrections of `before` must be the first ones of `after`, item for item and in
 * the same order, so that nothing was removed, rewritten or moved. `file` is named in the error.
 */
export function assertNothingLost(before: DeskState, after: DeskState, file: string): void {
  if (!isPrefix(before.holds, after.holds) || !isPrefix(before.corrections, after.corrections)) {
    throw new Error(`the desk state never loses a hold or a correction: the change to ${file} would remove or rewrite one`);
  }
}

/**
 * Read the state in `file`, apply `change` to it and write the result; returns the result. The state that is read is checked first,
 * so a corrupt file ends the update before `change` is called. A change that loses a hold or a correction (see `assertNothingLost`) is
 * refused. In every case where there is an error, the file is not touched.
 */
export async function updateDeskState(file: string, change: (state: DeskState) => DeskState): Promise<DeskState> {
  const before = await readDeskState(file);
  const after = change(structuredClone(before));
  assertNothingLost(before, after, file);
  await writeDeskState(file, after);
  return after;
}
