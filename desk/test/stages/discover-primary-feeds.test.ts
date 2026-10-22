import { parseSources } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { FixtureFetcher } from '../../src/fetch/http';
import { MAX_PER_SOURCE, runDiscover } from '../../src/stages/discover';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { smallRegistry } from '../support/registry';

// Discover reads the feed of a primary source as it reads the feed of an outlet, and keeps an item only if it holds a keyword of the source
// and, for a primary source, links to a page of a primary source. The feed here is made up: desk/test/fixtures/feeds/ethresear.rss.xml.

const scratch = useScratch();

const REGISTRY = parseSources(`
primary:
  companies: {}
  research:
    - { name: ethresear.ch, short: Ethereum Research, url: "https://ethresear.ch/", feed: "https://ethresear.ch/latest.rss", beats: [protocols-standards], keywords: [agent, agents], status: unverified }
  standards: []
  funding: []
  events: []
secondary: []
bar:
  publish_if_any: [A standard was published.]
  do_not_publish: [A price.]
  quiet_day_fallback: [A primer.]
`);

const FEED = 'https://ethresear.ch/latest.rss';
const world = () => new FixtureFetcher(FIXTURE_DIR, { [FEED]: 'feeds/ethresear.rss.xml' }, () => FETCHED_AT);

