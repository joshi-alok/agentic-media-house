import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { contentFolder } from './lib/env';

// The schemas are the gate package's own, so a piece the renderer writes is a
// piece the site accepts, and a malformed file stops the build.
const base = `./src/${contentFolder()}`;

const news = defineCollection({
  loader: glob({ base: `${base}/news`, pattern: '**/*.mdx' }),
  schema: NewsFrontmatter,
});

const ledger = defineCollection({
  loader: glob({ base: `${base}/ledger`, pattern: '**/*.json' }),
  schema: LedgerEntry,
});

export const collections = { news, ledger };
