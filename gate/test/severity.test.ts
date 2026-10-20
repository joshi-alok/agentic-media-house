import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES } from '../src/checks';
import { NOTE_CODES, SEVERITIES, severityOf } from '../src/severity';

describe('severityOf', () => {
  it('has two severities, blocker and note', () => {
    expect(SEVERITIES).toEqual(['blocker', 'note']);
  });

  it('calls a code on the list of notes a note', () => {
    expect(severityOf('G2_BODY_LENGTH', ['G2_BODY_LENGTH'])).toBe('note');
  });

  it('calls every other code a blocker', () => {
    expect(severityOf('G3_NO_CLAIM', ['G2_BODY_LENGTH'])).toBe('blocker');
  });

  it('calls a code that nothing knows a blocker, so a new check cannot publish a piece by being left out of a table', () => {
    expect(severityOf('G9_SOMETHING_NEW')).toBe('blocker');
  });
});

describe('NOTE_CODES', () => {
  it('lists only codes that a check can report', () => {
    expect(NOTE_CODES.filter((code) => !ALL_FAILURE_CODES.includes(code))).toEqual([]);
  });

  it('lists no code twice', () => {
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
  });
});
