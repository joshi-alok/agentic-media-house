## Plan 3b (part 4) — The explainer run

**Goal:** the daily run writes an explainer, from one primary page. After this part the run is judged and instructed by the profile `explainer` (it was judged by the defaults of the gate, a profile that existed only in `desk tune`), the story is chosen only if a primary page can be reached for it and the piece is written from that page alone, and the writer is told what an explainer is.

| Task | What it does |
|---|---|
| 14 | `profile` is a setting; the orchestrator, `desk tune` and the replay of a run use it, and the record of a run says it; `desk.config.yml` sets `explainer`. |
| 15 | With the profile `explainer`, Select asks again when its choice has no primary page (at most three asks), Fetch fetches the primary page and nothing else, and the piece holds no claim of another outlet. |
| 16 | The compose prompt says what an explainer is, in the voice the publication wants. |

**Starting state:** Part 03 done; `npm run verify` green.

**Rules for every task in this part:** those of Part 01.

**Scope note (it replaces what the index says of `format`).** The index of this plan promised a `format` field on the draft, the ledger and the front matter of a piece, and a chip on the site. With one format that is a field whose value never varies, and it touches the front matter schema of the site, the renderer and the content collection of Astro. It belongs with the digest, when there are two formats to tell apart, and is in Plan 3c. The profile is what makes the explainer different from the other kinds of piece, and it is enough.

---

### Task 14: The run uses the profile of the settings

The profile `explainer` (opening of 40 to 80 words, 3 to 5 takeaways, a body of 500 to 1,400 words, analysis up to 40 per cent) exists in the gate and in the compose prompt, but only `desk tune --profile` sets it. A daily run is judged by the defaults of the gate (600 to 850 words, 20 per cent analysis) and the writer is told those numbers. After this task the profile is a setting; the production file sets `explainer`; a record of a run says which profile it had, so that its replay is the same.

**Files:**
- Modify: `desk/src/config.ts`, `desk/src/run/artifacts.ts` (`RECORD_FIELDS`), `desk/src/run/orchestrate.ts`, `desk/src/run/replay.ts`, `desk/src/cli.ts` (tune), `desk.config.yml`, `README.md`
- Modify (tests): `desk/test/config.test.ts`, `desk/test/production-config.test.ts`, `desk/test/run/orchestrate.test.ts`, `desk/test/run/replay.test.ts`, `desk/test/run/artifacts.test.ts`, `desk/test/cli.test.ts`

The setting is **optional with no default**: a run on the made-up world, the demo and every test that does not name a profile are judged by the defaults of the gate as before. Only the file of settings of the daily run names one.

- [ ] **Step 1: Write the failing tests**

`desk/test/config.test.ts`, add inside the existing `describe` for `loadConfig` (the helpers `configFile(...)` and `failure(...)` are the ones that file already has; see lines 127 and 175):

```ts
  it('has no profile by default, and takes one of the three kinds of piece', () => {
    expect(defaultConfig().profile).toBeUndefined();
    expect(loadConfig(configFile('profile: explainer\n')).profile).toBe('explainer');
    expect(loadConfig(configFile('profile: brief\n')).profile).toBe('brief');
  });

  it('refuses a profile that is not one of the three', () => {
    expect(failure('profile: tabloid\n')).toContain('profile');
  });
```

`desk/test/production-config.test.ts`, add:

```ts
  it('writes a piece as an explainer', () => {
    expect(SETTINGS.profile).toBe('explainer');
    expect(loadConfig(FILE).profile).toBe('explainer');
  });
```

`desk/test/run/orchestrate.test.ts`, add a block at the end of the file. The stage that notes the profile throws at once, so that nothing else has to be scripted (a run that fails still writes its record):

