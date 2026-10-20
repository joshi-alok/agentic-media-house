import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { FixtureFetcher } from '../../src/fetch/http';
import { jsonSchemaOf, ModelError } from '../../src/model/types';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { SelectArtifact, candidateId, readArtifact } from '../../src/run/artifacts';
import type { DiscoverArtifact } from '../../src/run/artifacts';
import { SELECT_MAX_OUTPUT_TOKENS, recencyWindow, runSelect, selectReplySchema, shortlistOf } from '../../src/stages/select';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { fixtureRegistry } from '../support/registry';

// Select chooses one story, or none. Code filters and ranks; one model call chooses among the titles; code
// then finds the primary source of the story that was chosen. The model here is a FakeClient that answers from a script.

const scratch = useScratch();
const discovered = (candidates: ReturnType<typeof candidate>[]): DiscoverArtifact => ({ date: RUN_DATE, candidates, skipped: [] });

const ARTICLE = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", publishedAt: '2026-10-04T09:15:00.000Z' });
const FUNDING = candidate({
  url: 'https://mercer-wire.example/robotics/northwind-handling-raises-12-million',
  title: 'Northwind Handling raises $12 million for pallet-moving robots',
  beats: ['humanoids', 'funding'],
  publishedAt: '2026-10-03T16:00:00.000Z',
});
const RELEASE = candidate({ url: URLS.release, title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant', tier: 1, outlet: 'Fixture Robotics', origin: 'newsroom', publishedAt: undefined });
const OLD = candidate({ url: 'https://mercer-wire.example/robotics/tariff-rules-and-paperwork', title: 'Warehouse robot makers brace for new tariff rules', publishedAt: '2026-09-28T07:30:00.000Z' });
const NO_BEAT = candidate({ url: 'https://mercer-wire.example/robotics/only-funding', title: 'A funding round with no beat', beats: ['funding'] });
const ALL = [OLD, NO_BEAT, RELEASE, FUNDING, ARTICLE];

const choose = (id: string | null, reasons = ['A product reached a customer site.']) => ({ chosenId: id, reasons });

describe('recencyWindow', () => {
  it('is the recencyHours before the end of the day of the run, in UTC: the start is in it and the end is not', () => {
    const window = recencyWindow({ date: RUN_DATE, config: defaultConfig() });
    expect(new Date(window.start).toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(new Date(window.end).toISOString()).toBe('2026-10-06T00:00:00.000Z');
  });

  it('follows the configuration', () => {
    const window = recencyWindow({ date: RUN_DATE, config: { ...defaultConfig(), recencyHours: 24 } });
    expect(new Date(window.start).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('shortlistOf', () => {
  const base = { date: RUN_DATE, config: defaultConfig(), published: { slugs: [], titles: [], sourceUrls: [] } };
  const listOf = (candidates: ReturnType<typeof candidate>[], overrides = {}) => shortlistOf(candidates, { ...base, ...overrides }).map((entry) => entry.url);
  const dated = (slug: string, publishedAt: string | undefined, extra = {}) => candidate({ url: `https://mercer-wire.example/robotics/${slug}`, title: slug, publishedAt, ...extra });

  it('keeps the candidates that are new, recent and about a beat, newest first, and the undated last', () => {
    expect(shortlistOf(ALL, base).map((entry) => entry.id)).toEqual([ARTICLE.id, FUNDING.id, RELEASE.id]);
  });

  it('does not change the list it is given', () => {
    const input = [...ALL];
    shortlistOf(input, base);
    expect(input).toEqual(ALL);
  });

  it('drops a candidate that a published piece covers: by its address, and by a title that tells the story of a recent piece', () => {
    const published = { slugs: [], titles: [{ title: FUNDING.title, publishedAt: '2026-10-04' }], sourceUrls: [ARTICLE.url] };
    expect(shortlistOf([ARTICLE, FUNDING, RELEASE], { ...base, published }).map((entry) => entry.id)).toEqual([RELEASE.id]);
  });

  describe('recent', () => {
    // The day of the run is 2026-10-05 and a story counts until the end of that day: 72 hours before the end is 2026-10-03T00:00:00Z.
    it.each([
      ['the start of the window', '2026-10-03T00:00:00.000Z', true],
      ['one millisecond before the window', '2026-10-02T23:59:59.999Z', false],
      ['the end of the day of the run', '2026-10-05T23:59:59.999Z', true],
      ['the start of the day after the run', '2026-10-06T00:00:00.000Z', false],
      ['a day long past', '2026-01-01T00:00:00.000Z', false],
      ['a day far in the future', '2030-01-01T00:00:00.000Z', false],
    ])('%s', (_name, publishedAt, kept) => {
      expect(listOf([dated('a', publishedAt)])).toEqual(kept ? ['https://mercer-wire.example/robotics/a'] : []);
    });

    it('keeps a candidate that has no date', () => {
      expect(listOf([dated('a', undefined)])).toEqual(['https://mercer-wire.example/robotics/a']);
    });

    it('reads the window from the configuration', () => {
      const config = { ...defaultConfig(), recencyHours: 24 };
      expect(listOf([dated('a', '2026-10-05T00:00:00.000Z'), dated('b', '2026-10-04T23:59:59.999Z')], { config })).toEqual(['https://mercer-wire.example/robotics/a']);
    });
  });

  describe('beat', () => {
    it.each([
      ['a beat', ['humanoids'], true],
      ['a beat and the funding tag', ['funding', 'policy-standards'], true],
      ['every beat of the vocabulary', ['humanoids', 'home-consumer', 'industrial-warehouse', 'field-mobility', 'software-autonomy', 'components-supply-chain', 'policy-standards'], true],
      ['the funding tag alone, which is not a beat', ['funding'], false],
      ['no beat at all', [], false],
      ['a name that is not in the vocabulary', ['industrial'], false],
      ['a name that is not in the vocabulary and a beat', ['industrial', 'humanoids'], true],
    ])('%s', (_name, beats, kept) => {
      expect(listOf([dated('a', '2026-10-04T00:00:00.000Z', { beats })])).toEqual(kept ? ['https://mercer-wire.example/robotics/a'] : []);
    });
  });

  describe('order and size', () => {
    it('puts the newest first, keeps the order of discovery among candidates of the same time, and puts the undated after them in the order of discovery', () => {
      const list = listOf([
        dated('undated-1', undefined),
        dated('old', '2026-10-03T10:00:00.000Z'),
        dated('same-1', '2026-10-04T10:00:00.000Z'),
        dated('undated-2', undefined),
        dated('new', '2026-10-05T01:00:00.000Z'),
        dated('same-2', '2026-10-04T10:00:00.000Z'),
      ]);
      expect(list.map((url) => url.split('/').pop())).toEqual(['new', 'same-1', 'same-2', 'old', 'undated-1', 'undated-2']);
    });

    it('cuts the list to the size in the configuration, after it has been put in order', () => {
      const many = Array.from({ length: 20 }, (_, index) => dated(`s${index}`, `2026-10-04T${String(index).padStart(2, '0')}:00:00.000Z`));
      const config = { ...defaultConfig(), shortlistMax: 3 };
      expect(listOf(many, { config }).map((url) => url.split('/').pop())).toEqual(['s19', 's18', 's17']);
      expect(listOf(many)).toHaveLength(15);
    });

    it('gives an empty list for no candidates', () => {
      expect(listOf([])).toEqual([]);
    });
  });
});

describe('selectReplySchema', () => {
  const schema = selectReplySchema(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);

  it('accepts one of the ids, or null, with reasons', () => {
    expect(schema.safeParse({ chosenId: 'aaaaaaaaaaaa', reasons: ['x'] }).success).toBe(true);
    expect(schema.safeParse({ chosenId: null, reasons: ['x'] }).success).toBe(true);
  });

  it.each([
    ['an id that is not on the list', { chosenId: 'cccccccccccc', reasons: ['x'] }],
    ['an id in capitals', { chosenId: 'AAAAAAAAAAAA', reasons: ['x'] }],
    ['no id field', { reasons: ['x'] }],
    ['no reasons', { chosenId: null, reasons: [] }],
    ['reasons that are not a list', { chosenId: null, reasons: 'x' }],
    ['an empty reason', { chosenId: null, reasons: [''] }],
    ['too many reasons', { chosenId: null, reasons: Array.from({ length: 11 }, () => 'x') }],
    ['a reason that is too long', { chosenId: null, reasons: ['x'.repeat(601)] }],
    ['another field', { chosenId: null, reasons: ['x'], confidence: 0.9 }],
  ])('refuses %s', (_name, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('accepts ten reasons of 600 characters', () => {
    expect(schema.safeParse({ chosenId: null, reasons: Array.from({ length: 10 }, () => 'x'.repeat(600)) }).success).toBe(true);
  });
});

describe('runSelect: a story is chosen', () => {
  it('records the story, the reasons, the shortlist in order, and the primary source that the code found in the page of the story', async () => {
    const { ctx, fake } = stageContext(scratch);
    fake.script('select', choose(ARTICLE.id));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact).toEqual({
      date: RUN_DATE,
      chosen: ARTICLE,
      reasons: ['A product reached a customer site.'],
      tier1Url: URLS.release,
      shortlist: [ARTICLE.id, FUNDING.id, RELEASE.id],
    });
  });

  it('writes what it returns to 02-select.json', async () => {
    const { ctx, fake } = stageContext(scratch);
    fake.script('select', choose(ARTICLE.id));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(await readArtifact(ctx.runDir, '02-select', SelectArtifact)).toEqual(artifact);
  });

  it('makes one call to the model, in the role select, with the model of the configuration and no field for a tool', async () => {
    const config = { ...defaultConfig(), models: { ...defaultConfig().models, select: 'model-x' } };
    const { ctx, fake } = stageContext(scratch, { config });
    fake.script('select', choose(ARTICLE.id));
    await runSelect(ctx, discovered(ALL));
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(Object.keys(call).sort()).toEqual(['maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    expect(call.role).toBe('select');
    expect(call.model).toBe('model-x');
    expect(call.maxOutputTokens).toBe(SELECT_MAX_OUTPUT_TOKENS);
  });

  it('gives the model the system prompt that says that blocks are data, and each title only in a block', async () => {
    const { ctx, fake } = stageContext(scratch);
    fake.script('select', choose(ARTICLE.id));
    await runSelect(ctx, discovered(ALL));
    const call = fake.calls[0]!;
    expect(call.system.startsWith(UNTRUSTED_PREAMBLE)).toBe(true);
    const outside = call.user.replace(/<source id="[^"]+">\n[\s\S]*?\n<\/source>/g, '');
    for (const entry of [ARTICLE, FUNDING, RELEASE]) {
      expect(call.user).toContain(`<source id="${entry.id}">\n${entry.title}\n</source>`);
      expect(outside).not.toContain(entry.title);
    }
  });

  it('shows the model the shortlist and nothing else: not a candidate that was filtered out', async () => {
    const { ctx, fake } = stageContext(scratch);
    fake.script('select', choose(ARTICLE.id));
    await runSelect(ctx, discovered(ALL));
    const call = fake.calls[0]!;
    for (const dropped of [OLD, NO_BEAT]) {
      expect(call.user).not.toContain(dropped.id);
      expect(call.user).not.toContain(dropped.title);
    }
    expect(call.user.indexOf(ARTICLE.id)).toBeLessThan(call.user.indexOf(FUNDING.id));
    expect(call.user.indexOf(FUNDING.id)).toBeLessThan(call.user.indexOf(RELEASE.id));
  });

  it('makes the shortlist the only ids that the reply may name, in the shape that the model is told', async () => {
    const { ctx, fake } = stageContext(scratch);
    fake.script('select', choose(ARTICLE.id));
    await runSelect(ctx, discovered(ALL));
    const shape = JSON.stringify(jsonSchemaOf(fake.calls[0]!.schema));
    for (const entry of [ARTICLE, FUNDING, RELEASE]) expect(shape).toContain(entry.id);
    expect(shape).not.toContain(OLD.id);
  });

  it('fetches the page of the story once, and nothing else', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', choose(ARTICLE.id));
    await runSelect(ctx, discovered(ALL));
    expect(fetcher.requests).toEqual([ARTICLE.url]);
  });
});

describe('runSelect: the primary source', () => {
  it('is the first link of the page of the story that goes to a primary source, in the order of the page', async () => {
    // In the registry that also lists Brindle Logistics as a company, the first such link of the article is the one to Brindle.
    const { ctx, fake } = stageContext(scratch, { sources: fixtureRegistry() });
    fake.script('select', choose(ARTICLE.id));
    expect((await runSelect(ctx, discovered(ALL))).tier1Url).toBe('https://brindle-logistics.example/news/second-plant-opens');
  });

  it('is the address of the story itself when the story is on the site of a company, and then the page is not fetched', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', choose(RELEASE.id));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact.tier1Url).toBe(URLS.release);
    expect(fetcher.requests).toEqual([]);
  });

  it('is the address of the story itself for a feed item that points at a company, and then the page is not fetched', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const direct = candidate({ url: 'https://fixture-robotics.example/news/other-story', title: 'A direct link to a company', publishedAt: '2026-10-04T00:00:00.000Z' });
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', choose(direct.id));
    expect((await runSelect(ctx, discovered([direct]))).tier1Url).toBe(direct.url);
    expect(fetcher.requests).toEqual([]);
  });

  const NOTE = (why: string) => `No tier-1 source was found: ${why}, so the story is written in attributed form.`;

  it('is null when no link of the page goes to a primary source, and the reasons end with a sentence that says so', async () => {
    const page = '<article><p>Text <a href="https://elsewhere.example/a">a link</a></p></article>';
    const { ctx, fake } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [ARTICLE.url]: page }) });
    fake.script('select', choose(ARTICLE.id, ['A product shipped.']));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.chosen).toEqual(ARTICLE);
    expect(artifact.reasons).toEqual(['A product shipped.', NOTE('the page of the story has no link to a primary source')]);
  });

  it('does not take a link of the sidebar of the page for the source of the story', async () => {
    const page = '<main><article><p>Text <a href="https://elsewhere.example/a">a link</a></p></article><aside><a href="https://fixture-robotics.example/news/older-story">An older story</a></aside></main>';
    const { ctx, fake } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [ARTICLE.url]: page }) });
    fake.script('select', choose(ARTICLE.id));
    expect((await runSelect(ctx, discovered(ALL))).tier1Url).toBeNull();
  });

  it('is null, with the reason, when the page of the story cannot be fetched', async () => {
    const { ctx, fake } = stageContext(scratch, { fetcher: new FixtureFetcher(FIXTURE_DIR, {}, () => FETCHED_AT) });
    fake.script('select', choose(ARTICLE.id, ['A product shipped.']));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.reasons).toEqual(['A product shipped.', NOTE(`the page of the story could not be read (${ARTICLE.url}: no fixture is registered for this address)`)]);
  });

  it('is null, with the reason, when the page of the story is nested too deeply to be read', async () => {
    const deep = `<body>${'<div>'.repeat(600)}</body>`;
    const { ctx, fake } = stageContext(scratch, { fetcher: withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [ARTICLE.url]: deep }) });
    fake.script('select', choose(ARTICLE.id, ['A product shipped.']));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.reasons[1]).toBe(NOTE('the page of the story could not be read (the page cannot be read: the page is nested more than 512 levels deep)'));
  });

  it('does not hide a bug of the Desk as a page that cannot be read', async () => {
    const fetcher = {
      get: async () => {
        throw new TypeError('a bug in the fetcher');
      },
    };
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', choose(ARTICLE.id));
    await expect(runSelect(ctx, discovered(ALL))).rejects.toThrow(new TypeError('a bug in the fetcher'));
  });
});

