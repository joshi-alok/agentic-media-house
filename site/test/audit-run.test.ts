import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKS, runChecks } from '../scripts/audit/checks.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
import { smallPage, smallSite } from './support/small-site';

const TOKENS_CSS = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const run = (changes: Record<string, string | null> = {}, prod = false) => runChecks(siteFromFiles(smallSite(changes)), { tokensCss: TOKENS_CSS, prod });
const failed = (results: ReturnType<typeof run>) => results.filter((result) => !result.ok).map((result) => result.id);

describe('CHECKS', () => {
  it('lists the checks A1 to A17 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 17 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title.length).toBeGreaterThan(10);
  });

  it('marks only A13, the fixture check, as one that runs for a production build alone', () => {
    expect(CHECKS.filter((check) => check.prodOnly).map((check) => check.id)).toEqual(['A13']);
  });
});

describe('runChecks', () => {
  it('passes the small site with every check except A13, in order, each result carrying its title', () => {
    const results = run();
    expect(results.map((result) => result.id)).toEqual(CHECKS.filter((check) => !check.prodOnly).map((check) => check.id));
    expect(failed(results)).toEqual([]);
    for (const result of results) expect(result.title).toBe(CHECKS.find((check) => check.id === result.id)?.title);
  });

  it('runs A13 as well for a production build, between A12 and A14, and the small site passes it', () => {
    const results = run({}, true);
    expect(results.map((result) => result.id).slice(11, 14)).toEqual(['A12', 'A13', 'A14']);
    expect(failed(results)).toEqual([]);
  });

  it('lets a fixture build through when it is not a production build, and stops it when it is', () => {
    const changes = { 'index.html': smallPage('/', 'Home', '<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div>') };
    expect(failed(run(changes))).toEqual([]);
    expect(failed(run(changes, true))).toEqual(['A13']);
  });

  it('fails the checks that the breakage belongs to, and only those', () => {
    const changes = {
      'index.html': smallPage('/', 'Home', '<p><img src="/a.png" alt="">text <em>x</em></p><a href="/gone/">gone</a>'),
      '_astro/a.css': 'a{color:#ff0000;border:3px solid #e4e7ea}',
    };
    expect(failed(run(changes))).toEqual(['A4', 'A5', 'A7', 'A8', 'A12']);
  });

  it('reports the problems of a check with the file they are in', () => {
    const results = run({ 'status/index.html': smallPage('/status/', 'Status', '<h1>two</h1>') });
    expect(results.find((result) => result.id === 'A2')?.problems).toEqual(['status/index.html: has 2 <h1> elements; a page needs exactly 1']);
  });

  it('needs the text of the tokens file', () => {
    // @ts-expect-error The tokens file is required.
    expect(() => runChecks(siteFromFiles(smallSite()), {})).toThrow('tokensCss');
  });
});
