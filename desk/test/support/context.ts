import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { defaultConfig } from '../../src/config';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import type { FetchedPage, Fetcher, FixtureEntry } from '../../src/fetch/http';
import { FakeClient } from '../../src/model/fake';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { emptyPublished } from '../../src/stages/context';
import type { StageContext } from '../../src/stages/context';
import { RUN_DATE } from './candidates';
import { FIXTURE_DIR } from './fixtures';
import { smallRegistry } from './registry';

// What the tests of the stages share: the addresses of the made-up world, which fixture file answers each, and a
// context to run a stage in. Nothing here touches the network, and the run folder and the evidence folder are
// new folders under the temporary directory, removed when the test file is done.

/** The addresses of the fixture world. */
export const URLS = {
  mercerFeed: 'https://mercer-wire.example/feed.xml',
  gantryFeed: 'https://gantry-daily.example/atom.xml',
  newsroom: 'https://fixture-robotics.example/news',
  release: 'https://fixture-robotics.example/news/fx-1-second-plant',
  mercerArticle: 'https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant',
} as const;

/** Which fixture file answers which address: the two feeds, the newsroom, the release, and the article that cites the release. */
export function worldMap(): Record<string, FixtureEntry> {
  return {
    [URLS.mercerFeed]: 'feeds/mercer-wire.rss.xml',
    [URLS.gantryFeed]: 'feeds/gantry-daily.atom.xml',
    [URLS.newsroom]: 'pages/fixture-robotics-news.html',
    [URLS.release]: 'pages/fixture-robotics-fx-1-second-plant.html',
    [URLS.mercerArticle]: 'pages/mercer-wire-fx-1-second-plant.html',
  };
}

/** The same fixed moment for every page that a test fetches. */
export const FETCHED_AT = new Date(`${RUN_DATE}T04:31:00.000Z`);

/**
 * A fetcher that serves the given text, or throws the given error, for some addresses and leaves the rest to `inner`. It is how a
 * test serves a page or a feed that it makes up on the spot, such as one nested 600 levels deep.
 */
export function withPages(inner: Fetcher, pages: Record<string, string | FetchError>): Fetcher {
  return {
    async get(url: string): Promise<FetchedPage> {
      const page = pages[url];
      if (page === undefined) return inner.get(url);
      if (page instanceof FetchError) throw page;
      return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=utf-8', body: page, retrievedAt: FETCHED_AT.toISOString() };
    },
  };
}

/** Scratch folders for a test file: each call gives a new empty folder, and all are removed when the file is done. */
export function useScratch(): () => string {
  const root = mkdtempSync(path.join(tmpdir(), 'desk-stage-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  let count = 0;
  return () => {
    const dir = path.join(root, `dir-${++count}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
}

/**
 * A context for a stage, with what the stage logged, the fake model that it was given, and the folder of its evidence store.
 * The run folder and the evidence folder are in one new folder, neither created until something is written. Any part of the context can be replaced.
 */
export function stageContext(scratch: () => string, overrides: Partial<StageContext> = {}) {
  const logs: string[] = [];
  const fake = new FakeClient();
  const root = scratch();
  const evidenceDir = path.join(root, 'evidence');
  const ctx: StageContext = {
    date: RUN_DATE,
    config: defaultConfig(),
    sources: smallRegistry(),
    fetcher: new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT),
    client: fake,
    evidence: new LocalEvidenceStore(evidenceDir),
    runDir: path.join(root, RUN_DATE),
    published: emptyPublished(),
    log: (line) => void logs.push(line),
    ...overrides,
  };
  return { ctx, logs, fake, evidenceDir };
}
