import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DeskState, LedgerEntry } from '@robywire/gate';
import { ledgerStats, stripItems } from '../src/lib/stats';

const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const ledgers = readdirSync(new URL('ledger/', FIXTURES)).map((name) => LedgerEntry.parse(JSON.parse(readFileSync(new URL(`ledger/${name}`, FIXTURES), 'utf8'))));
const fixtureState = DeskState.parse(JSON.parse(readFileSync(new URL('desk-state.json', FIXTURES), 'utf8')));
const EMPTY: DeskState = { lastRun: null, holds: [], corrections: [] };

describe('ledgerStats', () => {
  it('is all zeros, with no last run, when nothing has been published', () => {
    expect(ledgerStats([], EMPTY)).toEqual({ pieces: 0, claims: 0, held: 0, lastRun: null });
  });

  it('counts the pieces, adds up the claims they cite, counts the holds and passes the last run through', () => {
    const stats = ledgerStats(ledgers, fixtureState);
    expect(stats.pieces).toBe(5);
    expect(stats.claims).toBe(ledgers.reduce((total, entry) => total + entry.claims.filter((claim) => claim.source.tier === 1).length, 0));
    expect(stats.claims).toBe(5 * 28 - 1);
    expect(stats.held).toBe(2);
    expect(stats.lastRun).toEqual(fixtureState.lastRun);
  });

  it('does not count a claim that comes from another outlet as verified: it is reported, not traced to a primary source', () => {
    const first = structuredClone(ledgers[0]!);
    const before = ledgerStats([first], EMPTY).claims;
    first.claims[0]!.source = { ...first.claims[0]!.source, tier: 2, outlet: 'Mercer Wire' };
    expect(ledgerStats([first], EMPTY).claims).toBe(before - 1);
    expect(ledgerStats([first], EMPTY).pieces).toBe(1);
  });

  it('counts holds from the desk state, not from the pieces', () => {
    expect(ledgerStats(ledgers, EMPTY).held).toBe(0);
    expect(ledgerStats([], fixtureState).held).toBe(2);
  });
});

describe('stripItems', () => {
  it('shows zeros and "never" for an empty site', () => {
    expect(stripItems(ledgerStats([], EMPTY))).toEqual([
      { label: 'Pieces published', value: '0' },
      { label: 'Claims verified', value: '0' },
      { label: 'Drafts held', value: '0' },
      { label: 'Last run', value: 'never' },
    ]);
  });

  it('shows the figures, and the date, time and outcome of the last run', () => {
    expect(stripItems(ledgerStats(ledgers, fixtureState))).toEqual([
      { label: 'Pieces published', value: '5' },
      { label: 'Claims verified', value: '139' },
      { label: 'Drafts held', value: '2' },
      { label: 'Last run', value: '4 Oct 2026', note: '04:41 UTC, published' },
    ]);
  });

  it('groups thousands in a large count', () => {
    expect(stripItems({ pieces: 1234, claims: 56789, held: 0, lastRun: null }).map((item) => item.value).slice(0, 2)).toEqual(['1,234', '56,789']);
  });

  it('names every outcome plainly', () => {
    const outcome = (kind: 'published' | 'no-story' | 'held' | 'failed') =>
      stripItems({ pieces: 0, claims: 0, held: 0, lastRun: { at: '2026-10-04T04:41:12Z', outcome: kind, runId: 'r', slug: null } })[3]!.note;
    expect(outcome('published')).toBe('04:41 UTC, published');
    expect(outcome('no-story')).toBe('04:41 UTC, no story');
    expect(outcome('held')).toBe('04:41 UTC, held');
    expect(outcome('failed')).toBe('04:41 UTC, failed');
  });
});