```ts
describe('runDesk: the profile of the settings', () => {
  /** A Discover that notes the profile its context has and then stops the run. */
  const noting = (seen: (string | undefined)[]): Partial<Stages> => ({
    discover: async (ctx) => {
      seen.push(ctx.profile);
      throw new Error('stop');
    },
  });

  it('gives every stage the profile of the settings', async () => {
    const seen: (string | undefined)[] = [];
    const { run } = setup({ config: { profile: 'explainer' }, stages: noting(seen) });
    await run();
    expect(seen).toEqual(['explainer']);
  });

  it('gives none when the settings name none', async () => {
    const seen: (string | undefined)[] = [];
    const { run } = setup({ stages: noting(seen) });
    await run();
    expect(seen).toEqual([undefined]);
  });

  it('writes the profile into the record of the run, and nothing when there is none', async () => {
    const withProfile = setup({ config: { profile: 'explainer' }, stages: noting([]), dry: true });
    await withProfile.run();
    expect(recordOf(withProfile.dir).profile).toBe('explainer');
    const without = setup({ stages: noting([]), dry: true });
    await without.run();
    expect(recordOf(without.dir)).not.toHaveProperty('profile');
  });
});
```

`desk/test/run/replay.test.ts`, add one test after the first one. The run is made with the profile `brief` (the made-up world is not an explainer: its story is written from two pages, see Task 15) and replayed with settings that have no profile; it is still equal, because the replay takes the profile from the record:

```ts
  it('takes the profile from the record of the run and not from the settings it is given', async () => {
    const { dir, replay } = await recordedRun({ config: { profile: 'brief' } });
    expect(recordOf(dir).profile).toBe('brief');
    const { profile: _profile, ...settings } = replay.config;
    const report = await replayRun(dir, { ...replay, config: settings });
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/config.test.ts test/production-config.test.ts test/run/orchestrate.test.ts test/run/replay.test.ts`
Expected: FAIL (`profile` is not a setting).

- [ ] **Step 3: Implement**

`desk/src/config.ts`: import `PROFILE_IDS` from `@robywire/gate` and add to `DeskConfig`, after `minClaims`:

```ts
  /**
   * The kind of piece the run writes: it sets the ranges the writer is asked for and the gate holds the piece to as notes (opening, takeaways, body, share of analysis), and, for
   * `explainer`, that the piece is written from one primary page. Absent: the defaults of the gate and no rule about the page, which is what the tests and the demo use. The file of settings of the
   * daily run names one.
   */
  profile: z.enum(PROFILE_IDS).optional(),
```

(`defaultConfig()` does not name it. `Overrides` is `DeskConfig.partial()`, so a file may set it.)

`desk/src/run/artifacts.ts`: import `PROFILE_IDS` from `@robywire/gate`; in `RECORD_FIELDS` add `profile: z.enum(PROFILE_IDS).optional(),` and a comment `/** The profile the run was written with; absent for a run that had none, and for a record from before there was one. A replay takes it from here. */`. `StoredRunRecord` needs no change (the field is in `RECORD_FIELDS`).

`desk/src/run/orchestrate.ts`: in the `ctx` of `pipeline`, add `...(config.profile === undefined ? {} : { profile: config.profile }),` after `published`; in `record`, add `...(config.profile === undefined ? {} : { profile: config.profile }),` after `models`.

`desk/src/run/replay.ts`: in the `ctx` add `...(record.profile === undefined ? {} : { profile: record.profile }),` after `published`.

`desk/src/cli.ts`, in the `tune` handler: `...(args.profile === undefined ? {} : { profile: args.profile }),` becomes `...(profile === undefined ? {} : { profile }),` with `const profile = args.profile ?? config.profile;` above it, the line `if (args.profile !== undefined) deps.out(\`profile: ${args.profile}\`);` becomes `if (profile !== undefined) deps.out(\`profile: ${profile}\`);` (move the declaration above it), and in `USAGE` the sentence "--profile judges the drafts against the ranges of a kind of piece (brief, digest or explainer) instead of the defaults of the gate" gains "; without it the profile of the settings is used, and without that the defaults of the gate".

`desk.config.yml`: add after the `userAgent` block

```yaml
# The kind of piece the daily run writes: an explainer from one primary page. It sets the ranges the writer is asked for and the gate holds the piece to as notes.
profile: explainer
```

`README.md`: in the paragraph about `--config` settings (line 60), add `the kind of piece (\`profile\`)` to the list of settings, and in the paragraph about `desk.config.yml` (line 62) add `, the kind of piece (\`profile: explainer\`)` after `the folder of the runs` (the test of the README quotes other parts of that sentence and not this list).