describe('runSelect: no story', () => {
  it('records that the model chose none, with its reasons, and fetches nothing', async () => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', choose(null, ['Nothing met the bar.', 'The funding story has no named source.']));
    const artifact = await runSelect(ctx, discovered(ALL));
    expect(artifact).toEqual({
      date: RUN_DATE,
      chosen: null,
      reasons: ['Nothing met the bar.', 'The funding story has no named source.'],
      tier1Url: null,
      shortlist: [ARTICLE.id, FUNDING.id, RELEASE.id],
    });
    expect(fetcher.requests).toEqual([]);
    expect(await readArtifact(ctx.runDir, '02-select', SelectArtifact)).toEqual(artifact);
  });

  it('asks no model when nothing passes the filters, and says why', async () => {
    const { ctx, fake, logs } = stageContext(scratch);
    const artifact = await runSelect(ctx, discovered([OLD, NO_BEAT]));
    expect(fake.calls).toEqual([]);
    expect(artifact).toEqual({
      date: RUN_DATE,
      chosen: null,
      reasons: ['No candidate passed the filters: each must be new, published within the last 72 hours or undated, and be about a beat.'],
      tier1Url: null,
      shortlist: [],
    });
    expect(logs).toContain(`select: ${artifact.reasons[0]}`);
    expect(await readArtifact(ctx.runDir, '02-select', SelectArtifact)).toEqual(artifact);
  });

  it('asks no model when there are no candidates at all', async () => {
    const { ctx, fake } = stageContext(scratch);
    const artifact = await runSelect(ctx, discovered([]));
    expect(fake.calls).toEqual([]);
    expect(artifact.chosen).toBeNull();
  });

  it('says the window of the configuration in the reason', async () => {
    const config = { ...defaultConfig(), recencyHours: 48 };
    const { ctx } = stageContext(scratch, { config });
    expect((await runSelect(ctx, discovered([OLD]))).reasons[0]).toContain('within the last 48 hours');
  });
});

