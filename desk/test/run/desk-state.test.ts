import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { addCorrection, addHold, assertNothingLost, readDeskState, recordRun, updateDeskState, writeDeskState } from '../../src/run/desk-state';
import type { Hold, LastRun } from '../../src/run/desk-state';
import { useScratch } from '../support/context';

// The desk state is the one file of the site that the Desk changes after the first build: what the last run did, the drafts that were
// held, and the corrections. The Desk may add to it and may replace the record of the last run; it may never remove anything. A file it
// cannot read is left exactly as it is, because the next run must not start from a guess.

const scratch = useScratch();

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const RUN: LastRun = { at: '2026-10-05T04:31:00.000Z', outcome: 'published', runId: '2026-10-05-043100', slug: 'fixture-robotics-ships-fx-1' };
const HOLD: Hold = { at: '2026-10-05T04:32:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'] };
const CORRECTION: DeskState['corrections'][number] = { at: '2026-10-06T09:00:00.000Z', slug: 'fixture-robotics-ships-fx-1', kind: 'correction', note: 'A figure was wrong.' };

/** A file in a new folder, holding `text`. */
function fileWith(text: string): string {
  const file = path.join(scratch(), 'desk-state.json');
  writeFileSync(file, text);
  return file;
}

const textOf = (file: string): string => readFileSync(file, 'utf8');