- [ ] **Step 4: Run, then fix what the profile changes**

Run the four files → PASS. Then `npm run typecheck && npm test`. **Rule R10:** a test that runs the Desk with the file `desk.config.yml` (`loadConfig(FILE)`) and expects the notes of the defaults expects those of `explainer`. A test that builds its config from `defaultConfig()` is not affected (it has no profile). `desk/test/cli.test.ts`: a `tune` test that expects the output `profile:` line absent still holds (no profile in its config); add one that a config with `profile: brief` and no flag prints `profile: brief`, and that `--profile explainer` wins over it.

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): the kind of piece is a setting, the daily run writes an explainer, and the record of a run says it so that its replay is the same" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.

---

### Task 15: An explainer is written from a primary page

A trade outlet's article is how the Desk finds most stories, and the page behind it is where the facts are. Until now a story with no reachable primary page was still written, from the outlet's article, in attributed form. An explainer explains: it needs the source's own words, so it is not written from another outlet's. With the profile `explainer`, Select does not settle for a story whose primary page it cannot find: it asks again without that story (at most three asks in all), Fetch fetches the primary page and nothing else, and the piece holds no claim of another outlet. The tier-2 rules of the gate stay for the digest (Plan 3c).

**Files:**
- Modify: `desk/src/stages/select.ts`, `desk/src/stages/fetch.ts`, `desk/src/prompts/select.ts` (one sentence)
- Create: `desk/test/stages/select-primary-only.test.ts`, `desk/test/stages/fetch-primary-only.test.ts`
- Modify (tests): `desk/test/stages/select.test.ts` (only if Rule R11 applies)

The rule is `ctx.profile === 'explainer'`. A run with another profile or none behaves as before.

- [ ] **Step 1: Write the failing tests**

`desk/test/stages/select-primary-only.test.ts` (read `desk/test/stages/select.test.ts` for how it builds `DiscoverArtifact`, scripts the `select` role and serves pages; the helpers below are the ones that file and `desk/test/support/` provide):