describe('runSelect: a reply that is not usable', () => {
  const failing = async (reply: unknown) => {
    const fetcher = new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT);
    const { ctx, fake } = stageContext(scratch, { fetcher });
    fake.script('select', reply);
    const error = await runSelect(ctx, discovered(ALL)).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    return { error, ctx, fetcher };
  };

  it('ends the run when the model names an id that is not on the shortlist, whatever it is', async () => {
    for (const id of ['ffffffffffff', candidateId('https://nowhere.example/x'), 'not an id']) {
      const { error } = await failing(choose(id));
      expect(error).toBeInstanceOf(ModelError);
      expect((error as ModelError).kind).toBe('schema');
      expect((error as ModelError).message).toContain('chosenId');
    }
  });

  it('ends the run when the model names a candidate that the filters dropped, which it was never shown', async () => {
    const { error } = await failing(choose(OLD.id));
    expect((error as ModelError).kind).toBe('schema');
  });

  it('writes nothing and fetches nothing when the reply is refused', async () => {
    const { ctx, fetcher } = await failing(choose('ffffffffffff'));
    expect(existsSync(ctx.runDir)).toBe(false);
    expect(fetcher.requests).toEqual([]);
  });

  it.each([
    ['reasons that are missing', { chosenId: null }],
    ['an empty list of reasons', { chosenId: null, reasons: [] }],
    ['a field that was not asked for', { chosenId: null, reasons: ['x'], extra: true }],
    ['text that is not JSON', 'I choose the first one.'],
  ])('ends the run for %s', async (_name, reply) => {
    const { error } = await failing(reply);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).kind).toBe('schema');
  });

  it('lets a refusal of the budget end the run as it is', async () => {
    const { error } = await failing(new ModelError('budget', 'budget spent: 24 of 24 model calls'));
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).kind).toBe('budget');
  });

  it('lets any other failure of the model end the run as it is', async () => {
    const { error } = await failing(new ModelError('transport', 'the Anthropic API returned an error: overloaded', { retryable: true }));
    expect((error as ModelError).kind).toBe('transport');
  });
});
