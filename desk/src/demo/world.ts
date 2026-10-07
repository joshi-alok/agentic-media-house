import { fileURLToPath } from 'node:url';
import { parseSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { FixtureFetcher } from '../index';
import type { FixtureEntry } from '../index';

// The made-up world that the Desk can be shown in with no network: a few sources on `.example` addresses, whose pages are the files of
// `desk/test/fixtures/`. The tests of the pipeline run in it, and so does `desk run --dry --client fake --sources fixtures` (a dry run: nothing in it is real, and
// nothing in it may ever be published, and no paid model is asked about it). Every company, outlet and address in it is invented.

/** The day on which the made-up world is current: its feed items are dated the days before it. */
export const DEMO_DATE = '2026-10-05';

/** The addresses of the made-up world. */
export const DEMO_URLS = {
  mercerFeed: 'https://mercer-wire.example/feed.xml',
  gantryFeed: 'https://gantry-daily.example/atom.xml',
  newsroom: 'https://fixture-robotics.example/news',
  release: 'https://fixture-robotics.example/news/fx-1-second-plant',
  mercerArticle: 'https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant',
} as const;

/** The folder of the fixture files, as a path. */
export const DEMO_FIXTURE_DIR = fileURLToPath(new URL('../../test/fixtures/', import.meta.url));

/** Which fixture file answers which address: the two feeds, the newsroom, the release, and the article that cites the release. */
export function demoWorldMap(): Record<string, FixtureEntry> {
  return {
    [DEMO_URLS.mercerFeed]: 'feeds/mercer-wire.rss.xml',
    [DEMO_URLS.gantryFeed]: 'feeds/gantry-daily.atom.xml',
    [DEMO_URLS.newsroom]: 'pages/fixture-robotics-news.html',
    [DEMO_URLS.release]: 'pages/fixture-robotics-fx-1-second-plant.html',
    [DEMO_URLS.mercerArticle]: 'pages/mercer-wire-fx-1-second-plant.html',
  };
}

/** The fetcher of the made-up world: it serves the fixture files, and fails like a site that cannot be reached for any other address. */
export function demoFetcher(now: () => Date): FixtureFetcher {
  return new FixtureFetcher(DEMO_FIXTURE_DIR, demoWorldMap(), now);
}

/** The source registry of the made-up world, in the format of `sources.yml`: one company's newsroom and two outlets' feeds. */
export const DEMO_REGISTRY_YAML = `
primary:
  companies:
    humanoids:
      - { name: Fixture Robotics, url: "https://fixture-robotics.example/news", status: unverified }
  research: []
  standards:
    - { name: Safety Standards Board, url: "https://standards.example/robotics", status: unverified }
  funding:
    - { name: Company announcement, url: "(the round is always announced on the company's own site first)", status: n/a }
  events:
    - { name: Automation Expo, url: "https://expo.example/", status: unverified }
secondary:
  - name: Mercer Wire
    feed: "https://mercer-wire.example/feed.xml"
    status: unverified
    beats: [humanoids, funding]
  - name: Gantry Daily
    feed: "https://gantry-daily.example/atom.xml"
    status: unverified
    beats: [industrial-warehouse]
    note: A made-up outlet.
bar:
  publish_if_any:
    - A product shipped, was priced, or reached a customer site.
    - A funding round with a named amount.
  do_not_publish:
    - A demo video with no specification behind it.
    - A restatement of another outlet's story with nothing added.
  quiet_day_fallback:
    - A follow-up on a launch covered six months ago.
`;

/** A fresh copy of the registry of the made-up world, so that a caller can change it. */
export function demoRegistry(): SourcesRegistry {
  return parseSources(DEMO_REGISTRY_YAML);
}
