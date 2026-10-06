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

  it('says that the content of a details element is kept, on purpose', () => {
    expect(limits()).toContain('`<details>`');
    expect(limits()).toContain('on purpose');
  });
});
