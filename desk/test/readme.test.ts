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
