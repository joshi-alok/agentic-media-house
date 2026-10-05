import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';

// A fully static site. Every route is a folder with an index.html, and every
// internal link ends in a slash.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://robywire.example',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The text of a piece is exactly the text the gate checked: no curly quotes,
  // no en dashes, no ellipsis characters added by the Markdown processor.
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
  integrations: [mdx()],
  vite: {
    build: {
      rolldownOptions: {
        // Astro puts a "use astro:head-inject" directive at the top of every MDX
        // module. Rolldown warns that bundling may not keep it, once per piece.
        // Our pieces import no styles or scripts, so there is nothing to inject.
        onLog(level, log, defaultHandler) {
          if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
          defaultHandler(level, log);
        },
      },
    },
  },
});
