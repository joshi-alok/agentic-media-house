import { describe, expect, it } from 'vitest';
import { robotsTxt } from '../src/lib/robots';

describe('robotsTxt', () => {
  it('allows every crawler and points at the sitemap index on the site', () => {
    expect(robotsTxt(new URL('https://robywire.example'))).toBe('User-agent: *\nAllow: /\n\nSitemap: https://robywire.example/sitemap-index.xml\n');
  });

  it('follows the address of the site, so a build for another domain points at that domain', () => {
    expect(robotsTxt('https://news.example.org')).toContain('Sitemap: https://news.example.org/sitemap-index.xml\n');
  });

  it('keeps the path of a site that lives below the root of its domain', () => {
    expect(robotsTxt('https://example.org/robots/')).toContain('Sitemap: https://example.org/robots/sitemap-index.xml\n');
  });

  it('ends with exactly one newline and disallows nothing', () => {
    const text = robotsTxt('https://robywire.example');
    expect(text.endsWith('xml\n')).toBe(true);
    expect(text).not.toMatch(/disallow/i);
  });
});
