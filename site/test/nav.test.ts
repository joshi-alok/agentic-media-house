import { describe, expect, it } from 'vitest';
import { BEATS } from '@robywire/gate';
import { DISCLOSURE, FOOTER_LINKS, NAV_ITEMS, isCurrent } from '../src/lib/nav';
import { beatLabel } from '../src/lib/format';

describe('NAV_ITEMS', () => {
  it('lists the seven beats in vocabulary order, then Method', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([...BEATS.map((beat) => `/topics/${beat}/`), '/method/']);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([...BEATS.map((beat) => beatLabel(beat)), 'Method']);
  });

  it('does not list the funding tag, which is not a beat', () => {
    expect(NAV_ITEMS.some((item) => item.href.includes('funding'))).toBe(false);
  });

  it('links to folders, every href ending in a slash', () => {
    for (const item of NAV_ITEMS) expect(item.href.endsWith('/'), item.href).toBe(true);
  });
});

describe('FOOTER_LINKS', () => {
  it('links to the method, status, holds and corrections pages and the feed', () => {
    expect(FOOTER_LINKS).toEqual([
      { label: 'Method', href: '/method/' },
      { label: 'Status', href: '/status/' },
      { label: 'Holds', href: '/holds/' },
      { label: 'Corrections', href: '/corrections/' },
      { label: 'RSS', href: '/rss.xml' },
    ]);
  });
});

describe('DISCLOSURE', () => {
  it('says the pieces come from an automated pipeline and are published only when every factual sentence is traced to a primary source', () => {
    expect(DISCLOSURE).toContain('automated pipeline');
    expect(DISCLOSURE).toContain('every factual sentence');
    expect(DISCLOSURE).toContain('primary source');
  });

  it('claims nothing the site does not do yet: no second model, no independent check, no human review', () => {
    expect(DISCLOSURE).not.toMatch(/second model|verifier|independent|review|human|editor/i);
  });

  it('is a short passage, not a page', () => {
    expect(DISCLOSURE.length).toBeLessThan(400);
  });
});

describe('isCurrent', () => {
  it('is true for the page itself', () => {
    expect(isCurrent('/method/', '/method/')).toBe(true);
    expect(isCurrent('/topics/humanoids/', '/topics/humanoids/')).toBe(true);
  });

  it('is true for a page below it', () => {
    expect(isCurrent('/topics/humanoids/', '/topics/humanoids/page/2/')).toBe(true);
  });

  it('is false for another page, including one whose address only starts the same way', () => {
    expect(isCurrent('/topics/humanoids/', '/topics/home-consumer/')).toBe(false);
    expect(isCurrent('/topics/home/', '/topics/home-consumer/')).toBe(false);
    expect(isCurrent('/method/', '/')).toBe(false);
  });

  it('treats the home page as current only for the home page', () => {
    expect(isCurrent('/', '/')).toBe(true);
    expect(isCurrent('/', '/method/')).toBe(false);
  });
});
