import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The site is built for an address, and that address is not chosen yet: until it is, the build uses a placeholder on
// a name that no one owns, and the variable SITE_URL puts the real one in its place. Canonical links, the sitemap, the
// feed and robots.txt are all written from this one address.

const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

describe('the address the site is built for', () => {
  it('is the placeholder of the publication unless SITE_URL gives another', () => {
    expect(config).toContain("site: process.env.SITE_URL ?? 'https://agenticmediahouse.example'");
  });

  it('is on .example, a name that is reserved for examples and that no one can own', () => {
    const placeholder = /process\.env\.SITE_URL \?\? '([^']+)'/.exec(config)?.[1];
    expect(placeholder).toBeDefined();
    expect(new URL(placeholder!).hostname.endsWith('.example')).toBe(true);
  });
});