```ts
import { describe, expect, it } from 'vitest';
import { FixtureFetcher } from '../../src/fetch/http';
import type { DiscoverArtifact } from '../../src/run/artifacts';
import { runSelect } from '../../src/stages/select';
import { RUN_DATE, candidate } from '../support/candidates';
import { FETCHED_AT, URLS, stageContext, useScratch, withPages, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';

const scratch = useScratch();

// Two stories from another outlet. The page of the first links to nothing that is a primary source; the page of the second is the article of the made-up world, which cites
// the release of Fixture Robotics, a primary source.
const NO_LINKS = 'https://gantry-daily.example/a/no-primary';
const NO_LINKS_PAGE = '<html><head><title>No links</title></head><body><article><p>Fixture Robotics did something, says nobody in particular.</p></article></body></html>';
const FIRST = candidate({ url: NO_LINKS, title: 'Fixture Robotics did something without a source', outlet: 'Gantry Daily', tier: 2, beats: ['agent-infrastructure'], publishedAt: '2026-10-04T10:00:00.000Z' });
const SECOND = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", outlet: 'Mercer Wire', tier: 2, beats: ['payments-commerce'], publishedAt: '2026-10-04T09:15:00.000Z' });
const discovered: DiscoverArtifact = { date: RUN_DATE, candidates: [FIRST, SECOND], skipped: [] };

const reply = (id: string) => ({ chosenId: id, reasons: ['It is the best of the day.'] });
const world = () => withPages(new FixtureFetcher(FIXTURE_DIR, worldMap(), () => FETCHED_AT), { [NO_LINKS]: NO_LINKS_PAGE });

describe('runSelect for an explainer', () => {
  it('asks again, without the story, when the primary page of the story it chose cannot be found', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen?.id).toBe(SECOND.id);
    expect(artifact.tier1Url).toBe(URLS.release);
    expect(fake.calls.filter((call) => call.role === 'select')).toHaveLength(2);
    const second = fake.calls.filter((call) => call.role === 'select')[1]!.user;
    expect(second).not.toContain('did something without a source');
    expect(second).toContain("starts FX-1 deliveries");
  });

  it('says in the reasons which story was left out and why', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.reasons).toContain('"Fixture Robotics did something without a source" was left out: the page of the story has no link to a primary source, and an explainer is written from a primary page.');
  });

  it('chooses no story when none of the stories it is offered has a primary page, and asks no more than the stories there are', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: withPages(world(), { [URLS.mercerArticle]: NO_LINKS_PAGE }) });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen).toBeNull();
    expect(artifact.tier1Url).toBeNull();
    expect(fake.calls.filter((call) => call.role === 'select')).toHaveLength(2);
    expect(artifact.reasons.at(-1)).toBe('No story with a primary page was found, and an explainer is written from one.');
  });

  it('asks at most three times', async () => {
    const stories = [0, 1, 2, 3].map((n) => candidate({ url: `https://gantry-daily.example/a/${n}`, title: `Story number ${n} with no source`, outlet: 'Gantry Daily', tier: 2, beats: ['agent-infrastructure'], publishedAt: `2026-10-04T0${9 - n}:00:00.000Z` }));
    const pages = Object.fromEntries(stories.map((story) => [story.url, NO_LINKS_PAGE]));
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: withPages(world(), pages) });
    fake.script('select', ...stories.slice(0, 3).map((story) => reply(story.id)));
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: stories, skipped: [] });
    expect(artifact.chosen).toBeNull();
    expect(fake.calls.filter((call) => call.role === 'select')).toHaveLength(3);
  });

  it('keeps the shortlist of the first ask in the artifact, so that the chosen story is on it', async () => {
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(FIRST.id), reply(SECOND.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.shortlist).toEqual([FIRST.id, SECOND.id]);
  });

  it('takes a story that is itself a primary page at once, without another ask', async () => {
    const primary = candidate({ url: URLS.release, title: 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant', outlet: 'Fixture Robotics', tier: 1, origin: 'newsroom', beats: ['payments-commerce'], publishedAt: '2026-10-04T08:00:00.000Z' });
    const { ctx, fake } = stageContext(scratch, { profile: 'explainer', fetcher: world() });
    fake.script('select', reply(primary.id));
    const artifact = await runSelect(ctx, { date: RUN_DATE, candidates: [primary], skipped: [] });
    expect(artifact.tier1Url).toBe(URLS.release);
    expect(fake.calls.filter((call) => call.role === 'select')).toHaveLength(1);
  });
});

describe('runSelect for any other profile', () => {
  it('still writes a story with no primary page in attributed form', async () => {
    const { ctx, fake } = stageContext(scratch, { fetcher: world() });
    fake.script('select', reply(FIRST.id));
    const artifact = await runSelect(ctx, discovered);
    expect(artifact.chosen?.id).toBe(FIRST.id);
    expect(artifact.tier1Url).toBeNull();
    expect(artifact.reasons.at(-1)).toContain('written in attributed form');
    expect(fake.calls.filter((call) => call.role === 'select')).toHaveLength(1);
  });
});
```

`desk/test/stages/fetch-primary-only.test.ts` (pattern of `fetch.test.ts`: `selected(...)`, `ARTICLE`, `RELEASE`):

```ts
import { describe, expect, it } from 'vitest';
import type { SelectArtifact } from '../../src/run/artifacts';
import { runFetch } from '../../src/stages/fetch';
import { RUN_DATE, candidate } from '../support/candidates';
import { URLS, stageContext, useScratch } from '../support/context';

