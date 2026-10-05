import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../scripts/lighthouse.mjs';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const RIBBON = '<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div>';
const PERFECT = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A small built site with the given home page, and any files in `more` (by path inside the build). */
function dist(homeBody: string, more: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-lh-'));
  folders.push(dir);
  const files: Record<string, string> = {
    'index.html': `<!doctype html><html lang="en"><head><title>Home</title></head><body>${homeBody}</body></html>`,
    [`news/${SLUG}/index.html`]: '<!doctype html><title>Article</title>',
    [`news/${SLUG}/receipts/index.html`]: '<!doctype html><title>Receipts</title>',
    ...more,
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

type Measure = NonNullable<Parameters<typeof main>[0]>['measure'];

/** Run the command with a measurement that does not start a browser. */
async function run(directory: string, measure: Measure) {
  const lines: string[] = [];
  const code = await main({ dist: directory, print: (text: string) => lines.push(text), measure });
  return { code, output: lines.join('\n') };
}

const goodHome = `${RIBBON}<a href="/news/${SLUG}/">Title</a>`;

describe('the Lighthouse command', () => {
  it('serves the fixture build, measures the home page, the lead article and its receipts, and exits 0 when every score is high', async () => {
    const seen: { routes: string[]; statuses: number[] } = { routes: [], statuses: [] };
    const { code, output } = await run(dist(goodHome), async (baseUrl, routes) => {
      seen.routes = routes;
      seen.statuses = await Promise.all(routes.map(async (route) => (await fetch(baseUrl + route)).status));
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen.routes).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
    expect(seen.statuses).toEqual([200, 200, 200]);
    expect(code).toBe(0);
    expect(output).toContain('Performance  Accessibility  Best practices  SEO');
    expect(output).toContain('All scores are 95 or more.');
  });

  it('measures an article that carries the Unconfirmed. label and its receipts page as well, when the build has one', async () => {
    const held = 'fixture-robotics-ships-fx-5-to-second-plant';
    const site = dist(`${RIBBON}<a href="/news/${SLUG}/">Title</a><a href="/news/${held}/">Held</a>`, {
      [`news/${held}/index.html`]: '<!doctype html><title>Held</title><p><strong>Unconfirmed.</strong> Mercer Wire reports it.</p>',
      [`news/${held}/receipts/index.html`]: '<!doctype html><title>Held receipts</title>',
    });
    const seen: { routes: string[]; statuses: number[] } = { routes: [], statuses: [] };
    const { code } = await run(site, async (baseUrl, routes) => {
      seen.routes = routes;
      seen.statuses = await Promise.all(routes.map(async (route) => (await fetch(baseUrl + route)).status));
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen.routes).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`, `/news/${held}/`, `/news/${held}/receipts/`]);
    expect(seen.statuses).toEqual([200, 200, 200, 200, 200]);
    expect(code).toBe(0);
  });

  it('measures the usual three pages when the home page links to an article that has no file in the build', async () => {
    const site = dist(`${RIBBON}<a href="/news/${SLUG}/">Title</a><a href="/news/not-built/">Missing</a>`);
    let seen: string[] = [];
    const { code } = await run(site, async (_baseUrl, routes) => {
      seen = routes;
      return routes.map((url) => ({ url, scores: PERFECT }));
    });
    expect(seen).toEqual(['/', `/news/${SLUG}/`, `/news/${SLUG}/receipts/`]);
    expect(code).toBe(0);
  });

  it('exits 1 and names each score below 95', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: url === '/' ? { ...PERFECT, seo: 0.9 } : PERFECT })));
    expect(code).toBe(1);
    expect(output).toContain('Below 95:');
    expect(output).toContain('/ seo 90');
  });

  it('says "no score" for a category that Lighthouse gave no score', async () => {
    const { code, output } = await run(dist(goodHome), async (_baseUrl, routes) => routes.map((url) => ({ url, scores: { ...PERFECT, accessibility: null } })));
    expect(code).toBe(1);
    expect(output).toContain('/ accessibility no score');
  });

  it('exits 2 and says to build the fixtures when the site is a production build', async () => {
    const { code, output } = await run(dist('<p class="empty">No pieces yet.</p>'), async () => {
      throw new Error('must not be measured');
    });
    expect(code).toBe(2);
    expect(output).toContain('is a production build');
    expect(output).toContain('npm run build:fixtures');
  });

  it('exits 2 and says to build the fixtures when there is no built site', async () => {
    const { code, output } = await run(path.join(tmpdir(), 'robywire-no-such-folder'), async () => []);
    expect(code).toBe(2);
    expect(output).toContain('npm run build:fixtures');
  });

  it.each(['ERR_LAUNCHER_PATH_NOT_SET', 'ERR_LAUNCHER_NOT_INSTALLED'])('exits 2 and says how to find Chrome when chrome-launcher reports %s', async (errorCode) => {
    const { code, output } = await run(dist(goodHome), async () => {
      throw Object.assign(new Error('No Chrome installations found.'), { code: errorCode });
    });
    expect(code).toBe(2);
    expect(output).toContain('Chrome was not found');
    expect(output).toContain('CHROME_PATH');
  });

  it('exits 2 with the message of any other failure of the measurement', async () => {
    const { code, output } = await run(dist(goodHome), async () => {
      throw new Error('the page did not load');
    });
    expect(code).toBe(2);
    expect(output).toContain('Lighthouse failed: the page did not load');
  });
});
