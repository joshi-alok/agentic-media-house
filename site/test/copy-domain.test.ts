import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deskIntro, disclosure, siteDescription } from '../src/lib/copy';
import { LIVE } from '../src/lib/live';

const EVERY_SETTING = [
  { ...LIVE, publishing: false, scheduler: false },
  { ...LIVE, publishing: true, scheduler: false },
  { ...LIVE, publishing: true, scheduler: true },
];

describe('the words of the site', () => {
  it.each(EVERY_SETTING)('say AI agents in crypto and not robotics, whatever is live (%#)', (live) => {
    for (const text of [siteDescription(live), deskIntro(live), disclosure(live)]) {
      expect(text).not.toMatch(/robot/i);
    }
    expect(siteDescription(live)).toMatch(/AI agents in crypto/);
  });

  it.each(EVERY_SETTING)('say what is true in the footer: the sources are linked, the pipeline writes, and it is not advice (%#)', (live) => {
    const text = disclosure(live);
    expect(text).toContain('automated pipeline');
    expect(text).toContain('Nothing here is financial advice.');
    expect(text).not.toMatch(/primary source/i);
  });
});

describe('the home page', () => {
  it('has a heading about AI agents in crypto and not about robotics', () => {
    const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
    expect(home).toContain('<h1 class="home-title">AI agents in crypto, with a receipt for every claim.</h1>');
    expect(home).not.toMatch(/robot/i);
  });
});
