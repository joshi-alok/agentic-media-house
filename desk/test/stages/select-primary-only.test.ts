import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { FetchError, FixtureFetcher } from '../../src/fetch/http';
import { SelectArtifact, readArtifact } from '../../src/run/artifacts';
import type { DiscoverArtifact } from '../../src/run/artifacts';
import { SELECT_ATTEMPTS, runSelect } from '../../src/stages/select';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

// With the profile `explainer` the piece is written from a primary page, so Select does not settle for a story whose primary page it cannot find: it asks the model
// again without that story, at most SELECT_ATTEMPTS times in all. With any other profile it writes such a story in attributed form, as before.

const scratch = useScratch();

// Two stories of other outlets. The page of the first links to nothing that is a primary source; the page of the second is the article of the made-up world, which cites
// the release of Fixture Robotics, a primary source.
const NO_LINKS = 'https://gantry-daily.example/a/no-primary';
const NO_LINKS_PAGE = '<html><head><title>No links</title></head><body><article><p>Fixture Robotics did something, says nobody in particular.</p></article></body></html>';
const NO_SOURCE = 'the page of the story has no link to a primary source';
const FIRST = candidate({ url: NO_LINKS, title: 'Fixture Robotics did something without a source', outlet: 'Gantry Daily', tier: 2, beats: ['agent-infrastructure'], publishedAt: '2026-10-04T10:00:00.000Z' });
const SECOND = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", outlet: 'Mercer Wire', tier: 2, beats: ['payments-commerce'], publishedAt: '2026-10-04T09:15:00.000Z' });
const discovered: DiscoverArtifact = { date: RUN_DATE, candidates: [FIRST, SECOND], skipped: [] };

const reply = (id: string | null, reasons = ['It is the best of the day.']) => ({ chosenId: id, reasons });
const left = (title: string, why: string) => `"${title}" was left out: ${why}, and an explainer is written from a primary page.`;
const NONE_FOUND = 'No story with a primary page was found, and an explainer is written from one.';
const world = () => withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [NO_LINKS]: NO_LINKS_PAGE });
const selectCalls = (fake: ReturnType<typeof stageContext>['fake']) => fake.calls.filter((call) => call.role === 'select');