describe('recordRun', () => {
  it('sets the last run and leaves everything else as it was', () => {
    const state: DeskState = { lastRun: null, holds: [HOLD], corrections: [CORRECTION] };
    expect(recordRun(state, RUN)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('replaces the run that was recorded before: only the last one is kept', () => {
    const earlier: LastRun = { ...RUN, outcome: 'no-story', runId: 'earlier', slug: null };
    expect(recordRun(recordRun(EMPTY, earlier), RUN).lastRun).toEqual(RUN);
  });

  it('does not change the state it is given, nor share its arrays with the new one', () => {
    const state: DeskState = { lastRun: null, holds: [HOLD], corrections: [] };
    const next = recordRun(state, RUN);
    expect(state.lastRun).toBeNull();
    next.holds.push({ ...HOLD, reasons: ['G4_NUMBER_UNSUPPORTED'] });
    expect(state.holds).toEqual([HOLD]);
  });
});

describe('addHold', () => {
  it('adds the hold after the holds that are there, in the order they were added', () => {
    const second: Hold = { ...HOLD, at: '2026-10-06T04:32:00.000Z', reasons: ['G4_NUMBER_UNSUPPORTED', 'G2_BODY_LENGTH'] };
    const third: Hold = { ...HOLD, at: '2026-10-07T04:32:00.000Z', categories: ['humanoids', 'funding'], reasons: ['VERIFIER_NOT_ENTAILED'] };
    const state = addHold(addHold(addHold(EMPTY, HOLD), second), third);
    expect(state.holds).toEqual([HOLD, second, third]);
  });

  it('leaves the last run and the corrections as they were', () => {
    const state: DeskState = { lastRun: RUN, holds: [], corrections: [CORRECTION] };
    expect(addHold(state, HOLD)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('does not change the state it is given', () => {
    addHold(EMPTY, HOLD);
    expect(EMPTY.holds).toEqual([]);
  });
});

describe('addCorrection', () => {
  it('adds the correction after the corrections that are there, in the order they were added', () => {
    const second = { ...CORRECTION, at: '2026-10-07T09:00:00.000Z', kind: 'retraction' as const, note: 'Withdrawn.' };
    expect(addCorrection(addCorrection(EMPTY, CORRECTION), second).corrections).toEqual([CORRECTION, second]);
  });

  it('leaves the last run and the holds as they were', () => {
    const state: DeskState = { lastRun: RUN, holds: [HOLD], corrections: [] };
    expect(addCorrection(state, CORRECTION)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('does not change the state it is given, nor share its arrays with the new one', () => {
    const state: DeskState = { lastRun: null, holds: [], corrections: [CORRECTION] };
    const next = addCorrection(state, { ...CORRECTION, note: 'Another.' });
    next.corrections.push({ ...CORRECTION, note: 'A third.' });
    expect(state.corrections).toEqual([CORRECTION]);
  });
});

describe('readDeskState', () => {
  it('reads a state that is valid', async () => {
    const file = fileWith(JSON.stringify({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] }));
    expect(await readDeskState(file)).toEqual({ lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] });
  });

  it('reads the file that the site is committed with, which says that nothing has happened yet', async () => {
    const committed = new URL('../../../site/src/data/desk-state.json', import.meta.url);
    expect(await readDeskState(committed.pathname)).toEqual(EMPTY);
  });

  it('refuses a file that is not there, and says which', async () => {
    const file = path.join(scratch(), 'missing.json');
    await expect(readDeskState(file)).rejects.toThrow(`the desk state ${file} does not exist`);
  });

  it('refuses a file that is not JSON, and says which', async () => {
    const file = fileWith('{"lastRun": null, ');
    await expect(readDeskState(file)).rejects.toThrow(`the desk state ${file} is not valid JSON`);
  });

  it('refuses a file that does not fit the schema, and says what is wrong', async () => {
    const file = fileWith(JSON.stringify({ lastRun: { ...RUN, outcome: 'finished' }, holds: [], corrections: [] }));
    await expect(readDeskState(file)).rejects.toThrow(/the desk state .* is not valid: lastRun\.outcome/);
  });

  it('refuses a file that has a field the desk state does not have, because writing it again would drop the field', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [], corrections: [], note: 'by hand' }));
    await expect(readDeskState(file)).rejects.toThrow('has fields that the desk state does not define');
  });
});

describe('writeDeskState', () => {
  it('writes the state as JSON with two-space indents, the fields in the order of the schema, and a final newline', async () => {
    const file = path.join(scratch(), 'desk-state.json');
    await writeDeskState(file, { corrections: [], holds: [HOLD], lastRun: RUN });
    expect(textOf(file)).toBe(`${JSON.stringify({ lastRun: RUN, holds: [HOLD], corrections: [] }, null, 2)}\n`);
    expect(textOf(file).startsWith('{\n  "lastRun": {')).toBe(true);
  });

  it('refuses a state that is not valid, and leaves the file as it was', async () => {
    const file = fileWith('before');
    await expect(writeDeskState(file, { lastRun: { ...RUN, at: 'yesterday' }, holds: [], corrections: [] })).rejects.toThrow('is not valid');
    expect(textOf(file)).toBe('before');
  });

  it('writes what readDeskState reads back', async () => {
    const file = path.join(scratch(), 'desk-state.json');
    const state: DeskState = { lastRun: RUN, holds: [HOLD, { ...HOLD, prUrl: 'https://github.example/robywire/pull/3' }], corrections: [CORRECTION] };
    await writeDeskState(file, state);
    expect(await readDeskState(file)).toEqual(state);
  });
});

describe('updateDeskState', () => {
  it('reads the file, applies the change and writes the result', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    const result = await updateDeskState(file, (state) => addHold(recordRun(state, { ...RUN, outcome: 'held' }), HOLD));
    expect(result).toEqual({ lastRun: { ...RUN, outcome: 'held' }, holds: [HOLD], corrections: [] });
    expect(await readDeskState(file)).toEqual(result);
  });

  it('keeps the holds in the order of the updates, however many runs there are', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    for (const code of ['G2_BODY_LENGTH', 'G4_NUMBER_UNSUPPORTED', 'TIER2_ATTRIBUTION']) {
      await updateDeskState(file, (state) => addHold(state, { ...HOLD, reasons: [code] }));
    }
    expect((await readDeskState(file)).holds.map((hold) => hold.reasons)).toEqual([['G2_BODY_LENGTH'], ['G4_NUMBER_UNSUPPORTED'], ['TIER2_ATTRIBUTION']]);
  });

  it('refuses a change that removes a hold, and leaves the file as it was', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [HOLD], corrections: [] }));
    const before = textOf(file);
    await expect(updateDeskState(file, (state) => ({ ...state, holds: [] }))).rejects.toThrow('the desk state never loses a hold or a correction');
    expect(textOf(file)).toBe(before);
  });

  it('refuses a change that rewrites a hold or a correction, and one that puts a hold before the ones that were there', async () => {
    const file = fileWith(JSON.stringify({ lastRun: null, holds: [HOLD], corrections: [CORRECTION] }));
    const before = textOf(file);
    await expect(updateDeskState(file, (state) => ({ ...state, corrections: [{ ...CORRECTION, note: 'Changed.' }] }))).rejects.toThrow('never loses');
    await expect(updateDeskState(file, (state) => ({ ...state, holds: [{ ...HOLD, reasons: ['G9_SLUG_TAKEN'] }, ...state.holds] }))).rejects.toThrow('never loses');
    expect(textOf(file)).toBe(before);
  });

  it('fails closed on a file that is corrupt: the change is not run, and the file is untouched', async () => {
    const file = fileWith('{"lastRun": nul');
    let ran = false;
    await expect(
      updateDeskState(file, (state) => {
        ran = true;
        return state;
      }),
    ).rejects.toThrow('is not valid JSON');
    expect(ran).toBe(false);
    expect(textOf(file)).toBe('{"lastRun": nul');
  });

  it('writes nothing when the change throws', async () => {
    const file = fileWith(JSON.stringify(EMPTY));
    const before = textOf(file);
    await expect(
      updateDeskState(file, () => {
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(textOf(file)).toBe(before);
  });
});

describe('assertNothingLost', () => {
  const before: DeskState = { lastRun: RUN, holds: [HOLD], corrections: [CORRECTION] };

  it('accepts a state that has the same holds and corrections and more after them, and any last run', () => {
    const after: DeskState = { lastRun: null, holds: [HOLD, { ...HOLD, reasons: ['G2_BODY_LENGTH'] }], corrections: [CORRECTION, { ...CORRECTION, kind: 'retraction' }] };
    expect(() => assertNothingLost(before, after, 'desk-state.json')).not.toThrow();
    expect(() => assertNothingLost(before, before, 'desk-state.json')).not.toThrow();
  });

  it('refuses a state with a hold or a correction fewer, one rewritten, or the order changed, and names the file', () => {
    const second: Hold = { ...HOLD, reasons: ['G2_BODY_LENGTH'] };
    expect(() => assertNothingLost(before, { ...before, holds: [] }, 'desk-state.json')).toThrow('the change to desk-state.json would remove or rewrite one');
    expect(() => assertNothingLost(before, { ...before, corrections: [] }, 'desk-state.json')).toThrow('never loses');
    expect(() => assertNothingLost(before, { ...before, holds: [second] }, 'desk-state.json')).toThrow('never loses');
    expect(() => assertNothingLost({ ...before, holds: [HOLD, second] }, { ...before, holds: [second, HOLD] }, 'desk-state.json')).toThrow('never loses');
  });
});