/** A feed of the source, made up on the spot: each item is `[title, summary or undefined]` and links to a page of its own. */
const feedOf = (items: [string, string | undefined][]): string =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items
    .map(([title, summary], index) => `<item><title>${title}</title><link>https://ethresear.ch/t/post-${index}</link>${summary === undefined ? '' : `<description>${summary}</description>`}</item>`)
    .join('')}</channel></rss>`;
const serving = (feed: string) => withPages(world(), { [FEED]: feed });

describe('runDiscover: the feed of a primary source', () => {
  it('makes a tier-1 candidate of each item that holds a keyword and links to a page of the source, under the short name, with the beats of the entry', async () => {
    const { ctx } = stageContext(scratch, { sources: REGISTRY, fetcher: world() });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.map((candidate) => [candidate.title, candidate.tier, candidate.outlet, candidate.origin, candidate.beats])).toEqual([
      ['Agents that settle on chain', 1, 'Ethereum Research', 'feed', ['protocols-standards']],
    ]);
  });

  it('says in the log how many items had no keyword and how many linked to a page that is not the source', async () => {
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: world() });
    await runDiscover(ctx);
    expect(logs).toContain('discover: Ethereum Research: 1 item(s) held no keyword of the source and were left out');
    expect(logs).toContain('discover: Ethereum Research: 1 item(s) link to a page that is not a primary source and were left out');
  });

  it('keeps every item of a feed that has no keywords, except the one that links to a page that is not a primary source', async () => {
    const registry = structuredClone(REGISTRY);
    delete registry.primary.research[0]!.keywords;
    const { ctx } = stageContext(scratch, { sources: registry, fetcher: world() });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates.map((candidate) => candidate.url)).toEqual([
      'https://ethresear.ch/t/agents-that-settle-on-chain/9001',
      'https://ethresear.ch/t/inclusion-lists/9002',
    ]);
  });

  it('skips a feed that cannot be read, and goes on', async () => {
    const { ctx } = stageContext(scratch, { sources: REGISTRY, fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    await expect(runDiscover(ctx)).rejects.toThrow('discover: every source failed (1 of 1)');
  });
});

describe('runDiscover: which items of a feed are kept', () => {
  it('reads the summary as well as the title, and reads a summary that holds HTML as the text it shows', async () => {
    const feed = feedOf([
      ['A post with a plain title', '&lt;p&gt;It is about an &lt;b&gt;agent&lt;/b&gt; that pays.&lt;/p&gt;'],
      ['Another plain title', 'The word is in a tag only: &lt;a href="https://x.example/agent"&gt;link&lt;/a&gt;'],
    ]);
    const { ctx } = stageContext(scratch, { sources: REGISTRY, fetcher: serving(feed) });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.title)).toEqual(['A post with a plain title']);
  });

  it('does not make a phrase of the end of the title and the start of the summary', async () => {
    const registry = structuredClone(REGISTRY);
    registry.primary.research[0]!.keywords = ['smart contract'];
    const feed = feedOf([
      ['Smart', 'contract wallets arrive'],
      ['Smart contract wallets arrive', undefined],
      ['A plain title', 'About a smart contract.'],
    ]);
    const { ctx } = stageContext(scratch, { sources: registry, fetcher: serving(feed) });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.title)).toEqual(['Smart contract wallets arrive', 'A plain title']);
  });

  it('keeps an item that has no summary if its title holds a keyword, and leaves it out if not', async () => {
    const feed = feedOf([
      ['Agents without a summary', undefined],
      ['No summary and no keyword', undefined],
    ]);
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: serving(feed) });
    expect((await runDiscover(ctx)).candidates.map((candidate) => candidate.title)).toEqual(['Agents without a summary']);
    expect(logs).toContain('discover: Ethereum Research: 1 item(s) held no keyword of the source and were left out');
  });

  it('says nothing about left-out items when none was left out', async () => {
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: serving(feedOf([['Agents everywhere', undefined]])) });
    await runDiscover(ctx);
    expect(logs.filter((line) => line.includes('left out'))).toEqual([]);
  });

  it(`counts the ${MAX_PER_SOURCE} candidates of a source after the items are left out, not before`, async () => {
    const items: [string, string | undefined][] = Array.from({ length: 250 }, (_, index) => [index < 100 ? `Topic ${index}` : `Agent topic ${index}`, undefined]);
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: serving(feedOf(items)) });
    const artifact = await runDiscover(ctx);
    expect(artifact.candidates).toHaveLength(150);
    expect(logs).toContain('discover: Ethereum Research: 100 item(s) held no keyword of the source and were left out');
    expect(logs.filter((line) => line.includes('are kept'))).toEqual([]);
  });

  it(`still keeps at most ${MAX_PER_SOURCE} of the items that are not left out`, async () => {
    const items: [string, string | undefined][] = Array.from({ length: 250 }, (_, index) => [`Agent topic ${index}`, undefined]);
    const { ctx, logs } = stageContext(scratch, { sources: REGISTRY, fetcher: serving(feedOf(items)) });
    expect((await runDiscover(ctx)).candidates).toHaveLength(MAX_PER_SOURCE);
    expect(logs).toContain(`discover: Ethereum Research has 250 candidates, and only the first ${MAX_PER_SOURCE} are kept`);
  });

  it('narrows the feed of an outlet by its keywords too: the summary counts, and the left-out items are counted in the log', async () => {
    const registry = smallRegistry();
    registry.secondary[0]!.keywords = ['priced'];
    const { ctx, logs } = stageContext(scratch, { sources: registry });
    const mercer = (await runDiscover(ctx)).candidates.filter((candidate) => candidate.outlet === 'Mercer Wire');
    expect(mercer.map((candidate) => [candidate.url, candidate.tier])).toEqual([[URLS.mercerArticle, 2]]);
    expect(logs).toContain('discover: Mercer Wire: 2 item(s) held no keyword of the source and were left out');
  });

  it('does not ask a feed of an outlet to link to a primary source', async () => {
    const registry = smallRegistry();
    registry.secondary[0]!.keywords = ['priced'];
    const { ctx, logs } = stageContext(scratch, { sources: registry });
    await runDiscover(ctx);
    expect(logs.filter((line) => line.includes('not a primary source'))).toEqual([]);
  });
});

describe('runDiscover: the order in which sources are read', () => {
  const both = () => {
    const registry = smallRegistry();
    registry.primary.research = structuredClone(REGISTRY.primary.research);
    return registry;
  };
  const map = () => ({ ...worldMap(), [FEED]: 'feeds/ethresear.rss.xml' });

  it('reads the newsrooms, then the feeds of primary sources, then the feeds of outlets', async () => {
    const { ctx } = stageContext(scratch, { sources: both(), fetcher: new FixtureFetcher(FIXTURE_DIR, map(), () => FETCHED_AT) });
    const { candidates } = await runDiscover(ctx);
    expect(candidates.map((candidate) => [candidate.origin, candidate.tier, candidate.outlet]).filter((entry, index, all) => index === 0 || entry[2] !== all[index - 1]![2])).toEqual([
      ['newsroom', 1, 'Fixture Robotics'],
      ['feed', 1, 'Ethereum Research'],
      ['feed', 2, 'Mercer Wire'],
      ['feed', 2, 'Gantry Daily'],
    ]);
  });

  it('keeps the post of a primary source over the report of an outlet when both tell one story', async () => {
    const report = '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>Agents that settle on chain</title><link>https://mercer-wire.example/robotics/agents-settle</link></item></channel></rss>';
    const { ctx, logs } = stageContext(scratch, { sources: both(), fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, map(), () => FETCHED_AT), { [URLS.mercerFeed]: report }) });
    const urls = (await runDiscover(ctx)).candidates.map((candidate) => candidate.url);
    expect(urls).toContain('https://ethresear.ch/t/agents-that-settle-on-chain/9001');
    expect(urls).not.toContain('https://mercer-wire.example/robotics/agents-settle');
    expect(logs.some((line) => line.includes('tells the story of "Agents that settle on chain", which was found first'))).toBe(true);
  });

  it('skips a primary feed that cannot be read under its short name, and goes on with the others', async () => {
    const { ctx, logs } = stageContext(scratch, { sources: both() });
    const artifact = await runDiscover(ctx);
    expect(artifact.skipped).toEqual([{ source: 'Ethereum Research', reason: `${FEED}: no fixture is registered for this address` }]);
    expect(logs).toContain(`discover: skipped Ethereum Research: ${FEED}: no fixture is registered for this address`);
    expect(artifact.candidates.length).toBeGreaterThan(0);
  });

  it('counts a primary feed among the sources that failed: when it and the others all fail, the run fails', async () => {
    const { ctx } = stageContext(scratch, { sources: both(), fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    await expect(runDiscover(ctx)).rejects.toThrow('discover: every source failed (4 of 4)');
  });
});
