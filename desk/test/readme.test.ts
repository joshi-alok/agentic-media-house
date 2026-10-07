import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README says what the Desk does and does not do, and a sentence that a later change makes untrue must fail a test. These tests
// read the README of the repository and check the sections that state limits.

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

/** The text of a section of the README, from its heading to the next heading of the same level; throws when there is none. */
function section(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`the README has no section "${heading}"`);
  const rest = README.slice(start + 1);
  const next = rest.indexOf('\n## ', 3);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('the README: what the Desk is tested with', () => {
  const desk = (): string => section('The desk workspace');

  it('does not say that a test fails if anything reaches for a network, which nothing guarantees', () => {
    expect(README).not.toContain('a test fails if anything reaches for a network');
  });

  it('says what the guard of the tests does, and that it is a safety net and not a proof', () => {
    expect(desk()).toContain('`fetch`, `net.connect`, `http.request` and `https.request`');
    expect(desk()).toContain('network is not available in tests');
    expect(desk()).toContain('a safety net and not a proof');
  });

  it('says what the demo proves: the plumbing and the replay, and not the quality of a model', () => {
    const demo = section('The desk command');
    expect(demo).toContain('desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality');
  });

  it('says that --config takes a file of settings, and that a live run needs a user agent that is not a placeholder', () => {
    const command = section('The desk command');
    expect(command).toContain('[--config <path>]');
    expect(command).toContain('a user agent that links to an `.example` address is refused');
  });
});

describe('the README: how a replay knows how the run was made', () => {
  it('says that the record of a run says how it was made, that a replay needs no flag for it, and that a flag that contradicts the record is refused', () => {
    const command = section('The desk command');
    expect(section('The desk workspace')).toContain('which client answered the model, where the stories came from, and which try of its day it was');
    expect(command).toContain('The record of the run says which client and which sources it used, so a replay needs no flag for them');
    expect(command).toContain('one that contradicts the record is refused with exit code 2');
    expect(command).toContain('A record from before records said how a run was made has no such information and needs `--sources`');
  });
});

describe('the README: a day whose run failed', () => {
  it('says that a failed day is run again with no flag, how many runs a day may have, where the earlier run is kept, and what --force-new is for', () => {
    const workspace = section('The desk workspace');
    const command = section('The desk command');
    expect(workspace).toContain('a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise');
    expect(workspace).toContain('`runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed');
    expect(workspace).toContain('A day that published, was held or found no story is not run again unless `--force-new` says so');
    expect(command).toContain('the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run)');
    expect(command).toContain('how many runs one day may have (`maxAttemptsPerDay`)');
  });
});

describe('the README: money is not spent on a made-up world', () => {
  it('says that --client api with --sources fixtures is refused, and why', () => {
    const command = section('The desk command');
    expect(command).toContain('`--client api` with `--sources fixtures` is refused with exit code 2');
    expect(command).toContain('it would spend money on the answers of a model about pages that are made up');
  });
});

describe('the README: the normalised form of a value', () => {
  it('says that Extract holds the normalised form of every value to its raw text, and which values are not compared', () => {
    expect(section('The desk workspace')).toContain("and holds every value's normalised form and unit to its raw text");
    expect(section('What the Desk does not check')).toContain('**Values that are not compared.**');
    expect(section('What the Desk does not check')).toContain('not compared with its normalised form');
  });
});

describe('the README: what status says', () => {
  it('says what status prints: the last run with its day and try, the holds, the corrections and the retractions, and where the try comes from', () => {
    const command = section('The desk command');
    expect(command).toContain('`npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state.');
    expect(command).toContain('The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');

  it('says that text hidden by a style sheet is read as text of the page, and what is left out of it', () => {
    expect(limits()).toContain('style sheets');
    expect(limits()).toContain('`hidden`');
    expect(limits()).toContain('`aria-hidden="true"`');
    expect(limits()).toContain('`display:none`');
    expect(limits()).toContain('`<template>`');
  });

  it('says that the date a page gives itself is its own word, and what it is a check against', () => {
    expect(limits()).toContain('`publishedAt`');
    expect(limits()).toContain('A page can say what it likes about itself');
    expect(limits()).toContain('`stale-or-undated`');
  });

  it('says which addresses the fetcher refuses, and the one way round the check that is left', () => {
    expect(limits()).toContain('`HttpFetcher` looks a host up before the first request and before every hop of a redirect');
    expect(limits()).toContain('the error kind `address`');
    expect(limits()).toContain('DNS rebinding');
  });

  it('says that analysis sentences are read by code only and never by the model check, and that a model-written id is filtered before a prompt', () => {
    expect(limits()).toContain('**Analysis sentences.**');
    expect(limits()).toContain('the model check (G10) is never asked about them');
    expect(limits()).toContain('**Claim ids in a prompt.**');
  });

  it('says that the content of a details element is kept, on purpose', () => {
    expect(limits()).toContain('`<details>`');
    expect(limits()).toContain('on purpose');
  });
});