const scratch = useScratch();
const ARTICLE = candidate({ url: URLS.mercerArticle, title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant", publishedAt: '2026-10-04T09:15:00.000Z' });
const selected = (tier1Url: string | null): SelectArtifact => ({ date: RUN_DATE, chosen: ARTICLE, reasons: ['It is today.'], tier1Url, shortlist: [ARTICLE.id] });

describe('runFetch for an explainer', () => {
  it('fetches the primary page and not the article of the outlet that led to it', async () => {
    const { ctx } = stageContext(scratch, { profile: 'explainer' });
    const result = await runFetch(ctx, selected(URLS.release));
    expect(result.ok).toBe(true);
    expect(result.artifact.documents.map((document) => [document.url, document.tier])).toEqual([[URLS.release, 1]]);
  });

  it('is a bug of the Desk, not a story, to be given a story that has no primary page', async () => {
    const { ctx } = stageContext(scratch, { profile: 'explainer' });
    await expect(runFetch(ctx, selected(null))).rejects.toThrow('runFetch: an explainer is written from a primary page, and Select found none');
  });

  it('fetches both for any other profile, as before', async () => {
    const { ctx } = stageContext(scratch);
    const result = await runFetch(ctx, selected(URLS.release));
    expect(result.artifact.documents.map((document) => document.tier)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/stages/select-primary-only.test.ts test/stages/fetch-primary-only.test.ts`
Expected: FAIL (the first story is chosen with `tier1Url` null; two documents are fetched).

- [ ] **Step 3: Implement**

`desk/src/stages/select.ts`:

1. Add near the top: `/** How many times the model is asked when the story it chose has no primary page and the piece must have one. */ export const SELECT_ATTEMPTS = 3;`
2. Replace the `else` branch of `runSelect` (everything from `const ids = shortlist.map(...)` to the end of the branch) with a loop. The code:

```ts
  } else {
    const firstIds = shortlist.map((candidate) => candidate.id) as [string, ...string[]];
    const primaryOnly = ctx.profile === 'explainer';
    const notes: string[] = [];
    let offered = shortlist;
    let result: SelectArtifact | undefined;
    for (let attempt = 1; attempt <= (primaryOnly ? SELECT_ATTEMPTS : 1) && offered.length > 0; attempt++) {
      const ids = offered.map((candidate) => candidate.id) as [string, ...string[]];
      const reply = await ctx.client.json({
        role: 'select',
        model: ctx.config.models.select,
        system: selectSystem(),
        user: buildSelectUser(offered, ctx.sources.bar, ctx.date),
        schema: selectReplySchema(ids),
        maxOutputTokens: SELECT_MAX_OUTPUT_TOKENS,
      });
      const chosen = offered.find((candidate) => candidate.id === reply.value.chosenId) ?? null;
      if (chosen === null) {
        result = { date: ctx.date, chosen: null, reasons: [...notes, ...reply.value.reasons], tier1Url: null, shortlist: firstIds };
        break;
      }
      const source = await findTier1(ctx, chosen);
      if ('url' in source) {
        result = { date: ctx.date, chosen, reasons: [...notes, ...reply.value.reasons], tier1Url: source.url, shortlist: firstIds };
        break;
      }
      if (!primaryOnly) {
        result = { date: ctx.date, chosen, reasons: [...reply.value.reasons, `No tier-1 source was found: ${source.why}, so the story is written in attributed form.`], tier1Url: null, shortlist: firstIds };
        break;
      }
      notes.push(`"${chosen.title}" was left out: ${source.why}, and an explainer is written from a primary page.`);
      ctx.log(`select: ${JSON.stringify(chosen.title)} has no primary page (${source.why}), so the model is asked again without it`);
      offered = offered.filter((candidate) => candidate.id !== chosen.id);
    }
    artifact = result ?? { date: ctx.date, chosen: null, reasons: [...notes, 'No story with a primary page was found, and an explainer is written from one.'], tier1Url: null, shortlist: firstIds };
  }
```

   and update the doc comment of `runSelect`: "With the profile `explainer`, a story whose primary source is not found is left out and the model is asked again without it, at most `SELECT_ATTEMPTS` times in all; with any other profile such a story is written in attributed form."

   (`SelectArtifact` is imported as a value and a type from '../index' already; the `artifact` variable keeps its `let artifact: SelectArtifact;` declaration.)

3. In `desk/src/prompts/select.ts`, add to the instructions, after the sentence on tiers, `'A story from another outlet is written only after its primary source is found, and a story whose primary source cannot be found is left out; prefer a story whose primary source is likely to be on the page you are shown.'` (find the line of the tiers with `grep -n "Tier 2 means" desk/src/prompts/select.ts` and keep the one-array-element-per-sentence style of the file). `desk/test/prompts/select.test.ts` quotes sentences of this prompt: it needs no change unless it compares the whole text; if it does, copy the new text into it.

`desk/src/stages/fetch.ts`: in `runFetch` replace the construction of `targets` by

```ts
  const targets: { url: string; tier: 1 | 2 }[] = [];
  if (ctx.profile === 'explainer') {
    // An explainer is written from the primary page alone: the article of the outlet that led to it is not fetched, so that no claim of another outlet can enter the piece.
    if (selected.tier1Url === null) throw new Error('runFetch: an explainer is written from a primary page, and Select found none');
    targets.push({ url: selected.tier1Url, tier: 1 });
  } else {
    if (selected.tier1Url !== null) targets.push({ url: selected.tier1Url, tier: 1 });
    if (chosen.url !== selected.tier1Url) targets.push({ url: chosen.url, tier: chosen.tier });
  }
```

   and add a sentence to the doc comment of the stage. The check of a stale story (`target.url === chosen.url && chosen.publishedAt === undefined`) stays: a story with no date of its own that is itself the primary page is still checked against the window.

- [ ] **Step 4: Run the new tests, then everything**

Run the two files → PASS. Then `npm run typecheck && npm test`. **Rule R11:** a test of the stages that sets `profile: 'explainer'` in its context (Task 14 added a few) and then runs Select or Fetch on a story with no primary page expects the new behaviour; a test that runs with no profile is not touched. If the demo or a run test fails because the made-up story now needs a primary page, check that `DEMO_REGISTRY_YAML` lists `fixture-robotics.example` as a company (it does: the made-up story is the release of Fixture Robotics, and Select finds it as tier 1).

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): an explainer is written from one primary page: Select asks again without a story that has none, and Fetch fetches that page alone" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.

---

### Task 16: What an explainer is

The compose prompt gives rules, and rules do not make a good piece. The diagnosis showed pieces that were correct and flat: a list of facts under headings that said what the section was about ("Overview"), and a note of caution after every sentence. The explainer has a voice: it opens with the point, explains a term the first time and only from the claims, gives each section one job and says so in its heading, and says what is not yet known only where a claim says so. (The first form of this line told the writer to "say what the source does not say"; the review of the task found that no claim can state an absence, so such a sentence is a fact with nothing to cite or an analysis the model check may reject, and it costs revision rounds. The line now says what is not yet known only in the words of a claim, and never that a page leaves something out.) The voice is part of the prompt for the profile `explainer`; the other profiles are told nothing new.

**Files:**
- Modify: `desk/src/prompts/compose.ts`
- Modify (tests): `desk/test/prompts/compose.test.ts`
- Create: `desk/test/prompts/compose-voice.test.ts`

- [ ] **Step 1: Write the failing tests**

`desk/test/prompts/compose-voice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EXPLAINER_VOICE, composeInstructions, composeSystem, configOf, reviseSystem } from '../../src/prompts/compose';

describe('the voice of an explainer', () => {
  it('is in the prompt of an explainer, and in no other prompt', () => {
    for (const line of EXPLAINER_VOICE) expect(composeSystem('explainer')).toContain(line);
    for (const line of EXPLAINER_VOICE) {
      expect(composeSystem()).not.toContain(line);
      expect(composeSystem('digest')).not.toContain(line);
      expect(composeSystem('brief')).not.toContain(line);
      expect(reviseSystem('explainer')).not.toContain(line);
    }
  });

  it('says what the piece is for, in the words of this publication', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('explains one thing that the claims describe');
    expect(text).toContain('AI agents');
  });

  it('says to explain a term only from the claims, so that no word comes from outside them', () => {
    expect(EXPLAINER_VOICE.join('\n')).toContain('using only what the claims say; if no claim explains a term, do not use the term');
  });

  it('says to give a heading that says what the section says, and gives an example of each', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('a heading that says what the section says');
    expect(text).toContain('"How a payment is settled"');
    expect(text).toContain('"Overview"');
  });

  it('says what is not yet known only where a claim says so, never that a page does not say something, and not to state a project\'s own description as settled', () => {
    const text = EXPLAINER_VOICE.join('\n');
    expect(text).toContain('Say what is not yet known only where a claim says so');
    expect(text).toContain('never write that a page leaves something out or does not say something');
    expect(text).toContain('write that the project says it');
    expect(text).not.toContain('Say what the source does not say');
  });

  it('puts the voice after the job and before the rules, so that the rules, which are checked, come last', () => {
    const text = composeSystem('explainer');
    expect(text.indexOf('Write plain sentences: no markdown')).toBeLessThan(text.indexOf(EXPLAINER_VOICE[0]!));
    expect(text.indexOf(EXPLAINER_VOICE[0]!)).toBeLessThan(text.indexOf('The Desk checks the rules below by code'));
  });

  it('does not change the instructions for the defaults of the gate', () => {
    expect(composeInstructions()).toBe(composeInstructions(configOf()));
  });
});
```

(`composeInstructions(config)` today takes only the config; Step 3 gives it a second argument, the profile. The last test pins that the old call is unchanged.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/desk -- test/prompts/compose-voice.test.ts`
Expected: FAIL (`EXPLAINER_VOICE` is not exported).

- [ ] **Step 3: Write the voice**

`desk/src/prompts/compose.ts`: after `WRITER`, add

```ts
/**
 * What an explainer is, said to the writer. It is told before the rules, which are checked, and after the job. It adds nothing a claim must support: it is about how to write what
 * the claims say.
 */
export const EXPLAINER_VOICE: readonly string[] = [
  'What this piece is: an explainer for people who build or use AI agents on a blockchain, or who want to understand them.',
  '- It explains one thing that the claims describe: what it is, how it works, who made it, what it changes for people who build or use agents, and what is not yet known, each only as far as the claims say it.',
  '- Open with the point, in one sentence, before anything about where it came from. Then say why it matters to the reader.',
  '- Use plain words. Explain a term the first time it appears, in a few words, using only what the claims say; if no claim explains a term, do not use the term; cite the claim that explains it in the sentence that explains it.',
  '- Give each section one job, and a heading that says what the section says ("How a payment is settled"), not what it is about ("Overview", "Background", "Details").',
  '- Say what is not yet known only where a claim says so (a limit, a plan, a step still to come), in the words of that claim; never write that a page leaves something out or does not say something, because no claim can support it. A project\'s own description of its work is not a test of it: where a claim about what the work does or achieves rests on the project\'s own statement, write that the project says it, in that sentence, and do not add those words to a sentence that only names or describes.',
  '- Keep to what the claims say about the thing, in the order a reader needs it. Do not add a section for a view of the market, a price or what to do with money.',
];
```

Change the signatures to carry the profile:

```ts
export function composeInstructions(config: GateConfig = GATE, profile?: ProfileId): string {
  return [
    WRITER,
    ...
    ...SENTENCES,
    '',
    ...(profile === 'explainer' ? [...EXPLAINER_VOICE, ''] : []),
    ...composeRules(config),
  ].join('\n');
}
```

(that is, the only change inside is the line `...(profile === 'explainer' ? [...EXPLAINER_VOICE, ''] : []),` placed between `''` and `...composeRules(config)`), and

```ts
export function composeSystem(profile?: ProfileId): string {
  return systemPrompt(composeInstructions(configOf(profile), profile));
}
```

`reviseInstructions`/`reviseSystem` are not changed: a revision rewrites items, and the voice would only tempt it to rewrite what it was not sent.

- [ ] **Step 4: Run it, then everything**

Run: `npm test --workspace @robywire/desk -- test/prompts/compose-voice.test.ts` → PASS. Then `npm run typecheck && npm test`. `desk/test/prompts/compose.test.ts` tests the prompt of the defaults: unchanged. If a test compares `composeSystem('explainer')` with `systemPrompt(composeInstructions(configOf('explainer')))`, it now needs the second argument; change it.

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat(desk): the compose prompt says what an explainer is: the point first, a term explained only from the claims, a heading that says something, and what the source does not say" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.
