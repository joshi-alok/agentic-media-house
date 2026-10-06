import { parseSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';

// A small source registry for the tests, in the format of the real sources.yml and checked by the same
// schema. Everything in it is made up. Quarry Robotics and Old Feed are blocked, as the real file marks a
// source that the Desk cannot read.

export const FIXTURE_REGISTRY_YAML = `
primary:
  companies:
    humanoids:
      - { name: Fixture Robotics, url: "https://fixture-robotics.example/news", status: unverified }
      - { name: Northwind Machines, url: "https://www.northwind-machines.example/press", status: unverified }
    industrial:
      - { name: Brindle Logistics, url: "https://brindle-logistics.example/news", status: unverified }
      - { name: Quarry Robotics, url: "https://quarry-robotics.example/news", status: blocked }
    software:
      - { name: Hollis Dynamics, url: "https://hollis-dynamics.example/blog", status: unverified }
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
  - name: Old Feed
    feed: "https://old-feed.example/rss"
    status: blocked
    beats: [policy-standards]
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

/** A fresh copy of the registry of the tests, so that a test can change it. */
export function fixtureRegistry(): SourcesRegistry {
  return parseSources(FIXTURE_REGISTRY_YAML);
}
