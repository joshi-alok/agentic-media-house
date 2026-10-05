import { z as astroZ } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';

// The site's content collections take their schemas from the gate package, so
// there is one definition of what a piece and a ledger entry look like. That
// only works if Astro's copy of Zod and the gate's copy are the same copy: a
// schema built by one is not recognised by the other if they are two installs.

describe('Zod in the site', () => {
  it('is one install: Astro and the gate share the same classes', () => {
    expect(astroZ.ZodType).toBe(z.ZodType);
    expect(astroZ.ZodObject).toBe(z.ZodObject);
  });

  it('lets the gate schemas be used with Astro helpers, because they are Astro-compatible Zod schemas', () => {
    expect(LedgerEntry).toBeInstanceOf(astroZ.ZodType);
    expect(NewsFrontmatter).toBeInstanceOf(astroZ.ZodType);
  });
});
