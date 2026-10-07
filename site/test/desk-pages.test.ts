import { describe, expect, it } from 'vitest';
import type { DeskState } from '@robywire/gate';
import { CORRECTIONS_TEXT, correctionRows, holdRows, statusView } from '../src/lib/desk-pages';

const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };
const FX1 = 'fixture-robotics-ships-fx-1-to-second-plant';
const FX2 = 'fixture-robotics-ships-fx-2-to-second-plant';

const STATE: DeskState = {
  lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'published', runId: 'fixture-run-1', slug: FX1 },
  holds: [
    {
      at: '2026-09-29T04:36:40Z',
      categories: ['policy-standards', 'funding'],
      reasons: ['TIER2_ATTRIBUTION'],
    },
    {
      at: '2026-09-30T04:38:05Z',
      categories: ['humanoids'],
      reasons: ['G4_NUMBER_UNSUPPORTED', 'G9_BANNED_PHRASE'],
      prUrl: 'https://github.example/agentic-media-house/agentic-media-house/pull/12',
    },
  ],
  corrections: [
    { at: '2026-10-03T09:12:00Z', slug: FX2, kind: 'correction', note: 'The reach is 1.4 m.' },
    { at: '2026-10-04T10:00:00Z', slug: FX1, kind: 'retraction', note: 'Withdrawn.' },
  ],
};

describe('statusView', () => {
  it('says nothing has run, and counts nothing, for an empty state', () => {
    expect(statusView(EMPTY)).toEqual({ lastRun: null, holds: 0, corrections: 0 });
  });

  it('writes the last run in words and counts the holds and the corrections', () => {
    expect(statusView(STATE)).toEqual({
      lastRun: { when: '4 Oct 2026, 04:41 UTC', outcome: 'published', runId: 'fixture-run-1', slug: FX1 },
      holds: 2,
      corrections: 2,
    });
  });

  it('writes each outcome the way the home page strip does', () => {
    const outcome = (value: 'published' | 'no-story' | 'held' | 'failed') =>
      statusView({ ...EMPTY, lastRun: { at: '2026-10-04T04:41:12Z', outcome: value, runId: 'r', slug: null } }).lastRun?.outcome;
    expect([outcome('published'), outcome('no-story'), outcome('held'), outcome('failed')]).toEqual(['published', 'no story', 'held', 'failed']);
  });

  it('keeps a missing slug as null', () => {
    const view = statusView({ ...EMPTY, lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'no-story', runId: 'r', slug: null } });
    expect(view.lastRun?.slug).toBeNull();
  });
});

