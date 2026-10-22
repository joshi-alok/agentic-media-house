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
  it('holds the length and the shape of a piece, its capitalised names and its filler as notes', () => {
    expect([...NOTE_CODES]).toEqual([
      'G2_OPENING_LENGTH',
      'G2_TAKEAWAYS_COUNT',
      'G2_BODY_LENGTH',
      'G2_HEADING_QUESTION',
      'G2_HEADING_TOO_LONG',
      'G4_NAME_UNSUPPORTED',
      'G4_HEADING_NAME',
      'G4_NUMBER_WORD_UNCHECKABLE',
      'G7_ANALYSIS_SHARE',
      'G9_BANNED_PHRASE',
    ]);
  });

  it('lists only codes that a check can report', () => {
    expect(NOTE_CODES.filter((code) => !ALL_FAILURE_CODES.includes(code))).toEqual([]);
  });

  it('lists no code twice', () => {
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
  });
});