describe('runSelect for an explainer', () => {
  it('asks again, without the story, when the primary page of the story it chose cannot be found', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen?.id).toBe(SECOND.id);
    expect(artifact.tier1Url).toBe(URLS.release);
    expect(selectCalls(fake)).toHaveLength(2);
    const second = selectCalls(fake)[1]!.user;
    expect(second).not.toContain('did something without a source');
    expect(second).toContain('starts FX-1 deliveries');
  });

  it('shows the model, the first time, every story of the shortlist', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    await runSelect(ctx, discovered);
    const first = selectCalls(fake)[0]!.user;
    expect(first).toContain('Candidates (2):');
    expect(first).toContain(FIRST.id);
    expect(first).toContain(SECOND.id);
    expect(selectCalls(fake)[1]!.user).toContain('Candidates (1):');
  });

  it('says in the reasons which story was left out and why, before the reasons of the model for the story it took', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id, ['The first is the best.']), reply(SECOND.id, ['The second is the next best.']));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.reasons).toEqual([left(FIRST.title, NO_SOURCE), 'The second is the next best.']);
  });

  it('says in the log which story was left out and why', async () => {
    const { ctx, fake, logs } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    await runSelect(ctx, discovered);
    expect(logs).toContain(`select: ${JSON.stringify(FIRST.title)} has no primary page (${NO_SOURCE}), so it is left out`);
  });

  it('chooses no story when none of the stories it is offered has a primary page, and asks no more than the stories there are', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: withPages(world(), { [URLS.mercerArticle]: NO_LINKS_PAGE }) });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen).toBeNull();
    expect(artifact.tier1Url).toBeNull();
    expect(selectCalls(fake)).toHaveLength(2);
    expect(artifact.reasons).toEqual([left(FIRST.title, NO_SOURCE), left(SECOND.title, NO_SOURCE), NONE_FOUND]);
    expect(artifact.shortlist).toEqual([FIRST.id, SECOND.id]);
  });

  it('asks at most SELECT_ATTEMPTS times, however many stories there are on the shortlist', async () => {
    expect(SELECT_ATTEMPTS).toBe(3);
    // Four stories of one outlet; the share of one source (see select-quota.test.ts) is not what this test is about, so all four are on the shortlist.
    const config = { ...defaultConfig(), shortlistPerSource: 99 };
    const stories = [0, 1, 2, 3].map((n) => candidate({ url: `https://gantry-daily.example/a/${n}`, title: `Story number ${n} with no source`, outlet: 'Gantry Daily', tier: 2, beats: ['agent-infrastructure'], publishedAt: `2026-10-04T0${9 - n}:00:00.000Z` }));
    const pages = Object.fromEntries(stories.map((story) => [story.url, NO_LINKS_PAGE]));
    const { ctx, fake } = stageContext(scratch, { config, profile: 'explainer', fetcher: withPages(world(), pages) });
    fake.script('select', ...stories.slice(0, 3).map((story) => reply(story.id)));
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: stories, skipped: [] });
    expect(artifact.chosen).toBeNull();
    expect(selectCalls(fake)).toHaveLength(3);
    expect(artifact.shortlist).toEqual(stories.map((story) => story.id));
    expect(artifact.reasons).toEqual([...stories.slice(0, 3).map((story) => left(story.title, NO_SOURCE)), NONE_FOUND]);
  });

  it('keeps the shortlist of the first ask in the artifact, so that the chosen story is on it', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.shortlist).toEqual([FIRST.id, SECOND.id]);
    expect(await readArtifact(ctx.runDir, '02-select', SelectArtifact)).toEqual(artifact);
  });

  it('keeps the reasons of the first ask when the model chooses none the second time', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(null, ['The other story is not good enough.']));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen).toBeNull();
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.reasons).toEqual([left(FIRST.title, NO_SOURCE), 'The other story is not good enough.']);
    expect(artifact.shortlist).toEqual([FIRST.id, SECOND.id]);
    expect(selectCalls(fake)).toHaveLength(2);
  });

  it('asks once, and chooses none, when the one story on the shortlist has no primary page', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id));
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: [FIRST], skipped: [] });
    expect(artifact.chosen).toBeNull();
    expect(artifact.shortlist).toEqual([FIRST.id]);
    expect(artifact.reasons).toEqual([left(FIRST.title, NO_SOURCE), NONE_FOUND]);
    expect(selectCalls(fake)).toHaveLength(1);
  });

  it('leaves out a story whose page cannot be fetched at all, and says why', async () => {
    const down = new FetchError('robots', NO_LINKS, 'robots.txt does not allow it');
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: withPages(world(), { [NO_LINKS]: down }) });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen?.id).toBe(SECOND.id);
    expect(artifact.reasons[0]).toBe(left(FIRST.title, `the page of the story could not be read (${down.message})`));
  });

  it('does not hide a bug of the Desk as a page that cannot be read', async () => {
    const fetcher = {
      get: async () => {
        throw new TypeError('a bug in the fetcher');
      },
    };
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher });
    fake.script('select', reply(FIRST.id));
    await expect(runSelect(ctx, discovered)).rejects.toThrow(new TypeError('a bug in the fetcher'));
  });

  it('takes a story that is itself a primary page at once, without another ask and without fetching it', async () => {
    const primary = candidate({
      url: URLS.release,
      title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant',
      outlet: 'Fixture Robotics',
      tier: 1,
      origin: 'newsroom',
      beats: ['payments-commerce'],
      publishedAt: '2026-10-04T08:00:00.000Z',
    });
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher });
    fake.script('select', reply(primary.id));
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: [primary], skipped: [] });
    expect(artifact.chosen?.id).toBe(primary.id);
    expect(artifact.tier1Url).toBe(URLS.release);
    expect(artifact.reasons).toEqual(['It is the best of the day.']);
    expect(selectCalls(fake)).toHaveLength(1);
    expect(fetcher.requests).toEqual([]);
  });

  it('asks no model when nothing passes the filters, as for any profile', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: [], skipped: [] });
    expect(artifact.chosen).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});

describe('runSelect for any other profile', () => {
  it.each([
    ['none', {}],
    ['brief', { profile: 'brief' as const }],
  ])('still writes a story with no primary page in attributed form (profile: %s)', async (_name, overrides) => {
    const { ctx, fake } = stageContext(scratch, { ...overrides, fetcher: world() });
    fake.script('select', reply(FIRST.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen?.id).toBe(FIRST.id);
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.reasons.at(-1)).toBe(`No tier-1 source was found: ${NO_SOURCE}, so the story is written in attributed form.`);
    expect(selectCalls(fake)).toHaveLength(1);
  });
});