describe('holdRows', () => {
  it('is empty when nothing has been held', () => {
    expect(holdRows(EMPTY)).toEqual([]);
  });

  it('lists the newest hold first, with beat names and a label beside each reason code', () => {
    expect(holdRows(STATE)).toEqual([
      {
        at: '2026-09-30T04:38:05Z',
        when: '30 Sep 2026',
        beats: ['Humanoids'],
        reasons: [
          { code: 'G4_NUMBER_UNSUPPORTED', label: 'A number was not in the claims it cites' },
          { code: 'G9_BANNED_PHRASE', label: 'A banned filler phrase was used' },
        ],
      },
      {
        at: '2026-09-29T04:36:40Z',
        when: '29 Sep 2026',
        beats: ['Policy & standards', 'Funding'],
        reasons: [{ code: 'TIER2_ATTRIBUTION', label: "Rests on another outlet's reporting" }],
      },
    ]);
  });

  it('carries nothing but the date, the beats and the reasons: no pull request address and no held text', () => {
    for (const row of holdRows(STATE)) expect(Object.keys(row).sort()).toEqual(['at', 'beats', 'reasons', 'when']);
  });

  it('shows no more for a hold that remembers its story: the slug of the held piece and the address of the story are for the Desk, and the page shows the date, the beats and the reasons only', () => {
    const remembering: DeskState = {
      ...EMPTY,
      holds: [{ ...STATE.holds[1]!, slug: 'a-held-piece-that-is-not-published', sourceUrl: 'https://mercer-wire.example/robotics/the-story-that-is-held' }],
    };
    expect(holdRows(remembering)).toEqual(holdRows({ ...EMPTY, holds: [STATE.holds[1]!] }));
    const shown = JSON.stringify(holdRows(remembering));
    expect(shown).not.toContain('a-held-piece-that-is-not-published');
    expect(shown).not.toContain('the-story-that-is-held');
  });

  it('orders by the moment, not by the text of the time, when the times have different offsets', () => {
    const state: DeskState = {
      ...EMPTY,
      holds: [
        // 2026-10-01 23:00 UTC, written with an offset that makes its text sort last.
        { at: '2026-10-02T04:30:00+05:30', categories: ['humanoids'], reasons: [] },
        { at: '2026-10-02T00:00:00Z', categories: ['humanoids'], reasons: [] },
      ],
    };
    expect(holdRows(state).map((row) => row.at)).toEqual(['2026-10-02T00:00:00Z', '2026-10-02T04:30:00+05:30']);
  });

  it('shows a reason it has no label for as the code itself', () => {
    const state: DeskState = { ...EMPTY, holds: [{ at: '2026-10-01T00:00:00Z', categories: ['humanoids'], reasons: ['SOMETHING_NEW'] }] };
    expect(holdRows(state)[0]?.reasons).toEqual([{ code: 'SOMETHING_NEW', label: 'SOMETHING_NEW' }]);
  });

  it('stops with a clear message when a hold names a beat the site does not have', () => {
    const state: DeskState = { ...EMPTY, holds: [{ at: '2026-10-01T00:00:00Z', categories: ['cooking'], reasons: [] }] };
    expect(() => holdRows(state)).toThrow('"cooking" is not a beat or a tag');
  });

  it('does not change the state it is given', () => {
    const before = structuredClone(STATE);
    holdRows(STATE);
    expect(STATE).toEqual(before);
  });
});

describe('correctionRows', () => {
  const titles = new Map([
    [FX1, 'Fixture Robotics ships its FX-1 warehouse arm to a second plant'],
    [FX2, 'Fixture Robotics ships its FX-2 warehouse arm to a second plant'],
  ]);

  it('is empty when there are no corrections', () => {
    expect(correctionRows(EMPTY, titles)).toEqual([]);
  });

  it('lists the newest first, with the title of the piece, the kind in words and the note', () => {
    expect(correctionRows(STATE, titles)).toEqual([
      {
        at: '2026-10-04T10:00:00Z',
        when: '4 Oct 2026, 10:00 UTC',
        slug: FX1,
        title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
        kind: 'Retraction',
        note: 'Withdrawn.',
      },
      {
        at: '2026-10-03T09:12:00Z',
        when: '3 Oct 2026, 09:12 UTC',
        slug: FX2,
        title: 'Fixture Robotics ships its FX-2 warehouse arm to a second plant',
        kind: 'Correction',
        note: 'The reach is 1.4 m.',
      },
    ]);
  });

  it('leaves the title undefined for a piece the site does not have, so the page shows the slug without a link', () => {
    const rows = correctionRows(STATE, new Map([[FX2, 'A title']]));
    expect(rows.map((row) => row.title)).toEqual([undefined, 'A title']);
  });
});

describe('CORRECTIONS_TEXT', () => {
  it('says what the site does when a correction is recorded: a notice at the top, an updated date in the byline, a build that refuses a mismatch', () => {
    expect(CORRECTIONS_TEXT).toContain('a notice at the top that says what changed and when');
    expect(CORRECTIONS_TEXT).toContain('its byline shows the date it was updated');
    expect(CORRECTIONS_TEXT).toContain('refuses to build if the piece and the record disagree');
  });

  it('keeps the retraction promise: the page stays up with its notice and the receipts stay public', () => {
    expect(CORRECTIONS_TEXT).toContain('A retraction withdraws a piece: the page stays up with its notice, and its receipts stay public.');
  });

  it('speaks of what the site shows, not of an updated date that "is set"', () => {
    expect(CORRECTIONS_TEXT).not.toMatch(/\bis set\b/);
  });
});
